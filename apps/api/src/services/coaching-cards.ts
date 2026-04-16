// ---------------------------------------------------------------------------
// Coaching Card Precompute Service — Story 3.4 Step 2
// Computes the appropriate coaching card for a profile after session completion
// and caches it in the DB (KV stand-in per ARCH-11).
// Pure business logic — no Hono imports.
// ---------------------------------------------------------------------------

import { eq, and, gt, gte, asc, desc, sql, inArray } from 'drizzle-orm';
import {
  learningSessions,
  streaks,
  subjects,
  curriculumBooks,
  curriculumTopics,
  curricula,
  profiles,
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
// FR165.4: Age-adaptive coaching card copy helpers
// ---------------------------------------------------------------------------

function getLearnerAge(birthYear: number | null): number | null {
  if (!birthYear) return null;
  return new Date().getFullYear() - birthYear;
}

function reviewDueCopy(
  count: number,
  topicTitle: string | null,
  bookTitle: string | null,
  age: number | null
): { title: string; body: string } {
  const young = age !== null && age < 13;
  if (topicTitle && bookTitle) {
    return {
      title: young ? 'Time for a quick review!' : 'Review due',
      body: young
        ? `Let's revisit ${topicTitle} in your ${bookTitle} book!`
        : `${topicTitle} needs a review — in your ${bookTitle} book`,
    };
  }
  return {
    title: young ? 'Time for a quick review!' : 'Review due',
    body: young
      ? `You have ${count} topic${
          count > 1 ? 's' : ''
        } waiting to be revisited!`
      : `You have ${count} topic${count > 1 ? 's' : ''} ready for review.`,
  };
}

function continueBookCopy(
  topicTitle: string,
  bookTitle: string,
  topicDesc: string | null,
  age: number | null
): { title: string; body: string } {
  const young = age !== null && age < 13;
  return {
    title: young ? `Keep going in ${bookTitle}!` : `Next up in ${bookTitle}`,
    body: young
      ? `${topicTitle} is waiting for you — let's learn something cool!`
      : `${topicTitle} — ${topicDesc ?? 'Continue learning'}`,
  };
}

function bookSuggestionCopy(
  bookTitle: string,
  subjectName: string,
  age: number | null
): { title: string; body: string } {
  const young = age !== null && age < 13;
  return {
    title: young ? 'A new adventure awaits!' : 'Ready for a new book?',
    body: young
      ? `${bookTitle} is next on your ${subjectName} shelf — let's explore!`
      : `${bookTitle} is waiting in your ${subjectName} shelf`,
  };
}

function homeworkConnectionCopy(
  skill: string,
  age: number | null
): { title: string; body: string } {
  const young = age !== null && age < 13;
  return {
    title: young ? 'Your homework connects!' : 'Homework meets your Library',
    body: young
      ? `You practiced ${skill} in homework — want to learn even more?`
      : `You worked on ${skill} in homework — want to go deeper in your Library?`,
  };
}

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

  // FR165.4: Fetch learner age for warm, age-adapted card copy
  let birthYear: number | null = null;
  try {
    const profileRow = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
      columns: { birthYear: true },
    });
    birthYear = profileRow?.birthYear ?? null;
  } catch {
    // Age lookup is optional — use neutral tone as fallback
  }
  const learnerAge = getLearnerAge(birthYear);

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
    )[0];
    if (!mostOverdue)
      throw new Error('Expected most-overdue card after non-empty sort');

    // Priority scales: 7 base + 1 per overdue card, capped at 10
    const priority = Math.min(7 + overdueCards.length - 1, 10);

    // Enrich with book context if topic belongs to a book
    let topicTitle: string | null = null;
    let bookTitle: string | null = null;
    try {
      const overdueTopicRow = await db.query.curriculumTopics?.findFirst?.({
        where: eq(curriculumTopics.id, mostOverdue.topicId),
      });
      topicTitle = overdueTopicRow?.title ?? null;
      if (overdueTopicRow?.bookId) {
        const book = await db.query.curriculumBooks?.findFirst?.({
          where: eq(curriculumBooks.id, overdueTopicRow.bookId),
        });
        bookTitle = book?.title ?? null;
      }
    } catch {
      // Book context enrichment is optional — use default body
    }

    const reviewCopy = reviewDueCopy(
      overdueCards.length,
      topicTitle,
      bookTitle,
      learnerAge
    );

    return {
      id,
      profileId,
      type: 'review_due',
      title: reviewCopy.title,
      body: reviewCopy.body,
      priority,
      expiresAt,
      createdAt,
      topicId: mostOverdue.topicId,
      dueAt: (mostOverdue.nextReviewAt ?? new Date()).toISOString(),
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
      const young = learnerAge !== null && learnerAge < 13;
      return {
        id,
        profileId,
        type: 'streak',
        title: young ? "Don't lose your streak!" : 'Keep your streak alive!',
        body: young
          ? `You've been learning for ${streakState.currentStreak} days in a row! Come back today to keep it going!`
          : `Your ${streakState.currentStreak}-day streak is at risk. ${
              display.graceDaysRemaining
            } grace day${
              display.graceDaysRemaining === 1 ? '' : 's'
            } remaining.`,
        priority: 6,
        expiresAt,
        createdAt,
        currentStreak: streakState.currentStreak,
        graceRemaining: display.graceDaysRemaining,
      };
    }
  }

  // --- Priority 2.5: homework_connection (homework matches curriculum) ---
  try {
    const hwConnectionCard = await findHomeworkConnectionCard(
      db,
      profileId,
      boostedSubjectIds,
      { id, expiresAt, createdAt, learnerAge }
    );
    if (hwConnectionCard) return hwConnectionCard;
  } catch {
    // Homework connection is optional — fall through to next priority
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
      { id, expiresAt, createdAt, learnerAge }
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
      { id, expiresAt, createdAt, learnerAge }
    );
    if (bookSuggestionCard) return bookSuggestionCard;
  } catch {
    // Book queries fail gracefully — fall through to next priority
  }

  // --- Priority 4: insight (verified topics) ---
  const verifiedCards = allCards.filter((c) => c.xpStatus === 'verified');
  if (verifiedCards.length > 0) {
    const firstVerified = verifiedCards[0];
    if (!firstVerified)
      throw new Error('Expected verified card after non-empty filter');
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
    allCards.length > 0 ? allCards[0]?.topicId ?? null : null;
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
  learnerAge: number | null;
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
        eq(learningSessions.profileId, profileId),
        gte(learningSessions.exchangeCount, 1)
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

        const cbCopy = continueBookCopy(
          topic.title,
          book.bookTitle,
          topic.description,
          meta.learnerAge
        );

        return {
          id: meta.id,
          profileId,
          type: 'continue_book',
          title: cbCopy.title,
          body: cbCopy.body,
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

      const bsCopy = bookSuggestionCopy(
        nextUnbuilt.title,
        subject.name,
        meta.learnerAge
      );

      return {
        id: meta.id,
        profileId,
        type: 'book_suggestion',
        title: bsCopy.title,
        body: bsCopy.body,
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

/**
 * Finds a recent homework session whose practicedSkills match an uncovered
 * curriculum topic. Returns a homework_connection card or null.
 *
 * Without FR164 knowledge_signals, we use case-insensitive substring matching
 * between homework practicedSkills and curriculum topic titles/descriptions.
 */
async function findHomeworkConnectionCard(
  db: Database,
  profileId: string,
  boostedSubjectIds: Set<string>,
  meta: CardMeta
): Promise<CoachingCard | null> {
  // Find recent homework sessions (last 7 days) with summaries
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentHomework = await db
    .select({
      id: learningSessions.id,
      metadata: learningSessions.metadata,
      subjectId: learningSessions.subjectId,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.sessionType, 'homework'),
        gt(learningSessions.createdAt, sevenDaysAgo)
      )
    )
    .orderBy(desc(learningSessions.createdAt))
    .limit(10);

  if (recentHomework.length === 0) return null;

  // Extract all practiced skills from recent homework
  const skillsBySubject = new Map<string | null, string[]>();
  for (const hw of recentHomework) {
    const meta2 = hw.metadata as Record<string, unknown> | null;
    const summary = meta2?.homeworkSummary as
      | { practicedSkills?: string[] }
      | undefined;
    const skills = summary?.practicedSkills;
    if (!skills || skills.length === 0) continue;
    const existing = skillsBySubject.get(hw.subjectId) ?? [];
    existing.push(...skills);
    skillsBySubject.set(hw.subjectId, existing);
  }

  if (skillsBySubject.size === 0) return null;

  // Get active subjects for this profile
  const activeSubjects = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(
      and(eq(subjects.profileId, profileId), eq(subjects.status, 'active'))
    );

  if (activeSubjects.length === 0) return null;

  const subjectIds = activeSubjects.map((s) => s.id);
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
  });

  if (allCurricula.length === 0) return null;

  const curriculumIds = allCurricula.map((c) => c.id);
  const allTopics = await db
    .select()
    .from(curriculumTopics)
    .where(
      and(
        inArray(curriculumTopics.curriculumId, curriculumIds),
        eq(curriculumTopics.skipped, false)
      )
    );

  if (allTopics.length === 0) return null;

  // Find topics that already have sessions (covered — real activity only)
  const topicIds = allTopics.map((t) => t.id);
  const sessionsForTopics = await db
    .select({ topicId: learningSessions.topicId })
    .from(learningSessions)
    .where(
      and(
        inArray(learningSessions.topicId, topicIds),
        eq(learningSessions.profileId, profileId),
        gte(learningSessions.exchangeCount, 1)
      )
    );
  const coveredTopicIds = new Set(
    sessionsForTopics.map((s) => s.topicId).filter(Boolean)
  );

  // Match skills against uncovered topic titles/descriptions
  const allSkills = [...skillsBySubject.values()].flat();
  for (const topic of allTopics) {
    if (coveredTopicIds.has(topic.id)) continue;

    const titleLower = topic.title.toLowerCase();
    const descLower = (topic.description ?? '').toLowerCase();

    for (const skill of allSkills) {
      const skillLower = skill.toLowerCase();
      if (titleLower.includes(skillLower) || descLower.includes(skillLower)) {
        // Find the book for context
        let bookTitle: string | null = null;
        let bookEmoji: string | null = null;
        let matchSubjectId: string | null = null;

        if (topic.bookId) {
          const book = await db.query.curriculumBooks?.findFirst?.({
            where: eq(curriculumBooks.id, topic.bookId),
          });
          if (book) {
            bookTitle = book.title;
            bookEmoji = book.emoji;
            matchSubjectId = book.subjectId;
          }
        }

        // Resolve subject for boost check
        if (!matchSubjectId) {
          const curriculum = allCurricula.find(
            (c) => c.id === topic.curriculumId
          );
          matchSubjectId = curriculum?.subjectId ?? null;
        }

        const basePriority = 5;
        const priority =
          matchSubjectId && boostedSubjectIds.has(matchSubjectId)
            ? Math.min(basePriority + 3, 10)
            : basePriority;

        const hwCopy = homeworkConnectionCopy(skill, meta.learnerAge);

        return {
          id: meta.id,
          profileId,
          type: 'homework_connection' as const,
          title: hwCopy.title,
          body: hwCopy.body,
          priority,
          expiresAt: meta.expiresAt,
          createdAt: meta.createdAt,
          topicId: topic.id,
          bookTitle,
          bookEmoji,
          homeworkSkill: skill,
        };
      }
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
  // Check session count for cold-start detection (real activity only)
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        gte(learningSessions.exchangeCount, 1)
      )
    );

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
