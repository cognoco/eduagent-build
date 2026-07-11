/**
 * recall-nudge — integration test (real database)
 *
 * recall-nudge.ts is the other cross-profile scan marked @inngest-admin:
 * cross-profile (alongside review-due-scan.ts). It scans ALL profiles for
 * overdue retention_cards whose local time is ~8 AM and fans out per-profile
 * events. Until WI-1461 it had zero integration coverage of its eligibility
 * gates against a real Postgres.
 *
 * [WI-1461] The gate under test: recall-nudge previously gated ONLY on
 * notificationPreferences.pushEnabled, ignoring reviewReminders entirely — a
 * profile that explicitly turned OFF review reminders (but left push on)
 * still got recall-nudge pushes about the same overdue material. The fix
 * adds `reviewReminders = true` to the same notificationPreferences join
 * review-due-scan.ts already uses.
 *
 * recall-nudge's eligibility additionally requires the account's local time
 * to fall in the 07:30–08:30 window, so every test here must seed an
 * `organization.timezone` that puts "now" inside that window. Timezone
 * selection follows the `Etc/GMT` fixed-offset pattern established in
 * weekly-progress-push.integration.test.ts (DST-immune, whole-hour offsets
 * covering every UTC hour). Because Etc/GMT offsets are whole hours, the
 * local minute always equals the UTC minute, so the target *hour* is chosen
 * based on the current UTC minute: minute < 30 -> local hour 8 (in
 * [08:00, 08:30)); minute >= 30 -> local hour 7 (in [07:30, 08:00)). The
 * timezone is resolved immediately before invoking the handler to minimize
 * drift against the SQL NOW() the handler evaluates.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   None — this function makes no external calls. The only mock is `step`
 *   (the Inngest step object), which is replaced with a thin fake that runs
 *   step.run fns inline and captures step.sendEvent calls.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  generateUUIDv7,
  membership,
  notificationPreferences,
  organization,
  person,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { inArray } from 'drizzle-orm';

import { recallNudge } from './recall-nudge';

// ── Database env bootstrap ───────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

const createdAccountIds: string[] = [];
const createdProfileIds: string[] = [];

// ── Timezone-window helper (Etc/GMT fixed-offset; DST-immune) ──────────────
// Note: POSIX sign convention inverts — Etc/GMT+1 == UTC-1.
const TIMEZONE_CANDIDATES = [
  'Etc/GMT+12', // UTC-12
  'Etc/GMT+11',
  'Etc/GMT+10',
  'Etc/GMT+9',
  'Etc/GMT+8',
  'Etc/GMT+7',
  'Etc/GMT+6',
  'Etc/GMT+5',
  'Etc/GMT+4',
  'Etc/GMT+3',
  'Etc/GMT+2',
  'Etc/GMT+1',
  'Etc/GMT', // UTC
  'Etc/GMT-1',
  'Etc/GMT-2',
  'Etc/GMT-3',
  'Etc/GMT-4',
  'Etc/GMT-5',
  'Etc/GMT-6',
  'Etc/GMT-7',
  'Etc/GMT-8',
  'Etc/GMT-9',
  'Etc/GMT-10',
  'Etc/GMT-11',
  'Etc/GMT-12',
  'Etc/GMT-13',
  'Etc/GMT-14', // UTC+14
] as const;

function localHour(timezone: string, now: Date): number {
  return parseInt(
    now.toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }),
    10,
  );
}

function findTimezoneForHour(targetHour: number, now: Date): string {
  const timezone = TIMEZONE_CANDIDATES.find(
    (candidate) => localHour(candidate, now) === targetHour,
  );
  if (!timezone) {
    throw new Error(
      `Could not find timezone matching local hour ${targetHour}`,
    );
  }
  return timezone;
}

/**
 * Returns a timezone that places "now" inside recall-nudge's 07:30–08:30
 * local eligibility window. Whole-hour Etc/GMT offsets preserve the current
 * UTC minute, so: minute < 30 -> hour 8 (lands in [08:00, 08:30));
 * minute >= 30 -> hour 7 (lands in [07:30, 08:00)).
 */
function findTimezoneInRecallWindow(now: Date): string {
  const targetHour = now.getUTCMinutes() < 30 ? 8 : 7;
  return findTimezoneForHour(targetHour, now);
}

// ── Handler extractor ────────────────────────────────────────────────────────

type HandlerFn = (ctx: unknown) => Promise<unknown>;

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

function getHandler(): HandlerFn {
  return (recallNudge as unknown as { fn: HandlerFn }).fn;
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

interface RecallNudgeEvent {
  name: 'app/recall-nudge.send';
  data: {
    profileId: string;
    fadingCount: number;
    topTopicIds: string[];
  };
}

function eventsForProfiles(
  step: ReturnType<typeof buildStep>,
  profileIds: Set<string>,
): RecallNudgeEvent[] {
  const all: RecallNudgeEvent[] = [];
  for (const call of step.sendEvent.mock.calls) {
    const events = call[1] as RecallNudgeEvent[];
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

async function seedAccount(timezone: string): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const [org] = await db
    .insert(organization)
    .values({
      name: `RN Seed org ${RUN_ID}_${idx}`,
      timezone,
    })
    .returning({ id: organization.id });

  createdAccountIds.push(org!.id);
  return { accountId: org!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [p] = await db
    .insert(person)
    .values({
      displayName: 'Recall Nudge Test User',
      birthDate: '1990-01-01',
      residenceJurisdiction: 'ROW',
    })
    .returning({ id: person.id });

  await db.insert(membership).values({
    personId: p!.id,
    organizationId: accountId,
    roles: ['learner'],
  });

  createdProfileIds.push(p!.id);
  return { profileId: p!.id };
}

async function seedNotificationPreferences(
  profileId: string,
  opts: { pushEnabled?: boolean; reviewReminders?: boolean } = {},
): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    pushEnabled: opts.pushEnabled ?? true,
    reviewReminders: opts.reviewReminders ?? true,
    expoPushToken: 'ExponentPushToken[rn-integration]',
  });
}

async function seedCurriculumTopic(
  profileId: string,
): Promise<{ topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `RN Subject ${generateUUIDv7()}` })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `RN Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `RN Topic ${generateUUIDv7()}`,
      description: 'Integration test topic',
      sortOrder: 1,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { topicId: topic!.id };
}

async function seedRetentionCard(
  profileId: string,
  topicId: string,
  opts: { hoursAgo?: number } = {},
): Promise<void> {
  const hoursAgo = opts.hoursAgo ?? 2;
  const nextReviewAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

  await db.insert(retentionCards).values({
    profileId,
    topicId,
    nextReviewAt,
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for recall-nudge integration tests',
    );
  }
  db = createDatabase(databaseUrl);
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  if (createdProfileIds.length > 0) {
    // consent_grant.chargePersonId → person.id RESTRICT: delete grants first.
    await db
      .delete(consentGrant)
      .where(inArray(consentGrant.chargePersonId, createdProfileIds));
    // person cascade: membership, subjects, retention_cards,
    // notification_preferences, notification_log, etc.
    await db.delete(person).where(inArray(person.id, createdProfileIds));
  }
  if (createdAccountIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, createdAccountIds));
  }
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('recall-nudge integration', () => {
  it('[WI-1461] Profile with pushEnabled=true, reviewReminders=false, in the local 8am window is EXCLUDED', async () => {
    const timezone = findTimezoneInRecallWindow(new Date());
    const { accountId } = await seedAccount(timezone);
    const { profileId } = await seedProfile(accountId);
    await seedNotificationPreferences(profileId, {
      pushEnabled: true,
      reviewReminders: false,
    });

    const { topicId } = await seedCurriculumTopic(profileId);
    await seedRetentionCard(profileId, topicId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileId]));

    // [WI-1461] Pre-fix, recall-nudge ignored reviewReminders entirely and
    // would include this profile — this assertion is RED on main.
    expect(events).toHaveLength(0);
  });

  it('[WI-1461] Profile with pushEnabled=true, reviewReminders=true, in the local 8am window is included', async () => {
    const timezone = findTimezoneInRecallWindow(new Date());
    const { accountId } = await seedAccount(timezone);
    const { profileId } = await seedProfile(accountId);
    await seedNotificationPreferences(profileId, {
      pushEnabled: true,
      reviewReminders: true,
    });

    const { topicId } = await seedCurriculumTopic(profileId);
    await seedRetentionCard(profileId, topicId);

    const { step } = await invokeHandler();
    const events = eventsForProfiles(step, new Set([profileId]));

    expect(events).toHaveLength(1);
    expect(events[0]!.data.profileId).toBe(profileId);
  });
});
