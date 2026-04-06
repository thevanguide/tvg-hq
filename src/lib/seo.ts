import type { Builder } from "./supabase";

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

// ---------------------------------------------------------------------------
// LocalBusiness JSON-LD
// ---------------------------------------------------------------------------

export function localBusinessJsonLd(builder: Builder, siteUrl: string) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: builder.name,
    url: builder.website ?? undefined,
    description: builder.description ?? undefined,
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

  if (builder.phone) {
    jsonLd.telephone = builder.phone;
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
