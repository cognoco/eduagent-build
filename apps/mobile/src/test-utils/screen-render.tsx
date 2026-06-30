/// <reference types="jest" />
/**
 * Mobile screen render harness (U7 — see
 * `docs/plans/2026-05-12-shared-test-utility-framework-plan.md`).
 *
 * Goal: replace per-test piles of internal `jest.mock('./hooks/...')` lines
 * with a single render helper that runs real hooks against a routed mock
 * fetch.
 *
 * Composes existing pieces (do NOT re-invent):
 *   - `createRoutedMockFetch` / `mockApiClientFactory` — fetch boundary
 *   - `ProfileContext.Provider`                       — real `useProfile`
 *   - `QueryClient` with test defaults                 — gcTime:0, retry:false
 *   - Named profile fixtures                           — solo / guardian / linked / parent-self
 *   - Standard error responses                         — quota / forbidden / gone / network / validation
 *
 * What this harness intentionally does NOT do:
 *   - It does NOT mock internal hooks, services, or components. Boundary mocks
 *     (expo-router, react-native-safe-area-context, native-only modules,
 *     LLM/Stripe/Clerk, theme/native color scheme, react-i18next, etc.) must
 *     still be set up by the test file via `jest.mock(...)` — those are the
 *     native/external boundaries the catalog labels permit. See
 *     `native-shims.ts`.
 *
 * Usage:
 *   const { result, cleanup } = renderScreen(<MyScreen />, {
 *     profile: 'guardian',
 *     routes: { '/learner-profile': { profile: { ... } } },
 *   });
 *   ...assertions...
 *   cleanup();
 */

import {
  createElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  render,
  cleanup as rtlCleanup,
  type RenderAPI,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../lib/profile';
import { AppContextProvider } from '../lib/app-context';
import { createRoutedMockFetch, type RoutedMockFetch } from './mock-api-routes';
import { createTestProfile } from './app-hook-test-utils';

// Re-export so consumers can import everything from this single entry point.
export { createRoutedMockFetch, createTestProfile };
export type { RoutedMockFetch };

process.env.EXPO_PUBLIC_API_URL ??= 'http://localhost:8787';

// ─── Named profile fixtures ────────────────────────────────────────────

/** Solo owner: owns the account, no children linked. Tab shape = learner. */
const soloLearner: Profile = createTestProfile({
  id: 'profile-solo',
  accountId: 'account-solo',
  displayName: 'Solo Learner',
  isOwner: true,
  birthYear: 1990,
});

/** Guardian: owner with at least one linked child. Tab shape = guardian. */
const guardian: Profile = createTestProfile({
  id: 'profile-guardian',
  accountId: 'account-family',
  displayName: 'Parent',
  isOwner: true,
  birthYear: 1985,
});

/** Linked child: non-owner profile on a parent's account. Tab shape = learner. */
const linkedChild: Profile = createTestProfile({
  id: 'profile-child',
  accountId: 'account-family',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2012,
});

/**
 * Parent-self: owner on a guardian account, viewing as themselves (not as
 * the child). Same shape as `guardian`; the distinction is which profile
 * is "active" when both exist.
 */
const parentSelf: Profile = guardian;

export const NAMED_PROFILES = {
  soloLearner,
  guardian,
  linkedChild,
  parentSelf,
} as const;

export type NamedProfile = keyof typeof NAMED_PROFILES;

// ─── Standard error response helpers ───────────────────────────────────

/**
 * Canonical error shapes the API client classifies into typed errors
 * (see `apps/mobile/src/lib/api-client.ts` ~lines 240-310). Each helper
 * returns a `Response` instance so a route handler can return it directly.
 *
 * Use as:
 *   routes: { '/learner-profile': () => ERROR_RESPONSES.quotaExhausted() }
 */
export const ERROR_RESPONSES = {
  quotaExhausted: (
    message = 'You have reached your daily limit',
    details?: unknown,
  ): Response =>
    new Response(JSON.stringify({ code: 'QUOTA_EXCEEDED', message, details }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }),
  forbidden: (message = 'Forbidden', code = 'FORBIDDEN'): Response =>
    new Response(JSON.stringify({ code, message }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),
  gone: (message = 'Resource gone', code = 'RESOURCE_GONE'): Response =>
    new Response(JSON.stringify({ code, message }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    }),
  /**
   * Network error — fetch throws before getting a Response. Use as a
   * `RouteHandler` that throws.
   */
  networkError: (message = 'Network request failed'): never => {
    throw new TypeError(message);
  },
  validation: (
    message = 'Invalid input',
    details?: unknown,
    code = 'VALIDATION_ERROR',
  ): Response =>
    new Response(JSON.stringify({ code, message, details }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
} as const;

// ─── Render harness ────────────────────────────────────────────────────

export interface RenderScreenOptions {
  /** Active profile (named fixture or full custom Profile). Default: soloLearner. */
  profile?: NamedProfile | Profile;
  /** Additional profiles on the same account (e.g. guardian + linkedChild). */
  profiles?: Profile[];
  /** Route → response mapping passed to `createRoutedMockFetch`. */
  routes?: Record<
    string,
    unknown | ((url: string, init?: RequestInit) => unknown | Promise<unknown>)
  >;
  /** Pre-built routed mock fetch (overrides `routes` if both supplied). */
  routedFetch?: RoutedMockFetch;
  /** Pre-built QueryClient. Default: fresh one with gcTime:0, retry:false. */
  queryClient?: QueryClient;
  /**
   * Override the routed-fetch installation step. By default the harness
   * assigns `globalThis.fetch = routedFetch`. Tests that mock
   * `lib/api-client` themselves with `mockApiClientFactory(mockFetch)` can
   * set this to `false` and the routedFetch is still returned for assertions.
   */
  installGlobalFetch?: boolean;
}

export interface RenderScreenResult {
  /** `@testing-library/react-native` render API. */
  result: RenderAPI;
  /** The QueryClient backing the render (for assertions / manual invalidation). */
  queryClient: QueryClient;
  /** The routed mock fetch (for fetchCallsMatching, setRoute, etc.). */
  routedFetch: RoutedMockFetch;
  /** Tear down: clear cache, restore fetch, RTL cleanup. */
  cleanup: () => void;
}

function resolveProfile(profile: NamedProfile | Profile | undefined): Profile {
  if (!profile) return NAMED_PROFILES.soloLearner;
  if (typeof profile === 'string')
    return NAMED_PROFILES[profile as NamedProfile];
  return profile;
}

function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export function renderScreen(
  ui: ReactElement,
  opts: RenderScreenOptions = {},
): RenderScreenResult {
  const activeProfile = resolveProfile(opts.profile);
  const profiles = opts.profiles ?? [activeProfile];
  const queryClient = opts.queryClient ?? makeTestQueryClient();
  const routedFetch = opts.routedFetch ?? createRoutedMockFetch(opts.routes);

  // Install routedFetch as the global fetch unless caller opted out (e.g.
  // because they're plugging it into `lib/api-client` directly via
  // `mockApiClientFactory(routedFetch)`).
  const installFetch = opts.installGlobalFetch !== false;
  const prevFetch = globalThis.fetch;
  if (installFetch) {
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      routedFetch as unknown as typeof fetch;
  }

  const profileContextValue: ProfileContextValue = {
    profiles,
    activeProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        // AppContextProvider reads useProfile() from the ProfileContext above.
        // When FEATURE_FLAGS.MODE_NAV_V0_ENABLED is false (test default) it
        // returns mode:null, which satisfies `mode !== 'study'` enabled guards
        // on guardian-only dashboard/progress queries.
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  const result = render(ui, { wrapper: Wrapper });

  function cleanup() {
    cleanupScreen(queryClient);
    if (installFetch) {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
    }
  }

  return { result, queryClient, routedFetch, cleanup };
}

// --- createScreenWrapper ---

export interface CreateScreenWrapperOptions {
  activeProfile: Profile | null;
  profiles: Profile[];
  isLoading?: boolean;
  queryClient?: QueryClient;
  /**
   * Render as a parent-proxy session (the EXPLICIT proxy flag — see
   * use-parent-proxy.ts). Lets a screen test exercise proxy-gated UI without
   * mocking the internal `useParentProxy` hook. Default false.
   */
  isExplicitProxyMode?: boolean;
}

export interface CreateScreenWrapperResult {
  wrapper: ComponentType<{ children: ReactNode }>;
  queryClient: QueryClient;
}

export function createScreenWrapper(
  opts: CreateScreenWrapperOptions,
): CreateScreenWrapperResult {
  const queryClient = opts.queryClient ?? makeTestQueryClient();
  const isLoading = opts.isLoading ?? false;

  const profileContextValue: ProfileContextValue = {
    profiles: opts.profiles,
    activeProfile: opts.activeProfile,
    isExplicitProxyMode: opts.isExplicitProxyMode ?? false,
    switchProfile: async () => ({ success: true }),
    isLoading,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        children,
      ),
    );
  }

  return { wrapper: Wrapper, queryClient };
}

/**
 * Tear-down helper for screen tests. Per framework-plan failure mode #8:
 * leaving React Query timers / open handles active across tests trips
 * "worker process failed to exit gracefully" warnings.
 *
 * Safe to call from `afterEach` — clears cache, cancels in-flight queries,
 * and unmounts any leftover React trees from `@testing-library/react-native`.
 */
export function cleanupScreen(queryClient?: QueryClient): void {
  // Cancel in-flight queries before clearing so finalizers don't fire on
  // an empty cache. `cancelQueries` returns a promise; we don't await
  // because RTL `cleanup()` is synchronous and we want the same shape.
  if (queryClient) {
    void queryClient.cancelQueries();
    queryClient.clear();
  }
  rtlCleanup();
}
