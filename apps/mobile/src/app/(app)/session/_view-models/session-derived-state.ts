import type { ChatMessage } from '../../../../components/session';
import { getVoiceLocaleForLanguage } from '../../../../lib/language-locales';

export function countLearnerMessages(messages: readonly ChatMessage[]): number {
  return messages.filter(
    (message) => message.role === 'user' && !message.isAutoSent,
  ).length;
}

export function getLearnerTurnCount(args: {
  userMessageCount: number;
  exchangeCount: number;
}): number {
  return Math.max(args.userMessageCount, args.exchangeCount);
}

export function getLatestAiMessageId(args: {
  messages: readonly ChatMessage[];
  isStreaming: boolean;
}): string | null {
  if (args.isStreaming) return null;
  return (
    [...args.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.streaming)
      ?.id ?? null
  );
}

export function countPersistedAiResponses(
  messages: readonly ChatMessage[],
): number {
  return messages.filter(
    (message) =>
      message.role === 'assistant' &&
      !message.streaming &&
      !message.isSystemPrompt &&
      !!message.eventId,
  ).length;
}

export function deriveSessionSubjectState(args: {
  classifiedSubject: { subjectId: string; subjectName: string } | null;
  routeSubjectId: string | undefined;
  routeSubjectName: string | undefined;
  transcriptSubjectId: string | undefined;
  activeSessionSubjectId: string | undefined;
  routeTopicId: string | undefined;
  transcriptTopicId: string | undefined;
  activeSessionTopicId: string | undefined;
}): {
  effectiveSubjectId: string;
  effectiveSubjectName: string | undefined;
  noteSubjectId: string | undefined;
  noteTopicId: string | undefined;
} {
  const effectiveSubjectId =
    args.classifiedSubject?.subjectId ?? args.routeSubjectId ?? '';

  return {
    effectiveSubjectId,
    effectiveSubjectName:
      args.classifiedSubject?.subjectName ?? args.routeSubjectName,
    noteSubjectId:
      effectiveSubjectId ||
      args.transcriptSubjectId ||
      args.activeSessionSubjectId ||
      undefined,
    noteTopicId:
      args.routeTopicId ??
      args.transcriptTopicId ??
      args.activeSessionTopicId ??
      undefined,
  };
}

export function resolveLanguageVoiceLocale(args: {
  activeSubject:
    | { pedagogyMode?: string; languageCode?: string | null }
    | undefined;
  conversationLanguage: string | null | undefined;
}): string {
  if (args.activeSubject?.pedagogyMode === 'four_strands') {
    return getVoiceLocaleForLanguage(args.activeSubject.languageCode);
  }
  return getVoiceLocaleForLanguage(args.conversationLanguage);
}
