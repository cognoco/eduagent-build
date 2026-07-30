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

async function runChecker({
  databaseUrl,
  dopplerConfig = 'dev',
  rows = [],
  queryError,
}) {
  const checker = await loadChecker();
  assert.ok(checker, 'development schema checker module must exist');

  const stdout = [];
  const stderr = [];
  let queryCalls = 0;
  const exitCode = await checker.runDevelopmentSchemaCheck({
    databaseUrl,
    dopplerConfig,
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
  assert.match(normalized, /data_type AS "dataType"/);
  assert.match(normalized, /is_nullable AS "isNullable"/);
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
    ],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, [
    'development schema freshness passed: retention_cards.last_recall_feedback and subscription.past_due_at are present',
  ]);
});

for (const { name, rows, expectedDrift } of [
  {
    name: 'both columns absent',
    rows: [],
    expectedDrift:
      'missing retention_cards.last_recall_feedback, subscription.past_due_at',
  },
  {
    name: 'retention feedback column absent',
    rows: [
      {
        tableName: 'subscription',
        columnName: 'past_due_at',
        dataType: 'timestamp with time zone',
        isNullable: 'YES',
      },
    ],
    expectedDrift: 'missing retention_cards.last_recall_feedback',
  },
  {
    name: 'past-due column absent',
    rows: [
      {
        tableName: 'retention_cards',
        columnName: 'last_recall_feedback',
        dataType: 'jsonb',
        isNullable: 'YES',
      },
    ],
    expectedDrift: 'missing subscription.past_due_at',
  },
  {
    name: 'retention feedback column has an incompatible type',
    rows: [
      {
        tableName: 'retention_cards',
        columnName: 'last_recall_feedback',
        dataType: 'json',
        isNullable: 'YES',
      },
      {
        tableName: 'subscription',
        columnName: 'past_due_at',
        dataType: 'timestamp with time zone',
        isNullable: 'YES',
      },
    ],
    expectedDrift:
      'incompatible retention_cards.last_recall_feedback (expected jsonb nullable, found json nullable)',
  },
  {
    name: 'past-due column is unexpectedly non-nullable',
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
        isNullable: 'NO',
      },
    ],
    expectedDrift:
      'incompatible subscription.past_due_at (expected timestamp with time zone nullable, found timestamp with time zone non-nullable)',
  },
]) {
  test(`${name} returns actionable reconciliation instructions`, async () => {
    const result = await runChecker({
      databaseUrl: 'postgresql://example.invalid/database',
      rows,
    });

    assert.equal(result.exitCode, 2);
    assert.equal(result.queryCalls, 1);
    assert.deepEqual(result.stdout, []);
    assert.deepEqual(result.stderr, [
      `development schema freshness failed: ${expectedDrift}`,
      'reconcile only after approval with: pnpm db:push:dev',
    ]);
  });
}

for (const dopplerConfig of ['stg', 'prd']) {
  test(`${dopplerConfig} target fails closed without querying`, async () => {
    const result = await runChecker({
      databaseUrl: 'postgresql://example.invalid/database',
      dopplerConfig,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.queryCalls, 0);
    assert.deepEqual(result.stdout, []);
    assert.deepEqual(result.stderr, [
      'development schema freshness unavailable: run through Doppler dev config only',
    ]);
  });
}

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
