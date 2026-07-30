import {
  assertFilingDedupBarrierPresent,
  FILING_DEDUP_BARRIER_INDEXES,
  FilingDedupBarrierMissingError,
} from './filing-dedup-barrier';
import type { Database } from '@eduagent/database';

function fakeDb(rows: { relname: string }[]): Database {
  return {
    execute: jest.fn().mockResolvedValue({ rows }),
  } as unknown as Database;
}

describe('assertFilingDedupBarrierPresent [WI-2639]', () => {
  it('resolves without throwing when all three barrier indexes are present', async () => {
    const db = fakeDb(
      FILING_DEDUP_BARRIER_INDEXES.map((idx) => ({ relname: idx.name })),
    );

    await expect(assertFilingDedupBarrierPresent(db)).resolves.toBeUndefined();
  });

  it('throws FilingDedupBarrierMissingError naming the missing index when only the subjects index is absent', async () => {
    const present = FILING_DEDUP_BARRIER_INDEXES.filter(
      (idx) => idx.name !== 'subjects_profile_name_lower_active_uq',
    ).map((idx) => ({ relname: idx.name }));
    const db = fakeDb(present);

    let caught: unknown;
    try {
      await assertFilingDedupBarrierPresent(db);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FilingDedupBarrierMissingError);
    const error = caught as FilingDedupBarrierMissingError;
    expect(error.missing).toEqual([
      expect.objectContaining({
        name: 'subjects_profile_name_lower_active_uq',
      }),
    ]);
    expect(error.message).toContain('subjects_profile_name_lower_active_uq');
    expect(error.message).toContain('0044_shelf_book_dedup_unique_indexes.sql');
  });

  it('names every missing index and cites both provisioning paths when the database has none of them (push-provisioned)', async () => {
    const db = fakeDb([]);

    let caught: unknown;
    try {
      await assertFilingDedupBarrierPresent(db);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FilingDedupBarrierMissingError);
    const error = caught as FilingDedupBarrierMissingError;
    expect(error.missing).toHaveLength(FILING_DEDUP_BARRIER_INDEXES.length);
    for (const idx of FILING_DEDUP_BARRIER_INDEXES) {
      expect(error.message).toContain(idx.name);
    }
    expect(error.message).toContain('drizzle-kit migrate');
    expect(error.message).toContain('drizzle-kit push');
  });
});
