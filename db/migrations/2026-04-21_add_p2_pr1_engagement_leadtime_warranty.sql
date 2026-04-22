-- P2 (revised) PR 1: Additive directory fields — engagement types, lead time, warranty.
-- Net-new columns only. No data migration on existing rows (all three start NULL
-- for all 456 builders; owners fill them in via the dashboard).
-- Extends submit_builder_edit allowlist so builders can save them.

-- 1. New columns with guardrails
ALTER TABLE public.builders
  ADD COLUMN IF NOT EXISTS engagement_types text[],
  ADD COLUMN IF NOT EXISTS lead_time text,
  ADD COLUMN IF NOT EXISTS warranty_months integer;

-- Engagement types restricted to known values. Captures the *kind* of work the
-- shop does — distinct from `services` (systems the shop installs) and from
-- `conversion_types` (van-included vs BYO).
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_engagement_types_values_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_engagement_types_values_check
  CHECK (
    engagement_types IS NULL
    OR engagement_types <@ ARRAY[
      'new_build',
      'service_repair',
      'warranty_work',
      'rentals',
      'parts_kits'
    ]::text[]
  );

-- Lead time is a bucket, not free-form weeks. Customers ask "can you start
-- within X" so bucketed buckets are more useful + easier to fill in.
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_lead_time_values_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_lead_time_values_check
  CHECK (
    lead_time IS NULL
    OR lead_time IN (
      'under_1_month',
      '1_to_3_months',
      '3_to_6_months',
      '6_months_plus'
    )
  );

-- Warranty length in months. NULL = unspecified, 0 = no warranty offered,
-- 1..120 = months covered. Ceiling at 120 mo (10 yr) as typo guardrail.
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_warranty_months_range_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_warranty_months_range_check
  CHECK (warranty_months IS NULL OR (warranty_months >= 0 AND warranty_months <= 120));

-- 2. Extend submit_builder_edit allowlist to accept the 3 new fields.
-- engagement_types joins the array branch; warranty_months joins the integer
-- branch (Postgres does not implicit-cast jsonb text to integer); lead_time
-- uses the default text branch.
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
    -- P1 additions
    'starting_price', 'conversion_types', 'instagram_handle', 'youtube_url',
    -- P2 PR 1 additions
    'engagement_types', 'lead_time', 'warranty_months'
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
        -- Array branch
        EXECUTE format(
          'UPDATE builders SET %I = (SELECT array_agg(elem::text) FROM jsonb_array_elements_text($1) AS elem), updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value, p_builder_id;
      ELSIF v_key IN ('starting_price', 'warranty_months') THEN
        -- Integer branch. Explicit ::integer cast because Postgres does not
        -- implicit-cast text to integer. Null jsonb → NULL via v_value #>> '{}'.
        EXECUTE format(
          'UPDATE builders SET %I = ($1)::integer, updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value #>> '{}', p_builder_id;
      ELSE
        -- Text branch (all other fields)
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
