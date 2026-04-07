import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for authentication and authenticated writes.
 *
 * Separate from the build-time client in supabase.ts because:
 * - This client persists auth tokens in localStorage
 * - It's only used in React islands (client-side)
 * - The build-time client is used for static page generation
 */

let _browserClient: SupabaseClient | null = null;

export function getAuthClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!_browserClient) {
    _browserClient = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _browserClient;
}

const AUTH_REDIRECT_KEY = "tvg_auth_redirect";

/**
 * Store a return URL so the auth callback redirects there instead of the dashboard.
 * Call this before sending the magic link (e.g., from a claim flow).
 */
export function setAuthRedirect(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_REDIRECT_KEY, url);
  }
}

/**
 * Read and clear the stored return URL. Returns null if none was set.
 */
export function consumeAuthRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const url = localStorage.getItem(AUTH_REDIRECT_KEY);
  if (url) localStorage.removeItem(AUTH_REDIRECT_KEY);
  return url;
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const client = getAuthClient();
  if (!client) return { error: "Auth not configured" };

  const redirectTo = `${window.location.origin}/auth/callback/`;

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const client = getAuthClient();
  if (client) await client.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const client = getAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const client = getAuthClient();
  if (!client) return { unsubscribe: () => {} };

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return { unsubscribe: () => data.subscription.unsubscribe() };
}
