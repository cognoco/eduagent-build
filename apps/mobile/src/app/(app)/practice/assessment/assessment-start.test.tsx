import React from 'react';
import {
  render as rtlRender,
  fireEvent,
  act,
} from '@testing-library/react-native';
import {
  ConsentRequiredError,
  QuotaExceededError,
  type AssessmentEvaluation,
  type AssessmentStatus,
} from '@eduagent/schemas';
import {
  createScreenWrapper,
  createTestProfile,
} from '../../../../test-utils/screen-render';

// ---------------------------------------------------------------------------
// Assessment start failure tests
// Focuses on: missing params guard, send failure → ErrorFallback shown, retry
// ---------------------------------------------------------------------------

// Mocks

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockSearchParams: Record<string, string> = {
  subjectId: 'subject-1',
  topicId: 'topic-1',
  topicTitle: 'Spanish Greetings',
  topicDescription: 'Basic greetings',
  pedagogyMode: 'vocabulary',
  languageCode: 'es',
};

jest.mock(
  '../../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({ primary: '#6366f1', textPrimary: '#1f2937' }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../../lib/platform-alert' /* gc1-allow: wraps native Alert.alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

jest.mock(
  '../../../../lib/haptics' /* gc1-allow: wraps native Haptics module unavailable in JSDOM */,
  () => ({
    hapticSuccess: jest.fn(),
  }),
);

// Hooks
let mockActiveAssessmentData: null | {
  id: string;
  exchangeHistory: [];
  status: 'in_progress';
} = null;
let mockActiveAssessmentIsLoading = false;
const mockCreateAssessmentMutateAsync = jest.fn();
const mockSubmitAnswerMutateAsync = jest.fn();
const mockDeclineRefreshMutateAsync = jest.fn();

jest.mock(
  '../../../../hooks/use-assessments' /* gc1-allow: fetches from API network boundary */,
  () => ({
    useActiveAssessment: () => ({
      data: mockActiveAssessmentData,
      isLoading: mockActiveAssessmentIsLoading,
    }),
    useCreateAssessment: () => ({
      mutateAsync: mockCreateAssessmentMutateAsync,
    }),
    useSubmitAnswer: () => ({
      mutateAsync: mockSubmitAnswerMutateAsync,
    }),
    useDeclineAssessmentRefresh: () => ({
      mutateAsync: mockDeclineRefreshMutateAsync,
      isPending: false,
    }),
  }),
);

// ChatShell stub — renders an input + send button so we can trigger handleSend
jest.mock(
  '../../../../components/session' /* gc1-allow: ChatShell depends on native keyboard + gesture modules */,
  () => ({
    ChatShell: ({
      messages,
      onSend,
      footer,
    }: {
      title: string;
      messages: { id: string; role: string; content: string }[];
      onSend: (text: string) => void;
      isStreaming: boolean;
      inputDisabled: boolean;
      disabledReason?: string;
      footer?: unknown;
    }) => {
      const { Pressable, Text, TextInput, View } = require('react-native');
      const { useState } = require('react');
      const [input, setInput] = useState('');
      return (
        <View testID="chat-shell">
          {messages.map((m: { id: string; role: string; content: string }) => (
            <Text key={m.id} testID={`msg-${m.id}`}>
              {m.content}
            </Text>
          ))}
          <TextInput
            testID="chat-input"
            value={input}
            onChangeText={setInput}
          />
          <Pressable
            testID="chat-send"
            onPress={() => {
              void onSend(input);
            }}
          >
            <Text>Send</Text>
          </Pressable>
          {footer ?? null}
        </View>
      );
    },
    animateResponse: jest.fn(
      (
        text: string,
        setMessages: (
          fn: (prev: { id: string; role: string; content: string }[]) => {
            id: string;
            role: string;
            content: string;
          }[],
        ) => void,
        setIsStreaming: (v: boolean) => void,
        onComplete?: () => void,
      ) => {
        setMessages((prev) => [
          ...prev,
          { id: `animated-${Date.now()}`, role: 'assistant', content: text },
        ]);
        setIsStreaming(false);
        if (onComplete) onComplete();
      },
    ),
  }),
);

// Button stub
jest.mock(
  '../../../../components/common/Button' /* gc1-allow: Button uses NativeWind/className which requires native runtime */,
  () => ({
    Button: ({
      label,
      onPress,
      testID,
      loading,
      disabled,
    }: {
      label: string;
      onPress: () => void | Promise<void>;
      testID?: string;
      loading?: boolean;
      disabled?: boolean;
      variant?: string;
    }) => {
      const { Pressable, Text } = require('react-native');
      return (
        <Pressable
          onPress={() => void onPress()}
          testID={testID ?? `btn-${label}`}
          disabled={disabled || loading}
        >
          <Text>{label}</Text>
        </Pressable>
      );
    },
  }),
);

// ErrorFallback stub — renders primary and secondary action buttons
jest.mock(
  '../../../../components/common/ErrorFallback' /* gc1-allow: uses NativeWind className requiring native runtime */,
  () => ({
    ErrorFallback: ({
      message,
      primaryAction,
      secondaryAction,
    }: {
      variant?: string;
      message: string;
      primaryAction: {
        label: string;
        testID?: string;
        onPress: () => void;
        disabled?: boolean;
      };
      secondaryAction?: { label: string; testID?: string; onPress: () => void };
    }) => {
      const { Pressable, Text, View } = require('react-native');
      return (
        <View testID="error-fallback">
          <Text testID="error-message">{message}</Text>
          <Pressable
            onPress={primaryAction.onPress}
            testID={primaryAction.testID ?? 'error-primary'}
            disabled={primaryAction.disabled}
          >
            <Text>{primaryAction.label}</Text>
          </Pressable>
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              testID={secondaryAction.testID ?? 'error-secondary'}
            >
              <Text>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  }),
);

// RewardBurst stub
jest.mock(
  '../../../../components/common/RewardBurst' /* gc1-allow: uses Reanimated + native Haptics */,
  () => ({
    RewardBurst: ({
      testID,
    }: {
      testID?: string;
      variant?: string;
      intensity?: string;
      message?: string;
    }) => {
      const { View } = require('react-native');
      return <View testID={testID ?? 'reward-burst'} />;
    },
  }),
);

const AssessmentScreen = require('./index').default as React.ComponentType;

function renderAssessmentScreen() {
  const owner = createTestProfile({
    id: 'owner-profile',
    isOwner: true,
    birthYear: 1980,
  });
  const { wrapper } = createScreenWrapper({
    activeProfile: owner,
    profiles: [owner],
  });

  return rtlRender(<AssessmentScreen />, { wrapper });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssessmentScreen — start failures and error states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAssessmentMutateAsync.mockReset();
    mockSubmitAnswerMutateAsync.mockReset();
    mockDeclineRefreshMutateAsync.mockReset();
    mockActiveAssessmentData = null;
    mockActiveAssessmentIsLoading = false;
    mockSearchParams = {
      subjectId: 'subject-1',
      topicId: 'topic-1',
      topicTitle: 'Spanish Greetings',
      topicDescription: 'Basic greetings',
      pedagogyMode: 'vocabulary',
      languageCode: 'es',
    };
  });

  describe('entry guard', () => {
    it('redirects home when opened directly in parent-proxy mode', () => {
      const parent = createTestProfile({
        id: 'parent-profile',
        isOwner: true,
        birthYear: 1980,
      });
      const child = createTestProfile({
        id: 'child-profile',
        isOwner: false,
        birthYear: 2014,
      });
      const { wrapper } = createScreenWrapper({
        activeProfile: child,
        profiles: [parent, child],
        isExplicitProxyMode: true,
      });

      const { getByTestId, queryByTestId } = rtlRender(<AssessmentScreen />, {
        wrapper,
      });

      expect(getByTestId('redirect').props.children).toBe('/(app)/home');
      expect(queryByTestId('chat-shell')).toBeNull();
    });
  });

  describe('missing params guard', () => {
    it('renders missing-params fallback when subjectId is absent', () => {
      mockSearchParams = { topicId: 'topic-1' };
      const { getByTestId } = renderAssessmentScreen();
      getByTestId('assessment-go-back');
    });

    it('renders missing-params fallback when topicId is absent', () => {
      mockSearchParams = { subjectId: 'subject-1' };
      const { getByTestId } = renderAssessmentScreen();
      getByTestId('assessment-go-back');
    });

    it('go-back button calls goBackOrReplace to home', () => {
      mockSearchParams = {};
      const { getByTestId } = renderAssessmentScreen();
      fireEvent.press(getByTestId('assessment-go-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/home',
      );
    });
  });

  describe('submit answer failure → actionable error shown', () => {
    it('shows ErrorFallback in chat footer when submitAnswer throws', async () => {
      mockCreateAssessmentMutateAsync.mockResolvedValueOnce({
        assessment: { id: 'assessment-new-1' },
      });
      mockSubmitAnswerMutateAsync.mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      const { getByTestId } = renderAssessmentScreen();
      getByTestId('chat-shell');

      fireEvent.changeText(getByTestId('chat-input'), 'Hola');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      // ErrorFallback should be in the footer with classified recovery copy.
      getByTestId('error-fallback');
      const errorMessage = getByTestId('error-message');
      expect(errorMessage.props.children).toContain(
        "Looks like you're offline",
      );
    });

    it('retry button re-sends the last message', async () => {
      mockCreateAssessmentMutateAsync.mockResolvedValueOnce({
        assessment: { id: 'assessment-new-1' },
      });
      mockSubmitAnswerMutateAsync
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          evaluation: {
            feedback: 'Good job!',
            masteryScore: 0.85,
            weakAreas: [],
          },
          status: 'in_progress',
        });

      const { getByTestId } = renderAssessmentScreen();
      fireEvent.changeText(getByTestId('chat-input'), 'Buenos días');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Error is shown
      getByTestId('error-fallback');

      // Press retry
      await act(async () => {
        fireEvent.press(getByTestId('assessment-error-retry'));
        await Promise.resolve();
        await Promise.resolve();
      });

      // submitAnswer should have been called a second time
      expect(mockSubmitAnswerMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('go-home button from error fallback calls goBackOrReplace', async () => {
      mockCreateAssessmentMutateAsync.mockResolvedValueOnce({
        assessment: { id: 'assessment-new-1' },
      });
      mockSubmitAnswerMutateAsync.mockRejectedValueOnce(
        new Error('Server error'),
      );

      const { getByTestId } = renderAssessmentScreen();
      fireEvent.changeText(getByTestId('chat-input'), 'Hola');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.press(getByTestId('assessment-error-home'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/home',
      );
    });
  });

  describe('create assessment failure', () => {
    it('shows error in chat stream when createAssessment throws', async () => {
      mockCreateAssessmentMutateAsync.mockRejectedValueOnce(
        new Error('Quota exhausted'),
      );

      const { getByTestId } = renderAssessmentScreen();
      fireEvent.changeText(getByTestId('chat-input'), 'I am ready');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      // BUG-CANDIDATE: P1 — if createAssessment fails, the error message
      // is injected into the chat via animateResponse but the user is shown
      // an in-chat string (classified by formatApiError). There is no explicit
      // "retry from ErrorFallback" for assessment creation failures — the user
      // must re-type their answer. This creates a silent dead-end if the quota
      // error message isn't actionable (no "Go to billing" CTA).
      getByTestId('error-fallback');
    });

    it('routes quota failures to the subscription screen instead of offering blind retry', async () => {
      mockCreateAssessmentMutateAsync.mockRejectedValueOnce(
        new QuotaExceededError("You've used all your questions.", {
          tier: 'free',
          effectiveAccessTier: 'free',
          quotaModel: 'per-profile',
          profileRole: 'child',
          reason: 'daily',
          resetsAt: '2026-05-27T00:00:00.000Z',
          monthlyLimit: 100,
          usedThisMonth: 100,
          dailyLimit: 10,
          usedToday: 10,
          topUpCreditsRemaining: 0,
          upgradeOptions: [],
        }),
      );

      const { getByTestId, queryByTestId } = renderAssessmentScreen();
      fireEvent.changeText(getByTestId('chat-input'), 'I am ready');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(queryByTestId('assessment-error-retry')).toBeNull();
      fireEvent.press(getByTestId('assessment-error-upgrade'));

      expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
    });

    it('gives consent failures a way back instead of retrying the same request', async () => {
      mockCreateAssessmentMutateAsync.mockRejectedValueOnce(
        new ConsentRequiredError(
          'Consent is required before this action is available.',
          'CONSENT_REQUIRED',
        ),
      );

      const { getByTestId, queryByTestId } = renderAssessmentScreen();
      fireEvent.changeText(getByTestId('chat-input'), 'I am ready');
      await act(async () => {
        fireEvent.press(getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(queryByTestId('assessment-error-retry')).toBeNull();
      fireEvent.press(getByTestId('assessment-error-back'));

      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/practice',
      );
    });
  });

  describe('terminal result UI', () => {
    function terminalResponse(
      status: AssessmentStatus,
      overrides: Partial<AssessmentEvaluation> = {},
    ) {
      return {
        evaluation: {
          feedback: 'That is enough to finish this check.',
          passed: status === 'passed',
          shouldEscalateDepth: false,
          masteryScore:
            status === 'passed' ? 0.92 : status === 'borderline' ? 0.68 : 0.42,
          qualityRating: status === 'failed_exhausted' ? 0 : 4,
          weakAreas:
            status === 'borderline'
              ? ['Use greetings in context', 'Pick the right register']
              : [],
          ...overrides,
        },
        status,
      };
    }

    async function submitTerminalAnswer(status: AssessmentStatus) {
      mockCreateAssessmentMutateAsync.mockResolvedValueOnce({
        assessment: { id: 'assessment-new-1' },
      });
      mockSubmitAnswerMutateAsync.mockResolvedValueOnce(
        terminalResponse(status),
      );

      const view = renderAssessmentScreen();
      fireEvent.changeText(view.getByTestId('chat-input'), 'Hola means hello');
      await act(async () => {
        fireEvent.press(view.getByTestId('chat-send'));
        await Promise.resolve();
        await Promise.resolve();
      });
      return view;
    }

    it('renders passed result summary, done CTA, and celebration', async () => {
      const { getByTestId, queryByTestId } =
        await submitTerminalAnswer('passed');

      getByTestId('assessment-result-card');
      getByTestId('assessment-done');
      getByTestId('assessment-pass-celebration');
      getByTestId('assessment-quality-rating');
      expect(queryByTestId('assessment-gap-fill')).toBeNull();

      fireEvent.press(getByTestId('assessment-done'));

      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/practice',
      );
    });

    it('renders borderline gap-fill and decline-refresh actions', async () => {
      mockDeclineRefreshMutateAsync.mockResolvedValueOnce({ ok: true });

      const { getByTestId, queryByTestId } =
        await submitTerminalAnswer('borderline');

      getByTestId('assessment-result-card');
      getByTestId('assessment-gap-fill');
      getByTestId('assessment-decline-refresh');
      getByTestId('assessment-quality-rating');
      expect(queryByTestId('assessment-pass-celebration')).toBeNull();

      fireEvent.press(getByTestId('assessment-gap-fill'));

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            subjectId: 'subject-1',
            topicId: 'topic-1',
            mode: 'gap_fill',
            gaps: JSON.stringify([
              'Use greetings in context',
              'Pick the right register',
            ]),
          }),
        }),
      );

      await act(async () => {
        fireEvent.press(getByTestId('assessment-decline-refresh'));
        await Promise.resolve();
      });

      expect(mockDeclineRefreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/practice',
      );
    });

    it('renders failed_exhausted learning-session and not-now actions without celebration', async () => {
      const { getByTestId, queryByTestId } =
        await submitTerminalAnswer('failed_exhausted');

      getByTestId('assessment-result-card');
      getByTestId('assessment-start-session');
      getByTestId('assessment-not-now');
      expect(queryByTestId('assessment-quality-rating')).toBeNull();
      expect(queryByTestId('assessment-pass-celebration')).toBeNull();

      fireEvent.press(getByTestId('assessment-start-session'));

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: {
            subjectId: 'subject-1',
            topicId: 'topic-1',
            mode: 'learning',
          },
        }),
      );

      fireEvent.press(getByTestId('assessment-not-now'));

      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/practice',
      );
    });
  });
});
