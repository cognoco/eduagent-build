import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

async function loadReconciler() {
  try {
    return await import('./reconcile-development-schema.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function runReconciler(options = {}) {
  const databaseUrl =
    options.databaseUrl ?? 'postgresql://example.invalid/database';
  const dopplerConfig = Object.hasOwn(options, 'dopplerConfig')
    ? options.dopplerConfig
    : 'dev';
  const { executeError } = options;
  const reconciler = await loadReconciler();
  assert.ok(reconciler, 'development schema reconciler module must exist');

  const calls = [];
  const stdout = [];
  const stderr = [];
  const exitCode = await reconciler.runDevelopmentSchemaReconciliation({
    databaseUrl,
    dopplerConfig,
    executeStatements: async (url, statements) => {
      calls.push({ hasDatabaseUrl: Boolean(url), statements });
      if (executeError) throw executeError;
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  return { reconciler, exitCode, calls, stdout, stderr };
}

test('reconciliation contains only the two exact additive statements', async () => {
  const reconciler = await loadReconciler();
  assert.ok(reconciler, 'development schema reconciler module must exist');

  assert.deepEqual(
    reconciler.DEVELOPMENT_SCHEMA_RECONCILIATION.map((statement) =>
      statement.replace(/\s+/g, ' ').trim(),
    ),
    [
      'ALTER TABLE retention_cards ADD COLUMN IF NOT EXISTS last_recall_feedback jsonb',
      'ALTER TABLE subscription ADD COLUMN IF NOT EXISTS past_due_at timestamp with time zone',
    ],
  );
});

test('root reconciliation command pins Doppler to development', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    packageJson.scripts['db:reconcile:dev-schema'],
    'node scripts/doppler-run.mjs run -c dev -- node packages/database/scripts/reconcile-development-schema.mjs',
  );
});

test('development target executes both statements together', async () => {
  const result = await runReconciler();

  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(
    result.calls[0].statements,
    result.reconciler.DEVELOPMENT_SCHEMA_RECONCILIATION,
  );
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, [
    'development schema reconciliation passed: added or retained retention_cards.last_recall_feedback and subscription.past_due_at',
  ]);
});

test('idempotent rerun submits the same IF NOT EXISTS statements', async () => {
  const first = await runReconciler();
  const second = await runReconciler();

  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);
  assert.deepEqual(first.calls[0].statements, second.calls[0].statements);
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
