import React from "react";

interface BuilderCardProps {
  name: string;
  slug: string;
  state: string;
  city?: string;
  tagline?: string;
  platforms: string[];
  priceTier?: string;
  description?: string;
  logoUrl?: string;
  verified: boolean;
  reviewRating?: number;
  reviewCount?: number;
  website?: string;
}

function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, "-");
}

function toUrlSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[/\\&]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const empty = 5 - full - (half ? 1 : 0);
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

export default function BuilderCardReact({
  name,
  slug,
  state,
  city,
  tagline,
  platforms,
  priceTier,
  description,
  logoUrl,
  verified,
  reviewRating,
  reviewCount,
  website,
}: BuilderCardProps) {
  const stateSlug = stateToSlug(state);
  const profileHref = `/builders/${stateSlug}/${slug}/`;

  return (
    <div
      className="flex flex-col p-4 sm:p-5 border transition-all hover:shadow-md"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <a href={profileHref} className="no-underline flex items-start gap-3 sm:gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className="w-14 h-14 object-contain rounded shrink-0 p-1.5 border"
            style={{ background: "#e8e8e8", borderColor: "var(--color-border)" }}
            loading="lazy"
          />
        ) : (
          <div
            className="w-14 h-14 flex items-center justify-center rounded shrink-0 border"
            style={{
              background: "var(--color-bg-alt)",
              borderColor: "var(--color-border)",
            }}
          >
            <img src="/images/van-icon.svg" alt="" className="w-9 h-9 opacity-30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-lg leading-tight truncate"
              style={{ color: "var(--color-text)", fontFamily: "var(--font-display)", fontWeight: 600 }}
            >
              {name}
            </h3>
            {verified && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-bg)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Verified
              </span>
            )}
          </div>
          <div
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
          >
            {city ? `${city}, ${state}` : state}
          </div>
          {tagline && (
            <p
              className="mt-1.5 text-sm leading-snug line-clamp-2"
              style={{ color: "var(--color-text)" }}
            >
              {tagline}
            </p>
          )}
        </div>
      </a>

      {/* Review stars */}
      {reviewRating != null && reviewRating > 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm" style={{ fontFamily: "var(--font-sans)" }}>
          <span style={{ color: "var(--color-accent)" }}>{renderStars(reviewRating)}</span>
          <span style={{ color: "var(--color-text-muted)" }}>
            {reviewRating.toFixed(1)}
            {reviewCount != null && reviewCount > 0 && ` (${reviewCount})`}
          </span>
        </div>
      )}

      {/* Badges */}
      {(platforms.length > 0 || priceTier) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {platforms.map((p) => (
            <a
              key={p}
              href={`/builders/platform/${toUrlSlug(p)}/`}
              className="text-[11px] px-2 py-0.5 rounded-full border no-underline transition-colors hover:border-current"
              style={{
                borderColor: "var(--color-border-strong)",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {p}
            </a>
          ))}
          {priceTier && priceTier !== "Unknown" && (
            <a
              href={`/builders/tier/${priceTier.toLowerCase()}/`}
              className="text-[11px] px-2 py-0.5 rounded-full no-underline transition-colors"
              style={{
                background: "var(--color-bg-alt)",
                color: "var(--color-primary)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {priceTier === "Budget" ? "$ Budget" : priceTier === "Mid" ? "$$ Mid-range" : priceTier === "Premium" ? "$$$ Premium" : priceTier === "Luxury" ? "$$$$ Luxury" : priceTier}
            </a>
          )}
        </div>
      )}

      {/* Description fallback */}
      {!tagline && description && (
        <p
          className="mt-3 text-sm leading-relaxed line-clamp-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          {description}
        </p>
      )}

      {/* CTAs */}
      <div className="mt-auto pt-3 sm:pt-4 flex flex-col sm:flex-row gap-2">
        <a href={profileHref} className="btn btn-ghost text-sm flex-1 text-center" style={{ padding: "0.375rem 0.75rem" }}>
          View Profile
        </a>
        {website && (
          <a
            href={website}
            className="btn btn-primary text-sm flex-1 text-center"
            style={{ padding: "0.375rem 0.75rem" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit Website
          </a>
        )}
      </div>
    </div>
  );
}
