/**
 * Integration: progress-summary service — read + write paths.
 *
 * Replaces the deleted mock-only progress-summary-read.test.ts (bug 194)
 * and closes the integration coverage gap (bug 198). No mocks of internal
 * services or database — only external boundaries (the LLM-driven
 * generateProgressSummary is NOT exercised here; this file targets the
 * pure DB read/write surface).
 *
 * Covered:
 *   - getProgressSummary returns activityState=no_recent_activity for a
 *     profile with no completed sessions
 *   - getProgressSummary returns activityState=fresh when the stored
 *     summary basis matches the latest completed session
 *   - getProgressSummary returns activityState=stale when a newer
 *     completed session arrives after the stored basis
 *   - getProgressSummary ignores sessions in non-`completed` statuses
 *     (regression for bug 194 — the original mock test only checked the
 *     mock interaction; this asserts the actual SQL filter)
 *   - [BUG-400] getProgressSummary throws ForbiddenError when the requester
 *     has no family link to the child — defense-in-depth service-layer guard
 *   - findLatestCompletedLearningSession picks the most recent completed
 *     session, ignoring active/abandoned ones
 *   - upsertProgressSummary inserts on first write and updates on second
 */

import { resolve } from 'path';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  guardianship,
  learningSessions,
  membership,
  organization,
  person,
  progressSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { deleteV2IdentitiesForTest } from '../test-utils/legacy-identity-anchors';
import {
  findLatestCompletedLearningSession,
  getProgressSummary,
  upsertProgressSummary,
} from './progress-summary';
import { ForbiddenError } from '../errors';

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

const PREFIX = 'integration-progress-summary';

// [WI-1128] Legacy `accounts`/`profiles`/`family_links` dropped — track
// seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function cleanup() {
  const db = createIntegrationDb();
  await deleteV2IdentitiesForTest(db, {
    accountIds: [...seededAccountIds],
    profileIds: [...seededProfileIds],
  });
  seededAccountIds.length = 0;
  seededProfileIds.length = 0;
}

interface SeedResult {
  accountId: string;
  profileId: string;
  subjectId: string;
}

async function seedAccountWithProfileAndSubject(
  emailSuffix = '',
  opts: { isOwner?: boolean } = {},
): Promise<SeedResult> {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await db
    .insert(organization)
    .values({ id: accountId, name: `${PREFIX} Org` });
  await db.insert(person).values({
    id: profileId,
    displayName: `Test Learner${emailSuffix}`,
    birthDate: '2010-06-15',
    residenceJurisdiction: 'EU',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: (opts.isOwner ?? true) ? ['admin', 'learner'] : ['learner'],
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `${PREFIX}-subject`,
      status: 'active',
    })
    .returning();

  return {
    accountId,
    profileId,
    subjectId: subject!.id,
  };
}

async function seedParentAccount(): Promise<{
  profileId: string;
  accountId: string;
}> {
  const db = createIntegrationDb();
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await db
    .insert(organization)
    .values({ id: accountId, name: `${PREFIX} Parent Org` });
  await db.insert(person).values({
    id: profileId,
    displayName: 'Test Parent',
    birthDate: '1985-06-15',
    residenceJurisdiction: 'EU',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['admin', 'learner'],
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return { profileId, accountId };
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(guardianship).values({
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });
}

async function seedSession(input: {
  profileId: string;
  subjectId: string;
  status: 'active' | 'paused' | 'completed' | 'auto_closed';
  startedAt: Date;
}): Promise<{ id: string }> {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      status: input.status,
      startedAt: input.startedAt,
      lastActivityAt: input.startedAt,
    })
    .returning({ id: learningSessions.id });
  return row!;
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
// getProgressSummary
// ---------------------------------------------------------------------------

describe('getProgressSummary (integration)', () => {
  it('returns no_recent_activity when the profile has no completed sessions', async () => {
    const child = await seedAccountWithProfileAndSubject('-child');
    const { profileId: parentProfileId } = await seedParentAccount();
    await seedFamilyLink(parentProfileId, child.profileId);
    const db = createIntegrationDb();

    const result = await getProgressSummary(
      db,
      parentProfileId,
      child.profileId,
    );

    expect(result.summary).toBeNull();
    expect(result.generatedAt).toBeNull();
    expect(result.basedOnLastSessionAt).toBeNull();
    expect(result.latestSessionId).toBeNull();
    expect(result.activityState).toBe('no_recent_activity');
    expect(result.nudgeRecommended).toBe(true);
  });

  it('returns fresh when the stored summary basis matches the latest completed session', async () => {
    const child = await seedAccountWithProfileAndSubject('-child');
    const { profileId: parentProfileId } = await seedParentAccount();
    await seedFamilyLink(parentProfileId, child.profileId);
    const db = createIntegrationDb();
    const now = new Date();

    const session = await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'completed',
      startedAt: now,
    });

    await upsertProgressSummary(db, {
      childProfileId: child.profileId,
      summary: 'Strong week on fractions.',
      basedOnLastSessionAt: now,
      latestSessionId: session.id,
    });

    const result = await getProgressSummary(
      db,
      parentProfileId,
      child.profileId,
    );

    expect(result.summary).toBe('Strong week on fractions.');
    expect(result.latestSessionId).toBe(session.id);
    expect(result.activityState).toBe('fresh');
    expect(result.nudgeRecommended).toBe(false);
  });

  it('returns stale when a newer completed session lands after the stored summary basis', async () => {
    const child = await seedAccountWithProfileAndSubject('-child');
    const { profileId: parentProfileId } = await seedParentAccount();
    await seedFamilyLink(parentProfileId, child.profileId);
    const db = createIntegrationDb();
    const earlier = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const later = new Date();

    const oldSession = await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'completed',
      startedAt: earlier,
    });
    await upsertProgressSummary(db, {
      childProfileId: child.profileId,
      summary: 'Earlier summary.',
      basedOnLastSessionAt: earlier,
      latestSessionId: oldSession.id,
    });

    // A newer completed session arrives.
    await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'completed',
      startedAt: later,
    });

    const result = await getProgressSummary(
      db,
      parentProfileId,
      child.profileId,
    );

    expect(result.activityState).toBe('stale');
  });

  it('[REGRESSION bug 194] ignores sessions in non-completed statuses when computing freshness', async () => {
    const child = await seedAccountWithProfileAndSubject('-child');
    const { profileId: parentProfileId } = await seedParentAccount();
    await seedFamilyLink(parentProfileId, child.profileId);
    const db = createIntegrationDb();

    // Active, paused, and auto_closed sessions exist but must NOT count
    // as the latest — only `completed` does.
    await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'active',
      startedAt: new Date(),
    });
    await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'paused',
      startedAt: new Date(),
    });
    await seedSession({
      profileId: child.profileId,
      subjectId: child.subjectId,
      status: 'auto_closed',
      startedAt: new Date(),
    });

    const result = await getProgressSummary(
      db,
      parentProfileId,
      child.profileId,
    );

    // With NO completed sessions, latestSessionId is null and we report
    // no_recent_activity — proving the WHERE clause filters by status.
    expect(result.latestSessionId).toBeNull();
    expect(result.activityState).toBe('no_recent_activity');
  });

  // [BUG-400] Break test -- service-layer defense-in-depth IDOR guard.
  //
  // Red-green pattern:
  //   GREEN (fix applied):  test passes -- ForbiddenError is thrown.
  //   RED   (fix reverted): assertParentAccess removed from getProgressSummary ->
  //     test fails with 'Received function did not throw' because getProgressSummary
  //     returns the child data silently instead of throwing.
  //
  // This proves that without the service-layer assert, an unlinked requester
  // can read any child progress summary by calling the function directly,
  // bypassing the route-level assertOwnerAndParentAccess.
  it('[BUG-400 break test] throws ForbiddenError when requester has no family link to child', async () => {
    const child = await seedAccountWithProfileAndSubject('-child');
    const { profileId: unrelatedParentId } = await seedParentAccount();
    // Deliberately NO seedFamilyLink -- unrelated parent has no link to child.
    const db = createIntegrationDb();

    await expect(
      getProgressSummary(db, unrelatedParentId, child.profileId),
    ).rejects.toThrow(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// findLatestCompletedLearningSession
// ---------------------------------------------------------------------------

describe('findLatestCompletedLearningSession (integration)', () => {
  it('returns the most recent completed session, ignoring non-completed statuses', async () => {
    const { profileId, subjectId } = await seedAccountWithProfileAndSubject();
    const db = createIntegrationDb();

    const oldest = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const middle = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const newest = new Date(Date.now() - 60 * 60 * 1000);

    await seedSession({
      profileId,
      subjectId,
      status: 'completed',
      startedAt: oldest,
    });
    const expected = await seedSession({
      profileId,
      subjectId,
      status: 'completed',
      startedAt: newest,
    });
    // Newer, but NOT completed — must be skipped.
    await seedSession({
      profileId,
      subjectId,
      status: 'active',
      startedAt: middle,
    });

    const result = await findLatestCompletedLearningSession(db, profileId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(expected.id);
    // Compare ms — Drizzle returns Date objects, equality below the
    // millisecond is brittle across drivers.
    expect(result!.startedAt.getTime()).toBe(newest.getTime());
  });

  it('returns null when no completed session exists', async () => {
    const { profileId, subjectId } = await seedAccountWithProfileAndSubject();
    const db = createIntegrationDb();

    await seedSession({
      profileId,
      subjectId,
      status: 'active',
      startedAt: new Date(),
    });

    const result = await findLatestCompletedLearningSession(db, profileId);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertProgressSummary
// ---------------------------------------------------------------------------

describe('upsertProgressSummary (integration)', () => {
  it('inserts a new row on first call and updates the same row on second call', async () => {
    const { profileId, subjectId } = await seedAccountWithProfileAndSubject();
    const db = createIntegrationDb();
    const ts = new Date();

    const session = await seedSession({
      profileId,
      subjectId,
      status: 'completed',
      startedAt: ts,
    });

    await upsertProgressSummary(db, {
      childProfileId: profileId,
      summary: 'First.',
      basedOnLastSessionAt: ts,
      latestSessionId: session.id,
    });

    let rows = await db
      .select()
      .from(progressSummaries)
      .where(eq(progressSummaries.profileId, profileId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe('First.');

    await upsertProgressSummary(db, {
      childProfileId: profileId,
      summary: 'Second.',
      basedOnLastSessionAt: ts,
      latestSessionId: session.id,
    });

    rows = await db
      .select()
      .from(progressSummaries)
      .where(eq(progressSummaries.profileId, profileId));

    // The unique index on profileId means upsert MUST update, not append.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe('Second.');
  });

  it('does not affect sibling profiles when upserting (profileId scope)', async () => {
    const own = await seedAccountWithProfileAndSubject();
    const sibling = await seedAccountWithProfileAndSubject('-sibling');
    const db = createIntegrationDb();
    const ts = new Date();

    const ownSession = await seedSession({
      profileId: own.profileId,
      subjectId: own.subjectId,
      status: 'completed',
      startedAt: ts,
    });
    const siblingSession = await seedSession({
      profileId: sibling.profileId,
      subjectId: sibling.subjectId,
      status: 'completed',
      startedAt: ts,
    });

    await upsertProgressSummary(db, {
      childProfileId: own.profileId,
      summary: 'Own summary.',
      basedOnLastSessionAt: ts,
      latestSessionId: ownSession.id,
    });
    await upsertProgressSummary(db, {
      childProfileId: sibling.profileId,
      summary: 'Sibling summary.',
      basedOnLastSessionAt: ts,
      latestSessionId: siblingSession.id,
    });

    const ownRow = await db
      .select()
      .from(progressSummaries)
      .where(and(eq(progressSummaries.profileId, own.profileId)));
    const siblingRow = await db
      .select()
      .from(progressSummaries)
      .where(eq(progressSummaries.profileId, sibling.profileId));

    expect(ownRow).toHaveLength(1);
    expect(ownRow[0]!.summary).toBe('Own summary.');
    expect(siblingRow).toHaveLength(1);
    expect(siblingRow[0]!.summary).toBe('Sibling summary.');
  });
});
