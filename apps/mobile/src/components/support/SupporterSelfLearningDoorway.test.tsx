import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SupporterColdStart as SupporterColdStartData } from '@eduagent/schemas';

import { ProfileContext } from '../../lib/profile';
import { ScopeContextProvider } from '../../lib/scope-context';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';
import type { RoutedMockFetch } from '../../test-utils/mock-api-routes';
import { SupporterSelfLearningDoorway } from './SupporterSelfLearningDoorway';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockFetch: RoutedMockFetch;

// prettier-ignore
jest.mock(/* gc1-allow: Clerk useAuth() external boundary; component test exercises real query + schema parsing over a routed Hono client */ '../../lib/api-client', () => {
  const {
    createRoutedMockFetch,
    mockApiClientFactory,
  } = require('../../test-utils/mock-api-routes');
  mockFetch = createRoutedMockFetch();
  return mockApiClientFactory(mockFetch);
});

// resolveScopesForPerson (apps/api/src/services/scope-resolution.ts) never
// emits a 'supporter' shape without at least one 'person' scope, and only
// appends 'me' once the supporter has real learning state of their own — so
// fixtures below always include a person scope, and vary only on whether
// 'me' is present.
const PERSON_SCOPE = {
  kind: 'person' as const,
  personId: '550e8400-e29b-41d4-a716-446655440101',
  edgeId: '550e8400-e29b-41d4-a716-446655440201',
  displayName: 'Emma',
};

function wrapper(
  shape: 'supporter' | 'learner' = 'supporter',
  options: { hasMeScope?: boolean } = {},
) {
  const { hasMeScope = true } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider
          value={{
            profiles: [createTestProfile()],
            activeProfile: createTestProfile(),
            isExplicitProxyMode: false,
            switchProfile: async () => ({ success: true }),
            isLoading: false,
            profileLoadError: null,
            profileWasRemoved: false,
            acknowledgeProfileRemoval: () => undefined,
          }}
        >
          <ScopeContextProvider
            initialScopeList={
              shape === 'learner'
                ? { shape: 'learner' }
                : {
                    shape: 'supporter',
                    scopes: hasMeScope
                      ? [
                          { kind: 'supporter-hub' },
                          PERSON_SCOPE,
                          { kind: 'me' },
                        ]
                      : [{ kind: 'supporter-hub' }, PERSON_SCOPE],
                    defaultScopeIndex: 0,
                  }
            }
          >
            {children}
          </ScopeContextProvider>
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

const COLD_START_DATA: SupporterColdStartData = {
  variant: 'variant-zero',
  cards: [{ state: 'none', anchor: 'add-child' }],
  selfLearningDoorway: true,
};

describe('SupporterSelfLearningDoorway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing outside the Support hub scope', () => {
    render(<SupporterSelfLearningDoorway />, { wrapper: wrapper('learner') });
    expect(screen.queryByTestId('supporter-self-learning-doorway')).toBeNull();
    expect(
      screen.queryByTestId('supporter-self-learning-doorway-error'),
    ).toBeNull();
  });

  it('shows a loading state before the cold-start data resolves', () => {
    render(<SupporterSelfLearningDoorway />, {
      wrapper: wrapper('supporter', { hasMeScope: false }),
    });
    screen.getByTestId('supporter-self-learning-doorway-error');
    expect(screen.queryByTestId('supporter-self-learning-doorway')).toBeNull();
  });

  it('shows a retryable error state when the fetch fails', async () => {
    mockFetch.setRoute(
      '/scopes/coldstart',
      () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
    );

    render(<SupporterSelfLearningDoorway />, {
      wrapper: wrapper('supporter', { hasMeScope: false }),
    });

    await waitFor(() => {
      screen.getByText("Couldn't load your Support hub");
    });

    fireEvent.press(
      screen.getByTestId('supporter-self-learning-doorway-retry'),
    );
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the doorway once cold-start data is fetched and routes to the mentor tab on tap', async () => {
    mockFetch.setRoute('/scopes/coldstart', COLD_START_DATA);

    render(<SupporterSelfLearningDoorway />, {
      wrapper: wrapper('supporter', { hasMeScope: false }),
    });

    await waitFor(() => {
      screen.getByTestId('supporter-self-learning-doorway');
    });
    screen.getByText('Learn something yourself');

    fireEvent.press(screen.getByTestId('supporter-self-learning-doorway'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor');

    // The doorway self-guards on `activeScope.kind === 'supporter-hub'`, so
    // its own disappearance proves the scope actually switched to `me`
    // rather than the tap only pushing a route the Support hub still owns.
    await waitFor(() => {
      expect(
        screen.queryByTestId('supporter-self-learning-doorway'),
      ).toBeNull();
    });
  });

  it('still switches into Me on tap for a first-time supporter whose scope list has no Me entry yet', async () => {
    mockFetch.setRoute('/scopes/coldstart', COLD_START_DATA);

    render(<SupporterSelfLearningDoorway />, {
      wrapper: wrapper('supporter', { hasMeScope: false }),
    });

    await waitFor(() => {
      screen.getByTestId('supporter-self-learning-doorway');
    });

    fireEvent.press(screen.getByTestId('supporter-self-learning-doorway'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor');

    await waitFor(() => {
      expect(
        screen.queryByTestId('supporter-self-learning-doorway'),
      ).toBeNull();
    });
  });

  // [WI-2243] AC-1: the doorway is a first-time entry point only — once the
  // supporter has real learning state of their own ('me' present in the
  // server-resolved scope list), it steps aside rather than rendering a
  // second, now-redundant route into a scope already reachable elsewhere.
  it('renders nothing once the supporter already has their own learning state', () => {
    mockFetch.setRoute('/scopes/coldstart', COLD_START_DATA);

    render(<SupporterSelfLearningDoorway />, {
      wrapper: wrapper('supporter', { hasMeScope: true }),
    });

    expect(screen.queryByTestId('supporter-self-learning-doorway')).toBeNull();
    expect(
      screen.queryByTestId('supporter-self-learning-doorway-error'),
    ).toBeNull();
  });
});
