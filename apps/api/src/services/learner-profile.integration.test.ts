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
import { eq, inArray, sql } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  learningProfiles,
  login,
  membership,
  memoryFacts,
  type Database,
} from '@eduagent/database';
import {
  ensureV2IdentityForLegacyProfileTest,
  deleteV2IdentitiesForTest,
} from '../test-utils/legacy-identity-anchors';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import type { SessionAnalysisOutput } from '@eduagent/schemas';

import {
  applyAnalysis,
  buildHumanReadableMemoryExport,
  buildMemoryBlock,
  deleteAllMemory,
  getLearningProfile,
  getOrCreateLearningProfile,
  grantMemoryConsent,
  toggleMemoryCollection,
  toggleMemoryInjection,
  type MemoryBlockProfile,
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
  // Discover ids via the v2 `login` table (by email), which always exists —
  // unlike legacy `accounts`, which may already be dropped.
  const loginRows = await db.query.login.findMany({
    where: inArray(login.email, EMAILS),
    columns: { personId: true },
  });
  const profileIds = loginRows.map((r) => r.personId);
  let accountIds: string[] = [];
  if (profileIds.length > 0) {
    const membershipRows = await db.query.membership.findMany({
      where: inArray(membership.personId, profileIds),
      columns: { organizationId: true },
    });
    accountIds = [...new Set(membershipRows.map((r) => r.organizationId))];
  }
  await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
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
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: `Learner ${emailIndex}`,
    birthYear: 2010,
    clerkUserId,
    email,
    isOwner: true,
    seedBaselineSubscription: false,
  });

  return {
    accountId,
    profileId,
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

function rowsFromExecute<T>(raw: unknown): T[] {
  return Array.isArray(raw)
    ? (raw as T[])
    : ((raw as { rows?: T[] }).rows ?? []);
}

async function waitForTaggedLock(
  db: Database,
  applicationName: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const raw = (await db.execute(sql`
      SELECT wait_event_type
      FROM pg_stat_activity
      WHERE application_name = ${applicationName}
    `)) as unknown;
    const rows = rowsFromExecute<{ wait_event_type: string | null }>(raw);
    if (rows.some((row) => row.wait_event_type === 'Lock')) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for tagged DB lock: ${applicationName}`);
}

async function runTaggedTransaction(
  db: Database,
  applicationName: string,
  operation: (tx: Database) => Promise<void>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('application_name', ${applicationName}, true)`,
    );
    await operation(tx as unknown as Database);
  });
}

interface MemoryToggleState {
  memoryCollectionEnabled: boolean;
  memoryInjectionEnabled: boolean;
  memoryEnabled: boolean;
}

type MemoryToggleOperation =
  | { channel: 'collection'; enabled: boolean }
  | { channel: 'injection'; enabled: boolean };

async function seedMemoryToggleState(
  own: SeedAccount,
  state: MemoryToggleState,
): Promise<void> {
  const db = createIntegrationDb();
  await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
    callerPersonId: own.profileId,
  });
  await db
    .update(learningProfiles)
    .set(state)
    .where(eq(learningProfiles.profileId, own.profileId));
}

async function runMemoryToggle(
  db: Database,
  own: SeedAccount,
  operation: MemoryToggleOperation,
): Promise<void> {
  if (operation.channel === 'collection') {
    await toggleMemoryCollection(
      db,
      own.profileId,
      own.accountId,
      operation.enabled,
      { callerPersonId: own.profileId },
    );
    return;
  }

  await toggleMemoryInjection(
    db,
    own.profileId,
    own.accountId,
    operation.enabled,
    { callerPersonId: own.profileId },
  );
}

async function runQueuedMemoryToggles(
  own: SeedAccount,
  first: MemoryToggleOperation,
  second: MemoryToggleOperation,
): Promise<MemoryToggleState> {
  const controlDb = createIntegrationDb();
  const firstDb = createIntegrationDb();
  const secondDb = createIntegrationDb();
  const observerDb = createIntegrationDb();
  const lockTag = own.profileId.slice(-12);
  const firstTag = `wi2012-first-${first.channel}-${lockTag}`;
  const secondTag = `wi2012-second-${second.channel}-${lockTag}`;

  let signalControlReady!: () => void;
  const controlReady = new Promise<void>((resolve) => {
    signalControlReady = resolve;
  });
  let releaseControl!: () => void;
  const controlRelease = new Promise<void>((resolve) => {
    releaseControl = resolve;
  });
  const controlPromise = controlDb.transaction(async (tx) => {
    const [locked] = await tx
      .select({ profileId: learningProfiles.profileId })
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId))
      .for('update')
      .limit(1);
    if (!locked) throw new Error('Seeded learning profile was not found');
    signalControlReady();
    await controlRelease;
  });
  await controlReady;

  let firstPromise: Promise<void> | undefined;
  let secondPromise: Promise<void> | undefined;
  let barrierFailure: unknown;
  try {
    firstPromise = runTaggedTransaction(firstDb, firstTag, (tx) =>
      runMemoryToggle(tx, own, first),
    );
    await waitForTaggedLock(observerDb, firstTag);

    secondPromise = runTaggedTransaction(secondDb, secondTag, (tx) =>
      runMemoryToggle(tx, own, second),
    );
    await waitForTaggedLock(observerDb, secondTag);
  } catch (error) {
    barrierFailure = error;
  } finally {
    releaseControl();
  }

  const operations = [
    controlPromise,
    ...(firstPromise ? [firstPromise] : []),
    ...(secondPromise ? [secondPromise] : []),
  ];
  const settled = await Promise.allSettled(operations);
  if (barrierFailure) throw barrierFailure;
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected) throw rejected.reason;

  const [committed] = await observerDb
    .select({
      memoryCollectionEnabled: learningProfiles.memoryCollectionEnabled,
      memoryInjectionEnabled: learningProfiles.memoryInjectionEnabled,
      memoryEnabled: learningProfiles.memoryEnabled,
    })
    .from(learningProfiles)
    .where(eq(learningProfiles.profileId, own.profileId));
  if (!committed) throw new Error('Committed learning profile was not found');
  return committed;
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
// Memory-channel toggles — concurrent read/derive/write serialization
// ---------------------------------------------------------------------------

describe('[WI-2012] memory channel toggle concurrency (integration)', () => {
  it('serializes injection=true before collection=false and preserves injection in memoryEnabled', async () => {
    const own = await seedAccountAndProfile(0);
    await seedMemoryToggleState(own, {
      memoryCollectionEnabled: true,
      memoryInjectionEnabled: false,
      memoryEnabled: true,
    });
    const committed = await runQueuedMemoryToggles(
      own,
      { channel: 'injection', enabled: true },
      { channel: 'collection', enabled: false },
    );

    expect(committed).toEqual({
      memoryCollectionEnabled: false,
      memoryInjectionEnabled: true,
      memoryEnabled: true,
    });
    expect(committed.memoryEnabled).toBe(
      committed.memoryCollectionEnabled || committed.memoryInjectionEnabled,
    );
  });

  it('serializes collection=true before injection=false and preserves collection in memoryEnabled', async () => {
    const own = await seedAccountAndProfile(0);
    await seedMemoryToggleState(own, {
      memoryCollectionEnabled: false,
      memoryInjectionEnabled: true,
      memoryEnabled: true,
    });
    const committed = await runQueuedMemoryToggles(
      own,
      { channel: 'collection', enabled: true },
      { channel: 'injection', enabled: false },
    );

    expect(committed).toEqual({
      memoryCollectionEnabled: true,
      memoryInjectionEnabled: false,
      memoryEnabled: true,
    });
    expect(committed.memoryEnabled).toBe(
      committed.memoryCollectionEnabled || committed.memoryInjectionEnabled,
    );
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

  it('[WI-1195] scrubs clinical characterisations before profile persistence, export, and memory reinjection', async () => {
    const own = await seedAccountAndProfile(0);
    const db = createIntegrationDb();
    await grantMemoryConsent(db, own.profileId, own.accountId, 'granted', {
      callerPersonId: own.profileId,
    });

    const clinicalCharacterisations = [
      "I'm autistic.",
      'Sam is autistic.',
      'Jordan shows signs of dyslexia.',
      'The learner has ADHD.',
      'She’s dyslexic.',
    ];
    const safeResolvedTopic = 'multiplication';

    // Simulate a legacy vulnerable row so this application also proves the
    // boundary scrubs merged existing state and unsafe recently-resolved data.
    await db
      .update(learningProfiles)
      .set({
        struggles: [
          {
            topic: clinicalCharacterisations[3]!,
            subject: 'Math',
            lastSeen: new Date().toISOString(),
            attempts: 1,
            confidence: 'low',
            source: 'inferred',
          },
          {
            topic: safeResolvedTopic,
            subject: 'Math',
            lastSeen: new Date().toISOString(),
            attempts: 1,
            confidence: 'low',
            source: 'inferred',
          },
        ],
      })
      .where(eq(learningProfiles.profileId, own.profileId));

    const result = await applyAnalysis(
      db,
      own.profileId,
      buildAnalysis({
        interests: ['volcanoes', clinicalCharacterisations[0]!],
        strengths: [
          { topic: 'fractions', subject: 'Math' },
          { topic: clinicalCharacterisations[1]!, subject: 'Math' },
          { topic: 'decimals', subject: clinicalCharacterisations[2]! },
        ],
        struggles: [
          { topic: 'long division', subject: 'Math' },
          { topic: clinicalCharacterisations[3]!, subject: 'Math' },
          { topic: 'spelling', subject: clinicalCharacterisations[4]! },
        ],
        communicationNotes: [
          'Prefers short explanations.',
          clinicalCharacterisations[2]!,
        ],
        resolvedTopics: [
          { topic: clinicalCharacterisations[3]!, subject: 'Math' },
          { topic: safeResolvedTopic, subject: 'Math' },
        ],
      }),
      'Earth Science',
    );

    const [row] = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, own.profileId));
    expect(row).toBeDefined();

    const factRows = await db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.profileId, own.profileId));

    const persisted = JSON.stringify(row);
    const persistedFacts = JSON.stringify(factRows);
    const emittedNotifications = JSON.stringify(result.notifications);
    const exported = buildHumanReadableMemoryExport(row);
    const reinjected = buildMemoryBlock(
      row as unknown as MemoryBlockProfile,
      null,
      null,
      null,
      row!.recentlyResolvedTopics as Array<{
        topic: string;
        subject: string | null;
      }>,
    ).text;

    for (const clinicalCharacterisation of clinicalCharacterisations) {
      expect(persisted).not.toContain(clinicalCharacterisation);
      expect(persistedFacts).not.toContain(clinicalCharacterisation);
      expect(emittedNotifications).not.toContain(clinicalCharacterisation);
      expect(exported).not.toContain(clinicalCharacterisation);
      expect(reinjected).not.toContain(clinicalCharacterisation);
    }

    expect(persisted).toContain('volcanoes');
    expect(result.notifications).toContainEqual({
      type: 'struggle_resolved',
      topic: safeResolvedTopic,
      subject: 'Math',
    });
    expect(exported).toContain('fractions');
    expect(reinjected).toContain('Prefers short explanations.');
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
