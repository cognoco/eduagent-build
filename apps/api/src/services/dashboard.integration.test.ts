import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  assessments,
  consentGrant,
  consentRequest,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  guardianship,
  learningSessions,
  login,
  membership,
  organization,
  person,
  progressSnapshots,
  retentionCards,
  sessionEvents,
  sessionSummaries,
  streaks,
  subjects,
  type Database,
  xpLedger,
} from '@eduagent/database';
import type { ProgressMetrics, TopicProgress } from '@eduagent/schemas';
import { eq } from 'drizzle-orm';
import { ForbiddenError } from '../errors';
import {
  buildChildProgressSummariesBatch,
  getChildDetail,
  getChildSessionDetail,
  getChildSessions,
  getChildSubjectTopics,
  getChildrenForParent,
} from './dashboard';
import {
  countGuidedMetrics,
  countGuidedMetricsBatch,
} from './session/session-analytics';
import {
  deleteLegacyAccountsForTest,
  ensureLegacyProfileAnchorForTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;
const personIds: string[] = [];
const orgIds: string[] = [];

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
  // [WI-586] When set, the person joins this existing org instead of a fresh
  // one. A guardian + their charges MUST share one organization — the v2
  // dashboard read (getChildrenForParent) restricts charges to members of the
  // guardian's org (same-org defense-in-depth). Parent/child test pairs pass
  // the parent's orgId here so the child is a co-member and is not filtered out.
  orgId?: string;
}): Promise<{ orgId: string; profileId: string }> {
  ++seedCounter;

  let orgId: string;
  if (input.orgId) {
    orgId = input.orgId;
  } else {
    const [org] = await db
      .insert(organization)
      .values({ name: `Dashboard Test Org ${RUN_ID}_${seedCounter}` })
      .returning({ id: organization.id });
    orgIds.push(org!.id);
    orgId = org!.id;
  }

  const birthYear = input.birthYear ?? 2010;
  const [p] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: `${birthYear}-01-01`,
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  personIds.push(p!.id);
  await ensureLegacyProfileAnchorForTest(db, {
    profileId: p!.id,
    accountId: orgId,
    displayName: input.displayName,
    birthYear,
    isOwner: input.isOwner ?? true,
  });

  await db.insert(membership).values({
    personId: p!.id,
    organizationId: orgId,
    roles: (input.isOwner ?? true) ? ['admin'] : ['learner'],
  });

  return { orgId, profileId: p!.id };
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(guardianship).values({
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });

  // [WI-586] v2 same-org invariant: a guardian and their charge share one
  // organization. The v2 getChildrenForParent restricts charges to members of
  // the guardian's org (cross-org guardianship edges must not leak into the
  // dashboard — WI-802 defense-in-depth). [WI-1303] The same-org membership is
  // now the caller's responsibility — pass the parent's `orgId` into the
  // child's `seedProfile()` call (mirroring the only real v2 write path,
  // createChildProfileV2, which never gives a managed child a separate org).
  // A second membership row co-adding the child into the parent's org here
  // would violate the `membership_person_id_unique` DB constraint (one
  // membership per person). This early-return is a no-op safety net, not a
  // bridge — it intentionally does not insert.
  const parentMembership = await db.query.membership.findFirst({
    where: eq(membership.personId, parentProfileId),
    columns: { organizationId: true },
  });
  if (!parentMembership) return;
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

async function seedMixedParentTopic(input: {
  bookSubjectId: string;
  curriculumSubjectId: string;
  title: string;
}): Promise<string> {
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: input.curriculumSubjectId, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: input.bookSubjectId,
      title: `${input.title} Book`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: input.title,
      description: `${input.title} description`,
      sortOrder: 0,
      estimatedMinutes: 20,
      skipped: false,
    })
    .returning({ id: curriculumTopics.id });

  return topic!.id;
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

/** Like seedSession but accepts an explicit id so UUIDv7 ordering is deterministic. */
async function seedSessionWithId(input: {
  id: string;
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
      id: input.id,
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
  drillCorrect?: number | null;
  drillTotal?: number | null;
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
    drillCorrect: input.drillCorrect ?? null,
    drillTotal: input.drillTotal ?? null,
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
  orgId: string;
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  respondedAt?: Date | null;
}): Promise<void> {
  if (
    input.status === 'PENDING' ||
    input.status === 'PARENTAL_CONSENT_REQUESTED'
  ) {
    await db.insert(consentRequest).values({
      chargePersonId: input.profileId,
      organizationId: input.orgId,
      purpose: 'platform_use',
      requestedBasis: 'gdpr_parental_consent',
      status: input.status === 'PENDING' ? 'pending' : 'requested',
      requestedAt: new Date(),
    });
    return;
  }
  await db.insert(consentGrant).values({
    chargePersonId: input.profileId,
    organizationId: input.orgId,
    purpose: 'platform_use',
    lawfulBasis: 'gdpr_parental_consent',
    granted: input.status === 'CONSENTED',
    grantedAt: new Date(),
    withdrawnAt: input.status === 'WITHDRAWN' ? new Date() : undefined,
  });
}

async function seedConsentStateWithType(input: {
  profileId: string;
  orgId: string;
  consentType: 'GDPR' | 'COPPA';
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  respondedAt?: Date | null;
}): Promise<void> {
  if (
    input.status === 'PENDING' ||
    input.status === 'PARENTAL_CONSENT_REQUESTED'
  ) {
    await db.insert(consentRequest).values({
      chargePersonId: input.profileId,
      organizationId: input.orgId,
      purpose: 'platform_use',
      requestedBasis:
        input.consentType === 'GDPR'
          ? 'gdpr_parental_consent'
          : 'coppa_parental_consent',
      status: input.status === 'PENDING' ? 'pending' : 'requested',
      requestedAt: new Date(),
    });
    return;
  }
  const lawfulBasis =
    input.consentType === 'GDPR'
      ? 'gdpr_parental_consent'
      : 'coppa_parental_consent';
  await db.insert(consentGrant).values({
    chargePersonId: input.profileId,
    organizationId: input.orgId,
    purpose: 'platform_use',
    lawfulBasis,
    granted: input.status === 'CONSENTED',
    grantedAt: new Date(),
    withdrawnAt: input.status === 'WITHDRAWN' ? new Date() : undefined,
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
  await deleteLegacyAccountsForTest(db, orgIds);
  for (const pid of personIds) {
    await db.delete(guardianship).where(eq(guardianship.guardianPersonId, pid));
    await db.delete(guardianship).where(eq(guardianship.chargePersonId, pid));
    await db
      .delete(consentRequest)
      .where(eq(consentRequest.chargePersonId, pid));
    await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
    await db.delete(login).where(eq(login.personId, pid));
    await db.delete(membership).where(eq(membership.personId, pid));
    await db.delete(person).where(eq(person.id, pid));
  }
  for (const oid of orgIds) {
    await db.delete(organization).where(eq(organization.id, oid));
  }
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
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Parent',
        birthYear: 1985,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Alex',
      birthYear: 2010,
      orgId: parentOrgId,
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

    const children = await getChildrenForParent(db, parentProfileId, {
      identityV2Enabled: true,
    });

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
      const { profileId: parentProfileId, orgId: familyOrgId } =
        await seedProfile({
          displayName: 'Parent',
          birthYear: 1985,
        });
      const { profileId: childProfileId } = await seedProfile({
        displayName: `${status} Learner`,
        birthYear: 2012,
        orgId: familyOrgId,
      });
      await seedFamilyLink(parentProfileId, childProfileId);
      await seedConsentState({
        profileId: childProfileId,
        orgId: familyOrgId,
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

      const children = await getChildrenForParent(db, parentProfileId, {
        identityV2Enabled: true,
      });
      const detail = await getChildDetail(db, parentProfileId, childProfileId, {
        identityV2Enabled: true,
      });

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
    const { profileId: parentProfileId, orgId: familyOrgId } =
      await seedProfile({
        displayName: 'Parent',
        birthYear: 1985,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Active Learner',
      birthYear: 2012,
      orgId: familyOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedConsentState({
      profileId: childProfileId,
      orgId: familyOrgId,
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

    const children = await getChildrenForParent(db, parentProfileId, {
      identityV2Enabled: true,
    });

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
    const { profileId: parentProfileId, orgId: familyOrgId } =
      await seedProfile({
        displayName: 'Parent',
        birthYear: 1985,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Withdrawn Learner',
      birthYear: 2012,
      orgId: familyOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedConsentState({
      profileId: childProfileId,
      orgId: familyOrgId,
      status: 'WITHDRAWN',
      respondedAt: new Date(),
    });

    await expect(
      getChildSessions(db, parentProfileId, childProfileId, {
        identityV2Enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns child detail for linked parents and rejects unlinked access', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Guardian',
        birthYear: 1980,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Learner',
      birthYear: 2011,
      orgId: parentOrgId,
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

    const detail = await getChildDetail(db, parentProfileId, childProfileId, {
      identityV2Enabled: true,
    });

    expect(detail).toEqual(
      expect.objectContaining({
        profileId: childProfileId,
        displayName: 'Learner',
        sessionsThisWeek: 1,
      }),
    );

    await expect(
      getChildDetail(db, strangerParentId, childProfileId, {
        identityV2Enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns real topic progress and live session counts for a child subject', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Parent',
        birthYear: 1984,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Maya',
      birthYear: 2010,
      orgId: parentOrgId,
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
      { identityV2Enabled: true },
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
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Parent',
        birthYear: 1986,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Luca',
      birthYear: 2012,
      orgId: parentOrgId,
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

    // Pre-generate UUIDs with guaranteed ordering to make desc(id) sort
    // deterministic regardless of DB insert speed (two inserts in the same
    // millisecond would have non-deterministic random bits).
    const learningId = generateUUIDv7();
    await new Promise((r) => setTimeout(r, 2));
    const homeworkId = generateUUIDv7();
    // homeworkId must lexicographically follow learningId so desc(id) puts
    // homework first. Assert here so failures are obvious.
    expect(homeworkId > learningId).toBe(true);

    const learningSessionId = await seedSessionWithId({
      id: learningId,
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
    const homeworkSessionId = await seedSessionWithId({
      id: homeworkId,
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
      { identityV2Enabled: true },
    );
    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      learningSessionId,
      { identityV2Enabled: true },
    );

    expect(sessions).toHaveLength(2);
    // Sessions are ordered by desc(id) where id is UUIDv7 — creation order,
    // not startedAt. Homework was seeded second so its UUIDv7 is newer.
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: homeworkSessionId,
        subjectName: 'Mathematics',
        topicTitle: null,
        displayTitle: 'Math Homework',
        displaySummary: '5 problems, practiced linear equations.',
        narrative: null,
      }),
    );
    expect(sessions[1]).toEqual(
      expect.objectContaining({
        sessionId: learningSessionId,
        subjectName: 'Mathematics',
        topicTitle: 'Equivalent fractions',
        highlight: 'Practiced equivalent fractions',
        engagementSignal: 'curious',
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

  // ---------------------------------------------------------------------------
  // Phase 4 additions — ordering, null recap fields, parent/child boundaries
  // ---------------------------------------------------------------------------

  it('session ordering: homework session created after learning session sorts first (desc UUIDv7)', async () => {
    // getProfileSessions orders by desc(id) where id is UUIDv7 — a UUIDv7
    // created later always sorts before an earlier one regardless of startedAt.
    // This test confirms mixed homework+learning sessions respect that order.
    //
    // Pre-generate UUIDs with guaranteed ordering: sleep 2ms between calls so
    // the timestamp component differs even under high DB load. This makes the
    // test deterministic regardless of insertion speed.
    const learningId = generateUUIDv7();
    await new Promise((r) => setTimeout(r, 2));
    const homeworkId = generateUUIDv7();
    // Sanity: homeworkId must sort after learningId (both are UUIDv7 strings,
    // lexicographic order matches chronological for same-prefix UUIDs).
    expect(homeworkId > learningId).toBe(true);

    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Ordering Parent',
        birthYear: 1980,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Ordering Child',
      birthYear: 2012,
      orgId: parentOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Mixed Subject',
    });
    const { topicIds } = await seedCurriculum(subjectId, ['Topic A']);
    const now = getStableMidWeekNow();

    // Seed learning session first using the pre-generated lower UUIDv7
    const learningSessionId = await seedSessionWithId({
      id: learningId,
      profileId: childProfileId,
      subjectId,
      topicId: topicIds[0],
      sessionType: 'learning',
      startedAt: subtractDays(now, 2),
      endedAt: subtractDays(now, 2),
      exchangeCount: 5,
    });
    // Seed homework session using the pre-generated higher UUIDv7 → sorts first
    const homeworkSessionId = await seedSessionWithId({
      id: homeworkId,
      profileId: childProfileId,
      subjectId,
      sessionType: 'homework',
      startedAt: subtractDays(now, 1),
      endedAt: null,
      exchangeCount: 3,
      metadata: {
        homeworkSummary: {
          problemCount: 4,
          practicedSkills: ['fractions'],
          independentProblemCount: 2,
          guidedProblemCount: 2,
          summary: '4 problems on fractions.',
          displayTitle: 'Homework Session',
        },
      },
    });

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: true },
    );

    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // Homework (seeded later = higher UUIDv7) must sort before learning
    const positions = sessions.map((s) => s.sessionId);
    const homeworkIdx = positions.indexOf(homeworkSessionId);
    const learningIdx = positions.indexOf(learningSessionId);
    expect(homeworkIdx).toBeGreaterThanOrEqual(0);
    expect(learningIdx).toBeGreaterThanOrEqual(0);
    expect(homeworkIdx).toBeLessThan(learningIdx);

    // Homework session must render its displayTitle from homeworkSummary
    const homeworkSession = sessions.find(
      (s) => s.sessionId === homeworkSessionId,
    );
    expect(homeworkSession).toBeDefined();
    expect(homeworkSession!.sessionType).toBe('homework');
    expect(homeworkSession!.displayTitle).toBe('Homework Session');
    expect(homeworkSession!.displaySummary).toBe('4 problems on fractions.');

    // Learning session must render its topicTitle
    const learningSession = sessions.find(
      (s) => s.sessionId === learningSessionId,
    );
    expect(learningSession).toBeDefined();
    expect(learningSession!.sessionType).toBe('learning');
    expect(learningSession!.topicTitle).toBe('Topic A');
  });

  it('null recap fields: getChildSessionDetail with no sessionSummary row does not crash', async () => {
    // A session exists but no session_summaries row was ever written (e.g.
    // LLM summary timed out or was skipped). highlight, narrative, and
    // conversationPrompt must be null — not a runtime crash.
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Null Recap Parent',
        birthYear: 1979,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Null Recap Child',
      birthYear: 2013,
      orgId: parentOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Null Recap Subject',
    });
    const { topicIds } = await seedCurriculum(subjectId, ['Topic NR']);
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicIds[0],
      sessionType: 'learning',
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      endedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
    });
    // Deliberately do NOT call seedSessionSummary — no summary row exists.

    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      { identityV2Enabled: true },
    );

    expect(detail).not.toBeNull();
    expect(detail!.sessionId).toBe(sessionId);
    expect(detail!.highlight).toBeNull();
    expect(detail!.narrative).toBeNull();
    expect(detail!.conversationPrompt).toBeNull();
    expect(detail!.engagementSignal).toBeNull();
    // Session itself must still render correctly
    expect(detail!.subjectName).toBe('Null Recap Subject');
    expect(detail!.topicTitle).toBe('Topic NR');
    expect(detail!.exchangeCount).toBe(4);
  });

  it('[WI-80] parent session detail suppresses mixed-parent topic metadata', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Detail Mixed Topic Parent',
        birthYear: 1979,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Detail Mixed Topic Child',
      birthYear: 2013,
      orgId: parentOrgId,
    });
    const { profileId: foreignProfileId } = await seedProfile({
      displayName: 'Detail Mixed Topic Foreign',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const childSubjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Owned Detail Subject',
    });
    const foreignSubjectId = await seedSubject({
      profileId: foreignProfileId,
      name: 'Foreign Detail Subject',
    });
    const mixedTopicId = await seedMixedParentTopic({
      bookSubjectId: childSubjectId,
      curriculumSubjectId: foreignSubjectId,
      title: 'Foreign Curriculum Detail Topic',
    });
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId: childSubjectId,
      topicId: mixedTopicId,
      sessionType: 'learning',
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      endedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
    });

    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      { identityV2Enabled: true },
    );

    expect(detail).not.toBeNull();
    expect(detail!.subjectName).toBe('Owned Detail Subject');
    expect(detail!.topicId).toBeNull();
    expect(detail!.topicTitle).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(
      'Foreign Curriculum Detail Topic',
    );
  });

  it('[WI-80] parent session detail rejects stale foreign subject ownership', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Detail Foreign Subject Parent',
        birthYear: 1979,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Detail Foreign Subject Child',
      birthYear: 2013,
      orgId: parentOrgId,
    });
    const { profileId: foreignProfileId } = await seedProfile({
      displayName: 'Detail Foreign Subject Other',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const foreignSubjectId = await seedSubject({
      profileId: foreignProfileId,
      name: 'Foreign Subject Leak',
    });
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId: foreignSubjectId,
      sessionType: 'learning',
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      endedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
    });

    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      { identityV2Enabled: true },
    );

    expect(detail).toBeNull();
  });

  it('[WI-80] parent session list suppresses mixed-parent topic IDs and titles', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'List Mixed Topic Parent',
        birthYear: 1979,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'List Mixed Topic Child',
      birthYear: 2013,
      orgId: parentOrgId,
    });
    const { profileId: foreignProfileId } = await seedProfile({
      displayName: 'List Mixed Topic Foreign',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const childSubjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Owned List Subject',
    });
    const foreignSubjectId = await seedSubject({
      profileId: foreignProfileId,
      name: 'Foreign List Subject',
    });
    const mixedTopicId = await seedMixedParentTopic({
      bookSubjectId: childSubjectId,
      curriculumSubjectId: foreignSubjectId,
      title: 'Foreign Curriculum List Topic',
    });
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId: childSubjectId,
      topicId: mixedTopicId,
      sessionType: 'learning',
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      endedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
    });

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: true },
    );
    const session = sessions.find((entry) => entry.sessionId === sessionId);

    expect(session).toBeDefined();
    expect(session!.subjectName).toBe('Owned List Subject');
    expect(session!.topicId).toBeNull();
    expect(session!.topicTitle).toBeNull();
    expect(JSON.stringify(session)).not.toContain(
      'Foreign Curriculum List Topic',
    );
  });

  it('[WI-80] parent session detail filters secondary rows by child profile', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Detail Secondary Parent',
        birthYear: 1979,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Detail Secondary Child',
      birthYear: 2013,
      orgId: parentOrgId,
    });
    const { profileId: siblingProfileId } = await seedProfile({
      displayName: 'Detail Secondary Sibling',
      birthYear: 2012,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Secondary Row Subject',
    });
    const { topicIds } = await seedCurriculum(subjectId, ['Secondary Topic']);
    const sessionId = await seedSession({
      profileId: childProfileId,
      subjectId,
      topicId: topicIds[0],
      sessionType: 'learning',
      startedAt: subtractDays(getStableMidWeekNow(), 1),
      endedAt: subtractDays(getStableMidWeekNow(), 1),
      exchangeCount: 4,
    });

    await seedSessionSummary({
      sessionId,
      profileId: childProfileId,
      topicId: topicIds[0],
      highlight: 'Owned highlight',
      narrative: 'Owned narrative',
      conversationPrompt: 'Owned prompt?',
      engagementSignal: 'curious',
    });
    await seedSessionSummary({
      sessionId,
      profileId: siblingProfileId,
      topicId: topicIds[0],
      highlight: 'LEAK sibling highlight',
      narrative: 'LEAK sibling narrative',
      conversationPrompt: 'LEAK sibling prompt?',
      engagementSignal: 'confused',
    });
    await seedSessionEvent({
      sessionId,
      profileId: siblingProfileId,
      subjectId,
      topicId: topicIds[0],
      eventType: 'ai_response',
      content: 'LEAK sibling drill',
      createdAt: getStableMidWeekNow(),
      drillCorrect: 1,
      drillTotal: 9,
    });

    const detail = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      { identityV2Enabled: true },
    );

    expect(detail).not.toBeNull();
    expect(detail!.highlight).toBe('Owned highlight');
    expect(detail!.narrative).toBe('Owned narrative');
    expect(detail!.conversationPrompt).toBe('Owned prompt?');
    expect(detail!.engagementSignal).toBe('curious');
    expect(detail!.drills).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain('LEAK');
  });

  it('profile boundary: getChildrenForParent returns ONLY the linked child, not another child linked to a different parent', async () => {
    // P0 guard: parent A must NOT see child B's data even though both children
    // exist in the same DB. This test seeds two isolated parent→child pairs
    // and asserts that each parent's dashboard is completely isolated.
    //
    // BUG-CANDIDATE-CRITICAL if either assertion below fails: profile-scoping leak.
    const { profileId: parentA, orgId: parentAOrgId } = await seedProfile({
      displayName: 'Parent A',
      birthYear: 1975,
    });
    const { profileId: childA } = await seedProfile({
      displayName: 'Child A',
      birthYear: 2012,
      orgId: parentAOrgId,
    });
    const { profileId: parentB, orgId: parentBOrgId } = await seedProfile({
      displayName: 'Parent B',
      birthYear: 1978,
    });
    const { profileId: childB } = await seedProfile({
      displayName: 'Child B',
      birthYear: 2013,
      orgId: parentBOrgId,
    });

    await seedFamilyLink(parentA, childA);
    await seedFamilyLink(parentB, childB);

    const subjectA = await seedSubject({
      profileId: childA,
      name: 'Child A Subject',
    });
    const subjectB = await seedSubject({
      profileId: childB,
      name: 'Child B Subject',
    });
    const now = getStableMidWeekNow();
    await seedSession({
      profileId: childA,
      subjectId: subjectA,
      startedAt: subtractDays(now, 1),
      exchangeCount: 5,
    });
    await seedSession({
      profileId: childB,
      subjectId: subjectB,
      startedAt: subtractDays(now, 1),
      exchangeCount: 7,
    });

    const childrenForParentA = await getChildrenForParent(db, parentA, {
      identityV2Enabled: true,
    });
    const childrenForParentB = await getChildrenForParent(db, parentB, {
      identityV2Enabled: true,
    });

    // Parent A sees ONLY Child A
    expect(childrenForParentA).toHaveLength(1);
    expect(childrenForParentA[0]!.profileId).toBe(childA);
    expect(childrenForParentA[0]!.displayName).toBe('Child A');

    // Parent B sees ONLY Child B
    expect(childrenForParentB).toHaveLength(1);
    expect(childrenForParentB[0]!.profileId).toBe(childB);
    expect(childrenForParentB[0]!.displayName).toBe('Child B');

    // Cross-account check: no child from the other parent leaks through
    const parentAProfileIds = childrenForParentA.map((c) => c.profileId);
    const parentBProfileIds = childrenForParentB.map((c) => c.profileId);
    expect(parentAProfileIds).not.toContain(childB);
    expect(parentBProfileIds).not.toContain(childA);
  });

  it('[WI-1863] omits a credentialed charge from getChildrenForParent while retaining a managed charge', async () => {
    // A charge with their own login row is "credentialed": guardians must not
    // see them through managed-child surfaces (MMT-ADR-0008; OPQ-32). This
    // exercises the real getChildrenForParent wiring against the login table —
    // both children get identical activity, so an omission is attributable
    // only to the login row.
    const { profileId: parentId, orgId } = await seedProfile({
      displayName: 'Suppression Parent',
      birthYear: 1975,
    });
    const { profileId: credentialedChildId } = await seedProfile({
      displayName: 'Credentialed Child',
      birthYear: 2010,
      orgId,
    });
    const { profileId: managedChildId } = await seedProfile({
      displayName: 'Managed Child',
      birthYear: 2012,
      orgId,
    });
    await seedFamilyLink(parentId, credentialedChildId);
    await seedFamilyLink(parentId, managedChildId);
    await db.insert(login).values({
      id: generateUUIDv7(),
      personId: credentialedChildId,
      clerkUserId: `clerk_dashboard_${RUN_ID}_credentialed`,
      email: `dashboard-credentialed-${RUN_ID}@test.invalid`,
    });

    const now = getStableMidWeekNow();
    for (const childId of [credentialedChildId, managedChildId]) {
      const subjectId = await seedSubject({
        profileId: childId,
        name: `Suppression Subject ${childId.slice(0, 8)}`,
      });
      await seedSession({
        profileId: childId,
        subjectId,
        startedAt: subtractDays(now, 1),
        exchangeCount: 3,
      });
    }

    const children = await getChildrenForParent(db, parentId, {
      identityV2Enabled: true,
    });

    expect(children.map((c) => c.profileId)).toEqual([managedChildId]);
    expect(children[0]!.displayName).toBe('Managed Child');
  });

  it('profile boundary: getChildDetail throws ForbiddenError when parent is not linked to child', async () => {
    // BUG-CANDIDATE-CRITICAL if this does not throw: any parent could read
    // any child's detail by guessing a UUID.
    const { profileId: unrelatedParent } = await seedProfile({
      displayName: 'Unrelated Parent',
      birthYear: 1980,
    });
    const { profileId: targetChild } = await seedProfile({
      displayName: 'Target Child',
      birthYear: 2011,
    });
    // No family link between unrelatedParent and targetChild.

    await expect(
      getChildDetail(db, unrelatedParent, targetChild, {
        identityV2Enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('profile boundary: getChildSessions throws ForbiddenError for unlinked parent', async () => {
    // BUG-CANDIDATE-CRITICAL if this returns sessions instead of throwing.
    const { profileId: unrelatedParent } = await seedProfile({
      displayName: 'Stranger Parent SV',
      birthYear: 1977,
    });
    const { profileId: innocentChild } = await seedProfile({
      displayName: 'Innocent Child SV',
      birthYear: 2014,
    });
    // No family link.

    await expect(
      getChildSessions(db, unrelatedParent, innocentChild, {
        identityV2Enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getChildrenForParent returns empty array when parent has no linked children', async () => {
    const { profileId: loneParent } = await seedProfile({
      displayName: 'Lone Parent',
      birthYear: 1985,
    });
    // No family links seeded.
    const children = await getChildrenForParent(db, loneParent, {
      identityV2Enabled: true,
    });
    expect(children).toEqual([]);
  });

  it('mixed sessions: dashboard week counts include both homework and learning sessions', async () => {
    // Both session types must contribute to sessionsThisWeek when they each
    // have exchangeCount >= 1 and fall within the current week.
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'Mixed Parent',
        birthYear: 1981,
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Mixed Child',
      birthYear: 2012,
      orgId: parentOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    const subjectId = await seedSubject({
      profileId: childProfileId,
      name: 'Mixed Weekly Subject',
    });
    const now = getStableMidWeekNow();

    // One learning + one homework, both this week
    await seedSession({
      profileId: childProfileId,
      subjectId,
      sessionType: 'learning',
      startedAt: subtractDays(now, 1),
      exchangeCount: 5,
    });
    await seedSession({
      profileId: childProfileId,
      subjectId,
      sessionType: 'homework',
      startedAt: subtractDays(now, 2),
      exchangeCount: 3,
      metadata: {
        homeworkSummary: {
          problemCount: 3,
          practicedSkills: ['fractions'],
          independentProblemCount: 1,
          guidedProblemCount: 2,
          summary: '3 homework problems.',
          displayTitle: 'Homework',
        },
      },
    });

    const children = await getChildrenForParent(db, parentProfileId, {
      identityV2Enabled: true,
    });

    expect(children).toHaveLength(1);
    // Both session types must be counted in the this-week tally
    expect(children[0]!.sessionsThisWeek).toBe(2);
    expect(children[0]!.exchangesThisWeek).toBe(8); // 5 + 3
  });

  // [B72] buildChildProgressSummariesBatch previously ran an unbounded snapshot
  // scan (no date filter). Children with multi-year history streamed thousands
  // of snapshot rows per dashboard load. The function now applies a default
  // 90-day window — old snapshots must be excluded by default.
  it('B72: snapshot scan is bounded by default window — old snapshots are excluded', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'B72 Parent',
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'B72 Child',
      orgId: parentOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    // Recent snapshot (today) — within the default 90-day window.
    const recent = buildProgressMetrics({ topicsMastered: 7 });
    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: isoDate(new Date()),
      metrics: recent,
    });

    // Ancient snapshot (2 years ago) — far outside the 90-day window. If the
    // scan were unbounded this would surface and skew the result.
    const ancient = buildProgressMetrics({ topicsMastered: 999 });
    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: isoDate(subtractDays(new Date(), 730)),
      metrics: ancient,
    });

    const summaries = await buildChildProgressSummariesBatch(db, [
      {
        childProfileId,
        childName: 'B72 Child',
        sessionsThisWeek: 1,
        sessionsLastWeek: 0,
        totalTimeThisWeekMinutes: 15,
        subjectNames: [],
        currentStreak: 0,
      },
    ]);

    const summary = summaries.get(childProfileId);
    expect(summary).toBeDefined();
    // Latest snapshot picked is the recent one (7), NOT the ancient one (999).
    expect(summary!.progress?.topicsMastered).toBe(7);
    expect(summary!.progress?.topicsMastered).not.toBe(999);
  });

  // [B72] When the caller explicitly widens the window, ancient snapshots
  // become visible — proves the windowDays parameter is wired, not ignored.
  it('B72: explicit large windowDays surfaces ancient snapshots', async () => {
    const { profileId: parentProfileId, orgId: parentOrgId } =
      await seedProfile({
        displayName: 'B72-Wide Parent',
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'B72-Wide Child',
      orgId: parentOrgId,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    // Only an ancient snapshot exists.
    const ancient = buildProgressMetrics({ topicsMastered: 42 });
    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: isoDate(subtractDays(new Date(), 365)),
      metrics: ancient,
    });

    // Default 90-day window: latest snapshot is null (ancient excluded).
    const defaultSummaries = await buildChildProgressSummariesBatch(db, [
      {
        childProfileId,
        childName: 'B72-Wide Child',
        sessionsThisWeek: 0,
        sessionsLastWeek: 0,
        totalTimeThisWeekMinutes: 0,
        subjectNames: [],
        currentStreak: 0,
      },
    ]);
    expect(defaultSummaries.get(childProfileId)!.progress).toBeNull();

    // Wider 400-day window: the ancient snapshot surfaces.
    const widenedSummaries = await buildChildProgressSummariesBatch(
      db,
      [
        {
          childProfileId,
          childName: 'B72-Wide Child',
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalTimeThisWeekMinutes: 0,
          subjectNames: [],
          currentStreak: 0,
        },
      ],
      { windowDays: 400 },
    );
    expect(widenedSummaries.get(childProfileId)!.progress?.topicsMastered).toBe(
      42,
    );
  });

  // ---------------------------------------------------------------------------
  // [BUG-466] Break test: batch consent query must use GDPR type only
  // ---------------------------------------------------------------------------

  it('BUG-466: getChildrenForParent uses GDPR consent status, not newer non-GDPR row', async () => {
    // Parent + child relationship
    const { profileId: parentProfileId, orgId: familyOrgId466 } =
      await seedProfile({
        displayName: 'BUG466-Parent',
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'BUG466-Child',
      isOwner: false,
      orgId: familyOrgId466,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    // Older GDPR row: CONSENTED (the correct status to return)
    await seedConsentStateWithType({
      profileId: childProfileId,
      orgId: familyOrgId466,
      consentType: 'GDPR',
      status: 'CONSENTED',
      respondedAt: subtractDays(new Date(), 10),
    });

    // Newer non-GDPR row (COPPA): WITHDRAWN — must NOT win
    await seedConsentStateWithType({
      profileId: childProfileId,
      orgId: familyOrgId466,
      consentType: 'COPPA',
      status: 'WITHDRAWN',
      respondedAt: subtractDays(new Date(), 1),
    });

    await seedSubject({
      profileId: childProfileId,
      name: 'BUG466-Math',
    });
    await seedProgressSnapshot({
      profileId: childProfileId,
      snapshotDate: isoDate(new Date()),
      metrics: buildProgressMetrics({ topicsMastered: 3 }),
    });

    const children = await getChildrenForParent(db, parentProfileId, {
      identityV2Enabled: true,
    });

    expect(children).toHaveLength(1);
    // GDPR row (CONSENTED) must be the source of truth.
    // Before BUG-466 fix, the COPPA WITHDRAWN row (newer requestedAt) would win
    // and consentStatus would be 'WITHDRAWN' instead of 'CONSENTED'.
    expect(children[0]!.profileId).toBe(childProfileId);
    expect(children[0]!.consentStatus).toBe('CONSENTED');
  });

  // ---------------------------------------------------------------------------
  // [BUG-465] Break test: child detail consent lookup must use GDPR type only
  // ---------------------------------------------------------------------------

  it('BUG-465: getChildDetail uses GDPR consent status, not newer non-GDPR row', async () => {
    const { profileId: parentProfileId, orgId: familyOrgId465 } =
      await seedProfile({
        displayName: 'BUG465-Parent',
      });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'BUG465-Child',
      isOwner: false,
      orgId: familyOrgId465,
    });
    await seedFamilyLink(parentProfileId, childProfileId);

    // Older GDPR row: CONSENTED
    await seedConsentStateWithType({
      profileId: childProfileId,
      orgId: familyOrgId465,
      consentType: 'GDPR',
      status: 'CONSENTED',
      respondedAt: subtractDays(new Date(), 10),
    });

    // Newer non-GDPR row (COPPA): WITHDRAWN — must NOT win
    await seedConsentStateWithType({
      profileId: childProfileId,
      orgId: familyOrgId465,
      consentType: 'COPPA',
      status: 'WITHDRAWN',
      respondedAt: subtractDays(new Date(), 1),
    });

    await seedSubject({
      profileId: childProfileId,
      name: 'BUG465-Science',
    });

    const detail = await getChildDetail(db, parentProfileId, childProfileId, {
      identityV2Enabled: true,
    });

    expect(detail).not.toBeNull();
    // GDPR row (CONSENTED) must win — child data must be accessible
    expect(detail!.consentStatus).toBe('CONSENTED');
    // If the COPPA WITHDRAWN row won, the detail would be redacted
    expect(detail!.profileId).toBe(childProfileId);
  });
});
