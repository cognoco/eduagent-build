/// <reference types="jest" />
/**
 * Screen-level render harness for mobile integration tests.
 *
 * Wraps the component under test with QueryClientProvider and
 * ProfileContext.Provider so screen tests can control profile state
 * without mocking `../lib/profile`. The real `useProfile()` call inside
 * the screen resolves against the provider supplied by this harness.
 */

import { createElement, type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../src/lib/profile';
import { createTestProfile } from '../src/test-utils/app-hook-test-utils';

export { createTestProfile } from '../src/test-utils/app-hook-test-utils';
export {
  createRoutedMockFetch,
  mockApiClientFactory,
  fetchCallsMatching,
  extractJsonBody,
} from '../src/test-utils/mock-api-routes';
export type { RoutedMockFetch } from '../src/test-utils/mock-api-routes';

export const profileFixtures = {
  soloLearner: createTestProfile({
    id: 'fixture-solo-1',
    displayName: 'Alex',
    isOwner: true,
    birthYear: 2012,
  }),
  parentGuardian: createTestProfile({
    id: 'fixture-parent-1',
    displayName: 'Maria',
    isOwner: true,
    birthYear: 1990,
  }),
  linkedChild: createTestProfile({
    id: 'fixture-child-1',
    displayName: 'Emma',
    isOwner: false,
    birthYear: 2014,
  }),
  parentLearningSelf: createTestProfile({
    id: 'fixture-parent-2',
    displayName: 'Jørn',
    isOwner: true,
    birthYear: 1985,
  }),
} as const;

export const guardianProfiles: readonly Profile[] = [
  profileFixtures.parentGuardian,
  profileFixtures.linkedChild,
];

export const soloProfiles: readonly Profile[] = [profileFixtures.soloLearner];

export const errorResponses = {
  quotaExhausted: (details?: unknown) =>
    new Response(
      JSON.stringify({
        error: 'Quota exceeded',
        ...(details != null ? { details } : {}),
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    ),

  forbidden: () =>
    new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),

  gone: () =>
    new Response(JSON.stringify({ error: 'Gone' }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    }),

  validationError: (details?: unknown) =>
    new Response(
      JSON.stringify({
        error: 'Validation failed',
        ...(details != null ? { details } : {}),
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ),

  serverError: () => new Response(JSON.stringify({}), { status: 500 }),
};

export interface ScreenWrapperOptions {
  activeProfile?: Profile | null;
  profiles?: Profile[];
  isLoading?: boolean;
  profileLoadError?: unknown | null;
  profileWasRemoved?: boolean;
  queryClientOptions?: QueryClientConfig;
}

export function createScreenWrapper(options: ScreenWrapperOptions = {}) {
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

  const activeProfile =
    options.activeProfile === undefined
      ? createTestProfile()
      : options.activeProfile;

  const profiles = options.profiles ?? (activeProfile ? [activeProfile] : []);

  const profileContext: ProfileContextValue = {
    profiles,
    activeProfile,
    switchProfile: jest.fn().mockResolvedValue({ success: true }),
    isLoading: options.isLoading ?? false,
    profileLoadError: options.profileLoadError ?? null,
    profileWasRemoved: options.profileWasRemoved ?? false,
    acknowledgeProfileRemoval: jest.fn(),
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContext },
        children,
      ),
    );
  }

  return { queryClient, wrapper: Wrapper, profileContext };
}

interface RenderScreenOptions extends ScreenWrapperOptions {
  renderOptions?: Omit<RenderOptions, 'wrapper'>;
}

export function renderScreen(
  ui: ReactElement,
  options: RenderScreenOptions = {},
) {
  const { renderOptions, ...wrapperOptions } = options;
  const { queryClient, wrapper, profileContext } =
    createScreenWrapper(wrapperOptions);
  const result = render(ui, { wrapper, ...renderOptions });
  return { ...result, queryClient, profileContext };
}

export function cleanupScreen(queryClient: QueryClient): void {
  queryClient.cancelQueries();
  queryClient.clear();
}
