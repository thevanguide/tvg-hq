-- ============================================================================
-- Migration: auto_approve_domain_matched_claims
-- Date:      2026-07-26
-- Status:    APPLIED to production 2026-07-26 (via Supabase MCP)
-- Purpose:   Auto-approve builder claims where the claimant's email domain
--            matches the builder's website registrable domain. Mismatches and
--            edge cases stay pending for manual review — this only approves,
--            never rejects.
--
-- Safety rails:
--   * registrable-domain comparison (strips scheme/www/path, last-2-labels)
--   * shared-platform and free-mail domains never count
--   * builder must be unclaimed (claim on claimed builder = dispute = human)
--   * auto path is exception-wrapped: any failure leaves the claim pending
--   * every auto-approval writes an audit row into approval_queue history
--
-- Historical replay at ship time: 12 past claims -> 8 would auto-approve
-- (all were in fact manually approved), 4 correctly held (free-mail
-- claimants + cross-domain admin claims). Zero false approvals.
--
-- Refactor note: approve_claim() kept its signature; its body moved to
-- _approve_claim_internal(), shared by the admin RPC and the trigger.
-- ============================================================================

-- Domain extraction: works on bare domains, URLs, and email domains.
CREATE OR REPLACE FUNCTION public._registrable_domain(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_input IS NULL OR btrim(p_input) = '' THEN NULL
    ELSE (
      WITH host AS (
        SELECT lower(
          regexp_replace(
            regexp_replace(
              regexp_replace(btrim(p_input), '^[a-z]+://', '', 'i'),  -- scheme
              '[/:?#].*$', ''                                          -- path/port
            ),
            '^www\.', ''                                               -- www
          )
        ) AS h
      )
      SELECT CASE
        WHEN h ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
        THEN array_to_string((string_to_array(h, '.'))[
               greatest(1, array_length(string_to_array(h, '.'), 1) - 1):], '.')
        ELSE NULL
      END FROM host
    )
  END;
$$;

-- Shared internals: approve_claim minus the admin gate.
CREATE OR REPLACE FUNCTION public._approve_claim_internal(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim    builder_claims%ROWTYPE;
  v_gh_token text;
BEGIN
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

  PERFORM public._call_send_lifecycle_email(
    v_claim.builder_id,
    v_claim.user_id,
    'L2_claim_approved'
  );

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
$$;

-- Admin RPC keeps its exact signature/behavior, now delegating to internal.
CREATE OR REPLACE FUNCTION public.approve_claim(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  PERFORM public._approve_claim_internal(p_claim_id);
END;
$$;

-- Auto-approve trigger function.
CREATE OR REPLACE FUNCTION public._auto_approve_claim_if_domain_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email        text;
  v_email_dom    text;
  v_site_dom     text;
  v_builder_name text;
  v_claimed      boolean;
  v_shared       text[] := ARRAY[
    -- platforms a builder's "website" might point at
    'facebook.com','instagram.com','youtube.com','google.com','business.site',
    'wixsite.com','wix.com','squarespace.com','godaddysites.com','wordpress.com',
    'weebly.com','webs.com','linktr.ee','etsy.com','shopify.com','myshopify.com',
    -- free mail providers
    'gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com',
    'me.com','proton.me','protonmail.com','mail.com','msn.com','live.com',
    'comcast.net','att.net','verizon.net','sbcglobal.net'
  ];
BEGIN
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT email::text INTO v_email FROM auth.users WHERE id = NEW.user_id;
  SELECT _registrable_domain(website), name, claimed
    INTO v_site_dom, v_builder_name, v_claimed
  FROM builders WHERE id = NEW.builder_id;

  v_email_dom := _registrable_domain(split_part(coalesce(v_email, ''), '@', 2));

  IF v_email_dom IS NULL OR v_site_dom IS NULL
     OR v_claimed IS DISTINCT FROM false
     OR v_email_dom = ANY(v_shared)
     OR v_site_dom  = ANY(v_shared)
     OR v_email_dom != v_site_dom THEN
    RETURN NEW;  -- no match: stays pending for manual review
  END IF;

  PERFORM public._approve_claim_internal(NEW.id);

  INSERT INTO public.approval_queue
    (type, title, summary, payload, status, created_by, decided_at, acted_at)
  VALUES (
    'claim_review',
    'Auto-approved claim: ' || coalesce(v_builder_name, NEW.business_name),
    'Claimant ' || v_email || ' matches builder website domain (' || v_site_dom
      || '). Approved automatically.',
    jsonb_build_object('claim_id', NEW.id, 'builder_id', NEW.builder_id,
                       'email_domain', v_email_dom, 'site_domain', v_site_dom),
    'acted', 'claim-auto-approve', now(), now()
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto-approve claim % failed, leaving pending: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 'zz' prefix so it fires after builder_claims_lifecycle_l1 (alphabetical
-- order): L1 "claim received" email precedes the L2 "approved" email.
DROP TRIGGER IF EXISTS builder_claims_zz_auto_approve ON public.builder_claims;
CREATE TRIGGER builder_claims_zz_auto_approve
AFTER INSERT ON public.builder_claims
FOR EACH ROW EXECUTE FUNCTION public._auto_approve_claim_if_domain_match();
