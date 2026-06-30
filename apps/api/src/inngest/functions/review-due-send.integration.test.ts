/**
 * review-due-send — integration test (real database)
 *
 * [BUG-900] The unit test (review-due-send.test.ts) used to mock the
 * `drizzle-orm` and `@eduagent/database` modules, so the real parent-chain join
 * (curriculumTopics → curriculumBooks → curricula → subjects) and its
 * `eq(subjects.profileId, profileId)` ownership filter NEVER executed — a
 * scoping bug that leaked Profile B's topic title into Profile A's push would
 * not have been caught. This integration test runs the genuine query against a
 * live Postgres so the wrong-user-delivery guard is exercised.
 *
 * The handler's other branches (liveness, dedup, send) are covered by the unit
 * test; here we focus on the topic-title join scoping.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   - `global.fetch` — the Expo Push API network call. The push body it sends
 *     is the artifact we assert on (it carries the joined subject name). No
 *     internal module is mocked: checkAndLogRateLimitInternal, the topic join,
 *     getPushToken, and formatReviewReminderBody all run for real.
 *   - `step` — the Inngest step object, replaced by a thin runner that executes
 *     step.run fns inline and records step.sendEvent calls.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  generateUUIDv7,
  membership,
  notificationPreferences,
  organization,
  person,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { inArray, like } from 'drizzle-orm';

import { reviewDueSend } from './review-due-send';

// ── Database env bootstrap ───────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
let fetchSpy: { mockRestore: () => void };
let pushBodies: Array<{ title: string; body: string; to: string }>;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_rds_send_${RUN_ID}`;
const EXPO_TOKEN = 'ExponentPushToken[rds-send-integration]';
let seedCounter = 0;

// ── Step runner ──────────────────────────────────────────────────────────────

function buildStep(): {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sendEvent: jest.Mock;
} {
  const run = (_name: string, fn: () => Promise<unknown>) => fn();
  const sendEvent = jest.fn().mockResolvedValue(undefined);
  return { run, sendEvent };
}

type HandlerFn = (ctx: unknown) => Promise<unknown>;

async function invokeHandler(data: {
  profileId: string;
  overdueCount: number;
  topTopicIds: string[];
}): Promise<unknown> {
  const step = buildStep();
  const handler = (reviewDueSend as unknown as { fn: HandlerFn }).fn;
  return handler({
    event: { id: `evt-${generateUUIDv7()}`, data },
    step,
  });
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedProfileWithPush(): Promise<{ profileId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}_${idx}`,
      email: `rds-send-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  // [WI-867] v2 identity rows are unconditional (flag collapsed).
  await db
    .insert(organization)
    .values({ id: account!.id, name: `Send Seed org ${idx}` });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Send Test User',
      birthYear: 1990,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  await db.insert(person).values({
    id: profile!.id,
    displayName: 'Send Test User',
    birthDate: '1990-01-01',
    residenceJurisdiction: 'ROW',
  });
  await db.insert(membership).values({
    personId: profile!.id,
    organizationId: account!.id,
    roles: ['learner'],
  });

  await db.insert(notificationPreferences).values({
    profileId: profile!.id,
    pushEnabled: true,
    reviewReminders: true,
    expoPushToken: EXPO_TOKEN,
  });

  return { profileId: profile!.id };
}

/** Seeds a subject (with a distinctive name) → curriculum → book → topic. */
async function seedTopic(
  profileId: string,
  subjectName: string,
): Promise<{ topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: subjectName })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `RDS-send Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `RDS-send Topic ${generateUUIDv7()}`,
      description: 'Integration test topic',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { topicId: topic!.id };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for review-due-send integration tests',
    );
  }
  db = createDatabase(databaseUrl);
  process.env['DATABASE_URL'] = databaseUrl; // getStepDatabase() reads this
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  pushBodies = [];
  // [WI-867] Mock the Expo Push API boundary via direct assignment rather than
  // jest.spyOn: jest-mock ≥30 requires an own+configurable property which
  // mockRestore() strips across test runs (Node 26 exposes fetch via prototype).
  const savedFetch = globalThis.fetch;
  const mockFetch = jest
    .fn()
    .mockImplementation(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        title: string;
        body: string;
        to: string;
      };
      pushBodies.push(body);
      return new Response(JSON.stringify({ data: { id: 'ticket-int-001' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  Object.defineProperty(globalThis, 'fetch', {
    value: mockFetch,
    writable: true,
    configurable: true,
  });
  fetchSpy = {
    mockRestore: () => {
      Object.defineProperty(globalThis, 'fetch', {
        value: savedFetch,
        writable: true,
        configurable: true,
      });
    },
  };
});

afterEach(() => {
  fetchSpy.mockRestore();
});

afterAll(async () => {
  // [WI-867] v2 identity cleanup is unconditional.
  const testAccounts = await db.query.accounts.findMany({
    where: like(accounts.clerkUserId, `${CLERK_PREFIX}%`),
    columns: { id: true },
  });
  const accountIds = testAccounts.map((a) => a.id);
  if (accountIds.length > 0) {
    const testProfiles = await db.query.profiles.findMany({
      where: like(profiles.displayName, 'Send Test User'),
      columns: { id: true, accountId: true },
    });
    const ids = testProfiles
      .filter((p) => accountIds.includes(p.accountId))
      .map((p) => p.id);
    if (ids.length > 0) {
      await db.delete(person).where(inArray(person.id, ids));
    }
    await db.delete(organization).where(inArray(organization.id, accountIds));
  }
  // FK cascades clean child rows: profiles → subjects → curriculum_*,
  // notification_preferences, notification_log, etc.
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('review-due-send integration — topic-title join scoping', () => {
  it('uses the OWN profile subject name and never a sibling profile topic id', async () => {
    const { profileId: profileA } = await seedProfileWithPush();
    const { profileId: profileB } = await seedProfileWithPush();

    const ownSubject = `OWN Subject ${RUN_ID}`;
    const victimSubject = `VICTIM Subject ${RUN_ID}`;
    const { topicId: ownTopic } = await seedTopic(profileA, ownSubject);
    const { topicId: victimTopic } = await seedTopic(profileB, victimSubject);

    // Profile A fires with its OWN topic + Profile B's topic id smuggled into
    // the (operator-controlled) event payload. The WHERE clause must drop the
    // foreign topic because subjects.profileId !== profileA.
    const result = await invokeHandler({
      profileId: profileA,
      overdueCount: 2,
      topTopicIds: [ownTopic, victimTopic],
    });

    expect(result).toMatchObject({ status: 'sent', profileId: profileA });
    expect(pushBodies).toHaveLength(1);
    const pushBody = pushBodies[0]!.body;
    // The own subject name resolves through the join → appears in the body.
    expect(pushBody).toContain(ownSubject);
    // CRITICAL: the sibling profile's subject must NOT leak into A's push.
    expect(pushBody).not.toContain(victimSubject);
  });

  it('falls back to "your subjects" when ALL topic ids belong to another profile', async () => {
    const { profileId: profileA } = await seedProfileWithPush();
    const { profileId: profileB } = await seedProfileWithPush();

    const victimSubject = `VICTIM-ONLY Subject ${RUN_ID}`;
    const { topicId: victimTopic } = await seedTopic(profileB, victimSubject);

    // Profile A fires with ONLY Profile B's topic id. The join returns zero
    // owned rows, so the handler must fall back to the generic label and never
    // surface the foreign subject name.
    const result = await invokeHandler({
      profileId: profileA,
      overdueCount: 1,
      topTopicIds: [victimTopic],
    });

    expect(result).toMatchObject({ status: 'sent', profileId: profileA });
    expect(pushBodies).toHaveLength(1);
    const pushBody = pushBodies[0]!.body;
    expect(pushBody).not.toContain(victimSubject);
    expect(pushBody).toContain('your subjects');
  });
});
