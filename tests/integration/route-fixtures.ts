import { eq } from 'drizzle-orm';
import {
  assessments,
  consentStates,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  learningModes,
  needsDeepeningTopics,
  notificationPreferences,
  parkingLotItems,
  profiles,
  retentionCards,
  sessionSummaries,
  streaks,
  subjects,
  subscriptions,
  teachingPreferences,
  topicNotes,
  vocabulary,
  xpLedger,
  type Database,
} from '@eduagent/database';
import {
  buildAuthHeaders as buildSignedAuthHeaders,
  type TestJWTClaims,
} from './test-keys';
import { createIntegrationDb } from './helpers';

type AppLike = {
  request: (
    input: string,
    init?: RequestInit,
    env?: Record<string, string>
  ) => Promise<Response>;
};

export interface AuthFixtureUser {
  userId: string;
  email: string;
}

export interface TopicSeedInput {
  title: string;
  description?: string;
  sortOrder?: number;
  estimatedMinutes?: number;
  skipped?: boolean;
  relevance?: 'core' | 'recommended' | 'contemporary' | 'emerging';
  source?: 'generated' | 'user';
  chapter?: string | null;
  cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  cefrSublevel?: string | null;
  targetWordCount?: number | null;
  targetChunkCount?: number | null;
  filedFrom?: 'pre_generated' | 'session_filing' | 'freeform_filing';
}

/**
 * Builds HTTP headers with a real signed JWT.
 *
 * Accepts either `buildAuthHeaders('profile-id')` (profileId only, default
 * claims) or `buildAuthHeaders({ sub: '...', email: '...' }, 'profile-id')`
 * (explicit claims).
 */
export function buildAuthHeaders(
  claimsOrProfileId?: TestJWTClaims | string,
  profileId?: string
): HeadersInit {
  if (typeof claimsOrProfileId === 'string') {
    return buildSignedAuthHeaders(undefined, claimsOrProfileId);
  }
  return buildSignedAuthHeaders(claimsOrProfileId, profileId);
}

/**
 * Creates a profile through the real route.
 */
export async function createProfileViaRoute(input: {
  app: AppLike;
  env: Record<string, string>;
  user: AuthFixtureUser;
  displayName: string;
  birthYear: number;
}): Promise<{
  id: string;
  accountId: string;
  displayName: string;
  birthYear: number;
  isOwner: boolean;
  consentStatus: string | null;
}> {
  const res = await input.app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({
        sub: input.user.userId,
        email: input.user.email,
      }),
      body: JSON.stringify({
        displayName: input.displayName,
        birthYear: input.birthYear,
      }),
    },
    input.env
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile as {
    id: string;
    accountId: string;
    displayName: string;
    birthYear: number;
    isOwner: boolean;
    consentStatus: string | null;
  };
}

export async function setSubscriptionTierForProfile(
  profileId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' = 'active'
): Promise<void> {
  const db = createIntegrationDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: { accountId: true },
  });

  if (!profile) {
    throw new Error(`Profile not found for tier seed: ${profileId}`);
  }

  await db
    .update(subscriptions)
    .set({
      tier,
      status,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.accountId, profile.accountId));
}

export async function seedSubject(
  profileId: string,
  name: string,
  overrides: Partial<typeof subjects.$inferInsert> = {}
): Promise<{
  id: string;
  profileId: string;
  name: string;
}> {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
      ...overrides,
    })
    .returning();

  if (!subject) {
    throw new Error('Insert into subjects did not return a row');
  }

  return {
    id: subject.id,
    profileId: subject.profileId,
    name: subject.name,
  };
}

export async function seedCurriculum(input: {
  subjectId: string;
  bookTitle?: string;
  topics: TopicSeedInput[];
}): Promise<{
  curriculumId: string;
  bookId: string;
  topicIds: string[];
}> {
  const db = createIntegrationDb();
  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId: input.subjectId,
      version: 1,
    })
    .returning({ id: curricula.id });

  if (!curriculum) {
    throw new Error('Insert into curricula did not return a row');
  }

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: input.subjectId,
      title: input.bookTitle ?? 'Seeded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  if (!book) {
    throw new Error('Insert into curriculumBooks did not return a row');
  }

  const insertedTopics = await db
    .insert(curriculumTopics)
    .values(
      input.topics.map((topic, index) => ({
        curriculumId: curriculum.id,
        bookId: book.id,
        title: topic.title,
        description:
          topic.description ?? `Seeded description for ${topic.title}`,
        sortOrder: topic.sortOrder ?? index,
        estimatedMinutes: topic.estimatedMinutes ?? 30,
        skipped: topic.skipped ?? false,
        relevance: topic.relevance ?? 'core',
        source: topic.source ?? 'generated',
        chapter: topic.chapter ?? null,
        cefrLevel: topic.cefrLevel ?? null,
        cefrSublevel: topic.cefrSublevel ?? null,
        targetWordCount: topic.targetWordCount ?? null,
        targetChunkCount: topic.targetChunkCount ?? null,
        filedFrom: topic.filedFrom ?? 'pre_generated',
      }))
    )
    .returning({ id: curriculumTopics.id });

  return {
    curriculumId: curriculum.id,
    bookId: book.id,
    topicIds: insertedTopics.map((topic) => topic.id),
  };
}

export async function seedLearningSession(input: {
  profileId: string;
  subjectId: string;
  topicId?: string | null;
  overrides?: Partial<typeof learningSessions.$inferInsert>;
}): Promise<string> {
  const db = createIntegrationDb();
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      sessionType: 'learning',
      status: 'active',
      exchangeCount: 3,
      escalationRung: 1,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      ...input.overrides,
    })
    .returning({ id: learningSessions.id });

  if (!session) {
    throw new Error('Insert into learningSessions did not return a row');
  }

  return session.id;
}

export async function seedAssessmentRecord(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId?: string | null;
  verificationDepth?: 'recall' | 'explain' | 'transfer';
  status?: 'in_progress' | 'passed' | 'failed';
  masteryScore?: string | number | null;
  qualityRating?: number | null;
  exchangeHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  overrides?: Partial<typeof assessments.$inferInsert>;
}): Promise<string> {
  const db = createIntegrationDb();
  const [assessment] = await db
    .insert(assessments)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      sessionId: input.sessionId ?? null,
      verificationDepth: input.verificationDepth ?? 'recall',
      status: input.status ?? 'in_progress',
      masteryScore:
        input.masteryScore == null ? null : String(input.masteryScore),
      qualityRating: input.qualityRating ?? null,
      exchangeHistory: input.exchangeHistory ?? [],
      ...input.overrides,
    })
    .returning({ id: assessments.id });

  if (!assessment) {
    throw new Error('Insert into assessments did not return a row');
  }

  return assessment.id;
}

export async function seedConsentRequest(input: {
  profileId: string;
  token: string;
  status?: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  consentType?: 'GDPR' | 'COPPA';
  parentEmail?: string;
  respondedAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(consentStates).values({
    profileId: input.profileId,
    consentType: input.consentType ?? 'GDPR',
    status: input.status ?? 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: input.parentEmail ?? 'parent.integration@test.invalid',
    consentToken: input.token,
    respondedAt: input.respondedAt ?? null,
    expiresAt:
      input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

export async function seedNotificationPreferences(input: {
  profileId: string;
  reviewReminders?: boolean;
  dailyReminders?: boolean;
  weeklyProgressPush?: boolean;
  pushEnabled?: boolean;
  maxDailyPush?: number;
  expoPushToken?: string | null;
}): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(notificationPreferences).values({
    profileId: input.profileId,
    reviewReminders: input.reviewReminders ?? false,
    dailyReminders: input.dailyReminders ?? false,
    weeklyProgressPush: input.weeklyProgressPush ?? true,
    pushEnabled: input.pushEnabled ?? false,
    maxDailyPush: input.maxDailyPush ?? 3,
    expoPushToken: input.expoPushToken ?? null,
  });
}

export async function seedLearningModeRecord(input: {
  profileId: string;
  mode?: 'serious' | 'casual';
  celebrationLevel?: 'all' | 'big_only' | 'off';
  consecutiveSummarySkips?: number;
  medianResponseSeconds?: number | null;
}): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(learningModes).values({
    profileId: input.profileId,
    mode: input.mode ?? 'serious',
    celebrationLevel: input.celebrationLevel ?? 'all',
    consecutiveSummarySkips: input.consecutiveSummarySkips ?? 0,
    medianResponseSeconds: input.medianResponseSeconds ?? null,
  });
}

export async function seedTeachingPreference(input: {
  profileId: string;
  subjectId: string;
  method?:
    | 'visual_diagrams'
    | 'step_by_step'
    | 'real_world_examples'
    | 'practice_problems';
  analogyDomain?:
    | 'cooking'
    | 'sports'
    | 'building'
    | 'music'
    | 'nature'
    | 'gaming'
    | null;
  nativeLanguage?: string | null;
}): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(teachingPreferences).values({
    profileId: input.profileId,
    subjectId: input.subjectId,
    method: input.method ?? 'step_by_step',
    analogyDomain: input.analogyDomain ?? null,
    nativeLanguage: input.nativeLanguage ?? null,
  });
}

export async function seedTopicNote(input: {
  profileId: string;
  topicId: string;
  content: string;
  updatedAt?: Date;
}): Promise<string> {
  const db = createIntegrationDb();
  const [note] = await db
    .insert(topicNotes)
    .values({
      profileId: input.profileId,
      topicId: input.topicId,
      content: input.content,
      updatedAt: input.updatedAt ?? new Date(),
    })
    .returning({ id: topicNotes.id });

  if (!note) {
    throw new Error('Insert into topicNotes did not return a row');
  }

  return note.id;
}

export async function seedRetentionCard(input: {
  profileId: string;
  topicId: string;
  xpStatus?: 'pending' | 'verified' | 'decayed';
  nextReviewAt?: Date | null;
  lastReviewedAt?: Date | null;
  intervalDays?: number;
  repetitions?: number;
  failureCount?: number;
  consecutiveSuccesses?: number;
  evaluateDifficultyRung?: number | null;
}): Promise<string> {
  const db = createIntegrationDb();
  const [card] = await db
    .insert(retentionCards)
    .values({
      profileId: input.profileId,
      topicId: input.topicId,
      xpStatus: input.xpStatus ?? 'pending',
      nextReviewAt:
        input.nextReviewAt === undefined
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : input.nextReviewAt,
      lastReviewedAt: input.lastReviewedAt ?? null,
      intervalDays: input.intervalDays ?? 1,
      repetitions: input.repetitions ?? 0,
      failureCount: input.failureCount ?? 0,
      consecutiveSuccesses: input.consecutiveSuccesses ?? 0,
      evaluateDifficultyRung: input.evaluateDifficultyRung ?? null,
    })
    .returning({ id: retentionCards.id });

  if (!card) {
    throw new Error('Insert into retentionCards did not return a row');
  }

  return card.id;
}

export async function seedXpLedgerEntry(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  amount: number;
  status?: 'pending' | 'verified' | 'decayed';
  earnedAt?: Date;
  verifiedAt?: Date | null;
}): Promise<string> {
  const db = createIntegrationDb();
  const [entry] = await db
    .insert(xpLedger)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      amount: input.amount,
      status: input.status ?? 'pending',
      earnedAt: input.earnedAt ?? new Date(),
      verifiedAt: input.verifiedAt ?? null,
    })
    .returning({ id: xpLedger.id });

  if (!entry) {
    throw new Error('Insert into xpLedger did not return a row');
  }

  return entry.id;
}

export async function seedStreakRecord(input: {
  profileId: string;
  currentStreak?: number;
  longestStreak?: number;
  lastActivityDate?: string | null;
  gracePeriodStartDate?: string | null;
}): Promise<string> {
  const db = createIntegrationDb();
  const [streakRow] = await db
    .insert(streaks)
    .values({
      profileId: input.profileId,
      currentStreak: input.currentStreak ?? 0,
      longestStreak: input.longestStreak ?? 0,
      lastActivityDate: input.lastActivityDate ?? null,
      gracePeriodStartDate: input.gracePeriodStartDate ?? null,
    })
    .returning({ id: streaks.id });

  if (!streakRow) {
    throw new Error('Insert into streaks did not return a row');
  }

  return streakRow.id;
}

export async function seedSessionSummary(input: {
  sessionId: string;
  profileId: string;
  topicId?: string | null;
  content?: string | null;
  status?: 'pending' | 'submitted' | 'accepted' | 'skipped' | 'auto_closed';
}): Promise<string> {
  const db = createIntegrationDb();
  const [summary] = await db
    .insert(sessionSummaries)
    .values({
      sessionId: input.sessionId,
      profileId: input.profileId,
      topicId: input.topicId ?? null,
      content: input.content ?? null,
      status: input.status ?? 'submitted',
    })
    .returning({ id: sessionSummaries.id });

  if (!summary) {
    throw new Error('Insert into sessionSummaries did not return a row');
  }

  return summary.id;
}

export async function seedNeedsDeepeningRecord(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
  status?: 'active' | 'resolved';
  consecutiveSuccessCount?: number;
}): Promise<string> {
  const db = createIntegrationDb();
  const [record] = await db
    .insert(needsDeepeningTopics)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      status: input.status ?? 'active',
      consecutiveSuccessCount: input.consecutiveSuccessCount ?? 0,
    })
    .returning({ id: needsDeepeningTopics.id });

  if (!record) {
    throw new Error('Insert into needsDeepeningTopics did not return a row');
  }

  return record.id;
}

export async function seedParkingLotItem(input: {
  sessionId: string;
  profileId: string;
  topicId?: string | null;
  question: string;
  explored?: boolean;
}): Promise<string> {
  const db = createIntegrationDb();
  const [item] = await db
    .insert(parkingLotItems)
    .values({
      sessionId: input.sessionId,
      profileId: input.profileId,
      topicId: input.topicId ?? null,
      question: input.question,
      explored: input.explored ?? false,
    })
    .returning({ id: parkingLotItems.id });

  if (!item) {
    throw new Error('Insert into parkingLotItems did not return a row');
  }

  return item.id;
}

export async function seedVocabularyEntry(input: {
  profileId: string;
  subjectId: string;
  term: string;
  translation: string;
  type?: 'word' | 'chunk';
  milestoneId?: string | null;
  cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  mastered?: boolean;
}): Promise<string> {
  const db = createIntegrationDb();
  const [entry] = await db
    .insert(vocabulary)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      term: input.term,
      termNormalized: input.term.trim().toLowerCase(),
      translation: input.translation,
      type: input.type ?? 'word',
      milestoneId: input.milestoneId ?? null,
      cefrLevel: input.cefrLevel ?? null,
      mastered: input.mastered ?? false,
    })
    .returning({ id: vocabulary.id });

  if (!entry) {
    throw new Error('Insert into vocabulary did not return a row');
  }

  return entry.id;
}

export function getIntegrationDb(): Database {
  return createIntegrationDb();
}
