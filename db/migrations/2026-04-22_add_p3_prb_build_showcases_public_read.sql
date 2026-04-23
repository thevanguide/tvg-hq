-- ============================================================================
-- Migration: add_p3_prb_build_showcases_public_read
-- Date:      2026-04-22
-- Purpose:   P3 PR B — open build_showcases to anon SELECT so the static
--            builder profile build can fetch showcase data at build time.
--
-- PR A intentionally shipped with RLS enabled and zero policies — all access
-- routed through SECURITY DEFINER RPCs so the dashboard could create/edit
-- invisibly while we designed the public render. PR B now renders the
-- Featured Build section on /builders/[state]/[slug]/, which is a static
-- page built with the anon key. Without a SELECT policy the build would
-- silently drop every showcase from production.
--
-- The policy is scoped to showcases whose parent builder row is published,
-- so an unpublished shop's showcase is never exposed even if the scraper
-- pipeline or admin tooling orphans one.
-- ============================================================================

CREATE POLICY "public_read_published_builder_showcases"
  ON public.build_showcases
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.builders
      WHERE builders.id = build_showcases.builder_id
        AND builders.published = true
    )
  );
