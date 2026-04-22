-- ============================================================================
-- Migration: add_lifecycle_l1_trigger
-- Date:      2026-04-17
-- Purpose:   Fire L1 (claim received) lifecycle email when a new claim is
--            inserted into builder_claims.
--
-- The trigger calls the send-lifecycle-email edge function via net.http_post,
-- authenticating with the vault-stored lifecycle_internal_secret. The edge
-- function handles rendering, unsubscribe checks, idempotency, Resend call,
-- and lifecycle_log writes.
--
-- L2 (claim approved) is intentionally NOT wired here. public.approve_claim
-- currently sends its own inline approval email; a parallel session owns
-- final L2 copy and will swap that block to call send-lifecycle-email with
-- campaign='L2_claim_approved'. Wiring L2 here would duplicate sends.
--
-- Dependencies (already in place):
--   * public._get_lifecycle_internal_secret() RPC
--   * vault secret 'lifecycle_internal_secret'
--   * edge function send-lifecycle-email (verify_jwt=false, bearer-auth'd)
--   * pg_net extension enabled (used by existing claim/edit functions)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: centralizes the edge-function call so multiple triggers/paths can
-- reuse it. Never raises \u2014 trigger failures must never block the underlying
-- INSERT/UPDATE (a failed L1 is far less bad than a failed claim submission).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._call_send_lifecycle_email(
  p_builder_id  uuid,
  p_user_id     uuid,
  p_campaign    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_builder_name  text;
  v_user_email    text;
  v_secret        text;
  v_url           text := 'https://awnyqijglxczwyrhmdnc.supabase.co/functions/v1/send-lifecycle-email';
BEGIN
  SELECT name INTO v_builder_name FROM builders WHERE id = p_builder_id;
  SELECT email::text INTO v_user_email FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE WARNING 'lifecycle: no email for user % (builder %, campaign %)',
      p_user_id, p_builder_id, p_campaign;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'lifecycle_internal_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'lifecycle: lifecycle_internal_secret missing from vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'builder_id',   p_builder_id,
      'user_id',      p_user_id,
      'to_email',     v_user_email,
      'builder_name', v_builder_name,
      'campaign',     p_campaign
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the surrounding transaction. The edge function + webhook is
  -- the system of record for delivery state; a trigger failure should leave
  -- the claim row intact.
  RAISE WARNING 'lifecycle: _call_send_lifecycle_email failed (builder=%, campaign=%): %',
    p_builder_id, p_campaign, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public._call_send_lifecycle_email(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Trigger: fire L1 when a new claim lands
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._on_builder_claim_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only fire for the initial pending state. Inserts with other statuses
  -- would be abnormal (no such code path today) but we scope defensively.
  IF NEW.status = 'pending' THEN
    PERFORM public._call_send_lifecycle_email(
      NEW.builder_id,
      NEW.user_id,
      'L1_claim_received'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS builder_claims_lifecycle_l1 ON public.builder_claims;

CREATE TRIGGER builder_claims_lifecycle_l1
  AFTER INSERT ON public.builder_claims
  FOR EACH ROW
  EXECUTE FUNCTION public._on_builder_claim_insert();

COMMENT ON TRIGGER builder_claims_lifecycle_l1 ON public.builder_claims IS
  'Fires L1 (claim received) lifecycle email via send-lifecycle-email edge function. L2/L3+ wired separately.';
