import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  familyLinks,
  generateUUIDv7,
  notificationPreferences,
  progressSnapshots,
  profiles,
  weeklyReports,
  type Database,
} from '@eduagent/database';
import type { ProgressMetrics } from '@eduagent/schemas';
import { and, eq, like, sql } from 'drizzle-orm';

const mockSendPushNotification = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
}));

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  weeklyProgressPushCron,
  weeklyProgressPushGenerate,
} from './weekly-progress-push';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

const TIMEZONE_CANDIDATES = [
  'Pacific/Kiritimati',
  'UTC',
  'Atlantic/Azores',
  'America/Noronha',
  'Europe/Berlin',
  'Europe/Oslo',
  'Europe/London',
  'Europe/Athens',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Gambier',
  'America/Sao_Paulo',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
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
    10
  );
}

function findTimezoneForHour(targetHour: number, now: Date): string {
  const timezone = TIMEZONE_CANDIDATES.find(
    (candidate) => localHour(candidate, now) === targetHour
  );
  if (!timezone) {
    throw new Error(
      `Could not find timezone matching local hour ${targetHour}`
    );
  }
  return timezone;
}

function findTimezoneNotHour(targetHour: number, now: Date, exclude: string) {
  const timezone = TIMEZONE_CANDIDATES.find(
    (candidate) =>
      candidate !== exclude && localHour(candidate, now) !== targetHour
  );
  if (!timezone) {
    throw new Error(
      `Could not find timezone not matching local hour ${targetHour}`
    );
  }
  return timezone;
}

function buildSubjectMetrics(
  subjectId: string,
  subjectName: string,
  overrides: Partial<ProgressMetrics['subjects'][number]> = {}
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
  overrides: Partial<ProgressMetrics> = {}
): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
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

async function seedFamilyLink(
  parentProfileId: string,
  childProfileId: string
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
        .trim()
    )
    .filter(Boolean);
}

async function ensureWeeklyReportsTable(): Promise<void> {
  const result = (await db.execute(
    sql.raw("select to_regclass('public.weekly_reports') as relation_name")
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

async function executeCronSteps(): Promise<{
  result: unknown;
  step: { run: jest.Mock; sendEvent: jest.Mock };
}> {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (
    weeklyProgressPushCron as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  const result = await handler({
    event: { name: 'inngest/function.invoked' },
    step,
  });

  return { result, step };
}

async function executeGenerateHandler(parentId: string): Promise<unknown> {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (
    weeklyProgressPushGenerate as { fn: (ctx: unknown) => Promise<unknown> }
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
      'DATABASE_URL is not set for weekly progress push integration tests'
    );
  }

  db = createDatabase(databaseUrl);
  await ensureWeeklyReportsTable();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPushNotification.mockResolvedValue({
    sent: true,
    ticketId: 'ticket-1',
  });
});

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_weekly_push_${RUN_ID}%`));
});

describe('weekly progress push integration', () => {
  it('queues only parents whose real account timezone resolves to local 9am', async () => {
    const now = new Date();
    const matchingTimezone = findTimezoneForHour(9, now);
    const nonMatchingTimezone = findTimezoneNotHour(9, now, matchingTimezone);

    const { profileId: queuedParentId } = await seedProfile({
      displayName: 'Queued Parent',
      timezone: matchingTimezone,
    });
    const { profileId: skippedParentId } = await seedProfile({
      displayName: 'Skipped Parent',
      timezone: nonMatchingTimezone,
    });

    await seedWeeklyPushPrefs(queuedParentId);
    await seedWeeklyPushPrefs(skippedParentId);

    const { result, step } = await executeCronSteps();

    expect(result).toEqual({ status: 'completed', queuedParents: 1 });
    expect(step.sendEvent).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).toHaveBeenCalledWith('fan-out-weekly-progress-0', [
      expect.objectContaining({
        name: 'app/weekly-progress-push.generate',
        data: { parentId: queuedParentId },
      }),
    ]);
    expect(step.sendEvent).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          data: { parentId: skippedParentId },
        }),
      ])
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

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7)
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

    expect(mockCaptureException.mock.calls[0]?.[0]).toBeUndefined();
    expect(result).toEqual({ status: 'completed', parentId: parentProfileId });
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: parentProfileId,
        title: 'Weekly learning progress',
        body: expect.stringContaining(
          'Emma: +4 topics, +10 words, +2 explored'
        ),
        type: 'weekly_progress',
      })
    );

    const storedReports = await db.query.weeklyReports.findMany({
      where: and(
        eq(weeklyReports.profileId, parentProfileId),
        eq(weeklyReports.childProfileId, childProfileId)
      ),
    });

    expect(storedReports).toHaveLength(1);
    expect(storedReports[0]).toEqual(
      expect.objectContaining({
        profileId: parentProfileId,
        childProfileId,
        reportWeek: weekStartIso(today),
      })
    );
    expect(storedReports[0]!.reportData).toEqual(
      expect.objectContaining({
        childName: 'Emma',
        weekStart: weekStartIso(today),
      })
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
    expect(mockSendPushNotification).not.toHaveBeenCalled();
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

    const today = new Date();
    const latestSnapshotDate = isoDate(today);
    const previousSnapshotDate = isoDate(
      subtractDays(new Date(`${latestSnapshotDate}T00:00:00.000Z`), 7)
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

    expect(mockCaptureException.mock.calls[0]?.[0]).toBeUndefined();
    expect(result).toEqual({ status: 'completed', parentId: parentProfileId });
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    const body = mockSendPushNotification.mock.calls[0]?.[1]?.body as string;
    expect(body).toContain('Alice');
    expect(body).not.toContain('Bob');

    const storedReports = await db.query.weeklyReports.findMany({
      where: eq(weeklyReports.profileId, parentProfileId),
    });
    expect(storedReports).toHaveLength(1);
    expect(storedReports[0]!.childProfileId).toBe(childWithDataId);
  });
});
