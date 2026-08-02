import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const COMPATIBLE_ROWS = [
  {
    tableName: 'retention_cards',
    columnName: 'last_recall_feedback',
    dataType: 'jsonb',
    isNullable: 'YES',
  },
  {
    tableName: 'subscription',
    columnName: 'past_due_at',
    dataType: 'timestamp with time zone',
    isNullable: 'YES',
  },
  {
    tableName: 'session_summaries',
    columnName: 'language_learning_summary',
    dataType: 'jsonb',
    isNullable: 'YES',
  },
];

async function loadReconciler() {
  try {
    return await import('./reconcile-development-schema.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function runReconciler(options = {}) {
  const expectedDopplerConfig = options.expectedDopplerConfig ?? 'dev';
  const isIntegrationTarget = expectedDopplerConfig === 'dev_integration';
  const databaseUrl =
    options.databaseUrl ??
    (isIntegrationTarget
      ? 'postgresql://integration.example.invalid/wi2922_12345678'
      : 'postgresql://example.invalid/database');
  const dopplerConfig = Object.hasOwn(options, 'dopplerConfig')
    ? options.dopplerConfig
    : 'dev';
  const dopplerProject = options.dopplerProject ?? 'mentomate';
  const dopplerEnvironment = options.dopplerEnvironment ?? 'dev';
  const developmentHost =
    options.developmentHost ??
    (isIntegrationTarget ? 'development.example.invalid' : 'example.invalid');
  const stagingHost = options.stagingHost ?? 'staging.example.invalid';
  const productionHost = options.productionHost ?? 'production.example.invalid';
  const integrationDatabaseDisposable =
    options.integrationDatabaseDisposable ?? 'true';
  const integrationDatabaseHost =
    options.integrationDatabaseHost ?? 'integration.example.invalid';
  const integrationDatabaseName =
    options.integrationDatabaseName ?? 'wi2922_12345678';
  const integrationDatabaseTargetId =
    options.integrationDatabaseTargetId ?? '12345678';
  const rows = options.rows ?? [];
  const postMutationRows = options.postMutationRows ?? COMPATIBLE_ROWS;
  const { executeError } = options;
  const reconciler = await loadReconciler();
  assert.ok(reconciler, 'development schema reconciler module must exist');

  const calls = [];
  let queryCalls = 0;
  const stdout = [];
  const stderr = [];
  const exitCode = await reconciler.runDevelopmentSchemaReconciliation({
    databaseUrl,
    dopplerProject,
    dopplerConfig,
    dopplerEnvironment,
    expectedDopplerConfig,
    developmentHost,
    stagingHost,
    productionHost,
    integrationDatabaseDisposable,
    integrationDatabaseHost,
    integrationDatabaseName,
    integrationDatabaseTargetId,
    queryCatalog: async () => {
      queryCalls += 1;
      return rows;
    },
    executeStatements: async (url, statements, verificationQuery) => {
      calls.push({
        hasDatabaseUrl: Boolean(url),
        statements,
        verificationQuery,
      });
      if (executeError) throw executeError;
      return postMutationRows;
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  return { reconciler, exitCode, calls, queryCalls, stdout, stderr };
}

test('reconciliation contains only the exact approved additive statements', async () => {
  const reconciler = await loadReconciler();
  assert.ok(reconciler, 'development schema reconciler module must exist');

  assert.deepEqual(
    reconciler.DEVELOPMENT_SCHEMA_RECONCILIATION.map((statement) =>
      statement.replace(/\s+/g, ' ').trim(),
    ),
    [
      'ALTER TABLE retention_cards ADD COLUMN IF NOT EXISTS last_recall_feedback jsonb',
      'ALTER TABLE subscription ADD COLUMN IF NOT EXISTS past_due_at timestamp with time zone',
      'ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS language_learning_summary jsonb',
    ],
  );
});

test('root reconciliation command pins Doppler to development', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    packageJson.scripts['db:reconcile:dev-schema'],
    'node scripts/doppler-run.mjs run -c dev -- node packages/database/scripts/reconcile-development-schema.mjs --target=dev',
  );
  assert.equal(
    packageJson.scripts['db:reconcile:dev-integration-schema'],
    'node scripts/doppler-run.mjs run -c dev_integration -- node packages/database/scripts/reconcile-development-schema.mjs --target=dev_integration',
  );
});

test('integration target executes only under dev_integration identity', async () => {
  const result = await runReconciler({
    dopplerConfig: 'dev_integration',
    expectedDopplerConfig: 'dev_integration',
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
});

test('integration target refuses the dev identity without executing', async () => {
  const result = await runReconciler({
    dopplerConfig: 'dev',
    expectedDopplerConfig: 'dev_integration',
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
  assert.equal(result.queryCalls, 0);
});

test('integration target refuses a protected database before catalog access or mutation', async () => {
  const result = await runReconciler({
    databaseUrl:
      'postgresql://example:secret@staging.example.invalid/wi2922_12345678',
    dopplerConfig: 'dev_integration',
    expectedDopplerConfig: 'dev_integration',
    developmentHost: 'development.example.invalid',
    stagingHost: 'staging.example.invalid',
    productionHost: 'production.example.invalid',
    integrationDatabaseHost: 'staging.example.invalid',
    integrationDatabaseName: 'wi2922_12345678',
    integrationDatabaseTargetId: '12345678',
    integrationDatabaseDisposable: 'true',
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
  assert.equal(result.queryCalls, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation unavailable: disposable integration target verification failed',
  ]);
});

test('development target executes all missing statements together', async () => {
  const result = await runReconciler({ rows: [] });

  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(
    result.calls[0].statements,
    result.reconciler.DEVELOPMENT_SCHEMA_RECONCILIATION,
  );
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, [
    'development schema reconciliation passed: added or retained retention_cards.last_recall_feedback, subscription.past_due_at, and session_summaries.language_learning_summary',
  ]);
});

test('idempotent rerun submits the same IF NOT EXISTS statements', async () => {
  const first = await runReconciler({ rows: [] });
  const second = await runReconciler({ rows: [] });

  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);
  assert.deepEqual(first.calls[0].statements, second.calls[0].statements);
});

test('already-compatible session summary column is unchanged', async () => {
  const result = await runReconciler({
    rows: [
      {
        tableName: 'retention_cards',
        columnName: 'last_recall_feedback',
        dataType: 'jsonb',
        isNullable: 'YES',
      },
      {
        tableName: 'subscription',
        columnName: 'past_due_at',
        dataType: 'timestamp with time zone',
        isNullable: 'YES',
      },
      {
        tableName: 'session_summaries',
        columnName: 'language_learning_summary',
        dataType: 'jsonb',
        isNullable: 'YES',
      },
    ],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 0);
});

test('incompatible session summary definition fails closed without mutation', async () => {
  const result = await runReconciler({
    rows: [
      {
        tableName: 'session_summaries',
        columnName: 'language_learning_summary',
        dataType: 'text',
        isNullable: 'YES',
      },
    ],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation refused: incompatible session_summaries.language_learning_summary (expected jsonb nullable, found text nullable)',
  ]);
});

test('post-mutation verification catches a concurrent incompatible column', async () => {
  const result = await runReconciler({
    rows: [],
    postMutationRows: [
      COMPATIBLE_ROWS[0],
      COMPATIBLE_ROWS[1],
      {
        tableName: 'session_summaries',
        columnName: 'language_learning_summary',
        dataType: 'text',
        isNullable: 'YES',
      },
    ],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 1);
  assert.match(
    result.calls[0].verificationQuery,
    /session_summaries[\s\S]*language_learning_summary/,
  );
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation failed: post-mutation verification found incompatible session_summaries.language_learning_summary (expected jsonb nullable, found text nullable)',
  ]);
});

test('development config with a non-development host fails closed without mutation', async () => {
  const result = await runReconciler({
    databaseUrl: 'postgresql://example:secret@staging.example.invalid/database',
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation unavailable: exact development target verification failed',
  ]);
});

test('development config outside the MentoMate development environment fails closed', async () => {
  const result = await runReconciler({ dopplerEnvironment: 'stg' });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
});

test('development reconciliation path never invokes drizzle migrate', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  );

  assert.doesNotMatch(
    packageJson.scripts['db:reconcile:dev-schema'],
    /drizzle-kit\s+migrate|db:migrate/,
  );
});

test('missing credential fails closed without executing', async () => {
  const result = await runReconciler({ databaseUrl: '' });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation unavailable: DATABASE_URL is not set',
  ]);
});

for (const dopplerConfig of ['stg', 'prd', '', undefined]) {
  test(`${String(dopplerConfig)} target fails closed without executing`, async () => {
    const result = await runReconciler({ dopplerConfig });

    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.stdout, []);
    assert.deepEqual(result.stderr, [
      'development schema reconciliation unavailable: run through Doppler dev config only',
    ]);
  });
}

test('execution failure does not expose the credential', async () => {
  const marker = 'WI2965_DUMMY_SECRET';
  const result = await runReconciler({
    databaseUrl: `postgresql://user:${marker}@example.invalid/database`,
    executeError: new Error(`invalid URL: ${marker}`),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema reconciliation failed: no changes confirmed',
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
});
