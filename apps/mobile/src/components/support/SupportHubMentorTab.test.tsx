import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  ScopeDescriptor,
  SharedRecord,
  SupporterColdStart as SupporterColdStartData,
} from '@eduagent/schemas';

import {
  cleanupScreen,
  createScreenWrapper,
  createTestProfile,
} from '../../test-utils/screen-render';
import {
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';
import { ScopeContextProvider } from '../../lib/scope-context';
import { ProfileContext, type ProfileContextValue } from '../../lib/profile';
import { SupportHubMentorTab } from './SupportHubMentorTab';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../lib/api-client' /* gc1-allow: transport-boundary: Hono RPC client requires real HTTP transport */,
  () => {
    const actual = jest.requireActual('../../lib/api-client');
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return {
      ...actual,
      ...mockApiClientFactory(mockFetch),
    };
  },
);

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';

// [WI-2226] A separate person from EMMA_SCOPE — the managed-family cold-start
// card represents a child who does NOT yet have their own account, so they
// never appear as an actionable `personScopes` entry (see
// resolveSupporterColdStart's `!edge.hasOwnAccount` branch); Emma is used
// throughout this file for the already-linked person-scope cases instead.
const MANAGED_PERSON_ID = '550e8400-e29b-41d4-a716-446655440301';
const MANAGED_EDGE_ID = '550e8400-e29b-41d4-a716-446655440401';

// [WI-2226] Default cold-start fixture: no per-child nudge to show. Matches
// the pre-mount visual baseline every existing test in this file was written
// against, so mounting SupporterColdStart doesn't change their output.
const EMPTY_COLD_START: SupporterColdStartData = {
  variant: 'per-child',
  cards: [],
  selfLearningDoorway: true,
};

const EMMA_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: PERSON_ID,
  edgeId: EDGE_ID,
  displayName: 'Emma',
};

const SHARED_RECORD: SharedRecord = {
  supportershipId: EDGE_ID,
  generatedAt: '2026-06-30T12:00:00.000Z',
  factIds: ['fact-1'],
  supporterView: {
    audience: 'supporter',
    factIds: ['fact-1'],
    headline: 'Emma has 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: ['fact-1'],
    headline: 'Your supporter can see 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
};

const EMPTY_SHARED_RECORD: SharedRecord = {
  ...SHARED_RECORD,
  factIds: [],
  supporterView: {
    ...SHARED_RECORD.supporterView,
    factIds: [],
    headline: 'Emma has no shareable updates yet.',
    facts: [],
  },
  supporteeView: {
    ...SHARED_RECORD.supporteeView,
    factIds: [],
    headline: 'Your supporter has no shareable updates yet.',
    facts: [],
  },
};

function renderWithProfile(
  ui: React.ReactElement,
  options: { switchProfileMock?: ProfileContextValue['switchProfile'] } = {},
): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { wrapper: ProfileWrapper } = createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  });
  // [WI-2226] SupportHubMentorTab now mounts SupporterColdStart, which reads
  // useScopeContext() — a real ScopeContextProvider is required or the hook
  // throws. `defaultScopeIndex: 0` -> `activeScope.kind === 'supporter-hub'`,
  // matching every test in this file (none exercise the person-scope branch).
  function Wrapper({ children }: { children: React.ReactNode }) {
    // [WI-2226 owner-gate] A nested ProfileContext.Provider stacked on top of
    // createScreenWrapper's own — the same {success:true} default behavior
    // for every test that doesn't pass switchProfileMock, but a REAL
    // stateful switch (activeProfile actually flips) when it does. The RGR
    // mount test uses this to prove the CTA reachable from the real
    // production tree performs a real switchProfile call, not merely that
    // ManagedCard renders.
    const [activeProfile, setActiveProfile] = useState(createTestProfile());
    const switchProfile: ProfileContextValue['switchProfile'] = async (
      profileId,
      opts,
    ) => {
      const result = options.switchProfileMock
        ? await options.switchProfileMock(profileId, opts)
        : { success: true };
      if (result.success) {
        setActiveProfile(createTestProfile({ id: profileId }));
      }
      return result;
    };
    return (
      <ProfileWrapper>
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
            initialScopeList={{
              shape: 'supporter',
              scopes: [{ kind: 'supporter-hub' }],
              defaultScopeIndex: 0,
            }}
          >
            {children}
          </ScopeContextProvider>
        </ProfileContext.Provider>
      </ProfileWrapper>
    );
  }
  render(ui, { wrapper: Wrapper });
  return queryClient;
}

describe('SupportHubMentorTab', () => {
  let queryClient: QueryClient | undefined;

  afterEach(() => {
    cleanupScreen(queryClient);
    queryClient = undefined;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      SHARED_RECORD,
    );
    mockFetch.setRoute('/scopes/coldstart', EMPTY_COLD_START);
  });

  it('renders visibility-backed cockpit cards with Mentor, Subjects, and Journal actions', async () => {
    const openMentor = jest.fn();
    const openSubjects = jest.fn();
    const openJournal = jest.fn();

    queryClient = renderWithProfile(
      <SupportHubMentorTab
        personScopes={[EMMA_SCOPE]}
        onOpenPersonScope={openMentor}
        onOpenSubjects={openSubjects}
        onOpenJournal={openJournal}
      />,
    );

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });

    screen.getByText('Practiced fractions');
    screen.getByText('Completed the review set.');
    screen.getByTestId('structural-fact-fact-1');
    expect(screen.queryByText('Effort')).toBeNull();
    expect(screen.queryByText('supportHub.mentor.factKind.effort')).toBeNull();
    expect(
      screen.queryByText('Private chats, notes, and mentor memory'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId(`support-hub-mentor-open-${PERSON_ID}`));
    fireEvent.press(
      screen.getByTestId(`support-hub-subjects-open-${PERSON_ID}`),
    );
    fireEvent.press(
      screen.getByTestId(`support-hub-journal-open-${PERSON_ID}`),
    );

    expect(openMentor).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(openSubjects).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(openJournal).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/shared-record`,
      ),
    ).toHaveLength(1);
  });

  it('shows the initial loading card while shared-record facts are pending', async () => {
    let resolveRecord: ((record: SharedRecord) => void) | undefined;
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      () =>
        new Promise<SharedRecord>((resolve) => {
          resolveRecord = resolve;
        }),
    );

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    screen.getByText('Checking shared updates...');
    screen.getByLabelText('Loading...');

    resolveRecord?.(SHARED_RECORD);
    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });
  });

  it('shows empty-card copy when the shared record has no supporter-visible facts', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      EMPTY_SHARED_RECORD,
    );

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByText('Emma has no shareable updates yet.');
    });

    screen.getByText('No shareable updates yet');
    screen.getByText(
      'When Emma has a shared session or report, it will show up here.',
    );
    expect(screen.queryByText('Practiced fractions')).toBeNull();
    expect(screen.queryByTestId('structural-fact-fact-1')).toBeNull();
  });

  it('shows an error card and refetches when retry is pressed', async () => {
    let attempts = 0;
    mockFetch.setRoute(`/visibility/reports/${PERSON_ID}/shared-record`, () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'temporary failure' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return SHARED_RECORD;
    });

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByText("Couldn't load shared updates");
    });
    screen.getByText('Try again in a moment.');

    fireEvent.press(
      screen.getByTestId(`support-hub-mentor-retry-${PERSON_ID}`),
    );

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });
    expect(attempts).toBe(2);
  });

  // WI-1393: the persistent header "Start supporting" anchor (A2) opens the
  // eligible-person picker and, once a person is selected, hands it to the
  // caller-provided navigation callback — proving the forward trigger into
  // /(app)/link/initiate actually fires (never a dead-end, never param-less).
  it('opens the eligible-person picker from the header anchor and forwards the selection', () => {
    const onSelectEligiblePerson = jest.fn();

    queryClient = renderWithProfile(
      <SupportHubMentorTab
        personScopes={[EMMA_SCOPE]}
        eligiblePersons={[{ id: 'child-new', displayName: 'Liam' }]}
        onSelectEligiblePerson={onSelectEligiblePerson}
      />,
    );

    expect(
      screen.queryByTestId('support-person-picker-option-child-new'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('support-hub-mentor-add-supporter'));
    fireEvent.press(
      screen.getByTestId('support-person-picker-option-child-new'),
    );

    expect(onSelectEligiblePerson).toHaveBeenCalledWith({
      id: 'child-new',
      displayName: 'Liam',
    });
  });

  // WI-1393 AC2: with zero eligible persons, the cold-start empty-state anchor
  // (A1) must guide the owner to add a child instead of reaching /link/initiate
  // param-less.
  it('degrades the cold-start empty state to add-a-child when there are no eligible persons', () => {
    const onAddChildFallback = jest.fn();
    const onSelectEligiblePerson = jest.fn();

    queryClient = renderWithProfile(
      <SupportHubMentorTab
        personScopes={[]}
        eligiblePersons={[]}
        onSelectEligiblePerson={onSelectEligiblePerson}
        onAddChildFallback={onAddChildFallback}
      />,
    );

    fireEvent.press(screen.getByTestId('support-hub-mentor-empty-add'));
    screen.getByTestId('support-person-picker-empty');

    fireEvent.press(screen.getByTestId('support-person-picker-add-child'));

    expect(onAddChildFallback).toHaveBeenCalledTimes(1);
    expect(onSelectEligiblePerson).not.toHaveBeenCalled();
  });

  // [WI-2226] SupporterColdStart is now mounted inside the production
  // Support hub tree (this component, not a standalone test harness) so its
  // scope contract actually runs. These four cases prove the four
  // producible cold-start states render DISTINCTLY once mounted here — not
  // just in the component's own isolated unit tests
  // (SupporterColdStart.test.tsx), which never exercise the real mount
  // site. `pending-visibility` and the zero-edge `variant-zero` states are
  // out of scope for this WI (struck from the AC — see PR description).
  describe('[WI-2226] mounted SupporterColdStart', () => {
    // RGR (red-green-revert) regression guard: this is the ONE test in the
    // suite that fails if SupporterColdStart stops being mounted in
    // SupportHubMentorTab. It deliberately uses the CONTENT-BEARING
    // 'managed' fixture, not the empty fixture — an empty fixture renders
    // null either way (mounted-but-empty is indistinguishable from
    // not-mounted), so it cannot prove reachability. Red/green evidence:
    // apps/mobile/src/components/support/wi2226-rgr-evidence.md.
    it('[WI-2226 RGR] renders the managed-family cold-start card from the mounted Support hub tree, and its CTA performs a real switch', async () => {
      const coldStart: SupporterColdStartData = {
        variant: 'per-child',
        cards: [
          {
            personId: MANAGED_PERSON_ID,
            edgeId: MANAGED_EDGE_ID,
            displayName: 'Liam',
            state: 'managed',
            anchor: 'handoff',
          },
        ],
        selfLearningDoorway: true,
      };
      mockFetch.setRoute('/scopes/coldstart', coldStart);

      // [WI-2226 bounce-recovery] switchProfileMock proves the CTA reachable
      // from the real production tree calls switchProfile (not the old
      // setActiveScope no-op) — the same real-effect assertion as
      // SupporterColdStart.test.tsx, exercised one level higher, from the
      // actual mount site.
      const switchProfileSpy = jest.fn(async () => ({ success: true }));
      queryClient = renderWithProfile(
        <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
        { switchProfileMock: switchProfileSpy },
      );

      await waitFor(() => {
        screen.getByTestId(`supporter-cold-start-managed-${MANAGED_PERSON_ID}`);
      });
      screen.getByText('Liam');

      fireEvent.press(
        screen.getByTestId(`supporter-cold-start-handoff-${MANAGED_PERSON_ID}`),
      );
      await waitFor(() => {
        expect(switchProfileSpy).toHaveBeenCalledWith(
          MANAGED_PERSON_ID,
          undefined,
        );
      });
    });

    it('shows the cold-start loading state before the query resolves', () => {
      mockFetch.setRoute(
        '/scopes/coldstart',
        () => new Promise<SupporterColdStartData>(() => undefined),
      );

      queryClient = renderWithProfile(
        <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
      );

      // `supporter-cold-start-error` is QueryStateView's container testID —
      // shared by loading, error, AND success (it's just the testID prop
      // SupporterColdStart passes through), so its presence alone doesn't
      // distinguish loading from error. Pin loading specifically: the
      // pre-timeout TimeoutLoader spinner carries
      // `accessibilityLabel: t('common.timeoutLoader.loading')` ("Loading,
      // please wait") — a label ErrorFallback's markup never sets — and the
      // retry affordance (`supporter-cold-start-retry`) only exists in the
      // error branch, so its absence here rules out error specifically.
      screen.getByTestId('supporter-cold-start-error');
      screen.getByLabelText('Loading, please wait');
      expect(screen.queryByTestId('supporter-cold-start-retry')).toBeNull();
      expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
      expect(
        screen.queryByTestId(
          `supporter-cold-start-managed-${MANAGED_PERSON_ID}`,
        ),
      ).toBeNull();
    });

    it('shows a retryable cold-start error state distinct from loading', async () => {
      mockFetch.setRoute(
        '/scopes/coldstart',
        () =>
          new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
      );

      queryClient = renderWithProfile(
        <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
      );

      await waitFor(() => {
        screen.getByTestId('supporter-cold-start-retry');
      });
      expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
    });

    it('renders no cold-start section when every managed child already has real learning state (empty per-child cards)', async () => {
      mockFetch.setRoute('/scopes/coldstart', EMPTY_COLD_START);

      queryClient = renderWithProfile(
        <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
      );

      // Wait for Emma's shared-record card (a state the empty cold-start
      // fixture does not affect) so the assertions below run after the
      // cold-start query has also settled, not mid-flight.
      await waitFor(() => {
        screen.getByText('Emma has 1 shareable update.');
      });
      expect(screen.queryByTestId('supporter-cold-start')).toBeNull();
      expect(screen.queryByTestId('supporter-cold-start-error')).toBeNull();
    });
  });
});
