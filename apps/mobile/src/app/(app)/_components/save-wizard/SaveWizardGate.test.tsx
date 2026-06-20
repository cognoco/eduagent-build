import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaveWizardGate } from './SaveWizardGate';
import { getPreviewState } from '../../../../lib/preview-onboarding-state';

// [WI-824 Gate-2] Gate-level propagation test: proves the upgrade CTA's
// wizard-exit signal travels CTA → ProfileBasicsStep → SaveWizardGate →
// layout (onComplete = markWizardDone). The unit ProfileBasicsStep test proves
// the CTA calls onExitWizard; this proves the gate wires onExitWizard to the
// layout's onComplete, so the inline gate actually unmounts. Full "subscription
// visible" proof is the staging / E2E surface.

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

jest.mock(
  '../../../../lib/theme' /* gc1-allow: nativewind vars() does not resolve in jest */,
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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

// SaveWizardGate reads useSafeAreaInsets; provide zero-insets without a provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// analytics.track writes to a native/remote boundary — stub it.
jest.mock(
  '../../../../lib/analytics' /* gc1-allow: telemetry boundary */,
  () => ({ track: jest.fn() }),
);

// preview-onboarding-state: SecureStore native boundary. getPreviewState
// returns a valid 'child'-intent state so the gate renders past its null guard
// and defaultTargetFor preselects target='child'.
jest.mock(
  '../../../../lib/preview-onboarding-state' /* gc1-allow: SecureStore native-storage boundary */,
  () => ({
    ...jest.requireActual('../../../../lib/preview-onboarding-state'),
    setPreviewState: jest.fn().mockResolvedValue(undefined),
    getPreviewState: jest.fn().mockResolvedValue({
      intent: 'child',
      path: 'parent_value_prop',
      createdAt: new Date().toISOString(),
    }),
    clearPreviewState: jest.fn().mockResolvedValue(undefined),
  }),
);

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

describe('SaveWizardGate — PROFILE_LIMIT upgrade CTA exits the wizard (WI-824 Gate-2)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPush.mockReset();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('propagates the wizard-exit signal (CTA → step → gate → layout onComplete)', async () => {
    const onComplete = jest.fn(); // = layout markWizardDone
    const onStart = jest.fn();

    // owner POST succeeds, child POST hits the profile limit.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: parentProfile }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { UpstreamError } = require('../../../../lib/api-errors');
    mockFetch.mockImplementationOnce(() => {
      throw new UpstreamError(
        'Upgrade to add more profiles.',
        'PROFILE_LIMIT_EXCEEDED',
        402,
      );
    });

    render(<SaveWizardGate onComplete={onComplete} onStart={onStart} />, {
      wrapper: Wrapper,
    });

    // Step 1: target preselected to 'child' (defaultTargetFor) → continue.
    const step1Continue = await screen.findByTestId(
      'save-wizard-step-1-continue',
    );
    fireEvent.press(step1Continue);

    // Step 2: ProfileBasicsStep — fill parent (adult) + child, submit.
    fireEvent.changeText(
      await screen.findByTestId('save-basics-parent-name'),
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

    // Upgrade alert fires; press "See plans".
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((b) => b.text === 'See plans')?.onPress?.();

    // The CTA's onExitWizard is the gate's onComplete (markWizardDone): pressing
    // "See plans" must fire it so the inline gate unmounts, AND route to plans.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('shows a visible loading state while preview state is being probed', () => {
    (getPreviewState as jest.Mock).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<SaveWizardGate onComplete={jest.fn()} onStart={jest.fn()} />, {
      wrapper: Wrapper,
    });

    screen.getByTestId('save-wizard-loading');
    screen.getByText('Loading your saved preview...');
  });
});
