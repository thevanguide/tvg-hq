-- ============================================================================
-- Migration: wire_l4_l5_nudges
-- Date:      2026-04-17
-- Purpose:   Ship L4 (day 18 nudge) and L5 (day 75 dormancy). Also refactors
--            L3 into the same generalized runner so all three nudge jobs
--            share one function instead of three near-duplicates.
--
-- Design note: each nudge gates on the previous one having fired. Without
-- this, a long-dormant claimant whose pg_cron history was disrupted could
-- trigger L3, L4, and L5 on the same day. The gate is checked at the query
-- level so the edge function never even sees the redundant call.
--
-- To pause any job:
--   SELECT cron.unschedule('lifecycle-l3-nudge');
--   SELECT cron.unschedule('lifecycle-l4-nudge');
--   SELECT cron.unschedule('lifecycle-l5-dormancy');
-- ============================================================================

-- Retire the L3-specific helpers from the previous migration.
SELECT cron.unschedule('lifecycle-l3-nudge');
DROP FUNCTION IF EXISTS public._run_l3_nudges();
DROP FUNCTION IF EXISTS public._get_l3_candidates();

-- ----------------------------------------------------------------------------
-- Generalized candidate query. Parameterized over (campaign, days, prev).
--   p_campaign       The nudge we're considering sending.
--   p_days           Minimum days since claim approval.
--   p_prev_campaign  If set, require a terminal send of the prior nudge
--                    before this one qualifies. (NULL for L3.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._get_nudge_candidates(
  p_campaign       text,
  p_days           int,
  p_prev_campaign  text DEFAULT NULL
)
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
    AND bc.reviewed_at <= now() - make_interval(days => p_days)
    -- Claimant hasn't edited since approval.
    AND NOT EXISTS (
      SELECT 1 FROM builder_edits be
      WHERE be.builder_id = bc.builder_id
        AND be.user_id    = bc.user_id
        AND be.created_at > bc.reviewed_at
    )
    -- This campaign hasn't already been queued/sent/suppressed.
    AND NOT EXISTS (
      SELECT 1 FROM lifecycle_log ll
      WHERE ll.builder_id = bc.builder_id
        AND ll.campaign   = p_campaign
        AND ll.status IN ('queued','sent','bounced','complained','suppressed')
    )
    -- If a prior nudge is required, gate on its actual attempt
    -- ('sent'/'bounced'/'complained' all count; 'suppressed' means the
    -- recipient opted out so follow-ups would also be suppressed anyway,
    -- and 'queued'/'failed' don't guarantee the prior message went out).
    AND (
      p_prev_campaign IS NULL
      OR EXISTS (
        SELECT 1 FROM lifecycle_log prev
        WHERE prev.builder_id = bc.builder_id
          AND prev.campaign   = p_prev_campaign
          AND prev.status IN ('sent','bounced','complained')
      )
    );
$$;

REVOKE ALL ON FUNCTION public._get_nudge_candidates(text, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._get_nudge_candidates(text, int, text)
  TO service_role;

-- ----------------------------------------------------------------------------
-- Generalized runner. Validates the campaign is in the nudge set, loops
-- candidates, calls the edge function helper for each.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._run_nudge(
  p_campaign       text,
  p_days           int,
  p_prev_campaign  text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row    RECORD;
  v_queued int := 0;
BEGIN
  IF p_campaign NOT IN ('L3_edit_nudge_1','L4_edit_nudge_2','L5_dormancy_check') THEN
    RAISE EXCEPTION 'Not a nudge campaign: %', p_campaign;
  END IF;

  FOR v_row IN
    SELECT * FROM public._get_nudge_candidates(p_campaign, p_days, p_prev_campaign)
  LOOP
    PERFORM public._call_send_lifecycle_email(
      v_row.builder_id,
      v_row.user_id,
      p_campaign
    );
    v_queued := v_queued + 1;
  END LOOP;

  RAISE LOG 'lifecycle %: queued % nudge(s)', p_campaign, v_queued;
  RETURN v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public._run_nudge(text, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_nudge(text, int, text)
  TO service_role;

-- ----------------------------------------------------------------------------
-- Schedule: all three nudges on weekdays at 15:00 UTC (8am PT / 11am ET).
-- They run in the same minute, but each gates on the prior nudge row, so a
-- single claimant will never receive more than one on the same day.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'lifecycle-l3-nudge',
  '0 15 * * 1-5',
  $$SELECT public._run_nudge('L3_edit_nudge_1', 5, NULL)$$
);

SELECT cron.schedule(
  'lifecycle-l4-nudge',
  '0 15 * * 1-5',
  $$SELECT public._run_nudge('L4_edit_nudge_2', 18, 'L3_edit_nudge_1')$$
);

SELECT cron.schedule(
  'lifecycle-l5-dormancy',
  '0 15 * * 1-5',
  $$SELECT public._run_nudge('L5_dormancy_check', 75, 'L4_edit_nudge_2')$$
);
