/**
 * Integration: learner-profile service.
 *
 * Closes the coverage gap called out as bug 199 — learner-profile.ts is 1878
 * lines with 72 db/profileId references and previously had no integration
 * test. This file targets the highest-risk surface:
 *
 *   - getOrCreateLearningProfile      — idempotent creation under repeated calls
 *   - grantMemoryConsent + applyAnalysis — write path scoped to profileId
 *   - applyAnalysis with confidence='low' — short-circuits, no DB write
 *   - deleteAllMemory                 — IDOR break (wrong accountId rejected)
 *   - deleteAllMemory                 — scoped to caller's profileId (sibling
 *                                       profile's memory must NOT be deleted)
 *
 * No mocks of internal services or database. External-boundary LLM is not
 * touched — these are pure DB-write paths.
 */

import { resolve } from 'path';
import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  learningProfiles,
  memoryFacts,
  profiles,
  type Database,
} from '@eduagent/database';
import { ensureV2IdentityForLegacyProfileTest } from '../test-utils/legacy-identity-anchors';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import type { SessionAnalysisOutput } from '@eduagent/schemas';

import {
  applyAnalysis,
  deleteAllMemory,
  getLearningProfile,
  getOrCreateLearningProfile,
  grantMemoryConsent,
} from './learner-profile';

// ---------------------------------------------------------------------------
// DB setup — real connection
// ---------------------------------------------------------------------------

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

function createIntegrationDb(): Database {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-learner-profile';
const EMAILS = [
  `${PREFIX}-own@integration.test`,
  `${PREFIX}-sibling@integration.test`,
];

async function cleanup() {
  const db = createIntegrationDb();
  const found = await db.query.accounts.findMany({
    where: inArray(accounts.email, EMAILS),
  });
  const ids = found.map((a: typeof accounts.$inferSelect) => a.id);
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
}

interface SeedAccount {
  accountId: string;
  profileId: string;
  email: string;
}

async function seedAccountAndProfile(emailIndex: 0 | 1): Promise<SeedAccount> {
  const db = createIntegrationDb();
  const email = EMAILS[emailIndex]!;
  const clerkUserId = `${PREFIX}-clerk-${emailIndex}`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Learner ${emailIndex}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning();

  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId: account!.id,
    profileId: profile!.id,
    displayName: `Learner ${emailIndex}`,
    birthYear: 2010,
    clerkUserId,
    email,
    isOwner: true,
    seedBaselineSubscription: false,
  });

  return {
    accountId: account!.id,
    profileId: profile!.id,
    email,
  };
}

function buildAnalysis(
  overrides: Partial<SessionAnalysisOutput> = {},
): SessionAnalysisOutput {
  return {
    explanationEffectiveness: null,
    interests: ['volcanoes'],
    strengths: null,
    struggles: null,
    resolvedTopics: null,
    communicationNotes: null,
    engagementLevel: null,
    confidence: 'high',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// getOrCreateLearningProfile — idempotency
// ---------------------------------------------------------------------------

describe('getOrCreateLearningProfile (integration)', () => {
  it('creates a row on first call and returns the same row on subsequent calls', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();

    const first = await getOrCreateLearningProfile(db, own.profileId);
    const second = await getOrCreateLearningProfile(db, own.profileId);
    const third = await getOrCreateLearningProfile(db, own.profileId);

    // Same row id every time — no duplicates.
    expect(first.id).toBe(second.id);
    expect(second.id).toBe(third.id);

    // And the underlying unique index enforces exactly one row.
    const rows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(rows).toHaveLength(1);

    // Defaults match the schema contract.
    expect(rows[0]!.memoryConsentStatus).toBe('pending');
    expect(rows[0]!.memoryCollectionEnabled).toBe(false);
  });

  it('returns undefined from getLearningProfile when no row exists yet', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();

    const fetched = await getLearningProfile(db, own.profileId);
    expect(fetched).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyAnalysis — write path scoped to profileId
// ---------------------------------------------------------------------------

describe('applyAnalysis (integration)', () => {
  it('persists interests when consent is granted and collection enabled', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    const result = await applyAnalysis(
      db,
      own.profileId,
      buildAnalysis({ interests: ['volcanoes', 'space'] }),
      'Earth Science',
    );

    expect(result.fieldsUpdated).toEqual(expect.arrayContaining(['interests']));

    const [row] = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(row).toBeDefined();
    const interests = row!.interests as string[];
    expect(interests).toEqual(expect.arrayContaining(['volcanoes', 'space']));
  });

  it('short-circuits and writes nothing when confidence is low', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    const before = await getLearningProfile(db, own.profileId);
    expect(before).toBeDefined();
    const beforeVersion = before!.version;

    const result = await applyAnalysis(
      db,
      own.profileId,
      buildAnalysis({ confidence: 'low', interests: ['volcanoes'] }),
      'Earth Science',
    );

    expect(result.fieldsUpdated).toEqual([]);

    const after = await getLearningProfile(db, own.profileId);
    expect(after!.version).toBe(beforeVersion);
    expect((after!.interests as string[]).length).toBe(0);
  });

  it('never writes to a sibling profile (profileId scope)', async () => {
    const own = await seedAccountAndProfile(0);
    const sibling = await seedAccountAndProfile(1);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });
    await grantMemoryConsent(
      db,
      sibling.profileId,
      sibling.accountId,
      'granted',
      {
        callerPersonId: sibling.profileId,
      },
    );

    await applyAnalysis(
      db,
      own.profileId,
      buildAnalysis({ interests: ['only-on-own'] }),
      'Earth Science',
    );

    const [siblingRow] = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, sibling.profileId));
    expect(siblingRow).toBeDefined();
    expect(siblingRow!.interests as string[]).not.toContain('only-on-own');
  });
});

// ---------------------------------------------------------------------------
// deleteAllMemory — IDOR break + scoping
// ---------------------------------------------------------------------------

describe('deleteAllMemory (integration)', () => {
  it('deletes the caller’s own learning_profiles row when account matches', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    let rows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(rows).toHaveLength(1);

    await deleteAllMemory(db, own.profileId, own.accountId, {
      callerPersonId: own.profileId,
    });

    rows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(rows).toHaveLength(0);
  });

  it('[IDOR break] rejects deleteAllMemory when accountId does not own profileId', async () => {
    const own = await seedAccountAndProfile(0);
    const sibling = await seedAccountAndProfile(1);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    // Sibling tries to delete own's memory using SIBLING's accountId.
    // [WI-867] v2 error: "Person ... not found for organization" (v1: "account")
    await expect(
      deleteAllMemory(db, own.profileId, sibling.accountId, {
        callerPersonId: own.profileId,
      }),
    ).rejects.toThrow(/not found for organization/);

    // Own's row must still exist.
    const rows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(rows).toHaveLength(1);
  });

  it('leaves sibling profile memory untouched when deleting own', async () => {
    const own = await seedAccountAndProfile(0);
    const sibling = await seedAccountAndProfile(1);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });
    await grantMemoryConsent(
      db,
      sibling.profileId,
      sibling.accountId,
      'granted',
      {
        callerPersonId: sibling.profileId,
      },
    );

    await deleteAllMemory(db, own.profileId, own.accountId, {
      callerPersonId: own.profileId,
    });

    const ownRows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    const siblingRows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, sibling.profileId));
    expect(ownRows).toHaveLength(0);
    expect(siblingRows).toHaveLength(1);
  });

  it('also clears the caller’s memory_facts rows in the same transaction', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    // Seed a memory_fact row directly so we can observe the cascade.
    await db.insert(memoryFacts).values({
      profileId: own.profileId,
      category: 'interest',
      text: 'volcanoes',
      textNormalized: 'volcanoes',
      observedAt: new Date(),
      confidence: 'high',
    });

    let factRows = await db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, own.profileId));
    expect(factRows.length).toBeGreaterThan(0);

    await deleteAllMemory(db, own.profileId, own.accountId, {
      callerPersonId: own.profileId,
    });

    factRows = await db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, own.profileId));
    expect(factRows).toHaveLength(0);
  });

  it('skips ownership check when accountId is undefined (trusted server call)', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    // Server-side call (e.g. from Inngest) — accountId omitted.
    await expect(
      deleteAllMemory(db, own.profileId, undefined),
    ).resolves.not.toThrow();

    const rows = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(rows).toHaveLength(0);
  });
});
