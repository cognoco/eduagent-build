import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_TAG = '0159_wi2791_curriculum_dedup_index_repair';
const DRIZZLE_DIR = resolve(__dirname, '../../../apps/api/drizzle');
const MIGRATION_PATH = resolve(DRIZZLE_DIR, `${MIGRATION_TAG}.sql`);

function readMigration(): string {
  expect(existsSync(MIGRATION_PATH)).toBe(true);
  return existsSync(MIGRATION_PATH)
    ? readFileSync(MIGRATION_PATH, 'utf8').toLowerCase()
    : '';
}

describe('curriculum dedup index repair migration [WI-2791]', () => {
  it('is a new journaled forward migration', () => {
    const journal = JSON.parse(
      readFileSync(resolve(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8'),
    ) as { entries?: Array<{ tag?: string }> };

    expect(journal.entries?.map((entry) => entry.tag)).toContain(MIGRATION_TAG);
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('fails closed on both duplicate invariants before creating indexes', () => {
    const migration = readMigration();
    const preflightEnd = migration.indexOf('end $$;');
    const firstCreate = migration.indexOf('create unique index');

    expect(migration).toContain('from curriculum_books');
    expect(migration).toContain('group by subject_id, lower(title)');
    expect(migration).toContain('from curriculum_topics');
    expect(migration).toContain('group by book_id, lower(title)');
    expect(migration).toContain("errcode = 'p0001'");
    expect(migration).toContain('raise exception');
    expect(preflightEnd).toBeGreaterThan(-1);
    expect(firstCreate).toBeGreaterThan(preflightEnd);
  });

  it('creates exactly the two intended idempotent expression indexes', () => {
    const migration = readMigration();
    const createStatements = migration.match(
      /create unique index if not exists/g,
    );

    expect(createStatements).toHaveLength(2);
    expect(migration).toContain(
      'create unique index if not exists "curriculum_books_subject_title_lower_uq"\n' +
        '  on "curriculum_books" ("subject_id", lower("title"));',
    );
    expect(migration).toContain(
      'create unique index if not exists "curriculum_topics_book_title_lower_uq"\n' +
        '  on "curriculum_topics" ("book_id", lower("title"));',
    );
    expect(migration).not.toContain('subjects_profile_name_lower_active_uq');
  });

  it('contains no data mutation or replay of migration 0044', () => {
    const migration = readMigration();

    expect(migration).not.toMatch(
      /\b(delete\s+from|update\s+|insert\s+into|merge\s+into)\b/,
    );
    expect(migration).not.toContain('_book_dedup_map');
    expect(migration).not.toContain('set status');
  });
});
