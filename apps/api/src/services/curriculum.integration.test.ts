import { eq } from 'drizzle-orm';
import { resolve } from 'path';
import {
  assessments,
  curriculumBooks,
  curricula,
  curriculumTopics,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  needsDeepeningTopics,
  retentionCards,
  sessionSummaries,
  subjects,
  xpLedger,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  claimBookForGeneration,
  claimBookForTopicExpansion,
  addCurriculumTopic,
  deleteTopicIfSafe,
  getBookWithTopics,
  moveTopicToBook,
  persistNarrowTopics,
  persistBookTopics,
  repairIncompleteBookGenerationClaim,
  releaseBookGenerationClaimIfEmpty,
  releaseBookTopicExpansionClaim,
  unskipTopic,
} from './curriculum';
import { regenerateLanguageCurriculum } from './language-curriculum';
import { resolveFilingResult } from './filing';
import {
  ConflictError,
  type FilingLlmOutput,
  type GeneratedBookTopic,
} from '@eduagent/schemas';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

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

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `integration-curriculum-release-${RUN_ID}`;
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function cleanupByPrefix(database: Database): Promise<void> {
  await deleteV2IdentitiesForTest(database, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

async function seedProfiles(database: Database, suffix = generateUUIDv7()) {
  const ownerAccountId = generateUUIDv7();
  const attackerAccountId = generateUUIDv7();
  const ownerProfileId = generateUUIDv7();
  const attackerProfileId = generateUUIDv7();
  const ownerClerkUserId = `${CLERK_PREFIX}-${suffix}-owner`;
  const attackerClerkUserId = `${CLERK_PREFIX}-${suffix}-attacker`;
  const ownerEmail = `${CLERK_PREFIX}-${suffix}-owner@test.invalid`;
  const attackerEmail = `${CLERK_PREFIX}-${suffix}-attacker@test.invalid`;

  seededAccountIds.push(ownerAccountId, attackerAccountId);
  seededProfileIds.push(ownerProfileId, attackerProfileId);

  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId: ownerAccountId,
    profileId: ownerProfileId,
    clerkUserId: ownerClerkUserId,
    email: ownerEmail,
    displayName: 'Claim Owner',
    birthYear: 2011,
    isOwner: true,
  });
  await ensureV2IdentityForLegacyProfileTest(database, {
    accountId: attackerAccountId,
    profileId: attackerProfileId,
    clerkUserId: attackerClerkUserId,
    email: attackerEmail,
    displayName: 'Claim Attacker',
    birthYear: 2011,
    isOwner: true,
  });

  return {
    ownerProfileId,
    attackerProfileId,
  };
}

async function seedClaimedEmptyBook(database: Database, profileId: string) {
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Release Guard ${RUN_ID}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Guarded Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  return { subjectId: subject!.id, bookId: book!.id };
}

async function seedUnclaimedBook(database: Database, profileId: string) {
  const suffix = generateUUIDv7();
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Claim Ordering ${suffix}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Unclaimed Book',
      description: 'A book awaiting topic generation.',
      sortOrder: 0,
      topicsGenerated: false,
    })
    .returning({ id: curriculumBooks.id });

  return { subjectId: subject!.id, bookId: book!.id };
}

function buildGeneratedTopics(): GeneratedBookTopic[] {
  // bookTopicGenerationResultSchema requires: ≥5 topics, ≥2 distinct chapters,
  // strictly-increasing sortOrder, and chapters contiguous in sortOrder. Keep
  // the two chapters grouped (3 + 3) so the contiguity refine passes.
  return [
    { title: 'Generated Topic 1', chapter: 'Getting started', sortOrder: 1 },
    { title: 'Generated Topic 2', chapter: 'Getting started', sortOrder: 2 },
    { title: 'Generated Topic 3', chapter: 'Getting started', sortOrder: 3 },
    { title: 'Generated Topic 4', chapter: 'Core understanding', sortOrder: 4 },
    { title: 'Generated Topic 5', chapter: 'Core understanding', sortOrder: 5 },
    { title: 'Generated Topic 6', chapter: 'Core understanding', sortOrder: 6 },
  ].map((topic) => ({
    ...topic,
    description: `Description for ${topic.title.toLowerCase()}.`,
    estimatedMinutes: 20,
  }));
}

async function seedFiledTopicFixture(
  database: Database,
  profileId: string,
  options: {
    filedFrom?: 'pre_generated' | 'session_filing' | 'freeform_filing';
    topicSessionId?: string;
  } = {},
) {
  const suffix = generateUUIDv7();
  const [subject] = await database
    .insert(subjects)
    .values({
      profileId,
      name: `Safe Delete ${suffix}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await database
    .insert(curricula)
    .values({
      subjectId: subject!.id,
      version: 1,
    })
    .returning({ id: curricula.id });

  const [book] = await database
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Filed Book ${suffix}`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [session] = await database
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 3,
      metadata: { effectiveMode: 'freeform' },
    })
    .returning({ id: learningSessions.id });

  if (options.topicSessionId && options.topicSessionId !== session!.id) {
    await database.insert(learningSessions).values({
      id: options.topicSessionId,
      profileId,
      subjectId: subject!.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 3,
      metadata: { effectiveMode: 'freeform' },
    });
  }

  const [topic] = await database
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `Filed Topic ${suffix}`,
      description: 'Auto-created from a filing result.',
      sortOrder: 0,
      relevance: 'recommended',
      source: 'generated',
      estimatedMinutes: 20,
      filedFrom: options.filedFrom ?? 'freeform_filing',
      sessionId: options.topicSessionId ?? session!.id,
    })
    .returning({ id: curriculumTopics.id });

  return {
    subjectId: subject!.id,
    sessionId: session!.id,
    topicId: topic!.id,
  };
}

async function expectTopicExists(
  database: Database,
  topicId: string,
): Promise<boolean> {
  const row = await database.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  return !!row;
}

describeIfDb('releaseBookGenerationClaimIfEmpty (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  it('[WI-78 review] does not clear another profile generation claim', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    await releaseBookGenerationClaimIfEmpty(
      db,
      subjectId,
      bookId,
      attackerProfileId,
    );

    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerated).toBe(true);
  });
});

describeIfDb('claimBookForGeneration ordering (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  // Regression for the books topicsGenerated-ordering bug: the claim must NOT
  // mark the book as generated. It only stamps the single-flight claim marker;
  // topics_generated stays false until topics are actually persisted. A worker
  // evicted mid-LLM (before persist) therefore never leaves a book stuck
  // "generated" with zero topics.
  it('claims without marking the book generated, so a crash before persist leaves it un-generated', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedUnclaimedBook(db, ownerProfileId);

    const claimed = await claimBookForGeneration(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(claimed).not.toBeNull();

    // The claim stamps the marker but must leave topics_generated false: at this
    // instant zero topics exist, and a Worker eviction here would skip the
    // catch-block release entirely.
    const afterClaim = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(afterClaim!.topicsGenerated).toBe(false);
    expect(afterClaim!.topicsGenerationStartedAt).not.toBeNull();

    // Simulate the crash: generation throws after the claim and before persist,
    // so persistBookTopics never runs. No catch-block release fires either
    // (the eviction case). The book must NOT be in the dead-end
    // topicsGenerated=true, topics=[] state.
    const topicRows = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.bookId, bookId),
    });
    expect(topicRows).toHaveLength(0);
    expect(afterClaim!.topicsGenerated).toBe(false);
  });

  it('serialises concurrent claims so only one wins and double-generation is impossible', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedUnclaimedBook(db, ownerProfileId);

    const [first, second] = await Promise.all([
      claimBookForGeneration(db, ownerProfileId, subjectId, bookId),
      claimBookForGeneration(db, ownerProfileId, subjectId, bookId),
    ]);

    const winners = [first, second].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
  });

  it('flips topics_generated true and clears the claim marker only after topics persist', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedUnclaimedBook(db, ownerProfileId);

    const claimed = await claimBookForGeneration(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(claimed).not.toBeNull();

    await persistBookTopics(
      db,
      ownerProfileId,
      subjectId,
      bookId,
      buildGeneratedTopics(),
      [],
    );

    const afterPersist = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(afterPersist!.topicsGenerated).toBe(true);
    expect(afterPersist!.topicsGenerationStartedAt).toBeNull();

    const topicRows = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.bookId, bookId),
    });
    expect(topicRows.length).toBeGreaterThanOrEqual(5);
  });

  it('reclaims a stale (crashed) claim so the book is never permanently locked', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedUnclaimedBook(db, ownerProfileId);

    // Simulate a crashed claim: marker stamped >15 min ago, topics_generated
    // still false (the worker died before persist and before any release).
    const staleStart = new Date(Date.now() - 20 * 60 * 1000);
    await db
      .update(curriculumBooks)
      .set({ topicsGenerationStartedAt: staleStart })
      .where(eq(curriculumBooks.id, bookId));

    const reclaimed = await claimBookForGeneration(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(reclaimed).not.toBeNull();

    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerationStartedAt!.getTime()).toBeGreaterThan(
      staleStart.getTime(),
    );
  });

  it('refuses to claim while a fresh claim is in flight', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedUnclaimedBook(db, ownerProfileId);

    const first = await claimBookForGeneration(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(first).not.toBeNull();

    // A second request arriving within the stale window must lose the race.
    const second = await claimBookForGeneration(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(second).toBeNull();
  });
});

describeIfDb('claimBookForTopicExpansion (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  it('[WI-1864] serialises concurrent thin-book expansion claims so only one wins', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    const claims = await Promise.all([
      claimBookForTopicExpansion(db, ownerProfileId, subjectId, bookId),
      claimBookForTopicExpansion(db, ownerProfileId, subjectId, bookId),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('[WI-1864] refuses an expansion claim from a profile that does not own the subject', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    await expect(
      claimBookForTopicExpansion(db, attackerProfileId, subjectId, bookId),
    ).resolves.toBeNull();

    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerationStartedAt).toBeNull();
  });

  it('[WI-1864] releases a failed expansion claim so the owning profile can retry immediately', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );

    const firstClaim = await claimBookForTopicExpansion(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(firstClaim).toBeInstanceOf(Date);
    await releaseBookTopicExpansionClaim(
      db,
      ownerProfileId,
      subjectId,
      bookId,
      firstClaim!,
    );
    await expect(
      claimBookForTopicExpansion(db, ownerProfileId, subjectId, bookId),
    ).resolves.toBeInstanceOf(Date);
  });

  it('[WI-1864] does not let a stale owner release a newer expansion claim', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    const firstClaim = await claimBookForTopicExpansion(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(firstClaim).toBeInstanceOf(Date);

    await db
      .update(curriculumBooks)
      .set({
        topicsGenerationStartedAt: new Date(Date.now() - 20 * 60 * 1000),
      })
      .where(eq(curriculumBooks.id, bookId));
    const secondClaim = await claimBookForTopicExpansion(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(secondClaim).toBeInstanceOf(Date);

    await expect(
      releaseBookTopicExpansionClaim(
        db,
        ownerProfileId,
        subjectId,
        bookId,
        firstClaim!,
      ),
    ).resolves.toBe(false);
    const row = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(row!.topicsGenerationStartedAt?.getTime()).toBe(
      secondClaim!.getTime(),
    );

    await expect(
      persistBookTopics(
        db,
        ownerProfileId,
        subjectId,
        bookId,
        buildGeneratedTopics(),
        [],
        {
          appendToExisting: true,
          expansionClaimStartedAt: firstClaim!,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.bookId, bookId),
      }),
    ).resolves.toHaveLength(0);
    await expect(
      db.query.curricula.findMany({
        where: eq(curricula.subjectId, subjectId),
      }),
    ).resolves.toHaveLength(0);
  });

  it('[WI-1864] revalidates a stale empty-book snapshot after filing adds a topic', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    await db
      .update(curriculumBooks)
      .set({ updatedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(curriculumBooks.id, bookId));
    const staleEmptySnapshot = await getBookWithTopics(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(staleEmptySnapshot?.topics).toHaveLength(0);

    const filingResponse = {
      shelf: { id: subjectId },
      book: { id: bookId },
      chapter: { name: 'Filed knowledge' },
      topic: {
        title: 'A filed topic wins the repair race',
        description:
          'A real learner-created topic makes the thin book complete.',
      },
    } satisfies FilingLlmOutput;
    await resolveFilingResult(db, {
      profileId: ownerProfileId,
      filingResponse,
      filedFrom: 'freeform_filing',
    });

    const generateBookTopics = jest.fn(async () => ({
      topics: buildGeneratedTopics(),
      connections: [],
    }));
    await expect(
      repairIncompleteBookGenerationClaim(
        db,
        ownerProfileId,
        subjectId,
        bookId,
        staleEmptySnapshot!,
        undefined,
        { generateBookTopics, captureException: jest.fn() },
      ),
    ).resolves.toEqual({ status: 'not_incomplete' });
    expect(generateBookTopics).not.toHaveBeenCalled();
    const book = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(book?.topicsGenerationStartedAt).toBeNull();
    await expect(
      db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.bookId, bookId),
      }),
    ).resolves.toHaveLength(1);
  });

  it('[WI-1864] ignores active topics from an older curriculum version when rechecking repair eligibility', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    const [oldCurriculum] = await db
      .insert(curricula)
      .values({ subjectId, version: 1 })
      .returning({ id: curricula.id });
    await db.insert(curriculumTopics).values({
      curriculumId: oldCurriculum!.id,
      bookId,
      title: 'Old-version topic',
      description: 'A topic that belongs only to the superseded curriculum.',
      sortOrder: 0,
      relevance: 'core',
      estimatedMinutes: 15,
    });
    await db.insert(curricula).values({ subjectId, version: 2 });
    await db
      .update(curriculumBooks)
      .set({ updatedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(curriculumBooks.id, bookId));
    const latestEmptySnapshot = await getBookWithTopics(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(latestEmptySnapshot?.topics).toHaveLength(0);

    const stopAfterEligibilityCheck = new Error(
      'stop after latest-curriculum eligibility check',
    );
    const generateBookTopics = jest
      .fn()
      .mockRejectedValue(stopAfterEligibilityCheck);
    await expect(
      repairIncompleteBookGenerationClaim(
        db,
        ownerProfileId,
        subjectId,
        bookId,
        latestEmptySnapshot!,
        undefined,
        {
          generateBookTopics,
          captureException: jest.fn(() => {
            throw stopAfterEligibilityCheck;
          }),
        },
      ),
    ).rejects.toBe(stopAfterEligibilityCheck);
    expect(generateBookTopics).toHaveBeenCalledTimes(1);
  });

  it('[WI-1864] blocks filing into a book while its expansion claim is active', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    await expect(
      claimBookForTopicExpansion(db, ownerProfileId, subjectId, bookId),
    ).resolves.toBeInstanceOf(Date);

    const filingResponse = {
      shelf: { id: subjectId },
      book: { id: bookId },
      chapter: { name: 'Concurrent filing' },
      topic: {
        title: 'Must wait for expansion',
        description: 'The expansion marker serialises topic writers.',
      },
    } satisfies FilingLlmOutput;
    await expect(
      resolveFilingResult(db, {
        profileId: ownerProfileId,
        filingResponse,
        filedFrom: 'freeform_filing',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.bookId, bookId),
      }),
    ).resolves.toHaveLength(0);
    await expect(
      db.query.curricula.findMany({
        where: eq(curricula.subjectId, subjectId),
      }),
    ).resolves.toHaveLength(0);
  });

  it('[WI-1864] blocks every active-topic writer while expansion is claimed', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId: targetBookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    const [curriculum] = await db
      .insert(curricula)
      .values({ subjectId, version: 1 })
      .returning({ id: curricula.id });
    const [sourceBook] = await db
      .insert(curriculumBooks)
      .values({
        subjectId,
        title: 'Writer source book',
        sortOrder: 1,
        topicsGenerated: true,
      })
      .returning({ id: curriculumBooks.id });
    const [skippedTargetTopic, activeSourceTopic] = await db
      .insert(curriculumTopics)
      .values([
        {
          curriculumId: curriculum!.id,
          bookId: targetBookId,
          title: 'Skipped target topic',
          description: 'A skipped topic in the expansion target.',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 15,
          skipped: true,
        },
        {
          curriculumId: curriculum!.id,
          bookId: sourceBook!.id,
          title: 'Active source topic',
          description: 'An active topic that must not move during expansion.',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 15,
        },
      ])
      .returning({ id: curriculumTopics.id });
    await expect(
      claimBookForTopicExpansion(db, ownerProfileId, subjectId, targetBookId),
    ).resolves.toBeInstanceOf(Date);

    await expect(
      unskipTopic(db, ownerProfileId, subjectId, skippedTargetTopic!.id),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      moveTopicToBook(
        db,
        ownerProfileId,
        subjectId,
        sourceBook!.id,
        activeSourceTopic!.id,
        targetBookId,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      addCurriculumTopic(db, ownerProfileId, subjectId, {
        mode: 'create',
        title: 'Concurrent manual topic',
        description: 'Must not bypass the active expansion marker.',
        estimatedMinutes: 15,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      persistNarrowTopics(
        db,
        ownerProfileId,
        subjectId,
        [
          {
            title: 'Concurrent narrow topic',
            description: 'Must share the active-topic writer fence.',
            relevance: 'core',
            estimatedMinutes: 15,
          },
        ],
        'Guarded subject',
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      regenerateLanguageCurriculum(db, ownerProfileId, subjectId, 'es', 'A1'),
    ).rejects.toBeInstanceOf(ConflictError);

    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum!.id),
    });
    expect(topics).toHaveLength(2);
    expect(
      topics.find((topic) => topic.id === skippedTargetTopic!.id)?.skipped,
    ).toBe(true);
    expect(
      topics.find((topic) => topic.id === activeSourceTopic!.id)?.bookId,
    ).toBe(sourceBook!.id);
  });

  it('[WI-1864] serialises stale zero-topic repair through the expansion claim', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { subjectId, bookId } = await seedClaimedEmptyBook(
      db,
      ownerProfileId,
    );
    await db
      .update(curriculumBooks)
      .set({ updatedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(curriculumBooks.id, bookId));
    const existing = await getBookWithTopics(
      db,
      ownerProfileId,
      subjectId,
      bookId,
    );
    expect(existing).not.toBeNull();

    let resolveGenerationStarted!: () => void;
    const generationStarted = new Promise<void>((resolve) => {
      resolveGenerationStarted = resolve;
    });
    const stopAfterConcurrencyAssertion = new Error(
      'stop after concurrency assertion',
    );
    let rejectGeneration!: (error: Error) => void;
    const generated = new Promise<never>((_resolve, reject) => {
      rejectGeneration = reject;
    });
    const generateBookTopics = jest.fn(async () => {
      resolveGenerationStarted();
      return generated;
    });
    const deps = {
      generateBookTopics,
      captureException: jest.fn(() => {
        throw stopAfterConcurrencyAssertion;
      }),
    };

    const winner = repairIncompleteBookGenerationClaim(
      db,
      ownerProfileId,
      subjectId,
      bookId,
      existing!,
      undefined,
      deps,
    );
    await generationStarted;
    await expect(
      repairIncompleteBookGenerationClaim(
        db,
        ownerProfileId,
        subjectId,
        bookId,
        existing!,
        undefined,
        deps,
      ),
    ).resolves.toEqual({ status: 'in_progress' });

    rejectGeneration(stopAfterConcurrencyAssertion);
    await expect(winner).rejects.toBe(stopAfterConcurrencyAssertion);
    expect(generateBookTopics).toHaveBeenCalledTimes(1);
  });
});

describeIfDb('deleteTopicIfSafe (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createIntegrationDb();
    await cleanupByPrefix(db);
  });

  afterAll(async () => {
    await cleanupByPrefix(db);
  });

  it('deletes an auto-created freeform filing topic for the owning profile and session when it has no references', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({ deleted: true });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(false);
  });

  it('refuses to delete another profile topic', async () => {
    const { ownerProfileId, attackerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
    );

    const result = await deleteTopicIfSafe(
      db,
      attackerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_found_or_not_owned',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a topic filed for a different session', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const otherSessionId = generateUUIDv7();
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
      { topicSessionId: otherSessionId },
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_session_mismatch',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a hand-created or pre-generated topic', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const { sessionId, topicId } = await seedFiledTopicFixture(
      db,
      ownerProfileId,
      { filedFrom: 'pre_generated' },
    );

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      sessionId,
      topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_not_auto_filed',
    });
    await expect(expectTopicExists(db, topicId)).resolves.toBe(true);
  });

  it('refuses to delete a topic still referenced by a learning session', async () => {
    const { ownerProfileId } = await seedProfiles(db);
    const fixture = await seedFiledTopicFixture(db, ownerProfileId);
    await db.insert(learningSessions).values({
      profileId: ownerProfileId,
      subjectId: fixture.subjectId,
      topicId: fixture.topicId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 1,
    });

    const result = await deleteTopicIfSafe(
      db,
      ownerProfileId,
      fixture.sessionId,
      fixture.topicId,
    );

    expect(result).toEqual({
      deleted: false,
      reason: 'topic_has_session_references',
    });
    await expect(expectTopicExists(db, fixture.topicId)).resolves.toBe(true);
  });

  it.each([
    [
      'retention card',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(retentionCards).values({
          profileId,
          topicId: fixture.topicId,
          xpStatus: 'pending',
        });
      },
    ],
    [
      'assessment',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(assessments).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          sessionId: fixture.sessionId,
          status: 'passed',
          masteryScore: 0.8,
        });
      },
    ],
    [
      'needs-deepening topic',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(needsDeepeningTopics).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          status: 'active',
          source: 'challenge_round',
        });
      },
    ],
    [
      'XP ledger row',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(xpLedger).values({
          profileId,
          subjectId: fixture.subjectId,
          topicId: fixture.topicId,
          amount: 10,
          status: 'pending',
        });
      },
    ],
    [
      'session summary',
      async (
        database: Database,
        fixture: Awaited<ReturnType<typeof seedFiledTopicFixture>>,
        profileId: string,
      ) => {
        await database.insert(sessionSummaries).values({
          profileId,
          sessionId: fixture.sessionId,
          topicId: fixture.topicId,
          status: 'accepted',
          content: 'Learner summary',
        });
      },
    ],
  ])(
    'refuses to delete a topic referenced by a %s',
    async (_label, seedReference) => {
      const { ownerProfileId } = await seedProfiles(db);
      const fixture = await seedFiledTopicFixture(db, ownerProfileId);
      await seedReference(db, fixture, ownerProfileId);

      const result = await deleteTopicIfSafe(
        db,
        ownerProfileId,
        fixture.sessionId,
        fixture.topicId,
      );

      expect(result).toEqual({
        deleted: false,
        reason: 'topic_has_progress_references',
      });
      await expect(expectTopicExists(db, fixture.topicId)).resolves.toBe(true);
    },
  );
});
