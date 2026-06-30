import { render } from '@testing-library/react-native';
import { SessionMessageActions, arePropsEqual } from './SessionMessageActions';
import type { SessionMessageActionsProps } from './SessionMessageActions';
import type { ChatMessage } from '../session';
import { tokens } from '../../lib/design-tokens';

const mockNotifyParentMutate = jest.fn();
jest.mock(
  '../../hooks/use-child-cap-notifications' /* gc1-allow: quota card notify mutation is outside SessionMessageActions stage-gating contract */,
  () => ({
    useNotifyParentChildCap: () => ({
      mutate: mockNotifyParentMutate,
      isPending: false,
    }),
  }),
);

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
    const { queryByTestId, queryByText } = render(
      <SessionMessageActions {...defaultProps} stage="teaching" />,
    );
    // Quick chips render for a question-like message
    expect(queryByTestId('quick-chip-too_hard')).toBeTruthy();
    // Feedback buttons render when eventId is present, but feedback actions
    // are compact icons rather than text chips.
    const helpful = queryByTestId(`message-feedback-helpful-evt-1`);
    const notHelpful = queryByTestId(`message-feedback-not-helpful-evt-1`);
    const incorrect = queryByTestId(`message-feedback-incorrect-evt-1`);
    expect(helpful).toBeTruthy();
    expect(notHelpful).toBeTruthy();
    expect(incorrect).toBeTruthy();
    expect(helpful?.props.className).toContain('h-9');
    expect(notHelpful?.props.className).toContain('w-9');
    expect(incorrect?.props.className).toContain('h-9');
    expect(queryByText('Helpful')).toBeNull();
    expect(queryByText('Not helpful')).toBeNull();
    expect(queryByText("That's incorrect")).toBeNull();
    expect(queryByTestId('bookmark-toggle-evt-1')).toBeNull();
  });

  it('renders bookmark toggle when bookmark props are provided', () => {
    const { getByTestId, queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        stage="teaching"
        bookmarkState={{ 'evt-1': null }}
        onToggleBookmark={jest.fn()}
      />,
    );

    expect(queryByTestId('bookmark-toggle-evt-1')).toBeTruthy();
    expect(getByTestId('bookmark-toggle-evt-1').props.className).toContain(
      'min-h-[36px]',
    );
    // [B-714] WCAG 44px tap target — the bookmark icon is 36px visual; hitSlop
    // must extend the hit area by 4px top+bottom (and left+right) so the
    // effective target reaches the 44px minimum.
    const hitSlop = getByTestId('bookmark-toggle-evt-1').props.hitSlop;
    expect(hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  it('keeps learning chips before the compact feedback control group', () => {
    const { getByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        stage="teaching"
        bookmarkState={{ 'evt-1': null }}
        onToggleBookmark={jest.fn()}
      />,
    );

    expect(getByTestId('quick-chip-too_hard'));
    expect(getByTestId('quick-chip-explain_differently'));
    expect(getByTestId('quick-chip-hint'));
    expect(
      getByTestId('message-feedback-controls-evt-1').props.className,
    ).toContain('ms-auto');
  });

  it('hides the Too easy chip while a challenge round is in flight', () => {
    const { queryByTestId, getByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={{ ...baseMessage, content: 'That explanation is solid.' }}
        stage="teaching"
        challengeRoundInFlight
      />,
    );

    expect(queryByTestId('quick-chip-too_easy')).toBeNull();
    expect(getByTestId('quick-chip-know_this')).toBeTruthy();
    expect(getByTestId('quick-chip-explain_differently')).toBeTruthy();
  });

  it('uses semantic theme color props for the bookmark icon', () => {
    const { getByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        stage="teaching"
        bookmarkState={{ 'evt-1': 'bookmark-1' }}
        onToggleBookmark={jest.fn()}
      />,
    );

    const bookmarkButton = getByTestId('bookmark-toggle-evt-1');
    const icon = bookmarkButton.findByProps({ name: 'bookmark' });
    expect(icon.props.color).toBe(tokens.light.colors.primary);
    expect(icon.props.className).toBeUndefined();
  });

  it('hides bookmark toggle when the assistant message has no eventId', () => {
    const { queryByTestId } = render(
      <SessionMessageActions
        {...defaultProps}
        message={{ ...baseMessage, eventId: undefined }}
        bookmarkState={{}}
        onToggleBookmark={jest.fn()}
      />,
    );

    expect(queryByTestId('bookmark-toggle-evt-1')).toBeNull();
  });

  it('hides chips and feedback when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="greeting" />,
    );
    expect(queryByTestId('quick-chip-too_hard')).toBeNull();
    expect(queryByTestId('message-feedback-helpful-evt-1')).toBeNull();
  });

  it('hides chips and feedback when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionMessageActions {...defaultProps} stage="orienting" />,
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
      />,
    );
    expect(queryByTestId('session-reconnect-reconnect-1')).toBeTruthy();
    expect(queryByTestId('message-feedback-helpful-reconnect-1')).toBeNull();
  });

  // [BUG-874] Visible label is enough for sighted users, but screen-reader
  // users cannot tell a chip is interactive without an explicit role.
  // accessibilityRole="button" maps to role="button" on web.
  describe('accessibility on chips and feedback buttons [BUG-874]', () => {
    it('quick-chip Pressables expose role=button + a11y label', () => {
      const { getByTestId } = render(
        <SessionMessageActions {...defaultProps} stage="teaching" />,
      );
      const tooHard = getByTestId('quick-chip-too_hard');
      expect(tooHard.props.accessibilityRole).toBe('button');
      expect(tooHard.props.accessibilityLabel).toBeTruthy();
    });

    it('reconnect chip exposes role=button + a11y label', () => {
      const reconnectMessage: ChatMessage = {
        id: 'reconnect-1',
        role: 'assistant',
        content: 'Lost connection',
        kind: 'reconnect_prompt',
      };
      const { getByTestId } = render(
        <SessionMessageActions
          {...defaultProps}
          message={reconnectMessage}
          stage="greeting"
        />,
      );
      const reconnect = getByTestId('session-reconnect-reconnect-1');
      expect(reconnect.props.accessibilityRole).toBe('button');
      expect(reconnect.props.accessibilityLabel).toBeTruthy();
    });

    it('helpful / not-helpful / incorrect feedback Pressables expose role=button + a11y label', () => {
      const { getByTestId } = render(
        <SessionMessageActions {...defaultProps} stage="teaching" />,
      );
      for (const id of [
        'message-feedback-helpful-evt-1',
        'message-feedback-not-helpful-evt-1',
        'message-feedback-incorrect-evt-1',
      ]) {
        const node = getByTestId(id);
        expect(node.props.accessibilityRole).toBe('button');
        expect(node.props.accessibilityLabel).toBeTruthy();
      }
    });
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
      />,
    );
    // QuotaExceededCard renders — we check it's not null (component has testID internally)
    expect(queryByTestId('quota-exceeded-card')).toBeTruthy();
  });
});

describe('SessionMessageActions arePropsEqual (React.memo comparator) [WI-964]', () => {
  it('skips render for identical props', () => {
    expect(arePropsEqual(defaultProps, { ...defaultProps })).toBe(true);
  });

  // The crux: messageFeedback is a shared Record whose identity changes whenever
  // ANY message's feedback changes. The comparator must look only at THIS
  // message's slice, so an unrelated message's feedback must NOT re-render us.
  it('skips render when only an UNRELATED message feedback changes', () => {
    const next: SessionMessageActionsProps = {
      ...defaultProps,
      messageFeedback: { 'some-other-message': 'helpful' },
    };
    expect(arePropsEqual(defaultProps, next)).toBe(true);
  });

  it('re-renders when THIS message feedback changes', () => {
    const next: SessionMessageActionsProps = {
      ...defaultProps,
      messageFeedback: { 'ai-1': 'helpful' },
    };
    expect(arePropsEqual(defaultProps, next)).toBe(false);
  });

  it('skips render when only an UNRELATED bookmark changes', () => {
    const prev: SessionMessageActionsProps = {
      ...defaultProps,
      bookmarkState: { 'evt-1': null },
    };
    const next: SessionMessageActionsProps = {
      ...defaultProps,
      bookmarkState: { 'evt-1': null, 'evt-other': 'bm-1' },
    };
    expect(arePropsEqual(prev, next)).toBe(true);
  });

  it('re-renders when THIS message bookmark changes', () => {
    const prev: SessionMessageActionsProps = {
      ...defaultProps,
      bookmarkState: { 'evt-1': null },
    };
    const next: SessionMessageActionsProps = {
      ...defaultProps,
      bookmarkState: { 'evt-1': 'bm-1' },
    };
    expect(arePropsEqual(prev, next)).toBe(false);
  });

  it('re-renders when the message identity changes', () => {
    const next: SessionMessageActionsProps = {
      ...defaultProps,
      message: { ...baseMessage },
    };
    expect(arePropsEqual(defaultProps, next)).toBe(false);
  });

  it('re-renders when a gating prop changes', () => {
    expect(
      arePropsEqual(defaultProps, { ...defaultProps, isStreaming: true }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, { ...defaultProps, stage: 'greeting' }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        latestAiMessageId: 'ai-2',
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        showWrongSubjectChip: true,
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, { ...defaultProps, isOwner: false }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        challengeRoundInFlight: true,
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, { ...defaultProps, userMessageCount: 4 }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        consumedQuickChipMessageId: 'ai-1',
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        quotaError: {
          type: 'daily',
          limit: 10,
          resetAt: '2026-01-01',
        } as any,
      }),
    ).toBe(false);
  });

  it('re-renders when a callback identity changes', () => {
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        handleMessageFeedback: jest.fn(),
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        handleQuickChip: jest.fn(),
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        onToggleBookmark: jest.fn(),
      }),
    ).toBe(false);
    expect(
      arePropsEqual(defaultProps, {
        ...defaultProps,
        handleReconnect: jest.fn(),
      }),
    ).toBe(false);
  });
});
