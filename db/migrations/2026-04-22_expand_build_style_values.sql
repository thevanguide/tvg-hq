-- P2 PR 2: Expand build_style values (Bespoke / Semi-custom / Production).
-- Original binary labels (Custom / Standard) were noisy — many shops with
-- "custom" / "handcrafted" in their own taglines got tagged Standard by the
-- scrape heuristic, and several shops with explicit "standardized floor
-- plans" / "tiered" / "modular" offerings got tagged Custom. Rather than
-- auto-reclassify 455 rows, NULL out all unclaimed rows' build_style and
-- rebuild from owner self-service. The 7 claimed rows keep their legacy
-- values as a reference for Andrew to manually reclassify via dashboard.

-- 1. Broaden the check constraint to allow old + new values during transition.
-- A later migration tightens this to drop Custom/Standard after every claimed
-- row has been reclassified.
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_build_style_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_build_style_check
  CHECK (
    build_style IS NULL
    OR build_style IN ('Custom', 'Standard', 'Bespoke', 'Semi-custom', 'Production')
  );

-- 2. NULL out unclaimed rows' build_style. Preserves claimed rows so the
-- 7 owners who already got tagged can see their legacy label + reclassify.
UPDATE public.builders
  SET build_style = NULL, updated_at = now()
  WHERE owner_id IS NULL AND build_style IN ('Custom', 'Standard');

-- 3. Extend submit_builder_edit allowlist to accept build_style.
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
    'hero_image_url', 'service_hero_image_url',
    'starting_price', 'conversion_types', 'instagram_handle', 'youtube_url',
    'engagement_types', 'lead_time', 'warranty_months',
    -- P2 PR 2 addition
    'build_style'
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
      IF v_key IN ('emails', 'gallery_urls', 'platforms', 'services', 'service_emails', 'conversion_types', 'engagement_types') THEN
        EXECUTE format(
          'UPDATE builders SET %I = (SELECT array_agg(elem::text) FROM jsonb_array_elements_text($1) AS elem), updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value, p_builder_id;
      ELSIF v_key IN ('starting_price', 'warranty_months') THEN
        EXECUTE format(
          'UPDATE builders SET %I = ($1)::integer, updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value #>> '{}', p_builder_id;
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
