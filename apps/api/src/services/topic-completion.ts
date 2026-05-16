import { MIN_EXCHANGES_FOR_TOPIC_COMPLETION } from '@eduagent/schemas';

export { MIN_EXCHANGES_FOR_TOPIC_COMPLETION };

export function isTerminalSessionStatus(
  status: string | null | undefined,
): boolean {
  return status === 'completed' || status === 'auto_closed';
}

export function isMeaningfulCompletedSession(session: {
  status: string | null | undefined;
  exchangeCount: number | null | undefined;
}): boolean {
  return (
    isTerminalSessionStatus(session.status) &&
    (session.exchangeCount ?? 0) >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION
  );
}

export function isAcceptedSummaryStatus(
  status: string | null | undefined,
): boolean {
  return status === 'accepted';
}

export function addTopicCompletion(
  completedTopicIds: Set<string>,
  topicId: string | null | undefined,
  allowedTopicIds?: Set<string>,
): void {
  if (!topicId) return;
  if (allowedTopicIds && !allowedTopicIds.has(topicId)) return;
  completedTopicIds.add(topicId);
}
