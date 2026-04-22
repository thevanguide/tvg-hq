-- P2 PR 3: services taxonomy cleanup.
-- Rewrites the `services` array on every builder row into a clean 6-bucket
-- systems taxonomy, and merges business-model values into `engagement_types`
-- where P2 PR 1 moved them to.
--
-- Mapping rules (applied against each element of the current services array):
--   Business-model → move to engagement_types (merged with any existing values):
--     Rental                                 → rentals
--     Parts, DIY kits                        → parts_kits
--     Repair, Service, Vehicle maintenance   → service_repair
--     Full custom builds, Builds, Partial upfit → new_build
--
--   Systems → keep in services as consolidated bucket name:
--     Electrical / wiring
--     Solar
--     Electrical diagnostics & repair        } → Electrical / solar
--
--     Plumbing & water systems
--     Shower install
--     Plumbing repair                        } → Plumbing & water
--
--     Heating
--     Ventilation & A/C
--     HVAC service                           } → HVAC / climate
--
--     Cabinetry & millwork
--     Beds & layout
--     Flooring
--     Seat installation / swivels
--     Storage                                } → Cabinetry, interior & layout
--
--     4x4 conversion
--     Lift kits & suspension                 } → Suspension / 4x4 / off-road
--
--     Window installation
--     Pop-top / roof conversion
--     Roof rack & awning
--     Exterior add-ons                       } → Roof & exterior
--
--   Dropped entirely (low signal, redundant, or covered by another field):
--     Build consultation, Consulting, Used van sales, New van sales,
--     Commercial fleet, Commercial Van Upfitting, Off-grid package,
--     Insulation & soundproofing, Wheelchair accessible
--
-- Owners can re-add any bucket they consider missing via the dashboard.
-- Lifecycle nudges encourage claimed shops with empty services to fill them in.

UPDATE public.builders SET
  services = COALESCE(
    (
      SELECT array_agg(DISTINCT new_val ORDER BY new_val)
      FROM (
        SELECT CASE old_val
          WHEN 'Electrical / wiring'              THEN 'Electrical / solar'
          WHEN 'Solar'                            THEN 'Electrical / solar'
          WHEN 'Electrical diagnostics & repair'  THEN 'Electrical / solar'
          WHEN 'Plumbing & water systems'         THEN 'Plumbing & water'
          WHEN 'Shower install'                   THEN 'Plumbing & water'
          WHEN 'Plumbing repair'                  THEN 'Plumbing & water'
          WHEN 'Heating'                          THEN 'HVAC / climate'
          WHEN 'Ventilation & A/C'                THEN 'HVAC / climate'
          WHEN 'HVAC service'                     THEN 'HVAC / climate'
          WHEN 'Cabinetry & millwork'             THEN 'Cabinetry, interior & layout'
          WHEN 'Beds & layout'                    THEN 'Cabinetry, interior & layout'
          WHEN 'Flooring'                         THEN 'Cabinetry, interior & layout'
          WHEN 'Seat installation / swivels'      THEN 'Cabinetry, interior & layout'
          WHEN 'Storage'                          THEN 'Cabinetry, interior & layout'
          WHEN '4x4 conversion'                   THEN 'Suspension / 4x4 / off-road'
          WHEN 'Lift kits & suspension'           THEN 'Suspension / 4x4 / off-road'
          WHEN 'Window installation'              THEN 'Roof & exterior'
          WHEN 'Pop-top / roof conversion'        THEN 'Roof & exterior'
          WHEN 'Roof rack & awning'               THEN 'Roof & exterior'
          WHEN 'Exterior add-ons'                 THEN 'Roof & exterior'
          ELSE NULL
        END AS new_val
        FROM unnest(services) AS old_val
      ) mapped
      WHERE new_val IS NOT NULL
    ),
    ARRAY[]::text[]
  ),
  engagement_types = (
    SELECT ARRAY(
      SELECT DISTINCT e
      FROM unnest(
        COALESCE(engagement_types, ARRAY[]::text[])
        || COALESCE(
          (
            SELECT array_agg(new_val)
            FROM (
              SELECT CASE old_val
                WHEN 'Rental'              THEN 'rentals'
                WHEN 'Parts'               THEN 'parts_kits'
                WHEN 'DIY kits'            THEN 'parts_kits'
                WHEN 'Repair'              THEN 'service_repair'
                WHEN 'Service'             THEN 'service_repair'
                WHEN 'Vehicle maintenance' THEN 'service_repair'
                WHEN 'Full custom builds'  THEN 'new_build'
                WHEN 'Builds'              THEN 'new_build'
                WHEN 'Partial upfit'       THEN 'new_build'
                ELSE NULL
              END AS new_val
              FROM unnest(services) AS old_val
            ) em
            WHERE new_val IS NOT NULL
          ),
          ARRAY[]::text[]
        )
      ) AS e
      ORDER BY e
    )
  ),
  updated_at = now()
WHERE services IS NOT NULL;

-- Normalize empty engagement_types arrays to NULL so the filter logic
-- ("unfilled profiles hidden when filter is active") behaves consistently.
UPDATE public.builders SET engagement_types = NULL
  WHERE engagement_types IS NOT NULL AND cardinality(engagement_types) = 0;
