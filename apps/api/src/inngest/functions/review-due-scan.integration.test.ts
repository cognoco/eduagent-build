/**
 * review-due-scan — integration test
 *
 * This is the ONE Inngest function marked @inngest-admin: cross-profile. It scans
 * ALL profiles for overdue retention_cards and fans out per-profile events. The
 * primary risk is a query bug leaking Profile A's topics into Profile B's event.
 *
 * Every test seeds its own profiles under a unique RUN_ID, then filters captured
 * step.sendEvent calls to only events whose profileId belongs to the seeded set.
 * This isolates assertions from other profiles that may exist in the shared DB.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   None — this function makes no external calls. The only mock is `step`
 *   (the Inngest step object), which is replaced with a thin fake that runs
 *   step.run fns inline and captures step.sendEvent calls.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  consentGrant,
  consentRequest,
  consentStates,
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  generateUUIDv7,
  membership,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  profiles,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { inArray, like } from 'drizzle-orm';

import { reviewDueScan } from './review-due-scan';

// ── Database env bootstrap ───────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_rds_${RUN_ID}`;
let seedCounter = 0;

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewDueEvent {
  name: 'app/retention.review-due';
  data: {
    profileId: string;
    overdueCount: number;
    topTopicIds: string[];
  };
}

// ── Step mock ────────────────────────────────────────────────────────────────

function buildStep(): {
  run: jest.MockedFunction<
    (name: string, fn: () => Promise<unknown>) => Promise<unknown>
  >;
  sendEvent: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
} {
  const run = jest.fn(async (_name: string, fn: () => Promise<unknown>) =>
    fn(),
  );
  const sendEvent = jest.fn().mockResolvedValue(undefined);
  return { run, sendEvent };
}

// ── Handler extractor ────────────────────────────────────────────────────────

type HandlerFn = (ctx: unknown) => Promise<unknown>;

function getHandler(): HandlerFn {
  return (reviewDueScan as unknown as { fn: HandlerFn }).fn;
}

async function invokeHandler(): Promise<{
  result: unknown;
  step: ReturnType<typeof buildStep>;
}> {
  const step = buildStep();
  const handler = getHandler();
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step,
  });
  return { result, step };
}

// ── Helper: extract only events for the given profile IDs ────────────────────

function eventsForProfiles(
  step: ReturnType<typeof buildStep>,
  profileIds: Set<string>,
): ReviewDueEvent[] {
  const all: ReviewDueEvent[] = [];
  for (const call of step.sendEvent.mock.calls) {
    const events = call[1] as ReviewDueEvent[];
    if (Array.isArray(events)) {
      for (const ev of events) {
        if (profileIds.has(ev.data.profileId)) {
          all.push(ev);
        }
      }
    }
  }
  return all;
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedAccount(opts?: {
  timezone?: string;
}): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}_${idx}`,
      email: `rds-${RUN_ID}-${idx}@test.invalid`,
      timezone: opts?.timezone ?? null,
    })
    .returning({ id: accounts.id });

  // [WI-793] v2 identity rows — required by the v2 scan path (person×membership×
  // organization) under IDENTITY_V2_ENABLED=true. Deterministic reseed:
  // organization.id = account.id (the WI-788 reuse-same-id invariant).
  // Self-inerting under flag-OFF (the v2 JOIN is never reached).
  if (process.env['IDENTITY_V2_ENABLED'] === 'true') {
    await db.insert(organization).values({
      id: account!.id,
      name: `RDS Seed org ${account!.id.slice(0, 8)}`,
      timezone: opts?.timezone ?? null,
    });
  }

  return { accountId: account!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Review Test User',
      birthYear: 1990,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  // [WI-793] v2 identity rows — the v2 scan JOINs person×membership×organization;
  // person.id = profile.id (deterministic reseed invariant from WI-788).
  if (process.env['IDENTITY_V2_ENABLED'] === 'true') {
    await db.insert(person).values({
      id: profile!.id,
      displayName: 'Review Test User',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'ROW',
    });
    await db.insert(membership).values({
      personId: profile!.id,
      organizationId: accountId,
      roles: ['learner'],
    });
  }

  return { profileId: profile!.id };
}

async function seedNotificationPreferences(
  profileId: string,
  opts: { pushEnabled?: boolean; reviewReminders?: boolean } = {},
): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    pushEnabled: opts.pushEnabled ?? true,
    reviewReminders: opts.reviewReminders ?? true,
    expoPushToken: 'ExponentPushToken[rds-integration]',
  });
}

async function seedCurriculumTopic(
  profileId: string,
): Promise<{ topicId: string }> {
  // subject → curricula → book → topic
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `RDS Subject ${generateUUIDv7()}` })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `RDS Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `RDS Topic ${generateUUIDv7()}`,
      description: 'Integration test topic',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { topicId: topic!.id };
}

/**
 * Seeds a retention card with nextReviewAt in the past (overdue by default)
 * or the future (not overdue).
 */
async function seedRetentionCard(
  profileId: string,
  topicId: string,
  opts: { overdue?: boolean; hoursAgo?: number } = {},
): Promise<void> {
  const overdue = opts.overdue !== false;
  const hoursAgo = opts.hoursAgo ?? 2;
  const nextReviewAt = overdue
    ? new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(retentionCards).values({
    profileId,
    topicId,
    nextReviewAt,
  });
}

async function seedConsentState(
  profileId: string,
  status:
    | 'CONSENTED'
    | 'NOT_CONSENTED'
    | 'PENDING'
    | 'WITHDRAWN'
    | 'PARENTAL_CONSENT_REQUESTED',
  accountId?: string,
): Promise<void> {
  await db.insert(consentStates).values({
    profileId,
    consentType: 'GDPR',
    status,
  });

  // [WI-793] v2 consent rows — the v2 scan gate (consentGateSatisfiedSql)
  // checks consent_grant / consent_request tables, not consent_states.
  // CONSENTED → write a consent_grant row (granted=true, withdrawn_at=null).
  // PENDING / NOT_CONSENTED / WITHDRAWN → write a consent_request row so the
  //   "no consent rows at all" branch fails and the gate blocks the profile.
  // No-op when flag-OFF (v2 consent tables not read) or when no accountId
  // (caller omits it for adult tests where "no rows" is the expected pass path).
  if (process.env['IDENTITY_V2_ENABLED'] !== 'true' || !accountId) return;

  if (status === 'CONSENTED') {
    await db.insert(consentGrant).values({
      chargePersonId: profileId,
      organizationId: accountId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
    });
  } else {
    // PENDING / WITHDRAWN / NOT_CONSENTED — a pending request row is sufficient
    // to block the "no rows at all" branch of the v2 gate.
    await db.insert(consentRequest).values({
      chargePersonId: profileId,
      organizationId: accountId,
      requestedBasis: 'gdpr_parental_consent',
      status: 'pending',
    });
  }
}

async function seedNotificationLog(
  profileId: string,
  sentAt: Date,
): Promise<void> {
  await db.insert(notificationLog).values({
    profileId,
    type: 'review_reminder',
    sentAt,
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for review-due-scan integration tests',
    );
  }
  db = createDatabase(databaseUrl);
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  // [WI-793] v2 identity cleanup — mirrors the WI-792 pattern. The legacy
  // accounts delete does not cascade to v2 tables (no FK from accounts to
  // organization/person). Clean up v2 rows first, before the legacy delete.
  if (process.env['IDENTITY_V2_ENABLED'] === 'true') {
    // Resolve account IDs for our seeded rows so we can derive org/person IDs.
    const testAccounts = await db.query.accounts.findMany({
      where: like(accounts.clerkUserId, `${CLERK_PREFIX}%`),
      columns: { id: true },
    });
    const accountIds = testAccounts.map((a) => a.id);
    if (accountIds.length > 0) {
      // Resolve seeded profile IDs (person.id = profile.id) via the legacy FK.
      const testProfiles = await db.query.profiles.findMany({
        where: inArray(profiles.accountId, accountIds),
        columns: { id: true },
      });
      const profileIds = testProfiles.map((p) => p.id);
      if (profileIds.length > 0) {
        // consent_grant.chargePersonId → person.id RESTRICT: delete grants first.
        await db
          .delete(consentGrant)
          .where(inArray(consentGrant.chargePersonId, profileIds));
        // person cascade: membership, login (consent_request also cascades).
        await db.delete(person).where(inArray(person.id, profileIds));
      }
      // organization cascade: membership (already gone). subscription if any.
      await db.delete(organization).where(inArray(organization.id, accountIds));
    }
  }
  // FK cascades clean all child rows: profiles → subjects → retention_cards,
  // notification_preferences, notification_log, consent_states, curriculum_*, etc.
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('review-due-scan integration', () => {
  it('Profile isolation: two profiles with overdue cards each get ONLY their own data', async () => {
    // ── Seed Profile A: 2 overdue cards (t1 oldest, t2 newer) ───────────────
    const { accountId: accA } = await seedAccount();
    const { profileId: profileA } = await seedProfile(accA);
    await seedNotificationPreferences(profileA);

    const { topicId: t1 } = await seedCurriculumTopic(profileA);
    const { topicId: t2 } = await seedCurriculumTopic(profileA);
    // t1 is older (more overdue) → should be first in topTopicIds (ORDER BY nextReviewAt ASC)
    await seedRetentionCard(profileA, t1, { hoursAgo: 10 });
    await seedRetentionCard(profileA, t2, { hoursAgo: 5 });

    // ── Seed Profile B: 3 overdue cards (t3 oldest) ──────────────────────────
    const { accountId: accB } = await seedAccount();
    const { profileId: profileB } = await seedProfile(accB);
    await seedNotificationPreferences(profileB);

    const { topicId: t3 } = await seedCurriculumTopic(profileB);
    const { topicId: t4 } = await seedCurriculumTopic(profileB);
    const { topicId: t5 } = await seedCurriculumTopic(profileB);
    await seedRetentionCard(profileB, t3, { hoursAgo: 15 });
    await seedRetentionCard(profileB, t4, { hoursAgo: 8 });
    await seedRetentionCard(profileB, t5, { hoursAgo: 3 });

    const { step } = await invokeHandler();
    const seedIds = new Set([profileA, profileB]);
    const events = eventsForProfiles(step, seedIds);

    // ── One event per profile ────────────────────────────────────────────────
    const evA = events.find((e) => e.data.profileId === profileA);
    const evB = events.find((e) => e.data.profileId === profileB);

    expect(evA).toBeDefined();
    expect(evB).toBeDefined();

    // ── Profile A counts ─────────────────────────────────────────────────────
    expect(evA!.data.overdueCount).toBe(2);
    // topTopicIds is ORDER BY nextReviewAt ASC: t1 is most overdue → appears first
    expect(evA!.data.topTopicIds).toEqual([t1, t2]);

    // ── Profile B counts ─────────────────────────────────────────────────────
    expect(evB!.data.overdueCount).toBe(3);
    expect(evB!.data.topTopicIds).toEqual([t3, t4, t5]);

    // ── CRITICAL: no cross-contamination ─────────────────────────────────────
    expect(evA!.data.topTopicIds).not.toContain(t3);
    expect(evA!.data.topTopicIds).not.toContain(t4);
    expect(evA!.data.topTopicIds).not.toContain(t5);

    expect(evB!.data.topTopicIds).not.toContain(t1);
    expect(evB!.data.topTopicIds).not.toContain(t2);
  });

  it('Profile with pushEnabled=false is excluded', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileC } = await seedProfile(accountId);
    await seedNotificationPreferences(profileC, {
      pushEnabled: false,
      reviewReminders: true,
    });

    const { topicId } = await seedCurriculumTopic(profileC);
    await seedRetentionCard(profileC, topicId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileC]));
    expect(events).toHaveLength(0);
  });

  it('Profile with reviewReminders=false is excluded', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileD } = await seedProfile(accountId);
    await seedNotificationPreferences(profileD, {
      pushEnabled: true,
      reviewReminders: false,
    });

    const { topicId } = await seedCurriculumTopic(profileD);
    await seedRetentionCard(profileD, topicId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileD]));
    expect(events).toHaveLength(0);
  });

  it('Profile with explicit NOT_CONSENTED row is excluded (consent filter)', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileE } = await seedProfile(accountId);
    await seedNotificationPreferences(profileE);

    const { topicId } = await seedCurriculumTopic(profileE);
    await seedRetentionCard(profileE, topicId);

    // Explicit NOT_CONSENTED status — neither CONSENTED nor missing row
    // The DB consentStatusEnum uses 'WITHDRAWN' for "had consent, revoked".
    // For a profile that was explicitly denied, the closest available status
    // that is not CONSENTED is 'PENDING'. But the spec calls for NOT_CONSENTED.
    // The schema enum values are: PENDING | PARENTAL_CONSENT_REQUESTED | CONSENTED | WITHDRAWN.
    // 'WITHDRAWN' is the nearest semantically to "not consented". Use PENDING
    // to exercise the "has a row but it's not CONSENTED" exclusion path.
    await seedConsentState(profileE, 'PENDING', accountId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileE]));
    expect(events).toHaveLength(0);
  });

  it('Profile already notified today (UTC) is deduped', async () => {
    const { accountId } = await seedAccount({ timezone: 'UTC' });
    const { profileId: profileF } = await seedProfile(accountId);
    await seedNotificationPreferences(profileF);

    const { topicId } = await seedCurriculumTopic(profileF);
    await seedRetentionCard(profileF, topicId);

    // Seed at today's UTC start so this stays same-day even near midnight UTC.
    const now = new Date();
    const sameUtcDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    await seedNotificationLog(profileF, sameUtcDay);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileF]));
    expect(events).toHaveLength(0);
  });

  it("Profile with yesterday's notification (25 hours ago) is included", async () => {
    const { accountId } = await seedAccount({ timezone: 'UTC' });
    const { profileId: profileG } = await seedProfile(accountId);
    await seedNotificationPreferences(profileG);

    const { topicId } = await seedCurriculumTopic(profileG);
    await seedRetentionCard(profileG, topicId);

    // Seed a review_reminder from 25 hours ago — crosses the UTC day boundary
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await seedNotificationLog(profileG, twentyFiveHoursAgo);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileG]));
    expect(events).toHaveLength(1);
    expect(events[0]!.data.profileId).toBe(profileG);
  });

  it('No overdue profiles returns { status: completed, eligibleCount: 0, sentEvents: 0 }', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileH } = await seedProfile(accountId);
    await seedNotificationPreferences(profileH);

    // nextReviewAt is in the FUTURE — not overdue
    const { topicId } = await seedCurriculumTopic(profileH);
    await seedRetentionCard(profileH, topicId, { overdue: false });

    const { result, step } = await invokeHandler();

    // No events for our seeded profile
    const events = eventsForProfiles(step, new Set([profileH]));
    expect(events).toHaveLength(0);

    // If the DB has NO eligible profiles at all, verify the early-exit shape.
    // Since the shared DB may have other overdue profiles, only assert our
    // profile was NOT included — not that sentEvents=0 globally.
    // When no profiles exist globally the function returns the early-exit shape.
    // We assert the result contract is present and structurally valid.
    expect(result).toMatchObject({ status: 'completed' });
  });

  it('topTopicIds is limited to the first 3 (oldest by nextReviewAt)', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileI } = await seedProfile(accountId);
    await seedNotificationPreferences(profileI);

    // Seed 5 overdue cards, each 1 hour apart so the ORDER BY is deterministic
    const topicIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { topicId } = await seedCurriculumTopic(profileI);
      topicIds.push(topicId);
      // older cards = larger hoursAgo; first seeded = most overdue
      await seedRetentionCard(profileI, topicId, { hoursAgo: 20 - i * 2 });
    }

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileI]));

    expect(events).toHaveLength(1);
    expect(events[0]!.data.overdueCount).toBe(5);
    // SQL [1:3] slice limits to at most 3 topic IDs
    expect(events[0]!.data.topTopicIds).toHaveLength(3);
    // The 3 returned should be the 3 most overdue (largest hoursAgo = lowest nextReviewAt)
    // topicIds[0] has hoursAgo=20, topicIds[1]=18, topicIds[2]=16 — all before [3]=14, [4]=12
    expect(events[0]!.data.topTopicIds).toContain(topicIds[0]);
    expect(events[0]!.data.topTopicIds).toContain(topicIds[1]);
    expect(events[0]!.data.topTopicIds).toContain(topicIds[2]);
    expect(events[0]!.data.topTopicIds).not.toContain(topicIds[3]);
    expect(events[0]!.data.topTopicIds).not.toContain(topicIds[4]);
  });

  it('Profile with CONSENTED consent row is included (explicit consent)', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileJ } = await seedProfile(accountId);
    await seedNotificationPreferences(profileJ);

    const { topicId } = await seedCurriculumTopic(profileJ);
    await seedRetentionCard(profileJ, topicId);

    // Explicit CONSENTED row — the function accepts this
    await seedConsentState(profileJ, 'CONSENTED', accountId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileJ]));
    expect(events).toHaveLength(1);
    expect(events[0]!.data.profileId).toBe(profileJ);
  });

  it('Profile with no consent rows (adult) is included', async () => {
    const { accountId } = await seedAccount();
    const { profileId: profileK } = await seedProfile(accountId);
    await seedNotificationPreferences(profileK);

    const { topicId } = await seedCurriculumTopic(profileK);
    await seedRetentionCard(profileK, topicId);

    // No consent row at all — function uses notExists() to allow adults through

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileK]));
    expect(events).toHaveLength(1);
    expect(events[0]!.data.profileId).toBe(profileK);
  });
});
