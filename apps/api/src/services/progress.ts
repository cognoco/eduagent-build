// ---------------------------------------------------------------------------
// Progress Service — Sprint 8 Phase 1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, gte, inArray } from 'drizzle-orm';
import {
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  retentionCards,
  assessments,
  needsDeepeningTopics,
  xpLedger,
  sessionSummaries,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  LearningResumeScope,
  LearningResumeTarget,
  ReportPracticeSummary,
  SubjectProgress,
  TopicProgress,
} from '@eduagent/schemas';
import {
  getPracticeActivitySummary,
  getPracticeActivitySummaryBatch,
} from './practice-activity-summary';
import { computeDaysSinceLastReview } from './retention-data';
import {
  addTopicCompletion,
  isAcceptedSummaryStatus,
  isMeaningfulCompletedSession,
} from './topic-completion';
import { resolveMasteryVerificationState } from './challenge-round/verification';
import { STABILITY_THRESHOLD } from './retention';
import {
  findOwnedCurriculumTopic,
  findOwnedCurriculumTopics,
} from './curriculum-topic-ownership';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROGRESS_OVERVIEW_PRACTICE_WINDOW_DAYS = 90;

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Returns a zeroed `ReportPracticeSummary` shape. Used as the fallback for
 * profiles that have no practice activity in the requested window.
 *
 * IMPORTANT: Never substitute another profile's summary as a fallback —
 * doing so leaks practice data across profiles in batch endpoints. Always
 * call this helper for the missing-profile path.
 */
function emptyPracticeSummary(): ReportPracticeSummary {
  return {
    quizzesCompleted: 0,
    reviewsCompleted: 0,
    totals: {
      activitiesCompleted: 0,
      reviewsCompleted: 0,
      pointsEarned: 0,
      celebrations: 0,
      distinctActivityTypes: 0,
    },
    scores: {
      scoredActivities: 0,
      score: 0,
      total: 0,
      accuracy: null,
    },
    byType: [],
    bySubject: [],
  };
}

function computeRetentionStatus(
  nextReviewAt: Date | null,
): 'strong' | 'fading' | 'weak' | 'forgotten' {
  if (!nextReviewAt) return 'forgotten';
  const now = new Date();
  const daysUntilReview =
    (nextReviewAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  if (daysUntilReview > -7) return 'weak';
  return 'forgotten';
}

function computeAggregateRetentionStatus(
  statuses: Array<'strong' | 'fading' | 'weak' | 'forgotten'>,
): 'strong' | 'fading' | 'weak' | 'forgotten' | 'unknown' {
  // [L1.C1.11] Zero cards = no retention signal. Returning 'strong' here would
  // falsely advertise that the learner has retained material they never
  // attempted; 'unknown' makes the absence of data explicit to UI consumers
  // (they can show a neutral placeholder rather than a green checkmark).
  if (statuses.length === 0) return 'unknown';
  const forgottenCount = statuses.filter((s) => s === 'forgotten').length;
  const weakCount = statuses.filter((s) => s === 'weak').length;
  const fadingCount = statuses.filter((s) => s === 'fading').length;
  if (forgottenCount > statuses.length * 0.3) return 'forgotten';
  if (weakCount + forgottenCount > statuses.length * 0.3) return 'weak';
  if (fadingCount + weakCount + forgottenCount > statuses.length * 0.3)
    return 'fading';
  return 'strong';
}

function computeCompletionStatus(
  sessionCount: number,
  hasCompletedSessionSignal: boolean,
  assessment: { status: string; masteryScore: number | null } | undefined,
  retentionCard: { xpStatus: string; nextReviewAt: Date | null } | undefined,
): 'not_started' | 'in_progress' | 'completed' | 'verified' | 'stable' {
  if (retentionCard?.xpStatus === 'verified') return 'verified';
  if (assessment?.status === 'passed') return 'completed';
  if (hasCompletedSessionSignal) return 'completed';
  if (sessionCount > 0 || assessment) return 'in_progress';
  return 'not_started';
}

function computeThreeStateTopicSets(
  cards: Array<{ topicId: string; masteredAt: Date | null }>,
  completedTopics: Set<string>,
): { masteredTopics: Set<string>; learningTopics: Set<string> } {
  const masteredTopics = new Set<string>();
  const learningTopics = new Set<string>(completedTopics);

  for (const card of cards) {
    learningTopics.add(card.topicId);
    if (card.masteredAt != null) {
      masteredTopics.add(card.topicId);
    }
  }

  for (const topicId of masteredTopics) {
    learningTopics.delete(topicId);
  }

  return { masteredTopics, learningTopics };
}

function firstCurriculumBySubject<T extends { subjectId: string }>(
  curriculumRows: T[],
): Map<string, T> {
  const bySubject = new Map<string, T>();
  for (const curriculum of curriculumRows) {
    if (!bySubject.has(curriculum.subjectId)) {
      bySubject.set(curriculum.subjectId, curriculum);
    }
  }
  return bySubject;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function getSubjectProgress(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<SubjectProgress | null> {
  const repo = createScopedRepository(db, profileId);

  // Verify subject belongs to profile
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return null;

  // Find curriculum for this subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });

  if (!curriculum) {
    return {
      subjectId: subject.id,
      name: subject.name,
      topicsTotal: 0,
      topicsCompleted: 0,
      topicsVerified: 0,
      topicsMastered: 0,
      topicsLearning: 0,
      urgencyScore: 0,
      retentionStatus: 'strong',
      lastSessionAt: null,
    };
  }

  // Get all topics for this curriculum.
  // [FCR-2026-05-23-L3.L3.4] No explicit profileId filter is needed here
  // because ownership is enforced transitively: curriculumTopics belong to
  // a curriculum, which belongs to a subject, which is profileId-scoped.
  // The call to findOwnedCurriculumTopics below re-joins through that parent
  // chain (curriculumTopics → curriculumBooks → curricula → subjects) and
  // applies eq(subjects.profileId, profileId) in the WHERE clause — any topic
  // that does not transitively belong to the caller's subject is filtered out.
  // The initial unscoped fetch is therefore safe and intentional.
  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      eq(curriculumTopics.curriculumId, curriculum.id),
      eq(curriculumTopics.skipped, false),
    ),
  });

  const ownedTopics =
    topics.length > 0
      ? await findOwnedCurriculumTopics(db, {
          profileId,
          subjectId,
          topicIds: topics.map((t) => t.id),
        })
      : [];
  const ownedTopicIds = new Set(ownedTopics.map((t) => t.topicId));
  const scopedTopics = topics.filter((t) => ownedTopicIds.has(t.id));
  const topicIds = scopedTopics.map((t) => t.id);
  const topicIdSet = new Set(topicIds);

  // Get retention cards for these topics (filtered at DB level, not in JS)
  const topicCardsRaw =
    topicIds.length > 0
      ? await repo.retentionCards.findMany(
          inArray(retentionCards.topicId, topicIds),
        )
      : [];
  const topicCards = topicCardsRaw.filter((card) =>
    topicIdSet.has(card.topicId),
  );

  // Get assessments for these topics (filtered at DB level, not in JS)
  const topicAssessmentsRaw =
    topicIds.length > 0
      ? await repo.assessments.findMany(inArray(assessments.topicId, topicIds))
      : [];
  const topicAssessments = topicAssessmentsRaw.filter((assessment) =>
    topicIdSet.has(assessment.topicId),
  );

  // Count completed/verified
  const completedTopics = new Set<string>();
  const verifiedTopics = new Set<string>();

  for (const assessment of topicAssessments) {
    if (assessment.status === 'passed') {
      completedTopics.add(assessment.topicId);
    }
  }
  for (const card of topicCards) {
    if (card.xpStatus === 'verified') {
      verifiedTopics.add(card.topicId);
      completedTopics.add(card.topicId);
    }
  }

  // Get last session for this subject (only sessions with real activity)
  const sessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.subjectId, subjectId),
      gte(learningSessions.exchangeCount, 1),
    ),
  );

  const sessionIds = sessions.map((session) => session.id);
  const sessionSummaryRows =
    sessionIds.length > 0
      ? await repo.sessionSummaries.findMany(
          inArray(sessionSummaries.sessionId, sessionIds),
        )
      : [];
  const acceptedSummarySessionIds = new Set(
    sessionSummaryRows
      .filter((summary) => isAcceptedSummaryStatus(summary.status))
      .map((summary) => summary.sessionId),
  );

  // A topic counts as complete only after a meaningful terminal session, an
  // accepted summary, a passed assessment, or verified retention.
  const curriculumTopicIds = new Set(scopedTopics.map((t) => t.id));
  for (const session of sessions) {
    if (isMeaningfulCompletedSession(session)) {
      addTopicCompletion(completedTopics, session.topicId, curriculumTopicIds);
    } else if (acceptedSummarySessionIds.has(session.id)) {
      addTopicCompletion(completedTopics, session.topicId, curriculumTopicIds);
    }
  }

  const lastSession = sessions.sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
  )[0];

  // Compute retention status from cards
  const retentionStatuses = topicCards.map((c) =>
    computeRetentionStatus(c.nextReviewAt),
  );
  const retentionStatus = computeAggregateRetentionStatus(retentionStatuses);

  // Urgency: count of overdue reviews
  const now = new Date();
  const overdueCount = topicCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() < now.getTime(),
  ).length;
  const { masteredTopics, learningTopics } = computeThreeStateTopicSets(
    topicCards,
    completedTopics,
  );

  return {
    subjectId: subject.id,
    name: subject.name,
    topicsTotal: scopedTopics.length,
    topicsCompleted: completedTopics.size,
    topicsVerified: verifiedTopics.size,
    topicsMastered: masteredTopics.size,
    topicsLearning: learningTopics.size,
    urgencyScore: overdueCount,
    retentionStatus,
    lastSessionAt: lastSession?.lastActivityAt.toISOString() ?? null,
  };
}

export async function getTopicProgress(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<TopicProgress | null> {
  const repo = createScopedRepository(db, profileId);

  // Verify subject belongs to profile
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return null;

  const topic = await findOwnedCurriculumTopic(db, {
    profileId,
    subjectId,
    topicId,
  });
  if (!topic) return null;

  // Get retention card
  const retentionCard = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId),
  );

  // Get latest assessment
  const topicAssessments = await repo.assessments.findMany(
    eq(assessments.topicId, topicId),
  );
  const latestAssessment = topicAssessments.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  // Phase 5: take the most-recent non-null Challenge Round verification stamp.
  // Mastery rows accumulate; `progress.ts already reads the latest
  // masteryChallengeVerifiedAt` (plan line 383). Iterating once over the
  // already-fetched list is cheaper than a second query.
  const latestVerifiedAt = topicAssessments.reduce<Date | null>((acc, row) => {
    const stamp = row.masteryChallengeVerifiedAt;
    if (stamp == null) return acc;
    return acc == null || stamp.getTime() > acc.getTime() ? stamp : acc;
  }, null);

  // Count sessions for this topic. Only sessions with at least 1 real exchange
  // count — ghost sessions (created but abandoned with 0 exchanges) must not
  // make a topic appear "started". Matches dashboard.ts and curriculum.ts.
  const topicSessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.topicId, topicId),
      gte(learningSessions.exchangeCount, 1),
    ),
  );

  // Check needs-deepening status
  const deepeningTopics = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, topicId),
  );
  const activeDeepening = deepeningTopics.find((d) => d.status === 'active');

  // Get XP ledger entry
  const xpEntries = await repo.xpLedger.findMany(eq(xpLedger.topicId, topicId));
  const latestXp = xpEntries.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];

  // Get session summary excerpt from the most recent session.
  // findMany returns DB insertion order — sort by createdAt to get the true latest.
  const sortedSessions = topicSessions.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const lastTopicSession = sortedSessions[0];
  const topicSessionIds = topicSessions.map((session) => session.id);
  const topicSummaryRows =
    topicSessionIds.length > 0
      ? await repo.sessionSummaries.findMany(
          inArray(sessionSummaries.sessionId, topicSessionIds),
        )
      : [];
  const summaryBySessionId = new Map(
    topicSummaryRows.map((summary) => [summary.sessionId, summary]),
  );
  const summaryRow =
    lastTopicSession != null
      ? summaryBySessionId.get(lastTopicSession.id)
      : undefined;
  const hasCompletedSessionSignal =
    topicSessions.some(isMeaningfulCompletedSession) ||
    topicSummaryRows.some((summary) => isAcceptedSummaryStatus(summary.status));

  const completionStatus = computeCompletionStatus(
    topicSessions.length,
    hasCompletedSessionSignal,
    latestAssessment
      ? {
          status: latestAssessment.status,
          masteryScore: latestAssessment.masteryScore,
        }
      : undefined,
    retentionCard
      ? {
          xpStatus: retentionCard.xpStatus,
          nextReviewAt: retentionCard.nextReviewAt,
        }
      : undefined,
  );

  const retentionStatus = retentionCard
    ? computeRetentionStatus(retentionCard.nextReviewAt)
    : null;

  // Extend retention status with 'forgotten' for cards that failed repeatedly
  const extendedRetentionStatus:
    | 'strong'
    | 'fading'
    | 'weak'
    | 'forgotten'
    | null =
    retentionCard && retentionCard.failureCount >= 3
      ? 'forgotten'
      : retentionStatus;
  const struggleStatus: TopicProgress['struggleStatus'] = activeDeepening
    ? retentionCard && retentionCard.failureCount >= 3
      ? 'blocked'
      : 'needs_deepening'
    : 'normal';

  return {
    topicId: topic.topicId,
    title: topic.topicTitle,
    description: topic.topicDescription ?? '',
    completionStatus,
    retentionStatus: extendedRetentionStatus,
    daysSinceLastReview: retentionCard
      ? computeDaysSinceLastReview(retentionCard.lastReviewedAt)
      : null,
    struggleStatus,
    masteryScore: latestAssessment?.masteryScore
      ? Number(latestAssessment.masteryScore)
      : null,
    masteredAt: retentionCard?.masteredAt?.toISOString() ?? null,
    strongReviews: retentionCard?.consecutiveSuccesses ?? 0,
    strongReviewsTarget: STABILITY_THRESHOLD,
    // Phase 5: server-resolved verification state. Raw
    // `masteryChallengeVerifiedAt` is intentionally NOT included on the wire
    // anymore — mobile reads `masteryVerificationState` instead so the
    // pending-review counter-evidence is always considered. The schema slot
    // is kept for back-compat but is left undefined.
    masteryVerificationState: resolveMasteryVerificationState({
      verifiedAt: latestVerifiedAt,
      newWeakSpotRows: deepeningTopics,
    }),
    summaryExcerpt: summaryRow?.content?.slice(0, 200) ?? null,
    xpStatus: (latestXp?.status as 'pending' | 'verified' | 'decayed') ?? null,
    totalSessions: topicSessions.length,
  };
}

export async function getOverallProgress(
  db: Database,
  profileId: string,
): Promise<{
  subjects: SubjectProgress[];
  totalTopicsCompleted: number;
  totalTopicsVerified: number;
  totalTopicsMastered: number;
  totalTopicsLearning: number;
  practiceActivityCount: number;
  practiceSummary: ReportPracticeSummary;
}> {
  const repo = createScopedRepository(db, profileId);

  const practiceSummaryEnd = new Date();
  // 1. Batch independent overview queries upfront (constant count regardless
  // of N subjects). The practice activity summary does not depend on subjects,
  // so keep it off the subject/curriculum critical path.
  const [allSubjects, practiceSummary] = await Promise.all([
    repo.subjects.findMany(),
    getPracticeActivitySummary(db, {
      profileId,
      // Overview is loaded on every Progress tab visit, so keep the practice
      // activity scan bounded. Long-range/all-time reporting belongs on report
      // detail endpoints that are opened intentionally.
      period: {
        start: subtractDays(
          practiceSummaryEnd,
          PROGRESS_OVERVIEW_PRACTICE_WINDOW_DAYS,
        ),
        endExclusive: practiceSummaryEnd,
      },
    }),
  ]);

  if (allSubjects.length === 0) {
    return {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
      totalTopicsMastered: 0,
      totalTopicsLearning: 0,
      practiceActivityCount: practiceSummary.totals.activitiesCompleted,
      practiceSummary,
    };
  }

  const subjectIds = allSubjects.map((s) => s.id);

  // Fetch all curricula for these subjects in one query
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
    orderBy: desc(curricula.version),
  });

  const curriculumIds = allCurricula.map((c) => c.id);
  const curriculumBySubject = firstCurriculumBySubject(allCurricula);

  // Fetch all topics for all curricula in one query
  const allTopics =
    curriculumIds.length > 0
      ? await db.query.curriculumTopics.findMany({
          where: and(
            inArray(curriculumTopics.curriculumId, curriculumIds),
            eq(curriculumTopics.skipped, false),
          ),
        })
      : [];

  const ownedTopics =
    allTopics.length > 0
      ? await findOwnedCurriculumTopics(db, {
          profileId,
          topicIds: allTopics.map((t) => t.id),
        })
      : [];
  const ownedTopicIds = new Set(ownedTopics.map((t) => t.topicId));
  const scopedTopics = allTopics.filter((t) => ownedTopicIds.has(t.id));
  const topicIds = scopedTopics.map((t) => t.id);
  const topicIdSet = new Set(topicIds);
  const topicsByCurriculum = new Map<string, typeof allTopics>();
  for (const topic of scopedTopics) {
    const list = topicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    topicsByCurriculum.set(topic.curriculumId, list);
  }

  // Fetch all retention cards in one query
  const allCardsRaw =
    topicIds.length > 0
      ? await repo.retentionCards.findMany(
          inArray(retentionCards.topicId, topicIds),
        )
      : [];
  const allCards = allCardsRaw.filter((card) => topicIdSet.has(card.topicId));

  const cardsByTopic = new Map<string, typeof allCards>();
  for (const card of allCards) {
    const list = cardsByTopic.get(card.topicId) ?? [];
    list.push(card);
    cardsByTopic.set(card.topicId, list);
  }

  // Fetch all assessments in one query
  const allAssessmentsRaw =
    topicIds.length > 0
      ? await repo.assessments.findMany(inArray(assessments.topicId, topicIds))
      : [];
  const allAssessments = allAssessmentsRaw.filter((assessment) =>
    topicIdSet.has(assessment.topicId),
  );

  const assessmentsByTopic = new Map<string, typeof allAssessments>();
  for (const assessment of allAssessments) {
    const list = assessmentsByTopic.get(assessment.topicId) ?? [];
    list.push(assessment);
    assessmentsByTopic.set(assessment.topicId, list);
  }

  // Fetch all sessions in one query (only sessions with real activity)
  const allSessions =
    subjectIds.length > 0
      ? await repo.sessions.findMany(
          and(
            inArray(learningSessions.subjectId, subjectIds),
            gte(learningSessions.exchangeCount, 1),
          ),
        )
      : [];
  const allSessionSummaries =
    allSessions.length > 0
      ? await repo.sessionSummaries.findMany(
          inArray(
            sessionSummaries.sessionId,
            allSessions.map((session) => session.id),
          ),
        )
      : [];
  const acceptedSummarySessionIds = new Set(
    allSessionSummaries
      .filter((summary) => isAcceptedSummaryStatus(summary.status))
      .map((summary) => summary.sessionId),
  );

  const sessionsBySubject = new Map<string, typeof allSessions>();
  for (const session of allSessions) {
    const list = sessionsBySubject.get(session.subjectId) ?? [];
    list.push(session);
    sessionsBySubject.set(session.subjectId, list);
  }

  // 2. Compute per-subject progress in-memory
  const subjectProgressList: SubjectProgress[] = [];
  let totalCompleted = 0;
  let totalVerified = 0;
  let totalMastered = 0;
  let totalLearning = 0;

  for (const subject of allSubjects) {
    const curriculum = curriculumBySubject.get(subject.id);

    if (!curriculum) {
      subjectProgressList.push({
        subjectId: subject.id,
        name: subject.name,
        topicsTotal: 0,
        topicsCompleted: 0,
        topicsVerified: 0,
        topicsMastered: 0,
        topicsLearning: 0,
        urgencyScore: 0,
        retentionStatus: 'strong',
        lastSessionAt: null,
      });
      continue;
    }

    const topics = topicsByCurriculum.get(curriculum.id) ?? [];

    const completedTopics = new Set<string>();
    const verifiedTopics = new Set<string>();

    for (const topic of topics) {
      const topicAssessments = assessmentsByTopic.get(topic.id) ?? [];
      const topicCards = cardsByTopic.get(topic.id) ?? [];

      for (const a of topicAssessments) {
        if (a.status === 'passed') completedTopics.add(a.topicId);
      }
      for (const c of topicCards) {
        if (c.xpStatus === 'verified') {
          verifiedTopics.add(c.topicId);
          completedTopics.add(c.topicId);
        }
      }
    }

    // Last session
    const subjectSessions = sessionsBySubject.get(subject.id) ?? [];

    // Session-derived completion uses the same strict meaning as book status:
    // enough terminal exchange depth or an accepted summary.
    const curriculumTopicIds = new Set(topics.map((t) => t.id));
    for (const session of subjectSessions) {
      if (isMeaningfulCompletedSession(session)) {
        addTopicCompletion(
          completedTopics,
          session.topicId,
          curriculumTopicIds,
        );
      } else if (acceptedSummarySessionIds.has(session.id)) {
        addTopicCompletion(
          completedTopics,
          session.topicId,
          curriculumTopicIds,
        );
      }
    }

    const lastSession = subjectSessions.sort(
      (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
    )[0];

    // Retention status from all cards for this subject's topics
    const subjectTopicIds = new Set(topics.map((t) => t.id));
    const subjectCards = allCards.filter((c) => subjectTopicIds.has(c.topicId));
    const { masteredTopics, learningTopics } = computeThreeStateTopicSets(
      subjectCards,
      completedTopics,
    );
    const retentionStatuses = subjectCards.map((c) =>
      computeRetentionStatus(c.nextReviewAt),
    );
    const retentionStatus = computeAggregateRetentionStatus(retentionStatuses);

    // Urgency: count of overdue reviews
    const now = new Date();
    const overdueCount = subjectCards.filter(
      (c) => c.nextReviewAt && c.nextReviewAt.getTime() < now.getTime(),
    ).length;

    const progress: SubjectProgress = {
      subjectId: subject.id,
      name: subject.name,
      topicsTotal: topics.length,
      topicsCompleted: completedTopics.size,
      topicsVerified: verifiedTopics.size,
      topicsMastered: masteredTopics.size,
      topicsLearning: learningTopics.size,
      urgencyScore: overdueCount,
      retentionStatus,
      lastSessionAt: lastSession?.lastActivityAt.toISOString() ?? null,
    };

    subjectProgressList.push(progress);
    totalCompleted += completedTopics.size;
    totalVerified += verifiedTopics.size;
    totalMastered += masteredTopics.size;
    totalLearning += learningTopics.size;
  }

  return {
    subjects: subjectProgressList,
    totalTopicsCompleted: totalCompleted,
    totalTopicsVerified: totalVerified,
    totalTopicsMastered: totalMastered,
    totalTopicsLearning: totalLearning,
    practiceActivityCount: practiceSummary.totals.activitiesCompleted,
    practiceSummary,
  };
}

/** Return type of getOverallProgress, for reuse in the batch variant. */
export type OverallProgressResult = Awaited<
  ReturnType<typeof getOverallProgress>
>;

// ---------------------------------------------------------------------------
// Batch variant — fetches overall progress for N profiles using a fixed query
// set instead of ~8 × N. Used by the parent dashboard endpoint
// (getChildrenForParent) to collapse the per-child fan-out.
// ---------------------------------------------------------------------------

export async function getOverallProgressBatch(
  db: Database,
  profileIds: string[],
): Promise<Map<string, OverallProgressResult>> {
  if (profileIds.length === 0) return new Map();

  const practiceSummaryEnd = new Date();
  const practiceWindowStart = subtractDays(
    practiceSummaryEnd,
    PROGRESS_OVERVIEW_PRACTICE_WINDOW_DAYS,
  );

  // 1. Batch independent queries upfront — 2 queries total (subjects + practice).
  const [allSubjects, practiceSummaries] = await Promise.all([
    db.query.subjects.findMany({
      where: inArray(subjects.profileId, profileIds),
    }),
    getPracticeActivitySummaryBatch(db, profileIds, {
      start: practiceWindowStart,
      endExclusive: practiceSummaryEnd,
    }),
  ]);

  if (allSubjects.length === 0) {
    // Every profile has zero subjects — return empty results for each.
    // SECURITY: construct the empty practice summary per-profile from the
    // zeroed default — NEVER take a fallback from another profile's
    // summary (e.g. `practiceSummaries.values().next().value`), which
    // would leak profile A's practice data into profile B's result when
    // B has no own entry. See `emptyPracticeSummary()` doc.
    const result = new Map<string, OverallProgressResult>();
    for (const pid of profileIds) {
      const ps = practiceSummaries.get(pid) ?? emptyPracticeSummary();
      result.set(pid, {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
        totalTopicsMastered: 0,
        totalTopicsLearning: 0,
        practiceActivityCount: ps.totals.activitiesCompleted,
        practiceSummary: ps,
      });
    }
    return result;
  }

  // Index subjects by profileId
  const subjectsByProfile = new Map<string, typeof allSubjects>();
  for (const s of allSubjects) {
    const list = subjectsByProfile.get(s.profileId) ?? [];
    list.push(s);
    subjectsByProfile.set(s.profileId, list);
  }

  const allSubjectIds = allSubjects.map((s) => s.id);

  // 2. Fetch all curricula for all subjects — 1 query
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, allSubjectIds),
    orderBy: desc(curricula.version),
  });

  const curriculumIds = allCurricula.map((c) => c.id);
  const curriculumBySubject = firstCurriculumBySubject(allCurricula);

  // 3. Fetch all topics for all curricula — 1 query
  const allTopics =
    curriculumIds.length > 0
      ? await db.query.curriculumTopics.findMany({
          where: and(
            inArray(curriculumTopics.curriculumId, curriculumIds),
            eq(curriculumTopics.skipped, false),
          ),
        })
      : [];

  const subjectProfileById = new Map(
    allSubjects.map((s) => [s.id, s.profileId]),
  );
  const curriculumProfileById = new Map(
    allCurricula.flatMap((c) => {
      const profileId = subjectProfileById.get(c.subjectId);
      return profileId ? [[c.id, profileId] as const] : [];
    }),
  );

  const candidateTopicIds = allTopics.map((t) => t.id);
  const ownedTopicRows =
    candidateTopicIds.length > 0
      ? await db
          .select({
            profileId: subjects.profileId,
            topicId: curriculumTopics.id,
          })
          .from(curriculumTopics)
          .innerJoin(
            curriculumBooks,
            eq(curriculumBooks.id, curriculumTopics.bookId),
          )
          .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
          .innerJoin(
            subjects,
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.id, curricula.subjectId),
            ),
          )
          .where(
            and(
              inArray(curriculumTopics.id, candidateTopicIds),
              inArray(subjects.profileId, profileIds),
            ),
          )
      : [];
  const ownedTopicIdsByProfile = new Map<string, Set<string>>();
  for (const row of ownedTopicRows) {
    const list = ownedTopicIdsByProfile.get(row.profileId) ?? new Set<string>();
    list.add(row.topicId);
    ownedTopicIdsByProfile.set(row.profileId, list);
  }
  const scopedTopics = allTopics.filter((topic) => {
    const profileId = curriculumProfileById.get(topic.curriculumId);
    return (
      profileId != null &&
      (ownedTopicIdsByProfile.get(profileId)?.has(topic.id) ?? false)
    );
  });

  const topicIds = scopedTopics.map((t) => t.id);
  const topicIdSet = new Set(topicIds);
  const topicsByCurriculum = new Map<string, typeof allTopics>();
  for (const topic of scopedTopics) {
    const list = topicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    topicsByCurriculum.set(topic.curriculumId, list);
  }

  // 4. Batch fetch retention cards, assessments, sessions, session summaries
  // using inArray on profileId — 4 queries total (parallel).
  const [allCardsRaw, allAssessmentsRaw, allSessions] = await Promise.all([
    topicIds.length > 0
      ? db.query.retentionCards.findMany({
          where: and(
            inArray(retentionCards.profileId, profileIds),
            inArray(retentionCards.topicId, topicIds),
          ),
        })
      : Promise.resolve([]),
    topicIds.length > 0
      ? db.query.assessments.findMany({
          where: and(
            inArray(assessments.profileId, profileIds),
            inArray(assessments.topicId, topicIds),
          ),
        })
      : Promise.resolve([]),
    allSubjectIds.length > 0
      ? db.query.learningSessions.findMany({
          where: and(
            inArray(learningSessions.profileId, profileIds),
            inArray(learningSessions.subjectId, allSubjectIds),
            gte(learningSessions.exchangeCount, 1),
          ),
        })
      : Promise.resolve([]),
  ]);
  const allCards = allCardsRaw.filter((card) => topicIdSet.has(card.topicId));
  const allAssessments = allAssessmentsRaw.filter((assessment) =>
    topicIdSet.has(assessment.topicId),
  );

  // 5. Fetch all session summaries for the sessions we loaded — 1 query
  const allSessionSummaries =
    allSessions.length > 0
      ? await db.query.sessionSummaries.findMany({
          where: and(
            inArray(
              sessionSummaries.sessionId,
              allSessions.map((session) => session.id),
            ),
            inArray(sessionSummaries.profileId, profileIds),
          ),
        })
      : [];
  const acceptedSummarySessionKeys = new Set(
    allSessionSummaries
      .filter((summary) => isAcceptedSummaryStatus(summary.status))
      .map((summary) => `${summary.profileId}:${summary.sessionId}`),
  );

  // 6. Index everything by profileId for in-memory assembly.
  // Cards: index by profileId → topicId
  const cardsByProfileAndTopic = new Map<
    string,
    Map<string, typeof allCards>
  >();
  for (const card of allCards) {
    let profileMap = cardsByProfileAndTopic.get(card.profileId);
    if (!profileMap) {
      profileMap = new Map();
      cardsByProfileAndTopic.set(card.profileId, profileMap);
    }
    const list = profileMap.get(card.topicId) ?? [];
    list.push(card);
    profileMap.set(card.topicId, list);
  }

  // Assessments: index by profileId → topicId
  const assessmentsByProfileAndTopic = new Map<
    string,
    Map<string, typeof allAssessments>
  >();
  for (const assessment of allAssessments) {
    let profileMap = assessmentsByProfileAndTopic.get(assessment.profileId);
    if (!profileMap) {
      profileMap = new Map();
      assessmentsByProfileAndTopic.set(assessment.profileId, profileMap);
    }
    const list = profileMap.get(assessment.topicId) ?? [];
    list.push(assessment);
    profileMap.set(assessment.topicId, list);
  }

  // Sessions: index by profileId → subjectId
  const sessionsByProfileAndSubject = new Map<
    string,
    Map<string, typeof allSessions>
  >();
  for (const session of allSessions) {
    let profileMap = sessionsByProfileAndSubject.get(session.profileId);
    if (!profileMap) {
      profileMap = new Map();
      sessionsByProfileAndSubject.set(session.profileId, profileMap);
    }
    const list = profileMap.get(session.subjectId) ?? [];
    list.push(session);
    profileMap.set(session.subjectId, list);
  }

  // All cards flat by profileId (for retention computation)
  const allCardsByProfile = new Map<string, typeof allCards>();
  for (const card of allCards) {
    const list = allCardsByProfile.get(card.profileId) ?? [];
    list.push(card);
    allCardsByProfile.set(card.profileId, list);
  }

  // 7. Compute per-profile progress in-memory — same logic as getOverallProgress
  const result = new Map<string, OverallProgressResult>();

  for (const profileId of profileIds) {
    const profileSubjects = subjectsByProfile.get(profileId) ?? [];
    const practiceSummary = practiceSummaries.get(profileId);

    if (profileSubjects.length === 0) {
      // SECURITY: `practiceSummary` is already keyed by this `profileId`
      // (from the batch). Fall back to the zeroed default — never to
      // another profile's data. See `emptyPracticeSummary()` doc.
      const emptyPractice: ReportPracticeSummary =
        practiceSummary ?? emptyPracticeSummary();
      result.set(profileId, {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
        totalTopicsMastered: 0,
        totalTopicsLearning: 0,
        practiceActivityCount: emptyPractice.totals.activitiesCompleted,
        practiceSummary: emptyPractice,
      });
      continue;
    }

    const profileCardsByTopic =
      cardsByProfileAndTopic.get(profileId) ?? new Map();
    const profileAssessmentsByTopic =
      assessmentsByProfileAndTopic.get(profileId) ?? new Map();
    const profileSessionsBySubject =
      sessionsByProfileAndSubject.get(profileId) ??
      new Map<string, typeof allSessions>();
    const profileCards = allCardsByProfile.get(profileId) ?? [];

    const subjectProgressList: SubjectProgress[] = [];
    let totalCompleted = 0;
    let totalVerified = 0;
    let totalMastered = 0;
    let totalLearning = 0;

    for (const subject of profileSubjects) {
      const curriculum = curriculumBySubject.get(subject.id);

      if (!curriculum) {
        subjectProgressList.push({
          subjectId: subject.id,
          name: subject.name,
          topicsTotal: 0,
          topicsCompleted: 0,
          topicsVerified: 0,
          topicsMastered: 0,
          topicsLearning: 0,
          urgencyScore: 0,
          retentionStatus: 'strong',
          lastSessionAt: null,
        });
        continue;
      }

      const topics = topicsByCurriculum.get(curriculum.id) ?? [];

      const completedTopics = new Set<string>();
      const verifiedTopics = new Set<string>();

      for (const topic of topics) {
        const topicAssessments = profileAssessmentsByTopic.get(topic.id) ?? [];
        const topicCards = profileCardsByTopic.get(topic.id) ?? [];

        for (const a of topicAssessments) {
          if (a.status === 'passed') completedTopics.add(a.topicId);
        }
        for (const c of topicCards) {
          if (c.xpStatus === 'verified') {
            verifiedTopics.add(c.topicId);
            completedTopics.add(c.topicId);
          }
        }
      }

      // Last session
      const subjectSessions = profileSessionsBySubject.get(subject.id) ?? [];

      const curriculumTopicIds = new Set(topics.map((t) => t.id));
      for (const session of subjectSessions) {
        if (isMeaningfulCompletedSession(session)) {
          addTopicCompletion(
            completedTopics,
            session.topicId,
            curriculumTopicIds,
          );
        } else if (
          acceptedSummarySessionKeys.has(`${session.profileId}:${session.id}`)
        ) {
          addTopicCompletion(
            completedTopics,
            session.topicId,
            curriculumTopicIds,
          );
        }
      }

      const lastSession = subjectSessions.sort(
        (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
      )[0];

      // Retention status from all cards for this subject's topics
      const subjectTopicIds = new Set(topics.map((t) => t.id));
      const subjectCards = profileCards.filter((c) =>
        subjectTopicIds.has(c.topicId),
      );
      const { masteredTopics, learningTopics } = computeThreeStateTopicSets(
        subjectCards,
        completedTopics,
      );
      const retentionStatuses = subjectCards.map((c) =>
        computeRetentionStatus(c.nextReviewAt),
      );
      const retentionStatus =
        computeAggregateRetentionStatus(retentionStatuses);

      // Urgency: count of overdue reviews
      const now = new Date();
      const overdueCount = subjectCards.filter(
        (c) => c.nextReviewAt && c.nextReviewAt.getTime() < now.getTime(),
      ).length;

      const progress: SubjectProgress = {
        subjectId: subject.id,
        name: subject.name,
        topicsTotal: topics.length,
        topicsCompleted: completedTopics.size,
        topicsVerified: verifiedTopics.size,
        topicsMastered: masteredTopics.size,
        topicsLearning: learningTopics.size,
        urgencyScore: overdueCount,
        retentionStatus,
        lastSessionAt: lastSession?.lastActivityAt.toISOString() ?? null,
      };

      subjectProgressList.push(progress);
      totalCompleted += completedTopics.size;
      totalVerified += verifiedTopics.size;
      totalMastered += masteredTopics.size;
      totalLearning += learningTopics.size;
    }

    const ps = practiceSummary ?? {
      quizzesCompleted: 0,
      reviewsCompleted: 0,
      totals: {
        activitiesCompleted: 0,
        reviewsCompleted: 0,
        pointsEarned: 0,
        celebrations: 0,
        distinctActivityTypes: 0,
      },
      scores: {
        scoredActivities: 0,
        score: 0,
        total: 0,
        accuracy: null,
      },
      byType: [],
      bySubject: [],
    };

    result.set(profileId, {
      subjects: subjectProgressList,
      totalTopicsCompleted: totalCompleted,
      totalTopicsVerified: totalVerified,
      totalTopicsMastered: totalMastered,
      totalTopicsLearning: totalLearning,
      practiceActivityCount: ps.totals.activitiesCompleted,
      practiceSummary: ps,
    });
  }

  return result;
}

/**
 * [F-PV-06] Batched version of getTopicProgress — fetches all data for N topics
 * using 6 inArray queries (constant subrequest count regardless of N) instead of
 * 7 queries per topic. Drops subrequests from 5 + 7N to ~11 total, staying well
 * within the Cloudflare Workers 50-subrequest limit.
 *
 * The caller (getChildSubjectTopics in dashboard.ts) has already verified the
 * subject belongs to the child profile and fetched the topic list, so this
 * function skips those lookups.
 */
export async function getTopicProgressBatch(
  db: Database,
  profileId: string,
  topics: Array<{ id: string; title: string; description: string }>,
): Promise<TopicProgress[]> {
  if (topics.length === 0) return [];

  const repo = createScopedRepository(db, profileId);
  const requestedTopicIds = topics.map((t) => t.id);
  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    topicIds: requestedTopicIds,
  });
  const ownedTopicById = new Map(
    ownedTopics.map((topic) => [topic.topicId, topic]),
  );
  const scopedTopics = topics.filter((topic) => ownedTopicById.has(topic.id));
  if (scopedTopics.length === 0) return [];

  const topicIds = scopedTopics.map((t) => t.id);
  const topicIdSet = new Set(topicIds);

  // 6 batch queries in parallel — constant count regardless of N topics
  const [allCards, allAssessments, allSessions, allDeepening, allXp] =
    await Promise.all([
      repo.retentionCards.findMany(inArray(retentionCards.topicId, topicIds)),
      repo.assessments.findMany(inArray(assessments.topicId, topicIds)),
      repo.sessions.findMany(
        and(
          inArray(learningSessions.topicId, topicIds),
          gte(learningSessions.exchangeCount, 1),
        ),
      ),
      repo.needsDeepeningTopics.findMany(
        inArray(needsDeepeningTopics.topicId, topicIds),
      ),
      repo.xpLedger.findMany(inArray(xpLedger.topicId, topicIds)),
    ]);

  // Index by topicId for O(1) lookups
  const cardsByTopic = new Map<string, typeof allCards>();
  for (const c of allCards.filter((card) => topicIdSet.has(card.topicId))) {
    const list = cardsByTopic.get(c.topicId) ?? [];
    list.push(c);
    cardsByTopic.set(c.topicId, list);
  }

  const assessmentsByTopic = new Map<string, typeof allAssessments>();
  for (const a of allAssessments.filter((assessment) =>
    topicIdSet.has(assessment.topicId),
  )) {
    const list = assessmentsByTopic.get(a.topicId) ?? [];
    list.push(a);
    assessmentsByTopic.set(a.topicId, list);
  }

  const sessionsByTopic = new Map<string, typeof allSessions>();
  const scopedSessions = allSessions.filter(
    (session) => session.topicId != null && topicIdSet.has(session.topicId),
  );
  for (const s of scopedSessions) {
    if (!s.topicId) continue;
    const list = sessionsByTopic.get(s.topicId) ?? [];
    list.push(s);
    sessionsByTopic.set(s.topicId, list);
  }

  const deepeningByTopic = new Map<string, typeof allDeepening>();
  for (const d of allDeepening.filter((deepening) =>
    topicIdSet.has(deepening.topicId),
  )) {
    const list = deepeningByTopic.get(d.topicId) ?? [];
    list.push(d);
    deepeningByTopic.set(d.topicId, list);
  }

  const xpByTopic = new Map<string, typeof allXp>();
  for (const x of allXp.filter(
    (xp) => xp.topicId != null && topicIdSet.has(xp.topicId),
  )) {
    if (!x.topicId) continue;
    const list = xpByTopic.get(x.topicId) ?? [];
    list.push(x);
    xpByTopic.set(x.topicId, list);
  }

  // Batch-fetch summaries for all topic sessions. We use all summaries for
  // completion signals, and the latest session's summary for the excerpt.
  const lastSessionByTopic = new Map<string, string>();
  for (const topic of scopedTopics) {
    const topicSessions = sessionsByTopic.get(topic.id) ?? [];
    const sorted = topicSessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const last = sorted[0];
    if (last) {
      lastSessionByTopic.set(topic.id, last.id);
    }
  }

  const allSessionIds = scopedSessions.map((session) => session.id);
  const allSummaries =
    allSessionIds.length > 0
      ? await repo.sessionSummaries.findMany(
          inArray(sessionSummaries.sessionId, allSessionIds),
        )
      : [];
  const summaryBySessionId = new Map(allSummaries.map((s) => [s.sessionId, s]));

  // Assemble per-topic progress in-memory
  return scopedTopics.map((topic) => {
    const ownedTopic = ownedTopicById.get(topic.id);
    const topicCards = cardsByTopic.get(topic.id) ?? [];
    const retentionCard = topicCards[0] ?? null;

    const topicAssessments = (assessmentsByTopic.get(topic.id) ?? []).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const latestAssessment = topicAssessments[0];
    // Phase 5: mirror the singular-getter logic — latest non-null CR
    // verification stamp drives `masteryVerificationState`.
    const latestVerifiedAt = topicAssessments.reduce<Date | null>(
      (acc, row) => {
        const stamp = row.masteryChallengeVerifiedAt;
        if (stamp == null) return acc;
        return acc == null || stamp.getTime() > acc.getTime() ? stamp : acc;
      },
      null,
    );

    const topicSessions = sessionsByTopic.get(topic.id) ?? [];

    const deepeningTopics = deepeningByTopic.get(topic.id) ?? [];
    const activeDeepening = deepeningTopics.find((d) => d.status === 'active');

    const xpEntries = (xpByTopic.get(topic.id) ?? []).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const latestXp = xpEntries[0];

    const lastSessionId = lastSessionByTopic.get(topic.id);
    const summaryRow = lastSessionId
      ? summaryBySessionId.get(lastSessionId)
      : undefined;
    const hasCompletedSessionSignal =
      topicSessions.some(isMeaningfulCompletedSession) ||
      topicSessions.some((session) =>
        isAcceptedSummaryStatus(summaryBySessionId.get(session.id)?.status),
      );

    const completionStatus = computeCompletionStatus(
      topicSessions.length,
      hasCompletedSessionSignal,
      latestAssessment
        ? {
            status: latestAssessment.status,
            masteryScore: latestAssessment.masteryScore,
          }
        : undefined,
      retentionCard
        ? {
            xpStatus: retentionCard.xpStatus,
            nextReviewAt: retentionCard.nextReviewAt,
          }
        : undefined,
    );

    const retentionStatus = retentionCard
      ? computeRetentionStatus(retentionCard.nextReviewAt)
      : null;

    const extendedRetentionStatus:
      | 'strong'
      | 'fading'
      | 'weak'
      | 'forgotten'
      | null =
      retentionCard && retentionCard.failureCount >= 3
        ? 'forgotten'
        : retentionStatus;

    const struggleStatus: TopicProgress['struggleStatus'] = activeDeepening
      ? retentionCard && retentionCard.failureCount >= 3
        ? 'blocked'
        : 'needs_deepening'
      : 'normal';

    return {
      topicId: topic.id,
      title: ownedTopic?.topicTitle ?? topic.title,
      description: ownedTopic?.topicDescription ?? topic.description,
      completionStatus,
      retentionStatus: extendedRetentionStatus,
      daysSinceLastReview: retentionCard
        ? computeDaysSinceLastReview(retentionCard.lastReviewedAt)
        : null,
      struggleStatus,
      masteryScore: latestAssessment?.masteryScore
        ? Number(latestAssessment.masteryScore)
        : null,
      masteredAt: retentionCard?.masteredAt?.toISOString() ?? null,
      strongReviews: retentionCard?.consecutiveSuccesses ?? 0,
      strongReviewsTarget: STABILITY_THRESHOLD,
      masteryVerificationState: resolveMasteryVerificationState({
        verifiedAt: latestVerifiedAt,
        newWeakSpotRows: deepeningTopics,
      }),
      summaryExcerpt: summaryRow?.content?.slice(0, 200) ?? null,
      xpStatus:
        (latestXp?.status as 'pending' | 'verified' | 'decayed') ?? null,
      totalSessions: topicSessions.length,
    };
  });
}

export async function getActiveSessionForTopic(
  db: Database,
  profileId: string,
  topicId: string,
): Promise<{ sessionId: string } | null> {
  const topic = await findOwnedCurriculumTopic(db, { profileId, topicId });
  if (!topic) return null;

  const repo = createScopedRepository(db, profileId);
  const sessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.topicId, topicId),
      inArray(learningSessions.status, ['active', 'paused']),
    ),
  );
  if (sessions.length === 0) return null;
  // Use spread to avoid mutating the repo array (consistent with getContinueSuggestion pattern)
  const sorted = [...sessions].sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
  );
  const newest = sorted[0];
  if (newest == null) return null;
  return { sessionId: newest.id };
}

// [F-009] Resolve the subject that owns a given topic — used for deep-link
// resolution when the client only has a topicId (no subjectId in the URL).
export async function resolveTopicSubject(
  db: Database,
  profileId: string,
  topicId: string,
): Promise<{
  subjectId: string;
  subjectName: string;
  topicTitle: string;
} | null> {
  const repo = createScopedRepository(db, profileId);

  const topic = await findOwnedCurriculumTopic(db, { profileId, topicId });
  if (!topic) return null;

  const subject = await repo.subjects.findFirst(
    eq(subjects.id, topic.subjectId),
  );
  if (!subject) return null;

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    topicTitle: topic.topicTitle,
  };
}

function sortByLatestActivity<T extends { lastActivityAt: Date }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
  );
}

function isRealLearningSession(
  session: typeof learningSessions.$inferSelect,
): boolean {
  return session.sessionType === 'learning' && session.exchangeCount >= 1;
}

function subjectActivityOrder(
  activeSubjects: Array<typeof subjects.$inferSelect>,
  sessions: Array<typeof learningSessions.$inferSelect>,
): Array<typeof subjects.$inferSelect> {
  const lastActivityBySubject = new Map<string, number>();
  for (const session of sessions) {
    const ts = session.lastActivityAt.getTime();
    const current = lastActivityBySubject.get(session.subjectId) ?? 0;
    if (ts > current) lastActivityBySubject.set(session.subjectId, ts);
  }

  return [...activeSubjects].sort((a, b) => {
    const aTime = lastActivityBySubject.get(a.id) ?? 0;
    const bTime = lastActivityBySubject.get(b.id) ?? 0;
    return bTime - aTime;
  });
}

export async function getLearningResumeTarget(
  db: Database,
  profileId: string,
  scope: LearningResumeScope = {},
): Promise<LearningResumeTarget | null> {
  const repo = createScopedRepository(db, profileId);
  let activeSubjects = (await repo.subjects.findMany()).filter(
    (subject) => subject.status === 'active',
  );
  if (scope.subjectId) {
    activeSubjects = activeSubjects.filter(
      (subject) => subject.id === scope.subjectId,
    );
  }
  if (activeSubjects.length === 0) return null;

  const subjectIds = activeSubjects.map((subject) => subject.id);
  const subjectById = new Map(
    activeSubjects.map((subject) => [subject.id, subject]),
  );
  const allSessions = (
    await repo.sessions.findMany(
      and(
        inArray(learningSessions.subjectId, subjectIds),
        gte(learningSessions.exchangeCount, 1),
      ),
    )
  ).filter(isRealLearningSession);

  const curriculumRows = await db
    .select({
      id: curricula.id,
      subjectId: curricula.subjectId,
      version: curricula.version,
    })
    .from(curricula)
    .where(inArray(curricula.subjectId, subjectIds))
    .orderBy(desc(curricula.version));

  const latestCurriculumBySubject = new Map<string, string>();
  for (const curriculum of curriculumRows) {
    if (!latestCurriculumBySubject.has(curriculum.subjectId)) {
      latestCurriculumBySubject.set(curriculum.subjectId, curriculum.id);
    }
  }

  const curriculumIds = curriculumRows.map((curriculum) => curriculum.id);
  if (curriculumIds.length === 0) {
    if (scope.topicId || scope.bookId) return null;

    const session =
      sortByLatestActivity(
        allSessions.filter(
          (candidate) =>
            candidate.status === 'active' || candidate.status === 'paused',
        ),
      )[0] ??
      sortByLatestActivity(
        allSessions.filter(
          (candidate) =>
            candidate.status === 'completed' ||
            candidate.status === 'auto_closed',
        ),
      )[0];
    if (!session) return null;

    const subject = subjectById.get(session.subjectId);
    if (!subject) return null;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      topicId: null,
      topicTitle: null,
      sessionId:
        session.status === 'active' || session.status === 'paused'
          ? session.id
          : null,
      resumeFromSessionId:
        session.status === 'completed' || session.status === 'auto_closed'
          ? session.id
          : null,
      resumeKind:
        session.status === 'active'
          ? 'active_session'
          : session.status === 'paused'
            ? 'paused_session'
            : 'subject_freeform',
      lastActivityAt: session.lastActivityAt.toISOString(),
      reason:
        session.status === 'active' || session.status === 'paused'
          ? `Resume your ${subject.name} session`
          : `Pick up your latest ${subject.name} session`,
    };
  }

  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      inArray(curriculumTopics.curriculumId, curriculumIds),
      eq(curriculumTopics.skipped, false),
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  const ownedTopics =
    topics.length > 0
      ? await findOwnedCurriculumTopics(db, {
          profileId,
          topicIds: topics.map((topic) => topic.id),
        })
      : [];
  const ownedTopicIds = new Set(ownedTopics.map((topic) => topic.topicId));
  const scopedTopics = topics.filter((topic) => ownedTopicIds.has(topic.id));
  const topicsById = new Map(scopedTopics.map((topic) => [topic.id, topic]));

  if (scope.topicId && !topicsById.has(scope.topicId)) return null;

  const scopedTopicIds = new Set(
    scopedTopics
      .filter((topic) => {
        if (scope.topicId && topic.id !== scope.topicId) return false;
        if (scope.bookId && topic.bookId !== scope.bookId) return false;
        return true;
      })
      .map((topic) => topic.id),
  );

  if ((scope.topicId || scope.bookId) && scopedTopicIds.size === 0) {
    return null;
  }

  const ownedTopicSessions = allSessions.filter(
    (session) => !session.topicId || topicsById.has(session.topicId),
  );
  const scopedSessions = ownedTopicSessions.filter((session) => {
    if (scope.topicId) return session.topicId === scope.topicId;
    if (scope.bookId) {
      return !!session.topicId && scopedTopicIds.has(session.topicId);
    }
    return true;
  });

  const resumable = sortByLatestActivity(
    scopedSessions.filter(
      (session) => session.status === 'active' || session.status === 'paused',
    ),
  )[0];
  if (resumable) {
    const subject = subjectById.get(resumable.subjectId);
    if (!subject) return null;
    const topic = resumable.topicId
      ? topicsById.get(resumable.topicId)
      : undefined;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      topicId: resumable.topicId ?? null,
      topicTitle: topic?.title ?? null,
      sessionId: resumable.id,
      resumeFromSessionId: null,
      resumeKind:
        resumable.status === 'paused' ? 'paused_session' : 'active_session',
      lastActivityAt: resumable.lastActivityAt.toISOString(),
      reason: topic
        ? `Resume ${topic.title}`
        : `Resume your ${subject.name} session`,
    };
  }

  const recentCompleted = sortByLatestActivity(
    scopedSessions.filter(
      (session) =>
        session.status === 'completed' || session.status === 'auto_closed',
    ),
  )[0];
  if (recentCompleted) {
    const subject = subjectById.get(recentCompleted.subjectId);
    if (!subject) return null;
    const topic = recentCompleted.topicId
      ? topicsById.get(recentCompleted.topicId)
      : undefined;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      topicId: recentCompleted.topicId ?? null,
      topicTitle: topic?.title ?? null,
      sessionId: null,
      resumeFromSessionId: recentCompleted.id,
      resumeKind: topic ? 'recent_topic' : 'subject_freeform',
      lastActivityAt: recentCompleted.lastActivityAt.toISOString(),
      reason: topic
        ? `Pick up ${topic.title}`
        : `Pick up your latest ${subject.name} session`,
    };
  }

  const latestCurriculumIds = [...new Set(latestCurriculumBySubject.values())];
  const latestTopics = scopedTopics.filter((topic) =>
    latestCurriculumIds.includes(topic.curriculumId),
  );
  const latestTopicIds = latestTopics.map((topic) => topic.id);
  if (latestTopicIds.length === 0) return null;

  const [cards, topicAssessments] = await Promise.all([
    repo.retentionCards.findMany(
      inArray(retentionCards.topicId, latestTopicIds),
    ),
    repo.assessments.findMany(inArray(assessments.topicId, latestTopicIds)),
  ]);
  const latestTopicIdSet = new Set(latestTopicIds);
  const verifiedTopicIds = new Set(
    cards
      .filter(
        (card) =>
          latestTopicIdSet.has(card.topicId) && card.xpStatus === 'verified',
      )
      .map((card) => card.topicId),
  );
  const passedTopicIds = new Set(
    topicAssessments
      .filter(
        (assessment) =>
          latestTopicIdSet.has(assessment.topicId) &&
          assessment.status === 'passed',
      )
      .map((assessment) => assessment.topicId),
  );

  const latestTopicsByCurriculum = new Map<string, typeof latestTopics>();
  for (const topic of latestTopics) {
    if (scope.topicId && topic.id !== scope.topicId) continue;
    if (scope.bookId && topic.bookId !== scope.bookId) continue;
    const list = latestTopicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    latestTopicsByCurriculum.set(topic.curriculumId, list);
  }

  for (const subject of subjectActivityOrder(activeSubjects, allSessions)) {
    const curriculumId = latestCurriculumBySubject.get(subject.id);
    if (!curriculumId) continue;
    const nextTopic = (latestTopicsByCurriculum.get(curriculumId) ?? []).find(
      (topic) =>
        !passedTopicIds.has(topic.id) && !verifiedTopicIds.has(topic.id),
    );
    if (!nextTopic) continue;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      topicId: nextTopic.id,
      topicTitle: nextTopic.title,
      sessionId: null,
      resumeFromSessionId: null,
      resumeKind: 'next_topic',
      lastActivityAt: null,
      reason: `Start ${nextTopic.title}`,
    };
  }

  return null;
}

export async function getContinueSuggestion(
  db: Database,
  profileId: string,
): Promise<{
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
  lastSessionId: string | null;
} | null> {
  const repo = createScopedRepository(db, profileId);
  const activeSubjects = (await repo.subjects.findMany()).filter(
    (subject) => subject.status === 'active',
  );
  if (activeSubjects.length === 0) return null;

  const subjectIds = activeSubjects.map((subject) => subject.id);

  // Fetch all sessions upfront for subject ordering + session lookup (avoids N+1)
  // Only sessions with real activity — ghost sessions (exchangeCount=0) must not
  // skew subject ordering or appear as resumable.
  const allSessions = await repo.sessions.findMany(
    and(
      inArray(learningSessions.subjectId, subjectIds),
      gte(learningSessions.exchangeCount, 1),
    ),
  );

  // Sort subjects by most recent session activity (not insertion order)
  const lastActivityBySubject = new Map<string, number>();
  for (const session of allSessions) {
    const ts = session.lastActivityAt.getTime();
    const current = lastActivityBySubject.get(session.subjectId) ?? 0;
    if (ts > current) lastActivityBySubject.set(session.subjectId, ts);
  }
  activeSubjects.sort((a, b) => {
    const aTime = lastActivityBySubject.get(a.id) ?? 0;
    const bTime = lastActivityBySubject.get(b.id) ?? 0;
    return bTime - aTime;
  });

  // Pre-group resumable (active/paused) sessions by subject
  const resumableBySubject = new Map<string, typeof allSessions>();
  for (const session of allSessions) {
    if (session.status === 'active' || session.status === 'paused') {
      const list = resumableBySubject.get(session.subjectId) ?? [];
      list.push(session);
      resumableBySubject.set(session.subjectId, list);
    }
  }
  const curriculumRows = await db
    .select({
      id: curricula.id,
      subjectId: curricula.subjectId,
      version: curricula.version,
    })
    .from(curricula)
    .where(inArray(curricula.subjectId, subjectIds))
    .orderBy(desc(curricula.version));

  const latestCurriculumBySubject = new Map<string, string>();
  for (const curriculum of curriculumRows) {
    if (!latestCurriculumBySubject.has(curriculum.subjectId)) {
      latestCurriculumBySubject.set(curriculum.subjectId, curriculum.id);
    }
  }

  const curriculumIds = [...new Set(latestCurriculumBySubject.values())];
  if (curriculumIds.length === 0) return null;

  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      inArray(curriculumTopics.curriculumId, curriculumIds),
      eq(curriculumTopics.skipped, false),
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  if (topics.length === 0) return null;

  const ownedTopics = await findOwnedCurriculumTopics(db, {
    profileId,
    topicIds: topics.map((topic) => topic.id),
  });
  const ownedTopicIds = new Set(ownedTopics.map((topic) => topic.topicId));
  const scopedTopics = topics.filter((topic) => ownedTopicIds.has(topic.id));
  if (scopedTopics.length === 0) return null;

  const topicIds = scopedTopics.map((topic) => topic.id);
  const topicIdSet = new Set(topicIds);
  const [cards, topicAssessments] = await Promise.all([
    repo.retentionCards.findMany(inArray(retentionCards.topicId, topicIds)),
    repo.assessments.findMany(inArray(assessments.topicId, topicIds)),
  ]);

  const verifiedTopicIds = new Set(
    cards
      .filter(
        (card) => topicIdSet.has(card.topicId) && card.xpStatus === 'verified',
      )
      .map((card) => card.topicId),
  );
  const passedTopicIds = new Set(
    topicAssessments
      .filter(
        (assessment) =>
          topicIdSet.has(assessment.topicId) && assessment.status === 'passed',
      )
      .map((assessment) => assessment.topicId),
  );

  const topicsByCurriculum = new Map<string, typeof scopedTopics>();
  for (const topic of scopedTopics) {
    const list = topicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    topicsByCurriculum.set(topic.curriculumId, list);
  }

  for (const subject of activeSubjects) {
    const curriculumId = latestCurriculumBySubject.get(subject.id);
    if (!curriculumId) continue;

    const nextTopic = (topicsByCurriculum.get(curriculumId) ?? []).find(
      (topic) =>
        !passedTopicIds.has(topic.id) && !verifiedTopicIds.has(topic.id),
    );

    if (nextTopic) {
      // [F-001] lastSessionId MUST match nextTopic.id — otherwise the client
      // navigates to nextTopic but with a sessionId that belongs to a
      // different topic, causing the session handler to either refuse the
      // mismatch or append events to the wrong `learning_sessions` row.
      // Previous behavior took the most-recent resumable session across the
      // whole subject regardless of topic; that's the mismatch described in
      // F-001 of the 2026-04-18 end-user test report.
      const resumable = (resumableBySubject.get(subject.id) ?? [])
        .filter((session) => session.topicId === nextTopic.id)
        .sort(
          (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
        );
      const lastSession = resumable[0];

      return {
        subjectId: subject.id,
        subjectName: subject.name,
        topicId: nextTopic.id,
        topicTitle: nextTopic.title,
        lastSessionId: lastSession?.id ?? null,
      };
    }
  }

  return null;
}
