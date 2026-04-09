import { stateToSlug, type Builder } from "./supabase";

/**
 * SEO helpers for the Van Builder Directory.
 * Generates meta titles, descriptions, and structured data.
 */

// ---------------------------------------------------------------------------
// Meta title/description templates
// ---------------------------------------------------------------------------

export function profileMeta(builder: Builder) {
  const location = builder.city
    ? `${builder.city}, ${builder.state}`
    : builder.state;
  return {
    title: `${builder.name} — Van Conversion Builder in ${location} | The Van Guide`,
    description:
      builder.description?.slice(0, 155) ??
      `${builder.name} is a van conversion shop in ${location}. View services, pricing, reviews, and contact info.`,
  };
}

export function stateMeta(stateName: string, count: number) {
  return {
    title: `Van Conversion Builders in ${stateName} | The Van Guide`,
    description: `Browse ${count || ""} custom van conversion ${count === 1 ? "shop" : "shops"} in ${stateName}. Compare platforms, pricing, reviews, and services.`.replace(
      "  ",
      " ",
    ),
  };
}

export function cityMeta(city: string, stateName: string, count: number) {
  return {
    title: `Van Conversion Builders in ${city}, ${stateName} | The Van Guide`,
    description: `${count || "Find"} van conversion ${count === 1 ? "builder" : "builders"} in ${city}, ${stateName}. Compare services, pricing, and reviews.`.replace(
      "  ",
      " ",
    ),
  };
}

export function platformMeta(platform: string, count: number) {
  return {
    title: `${platform} Van Conversion Builders | The Van Guide`,
    description: `${count || "Browse"} van conversion shops that build on the ${platform} platform. Compare builders by location, pricing, and services.`.replace(
      "  ",
      " ",
    ),
  };
}

export function tierMeta(tier: string, count: number) {
  return {
    title: `${tier} Van Conversion Builders | The Van Guide`,
    description: `${count || "Browse"} ${tier.toLowerCase()}-tier van conversion builders across the US. Compare services, locations, and reviews.`.replace(
      "  ",
      " ",
    ),
  };
}

export function serviceMeta(service: string, count: number) {
  return {
    title: `${service} Van Builders | The Van Guide`,
    description: `${count || "Find"} van conversion builders offering ${service.toLowerCase()} services. Compare shops across the US.`.replace(
      "  ",
      " ",
    ),
  };
}

export function styleMeta(style: string, count: number) {
  return {
    title: `${style} Van Conversion Builders | The Van Guide`,
    description: `${count || "Browse"} ${style.toLowerCase()} van conversion builders across the US. Compare pricing, services, and reviews.`.replace(
      "  ",
      " ",
    ),
  };
}

export function serviceShopProfileMeta(shop: Builder) {
  const location = shop.city ? `${shop.city}, ${shop.state}` : shop.state;
  // Prefer service-side copy when a dual-tagged shop has filled it in.
  const copy = shop.service_description ?? shop.description ?? null;
  return {
    title: `${shop.name} — Van Repair & Service in ${location} | The Van Guide`,
    description:
      copy?.slice(0, 155) ??
      `${shop.name} is a van repair and service shop in ${location}. View services, reviews, and contact info.`,
  };
}

export function serviceShopStateMeta(stateName: string, count: number) {
  return {
    title: `Van Repair & Service Shops in ${stateName} | The Van Guide`,
    description: `Browse ${count || ""} van repair and service ${count === 1 ? "shop" : "shops"} in ${stateName}. Find Sprinter specialists, mobile installers, and upgrade shops.`.replace(
      "  ",
      " ",
    ),
  };
}

// ---------------------------------------------------------------------------
// LocalBusiness JSON-LD
// ---------------------------------------------------------------------------

/**
 * LocalBusiness JSON-LD for a profile page. `side` controls which fields
 * are used for dual-tagged shops that have filled in both builder and
 * service content: the service profile emits service_description /
 * service_phone, while the builder profile uses the default fields.
 */
export function localBusinessJsonLd(
  builder: Builder,
  _siteUrl?: string,
  side: "builder" | "service" = "builder",
) {
  const useServiceSide = side === "service";
  const description = useServiceSide
    ? (builder.service_description ?? builder.description)
    : builder.description;
  const phone = useServiceSide
    ? (builder.service_phone ?? builder.phone)
    : builder.phone;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: builder.name,
    url: builder.website ?? undefined,
    description: description ?? undefined,
    image: builder.logo_url ?? undefined,
    address: {
      "@type": "PostalAddress",
      ...(builder.street && { streetAddress: builder.street }),
      ...(builder.city && { addressLocality: builder.city }),
      addressRegion: builder.state,
      ...(builder.postal_code && { postalCode: builder.postal_code }),
      addressCountry: "US",
    },
  };

  if (phone) {
    jsonLd.telephone = phone;
  }

  if (builder.latitude != null && builder.longitude != null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: builder.latitude,
      longitude: builder.longitude,
    };
  }

  if (builder.review_rating != null && builder.review_count != null && builder.review_count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: builder.review_rating,
      reviewCount: builder.review_count,
      bestRating: 5,
    };
  }

  return jsonLd;
}

// ---------------------------------------------------------------------------
// ItemList JSON-LD — for directory listing pages (state, city, platform, etc.)
// ---------------------------------------------------------------------------

interface ItemListBuilder {
  name: string;
  slug: string;
  state: string;
  primary_category?: "builder" | "service" | null;
  category?: "builder" | "service" | null;
  categories?: ("builder" | "service")[] | null;
  service_description?: string | null;
}

/**
 * Resolve the profile URL for a shop in a given listing context. Dual-
 * profile aware:
 *   - If the listing is /services/ and the shop has a filled service
 *     profile, use /services/[state]/[slug]/.
 *   - If the shop only has a builder profile, fall back to /builders/
 *     (cross-directory) even when listed under /services/.
 * Duplicates the logic in `getShopProfileUrl` from supabase.ts to avoid
 * pulling that module's env-dependent imports into JSON-LD generation.
 */
function resolveProfileUrl(
  b: ItemListBuilder,
  siteUrl: string,
  listingBase: "builders" | "services",
): string {
  const primary = b.primary_category ?? b.category ?? "builder";
  const categories =
    b.categories && b.categories.length > 0
      ? b.categories
      : b.category
        ? [b.category]
        : [];
  const hasBuilder =
    categories.includes("builder") && (primary === "builder" || primary == null);
  const hasService =
    categories.includes("service") &&
    (primary === "service" ||
      (b.service_description != null && b.service_description !== ""));

  const state = stateToSlug(b.state);
  if (listingBase === "services" && hasService) {
    return `${siteUrl}/services/${state}/${b.slug}/`;
  }
  if (listingBase === "builders" && hasBuilder) {
    return `${siteUrl}/builders/${state}/${b.slug}/`;
  }
  if (hasBuilder) return `${siteUrl}/builders/${state}/${b.slug}/`;
  if (hasService) return `${siteUrl}/services/${state}/${b.slug}/`;
  // Last resort: legacy primary_category fallback.
  const base = primary === "service" ? "services" : "builders";
  return `${siteUrl}/${base}/${state}/${b.slug}/`;
}

/**
 * Generates an ItemList schema for a builder directory listing page.
 * Each builder becomes a ListItem linked to its profile URL — for dual-
 * tagged shops with a service-side profile, the link still points to the
 * builder profile here (we're in the builder directory).
 */
export function itemListJsonLd(
  builders: ItemListBuilder[],
  listName: string,
  siteUrl = "https://thevanguide.com",
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: builders.length,
    itemListElement: builders.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      url: resolveProfileUrl(b, siteUrl, "builders"),
    })),
  };
}

/**
 * Generates an ItemList schema for the services directory.
 * Each shop links to its service profile URL if one exists; dual-tagged
 * shops without distinct service content fall back cross-directory to
 * their builder profile so the listing never links to a 404.
 */
export function serviceItemListJsonLd(
  shops: ItemListBuilder[],
  listName: string,
  siteUrl = "https://thevanguide.com",
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: shops.length,
    itemListElement: shops.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      url: resolveProfileUrl(b, siteUrl, "services"),
    })),
  };
}

// ---------------------------------------------------------------------------
// FAQPage JSON-LD
// ---------------------------------------------------------------------------

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Generates a FAQPage schema from question/answer pairs.
 */
export function faqPageJsonLd(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
