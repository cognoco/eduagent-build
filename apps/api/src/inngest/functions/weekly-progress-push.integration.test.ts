import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  familyLinks,
  generateUUIDv7,
  notificationLog,
  notificationPreferences,
  progressSnapshots,
  profiles,
  weeklyReports,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics } from '@eduagent/schemas';
import { and, eq, like, sql } from 'drizzle-orm';

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

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

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
}): Promise<{ accountId: string; profileId: string }> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_weekly_push_${RUN_ID}_${idx}`;
  const email = `weekly-push-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId,
      email,
      timezone: input.timezone ?? null,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: input.displayName,
      birthYear: 1985,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedWeeklyPushPrefs(profileId: string): Promise<void> {
  await db.insert(notificationPreferences).values({
    profileId,
    weeklyProgressPush: true,
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

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  await db.insert(familyLinks).values({ parentProfileId, childProfileId });
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
      return new Response(
        JSON.stringify({ data: { id: 'ticket-integration', status: 'ok' } }),
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
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (originalResendApiKey === undefined) {
    delete process.env['RESEND_API_KEY'];
  } else {
    process.env['RESEND_API_KEY'] = originalResendApiKey;
  }
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_weekly_push_${RUN_ID}%`));
}, 30_000);

describe('weekly progress push integration', () => {
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
    });
    const { profileId: skippedParentId } = await seedProfile({
      displayName: 'Skipped Parent',
      timezone: nonMatchingTimezone,
    });
    const { profileId: skippedChildId } = await seedProfile({
      displayName: 'Skipped Child',
      timezone: nonMatchingTimezone,
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
          data: { parentId: queuedParentId },
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
        totalSessions: 2,
        totalActiveMinutes: 30,
        totalWallClockMinutes: 40,
        topicsMastered: 5,
        vocabularyTotal: 20,
        longestStreak: 4,
        subjects: [
          buildSubjectMetrics(generateUUIDv7(), 'Science', {
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
          buildSubjectMetrics(generateUUIDv7(), 'Science', {
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

    expect(result).toEqual({
      status: 'throttled',
      reason: 'dedup_24h',
      parentId: parentProfileId,
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
    });
    const { profileId: childWithoutDataId } = await seedProfile({
      displayName: 'Bob',
      timezone: 'UTC',
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
