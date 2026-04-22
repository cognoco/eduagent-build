// ---------------------------------------------------------------------------
// Progress Service — Sprint 8 Phase 1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, gte, inArray } from 'drizzle-orm';
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
  statuses: Array<'strong' | 'fading' | 'weak' | 'forgotten'>
): 'strong' | 'fading' | 'weak' | 'forgotten' {
  if (statuses.length === 0) return 'strong';
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

  // Get last session for this subject (only sessions with real activity)
  const sessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.subjectId, subjectId),
      gte(learningSessions.exchangeCount, 1)
    )
  );

  // [BUG-LIB-TOPICS] A completed session on a curriculum topic also counts as
  // completion — matches the book-view semantic (services/curriculum.ts
  // computeBookStatusesBatch). Without this, library showed 0/N while the book
  // screen showed 1/N for the same topic after a session finished.
  const curriculumTopicIds = new Set(topics.map((t) => t.id));
  for (const session of sessions) {
    if (
      session.topicId &&
      curriculumTopicIds.has(session.topicId) &&
      (session.status === 'completed' || session.status === 'auto_closed')
    ) {
      completedTopics.add(session.topicId);
    }
  }

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

  // Count sessions for this topic. Only sessions with at least 1 real exchange
  // count — ghost sessions (created but abandoned with 0 exchanges) must not
  // make a topic appear "started". Matches dashboard.ts and curriculum.ts.
  const topicSessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.topicId, topicId),
      gte(learningSessions.exchangeCount, 1)
    )
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

  // Get session summary excerpt from the most recent session.
  // findMany returns DB insertion order — sort by createdAt to get the true latest.
  const sortedSessions = topicSessions.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const lastTopicSession = sortedSessions[0];
  const summaryRow =
    lastTopicSession != null
      ? await repo.sessionSummaries.findFirst(
          eq(sessionSummaries.sessionId, lastTopicSession.id)
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
  const struggleStatus: TopicProgress['struggleStatus'] = activeDeepening
    ? retentionCard && retentionCard.failureCount >= 3
      ? 'blocked'
      : 'needs_deepening'
    : 'normal';

  return {
    topicId: topic.id,
    title: topic.title,
    description: topic.description,
    completionStatus,
    retentionStatus: extendedRetentionStatus,
    struggleStatus,
    masteryScore: latestAssessment?.masteryScore
      ? Number(latestAssessment.masteryScore)
      : null,
    summaryExcerpt: summaryRow?.content?.slice(0, 200) ?? null,
    xpStatus: (latestXp?.status as 'pending' | 'verified' | 'decayed') ?? null,
    totalSessions: topicSessions.length,
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

  // Fetch all sessions in one query (only sessions with real activity)
  const allSessions =
    subjectIds.length > 0
      ? await repo.sessions.findMany(
          and(
            inArray(learningSessions.subjectId, subjectIds),
            gte(learningSessions.exchangeCount, 1)
          )
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

    // [BUG-LIB-TOPICS] A completed session on a curriculum topic also counts
    // as completion — matches the book-view semantic in
    // services/curriculum.ts:computeBookStatusesBatch. Keeps the library card
    // aligned with what the book screen shows.
    const curriculumTopicIds = new Set(topics.map((t) => t.id));
    for (const session of subjectSessions) {
      if (
        session.topicId &&
        curriculumTopicIds.has(session.topicId) &&
        (session.status === 'completed' || session.status === 'auto_closed')
      ) {
        completedTopics.add(session.topicId);
      }
    }

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
  topics: Array<{ id: string; title: string; description: string }>
): Promise<TopicProgress[]> {
  if (topics.length === 0) return [];

  const repo = createScopedRepository(db, profileId);
  const topicIds = topics.map((t) => t.id);

  // 6 batch queries in parallel — constant count regardless of N topics
  const [allCards, allAssessments, allSessions, allDeepening, allXp] =
    await Promise.all([
      repo.retentionCards.findMany(inArray(retentionCards.topicId, topicIds)),
      repo.assessments.findMany(inArray(assessments.topicId, topicIds)),
      repo.sessions.findMany(
        and(
          inArray(learningSessions.topicId, topicIds),
          gte(learningSessions.exchangeCount, 1)
        )
      ),
      repo.needsDeepeningTopics.findMany(
        inArray(needsDeepeningTopics.topicId, topicIds)
      ),
      repo.xpLedger.findMany(inArray(xpLedger.topicId, topicIds)),
    ]);

  // Index by topicId for O(1) lookups
  const cardsByTopic = new Map<string, typeof allCards>();
  for (const c of allCards) {
    const list = cardsByTopic.get(c.topicId) ?? [];
    list.push(c);
    cardsByTopic.set(c.topicId, list);
  }

  const assessmentsByTopic = new Map<string, typeof allAssessments>();
  for (const a of allAssessments) {
    const list = assessmentsByTopic.get(a.topicId) ?? [];
    list.push(a);
    assessmentsByTopic.set(a.topicId, list);
  }

  const sessionsByTopic = new Map<string, typeof allSessions>();
  for (const s of allSessions) {
    if (!s.topicId) continue;
    const list = sessionsByTopic.get(s.topicId) ?? [];
    list.push(s);
    sessionsByTopic.set(s.topicId, list);
  }

  const deepeningByTopic = new Map<string, typeof allDeepening>();
  for (const d of allDeepening) {
    const list = deepeningByTopic.get(d.topicId) ?? [];
    list.push(d);
    deepeningByTopic.set(d.topicId, list);
  }

  const xpByTopic = new Map<string, typeof allXp>();
  for (const x of allXp) {
    if (!x.topicId) continue;
    const list = xpByTopic.get(x.topicId) ?? [];
    list.push(x);
    xpByTopic.set(x.topicId, list);
  }

  // Batch-fetch session summaries for the most recent session of each topic.
  // Sessions from findMany arrive in DB insertion order, so we must sort by
  // createdAt to pick the genuinely most-recent session per topic.
  const lastSessionIds: string[] = [];
  const lastSessionByTopic = new Map<string, string>();
  for (const topic of topics) {
    const topicSessions = sessionsByTopic.get(topic.id) ?? [];
    const sorted = topicSessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const last = sorted[0];
    if (last) {
      lastSessionIds.push(last.id);
      lastSessionByTopic.set(topic.id, last.id);
    }
  }

  const allSummaries =
    lastSessionIds.length > 0
      ? await repo.sessionSummaries.findMany(
          inArray(sessionSummaries.sessionId, lastSessionIds)
        )
      : [];
  const summaryBySessionId = new Map(allSummaries.map((s) => [s.sessionId, s]));

  // Assemble per-topic progress in-memory
  return topics.map((topic) => {
    const topicCards = cardsByTopic.get(topic.id) ?? [];
    const retentionCard = topicCards[0] ?? null;

    const topicAssessments = (assessmentsByTopic.get(topic.id) ?? []).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const latestAssessment = topicAssessments[0];

    const topicSessions = sessionsByTopic.get(topic.id) ?? [];

    const deepeningTopics = deepeningByTopic.get(topic.id) ?? [];
    const activeDeepening = deepeningTopics.find((d) => d.status === 'active');

    const xpEntries = (xpByTopic.get(topic.id) ?? []).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const latestXp = xpEntries[0];

    const lastSessionId = lastSessionByTopic.get(topic.id);
    const summaryRow = lastSessionId
      ? summaryBySessionId.get(lastSessionId)
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
      title: topic.title,
      description: topic.description,
      completionStatus,
      retentionStatus: extendedRetentionStatus,
      struggleStatus,
      masteryScore: latestAssessment?.masteryScore
        ? Number(latestAssessment.masteryScore)
        : null,
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
  topicId: string
): Promise<{ sessionId: string } | null> {
  const repo = createScopedRepository(db, profileId);
  const sessions = await repo.sessions.findMany(
    and(
      eq(learningSessions.topicId, topicId),
      inArray(learningSessions.status, ['active', 'paused'])
    )
  );
  if (sessions.length === 0) return null;
  // Use spread to avoid mutating the repo array (consistent with getContinueSuggestion pattern)
  const sorted = [...sessions].sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
  );
  return { sessionId: sorted[0]!.id };
}

// [F-009] Resolve the subject that owns a given topic — used for deep-link
// resolution when the client only has a topicId (no subjectId in the URL).
export async function resolveTopicSubject(
  db: Database,
  profileId: string,
  topicId: string
): Promise<{
  subjectId: string;
  subjectName: string;
  topicTitle: string;
} | null> {
  const repo = createScopedRepository(db, profileId);

  // curriculumTopics and curricula are shared reference tables without a
  // profileId column, so they cannot be queried through createScopedRepository.
  // Profile-scoping is enforced by the final repo.subjects.findFirst gate
  // below — if the resolved subject doesn't belong to this profile, we
  // return null and no data leaks.
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
    columns: { id: true, title: true, curriculumId: true },
  });
  if (!topic) return null;

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.id, topic.curriculumId),
    columns: { subjectId: true },
  });
  if (!curriculum) return null;

  // Gate: verify the subject belongs to this profile via scoped repository
  const subject = await repo.subjects.findFirst(
    eq(subjects.id, curriculum.subjectId)
  );
  if (!subject) return null;

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    topicTitle: topic.title,
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
  lastSessionId: string | null;
} | null> {
  const repo = createScopedRepository(db, profileId);
  const activeSubjects = (await repo.subjects.findMany()).filter(
    (subject) => subject.status === 'active'
  );
  if (activeSubjects.length === 0) return null;

  const subjectIds = activeSubjects.map((subject) => subject.id);

  // Fetch all sessions upfront for subject ordering + session lookup (avoids N+1)
  // Only sessions with real activity — ghost sessions (exchangeCount=0) must not
  // skew subject ordering or appear as resumable.
  const allSessions = await repo.sessions.findMany(
    and(
      inArray(learningSessions.subjectId, subjectIds),
      gte(learningSessions.exchangeCount, 1)
    )
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
      eq(curriculumTopics.skipped, false)
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  if (topics.length === 0) return null;

  const topicIds = topics.map((topic) => topic.id);
  const [cards, topicAssessments] = await Promise.all([
    repo.retentionCards.findMany(inArray(retentionCards.topicId, topicIds)),
    repo.assessments.findMany(inArray(assessments.topicId, topicIds)),
  ]);

  const verifiedTopicIds = new Set(
    cards
      .filter((card) => card.xpStatus === 'verified')
      .map((card) => card.topicId)
  );
  const passedTopicIds = new Set(
    topicAssessments
      .filter((assessment) => assessment.status === 'passed')
      .map((assessment) => assessment.topicId)
  );

  const topicsByCurriculum = new Map<string, typeof topics>();
  for (const topic of topics) {
    const list = topicsByCurriculum.get(topic.curriculumId) ?? [];
    list.push(topic);
    topicsByCurriculum.set(topic.curriculumId, list);
  }

  for (const subject of activeSubjects) {
    const curriculumId = latestCurriculumBySubject.get(subject.id);
    if (!curriculumId) continue;

    const nextTopic = (topicsByCurriculum.get(curriculumId) ?? []).find(
      (topic) =>
        !passedTopicIds.has(topic.id) && !verifiedTopicIds.has(topic.id)
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
          (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
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
