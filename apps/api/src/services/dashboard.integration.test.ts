import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  assessments,
  consentStates,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  generateUUIDv7,
  learningSessions,
  progressSnapshots,
  profiles,
  retentionCards,
  sessionEvents,
  sessionSummaries,
  streaks,
  subjects,
  type Database,
  xpLedger,
} from '@eduagent/database';
import type { ProgressMetrics, TopicProgress } from '@eduagent/schemas';
import { like } from 'drizzle-orm';
import { ForbiddenError } from '../errors';
import {
  countGuidedMetrics,
  countGuidedMetricsBatch,
  getChildDetail,
  getChildSessionDetail,
  getChildSessions,
  getChildSubjectTopics,
  getChildrenForParent,
} from './dashboard';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

/**
 * Returns Wednesday noon UTC of the current ISO week.
 *
 * The dashboard service uses Monday-start ISO weeks (see
 * `getStartOfWeek` in dashboard.ts). When tests use `new Date()` and
 * offset by ±1 day to seed "this week" / "last week" sessions, those
 * offsets cross the Monday boundary on Mon/Sun and silently misclassify.
 * Anchoring to mid-week makes ±1 / ±8 day offsets always land in the
 * intended week.
 */
function getStableMidWeekNow(): Date {
  const d = new Date();
  const day = d.getUTCDay() || 7; // Sun=0 → treat as 7 so Mon=1
  d.setUTCDate(d.getUTCDate() - day + 3); // shift to Wednesday (day 3)
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function buildSubjectMetrics(
  input: Partial<ProgressMetrics['subjects'][number]> & {
    subjectId: string;
    subjectName: string;
  },
): ProgressMetrics['subjects'][number] {
  return {
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    pedagogyMode: input.pedagogyMode ?? 'socratic',
    topicsAttempted: input.topicsAttempted ?? 0,
    topicsMastered: input.topicsMastered ?? 0,
    topicsTotal: input.topicsTotal ?? 0,
    topicsExplored: input.topicsExplored ?? 0,
    vocabularyTotal: input.vocabularyTotal ?? 0,
    vocabularyMastered: input.vocabularyMastered ?? 0,
    sessionsCount: input.sessionsCount ?? 0,
    activeMinutes: input.activeMinutes ?? 0,
    wallClockMinutes: input.wallClockMinutes ?? 0,
    lastSessionAt: input.lastSessionAt ?? null,
  };
}

function buildProgressMetrics(
  overrides: Partial<ProgressMetrics> = {},
): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
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
    ...overrides,
  };
}

async function seedProfile(input: {
  displayName: string;
  birthYear?: number;
  isOwner?: boolean;
}): Promise<{ accountId: string; profileId: string }> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_dashboard_${RUN_ID}_${idx}`;
  const email = `dashboard-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: input.displayName,
      birthYear: input.birthYear ?? 2010,
      isOwner: input.isOwner ?? true,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(familyLinks).values({ parentProfileId, childProfileId });
}

async function seedSubject(input: {
  profileId: string;
  name: string;
  rawInput?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(subjects)
    .values({
      profileId: input.profileId,
      name: input.name,
      rawInput: input.rawInput ?? null,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  return row!.id;
}

async function seedCurriculum(
  subjectId: string,
  topicTitles: string[],
): Promise<{ curriculumId: string; topicIds: string[] }> {
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Seeded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const topics = await db
    .insert(curriculumTopics)
    .values(
      topicTitles.map((title, index) => ({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title,
        description: `${title} description`,
        sortOrder: index,
        estimatedMinutes: 20,
        skipped: false,
      })),
    )
    .returning({ id: curriculumTopics.id });

  return {
    curriculumId: curriculum!.id,
    topicIds: topics.map((topic: { id: string }) => topic.id),
  };
}

async function seedSession(input: {
  profileId: string;
  subjectId: string;
  topicId?: string | null;
  sessionType?: 'learning' | 'homework' | 'interleaved';
  startedAt: Date;
  endedAt?: Date | null;
  exchangeCount: number;
  durationSeconds?: number | null;
  wallClockSeconds?: number | null;
  escalationRung?: number;
  status?: 'active' | 'completed' | 'auto_closed';
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType ?? 'learning',
      status: input.status ?? 'completed',
      exchangeCount: input.exchangeCount,
      escalationRung: input.escalationRung ?? 1,
      startedAt: input.startedAt,
      lastActivityAt: input.endedAt ?? input.startedAt,
      endedAt: input.endedAt ?? input.startedAt,
      durationSeconds: input.durationSeconds ?? null,
      wallClockSeconds: input.wallClockSeconds ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({ id: learningSessions.id });

  return session!.id;
}

async function seedSessionEvent(input: {
  sessionId: string;
  profileId: string;
  subjectId: string;
  topicId?: string | null;
  eventType: typeof sessionEvents.$inferInsert.eventType;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(sessionEvents).values({
    sessionId: input.sessionId,
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId ?? null,
    eventType: input.eventType,
    content: input.content,
    createdAt: input.createdAt,
    metadata: input.metadata ?? {},
  });
}

async function seedSessionSummary(input: {
  sessionId: string;
  profileId: string;
  topicId?: string | null;
  content?: string | null;
  highlight?: string | null;
  narrative?: string | null;
  conversationPrompt?: string | null;
  engagementSignal?: string | null;
}): Promise<void> {
  await db.insert(sessionSummaries).values({
    sessionId: input.sessionId,
    profileId: input.profileId,
    topicId: input.topicId ?? null,
    status: 'submitted',
    content: input.content ?? null,
    highlight: input.highlight ?? null,
    narrative: input.narrative ?? null,
    conversationPrompt: input.conversationPrompt ?? null,
    engagementSignal: input.engagementSignal ?? null,
  });
}

async function seedRetentionCard(input: {
  profileId: string;
  topicId: string;
  xpStatus?: 'pending' | 'verified' | 'decayed';
  nextReviewAt: Date | null;
  failureCount?: number;
  intervalDays?: number;
}): Promise<void> {
  await db.insert(retentionCards).values({
    profileId: input.profileId,
    topicId: input.topicId,
    xpStatus: input.xpStatus ?? 'pending',
    nextReviewAt: input.nextReviewAt,
    intervalDays: input.intervalDays ?? 7,
    failureCount: input.failureCount ?? 0,
    repetitions: 1,
    consecutiveSuccesses: 0,
  });
}

async function seedAssessment(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  status?: 'in_progress' | 'passed' | 'failed';
  masteryScore?: number | null;
}): Promise<void> {
  await db.insert(assessments).values({
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    status: input.status ?? 'passed',
    verificationDepth: 'recall',
    masteryScore: input.masteryScore ?? 0.8,
    exchangeHistory: [],
  });
}

async function seedProgressSnapshot(input: {
  profileId: string;
  snapshotDate: string;
  metrics: ProgressMetrics;
}): Promise<void> {
  await db.insert(progressSnapshots).values({
    profileId: input.profileId,
    snapshotDate: input.snapshotDate,
    metrics: input.metrics,
  });
}

async function seedStreak(input: {
  profileId: string;
  currentStreak: number;
  longestStreak: number;
}): Promise<void> {
  await db.insert(streaks).values({
    profileId: input.profileId,
    currentStreak: input.currentStreak,
    longestStreak: input.longestStreak,
  });
}

async function seedXpLedgerEntry(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  amount: number;
  status?: 'pending' | 'verified' | 'decayed';
}): Promise<void> {
  await db.insert(xpLedger).values({
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    amount: input.amount,
    status: input.status ?? 'verified',
  });
}

async function seedConsentState(input: {
  profileId: string;
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  respondedAt?: Date | null;
}): Promise<void> {
  await db.insert(consentStates).values({
    profileId: input.profileId,
    consentType: 'GDPR',
    status: input.status,
    respondedAt: input.respondedAt ?? null,
  });
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for dashboard integration tests');
  }

  db = createDatabase(databaseUrl);
});

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_dashboard_${RUN_ID}%`));
});

describe('dashboard service integration', () => {
  it('counts guided metrics from real session events', async () => {
    const { profileId } = await seedProfile({ displayName: 'Jordan' });
    const subjectId = await seedSubject({
      profileId,
      name: 'Biology',
    });
    const sessionId = await seedSession({
      profileId,
      subjectId,
      startedAt: subtractDays(new Date(), 1),
      exchangeCount: 3,
    });

    await seedSessionEvent({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'Hint 1',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 1 },
    });
    await seedSessionEvent({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'Hint 2',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 3 },
    });
    await seedSessionEvent({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'Hint 3',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 4 },
    });
    await seedSessionEvent({
      sessionId,
      profileId,
      subjectId,
      eventType: 'user_message',
      content: 'Thanks',
      createdAt: subtractDays(new Date(), 1),
    });

    const result = await countGuidedMetrics(
      db,
      profileId,
      subtractDays(new Date(), 2),
    );

    expect(result).toEqual({ guidedCount: 2, totalProblemCount: 3 });
  });

  // [BUG-734 / PERF-4] Verify the batched variant returns the same metrics
  // for each child as the per-child query, in a single round-trip, including
  // the "child with zero events" case which must still appear in the map.
  it('countGuidedMetricsBatch aggregates per child and includes zero-event children', async () => {
    const { profileId: childA } = await seedProfile({
      displayName: 'BatchChildA',
    });
    const { profileId: childB } = await seedProfile({
      displayName: 'BatchChildB',
    });
    const { profileId: childZero } = await seedProfile({
      displayName: 'BatchChildZero',
    });

    const subjectA = await seedSubject({ profileId: childA, name: 'Math' });
    const subjectB = await seedSubject({ profileId: childB, name: 'Science' });

    const sessionA = await seedSession({
      profileId: childA,
      subjectId: subjectA,
      startedAt: subtractDays(new Date(), 1),
      exchangeCount: 2,
    });
    const sessionB = await seedSession({
      profileId: childB,
      subjectId: subjectB,
      startedAt: subtractDays(new Date(), 1),
      exchangeCount: 2,
    });

    // child A: 1 guided (rung 4) + 1 non-guided (rung 1) → guided=1 total=2
    await seedSessionEvent({
      sessionId: sessionA,
      profileId: childA,
      subjectId: subjectA,
      eventType: 'ai_response',
      content: 'A1',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 4 },
    });
    await seedSessionEvent({
      sessionId: sessionA,
      profileId: childA,
      subjectId: subjectA,
      eventType: 'ai_response',
      content: 'A2',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 1 },
    });

    // child B: 2 guided (rung 3, rung 5) → guided=2 total=2
    await seedSessionEvent({
      sessionId: sessionB,
      profileId: childB,
      subjectId: subjectB,
      eventType: 'ai_response',
      content: 'B1',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 3 },
    });
    await seedSessionEvent({
      sessionId: sessionB,
      profileId: childB,
      subjectId: subjectB,
      eventType: 'ai_response',
      content: 'B2',
      createdAt: subtractDays(new Date(), 1),
      metadata: { escalationRung: 5 },
    });

    const result = await countGuidedMetricsBatch(
      db,
      [childA, childB, childZero],
      subtractDays(new Date(), 2),
    );

    expect(result.get(childA)).toEqual({
      guidedCount: 1,
      totalProblemCount: 2,
    });
    expect(result.get(childB)).toEqual({
      guidedCount: 2,
      totalProblemCount: 2,
    });
    // childZero has no events but must still be in the map with zeros so
    // the dashboard does not silently drop children from the iteration.
    expect(result.get(childZero)).toEqual({
      guidedCount: 0,
      totalProblemCount: 0,
    });
  });

  it('returns aggregated children with real progress, snapshots, streaks, and XP', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      birthYear: 1985,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Alex',
      birthYear: 2010,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Science',
      rawInput: 'bugs and stuff',
    });
    const { topicIds } = await seedCurriculum(subjectId, [
      'Plant cells',
      'Photosynthesis',
    ]);
    const [topicId1, topicId2] = topicIds;
    const now = getStableMidWeekNow();
    const currentSession1StartedAt = now;
    const currentSession2StartedAt = subtractDays(now, 1);
    const lastWeekStartedAt = subtractDays(now, 8);

    const sessionId1 = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1,
      startedAt: currentSession1StartedAt,
      endedAt: currentSession1StartedAt,
      exchangeCount: 10,
      durationSeconds: 600,
      wallClockSeconds: 720,
    });
    const sessionId2 = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicId2,
      startedAt: currentSession2StartedAt,
      endedAt: currentSession2StartedAt,
      exchangeCount: 12,
      durationSeconds: 900,
      wallClockSeconds: 1080,
    });
    await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1,
      startedAt: lastWeekStartedAt,
      endedAt: lastWeekStartedAt,
      exchangeCount: 5,
      durationSeconds: 300,
      wallClockSeconds: 360,
    });

    await seedSessionEvent({
      sessionId: sessionId1,
      profileId: childProfileId,
      subjectId,
      topicId: topicId1,
      eventType: 'ai_response',
      content: 'Keep trying',
      createdAt: currentSession1StartedAt,
      metadata: { escalationRung: 1 },
    });
    await seedSessionEvent({
      sessionId: sessionId1,
      profileId: childProfileId,
      subjectId,
      topicId: topicId1,
      eventType: 'ai_response',
      content: 'Here is an example',
      createdAt: currentSession1StartedAt,
      metadata: { escalationRung: 3 },
    });
    await seedSessionEvent({
      sessionId: sessionId2,
      profileId: childProfileId,
      subjectId,
      topicId: topicId2,
      eventType: 'ai_response',
      content: 'Try this bridge',
      createdAt: currentSession2StartedAt,
      metadata: { escalationRung: 4 },
    });

    // [TEST-FLAKE-FIX] Anchor retention `nextReviewAt` on real time, not on
    // `now = getStableMidWeekNow()` (Wed noon UTC). `computeRetentionStatus`
    // in services/progress.ts evaluates against `new Date()` at call time —
    // anchoring on midweek means a card "1d in the future from midweek" can
    // be 1–3 days in the past by Thu–Sun, flipping the bucketed status
    // (fading → weak) and the aggregate (`[strong, fading]` → `[strong, weak]`).
    // Use `new Date()` + a margin large enough that the card stays in the
    // intended bucket regardless of which weekday the test runs on.
    const realNow = new Date();
    await seedRetentionCard({
      profileId: childProfileId,
      topicId: topicId1!,
      xpStatus: 'verified',
      // > 3d future → 'strong' bucket
      nextReviewAt: subtractDays(realNow, -7),
      intervalDays: 30,
    });
    await seedRetentionCard({
      profileId: childProfileId,
      topicId: topicId2!,
      xpStatus: 'pending',
      // 0–3d future → 'fading' bucket. Use 2d to stay in this bucket even
      // if the suite runs slowly enough to lose a few hours.
      nextReviewAt: subtractDays(realNow, -2),
      intervalDays: 2,
    });
    await seedStreak({
      profileId: childProfileId,
      currentStreak: 4,
      longestStreak: 9,
    });
    await seedXpLedgerEntry({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1!,
      amount: 20,
    });
    await seedXpLedgerEntry({
      profileId: childProfileId,
      subjectId,
      topicId: topicId2!,
      amount: 22,
    });

    const latestSnapshotDate = isoDate(now);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
    );

    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: previousSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 1,
        totalActiveMinutes: 12,
        totalWallClockMinutes: 14,
        totalExchanges: 5,
        topicsAttempted: 1,
        topicsMastered: 1,
        topicsInProgress: 0,
        vocabularyTotal: 8,
        vocabularyMastered: 3,
        vocabularyLearning: 2,
        vocabularyNew: 3,
        retentionCardsDue: 0,
        retentionCardsStrong: 1,
        retentionCardsFading: 0,
        currentStreak: 2,
        longestStreak: 4,
        subjects: [
          buildSubjectMetrics({
            subjectId,
            subjectName: 'Science',
            topicsAttempted: 1,
            topicsMastered: 1,
            topicsTotal: 2,
            topicsExplored: 1,
            vocabularyTotal: 8,
            vocabularyMastered: 3,
            sessionsCount: 1,
            activeMinutes: 12,
            wallClockMinutes: 14,
            lastSessionAt: lastWeekStartedAt.toISOString(),
          }),
        ],
      }),
    });
    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: latestSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 3,
        totalActiveMinutes: 30,
        totalWallClockMinutes: 36,
        totalExchanges: 27,
        topicsAttempted: 2,
        topicsMastered: 3,
        topicsInProgress: 0,
        vocabularyTotal: 14,
        vocabularyMastered: 6,
        vocabularyLearning: 4,
        vocabularyNew: 4,
        retentionCardsDue: 0,
        retentionCardsStrong: 1,
        retentionCardsFading: 1,
        currentStreak: 4,
        longestStreak: 9,
        subjects: [
          buildSubjectMetrics({
            subjectId,
            subjectName: 'Science',
            topicsAttempted: 2,
            topicsMastered: 2,
            topicsTotal: 2,
            topicsExplored: 3,
            vocabularyTotal: 14,
            vocabularyMastered: 6,
            sessionsCount: 3,
            activeMinutes: 30,
            wallClockMinutes: 36,
            lastSessionAt: currentSession1StartedAt.toISOString(),
          }),
        ],
      }),
    });

    const children = await getChildrenForParent(db, parentProfileId);

    expect(children).toHaveLength(1);
    expect(children[0]).toEqual(
      expect.objectContaining({
        profileId: childProfileId,
        displayName: 'Alex',
        sessionsThisWeek: 2,
        sessionsLastWeek: 1,
        totalTimeThisWeek: 30,
        totalTimeLastWeek: 6,
        exchangesThisWeek: 22,
        exchangesLastWeek: 5,
        trend: 'up',
        currentStreak: 4,
        longestStreak: 9,
        totalXp: 42,
        totalSessions: 3,
      }),
    );
    expect(children[0]!.summary).toContain('Alex');
    expect(children[0]!.subjects).toEqual([
      expect.objectContaining({
        subjectId,
        name: 'Science',
        retentionStatus: 'fading',
        rawInput: 'bugs and stuff',
      }),
    ]);
    expect(children[0]!.guidedVsImmediateRatio).toBeCloseTo(2 / 3);
    expect(children[0]!.progress).toEqual(
      expect.objectContaining({
        snapshotDate: latestSnapshotDate,
        minutesThisWeek: 30,
        weeklyDeltaTopicsMastered: 2,
        weeklyDeltaVocabularyTotal: 6,
        weeklyDeltaTopicsExplored: 2,
      }),
    );
  });

  it.each([
    {
      status: 'PENDING' as const,
      summaryCopy: 'consent is pending',
    },
    {
      status: 'PARENTAL_CONSENT_REQUESTED' as const,
      summaryCopy: 'waiting for parent approval',
    },
    {
      status: 'WITHDRAWN' as const,
      summaryCopy: 'consent has been withdrawn',
    },
  ])(
    'redacts dashboard learning metrics for $status consent',
    async ({ status, summaryCopy }) => {
      const { profileId: parentProfileId } = await seedProfile({
        displayName: 'Parent',
        birthYear: 1985,
      });
      const { profileId: childProfileId } = await seedProfile({
        displayName: `${status} Learner`,
        birthYear: 2012,
      });
      await seedFamilyLink(parentProfileId, childProfileId);
      await seedConsentState({
        profileId: childProfileId,
        status,
      });

      const subjectId = await seedSubject({
        profileId: childProfileId,
        name: 'Private Science',
      });
      await seedSession({
        profileId: childProfileId,
        subjectId,
        startedAt: subtractDays(getStableMidWeekNow(), 1),
        exchangeCount: 8,
        durationSeconds: 600,
        wallClockSeconds: 660,
      });
      await seedStreak({
        profileId: childProfileId,
        currentStreak: 5,
        longestStreak: 7,
      });

      const children = await getChildrenForParent(db, parentProfileId);
      const detail = await getChildDetail(db, parentProfileId, childProfileId);

      expect(children).toHaveLength(1);
      for (const child of [children[0], detail]) {
        expect(child).toEqual(
          expect.objectContaining({
            profileId: childProfileId,
            displayName: `${status} Learner`,
            consentStatus: status,
            sessionsThisWeek: 0,
            sessionsLastWeek: 0,
            totalTimeThisWeek: 0,
            totalTimeLastWeek: 0,
            exchangesThisWeek: 0,
            exchangesLastWeek: 0,
            currentStreak: 0,
            longestStreak: 0,
            totalXp: 0,
            trend: 'stable',
            retentionTrend: 'stable',
            guidedVsImmediateRatio: 0,
            totalSessions: 0,
            subjects: [],
            progress: null,
            currentlyWorkingOn: [],
          }),
        );
        expect(child!.weeklyHeadline).toBeUndefined();
        expect(child!.summary).toContain(summaryCopy);
      }
    },
  );

  it('returns full dashboard learning metrics when consent is active', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      birthYear: 1985,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Active Learner',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedConsentState({
      profileId: childProfileId,
      status: 'CONSENTED',
    });

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Visible Science',
    });
    await seedSession({
      profileId: childProfileId,
      subjectId,
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 8,
      durationSeconds: 600,
      wallClockSeconds: 660,
    });
    await seedStreak({
      profileId: childProfileId,
      currentStreak: 5,
      longestStreak: 7,
    });

    const children = await getChildrenForParent(db, parentProfileId);

    expect(children).toHaveLength(1);
    expect(children[0]).toEqual(
      expect.objectContaining({
        profileId: childProfileId,
        displayName: 'Active Learner',
        consentStatus: 'CONSENTED',
        sessionsThisWeek: 1,
        exchangesThisWeek: 8,
        totalTimeThisWeek: 11,
        currentStreak: 5,
        longestStreak: 7,
        trend: 'up',
        subjects: [
          expect.objectContaining({
            subjectId,
            name: 'Visible Science',
          }),
        ],
      }),
    );
    expect(children[0]!.summary).not.toContain(
      'hidden until consent is active',
    );
  });

  it('blocks child drill-down data when consent is not active', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      birthYear: 1985,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Withdrawn Learner',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedConsentState({
      profileId: childProfileId,
      status: 'WITHDRAWN',
      respondedAt: new Date(),
    });

    await expect(
      getChildSessions(db, parentProfileId, childProfileId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns child detail for linked parents and rejects unlinked access', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Guardian',
      birthYear: 1980,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Learner',
      birthYear: 2011,
    });
    const { profileId: strangerParentId } = await seedProfile({
      displayName: 'Stranger',
      birthYear: 1981,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'History',
    });
    await seedSession({
      profileId: childProfileId,
      subjectId,
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
      durationSeconds: 480,
      wallClockSeconds: 540,
    });

    const detail = await getChildDetail(db, parentProfileId, childProfileId);

    expect(detail).toEqual(
      expect.objectContaining({
        profileId: childProfileId,
        displayName: 'Learner',
        sessionsThisWeek: 1,
      }),
    );

    await expect(
      getChildDetail(db, strangerParentId, childProfileId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns real topic progress and live session counts for a child subject', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      birthYear: 1984,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Maya',
      birthYear: 2010,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Biology',
    });
    const { topicIds } = await seedCurriculum(subjectId, [
      'Plant cells',
      'Animal cells',
    ]);
    const [topicId1, topicId2] = topicIds;
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1,
      startedAt: subtractDays(new Date(), 1),
      exchangeCount: 4,
      status: 'completed',
      durationSeconds: 600,
      wallClockSeconds: 660,
    });

    await seedAssessment({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1!,
      status: 'passed',
      masteryScore: 0.8,
    });
    await seedRetentionCard({
      profileId: childProfileId,
      topicId: topicId1!,
      xpStatus: 'verified',
      nextReviewAt: subtractDays(new Date(), -10),
      intervalDays: 30,
    });
    await seedXpLedgerEntry({
      profileId: childProfileId,
      subjectId,
      topicId: topicId1!,
      amount: 15,
      status: 'verified',
    });
    await seedSessionSummary({
      sessionId,
      profileId: childProfileId,
      topicId: topicId1,
      content: 'Plant cells have a nucleus and a cell wall.',
    });

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId,
    );

    const plantCells = topics.find(
      (topic: TopicProgress) => topic.topicId === topicId1,
    );
    const animalCells = topics.find(
      (topic: TopicProgress) => topic.topicId === topicId2,
    );

    expect(plantCells).toEqual(
      expect.objectContaining({
        topicId: topicId1,
        completionStatus: 'verified',
        retentionStatus: 'strong',
        masteryScore: 0.8,
        summaryExcerpt: 'Plant cells have a nucleus and a cell wall.',
        xpStatus: 'verified',
        totalSessions: 1,
      }),
    );
    // Topics with 0 sessions are filtered out (parent only sees topics with activity)
    expect(animalCells).toBeUndefined();
  });

  it('returns child sessions and a single-session detail with structured recap fields', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      birthYear: 1986,
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Luca',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Mathematics',
    });
    const { topicIds } = await seedCurriculum(subjectId, [
      'Equivalent fractions',
    ]);
    const learningStartedAt = subtractDays(new Date(), 1);
    const homeworkStartedAt = subtractDays(new Date(), 2);

    const learningSessionId = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicIds[0],
      startedAt: learningStartedAt,
      endedAt: learningStartedAt,
      exchangeCount: 6,
      escalationRung: 2,
      durationSeconds: 480,
      wallClockSeconds: 500,
    });
    const homeworkSessionId = await seedSession({
      profileId: childProfileId,
      subjectId,
      sessionType: 'homework',
      startedAt: homeworkStartedAt,
      endedAt: null,
      exchangeCount: 3,
      metadata: {
        homeworkSummary: {
          problemCount: 5,
          practicedSkills: ['linear equations'],
          independentProblemCount: 3,
          guidedProblemCount: 2,
          summary: '5 problems, practiced linear equations.',
          displayTitle: 'Math Homework',
        },
      },
    });

    await seedSessionSummary({
      sessionId: learningSessionId,
      profileId: childProfileId,
      topicId: topicIds[0],
      highlight: 'Practiced equivalent fractions',
      narrative:
        'They compared fraction sizes and corrected one shaky step with a hint.',
      conversationPrompt: 'Which fraction felt easiest to compare today?',
      engagementSignal: 'curious',
    });

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
    );
    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      learningSessionId,
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: learningSessionId,
        subjectName: 'Mathematics',
        topicTitle: 'Equivalent fractions',
        highlight: 'Practiced equivalent fractions',
        engagementSignal: 'curious',
      }),
    );
    expect(sessions[1]).toEqual(
      expect.objectContaining({
        sessionId: homeworkSessionId,
        subjectName: 'Mathematics',
        topicTitle: null,
        displayTitle: 'Math Homework',
        displaySummary: '5 problems, practiced linear equations.',
        narrative: null,
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        sessionId: learningSessionId,
        subjectName: 'Mathematics',
        topicTitle: 'Equivalent fractions',
        highlight: 'Practiced equivalent fractions',
        narrative:
          'They compared fraction sizes and corrected one shaky step with a hint.',
        conversationPrompt: 'Which fraction felt easiest to compare today?',
        engagementSignal: 'curious',
      }),
    );
  });
});
