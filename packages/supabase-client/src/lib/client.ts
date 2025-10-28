import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Type declaration for browser global (package runs in both server and client contexts)
declare const window: unknown | undefined;

/**
 * Validates presence and format of public Supabase env vars.
 * Returns the URL and anon key or throws with actionable guidance.
 */
function validateEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not defined. Add it to .env.local (see docs/environment-setup.md).'
    );
  }
  if (!anon) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined. Add it to .env.local (see docs/environment-setup.md).'
    );
  }
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL has invalid format: ${url}. Expected: https://YOUR-PROJECT.supabase.co`
    );
  }
  return { url, anon };
}

/**
 * Creates a Supabase client for browser/client-side usage using public env vars.
 * Throws if called on the server or if env vars are missing/invalid.
 */
export function createSupabaseBrowserClient(
  options?: Parameters<typeof createBrowserClient>[2]
) {
  if (typeof window === 'undefined') {
    throw new Error(
      'createSupabaseBrowserClient must be called in the browser. For server-side usage, call createSupabaseServerClient() instead.'
    );
  }
  const { url, anon } = validateEnv();
  return createBrowserClient(url, anon, options);
}

/**
 * Creates a Supabase client for server-side usage (Server Components, Route Handlers, Server Actions).
 * Awaits Next.js 15 cookies() once and wires getAll/setAll into the Supabase SSR adapter.
 */
export async function createSupabaseServerClient(
  options?: Parameters<typeof createServerClient>[2]
) {
  const { url, anon } = validateEnv();
  // Next.js 15 cookies() is async; await once and capture
  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
            cookieStore.set(name, value, cookieOptions)
          );
        } catch {
          // In some Server Component contexts, setting cookies is disallowed.
          // Route Handlers or Middleware should handle session refresh.
        }
      },
    },
    ...options,
  });
}

/**
 * Exported helper to validate public Supabase configuration.
 * Useful for startup health checks and diagnostics.
 */
export { validateEnv as validateSupabaseConfig };
