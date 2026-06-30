import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  dictationResults,
  practiceActivityEvents,
  profiles,
  subjects,
} from '@eduagent/database';
import { SubjectNotFoundError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import {
  deriveLegacyDictationCompletionKey,
  recordDictationResult,
  getDictationStreak,
  getDictationHistory,
} from './result';

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
// [SECURITY] Second account used for cross-profile IDOR break tests — profile A
// owns a subject, profile B (attacker) tries to record dictation against it.
const VICTIM_ACCOUNT = {
  clerkUserId: `${PREFIX}-victim`,
  email: `${PREFIX}-victim@integration.test`,
};

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getDateDaysAgo(dateStr: string, daysAgo: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function completionKey(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.accounts.findMany({
    where: inArray(accounts.email, [ACCOUNT.email, VICTIM_ACCOUNT.email]),
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
let victimProfileId: string;
let victimSubjectId: string;

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

  // Victim account: owns the subject the attacker (profileId) tries to abuse.
  const [victimAcct] = await db
    .insert(accounts)
    .values({
      clerkUserId: VICTIM_ACCOUNT.clerkUserId,
      email: VICTIM_ACCOUNT.email,
    })
    .returning();
  const [victimProf] = await db
    .insert(profiles)
    .values({
      accountId: victimAcct!.id,
      displayName: 'Victim Learner',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  victimProfileId = victimProf!.id;
  const [victimSubject] = await db
    .insert(subjects)
    .values({
      profileId: victimProfileId,
      name: 'Victim Subject',
    })
    .returning();
  victimSubjectId = victimSubject!.id;
});

beforeEach(async () => {
  const db = createIntegrationDb();
  await db
    .delete(practiceActivityEvents)
    .where(
      inArray(practiceActivityEvents.profileId, [profileId, victimProfileId]),
    );
  await db
    .delete(dictationResults)
    .where(inArray(dictationResults.profileId, [profileId, victimProfileId]));
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('recordDictationResult (integration)', () => {
  it('inserts a new row for a fresh (profileId, date) pair', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      completionKey: completionKey(1),
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
      completionKey: completionKey(2),
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

  it('creates separate rows for same date with different modes', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      completionKey: completionKey(3),
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const second = await recordDictationResult(db, profileId, {
      completionKey: completionKey(4),
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

  it('[F-120] same-day same-mode writes with distinct completion keys are non-destructive', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();
    const keyA = completionKey(5);
    const keyB = completionKey(6);

    // Two DISTINCT dictation sessions, same day, same mode. Pre-fix these
    // collided on the legacy (profile, date, mode) unique index and the second
    // silently overwrote the first (data loss). Distinct completion keys must
    // now persist as two separate rows.
    const first = await recordDictationResult(db, profileId, {
      completionKey: keyA,
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const second = await recordDictationResult(db, profileId, {
      completionKey: keyB,
      localDate: today,
      sentenceCount: 6,
      mistakeCount: 1,
      mode: 'homework',
      reviewed: true,
    });

    const rows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(rows).toHaveLength(2);
    expect(second.id).not.toBe(first.id);
    // Neither session's values were clobbered.
    expect(rows.find((row) => row.id === first.id)?.sentenceCount).toBe(5);
    expect(rows.find((row) => row.id === second.id)?.sentenceCount).toBe(6);

    // A genuine retry of the SAME completion key still updates in place — the
    // completion key is the intended idempotency target, so the row count holds.
    const retry = await recordDictationResult(db, profileId, {
      completionKey: keyA,
      localDate: today,
      sentenceCount: 7,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
    });

    const afterRetry = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(afterRetry).toHaveLength(2);
    expect(retry.id).toBe(first.id);
    expect(afterRetry.find((row) => row.id === first.id)?.sentenceCount).toBe(
      7,
    );
  });

  it('[S4] completion-key retry does not clobber the original mode or date', async () => {
    // Guards that `mode` and `date` are NOT in the onConflictDoUpdate set:
    // a client reusing a completionKey across a mode switch must not silently
    // overwrite the stored mode. The original values must survive the conflict.
    const db = createIntegrationDb();
    const today = getServerDate();
    const key = completionKey(99);

    const first = await recordDictationResult(db, profileId, {
      completionKey: key,
      localDate: today,
      sentenceCount: 4,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: false,
    });

    // Same key, different mode — simulates a client-side key-reuse bug or a
    // mode switch without rotating the completionKey.
    await recordDictationResult(db, profileId, {
      completionKey: key,
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 1,
      mode: 'surprise',
      reviewed: true,
    });

    const [row] = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });

    // mode and date must be the original values; only sentenceCount/mistakeCount/reviewed update.
    expect(row.id).toBe(first.id);
    expect(row.mode).toBe('homework'); // original mode preserved
    expect(row.date).toBe(today); // date preserved (same in this case, but field not in set:)
    expect(row.sentenceCount).toBe(5); // updated
    expect(row.mistakeCount).toBe(1); // updated
    expect(row.reviewed).toBe(true); // updated
  });

  it('[WI-84 review] derives the legacy completion key when old clients omit it', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    const first = await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 2,
      mode: 'homework',
      reviewed: false,
    });

    const retry = await recordDictationResult(db, profileId, {
      localDate: today,
      sentenceCount: 7,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
    });

    expect(retry.id).toBe(first.id);
    expect(retry.completionKey).toBe(
      deriveLegacyDictationCompletionKey(profileId, today, 'homework'),
    );
    expect(retry.sentenceCount).toBe(7);
  });

  // [SECURITY-IDOR] CCR PR #241 break test. Without ownership validation, an
  // attacker (profile B) could submit a dictation result with another user's
  // (profile A) subjectId — the row + practice_activity_events entry would
  // both be tagged with the victim's subject, polluting their progress
  // surfaces. The guard in `recordDictationResult` rejects with
  // SubjectNotFoundError BEFORE any write happens.
  it('[SECURITY-IDOR] rejects cross-profile subjectId — no dictation_result or practice_activity_event row written', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await expect(
      recordDictationResult(db, profileId, {
        completionKey: completionKey(7),
        localDate: today,
        sentenceCount: 5,
        mistakeCount: 2,
        mode: 'homework',
        reviewed: false,
        // Attacker (profileId) supplies VICTIM's subjectId in an attempt to
        // plant rows under the victim's subject.
        subjectId: victimSubjectId,
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    // No dictation row written under either profile.
    const attackerRows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(attackerRows).toHaveLength(0);
    const victimRows = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, victimProfileId),
    });
    expect(victimRows).toHaveLength(0);

    // No practice_activity_event row written tagged with the victim's subject.
    const events = await db
      .select()
      .from(practiceActivityEvents)
      .where(eq(practiceActivityEvents.subjectId, victimSubjectId));
    expect(events).toHaveLength(0);

    // And none written under the attacker's profile either.
    const attackerEvents = await db
      .select()
      .from(practiceActivityEvents)
      .where(eq(practiceActivityEvents.profileId, profileId));
    expect(attackerEvents).toHaveLength(0);
  });

  it('[SECURITY-IDOR] accepts owned subjectId — writes succeed', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    // Insert a subject owned by the test profile.
    const [ownSubject] = await db
      .insert(subjects)
      .values({ profileId, name: 'Own Subject for Dictation' })
      .returning();

    const row = await recordDictationResult(db, profileId, {
      completionKey: completionKey(8),
      localDate: today,
      sentenceCount: 4,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
      subjectId: ownSubject!.id,
    });

    expect(row.id).toBeTruthy();
    const events = await db
      .select()
      .from(practiceActivityEvents)
      .where(
        and(
          eq(practiceActivityEvents.profileId, profileId),
          eq(practiceActivityEvents.subjectId, ownSubject!.id),
        ),
      );
    expect(events).toHaveLength(1);

    // Cleanup the subject we just created (afterAll cleans accounts cascade).
    await db.delete(subjects).where(eq(subjects.id, ownSubject!.id));
  });
});

describe('[WI-902] dictation full-text persistence + history (integration)', () => {
  it('persists source sentences on record and returns them in history', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();
    const sentences = [
      'The quick brown fox jumps over the lazy dog.',
      'She sells seashells by the seashore.',
    ];

    await recordDictationResult(db, profileId, {
      completionKey: completionKey(2000),
      localDate: today,
      sentenceCount: sentences.length,
      mistakeCount: 1,
      mode: 'homework',
      reviewed: true,
      sentences,
    });

    // Persisted on the row.
    const [row] = await db.query.dictationResults.findMany({
      where: eq(dictationResults.profileId, profileId),
    });
    expect(row.sentences).toEqual(sentences);

    // Returned by the history read.
    const history = await getDictationHistory(db, profileId);
    expect(history).toHaveLength(1);
    expect(history[0]!.sentences).toEqual(sentences);
    expect(history[0]!.sentenceCount).toBe(2);
    expect(history[0]!.mistakeCount).toBe(1);
    expect(history[0]!.date).toBe(today);
  });

  it('returns sentences=null for rows recorded without them (old-client path)', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      completionKey: completionKey(2001),
      localDate: today,
      sentenceCount: 3,
      mistakeCount: null,
      mode: 'surprise',
      reviewed: false,
      // sentences intentionally omitted
    });

    const history = await getDictationHistory(db, profileId);
    expect(history).toHaveLength(1);
    expect(history[0]!.sentences).toBeNull();
  });

  it('returns recent sessions newest-first and bounds the result count', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    // Insert three sessions in a known order; createdAt advances per insert.
    const first = await recordDictationResult(db, profileId, {
      completionKey: completionKey(2010),
      localDate: getDateDaysAgo(today, 2),
      sentenceCount: 2,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
      sentences: ['first one'],
    });
    const second = await recordDictationResult(db, profileId, {
      completionKey: completionKey(2011),
      localDate: getDateDaysAgo(today, 1),
      sentenceCount: 2,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
      sentences: ['second one'],
    });
    const third = await recordDictationResult(db, profileId, {
      completionKey: completionKey(2012),
      localDate: today,
      sentenceCount: 2,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
      sentences: ['third one'],
    });

    const history = await getDictationHistory(db, profileId, 2);
    expect(history).toHaveLength(2);
    // Newest first: third, then second. first is dropped by the limit.
    expect(history[0]!.id).toBe(third.id);
    expect(history[1]!.id).toBe(second.id);
    expect(history.map((h) => h.id)).not.toContain(first.id);
  });

  it('scopes history to the caller profile — never returns another profile rows', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, victimProfileId, {
      completionKey: completionKey(2020),
      localDate: today,
      sentenceCount: 2,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: true,
      sentences: ['victim private sentence'],
    });

    const attackerHistory = await getDictationHistory(db, profileId);
    expect(attackerHistory).toHaveLength(0);
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

    for (const [index, date] of [today, yesterday, dayBefore].entries()) {
      await recordDictationResult(db, profileId, {
        completionKey: completionKey(9 + index),
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

  it('[WI-205] counts the current 60-day streak when older rows were inserted before recent rows', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();
    const oldDates = Array.from({ length: 20 }, (_, index) =>
      getDateDaysAgo(today, 80 + index),
    );
    const recentDates = Array.from({ length: 60 }, (_, index) =>
      getDateDaysAgo(today, index),
    );

    for (const [index, date] of [...oldDates, ...recentDates].entries()) {
      await recordDictationResult(db, profileId, {
        completionKey: completionKey(1000 + index),
        localDate: date,
        sentenceCount: 5,
        mistakeCount: 0,
        mode: 'homework',
        reviewed: true,
      });
    }

    const result = await getDictationStreak(db, profileId);
    expect(result.streak).toBe(60);
    expect(result.lastDate).toBe(today);
  });

  it('stops counting at the first missing dictation day', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();
    const yesterday = getDateDaysAgo(today, 1);
    const threeDaysAgo = getDateDaysAgo(today, 3);

    for (const [index, date] of [today, yesterday, threeDaysAgo].entries()) {
      await recordDictationResult(db, profileId, {
        completionKey: completionKey(1100 + index),
        localDate: date,
        sentenceCount: 5,
        mistakeCount: 0,
        mode: 'homework',
        reviewed: true,
      });
    }

    const result = await getDictationStreak(db, profileId);
    expect(result.streak).toBe(2);
    expect(result.lastDate).toBe(today);
  });

  it('streak is not inflated by duplicate-date rows', async () => {
    const db = createIntegrationDb();
    const today = getServerDate();

    await recordDictationResult(db, profileId, {
      completionKey: completionKey(12),
      localDate: today,
      sentenceCount: 5,
      mistakeCount: 0,
      mode: 'homework',
      reviewed: false,
    });
    await recordDictationResult(db, profileId, {
      completionKey: completionKey(13),
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
