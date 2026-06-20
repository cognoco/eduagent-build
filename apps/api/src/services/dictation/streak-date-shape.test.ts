import type { Database } from '@eduagent/database';
import { getDictationStreak } from './result';

// ---------------------------------------------------------------------------
// [BUG-850] Dictation streak Date-vs-string data-shape regression.
//
// `getDictationStreak` reads distinct dates via
// `repo.dictationResults.listRecentDistinctDates(...)`. The production
// neon-serverless (WebSocket) driver returns DATE columns as raw JS `Date`
// objects, not normalized ISO strings. The streak walk then compares each
// row's `date` against a string `expected` (`getPreviousDate` returns
// `.toISOString().slice(0,10)`), so `date === expected` is ALWAYS false after
// the first element and the streak collapses to 1 even for a long run.
//
// This test fakes ONLY the external DB boundary (the `Database` object) — the
// real `getDictationStreak` and real `createScopedRepository` run unchanged.
// The fake reproduces neon-serverless by returning `{ date: Date }` rows.
// ---------------------------------------------------------------------------

/**
 * Minimal Drizzle-query-builder double that mimics neon-serverless returning
 * DATE columns as JS `Date` objects. It only implements the chain that
 * `listRecentDistinctDates` invokes:
 *   db.selectDistinct(...).from(...).where(...).orderBy(...).limit(n)
 * `.limit()` resolves to the supplied rows.
 */
function makeDbReturningDateObjects(isoDates: string[]): Database {
  // Each row's `date` is a JS Date at UTC midnight — what the WebSocket driver
  // hands back for a `date` column.
  const rows = isoDates.map((iso) => ({ date: new Date(`${iso}T00:00:00Z`) }));
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return {
    selectDistinct: () => chain,
  } as unknown as Database;
}

describe('[BUG-850] getDictationStreak with Date-object rows (neon-serverless shape)', () => {
  const profileId = 'profile-bug-850';

  function isoDaysAgo(daysAgo: number): string {
    const d = new Date('2026-06-20T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  it('computes the full consecutive-day streak even when rows.date are Date objects', async () => {
    // Freeze "today" so getServerDate() lines up with our synthetic dates.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-20T12:00:00Z'));
    try {
      // 5 consecutive days ending today, returned most-recent-first.
      const isoDates = [0, 1, 2, 3, 4].map(isoDaysAgo);
      const db = makeDbReturningDateObjects(isoDates);

      const result = await getDictationStreak(db, profileId);

      expect(result.streak).toBe(5);
      expect(result.lastDate).toBe('2026-06-20');
    } finally {
      jest.useRealTimers();
    }
  });
});
