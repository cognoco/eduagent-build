import { renderHook } from '@testing-library/react-native';
import type { InputMode, LiveTranscriptResponse } from '@eduagent/schemas';

import type { ChatMessage } from '../../../../components/session';
import { useSessionTranscriptHydration } from './use-session-transcript-hydration';

function makeTranscript(
  overrides: Partial<LiveTranscriptResponse> = {},
): LiveTranscriptResponse {
  return {
    archived: false,
    session: {
      sessionId: 'session-1',
      subjectId: 'subject-1',
      topicId: 'topic-1',
      sessionType: 'learning',
      inputMode: 'voice',
      startedAt: '2026-05-26T08:00:00.000Z',
      exchangeCount: 3,
      milestonesReached: [],
    },
    exchanges: [
      {
        eventId: 'event-user-1',
        role: 'user',
        content: 'What is a linear equation?',
        timestamp: '2026-05-26T08:00:01.000Z',
      },
      {
        eventId: 'event-ai-1',
        role: 'assistant',
        content: 'It is an equation that graphs as a line.',
        timestamp: '2026-05-26T08:00:02.000Z',
        escalationRung: 4,
      },
      {
        eventId: 'event-user-trailing',
        role: 'user',
        content: 'Trailing user turn without assistant',
        timestamp: '2026-05-26T08:00:03.000Z',
      },
    ],
    ...overrides,
  };
}

function renderHydrationHook(args?: {
  routeSessionId?: string;
  liveTranscript?: LiveTranscriptResponse | null;
  currentMessages?: ChatMessage[];
  openingContent?: string;
}) {
  const setMessages = jest.fn();
  const setExchangeCount = jest.fn();
  const setEscalationRung = jest.fn();
  const setInputMode = jest.fn();
  const setActiveSessionId = jest.fn();
  const setResumedBanner = jest.fn();

  renderHook(() =>
    useSessionTranscriptHydration({
      routeSessionId: args?.routeSessionId ?? 'session-1',
      liveTranscript: args?.liveTranscript ?? makeTranscript(),
      messagesRef: {
        current: args?.currentMessages ?? [],
      },
      openingContentRef: {
        current: args?.openingContent ?? 'Opening greeting',
      },
      setMessages,
      setExchangeCount,
      setEscalationRung,
      setInputMode,
      setActiveSessionId,
      setResumedBanner,
    }),
  );

  return {
    setMessages,
    setExchangeCount,
    setEscalationRung,
    setInputMode,
    setActiveSessionId,
    setResumedBanner,
  };
}

describe('useSessionTranscriptHydration', () => {
  it('hydrates paired transcript messages and ignores a trailing unmatched user turn', () => {
    const setters = renderHydrationHook();

    expect(setters.setMessages).toHaveBeenCalledWith([
      {
        id: 'user-0-2026-05-26T08:00:01.000Z',
        role: 'user',
        content: 'What is a linear equation?',
        eventId: 'event-user-1',
        isSystemPrompt: undefined,
        escalationRung: undefined,
        isResponseComplete: false,
      },
      {
        id: 'assistant-1-2026-05-26T08:00:02.000Z',
        role: 'assistant',
        content: 'It is an equation that graphs as a line.',
        eventId: 'event-ai-1',
        isSystemPrompt: undefined,
        escalationRung: 4,
        isResponseComplete: true,
      },
    ]);
    expect(setters.setExchangeCount).toHaveBeenCalledWith(3);
    expect(setters.setEscalationRung).toHaveBeenCalledWith(4);
    expect(setters.setInputMode).toHaveBeenCalledWith(
      'voice' satisfies InputMode,
    );
    expect(setters.setActiveSessionId).toHaveBeenCalledWith('session-1');
    expect(setters.setResumedBanner).toHaveBeenCalledWith(true);
  });

  it('marks only real historical assistant responses complete, not typed prompt rows', () => {
    type HistoricalExchange = LiveTranscriptResponse['exchanges'][number] & {
      kind: ChatMessage['kind'] | null;
    };
    const exchanges = [
      {
        eventId: 'event-reconnect-1',
        role: 'assistant',
        content: 'Reconnect to continue this response.',
        timestamp: '2026-05-26T08:00:01.000Z',
        kind: 'reconnect_prompt',
      },
      {
        eventId: 'event-ai-1',
        role: 'assistant',
        content: 'Roman roads made travel and communication more reliable.',
        timestamp: '2026-05-26T08:00:02.000Z',
        kind: null,
      },
    ] satisfies HistoricalExchange[];

    const setters = renderHydrationHook({
      liveTranscript: makeTranscript({ exchanges }),
    });

    expect(setters.setMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        eventId: 'event-reconnect-1',
        isResponseComplete: false,
      }),
      expect.objectContaining({
        eventId: 'event-ai-1',
        isResponseComplete: true,
      }),
    ]);
  });

  it('uses the stable opening content ref when the transcript has no exchanges', () => {
    const setters = renderHydrationHook({
      openingContent: 'Stable opening',
      liveTranscript: makeTranscript({
        session: {
          ...makeTranscript().session,
          exchangeCount: 0,
          inputMode: 'text',
        },
        exchanges: [],
      }),
    });

    expect(setters.setMessages).toHaveBeenCalledWith([
      {
        id: 'opening',
        role: 'assistant',
        content: 'Stable opening',
      },
    ]);
    expect(setters.setInputMode).toHaveBeenCalledWith('text');
  });

  it('does not overwrite in-flight local turns', () => {
    const setters = renderHydrationHook({
      currentMessages: [
        {
          id: 'local-user',
          role: 'user',
          content: 'Local unsaved question',
        },
      ],
    });

    expect(setters.setMessages).not.toHaveBeenCalled();
    expect(setters.setExchangeCount).not.toHaveBeenCalled();
    expect(setters.setResumedBanner).not.toHaveBeenCalled();
  });
});
