// ---------------------------------------------------------------------------
// Progress Service — Sprint 8 Phase 1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  subjects,
  curricula,
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
import type { SubjectProgress, TopicProgress } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRetentionStatus(
  nextReviewAt: Date | null
): 'strong' | 'fading' | 'weak' {
  if (!nextReviewAt) return 'weak';
  const now = new Date();
  const daysUntilReview =
    (nextReviewAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
}

function computeAggregateRetentionStatus(
  statuses: Array<'strong' | 'fading' | 'weak'>
): 'strong' | 'fading' | 'weak' {
  if (statuses.length === 0) return 'strong';
  const weakCount = statuses.filter((s) => s === 'weak').length;
  const fadingCount = statuses.filter((s) => s === 'fading').length;
  if (weakCount > statuses.length * 0.3) return 'weak';
  if (fadingCount + weakCount > statuses.length * 0.3) return 'fading';
  return 'strong';
}

function computeCompletionStatus(
  sessionCount: number,
  assessment: { status: string; masteryScore: string | null } | undefined,
  retentionCard: { xpStatus: string; nextReviewAt: Date | null } | undefined
): 'not_started' | 'in_progress' | 'completed' | 'verified' | 'stable' {
  if (retentionCard?.xpStatus === 'verified') return 'verified';
  if (assessment?.status === 'passed') return 'completed';
  if (sessionCount > 0 || assessment) return 'in_progress';
  return 'not_started';
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function getSubjectProgress(
  db: Database,
  profileId: string,
  subjectId: string
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
      urgencyScore: 0,
      retentionStatus: 'strong',
      lastSessionAt: null,
    };
  }

  // Get all topics for this curriculum
  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      eq(curriculumTopics.curriculumId, curriculum.id),
      eq(curriculumTopics.skipped, false)
    ),
  });

  const topicIds = topics.map((t) => t.id);

  // Get retention cards for these topics (filtered at DB level, not in JS)
  const topicCards =
    topicIds.length > 0
      ? await repo.retentionCards.findMany(
          inArray(retentionCards.topicId, topicIds)
        )
      : [];

  // Get assessments for these topics (filtered at DB level, not in JS)
  const topicAssessments =
    topicIds.length > 0
      ? await repo.assessments.findMany(inArray(assessments.topicId, topicIds))
      : [];

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

  // Get last session for this subject
  const sessions = await repo.sessions.findMany(
    eq(learningSessions.subjectId, subjectId)
  );
  const lastSession = sessions.sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
  )[0];

  // Compute retention status from cards
  const retentionStatuses = topicCards.map((c) =>
    computeRetentionStatus(c.nextReviewAt)
  );
  const retentionStatus = computeAggregateRetentionStatus(retentionStatuses);

  // Urgency: count of overdue reviews
  const now = new Date();
  const overdueCount = topicCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() < now.getTime()
  ).length;

  return {
    subjectId: subject.id,
    name: subject.name,
    topicsTotal: topics.length,
    topicsCompleted: completedTopics.size,
    topicsVerified: verifiedTopics.size,
    urgencyScore: overdueCount,
    retentionStatus,
    lastSessionAt: lastSession?.lastActivityAt.toISOString() ?? null,
  };
}

export async function getTopicProgress(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<TopicProgress | null> {
  const repo = createScopedRepository(db, profileId);

  // Verify subject belongs to profile
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return null;

  // Find topic
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  if (!topic) return null;

  // Get retention card
  const retentionCard = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  // Get latest assessment
  const topicAssessments = await repo.assessments.findMany(
    eq(assessments.topicId, topicId)
  );
  const latestAssessment = topicAssessments.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];

  // Count sessions for this topic
  const topicSessions = await repo.sessions.findMany(
    eq(learningSessions.topicId, topicId)
  );

  // Check needs-deepening status
  const deepeningTopics = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, topicId)
  );
  const activeDeepening = deepeningTopics.find((d) => d.status === 'active');

  // Get XP ledger entry
  const xpEntries = await repo.xpLedger.findMany(eq(xpLedger.topicId, topicId));
  const latestXp = xpEntries.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];

  // Get session summary excerpt from the most recent session
  const summaryRow =
    topicSessions.length > 0
      ? await repo.sessionSummaries.findFirst(
          eq(
            sessionSummaries.sessionId,
            topicSessions[topicSessions.length - 1].id
          )
        )
      : undefined;

  const completionStatus = computeCompletionStatus(
    topicSessions.length,
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
      : undefined
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

  return {
    topicId: topic.id,
    title: topic.title,
    description: topic.description,
    completionStatus,
    retentionStatus: extendedRetentionStatus,
    struggleStatus: activeDeepening ? 'needs_deepening' : 'normal',
    masteryScore: latestAssessment?.masteryScore
      ? Number(latestAssessment.masteryScore)
      : null,
    summaryExcerpt: summaryRow?.content?.slice(0, 200) ?? null,
    xpStatus: (latestXp?.status as 'pending' | 'verified' | 'decayed') ?? null,
  };
}

export async function getOverallProgress(
  db: Database,
  profileId: string
): Promise<{
  subjects: SubjectProgress[];
  totalTopicsCompleted: number;
  totalTopicsVerified: number;
}> {
  const repo = createScopedRepository(db, profileId);

  // 1. Batch all queries upfront (6 total regardless of N subjects)
  const allSubjects = await repo.subjects.findMany();
  if (allSubjects.length === 0) {
    return { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 };
  }

  const subjectIds = allSubjects.map((s) => s.id);

  // Fetch all curricula for these subjects in one query
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
  });

  const curriculumIds = allCurricula.map((c) => c.id);
  const curriculumBySubject = new Map(
    allCurricula.map((c) => [c.subjectId, c])
  );

  // Fetch all topics for all curricula in one query
  const allTopics =
    curriculumIds.length > 0
      ? await db.query.curriculumTopics.findMany({
          where: and(
            inArray(curriculumTopics.curriculumId, curriculumIds),
            eq(curriculumTopics.skipped, false)
          ),
        })
      : [];

  const topicIds = allTopics.map((t) => t.id);
  const topicsByCurriculum = new Map<string, typeof allTopics>();
  for (const topic of allTopics) {
    const list = topicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    topicsByCurriculum.set(topic.curriculumId, list);
  }

  // Fetch all retention cards in one query
  const allCards =
    topicIds.length > 0
      ? await repo.retentionCards.findMany(
          inArray(retentionCards.topicId, topicIds)
        )
      : [];

  const cardsByTopic = new Map<string, typeof allCards>();
  for (const card of allCards) {
    const list = cardsByTopic.get(card.topicId) ?? [];
    list.push(card);
    cardsByTopic.set(card.topicId, list);
  }

  // Fetch all assessments in one query
  const allAssessments =
    topicIds.length > 0
      ? await repo.assessments.findMany(inArray(assessments.topicId, topicIds))
      : [];

  const assessmentsByTopic = new Map<string, typeof allAssessments>();
  for (const assessment of allAssessments) {
    const list = assessmentsByTopic.get(assessment.topicId) ?? [];
    list.push(assessment);
    assessmentsByTopic.set(assessment.topicId, list);
  }

  // Fetch all sessions in one query
  const allSessions =
    subjectIds.length > 0
      ? await repo.sessions.findMany(
          inArray(learningSessions.subjectId, subjectIds)
        )
      : [];

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

  for (const subject of allSubjects) {
    const curriculum = curriculumBySubject.get(subject.id);

    if (!curriculum) {
      subjectProgressList.push({
        subjectId: subject.id,
        name: subject.name,
        topicsTotal: 0,
        topicsCompleted: 0,
        topicsVerified: 0,
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
    const lastSession = subjectSessions.sort(
      (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
    )[0];

    // Retention status from all cards for this subject's topics
    const subjectTopicIds = new Set(topics.map((t) => t.id));
    const subjectCards = allCards.filter((c) => subjectTopicIds.has(c.topicId));
    const retentionStatuses = subjectCards.map((c) =>
      computeRetentionStatus(c.nextReviewAt)
    );
    const retentionStatus = computeAggregateRetentionStatus(retentionStatuses);

    // Urgency: count of overdue reviews
    const now = new Date();
    const overdueCount = subjectCards.filter(
      (c) => c.nextReviewAt && c.nextReviewAt.getTime() < now.getTime()
    ).length;

    const progress: SubjectProgress = {
      subjectId: subject.id,
      name: subject.name,
      topicsTotal: topics.length,
      topicsCompleted: completedTopics.size,
      topicsVerified: verifiedTopics.size,
      urgencyScore: overdueCount,
      retentionStatus,
      lastSessionAt: lastSession?.lastActivityAt.toISOString() ?? null,
    };

    subjectProgressList.push(progress);
    totalCompleted += completedTopics.size;
    totalVerified += verifiedTopics.size;
  }

  return {
    subjects: subjectProgressList,
    totalTopicsCompleted: totalCompleted,
    totalTopicsVerified: totalVerified,
  };
}

export async function getContinueSuggestion(
  db: Database,
  profileId: string
): Promise<{
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
} | null> {
  const repo = createScopedRepository(db, profileId);
  const allSubjects = await repo.subjects.findMany();

  for (const subject of allSubjects) {
    if (subject.status !== 'active') continue;

    // Find curriculum
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subject.id),
    });
    if (!curriculum) continue;

    // Get topics in order
    const topics = await db.query.curriculumTopics.findMany({
      where: and(
        eq(curriculumTopics.curriculumId, curriculum.id),
        eq(curriculumTopics.skipped, false)
      ),
      orderBy: asc(curriculumTopics.sortOrder),
    });

    // Find first topic that is not completed
    for (const topic of topics) {
      const card = await repo.retentionCards.findFirst(
        eq(retentionCards.topicId, topic.id)
      );
      const topicAssessments = await repo.assessments.findMany(
        eq(assessments.topicId, topic.id)
      );
      const passed = topicAssessments.some((a) => a.status === 'passed');
      const verified = card?.xpStatus === 'verified';

      if (!passed && !verified) {
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          topicId: topic.id,
          topicTitle: topic.title,
        };
      }
    }
  }

  return null;
}
