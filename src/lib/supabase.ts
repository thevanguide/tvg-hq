import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for The Van Guide.
 *
 * Used at *build time* by Astro to pull builder records from the `builders`
 * table and generate static profile pages. Also safe to use in client-side
 * React islands with the anon key for read-only queries (search/filter UI).
 *
 * Required env vars (set in `.env` — see `.env.example`):
 *   - PUBLIC_SUPABASE_URL
 *   - PUBLIC_SUPABASE_ANON_KEY
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!_client) _client = createClient(url, anonKey);
  return _client;
}

// ---------------------------------------------------------------------------
// Builder type — matches the full 32-column Supabase `builders` schema
// ---------------------------------------------------------------------------

export type Builder = {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  street: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  emails: string[] | null;
  platforms: string[];
  services: string[];
  price_tier: "Budget" | "Mid" | "Premium" | "Luxury" | "Unknown" | null;
  price_evidence: string | null;
  year_founded: number | null;
  description: string | null;
  tagline: string | null;
  logo_url: string | null;
  gallery_urls: string[];
  build_style: "Custom" | "Standard" | null;
  /**
   * Legacy single-value category. Kept for rollback safety; new code should
   * use `categories` (array) and `primary_category` instead.
   */
  category: "builder" | "service" | null;
  /**
   * All categories this shop belongs in — e.g. ['builder'], ['service'], or
   * ['builder','service'] for shops that do both. Used to decide which
   * directory listing pages the shop appears on.
   */
  categories: ("builder" | "service")[];
  /**
   * The directory where the shop's canonical profile page lives. Used to
   * build cross-directory card links so every shop has exactly one profile
   * URL regardless of how many listings reference it.
   */
  primary_category: "builder" | "service" | null;
  place_id: string | null;
  google_maps_url: string | null;
  review_count: number | null;
  review_rating: number | null;
  quality_score: number | null;
  claimed: boolean;
  verified: boolean;
  published: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// State name <-> code lookup
// ---------------------------------------------------------------------------

export const stateNameToCode: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

export const stateCodeToName: Record<string, string> = Object.fromEntries(
  Object.entries(stateNameToCode).map(([name, code]) => [code, name]),
);

// ---------------------------------------------------------------------------
// URL slug helpers
// ---------------------------------------------------------------------------

/** Slugify any string for use in a URL segment. Handles slashes, ampersands, etc. */
export function toUrlSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[/\\&]+/g, "-")  // slashes and ampersands → hyphen
    .replace(/[^a-z0-9-]+/g, "-")  // anything else non-alphanumeric → hyphen
    .replace(/-{2,}/g, "-")  // collapse multiple hyphens
    .replace(/^-|-$/g, "");  // trim leading/trailing hyphens
}

export function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Return the canonical profile URL for a shop. A shop only ever has ONE
 * canonical URL, determined by its `primary_category`. If the shop is dual-
 * tagged, the *other* directory's listing page will still link here. This
 * avoids duplicate-content profiles at two different URLs.
 */
export function canonicalShopPath(shop: {
  slug: string;
  state: string;
  primary_category?: "builder" | "service" | null;
  category?: "builder" | "service" | null;
}): string {
  const primary = shop.primary_category ?? shop.category ?? "builder";
  const base = primary === "service" ? "/services" : "/builders";
  return `${base}/${stateToSlug(shop.state)}/${shop.slug}/`;
}

export function cityToSlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, "-");
}

export function slugToStateName(slug: string): string | null {
  const lower = slug.toLowerCase().replace(/-/g, " ");
  for (const name of Object.keys(stateNameToCode)) {
    if (name.toLowerCase() === lower) return name;
  }
  return null;
}

export function slugToCityName(slug: string, builders: Builder[]): string | null {
  const lower = slug.toLowerCase().replace(/-/g, " ");
  for (const b of builders) {
    if (b.city && b.city.toLowerCase() === lower) return b.city;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Haversine distance (miles)
// ---------------------------------------------------------------------------

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

let _allBuildersCache: Builder[] | null = null;
let _allServiceShopsCache: Builder[] | null = null;

/**
 * Fetch all published shops tagged with 'builder' in their categories array.
 * This includes dual-tagged shops whose primary is 'service' — they still
 * appear on /builders/ listings, but their card links point to the canonical
 * /services/ profile URL. Caches results for the duration of the build.
 */
export async function getAllBuilders(): Promise<Builder[]> {
  if (_allBuildersCache) return _allBuildersCache;
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builders")
    .select("*")
    .eq("published", true)
    .contains("categories", ["builder"])
    .order("name", { ascending: true });
  if (error) {
    console.warn("[supabase] builders fetch failed:", error.message);
    return [];
  }
  // Normalize state codes to full names (DB may store "CA" instead of "California")
  const builders = ((data ?? []) as Builder[]).map((b) => ({
    ...b,
    state: stateCodeToName[b.state] ?? b.state, // "CA" → "California", passthrough if already full
  }));
  _allBuildersCache = builders;
  return _allBuildersCache;
}

/**
 * Fetch only the shops whose canonical profile lives under /builders/
 * (primary_category = 'builder'). Used by getStaticPaths on the builder
 * profile page so dual-tagged service-primary shops don't generate a
 * duplicate /builders/[state]/[slug]/ route.
 */
export async function getBuilderProfileShops(): Promise<Builder[]> {
  const all = await getAllBuilders();
  return all.filter(
    (b) => (b.primary_category ?? b.category ?? "builder") === "builder",
  );
}

export async function getBuildersByState(state: string): Promise<Builder[]> {
  const all = await getAllBuilders();
  const s = state.toLowerCase();
  return all.filter((b) => b.state.toLowerCase() === s);
}

export async function getBuilderBySlug(
  state: string,
  slug: string,
): Promise<Builder | null> {
  const all = await getBuildersByState(state);
  return all.find((b) => b.slug === slug) ?? null;
}

export async function getBuildersByCity(
  state: string,
  city: string,
): Promise<Builder[]> {
  const stateBuilders = await getBuildersByState(state);
  const c = city.toLowerCase();
  return stateBuilders.filter((b) => b.city && b.city.toLowerCase() === c);
}

export async function getNearbyBuilders(
  lat: number,
  lng: number,
  radiusMiles: number,
  excludeId?: string,
): Promise<(Builder & { distance: number })[]> {
  const all = await getAllBuilders();
  return all
    .filter((b) => b.latitude != null && b.longitude != null && b.id !== excludeId)
    .map((b) => ({
      ...b,
      distance: haversineDistance(lat, lng, b.latitude!, b.longitude!),
    }))
    .filter((b) => b.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

export async function getBuildersByPlatform(platform: string): Promise<Builder[]> {
  const all = await getAllBuilders();
  const p = platform.toLowerCase();
  return all.filter((b) =>
    b.platforms.some((plat) => plat.toLowerCase() === p),
  );
}

export async function getBuildersByTier(tier: string): Promise<Builder[]> {
  const all = await getAllBuilders();
  const t = tier.toLowerCase();
  return all.filter((b) => b.price_tier && b.price_tier.toLowerCase() === t);
}

export async function getBuildersByService(service: string): Promise<Builder[]> {
  const all = await getAllBuilders();
  const s = service.toLowerCase();
  return all.filter((b) =>
    b.services.some((svc) => svc.toLowerCase() === s),
  );
}

export async function getBuildersByStyle(style: string): Promise<Builder[]> {
  const all = await getAllBuilders();
  const s = style.toLowerCase();
  return all.filter((b) => b.build_style && b.build_style.toLowerCase() === s);
}

export async function getDistinctStates(): Promise<string[]> {
  const all = await getAllBuilders();
  return [...new Set(all.map((b) => b.state))].sort();
}

export async function getDistinctCities(
  state: string,
): Promise<{ city: string; count: number }[]> {
  const stateBuilders = await getBuildersByState(state);
  const counts = new Map<string, number>();
  for (const b of stateBuilders) {
    if (b.city) {
      counts.set(b.city, (counts.get(b.city) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

// ---------------------------------------------------------------------------
// Service shop helpers (category = 'service')
// ---------------------------------------------------------------------------

/**
 * Fetch all published shops tagged with 'service' in their categories array.
 * Includes dual-tagged shops whose primary is 'builder' — they appear on
 * /services/ listings but their card links point to the canonical /builders/
 * profile URL. Cached separately from the builder listing.
 */
export async function getAllServiceShops(): Promise<Builder[]> {
  if (_allServiceShopsCache) return _allServiceShopsCache;
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builders")
    .select("*")
    .eq("published", true)
    .contains("categories", ["service"])
    .order("name", { ascending: true });
  if (error) {
    console.warn("[supabase] service shops fetch failed:", error.message);
    return [];
  }
  const shops = ((data ?? []) as Builder[]).map((b) => ({
    ...b,
    state: stateCodeToName[b.state] ?? b.state,
  }));
  _allServiceShopsCache = shops;
  return _allServiceShopsCache;
}

/**
 * Fetch only the shops whose canonical profile lives under /services/
 * (primary_category = 'service'). Used by getStaticPaths on the service
 * profile page so dual-tagged builder-primary shops don't generate a
 * duplicate /services/[state]/[slug]/ route.
 */
export async function getServiceShopProfileShops(): Promise<Builder[]> {
  const all = await getAllServiceShops();
  return all.filter(
    (b) => (b.primary_category ?? b.category ?? "service") === "service",
  );
}

export async function getServiceShopsByState(state: string): Promise<Builder[]> {
  const all = await getAllServiceShops();
  const s = state.toLowerCase();
  return all.filter((b) => b.state.toLowerCase() === s);
}

export async function getServiceShopBySlug(
  state: string,
  slug: string,
): Promise<Builder | null> {
  const all = await getServiceShopsByState(state);
  return all.find((b) => b.slug === slug) ?? null;
}

export async function getDistinctServiceStates(): Promise<string[]> {
  const all = await getAllServiceShops();
  return [...new Set(all.map((b) => b.state))].sort();
}

export async function getNearbyServiceShops(
  lat: number,
  lng: number,
  radiusMiles: number,
  excludeId?: string,
): Promise<(Builder & { distance: number })[]> {
  const all = await getAllServiceShops();
  return all
    .filter((b) => b.latitude != null && b.longitude != null && b.id !== excludeId)
    .map((b) => ({
      ...b,
      distance: haversineDistance(lat, lng, b.latitude!, b.longitude!),
    }))
    .filter((b) => b.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}
