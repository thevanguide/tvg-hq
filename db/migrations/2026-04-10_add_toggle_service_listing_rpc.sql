-- ============================================================================
-- Migration: add_toggle_service_listing_rpc
-- Date:      2026-04-10
-- Purpose:   Self-serve "Add this business to the Repairs & Services
--            Directory" toggle on the builder dashboard.
--
-- Until now, dual-listing a shop in both the builder directory and the
-- repair/service directory required Andrew to hand-edit the `categories`
-- array in the `builders` table. Every service-capable shop that has
-- replied to outreach (Titan Vans, Oxbow Vans, ...) has requested this,
-- so it's worth getting Andrew out of the loop.
--
-- This RPC lets the verified owner of a builder listing flip the `service`
-- category on or off for their own shop. It is intentionally NOT a general
-- categories editor — only `service` can be added/removed. The `builder`
-- tag (and any other category) is preserved untouched.
--
-- Behavior:
--   * Auto-applies (no admin approval queue) — it's an opt-in toggle.
--   * Logs the change to `builder_edits` for audit purposes.
--   * Sends an admin notification email to hello@thevanguide.com so
--     Andrew can spam-watch new self-service additions.
--   * Triggers a GitHub Actions workflow_dispatch rebuild so the new
--     /services/[state]/[slug]/ page (or its removal) goes live within
--     about a minute.
--
-- Safety rails:
--   * Caller must be the listing's verified owner (matches submit_builder_edit).
--   * Cannot remove `service` if it would leave the shop with zero categories
--     (a service-only shop can't toggle itself off — it would orphan its
--     only listing). Frontend hides the toggle for service-only shops, but
--     the function enforces the same constraint as defense-in-depth.
--   * Email + rebuild are wrapped in fire-and-forget exception handlers
--     so a transient failure on either doesn't roll back the toggle.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_service_listing(
  p_builder_id uuid,
  p_enabled boolean
)
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

  -- Verify ownership and load shop info in one shot
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

  -- No-op if state already matches the request. Return cleanly so the
  -- frontend doesn't see this as an error if the user double-clicks.
  IF p_enabled = v_was_in THEN
    RETURN;
  END IF;

  IF p_enabled THEN
    -- Add 'service' to categories. Use array_append (allows duplicates) but
    -- the v_was_in check above guarantees we never re-append.
    v_categories := array_append(v_categories, 'service');
  ELSE
    -- Remove 'service' from categories. array_remove drops every match.
    v_categories := array_remove(v_categories, 'service');
  END IF;

  -- Safety: a shop must always have at least one category. Block any
  -- toggle that would leave the shop orphaned (service-only shops trying
  -- to remove their only category). Frontend should already prevent this,
  -- but this is the authoritative guard.
  IF array_length(v_categories, 1) IS NULL OR array_length(v_categories, 1) = 0 THEN
    RAISE EXCEPTION 'Cannot remove service listing: shop has no other category';
  END IF;

  UPDATE builders
  SET categories = v_categories,
      updated_at = now()
  WHERE id = p_builder_id;

  -- Audit log via builder_edits, same shape as submit_builder_edit so the
  -- admin edit history view sees it as a normal edit.
  INSERT INTO builder_edits (builder_id, user_id, changes, status, reviewed_at)
  VALUES (
    p_builder_id,
    v_user_id,
    jsonb_build_object('categories', to_jsonb(v_categories)),
    'approved',
    now()
  );

  -- Admin notification (fire-and-forget). Lets Andrew spam-watch new
  -- self-service service-directory additions during the early rollout.
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

  -- Trigger site rebuild via GitHub Actions workflow_dispatch
  -- (fire-and-forget — same pattern as submit_builder_edit + approve_claim).
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

GRANT EXECUTE ON FUNCTION public.toggle_service_listing(uuid, boolean) TO authenticated;
