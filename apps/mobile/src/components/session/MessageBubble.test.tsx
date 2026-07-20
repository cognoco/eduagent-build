// ---------------------------------------------------------------------------
// MessageBubble render-boundary tests
//
// Focus: regression guard for [BUG-941] — full LLM envelope JSON leaking
// into the chat bubble after a per-message tool tap. The fix applies
// `stripEnvelopeJson` at the AI-message render boundary, so any path that
// puts envelope-shaped content into a message's `content` field still
// renders just the `.reply` text (defense-in-depth alongside the API-side
// parseExchangeEnvelope on persistence and projectAiResponseContent on
// transcript hydration).
// ---------------------------------------------------------------------------

import { render } from '@testing-library/react-native';
import { MessageBubble } from './MessageBubble';

// react-native-markdown-display is a third-party native renderer. We mock it
// with a verbatim <Text> passthrough so plain queryByText assertions still
// work against the markdown body, AND so we can spy on the props ThemedMarkdown
// forwards — specifically `mergeStyle: false`, the invisible-text fix that must
// reach the renderer for AI messages. See docs/llm-issues.md.
const mockMarkdownDisplay = jest.fn();

jest.mock(
  'react-native-markdown-display' /* gc1-allow: third-party native renderer, cannot run in jsdom */,
  () => {
    const React = require('react');
    const { Text } = require('react-native');
    return (props: { children: string }) => {
      mockMarkdownDisplay(props);
      return React.createElement(Text, null, props.children);
    };
  },
);

beforeEach(() => {
  mockMarkdownDisplay.mockClear();
});

describe('MessageBubble — escaped Unicode streaming [WI-2124]', () => {
  it('[WI-2124 AC-2b] decodes an escape completed across streamed chunks', () => {
    const firstChunk = 'Rayleigh scattering follows 1/\\u03';
    const { getByText, rerender } = render(
      <MessageBubble sender="assistant" content={firstChunk} streaming />,
    );

    expect(getByText(firstChunk)).toBeTruthy();

    rerender(
      <MessageBubble
        sender="assistant"
        content={`${firstChunk}bb^4`}
        streaming
      />,
    );

    expect(getByText('Rayleigh scattering follows 1/λ^4')).toBeTruthy();
  });
});

describe('MessageBubble — mentor notice receipt', () => {
  const notice = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    concept: 'keeping the same operation on both sides',
    correctionHint: 'Subtract five before dividing.',
  };

  it('renders an understated receipt beneath a completed assistant reply', () => {
    const { getByTestId, getByText } = render(
      <MessageBubble
        sender="assistant"
        content="That gives x = 6."
        mentorNotice={notice}
      />,
    );

    expect(getByTestId('mentor-notice-chip')).toBeTruthy();
    expect(getByText(/keeping the same operation on both sides/)).toBeTruthy();
  });

  it.each([
    { sender: 'assistant' as const, streaming: true },
    { sender: 'user' as const, streaming: false },
  ])(
    'does not render for sender=$sender streaming=$streaming',
    ({ sender, streaming }) => {
      const { queryByTestId } = render(
        <MessageBubble
          sender={sender}
          content="Message"
          streaming={streaming}
          mentorNotice={notice}
        />,
      );

      expect(queryByTestId('mentor-notice-chip')).toBeNull();
    },
  );
});

describe('MessageBubble — envelope leak regression [BUG-941]', () => {
  it('renders only the .reply field when AI content is a full envelope JSON', () => {
    // Mirrors the exact wire payload from BUG-941: a full schema-valid
    // envelope where the LLM (correctly) wrapped a Buongiorno pronunciation
    // hint, but the chat bubble nevertheless rendered the raw JSON.
    const envelope =
      '{"reply":"Very close. The letters gi together make a j sound, like in jungle. Try saying Buongiorno once more.","signals":{"partial_progress":true,"needs_deepening":false,"understanding_check":false},"ui_hints":{"note_prompt":{"show":false,"post_session":false},"fluency_drill":{"active":false,"duration_s":0,"score":{"correct":0,"total":0}}}}';

    const { queryByText } = render(
      <MessageBubble sender="assistant" content={envelope} />,
    );

    // The reply text renders.
    expect(queryByText(/Very close/)).toBeTruthy();
    expect(queryByText(/Buongiorno/)).toBeTruthy();

    // None of the envelope's outer JSON wrapping reaches the bubble.
    // These exact substrings appear in the raw envelope but must NOT render.
    expect(queryByText(/"reply":/)).toBeNull();
    expect(queryByText(/"signals":/)).toBeNull();
    expect(queryByText(/"partial_progress":/)).toBeNull();
    expect(queryByText(/"ui_hints":/)).toBeNull();
    expect(queryByText(/"fluency_drill":/)).toBeNull();
  });

  it('forwards mergeStyle=false to the markdown renderer for AI messages (invisible-text regression guard)', () => {
    // The invisible-text fix lives in ThemedMarkdown, which passes
    // mergeStyle={false} so its custom className-coloured prose rules own the
    // text colour. This guards that AI bubbles render through ThemedMarkdown
    // with that prop intact — if someone swaps ThemedMarkdown for a raw
    // <Markdown> or drops mergeStyle, this fails.
    render(<MessageBubble sender="assistant" content="Hola means hello." />);

    expect(mockMarkdownDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        children: 'Hola means hello.',
        mergeStyle: false,
      }),
    );
  });

  it('does not route user messages through the markdown renderer', () => {
    // User content renders via plain <Text>, never ThemedMarkdown, so the
    // markdown renderer must not be invoked at all.
    render(<MessageBubble sender="user" content="My answer" />);

    expect(mockMarkdownDisplay).not.toHaveBeenCalled();
  });

  it('renders plain prose AI content unchanged', () => {
    // The Markdown renderer splits prose into multiple <Text> nodes; assert
    // simple substring presence to avoid coupling to its tokenization.
    const prose = 'Lets break it down. What would you try first?';
    const { queryByText } = render(
      <MessageBubble sender="assistant" content={prose} />,
    );
    expect(queryByText(/Lets break it down/)).toBeTruthy();
    expect(queryByText(/would you try first/)).toBeTruthy();
  });

  it('renders user content with literal envelope shape unchanged (no projection)', () => {
    // Defensive: user-authored content is never envelope-shaped in practice,
    // but if a user pastes JSON we must NOT rewrite it to "look like" a reply
    // — that would silently mutate their input. Confirm the user message
    // stays verbatim. User messages render via plain <Text> (no markdown
    // tokenization), so an exact-string queryByText is the right check.
    const userText = '{"reply":"my own JSON paste"}';
    const { queryByText } = render(
      <MessageBubble sender="user" content={userText} />,
    );
    expect(queryByText(userText)).toBeTruthy();
  });

  it('renders the reply when envelope is wrapped in a markdown JSON code fence', () => {
    const fenced = '```json\n{"reply":"Fenced answer","signals":{}}\n```';
    const { queryByText } = render(
      <MessageBubble sender="assistant" content={fenced} />,
    );
    expect(queryByText(/Fenced answer/)).toBeTruthy();
    // Markdown fence and inner JSON wrapper must not reach the bubble.
    expect(queryByText(/"reply":/)).toBeNull();
    expect(queryByText(/"signals":/)).toBeNull();
  });

  it('leaves AI content alone when envelope is malformed (truncated)', () => {
    // Better to surface raw content for triage than swallow it: the user
    // can still scroll back and read whatever did stream through. The
    // partial reply text reaches the bubble; the markdown renderer's exact
    // tokenization of the JSON wrapper is implementation detail we don't
    // pin in this test.
    const truncated = '{"reply":"Half a sent';
    const { queryByText } = render(
      <MessageBubble sender="assistant" content={truncated} />,
    );
    expect(queryByText(/Half a sent/)).toBeTruthy();
  });
});

describe('verification badge styling', () => {
  it('renders evaluate badge as inline text below the bubble', () => {
    const { getByText } = render(
      <MessageBubble
        sender="assistant"
        content="Good work!"
        verificationBadge="evaluate"
      />,
    );
    expect(getByText('✓ THINK-DEEPER CLEARED'));
  });

  it('renders teach_back badge as inline text below the bubble', () => {
    const { getByText } = render(
      <MessageBubble
        sender="assistant"
        content="Good work!"
        verificationBadge="teach_back"
      />,
    );
    expect(getByText('✓ TEACH-BACK CLEARED'));
  });

  it('does not render badge for user messages', () => {
    const { queryByText } = render(
      <MessageBubble
        sender="user"
        content="My answer"
        verificationBadge="evaluate"
      />,
    );
    expect(queryByText(/CLEARED/)).toBeNull();
  });
});

describe('MessageBubble long messages', () => {
  it('renders long assistant messages fully without a collapse chevron', () => {
    const { getByTestId, queryByTestId } = render(
      <MessageBubble
        sender="assistant"
        content="Long answer with enough layout height to become collapsible."
      />,
    );

    expect(queryByTestId('message-collapse-toggle')).toBeNull();
    expect(getByTestId('message-ai-content').props.style).toBeUndefined();
  });
});
