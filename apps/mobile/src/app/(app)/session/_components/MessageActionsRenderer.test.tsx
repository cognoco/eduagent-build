import { View } from 'react-native';
import { render } from '@testing-library/react-native';

import { renderSessionMessageActions } from './MessageActionsRenderer';

type ChatMessage = Parameters<typeof renderSessionMessageActions>[0];

const baseOptions = {
  birthYear: null,
  lowConfidenceMessageId: null,
  setLowConfidenceMessageId: jest.fn(),
  continueWithMessage: jest.fn(),
  handleStartNewSession: jest.fn(),
  handleHomeBack: jest.fn(),
  isStreaming: false,
  actionProps: {
    isStreaming: false,
    latestAiMessageId: null,
    consumedQuickChipMessageId: null,
    userMessageCount: 0,
    showWrongSubjectChip: false,
    messageFeedback: {},
    quotaError: null,
    isOwner: true,
    stage: 'teaching' as const,
    handleQuickChip: jest.fn(),
    handleMessageFeedback: jest.fn(),
    handleReconnect: jest.fn(),
  },
};

describe('renderSessionMessageActions session-expired escape buttons', () => {
  it('[B-714] both session-expired escape Pressables meet WCAG 44px tap target', () => {
    const message: ChatMessage = {
      id: 'm1',
      kind: 'session_expired',
      role: 'assistant',
    } as unknown as ChatMessage;

    const node = renderSessionMessageActions(message, baseOptions);
    const { getByTestId } = render(<View>{node}</View>);
    const startNew = getByTestId('session-expired-new-session');
    const goHome = getByTestId('session-expired-go-home');
    // Visual height bumped from 40px -> 44px to meet WCAG 2.1 minimum tap
    // target without needing hitSlop (full-width CTAs in a message footer).
    expect(startNew.props.className).toContain('min-h-[44px]');
    expect(goHome.props.className).toContain('min-h-[44px]');
    expect(startNew.props.className).not.toContain('min-h-[40px]');
    expect(goHome.props.className).not.toContain('min-h-[40px]');
  });
});
