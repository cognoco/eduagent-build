import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { test } from 'node:test';

import {
  bootstrapDisposableApiIntegrationSchema,
  isReceiptBelowAllowedRoot,
  loadRevisionSql,
  redactDatabaseOutput,
  REVISION_PINNED_SOURCE_PATHS,
  resolveSpawnCommand,
  validateDisposableApiIntegrationTarget,
  verifyDisposableApiIntegrationSchema,
} from './bootstrap-api-integration-schema.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
const CHAIN_FINGERPRINT = 'migration-chain-fingerprint-v1';
const TARGET_ID = 'wi2939_a1b2c3d4';
const DATABASE_NAME = `mentomate_api_integration_${TARGET_ID}`;
const DATABASE_HOST = 'ep-wi2939-a1b2c3d4.example.test';

test('revision pinning watches the disposable-target validation library', () => {
  assert.ok(
    REVISION_PINNED_SOURCE_PATHS.includes(
      'packages/database/scripts/verify-disposable-integration-target-lib.mjs',
    ),
  );
  for (const guardedEntryPoint of [
    'scripts/run-api-integration.mjs',
    'scripts/verify-api-integration-schema.mjs',
    'scripts/run-api-integration-schema-bootstrap.mjs',
  ]) {
    assert.ok(REVISION_PINNED_SOURCE_PATHS.includes(guardedEntryPoint));
  }
});

function validEnv() {
  return {
    DATABASE_URL: `postgresql://integration:super-secret@${DATABASE_HOST}/${DATABASE_NAME}`,
    DOPPLER_PROJECT: 'mentomate',
    DOPPLER_CONFIG: 'dev_integration',
    DOPPLER_ENVIRONMENT: 'dev',
    INTEGRATION_DATABASE_HOST: DATABASE_HOST,
    INTEGRATION_DATABASE_NAME: DATABASE_NAME,
    INTEGRATION_DATABASE_TARGET_ID: TARGET_ID,
    INTEGRATION_DATABASE_DISPOSABLE: 'true',
    DATABASE_URL_DEVELOPMENT_HOST: 'ep-shared-development.example.test',
    DATABASE_URL_STAGING_HOST: 'ep-staging.example.test',
    DATABASE_URL_PRODUCTION_HOST: 'ep-production.example.test',
  };
}

function makeStore({
  relations = [],
  marker = null,
  fingerprint = 'schema-fingerprint-v1',
} = {}) {
  const calls = [];
  return {
    calls,
    async inspect() {
      calls.push(['inspect']);
      return { relations, marker };
    },
    async createApplyingMarker(input) {
      calls.push(['createApplyingMarker', input]);
    },
    async applyDirectSchema(input) {
      calls.push(['applyDirectSchema', input]);
    },
    async fingerprint() {
      calls.push(['fingerprint']);
      return fingerprint;
    },
    async markReady(input) {
      calls.push(['markReady', input]);
    },
    async markFailed(input) {
      calls.push(['markFailed', input]);
    },
    async close() {
      calls.push(['close']);
    },
  };
}

function baseDependencies(store, overrides = {}) {
  const pushes = [];
  return {
    pushes,
    deps: {
      env: validEnv(),
      store,
      now: () => new Date('2026-07-31T07:00:00.000Z'),
      resolveHeadRevision: async () => REVISION,
      schemaSourcesAreClean: async () => true,
      loadRevisionSql: async () => ({
        statements: [
          'CREATE TABLE organization (id uuid PRIMARY KEY)',
          'CREATE POLICY organization_isolation ON organization USING (true)',
        ],
        postPushStatements: [
          'CREATE UNIQUE INDEX IF NOT EXISTS curriculum_topics_book_title_lower_uq ON curriculum_topics (book_id, lower(title))',
        ],
        fingerprint: CHAIN_FINGERPRINT,
      }),
      runSchemaPush: async (input) => {
        pushes.push(input);
      },
      ...overrides,
    },
  };
}

test('rejects shared development, staging, and production endpoints', () => {
  for (const protectedEnvironment of ['DEVELOPMENT', 'STAGING', 'PRODUCTION']) {
    const env = validEnv();
    env[`DATABASE_URL_${protectedEnvironment}_HOST`] = DATABASE_HOST;

    assert.throws(
      () => validateDisposableApiIntegrationTarget(env),
      new RegExp(`protected ${protectedEnvironment.toLowerCase()}`),
    );
  }
});

test('rejects a generic database name that is not bound to the unique target id', () => {
  const env = validEnv();
  env.DATABASE_URL =
    'postgresql://integration:super-secret@ep-unique.example.test/neondb';
  env.INTEGRATION_DATABASE_HOST = 'ep-unique.example.test';
  env.INTEGRATION_DATABASE_NAME = 'neondb';

  assert.throws(
    () => validateDisposableApiIntegrationTarget(env),
    /database name.*target id/i,
  );
});

test('rejects non-disposable metadata and any non-dev_integration Doppler config', () => {
  assert.throws(
    () =>
      validateDisposableApiIntegrationTarget({
        ...validEnv(),
        INTEGRATION_DATABASE_DISPOSABLE: 'false',
      }),
    /INTEGRATION_DATABASE_DISPOSABLE=true/,
  );
  assert.throws(
    () =>
      validateDisposableApiIntegrationTarget({
        ...validEnv(),
        DOPPLER_CONFIG: 'dev',
      }),
    /dev_integration/,
  );
});

test('redacts the complete connection identity from child-process output', () => {
  const env = validEnv();
  const raw =
    `connection failed: ${env.DATABASE_URL}\n` +
    `host=${DATABASE_HOST} database=${DATABASE_NAME} password=super-secret`;
  const redacted = redactDatabaseOutput(raw, env);

  assert.ok(!redacted.includes('super-secret'));
  assert.ok(!redacted.includes(DATABASE_HOST));
  assert.ok(!redacted.includes(DATABASE_NAME));
  assert.ok(!redacted.includes('postgresql://'));
  assert.match(redacted, /REDACTED/);
});

test('bootstraps with direct journal SQL, push, and post-push replay, never migrate', async () => {
  const store = makeStore();
  const { deps, pushes } = baseDependencies(store);

  const result = await bootstrapDisposableApiIntegrationSchema(
    {
      revision: REVISION,
      operatorRuling: 'operator:BID-48/WI-2939:approved',
    },
    deps,
  );

  assert.equal(result.action, 'bootstrapped');
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].command, 'corepack');
  assert.deepEqual(pushes[0].args, [
    'pnpm',
    '--filter',
    '@eduagent/database',
    'run',
    'db:push',
  ]);
  assert.equal(pushes[0].env.INTEGRATION_SCHEMA_BOOTSTRAP, 'WI-2939');
  assert.ok(!pushes[0].args.includes('migrate'));
  const directCall = store.calls.find(
    ([name]) => name === 'applyDirectSchema',
  )?.[1];
  assert.equal(directCall.chainFingerprint, CHAIN_FINGERPRINT);
  assert.match(directCall.statements[1], /CREATE POLICY/);
  assert.ok(
    directCall.statements.every(
      (statement) => !/\bdrizzle(?:-kit)?\s+migrate\b/i.test(statement),
    ),
  );
  assert.deepEqual(
    store.calls.map(([name]) => name),
    [
      'inspect',
      'createApplyingMarker',
      'applyDirectSchema',
      'applyDirectSchema',
      'fingerprint',
      'markReady',
      'close',
    ],
  );
});

test('reapplies revision-pinned migration-only database objects after schema push', async () => {
  const store = makeStore();
  const timeline = [];
  const { deps } = baseDependencies(store, {
    runSchemaPush: async () => {
      timeline.push('push');
    },
  });
  const originalApplyDirectSchema = store.applyDirectSchema;
  store.applyDirectSchema = async (input) => {
    timeline.push(input.statements);
    await originalApplyDirectSchema(input);
  };
  const revisionSql = await deps.loadRevisionSql();

  await bootstrapDisposableApiIntegrationSchema(
    {
      revision: REVISION,
      operatorRuling: 'operator:BID-48/WI-2939:approved',
    },
    deps,
  );

  assert.deepEqual(timeline, [
    revisionSql.statements,
    'push',
    revisionSql.postPushStatements,
  ]);
});

test('accepts an already-compatible target idempotently without push', async () => {
  const store = makeStore({
    relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
    marker: {
      targetId: TARGET_ID,
      revision: REVISION,
      chainFingerprint: CHAIN_FINGERPRINT,
      fingerprint: 'schema-fingerprint-v1',
      state: 'ready',
    },
  });
  const { deps, pushes } = baseDependencies(store);

  const result = await bootstrapDisposableApiIntegrationSchema(
    {
      revision: REVISION,
      operatorRuling: 'operator:BID-48/WI-2939:approved',
    },
    deps,
  );

  assert.equal(result.action, 'already-compatible');
  assert.equal(pushes.length, 0);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    ['inspect', 'fingerprint', 'close'],
  );
});

test('read-only verification accepts only a current trusted marker without mutation', async () => {
  const store = makeStore({
    relations: [
      { schema: 'public', name: 'guardian_authority_redemptions', kind: 'r' },
    ],
    marker: {
      targetId: TARGET_ID,
      revision: REVISION,
      chainFingerprint: CHAIN_FINGERPRINT,
      fingerprint: 'schema-fingerprint-v1',
      state: 'ready',
    },
  });
  const { deps } = baseDependencies(store);

  const result = await verifyDisposableApiIntegrationSchema(deps);

  assert.equal(result.revision, REVISION);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    ['inspect', 'fingerprint', 'close'],
  );
});

test('read-only verification refuses stale and unmarked non-empty schemas without mutation', async () => {
  for (const state of [
    {
      relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
      marker: {
        targetId: TARGET_ID,
        revision: OTHER_REVISION,
        chainFingerprint: CHAIN_FINGERPRINT,
        fingerprint: 'schema-fingerprint-v1',
        state: 'ready',
      },
    },
    {
      relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
      marker: null,
    },
    {
      relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
      marker: {
        targetId: TARGET_ID,
        revision: null,
        chainFingerprint: CHAIN_FINGERPRINT,
        fingerprint: null,
        state: 'failed',
      },
    },
  ]) {
    const store = makeStore(state);
    const { deps, pushes } = baseDependencies(store);

    await assert.rejects(
      verifyDisposableApiIntegrationSchema(deps),
      /refused before Jest.*operator authorization.*--revision.*--operator-ruling.*--receipt/is,
    );

    assert.equal(pushes.length, 0);
    assert.deepEqual(
      store.calls.map(([name]) => name),
      ['inspect', 'close'],
    );
  }
});

test('public bootstrap command forwards the exact authority contract through Doppler', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wi3041-command-'));
  const dopplerMarker = join(directory, 'doppler.log');
  const receipt = '.workitem-artifacts/WI-2939/wi3041-test.json';
  const ruling = 'operator:BID-48/WI-3041:approved';
  try {
    for (const packageSeparator of [[], ['--']]) {
      const result = spawnSync(
        process.execPath,
        [
          join(
            REPO_ROOT,
            'scripts',
            'run-api-integration-schema-bootstrap.mjs',
          ),
          ...packageSeparator,
          '--revision',
          REVISION,
          '--operator-ruling',
          ruling,
          '--receipt',
          receipt,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            DOPPLER_MARKER: dopplerMarker,
            NODE_OPTIONS: [
              process.env.NODE_OPTIONS,
              '--require=./scripts/__fixtures__/doppler-run/fake-doppler-preload.cjs',
            ]
              .filter(Boolean)
              .join(' '),
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
    }

    assert.deepEqual(
      readFileSync(dopplerMarker, 'utf8').trim().split('\n'),
      Array(2).fill(
        `run --project mentomate --config dev_integration -- ${process.execPath} ${join(REPO_ROOT, 'scripts', 'bootstrap-api-integration-schema.mjs')} --revision ${REVISION} --operator-ruling ${ruling} --receipt ${receipt}`,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('public bootstrap command rejects an incomplete authority contract before Doppler', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wi3041-command-refusal-'));
  const dopplerMarker = join(directory, 'doppler.log');
  try {
    const result = spawnSync(
      process.execPath,
      [
        join(REPO_ROOT, 'scripts', 'run-api-integration-schema-bootstrap.mjs'),
        '--revision',
        REVISION,
        '--receipt',
        '.workitem-artifacts/WI-2939/wi3041-test.json',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DOPPLER_MARKER: dopplerMarker,
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            '--require=./scripts/__fixtures__/doppler-run/fake-doppler-preload.cjs',
          ]
            .filter(Boolean)
            .join(' '),
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:.*--operator-ruling.*--receipt/is);
    assert.equal(existsSync(dopplerMarker), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects an incompatible non-empty target before mutation', async () => {
  const store = makeStore({
    relations: [{ schema: 'public', name: 'unrelated_table', kind: 'r' }],
  });
  const { deps, pushes } = baseDependencies(store);

  await assert.rejects(
    bootstrapDisposableApiIntegrationSchema(
      {
        revision: REVISION,
        operatorRuling: 'operator:BID-48/WI-2939:approved',
      },
      deps,
    ),
    /non-empty.*bootstrap marker/i,
  );

  assert.equal(pushes.length, 0);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    ['inspect', 'close'],
  );
});

test('rejects a marker from another revision or an interrupted bootstrap', async () => {
  for (const marker of [
    {
      targetId: TARGET_ID,
      revision: OTHER_REVISION,
      chainFingerprint: CHAIN_FINGERPRINT,
      fingerprint: 'schema-fingerprint-v1',
      state: 'ready',
    },
    {
      targetId: TARGET_ID,
      revision: REVISION,
      chainFingerprint: 'different-migration-chain',
      fingerprint: 'schema-fingerprint-v1',
      state: 'ready',
    },
    {
      targetId: TARGET_ID,
      revision: REVISION,
      chainFingerprint: CHAIN_FINGERPRINT,
      fingerprint: null,
      state: 'failed',
    },
  ]) {
    const store = makeStore({
      relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
      marker,
    });
    const { deps, pushes } = baseDependencies(store);

    await assert.rejects(
      bootstrapDisposableApiIntegrationSchema(
        {
          revision: REVISION,
          operatorRuling: 'operator:BID-48/WI-2939:approved',
        },
        deps,
      ),
      /destroy and recreate/i,
    );
    assert.equal(pushes.length, 0);
  }
});

test('loads the committed journal as direct revision-pinned SQL', () => {
  const plan = loadRevisionSql();

  assert.ok(plan.statements.length > 0);
  assert.match(plan.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(
    plan.statements.some((statement) => /\bCREATE\s+POLICY\b/i.test(statement)),
  );
  assert.ok(
    Array.isArray(plan.postPushStatements),
    'expected a revision-pinned post-push replay plan',
  );
  for (const indexName of [
    'curriculum_topics_book_title_lower_uq',
    'subjects_profile_name_lower_active_uq',
    'curriculum_books_subject_title_lower_uq',
  ]) {
    assert.ok(
      plan.postPushStatements.some((statement) =>
        statement.includes(indexName),
      ),
      `expected post-push replay SQL for ${indexName}`,
    );
  }
  const executableJournalSql = plan.statements
    .join('\n')
    .replace(/--.*$/gm, '');
  const migrationOnlyRlsTables = [
    ...executableJournalSql.matchAll(
      /ALTER\s+TABLE\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/gi,
    ),
  ].map((match) => match[1]);
  assert.ok(
    migrationOnlyRlsTables.length > 0,
    'expected committed migration-only RLS SQL',
  );
  for (const table of new Set(migrationOnlyRlsTables)) {
    const replay = plan.postPushStatements.find((statement) =>
      statement.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`),
    );
    assert.ok(replay, `expected post-push RLS enablement for ${table}`);
    assert.ok(
      replay.includes(`to_regclass('${table}') IS NOT NULL`),
      `expected relation-existence guard for RLS replay on ${table}`,
    );
  }
  for (const policyName of [
    'assessments_profile_isolation',
    'family_preferences_profile_isolation',
    'activation_events_profile_isolation',
  ]) {
    assert.ok(
      plan.postPushStatements.some(
        (statement) =>
          statement.includes(`CREATE POLICY "${policyName}"`) &&
          /to_regclass\('[^']+'\) IS NOT NULL/.test(statement),
      ),
      `expected post-push policy replay for ${policyName}`,
    );
  }
  const familyPolicyCreateIndex = plan.postPushStatements.findIndex(
    (statement) =>
      statement.includes(
        'CREATE POLICY "family_preferences_profile_isolation"',
      ),
  );
  const familyPolicyAlterIndex = plan.postPushStatements.findIndex(
    (statement) =>
      statement.includes('ALTER POLICY "family_preferences_profile_isolation"'),
  );
  assert.ok(
    familyPolicyAlterIndex > familyPolicyCreateIndex,
    'expected final ALTER POLICY replay after the historical CREATE POLICY',
  );
  assert.match(
    plan.postPushStatements[familyPolicyAlterIndex],
    /to_regclass\('[^']+'\) IS NOT NULL[\s\S]*app\.current_profile_id/,
  );
  assert.ok(
    plan.postPushStatements.every(
      (statement) => !/\bCREATE\s+(?:TABLE|TYPE)\b/i.test(statement),
    ),
    'post-push replay must not repeat table or enum creation',
  );
});

test('records a failed push and refuses to retry it', async () => {
  const store = makeStore();
  const { deps, pushes } = baseDependencies(store, {
    runSchemaPush: async (input) => {
      pushes.push(input);
      throw new Error('synthetic push failure');
    },
  });

  await assert.rejects(
    bootstrapDisposableApiIntegrationSchema(
      {
        revision: REVISION,
        operatorRuling: 'operator:BID-48/WI-2939:approved',
      },
      deps,
    ),
    /destroy and recreate/i,
  );

  assert.equal(pushes.length, 1);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    [
      'inspect',
      'createApplyingMarker',
      'applyDirectSchema',
      'markFailed',
      'close',
    ],
  );
});

test('records a failed post-push replay and requires recreation', async () => {
  const store = makeStore();
  const originalApplyDirectSchema = store.applyDirectSchema;
  let applyCount = 0;
  store.applyDirectSchema = async (input) => {
    applyCount += 1;
    await originalApplyDirectSchema(input);
    if (applyCount === 2) throw new Error('synthetic post-push failure');
  };
  const { deps, pushes } = baseDependencies(store);

  await assert.rejects(
    bootstrapDisposableApiIntegrationSchema(
      {
        revision: REVISION,
        operatorRuling: 'operator:BID-48/WI-2939:approved',
      },
      deps,
    ),
    /destroy and recreate/i,
  );

  assert.equal(pushes.length, 1);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    [
      'inspect',
      'createApplyingMarker',
      'applyDirectSchema',
      'applyDirectSchema',
      'markFailed',
      'close',
    ],
  );
});

test('records failed direct SQL and never reaches push', async () => {
  const store = makeStore();
  store.applyDirectSchema = async (input) => {
    store.calls.push(['applyDirectSchema', input]);
    throw new Error('synthetic direct-SQL failure');
  };
  const { deps, pushes } = baseDependencies(store);

  await assert.rejects(
    bootstrapDisposableApiIntegrationSchema(
      {
        revision: REVISION,
        operatorRuling: 'operator:BID-48/WI-2939:approved',
      },
      deps,
    ),
    /destroy and recreate/i,
  );

  assert.equal(pushes.length, 0);
  assert.deepEqual(
    store.calls.map(([name]) => name),
    [
      'inspect',
      'createApplyingMarker',
      'applyDirectSchema',
      'markFailed',
      'close',
    ],
  );
});

test('revision mismatch and dirty schema sources fail before database inspection', async () => {
  for (const overrides of [
    { resolveHeadRevision: async () => OTHER_REVISION },
    { schemaSourcesAreClean: async () => false },
  ]) {
    const store = makeStore();
    const { deps, pushes } = baseDependencies(store, overrides);

    await assert.rejects(
      bootstrapDisposableApiIntegrationSchema(
        {
          revision: REVISION,
          operatorRuling: 'operator:BID-48/WI-2939:approved',
        },
        deps,
      ),
      /revision|uncommitted schema/i,
    );
    assert.equal(pushes.length, 0);
    assert.deepEqual(store.calls, []);
  }
});

test('writes a redacted durable receipt with cleanup evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wi2939-receipt-'));
  const receiptPath = join(directory, 'bootstrap-receipt.json');
  try {
    const store = makeStore();
    const { deps } = baseDependencies(store);

    await bootstrapDisposableApiIntegrationSchema(
      {
        revision: REVISION,
        operatorRuling: 'operator:BID-48/WI-2939:approved',
        receiptPath,
      },
      deps,
    );

    const raw = await readFile(receiptPath, 'utf8');
    const receipt = JSON.parse(raw);
    assert.equal(receipt.schema, 'zdx.disposable-schema-bootstrap.v1');
    assert.equal(receipt.workItem, 'WI-2939');
    assert.equal(receipt.targetId, TARGET_ID);
    assert.equal(receipt.revision, REVISION);
    assert.equal(receipt.action, 'bootstrapped');
    assert.match(receipt.cleanup, /destroy.*disposable target/i);
    assert.match(
      receipt.dataPolicy,
      /revision-pinned committed migration SQL/i,
    );
    assert.match(receipt.dataPolicy, /no separate seed command/i);
    assert.match(receipt.dataPolicy, /no.*copied user data/i);
    assert.ok(!raw.includes('super-secret'));
    assert.ok(!raw.includes(DATABASE_HOST));
    assert.ok(!raw.includes('postgresql://'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('package scripts expose only the guarded bootstrap path', () => {
  const rootPackage = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
  );
  const databasePackage = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/database/package.json'), 'utf8'),
  );

  assert.equal(
    rootPackage.scripts?.['db:bootstrap:api-integration'],
    'node scripts/run-api-integration-schema-bootstrap.mjs',
  );
  assert.equal(
    databasePackage.scripts?.['predb:push'],
    'node scripts/check-db-push-target.mjs',
  );
  assert.ok(
    !rootPackage.scripts?.['db:bootstrap:api-integration'].includes('migrate'),
  );
});

test('resolves corepack through its cmd shim on Windows without a shell', () => {
  assert.equal(resolveSpawnCommand('corepack', 'win32'), 'corepack.cmd');
  assert.equal(resolveSpawnCommand('corepack', 'linux'), 'corepack');
});

test('rejects a cross-drive Windows receipt path', () => {
  assert.equal(
    isReceiptBelowAllowedRoot(
      'C:\\repo\\.workitem-artifacts\\WI-2939',
      'D:\\tmp\\receipt.json',
      win32,
    ),
    false,
  );
  assert.equal(
    isReceiptBelowAllowedRoot(
      'C:\\repo\\.workitem-artifacts\\WI-2939',
      'C:\\repo\\.workitem-artifacts\\WI-2939\\receipt.json',
      win32,
    ),
    true,
  );
});
