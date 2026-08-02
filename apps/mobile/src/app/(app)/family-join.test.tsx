import {
  fireEvent,
  render,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../test-utils/mock-api-routes';
import {
  readFamilyJoinContinuation,
  saveFamilyJoinContinuation,
} from '../../lib/family-join-journey-state';
import FamilyJoinScreen from './family-join';

const mockFetch = createRoutedMockFetch();
const mockReplace = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock(
  '../../lib/api-client', // gc1-allow: transport-boundary — real Hono RPC client wired over mockFetch
  () => ({
    ...jest.requireActual('../../lib/api-client'),
    useApiClient: () => {
      const { hc } = require('hono/client');
      return hc('http://localhost', { fetch: mockFetch });
    },
  }),
);

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const FAMILY_ORG_ID = '11111111-1111-4111-8111-111111111111';

function renderScreen() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <FamilyJoinScreen />
    </QueryClientProvider>,
  );
}

describe('FamilyJoinScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockParams = {};
  });

  it('keeps family movement, destination processing, and visibility as separate learner decisions', async () => {
    mockFetch.setRoute('/family-join/journey', {
      status: 'awaiting_guardian',
      familyOrgId: FAMILY_ORG_ID,
      authorizationForm: 'guardian',
      supportershipAuthority: 'guardian',
      supportershipDecision: 'pending',
      visibilityContract: null,
    });
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('family-join-learner-form')).toBeTruthy(),
    );

    fireEvent.changeText(screen.getByTestId('family-join-code'), 'family-code');
    const user = userEvent.setup();
    await user.press(screen.getByTestId('family-join-membership-accept'));
    await user.press(screen.getByTestId('family-join-processing-accept'));
    await user.press(screen.getByTestId('family-join-visibility-decline'));
    await user.press(screen.getByTestId('family-join-start'));

    await waitFor(() =>
      expect(screen.getByTestId('family-join-awaiting-guardian')).toBeTruthy(),
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'family-code',
      familyMembershipDecision: 'accept',
      destinationProcessingAssent: true,
      supportershipDecision: 'decline',
    });
    await expect(readFamilyJoinContinuation()).resolves.toMatchObject({
      role: 'learner',
      token: 'family-code',
      supportershipDecision: 'decline',
      lastStatus: 'awaiting_guardian',
    });

    await user.press(screen.getByTestId('family-join-guardian-handoff'));
    expect(screen.getByTestId('family-join-guardian-form')).toBeTruthy();
  });

  it('lets the same or an alternate signed-in guardian finish after provider return', async () => {
    mockParams = {
      code: 'family-code',
      verificationHandle: 'single-use-provider-handle',
    };
    mockFetch.setRoute('/family-join/journey', (url: string) => {
      if (url.includes('/guardian/initiate')) {
        return { authorityToken: 'server-minted-authority-token' };
      }
      return {
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'guardian',
        supportershipAuthority: 'guardian',
        supportershipDecision: 'accept',
        visibilityContract: null,
      };
    });
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('family-join-guardian-form')).toBeTruthy(),
    );
    const user = userEvent.setup();
    await user.press(screen.getByTestId('family-join-visibility-accept'));
    await user.press(screen.getByTestId('family-join-guardian-complete'));

    await waitFor(() =>
      expect(screen.getByTestId('family-join-guardian-finished')).toBeTruthy(),
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({
      token: 'family-code',
      verificationHandle: 'single-use-provider-handle',
      authorizeSupportership: true,
    });
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      token: 'family-code',
      authorityToken: 'server-minted-authority-token',
      authorizeSupportership: true,
    });
  });

  it('lands a ready learner journey, clears the code, and shows completion', async () => {
    mockFetch.setRoute('/family-join/journey', (url: string) => {
      if (url.endsWith('/finalize')) {
        return {
          status: 'joined',
          familyOrgId: FAMILY_ORG_ID,
          alreadyMember: false,
          storeCancelNudge: null,
          supportershipAuthority: 'learner',
          supportershipDecision: 'accept',
          visibilityContract: null,
        };
      }
      return {
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'self',
        supportershipAuthority: 'learner',
        supportershipDecision: 'accept',
        visibilityContract: null,
      };
    });
    const screen = renderScreen();
    await waitFor(() => screen.getByTestId('family-join-learner-form'));
    fireEvent.changeText(screen.getByTestId('family-join-code'), 'family-code');
    const user = userEvent.setup();
    await user.press(screen.getByTestId('family-join-membership-accept'));
    await user.press(screen.getByTestId('family-join-processing-accept'));
    await user.press(screen.getByTestId('family-join-visibility-accept'));
    await user.press(screen.getByTestId('family-join-start'));
    await waitFor(() => screen.getByTestId('family-join-ready'));
    await user.press(screen.getByTestId('family-join-finalize'));

    await waitFor(() => screen.getByTestId('family-join-complete'));
    await expect(readFamilyJoinContinuation()).resolves.toBeNull();
  });

  it('restores a relaunch, handles expiry, and safely exits without retaining the code', async () => {
    await saveFamilyJoinContinuation({
      version: 1,
      role: 'learner',
      token: 'restored-family-code',
      supportershipDecision: 'decline',
      lastStatus: 'awaiting_guardian',
    });
    mockFetch.setRoute('/family-join/journey', { status: 'expired' });
    const screen = renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId('family-join-restored')).toBeTruthy(),
    );
    expect(screen.getByTestId('family-join-code').props.value).toBe(
      'restored-family-code',
    );
    const user = userEvent.setup();
    await user.press(screen.getByTestId('family-join-membership-accept'));
    await user.press(screen.getByTestId('family-join-processing-accept'));
    await user.press(screen.getByTestId('family-join-start'));
    await waitFor(() => screen.getByTestId('family-join-terminal'));
    await expect(readFamilyJoinContinuation()).resolves.toBeNull();

    await user.press(screen.getByTestId('family-join-exit'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('keeps all learner decisions selected when policy drift requires a retry', async () => {
    let attempts = 0;
    mockFetch.setRoute('/family-join/journey', () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'The consent posture changed. Review and retry.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return {
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'self',
        supportershipAuthority: 'learner',
        supportershipDecision: 'accept',
        visibilityContract: null,
      };
    });
    const screen = renderScreen();
    await waitFor(() => screen.getByTestId('family-join-learner-form'));
    fireEvent.changeText(screen.getByTestId('family-join-code'), 'family-code');
    const user = userEvent.setup();
    await user.press(screen.getByTestId('family-join-membership-accept'));
    await user.press(screen.getByTestId('family-join-processing-accept'));
    await user.press(screen.getByTestId('family-join-visibility-accept'));
    await user.press(screen.getByTestId('family-join-start'));

    await waitFor(() => screen.getByTestId('family-join-error'));
    expect(
      screen.getByTestId('family-join-membership-accept').props
        .accessibilityState,
    ).toEqual({ checked: true });
    expect(
      screen.getByTestId('family-join-processing-accept').props
        .accessibilityState,
    ).toEqual({ checked: true });
    expect(
      screen.getByTestId('family-join-visibility-accept').props
        .accessibilityState,
    ).toEqual({ checked: true });

    await user.press(screen.getByTestId('family-join-start'));
    await waitFor(() => screen.getByTestId('family-join-ready'));
    expect(attempts).toBe(2);
  });
});
