import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockRecallMutate = jest.fn();
let queuedRecallResults: Array<Record<string, unknown>> = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({
    topicId: 'topic-1',
    subjectId: 'subject-1',
  }),
}));

jest.mock('../../../lib/theme', () => ({
  useTheme: () => ({
    persona: 'learner',
    setPersona: jest.fn(),
    accentPresetId: null,
    setAccentPresetId: jest.fn(),
  }),
}));

jest.mock('../../../hooks/use-retention', () => ({
  useSubmitRecallTest: () => ({
    mutate: mockRecallMutate,
  }),
}));

jest.mock('../../../components/session/ChatShell', () => {
  const ReactReq = require('react');
  const { View, Text } = require('react-native');

  return {
    ChatShell: ({
      messages,
      inputAccessory,
      footer,
    }: {
      messages: Array<{ id: string; content: string }>;
      inputAccessory?: React.ReactNode;
      footer?: React.ReactNode;
    }) =>
      ReactReq.createElement(
        View,
        { testID: 'mock-chat-shell' },
        messages.map((message) =>
          ReactReq.createElement(Text, { key: message.id }, message.content)
        ),
        ReactReq.isValidElement(inputAccessory) ? inputAccessory : null,
        ReactReq.isValidElement(footer) ? footer : null
      ),
    animateResponse: (
      content: string,
      setMessages: React.Dispatch<
        React.SetStateAction<
          Array<{ id: string; role: string; content: string }>
        >
      >,
      setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
      onComplete?: () => void
    ) => {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: `ai-${prev.length}`, role: 'ai', content },
      ]);
      onComplete?.();
      return () => undefined;
    },
  };
});

jest.mock('../../../components/progress', () => {
  const ReactReq = require('react');
  const { View, Text } = require('react-native');
  return {
    RemediationCard: () =>
      ReactReq.createElement(
        View,
        { testID: 'remediation-card' },
        ReactReq.createElement(Text, null, 'Remediation ready')
      ),
  };
});

const RecallTestScreen = require('./recall-test').default;

describe('RecallTestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queuedRecallResults = [];
    mockRecallMutate.mockImplementation(
      (
        _input: Record<string, unknown>,
        options?: {
          onSuccess?: (value: Record<string, unknown>) => void;
          onError?: (error: Error) => void;
        }
      ) => {
        const next = queuedRecallResults.shift();
        if (next instanceof Error) {
          options?.onError?.(next);
          return;
        }
        if (next) {
          options?.onSuccess?.(next);
        }
      }
    );
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
        failureAction: 'redirect_to_learning_book',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          suggestionText: 'Review the topic again.',
          retentionStatus: 'forgotten',
        },
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(mockRecallMutate).toHaveBeenNthCalledWith(
        1,
        { topicId: 'topic-1', attemptMode: 'dont_remember' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Try remembering the central definition first.')
      ).toBeTruthy();
    });

    expect(screen.getByText('Still stuck')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(screen.getByTestId('remediation-card')).toBeTruthy();
    });

    expect(screen.queryByTestId('recall-dont-remember-button')).toBeNull();
  });
});
