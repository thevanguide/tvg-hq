import { useState, useMemo, useEffect, useCallback } from "react";
import BuilderCardReact from "./BuilderCardReact";

// Minimal Builder shape for the search island (matches serialized props)
interface BuilderData {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  tagline: string | null;
  platforms: string[];
  services: string[];
  price_tier: string | null;
  description: string | null;
  logo_url: string | null;
  verified: boolean;
  review_rating: number | null;
  review_count: number | null;
  website: string | null;
  year_founded: number | null;
  build_style: string | null;
}

interface Props {
  builders: BuilderData[];
}

type SortOption = "rating" | "reviews" | "alpha" | "newest";

export default function BuilderSearch({ builders }: Props) {
  // Read initial state from URL params
  const getInitialParams = () => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  };

  const initParams = getInitialParams();

  const [query, setQuery] = useState(initParams.get("q") ?? "");
  const [selectedState, setSelectedState] = useState(initParams.get("state") ?? "");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    () => new Set(initParams.getAll("platform")),
  );
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(
    () => new Set(initParams.getAll("tier")),
  );
  const [selectedStyle, setSelectedStyle] = useState(initParams.get("style") ?? "");
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    () => new Set(initParams.getAll("service")),
  );
  const [sort, setSort] = useState<SortOption>(
    (initParams.get("sort") as SortOption) || "rating",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Derive filter options from data
  const states = useMemo(() => {
    const s = new Set(builders.map((b) => b.state));
    return [...s].sort();
  }, [builders]);

  const allPlatforms = useMemo(() => {
    const s = new Set<string>();
    builders.forEach((b) => b.platforms.forEach((p) => s.add(p)));
    return [...s].sort();
  }, [builders]);

  const allTiers = ["Budget", "Mid", "Premium", "Luxury"];

  const topServices = useMemo(() => {
    const counts = new Map<string, number>();
    builders.forEach((b) =>
      b.services.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)),
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([s]) => s);
  }, [builders]);

  // Update URL params
  const updateUrl = useCallback(
    (
      q: string,
      state: string,
      platforms: Set<string>,
      tiers: Set<string>,
      style: string,
      services: Set<string>,
      sortVal: SortOption,
    ) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (state) params.set("state", state);
      platforms.forEach((p) => params.append("platform", p));
      tiers.forEach((t) => params.append("tier", t));
      if (style) params.set("style", style);
      services.forEach((s) => params.append("service", s));
      if (sortVal !== "rating") params.set("sort", sortVal);
      const qs = params.toString();
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [],
  );

  useEffect(() => {
    updateUrl(query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, sort);
  }, [query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, sort, updateUrl]);

  // Filter + sort
  const results = useMemo(() => {
    let filtered = builders;

    // Text search
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.city && b.city.toLowerCase().includes(q)) ||
          (b.tagline && b.tagline.toLowerCase().includes(q)) ||
          (b.description && b.description.toLowerCase().includes(q)),
      );
    }

    // State
    if (selectedState) {
      filtered = filtered.filter((b) => b.state === selectedState);
    }

    // Platforms
    if (selectedPlatforms.size > 0) {
      filtered = filtered.filter((b) =>
        b.platforms.some((p) => selectedPlatforms.has(p)),
      );
    }

    // Tiers
    if (selectedTiers.size > 0) {
      filtered = filtered.filter(
        (b) => b.price_tier && selectedTiers.has(b.price_tier),
      );
    }

    // Style
    if (selectedStyle) {
      filtered = filtered.filter(
        (b) => b.build_style && b.build_style.toLowerCase() === selectedStyle.toLowerCase(),
      );
    }

    // Services
    if (selectedServices.size > 0) {
      filtered = filtered.filter((b) =>
        b.services.some((s) => selectedServices.has(s)),
      );
    }

    // Sort
    const sorted = [...filtered];
    switch (sort) {
      case "rating":
        sorted.sort((a, b) => {
          const rA = a.review_rating ?? 0;
          const rB = b.review_rating ?? 0;
          if (rB !== rA) return rB - rA;
          return (b.review_count ?? 0) - (a.review_count ?? 0);
        });
        break;
      case "reviews":
        sorted.sort((a, b) => (b.review_count ?? 0) - (a.review_count ?? 0));
        break;
      case "alpha":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
        sorted.sort((a, b) => (b.year_founded ?? 0) - (a.year_founded ?? 0));
        break;
    }

    return sorted;
  }, [builders, query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, sort]);

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const hasActiveFilters =
    query || selectedState || selectedPlatforms.size > 0 || selectedTiers.size > 0 || selectedStyle || selectedServices.size > 0;

  function clearAll() {
    setQuery("");
    setSelectedState("");
    setSelectedPlatforms(new Set());
    setSelectedTiers(new Set());
    setSelectedStyle("");
    setSelectedServices(new Set());
    setSort("rating");
  }

  return (
    <div className="mb-10">
      {/* Search bar + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search builders by name, city, or keyword..."
            className="w-full px-4 py-2.5 text-sm border rounded-md outline-none"
            style={{
              borderColor: "var(--color-border-strong)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="px-4 py-2.5 text-sm border rounded-md cursor-pointer"
            style={{
              borderColor: "var(--color-border-strong)",
              background: filtersOpen ? "var(--color-primary)" : "var(--color-bg)",
              color: filtersOpen ? "#fff" : "var(--color-text)",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
            }}
          >
            Filters {hasActiveFilters ? "●" : ""}
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2.5 text-sm border rounded-md cursor-pointer"
            style={{
              borderColor: "var(--color-border-strong)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
            }}
          >
            <option value="rating">Highest rated</option>
            <option value="reviews">Most reviewed</option>
            <option value="alpha">Alphabetical</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div
          className="p-5 mb-6 border rounded-lg grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          {/* State */}
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
            >
              State
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md"
              style={{
                borderColor: "var(--color-border-strong)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                fontFamily: "var(--font-sans)",
              }}
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Platforms */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
            >
              Platform
            </div>
            <div className="space-y-1.5">
              {allPlatforms.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(p)}
                    onChange={() => setSelectedPlatforms(toggleSet(selectedPlatforms, p))}
                    className="accent-current"
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Price tier */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
            >
              Price range
            </div>
            <div className="space-y-1.5">
              {allTiers.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTiers.has(t)}
                    onChange={() => setSelectedTiers(toggleSet(selectedTiers, t))}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {/* Style + services */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
            >
              Build style
            </div>
            <div className="space-y-1.5 mb-4">
              {["Custom", "Standard"].map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}
                >
                  <input
                    type="radio"
                    name="style"
                    checked={selectedStyle === s}
                    onChange={() => setSelectedStyle(selectedStyle === s ? "" : s)}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  {s}
                </label>
              ))}
            </div>

            {topServices.length > 0 && (
              <>
                <div
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
                >
                  Services
                </div>
                <div className="space-y-1.5">
                  {topServices.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedServices.has(s)}
                        onChange={() => setSelectedServices(toggleSet(selectedServices, s))}
                        style={{ accentColor: "var(--color-primary)" }}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Clear all */}
          {hasActiveFilters && (
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                onClick={clearAll}
                className="text-sm underline cursor-pointer bg-transparent border-0"
                style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Result count */}
      <div
        className="text-sm mb-6"
        style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
      >
        {results.length === builders.length
          ? `${results.length} builders`
          : `${results.length} of ${builders.length} builders`}
      </div>

      {/* Results grid */}
      {results.length === 0 ? (
        <div
          className="p-10 text-center border border-dashed rounded-lg"
          style={{
            borderColor: "var(--color-border-strong)",
            background: "var(--color-surface)",
          }}
        >
          <p
            className="text-lg mb-2"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--color-text)" }}
          >
            No builders match your filters
          </p>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
          >
            Try broadening your search or removing some filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((b) => (
            <BuilderCardReact
              key={b.id}
              name={b.name}
              slug={b.slug}
              state={b.state}
              city={b.city ?? undefined}
              tagline={b.tagline ?? undefined}
              platforms={b.platforms}
              priceTier={b.price_tier ?? undefined}
              description={b.description ?? undefined}
              logoUrl={b.logo_url ?? undefined}
              verified={b.verified}
              reviewRating={b.review_rating ?? undefined}
              reviewCount={b.review_count ?? undefined}
              website={b.website ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
