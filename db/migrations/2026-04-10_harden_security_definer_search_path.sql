-- ============================================================================
-- Migration: harden_security_definer_search_path
-- Date:      2026-04-10
-- Purpose:   Pin search_path on the 9 SECURITY DEFINER functions in public
--            that don't already have it set. Defense-in-depth against
--            search-path injection attacks.
--
-- Background:
--   SECURITY DEFINER functions execute with the function owner's privileges
--   (typically `postgres`), not the caller's. If the function references
--   unqualified objects (e.g. `builders` instead of `public.builders`, or
--   `auth.uid()` resolved via search_path), an attacker who can influence
--   `search_path` could redirect those references to malicious objects in
--   another schema. Pinning search_path eliminates that vector.
--
--   Per Postgres docs (https://www.postgresql.org/docs/current/sql-createfunction.html):
--   "It is best to set a SET clause for SECURITY DEFINER functions to define
--    a value of search_path that suits the function."
--
-- Functions hardened (9):
--   approve_claim, approve_submission, get_admin_stats, get_pending_claims,
--   get_pending_edits, get_pending_submissions, reject_claim, reject_submission,
--   submit_builder_claim
--
-- Functions already hardened (7) — no change needed:
--   approve_edit, get_my_builder, get_my_claims, submit_builder_edit,
--   submit_new_builder, subscribe_to_newsletter, toggle_service_listing
--
-- We use ALTER FUNCTION ... SET search_path instead of CREATE OR REPLACE so
-- we don't have to rewrite the function bodies. This sets a function-level
-- GUC that overrides the session search_path for the duration of the call.
-- We include `pg_temp` last so the function still functions normally for
-- temp-table use, but it's at the end of the path so a malicious temp
-- object can't shadow public.
-- ============================================================================

ALTER FUNCTION public.approve_claim(uuid)              SET search_path = public, pg_temp;
ALTER FUNCTION public.approve_submission(uuid)         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_stats()                SET search_path = public, pg_temp;
ALTER FUNCTION public.get_pending_claims()             SET search_path = public, pg_temp;
ALTER FUNCTION public.get_pending_edits()              SET search_path = public, pg_temp;
ALTER FUNCTION public.get_pending_submissions()        SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_claim(uuid)               SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_submission(uuid)          SET search_path = public, pg_temp;
ALTER FUNCTION public.submit_builder_claim(uuid, text, text, text) SET search_path = public, pg_temp;
