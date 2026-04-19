import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  assessments,
  curricula,
  curriculumTopics,
  learningSessions,
  milestones,
  profiles,
  progressSnapshots,
  streaks,
  subjects,
  retentionCards,
  vocabulary,
  vocabularyRetentionCards,
  type Database,
} from '@eduagent/database';
import type {
  CelebrationName,
  CelebrationReason,
  KnowledgeInventory,
  MilestoneRecord,
  ProgressDataPoint,
  ProgressHistory,
  ProgressMetrics,
  SubjectInventory,
  SubjectProgressMetrics,
} from '@eduagent/schemas';
import {
  knowledgeInventorySchema,
  milestoneRecordSchema,
  progressDataPointSchema,
  progressHistorySchema,
  progressMetricsSchema,
} from '@eduagent/schemas';
import { queueCelebration } from './celebrations';
import { getCurrentLanguageProgress } from './language-curriculum';
// [EP15-I7] Static import of milestone-detection. No circular dependency
// (milestone-detection does not import snapshot-aggregation), so the prior
// dynamic `await import()` added per-call module-resolution overhead on a
// hot path with no justification. Static import resolves once at cold start.
import { detectMilestones, storeMilestones } from './milestone-detection';
import { captureException } from './sentry';

type SubjectRow = typeof subjects.$inferSelect;
type TopicRow = typeof curriculumTopics.$inferSelect;
type SessionRow = typeof learningSessions.$inferSelect;
type AssessmentRow = typeof assessments.$inferSelect;
type RetentionCardRow = typeof retentionCards.$inferSelect;
type VocabularyRow = typeof vocabulary.$inferSelect;
type VocabularyRetentionCardRow = typeof vocabularyRetentionCards.$inferSelect;

type TopicWithSubject = TopicRow & { subjectId: string };

interface ProgressState {
  profileId: string;
  subjects: SubjectRow[];
  sessions: SessionRow[];
  assessments: AssessmentRow[];
  retentionCards: RetentionCardRow[];
  streak: typeof streaks.$inferSelect | null;
  vocabulary: VocabularyRow[];
  vocabularyRetentionCards: VocabularyRetentionCardRow[];
  topicsById: Map<string, TopicWithSubject>;
  allTopicsBySubject: Map<string, TopicWithSubject[]>;
  latestTopicsBySubject: Map<string, TopicWithSubject[]>;
}

interface RefreshSnapshotResult {
  snapshotDate: string;
  metrics: ProgressMetrics;
  milestones: MilestoneRecord[];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultMetrics(): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
  };
}

function parseMetrics(input: unknown): ProgressMetrics {
  const parsed = progressMetricsSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const value = (input ?? {}) as Record<string, unknown>;
  return progressMetricsSchema.parse({
    ...defaultMetrics(),
    ...value,
    subjects: Array.isArray(value['subjects']) ? value['subjects'] : [],
  });
}

function mondayKey(input: string): string {
  const date = new Date(`${input}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return isoDate(date);
}

function mapCefrLabel(
  level: string | null,
  sublevel: string | null
): string | null {
  if (!level) return null;

  const labels: Record<string, string> = {
    A1: 'Beginner',
    A2: 'Everyday',
    B1: 'Independent',
    B2: 'Confident',
    C1: 'Advanced',
    C2: 'Near fluent',
  };

  const base = labels[level] ?? level;
  return sublevel ? `${base} ${sublevel}` : base;
}

// NOTE [EP15-C3]: This function deliberately does NOT read learning_profiles.
// The snapshot and memory-analysis pipelines are independent — if you add
// learning_profiles reads here, revisit step ordering in session-completed.ts
// (memory must run before snapshot if the snapshot consumes its output).
async function loadProgressState(
  db: Database,
  profileId: string
): Promise<ProgressState> {
  const subjectRows = (
    await db.query.subjects.findMany({
      where: eq(subjects.profileId, profileId),
    })
  ).filter((subject) => subject.status !== 'archived');

  if (subjectRows.length === 0) {
    return {
      profileId,
      subjects: [],
      sessions: [],
      assessments: [],
      retentionCards: [],
      streak: null,
      vocabulary: [],
      vocabularyRetentionCards: [],
      topicsById: new Map(),
      allTopicsBySubject: new Map(),
      latestTopicsBySubject: new Map(),
    };
  }

  const subjectIds = subjectRows.map((subject) => subject.id);
  const allCurricula = await db.query.curricula.findMany({
    where: inArray(curricula.subjectId, subjectIds),
  });

  const latestCurriculumBySubject = new Map<string, string>();
  for (const curriculum of allCurricula.sort((a, b) => b.version - a.version)) {
    if (!latestCurriculumBySubject.has(curriculum.subjectId)) {
      latestCurriculumBySubject.set(curriculum.subjectId, curriculum.id);
    }
  }

  // Only fetch topics for the latest curriculum per subject — old versions
  // are dead weight (challengeCurriculum now deletes them, but stale rows
  // may still exist in databases that pre-date the cleanup fix).
  const curriculumIds = [...latestCurriculumBySubject.values()];
  const curriculumSubjectMap = new Map(
    allCurricula
      .filter((c) => curriculumIds.includes(c.id))
      .map((curriculum) => [curriculum.id, curriculum.subjectId])
  );

  const topicRows =
    curriculumIds.length > 0
      ? (
          await db.query.curriculumTopics.findMany({
            where: inArray(curriculumTopics.curriculumId, curriculumIds),
          })
        )
          .filter((topic) => !topic.skipped)
          .map((topic) => {
            const subjectId = curriculumSubjectMap.get(topic.curriculumId);
            if (!subjectId)
              throw new Error(
                `No subject found for curriculumId ${topic.curriculumId}`
              );
            return { ...topic, subjectId };
          })
      : [];

  const topicsById = new Map(topicRows.map((topic) => [topic.id, topic]));
  const allTopicsBySubject = new Map<string, TopicWithSubject[]>();
  const latestTopicsBySubject = new Map<string, TopicWithSubject[]>();

  for (const topic of topicRows) {
    const subjectTopics = allTopicsBySubject.get(topic.subjectId) ?? [];
    subjectTopics.push(topic);
    allTopicsBySubject.set(topic.subjectId, subjectTopics);

    if (latestCurriculumBySubject.get(topic.subjectId) === topic.curriculumId) {
      const latestTopics = latestTopicsBySubject.get(topic.subjectId) ?? [];
      latestTopics.push(topic);
      latestTopicsBySubject.set(topic.subjectId, latestTopics);
    }
  }

  const [
    sessionRows,
    assessmentRows,
    retentionCardRows,
    streakRow,
    vocabularyRows,
    vocabularyCardRows,
  ] = await Promise.all([
    db.query.learningSessions.findMany({
      where: and(
        eq(learningSessions.profileId, profileId),
        gte(learningSessions.exchangeCount, 1)
      ),
    }),
    db.query.assessments.findMany({
      where: eq(assessments.profileId, profileId),
    }),
    db.query.retentionCards.findMany({
      where: eq(retentionCards.profileId, profileId),
    }),
    db.query.streaks.findFirst({
      where: eq(streaks.profileId, profileId),
    }),
    db.query.vocabulary.findMany({
      where: eq(vocabulary.profileId, profileId),
    }),
    db.query.vocabularyRetentionCards.findMany({
      where: eq(vocabularyRetentionCards.profileId, profileId),
    }),
  ]);

  return {
    profileId,
    subjects: subjectRows,
    sessions: sessionRows.filter((session) => session.status !== 'active'),
    assessments: assessmentRows,
    retentionCards: retentionCardRows,
    streak: streakRow ?? null,
    vocabulary: vocabularyRows,
    vocabularyRetentionCards: vocabularyCardRows,
    topicsById,
    allTopicsBySubject,
    latestTopicsBySubject,
  };
}

function buildSubjectMetric(
  subject: SubjectRow,
  state: ProgressState
): SubjectProgressMetrics {
  const subjectSessions = state.sessions.filter(
    (session) => session.subjectId === subject.id
  );
  const subjectAssessments = state.assessments.filter(
    (assessment) => assessment.subjectId === subject.id
  );
  const subjectVocabulary = state.vocabulary.filter(
    (item) => item.subjectId === subject.id
  );
  const latestTopics = state.latestTopicsBySubject.get(subject.id) ?? [];
  const allTopics = state.allTopicsBySubject.get(subject.id) ?? [];
  const allTopicIds = new Set(allTopics.map((topic) => topic.id));
  const preGeneratedLatestTopicIds = new Set(
    latestTopics
      .filter((topic) => topic.filedFrom === 'pre_generated')
      .map((topic) => topic.id)
  );
  const exploredTopicIds = new Set(
    allTopics
      .filter((topic) => topic.filedFrom !== 'pre_generated')
      .map((topic) => topic.id)
  );
  const attemptedTopicIds = new Set<string>(exploredTopicIds);

  for (const session of subjectSessions) {
    if (session.topicId && allTopicIds.has(session.topicId)) {
      attemptedTopicIds.add(session.topicId);
    }
  }

  for (const assessment of subjectAssessments) {
    if (allTopicIds.has(assessment.topicId)) {
      attemptedTopicIds.add(assessment.topicId);
    }
  }

  for (const card of state.retentionCards) {
    if (allTopicIds.has(card.topicId)) {
      attemptedTopicIds.add(card.topicId);
    }
  }

  const masteredTopicIds = new Set<string>();
  for (const assessment of subjectAssessments) {
    if (assessment.status === 'passed') {
      masteredTopicIds.add(assessment.topicId);
    }
  }

  for (const card of state.retentionCards) {
    if (card.xpStatus === 'verified' && allTopicIds.has(card.topicId)) {
      masteredTopicIds.add(card.topicId);
    }
  }

  const totalActiveMinutes = Math.round(
    subjectSessions.reduce(
      (sum, session) => sum + (session.durationSeconds ?? 0),
      0
    ) / 60
  );
  // [F-045] Wall-clock minutes per subject for user-facing display
  const totalWallClockMinutes = Math.round(
    subjectSessions.reduce(
      (sum, session) =>
        sum + (session.wallClockSeconds ?? session.durationSeconds ?? 0),
      0
    ) / 60
  );
  const lastSessionAt = subjectSessions
    .map((session) => session.lastActivityAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    pedagogyMode: subject.pedagogyMode,
    topicsAttempted: attemptedTopicIds.size,
    topicsMastered: masteredTopicIds.size,
    topicsTotal: preGeneratedLatestTopicIds.size,
    topicsExplored: exploredTopicIds.size,
    vocabularyTotal: subjectVocabulary.length,
    vocabularyMastered: subjectVocabulary.filter((item) => item.mastered)
      .length,
    sessionsCount: subjectSessions.length,
    activeMinutes: totalActiveMinutes,
    wallClockMinutes: totalWallClockMinutes,
    lastSessionAt: lastSessionAt?.toISOString() ?? null,
  };
}

export async function computeProgressMetrics(
  db: Database,
  profileId: string
): Promise<ProgressMetrics> {
  const state = await loadProgressState(db, profileId);

  if (state.subjects.length === 0) {
    return defaultMetrics();
  }

  const subjectMetrics = state.subjects.map((subject) =>
    buildSubjectMetric(subject, state)
  );

  const now = Date.now();
  let retentionCardsDue = 0;
  let retentionCardsStrong = 0;
  let retentionCardsFading = 0;

  for (const card of state.retentionCards) {
    const nextReviewAt = card.nextReviewAt?.getTime() ?? null;
    if (nextReviewAt !== null && nextReviewAt <= now) {
      retentionCardsDue += 1;
      continue;
    }

    if (card.intervalDays >= 21) {
      retentionCardsStrong += 1;
      continue;
    }

    retentionCardsFading += 1;
  }

  const vocabularyCardIds = new Set(
    state.vocabularyRetentionCards.map((card) => card.vocabularyId)
  );
  const vocabularyMastered = state.vocabulary.filter(
    (item) => item.mastered
  ).length;
  const vocabularyLearning = state.vocabulary.filter(
    (item) => !item.mastered && vocabularyCardIds.has(item.id)
  ).length;
  const vocabularyNew = state.vocabulary.filter(
    (item) => !item.mastered && !vocabularyCardIds.has(item.id)
  ).length;

  const topicsAttempted = subjectMetrics.reduce(
    (sum, subject) => sum + subject.topicsAttempted,
    0
  );
  const topicsMastered = subjectMetrics.reduce(
    (sum, subject) => sum + subject.topicsMastered,
    0
  );

  return progressMetricsSchema.parse({
    totalSessions: state.sessions.length,
    totalActiveMinutes: Math.round(
      state.sessions.reduce(
        (sum, session) => sum + (session.durationSeconds ?? 0),
        0
      ) / 60
    ),
    totalWallClockMinutes: Math.round(
      state.sessions.reduce(
        (sum, session) => sum + (session.wallClockSeconds ?? 0),
        0
      ) / 60
    ),
    totalExchanges: state.sessions.reduce(
      (sum, session) => sum + session.exchangeCount,
      0
    ),
    topicsAttempted,
    topicsMastered,
    topicsInProgress: Math.max(0, topicsAttempted - topicsMastered),
    vocabularyTotal: state.vocabulary.length,
    vocabularyMastered,
    vocabularyLearning,
    vocabularyNew,
    retentionCardsDue,
    retentionCardsStrong,
    retentionCardsFading,
    currentStreak: state.streak?.currentStreak ?? 0,
    longestStreak: state.streak?.longestStreak ?? 0,
    subjects: subjectMetrics,
  });
}

async function buildSubjectInventory(
  db: Database,
  state: ProgressState,
  subjectMetric: SubjectProgressMetrics
): Promise<SubjectInventory> {
  const subject = state.subjects.find(
    (item) => item.id === subjectMetric.subjectId
  );
  if (!subject)
    throw new Error(
      `Subject ${subjectMetric.subjectId} not found in progress state`
    );
  const latestTopics = state.latestTopicsBySubject.get(subject.id) ?? [];
  const allTopics = state.allTopicsBySubject.get(subject.id) ?? [];
  const allTopicIds = new Set(allTopics.map((topic) => topic.id));
  const preGeneratedLatestTopicIds = new Set(
    latestTopics
      .filter((topic) => topic.filedFrom === 'pre_generated')
      .map((topic) => topic.id)
  );
  const exploredTopicIds = new Set(
    allTopics
      .filter((topic) => topic.filedFrom !== 'pre_generated')
      .map((topic) => topic.id)
  );
  const attemptedTopicIds = new Set<string>(exploredTopicIds);
  const masteredTopicIds = new Set<string>();

  for (const session of state.sessions) {
    if (session.subjectId !== subject.id) continue;
    if (session.topicId && allTopicIds.has(session.topicId)) {
      attemptedTopicIds.add(session.topicId);
    }
  }

  for (const assessment of state.assessments) {
    if (
      assessment.subjectId !== subject.id ||
      !allTopicIds.has(assessment.topicId)
    ) {
      continue;
    }

    attemptedTopicIds.add(assessment.topicId);
    if (assessment.status === 'passed') {
      masteredTopicIds.add(assessment.topicId);
    }
  }

  for (const card of state.retentionCards) {
    if (!allTopicIds.has(card.topicId)) continue;
    attemptedTopicIds.add(card.topicId);
    if (card.xpStatus === 'verified') {
      masteredTopicIds.add(card.topicId);
    }
  }

  const subjectVocabulary = state.vocabulary.filter(
    (item) => item.subjectId === subject.id
  );
  const byCefrLevel: Record<string, number> = {};
  for (const item of subjectVocabulary) {
    const key = item.cefrLevel ?? 'Other';
    byCefrLevel[key] = (byCefrLevel[key] ?? 0) + 1;
  }

  const subjectVocabularyIds = new Set(
    subjectVocabulary.map((item) => item.id)
  );
  const vocabularyCardIds = new Set(
    state.vocabularyRetentionCards
      .filter((card) => subjectVocabularyIds.has(card.vocabularyId))
      .map((card) => card.vocabularyId)
  );

  let estimatedProficiency: string | null = null;
  let estimatedProficiencyLabel: string | null = null;
  if (subject.pedagogyMode === 'four_strands') {
    const languageProgress = await getCurrentLanguageProgress(
      db,
      state.profileId,
      subject.id
    );
    if (languageProgress?.currentLevel) {
      estimatedProficiency = languageProgress.currentSublevel
        ? `${languageProgress.currentLevel}.${languageProgress.currentSublevel}`
        : languageProgress.currentLevel;
      estimatedProficiencyLabel = mapCefrLabel(
        languageProgress.currentLevel,
        languageProgress.currentSublevel
      );
    }
  }

  const topicsTotal = preGeneratedLatestTopicIds.size;

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    pedagogyMode: subject.pedagogyMode,
    topics: {
      total:
        topicsTotal === 0 && exploredTopicIds.size > 0 ? null : topicsTotal,
      explored: exploredTopicIds.size,
      mastered: masteredTopicIds.size,
      inProgress: Math.max(0, attemptedTopicIds.size - masteredTopicIds.size),
      notStarted:
        topicsTotal === 0
          ? 0
          : [...preGeneratedLatestTopicIds].filter(
              (topicId) => !attemptedTopicIds.has(topicId)
            ).length,
    },
    vocabulary: {
      total: subjectVocabulary.length,
      mastered: subjectVocabulary.filter((item) => item.mastered).length,
      learning: subjectVocabulary.filter(
        (item) => !item.mastered && vocabularyCardIds.has(item.id)
      ).length,
      new: subjectVocabulary.filter(
        (item) => !item.mastered && !vocabularyCardIds.has(item.id)
      ).length,
      byCefrLevel,
    },
    estimatedProficiency,
    estimatedProficiencyLabel,
    lastSessionAt: subjectMetric.lastSessionAt,
    activeMinutes: subjectMetric.activeMinutes,
    wallClockMinutes: subjectMetric.wallClockMinutes,
    sessionsCount: subjectMetric.sessionsCount,
  };
}

export async function buildKnowledgeInventory(
  db: Database,
  profileId: string
): Promise<KnowledgeInventory> {
  const latestSnapshot = await getLatestSnapshot(db, profileId);
  const metrics =
    latestSnapshot?.metrics ?? (await computeProgressMetrics(db, profileId));
  const state = await loadProgressState(db, profileId);
  const subjectInventories = await Promise.all(
    metrics.subjects.map((subject) => buildSubjectInventory(db, state, subject))
  );

  return knowledgeInventorySchema.parse({
    profileId,
    snapshotDate: latestSnapshot?.snapshotDate ?? isoDate(new Date()),
    global: {
      topicsAttempted: metrics.topicsAttempted,
      topicsMastered: metrics.topicsMastered,
      vocabularyTotal: metrics.vocabularyTotal,
      vocabularyMastered: metrics.vocabularyMastered,
      totalSessions: metrics.totalSessions,
      totalActiveMinutes: metrics.totalActiveMinutes,
      totalWallClockMinutes: metrics.totalWallClockMinutes,
      currentStreak: metrics.currentStreak,
      longestStreak: metrics.longestStreak,
    },
    subjects: subjectInventories,
  });
}

// [EP15-C4 AR-13] `updatedAt` is exposed so callers (notably
// `refreshProgressSnapshot`) can debounce redundant recomputes when a
// session completion event arrives after the snapshot was already
// refreshed by another concurrent step. See refreshProgressSnapshot below.
export interface LatestSnapshot {
  snapshotDate: string;
  metrics: ProgressMetrics;
  updatedAt: Date;
}

function snapshotRowToLatestSnapshot(
  row: typeof progressSnapshots.$inferSelect
): LatestSnapshot {
  return {
    snapshotDate: row.snapshotDate,
    metrics: parseMetrics(row.metrics),
    updatedAt: row.updatedAt,
  };
}

export async function getLatestSnapshot(
  db: Database,
  profileId: string
): Promise<LatestSnapshot | null> {
  const row = await db.query.progressSnapshots.findFirst({
    where: eq(progressSnapshots.profileId, profileId),
    orderBy: desc(progressSnapshots.snapshotDate),
  });

  return row ? snapshotRowToLatestSnapshot(row) : null;
}

export async function getLatestSnapshotOnOrBefore(
  db: Database,
  profileId: string,
  snapshotDate: string
): Promise<LatestSnapshot | null> {
  const rows = await db.query.progressSnapshots.findMany({
    where: eq(progressSnapshots.profileId, profileId),
    orderBy: desc(progressSnapshots.snapshotDate),
  });
  const match = rows.find((row) => row.snapshotDate <= snapshotDate);
  return match ? snapshotRowToLatestSnapshot(match) : null;
}

export async function getSnapshotsInRange(
  db: Database,
  profileId: string,
  from: string,
  to: string
): Promise<Array<{ snapshotDate: string; metrics: ProgressMetrics }>> {
  const rows = await db.query.progressSnapshots.findMany({
    where: eq(progressSnapshots.profileId, profileId),
    orderBy: asc(progressSnapshots.snapshotDate),
  });

  // Range consumers (history chart) don't need `updatedAt`; strip to the
  // narrower shape so the public API stays intentional.
  return rows
    .filter((row) => row.snapshotDate >= from && row.snapshotDate <= to)
    .map((row) => ({
      snapshotDate: row.snapshotDate,
      metrics: parseMetrics(row.metrics),
    }));
}

function metricsToHistoryPoint(
  snapshotDate: string,
  metrics: ProgressMetrics
): ProgressDataPoint {
  return progressDataPointSchema.parse({
    date: snapshotDate,
    topicsMastered: metrics.topicsMastered,
    topicsAttempted: metrics.topicsAttempted,
    topicsExplored: metrics.subjects.reduce(
      (sum, subject) => sum + (subject.topicsExplored ?? 0),
      0
    ),
    vocabularyTotal: metrics.vocabularyTotal,
    vocabularyMastered: metrics.vocabularyMastered,
    totalSessions: metrics.totalSessions,
    totalActiveMinutes: metrics.totalActiveMinutes,
    currentStreak: metrics.currentStreak,
  });
}

export async function buildProgressHistory(
  db: Database,
  profileId: string,
  input?: {
    from?: string;
    to?: string;
    granularity?: 'daily' | 'weekly';
  }
): Promise<ProgressHistory> {
  const to = input?.to ?? isoDate(new Date());
  const from =
    input?.from ?? isoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const granularity = input?.granularity ?? 'daily';

  const rows = await getSnapshotsInRange(db, profileId, from, to);
  let dataPoints = rows.map((row) =>
    metricsToHistoryPoint(row.snapshotDate, row.metrics)
  );

  if (granularity === 'weekly') {
    const lastPointByWeek = new Map<string, ProgressDataPoint>();
    for (const point of dataPoints) {
      lastPointByWeek.set(mondayKey(point.date), point);
    }
    dataPoints = [...lastPointByWeek.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  return progressHistorySchema.parse({
    profileId,
    from,
    to,
    granularity,
    dataPoints,
  });
}

export async function upsertProgressSnapshot(
  db: Database,
  profileId: string,
  snapshotDate: string,
  metrics: ProgressMetrics
): Promise<void> {
  await db
    .insert(progressSnapshots)
    .values({
      profileId,
      snapshotDate,
      metrics,
    })
    .onConflictDoUpdate({
      target: [progressSnapshots.profileId, progressSnapshots.snapshotDate],
      set: {
        metrics,
        updatedAt: new Date(),
      },
    });
}

export async function listRecentMilestones(
  db: Database,
  profileId: string,
  limit = 5
): Promise<MilestoneRecord[]> {
  const rows = await db.query.milestones.findMany({
    where: eq(milestones.profileId, profileId),
    orderBy: desc(milestones.createdAt),
    limit,
  });

  return rows.map((row) =>
    milestoneRecordSchema.parse({
      id: row.id,
      profileId: row.profileId,
      milestoneType: row.milestoneType,
      threshold: row.threshold,
      subjectId: row.subjectId ?? null,
      bookId: row.bookId ?? null,
      metadata:
        (row.metadata as Record<string, unknown> | null | undefined) ?? null,
      celebratedAt: row.celebratedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })
  );
}

async function previousSnapshotForToday(
  db: Database,
  profileId: string,
  snapshotDate: string
): Promise<ProgressMetrics | null> {
  const row = await db.query.progressSnapshots.findFirst({
    where: eq(progressSnapshots.profileId, profileId),
    orderBy: desc(progressSnapshots.snapshotDate),
  });

  if (!row || row.snapshotDate >= snapshotDate) {
    const rows = await db.query.progressSnapshots.findMany({
      where: eq(progressSnapshots.profileId, profileId),
      orderBy: desc(progressSnapshots.snapshotDate),
    });
    const previous = rows.find(
      (candidate) => candidate.snapshotDate < snapshotDate
    );
    return previous ? parseMetrics(previous.metrics) : null;
  }

  return parseMetrics(row.metrics);
}

// [FR237.6] Age-adapted detail text for milestone celebrations.
function getMilestoneCelebrationDetail(
  milestone: MilestoneRecord,
  age: number
): string | null {
  const young = age < 12;
  const t = milestone.threshold;
  const meta = milestone.metadata as Record<string, unknown> | null | undefined;

  switch (milestone.milestoneType) {
    case 'vocabulary_count':
      return young
        ? `You learned your ${t}th word! Amazing! 🎉`
        : `${t} words — solid milestone.`;
    case 'topic_mastered_count':
      return young
        ? `You mastered ${t} topic${t === 1 ? '' : 's'}! Keep it up! 🌟`
        : `${t} topic${t === 1 ? '' : 's'} mastered.`;
    case 'subject_mastered': {
      const name =
        typeof meta?.subjectName === 'string' ? meta.subjectName : 'subject';
      return young
        ? `You finished ${name}! You're a superstar! ⭐`
        : `Completed ${name}.`;
    }
    case 'book_completed': {
      const title =
        typeof meta?.bookTitle === 'string' ? meta.bookTitle : 'book';
      return young
        ? `You finished the book "${title}"! Woohoo! 📚`
        : `Finished "${title}".`;
    }
    case 'streak_length':
      return young
        ? `${t}-day streak — you're on fire! 🔥`
        : `${t}-day streak.`;
    case 'session_count':
      return young
        ? `${t} sessions done — you're amazing! 💪`
        : `${t} sessions completed.`;
    case 'learning_time':
      return young
        ? `${t} hour${t === 1 ? '' : 's'} of learning — wow! ⏰`
        : `${t} hour${t === 1 ? '' : 's'} learning.`;
    case 'topics_explored':
      return young
        ? `You explored ${t} topic${t === 1 ? '' : 's'}! Great job! 🔭`
        : `Explored ${t} topic${t === 1 ? '' : 's'}.`;
    case 'cefr_level_up': {
      const level = typeof meta?.level === 'string' ? meta.level : `level ${t}`;
      return young
        ? `You reached ${level}! You're a language star! 🌍`
        : `Reached ${level}.`;
    }
    default:
      return null;
  }
}

export interface RefreshProgressSnapshotOptions {
  /**
   * Timestamp of the session completion event that triggered this refresh.
   * When provided, enables the AR-13 debounce: if the latest snapshot for
   * today was already updated at-or-after `sessionEndedAt`, another concurrent
   * session-completed handler already recomputed it and this call returns the
   * cached result without re-reading history or re-running milestone
   * detection. Omit for cron-driven calls (daily-snapshot) where a full
   * refresh is always desired.
   */
  sessionEndedAt?: Date;
}

export async function refreshProgressSnapshot(
  db: Database,
  profileId: string,
  options: RefreshProgressSnapshotOptions = {}
): Promise<RefreshSnapshotResult> {
  const snapshotDate = isoDate(new Date());

  // [EP15-C4 AR-13] Debounce redundant session-completion refreshes.
  // Two sessions finishing within the same minute would otherwise each
  // recompute the full progress state, ship a duplicate snapshot upsert,
  // and re-run milestone detection. When the caller tells us when the
  // session ended, skip if the on-disk snapshot is already newer than that.
  if (options.sessionEndedAt) {
    const latest = await getLatestSnapshot(db, profileId);
    if (
      latest &&
      latest.snapshotDate === snapshotDate &&
      latest.updatedAt >= options.sessionEndedAt
    ) {
      return {
        snapshotDate: latest.snapshotDate,
        metrics: latest.metrics,
        milestones: [],
      };
    }
  }

  const previousMetrics = await previousSnapshotForToday(
    db,
    profileId,
    snapshotDate
  );
  const metrics = await computeProgressMetrics(db, profileId);

  await upsertProgressSnapshot(db, profileId, snapshotDate, metrics);

  // [EP15-I7] Was `await import('./milestone-detection')` — now static.
  const insertedMilestones = await storeMilestones(
    db,
    profileId,
    detectMilestones(profileId, previousMetrics, metrics)
  );

  // [FR234.5] Bridge newly inserted milestones to the celebration queue.
  // [FR237.6] Look up birthYear once so detail text can be age-adapted.
  if (insertedMilestones.length > 0) {
    try {
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
        columns: { birthYear: true },
      });
      const age = new Date().getFullYear() - (profile?.birthYear ?? 2015);

      for (const milestone of insertedMilestones) {
        const detail = getMilestoneCelebrationDetail(milestone, age);
        const { milestoneType, threshold } = milestone;

        let celebrationName: CelebrationName;
        let celebrationReason: CelebrationReason;

        if (milestoneType === 'vocabulary_count') {
          celebrationName = threshold >= 100 ? 'comet' : 'polar_star';
          celebrationReason = 'deep_diver';
        } else if (milestoneType === 'topic_mastered_count') {
          celebrationName = threshold >= 25 ? 'comet' : 'polar_star';
          celebrationReason = 'topic_mastered';
        } else if (milestoneType === 'subject_mastered') {
          celebrationName = 'orions_belt';
          celebrationReason = 'curriculum_complete';
        } else if (milestoneType === 'book_completed') {
          celebrationName = 'comet';
          celebrationReason = 'curriculum_complete';
        } else if (milestoneType === 'streak_length') {
          celebrationName = threshold >= 30 ? 'comet' : 'polar_star';
          celebrationReason = threshold >= 30 ? 'streak_30' : 'streak_7';
        } else if (milestoneType === 'session_count') {
          celebrationName = 'polar_star';
          celebrationReason = 'persistent';
        } else if (milestoneType === 'learning_time') {
          celebrationName = 'twin_stars';
          celebrationReason = 'persistent';
        } else if (milestoneType === 'topics_explored') {
          celebrationName = 'polar_star';
          celebrationReason = 'deep_diver';
        } else if (milestoneType === 'cefr_level_up') {
          celebrationName = 'orions_belt';
          celebrationReason = 'deep_diver';
        } else {
          continue;
        }

        await queueCelebration(
          db,
          profileId,
          celebrationName,
          celebrationReason,
          detail
        );
      }
    } catch (err) {
      captureException(err, { profileId });
    }
  }

  return {
    snapshotDate,
    metrics,
    milestones: insertedMilestones,
  };
}
