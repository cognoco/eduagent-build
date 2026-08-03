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
import { probeExists } from './migration-catalog-probes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github/workflows/deploy.yml');
const PRE_LAUNCH_CHECKLIST = path.join(
  REPO_ROOT,
  'docs/pre-launch-checklist.md',
);

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

test('rejects duplicate live journal rows for the same migration', () => {
  assert.throws(
    () =>
      reconcileMigrationJournal({
        migrations,
        appliedRows: [
          { hash: 'hash-0', created_at: '100' },
          { hash: 'hash-0', created_at: '100' },
        ],
      }),
    /journal.*duplicate.*hash-0/i,
  );
});

test('rejects duplicate hashes in the committed migration chain', () => {
  assert.throws(
    () =>
      reconcileMigrationJournal({
        migrations: [
          { idx: 0, tag: '0000_first', when: 100, hash: 'same-hash' },
          { idx: 1, tag: '0001_second', when: 200, hash: 'same-hash' },
        ],
        appliedRows: [],
      }),
    /committed migrations.*0000_first.*0001_second.*same-hash/i,
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
      relationKind: 'table',
      schema: 'public',
      name: 'activation_events',
      description: 'table public.activation_events',
    },
    {
      kind: 'type',
      schema: 'public',
      name: 'activation_events',
      description: 'table row type public.activation_events',
    },
    {
      kind: 'type',
      schema: 'public',
      name: '_activation_events',
      description: 'table array type public._activation_events',
    },
    {
      kind: 'relation',
      relationKind: 'index',
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
      kind: 'type',
      schema: 'public',
      name: '_mentor_notice_status',
      description: 'array type public._mentor_notice_status',
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

test('relation catalog probes require the expected relkind for drops', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return [{ exists: true }];
  };

  await probeExists(query, {
    kind: 'relation',
    relationKind: 'table',
    schema: 'public',
    name: 'profiles',
    expectedExists: true,
  });
  await probeExists(query, {
    kind: 'relation',
    relationKind: 'index',
    schema: 'public',
    name: 'profiles',
  });

  assert.match(calls[0].sql, /relation\.relkind = ANY/);
  assert.deepEqual(calls[0].params, ['public', 'profiles', true, ['r']]);
  assert.deepEqual(calls[1].params, ['public', 'profiles', false, ['i']]);
});

test('extracts every effect from a multi-action ALTER TABLE statement', () => {
  const statement = `
    ALTER TABLE "profiles"
      ADD COLUMN "new_flag" boolean,
      ADD CONSTRAINT "profiles_new_flag_check"
        CHECK (new_flag IS NOT NULL);
  `;

  assert.deepEqual(
    extractDdlProbes(statement).map((probe) => probe.description),
    [
      'column public.profiles.new_flag',
      'constraint public.profiles.profiles_new_flag_check',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(statement), []);
});

test('extracts every target from supported multi-target DROP statements', () => {
  const source = `
    DROP TABLE IF EXISTS "old_profiles", "old_sessions" RESTRICT;
    DROP TYPE IF EXISTS "old_status", "old_mode";
    DROP INDEX IF EXISTS "old_profile_idx", "old_session_idx";
    DROP EXTENSION IF EXISTS "old_audit", "old_search";
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'pre-drop table public.old_profiles',
      'pre-drop table public.old_sessions',
      'pre-drop type public.old_status',
      'pre-drop type public.old_mode',
      'pre-drop index public.old_profile_idx',
      'pre-drop index public.old_session_idx',
      'pre-drop extension old_audit',
      'pre-drop extension old_search',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'DROP EXTENSION IF EXISTS "old_audit", "old_search"',
  ]);
});

test('fails closed on an unnamed CREATE INDEX', () => {
  const source = 'CREATE INDEX ON "profiles" ("id");';

  assert.deepEqual(extractDdlProbes(source), []);
  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'CREATE INDEX ON "profiles" ("id")',
  ]);
});

test('derives an unqualified index name schema from its target table', () => {
  assert.deepEqual(
    extractDdlProbes('CREATE INDEX idx ON app.t(id);').map(
      ({ schema, name }) => ({ schema, name }),
    ),
    [{ schema: 'app', name: 'idx' }],
  );
  assert.deepEqual(
    extractDdlProbes(
      'CREATE UNIQUE INDEX mixed_idx ON tenant.records(id);',
    ).map(({ schema, name }) => ({ schema, name })),
    [{ schema: 'tenant', name: 'mixed_idx' }],
  );
});

test('folds simple unquoted PostgreSQL identifiers to lowercase', () => {
  const probes = extractDdlProbes(`
    CREATE TABLE Foo (Bar integer);
    ALTER TABLE Foo ADD COLUMN Baz integer;
  `);

  assert.deepEqual(
    probes.map(({ kind, schema, table, name }) => ({
      kind,
      schema,
      ...(table ? { table } : {}),
      name,
    })),
    [
      { kind: 'relation', schema: 'public', name: 'foo' },
      { kind: 'type', schema: 'public', name: 'foo' },
      { kind: 'type', schema: 'public', name: '_foo' },
      { kind: 'column', schema: 'public', table: 'foo', name: 'baz' },
    ],
  );
});

test('fails closed on identifier forms outside the supported lexer subset', () => {
  for (const source of [
    'CREATE TABLE foo$bar$baz (id int);',
    'CREATE TABLE "a""b" (id int);',
    'CREATE TABLE U&"d\\0061t" (id int);',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on mixed-ASCII Unicode unquoted identifiers', () => {
  for (const source of [
    'CREATE TABLE café(id integer);',
    `CREATE TYPE mød AS ENUM ('focused');`,
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
  assert.deepEqual(
    extractDdlProbes('CREATE TABLE "café" (id integer);')[0].name,
    'café',
  );
});

test('fails closed on constraints that create implicit backing relations', () => {
  for (const source of [
    'ALTER TABLE "profiles" ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");',
    'CREATE TABLE "profiles_copy" ("email" text UNIQUE);',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('preserves the suffix when PostgreSQL truncates an implicit primary-key index', () => {
  const tableName = 'a'.repeat(63);
  const probes = extractDdlProbes(
    `CREATE TABLE ${tableName} (id integer PRIMARY KEY);`,
  );

  assert.ok(
    probes.some(
      (probe) =>
        probe.kind === 'relation' &&
        probe.relationKind === 'index' &&
        probe.name === `${'a'.repeat(58)}_pkey`,
    ),
  );
});

test('normalizes identifiers to PostgreSQL 63-byte catalog names', () => {
  const tableName = 'a'.repeat(64);
  const source = `CREATE TABLE ${tableName} (id integer);`;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.name),
    ['a'.repeat(63), 'a'.repeat(63), `_${'a'.repeat(62)}`],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('fails closed when any action in a multi-action ALTER TABLE is unsupported', () => {
  const statement = `ALTER TABLE "profiles"
    ADD COLUMN "new_flag" boolean,
    ALTER COLUMN "conversation_language" SET DEFAULT 'en';`;

  assert.deepEqual(findUnsupportedDdlStatements(statement), [
    `ALTER TABLE "profiles" ADD COLUMN "new_flag" boolean, ALTER COLUMN "conversation_language" SET DEFAULT 'en'`,
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
  const appliedMigrations = [
    migration('0047_mean_la_nuit.sql'),
    migration('0048_sticky_genesis.sql'),
    migration('0053_topic_notes_session_idx.sql'),
  ];
  const probes = pendingMigrationDdlProbes({
    appliedMigrations,
    pendingMigration,
  });
  const descriptions = probes.map((probe) => probe.description);

  const unsupported = findUnsupportedDdlStatements(pendingMigration.sql, {
    appliedMigrations,
  });
  assert.equal(unsupported.length, 2);
  assert.ok(
    unsupported.every(
      (statement) =>
        statement.startsWith('DO $$') && statement.includes('ALTER TABLE'),
    ),
    'direct DDL inside procedural blocks must fail closed even when guarded',
  );
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
      DROP SCHEMA IF EXISTS legacy_schema;
    `),
    [
      'ALTER TABLE "profiles" ALTER COLUMN "conversation_language" SET DEFAULT \'en\'',
      'DROP SCHEMA IF EXISTS legacy_schema',
    ],
  );
  assert.deepEqual(
    findUnsupportedDdlStatements('DROP INDEX IF EXISTS "legacy_profile_idx";'),
    [],
    'a supported drop is represented by a negative-effect catalog probe',
  );
  assert.deepEqual(
    findUnsupportedDdlStatements(`
      ALTER TABLE "curriculum_topics"
        ALTER COLUMN "book_id" SET NOT NULL;
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `),
    ['CREATE EXTENSION IF NOT EXISTS pg_trgm'],
  );

  const verifier = readFileSync(
    path.join(
      REPO_ROOT,
      'packages/database/scripts/verify-migration-journal.mjs',
    ),
    'utf8',
  );
  assert.match(
    verifier,
    /findUnsupportedDdlStatements\(migration\.sql,\s*\{\s*appliedMigrations:\s*applied,\s*priorPendingMigrations/,
  );
  assert.match(verifier, /cannot safely verify pending DDL/i);
});

test('probes chain-established objects before a pending idempotent drop', () => {
  const appliedMigrations = [
    {
      sql: 'CREATE INDEX "legacy_profile_idx" ON "profiles" ("id");',
    },
  ];
  const pendingMigration = {
    sql: 'DROP INDEX IF EXISTS "legacy_profile_idx";',
  };

  assert.deepEqual(
    pendingMigrationDdlProbes({ appliedMigrations, pendingMigration }),
    [
      {
        kind: 'relation',
        relationKind: 'index',
        schema: 'public',
        name: 'legacy_profile_idx',
        expectedExists: true,
        optionalWhenUnestablished: true,
        description: 'pre-drop index public.legacy_profile_idx',
      },
    ],
  );
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration,
    }),
    [
      {
        kind: 'relation',
        relationKind: 'index',
        schema: 'public',
        name: 'legacy_profile_idx',
        expectedExists: false,
        optionalWhenUnestablished: true,
        description:
          'absence before optional drop index public.legacy_profile_idx',
      },
    ],
    'an IF EXISTS cleanup must verify that an unestablished object is absent live',
  );
});

test('probes an unquoted chain-established index before a pending drop', () => {
  const appliedMigrations = [
    {
      sql: 'CREATE INDEX legacy_profile_idx ON profiles (id);',
    },
  ];
  const pendingMigration = {
    sql: 'DROP INDEX IF EXISTS legacy_profile_idx;',
  };

  assert.equal(
    pendingMigrationDdlProbes({ appliedMigrations, pendingMigration }).length,
    1,
  );
});

test('models the real 0167 constraint replacements in source order', () => {
  const migration = (file) => ({
    sql: readFileSync(path.join(REPO_ROOT, 'apps/api/drizzle', file), 'utf8'),
  });
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [
      migration('0121_s5_visibility_contract.sql'),
      migration('0145_wi1753_family_join.sql'),
    ],
    pendingMigration: migration('0167_wi2534_resumable_family_join.sql'),
  }).filter(
    (probe) =>
      probe.name === 'family_join_invite_status_check' ||
      probe.name === 'support_visibility_audit_events_type_check',
  );

  assert.deepEqual(
    probes.map(({ name, expectedExists }) => ({ name, expectedExists })),
    [
      { name: 'family_join_invite_status_check', expectedExists: true },
      {
        name: 'support_visibility_audit_events_type_check',
        expectedExists: true,
      },
    ],
    'the entry catalog must verify the old constraints before each DROP, not expect the later ADD targets to be absent',
  );
  assert.deepEqual(
    findUnsupportedDdlStatements(
      migration('0167_wi2534_resumable_family_join.sql').sql,
    ),
    [],
    'the admitted staging migration must remain mechanically verifiable',
  );
});

test('emits only the first entry-state check for ordered replacements', () => {
  const appliedMigrations = [
    {
      sql: 'CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");',
    },
  ];

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: `
          DROP INDEX "profile_lookup_idx";
          CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");
          DROP INDEX "profile_lookup_idx";
          CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");
        `,
      },
    }).map((probe) => probe.description),
    ['pre-drop index public.profile_lookup_idx'],
  );

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration: {
        sql: `
          CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");
          DROP INDEX "profile_lookup_idx";
        `,
      },
    }).map((probe) => probe.description),
    ['index public.profile_lookup_idx'],
  );
});

test('keeps replacement state isolated by full catalog identity', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [],
    pendingMigration: {
      sql: `
        ALTER TABLE "family_join_invite"
          DROP CONSTRAINT "status_check",
          ADD CONSTRAINT "status_check" CHECK (status IN ('pending'));
        ALTER TABLE "other_invite"
          ADD CONSTRAINT "status_check" CHECK (status IN ('pending'));
      `,
    },
  });

  assert.deepEqual(
    probes.map((probe) => probe.description),
    [
      'pre-drop constraint public.family_join_invite.status_check',
      'constraint public.other_invite.status_check',
    ],
  );
});

test('handles optional replacement guards from their modeled chain state', () => {
  const pendingMigration = {
    sql: `
      DROP INDEX IF EXISTS "profile_lookup_idx";
      CREATE INDEX IF NOT EXISTS "profile_lookup_idx" ON "profiles" ("id");
    `,
  };

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration,
    }).map((probe) => ({
      description: probe.description,
      expectedExists: probe.expectedExists,
    })),
    [
      {
        description:
          'absence before optional drop index public.profile_lookup_idx',
        expectedExists: false,
      },
    ],
    'an unestablished optional drop asserts that live state is also absent',
  );
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: 'CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");',
        },
      ],
      pendingMigration,
    }).map((probe) => probe.description),
    ['pre-drop index public.profile_lookup_idx'],
    'a chain-established optional replacement still checks the entry object',
  );
});

test('optional drops assert absence instead of deleting out-of-band objects', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [],
    pendingMigration: {
      sql: `
        DROP TABLE IF EXISTS "orphan_table";
        DROP TYPE IF EXISTS "orphan_type";
        DROP INDEX IF EXISTS "orphan_idx";
        DROP EXTENSION IF EXISTS "orphan_extension";
      `,
    },
  });

  assert.deepEqual(
    probes.map(({ description, expectedExists }) => ({
      description,
      expectedExists,
    })),
    [
      {
        description: 'absence before optional drop table public.orphan_table',
        expectedExists: false,
      },
      {
        description: 'absence before optional drop type public.orphan_type',
        expectedExists: false,
      },
      {
        description: 'absence before optional drop index public.orphan_idx',
        expectedExists: false,
      },
      {
        description: 'absence before optional drop extension orphan_extension',
        expectedExists: false,
      },
    ],
  );
});

test('does not suppress guarded relation creation when the existing relkind differs', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [{ sql: 'CREATE TABLE "shared_name" (id uuid);' }],
      pendingMigration: {
        sql: 'CREATE INDEX IF NOT EXISTS "shared_name" ON "profiles" (id);',
      },
    }).map((probe) => probe.description),
    ['index public.shared_name'],
  );

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        { sql: 'CREATE INDEX "shared_name" ON "profiles" (id);' },
      ],
      pendingMigration: {
        sql: 'CREATE TABLE IF NOT EXISTS "shared_name" (id uuid);',
      },
    }).map((probe) => probe.description),
    [
      'table public.shared_name',
      'table row type public.shared_name',
      'table array type public._shared_name',
    ],
  );
});

test('uses the final applied state after ordered drop and recreate', () => {
  const appliedMigrations = [
    {
      sql: 'CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");',
    },
    {
      sql: `
        DROP INDEX "profile_lookup_idx";
        CREATE INDEX "profile_lookup_idx" ON "profiles" ("id");
      `,
    },
  ];

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: 'CREATE INDEX IF NOT EXISTS "profile_lookup_idx" ON "profiles" ("id");',
      },
    }).map((probe) => probe.description),
    ['guarded compatibility public.profile_lookup_idx'],
    'the applied replacement leaves a guarded compatibility check',
  );
});

test('tracks nullability and RLS flips by target rather than desired value', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration: {
        sql: `
          ALTER TABLE "profiles" ALTER COLUMN "nickname" SET NOT NULL;
          ALTER TABLE "profiles" ALTER COLUMN "nickname" DROP NOT NULL;
          ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
          ALTER TABLE "profiles" DISABLE ROW LEVEL SECURITY;
        `,
      },
    }).map((probe) => probe.description),
    [
      'not-null column public.profiles.nickname',
      'row-level security public.profiles enabled',
    ],
  );

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: `
            ALTER TABLE "profiles" ALTER COLUMN "nickname" SET NOT NULL;
            ALTER TABLE "profiles" ALTER COLUMN "nickname" DROP NOT NULL;
          `,
        },
      ],
      pendingMigration: {
        sql: 'ALTER TABLE "profiles" ALTER COLUMN "nickname" SET NOT NULL;',
      },
    }).map((probe) => probe.description),
    ['not-null column public.profiles.nickname'],
    'an earlier SET does not make a later SET redundant when the applied chain ended with DROP',
  );
});

test('does not probe child effects after a pending parent-table replacement', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [{ sql: 'CREATE TABLE "profile_cache" ("id" uuid);' }],
      pendingMigration: {
        sql: `
          DROP TABLE "profile_cache";
          CREATE TABLE "profile_cache" ("id" uuid);
          ALTER TABLE "profile_cache" ADD COLUMN "label" text;
          ALTER TABLE "profile_cache"
            ADD CONSTRAINT "profile_cache_label_check" CHECK (label <> '');
        `,
      },
    }).map((probe) => probe.description),
    ['pre-drop table public.profile_cache'],
  );
});

test('invalidates index state when its parent table is replaced', () => {
  const appliedMigrations = [
    {
      sql: `
        CREATE TABLE "profile_cache" ("id" uuid);
        CREATE INDEX "profile_cache_id_idx" ON "profile_cache" ("id");
      `,
    },
  ];

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: `
          DROP TABLE "profile_cache";
          CREATE TABLE "profile_cache" ("id" uuid);
          CREATE INDEX "profile_cache_id_idx" ON "profile_cache" ("id");
        `,
      },
    }).map((probe) => probe.description),
    [
      'index attachment public.profile_cache_id_idx on public.profile_cache',
      'pre-drop table public.profile_cache',
    ],
  );

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: `
          DROP TABLE "profile_cache";
          CREATE TABLE "profile_cache" ("id" uuid);
          DROP INDEX IF EXISTS "profile_cache_id_idx";
        `,
      },
    }).map((probe) => probe.description),
    [
      'index attachment public.profile_cache_id_idx on public.profile_cache',
      'pre-drop table public.profile_cache',
    ],
  );
});

test('still probes a schema-global index created on a new pending table', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [],
    pendingMigration: {
      sql: `
        CREATE TABLE "new_profile_cache" (id uuid);
        CREATE INDEX "shared_profile_idx" ON "new_profile_cache" (id);
      `,
    },
  });

  assert.deepEqual(
    probes.map((probe) => probe.description),
    [
      'table public.new_profile_cache',
      'table row type public.new_profile_cache',
      'table array type public._new_profile_cache',
      'index public.shared_profile_idx',
    ],
  );
});

test('invalidates enum-value state when its parent type is replaced', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: `
            CREATE TYPE "mood" AS ENUM ('base');
            ALTER TYPE "mood" ADD VALUE 'happy';
          `,
        },
      ],
      pendingMigration: {
        sql: `
          DROP TYPE "mood";
          CREATE TYPE "mood" AS ENUM ('base');
          ALTER TYPE "mood" ADD VALUE 'happy';
        `,
      },
    }).map((probe) => probe.description),
    ['pre-drop type public.mood'],
  );
});

test('applied table drops leave absence guards for later optional type drops', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [
      {
        sql: `
            CREATE TABLE "profile_cache" (id int);
            DROP TABLE "profile_cache";
          `,
      },
    ],
    pendingMigration: {
      sql: `
          DROP TYPE IF EXISTS "profile_cache";
          DROP TYPE IF EXISTS "_profile_cache";
        `,
    },
  });
  assert.deepEqual(
    probes.map(({ description, expectedExists }) => ({
      description,
      expectedExists,
    })),
    [
      {
        description: 'absence before optional drop type public.profile_cache',
        expectedExists: false,
      },
      {
        description: 'absence before optional drop type public._profile_cache',
        expectedExists: false,
      },
    ],
  );
});

test('tracks the owned array type removed with an established type', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        { sql: `CREATE TYPE "mentor_mood" AS ENUM ('focused');` },
      ],
      pendingMigration: {
        sql: `
          DROP TYPE "mentor_mood";
          CREATE TYPE "_mentor_mood" AS ENUM ('archived');
        `,
      },
    }).map((probe) => probe.description),
    ['pre-drop type public.mentor_mood', 'array type public.__mentor_mood'],
  );
});

test('keeps quoted semicolons inside one ordered multi-action ALTER TABLE', () => {
  const source = `
    ALTER TABLE "profile_cache"
      ADD CONSTRAINT "profile_cache_label_check" CHECK (label <> ';'),
      DROP CONSTRAINT "profile_cache_old_check";
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'constraint public.profile_cache.profile_cache_label_check',
      'pre-drop constraint public.profile_cache.profile_cache_old_check',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('keeps commas escaped inside PostgreSQL E-strings in multi-action ALTER TABLE', () => {
  const source = String.raw`
    ALTER TABLE "profile_cache"
      ADD COLUMN "note" text DEFAULT E'a\',b',
      DROP COLUMN "old_note";
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'column public.profile_cache.note',
      'pre-drop column public.profile_cache.old_note',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), [
    `ALTER TABLE "profile_cache" ADD COLUMN "note" text DEFAULT E'a\\',b', DROP COLUMN "old_note"`,
  ]);
});

test('keeps commas inside dollar-quoted defaults in multi-action ALTER TABLE', () => {
  const source = `
    ALTER TABLE "profile_cache"
      ADD COLUMN "note" text DEFAULT $copy$a,b$copy$,
      ADD CONSTRAINT "profile_cache_note_check" CHECK (note <> '');
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'column public.profile_cache.note',
      'constraint public.profile_cache.profile_cache_note_check',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('fails closed on dependency-cascading drops the state model cannot enumerate', () => {
  const source = `
    ALTER TABLE "profile_cache" DROP COLUMN "label" CASCADE;
    DROP TABLE "legacy_cache" CASCADE;
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'ALTER TABLE "profile_cache" DROP COLUMN "label" CASCADE',
    'DROP TABLE "legacy_cache" CASCADE',
  ]);
});

test('fails closed on DROP COLUMN because PostgreSQL removes implicit dependents', () => {
  const source = `
    ALTER TABLE "profile_cache" DROP COLUMN "label";
    ALTER TABLE "profile_cache" ADD COLUMN "label" text;
    ALTER TABLE "profile_cache"
      ADD CONSTRAINT "profile_cache_label_check" CHECK (label <> '');
    CREATE INDEX "profile_cache_label_idx" ON "profile_cache" ("label");
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'ALTER TABLE "profile_cache" DROP COLUMN "label"',
  ]);
});

test('fails closed when a dropped constraint is replaced by a same-name index', () => {
  const source = `
    ALTER TABLE "profile_cache"
      ADD CONSTRAINT "profile_cache_label_key" UNIQUE ("label");
    ALTER TABLE "profile_cache"
      DROP CONSTRAINT "profile_cache_label_key";
    CREATE INDEX "profile_cache_label_key" ON "profile_cache" ("label");
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'ALTER TABLE "profile_cache" ADD CONSTRAINT "profile_cache_label_key" UNIQUE ("label")',
    'CREATE INDEX "profile_cache_label_key" ON "profile_cache" ("label")',
  ]);
});

test('fails closed when a dropped constraint is replaced by any same-name relation', () => {
  const source = `
    ALTER TABLE "profile_cache"
      ADD CONSTRAINT "profile_cache_archive" UNIQUE ("label");
    ALTER TABLE "profile_cache"
      DROP CONSTRAINT "profile_cache_archive";
    CREATE TABLE "profile_cache_archive" ("label" text);
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'ALTER TABLE "profile_cache" ADD CONSTRAINT "profile_cache_archive" UNIQUE ("label")',
    'CREATE TABLE "profile_cache_archive" ("label" text)',
  ]);
});

test('carries dropped-constraint relation collisions across pending migrations', () => {
  const priorPendingMigrations = [
    {
      sql: `ALTER TABLE "profile_cache"
        DROP CONSTRAINT "profile_cache_label_key";`,
    },
  ];
  const source =
    'CREATE INDEX "profile_cache_label_key" ON "profile_cache" ("label");';

  assert.deepEqual(
    findUnsupportedDdlStatements(source, { priorPendingMigrations }),
    ['CREATE INDEX "profile_cache_label_key" ON "profile_cache" ("label")'],
  );
});

test('tracks same-name row and array types removed with a pending table drop', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [
      {
        sql: `
          CREATE TABLE "profile_cache" ("id" uuid);
          CREATE TABLE "session_cache" ("id" uuid);
        `,
      },
    ],
    pendingMigration: {
      sql: `
        DROP TABLE "profile_cache";
        CREATE TYPE "profile_cache" AS ENUM ('archived');
        DROP TABLE "session_cache";
        CREATE TYPE "_session_cache" AS ENUM ('archived');
      `,
    },
  });

  assert.deepEqual(
    probes.map((probe) => probe.description),
    [
      'pre-drop table public.profile_cache',
      'pre-drop table public.session_cache',
      'array type public.__session_cache',
    ],
  );
});

test('retains a type probe after an optional unestablished table drop', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      pendingMigration: {
        sql: `
          DROP TABLE IF EXISTS "profile_cache";
          CREATE TYPE "profile_cache" AS ENUM ('archived');
        `,
      },
    }).map((probe) => probe.description),
    [
      'absence before optional drop table public.profile_cache',
      'type public.profile_cache',
      'array type public._profile_cache',
    ],
  );
});

test('carries pending state across multiple unapplied migrations', () => {
  const firstPending = {
    sql: 'CREATE TABLE "pending_chain_table" ("id" uuid);',
  };
  const secondPending = {
    sql: 'DROP TABLE "pending_chain_table";',
  };

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [],
      priorPendingMigrations: [firstPending],
      pendingMigration: secondPending,
    }).map((probe) => probe.description),
    [],
    'the second migration consumes state established by the first pending migration, not by the live entry catalog',
  );

  const verifier = readFileSync(
    path.join(
      REPO_ROOT,
      'packages/database/scripts/verify-migration-journal.mjs',
    ),
    'utf8',
  );
  assert.match(verifier, /priorPendingMigrations/);
});

test('ignores DDL-looking text inside SQL comments, strings, and dollar blocks', () => {
  const source = `
    -- DROP INDEX ghost_line_comment;
    /* CREATE TABLE ghost_block_comment (id integer); */
    INSERT INTO audit_log(message) VALUES ('CREATE TYPE ghost_string AS ENUM (''x'')');
    DO $body$ BEGIN RAISE NOTICE 'DROP TABLE ghost_dollar'; END $body$;
    CREATE INDEX live_profile_idx ON profiles (id);
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.name),
    ['live_profile_idx'],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('fails closed on dollar-quoted dynamic DDL executed inside a DO block', () => {
  const source = `
    DO $body$
    BEGIN
      EXECUTE $ddl$ CREATE TABLE ghost(id int) $ddl$;
    END
    $body$;
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'DO $body$ BEGIN EXECUTE $ddl$ CREATE TABLE ghost(id int) $ddl$; END $body$',
  ]);
});

test('fails closed on dynamically composed EXECUTE inside a DO block', () => {
  const source = `
    DO $body$
    BEGIN
      EXECUTE format($fmt$%s TABLE ghost(id int)$fmt$, $kw$CREATE$kw$);
    END
    $body$;
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'DO $body$ BEGIN EXECUTE format($fmt$%s TABLE ghost(id int)$fmt$, $kw$CREATE$kw$); END $body$',
  ]);
});

test('fails closed on direct DDL inside a DO block', () => {
  const source = `
    DO $body$
    BEGIN
      CREATE TABLE ghost(id int);
    END
    $body$;
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'DO $body$ BEGIN CREATE TABLE ghost(id int); END $body$',
  ]);
});

test('fails closed when a DO body is not safely inspectable', () => {
  const source = `DO 'BEGIN CREATE TABLE ghost(id int); END';`;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    "DO 'BEGIN CREATE TABLE ghost(id int); END'",
  ]);
});

test('closes a standard SQL string after a trailing backslash', () => {
  const source = String.raw`
    INSERT INTO audit_log(message) VALUES ('C:\');
    CREATE TABLE "after_backslash" (id integer);
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'table public.after_backslash',
      'table row type public.after_backslash',
      'table array type public._after_backslash',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('keeps backslash escapes inside PostgreSQL E-strings', () => {
  const source = String.raw`
    INSERT INTO audit_log(message) VALUES (E'it\'s okay');
    CREATE TABLE "after_escape_string" (id integer);
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.description),
    [
      'table public.after_escape_string',
      'table row type public.after_escape_string',
      'table array type public._after_escape_string',
    ],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('ignores DDL-looking defaults inside a top-level CREATE TABLE', () => {
  const source = `
    CREATE TABLE actual_events (
      id integer,
      note text DEFAULT 'DROP TABLE ghost_literal'
    );
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => probe.name),
    ['actual_events', 'actual_events', '_actual_events'],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('fails closed on CREATE FUNCTION instead of probing DDL-looking body text', () => {
  const source = `
    CREATE FUNCTION actual_function() RETURNS void AS $body$
    BEGIN
      EXECUTE 'CREATE TABLE ghost_function (id integer)';
    END
    $body$ LANGUAGE plpgsql;
  `;

  assert.deepEqual(extractDdlProbes(source), []);
  assert.match(findUnsupportedDdlStatements(source)[0], /^CREATE FUNCTION/i);
});

test('retains enum labels while safely classifying supported ALTER TYPE DDL', () => {
  const source = `
    ALTER TYPE "public"."mood" ADD VALUE IF NOT EXISTS 'happy';
  `;

  assert.deepEqual(
    extractDdlProbes(source).map((probe) => ({
      kind: probe.kind,
      value: probe.value,
    })),
    [{ kind: 'enum-value', value: 'happy' }],
  );
  assert.deepEqual(findUnsupportedDdlStatements(source), []);
});

test('derives implicit names within PostgreSQL byte limits', () => {
  const tableName = 'é'.repeat(31);
  const probes = extractDdlProbes(
    `CREATE TABLE "${tableName}" (id integer PRIMARY KEY);`,
  );
  assert.ok(
    probes.some(
      (probe) =>
        probe.kind === 'relation' &&
        probe.relationKind === 'index' &&
        probe.name === `${'é'.repeat(29)}_pkey` &&
        Buffer.byteLength(probe.name, 'utf8') === 63,
    ),
  );

  const typeName = 'm'.repeat(63);
  const arrayName = `_${'m'.repeat(62)}`;
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        { sql: `CREATE TYPE "${typeName}" AS ENUM ('focused');` },
      ],
      pendingMigration: {
        sql: `DROP TYPE "${typeName}"; CREATE TYPE "${arrayName}" AS ENUM ('archived');`,
      },
    }).map((probe) => probe.description),
    [
      `pre-drop type public.${typeName}`,
      `array type public.__${'m'.repeat(61)}`,
    ],
  );
});

test('fails closed on SERIAL and IDENTITY sequence-producing DDL', () => {
  for (const source of [
    'CREATE TABLE "serial_table" (id serial);',
    'CREATE TABLE "identity_table" (id bigint GENERATED ALWAYS AS IDENTITY);',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on table forms that clone implicit catalog objects', () => {
  for (const source of [
    'CREATE TABLE "child" PARTITION OF "parent" FOR VALUES FROM (0) TO (10);',
    'CREATE TABLE "copy" (LIKE "parent" INCLUDING INDEXES);',
    'CREATE TABLE "child" () INHERITS ("parent");',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on opaque extension catalog effects', () => {
  for (const source of ['CREATE EXTENSION hstore;', 'DROP EXTENSION hstore;']) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on CREATE TYPE shapes with unmodeled implicit effects', () => {
  for (const source of [
    'CREATE TYPE "mentor_score_range" AS RANGE (subtype = float8);',
    'CREATE TYPE "mentor_shell";',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed when a migration changes search_path', () => {
  const source = `
    SET LOCAL search_path = app, public;
    CREATE TYPE mood AS ENUM ('focused');
  `;

  assert.deepEqual(findUnsupportedDdlStatements(source), [
    'SET LOCAL search_path = app, public',
  ]);
});

test('handles implicit primary-key indexes across replacement and guarded repeat', () => {
  const appliedMigrations = [
    { sql: 'CREATE TABLE "profile_cache" (id integer PRIMARY KEY);' },
  ];
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: 'DROP TABLE "profile_cache"; CREATE TABLE "profile_cache" (id integer PRIMARY KEY);',
      },
    }).map((probe) => probe.description),
    [
      'index attachment public.profile_cache_pkey on public.profile_cache',
      'pre-drop table public.profile_cache',
    ],
  );
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: 'CREATE TABLE IF NOT EXISTS "profile_cache" (id integer PRIMARY KEY);',
      },
    }).map((probe) => probe.description),
    [
      'guarded compatibility public.profile_cache',
      'guarded compatibility public.profile_cache_pkey',
    ],
  );
});

test('recognizes guarded repeats after PostgreSQL identifier truncation', () => {
  const longName = 'a'.repeat(64);
  const longIndex = 'i'.repeat(64);
  const longColumn = 'c'.repeat(64);
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: `
            CREATE TABLE "${longName}" (id integer);
            CREATE INDEX "${longIndex}" ON "${longName}" (id);
            ALTER TABLE "${longName}" ADD COLUMN "${longColumn}" integer;
          `,
        },
      ],
      pendingMigration: {
        sql: `
          CREATE TABLE IF NOT EXISTS "${longName}" (id integer);
          CREATE INDEX IF NOT EXISTS "${longIndex}" ON "${longName}" (id);
          ALTER TABLE "${longName}" ADD COLUMN IF NOT EXISTS "${longColumn}" integer;
        `,
      },
    }).map((probe) => probe.description),
    [
      `guarded compatibility public.${'a'.repeat(63)}`,
      `guarded compatibility public.${'i'.repeat(63)}`,
    ],
  );
});

test('does not suppress guarded table companions for a standalone type', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        { sql: `CREATE TYPE "profile_cache" AS ENUM ('archived');` },
      ],
      pendingMigration: {
        sql: 'CREATE TABLE IF NOT EXISTS "profile_cache" (id integer);',
      },
    }).map((probe) => probe.description),
    [
      'table public.profile_cache',
      'table row type public.profile_cache',
      'table array type public._profile_cache',
    ],
  );
});

test('fails closed on explicit creates that collide with prior implicit array types', () => {
  for (const [priorSql, pendingSql] of [
    [
      'CREATE TABLE "profile_cache" (id integer);',
      `CREATE TYPE "_profile_cache" AS ENUM ('archived');`,
    ],
    [
      `CREATE TYPE "mentor_mood" AS ENUM ('focused');`,
      `CREATE TYPE "_mentor_mood" AS ENUM ('archived');`,
    ],
  ]) {
    assert.throws(
      () =>
        pendingMigrationDdlProbes({
          appliedMigrations: [],
          priorPendingMigrations: [{ sql: priorSql }],
          pendingMigration: { sql: pendingSql },
        }),
      /recreates established catalog effect/i,
    );
  }
});

test('models CREATE TABLE inline nullability and default RLS state', () => {
  const appliedMigrations = [
    {
      sql: `CREATE TABLE "profile_cache" (
        "label" text NOT NULL,
        "optional_label" text CHECK (optional_label IS NOT NULL)
      );`,
    },
  ];

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: `
          ALTER TABLE "profile_cache" ALTER COLUMN "label" SET NOT NULL;
          ALTER TABLE "profile_cache" DISABLE ROW LEVEL SECURITY;
        `,
      },
    }).map((probe) => probe.description),
    [
      'parent precondition public.profile_cache',
      'column precondition public.profile_cache.label',
    ],
  );
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations,
      pendingMigration: {
        sql: 'ALTER TABLE "profile_cache" ALTER COLUMN "optional_label" SET NOT NULL;',
      },
    }).map((probe) => probe.description),
    [
      'parent precondition public.profile_cache',
      'column precondition public.profile_cache.optional_label',
      'not-null column public.profile_cache.optional_label',
    ],
  );
});

test('fails closed on ALTER COLUMN forms that create implicit sequences or indexes', () => {
  for (const source of [
    'ALTER TABLE t ADD COLUMN c serial;',
    'ALTER TABLE t ADD COLUMN c bigint GENERATED ALWAYS AS IDENTITY;',
    'ALTER TABLE t ADD COLUMN c integer UNIQUE;',
    'ALTER TABLE t ADD c integer PRIMARY KEY;',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on additional CREATE TABLE clone forms', () => {
  for (const source of [
    'CREATE TABLE copied (LIKE parent INCLUDING CONSTRAINTS);',
    'CREATE TABLE copied (LIKE parent INCLUDING IDENTITY);',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on qualified names with whitespace around the dot', () => {
  for (const source of [
    'CREATE TABLE app . t(id integer);',
    `CREATE TYPE app . mood AS ENUM ('focused');`,
    'DROP TABLE app . t;',
    'DROP TYPE app . mood;',
    'DROP INDEX app . idx;',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('fails closed on structural keywords inside quoted identifiers', () => {
  for (const source of [
    'CREATE INDEX "x ON fake" ON app.t(id);',
    'CREATE TABLE t("primary key" text);',
    'CREATE TABLE t("unique" text);',
  ]) {
    assert.deepEqual(findUnsupportedDdlStatements(source), [
      source.replace(/;$/, ''),
    ]);
  }
});

test('does not suppress a guarded index whose existing parent differs', () => {
  assert.throws(
    () =>
      pendingMigrationDdlProbes({
        appliedMigrations: [
          {
            sql: `
              CREATE TABLE table_a(id integer);
              CREATE TABLE table_b(id integer);
              CREATE INDEX shared_idx ON table_a(id);
            `,
          },
        ],
        pendingMigration: {
          sql: 'CREATE INDEX IF NOT EXISTS shared_idx ON table_b(id);',
        },
      }),
    /recreates established catalog effect/i,
  );
});

test('does not suppress a guarded implicit primary-key index collision', () => {
  assert.throws(
    () =>
      pendingMigrationDdlProbes({
        appliedMigrations: [
          {
            sql: `
              CREATE TABLE other(id integer);
              CREATE INDEX foo_pkey ON other(id);
            `,
          },
        ],
        pendingMigration: {
          sql: 'CREATE TABLE IF NOT EXISTS foo(id integer PRIMARY KEY);',
        },
      }),
    /recreates established catalog effect/i,
  );
});

test('requires an index attachment check before replacing its parent table', async () => {
  const [attachmentProbe] = pendingMigrationDdlProbes({
    appliedMigrations: [
      {
        sql: `
          CREATE TABLE profile_cache(id integer);
          CREATE INDEX profile_cache_id_idx ON profile_cache(id);
        `,
      },
    ],
    pendingMigration: {
      sql: 'DROP TABLE profile_cache; CREATE TABLE profile_cache(id integer);',
    },
  });
  const calls = [];
  await probeExists(async (sql, params) => {
    calls.push({ sql, params });
    return [{ exists: true }];
  }, attachmentProbe);

  assert.match(calls[0].sql, /pg_index/);
  assert.deepEqual(calls[0].params, [
    'public',
    'profile_cache_id_idx',
    ['i'],
    'public',
    'profile_cache',
  ]);
});

test('fails closed on pending partition-tree index and drop effects', () => {
  const appliedMigrations = [
    {
      sql: `
        CREATE TABLE parent(id integer) PARTITION BY RANGE(id);
        CREATE TABLE child PARTITION OF parent FOR VALUES FROM (0) TO (10);
      `,
    },
  ];
  for (const pendingMigration of [
    { sql: 'CREATE INDEX parent_idx ON parent(id);' },
    { sql: 'DROP TABLE parent;' },
  ]) {
    assert.throws(
      () =>
        pendingMigrationDdlProbes({
          appliedMigrations,
          pendingMigration,
        }),
      /Cannot safely model (?:index effects on partitioned table|partition-tree drop effects)/,
    );
  }

  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        { sql: 'CREATE TABLE parent(id integer) PARTITION BY RANGE(id);' },
      ],
      pendingMigration: {
        sql: 'CREATE TABLE IF NOT EXISTS parent(id integer) PARTITION BY RANGE(id);',
      },
    }).map((probe) => probe.description),
    ['guarded compatibility public.parent'],
  );
});

test('models implicit NOT NULL from applied primary-key and sequence forms', () => {
  for (const createSql of [
    'CREATE TABLE t(id integer PRIMARY KEY);',
    'CREATE TABLE t(id integer, PRIMARY KEY(id));',
    'CREATE TABLE t(id serial);',
    'CREATE TABLE t(id bigint GENERATED ALWAYS AS IDENTITY);',
  ]) {
    assert.deepEqual(
      pendingMigrationDdlProbes({
        appliedMigrations: [{ sql: createSql }],
        pendingMigration: {
          sql: 'ALTER TABLE t ALTER COLUMN id SET NOT NULL;',
        },
      }).map((probe) => probe.description),
      ['parent precondition public.t', 'column precondition public.t.id'],
      createSql,
    );
  }
});

test('uses an applied named primary-key index name instead of the default', () => {
  const probes = pendingMigrationDdlProbes({
    appliedMigrations: [
      {
        sql: 'CREATE TABLE t(id integer CONSTRAINT custom PRIMARY KEY); CREATE TABLE other(id integer);',
      },
    ],
    pendingMigration: { sql: 'CREATE INDEX t_pkey ON other(id);' },
  });

  assert.deepEqual(
    probes.map((probe) => probe.description),
    ['parent precondition public.other', 'index public.t_pkey'],
  );
});

test('checks the expected parent before dropping an applied index', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: 'CREATE TABLE a(id integer); CREATE INDEX idx ON a(id);',
        },
      ],
      pendingMigration: { sql: 'DROP INDEX idx;' },
    }),
    [
      {
        kind: 'relation',
        relationKind: 'table',
        schema: 'public',
        name: 'a',
        description: 'parent precondition public.a',
        expectedExists: true,
      },
      {
        kind: 'relation',
        relationKind: 'index',
        schema: 'public',
        name: 'idx',
        expectedExists: true,
        parentSchema: 'public',
        parentTable: 'a',
        description: 'pre-drop index public.idx',
      },
    ],
  );
});

test('tracks applied named constraint indexes through a parent-table drop', () => {
  for (const appliedSql of [
    'CREATE TABLE t(id integer CONSTRAINT custom_unique UNIQUE); CREATE TABLE other(id integer);',
    'CREATE TABLE t(id integer); ALTER TABLE t ADD CONSTRAINT custom_unique UNIQUE(id); CREATE TABLE other(id integer);',
    'CREATE TABLE t(id integer); ALTER TABLE t ADD CONSTRAINT custom_unique PRIMARY KEY(id); CREATE TABLE other(id integer);',
    'CREATE TABLE t(id integer CONSTRAINT custom_unique EXCLUDE USING gist (id WITH =)); CREATE TABLE other(id integer);',
  ]) {
    assert.deepEqual(
      pendingMigrationDdlProbes({
        appliedMigrations: [{ sql: appliedSql }],
        pendingMigration: {
          sql: 'DROP TABLE t; CREATE INDEX custom_unique ON other(id);',
        },
      }).map((probe) => probe.description),
      [
        'index attachment public.custom_unique on public.t',
        'pre-drop table public.t',
        'parent precondition public.other',
      ],
      appliedSql,
    );
  }
});

test('models default nullability from CREATE TABLE and ALTER ADD COLUMN', () => {
  for (const [appliedSql, pendingSql] of [
    ['CREATE TABLE t(c text);', 'ALTER TABLE t ALTER COLUMN c DROP NOT NULL;'],
    [
      'CREATE TABLE t(id integer); ALTER TABLE t ADD COLUMN c text;',
      'ALTER TABLE t ALTER COLUMN c DROP NOT NULL;',
    ],
    [
      'CREATE TABLE t(id integer); ALTER TABLE t ADD COLUMN c text NOT NULL;',
      'ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
    ],
  ]) {
    assert.deepEqual(
      pendingMigrationDdlProbes({
        appliedMigrations: [{ sql: appliedSql }],
        pendingMigration: { sql: pendingSql },
      }).map((probe) => probe.description),
      ['parent precondition public.t', 'column precondition public.t.c'],
      appliedSql,
    );
  }
});

test('fails closed before dropping tables with unnamed constraint indexes', () => {
  for (const appliedSql of [
    'CREATE TABLE t(id integer UNIQUE);',
    'CREATE TABLE t(id integer, UNIQUE(id));',
    'CREATE TABLE t(id integer, EXCLUDE USING gist (id WITH =));',
  ]) {
    assert.throws(
      () =>
        pendingMigrationDdlProbes({
          appliedMigrations: [{ sql: appliedSql }],
          pendingMigration: { sql: 'DROP TABLE t;' },
        }),
      /unnamed constraint-index drop effects/i,
      appliedSql,
    );
  }
});

test('fails closed before dropping tables with unnamed ALTER constraint indexes', () => {
  for (const appliedSql of [
    'CREATE TABLE t(id integer); ALTER TABLE t ADD UNIQUE(id);',
    'CREATE TABLE t(id integer); ALTER TABLE t ADD EXCLUDE USING gist (id WITH =);',
    'CREATE TABLE t(id integer); ALTER TABLE t ADD PRIMARY KEY(id);',
  ]) {
    assert.throws(
      () =>
        pendingMigrationDdlProbes({
          appliedMigrations: [{ sql: appliedSql }],
          pendingMigration: { sql: 'DROP TABLE t;' },
        }),
      /unnamed constraint-index drop effects/i,
      appliedSql,
    );
  }
});

test('fails closed when a child operation follows a pending parent drop', () => {
  for (const [appliedSql, pendingSql] of [
    ['CREATE TABLE t(id integer);', 'DROP TABLE t; CREATE INDEX idx ON t(id);'],
    [
      'CREATE TABLE t(id integer);',
      'DROP TABLE t; ALTER TABLE t ADD COLUMN label text;',
    ],
    [
      `CREATE TYPE mood AS ENUM ('focused');`,
      `DROP TYPE mood; ALTER TYPE mood ADD VALUE 'archived';`,
    ],
  ]) {
    assert.throws(
      () =>
        pendingMigrationDdlProbes({
          appliedMigrations: [{ sql: appliedSql }],
          pendingMigration: { sql: pendingSql },
        }),
      /targets an absent parent catalog object/i,
      pendingSql,
    );
  }
});

test('allows optional cleanup of global objects removed with their parent', () => {
  assert.deepEqual(
    pendingMigrationDdlProbes({
      appliedMigrations: [
        {
          sql: 'CREATE TABLE t(id integer); CREATE INDEX idx ON t(id);',
        },
      ],
      pendingMigration: {
        sql: 'DROP TABLE t; DROP INDEX IF EXISTS idx; DROP TYPE IF EXISTS t;',
      },
    }).map((probe) => probe.description),
    ['index attachment public.idx on public.t', 'pre-drop table public.t'],
  );
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

test('manual migration checklist requires both preflights before migrate', () => {
  const checklist = readFileSync(PRE_LAUNCH_CHECKLIST, 'utf8');
  const targetIndex = checklist.indexOf('scripts/verify-db-target.mjs');
  const journalIndex = checklist.indexOf(
    'scripts/verify-migration-journal.mjs',
  );
  const migrateIndex = checklist.indexOf('exec drizzle-kit migrate');

  assert.ok(targetIndex >= 0, 'manual target verifier is missing');
  assert.ok(journalIndex >= 0, 'manual journal verifier is missing');
  assert.ok(migrateIndex >= 0, 'manual migration command is missing');
  assert.ok(
    targetIndex < journalIndex,
    'manual journal check must follow target check',
  );
  assert.ok(
    journalIndex < migrateIndex,
    'manual journal check must precede migrate',
  );
});
