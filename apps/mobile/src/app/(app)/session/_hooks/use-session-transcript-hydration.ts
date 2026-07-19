import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { InputMode, LiveTranscriptResponse } from '@eduagent/schemas';

import type { ChatMessage } from '../../../../components/session';

export interface UseSessionTranscriptHydrationArgs {
  routeSessionId: string | undefined;
  liveTranscript: LiveTranscriptResponse | null;
  messagesRef: MutableRefObject<ChatMessage[]>;
  openingContentRef: MutableRefObject<string>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setExchangeCount: (exchangeCount: number) => void;
  setEscalationRung: (escalationRung: number) => void;
  setInputMode: (inputMode: InputMode) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setResumedBanner: (resumed: boolean) => void;
}

export function useSessionTranscriptHydration({
  routeSessionId,
  liveTranscript,
  messagesRef,
  openingContentRef,
  setMessages,
  setExchangeCount,
  setEscalationRung,
  setInputMode,
  setActiveSessionId,
  setResumedBanner,
}: UseSessionTranscriptHydrationArgs): void {
  useEffect(() => {
    if (!routeSessionId || !liveTranscript) return;

    const transcriptMessages = liveTranscript.exchanges
      .filter((entry, index, all) => {
        if (entry.role !== 'user') return true;
        return index !== all.length - 1 || all[index + 1]?.role === 'assistant';
      })
      .map((entry, index) => ({
        id: `${entry.isSystemPrompt ? 'system' : entry.role}-${index}-${
          entry.timestamp
        }`,
        role:
          entry.role === 'assistant'
            ? ('assistant' as const)
            : ('user' as const),
        content: entry.content,
        eventId: entry.eventId,
        isSystemPrompt: entry.isSystemPrompt,
        isResponseComplete:
          entry.role === 'assistant' &&
          entry.isSystemPrompt !== true &&
          entry.content.trim().length > 0,
        escalationRung: entry.escalationRung,
      }));

    const currentMessages = messagesRef.current;
    const transcriptUserContents = new Set(
      transcriptMessages
        .filter((message) => message.role === 'user')
        .map((message) => message.content),
    );
    const hasInFlightLocalTurn =
      currentMessages.some((message) => message.streaming) ||
      currentMessages.some(
        (message) =>
          message.role === 'user' &&
          !message.eventId &&
          !transcriptUserContents.has(message.content),
      );
    if (hasInFlightLocalTurn) return;

    // [M-7] Use the ref so late-arriving streak data (which changes
    // openingContent reactively) does not wipe in-progress messages.
    const fallbackOpeningMessage: ChatMessage = {
      id: 'opening',
      role: 'assistant',
      content: openingContentRef.current,
    };
    setMessages(
      transcriptMessages.length > 0
        ? transcriptMessages
        : [fallbackOpeningMessage],
    );
    setExchangeCount(liveTranscript.session.exchangeCount);
    setEscalationRung(
      liveTranscript.exchanges
        .filter((entry) => entry.role === 'assistant' && !entry.isSystemPrompt)
        .at(-1)?.escalationRung ?? 1,
    );
    setInputMode(liveTranscript.session.inputMode ?? 'text');
    setActiveSessionId(routeSessionId);
    setResumedBanner(true);
  }, [
    liveTranscript,
    messagesRef,
    openingContentRef,
    routeSessionId,
    setActiveSessionId,
    setEscalationRung,
    setExchangeCount,
    setInputMode,
    setMessages,
    setResumedBanner,
  ]);
}
