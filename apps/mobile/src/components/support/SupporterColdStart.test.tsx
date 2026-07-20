import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Alert, Text } from 'react-native';
import type { SupporterColdStart as SupporterColdStartData } from '@eduagent/schemas';

import {
  ProfileContext,
  useProfile,
  type ProfileContextValue,
} from '../../lib/profile';
import { ScopeContextProvider } from '../../lib/scope-context';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';
import type { RoutedMockFetch } from '../../test-utils/mock-api-routes';
import { SupporterColdStart } from './SupporterColdStart';

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

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';

// Renders the CURRENT activeProfile id so tests can assert the real effect
// of a switchProfile call, not merely that it was invoked.
function ActiveProfileProbe(): React.ReactElement {
  const { activeProfile } = useProfile();
  return (
    <Text testID="active-profile-probe">{activeProfile?.id ?? 'none'}</Text>
  );
}

function wrapper(
  shape: 'supporter' | 'learner' = 'supporter',
  switchProfileMock?: ProfileContextValue['switchProfile'],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    const [activeProfile, setActiveProfile] = useState(createTestProfile());
    // Wires the caller's switchProfile spy (for call assertions) through to
    // real ProfileContext state (for effect assertions via
    // ActiveProfileProbe) — a successful switch actually flips activeProfile.
    const switchProfile: ProfileContextValue['switchProfile'] = async (
      profileId,
      options,
    ) => {
      const result = switchProfileMock
        ? await switchProfileMock(profileId, options)
        : { success: true };
      if (result.success) {
        setActiveProfile(createTestProfile({ id: profileId }));
      }
      return result;
    };
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider
          value={{
            profiles: [activeProfile],
            activeProfile,
            isExplicitProxyMode: false,
            switchProfile,
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
                    scopes: [{ kind: 'supporter-hub' }],
                    defaultScopeIndex: 0,
                  }
            }
          >
            {children}
            <ActiveProfileProbe />
          </ScopeContextProvider>
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe('SupporterColdStart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing outside the Support hub scope', () => {
    render(<SupporterColdStart />, { wrapper: wrapper('learner') });
    expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
    expect(screen.queryByTestId('supporter-cold-start-error')).toBeNull();
  });

  it('shows a loading state before the cold-start data resolves', () => {
    render(<SupporterColdStart />, { wrapper: wrapper() });
    screen.getByTestId('supporter-cold-start-error');
    expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
  });

  it('shows a retryable error state when the fetch fails', async () => {
    mockFetch.setRoute(
      '/scopes/coldstart',
      () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
    );

    render(<SupporterColdStart />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByText("Couldn't load your Support hub");
    });
    expect(screen.queryByTestId('supporter-cold-start')).toBeNull();

    fireEvent.press(screen.getByTestId('supporter-cold-start-retry'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the variant-zero add-child prompt and routes to the add-child flow', async () => {
    const data: SupporterColdStartData = {
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    render(<SupporterColdStart />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('supporter-cold-start-add-child');
    });
    screen.getByText('Add your child');
    screen.getByText('Add my child');

    fireEvent.press(screen.getByTestId('supporter-cold-start-add-child-cta'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('renders a per-child managed card whose CTA switches the active profile to the child', async () => {
    // [WI-2226 bounce-recovery] The prior version of this test manually
    // added the managed child as an available person scope in
    // ScopeContext's initialScopeList — that masked the real no-op bug,
    // because setActiveScope only worked because the test fabricated a
    // scope list membership production never guarantees for a managed
    // cold-start card (resolveScopesForPerson requires an accepted
    // visibility contract; the coldstart resolver does not). The CTA no
    // longer touches scope context — it calls switchProfile directly — so
    // there is nothing left to fabricate here.
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [
        {
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
          state: 'managed',
          anchor: 'handoff',
        },
      ],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    const switchProfileSpy = jest.fn(async () => ({ success: true }));
    render(<SupporterColdStart />, {
      wrapper: wrapper('supporter', switchProfileSpy),
    });

    await waitFor(() => {
      screen.getByTestId(`supporter-cold-start-managed-${PERSON_ID}`);
    });
    screen.getByText('Emma');
    screen.getByText(
      "Emma is all set. Whenever they're ready, hand them the phone.",
    );
    screen.getByText('Switch to Emma');
    expect(screen.getByTestId('active-profile-probe')).toHaveTextContent(
      'test-profile-id',
    );

    fireEvent.press(
      screen.getByTestId(`supporter-cold-start-handoff-${PERSON_ID}`),
    );

    // The real effect: switchProfile is invoked with the child's profileId,
    // and the active profile actually flips — not merely "was called".
    await waitFor(() => {
      expect(switchProfileSpy).toHaveBeenCalledWith(PERSON_ID, undefined);
    });
    await waitFor(() => {
      expect(screen.getByTestId('active-profile-probe')).toHaveTextContent(
        PERSON_ID,
      );
    });
  });

  it('surfaces an error and does not flip the active profile when the switch fails', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [
        {
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
          state: 'managed',
          anchor: 'handoff',
        },
      ],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    const switchProfileSpy = jest.fn(async () => ({
      success: false,
      error: 'Profile does not belong to this account',
    }));
    render(<SupporterColdStart />, {
      wrapper: wrapper('supporter', switchProfileSpy),
    });

    await waitFor(() => {
      screen.getByTestId(`supporter-cold-start-managed-${PERSON_ID}`);
    });

    fireEvent.press(
      screen.getByTestId(`supporter-cold-start-handoff-${PERSON_ID}`),
    );

    await waitFor(() => {
      expect(switchProfileSpy).toHaveBeenCalledWith(PERSON_ID, undefined);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not switch profile',
      'Profile does not belong to this account',
      undefined,
      undefined,
    );
    // No silent recovery: the active profile must NOT flip on failure.
    expect(screen.getByTestId('active-profile-probe')).toHaveTextContent(
      'test-profile-id',
    );
  });

  it('renders a per-child granted-idle card without a stale-idle nudge', async () => {
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [
        {
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Jakub',
          state: 'granted-idle',
          anchor: 'kickstart',
        },
      ],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    const onKickstart = jest.fn();
    render(<SupporterColdStart onKickstart={onKickstart} />, {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      screen.getByTestId(`supporter-cold-start-granted-${PERSON_ID}`);
    });
    screen.getByText('Help Jakub get started.');
    screen.getByText(
      'Their recaps and progress will appear here once they begin.',
    );
    screen.getByText('Encourage Jakub');
    expect(
      screen.queryByText(
        "Your encouragement reached Jakub. They haven't started yet — most learners start within the first week.",
      ),
    ).toBeNull();

    fireEvent.press(
      screen.getByTestId(`supporter-cold-start-kickstart-${PERSON_ID}`),
    );
    expect(onKickstart).toHaveBeenCalledWith(data.cards[0]);
  });

  it('renders the stale-idle nudge copy for the given staleIdleStep', async () => {
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [
        {
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Jakub',
          state: 'granted-idle',
          anchor: 'kickstart',
          staleIdleStep: 2,
        },
      ],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    render(<SupporterColdStart />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByText(
        "Next time you're with Jakub, open their first session side by side.",
      );
    });
  });

  it('renders nothing when every managed child already has real learning state (empty per-child cards)', async () => {
    // supporter-coldstart.ts `continue`s past an edge whose person already
    // has real learning state, so `cards` can legitimately be empty under
    // `variant: 'per-child'` — nobody needs a cold-start nudge.
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    render(<SupporterColdStart />, { wrapper: wrapper() });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
    expect(screen.queryByTestId('supporter-cold-start-error')).toBeNull();
  });

  it('renders a managed card and a granted-idle card together for a supporter with multiple children', async () => {
    const MANAGED_PERSON_ID = '550e8400-e29b-41d4-a716-446655440102';
    const MANAGED_EDGE_ID = '550e8400-e29b-41d4-a716-446655440202';
    const data: SupporterColdStartData = {
      variant: 'per-child',
      cards: [
        {
          personId: MANAGED_PERSON_ID,
          edgeId: MANAGED_EDGE_ID,
          displayName: 'Emma',
          state: 'managed',
          anchor: 'handoff',
        },
        {
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Jakub',
          state: 'granted-idle',
          anchor: 'kickstart',
        },
      ],
      selfLearningDoorway: true,
    };
    mockFetch.setRoute('/scopes/coldstart', data);

    render(<SupporterColdStart />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId(`supporter-cold-start-managed-${MANAGED_PERSON_ID}`);
    });
    screen.getByTestId(`supporter-cold-start-granted-${PERSON_ID}`);
    screen.getByText('Switch to Emma');
    screen.getByText('Encourage Jakub');
  });
});
