import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  NAMED_PROFILES,
  renderScreen,
  type RenderScreenOptions,
  type RenderScreenResult,
} from '../../../test-utils/screen-render';
import {
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockReplace = jest.fn();
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
  useRouter: () => ({ replace: mockReplace }),
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

  it('shows an empty-state message when there are zero eligible managed children', () => {
    renderInitiateScreen({ profiles: [NAMED_PROFILES.guardian] });

    screen.getByTestId('visibility-link-initiate-picker-empty');
  });
});
