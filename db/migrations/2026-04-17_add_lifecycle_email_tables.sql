-- ============================================================================
-- Migration: add_lifecycle_email_tables
-- Date:      2026-04-17
-- Purpose:   Foundation for the builder lifecycle email program.
--            (Spec: Strategy/Builder Outreach/Lifecycle_Email_Program_Spec.md)
--
-- Cold outreach already runs on `outreach_log` / `outreach_unsubscribes` via
-- the Resend pipeline on `outreach.thevanguide.com`. This migration adds the
-- parallel pair for *post-claim* lifecycle emails (claim receipts, approval
-- confirmations, edit nudges, dormancy checks) which will send from
-- `hello.thevanguide.com` so lifecycle reputation is isolated from cold.
--
-- No existing tables are altered. `builder_edits` is already the right shape
-- for tracking whether a claimant has touched their profile; nudge triggers
-- will query it directly rather than needing a new audit mechanism.
--
-- Tables added:
--   1. lifecycle_log          — one row per lifecycle email attempt
--   2. lifecycle_unsubscribes — scoped opt-outs for lifecycle channels
--
-- Safety:
--   * Purely additive — no ALTER on existing tables.
--   * RLS enabled, no client policies (service-role only). Edge functions and
--     the send script use the service-role key, same pattern as outreach_log.
--   * Fully reversible: `DROP TABLE lifecycle_log, lifecycle_unsubscribes;`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. lifecycle_log
-- ----------------------------------------------------------------------------
CREATE TABLE public.lifecycle_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id        uuid REFERENCES public.builders(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id)       ON DELETE SET NULL,
  to_email          text NOT NULL,
  campaign          text NOT NULL,
    -- Expected values: 'L1_claim_received', 'L2_claim_approved',
    -- 'L3_edit_nudge_1', 'L4_edit_nudge_2', 'L5_dormancy_check',
    -- (future) 'digest_quarterly', 'reverify_annual'.
    -- Not a CHECK constraint on purpose — new campaigns shouldn't require
    -- a migration. Send script enforces the allow-list.
  template_version  text NOT NULL DEFAULT 'v1',
  subject           text,
  body              text,
  resend_id         text,
  status            text NOT NULL DEFAULT 'queued',
    -- queued | sent | bounced | complained | failed | suppressed
  error_message     text,
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lifecycle_log_builder_campaign_idx
  ON public.lifecycle_log (builder_id, campaign);

CREATE INDEX lifecycle_log_sent_at_idx
  ON public.lifecycle_log (sent_at DESC NULLS LAST);

CREATE INDEX lifecycle_log_resend_id_idx
  ON public.lifecycle_log (resend_id)
  WHERE resend_id IS NOT NULL;

ALTER TABLE public.lifecycle_log ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Matches outreach_log.

COMMENT ON TABLE public.lifecycle_log IS
  'Post-claim lifecycle email sends (L1-L5). Parallel to outreach_log but '
  'isolated by sending subdomain so reputations cannot cross-contaminate.';

-- ----------------------------------------------------------------------------
-- 2. lifecycle_unsubscribes
-- ----------------------------------------------------------------------------
CREATE TABLE public.lifecycle_unsubscribes (
  email             text PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  unsubscribed_at   timestamptz NOT NULL DEFAULT now(),
  scope             text NOT NULL DEFAULT 'all'
                    CHECK (scope IN ('nudges', 'digest', 'all')),
    -- nudges = L3/L4/L5 edit + dormancy pokes
    -- digest = future quarterly digest
    -- all    = kill every lifecycle channel including L1/L2 receipts
  source            text
                    CHECK (source IN ('link_click', 'complaint', 'manual'))
);

ALTER TABLE public.lifecycle_unsubscribes ENABLE ROW LEVEL SECURITY;
-- Service-role only.

COMMENT ON TABLE public.lifecycle_unsubscribes IS
  'Opt-outs for lifecycle email. Separate from outreach_unsubscribes so a '
  'cold-outreach unsub does not silence a builder''s own claim receipts.';
