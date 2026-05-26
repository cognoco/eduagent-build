import {
  MIN_EXCHANGES_FOR_TOPIC_COMPLETION,
  type CurriculumTopic,
  type RetentionStatus,
} from '@eduagent/schemas';

import type { BookSession } from '../../../../../../hooks/use-book-sessions';

export interface GroupedChapter {
  chapter: string;
  sessions: BookSession[];
}

export interface GroupedTopicChapter {
  chapter: string;
  topics: CurriculumTopic[];
}

export interface RetentionTopicLike {
  topicId: string;
  xpStatus?: string | null;
  nextReviewAt: string | null;
}

/**
 * Derive a book-level retention status from per-topic nextReviewAt values.
 * Uses the same thresholds as services/progress.ts computeRetentionStatus.
 */
export function computeBookRetentionStatus(
  nextReviewAtValues: readonly (string | null)[],
): RetentionStatus | null {
  if (nextReviewAtValues.length === 0) return null;
  const now = Date.now();
  const statuses = nextReviewAtValues.map((value): RetentionStatus => {
    if (!value) return 'forgotten';
    const daysUntilReview =
      (new Date(value).getTime() - now) / (1000 * 60 * 60 * 24);
    if (daysUntilReview > 3) return 'strong';
    if (daysUntilReview > 0) return 'fading';
    if (daysUntilReview > -7) return 'weak';
    return 'forgotten';
  });
  const forgottenCount = statuses.filter(
    (status) => status === 'forgotten',
  ).length;
  const weakCount = statuses.filter((status) => status === 'weak').length;
  const fadingCount = statuses.filter((status) => status === 'fading').length;
  const statusCount = statuses.length;
  if (forgottenCount > statusCount * 0.3) return 'forgotten';
  if (weakCount + forgottenCount > statusCount * 0.3) return 'weak';
  if (fadingCount + weakCount + forgottenCount > statusCount * 0.3) {
    return 'fading';
  }
  return 'strong';
}

export function groupSessionsByChapter(
  sessions: readonly BookSession[],
): GroupedChapter[] {
  const map = new Map<string, BookSession[]>();
  for (const session of sessions) {
    const key = session.chapter ?? 'Topics';
    const group = map.get(key);
    if (group) {
      group.push(session);
    } else {
      map.set(key, [session]);
    }
  }
  return Array.from(map.entries()).map(([chapter, items]) => ({
    chapter,
    sessions: items,
  }));
}

export function groupTopicsByChapter(
  topics: readonly CurriculumTopic[],
): GroupedTopicChapter[] {
  const map = new Map<string, CurriculumTopic[]>();
  for (const topic of topics) {
    const key = topic.chapter ?? 'Other';
    const group = map.get(key);
    if (group) {
      group.push(topic);
    } else {
      map.set(key, [topic]);
    }
  }
  return Array.from(map.entries()).map(([chapter, chapterTopics]) => ({
    chapter,
    topics: [...chapterTopics].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function deriveTopicStudiedIds(args: {
  activeTopicIds: readonly string[];
  completedTopicIds: readonly string[];
  sessions: readonly Pick<BookSession, 'topicId' | 'exchangeCount'>[];
  retentionTopics: readonly RetentionTopicLike[];
}): Set<string> {
  const bookTopicIds = new Set(args.activeTopicIds);
  const ids = new Set(args.completedTopicIds);
  for (const session of args.sessions) {
    if (
      session.topicId &&
      session.exchangeCount >= MIN_EXCHANGES_FOR_TOPIC_COMPLETION
    ) {
      ids.add(session.topicId);
    }
  }
  for (const retentionTopic of args.retentionTopics) {
    if (
      retentionTopic.xpStatus === 'verified' &&
      bookTopicIds.has(retentionTopic.topicId)
    ) {
      ids.add(retentionTopic.topicId);
    }
  }
  return ids;
}

export function deriveInProgressTopicIds(args: {
  sessions: readonly Pick<BookSession, 'topicId'>[];
  studiedIds: ReadonlySet<string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const session of args.sessions) {
    if (session.topicId && !args.studiedIds.has(session.topicId)) {
      ids.add(session.topicId);
    }
  }
  return ids;
}

export function getContinueNowTopicId(args: {
  sessions: readonly Pick<BookSession, 'topicId' | 'createdAt'>[];
  inProgressTopicIds: ReadonlySet<string>;
}): string | null {
  const candidates = [...args.sessions]
    .filter(
      (session) =>
        !!session.topicId && args.inProgressTopicIds.has(session.topicId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return candidates[0]?.topicId ?? null;
}

export function deriveStartedTopicIds(args: {
  sessions: readonly Pick<BookSession, 'topicId' | 'createdAt'>[];
  inProgressTopicIds: ReadonlySet<string>;
  continueNowTopicId: string | null;
}): string[] {
  const lastSessionByTopicId = new Map<string, string>();
  for (const session of args.sessions) {
    if (!session.topicId) continue;
    const existing = lastSessionByTopicId.get(session.topicId);
    if (!existing || session.createdAt > existing) {
      lastSessionByTopicId.set(session.topicId, session.createdAt);
    }
  }

  return [...args.inProgressTopicIds]
    .filter((topicId) => topicId !== args.continueNowTopicId)
    .sort((a, b) =>
      (lastSessionByTopicId.get(b) ?? '').localeCompare(
        lastSessionByTopicId.get(a) ?? '',
      ),
    );
}
