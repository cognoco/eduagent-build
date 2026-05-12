/**
 * Integration: Dictation Result & Streak [BUG-30]
 *
 * Tests the dictation result recording and streak computation against a real
 * database — specifically the dedup guard (uniqueIndex + upsert) that prevents
 * duplicate-date rows from crowding out the 60-row streak window.
 *
 * No mocks of internal services or database.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  dictationResults,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { recordDictationResult, getDictationStreak } from './result';

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

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Test identifiers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-dictation-result';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-user1`,
  email: `${PREFIX}-user1@integration.test`,
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedAccountAndProfile() {
  const db = createIntegrationDb();

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: ACCOUNT.clerkUserId, email: ACCOUNT.email })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Dictation Test User',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();

  return { account: account!, profile: profile! };
}

async function cleanup() {
  const db = createIntegrationDb();
  const found = await db.query.accounts.findMany({
    where: eq(accounts.email, ACCOUNT.email),
  });
  const ids = found.map((a) => a.id);
  if (ids.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, ids));
  }
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
// Tests
// ---------------------------------------------------------------------------

describe('recordDictationResult (integration) [BUG-30]', () => {
  it('inserts a new row for a fresh (profileId, date) pair', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const row = await recordDictationResult(db, profile.id, {
      localDate: '2026-05-01',
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: true,
    });

    expect(row).toBeDefined();
    expect(row!.sentenceCount).toBe(5);
    expect(row!.mistakeCount).toBe(2);

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profile.id),
    });
    expect(rows).toHaveLength(1);
  });

  it('[BREAK] upserts on duplicate (profileId, date) — no duplicate rows', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    await recordDictationResult(db, profile.id, {
      localDate: '2026-05-01',
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const updated = await recordDictationResult(db, profile.id, {
      localDate: '2026-05-01',
      sentenceCount: 8,
      mistakeCount: 1,
      mode: 'surprise',
      reviewed: true,
    });

    expect(updated).toBeDefined();
    expect(updated!.sentenceCount).toBe(8);
    expect(updated!.mistakeCount).toBe(1);
    expect(updated!.mode).toBe('surprise');
    expect(updated!.reviewed).toBe(true);

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profile.id),
    });
    expect(rows).toHaveLength(1);
  });
});

describe('getDictationStreak (integration) [BUG-30]', () => {
  it('returns streak: 0 when no results exist', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const result = await getDictationStreak(db, profile.id);
    expect(result).toEqual({ streak: 0, lastDate: null });
  });

  it('counts consecutive days correctly', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = getPreviousDate(today);
    const dayBefore = getPreviousDate(yesterday);

    for (const date of [dayBefore, yesterday, today]) {
      await recordDictationResult(db, profile.id, {
        localDate: date,
        sentenceCount: 5,
        mistakeCount: 0,
        mode: 'homework',
        reviewed: true,
      });
    }

    const result = await getDictationStreak(db, profile.id);
    expect(result.streak).toBe(3);
    expect(result.lastDate).toBe(today);
  });

  it('streak is not inflated by duplicate-date submissions after upsert', async () => {
    const { profile } = await seedAccountAndProfile();
    const db = createIntegrationDb();

    const today = new Date().toISOString().slice(0, 10);

    await recordDictationResult(db, profile.id, {
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: true,
    });

    await recordDictationResult(db, profile.id, {
      localDate: today,
      sentenceCount: 8,
      mistakeCount: 0,
      mode: 'surprise',
      reviewed: true,
    });

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profile.id),
    });
    expect(rows).toHaveLength(1);

    const result = await getDictationStreak(db, profile.id);
    expect(result.streak).toBe(1);
  });
});

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
