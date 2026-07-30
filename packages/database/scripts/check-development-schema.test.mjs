import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadChecker() {
  try {
    return await import('./check-development-schema.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function runChecker({ databaseUrl, rows = [], queryError }) {
  const checker = await loadChecker();
  assert.ok(checker, 'development schema checker module must exist');

  const stdout = [];
  const stderr = [];
  let queryCalls = 0;
  const exitCode = await checker.runDevelopmentSchemaCheck({
    databaseUrl,
    queryCatalog: async () => {
      queryCalls += 1;
      if (queryError) throw queryError;
      return rows;
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  return { checker, exitCode, queryCalls, stdout, stderr };
}

test('catalog query requires the retention-feedback and past-due columns', async () => {
  const checker = await loadChecker();
  assert.ok(checker, 'development schema checker module must exist');

  const normalized = checker.DEVELOPMENT_SCHEMA_QUERY.replace(/\s+/g, ' ');
  assert.match(normalized, /table_name = 'retention_cards'/);
  assert.match(normalized, /column_name = 'last_recall_feedback'/);
  assert.match(normalized, /table_name = 'subscription'/);
  assert.match(normalized, /column_name = 'past_due_at'/);
});

test('missing credential fails closed without querying', async () => {
  const result = await runChecker({ databaseUrl: '' });

  assert.equal(result.exitCode, 1);
  assert.equal(result.queryCalls, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema freshness unavailable: DATABASE_URL is not set',
  ]);
});

test('complete development schema returns success', async () => {
  const result = await runChecker({
    databaseUrl: 'postgresql://example.invalid/database',
    rows: [
      { tableName: 'retention_cards', columnName: 'last_recall_feedback' },
      { tableName: 'subscription', columnName: 'past_due_at' },
    ],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, [
    'development schema freshness passed: retention_cards.last_recall_feedback and subscription.past_due_at are present',
  ]);
});

test('missing columns return actionable reconciliation instructions', async () => {
  const result = await runChecker({
    databaseUrl: 'postgresql://example.invalid/database',
    rows: [
      { tableName: 'retention_cards', columnName: 'last_recall_feedback' },
    ],
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema freshness failed: missing subscription.past_due_at',
    'reconcile only after approval with: pnpm db:push:dev',
  ]);
});

test('catalog rejection is unavailable without exposing a credential', async () => {
  const marker = 'WI2938_DUMMY_SECRET';
  const result = await runChecker({
    databaseUrl: `postgresql://user:${marker}@example.invalid/database`,
    queryError: new Error(`invalid URL: ${marker}`),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'development schema freshness unavailable: catalog query failed',
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
});
