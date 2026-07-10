/**
 * Integration: migration-tail replay on a profiles-dropped database [WI-1167]
 *
 * Reproduces the staging deploy blocker (~13h, WI-1128): `drizzle-kit migrate`
 * aborted at migration 0124 because the legacy `profiles` table had been
 * dropped out-of-band (v2 identity cutover — `person` is now the identity
 * table) before the migration tail (0124-0128) was ever applied. Fixed in
 * 56b9ded (repoint 0124's FK to `person`, catalog-gate 0128's `profiles`
 * ALTERs behind `to_regclass`).
 *
 * This test creates a scratch Postgres database, replays the real committed
 * chain through 0123 (the state staging/prod were actually in), physically
 * drops the legacy identity tables to mirror the out-of-band production
 * drop, then:
 *
 *   1. proves the ORIGINAL (pre-fix) 0124 FK — reconstructed here from the
 *      fix commit's diff, since applied migrations are immutable and cannot
 *      be reverted in place — aborts with 42P01 under these conditions
 *      (the actual incident).
 *   2. proves the ORIGINAL (pre-fix) 0128 ALTERs — same reconstruction — also
 *      abort with 42P01 independently of 0124.
 *   3. proves the REAL committed chain (0124 through the current tip) applies
 *      cleanly under the same conditions.
 *
 * The three tests share one scratch database and run in declaration order —
 * each builds on the schema state the previous test left behind — to avoid
 * replaying the ~130-migration chain from scratch three times.
 *
 * Runs against a real database; per repo convention for co-located
 * `.integration.test.ts` files, this is not required to pass locally — CI
 * (a fresh `pgvector/pgvector:pg16` service with a superuser role) is the
 * gate.
 */

import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadDatabaseEnv } from '@eduagent/test-utils';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

jest.setTimeout(120_000);

const REPO_ROOT = resolve(__dirname, '../../../..');
const REAL_MIGRATIONS_DIR = join(REPO_ROOT, 'apps/api/drizzle');
const JOURNAL_PATH = join(REAL_MIGRATIONS_DIR, 'meta/_journal.json');

// [WI-1139] Legacy identity tables dropped out-of-band ahead of the v2
// person/organization cutover — same list as
// apps/api/src/test-utils/legacy-identity-anchors.ts.
const LEGACY_IDENTITY_TABLES = [
  'accounts',
  'profiles',
  'family_links',
  'consent_states',
  'subscriptions',
] as const;

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function loadJournalEntries(): JournalEntry[] {
  const parsed = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: JournalEntry[];
  };
  return parsed.entries;
}

function findEntry(entries: JournalEntry[], tagPrefix: string): JournalEntry {
  const entry = entries.find((e) => e.tag.startsWith(tagPrefix));
  if (!entry) {
    throw new Error(`No journal entry found with tag prefix "${tagPrefix}"`);
  }
  return entry;
}

function readRealMigrationSql(tag: string): string {
  return readFileSync(join(REAL_MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
}

/**
 * Writes a scratch drizzle migrations folder (journal + .sql files) so
 * `migrate()` can replay an arbitrary subset — or a reconstructed pre-fix
 * variant — of the real chain. `drizzle-orm`'s migrator only reads
 * `meta/_journal.json` plus the referenced `.sql` files (no snapshot JSON
 * required), so this is a faithful stand-in for `apps/api/drizzle`.
 */
function writeMigrationsFolder(
  entries: JournalEntry[],
  sqlByTag: Record<string, string>,
): string {
  const dir = mkdtempSync(join(tmpdir(), 'wi1167-migrate-replay-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(
    join(dir, 'meta/_journal.json'),
    JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
  );
  for (const entry of entries) {
    const content = sqlByTag[entry.tag];
    if (content === undefined) {
      throw new Error(`Missing SQL content for migration tag "${entry.tag}"`);
    }
    writeFileSync(join(dir, `${entry.tag}.sql`), content);
  }
  return dir;
}

function buildEphemeralUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/**
 * Asserts a migrate() call rejects with Postgres's undefined_table error
 * (42P01) mentioning `profiles`. drizzle-orm wraps the raw `pg` DatabaseError
 * in a `DrizzleQueryError` (`.cause` holds the original, whose `.code` is the
 * Postgres SQLSTATE) — and Jest's `toMatchObject` does not reliably match
 * asymmetric matchers against thrown Error instances — so this asserts via
 * an explicit try/catch and reads through `.cause` instead.
 */
async function expectUndefinedTableError(
  promise: Promise<unknown>,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  const err = caught as Error & { code?: string; cause?: { code?: string } };
  expect(err.code ?? err.cause?.code).toBe('42P01'); // undefined_table
  expect(err.message).toContain('profiles');
}

describe('migration-tail replay on a profiles-dropped database [WI-1167]', () => {
  const baseUrl = requireDatabaseUrl();
  const databaseName = `wi1167_replay_${randomBytes(4).toString('hex')}`;
  const ephemeralUrl = buildEphemeralUrl(baseUrl, databaseName);
  const tempDirs: string[] = [];

  let adminPool: Pool;
  let scratchPool: Pool;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: baseUrl });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    scratchPool = new Pool({ connectionString: ephemeralUrl });
    await scratchPool.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Phase 1: replay the real committed chain through 0123 — the state
    // staging/prod were actually in when `profiles` was dropped out-of-band.
    const allEntries = loadJournalEntries();
    const entry0123 = findEntry(allEntries, '0123_');
    const through0123 = allEntries.filter((e) => e.idx <= entry0123.idx);
    const phase1Sql: Record<string, string> = {};
    for (const entry of through0123) {
      phase1Sql[entry.tag] = readRealMigrationSql(entry.tag);
    }
    const phase1Dir = writeMigrationsFolder(through0123, phase1Sql);
    tempDirs.push(phase1Dir);
    await migrate(drizzle(scratchPool), { migrationsFolder: phase1Dir });

    // Mirror the out-of-band production drop that caused the incident.
    await scratchPool.query(
      `DROP TABLE IF EXISTS ${LEGACY_IDENTITY_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
    );
  });

  afterAll(async () => {
    await scratchPool?.end();
    await adminPool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await adminPool.end();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reproduces the incident: the pre-fix 0124 FK aborts with 42P01 once profiles is gone', async () => {
    const allEntries = loadJournalEntries();
    const entry124 = findEntry(allEntries, '0124_');
    const real0124 = readRealMigrationSql(entry124.tag);
    const fixedFk =
      'ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_profile_id_person_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;';
    expect(real0124).toContain(fixedFk);

    // Reconstructed from the fix commit (56b9ded) diff — the FK this
    // migration originally shipped with, before it was repointed from
    // `profiles` to `person`. Applied migrations are immutable, so the
    // pre-fix statement is preserved here rather than in the committed file.
    const preFix0124 = real0124.replace(
      fixedFk,
      'ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;',
    );
    expect(preFix0124).toContain('"public"."profiles"("id")');

    const dir = writeMigrationsFolder([entry124], {
      [entry124.tag]: preFix0124,
    });
    tempDirs.push(dir);

    await expectUndefinedTableError(
      migrate(drizzle(scratchPool), { migrationsFolder: dir }),
    );

    // The failed attempt runs in one transaction and must roll back fully —
    // 0124 stays pending for the real (fixed) tail applied further below.
    const { rows } = await scratchPool.query(
      `SELECT to_regclass('public.retrieval_events') AS reg`,
    );
    expect(rows[0].reg).toBeNull();
  });

  it('reproduces the secondary hazard: the pre-fix 0128 ALTERs abort with 42P01 without the catalog gate', async () => {
    const allEntries = loadJournalEntries();
    const entry0123 = findEntry(allEntries, '0123_');
    const entry127 = findEntry(allEntries, '0127_');
    const entry128 = findEntry(allEntries, '0128_');

    // Apply the real (fixed) 0124-0127 slice first, so this test reaches
    // 0128 in the same state the real chain would.
    const realSlice = allEntries.filter(
      (e) => e.idx > entry0123.idx && e.idx <= entry127.idx,
    );
    const realSliceSql: Record<string, string> = {};
    for (const entry of realSlice) {
      realSliceSql[entry.tag] = readRealMigrationSql(entry.tag);
    }
    const realSliceDir = writeMigrationsFolder(realSlice, realSliceSql);
    tempDirs.push(realSliceDir);
    await migrate(drizzle(scratchPool), { migrationsFolder: realSliceDir });

    // Reconstructed from the fix commit (56b9ded) diff — the unguarded
    // `profiles` ALTERs this migration originally shipped with, before the
    // `to_regclass('public.profiles')` catalog gate was added. Applied
    // migrations are immutable, so the pre-fix statements are preserved
    // here rather than in the committed file.
    const preFix0128 = [
      'ALTER TABLE "profiles" ADD COLUMN "birth_month" integer;',
      'ALTER TABLE "profiles" ADD COLUMN "birth_day" integer;',
      'ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_range_check" CHECK ("profiles"."birth_month" IS NULL OR ("profiles"."birth_month" BETWEEN 1 AND 12));',
      'ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_day_range_check" CHECK ("profiles"."birth_day" IS NULL OR ("profiles"."birth_day" BETWEEN 1 AND 31));',
      'ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_day_pairwise_check" CHECK (("profiles"."birth_month" IS NULL) = ("profiles"."birth_day" IS NULL));',
    ].join('--> statement-breakpoint\n');

    const real0128 = readRealMigrationSql(entry128.tag);
    expect(real0128).toContain("to_regclass('public.profiles')");
    expect(preFix0128).not.toContain('to_regclass');

    const dir = writeMigrationsFolder([entry128], {
      [entry128.tag]: preFix0128,
    });
    tempDirs.push(dir);

    await expectUndefinedTableError(
      migrate(drizzle(scratchPool), { migrationsFolder: dir }),
    );
  });

  it('applies the real committed tail (0124 through the current chain tip) cleanly', async () => {
    // 0124-0127 are already applied (previous test); this call is a no-op
    // for them and applies the real (fixed) 0128 onward through the tip.
    await migrate(drizzle(scratchPool), {
      migrationsFolder: REAL_MIGRATIONS_DIR,
    });

    const { rows } = await scratchPool.query(`
      SELECT ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_name = 'retrieval_events_profile_id_person_id_fk'
    `);
    expect(rows).toEqual([{ referenced_table: 'person' }]);

    // Confirms 0128's catalog-gated ALTERs correctly no-op — profiles must
    // still be absent post-replay, not resurrected by anything downstream.
    const profilesCheck = await scratchPool.query(
      `SELECT to_regclass('public.profiles') AS reg`,
    );
    expect(profilesCheck.rows[0].reg).toBeNull();
  });
});
