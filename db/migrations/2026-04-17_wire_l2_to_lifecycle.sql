-- ============================================================================
-- Migration: wire_l2_to_lifecycle
-- Date:      2026-04-17
-- Purpose:   Replace the inline Resend email block inside public.approve_claim
--            with a call to _call_send_lifecycle_email for campaign
--            'L2_claim_approved'. This routes the approval email through the
--            lifecycle infra (hello.thevanguide.com sender, lifecycle_log
--            audit, unsubscribe + idempotency checks, Resend bounce tracking)
--            instead of the fire-and-forget inline send.
--
-- Behavior preserved exactly:
--   * Admin-only guard
--   * Claim lookup + update to status='approved'
--   * Auto-rejection of other pending claims for the same builder
--   * builders.owner_id + claimed + verified updates
--   * GitHub deploy trigger
--
-- The only thing that changes is the email send mechanism. The claimant still
-- gets an approval email; it now comes from hello@hello.thevanguide.com, is
-- logged to lifecycle_log, and respects unsubscribes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_claim(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_claim    builder_claims%ROWTYPE;
  v_gh_token text;
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_claim FROM builder_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  UPDATE builder_claims
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_claim_id;

  UPDATE builder_claims
  SET status = 'rejected', reviewed_at = now()
  WHERE builder_id = v_claim.builder_id
    AND id != p_claim_id
    AND status = 'pending';

  UPDATE builders
  SET owner_id = v_claim.user_id,
      claimed = true,
      verified = true,
      updated_at = now()
  WHERE id = v_claim.builder_id;

  -- L2 approval email via lifecycle pipeline. Never blocks the approval if
  -- the email attempt fails (helper already traps exceptions).
  PERFORM public._call_send_lifecycle_email(
    v_claim.builder_id,
    v_claim.user_id,
    'L2_claim_approved'
  );

  -- GitHub deploy trigger so the claimed/verified state goes live.
  BEGIN
    SELECT decrypted_secret INTO v_gh_token
    FROM vault.decrypted_secrets
    WHERE name = 'github_deploy_token';

    IF v_gh_token IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.github.com/repos/thevanguide/tvg-hq/actions/workflows/deploy.yml/dispatches',
        body := '{"ref": "main"}'::jsonb,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_gh_token,
          'Accept', 'application/vnd.github+json',
          'X-GitHub-Api-Version', '2022-11-28',
          'User-Agent', 'TVG-Supabase'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'GitHub deploy trigger failed: %', SQLERRM;
  END;
END;
$function$;
