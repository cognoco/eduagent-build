/**
 * WI-1628 durable regression guard for partial Drizzle-journal drift.
 *
 * Run with:
 *   node --test packages/database/scripts/verify-migration-journal.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractDdlProbes,
  findUnsupportedDdlStatements,
  pendingMigrationDdlProbes,
  reconcileMigrationJournal,
} from './verify-migration-journal-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github/workflows/deploy.yml');

const migrations = [
  { idx: 0, tag: '0000_first', when: 100, hash: 'hash-0', sql: '' },
  {
    idx: 1,
    tag: '0001_activation',
    when: 200,
    hash: 'hash-1',
    sql: 'CREATE TABLE "activation_events" ("id" uuid PRIMARY KEY);',
  },
  {
    idx: 2,
    tag: '0002_status',
    when: 300,
    hash: 'hash-2',
    sql: `ALTER TYPE "public"."mentor_notice_status" ADD VALUE 'not_yet';`,
  },
];

test('accepts a contiguous applied prefix and leaves the tail pending', () => {
  const result = reconcileMigrationJournal({
    migrations,
    appliedRows: [{ hash: 'hash-0', created_at: '100' }],
  });

  assert.deepEqual(
    result.pending.map((migration) => migration.tag),
    ['0001_activation', '0002_status'],
  );
});

test('rejects one missing migration row inside an otherwise-applied journal', () => {
  assert.throws(
    () =>
      reconcileMigrationJournal({
        migrations,
        appliedRows: [
          { hash: 'hash-0', created_at: '100' },
          { hash: 'hash-2', created_at: '300' },
        ],
      }),
    /missing applied migration.*0001_activation/i,
  );
});

test('rejects a live journal row whose hash is not in the committed chain', () => {
  assert.throws(
    () =>
      reconcileMigrationJournal({
        migrations,
        appliedRows: [{ hash: 'out-of-chain', created_at: '100' }],
      }),
    /unknown migration hash/i,
  );
});

test('rejects a hash whose created_at does not match the committed journal', () => {
  assert.throws(
    () =>
      reconcileMigrationJournal({
        migrations,
        appliedRows: [{ hash: 'hash-0', created_at: '999' }],
      }),
    /created_at mismatch/i,
  );
});

test('extracts catalog probes for every recurring collision shape', () => {
  const probes = extractDdlProbes(`
    CREATE TABLE "activation_events" ("id" uuid);
    CREATE UNIQUE INDEX "activation_events_id_uq" ON "activation_events" ("id");
    ALTER TABLE "consent_grant" ADD COLUMN "withdrawal_token_id" uuid;
    ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_id_fk"
      FOREIGN KEY ("id") REFERENCES "person" ("id");
    CREATE TYPE "public"."mentor_notice_status" AS ENUM ('open');
    ALTER TYPE "public"."mentor_notice_status" ADD VALUE 'not_yet';
    CREATE POLICY "activation_events_profile_isolation"
      ON "activation_events" USING (true);
    ALTER TABLE "curriculum_topics"
      ALTER COLUMN "book_id" SET NOT NULL;
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  assert.deepEqual(probes, [
    {
      kind: 'relation',
      schema: 'public',
      name: 'activation_events',
      description: 'table public.activation_events',
    },
    {
      kind: 'relation',
      schema: 'public',
      name: 'activation_events_id_uq',
      description: 'index public.activation_events_id_uq',
    },
    {
      kind: 'column',
      schema: 'public',
      table: 'consent_grant',
      name: 'withdrawal_token_id',
      description: 'column public.consent_grant.withdrawal_token_id',
    },
    {
      kind: 'constraint',
      schema: 'public',
      table: 'activation_events',
      name: 'activation_events_id_fk',
      description:
        'constraint public.activation_events.activation_events_id_fk',
    },
    {
      kind: 'type',
      schema: 'public',
      name: 'mentor_notice_status',
      description: 'type public.mentor_notice_status',
    },
    {
      kind: 'enum-value',
      schema: 'public',
      type: 'mentor_notice_status',
      value: 'not_yet',
      description: 'enum value public.mentor_notice_status.not_yet',
    },
    {
      kind: 'policy',
      schema: 'public',
      table: 'activation_events',
      name: 'activation_events_profile_isolation',
      description:
        'policy public.activation_events.activation_events_profile_isolation',
    },
    {
      kind: 'column-nullability',
      schema: 'public',
      table: 'curriculum_topics',
      name: 'book_id',
      notNull: true,
      description: 'not-null column public.curriculum_topics.book_id',
    },
    {
      kind: 'row-level-security',
      schema: 'public',
      table: 'profiles',
      enabled: true,
      description: 'row-level security public.profiles enabled',
    },
    {
      kind: 'extension',
      name: 'pg_trgm',
      description: 'extension pg_trgm',
    },
  ]);
});

test('extracts effects from the real migrations previously missed by the guard', () => {
  const realCases = [
    {
      file: '0014_young_ravenous.sql',
      expected: {
        kind: 'column-nullability',
        schema: 'public',
        table: 'curriculum_topics',
        name: 'book_id',
        notNull: true,
        description: 'not-null column public.curriculum_topics.book_id',
      },
    },
    {
      file: '0027_enable_rls.sql',
      expected: {
        kind: 'row-level-security',
        schema: 'public',
        table: 'profiles',
        enabled: true,
        description: 'row-level security public.profiles enabled',
      },
    },
    {
      file: '0047_mean_la_nuit.sql',
      expected: {
        kind: 'extension',
        name: 'pg_trgm',
        description: 'extension pg_trgm',
      },
    },
  ];

  for (const { file, expected } of realCases) {
    const source = readFileSync(
      path.join(REPO_ROOT, 'apps/api/drizzle', file),
      'utf8',
    );
    assert.ok(
      extractDdlProbes(source).some(
        (probe) => JSON.stringify(probe) === JSON.stringify(expected),
      ),
      `${file} must produce ${expected.description}`,
    );
  }
});

test('idempotent DDL still emits a drift probe when its journal row is absent', () => {
  assert.deepEqual(
    extractDdlProbes('CREATE EXTENSION IF NOT EXISTS pg_trgm;'),
    [
      {
        kind: 'extension',
        name: 'pg_trgm',
        description: 'extension pg_trgm',
      },
    ],
  );
});

test('suppresses an idempotent repair only when the same effect is already journaled', () => {
  const migration = (file) => ({
    sql: readFileSync(path.join(REPO_ROOT, 'apps/api/drizzle', file), 'utf8'),
  });
  const pendingMigration = migration('0056_schema_drift_repair.sql');
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [
      migration('0047_mean_la_nuit.sql'),
      migration('0048_sticky_genesis.sql'),
      migration('0053_topic_notes_session_idx.sql'),
    ],
    pendingMigration,
  });
  const descriptions = probes.map((probe) => probe.description);

  assert.deepEqual(findUnsupportedDdlStatements(pendingMigration.sql), []);
  assert.ok(
    !descriptions.includes('extension pg_trgm'),
    'already-journaled idempotent extension must not look like tail drift',
  );
  assert.ok(
    !descriptions.includes('index public.topic_notes_topic_profile_idx'),
    'already-journaled idempotent index must not look like tail drift',
  );
  assert.ok(
    descriptions.includes(
      'column public.xp_ledger.reflection_multiplier_applied',
    ),
    'a new idempotent effect must still be probed',
  );

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration: {
        sql: 'CREATE EXTENSION IF NOT EXISTS pg_trgm;',
      },
    }),
    [
      {
        kind: 'extension',
        name: 'pg_trgm',
        description: 'extension pg_trgm',
      },
    ],
  );
});

test('fails closed for pending DDL whose catalog effect is not understood', () => {
  assert.deepEqual(
    findUnsupportedDdlStatements(`
      ALTER TABLE "profiles"
        ALTER COLUMN "conversation_language" SET DEFAULT 'en';
      DROP INDEX IF EXISTS "legacy_profile_idx";
    `),
    [
      'ALTER TABLE "profiles" ALTER COLUMN "conversation_language" SET DEFAULT \'en\'',
    ],
  );
  assert.deepEqual(
    findUnsupportedDdlStatements('DROP INDEX IF EXISTS "legacy_profile_idx";'),
    [],
    'an explicitly idempotent drop cannot collide and stays non-blocking',
  );
  assert.deepEqual(
    findUnsupportedDdlStatements(`
      ALTER TABLE "curriculum_topics"
        ALTER COLUMN "book_id" SET NOT NULL;
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `),
    [],
  );

  const verifier = readFileSync(
    path.join(
      REPO_ROOT,
      'packages/database/scripts/verify-migration-journal.mjs',
    ),
    'utf8',
  );
  assert.match(verifier, /findUnsupportedDdlStatements\(migration\.sql\)/);
  assert.match(verifier, /cannot safely verify pending DDL/i);
});

test('deploy preflight runs after target verification and before migrate', () => {
  const workflow = readFileSync(DEPLOY_YML, 'utf8');
  const apiDeployStart = workflow.indexOf('\n  api-deploy:');
  const apiDeployEnd = workflow.indexOf(
    '\n  mobile-confirm-production:',
    apiDeployStart,
  );
  const block = workflow.slice(
    apiDeployStart,
    apiDeployEnd > 0 ? apiDeployEnd : undefined,
  );

  const targetIndex = block.indexOf('verify-db-target.mjs');
  const journalIndex = block.indexOf('verify-migration-journal.mjs');
  const migrateIndex = block.indexOf('drizzle-kit migrate');

  assert.ok(targetIndex >= 0, 'target verifier is missing');
  assert.ok(journalIndex >= 0, 'migration journal verifier is missing');
  assert.ok(migrateIndex >= 0, 'migration command is missing');
  assert.ok(
    targetIndex < journalIndex,
    'journal check must follow target check',
  );
  assert.ok(journalIndex < migrateIndex, 'journal check must precede migrate');
});
