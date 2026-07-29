/**
 * Disposable-Postgres regression coverage for WI-2791.
 *
 * The local repo environment points at shared staging, so this suite refuses
 * every non-loopback DATABASE_URL before opening a connection. CI supplies a
 * disposable local pgvector service and is the authorized execution lane.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { loadDatabaseEnv } from '@eduagent/test-utils';

import { cleanupCurriculumDedupIndexRepairTest } from './curriculum-dedup-index-repair-cleanup';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

jest.setTimeout(120_000);

const REPO_ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'apps/api/drizzle');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta/_journal.json');
const REPAIR_TAG = '0159_wi2791_curriculum_dedup_index_repair';
const INDEX_NAMES = [
  'curriculum_books_subject_title_lower_uq',
  'curriculum_topics_book_title_lower_uq',
] as const;

const IDS = {
  personA: '01982b80-0000-7000-8000-000000000001',
  personB: '01982b80-0000-7000-8000-000000000002',
  subjectA: '01982b80-0000-7000-8000-000000000011',
  subjectArchived: '01982b80-0000-7000-8000-000000000012',
  subjectProfileVariant: '01982b80-0000-7000-8000-000000000013',
  curriculumA: '01982b80-0000-7000-8000-000000000021',
  curriculumArchived: '01982b80-0000-7000-8000-000000000022',
  curriculumProfileVariant: '01982b80-0000-7000-8000-000000000023',
  bookA: '01982b80-0000-7000-8000-000000000031',
  duplicateBook: '01982b80-0000-7000-8000-000000000032',
  archivedBook: '01982b80-0000-7000-8000-000000000033',
  profileVariantBook: '01982b80-0000-7000-8000-000000000034',
  rejectedBook: '01982b80-0000-7000-8000-000000000035',
  topicA: '01982b80-0000-7000-8000-000000000041',
  duplicateTopic: '01982b80-0000-7000-8000-000000000042',
  archivedTopic: '01982b80-0000-7000-8000-000000000043',
  profileVariantTopic: '01982b80-0000-7000-8000-000000000044',
  rejectedTopic: '01982b80-0000-7000-8000-000000000045',
} as const;

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface IndexCatalogRow {
  index_name: string;
  table_name: string;
  is_unique: boolean;
  index_definition: string;
  predicate: string | null;
}

function requireDisposableDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is required for the disposable DB suite.');
  }

  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(
      `Refusing non-disposable database host "${url.hostname}"; this suite runs only against loopback Postgres.`,
    );
  }
  return rawUrl;
}

function loadJournalEntries(): JournalEntry[] {
  return (
    JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
      entries: JournalEntry[];
    }
  ).entries;
}

function writeMigrationsFolder(entries: JournalEntry[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'wi2791-curriculum-index-repair-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(
    join(dir, 'meta/_journal.json'),
    JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
  );
  for (const entry of entries) {
    writeFileSync(
      join(dir, `${entry.tag}.sql`),
      readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8'),
    );
  }
  return dir;
}

function buildScratchUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function sqlState(error: unknown): string | undefined {
  const typed = error as {
    code?: string;
    cause?: { code?: string };
  };
  return typed.code ?? typed.cause?.code;
}

function errorText(error: unknown): string {
  const typed = error as Error & { cause?: Error };
  return `${typed.message ?? ''} ${typed.cause?.message ?? ''}`;
}

async function expectPostgresError(
  promise: Promise<unknown>,
  code: string,
  message: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect(sqlState(caught)).toBe(code);
  expect(errorText(caught)).toContain(message);
}

async function loadIndexCatalog(pool: Pool): Promise<IndexCatalogRow[]> {
  const result = await pool.query<IndexCatalogRow>(
    `SELECT
       index_class.relname AS index_name,
       table_class.relname AS table_name,
       index_meta.indisunique AS is_unique,
       pg_get_indexdef(index_meta.indexrelid) AS index_definition,
       pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate
     FROM pg_index index_meta
     JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
     JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
     WHERE index_class.relname = ANY($1::text[])
     ORDER BY index_class.relname`,
    [INDEX_NAMES],
  );
  return result.rows;
}

describe('curriculum dedup index repair on disposable Postgres [WI-2791]', () => {
  const baseUrl = requireDisposableDatabaseUrl();
  const scratchRunId = randomBytes(4).toString('hex');
  const databaseName = `wi2791_repair_${scratchRunId}`;
  const scratchApplicationName = `wi2791-repair-${scratchRunId}`;
  const scratchUrl = buildScratchUrl(baseUrl, databaseName);
  const tempDirs: string[] = [];

  let adminPool: Pool;
  let scratchPool: Pool;
  let repairMigrationsDir: string;
  let repairSql: string;

  beforeAll(async () => {
    const allEntries = loadJournalEntries();
    const repairEntry = allEntries.find((entry) => entry.tag === REPAIR_TAG);
    if (!repairEntry) {
      throw new Error(`Missing journal entry ${REPAIR_TAG}`);
    }

    const preRepairEntries = allEntries.filter(
      (entry) => entry.idx < repairEntry.idx,
    );
    const preRepairDir = writeMigrationsFolder(preRepairEntries);
    repairMigrationsDir = writeMigrationsFolder([repairEntry]);
    tempDirs.push(preRepairDir, repairMigrationsDir);
    repairSql = readFileSync(join(MIGRATIONS_DIR, `${REPAIR_TAG}.sql`), 'utf8');

    adminPool = new Pool({ connectionString: baseUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    scratchPool = new Pool({
      connectionString: scratchUrl,
      application_name: scratchApplicationName,
    });
    await scratchPool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await migrate(drizzle(scratchPool), { migrationsFolder: preRepairDir });

    // Reproduce the exact ledger/catalog drift without replaying 0043 or 0044.
    await scratchPool.query(
      `DROP INDEX IF EXISTS "curriculum_books_subject_title_lower_uq";
       DROP INDEX IF EXISTS "curriculum_topics_book_title_lower_uq";`,
    );

    await scratchPool.query(
      `INSERT INTO person (id, display_name, birth_date, residence_jurisdiction)
       VALUES ($1, 'Learner A', DATE '2000-01-01', 'GB')`,
      [IDS.personA],
    );
    await scratchPool.query(
      `INSERT INTO subjects (id, profile_id, name, status)
       VALUES ($1, $2, 'Math', 'active')`,
      [IDS.subjectA, IDS.personA],
    );
    await scratchPool.query(
      `INSERT INTO curricula (id, subject_id) VALUES ($1, $2)`,
      [IDS.curriculumA, IDS.subjectA],
    );
    await scratchPool.query(
      `INSERT INTO curriculum_books (id, subject_id, title, sort_order)
       VALUES ($1, $2, 'Algebra', 1)`,
      [IDS.bookA, IDS.subjectA],
    );
    await scratchPool.query(
      `INSERT INTO curriculum_topics
         (id, curriculum_id, title, description, sort_order, estimated_minutes, book_id)
       VALUES ($1, $2, 'Fractions', 'Core fractions', 1, 20, $3)`,
      [IDS.topicA, IDS.curriculumA, IDS.bookA],
    );
  });

  afterAll(async () => {
    await cleanupCurriculumDedupIndexRepairTest({
      adminPool,
      scratchPool,
      databaseName,
      ownedApplicationName: scratchApplicationName,
      tempDirs,
    });
  });

  it('starts with both indexes absent despite the earlier migrations being ledgered', async () => {
    expect(await loadIndexCatalog(scratchPool)).toEqual([]);

    const ledger = await scratchPool.query<{ migration_count: string }>(
      `SELECT count(*)::text AS migration_count
       FROM drizzle.__drizzle_migrations`,
    );
    expect(Number(ledger.rows[0]?.migration_count)).toBeGreaterThan(44);
  });

  it('rejects duplicate groups before creating either index and leaves data untouched', async () => {
    await scratchPool.query(
      `INSERT INTO curriculum_books (id, subject_id, title, sort_order)
       VALUES ($1, $2, 'ALGEBRA', 2)`,
      [IDS.duplicateBook, IDS.subjectA],
    );
    await scratchPool.query(
      `INSERT INTO curriculum_topics
         (id, curriculum_id, title, description, sort_order, estimated_minutes, book_id)
       VALUES ($1, $2, 'FRACTIONS', 'Duplicate fractions', 2, 20, $3)`,
      [IDS.duplicateTopic, IDS.curriculumA, IDS.bookA],
    );

    await expectPostgresError(
      migrate(drizzle(scratchPool), {
        migrationsFolder: repairMigrationsDir,
      }),
      'P0001',
      'book duplicate groups=1, topic duplicate groups=1',
    );

    expect(await loadIndexCatalog(scratchPool)).toEqual([]);
    const duplicates = await scratchPool.query<{ row_count: string }>(
      `SELECT count(*)::text AS row_count
       FROM curriculum_books
       WHERE id = $1
       UNION ALL
       SELECT count(*)::text AS row_count
       FROM curriculum_topics
       WHERE id = $2`,
      [IDS.duplicateBook, IDS.duplicateTopic],
    );
    expect(duplicates.rows).toEqual([{ row_count: '1' }, { row_count: '1' }]);

    await scratchPool.query('DELETE FROM curriculum_topics WHERE id = $1', [
      IDS.duplicateTopic,
    ]);
    await scratchPool.query('DELETE FROM curriculum_books WHERE id = $1', [
      IDS.duplicateBook,
    ]);
  });

  it('installs both indexes with the intended definitions', async () => {
    await migrate(drizzle(scratchPool), {
      migrationsFolder: repairMigrationsDir,
    });

    const indexes = await loadIndexCatalog(scratchPool);
    expect(indexes).toHaveLength(2);
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index_name: 'curriculum_books_subject_title_lower_uq',
          table_name: 'curriculum_books',
          is_unique: true,
          predicate: null,
        }),
        expect.objectContaining({
          index_name: 'curriculum_topics_book_title_lower_uq',
          table_name: 'curriculum_topics',
          is_unique: true,
          predicate: null,
        }),
      ]),
    );
    expect(indexes[0]?.index_definition).toContain(
      '(subject_id, lower(title))',
    );
    expect(indexes[1]?.index_definition).toContain('(book_id, lower(title))');
  });

  it('is safe to apply repeatedly after the repair', async () => {
    await scratchPool.query(repairSql);
    await scratchPool.query(repairSql);

    expect(await loadIndexCatalog(scratchPool)).toHaveLength(2);
  });

  it('rejects same-parent conflicts but permits archived and profile variants', async () => {
    await expectPostgresError(
      scratchPool.query(
        `INSERT INTO curriculum_books (id, subject_id, title, sort_order)
         VALUES ($1, $2, 'ALGEBRA', 99)`,
        [IDS.rejectedBook, IDS.subjectA],
      ),
      '23505',
      'curriculum_books_subject_title_lower_uq',
    );
    await expectPostgresError(
      scratchPool.query(
        `INSERT INTO curriculum_topics
           (id, curriculum_id, title, description, sort_order, estimated_minutes, book_id)
         VALUES ($1, $2, 'FRACTIONS', 'Rejected duplicate', 99, 20, $3)`,
        [IDS.rejectedTopic, IDS.curriculumA, IDS.bookA],
      ),
      '23505',
      'curriculum_topics_book_title_lower_uq',
    );

    await scratchPool.query(
      `INSERT INTO person (id, display_name, birth_date, residence_jurisdiction)
       VALUES ($1, 'Learner B', DATE '2000-01-01', 'GB')`,
      [IDS.personB],
    );
    await scratchPool.query(
      `INSERT INTO subjects (id, profile_id, name, status)
       VALUES
         ($1, $3, 'Archived Math', 'archived'),
         ($2, $4, 'Math', 'active')`,
      [
        IDS.subjectArchived,
        IDS.subjectProfileVariant,
        IDS.personA,
        IDS.personB,
      ],
    );
    await scratchPool.query(
      `INSERT INTO curricula (id, subject_id)
       VALUES ($1, $3), ($2, $4)`,
      [
        IDS.curriculumArchived,
        IDS.curriculumProfileVariant,
        IDS.subjectArchived,
        IDS.subjectProfileVariant,
      ],
    );
    await scratchPool.query(
      `INSERT INTO curriculum_books (id, subject_id, title, sort_order)
       VALUES
         ($1, $3, 'Algebra', 1),
         ($2, $4, 'Algebra', 1)`,
      [
        IDS.archivedBook,
        IDS.profileVariantBook,
        IDS.subjectArchived,
        IDS.subjectProfileVariant,
      ],
    );
    await scratchPool.query(
      `INSERT INTO curriculum_topics
         (id, curriculum_id, title, description, sort_order, estimated_minutes, book_id)
       VALUES
         ($1, $3, 'Fractions', 'Archived variant', 1, 20, $5),
         ($2, $4, 'Fractions', 'Profile variant', 1, 20, $6)`,
      [
        IDS.archivedTopic,
        IDS.profileVariantTopic,
        IDS.curriculumArchived,
        IDS.curriculumProfileVariant,
        IDS.archivedBook,
        IDS.profileVariantBook,
      ],
    );

    const variants = await scratchPool.query<{ row_count: string }>(
      `SELECT count(*)::text AS row_count
       FROM curriculum_books
       WHERE lower(title) = 'algebra'
       UNION ALL
       SELECT count(*)::text AS row_count
       FROM curriculum_topics
       WHERE lower(title) = 'fractions'`,
    );
    expect(variants.rows).toEqual([{ row_count: '3' }, { row_count: '3' }]);
  });
});
