/**
 * recall-nudge-send — integration test (real database)
 *
 * [BUG-900] The unit test (recall-nudge-send.test.ts) used to mock the
 * `drizzle-orm` and `@eduagent/database` modules, so the real
 * parent-chain join (curriculumTopics → curriculumBooks → curricula → subjects)
 * and its `eq(subjects.profileId, profileId)` ownership filter NEVER executed —
 * a scoping bug that leaked Profile B's topic *title* into Profile A's recall
 * nudge would not have been caught. This integration test runs the genuine
 * query against a live Postgres so the wrong-user-delivery guard is exercised.
 *
 * The handler's other branches (liveness, dedup, guardian role) are covered by
 * the unit test; here we focus on the topic-title join scoping.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   - `global.fetch` — the Expo Push API network call. The push body it sends
 *     is the artifact we assert on (it carries the joined topic title). No
 *     internal module is mocked: checkAndLogRateLimitInternal, the topic join,
 *     getPushToken, resolveProfileRole, and formatRecallNudge all run for real.
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

import { recallNudgeSend } from './recall-nudge-send';

// ── Database env bootstrap ───────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
let fetchSpy: jest.SpyInstance;
let pushBodies: Array<{ title: string; body: string; to: string }>;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_rns_send_${RUN_ID}`;
const EXPO_TOKEN = 'ExponentPushToken[rns-send-integration]';
let seedCounter = 0;
const IDENTITY_V2 = () => process.env['IDENTITY_V2_ENABLED'] === 'true';

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
  fadingCount: number;
  topTopicIds: string[];
}): Promise<unknown> {
  const step = buildStep();
  const handler = (recallNudgeSend as unknown as { fn: HandlerFn }).fn;
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
      email: `rns-send-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  if (IDENTITY_V2()) {
    await db
      .insert(organization)
      .values({ id: account!.id, name: `Recall Seed org ${idx}` });
  }

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Recall Test User',
      birthYear: 1990,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  if (IDENTITY_V2()) {
    await db.insert(person).values({
      id: profile!.id,
      displayName: 'Recall Test User',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'ROW',
    });
    await db.insert(membership).values({
      personId: profile!.id,
      organizationId: account!.id,
      roles: ['learner'],
    });
  }

  await db.insert(notificationPreferences).values({
    profileId: profile!.id,
    pushEnabled: true,
    expoPushToken: EXPO_TOKEN,
  });

  return { profileId: profile!.id };
}

/** Seeds a subject → curriculum → book → topic with a distinctive title. */
async function seedTopic(
  profileId: string,
  topicTitle: string,
): Promise<{ topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `RNS-send Subject ${generateUUIDv7()}` })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `RNS-send Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
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
      'DATABASE_URL is not set for recall-nudge-send integration tests',
    );
  }
  db = createDatabase(databaseUrl);
  process.env['DATABASE_URL'] = databaseUrl; // getStepDatabase() reads this
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  pushBodies = [];
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
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
});

afterEach(() => {
  fetchSpy.mockRestore();
});

afterAll(async () => {
  if (IDENTITY_V2()) {
    const testAccounts = await db.query.accounts.findMany({
      where: like(accounts.clerkUserId, `${CLERK_PREFIX}%`),
      columns: { id: true },
    });
    const accountIds = testAccounts.map((a) => a.id);
    if (accountIds.length > 0) {
      const testProfiles = await db.query.profiles.findMany({
        where: like(profiles.displayName, 'Recall Test User'),
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
  }
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('recall-nudge-send integration — topic-title join scoping', () => {
  it('uses the OWN profile topic title and never a sibling profile topic title', async () => {
    const { profileId: profileA } = await seedProfileWithPush();
    const { profileId: profileB } = await seedProfileWithPush();

    const ownTitle = `OWN Topic ${RUN_ID}`;
    const victimTitle = `VICTIM Topic ${RUN_ID}`;
    const { topicId: ownTopic } = await seedTopic(profileA, ownTitle);
    const { topicId: victimTopic } = await seedTopic(profileB, victimTitle);

    // Profile A fires with its OWN topic + Profile B's topic id smuggled into
    // the (operator-controlled) event payload. The WHERE clause must drop the
    // foreign topic because subjects.profileId !== profileA, so the resolved
    // title is the own topic — never the victim's.
    const result = await invokeHandler({
      profileId: profileA,
      fadingCount: 2,
      topTopicIds: [ownTopic, victimTopic],
    });

    expect(result).toMatchObject({ status: 'sent', profileId: profileA });
    expect(pushBodies).toHaveLength(1);
    // formatRecallNudge can place the topic title in either the title or the
    // body depending on fadingCount, so assert on the full rendered push.
    const rendered = `${pushBodies[0]!.title} ${pushBodies[0]!.body}`;
    expect(rendered).toContain(ownTitle);
    // CRITICAL: the sibling profile's topic title must NOT leak into A's nudge.
    expect(rendered).not.toContain(victimTitle);
  });

  it('falls back to the generic fading-topic label when the topic id belongs to another profile', async () => {
    const { profileId: profileA } = await seedProfileWithPush();
    const { profileId: profileB } = await seedProfileWithPush();

    const victimTitle = `VICTIM-ONLY Topic ${RUN_ID}`;
    const { topicId: victimTopic } = await seedTopic(profileB, victimTitle);

    // Profile A fires with ONLY Profile B's topic id. The ownership join returns
    // zero rows → the handler uses the generic 'your fading topic' label and
    // never surfaces the foreign topic title.
    const result = await invokeHandler({
      profileId: profileA,
      fadingCount: 1,
      topTopicIds: [victimTopic],
    });

    expect(result).toMatchObject({ status: 'sent', profileId: profileA });
    expect(pushBodies).toHaveLength(1);
    const rendered = `${pushBodies[0]!.title} ${pushBodies[0]!.body}`;
    expect(rendered).not.toContain(victimTitle);
  });
});
