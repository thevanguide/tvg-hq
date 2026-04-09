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
  /**
   * Service-side content overrides for shops with a filled service profile.
   * When non-null, the shop renders a distinct /services/[state]/[slug]/
   * profile page using these fields instead of the builder-side description,
   * tagline, phone, and emails. Null for shops that only have one story.
   */
  service_description: string | null;
  service_tagline: string | null;
  service_phone: string | null;
  service_emails: string[] | null;
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
   * The directory where the shop's primary story lives. For dual-tagged
   * shops, the "description" field is the primary-side copy; the service-
   * side fields (service_description, etc.) carry the secondary story.
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

type ProfileGateShop = {
  slug: string;
  state: string;
  category?: "builder" | "service" | null;
  categories?: ("builder" | "service")[] | null;
  primary_category?: "builder" | "service" | null;
  service_description?: string | null;
};

function normalizeCategories(
  shop: ProfileGateShop,
): ("builder" | "service")[] {
  if (shop.categories && shop.categories.length > 0) return shop.categories;
  if (shop.category) return [shop.category];
  return [];
}

/**
 * Does this shop have its own /builders/[state]/[slug]/ profile page?
 * A builder profile exists when the shop is tagged as a builder AND its
 * primary story is on the builder side (i.e. the main `description` field
 * is builder-flavored copy). We deliberately do NOT auto-generate a
 * builder profile for primary=service shops unless they explicitly opt in
 * with builder-side content — those profiles would be near-duplicates of
 * the service profile.
 */
export function hasBuilderProfile(shop: ProfileGateShop): boolean {
  const primary = shop.primary_category ?? shop.category ?? "builder";
  const categories = normalizeCategories(shop);
  if (!categories.includes("builder")) return false;
  return primary === "builder" || primary == null;
}

/**
 * Does this shop have its own /services/[state]/[slug]/ profile page?
 * A service profile exists when:
 *   - the shop is tagged as a service shop (categories includes 'service'), AND
 *   - either the primary story is on the service side, OR the shop has
 *     populated `service_description` with distinct service-side copy.
 * Dual-tagged shops without filled service content get a single profile on
 * their primary directory, with a "also offers repair & service" directory
 * cross-link in place of a second profile.
 */
export function hasServiceProfile(shop: ProfileGateShop): boolean {
  const primary = shop.primary_category ?? shop.category ?? "builder";
  const categories = normalizeCategories(shop);
  if (!categories.includes("service")) return false;
  if (primary === "service") return true;
  return shop.service_description != null && shop.service_description !== "";
}

/**
 * Resolve the correct profile URL for a shop rendered in a listing context.
 *   - If the listing base matches a directory where this shop has its own
 *     profile, link into that directory (so cards in /services/ link to
 *     /services/.../[slug]/ when a service profile exists).
 *   - Otherwise fall back to whichever profile the shop does have.
 * Used by listing pages, maps, JSON-LD, and search result cards.
 */
export function getShopProfileUrl(
  shop: ProfileGateShop,
  listingBase: "/builders" | "/services" = "/builders",
): string {
  const state = stateToSlug(shop.state);
  const slug = shop.slug;
  const bHas = hasBuilderProfile(shop);
  const sHas = hasServiceProfile(shop);

  if (listingBase === "/services" && sHas) {
    return `/services/${state}/${slug}/`;
  }
  if (listingBase === "/builders" && bHas) {
    return `/builders/${state}/${slug}/`;
  }
  // Cross-directory fallback — the shop lives in this listing but its
  // profile is on the other side.
  if (bHas) return `/builders/${state}/${slug}/`;
  if (sHas) return `/services/${state}/${slug}/`;
  // Last resort: primary_category wins (pre-categories legacy rows).
  const primary = shop.primary_category ?? shop.category ?? "builder";
  const base = primary === "service" ? "/services" : "/builders";
  return `${base}/${state}/${slug}/`;
}

/**
 * @deprecated Use getShopProfileUrl(shop, listingBase) instead. Retained so
 * existing callers that imported canonicalShopPath still resolve during the
 * dual-profile transition.
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

let _allPublishedCache: Builder[] | null = null;
let _allBuildersCache: Builder[] | null = null;
let _allServiceShopsCache: Builder[] | null = null;

/**
 * Dev-only: layer fixture overrides on top of the fetched DB rows.
 * Disabled by default; opt in with `TVG_DEV_FIXTURES=1` at build time.
 * This is how we validate the dual-profile architecture against real
 * listings (logos, reviews, maps) without mutating the production DB.
 */
async function applyDevFixtures(builders: Builder[]): Promise<Builder[]> {
  const flag =
    (typeof process !== "undefined" && process.env?.TVG_DEV_FIXTURES) ||
    import.meta.env?.TVG_DEV_FIXTURES ||
    import.meta.env?.PUBLIC_TVG_DEV_FIXTURES;
  if (flag !== "1") return builders;
  try {
    const mod = await import("./dev-fixtures");
    const overrides = new Map(
      mod.DEV_FIXTURE_OVERRIDES.map((f) => [f.id, f.override] as const),
    );
    if (overrides.size === 0) return builders;
    console.warn(
      `[supabase] TVG_DEV_FIXTURES=1 — applying ${overrides.size} fixture override(s). Do not enable in prod deploy.`,
    );
    return builders.map((b) => {
      const over = overrides.get(b.id);
      return over ? ({ ...b, ...over } as Builder) : b;
    });
  } catch (err) {
    console.warn("[supabase] failed to load dev-fixtures:", err);
    return builders;
  }
}

/**
 * Fetch every published shop regardless of category tag. Single query per
 * build; downstream helpers derive builder-side and service-side listings
 * from this shared result. Applies dev-fixture overrides when enabled.
 */
async function fetchAllPublishedShops(): Promise<Builder[]> {
  if (_allPublishedCache) return _allPublishedCache;
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builders")
    .select("*")
    .eq("published", true)
    .order("name", { ascending: true });
  if (error) {
    console.warn("[supabase] builders fetch failed:", error.message);
    return [];
  }
  // Normalize state codes to full names (DB may store "CA" instead of "California")
  const rows = ((data ?? []) as Builder[]).map((b) => ({
    ...b,
    state: stateCodeToName[b.state] ?? b.state,
  }));
  const withFixtures = await applyDevFixtures(rows);
  _allPublishedCache = withFixtures;
  return _allPublishedCache;
}

/**
 * Fetch all published shops tagged with 'builder' in their categories array.
 * This includes dual-tagged shops — they still appear on /builders/ listings,
 * and their card links point to whichever profile URL the shop actually has
 * for that directory (the builder profile if one exists, else the service
 * profile as a cross-directory fallback). Caches for the duration of the build.
 */
export async function getAllBuilders(): Promise<Builder[]> {
  if (_allBuildersCache) return _allBuildersCache;
  const all = await fetchAllPublishedShops();
  _allBuildersCache = all.filter((b) =>
    normalizeCategories(b).includes("builder"),
  );
  return _allBuildersCache;
}

/**
 * Fetch only the shops that should generate a /builders/[state]/[slug]/
 * profile page. Dual-tagged shops with primary=service and no distinct
 * builder content are excluded so we don't publish near-duplicate profiles.
 */
export async function getBuilderProfileShops(): Promise<Builder[]> {
  const all = await getAllBuilders();
  return all.filter((b) => hasBuilderProfile(b));
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
 * Includes dual-tagged shops — cards in this listing link to the service
 * profile if one exists, otherwise fall back cross-directory to the builder
 * profile. Derived from the shared published cache (one DB query per build).
 */
export async function getAllServiceShops(): Promise<Builder[]> {
  if (_allServiceShopsCache) return _allServiceShopsCache;
  const all = await fetchAllPublishedShops();
  _allServiceShopsCache = all.filter((b) =>
    normalizeCategories(b).includes("service"),
  );
  return _allServiceShopsCache;
}

/**
 * Fetch only the shops that should generate a /services/[state]/[slug]/
 * profile page. Shops with primary=service always qualify. Dual-tagged
 * shops with primary=builder only qualify when they've filled in distinct
 * service-side content (service_description) so we avoid duplicate-content
 * profiles that mirror the builder page.
 */
export async function getServiceShopProfileShops(): Promise<Builder[]> {
  const all = await getAllServiceShops();
  return all.filter((b) => hasServiceProfile(b));
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
