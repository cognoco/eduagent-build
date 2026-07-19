import { readFileSync } from 'fs';
import { resolve } from 'path';
import { InngestTestEngine } from '@inngest/test';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  guardianship,
  login,
  membership,
  notificationLog,
  notificationPreferences,
  organization,
  person,
  progressSnapshots,
  subjects,
  weeklyReports,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics } from '@eduagent/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
} from './weekly-progress-push';

// ── Fetch interceptor for Expo Push API ──────────────────────────────
// Instead of jest.mock on internal modules, intercept at the HTTP boundary.
// This exercises the full sendPushNotification pipeline (token lookup, daily
// cap check, notification logging) while mocking only the external Expo API.
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const RESEND_API_URL = 'https://api.resend.com/emails';
const pushApiCalls: Array<{
  to: string;
  title: string;
  body: string;
  data: unknown;
}> = [];
const emailApiCalls: Array<{
  to: string[];
  subject: string;
  text: string;
  idempotencyKey?: string;
}> = [];
const originalFetch = globalThis.fetch;
const originalResendApiKey = process.env['RESEND_API_KEY'];
let expoPushResponseStatus = 200;
let expoPushTicketId = 'ticket-integration';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;
const createdAccountIds: string[] = [];
const createdProfileIds: string[] = [];

// Fixed-offset IANA zones — immune to DST shifts. Covers every hour offset
// from UTC-12 to UTC+14, guaranteeing that at any moment of the year every
// local hour 0-23 is represented by at least one candidate. Previous list
// relied on civil zones (Atlantic/Azores etc.) whose DST transitions left
// gaps, producing `Could not find timezone matching local hour N` flakes.
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function weekStartIso(date: Date): string {
  const monday = new Date(date);
  const day = monday.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return isoDate(monday);
}

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

function findTimezoneNotHour(targetHour: number, now: Date, exclude: string) {
  const timezone = TIMEZONE_CANDIDATES.find(
    (candidate) =>
      candidate !== exclude && localHour(candidate, now) !== targetHour,
  );
  if (!timezone) {
    throw new Error(
      `Could not find timezone not matching local hour ${targetHour}`,
    );
  }
  return timezone;
}

function buildSubjectMetrics(
  subjectId: string,
  subjectName: string,
  overrides: Partial<ProgressMetrics['subjects'][number]> = {},
): ProgressMetrics['subjects'][number] {
  return {
    subjectId,
    subjectName,
    pedagogyMode: 'socratic',
    topicsAttempted: overrides.topicsAttempted ?? 0,
    topicsMastered: overrides.topicsMastered ?? 0,
    topicsTotal: overrides.topicsTotal ?? 0,
    topicsExplored: overrides.topicsExplored ?? 0,
    vocabularyTotal: overrides.vocabularyTotal ?? 0,
    vocabularyMastered: overrides.vocabularyMastered ?? 0,
    sessionsCount: overrides.sessionsCount ?? 0,
    activeMinutes: overrides.activeMinutes ?? 0,
    wallClockMinutes: overrides.wallClockMinutes ?? 0,
    lastSessionAt: overrides.lastSessionAt ?? null,
  };
}

function buildProgressMetrics(
  overrides: Partial<ProgressMetrics> = {},
): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
    ...overrides,
  };
}

async function seedProfile(input: {
  displayName: string;
  timezone?: string | null;
  // [WI-1863] Managed charges have no login row; a login makes the person a
  // credentialed charge, which the digest fan-out now suppresses. Child seeds
  // pass credentialed:false so they model the managed-charge state the digest
  // assertions are about; parents keep their login (email/push resolution
  // reads db.query.login.findFirst for the recipient).
  credentialed?: boolean;
}): Promise<{ accountId: string; profileId: string }> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_weekly_push_${RUN_ID}_${idx}`;
  const email = `weekly-push-${RUN_ID}-${idx}@test.invalid`;

  const [org] = await db
    .insert(organization)
    .values({
      name: `WPP Seed org ${idx}`,
      timezone: input.timezone ?? null,
    })
    .returning({ id: organization.id });
  const [p] = await db
    .insert(person)
    .values({
      displayName: input.displayName,
      birthDate: '1985-01-01',
      residenceJurisdiction: 'ROW',
    })
    .returning({ id: person.id });
  if (input.credentialed !== false) {
    const loginId = generateUUIDv7();
    await db.insert(login).values({
      id: loginId,
      personId: p!.id,
      clerkUserId,
      email,
    });
  }
  await db.insert(membership).values({
    personId: p!.id,
    organizationId: org!.id,
    roles: ['admin', 'learner'],
  });

  createdAccountIds.push(org!.id);
  createdProfileIds.push(p!.id);
  return { accountId: org!.id, profileId: p!.id };
}

async function seedWeeklyPushPrefs(profileId: string): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    weeklyProgressPush: true,
    // [WI-1153] Push-only prefs: email defaults to true, and the weekly EMAIL
    // channel is intentionally NOT gated by the 24h push-dedup, so leaving it on
    // makes a push-dedup assertion see status:'completed' (email fired). Pin it
    // off so this helper models a push-only user.
    weeklyProgressEmail: false,
    pushEnabled: true,
    maxDailyPush: 3,
    expoPushToken: 'ExponentPushToken[integration]',
  });
}

async function seedWeeklyEmailPrefs(profileId: string): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    weeklyProgressEmail: true,
    weeklyProgressPush: false,
    pushEnabled: false,
    maxDailyPush: 3,
    expoPushToken: null,
  });
}

async function seedWeeklyPushAndEmailPrefs(profileId: string): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    weeklyProgressEmail: true,
    weeklyProgressPush: true,
    pushEnabled: true,
    maxDailyPush: 3,
    expoPushToken: 'ExponentPushToken[integration]',
  });
}

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(guardianship).values({
    guardianPersonId: parentProfileId,
    chargePersonId: childProfileId,
  });
}

async function seedSnapshot(input: {
  profileId: string;
  snapshotDate: string;
  metrics: ProgressMetrics;
}): Promise<void> {
  await db.insert(progressSnapshots).values({
    profileId: input.profileId,
    snapshotDate: input.snapshotDate,
    metrics: input.metrics,
  });
}

// [WI-793] The digest pipeline runs `filterProgressMetricsToActiveSubjects`,
// which RECOMPUTES every top-level total from the snapshot's per-subject rows,
// keeping only subjects that exist as non-archived `subjects` rows for the
// profile. A snapshot whose `subjects[].subjectId` has no live `subjects` row
// is filtered to all-zero totals → the "quieter week, 0 topics" fallback. Any
// test asserting a real delta must seed a matching live subject and carry the
// delta-bearing metrics at the subject level.
async function seedSubject(input: {
  subjectId: string;
  profileId: string;
  name: string;
}): Promise<void> {
  await db.insert(subjects).values({
    id: input.subjectId,
    profileId: input.profileId,
    name: input.name,
  });
}

async function seedWeeklyDeliveryScenario(): Promise<{
  guardianPersonId: string;
  chargePersonId: string;
}> {
  const { profileId: guardianPersonId } = await seedProfile({
    displayName: 'Delivery Guardian',
    timezone: 'UTC',
  });
  const { profileId: chargePersonId } = await seedProfile({
    displayName: 'Delivery Charge',
    timezone: 'UTC',
    credentialed: false,
  });
  await seedFamilyLink(guardianPersonId, chargePersonId);
  await seedWeeklyPushAndEmailPrefs(guardianPersonId);

  const latestSnapshotDate = isoDate(new Date());
  const previousSnapshotDate = isoDate(
    subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
  );
  await seedSnapshot({
    profileId: chargePersonId,
    snapshotDate: previousSnapshotDate,
    metrics: buildProgressMetrics({
      totalSessions: 1,
      topicsMastered: 1,
      vocabularyTotal: 5,
    }),
  });
  await seedSnapshot({
    profileId: chargePersonId,
    snapshotDate: latestSnapshotDate,
    metrics: buildProgressMetrics({
      totalSessions: 3,
      topicsMastered: 4,
      vocabularyTotal: 9,
    }),
  });

  return { guardianPersonId, chargePersonId };
}

function migrationStatements(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) =>
      statement
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

async function ensureWeeklyReportsTable(): Promise<void> {
  const result = (await db.execute(
    sql.raw("select to_regclass('public.weekly_reports') as relation_name"),
  )) as {
    rows?: Array<{ relation_name?: string | null }>;
  };

  if (result.rows?.[0]?.relation_name) {
    return;
  }

  const migrationPaths = [
    resolve(__dirname, '../../../drizzle/0036_famous_vengeance.sql'),
    resolve(__dirname, '../../../drizzle/0037_rls_weekly_reports.sql'),
  ];

  for (const migrationPath of migrationPaths) {
    for (const statement of migrationStatements(migrationPath)) {
      await db.execute(sql.raw(statement));
    }
  }
}

interface WeeklyPushCronResult {
  status: string;
  queuedParents: number;
}

async function executeCronSteps(): Promise<{
  result: WeeklyPushCronResult;
  step: { run: jest.Mock; sendEvent: jest.Mock };
}> {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (
    weeklyProgressPushCron as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;
  const result = (await handler({
    event: { name: 'inngest/function.invoked' },
    step,
  })) as WeeklyPushCronResult;

  return { result, step };
}

async function executeGenerateHandler(parentId: string): Promise<unknown> {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (
    weeklyProgressPushGenerate as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;
  return handler({
    event: { name: 'app/weekly-progress-push.generate', data: { parentId } },
    step,
  });
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for weekly progress push integration tests',
    );
  }

  db = createDatabase(databaseUrl);
  await ensureWeeklyReportsTable();
  process.env['RESEND_API_KEY'] = 'resend-test-key';

  // Intercept external notification APIs at the fetch level.
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === EXPO_PUSH_API_URL) {
      const body = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      pushApiCalls.push({
        to: body.to as string,
        title: body.title as string,
        body: body.body as string,
        data: body.data,
      });
      if (expoPushResponseStatus !== 200) {
        return new Response(JSON.stringify({ error: 'push unavailable' }), {
          status: expoPushResponseStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          data: { id: expoPushTicketId, status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === RESEND_API_URL) {
      const body = init?.body
        ? (JSON.parse(init.body as string) as {
            to?: string[];
            subject?: string;
            text?: string;
          })
        : {};
      emailApiCalls.push({
        to: body.to ?? [],
        subject: body.subject ?? '',
        text: body.text ?? '',
        idempotencyKey: init?.headers
          ? (init.headers as Record<string, string>)['Idempotency-Key']
          : undefined,
      });
      return new Response(JSON.stringify({ id: 'email-integration' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  pushApiCalls.length = 0;
  emailApiCalls.length = 0;
  expoPushResponseStatus = 200;
  expoPushTicketId = 'ticket-integration';
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (originalResendApiKey === undefined) {
    delete process.env['RESEND_API_KEY'];
  } else {
    process.env['RESEND_API_KEY'] = originalResendApiKey;
  }

  // [WI-867] v2 identity cleanup, tracked at seed time (legacy accounts/
  // profiles lookup removed — those tables no longer exist).
  if (createdProfileIds.length > 0) {
    // guardianship.guardianPersonId / chargePersonId → person.id RESTRICT:
    // delete guardianship edges before person.
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, createdProfileIds));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, createdProfileIds));
    // person cascade: membership, login (consentRequest also cascades).
    await db.delete(person).where(inArray(person.id, createdProfileIds));
  }
  if (createdAccountIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, createdAccountIds));
  }
}, 30_000);

describe('weekly progress push integration', () => {
  describe('[WI-1997] push delivery controls the email fallback', () => {
    it('restores a delivered-but-unlogged push result across durable replay and suppresses email', async () => {
      const { guardianPersonId } = await seedWeeklyDeliveryScenario();
      // PostgreSQL text rejects NUL. The external Expo boundary still reports a
      // successful ticket, then the real notificationLog insert throws and the
      // real push service returns { sent: true, reason: 'log_write_failed' }.
      expoPushTicketId = 'ticket-delivered-but-unlogged\u0000';

      const event = {
        name: 'app/weekly-progress-push.generate',
        data: { parentId: guardianPersonId },
      };
      const pushEngine = new InngestTestEngine({
        function: weeklyProgressPushGenerate,
        events: [event],
      });
      const pushCheckpoint = await pushEngine.executeStep(
        'send-weekly-progress-push',
      );

      // Persist every completed step output through JSON, then start a fresh
      // engine from only that serialized durable state. The email gate cannot
      // see an in-memory pushResult from the first engine.
      const serializedCompletedSteps = JSON.parse(
        JSON.stringify(
          await Promise.all([
            ...Object.entries(pushCheckpoint.state).map(
              async ([id, dataPromise]) => ({ id, data: await dataPromise }),
            ),
            Promise.resolve({
              id: pushCheckpoint.step.id,
              data: pushCheckpoint.result,
            }),
          ]),
        ),
      ) as Array<{ id: string; data: unknown }>;
      expect(serializedCompletedSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              sent: true,
              reason: 'log_write_failed',
            }),
          }),
        ]),
      );

      const replayEngine = new InngestTestEngine({
        function: weeklyProgressPushGenerate,
        events: [event],
        steps: serializedCompletedSteps.map(({ id, data }) => ({
          id,
          idIsHashed: true,
          handler: () => data,
        })),
      });
      const { result, state: replayState } = await replayEngine.execute();

      expect(result).toEqual({
        status: 'completed',
        parentId: guardianPersonId,
      });
      expect(await Promise.all(Object.values(replayState))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sent: true,
            reason: 'log_write_failed',
          }),
          { sent: false, reason: 'push_sent' },
        ]),
      );
      expect(pushApiCalls).toHaveLength(1);
      expect(emailApiCalls).toHaveLength(0);
      const storedNotifications = await db.query.notificationLog.findMany({
        where: and(
          eq(notificationLog.profileId, guardianPersonId),
          eq(notificationLog.type, 'weekly_progress'),
        ),
      });
      expect(storedNotifications).toHaveLength(0);
    });

    it('sends fallback email when push genuinely fails', async () => {
      const { guardianPersonId } = await seedWeeklyDeliveryScenario();
      expoPushResponseStatus = 503;

      const result = await executeGenerateHandler(guardianPersonId);

      expect(result).toEqual({
        status: 'completed',
        parentId: guardianPersonId,
      });
      expect(pushApiCalls).toHaveLength(1);
      expect(emailApiCalls).toHaveLength(1);
    });

    it('does not re-send a successful fallback email on retry', async () => {
      const { guardianPersonId } = await seedWeeklyDeliveryScenario();
      expoPushResponseStatus = 503;

      await executeGenerateHandler(guardianPersonId);
      await executeGenerateHandler(guardianPersonId);

      expect(pushApiCalls).toHaveLength(1);
      expect(emailApiCalls).toHaveLength(1);
    });
  });

  it('queues only parents whose real account timezone resolves to local 9am', async () => {
    const now = new Date();
    const matchingTimezone = findTimezoneForHour(9, now);
    const nonMatchingTimezone = findTimezoneNotHour(9, now, matchingTimezone);

    const { profileId: queuedParentId } = await seedProfile({
      displayName: 'Queued Parent',
      timezone: matchingTimezone,
    });
    const { profileId: queuedChildId } = await seedProfile({
      displayName: 'Queued Child',
      timezone: matchingTimezone,
      credentialed: false,
    });
    const { profileId: skippedParentId } = await seedProfile({
      displayName: 'Skipped Parent',
      timezone: nonMatchingTimezone,
    });
    const { profileId: skippedChildId } = await seedProfile({
      displayName: 'Skipped Child',
      timezone: nonMatchingTimezone,
      credentialed: false,
    });

    await seedWeeklyPushPrefs(queuedParentId);
    await seedWeeklyPushPrefs(skippedParentId);
    await seedFamilyLink(queuedParentId, queuedChildId);
    await seedFamilyLink(skippedParentId, skippedChildId);

    const { result, step } = await executeCronSteps();

    // The exact count may exceed 1 when other accounts in the shared DB
    // happen to match the 9am timezone window. Assert the test-created parent
    // was included and the non-matching one was excluded (below).
    expect(result.status).toBe('completed');
    expect(result.queuedParents).toBeGreaterThanOrEqual(1);
    expect(step.sendEvent).toHaveBeenCalled();
    expect(step.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app/weekly-progress-push.generate',
          // [WI-793] The cron always emits `reportWeekStart` in the generate
          // event payload (BUG-757 idempotency key — `parentId + reportWeekStart`
          // dedupes retry overlap). This assertion predated that emit; align it
          // to the source's actual shape. Source unchanged.
          data: expect.objectContaining({ parentId: queuedParentId }),
        }),
      ]),
    );
    expect(step.sendEvent).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          data: { parentId: skippedParentId },
        }),
      ]),
    );
  });

  it('persists a weekly report and sends a real delta summary from stored snapshots', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      timezone: 'UTC',
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Emma',
      timezone: 'UTC',
      credentialed: false,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedWeeklyPushPrefs(parentProfileId);

    // [WI-793] Seed a live `subjects` row whose id matches the snapshot's
    // per-subject metrics. The digest filter recomputes every top-level total
    // from live-subject rows, so the delta-bearing numbers (topicsMastered,
    // vocabularyTotal, topicsExplored) must live at the subject level and the
    // subject must exist & be non-archived — otherwise the metrics are filtered
    // to zero and the push collapses to the "quieter week" fallback.
    const scienceSubjectId = generateUUIDv7();
    await seedSubject({
      subjectId: scienceSubjectId,
      profileId: childProfileId,
      name: 'Science',
    });

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
    );

    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: previousSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 2,
        totalActiveMinutes: 30,
        totalWallClockMinutes: 40,
        topicsMastered: 5,
        vocabularyTotal: 20,
        longestStreak: 4,
        subjects: [
          buildSubjectMetrics(scienceSubjectId, 'Science', {
            sessionsCount: 2,
            topicsMastered: 5,
            vocabularyTotal: 20,
            topicsExplored: 4,
          }),
        ],
      }),
    });
    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: latestSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 5,
        totalActiveMinutes: 60,
        totalWallClockMinutes: 90,
        topicsMastered: 9,
        vocabularyTotal: 30,
        longestStreak: 6,
        subjects: [
          buildSubjectMetrics(scienceSubjectId, 'Science', {
            sessionsCount: 5,
            topicsMastered: 9,
            vocabularyTotal: 30,
            topicsExplored: 6,
          }),
        ],
      }),
    });

    const result = await executeGenerateHandler(parentProfileId);

    expect(result).toEqual({ status: 'completed', parentId: parentProfileId });
    expect(pushApiCalls).toHaveLength(1);
    expect(pushApiCalls[0]).toEqual(
      expect.objectContaining({
        to: 'ExponentPushToken[integration]',
        title: 'Weekly learning progress',
        body: expect.stringContaining(
          'Emma: +4 topics, +10 words, +2 explored',
        ),
        data: { type: 'weekly_progress' },
      }),
    );

    const storedReports = await db.query.weeklyReports.findMany({
      where: and(
        eq(weeklyReports.profileId, parentProfileId),
        eq(weeklyReports.childProfileId, childProfileId),
      ),
    });

    expect(storedReports).toHaveLength(1);
    expect(storedReports[0]).toEqual(
      expect.objectContaining({
        profileId: parentProfileId,
        childProfileId,
        reportWeek: weekStartIso(today),
      }),
    );
    expect(storedReports[0]!.reportData).toEqual(
      expect.objectContaining({
        childName: 'Emma',
        weekStart: weekStartIso(today),
      }),
    );
  });

  it('returns skipped when the parent has no linked children', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Solo Parent',
      timezone: 'UTC',
    });

    const result = await executeGenerateHandler(parentProfileId);

    expect(result).toEqual({
      status: 'skipped',
      reason: 'no_children',
      parentId: parentProfileId,
    });
    expect(pushApiCalls).toHaveLength(0);
  });

  // [BUG-699-FOLLOWUP] 24h notification-log dedup. The weeklyReports row
  // write is idempotent via onConflictDoNothing, but a duplicate
  // `app/weekly-progress-push.generate` event would otherwise push the same
  // parent twice. Priming notificationLog with a recent `weekly_progress`
  // entry must cause the generate handler to skip the push while leaving the
  // report row intact.
  it('[BUG-699-FOLLOWUP] does not re-push when a weekly_progress notification was logged in the last 24h', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      timezone: 'UTC',
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Emma',
      timezone: 'UTC',
      credentialed: false,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedWeeklyPushPrefs(parentProfileId);

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
    );

    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: previousSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 1,
        topicsMastered: 1,
        vocabularyTotal: 5,
      }),
    });
    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: latestSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 4,
        topicsMastered: 6,
        vocabularyTotal: 12,
      }),
    });

    // Prime notificationLog with a fresh weekly_progress entry for the parent.
    await db.insert(notificationLog).values({
      profileId: parentProfileId,
      type: 'weekly_progress',
      ticketId: null,
    });

    const result = await executeGenerateHandler(parentProfileId);

    // [BUG-699-FOLLOWUP / WI-1151] The outer handler surfaces reason when
    // throttled so callers can distinguish a deduped no-op from a real send.
    // 'dedup_24h' means a weekly_progress notification was already logged in
    // the last 24h — the push step suppressed the send.
    expect(result).toEqual({
      status: 'throttled',
      parentId: parentProfileId,
      reason: 'dedup_24h',
    });
    // No push API call should have fired.
    expect(pushApiCalls).toHaveLength(0);
    // Report row IS still persisted — dedup gates the push only.
    const storedReports = await db.query.weeklyReports.findMany({
      where: and(
        eq(weeklyReports.profileId, parentProfileId),
        eq(weeklyReports.childProfileId, childProfileId),
      ),
    });
    expect(storedReports).toHaveLength(1);
  });

  it('[BUG-699-FOLLOWUP] logs email-only weekly sends so the 24h dedup gate can see them', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Email Parent',
      timezone: 'UTC',
    });
    const { profileId: childProfileId } = await seedProfile({
      displayName: 'Emma',
      timezone: 'UTC',
      credentialed: false,
    });
    await seedFamilyLink(parentProfileId, childProfileId);
    await seedWeeklyEmailPrefs(parentProfileId);

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
    );

    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: previousSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 1,
        topicsMastered: 1,
        vocabularyTotal: 5,
      }),
    });
    await seedSnapshot({
      profileId: childProfileId,
      snapshotDate: latestSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 3,
        topicsMastered: 4,
        vocabularyTotal: 9,
      }),
    });

    const result = await executeGenerateHandler(parentProfileId);

    expect(result).toEqual({ status: 'completed', parentId: parentProfileId });
    expect(pushApiCalls).toHaveLength(0);
    expect(emailApiCalls).toHaveLength(1);
    expect(emailApiCalls[0]).toEqual(
      expect.objectContaining({
        idempotencyKey: `weekly-${parentProfileId}-${weekStartIso(today)}`,
      }),
    );

    const storedNotifications = await db.query.notificationLog.findMany({
      where: and(
        eq(notificationLog.profileId, parentProfileId),
        eq(notificationLog.type, 'weekly_progress'),
      ),
    });
    expect(storedNotifications).toHaveLength(1);
    expect(storedNotifications[0]!.ticketId).toBe(
      `email-${weekStartIso(today)}`,
    );
  });

  it('skips children with no snapshots but still pushes for children that have activity', async () => {
    const { profileId: parentProfileId } = await seedProfile({
      displayName: 'Parent',
      timezone: 'UTC',
    });
    const { profileId: childWithDataId } = await seedProfile({
      displayName: 'Alice',
      timezone: 'UTC',
      credentialed: false,
    });
    const { profileId: childWithoutDataId } = await seedProfile({
      displayName: 'Bob',
      timezone: 'UTC',
      credentialed: false,
    });

    await seedFamilyLink(parentProfileId, childWithDataId);
    await seedFamilyLink(parentProfileId, childWithoutDataId);
    await seedWeeklyPushPrefs(parentProfileId);

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7),
    );

    await seedSnapshot({
      profileId: childWithDataId,
      snapshotDate: previousSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 1,
        totalActiveMinutes: 10,
        topicsMastered: 3,
        vocabularyTotal: 8,
        subjects: [],
      }),
    });
    await seedSnapshot({
      profileId: childWithDataId,
      snapshotDate: latestSnapshotDate,
      metrics: buildProgressMetrics({
        totalSessions: 2,
        totalActiveMinutes: 20,
        topicsMastered: 5,
        vocabularyTotal: 11,
        subjects: [],
      }),
    });

    const result = await executeGenerateHandler(parentProfileId);

    expect(result).toEqual({ status: 'completed', parentId: parentProfileId });
    expect(pushApiCalls).toHaveLength(1);
    expect(pushApiCalls[0]!.body).toContain('Alice');
    expect(pushApiCalls[0]!.body).not.toContain('Bob');

    const storedReports = await db.query.weeklyReports.findMany({
      where: eq(weeklyReports.profileId, parentProfileId),
    });
    expect(storedReports).toHaveLength(1);
    expect(storedReports[0]!.childProfileId).toBe(childWithDataId);
  });
});
