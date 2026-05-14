import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  dictationResults,
  practiceActivityEvents,
  profiles,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import { recordDictationResult, getDictationStreak } from './result';

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

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-dictation-result';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-01`,
  email: `${PREFIX}-user1@integration.test`,
};

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.accounts.findMany({
    where: inArray(accounts.email, [ACCOUNT.email]),
  });
  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((r) => r.id),
      ),
    );
  }
}

let accountId: string;
let profileId: string;

beforeAll(async () => {
  await cleanupTestAccounts();
  const db = createIntegrationDb();
  const [acct] = await db
    .insert(accounts)
    .values({
      clerkUserId: ACCOUNT.clerkUserId,
      email: ACCOUNT.email,
    })
    .returning();
  accountId = acct!.id;
  const [prof] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Integration Learner',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  profileId = prof!.id;
});

beforeEach(async () => {
  const db = createIntegrationDb();
  await db
    .delete(practiceActivityEvents)
    .where(eq(practiceActivityEvents.profileId, profileId));
  await db
    .delete(dictationResults)
    .where(eq(dictationResults.profileId, profileId));
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('recordDictationResult (integration)', () => {
  it('inserts a new row for a fresh (profileId, date) pair', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sentenceCount).toBe(5);
    expect(rows[0]!.mistakeCount).toBe(2);
    expect(rows[0]!.mode).toBe('homework');
    expect(rows[0]!.reviewed).toBe(false);
  });

  it('records the practice event at completion time instead of local-date midnight', async () => {
    const db = createIntegrationDb();
    const before = new Date();

    const row = await recordDictationResult(db, profileId, {
      localDate: '2026-05-13',
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const after = new Date();
    const [event] = await db
      .select({ completedAt: practiceActivityEvents.completedAt })
      .from(practiceActivityEvents)
      .where(eq(practiceActivityEvents.sourceId, row.id));

    expect(event?.completedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(event?.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('creates separate rows for duplicate (profileId, date) inserts', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const second = await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 8,
      mistakeCount: 1,
      mode: 'surprise',
      reviewed: true,
    });

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(rows).toHaveLength(2);
    expect(second.sentenceCount).toBe(8);
    expect(second.mode).toBe('surprise');
  });
});

describe('getDictationStreak (integration)', () => {
  it('returns streak 0 and null lastDate when no results exist', async () => {
    const db = createIntegrationDb();
    const result = await getDictationStreak(db, profileId);
    expect(result).toEqual({ streak: 0, lastDate: null });
  });

  it('counts consecutive days correctly', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();
    const yesterday = getPreviousDate(today);
    const dayBefore = getPreviousDate(yesterday);

    for (const date of [today, yesterday, dayBefore]) {
      await recordDictationResult(db, profileId, {
        localDate: date,
        sentenceCount: 5,
        mistakeCount: 0,
        mode: 'homework',
        reviewed: true,
      });
    }

    const result = await getDictationStreak(db, profileId);
    expect(result.streak).toBe(3);
    expect(result.lastDate).toBe(today);
  });

  it('streak is not inflated by duplicate-date rows', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: false,
    });
    await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 8,
      mistakeCount: 1,
      mode: 'surprise',
      reviewed: true,
    });

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(rows).toHaveLength(2);

    const result = await getDictationStreak(db, profileId);
    expect(result.streak).toBe(1);
  });
});
