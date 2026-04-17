/**
 * Shared platform + service taxonomy used by the builder dashboard and the
 * public profile pages. Centralized here so a rename in one place affects
 * both the editor chips and the grouped section headers on the profile.
 */

export const PLATFORM_GROUPS: { label: string; platforms: string[] }[] = [
  {
    label: "Most common",
    platforms: ["Sprinter", "ProMaster", "Transit"],
  },
  {
    label: "Full-size American vans",
    platforms: [
      "Chevy Express",
      "Ford E-Series",
      "Chevy/GMC Van",
      "Nissan NV",
      "Dodge Ram Van",
    ],
  },
  {
    label: "Vintage & European",
    platforms: [
      "VW Vanagon/Westfalia",
      "VW Transporter",
      "VW ID.Buzz",
      "Toyota HiAce",
    ],
  },
  {
    label: "Non-van chassis",
    platforms: [
      "Class B RV",
      "Cargo Trailer",
      "Box Truck",
      "School Bus/Skoolie",
    ],
  },
  {
    label: "Other",
    platforms: ["Other"],
  },
];

export const SERVICE_GROUPS: { label: string; services: string[] }[] = [
  {
    label: "Power & climate",
    services: [
      "Electrical / wiring",
      "Solar",
      "Heating",
      "Ventilation & A/C",
    ],
  },
  {
    label: "Water",
    services: ["Plumbing & water systems", "Shower install"],
  },
  {
    label: "Interior",
    services: [
      "Insulation & soundproofing",
      "Cabinetry & millwork",
      "Beds & layout",
      "Flooring",
      "Seat installation / swivels",
    ],
  },
  {
    label: "Exterior",
    services: [
      "Window installation",
      "Roof rack & awning",
      "Pop-top / roof conversion",
      "Exterior add-ons",
    ],
  },
  {
    label: "Off-road",
    services: ["4x4 conversion", "Lift kits & suspension"],
  },
  {
    label: "Service & repair",
    services: [
      "Vehicle maintenance",
      "Electrical diagnostics & repair",
      "Plumbing repair",
      "HVAC service",
    ],
  },
  {
    label: "Other",
    services: ["Full custom builds"],
  },
];

/**
 * Bucket a shop's raw services array into the groups above for rendering.
 * Preserves the group order defined in SERVICE_GROUPS, drops any group with
 * no matches, and catches legacy scraped tags (e.g. "Build consultation",
 * "DIY kits", "Used van sales") under a trailing "Other" bucket so they
 * still show on the profile page instead of disappearing silently.
 */
export function groupServices(
  values: string[],
): { label: string; services: string[] }[] {
  if (!values || values.length === 0) return [];
  const known = new Set(SERVICE_GROUPS.flatMap((g) => g.services));
  const byGroup: { label: string; services: string[] }[] = [];

  for (const group of SERVICE_GROUPS) {
    const present = group.services.filter((s) => values.includes(s));
    if (present.length > 0) {
      byGroup.push({ label: group.label, services: present });
    }
  }

  const legacy = values.filter((v) => !known.has(v));
  if (legacy.length > 0) {
    // Merge legacy tags into the existing "Other" group if present, otherwise
    // append a new "Other" section. Avoids two "Other" headings in a row.
    const otherIdx = byGroup.findIndex((g) => g.label === "Other");
    if (otherIdx >= 0) {
      byGroup[otherIdx].services = [...byGroup[otherIdx].services, ...legacy];
    } else {
      byGroup.push({ label: "Other", services: legacy });
    }
  }

  return byGroup;
}
