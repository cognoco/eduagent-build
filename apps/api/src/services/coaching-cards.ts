// ---------------------------------------------------------------------------
// Coaching Card Precompute Service — Story 3.4 Step 2
// Computes the appropriate coaching card for a profile after session completion
// and caches it in the DB (KV stand-in per ARCH-11).
// Pure business logic — no Hono imports.
// ---------------------------------------------------------------------------

import { eq, and, gt, asc, sql, inArray } from 'drizzle-orm';
import {
  learningSessions,
  streaks,
  subjects,
  curriculumBooks,
  curriculumTopics,
  curricula,
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type { CoachingCard } from '@eduagent/schemas';
import {
  mergeHomeSurfaceCacheData,
  readHomeSurfaceCacheData,
} from './home-surface-cache';
import { getStreakDisplayInfo, type StreakState } from './streaks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Profiles with fewer than this many completed sessions get cold-start fallback */
const COLD_START_SESSION_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// precomputeCoachingCard
// ---------------------------------------------------------------------------

/**
 * Queries retention cards + streaks, computes the highest-priority coaching
 * card using this priority order:
 *   1. review_due  (priority 7-10, scales with overdue count)
 *   2. streak      (priority 6, learner on grace period)
 *   3. curriculum_complete (priority 5, all topics verified/stable)
 *   4. insight     (priority 4, verified topics exist)
 *   5. challenge   (priority 3, fallback)
 */
export async function precomputeCoachingCard(
  db: Database,
  profileId: string
): Promise<CoachingCard> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS).toISOString();
  const createdAt = now.toISOString();
  const id = generateUUIDv7();

  // Fetch retention cards (scoped to profile)
  const repo = createScopedRepository(db, profileId);
  const allCards = await repo.retentionCards.findMany();

  // Fetch streak state (streaks has unique profileId constraint)
  const streakRow = await db.query.streaks.findFirst({
    where: eq(streaks.profileId, profileId),
  });

  // --- Check urgency boost before priority cascade ---
  let boostedSubjectIds = new Set<string>();
  try {
    const boostedSubjects = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(
        and(
          eq(subjects.profileId, profileId),
          gt(subjects.urgencyBoostUntil, now)
        )
      );
    boostedSubjectIds = new Set(boostedSubjects.map((s) => s.id));
  } catch {
    // Urgency boost is optional — graceful degradation
  }

  // --- Priority 1: review_due ---
  const overdueCards = allCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  );

  if (overdueCards.length > 0) {
    // Pick the most overdue card (earliest nextReviewAt)
    const mostOverdue = overdueCards.sort(
      (a, b) =>
        (a.nextReviewAt?.getTime() ?? 0) - (b.nextReviewAt?.getTime() ?? 0)
    )[0]!;

    // Priority scales: 7 base + 1 per overdue card, capped at 10
    const priority = Math.min(7 + overdueCards.length - 1, 10);

    // Enrich with book context if topic belongs to a book
    let body = `You have ${overdueCards.length} topic${
      overdueCards.length > 1 ? 's' : ''
    } ready for review.`;
    try {
      const overdueTopicRow = await db.query.curriculumTopics?.findFirst?.({
        where: eq(curriculumTopics.id, mostOverdue.topicId),
      });
      if (overdueTopicRow?.bookId) {
        const book = await db.query.curriculumBooks?.findFirst?.({
          where: eq(curriculumBooks.id, overdueTopicRow.bookId),
        });
        if (book) {
          body = `${overdueTopicRow.title} needs a review — in your ${book.title} book`;
        }
      }
    } catch {
      // Book context enrichment is optional — use default body
    }

    return {
      id,
      profileId,
      type: 'review_due',
      title: 'Review due',
      body,
      priority,
      expiresAt,
      createdAt,
      topicId: mostOverdue.topicId,
      dueAt: mostOverdue.nextReviewAt!.toISOString(),
      easeFactor: Number(mostOverdue.easeFactor),
    };
  }

  // --- Priority 2: streak (grace period) ---
  if (streakRow) {
    const streakState: StreakState = {
      currentStreak: streakRow.currentStreak,
      longestStreak: streakRow.longestStreak,
      lastActivityDate: streakRow.lastActivityDate,
      gracePeriodStartDate: streakRow.gracePeriodStartDate,
    };

    const today = now.toISOString().slice(0, 10);
    const display = getStreakDisplayInfo(streakState, today);

    if (display.isOnGracePeriod) {
      return {
        id,
        profileId,
        type: 'streak',
        title: 'Keep your streak alive!',
        body: `Your ${streakState.currentStreak}-day streak is at risk. ${
          display.graceDaysRemaining
        } grace day${display.graceDaysRemaining === 1 ? '' : 's'} remaining.`,
        priority: 6,
        expiresAt,
        createdAt,
        currentStreak: streakState.currentStreak,
        graceRemaining: display.graceDaysRemaining,
      };
    }
  }

  // --- Priority 3: curriculum_complete (all topics verified) ---
  // If there are multiple retention cards and ALL of them are verified,
  // the learner has completed their curriculum. Require >= 3 to distinguish from
  // "just started and verified one topic" vs "completed entire curriculum."
  if (allCards.length >= 3) {
    const allComplete = allCards.every((c) => c.xpStatus === 'verified');
    if (allComplete) {
      return {
        id,
        profileId,
        type: 'curriculum_complete' as const,
        title: "You've mastered your subjects!",
        body: 'Ready for something new?',
        priority: 5,
        expiresAt,
        createdAt,
      };
    }
  }

  // --- Priority 3.5: continue_book (next topic in an in-progress book) ---
  try {
    const continueBookCard = await findContinueBookCard(
      db,
      profileId,
      boostedSubjectIds,
      { id, expiresAt, createdAt }
    );
    if (continueBookCard) return continueBookCard;
  } catch {
    // Book queries fail gracefully — fall through to next priority
  }

  // --- Priority 3.5: book_suggestion (next book when one is completed) ---
  try {
    const bookSuggestionCard = await findBookSuggestionCard(
      db,
      profileId,
      boostedSubjectIds,
      { id, expiresAt, createdAt }
    );
    if (bookSuggestionCard) return bookSuggestionCard;
  } catch {
    // Book queries fail gracefully — fall through to next priority
  }

  // --- Priority 4: insight (verified topics) ---
  const verifiedCards = allCards.filter((c) => c.xpStatus === 'verified');
  if (verifiedCards.length > 0) {
    const firstVerified = verifiedCards[0]!;
    return {
      id,
      profileId,
      type: 'insight',
      title: 'Great progress!',
      body: 'You have verified your understanding of a topic. Keep up the momentum!',
      priority: 4,
      expiresAt,
      createdAt,
      topicId: firstVerified.topicId,
      insightType: 'strength',
    };
  }

  // --- Priority 4: challenge (fallback) ---
  // [BUG-55] When no retention cards exist, find a topic from the curriculum
  // instead of using profileId as topicId (which is semantically wrong).
  const fallbackTopicId: string | null =
    allCards.length > 0 ? allCards[0]!.topicId : null;
  // No retention cards = new learner, return curriculum_complete start prompt
  if (!fallbackTopicId) {
    return {
      id,
      profileId,
      type: 'curriculum_complete' as const,
      title: 'Ready to start learning?',
      body: 'Create your first subject to begin!',
      priority: 3,
      expiresAt,
      createdAt,
    };
  }

  return {
    id,
    profileId,
    type: 'challenge',
    title: 'Ready for a challenge?',
    body: 'Take the next step in your learning journey!',
    priority: 3,
    expiresAt,
    createdAt,
    topicId: fallbackTopicId,
    difficulty: 'easy',
    xpReward: 10,
  };
}

// ---------------------------------------------------------------------------
// Epic 7: Book-aware card helpers
// ---------------------------------------------------------------------------

interface CardMeta {
  id: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Finds the next uncovered topic in an in-progress book.
 * Returns a continue_book card or null.
 */
async function findContinueBookCard(
  db: Database,
  profileId: string,
  boostedSubjectIds: Set<string>,
  meta: CardMeta
): Promise<CoachingCard | null> {
  // Find books with generated topics for active subjects
  const booksWithSubjects = await db
    .select({
      bookId: curriculumBooks.id,
      bookTitle: curriculumBooks.title,
      bookEmoji: curriculumBooks.emoji,
      subjectId: curriculumBooks.subjectId,
    })
    .from(curriculumBooks)
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .where(
      and(
        eq(subjects.profileId, profileId),
        eq(subjects.status, 'active'),
        eq(curriculumBooks.topicsGenerated, true)
      )
    )
    .orderBy(asc(curriculumBooks.sortOrder));

  if (booksWithSubjects.length === 0) return null;

  // [BUG-63] Batch: get all curricula for these subjects
  const subjectIds = [...new Set(booksWithSubjects.map((b) => b.subjectId))];
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
  });
  const curriculumBySubject = new Map<string, (typeof allCurricula)[0]>();
  for (const c of allCurricula) {
    if (!curriculumBySubject.has(c.subjectId)) {
      curriculumBySubject.set(c.subjectId, c);
    }
  }
  const bookIds = booksWithSubjects.map((b) => b.bookId);
  const curriculumIds = [...curriculumBySubject.values()].map((c) => c.id);
  const allTopics =
    curriculumIds.length > 0
      ? await db
          .select()
          .from(curriculumTopics)
          .where(
            and(
              inArray(curriculumTopics.curriculumId, curriculumIds),
              inArray(curriculumTopics.bookId, bookIds),
              eq(curriculumTopics.skipped, false)
            )
          )
          .orderBy(asc(curriculumTopics.sortOrder))
      : [];
  if (allTopics.length === 0) return null;
  const topicIds = allTopics.map((t) => t.id);
  const sessionsForTopics = await db
    .select({ topicId: learningSessions.topicId })
    .from(learningSessions)
    .where(
      and(
        inArray(learningSessions.topicId, topicIds),
        eq(learningSessions.profileId, profileId)
      )
    );
  const topicsWithSessions = new Set(
    sessionsForTopics.map((s) => s.topicId).filter(Boolean)
  );
  const topicsByBook = new Map<string, typeof allTopics>();
  for (const topic of allTopics) {
    if (!topic.bookId) continue;
    const list = topicsByBook.get(topic.bookId) ?? [];
    list.push(topic);
    topicsByBook.set(topic.bookId, list);
  }

  for (const book of booksWithSubjects) {
    const curriculum = curriculumBySubject.get(book.subjectId);
    if (!curriculum) continue;
    const topics = topicsByBook.get(book.bookId) ?? [];
    for (const topic of topics) {
      if (topic.curriculumId !== curriculum.id) continue;
      if (!topicsWithSessions.has(topic.id)) {
        const basePriority = 4;
        const priority = boostedSubjectIds.has(book.subjectId)
          ? Math.min(basePriority + 3, 10)
          : basePriority;

        return {
          id: meta.id,
          profileId,
          type: 'continue_book',
          title: `Next up in ${book.bookTitle}`,
          body: `${topic.title} — ${topic.description ?? 'Continue learning'}`,
          priority,
          expiresAt: meta.expiresAt,
          createdAt: meta.createdAt,
          topicId: topic.id,
          bookTitle: book.bookTitle,
          bookEmoji: book.bookEmoji,
        };
      }
    }
  }

  return null;
}

/**
 * Finds a completed book whose subject has a next unbuilt or unstarted book.
 * Returns a book_suggestion card or null.
 */
async function findBookSuggestionCard(
  db: Database,
  profileId: string,
  boostedSubjectIds: Set<string>,
  meta: CardMeta
): Promise<CoachingCard | null> {
  // Find active subjects with books
  const activeSubjects = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(
      and(eq(subjects.profileId, profileId), eq(subjects.status, 'active'))
    );

  if (activeSubjects.length === 0) return null;

  // [CR-2B.2] Batch: fetch all books for all active subjects in one query
  const subjectIds = activeSubjects.map((s) => s.id);
  const allBooks = await db
    .select()
    .from(curriculumBooks)
    .where(inArray(curriculumBooks.subjectId, subjectIds))
    .orderBy(asc(curriculumBooks.sortOrder));

  // Group books by subject and find the first unbuilt book
  for (const subject of activeSubjects) {
    const books = allBooks.filter((b) => b.subjectId === subject.id);
    if (books.length === 0) continue;

    const nextUnbuilt = books.find((b) => !b.topicsGenerated);
    if (nextUnbuilt) {
      const basePriority = 3;
      const priority = boostedSubjectIds.has(subject.id)
        ? Math.min(basePriority + 3, 10)
        : basePriority;

      return {
        id: meta.id,
        profileId,
        type: 'book_suggestion',
        title: `Ready for a new book?`,
        body: `${nextUnbuilt.title} is waiting in your ${subject.name} shelf`,
        priority,
        expiresAt: meta.expiresAt,
        createdAt: meta.createdAt,
        bookId: nextUnbuilt.id,
        bookTitle: nextUnbuilt.title,
        bookEmoji: nextUnbuilt.emoji,
        subjectName: subject.name,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// writeCoachingCardCache
// ---------------------------------------------------------------------------

/**
 * Upserts a coaching card to the `coaching_card_cache` table.
 * Uses ON CONFLICT profileId DO UPDATE for idempotent writes.
 * Sets a 24-hour TTL on expiresAt.
 */
export async function writeCoachingCardCache(
  db: Database,
  profileId: string,
  card: CoachingCard
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  await mergeHomeSurfaceCacheData(
    db,
    profileId,
    (current) => ({
      ...current,
      legacyCoachingCard: card,
    }),
    { expiresAt }
  );
}

// ---------------------------------------------------------------------------
// readCoachingCardCache
// ---------------------------------------------------------------------------

/**
 * Reads a cached coaching card for a profile.
 * Returns null if missing or expired.
 */
export async function readCoachingCardCache(
  db: Database,
  profileId: string
): Promise<CoachingCard | null> {
  const cached = await readHomeSurfaceCacheData(db, profileId);
  if (!cached) return null;

  const now = new Date();
  if (cached.row.expiresAt.getTime() <= now.getTime()) return null;

  return cached.data.legacyCoachingCard ?? null;
}

// ---------------------------------------------------------------------------
// Cold-start fallback actions
// ---------------------------------------------------------------------------

export interface ColdStartFallback {
  actions: Array<{ key: string; label: string; description: string }>;
}

const COLD_START_FALLBACK: ColdStartFallback = {
  actions: [
    {
      key: 'continue_learning',
      label: 'Continue learning',
      description: 'Pick up where you left off.',
    },
    {
      key: 'start_new_topic',
      label: 'Start a new topic',
      description: 'Explore something new in your curriculum.',
    },
    {
      key: 'review_progress',
      label: 'Review progress',
      description: 'See how far you have come.',
    },
  ],
};

// ---------------------------------------------------------------------------
// getCoachingCardForProfile
// ---------------------------------------------------------------------------

export interface CoachingCardResponse {
  coldStart: boolean;
  card: CoachingCard | null;
  fallback: ColdStartFallback | null;
}

/**
 * Returns the coaching card for a profile.
 *
 * - Cold start (< 5 completed sessions): returns three-button fallback data.
 * - Warm path: reads from cache (fast); on miss, computes fresh + writes cache.
 */
export async function getCoachingCardForProfile(
  db: Database,
  profileId: string
): Promise<CoachingCardResponse> {
  // Check session count for cold-start detection
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningSessions)
    .where(eq(learningSessions.profileId, profileId));

  const sessionCount = countResult[0]?.count ?? 0;

  if (sessionCount < COLD_START_SESSION_THRESHOLD) {
    return { coldStart: true, card: null, fallback: COLD_START_FALLBACK };
  }

  // Warm path: try cache first
  const cached = await readCoachingCardCache(db, profileId);
  if (cached) {
    return { coldStart: false, card: cached, fallback: null };
  }

  // Cache miss: compute fresh and write to cache
  const card = await precomputeCoachingCard(db, profileId);
  await writeCoachingCardCache(db, profileId, card);

  return { coldStart: false, card, fallback: null };
}
