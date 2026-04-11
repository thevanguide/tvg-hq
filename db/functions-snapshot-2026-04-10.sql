-- ============================================================================
-- TVG SECURITY DEFINER function snapshot
-- ============================================================================
-- Source: public schema, pg_proc WHERE prosecdef = true
-- Snapshot date: 2026-04-10
-- Project: awnyqijglxczwyrhmdnc.supabase.co
--
-- This file is a DISASTER-RECOVERY SNAPSHOT, not a source-of-truth migration.
-- The functions below are the live state of the TVG Supabase database at the
-- time of capture. They are NOT auto-applied; do not run this file blindly.
--
-- To re-capture the current state, query pg_proc via the Management API or
-- mcp__supabase__execute_sql:
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND prosecdef = true
--   ORDER BY proname;
--
-- See memory/reference_supabase_management_api.md for the access pattern.
--
-- Changes since 2026-04-09 snapshot:
--   * Added: toggle_service_listing (Apr 10, self-serve service-directory toggle)
--   * Modified: 8 admin functions migrated from old admin user_id
--     8a79afbf-b4ac-4efc-abbd-2c8ce1b61a1c (hello@emerycustombuilds.com) to
--     b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac (andrew@thevanguide.com).
--   * Hardened: 9 SECURITY DEFINER functions had search_path pinned via
--     ALTER FUNCTION ... SET search_path = public, pg_temp.
--   * Note: submit_builder_edit was already updated Apr 9 with the
--     hero_image_url + service_hero_image_url whitelist additions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- approve_claim
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_claim(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_claim builder_claims%ROWTYPE;
  v_builder_name text;
  v_user_email text;
  v_resend_key text;
  v_gh_token text;
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_claim FROM builder_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  SELECT name INTO v_builder_name FROM builders WHERE id = v_claim.builder_id;
  SELECT email::text INTO v_user_email FROM auth.users WHERE id = v_claim.user_id;

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

  BEGIN
    SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key';

    IF v_resend_key IS NOT NULL AND v_user_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'The Van Guide <auth@thevanguide.com>',
          'to', v_user_email,
          'subject', 'Your claim for ' || COALESCE(v_builder_name, 'your listing') || ' has been approved',
          'html', '<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">'
            || '<div style="text-align: center; margin-bottom: 32px;"><h1 style="color: #1B3D2F; font-size: 24px; margin: 0;">The Van Guide</h1></div>'
            || '<h2 style="color: #1B3D2F; font-size: 20px; margin-bottom: 16px;">Your claim has been approved</h2>'
            || '<p style="color: #4A4A4A; font-size: 16px; line-height: 1.5; margin-bottom: 8px;">You now have full control of the <strong>' || COALESCE(v_builder_name, 'your') || '</strong> listing on The Van Guide.</p>'
            || '<p style="color: #4A4A4A; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">From your dashboard you can update your description, add photos, correct contact info, and more.</p>'
            || '<div style="text-align: center; margin-bottom: 24px;"><a href="https://thevanguide.com/builders/dashboard/" style="display: inline-block; background-color: #C49A2A; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">Go to your dashboard</a></div>'
            || '<p style="color: #999; font-size: 13px; line-height: 1.4;">If you have any questions, reply to this email.</p>'
            || '<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />'
            || '<p style="color: #bbb; font-size: 12px; text-align: center;">The Van Guide — thevanguide.com</p>'
            || '</div>'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Approval notification email failed: %', SQLERRM;
  END;

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

-- ----------------------------------------------------------------------------
-- approve_edit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_edit(p_edit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_edit builder_edits%ROWTYPE;
  v_key text;
  v_value jsonb;
BEGIN
  SELECT * INTO v_edit FROM builder_edits WHERE id = p_edit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit not found';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(v_edit.changes)
  LOOP
    IF v_key IN (
      'description', 'tagline', 'phone', 'website', 'street', 'city',
      'postal_code', 'logo_url',
      'service_description', 'service_tagline', 'service_phone'
    ) THEN
      EXECUTE format(
        'UPDATE builders SET %I = $1, updated_at = now() WHERE id = $2',
        v_key
      ) USING v_value #>> '{}', v_edit.builder_id;
    ELSIF v_key IN ('emails', 'gallery_urls', 'platforms', 'services', 'service_emails') THEN
      EXECUTE format(
        'UPDATE builders SET %I = (SELECT array_agg(elem::text) FROM jsonb_array_elements_text($1) AS elem), updated_at = now() WHERE id = $2',
        v_key
      ) USING v_value, v_edit.builder_id;
    END IF;
  END LOOP;

  UPDATE builder_edits
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_edit_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- approve_submission
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sub builder_submissions%ROWTYPE;
  v_state_code text;
  v_slug text;
  v_slug_base text;
  v_suffix int := 1;
  v_new_builder_id uuid;
  v_user_email text;
  v_resend_key text;
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_sub FROM builder_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
  IF v_sub.status != 'pending' THEN RAISE EXCEPTION 'Submission already reviewed'; END IF;

  v_state_code := public.state_name_to_code(v_sub.state);

  v_slug_base := lower(regexp_replace(regexp_replace(v_sub.business_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_slug_base := trim(both '-' from regexp_replace(v_slug_base, '-+', '-', 'g'));
  v_slug := v_slug_base;

  WHILE EXISTS (SELECT 1 FROM builders WHERE state = v_state_code AND slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix;
  END LOOP;

  INSERT INTO builders (
    name, slug, state, city, website, phone,
    emails, description, platforms,
    published, claimed, verified, owner_id,
    created_at, updated_at
  ) VALUES (
    v_sub.business_name, v_slug, v_state_code, v_sub.city,
    v_sub.website, v_sub.phone,
    CASE WHEN v_sub.email IS NOT NULL THEN ARRAY[v_sub.email] ELSE '{}' END,
    v_sub.description, COALESCE(v_sub.platforms, '{}'),
    true, true, false, v_sub.user_id,
    now(), now()
  ) RETURNING id INTO v_new_builder_id;

  UPDATE builder_submissions SET status = 'approved', reviewed_at = now() WHERE id = p_submission_id;

  BEGIN
    SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
    SELECT email::text INTO v_user_email FROM auth.users WHERE id = v_sub.user_id;
    IF v_resend_key IS NOT NULL AND v_user_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'The Van Guide <auth@thevanguide.com>',
          'to', v_user_email,
          'subject', v_sub.business_name || ' is now listed on The Van Guide',
          'html',
            '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">'
            || '<h1 style="color:#1B3D2F;font-size:24px;text-align:center;margin-bottom:32px;">The Van Guide</h1>'
            || '<h2 style="color:#1B3D2F;font-size:20px;margin-bottom:16px;">Your listing is live</h2>'
            || '<p style="color:#4A4A4A;font-size:16px;line-height:1.5;margin-bottom:8px;"><strong>' || v_sub.business_name || '</strong> has been added to The Van Guide directory.</p>'
            || '<p style="color:#4A4A4A;font-size:16px;line-height:1.5;margin-bottom:24px;">Update your description, add photos, and manage your profile from your dashboard.</p>'
            || '<div style="text-align:center;margin-bottom:24px;"><a href="https://thevanguide.com/builders/dashboard/" style="display:inline-block;background:#C49A2A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:600;">Go to your dashboard</a></div>'
            || '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>'
            || '<p style="color:#bbb;font-size:12px;text-align:center;">The Van Guide — thevanguide.com</p></div>'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Submission approval email failed: %', SQLERRM;
  END;

  RETURN v_new_builder_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_admin_stats
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT jsonb_build_object(
    'pending_claims',      (SELECT count(*) FROM builder_claims WHERE status = 'pending'),
    'pending_edits',       (SELECT count(*) FROM builder_edits WHERE status = 'pending'),
    'pending_submissions', (SELECT count(*) FROM builder_submissions WHERE status = 'pending'),
    'total_builders',      (SELECT count(*) FROM builders WHERE published = true),
    'claimed_builders',    (SELECT count(*) FROM builders WHERE claimed = true),
    'total_users',         (SELECT count(*) FROM auth.users)
  ) INTO result;
  RETURN result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_my_builder
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_builder()
 RETURNS SETOF builders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Return every builder listing owned by the current user. The dashboard
  -- lets the owner pick which one they're editing when they own more than
  -- one. Alphabetical order keeps the default deterministic.
  RETURN QUERY
    SELECT * FROM builders
    WHERE owner_id = auth.uid()
    ORDER BY name ASC;
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_my_claims
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_claims()
 RETURNS SETOF builder_claims
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    SELECT * FROM builder_claims WHERE user_id = auth.uid()
    ORDER BY created_at DESC;
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_pending_claims
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_claims()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT
        bc.id,
        bc.builder_id,
        bc.user_id,
        bc.status,
        bc.business_name,
        bc.contact_name,
        bc.evidence,
        bc.created_at,
        bc.reviewed_at,
        b.name AS builder_name,
        b.state AS builder_state,
        b.slug AS builder_slug,
        b.website AS builder_website,
        u.email::text AS claimant_email
      FROM builder_claims bc
      LEFT JOIN builders b ON b.id = bc.builder_id
      LEFT JOIN auth.users u ON u.id = bc.user_id
      ORDER BY
        CASE bc.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        bc.created_at DESC
    ) t
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_pending_edits
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_edits()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT
        be.id,
        be.builder_id,
        be.user_id,
        be.status,
        be.changes,
        be.created_at,
        be.reviewed_at,
        b.name AS builder_name,
        b.state AS builder_state,
        b.slug AS builder_slug,
        u.email::text AS editor_email
      FROM builder_edits be
      LEFT JOIN builders b ON b.id = be.builder_id
      LEFT JOIN auth.users u ON u.id = be.user_id
      ORDER BY
        CASE be.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        be.created_at DESC
    ) t
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_pending_submissions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_submissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM (
      SELECT
        bs.id, bs.user_id, bs.status,
        bs.business_name, bs.city, bs.state,
        bs.website, bs.phone, bs.email,
        bs.description, bs.platforms, bs.contact_name, bs.role,
        bs.created_at, bs.reviewed_at,
        u.email::text AS submitter_email,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'slug', b.slug,
            'state', b.state, 'city', b.city, 'website', b.website
          ) ORDER BY similarity(lower(b.name), lower(bs.business_name)) DESC), '[]'::jsonb)
          FROM builders b
          WHERE b.state = public.state_name_to_code(bs.state)
            AND b.published = true
            AND similarity(lower(b.name), lower(bs.business_name)) > 0.25
        ) AS potential_duplicates
      FROM builder_submissions bs
      LEFT JOIN auth.users u ON u.id = bs.user_id
      ORDER BY
        CASE bs.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        bs.created_at DESC
    ) t
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- reject_claim
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_claim(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_claim builder_claims%ROWTYPE;
  v_builder_name text;
  v_user_email text;
  v_resend_key text;
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_claim FROM builder_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  SELECT name INTO v_builder_name FROM builders WHERE id = v_claim.builder_id;
  SELECT email::text INTO v_user_email FROM auth.users WHERE id = v_claim.user_id;

  UPDATE builder_claims
  SET status = 'rejected', reviewed_at = now()
  WHERE id = p_claim_id;

  BEGIN
    SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key';

    IF v_resend_key IS NOT NULL AND v_user_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'The Van Guide <auth@thevanguide.com>',
          'to', v_user_email,
          'subject', 'Your claim for ' || COALESCE(v_builder_name, 'your listing') || ' was not approved',
          'html', '<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">'
            || '<div style="text-align: center; margin-bottom: 32px;"><h1 style="color: #1B3D2F; font-size: 24px; margin: 0;">The Van Guide</h1></div>'
            || '<h2 style="color: #1B3D2F; font-size: 20px; margin-bottom: 16px;">Claim not approved</h2>'
            || '<p style="color: #4A4A4A; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Your claim for <strong>' || COALESCE(v_builder_name, 'the requested listing') || '</strong> on The Van Guide was not approved.</p>'
            || '<p style="color: #4A4A4A; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">If you believe this is an error, reply to this email and we will look into it.</p>'
            || '<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />'
            || '<p style="color: #bbb; font-size: 12px; text-align: center;">The Van Guide — thevanguide.com</p>'
            || '</div>'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Rejection notification email failed: %', SQLERRM;
  END;
END;
$function$;

-- ----------------------------------------------------------------------------
-- reject_submission
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_submission(p_submission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() != 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE builder_submissions SET status = 'rejected', reviewed_at = now()
  WHERE id = p_submission_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found or already reviewed'; END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- submit_builder_claim
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_builder_claim(p_builder_id uuid, p_business_name text, p_contact_name text, p_evidence text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_claim_id uuid;
  v_builder_name text;
  v_resend_key text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT name INTO v_builder_name FROM builders WHERE id = p_builder_id;
  IF v_builder_name IS NULL THEN
    RAISE EXCEPTION 'Builder not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM builder_claims
    WHERE builder_id = p_builder_id AND user_id = v_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending claim for this builder';
  END IF;

  INSERT INTO builder_claims (builder_id, user_id, business_name, contact_name, evidence)
  VALUES (p_builder_id, v_user_id, p_business_name, p_contact_name, p_evidence)
  RETURNING id INTO v_claim_id;

  BEGIN
    SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key';

    IF v_resend_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'The Van Guide <auth@thevanguide.com>',
          'to', 'hello@thevanguide.com',
          'subject', 'New claim: ' || COALESCE(v_builder_name, p_business_name),
          'html', '<div style="font-family: sans-serif; max-width: 480px;">'
            || '<h2 style="color: #1B3D2F;">New Builder Claim</h2>'
            || '<p><strong>Builder:</strong> ' || COALESCE(v_builder_name, p_business_name) || '</p>'
            || '<p><strong>Claimant:</strong> ' || COALESCE(p_contact_name, '') || ' (' || v_user_email || ')</p>'
            || '<p><strong>Evidence:</strong></p>'
            || '<pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 13px; white-space: pre-wrap;">' || COALESCE(p_evidence, '') || '</pre>'
            || '<p style="margin-top: 20px;"><a href="https://thevanguide.com/builders/admin/" style="display: inline-block; background: #C49A2A; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Review in Admin</a></p>'
            || '</div>'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Claim notification email failed: %', SQLERRM;
  END;

  RETURN v_claim_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- submit_builder_edit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_builder_edit(p_builder_id uuid, p_changes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_edit_id uuid;
  v_key text;
  v_value jsonb;
  v_gh_token text;
  v_safe_fields text[] := ARRAY[
    'description', 'tagline', 'phone', 'website', 'street',
    'city', 'postal_code', 'logo_url', 'emails', 'gallery_urls',
    'platforms', 'services',
    'service_description', 'service_tagline', 'service_phone', 'service_emails',
    'hero_image_url', 'service_hero_image_url'
  ];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM builders WHERE id = p_builder_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not own this builder listing';
  END IF;

  IF p_changes ? 'gallery_urls' THEN
    DECLARE
      v_limit int;
      v_count int;
    BEGIN
      SELECT COALESCE(photo_limit, 3) INTO v_limit FROM builders WHERE id = p_builder_id;
      v_count := jsonb_array_length(p_changes -> 'gallery_urls');
      IF v_count > v_limit THEN
        RAISE EXCEPTION 'Gallery exceeds your photo limit (% of % allowed)', v_count, v_limit;
      END IF;
    END;
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_changes)
  LOOP
    IF v_key = ANY(v_safe_fields) THEN
      IF v_key IN ('emails', 'gallery_urls', 'platforms', 'services', 'service_emails') THEN
        EXECUTE format(
          'UPDATE builders SET %I = (SELECT array_agg(elem::text) FROM jsonb_array_elements_text($1) AS elem), updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value, p_builder_id;
      ELSE
        EXECUTE format(
          'UPDATE builders SET %I = $1, updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value #>> '{}', p_builder_id;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO builder_edits (builder_id, user_id, changes, status, reviewed_at)
  VALUES (p_builder_id, v_user_id, p_changes, 'approved', now())
  RETURNING id INTO v_edit_id;

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

  RETURN v_edit_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- submit_new_builder
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_new_builder(p_business_name text, p_city text, p_state text, p_contact_name text, p_website text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_platforms text[] DEFAULT '{}'::text[], p_services text[] DEFAULT '{}'::text[], p_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_submission_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  IF EXISTS (
    SELECT 1 FROM builder_submissions
    WHERE user_id = v_user_id AND lower(business_name) = lower(p_business_name) AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending submission for this business';
  END IF;

  INSERT INTO builder_submissions (
    user_id, business_name, city, state, website, phone, email,
    description, platforms, services, contact_name, role
  )
  VALUES (
    v_user_id, p_business_name, p_city, p_state, p_website, p_phone, p_email,
    p_description, p_platforms, p_services, p_contact_name, p_role
  )
  RETURNING id INTO v_submission_id;

  PERFORM net.http_post(
    url := 'https://awnyqijglxczwyrhmdnc.supabase.co/functions/v1/notify-claim',
    body := json_build_object(
      'type', 'new_submission',
      'builder_name', p_business_name,
      'builder_id', v_submission_id,
      'user_email', v_user_email,
      'contact_name', p_contact_name,
      'evidence', format('New builder submission: %s, %s | Website: %s | Role: %s', p_city, p_state, COALESCE(p_website, 'N/A'), COALESCE(p_role, 'N/A'))
    )::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN v_submission_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- subscribe_to_newsletter
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.subscribe_to_newsletter(p_email text, p_list text DEFAULT 'newsletter'::text, p_source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.subscribers (email, list, source)
  values (lower(trim(p_email)), coalesce(p_list, 'newsletter'), p_source)
  on conflict do nothing;
end;
$function$;

-- ----------------------------------------------------------------------------
-- toggle_service_listing  (NEW Apr 10)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_service_listing(p_builder_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_builder_name text;
  v_builder_state text;
  v_builder_slug text;
  v_categories text[];
  v_was_in boolean;
  v_resend_key text;
  v_gh_token text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    name,
    state,
    slug,
    COALESCE(categories, ARRAY[]::text[])
  INTO
    v_builder_name,
    v_builder_state,
    v_builder_slug,
    v_categories
  FROM builders
  WHERE id = p_builder_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not own this builder listing';
  END IF;

  v_was_in := 'service' = ANY(v_categories);

  IF p_enabled = v_was_in THEN
    RETURN;
  END IF;

  IF p_enabled THEN
    v_categories := array_append(v_categories, 'service');
  ELSE
    v_categories := array_remove(v_categories, 'service');
  END IF;

  IF array_length(v_categories, 1) IS NULL OR array_length(v_categories, 1) = 0 THEN
    RAISE EXCEPTION 'Cannot remove service listing: shop has no other category';
  END IF;

  UPDATE builders
  SET categories = v_categories,
      updated_at = now()
  WHERE id = p_builder_id;

  INSERT INTO builder_edits (builder_id, user_id, changes, status, reviewed_at)
  VALUES (
    p_builder_id,
    v_user_id,
    jsonb_build_object('categories', to_jsonb(v_categories)),
    'approved',
    now()
  );

  BEGIN
    SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key';

    SELECT email::text INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF v_resend_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'The Van Guide <auth@thevanguide.com>',
          'to', 'hello@thevanguide.com',
          'subject', CASE
            WHEN p_enabled THEN 'Service listing added: ' || COALESCE(v_builder_name, 'unknown')
            ELSE 'Service listing removed: ' || COALESCE(v_builder_name, 'unknown')
          END,
          'html', '<div style="font-family: sans-serif; max-width: 480px;">'
            || '<h2 style="color: #1B3D2F;">'
            || CASE WHEN p_enabled THEN 'Service listing added' ELSE 'Service listing removed' END
            || '</h2>'
            || '<p><strong>Shop:</strong> ' || COALESCE(v_builder_name, 'unknown') || '</p>'
            || '<p><strong>State:</strong> ' || COALESCE(v_builder_state, 'unknown') || '</p>'
            || '<p><strong>Slug:</strong> ' || COALESCE(v_builder_slug, 'unknown') || '</p>'
            || '<p><strong>Owner:</strong> ' || COALESCE(v_user_email, 'unknown') || '</p>'
            || '<p><strong>Categories now:</strong> ' || array_to_string(v_categories, ', ') || '</p>'
            || '<p style="margin-top: 16px; color: #666; font-size: 13px;">Auto-applied by the dashboard self-serve toggle. Site rebuild in progress.</p>'
            || '<p style="margin-top: 20px;"><a href="https://thevanguide.com/builders/admin/" style="display: inline-block; background: #C49A2A; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open admin</a></p>'
            || '</div>'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Service toggle notification email failed: %', SQLERRM;
  END;

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
