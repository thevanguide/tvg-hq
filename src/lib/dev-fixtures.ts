import type { Builder } from "./supabase";

/**
 * Local-only development fixtures for validating the dual-profile
 * architecture without touching production data.
 *
 * HOW TO USE:
 *   Set TVG_DEV_FIXTURES=1 when running the build, e.g.:
 *     TVG_DEV_FIXTURES=1 npm run build
 *
 * HOW IT WORKS:
 *   Each entry matches a published shop by id and layers `override` fields
 *   on top of the real DB row at build time. This lets us test dual-tagging,
 *   split content, and distinct service-side contact info using real listing
 *   data (logo, address, reviews, etc.) without mutating the database.
 *
 * WHEN TO DELETE:
 *   Once the architecture lands and the real DB columns are populated,
 *   this file and the `applyDevFixtures` helper in supabase.ts should be
 *   removed. Leaving it in place indefinitely is a liability — every future
 *   edit to a fixtured shop has to remember the override.
 *
 * SAFETY:
 *   Production builds deliberately never set TVG_DEV_FIXTURES, so these
 *   overrides cannot leak into the live site. Do not wire this flag into
 *   any deploy workflow.
 */

interface FixtureOverride {
  id: string;
  override: Partial<Builder>;
}

export const DEV_FIXTURE_OVERRIDES: FixtureOverride[] = [
  // Costa Mesa-based shop used as the dual-profile test case.
  // Tags the row with both categories and layers distinct service-side
  // content on top of the real builder-side row.
  {
    id: "be2feefc-23fd-409f-8a01-2b4432904f6d",
    override: {
      categories: ["builder", "service"],
      service_tagline:
        "Electrical, solar, and off-grid diagnostics for existing vans",
      service_description:
        "Separate from our full-build workflow, we run a small service bench for owners of existing vans who need electrical diagnostics, solar or inverter additions, house-battery swaps, or off-grid system troubleshooting. Work is by appointment only and scheduled around active builds. If your van has a power problem you can't trace, send a message with photos of the affected gear and a description of what's happening.",
      service_emails: ["service@emerycustombuilds.com"],
      service_phone: "(714) 257-5446",
    },
  },
];
