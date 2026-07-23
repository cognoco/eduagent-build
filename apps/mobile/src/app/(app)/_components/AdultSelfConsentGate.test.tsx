/**
 * [WI-2547] Adult self-consent gate.
 *
 * The adult account owner's OWN processing + AI-disclosure consent. Coverage:
 *   - renders adult-owner copy, an accessible header, and reachable
 *     terms/privacy links;
 *   - accept submits once, even under a same-tick double tap;
 *   - a server failure keeps the gate mounted with an accessible error + retry;
 *   - sign-out (the cancel path) is reachable;
 *   - it is NOT the minor/guardian consent surface and NOT mentor-memory
 *     consent — no copy or control from either leaks in.
 *
 * The network boundary is the harness's routed mock fetch (`routes` /
 * `routedFetch`), not a hand-rolled global-fetch stub — `renderScreen` installs
 * its own routed fetch and would override one.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';
import type { Profile } from '../../../lib/profile';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// prettier-ignore
jest.mock('../../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't crash on import */ () => ({
  useTheme: () => ({ colorScheme: 'light' }),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    warning: '#a16207',
  }),
  useTokenVars: () => ({}),
}));

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({ user: { id: 'clerk-user-1' } }),
}));

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — Alert.alert is a no-op in jsdom */,
  () => ({ platformAlert: jest.fn() }),
);

const mockSignOutWithCleanup = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../../lib/sign-out' /* gc1-allow: native-boundary — signOutWithCleanup wraps Clerk + SecureStore which cannot run in jest */,
  () => ({
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

const { AdultSelfConsentGate } = require('./AdultSelfConsentGate');

const ACCEPT_PATH = '/consent/self/accept';

const adultOwner: Profile = createTestProfile({
  id: 'profile-adult-owner',
  accountId: 'account-solo',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
});

const ACCEPT_OK = {
  message: 'Consent recorded.',
  purposesGranted: ['platform_use', 'llm_disclosure'],
  termsVersion: '2026-05-31',
};

function serverError(): Response {
  return new Response(JSON.stringify({ code: 'INTERNAL', message: 'boom' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

let active: ReturnType<typeof renderScreen> | null = null;

afterEach(() => {
  if (active) active.cleanup();
  active = null;
  cleanupScreen();
  jest.clearAllMocks();
});

function renderGate(
  routes: Record<string, unknown> = { [ACCEPT_PATH]: ACCEPT_OK },
) {
  active = renderScreen(<AdultSelfConsentGate />, {
    profile: adultOwner,
    routes,
  });
  return active;
}

/** Requests the gate actually made to the self-accept contract. */
function acceptCalls(rendered: ReturnType<typeof renderScreen>): unknown[][] {
  return rendered.routedFetch.mock.calls.filter((call) =>
    String(call[0]).includes(ACCEPT_PATH),
  );
}

describe('AdultSelfConsentGate [WI-2547]', () => {
  it('renders adult-owner consent copy with an accessible header', async () => {
    renderGate();

    await screen.findByTestId('adult-self-consent-gate');
    screen.getByText('Confirm how we use your data');
    screen.getByText('Using MentoMate');
    screen.getByText('AI tutoring');
    expect(
      screen.getByRole('header', { name: 'Confirm how we use your data' }),
    ).toBeTruthy();
  });

  it('exposes terms and privacy as reachable, labelled links', async () => {
    renderGate();

    const terms = await screen.findByTestId('adult-self-consent-terms-link');
    const privacy = screen.getByTestId('adult-self-consent-privacy-link');
    expect(terms.props.accessibilityRole).toBe('link');
    expect(privacy.props.accessibilityRole).toBe('link');

    fireEvent.press(terms);
    expect(mockRouterPush).toHaveBeenCalledWith('/terms');

    fireEvent.press(privacy);
    expect(mockRouterPush).toHaveBeenCalledWith('/privacy');
  });

  it('submits the acceptance to the self-accept contract on explicit accept', async () => {
    const rendered = renderGate();

    fireEvent.press(await screen.findByTestId('adult-self-consent-accept'));

    await waitFor(() => expect(acceptCalls(rendered)).toHaveLength(1));
    const init = acceptCalls(rendered)[0]?.[1] as RequestInit | undefined;
    expect(String(init?.method).toUpperCase()).toBe('POST');
    // No caller-supplied identifiers — the server derives all of them.
    const rawBody = init?.body ? String(init.body) : '';
    expect(rawBody).not.toMatch(
      /personId|profileId|organizationId|lawfulBasis|termsVersion/i,
    );
  });

  it('refetches the user-scoped profiles query after a successful accept', async () => {
    const rendered = renderGate();
    const invalidateSpy = jest.spyOn(rendered.queryClient, 'invalidateQueries');

    fireEvent.press(await screen.findByTestId('adult-self-consent-accept'));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['profiles'] }),
      );
    });
  });

  it('suppresses a double tap — two presses submit once', async () => {
    const rendered = renderGate();

    const accept = await screen.findByTestId('adult-self-consent-accept');
    // Same tick: the second press lands before React re-renders as pending.
    fireEvent.press(accept);
    fireEvent.press(accept);

    await waitFor(() => expect(acceptCalls(rendered)).toHaveLength(1));
    // Settle, then confirm no late second request slipped through.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acceptCalls(rendered)).toHaveLength(1);
  });

  it('keeps the gate mounted with an accessible error and retry when the server fails', async () => {
    renderGate({ [ACCEPT_PATH]: () => serverError() });

    fireEvent.press(await screen.findByTestId('adult-self-consent-accept'));

    const error = await screen.findByTestId('adult-self-consent-error');
    expect(error.props.accessibilityRole).toBe('alert');
    screen.getByText("We couldn't save your agreement");
    // The gate is still up — no path into normal app use.
    expect(screen.getByTestId('adult-self-consent-gate')).toBeTruthy();
    // And the primary action becomes a retry.
    screen.getByText('Try again');
  });

  it('retries after a failure and succeeds', async () => {
    let shouldFail = true;
    const rendered = renderGate({
      [ACCEPT_PATH]: () => (shouldFail ? serverError() : ACCEPT_OK),
    });

    fireEvent.press(await screen.findByTestId('adult-self-consent-accept'));
    await screen.findByTestId('adult-self-consent-error');
    expect(acceptCalls(rendered)).toHaveLength(1);

    shouldFail = false;
    const invalidateSpy = jest.spyOn(rendered.queryClient, 'invalidateQueries');
    fireEvent.press(screen.getByTestId('adult-self-consent-accept'));

    await waitFor(() => expect(acceptCalls(rendered)).toHaveLength(2));
    // The successful retry still drives the profiles refetch.
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['profiles'] }),
      );
    });
  });

  it('offers sign-out as the cancel path', async () => {
    renderGate();

    fireEvent.press(await screen.findByTestId('adult-self-consent-sign-out'));
    await waitFor(() => expect(mockSignOutWithCleanup).toHaveBeenCalled());
  });

  it('is separate from the minor/guardian consent gates and mentor-memory consent', async () => {
    const rendered = renderGate();

    await screen.findByTestId('adult-self-consent-gate');
    // Not the child-consent surfaces.
    expect(screen.queryByTestId('consent-pending-gate')).toBeNull();
    expect(screen.queryByTestId('consent-withdrawn-gate')).toBeNull();
    expect(screen.queryByTestId('withdrawn-refresh-status')).toBeNull();
    expect(screen.queryByTestId('withdrawn-switch-profile')).toBeNull();

    fireEvent.press(screen.getByTestId('adult-self-consent-accept'));
    await waitFor(() => expect(acceptCalls(rendered)).toHaveLength(1));

    // Not the mentor-memory consent contract, and nothing else was called.
    for (const call of rendered.routedFetch.mock.calls) {
      expect(String(call[0])).not.toContain('learner-profile/consent');
    }
  });
});
