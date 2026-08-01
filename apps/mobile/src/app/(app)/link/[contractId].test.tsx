import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import {
  createRoutedMockFetch,
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockActiveProfileId: string | undefined =
  '00000000-0000-4000-8000-000000000003';
const mockParams: Record<string, string> = {
  contractId: '00000000-0000-4000-8000-000000000001',
  supporteeName: 'Emma',
  supporterName: 'Zuzana',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock(
  /* gc1-allow: this route's matrix needs per-test supporter/supportee identity; preserve every real profile export and override only useProfile */
  '../../../lib/profile',
  () => ({
    ...jest.requireActual('../../../lib/profile'),
    useProfile: () => ({
      activeProfile: mockActiveProfileId
        ? { id: mockActiveProfileId }
        : undefined,
    }),
  }),
);

const mockFetch = createRoutedMockFetch();

jest.mock(
  /* gc1-allow: transport-boundary test uses routed Hono fetch mock */
  '../../../lib/api-client',
  () => {
    const {
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    return mockApiClientFactory(mockFetch);
  },
);

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

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const LinkContractScreen = require('./[contractId]').default;

  return render(
    <QueryClientProvider client={queryClient}>
      <LinkContractScreen />
    </QueryClientProvider>,
  );
}

describe('LinkContractScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockParams.contractId = CONTRACT.id;
    mockParams.supporteeName = 'Emma';
    mockParams.supporterName = 'Zuzana';
    mockActiveProfileId = CONTRACT.supporterPersonId;
    mockCanGoBack.mockReturnValue(true);
  });

  it('loads the visibility contract and accepts for the active side', async () => {
    mockFetch.setRoute(
      '/visibility/links/',
      (url: string, init?: RequestInit) => {
        if (url.endsWith('/contract')) return CONTRACT;
        if (url.endsWith('/accept')) {
          return {
            ...CONTRACT,
            supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          };
        }
        return new Response(JSON.stringify({}), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );

    renderScreen();

    await screen.findByTestId('visibility-contract-card');
    screen.getByText('Visibility contract');
    screen.getByText('You are asking to support Emma.');
    screen.getByText('Private chats, notes and journal artifacts stay hidden.');

    fireEvent.press(screen.getByTestId('visibility-contract-accept'));

    await waitFor(() =>
      expect(fetchCallsMatching(mockFetch, '/accept')).toHaveLength(1),
    );
    const body = extractJsonBody<{
      actorPersonId: string;
      audience: string;
      contractVersion: number;
    }>(fetchCallsMatching(mockFetch, '/accept')[0]?.init);
    expect(body).toEqual({
      actorPersonId: '00000000-0000-4000-8000-000000000003',
      audience: 'supporter',
      contractVersion: CONTRACT.contractVersion,
    });
  }, 10_000);

  it('shows review and revoke actions after both sides accepted', async () => {
    mockActiveProfileId = CONTRACT.supporteePersonId;
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'accepted',
          supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          supporteeAcceptedAt: '2026-06-20T12:02:00.000Z',
        };
      }
      if (url.endsWith('/revoke')) {
        return {
          supportershipId: CONTRACT.supportershipId,
          supporteePersonId: CONTRACT.supporteePersonId,
          supporterPersonId: CONTRACT.supporterPersonId,
          revokedAt: '2026-06-20T12:03:00.000Z',
          graceEndsAt: '2026-06-27T12:03:00.000Z',
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-review');
    expect(
      screen.getAllByText('You can review this agreement here any time.'),
    ).toHaveLength(2);

    fireEvent.press(screen.getByTestId('visibility-contract-revoke'));

    await waitFor(() =>
      expect(fetchCallsMatching(mockFetch, '/revoke')).toHaveLength(1),
    );
    const revokeCall = fetchCallsMatching(mockFetch, '/revoke')[0];
    expect(revokeCall?.url).toContain(CONTRACT.supportershipId);
    expect(revokeCall?.url).not.toContain(CONTRACT.id);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor'),
    );
  });

  it('does not expose agreement actions to a non-party viewer', async () => {
    mockActiveProfileId = '00000000-0000-4000-8000-000000000099';
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'accepted',
          supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          supporteeAcceptedAt: '2026-06-20T12:02:00.000Z',
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-contract-card');

    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-revoke')).toBeNull();
  });

  it('explains a pending supporter invite opened with the wrong profile and offers a profile switch', async () => {
    mockActiveProfileId = '00000000-0000-4000-8000-000000000099';
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          supporteeAcceptedAt: '2026-06-20T12:01:00.000Z',
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-wrong-profile');
    screen.getByText('This invite is for a specific profile');
    screen.getByText(
      'This invite can only be opened with the profile it was sent to. Choose that profile, then open the invite again.',
    );
    screen.getByText('Back to Mentor');
    expect(screen.queryByTestId('visibility-contract-card')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.queryByTestId('visibility-link-review')).toBeNull();

    fireEvent.press(screen.getByTestId('visibility-link-wrong-profile-switch'));
    expect(mockPush).toHaveBeenCalledWith('/profiles');

    fireEvent.press(screen.getByTestId('visibility-link-wrong-profile-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('returns a historyless wrong-profile invite to the Mentor root via the named Back action', async () => {
    mockActiveProfileId = '00000000-0000-4000-8000-000000000099';
    mockCanGoBack.mockReturnValue(false);
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) return CONTRACT;
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-wrong-profile');
    fireEvent.press(screen.getByTestId('visibility-link-wrong-profile-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('explains a restamped supportee invite opened with the wrong profile instead of a view-only card', async () => {
    mockActiveProfileId = '00000000-0000-4000-8000-000000000099';
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'restamped',
          contractVersion: 2,
          supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          supporteeAcceptedAt: null,
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-wrong-profile');
    expect(screen.queryByTestId('visibility-contract-card')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.queryByTestId('visibility-link-review')).toBeNull();
    expect(
      screen.getByTestId('visibility-link-wrong-profile-switch'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('visibility-link-wrong-profile-back'),
    ).toBeTruthy();
  });

  it('explains a pending invite opened with no active profile and offers a profile switch', async () => {
    mockActiveProfileId = undefined;
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) return CONTRACT;
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-wrong-profile');
    expect(screen.queryByTestId('visibility-contract-card')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('visibility-link-wrong-profile-switch'));
    expect(mockPush).toHaveBeenCalledWith('/profiles');
  });

  it('returns a historyless contract deep link to the V2 Mentor root', async () => {
    mockCanGoBack.mockReturnValue(false);
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) return CONTRACT;
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-contract-card');
    fireEvent.press(screen.getByTestId('visibility-link-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('fails closed for a lapsed invite and keeps a safe return action', async () => {
    mockActiveProfileId = CONTRACT.supporteePersonId;
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'lapsed',
          supporterAcceptedAt: null,
          supporteeAcceptedAt: null,
        };
      }
      return {};
    });

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('visibility-contract-card')).toBeTruthy(),
    );
    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.queryByTestId('visibility-link-review')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-revoke')).toBeNull();
    expect(screen.getByTestId('visibility-link-back')).toBeTruthy();
  });

  it('requires both sides to reaccept a restamped contract', async () => {
    mockActiveProfileId = CONTRACT.supporteePersonId;
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'restamped',
          contractVersion: 2,
          supporterAcceptedAt: null,
          supporteeAcceptedAt: null,
        };
      }
      return {};
    });

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('visibility-contract-card')).toBeTruthy(),
    );
    expect(screen.getByTestId('visibility-contract-accept')).toBeTruthy();
    expect(screen.queryByTestId('visibility-link-review')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-revoke')).toBeNull();
  });

  it('refetches after a stale-version conflict and requires a fresh explicit accept', async () => {
    let contractReads = 0;
    let acceptCalls = 0;
    let resolveRestampedContract!: (value: unknown) => void;
    const restampedContract = {
      ...CONTRACT,
      status: 'restamped' as const,
      contractVersion: 2,
    };
    const deferredRestampedContract = new Promise<unknown>((resolve) => {
      resolveRestampedContract = resolve;
    });
    mockFetch.setRoute(
      '/visibility/links/',
      (url: string, init?: RequestInit) => {
        if (url.endsWith('/contract')) {
          contractReads += 1;
          return contractReads === 1 ? CONTRACT : deferredRestampedContract;
        }
        if (url.endsWith('/accept')) {
          acceptCalls += 1;
          if (acceptCalls === 1) {
            return new Response(
              JSON.stringify({
                code: 'CONFLICT',
                message:
                  'This visibility contract changed. Review the current version before accepting.',
              }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }
          return {
            ...CONTRACT,
            status: 'restamped',
            contractVersion: 2,
            supporterAcceptedAt: '2026-06-20T12:03:00.000Z',
          };
        }
        return new Response(JSON.stringify({}), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId('visibility-contract-accept'));
    await screen.findByTestId('visibility-link-accept-error');

    fireEvent.press(screen.getByTestId('visibility-link-accept-retry'));
    await waitFor(() => expect(contractReads).toBe(2));
    expect(fetchCallsMatching(mockFetch, '/accept')).toHaveLength(1);
    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.getByTestId('visibility-link-accept-error')).toBeTruthy();

    await act(async () => {
      resolveRestampedContract(restampedContract);
      await deferredRestampedContract;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(screen.getByTestId('visibility-contract-accept')).toBeTruthy(),
    );
    expect(screen.queryByTestId('visibility-link-accept-error')).toBeNull();

    fireEvent.press(screen.getByTestId('visibility-contract-accept'));
    await waitFor(() =>
      expect(fetchCallsMatching(mockFetch, '/accept')).toHaveLength(2),
    );
    const body = extractJsonBody<{ contractVersion: number }>(
      fetchCallsMatching(mockFetch, '/accept')[1]?.init,
    );
    expect(body?.contractVersion).toBe(2);
  });
});
