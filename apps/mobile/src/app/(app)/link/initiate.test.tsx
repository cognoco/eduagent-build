import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  ERROR_RESPONSES,
  NAMED_PROFILES,
  renderScreen,
  type RenderScreenOptions,
  type RenderScreenResult,
} from '../../../test-utils/screen-render';
import {
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockReplace = jest.fn();
const mockBack = jest.fn();
// [WI-2188] Defaults true (support-hub entry has history); individual tests
// flip this to simulate a direct/historyless entry (deep link, cold start).
const mockCanGoBack = jest.fn(() => true);
let mockParams: Record<string, string> = {};
let mockScopeContext: {
  activeScope: { kind: 'me' } | { kind: 'supporter-hub' };
  availableScopes: Array<{ kind: 'person'; personId: string }>;
  setActiveScope: jest.Mock;
} = {
  activeScope: { kind: 'supporter-hub' },
  availableScopes: [],
  setActiveScope: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('../../../lib/scope-context', () => ({
  ...jest.requireActual('../../../lib/scope-context'),
  useScopeContext: () => mockScopeContext,
}));

// `visibilityContractSchema` requires UUID-shaped person ids; the mock
// response fixture uses fixed UUIDs independent of the non-UUID
// `NAMED_PROFILES` fixture ids used to assert what the client actually
// *sends* (`activeProfile.id` / the picked person's `id`).
const CONTRACT = {
  id: '00000000-0000-4000-8000-000000000001',
  supportershipId: '00000000-0000-4000-8000-000000000002',
  supporterPersonId: '00000000-0000-4000-8000-000000000003',
  supporteePersonId: '00000000-0000-4000-8000-000000000004',
  relation: 'teacher' as const,
  status: 'pending' as const,
  contractVersion: 1,
  reportableKinds: ['mastery' as const, 'effort' as const],
  artifactWall: true as const,
  renderEquivalence: true as const,
  safetyException: true as const,
  supporterAcceptedAt: null,
  supporteeAcceptedAt: null,
  createdAt: '2026-06-20T12:00:00.000Z',
  updatedAt: '2026-06-20T12:00:00.000Z',
};

let cleanupRender: (() => void) | undefined;

function renderInitiateScreen(
  profileOverrides: Pick<RenderScreenOptions, 'profile' | 'profiles'> = {},
): RenderScreenResult {
  const InitiateLinkScreen = require('./initiate').default;
  const rendered = renderScreen(<InitiateLinkScreen />, {
    profile: NAMED_PROFILES.guardian,
    routes: { '/visibility/links': CONTRACT },
    ...profileOverrides,
  });
  cleanupRender = rendered.cleanup;
  return rendered;
}

describe('InitiateLinkScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // [WI-2188] clearAllMocks() clears call history but NOT a prior
    // mockReturnValue() — restore the support-hub-entry default explicitly
    // so a historyless-entry test doesn't leak `false` into the next test.
    mockCanGoBack.mockReturnValue(true);
    cleanupRender?.();
    cleanupRender = undefined;
    mockParams = {};
    mockScopeContext = {
      activeScope: { kind: 'supporter-hub' },
      availableScopes: [],
      setActiveScope: jest.fn(),
    };
  });

  it('initiates a visibility link when arriving with a pre-filled managed-child target and routes to the contract screen with audience=supporter', async () => {
    mockParams = {
      supporteePersonId: NAMED_PROFILES.linkedChild.id,
      supporteeName: NAMED_PROFILES.linkedChild.displayName,
      relation: 'teacher',
    };

    const { routedFetch } = renderInitiateScreen();

    screen.getByText('Start sharing request');
    fireEvent.press(screen.getByTestId('visibility-link-create'));

    await waitFor(() =>
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        1,
      ),
    );
    const body = extractJsonBody<{
      supporterPersonId: string;
      supporteePersonId: string;
      relation: string;
      managedTier: boolean;
    }>(fetchCallsMatching(routedFetch, '/visibility/links')[0]?.init);
    expect(body).toEqual({
      supporterPersonId: NAMED_PROFILES.guardian.id,
      supporteePersonId: NAMED_PROFILES.linkedChild.id,
      relation: 'teacher',
      managedTier: false,
    });
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/link/[contractId]',
        params: {
          contractId: CONTRACT.id,
          audience: 'supporter',
          supporteeName: NAMED_PROFILES.linkedChild.displayName,
        },
      }),
    );
  }, 10_000);

  it('shows the picker with no create action until a managed child is selected, then reveals relation defaulted+selected to parent, and creates with that relation (form validation)', async () => {
    const { routedFetch } = renderInitiateScreen({
      profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
    });

    screen.getByTestId('visibility-link-initiate-picker');
    expect(screen.queryByTestId('visibility-link-create')).toBeNull();

    fireEvent.press(
      screen.getByTestId(
        `visibility-link-initiate-picker-managed-${NAMED_PROFILES.linkedChild.id}`,
      ),
    );

    screen.getByTestId('visibility-link-create');
    // The picker-driven path (no relation route param) must default to
    // 'parent' — assert the option is actually SELECTED, not merely
    // present, so this fails if the default silently drifts.
    expect(
      screen.getByTestId('visibility-link-relation-parent').props
        .accessibilityState.selected,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('visibility-link-create'));

    await waitFor(() =>
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        1,
      ),
    );
    const body = extractJsonBody<{ relation: string }>(
      fetchCallsMatching(routedFetch, '/visibility/links')[0]?.init,
    );
    expect(body?.relation).toBe('parent');
  }, 10_000);

  it('changing the relation before creating sends the updated relation in the request body', async () => {
    const { routedFetch } = renderInitiateScreen({
      profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
    });

    fireEvent.press(
      screen.getByTestId(
        `visibility-link-initiate-picker-managed-${NAMED_PROFILES.linkedChild.id}`,
      ),
    );
    fireEvent.press(screen.getByTestId('visibility-link-relation-sibling'));
    fireEvent.press(screen.getByTestId('visibility-link-create'));

    await waitFor(() =>
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        1,
      ),
    );
    const body = extractJsonBody<{ relation: string }>(
      fetchCallsMatching(routedFetch, '/visibility/links')[0]?.init,
    );
    expect(body?.relation).toBe('sibling');
  }, 10_000);

  it('selecting an existing family member shows a not-yet-available state instead of a fake flow', () => {
    renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

    fireEvent.press(
      screen.getByTestId('visibility-link-initiate-picker-existing-teen'),
    );

    screen.getByTestId('visibility-link-initiate-existing-teen-unavailable');
    expect(screen.queryByTestId('visibility-link-create')).toBeNull();

    fireEvent.press(
      screen.getByTestId('visibility-link-initiate-existing-teen-back'),
    );
    screen.getByTestId('visibility-link-initiate-picker');
  });

  it('with MODE_NAV_V2 enabled, sends a family-join invite for an existing teen and shows a neutral (anti-enum) confirmation', async () => {
    const original = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
    try {
      const InitiateLinkScreen = require('./initiate').default;
      const rendered = renderScreen(<InitiateLinkScreen />, {
        profile: NAMED_PROFILES.guardian,
        profiles: [NAMED_PROFILES.guardian],
        routes: { '/family-join/invite': { status: 'sent' } },
      });
      cleanupRender = rendered.cleanup;
      const { routedFetch } = rendered;

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-picker-existing-teen'),
      );
      // V2 on → the real invite form, not the "unavailable" placeholder.
      screen.getByTestId('visibility-link-initiate-existing-teen-invite');
      expect(
        screen.queryByTestId(
          'visibility-link-initiate-existing-teen-unavailable',
        ),
      ).toBeNull();

      fireEvent.changeText(
        screen.getByTestId('visibility-link-initiate-existing-teen-email'),
        'teen@example.com',
      );
      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-existing-teen-submit'),
      );

      await waitFor(() =>
        expect(
          fetchCallsMatching(routedFetch, '/family-join/invite'),
        ).toHaveLength(1),
      );
      const body = extractJsonBody<{ invitedEmail: string }>(
        fetchCallsMatching(routedFetch, '/family-join/invite')[0]?.init,
      );
      expect(body).toEqual({ invitedEmail: 'teen@example.com' });

      // Neutral confirmation — never confirms/denies the account exists.
      await waitFor(() =>
        screen.getByTestId('visibility-link-initiate-existing-teen-sent'),
      );
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        original;
    }
  }, 10_000);

  it('shows an empty-state message when there are zero eligible managed children', () => {
    renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

    screen.getByTestId('visibility-link-initiate-picker-empty');
  });

  // [WI-2188] Every ceremony step must expose a visible, non-submitting
  // in-app exit — the initial picker and the managed-person confirmation
  // step previously had none (only the existing-teen branches did).
  describe('in-app exits (WI-2188)', () => {
    it('the picker back button calls router.back() when history exists (support-hub entry), and does not submit', () => {
      renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

      screen.getByTestId('visibility-link-initiate-picker');
      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-picker-back'),
      );

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('the picker back button falls back to router.replace("/(app)/home") on a historyless entry (deep link / cold start)', () => {
      mockCanGoBack.mockReturnValue(false);
      renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-picker-back'),
      );

      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('the picker back button is present and functional in the empty-eligible-children state', () => {
      renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

      screen.getByTestId('visibility-link-initiate-picker-empty');
      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-picker-back'),
      );

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('the confirmation back button returns to the picker when reached via inline picker selection, and does not submit', () => {
      const { routedFetch } = renderInitiateScreen({
        profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
      });

      fireEvent.press(
        screen.getByTestId(
          `visibility-link-initiate-picker-managed-${NAMED_PROFILES.linkedChild.id}`,
        ),
      );
      screen.getByTestId('visibility-link-create');

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-confirm-back'),
      );

      screen.getByTestId('visibility-link-initiate-picker');
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        0,
      );
    });

    it('the confirmation back button calls router.back() (not setTarget) when reached via a pre-filled supporteePersonId — support-hub entry returns there in one step', () => {
      mockParams = {
        supporteePersonId: NAMED_PROFILES.linkedChild.id,
        supporteeName: NAMED_PROFILES.linkedChild.displayName,
      };
      renderInitiateScreen();

      // Pre-filled entry skips the picker — confirmation renders directly.
      screen.getByTestId('visibility-link-create');
      expect(
        screen.queryByTestId('visibility-link-initiate-picker'),
      ).toBeNull();

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-confirm-back'),
      );

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('the confirmation back button falls back to router.replace("/(app)/home") on a historyless pre-filled entry', () => {
      mockCanGoBack.mockReturnValue(false);
      mockParams = {
        supporteePersonId: NAMED_PROFILES.linkedChild.id,
        supporteeName: NAMED_PROFILES.linkedChild.displayName,
      };
      renderInitiateScreen();

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-confirm-back'),
      );

      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('the confirmation back button stays functional after an API error, and pressing it does not re-submit', async () => {
      const InitiateLinkScreen = require('./initiate').default;
      const rendered = renderScreen(<InitiateLinkScreen />, {
        profile: NAMED_PROFILES.guardian,
        profiles: [NAMED_PROFILES.guardian, NAMED_PROFILES.linkedChild],
        routes: {
          '/visibility/links': () => ERROR_RESPONSES.validation(),
        },
      });
      cleanupRender = rendered.cleanup;
      const { routedFetch } = rendered;

      fireEvent.press(
        screen.getByTestId(
          `visibility-link-initiate-picker-managed-${NAMED_PROFILES.linkedChild.id}`,
        ),
      );
      fireEvent.press(screen.getByTestId('visibility-link-create'));

      await waitFor(() => screen.getByTestId('visibility-link-create-error'));
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        1,
      );

      fireEvent.press(
        screen.getByTestId('visibility-link-initiate-confirm-back'),
      );

      screen.getByTestId('visibility-link-initiate-picker');
      // Back is pure navigation — it must not have triggered a retry/re-submit.
      expect(fetchCallsMatching(routedFetch, '/visibility/links')).toHaveLength(
        1,
      );
    });

    it('the existing-teen invite branch (V2 on) back button returns to the picker', () => {
      const original = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        true;
      try {
        renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

        fireEvent.press(
          screen.getByTestId('visibility-link-initiate-picker-existing-teen'),
        );
        screen.getByTestId('visibility-link-initiate-existing-teen-invite');

        fireEvent.press(
          screen.getByTestId('visibility-link-initiate-existing-teen-back'),
        );

        screen.getByTestId('visibility-link-initiate-picker');
      } finally {
        (
          FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }
        ).MODE_NAV_V2_ENABLED = original;
      }
    });

    it('the picker back button is reachable by accessible role+name (keyboard/screen-reader activation path)', () => {
      renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

      fireEvent.press(screen.getByRole('button', { name: 'Go Back' }));

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
