// ---------------------------------------------------------------------------
// Interleaved Retrieval Sessions — Story 4.6 (FR92, FR93)
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  learningSessions,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { InterleavedSessionStartInput } from '@eduagent/schemas';
import { isTopicStable } from './retention';
import { findOwnedCurriculumTopics } from './curriculum-topic-ownership';

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

/**
 * [BUG-764] Thrown when an interleaved session is requested but the profile
 * has no eligible topics (no retention cards, no fallbacks). The route layer
 * maps this to 400 VALIDATION_ERROR via `instanceof` — replacing the previous
 * `err.message === '...'` string comparison, which silently broke any time
 * the message text was edited or wrapped by an upstream layer.
 */
export class NoInterleavedTopicsError extends Error {
  constructor() {
    super('No topics available for interleaved retrieval');
    this.name = 'NoInterleavedTopicsError';
  }
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
  opts?: InterleavedSessionStartInput,
): Promise<InterleavedTopic[]> {
  const topicCount = opts?.topicCount ?? 5;
  const subjectId = opts?.subjectId;

  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  // Get all retention cards for this profile
  const allCards = await repo.retentionCards.findMany();

  // Filter to subject if provided
  if (subjectId) {
    // CR-018: verify ownership before reading curricula/topics — prevents
    // attacker-controllable subjectId acting as an existence-check oracle.
    const ownedSubject = await repo.subjects.findFirst(
      eq(subjects.id, subjectId),
    );
    if (!ownedSubject) return [];
  }

  // [BUG-68] A profile-scoped retention card is not proof that the referenced
  // topic is still owned. Filter through the dual parent-chain ownership query
  // before slicing so stale foreign cards cannot crowd out eligible owned cards.
  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    topicIds: [...new Set(allCards.map((card) => card.topicId))],
    subjectId,
  });
  const topicMap = new Map(ownedTopics.map((topic) => [topic.topicId, topic]));
  const candidateCards = allCards.filter((card) => topicMap.has(card.topicId));

  if (candidateCards.length === 0) return [];

  // Split into due and not-yet-due
  const dueCards = candidateCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime(),
  );
  const notDueCards = candidateCards.filter(
    (c) => !c.nextReviewAt || c.nextReviewAt.getTime() > now.getTime(),
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

  return selected.map((card) => {
    const topic = topicMap.get(card.topicId);
    if (!topic) throw new Error('Expected owned topic after candidate filter');
    return {
      topicId: card.topicId,
      subjectId: topic.subjectId,
      topicTitle: topic.topicTitle,
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
  opts?: InterleavedSessionStartInput,
): Promise<{
  sessionId: string;
  topics: InterleavedTopic[];
}> {
  const topics = await selectInterleavedTopics(db, profileId, opts);

  if (topics.length === 0) {
    throw new NoInterleavedTopicsError();
  }

  const firstTopic = topics[0];
  if (!firstTopic)
    throw new Error('Expected at least one topic after length check');
  const primarySubjectId = opts?.subjectId ?? firstTopic.subjectId;

  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: primarySubjectId,
      topicId: firstTopic.topicId,
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

  if (!row)
    throw new Error('Insert into learningSessions did not return a row');
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
    const tmp = result[i];
    result[i] = result[j] as T;
    result[j] = tmp as T;
  }
  return result;
}
