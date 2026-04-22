-- ============================================================================
-- Migration: add_p3_pra_build_showcases
-- Date:      2026-04-22
-- Purpose:   P3 PR A — Build Showcase feature, data model + dashboard RPCs.
--
-- Each claimed builder can feature ONE standout build on their profile.
-- 1:1 with `builders` (unique constraint on builder_id). Claim-gated via
-- SECURITY DEFINER RPCs; no client policies, so unclaimed rows can never
-- be targeted by frontend code even with the anon key.
--
-- PR A ships the data model + dashboard CRUD only. No public render yet —
-- PR B will add the profile page section. Having PR A live independently
-- lets a handful of claimed builders populate real showcases before the
-- render goes public, so PR B is designed against actual data.
--
-- Tables added:
--   1. build_showcases
-- Functions added:
--   1. get_my_build_showcases()
--   2. upsert_build_showcase(p_builder_id, p_payload)
--   3. delete_build_showcase(p_builder_id)
--
-- Safety:
--   * Purely additive — no ALTER on existing tables.
--   * RLS enabled, no client policies. All access through SECURITY DEFINER
--     RPCs that check auth.uid() + ownership.
--   * Fully reversible:
--       DROP FUNCTION delete_build_showcase, upsert_build_showcase,
--                     get_my_build_showcases;
--       DROP TABLE build_showcases;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. build_showcases table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.build_showcases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id       uuid NOT NULL REFERENCES public.builders(id) ON DELETE CASCADE,
  hero_image_url   text NOT NULL,
  title            text NOT NULL,
  platform         text,
  year             integer,
  conversion_type  text,
  description      text,
  specs            jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Array of {label, value} pairs. Kept as jsonb (not a child table)
    -- because rows are always read/written as a whole showcase.
  gallery_urls     text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT build_showcases_builder_id_unique UNIQUE (builder_id)
);

ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_title_len
  CHECK (char_length(title) BETWEEN 1 AND 100);

ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_description_len
  CHECK (description IS NULL OR char_length(description) <= 600);

-- Platform mirrors the 3 named chassis plus "Other" so the showcase card
-- can render a clean chip. Null is allowed for pre-fill.
ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_platform_values
  CHECK (
    platform IS NULL
    OR platform IN ('Sprinter', 'ProMaster', 'Transit', 'Other')
  );

-- Conversion type buckets the intended use. Underscored snake_case so the
-- dashboard and profile render can map to display labels locally without
-- committing a human-readable string to the DB.
ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_conversion_type_values
  CHECK (
    conversion_type IS NULL
    OR conversion_type IN ('weekender', 'full_time', 'adventure', 'work_vehicle')
  );

-- Year: typo guardrail. Range spans plausible conversion vehicles; widen
-- if we ever see a real build outside it.
ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_year_range
  CHECK (year IS NULL OR (year >= 1980 AND year <= 2030));

-- Gallery capped at 5 per the roadmap spec (3–5 additional photos).
ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_gallery_len
  CHECK (cardinality(gallery_urls) <= 5);

-- specs must be a jsonb array with at most 8 entries. Shape (label/value
-- string pairs) is enforced by the RPC, not the DB, so legacy rows can
-- evolve without a constraint rebuild.
ALTER TABLE public.build_showcases
  ADD CONSTRAINT build_showcases_specs_shape
  CHECK (
    jsonb_typeof(specs) = 'array'
    AND jsonb_array_length(specs) <= 8
  );

COMMENT ON TABLE public.build_showcases IS
  'P3 Build Showcase: one featured build per claimed builder. 1:1 with builders. '
  'Claim-gated via SECURITY DEFINER RPCs; no client-side RLS policies.';
COMMENT ON COLUMN public.build_showcases.hero_image_url IS
  'Required hero image URL. Shows first in the showcase section.';
COMMENT ON COLUMN public.build_showcases.specs IS
  'Array of {label: string, value: string} pairs. Max 8 entries, enforced in RPC.';
COMMENT ON COLUMN public.build_showcases.gallery_urls IS
  'Optional gallery, 0–5 images, uploaded via the existing builder-photos bucket.';

ALTER TABLE public.build_showcases ENABLE ROW LEVEL SECURITY;
-- No policies on purpose. All access flows through SECURITY DEFINER RPCs
-- below. PR B will render via build-time fetches using the service-role
-- key (or a dedicated read-RPC), not by opening up anon SELECT.

-- updated_at trigger so saves always bump the timestamp even on UPSERT.
CREATE OR REPLACE FUNCTION public.touch_build_showcases_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS build_showcases_touch_updated_at ON public.build_showcases;
CREATE TRIGGER build_showcases_touch_updated_at
  BEFORE UPDATE ON public.build_showcases
  FOR EACH ROW EXECUTE FUNCTION public.touch_build_showcases_updated_at();

-- ----------------------------------------------------------------------------
-- 2. get_my_build_showcases — returns every showcase owned by the caller
-- ----------------------------------------------------------------------------
-- Dashboard loads all showcases up front and keys them by builder_id locally,
-- mirroring the get_my_builder pattern. Cheaper than one round-trip per
-- builder tab for owners with multiple listings.
CREATE OR REPLACE FUNCTION public.get_my_build_showcases()
  RETURNS SETOF build_showcases
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    SELECT bs.*
    FROM build_showcases bs
    JOIN builders b ON b.id = bs.builder_id
    WHERE b.owner_id = auth.uid();
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. upsert_build_showcase — create or update the single showcase for a shop
-- ----------------------------------------------------------------------------
-- Payload shape:
--   {
--     "hero_image_url": text (required),
--     "title":          text (required, 1..100 chars),
--     "platform":       "Sprinter"|"ProMaster"|"Transit"|"Other"|null,
--     "year":           integer (1980..2030) or null,
--     "conversion_type":"weekender"|"full_time"|"adventure"|"work_vehicle"|null,
--     "description":    text (<=600 chars) or null,
--     "specs":          [{label, value}, ...] (<=8 entries),
--     "gallery_urls":   text[] (<=5 entries)
--   }
--
-- RPC validates auth + ownership, enforces required fields explicitly (so
-- errors map cleanly to dashboard UX), and lets the DB check constraints
-- catch range/length violations as a second line of defense.
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

  -- year is nullable. Distinguish "absent" / jsonb null / empty string from
  -- a real integer so blank inputs save as NULL rather than erroring.
  IF p_payload ? 'year'
     AND jsonb_typeof(p_payload -> 'year') NOT IN ('null')
     AND (p_payload ->> 'year') <> ''
  THEN
    v_year := (p_payload ->> 'year')::integer;
  ELSE
    v_year := NULL;
  END IF;

  -- specs: require array shape + enforce per-entry shape ({label, value}).
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

  -- Fire-and-forget deploy trigger. Same pattern as submit_builder_edit —
  -- PR A ships with no public render, so this is a no-op for site visitors
  -- until PR B lands. Wrapping it makes sure the dashboard save still
  -- succeeds if the token/secret isn't set or GitHub hiccups.
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

-- ----------------------------------------------------------------------------
-- 4. delete_build_showcase — remove the showcase for a shop
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_build_showcase(p_builder_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid;
  v_gh_token text;
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

  DELETE FROM build_showcases WHERE builder_id = p_builder_id;

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
