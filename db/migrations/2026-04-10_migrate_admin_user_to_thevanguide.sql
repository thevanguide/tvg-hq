-- ============================================================================
-- Migration: migrate_admin_user_to_thevanguide
-- Date:      2026-04-10
-- Purpose:   Move TVG admin role from hello@emerycustombuilds.com to
--            andrew@thevanguide.com.
--
-- Background: the original admin account was created on 2026-04-06 under
-- hello@emerycustombuilds.com (user_id 8a79afbf-b4ac-4efc-abbd-2c8ce1b61a1c)
-- before the strict TVG/ECB separation rules were finalized. Per CLAUDE.md
-- ("Never reference ECB anywhere in TVG content, code, comments, or
-- metadata"), the admin login should be on the thevanguide.com domain.
--
-- The new admin user is andrew@thevanguide.com
-- (user_id b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac), created Apr 10 2026 and
-- already verified via successful magic-link sign-in.
--
-- Eight SECURITY DEFINER functions hardcode the admin UUID in their
-- auth.uid() check. We use a DO + EXECUTE pattern to swap the UUID inside
-- each function's body without hand-transcribing 200+ lines of HTML email
-- templates and risking a typo.
--
-- Affected functions:
--   approve_claim, approve_submission, get_admin_stats, get_pending_claims,
--   get_pending_edits, get_pending_submissions, reject_claim, reject_submission
--
-- After this migration:
--   * Old hello@emerycustombuilds.com user is left in auth.users as a soft
--     fallback. It can be deleted via Studio once admin is confirmed working
--     under the new account. Deliberately not auto-deleted to avoid an
--     accidental lockout.
--   * Stale db/functions-snapshot-2026-04-09.sql still references the old
--     UUID. That snapshot was already known stale and is on the cleanup
--     list — separate from this migration.
--   * No source code in tvg-hq/src/ references the admin UUID. The dashboard
--     gates admin pages by calling the SECURITY DEFINER RPCs and observing
--     whether they raise 'Admin access required' — so the migration is
--     transparent to the frontend.
-- ============================================================================

DO $migrate$
DECLARE
  fn_oid oid;
  f text;
  new_def text;
  changed_count int := 0;
BEGIN
  FOR fn_oid IN
    SELECT oid FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND pg_get_functiondef(oid) LIKE '%8a79afbf-b4ac-4efc-abbd-2c8ce1b61a1c%'
  LOOP
    f := pg_get_functiondef(fn_oid);
    new_def := replace(f, '8a79afbf-b4ac-4efc-abbd-2c8ce1b61a1c', 'b1b8b1ae-b7be-4b96-91f4-2ee74b31cdac');
    EXECUTE new_def;
    changed_count := changed_count + 1;
  END LOOP;

  RAISE NOTICE 'Migrated % functions', changed_count;
END $migrate$;
