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
 *
 * Populate the database via the scraper session. This file is read-only.
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!_client) _client = createClient(url, anonKey);
  return _client;
}

export type Builder = {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string | null;
  website: string | null;
  platforms: string[];
  services: string[];
  price_tier: "Basic" | "Standard" | "Premium" | "Custom" | null;
  year_founded: number | null;
  description: string | null;
  logo_url: string | null;
  gallery_urls: string[];
  claimed: boolean;
  verified: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch all published builders. Returns empty array if Supabase isn't
 * configured yet so local builds don't fail before the scraper runs.
 */
export async function getAllBuilders(): Promise<Builder[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("builders")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    console.warn("[supabase] builders fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as Builder[];
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
