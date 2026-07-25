-- ============================================================================
-- Migration: add_approval_queue
-- Date:      2026-07-25
-- Status:    *** NOT YET APPLIED — review before running against production ***
-- Purpose:   Central approval queue for autonomous ops loops (Phase 1 of the
--            Autonomous Operations plan). Agent loops write pending items;
--            Andrew approves/rejects from the mobile admin queue page at
--            /builders/admin/queue/. Loops act on decisions next run.
--
-- Item types at launch:
--   outreach_batch  — proposed cold outreach batch (payload: builder ids, template)
--   reply_draft     — drafted reply to an outreach response (payload: to, subject, body)
--   claim_review    — claim held by the domain-match check (payload: claim id, mismatch info)
--   data_change     — bulk/structural directory data change (payload: SQL or description)
--   publish_request — anything that ends in a deploy but isn't a GitHub PR
--
-- Writes come from service-role agents (RLS bypass). Reads/decisions go
-- through SECURITY DEFINER RPCs gated on the admin user id, matching the
-- existing admin function idiom (see approve_claim).
--
-- Includes a weekday digest email (pg_cron + net.http_post + Resend via
-- Vault), following the L3–L5 lifecycle cron idiom. The digest only sends
-- when pending items exist.
--
-- To pause the digest:  SELECT cron.unschedule('approval-queue-digest');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN (
                'outreach_batch', 'reply_draft', 'claim_review',
                'data_change', 'publish_request'
              )),
  title       text NOT NULL,
  summary     text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN (
                'pending', 'approved', 'rejected', 'held', 'expired', 'acted'
              )),
  notes       text,
  created_by  text NOT NULL DEFAULT 'agent',  -- loop name, e.g. 'outreach-loop'
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  acted_at    timestamptz                      -- set by the loop after executing an approval
);

CREATE INDEX IF NOT EXISTS approval_queue_status_idx
  ON public.approval_queue (status, created_at DESC);

-- RLS on, no policies: anon/authenticated get nothing directly.
-- Service role bypasses RLS (agent writes); admin reads via RPCs below.
ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RPC: list queue items (admin only). Pending first, then recent history.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_approval_items()
RETURNS SETOF public.approval_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.approval_queue
  WHERE auth.uid() = 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac'
    AND (status = 'pending' OR created_at >= now() - interval '30 days')
  ORDER BY (status = 'pending') DESC, created_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- RPC: decide an item (admin only). Decision: approved / rejected / held.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_approval_item(
  p_item_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'held') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  UPDATE public.approval_queue
  SET status     = p_decision,
      notes      = COALESCE(p_notes, notes),
      decided_at = now()
  WHERE id = p_item_id
    AND status IN ('pending', 'held');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already decided';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Digest: weekday email when pending items exist. Follows the lifecycle
-- cron idiom (Vault secret + net.http_post to Resend).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._send_approval_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resend_key text;
  v_pending int;
  v_rows text := '';
  r record;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.approval_queue
  WHERE status = 'pending';

  IF v_pending = 0 THEN
    RETURN;  -- nothing waiting, no email
  END IF;

  SELECT decrypted_secret INTO v_resend_key
  FROM vault.decrypted_secrets
  WHERE name = 'resend_api_key';

  IF v_resend_key IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT type, title, created_at
    FROM public.approval_queue
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 20
  LOOP
    v_rows := v_rows
      || '<li style="margin-bottom:6px;"><strong>[' || r.type || ']</strong> '
      || r.title
      || ' <span style="color:#888;">(' || to_char(r.created_at, 'Mon DD') || ')</span></li>';
  END LOOP;

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'The Van Guide <hello@thevanguide.com>',
      'to', 'andrew@thevanguide.com',
      'subject', v_pending || ' item' || CASE WHEN v_pending = 1 THEN '' ELSE 's' END || ' waiting for approval',
      'html',
        '<p>' || v_pending || ' pending item' || CASE WHEN v_pending = 1 THEN '' ELSE 's' END
        || ' in the TVG approval queue:</p><ul>' || v_rows || '</ul>'
        || '<p style="margin-top: 20px;"><a href="https://thevanguide.com/builders/admin/queue/" style="display: inline-block; background: #C49A2A; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open queue</a></p>'
    )
  );
END;
$$;

-- Weekdays 15:00 UTC (8am PT), same slot as the lifecycle nudges.
SELECT cron.schedule(
  'approval-queue-digest',
  '0 15 * * 1-5',
  $$SELECT public._send_approval_digest()$$
);
