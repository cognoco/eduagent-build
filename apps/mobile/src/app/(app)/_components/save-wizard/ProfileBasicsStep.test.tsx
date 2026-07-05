import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileBasicsStep } from './ProfileBasicsStep';
import type { PreviewOnboardingStateV0 } from '../../../../lib/preview-onboarding-state';

// [WI-824] Transport-boundary mock: real api-client module with useApiClient
// overridden to inject a jest.fn() fetch so individual tests can throw typed
// UpstreamErrors without needing a running server.
const mockFetch = jest.fn();
jest.mock(
  '../../../../lib/api-client' /* gc1-allow: transport-boundary — mockFetch replaces network layer; all other api-client exports are real */,
  () => {
    const actual = jest.requireActual('../../../../lib/api-client');
    return {
      ...actual,
      useApiClient: () => {
        const { hc } = require('hono/client');
        return hc('http://localhost', { fetch: mockFetch });
      },
    };
  },
);

// Stub nativewind vars() which don't resolve in jest.
jest.mock(
  '../../../../lib/theme' /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so component imports don't blow up */,
  () => ({
    useThemeColors: () => ({
      accent: '#0ea5e9',
      background: '#18181b',
      border: '#d4d4d8',
      muted: '#71717a',
      surface: '#ffffff',
      textInverse: '#ffffff',
      textPrimary: '#18181b',
      textSecondary: '#52525b',
    }),
    useTheme: () => ({ colorScheme: 'dark' }),
    useTokenVars: () => ({}),
  }),
);

// expo-router: ProfileBasicsStep uses useRouter for the upgrade CTA navigation.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// preview-onboarding-state: setPreviewState writes to SecureStore, which is
// a native storage boundary — stub so tests don't require native modules.
jest.mock(
  '../../../../lib/preview-onboarding-state' /* gc1-allow: SecureStore native-storage boundary */,
  () => ({
    ...jest.requireActual('../../../../lib/preview-onboarding-state'),
    setPreviewState: jest.fn().mockResolvedValue(undefined),
    getPreviewState: jest.fn().mockResolvedValue(null),
    clearPreviewState: jest.fn().mockResolvedValue(undefined),
  }),
);

const basePreviewState: PreviewOnboardingStateV0 = {
  intent: 'child',
  path: 'parent_value_prop',
  createdAt: new Date().toISOString(),
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const parentProfile = {
  id: 'parent-1',
  displayName: 'Parent',
  birthYear: 1985,
  isOwner: true,
  conversationLanguage: 'en',
};

describe('ProfileBasicsStep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPush.mockReset();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('[WI-1407] blocks child save when the parent birth year is under 18', () => {
    const onComplete = jest.fn();

    render(
      <ProfileBasicsStep
        target="child"
        previewState={basePreviewState}
        onComplete={onComplete}
        onExitWizard={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-name'),
      'Teen Parent',
    );
    fireEvent.changeText(
      screen.getByTestId('save-basics-parent-birth-year'),
      String(new Date().getFullYear() - 16),
    );
    fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Kid');
    fireEvent.changeText(
      screen.getByTestId('save-basics-child-birth-year'),
      '2014',
    );

    expect(screen.getByTestId('save-basics-adult-required')).toBeTruthy();

    const continueButton = screen.getByTestId('save-basics-continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(continueButton);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  // [WI-824] ACCOUNT-05/35: a 402 PROFILE_LIMIT_EXCEEDED during child profile
  // creation must surface an upgrade alert + "See plans" CTA → /subscription,
  // NOT an inline error banner. Mirror of the pattern already tested for
  // create-profile.tsx (BUG-947).
  describe('[WI-824] PROFILE_LIMIT_EXCEEDED on child save (target="child")', () => {
    // Helper: fill in valid parent + child fields and press Continue.
    // target="child" triggers two POSTs: owner first, then child.
    // call 1 (owner POST): mockFetch receives parent profile response.
    // call 2 (child POST): mockFetch throws UpstreamError with PROFILE_LIMIT_EXCEEDED.
    async function renderAndSubmitChildSave() {
      const onComplete = jest.fn();
      const onExitWizard = jest.fn();
      const upgradeMessage =
        'Your subscription does not support additional profiles. Please upgrade to Family or Pro.';

      // Call 1: owner POST succeeds.
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: parentProfile }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // Call 2: child POST throws typed UpstreamError — this is what customFetch
      // produces when the server returns 402 + code=PROFILE_LIMIT_EXCEEDED.
      // See apps/mobile/src/lib/api-client.ts for the conversion.
      const { UpstreamError } = require('../../../../lib/api-errors');
      mockFetch.mockImplementationOnce(() => {
        throw new UpstreamError(upgradeMessage, 'PROFILE_LIMIT_EXCEEDED', 402);
      });

      render(
        <ProfileBasicsStep
          target="child"
          previewState={basePreviewState}
          onComplete={onComplete}
          onExitWizard={onExitWizard}
        />,
        { wrapper: Wrapper },
      );

      // Fill parent name + adult birth year (1985 → adult bracket; required
      // because ADULT_OWNER_GATE_ENABLED=true gates canSubmit when needsChild).
      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-name'),
        'Parent',
      );
      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-birth-year'),
        '1985',
      );
      // Fill child fields.
      fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Kid');
      fireEvent.changeText(
        screen.getByTestId('save-basics-child-birth-year'),
        '2014',
      );

      fireEvent.press(screen.getByTestId('save-basics-continue'));

      return { onComplete, onExitWizard, upgradeMessage };
    }

    it('[WI-824] fires upgrade alert and NOT inline child error on PROFILE_LIMIT_EXCEEDED', async () => {
      const { onExitWizard, upgradeMessage } = await renderAndSubmitChildSave();

      // (a) platformAlert (Alert.alert) called with upgrade copy and "See plans" button.
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledTimes(1);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      expect(alertCall[0]).toBe('Upgrade required');
      expect(alertCall[1]).toBe(upgradeMessage);

      const buttons = alertCall[2] as Array<{
        text?: string;
        style?: string;
        onPress?: () => void;
      }>;
      expect(buttons).toHaveLength(2);
      expect(buttons[0]?.text).toBe('Not now');
      expect(buttons[0]?.style).toBe('cancel');
      expect(buttons[1]?.text).toBe('See plans');

      // Pressing "See plans" must EXIT the wizard (markWizardDone) AND route to
      // subscription. [WI-824 Gate-2] Without the exit the inline SaveWizardGate
      // stays mounted and masks the pushed route — this is the regression guard.
      buttons[1]?.onPress?.();
      expect(onExitWizard).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');

      // (b) The inline child-error banner must NOT be shown.
      expect(screen.queryByTestId('save-basics-child-error')).toBeNull();
    });

    it('[WI-824] other child errors still render inline (regression guard)', async () => {
      const onComplete = jest.fn();
      // Call 1: owner POST succeeds.
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: parentProfile }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // Call 2: child POST throws a generic server error (not PROFILE_LIMIT_EXCEEDED).
      const { UpstreamError } = require('../../../../lib/api-errors');
      mockFetch.mockImplementationOnce(() => {
        throw new UpstreamError('Server error', 'INTERNAL_SERVER_ERROR', 500);
      });

      render(
        <ProfileBasicsStep
          target="child"
          previewState={basePreviewState}
          onComplete={onComplete}
          onExitWizard={jest.fn()}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-name'),
        'Parent',
      );
      fireEvent.changeText(
        screen.getByTestId('save-basics-parent-birth-year'),
        '1985',
      );
      fireEvent.changeText(screen.getByTestId('save-basics-child-name'), 'Kid');
      fireEvent.changeText(
        screen.getByTestId('save-basics-child-birth-year'),
        '2014',
      );

      fireEvent.press(screen.getByTestId('save-basics-continue'));

      // Generic error → inline banner, no alert.
      await waitFor(() => {
        expect(screen.getByTestId('save-basics-child-error')).toBeTruthy();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });
});
