import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import {
  renderScreen,
  createRoutedMockFetch,
} from '../../../../test-utils/screen-render-harness';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en' }],
}));

let queuedRecallResults: Array<Record<string, unknown> | Error> = [];

const mockPush = jest.fn();
jest.mock('expo-router', () => // gc1-allow: native-boundary — expo-router requires native Expo runtime
  require('../../../test-utils/native-shims').expoRouterShim(
    { push: mockPush },
    { topicId: 'topic-1', subjectId: 'subject-1' },
  ),
);

const mockFetch = createRoutedMockFetch({
  'recall-test': (_url: string, _init?: RequestInit) => {
    const next = queuedRecallResults.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next) {
      return new Response(JSON.stringify({ result: next }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

jest.mock('../../../lib/api-client', () =>
  require('../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock('../../../components/session/ChatShell', () => { // gc1-allow: ChatShell drives async animation state-machine; real component requires native Reanimated bindings not available in Jest
  const ReactReq = require('react');
  const { View, Text, Pressable } = require('react-native');

  return {
    ChatShell: ({
      messages,
      inputAccessory,
      footer,
      onSend,
    }: {
      messages: Array<{ id: string; content: string }>;
      inputAccessory?: React.ReactNode;
      footer?: React.ReactNode;
      onSend?: (text: string) => void;
    }) =>
      ReactReq.createElement(
        View,
        { testID: 'mock-chat-shell' },
        messages.map((message) =>
          ReactReq.createElement(Text, { key: message.id }, message.content),
        ),
        ReactReq.isValidElement(inputAccessory) ? inputAccessory : null,
        ReactReq.isValidElement(footer) ? footer : null,
        onSend
          ? ReactReq.createElement(
              Pressable,
              {
                testID: 'mock-send-button',
                onPress: () => onSend('I remember this topic well'),
              },
              ReactReq.createElement(Text, null, 'Send'),
            )
          : null,
      ),
    animateResponse: (
      content: string,
      setMessages: React.Dispatch<
        React.SetStateAction<
          Array<{ id: string; role: string; content: string }>
        >
      >,
      setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
      onComplete?: () => void,
    ) => {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: `ai-${prev.length}`, role: 'assistant', content },
      ]);
      onComplete?.();
      return () => undefined;
    },
  };
});

jest.mock('../../../components/progress', () => { // gc1-allow: RemediationCard is a complex UI component; this shim isolates recall-test flow from remediation rendering
  const ReactReq = require('react');
  const { View, Text } = require('react-native');
  return {
    RemediationCard: () =>
      ReactReq.createElement(
        View,
        { testID: 'remediation-card' },
        ReactReq.createElement(Text, null, 'Remediation ready'),
      ),
  };
});

const RecallTestScreen = require('./recall-test').default;

describe('RecallTestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queuedRecallResults = [];
    mockFetch.mockClear();
  });

  it('shows a hint first, then remediation when the learner is still stuck', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 1,
        failureAction: 'feedback_only',
        hint: 'Try remembering the central definition first.',
      },
      {
        passed: false,
        failureCount: 3,
        failureAction: 'redirect_to_library',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          suggestionText: 'Review the topic again.',
          retentionStatus: 'forgotten',
        },
      },
    ];

    renderScreen(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('recall-test'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Try remembering the central definition first.'),
      ).toBeTruthy();
    });

    screen.getByText('Still stuck');

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      screen.getByTestId('remediation-card');
    });

    expect(screen.queryByTestId('recall-dont-remember-button')).toBeNull();
  });

  it('shows remediation immediately when first result is redirect', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 3,
        failureAction: 'redirect_to_library',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          retentionStatus: 'forgotten',
        },
      },
    ];

    renderScreen(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      screen.getByTestId('remediation-card');
    });
  });

  it('shows success message when text recall passes', async () => {
    queuedRecallResults = [
      {
        passed: true,
        failureCount: 0,
        masteryScore: 0.75,
        xpChange: 'earned',
        nextReviewAt: '2026-04-02T10:00:00.000Z',
      },
    ];

    renderScreen(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('recall-test'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      screen.getByText(/your memory of this is solid/);
    });
  });

  it('shows error message and rolls back count on failure', async () => {
    // UX-DE-L8: errors are surfaced via platformAlert (not as AI chat bubble).
    const alertSpy = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
    queuedRecallResults = [
      new Error('Network error') as unknown as Record<string, unknown>,
    ];

    renderScreen(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    // platformAlert passes through Alert.alert(title, message, buttons?, options?),
    // so assert positional args 0 and 1 explicitly rather than using
    // toHaveBeenCalledWith (which enforces arity).
    const [title, message] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('Something went wrong');
    expect(message).toMatch(/offline|can't be reached/i);
    alertSpy.mockRestore();
  });
});
