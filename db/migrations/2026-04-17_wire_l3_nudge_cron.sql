-- ============================================================================
-- Migration: wire_l3_nudge_cron
-- Date:      2026-04-17
-- Purpose:   Ship L3 (edit nudge #1). Fires via pg_cron on weekdays at 15:00
--            UTC (8am PT / 11am ET) for claimants who:
--              * have an approved claim >= 5 days old
--              * have made zero edits since approval
--              * haven't already been sent L3 for this builder
--
-- Uses the existing _call_send_lifecycle_email helper, which calls the
-- send-lifecycle-email edge function. The edge function handles rendering,
-- hard-kill checks (unsubs, idempotency), Resend send, and lifecycle_log
-- writes.
--
-- Why pg_cron instead of GH Actions + Python:
--   * Self-contained in Supabase (no external scheduler, no new credentials)
--   * Matches the existing net.http_post idiom used by claim/edit triggers
--   * Resend deliverability logic, suppression, and logging all live server-
--     side so the script has nothing to do
--
-- To reschedule / pause:
--   SELECT cron.unschedule('lifecycle-l3-nudge');     -- stop
--   SELECT cron.schedule(...);                         -- re-add
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- Candidate query (pure SELECT, no side effects). Also useful for debugging:
--   SELECT * FROM public._get_l3_candidates();
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._get_l3_candidates()
RETURNS TABLE (
  builder_id   uuid,
  user_id      uuid,
  reviewed_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT bc.builder_id, bc.user_id, bc.reviewed_at
  FROM builder_claims bc
  WHERE bc.status = 'approved'
    AND bc.reviewed_at IS NOT NULL
    AND bc.reviewed_at <= now() - interval '5 days'
    -- Claimant hasn't edited since approval.
    AND NOT EXISTS (
      SELECT 1 FROM builder_edits be
      WHERE be.builder_id = bc.builder_id
        AND be.user_id    = bc.user_id
        AND be.created_at > bc.reviewed_at
    )
    -- No L3 already queued/sent/suppressed for this builder.
    AND NOT EXISTS (
      SELECT 1 FROM lifecycle_log ll
      WHERE ll.builder_id = bc.builder_id
        AND ll.campaign   = 'L3_edit_nudge_1'
        AND ll.status IN ('queued','sent','bounced','complained','suppressed')
    );
$$;

REVOKE ALL ON FUNCTION public._get_l3_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._get_l3_candidates() TO service_role;

-- ----------------------------------------------------------------------------
-- Runner: queues an L3 send per candidate. Returns the number queued.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._run_l3_nudges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_queued int := 0;
BEGIN
  FOR v_row IN SELECT * FROM public._get_l3_candidates() LOOP
    PERFORM public._call_send_lifecycle_email(
      v_row.builder_id,
      v_row.user_id,
      'L3_edit_nudge_1'
    );
    v_queued := v_queued + 1;
  END LOOP;

  RAISE LOG 'lifecycle L3: queued % nudge(s)', v_queued;
  RETURN v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public._run_l3_nudges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_l3_nudges() TO service_role;

-- ----------------------------------------------------------------------------
-- Schedule: weekdays (Mon-Fri) at 15:00 UTC.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'lifecycle-l3-nudge',
  '0 15 * * 1-5',
  $$SELECT public._run_l3_nudges()$$
);
