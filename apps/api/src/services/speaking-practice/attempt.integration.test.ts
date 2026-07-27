import { eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  createScopedRepository,
  generateUUIDv7,
  learningSessions,
  speakingPracticeAttempts,
  subjects,
} from '@eduagent/database';
import {
  SubjectNotFoundError,
  LearningSessionNotFoundError,
} from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { recordSpeakingPracticeAttempt } from './attempt';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-speaking-practice-attempt';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-01`,
  email: `${PREFIX}-user1@integration.test`,
};
// [SECURITY] Second account for cross-profile IDOR break tests — profile A
// owns a subject/session, profile B (attacker) tries to record an attempt
// against them.
const VICTIM_ACCOUNT = {
  clerkUserId: `${PREFIX}-victim`,
  email: `${PREFIX}-victim@integration.test`,
};

const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

let profileId: string;
let subjectId: string;
let sessionId: string;
let victimProfileId: string;
let victimSubjectId: string;
let victimSessionId: string;

beforeAll(async () => {
  await cleanupTestAccounts();
  const db = createIntegrationDb();

  const accountId = generateUUIDv7();
  profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Integration Learner',
    birthYear: 2010,
    clerkUserId: ACCOUNT.clerkUserId,
    email: ACCOUNT.email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Speaking Practice Subject' })
    .returning();
  subjectId = subject!.id;
  const [session] = await db
    .insert(learningSessions)
    .values({ profileId, subjectId, status: 'active' })
    .returning({ id: learningSessions.id });
  sessionId = session!.id;

  // Victim account: owns the subject/session the attacker (profileId) tries
  // to abuse.
  const victimAccountId = generateUUIDv7();
  victimProfileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: victimAccountId,
    profileId: victimProfileId,
    displayName: 'Victim Learner',
    birthYear: 2010,
    clerkUserId: VICTIM_ACCOUNT.clerkUserId,
    email: VICTIM_ACCOUNT.email,
    isOwner: true,
  });
  seededAccountIds.push(victimAccountId);
  seededProfileIds.push(victimProfileId);

  const [victimSubject] = await db
    .insert(subjects)
    .values({ profileId: victimProfileId, name: 'Victim Subject' })
    .returning();
  victimSubjectId = victimSubject!.id;
  const [victimSession] = await db
    .insert(learningSessions)
    .values({
      profileId: victimProfileId,
      subjectId: victimSubjectId,
      status: 'active',
    })
    .returning({ id: learningSessions.id });
  victimSessionId = victimSession!.id;
});

beforeEach(async () => {
  const db = createIntegrationDb();
  await db
    .delete(speakingPracticeAttempts)
    .where(
      inArray(speakingPracticeAttempts.profileId, [profileId, victimProfileId]),
    );
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('recordSpeakingPracticeAttempt (integration)', () => {
  // WI-1777 whole-bundle AC as a single vertical: select an activity's
  // target → POST an attempt against it through the service → read the
  // persisted row back via createScopedRepository (the real production read
  // path, not the response body) → assert the learner-facing response
  // matches the persisted row exactly (single-scorer invariant).
  it('persists a deterministic score and the response matches the row read back through createScopedRepository', async () => {
    const db = createIntegrationDb();

    const response = await recordSpeakingPracticeAttempt(db, profileId, {
      sessionId,
      subjectId,
      mode: 'repeat_after_me',
      targetText: 'I would like a cup of tea.',
      transcript: 'I like cup tea',
      locale: 'en-US',
    });

    expect(response.missingWords).toEqual(['would', 'a', 'of']);
    expect(response.isComplete).toBe(false);
    expect(response.attemptNumber).toBe(1);

    const repo = createScopedRepository(db, profileId);
    const rows = await repo.speakingPracticeAttempts.findMany(
      eq(speakingPracticeAttempts.sessionId, sessionId),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.targetText).toBe('I would like a cup of tea.');
    expect(row.transcript).toBe('I like cup tea');
    expect(row.mode).toBe('repeat_after_me');
    expect(row.locale).toBe('en-US');
    expect(row.attemptNumber).toBe(response.attemptNumber);
    expect(row.lexicalMatchScore).toBeCloseTo(response.lexicalMatchScore);
    expect(row.missingWords).toEqual(response.missingWords);
    expect(row.extraWords).toEqual(response.extraWords);
    // No raw audio column anywhere on the persisted row (WI-1549 AC4).
    expect(Object.keys(row)).not.toEqual(
      expect.arrayContaining(['audio', 'audioUrl', 'audioBase64']),
    );
  });

  it('increments attemptNumber across retries against the same target', async () => {
    const db = createIntegrationDb();

    const first = await recordSpeakingPracticeAttempt(db, profileId, {
      sessionId,
      subjectId,
      mode: 'repeat_after_me',
      targetText: 'I like tea.',
      transcript: 'I like tea',
      locale: 'en-US',
    });
    const second = await recordSpeakingPracticeAttempt(db, profileId, {
      sessionId,
      subjectId,
      mode: 'repeat_after_me',
      targetText: 'I like tea.',
      transcript: 'I tea',
      locale: 'en-US',
    });

    expect(first.attemptNumber).toBe(1);
    expect(second.attemptNumber).toBe(2);
  });

  it('[SECURITY-IDOR] rejects cross-profile subjectId — no row written', async () => {
    const db = createIntegrationDb();

    await expect(
      recordSpeakingPracticeAttempt(db, profileId, {
        sessionId,
        // Attacker (profileId) supplies the VICTIM's subjectId.
        subjectId: victimSubjectId,
        mode: 'repeat_after_me',
        targetText: 'I like tea.',
        transcript: 'I like tea',
        locale: 'en-US',
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    const attackerRows = await db
      .select()
      .from(speakingPracticeAttempts)
      .where(eq(speakingPracticeAttempts.profileId, profileId));
    expect(attackerRows).toHaveLength(0);
    const victimRows = await db
      .select()
      .from(speakingPracticeAttempts)
      .where(eq(speakingPracticeAttempts.profileId, victimProfileId));
    expect(victimRows).toHaveLength(0);
  });

  it('[SECURITY-IDOR] rejects cross-profile sessionId — no row written', async () => {
    const db = createIntegrationDb();

    await expect(
      recordSpeakingPracticeAttempt(db, profileId, {
        // Attacker (profileId) supplies the VICTIM's sessionId, but their own
        // (owned) subjectId.
        sessionId: victimSessionId,
        subjectId,
        mode: 'repeat_after_me',
        targetText: 'I like tea.',
        transcript: 'I like tea',
        locale: 'en-US',
      }),
    ).rejects.toBeInstanceOf(LearningSessionNotFoundError);

    const attackerRows = await db
      .select()
      .from(speakingPracticeAttempts)
      .where(eq(speakingPracticeAttempts.profileId, profileId));
    expect(attackerRows).toHaveLength(0);
  });
});
