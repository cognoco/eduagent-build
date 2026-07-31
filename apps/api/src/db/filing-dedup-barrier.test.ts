import {
  assertFilingDedupBarrierPresent,
  FILING_DEDUP_BARRIER_INDEXES,
  FilingDedupBarrierMissingError,
} from './filing-dedup-barrier';
import type { Database } from '@eduagent/database';

interface IndexCatalogRow {
  index_name: string;
  index_schema: string;
  table_name: string;
  table_schema: string;
  is_unique: boolean;
  is_valid: boolean;
  key_definitions: string[];
  predicate: string | null;
}

function validCatalogRows(): IndexCatalogRow[] {
  return [
    {
      index_name: 'subjects_profile_name_lower_active_uq',
      index_schema: 'public',
      table_name: 'subjects',
      table_schema: 'public',
      is_unique: true,
      is_valid: true,
      key_definitions: ['profile_id', 'lower(name)'],
      predicate: "(status = 'active'::subject_status)",
    },
    {
      index_name: 'curriculum_books_subject_title_lower_uq',
      index_schema: 'public',
      table_name: 'curriculum_books',
      table_schema: 'public',
      is_unique: true,
      is_valid: true,
      key_definitions: ['subject_id', 'lower(title)'],
      predicate: null,
    },
    {
      index_name: 'curriculum_topics_book_title_lower_uq',
      index_schema: 'public',
      table_name: 'curriculum_topics',
      table_schema: 'public',
      is_unique: true,
      is_valid: true,
      key_definitions: ['book_id', 'lower(title)'],
      predicate: null,
    },
  ];
}

function fakeDb(rows: IndexCatalogRow[]): Database {
  return {
    execute: jest.fn().mockResolvedValue({ rows }),
  } as unknown as Database;
}

describe('assertFilingDedupBarrierPresent [WI-2639]', () => {
  it('resolves without throwing when all three barrier indexes are present', async () => {
    const db = fakeDb(validCatalogRows());

    await expect(assertFilingDedupBarrierPresent(db)).resolves.toBeUndefined();
  });

  it('throws FilingDedupBarrierMissingError naming the missing index when only the subjects index is absent', async () => {
    const present = validCatalogRows().filter(
      (idx) => idx.index_name !== 'subjects_profile_name_lower_active_uq',
    );
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

  it.each([
    ['wrong index schema', { index_schema: 'tenant' }],
    ['wrong table schema', { table_schema: 'tenant' }],
    ['wrong table', { table_name: 'subject_archive' }],
    ['non-unique index', { is_unique: false }],
    ['invalid index', { is_valid: false }],
    ['wrong key expression', { key_definitions: ['profile_id', 'name'] }],
    ['wrong partial-index predicate', { predicate: null }],
  ])('rejects a subjects barrier with a %s', async (_label, invalidShape) => {
    const rows = validCatalogRows();
    rows[0] = { ...rows[0]!, ...invalidShape };

    await expect(
      assertFilingDedupBarrierPresent(fakeDb(rows)),
    ).rejects.toBeInstanceOf(FilingDedupBarrierMissingError);
  });
});
