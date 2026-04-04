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

jest.mock('../../../hooks/use-retention', () => ({
  useSubmitRecallTest: () => ({
    mutate: mockRecallMutate,
  }),
}));

jest.mock('../../../components/session/ChatShell', () => {
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
          ReactReq.createElement(Text, { key: message.id }, message.content)
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
              ReactReq.createElement(Text, null, 'Send')
            )
          : null
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
        failureAction: 'redirect_to_library',
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

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(screen.getByTestId('remediation-card')).toBeTruthy();
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

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      expect(mockRecallMutate).toHaveBeenCalledWith(
        { topicId: 'topic-1', answer: 'I remember this topic well' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/your memory of this is solid/)).toBeTruthy();
    });
  });

  it('shows error message and rolls back count on failure', async () => {
    queuedRecallResults = [
      new Error('Network error') as unknown as Record<string, unknown>,
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(screen.getByText(/offline|can't be reached/i)).toBeTruthy();
    });
  });
});
