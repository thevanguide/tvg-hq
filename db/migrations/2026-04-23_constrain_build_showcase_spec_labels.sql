-- ============================================================================
-- Migration: constrain_build_showcase_spec_labels
-- Date:      2026-04-23
-- Purpose:   Follow-up on P3 PR A. Replace the freeform `spec.label` input
--            with a fixed 7-value category taxonomy so featured builds are
--            comparable across the directory.
--
-- Allowed labels (decided 2026-04-23):
--   Electrical | Water | HVAC | Seating & Sleeping | Living | Exterior | Other
--
-- Enforcement lives in upsert_build_showcase — each payload is checked
-- before upsert, so the dashboard + any other future caller gets a clean
-- error instead of a raw SQL exception. No CHECK constraint on the jsonb
-- column because PG does not allow subqueries in CHECK; the RPC is the
-- single write path anyway.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_build_showcase(
  p_builder_id uuid,
  p_payload jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id         uuid;
  v_showcase_id     uuid;
  v_gh_token        text;
  v_hero            text;
  v_title           text;
  v_platform        text;
  v_year            integer;
  v_conversion_type text;
  v_description     text;
  v_specs           jsonb;
  v_gallery         text[];
  v_spec_elem       jsonb;
  v_spec_label      text;
  v_allowed_labels  text[] := ARRAY[
    'Electrical',
    'Water',
    'HVAC',
    'Seating & Sleeping',
    'Living',
    'Exterior',
    'Other'
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

  v_hero            := p_payload ->> 'hero_image_url';
  v_title           := p_payload ->> 'title';
  v_platform        := p_payload ->> 'platform';
  v_conversion_type := p_payload ->> 'conversion_type';
  v_description     := p_payload ->> 'description';

  IF v_hero IS NULL OR length(v_hero) = 0 THEN
    RAISE EXCEPTION 'Hero image is required';
  END IF;
  IF v_title IS NULL OR length(btrim(v_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_payload ? 'year'
     AND jsonb_typeof(p_payload -> 'year') NOT IN ('null')
     AND (p_payload ->> 'year') <> ''
  THEN
    v_year := (p_payload ->> 'year')::integer;
  ELSE
    v_year := NULL;
  END IF;

  -- specs: array shape + per-entry {label, value} + label ∈ allowed set.
  v_specs := COALESCE(p_payload -> 'specs', '[]'::jsonb);
  IF jsonb_typeof(v_specs) <> 'array' THEN
    RAISE EXCEPTION 'Specs must be an array';
  END IF;
  IF jsonb_array_length(v_specs) > 8 THEN
    RAISE EXCEPTION 'Specs can have at most 8 entries';
  END IF;
  FOR v_spec_elem IN SELECT * FROM jsonb_array_elements(v_specs)
  LOOP
    IF jsonb_typeof(v_spec_elem) <> 'object'
       OR NOT (v_spec_elem ? 'label')
       OR NOT (v_spec_elem ? 'value')
    THEN
      RAISE EXCEPTION 'Each spec must be a {label, value} object';
    END IF;
    v_spec_label := v_spec_elem ->> 'label';
    IF v_spec_label IS NULL OR NOT (v_spec_label = ANY(v_allowed_labels)) THEN
      RAISE EXCEPTION
        'Spec label "%" is not one of the allowed categories (%)',
        COALESCE(v_spec_label, 'null'),
        array_to_string(v_allowed_labels, ', ');
    END IF;
  END LOOP;

  IF p_payload ? 'gallery_urls' THEN
    v_gallery := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_payload -> 'gallery_urls')),
      ARRAY[]::text[]
    );
  ELSE
    v_gallery := ARRAY[]::text[];
  END IF;

  INSERT INTO build_showcases (
    builder_id, hero_image_url, title, platform, year,
    conversion_type, description, specs, gallery_urls
  ) VALUES (
    p_builder_id, v_hero, v_title, v_platform, v_year,
    v_conversion_type, v_description, v_specs, v_gallery
  )
  ON CONFLICT (builder_id) DO UPDATE SET
    hero_image_url  = EXCLUDED.hero_image_url,
    title           = EXCLUDED.title,
    platform        = EXCLUDED.platform,
    year            = EXCLUDED.year,
    conversion_type = EXCLUDED.conversion_type,
    description     = EXCLUDED.description,
    specs           = EXCLUDED.specs,
    gallery_urls    = EXCLUDED.gallery_urls
  RETURNING id INTO v_showcase_id;

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

  RETURN v_showcase_id;
END;
$function$;
