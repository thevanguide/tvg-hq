-- ============================================================================
-- 2026-04-17 — Normalize platforms + services taxonomies
-- ----------------------------------------------------------------------------
-- Data migration applied via Supabase MCP on 2026-04-17 when the new dashboard
-- chip selectors went in. The scraper historically wrote long-form platform
-- names ("Mercedes Sprinter") and loosely-worded service labels ("Cabinetry/
-- interior", "Heating (diesel/propane)"); the dashboard now emits a fixed
-- short-form taxonomy. Without this remap, every builder's first save from
-- the new dashboard would have looked like a full-content rewrite in the
-- builder_edits audit log.
--
-- File exists for traceability — the UPDATE was already applied when this
-- file was checked in, so re-running it is idempotent but unnecessary. Also
-- bumped storage bucket size limits in the same migration window:
--   builder-photos: 5 MB → 10 MB
--   builder-logos:  2 MB → 5 MB
-- ============================================================================

UPDATE builders
SET services = (SELECT ARRAY(
    SELECT DISTINCT
      CASE s
        WHEN 'Full custom build' THEN 'Full custom builds'
        WHEN 'Electrical system' THEN 'Electrical / wiring'
        WHEN 'Lithium battery install' THEN 'Electrical / wiring'
        WHEN 'Dual battery install' THEN 'Electrical / wiring'
        WHEN 'Cabinetry/interior' THEN 'Cabinetry & millwork'
        WHEN 'Kitchen install' THEN 'Cabinetry & millwork'
        WHEN 'Plumbing/water' THEN 'Plumbing & water systems'
        WHEN 'Solar installation' THEN 'Solar'
        WHEN 'Solar install' THEN 'Solar'
        WHEN 'HVAC/heating' THEN 'Heating'
        WHEN 'Heating (diesel/propane)' THEN 'Heating'
        WHEN 'Air conditioning' THEN 'Ventilation & A/C'
        WHEN 'Suspension/lift' THEN 'Lift kits & suspension'
        WHEN 'Lift kit' THEN 'Lift kits & suspension'
        WHEN 'Insulation' THEN 'Insulation & soundproofing'
        WHEN 'Bed platform' THEN 'Beds & layout'
        WHEN 'Window install' THEN 'Window installation'
        WHEN 'Roof rack' THEN 'Roof rack & awning'
        WHEN 'Awning install' THEN 'Roof rack & awning'
        WHEN 'Roof raise/pop-top' THEN 'Pop-top / roof conversion'
        WHEN 'Pop-top install' THEN 'Pop-top / roof conversion'
        WHEN 'Exterior Upgrades' THEN 'Exterior add-ons'
        WHEN 'Repairs/service' THEN 'Vehicle maintenance'
        ELSE s  -- legacy tags not in the new taxonomy (Build consultation,
                -- DIY kits, Used van sales, etc.) are preserved as-is. The
                -- dashboard loads these into state and keeps them through
                -- save, even though there's no checkbox UI for them.
      END
    FROM unnest(services) AS s
  ))
WHERE services IS NOT NULL AND cardinality(services) > 0;

UPDATE builders
SET platforms = (SELECT ARRAY(
    SELECT DISTINCT
      CASE p
        WHEN 'Mercedes Sprinter' THEN 'Sprinter'
        WHEN 'Ram ProMaster' THEN 'ProMaster'
        WHEN 'Ford Transit' THEN 'Transit'
        ELSE p
      END
    FROM unnest(platforms) AS p
  ))
WHERE platforms IS NOT NULL AND cardinality(platforms) > 0;

-- Bucket size bumps so phone photos upload without hitting the wall before
-- client-side downscale has a chance to run.
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'builder-photos';
UPDATE storage.buckets SET file_size_limit = 5242880  WHERE id = 'builder-logos';
