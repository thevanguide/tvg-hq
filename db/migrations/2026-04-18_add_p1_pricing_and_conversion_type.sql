-- P1: Starting price + conversion type + expose IG/YouTube in dashboard
-- Adds two new columns (starting_price, conversion_types) and extends the
-- submit_builder_edit RPC allowlist so builders can edit them plus the
-- existing instagram_handle / youtube_url columns from enrichment.

-- 1. New columns with guardrails
ALTER TABLE public.builders
  ADD COLUMN IF NOT EXISTS starting_price integer,
  ADD COLUMN IF NOT EXISTS conversion_types text[];

-- Price floor $5k, ceiling $500k (typo guardrail)
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_starting_price_range_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_starting_price_range_check
  CHECK (starting_price IS NULL OR (starting_price >= 5000 AND starting_price <= 500000));

-- Conversion types restricted to known values
ALTER TABLE public.builders
  DROP CONSTRAINT IF EXISTS builders_conversion_types_values_check;
ALTER TABLE public.builders
  ADD CONSTRAINT builders_conversion_types_values_check
  CHECK (
    conversion_types IS NULL
    OR conversion_types <@ ARRAY['conversion_only', 'full_build']::text[]
  );

-- 2. Extend submit_builder_edit allowlist to accept the 4 new fields
-- (starting_price, conversion_types, instagram_handle, youtube_url)
-- Also add conversion_types to the array-handling IN clause.
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
    'starting_price', 'conversion_types', 'instagram_handle', 'youtube_url'
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
      IF v_key IN ('emails', 'gallery_urls', 'platforms', 'services', 'service_emails', 'conversion_types') THEN
        -- Array branch
        EXECUTE format(
          'UPDATE builders SET %I = (SELECT array_agg(elem::text) FROM jsonb_array_elements_text($1) AS elem), updated_at = now() WHERE id = $2',
          v_key
        ) USING v_value, p_builder_id;
      ELSIF v_key IN ('starting_price') THEN
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
