import { createElement, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../lib/profile';

process.env.EXPO_PUBLIC_API_URL ??= 'http://localhost:8787';

// QueryClient-only wrapper for hook tests that already mock `../lib/profile`.
export function createQueryWrapper(
  options: { queryClientOptions?: QueryClientConfig } = {}
) {
  const userOpts = options.queryClientOptions ?? {};
  const queryClient = new QueryClient({
    ...userOpts,
    defaultOptions: {
      ...userOpts.defaultOptions,
      queries: {
        retry: false,
        gcTime: 0,
        ...userOpts.defaultOptions?.queries,
      },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  }

  return { queryClient, wrapper: Wrapper };
}

export function createTestProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test Learner',
    avatarUrl: null,
    birthYear: 2010,
    location: null,
    isOwner: true,
    hasPremiumLlm: false,
    // BKT-C.1 — required fields on Profile. Default to English tutor, null
    // pronouns (matches the onboarding default path).
    conversationLanguage: 'en',
    pronouns: null,
    consentStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface CreateHookWrapperOptions {
  activeProfile?: Profile | null;
  profiles?: Profile[];
}

export function createHookWrapper(options: CreateHookWrapperOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const activeProfile =
    options.activeProfile === undefined
      ? createTestProfile()
      : options.activeProfile;
  const profiles = options.profiles ?? (activeProfile ? [activeProfile] : []);

  const profileContextValue: ProfileContextValue = {
    profiles,
    activeProfile,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
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
        children
      )
    );
  }

  return {
    queryClient,
    wrapper: Wrapper,
    profileContextValue,
  };
}

/** Minimal shape of a jest mock of `fetch` — avoids a dependency on jest types in tsconfig.app.json. */
type MockFetch = { mock: { calls: Parameters<typeof fetch>[] } };

export function getRequestUrl(mockFetch: MockFetch, callIndex = 0): string {
  return mockFetch.mock.calls[callIndex]?.[0] as string;
}

export function getRequestInit(
  mockFetch: MockFetch,
  callIndex = 0
): RequestInit | undefined {
  return mockFetch.mock.calls[callIndex]?.[1] as RequestInit | undefined;
}

export function getRequestHeaders(
  mockFetch: MockFetch,
  callIndex = 0
): Headers {
  return new Headers(getRequestInit(mockFetch, callIndex)?.headers);
}

export function getRequestJsonBody<T>(
  mockFetch: MockFetch,
  callIndex = 0
): T | undefined {
  const body = getRequestInit(mockFetch, callIndex)?.body;
  if (typeof body !== 'string') {
    return undefined;
  }

  return JSON.parse(body) as T;
}
