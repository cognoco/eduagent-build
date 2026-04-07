import { desc, eq, sql } from 'drizzle-orm';
import {
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  HomeCard,
  HomeCardInteractionInput,
  HomeCardsResponse,
} from '@eduagent/schemas';
import {
  mergeHomeSurfaceCacheData,
  readHomeSurfaceCacheData,
  recordHomeCardInteraction,
} from './home-surface-cache';
import { getContinueSuggestion, getOverallProgress } from './progress';

const HOME_CARD_TTL_MS = 24 * 60 * 60 * 1000;
const COLD_START_SESSION_THRESHOLD = 5;

/**
 * Approximate homework window — widened to 12:00-22:00 UTC to cover
 * US afternoons through EU evenings. Will narrow once profile timezone
 * is stored. See bug #23.
 */
function isHomeworkWindow(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= 12 && hour <= 22;
}

function applyInteractionAdjustments(
  card: HomeCard,
  interactionStats: NonNullable<
    Awaited<ReturnType<typeof readHomeSurfaceCacheData>>
  >['data']['interactionStats']
): HomeCard {
  const taps = interactionStats.tapsByCardId[card.id] ?? 0;
  const dismissals = interactionStats.dismissalsByCardId[card.id] ?? 0;
  const priorityBoost = Math.min(taps * 2, 8);
  const dismissalPenalty = dismissals >= 3 ? 20 : 0;

  return {
    ...card,
    priority: card.priority + priorityBoost - dismissalPenalty,
  };
}

export async function precomputeHomeCards(
  db: Database,
  profileId: string,
  existingCache?: Awaited<ReturnType<typeof readHomeSurfaceCacheData>>
): Promise<HomeCardsResponse> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  const [
    countResult,
    allSubjects,
    overallProgress,
    continueSuggestion,
    cached,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(learningSessions)
      .where(eq(learningSessions.profileId, profileId)),
    repo.subjects.findMany(),
    getOverallProgress(db, profileId),
    getContinueSuggestion(db, profileId),
    // Reuse existing cache if provided, avoiding a duplicate DB read (#24)
    existingCache !== undefined
      ? Promise.resolve(existingCache)
      : readHomeSurfaceCacheData(db, profileId),
  ]);

  const sessionCount = countResult[0]?.count ?? 0;
  const coldStart = sessionCount < COLD_START_SESSION_THRESHOLD;
  const interactionStats = cached?.data.interactionStats ?? {
    tapsByCardId: {},
    dismissalsByCardId: {},
    events: [],
  };

  const activeSubjects = allSubjects.filter(
    (subject) => subject.status === 'active'
  );
  const progressBySubjectId = new Map(
    overallProgress.subjects.map((subject) => [subject.subjectId, subject])
  );
  const firstActiveSubject = activeSubjects[0];
  const allActiveSubjectsVerified =
    activeSubjects.length > 0 &&
    activeSubjects.every((subject) => {
      const progress = progressBySubjectId.get(subject.id);
      return (
        progress != null &&
        progress.topicsTotal > 0 &&
        progress.topicsVerified >= progress.topicsTotal
      );
    });
  const totalReviewDue =
    overallProgress.subjects.reduce(
      (total, subject) => total + subject.urgencyScore,
      0
    ) ?? 0;
  const reviewSubjectNames = overallProgress.subjects
    .filter((subject) => subject.urgencyScore > 0)
    .map((subject) => subject.name)
    .slice(0, 3);
  const reviewSubject =
    overallProgress.subjects.find((subject) => subject.urgencyScore > 0) ??
    null;

  const recentSessions = await db.query.learningSessions.findMany({
    where: eq(learningSessions.profileId, profileId),
    orderBy: desc(learningSessions.lastActivityAt),
    limit: 8,
  });
  const homeworkSessionCount = recentSessions.filter(
    (session) => session.sessionType === 'homework'
  ).length;
  const learningSessionCount = recentSessions.filter(
    (session) => session.sessionType === 'learning'
  ).length;
  const lastSession = recentSessions[0];

  const cards: HomeCard[] = [];

  if (activeSubjects.length === 0 && allSubjects.length > 0) {
    cards.push({
      id: 'restore_subjects',
      title: 'No active subjects right now',
      subtitle:
        'Restore or resume a subject from your Library when you are ready.',
      badge: 'Subject control',
      primaryLabel: 'Manage subjects',
      priority: 85,
    });
  } else if (activeSubjects.length > 0) {
    if (allActiveSubjectsVerified) {
      cards.push({
        id: 'curriculum_complete',
        title: "You've mastered your subjects!",
        subtitle:
          'Celebrate the progress, keep reviewing when you want, or add something new to learn.',
        badge: 'Big milestone',
        primaryLabel: 'Add another subject',
        secondaryLabel: 'Keep reviewing',
        priority: 92,
      });
    }

    const studyPriority =
      68 +
      (continueSuggestion ? 12 : 0) +
      (lastSession?.sessionType === 'learning' ? 5 : 0) +
      (learningSessionCount > homeworkSessionCount ? 3 : 0);
    cards.push({
      id: 'study',
      title: continueSuggestion
        ? `Continue ${continueSuggestion.subjectName}`
        : `Study ${firstActiveSubject?.name ?? 'your subject'}`,
      subtitle: continueSuggestion
        ? continueSuggestion.topicTitle
        : 'Jump back into practice or keep building momentum.',
      badge: continueSuggestion ? 'Continue' : 'Study',
      primaryLabel: continueSuggestion ? 'Continue topic' : 'Practice now',
      priority: studyPriority,
      subjectId: continueSuggestion?.subjectId ?? firstActiveSubject?.id,
      subjectName: continueSuggestion?.subjectName ?? firstActiveSubject?.name,
      topicId: continueSuggestion?.topicId,
      topicName: continueSuggestion?.topicTitle,
    });

    cards.push({
      id: 'homework',
      title: 'Homework help',
      subtitle: firstActiveSubject
        ? `Snap a question and get direct help in ${firstActiveSubject.name}.`
        : 'Snap a question and open the camera.',
      badge: 'Quick start',
      primaryLabel: 'Open camera',
      priority:
        70 +
        (isHomeworkWindow(now) ? 6 : 0) +
        (lastSession?.sessionType === 'homework' ? 5 : 0) +
        (homeworkSessionCount >= learningSessionCount ? 3 : 0),
      subjectId: firstActiveSubject?.id,
      subjectName: firstActiveSubject?.name,
      compact: true,
    });

    if (totalReviewDue > 0) {
      cards.push({
        id: 'review',
        title:
          totalReviewDue === 1
            ? '1 topic ready to review'
            : `${totalReviewDue} topics ready to review`,
        subtitle:
          reviewSubjectNames.length > 0
            ? reviewSubjectNames.join(', ')
            : 'Open your Library to revisit what needs another look.',
        badge: totalReviewDue >= 3 ? 'Needs review' : 'Review',
        primaryLabel: 'Open Library',
        priority: totalReviewDue >= 3 ? 90 : 76,
        subjectId: reviewSubject?.subjectId,
        compact: true,
      });
    }

    cards.push({
      id: 'ask',
      title: 'Just ask something',
      subtitle:
        'Start a freeform session when you want to switch gears or follow curiosity.',
      primaryLabel: 'Start session',
      priority: 54,
      subjectId: firstActiveSubject?.id,
      compact: true,
    });
  }

  const rankedCards = cards
    .map((card) => applyInteractionAdjustments(card, interactionStats))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((card, index) => ({
      ...card,
      compact: coldStart ? false : index > 0 || !!card.compact,
    }));

  return {
    cards: rankedCards,
    coldStart,
  };
}

export async function getHomeCardsForProfile(
  db: Database,
  profileId: string
): Promise<HomeCardsResponse> {
  const cached = await readHomeSurfaceCacheData(db, profileId);
  const now = new Date();

  if (
    cached &&
    cached.row.expiresAt.getTime() > now.getTime() &&
    cached.data.rankedHomeCards.length > 0
  ) {
    return {
      cards: cached.data.rankedHomeCards,
      coldStart: cached.data.coldStart ?? false,
    };
  }

  const next = await precomputeHomeCards(db, profileId, cached);

  await mergeHomeSurfaceCacheData(
    db,
    profileId,
    (current) => ({
      ...current,
      rankedHomeCards: next.cards,
      coldStart: next.coldStart,
    }),
    { expiresAt: new Date(now.getTime() + HOME_CARD_TTL_MS) }
  );

  return next;
}

export async function trackHomeCardInteraction(
  db: Database,
  profileId: string,
  input: HomeCardInteractionInput
): Promise<void> {
  await recordHomeCardInteraction(db, profileId, input);
}
