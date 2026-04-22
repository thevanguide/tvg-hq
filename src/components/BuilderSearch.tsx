import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import BuilderCardReact from "./BuilderCardReact";
import BuilderMap from "./BuilderMap";

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
  latitude: number | null;
  longitude: number | null;
  // P1 filter fields. Nullable — unfilled profiles are excluded when a
  // matching filter is active, included when no filter is applied.
  starting_price?: number | null;
  conversion_types?: string[] | null;
  // P2 PR 1 filter fields. Same null-safe convention.
  engagement_types?: string[] | null;
  lead_time?: string | null;
  warranty_months?: number | null;
  /**
   * Pre-computed profile URL for this shop in the current listing context.
   * Parent Astro page calls getShopProfileUrl(shop, basePath) when building
   * the data array. Used for card links and map popup links.
   */
  profile_href?: string;
}

interface Props {
  builders: BuilderData[];
  basePath?: string;
}

type SortOption = "rating" | "reviews" | "alpha" | "newest" | "distance";
type ViewMode = "list" | "map";

// Haversine distance in miles
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function BuilderSearch({ builders, basePath = "/builders" }: Props) {
  // Directory context — drives the noun used in the search placeholder,
  // result counter, and empty state. Listing cards themselves stay neutral.
  const isServices = basePath === "/services";
  const nounSingular = isServices ? "shop" : "builder";
  const nounPlural = isServices ? "shops" : "builders";
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
  // P1 filters. maxPrice kept as string so the input can be empty; parsed
  // to int at filter time. selectedConversionTypes mirrors the tier/platform
  // Set pattern so URL param roundtripping stays consistent.
  const [maxPrice, setMaxPrice] = useState<string>(initParams.get("max_price") ?? "");
  const [selectedConversionTypes, setSelectedConversionTypes] = useState<Set<string>>(
    () => new Set(initParams.getAll("conversion")),
  );
  // P2 PR 1 filters. Engagement + lead time as multi-select Sets (same pattern
  // as platforms/conversion). Warranty is a simple on/off checkbox — "show me
  // shops that offer a warranty of any length".
  const [selectedEngagementTypes, setSelectedEngagementTypes] = useState<Set<string>>(
    () => new Set(initParams.getAll("engagement")),
  );
  const [selectedLeadTimes, setSelectedLeadTimes] = useState<Set<string>>(
    () => new Set(initParams.getAll("lead_time")),
  );
  const [warrantyOnly, setWarrantyOnly] = useState<boolean>(
    initParams.get("warranty") === "1",
  );
  const [sort, setSort] = useState<SortOption>(
    (initParams.get("sort") as SortOption) || "rating",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<ViewMode>("list");

  // Secondary filter drawer state. Auto-expands on mount if any secondary
  // filter is already active (e.g. from a ?style=bespoke URL) so users
  // coming in via a link see their active filter without extra clicks.
  const hasSecondaryFilterOnMount =
    !!initParams.get("style") ||
    initParams.getAll("service").length > 0 ||
    initParams.getAll("lead_time").length > 0 ||
    initParams.get("warranty") === "1" ||
    initParams.getAll("conversion").length > 0 ||
    initParams.getAll("tier").length > 0;
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(
    hasSecondaryFilterOnMount,
  );

  // Cross-highlighting state
  const [hoveredBuilderId, setHoveredBuilderId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Near Me state
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);

  // Track window width for responsive layout
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
      maxPriceVal: string,
      conversionTypes: Set<string>,
      engagementTypes: Set<string>,
      leadTimes: Set<string>,
      warrantyOnlyVal: boolean,
    ) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (state) params.set("state", state);
      platforms.forEach((p) => params.append("platform", p));
      tiers.forEach((t) => params.append("tier", t));
      if (style) params.set("style", style);
      services.forEach((s) => params.append("service", s));
      if (maxPriceVal) params.set("max_price", maxPriceVal);
      conversionTypes.forEach((c) => params.append("conversion", c));
      engagementTypes.forEach((e) => params.append("engagement", e));
      leadTimes.forEach((l) => params.append("lead_time", l));
      if (warrantyOnlyVal) params.set("warranty", "1");
      if (sortVal !== "rating") params.set("sort", sortVal);
      const qs = params.toString();
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [],
  );

  useEffect(() => {
    updateUrl(query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, sort, maxPrice, selectedConversionTypes, selectedEngagementTypes, selectedLeadTimes, warrantyOnly);
  }, [query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, sort, maxPrice, selectedConversionTypes, selectedEngagementTypes, selectedLeadTimes, warrantyOnly, updateUrl]);

  // Filter + sort
  const results = useMemo(() => {
    let filtered = builders;

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

    if (selectedState) {
      filtered = filtered.filter((b) => b.state === selectedState);
    }

    if (selectedPlatforms.size > 0) {
      filtered = filtered.filter((b) =>
        b.platforms.some((p) => selectedPlatforms.has(p)),
      );
    }

    if (selectedTiers.size > 0) {
      filtered = filtered.filter(
        (b) => b.price_tier && selectedTiers.has(b.price_tier),
      );
    }

    if (selectedStyle) {
      filtered = filtered.filter(
        (b) => b.build_style && b.build_style.toLowerCase() === selectedStyle.toLowerCase(),
      );
    }

    if (selectedServices.size > 0) {
      filtered = filtered.filter((b) =>
        b.services.some((s) => selectedServices.has(s)),
      );
    }

    // P1 filters. Profiles with unfilled price/conversion are excluded when
    // the respective filter is active — matches user expectation ("I asked
    // for conversion-only, don't show me shops that didn't answer").
    const maxPriceNum = maxPrice ? parseInt(maxPrice, 10) : null;
    if (maxPriceNum != null && !isNaN(maxPriceNum)) {
      filtered = filtered.filter(
        (b) => b.starting_price != null && b.starting_price <= maxPriceNum,
      );
    }

    if (selectedConversionTypes.size > 0) {
      filtered = filtered.filter(
        (b) =>
          b.conversion_types != null &&
          b.conversion_types.some((c) => selectedConversionTypes.has(c)),
      );
    }

    // P2 PR 1 filters. Same "hide profiles that didn't answer" rule as the P1
    // conversion filter — a customer asking for warranty work doesn't want to
    // see shops that never filled the field in.
    if (selectedEngagementTypes.size > 0) {
      filtered = filtered.filter(
        (b) =>
          b.engagement_types != null &&
          b.engagement_types.some((e) => selectedEngagementTypes.has(e)),
      );
    }

    if (selectedLeadTimes.size > 0) {
      filtered = filtered.filter(
        (b) => b.lead_time != null && selectedLeadTimes.has(b.lead_time),
      );
    }

    if (warrantyOnly) {
      filtered = filtered.filter(
        (b) => b.warranty_months != null && b.warranty_months > 0,
      );
    }

    const sorted = [...filtered];

    if (sort === "distance" && userLocation) {
      sorted.sort((a, b) => {
        const dA = a.latitude != null && a.longitude != null
          ? haversine(userLocation[0], userLocation[1], a.latitude, a.longitude)
          : Infinity;
        const dB = b.latitude != null && b.longitude != null
          ? haversine(userLocation[0], userLocation[1], b.latitude, b.longitude)
          : Infinity;
        return dA - dB;
      });
    } else {
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
    }

    return sorted;
  }, [builders, query, selectedState, selectedPlatforms, selectedTiers, selectedStyle, selectedServices, maxPrice, selectedConversionTypes, selectedEngagementTypes, selectedLeadTimes, warrantyOnly, sort, userLocation]);

  // Distances from user (for display on cards)
  const distances = useMemo(() => {
    if (!userLocation) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const b of results) {
      if (b.latitude != null && b.longitude != null) {
        map.set(b.id, haversine(userLocation[0], userLocation[1], b.latitude, b.longitude));
      }
    }
    return map;
  }, [results, userLocation]);

  // Map pins from filtered results
  const mapPins = useMemo(
    () =>
      results.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        state: b.state,
        city: b.city,
        latitude: b.latitude,
        longitude: b.longitude,
        review_rating: b.review_rating,
        review_count: b.review_count,
        profile_href: b.profile_href,
      })),
    [results],
  );

  // When a pin is hovered on the map, scroll the corresponding card into view (desktop only)
  const handlePinHover = useCallback(
    (id: string | null) => {
      setHoveredBuilderId(id);
      if (id && isDesktop) {
        const el = cardRefs.current.get(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    },
    [isDesktop],
  );

  // Near Me: get user location
  async function handleNearMe() {
    if (userLocation) {
      // Toggle off
      setUserLocation(null);
      if (sort === "distance") setSort("rating");
      return;
    }

    setLocatingUser(true);

    // Try browser geolocation first
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 300000,
          });
        });
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setSort("distance");
        setLocatingUser(false);
        return;
      } catch {
        // Fall through to IP geolocation
      }
    }

    // Fallback: IP-based geolocation
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          setUserLocation([data.latitude, data.longitude]);
          setSort("distance");
          setLocatingUser(false);
          return;
        }
      }
    } catch {
      // silently fail
    }

    setLocatingUser(false);
  }

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const hasActiveFilters =
    query || selectedState || selectedPlatforms.size > 0 || selectedTiers.size > 0 || selectedStyle || selectedServices.size > 0 || maxPrice || selectedConversionTypes.size > 0 || selectedEngagementTypes.size > 0 || selectedLeadTimes.size > 0 || warrantyOnly;

  function clearAll() {
    setQuery("");
    setSelectedState("");
    setSelectedPlatforms(new Set());
    setSelectedTiers(new Set());
    setSelectedStyle("");
    setSelectedServices(new Set());
    setMaxPrice("");
    setSelectedConversionTypes(new Set());
    setSelectedEngagementTypes(new Set());
    setSelectedLeadTimes(new Set());
    setWarrantyOnly(false);
    setSort("rating");
    setUserLocation(null);
  }

  // ---------- Shared UI ----------

  const searchBar = (
    <div className="flex flex-col gap-3 mb-4">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${nounPlural} by name, city, or keyword...`}
          className="w-full px-3 sm:px-4 py-2.5 text-sm border rounded-md outline-none"
          style={{
            borderColor: "var(--color-border-strong)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "var(--font-sans)",
          }}
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        {/* Near Me */}
        <button
          onClick={handleNearMe}
          disabled={locatingUser}
          className="px-3 py-2 text-xs sm:text-sm border rounded-md cursor-pointer"
          style={{
            borderColor: userLocation ? "var(--color-accent)" : "var(--color-border-strong)",
            background: userLocation ? "var(--color-accent)" : "var(--color-bg)",
            color: userLocation ? "#fff" : "var(--color-text)",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            opacity: locatingUser ? 0.6 : 1,
          }}
        >
          {locatingUser ? "Locating..." : userLocation ? "Near me ✕" : "Near me"}
        </button>

        {/* Mobile-only List/Map toggle */}
        {!isDesktop && (
          <div
            className="inline-flex rounded-md overflow-hidden border"
            style={{ borderColor: "var(--color-border-strong)" }}
          >
            <button
              onClick={() => setMobileView("list")}
              className="px-2.5 py-2 text-xs sm:text-sm cursor-pointer border-0"
              style={{
                background: mobileView === "list" ? "var(--color-primary)" : "var(--color-bg)",
                color: mobileView === "list" ? "#fff" : "var(--color-text)",
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
              }}
            >
              List
            </button>
            <button
              onClick={() => setMobileView("map")}
              className="px-2.5 py-2 text-xs sm:text-sm cursor-pointer border-0"
              style={{
                background: mobileView === "map" ? "var(--color-primary)" : "var(--color-bg)",
                color: mobileView === "map" ? "#fff" : "var(--color-text)",
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                borderLeft: "1px solid var(--color-border-strong)",
              }}
            >
              Map ({mapPins.filter((b) => b.latitude != null).length})
            </button>
          </div>
        )}
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="px-3 py-2 text-xs sm:text-sm border rounded-md cursor-pointer"
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
          className="px-2 sm:px-3 py-2 text-xs sm:text-sm border rounded-md cursor-pointer flex-1 sm:flex-none min-w-0"
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
          {userLocation && <option value="distance">Nearest</option>}
        </select>
      </div>
    </div>
  );

  // ----- Individual filter tiles (rendered into primary + secondary sections) -----
  // Each tile is a self-contained <div>. They used to be interleaved in a
  // single flat grid; now they're grouped so the 4 most-asked questions are
  // always visible and the rest sit behind a "More filters" disclosure.

  const stateTile = (
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
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );

  const platformTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Platform
      </div>
      <div className="space-y-1.5">
        {allPlatforms.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedPlatforms.has(p)}
              onChange={() => setSelectedPlatforms(toggleSet(selectedPlatforms, p))}
              style={{ accentColor: "var(--color-primary)" }} />
            {p}
          </label>
        ))}
      </div>
    </div>
  );

  const workOfferedTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        What you need
      </div>
      <div className="space-y-1.5">
        {[
          { value: "new_build", label: "New builds" },
          { value: "service_repair", label: "Service & repair" },
          { value: "warranty_work", label: "Warranty work" },
          { value: "rentals", label: "Rentals" },
          { value: "parts_kits", label: "Parts / DIY kits" },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedEngagementTypes.has(opt.value)}
              onChange={() => setSelectedEngagementTypes(toggleSet(selectedEngagementTypes, opt.value))}
              style={{ accentColor: "var(--color-primary)" }} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );

  const maxBudgetTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Max budget
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>$</span>
        <input
          type="number"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          min={5000}
          max={500000}
          step={5000}
          inputMode="numeric"
          placeholder="50000"
          className="w-full px-3 py-2 text-sm border rounded-md"
          style={{
            borderColor: "var(--color-border-strong)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "var(--font-sans)",
          }}
        />
      </div>
      <p
        className="text-xs mt-1.5"
        style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
      >
        Shops without a listed price are hidden.
      </p>
    </div>
  );

  const buildStyleTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Build style
      </div>
      <div className="space-y-1.5">
        {[
          { value: "", label: "Any" },
          { value: "bespoke", label: "Bespoke", desc: "One-of-one custom" },
          { value: "semi-custom", label: "Semi-custom", desc: "Template + chosen finishes" },
          { value: "production", label: "Production", desc: "Fixed floorplans" },
        ].map((opt) => (
          <label key={opt.value || "any"} className="flex items-start gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input
              type="radio"
              name="build-style-filter"
              checked={selectedStyle === opt.value}
              onChange={() => setSelectedStyle(opt.value)}
              className="mt-0.5 shrink-0"
              style={{ accentColor: "var(--color-primary)" }}
            />
            <span className="flex-1">
              <span className="block">{opt.label}</span>
              {opt.desc && (
                <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {opt.desc}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  const servicesTile = topServices.length > 0 ? (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Services
      </div>
      <div className="space-y-1.5">
        {topServices.map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedServices.has(s)}
              onChange={() => setSelectedServices(toggleSet(selectedServices, s))}
              style={{ accentColor: "var(--color-primary)" }} />
            {s}
          </label>
        ))}
      </div>
    </div>
  ) : null;

  const leadTimeTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Lead time
      </div>
      <div className="space-y-1.5">
        {[
          { value: "under_1_month", label: "Under 1 month" },
          { value: "1_to_3_months", label: "1–3 months" },
          { value: "3_to_6_months", label: "3–6 months" },
          { value: "6_months_plus", label: "6+ months" },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedLeadTimes.has(opt.value)}
              onChange={() => setSelectedLeadTimes(toggleSet(selectedLeadTimes, opt.value))}
              style={{ accentColor: "var(--color-primary)" }} />
            {opt.label}
          </label>
        ))}
      </div>
      <p
        className="text-xs mt-1.5"
        style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
      >
        Shops without a listed lead time are hidden.
      </p>
    </div>
  );

  const warrantyTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Warranty
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer"
        style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
        <input type="checkbox" checked={warrantyOnly}
          onChange={(e) => setWarrantyOnly(e.target.checked)}
          style={{ accentColor: "var(--color-primary)" }} />
        Offers a warranty
      </label>
    </div>
  );

  const conversionTypeTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Conversion type
      </div>
      <div className="space-y-1.5">
        {[
          { value: "conversion_only", label: "Conversion only" },
          { value: "full_build", label: "Turnkey (van + conversion)" },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedConversionTypes.has(opt.value)}
              onChange={() => setSelectedConversionTypes(toggleSet(selectedConversionTypes, opt.value))}
              style={{ accentColor: "var(--color-primary)" }} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );

  const priceTierTile = (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
      >
        Price range
      </div>
      <div className="space-y-1.5">
        {allTiers.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm cursor-pointer"
            style={{ fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={selectedTiers.has(t)}
              onChange={() => setSelectedTiers(toggleSet(selectedTiers, t))}
              style={{ accentColor: "var(--color-primary)" }} />
            {t}
          </label>
        ))}
      </div>
    </div>
  );

  const filterPanel = filtersOpen ? (
    <div
      className="p-4 sm:p-5 mb-6 border rounded-lg"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {/* Primary — the 4 axes customers use to narrow to a shortlist: where
          they are, which van chassis, the kind of work, and the budget. */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stateTile}
        {platformTile}
        {workOfferedTile}
        {maxBudgetTile}
      </div>

      {/* More filters toggle. Auto-expanded on mount if any secondary filter
          is already active (e.g. arriving via a ?style=bespoke link). */}
      <div className="mt-4 pt-4 border-t flex items-center gap-4"
        style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={() => setShowMoreFilters((v) => !v)}
          className="text-sm cursor-pointer bg-transparent border-0 p-0"
          style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)", fontWeight: 500 }}
        >
          {showMoreFilters ? "− Fewer filters" : "+ More filters"}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm underline cursor-pointer bg-transparent border-0 p-0"
            style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Secondary — refinement filters. Hidden by default; shows when the
          user expands the drawer or navigates in with any of these already set. */}
      {showMoreFilters && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {buildStyleTile}
          {servicesTile}
          {leadTimeTile}
          {warrantyTile}
          {conversionTypeTile}
          {priceTierTile}
        </div>
      )}
    </div>
  ) : null;

  const resultCount = (
    <div
      className="text-sm mb-4"
      style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
    >
      {results.length === builders.length
        ? `${results.length} ${nounPlural}`
        : `${results.length} of ${builders.length} ${nounPlural}`}
    </div>
  );

  // Card with hover linkage
  function renderCard(b: BuilderData) {
    const dist = distances.get(b.id);
    const isHovered = hoveredBuilderId === b.id;

    return (
      <div
        key={b.id}
        ref={(el) => {
          if (el) cardRefs.current.set(b.id, el);
          else cardRefs.current.delete(b.id);
        }}
        onMouseEnter={() => setHoveredBuilderId(b.id)}
        onMouseLeave={() => setHoveredBuilderId(null)}
        style={{
          position: "relative",
          transform: isHovered ? "scale(1.02)" : undefined,
          transition: "transform 0.15s, box-shadow 0.15s",
          boxShadow: isHovered ? "0 4px 16px rgba(0,0,0,0.12)" : undefined,
          borderRadius: "var(--radius-lg)",
        }}
      >
        {dist != null && (
          <div
            className="text-[11px] px-2 py-0.5 rounded-full"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "var(--color-primary)",
              color: "var(--color-bg)",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              zIndex: 1,
            }}
          >
            {dist < 1 ? "< 1 mi" : `${Math.round(dist)} mi`}
          </div>
        )}
        <BuilderCardReact
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
          basePath={basePath}
          profileHref={b.profile_href}
        />
      </div>
    );
  }

  const cardGrid = results.length === 0 ? (
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
        No {nounPlural} match your filters
      </p>
      <p
        className="text-sm"
        style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}
      >
        Try broadening your search or removing some filters.
      </p>
    </div>
  ) : (
    <div className={isDesktop ? "grid gap-4 grid-cols-1 xl:grid-cols-2" : "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}>
      {results.map(renderCard)}
    </div>
  );

  const mapView = (
    <BuilderMap
      builders={mapPins}
      highlightedId={hoveredBuilderId}
      onPinHover={handlePinHover}
      userLocation={userLocation}
    />
  );

  // ---------- Layout ----------

  if (isDesktop) {
    return (
      <div className="mb-10">
        {searchBar}
        {filterPanel}
        {resultCount}
        <div className="flex gap-6" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 60%", minWidth: 0 }}>
            {cardGrid}
          </div>
          <div
            style={{
              flex: "0 0 38%",
              position: "sticky",
              top: 16,
              alignSelf: "flex-start",
              height: "calc(100vh - 32px)",
              maxHeight: 800,
              minHeight: 400,
            }}
          >
            <div
              className="rounded-lg overflow-hidden"
              style={{ height: "100%", border: "1px solid var(--color-border)" }}
            >
              {mapView}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-10">
      {searchBar}
      {filterPanel}
      {resultCount}
      {mobileView === "list" ? cardGrid : (
        <div style={{ height: "60vh", minHeight: 300, maxHeight: 500 }}>
          {mapView}
        </div>
      )}
    </div>
  );
}
