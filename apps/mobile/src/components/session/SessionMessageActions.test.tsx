import { render } from '@testing-library/react-native';
import { SessionMessageActions } from './SessionMessageActions';
import type { SessionMessageActionsProps } from './SessionMessageActions';
import type { ChatMessage } from '../session';

const baseMessage: ChatMessage = {
  id: 'ai-1',
  role: 'assistant',
  content: 'Here is a question for you?',
  eventId: 'evt-1',
};

const defaultProps: SessionMessageActionsProps = {
  message: baseMessage,
  isStreaming: false,
  latestAiMessageId: 'ai-1',
  consumedQuickChipMessageId: null,
  userMessageCount: 3,
  showWrongSubjectChip: false,
  messageFeedback: {},
  quotaError: null,
  isOwner: true,
  stage: 'teaching',
  handleQuickChip: jest.fn(),
  handleMessageFeedback: jest.fn(),
  handleReconnect: jest.fn(),
};

describe('SessionMessageActions stage gating', () => {
  it('renders chips and feedback when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="teaching" />
    );
    // Quick chips render for a question-like message
    expect(queryByTestId('quick-chip-too_hard')).toBeTruthy();
    // Feedback buttons render when eventId is present
    expect(queryByTestId(`message-feedback-helpful-evt-1`)).toBeTruthy();
    expect(queryByTestId('bookmark-toggle-evt-1')).toBeNull();
  });

  it('renders bookmark toggle when bookmark props are provided', () => {
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        stage="teaching"
        bookmarkState={{ 'evt-1': null }}
        onToggleBookmark={jest.fn()}
      />
    );

    expect(queryByTestId('bookmark-toggle-evt-1')).toBeTruthy();
  });

  it('hides chips and feedback when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="greeting" />
    );
    expect(queryByTestId('quick-chip-too_hard')).toBeNull();
    expect(queryByTestId('message-feedback-helpful-evt-1')).toBeNull();
  });

  it('hides chips and feedback when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="orienting" />
    );
    expect(queryByTestId('quick-chip-too_hard')).toBeNull();
    expect(queryByTestId('message-feedback-helpful-evt-1')).toBeNull();
  });

  it('still renders reconnect button regardless of stage', () => {
    const reconnectMessage: ChatMessage = {
      id: 'reconnect-1',
      role: 'assistant',
      content: 'Lost connection',
      kind: 'reconnect_prompt',
    };
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={reconnectMessage}
        stage="greeting"
      />
    );
    expect(queryByTestId('session-reconnect-reconnect-1')).toBeTruthy();
    expect(queryByTestId('message-feedback-helpful-reconnect-1')).toBeNull();
  });

  it('still renders quota exceeded card regardless of stage', () => {
    const quotaMessage: ChatMessage = {
      id: 'quota-1',
      role: 'user',
      content: 'Quota exceeded',
      kind: 'quota_exceeded',
    };
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={quotaMessage}
        stage="greeting"
        quotaError={{ type: 'daily', limit: 10, resetAt: '2026-01-01' } as any}
      />
    );
    // QuotaExceededCard renders — we check it's not null (component has testID internally)
    expect(queryByTestId('quota-exceeded-card')).toBeTruthy();
  });
});
