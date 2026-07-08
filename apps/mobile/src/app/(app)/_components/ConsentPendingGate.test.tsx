/**
 * [ACCOUNT-22 / ACCOUNT-21 / QA — consent pending gate] WI-871
 *
 * Deterministic coverage for the consent-pending gate's two distinct states
 * and the parent-email management surface that the flow-revision sweep could
 * only reach as "source-checked":
 *   - PENDING (no email sent yet)              → "Get parent consent" send-to-parent CTA
 *   - PARENTAL_CONSENT_REQUESTED (email sent)  → waiting UI (masked email,
 *     auto-check copy, manual "Check again", Resend, Change-email)
 *   - Resend (WI-261/WI-374): POSTs /consent/resend with NO email on the wire
 *   - Change-email: POSTs /consent/request with the NEW recipient
 *   - Change-email same-as-child guard blocks submit
 *
 * No real mailbox/SMTP is involved — `/consent/my-status`, `/consent/resend`
 * and `/consent/request` are answered by the routed mock fetch, and the
 * consent state (PENDING vs REQUESTED) is driven by the active profile fixture.
 * The only true-delivery boundary (the email actually arriving) is out of
 * scope here and stays Blocked in the flow plan.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';
import { fetchCallsMatching } from '../../../test-utils/mock-api-routes';
import type { Profile } from '../../../lib/profile';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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

let mockChildEmail: string | undefined;
jest.mock('@clerk/expo', () => ({
  // useApiClient (real, reached through the harness AppContextProvider) calls
  // useAuth().getToken — provide a stub token so the routed fetch is reached.
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      id: 'clerk-user-1',
      primaryEmailAddress: mockChildEmail
        ? { emailAddress: mockChildEmail }
        : undefined,
    },
  }),
}));

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — Alert.alert is a no-op in jsdom; stub captures the call for assertions */,
  () => ({ platformAlert: (...args: unknown[]) => mockPlatformAlert(...args) }),
);

jest.mock(
  '../../../lib/sign-out' /* gc1-allow: native-boundary — signOutWithCleanup wraps Clerk + SecureStore which cannot run in jest */,
  () => ({ signOutWithCleanup: jest.fn().mockResolvedValue(undefined) }),
);

const { ConsentPendingGate } = require('./ConsentPendingGate');

const CHILD_ID = 'profile-child';

function childProfile(
  consentStatus: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED',
): Profile {
  return createTestProfile({
    id: CHILD_ID,
    accountId: 'account-family',
    displayName: 'Emma',
    isOwner: false,
    birthYear: 2014,
    consentStatus,
  });
}

function myStatusRoute(parentEmail: string | null) {
  return () =>
    new Response(
      JSON.stringify({
        consentStatus: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail,
        consentType: 'GDPR',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
}

let active: ReturnType<typeof renderScreen> | null = null;

afterEach(() => {
  if (active) active.cleanup();
  active = null;
  cleanupScreen();
  mockChildEmail = undefined;
  jest.clearAllMocks();
});

describe('ConsentPendingGate — PENDING (no email sent yet) [ACCOUNT-22]', () => {
  it('shows the "send to parent" CTA and routes to /consent when pressed', async () => {
    active = renderScreen(<ConsentPendingGate />, {
      profile: childProfile('PENDING'),
      routes: {
        // PENDING: my-status returns no recipient yet.
        '/consent/my-status': myStatusRoute(null),
      },
    });

    await screen.findByTestId('consent-pending-gate');
    // PENDING shows the send-to-parent CTA, NOT the waiting "Check again" UI.
    const sendBtn = screen.getByTestId('consent-send-to-parent');
    expect(screen.queryByTestId('consent-check-again')).toBeNull();

    fireEvent.press(sendBtn);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/consent',
      params: { profileId: CHILD_ID },
    });
  });
});

describe('ConsentPendingGate — REQUESTED (waiting UI) [ACCOUNT-22 / ACCOUNT-21]', () => {
  it('shows the masked recipient, auto-check copy, and a manual "Check again" control', async () => {
    active = renderScreen(<ConsentPendingGate />, {
      profile: childProfile('PARENTAL_CONSENT_REQUESTED'),
      routes: { '/consent/my-status': myStatusRoute('p***t@example.com') },
    });

    await screen.findByTestId('consent-pending-gate');
    // Waiting UI — NOT the PENDING send-to-parent CTA.
    await screen.findByTestId('consent-check-again');
    expect(screen.queryByTestId('consent-send-to-parent')).toBeNull();

    // Masked recipient surfaced from /consent/my-status.
    await screen.findByText(/p\*\*\*t@example\.com/);
    // Auto-check reassurance copy.
    screen.getByText('Checking automatically…');
  });

  it('[WI-261/WI-374] Resend POSTs /consent/resend with NO email and never /consent/request', async () => {
    active = renderScreen(<ConsentPendingGate />, {
      profile: childProfile('PARENTAL_CONSENT_REQUESTED'),
      routes: {
        '/consent/my-status': myStatusRoute('p***t@example.com'),
        '/consent/resend': () =>
          new Response(
            JSON.stringify({
              message: 'Consent request sent to parent',
              consentType: 'GDPR',
              emailStatus: 'sent',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    });

    const resendBtn = await screen.findByTestId('consent-resend');
    active.routedFetch.mockClear();
    fireEvent.press(resendBtn);

    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/consent/resend').length,
      ).toBeGreaterThan(0);
    });

    // Success feedback rendered; no call carried a recipient or hit /request.
    await screen.findByTestId('consent-resend-success');
    for (const [input, init] of active.routedFetch.mock.calls) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const body = String((init as RequestInit | undefined)?.body ?? '');
      expect(body).not.toContain('parentEmail');
      expect(body).not.toContain('p***t@example.com');
      if (url.includes('/consent/')) {
        expect(url).not.toContain('/consent/request');
      }
    }
  });

  it('Change-email POSTs /consent/request with the NEW recipient and confirms via alert', async () => {
    active = renderScreen(<ConsentPendingGate />, {
      profile: childProfile('PARENTAL_CONSENT_REQUESTED'),
      routes: {
        '/consent/my-status': myStatusRoute('p***t@example.com'),
        '/consent/request': () =>
          new Response(
            JSON.stringify({
              message: 'Consent request sent to parent',
              consentType: 'GDPR',
              emailStatus: 'sent',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    });

    fireEvent.press(await screen.findByTestId('consent-change-email'));

    const input = await screen.findByTestId('consent-new-email-input');
    fireEvent.changeText(input, 'newparent@example.com');

    const submit = screen.getByTestId('consent-change-email-submit');
    expect(
      submit.props.accessibilityState?.disabled ?? submit.props.disabled,
    ).toBeFalsy();
    active.routedFetch.mockClear();
    fireEvent.press(submit);

    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/consent/request').length,
      ).toBeGreaterThan(0);
    });

    // The NEW recipient was carried on the change-email request.
    const requestCall = fetchCallsMatching(
      active.routedFetch,
      '/consent/request',
    )[0]!;
    const body = String(requestCall.init?.body ?? '');
    expect(body).toContain('newparent@example.com');

    // The parent is told where the link was sent.
    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalled();
    });
  });

  it('Change-email blocks submit when the entered address is the child’s own email', async () => {
    mockChildEmail = 'kid@example.com';
    active = renderScreen(<ConsentPendingGate />, {
      profile: childProfile('PARENTAL_CONSENT_REQUESTED'),
      routes: { '/consent/my-status': myStatusRoute('p***t@example.com') },
    });

    fireEvent.press(await screen.findByTestId('consent-change-email'));
    fireEvent.changeText(
      await screen.findByTestId('consent-new-email-input'),
      'kid@example.com',
    );

    await screen.findByTestId('consent-change-same-email-warning');
    const submit = screen.getByTestId('consent-change-email-submit');
    expect(
      submit.props.accessibilityState?.disabled ?? submit.props.disabled,
    ).toBeTruthy();
  });
});
