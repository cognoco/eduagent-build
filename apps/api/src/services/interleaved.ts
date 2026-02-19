// ---------------------------------------------------------------------------
// Interleaved Retrieval Sessions — Story 4.6 (FR92, FR93)
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, lte, asc } from 'drizzle-orm';
import {
  retentionCards,
  curriculumTopics,
  curricula,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { InterleavedSessionStartInput } from '@eduagent/schemas';
import { isTopicStable, STABILITY_THRESHOLD } from './retention';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterleavedTopic {
  topicId: string;
  subjectId: string;
  topicTitle: string;
  isStable: boolean;
  consecutiveSuccesses: number;
}

// ---------------------------------------------------------------------------
// Topic selection
// ---------------------------------------------------------------------------

/**
 * Selects topics for an interleaved retrieval session.
 *
 * Algorithm:
 * 1. Find all retention cards for the profile with nextReviewAt <= now (due for review)
 * 2. Optionally filter to a single subject
 * 3. Randomize order (interleaving is the point — no grouping by subject)
 * 4. If fewer than topicCount are due, pad with the most-stale non-due topics
 * 5. Return up to topicCount topics
 *
 * Stable topics (5+ consecutive successes) are included — SM-2 naturally
 * extends their intervals, so they appear less frequently.
 */
export async function selectInterleavedTopics(
  db: Database,
  profileId: string,
  opts?: InterleavedSessionStartInput
): Promise<InterleavedTopic[]> {
  const topicCount = opts?.topicCount ?? 5;
  const subjectId = opts?.subjectId;

  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  // Get all retention cards for this profile
  const allCards = await repo.retentionCards.findMany();

  // Filter to subject if provided
  let candidateCards = allCards;
  if (subjectId) {
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    if (!curriculum) return [];

    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum.id),
    });
    const topicIds = new Set(topics.map((t) => t.id));
    candidateCards = allCards.filter((c) => topicIds.has(c.topicId));
  }

  if (candidateCards.length === 0) return [];

  // Split into due and not-yet-due
  const dueCards = candidateCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  );
  const notDueCards = candidateCards.filter(
    (c) => !c.nextReviewAt || c.nextReviewAt.getTime() > now.getTime()
  );

  // Randomize due cards
  const shuffledDue = shuffleArray(dueCards);

  // If not enough due, pad with most-stale non-due (sorted by nextReviewAt ascending)
  let selected = shuffledDue.slice(0, topicCount);
  if (selected.length < topicCount) {
    const sorted = notDueCards.sort((a, b) => {
      const aTime = a.nextReviewAt?.getTime() ?? Infinity;
      const bTime = b.nextReviewAt?.getTime() ?? Infinity;
      return aTime - bTime;
    });
    const needed = topicCount - selected.length;
    selected = [...selected, ...sorted.slice(0, needed)];
  }

  // Resolve topic titles and subject IDs
  const topicIds = selected.map((c) => c.topicId);
  const topicRows = await Promise.all(
    topicIds.map((id) =>
      db.query.curriculumTopics.findFirst({
        where: eq(curriculumTopics.id, id),
      })
    )
  );

  // Build subject lookup from curricula
  const curriculumIds = new Set(
    topicRows.filter(Boolean).map((t) => t!.curriculumId)
  );
  const curriculumRows = await Promise.all(
    [...curriculumIds].map((cid) =>
      db.query.curricula.findFirst({ where: eq(curricula.id, cid) })
    )
  );
  const curriculumToSubject = new Map<string, string>();
  for (const c of curriculumRows) {
    if (c) curriculumToSubject.set(c.id, c.subjectId);
  }

  return selected.map((card, i) => {
    const topic = topicRows[i];
    return {
      topicId: card.topicId,
      subjectId: topic ? curriculumToSubject.get(topic.curriculumId) ?? '' : '',
      topicTitle: topic?.title ?? 'Unknown topic',
      isStable: isTopicStable(card.consecutiveSuccesses),
      consecutiveSuccesses: card.consecutiveSuccesses,
    };
  });
}

// ---------------------------------------------------------------------------
// Start interleaved session
// ---------------------------------------------------------------------------

/**
 * Creates a new interleaved retrieval session and returns the selected topics.
 *
 * The session is created with the first selected topic's subjectId (since
 * learning_sessions requires a subjectId). The metadata field stores
 * the full topic list for the exchange pipeline to reference.
 */
export async function startInterleavedSession(
  db: Database,
  profileId: string,
  opts?: InterleavedSessionStartInput
): Promise<{
  sessionId: string;
  topics: InterleavedTopic[];
}> {
  const topics = await selectInterleavedTopics(db, profileId, opts);

  if (topics.length === 0) {
    throw new Error('No topics available for interleaved retrieval');
  }

  const primarySubjectId = opts?.subjectId ?? topics[0].subjectId;

  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: primarySubjectId,
      topicId: topics[0].topicId,
      sessionType: 'interleaved',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        interleavedTopics: topics.map((t) => ({
          topicId: t.topicId,
          subjectId: t.subjectId,
          topicTitle: t.topicTitle,
        })),
      },
    })
    .returning();

  return {
    sessionId: row.id,
    topics,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle — returns a new array */
function shuffleArray<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
