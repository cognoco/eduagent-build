import { and, eq } from 'drizzle-orm';
import {
  assessments,
  consentGrant,
  consentRequest,
  consentStates,
  curricula,
  curriculumBooks,
  curriculumTopics,
  familyLinks,
  generateUUIDv7,
  guardianship,
  learningSessions,
  learningModes,
  membership,
  needsDeepeningTopics,
  notificationPreferences,
  parkingLotItems,
  person,
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
import { createIntegrationDb, isIdentityV2Enabled } from './helpers';

const TEST_CONSENT_PURPOSE = 'platform_use';

function consentTypeToBasis(consentType: 'GDPR' | 'COPPA') {
  return consentType === 'COPPA'
    ? 'coppa_parental_consent'
    : 'gdpr_parental_consent';
}

type AppLike = {
  request: (
    input: string,
    init?: RequestInit,
    env?: Record<string, string>,
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
  profileId?: string,
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
  kind?: 'owner' | 'child';
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
        ...(input.kind ? { kind: input.kind } : {}),
        displayName: input.displayName,
        birthYear: input.birthYear,
      }),
    },
    input.env,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  const apiProfile = body.profile as {
    id: string;
    displayName: string;
    birthYear: number;
    isOwner: boolean;
    consentStatus: string | null;
  };
  // [CR-2026-05-21-181] publicProfileSchema intentionally strips accountId
  // from API responses (cross-profile correlation guard). Integration tests
  // still need accountId for direct DB setup of related rows (subscriptions,
  // child profiles, etc.), so we resolve it from the DB after creation —
  // never re-introducing accountId into the wire response.
  const db = createIntegrationDb();

  // [WI-586] Flag-ON the create route builds only the v2 identity graph
  // (organization/person/login/membership) — NO legacy `profiles`/`accounts`
  // row exists, and the close-gate DB has those tables dropped. The legacy
  // accountId is `organization.id` by the reseed (identity-resolve.ts), so
  // resolve it via membership for the created person (person.id == profile.id).
  if (isIdentityV2Enabled()) {
    const membershipRow = await db.query.membership.findFirst({
      where: eq(membership.personId, apiProfile.id),
      columns: { organizationId: true },
    });
    if (!membershipRow) {
      throw new Error(
        `createProfileViaRoute: membership for person ${apiProfile.id} not found in DB after create`,
      );
    }
    return { ...apiProfile, accountId: membershipRow.organizationId };
  }

  const row = await db.query.profiles.findFirst({
    where: eq(profiles.id, apiProfile.id),
    columns: { accountId: true },
  });
  if (!row) {
    throw new Error(
      `createProfileViaRoute: profile ${apiProfile.id} not found in DB after create`,
    );
  }
  return { ...apiProfile, accountId: row.accountId };
}

export async function seedDirectChildProfileForTest(input: {
  parentProfileId: string;
  accountId: string;
  displayName: string;
  birthYear: number;
  location?: 'EU' | 'US' | 'OTHER' | null;
  profileId?: string;
}): Promise<{ id: string; accountId: string; isOwner: false }> {
  const db = createIntegrationDb();
  const childId = input.profileId ?? generateUUIDv7();
  const location = input.location ?? 'EU';

  await db
    .insert(profiles)
    .values({
      id: childId,
      accountId: input.accountId,
      displayName: input.displayName,
      birthYear: input.birthYear,
      location,
      isOwner: false,
    })
    .onConflictDoNothing();

  if (isIdentityV2Enabled()) {
    await db
      .insert(person)
      .values({
        id: childId,
        displayName: input.displayName,
        birthDate: `${input.birthYear}-01-01`,
        residenceJurisdiction: location,
      })
      .onConflictDoNothing();

    await db
      .insert(membership)
      .values({
        personId: childId,
        organizationId: input.accountId,
        roles: ['learner'],
      })
      .onConflictDoNothing();
  }

  return { id: childId, accountId: input.accountId, isOwner: false };
}

export async function seedFamilyLinkForTest(input: {
  parentProfileId: string;
  childProfileId: string;
}): Promise<void> {
  const db = createIntegrationDb();
  await db
    .insert(familyLinks)
    .values({
      parentProfileId: input.parentProfileId,
      childProfileId: input.childProfileId,
    })
    .onConflictDoNothing();

  if (isIdentityV2Enabled()) {
    await db
      .insert(guardianship)
      .values({
        guardianPersonId: input.parentProfileId,
        chargePersonId: input.childProfileId,
      })
      .onConflictDoNothing();
  }
}

export async function setProfileConsentStatusForTest(input: {
  profileId: string;
  accountId: string;
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  consentType?: 'GDPR' | 'COPPA';
  parentEmail?: string;
  guardianPersonId?: string;
}): Promise<void> {
  const db = createIntegrationDb();
  const consentType = input.consentType ?? 'GDPR';
  const respondedAt =
    input.status === 'CONSENTED' || input.status === 'WITHDRAWN'
      ? new Date()
      : null;

  await db
    .delete(consentStates)
    .where(eq(consentStates.profileId, input.profileId));
  await db.insert(consentStates).values({
    profileId: input.profileId,
    consentType,
    status: input.status,
    parentEmail: input.parentEmail ?? null,
    consentToken: `integration-consent-${input.profileId}-${input.status}`,
    respondedAt,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  if (!isIdentityV2Enabled()) return;

  const basis = consentTypeToBasis(consentType);
  await db
    .delete(consentRequest)
    .where(
      and(
        eq(consentRequest.chargePersonId, input.profileId),
        eq(consentRequest.organizationId, input.accountId),
        eq(consentRequest.purpose, TEST_CONSENT_PURPOSE),
        eq(consentRequest.requestedBasis, basis),
      ),
    );
  await db
    .delete(consentGrant)
    .where(
      and(
        eq(consentGrant.chargePersonId, input.profileId),
        eq(consentGrant.organizationId, input.accountId),
        eq(consentGrant.purpose, TEST_CONSENT_PURPOSE),
        eq(consentGrant.lawfulBasis, basis),
      ),
    );

  if (
    input.status === 'PENDING' ||
    input.status === 'PARENTAL_CONSENT_REQUESTED'
  ) {
    await db.insert(consentRequest).values({
      chargePersonId: input.profileId,
      organizationId: input.accountId,
      purpose: TEST_CONSENT_PURPOSE,
      requestedBasis: basis,
      guardianPersonId: input.guardianPersonId ?? null,
      guardianEmail: input.parentEmail ?? null,
      status:
        input.status === 'PARENTAL_CONSENT_REQUESTED' ? 'requested' : 'pending',
      token:
        input.status === 'PARENTAL_CONSENT_REQUESTED'
          ? `integration-v2-consent-${input.profileId}`
          : null,
      tokenExpiresAt:
        input.status === 'PARENTAL_CONSENT_REQUESTED'
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : null,
      requestedAt: new Date(),
    });
    return;
  }

  await db.insert(consentGrant).values({
    chargePersonId: input.profileId,
    organizationId: input.accountId,
    purpose: TEST_CONSENT_PURPOSE,
    lawfulBasis: basis,
    granted: true,
    withdrawnAt: input.status === 'WITHDRAWN' ? new Date() : null,
    priorValue: input.status === 'WITHDRAWN' ? true : null,
    auditFact: {
      source: 'integration_test',
      guardianPersonId: input.guardianPersonId ?? null,
    },
  });
}

export async function setSubscriptionTierForProfile(
  profileId: string,
  tier: 'free' | 'plus' | 'family' | 'pro',
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired' = 'active',
): Promise<void> {
  const db = createIntegrationDb();

  // [WI-586 drop-4 reshape] The legacy `subscriptions` table is RETAINED (its
  // drop + the quota-FK repoint are WI-805). So flag-ON we still update the
  // legacy `subscriptions` row — but resolve its account_id via membership
  // (account_id == organization.id by the reseed), since the legacy `profiles`
  // table that previously carried account_id is dropped in the close-gate DB.
  if (isIdentityV2Enabled()) {
    const membershipRow = await db.query.membership.findFirst({
      where: eq(membership.personId, profileId),
      columns: { organizationId: true },
    });
    if (!membershipRow) {
      throw new Error(`Membership not found for tier seed: ${profileId}`);
    }
    await db
      .update(subscriptions)
      .set({
        tier,
        status,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.accountId, membershipRow.organizationId));
    return;
  }

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
  overrides: Partial<typeof subjects.$inferInsert> = {},
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
      })),
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
  const status = input.status ?? 'PARENTAL_CONSENT_REQUESTED';
  const consentType = input.consentType ?? 'GDPR';
  const parentEmail = input.parentEmail ?? 'parent.integration@test.invalid';
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(consentStates).values({
    profileId: input.profileId,
    consentType,
    status,
    parentEmail,
    consentToken: input.token,
    respondedAt: input.respondedAt ?? null,
    expiresAt,
  });

  if (!isIdentityV2Enabled()) return;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, input.profileId),
    columns: { accountId: true },
  });
  if (!profile) {
    throw new Error(`Profile ${input.profileId} not found for consent seed`);
  }

  if (status === 'PENDING' || status === 'PARENTAL_CONSENT_REQUESTED') {
    await db.insert(consentRequest).values({
      chargePersonId: input.profileId,
      organizationId: profile.accountId,
      purpose: TEST_CONSENT_PURPOSE,
      requestedBasis: consentTypeToBasis(consentType),
      guardianEmail: parentEmail,
      status: status === 'PARENTAL_CONSENT_REQUESTED' ? 'requested' : 'pending',
      token: status === 'PARENTAL_CONSENT_REQUESTED' ? input.token : null,
      tokenExpiresAt:
        status === 'PARENTAL_CONSENT_REQUESTED' ? expiresAt : null,
      requestedAt: new Date(),
    });
    return;
  }

  await setProfileConsentStatusForTest({
    profileId: input.profileId,
    accountId: profile.accountId,
    status,
    consentType,
    parentEmail,
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
  celebrationLevel?: 'all' | 'big_only' | 'off';
  medianResponseSeconds?: number | null;
}): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(learningModes).values({
    profileId: input.profileId,
    celebrationLevel: input.celebrationLevel ?? 'all',
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
