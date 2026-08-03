import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_ORPHANED_ROWS,
  assertCatalogInventoriesMatch,
  databaseTargetFingerprint,
  formatRepairFailure,
  parseRepairRequest,
  planExactJournalRepair,
  runCommitBoundary,
  validateReviewedDryRunReceipt,
  verifyJournalRepairApplied,
} from './repair-migration-journal-lib.mjs';

const migrations = [
  { idx: 0, tag: '0000_first', when: 1000, hash: 'known-a' },
  { idx: 1, tag: '0001_second', when: 2000, hash: 'known-b' },
  { idx: 2, tag: '0002_pending', when: 3000, hash: 'known-c' },
];

function appliedRows(overrides = []) {
  return [
    { id: 1, hash: 'known-a', created_at: 1000 },
    { id: 2, hash: 'known-b', created_at: 2000 },
    ...EXPECTED_ORPHANED_ROWS.map((row) => ({ ...row })),
    ...overrides,
  ];
}

test('plans only the two exact orphaned staging journal rows', () => {
  const plan = planExactJournalRepair({
    migrations,
    appliedRows: appliedRows(),
  });

  assert.deepEqual(plan.deleteRows, EXPECTED_ORPHANED_ROWS);
  assert.deepEqual(
    plan.applied.map((migration) => migration.tag),
    ['0000_first', '0001_second'],
  );
  assert.deepEqual(
    plan.pending.map((migration) => migration.tag),
    ['0002_pending'],
  );
});

test('refuses when either expected orphaned row is absent', () => {
  assert.throws(
    () =>
      planExactJournalRepair({
        migrations,
        appliedRows: appliedRows().filter(
          (row) => row.id !== EXPECTED_ORPHANED_ROWS[1].id,
        ),
      }),
    /exact orphaned-row set mismatch/,
  );
});

test('refuses an extra unknown journal row', () => {
  assert.throws(
    () =>
      planExactJournalRepair({
        migrations,
        appliedRows: appliedRows([
          { id: 999, hash: 'unexpected', created_at: 4000 },
        ]),
      }),
    /exact orphaned-row set mismatch/,
  );
});

test('refuses an expected id with a changed hash', () => {
  const rows = appliedRows();
  rows.find((row) => row.id === EXPECTED_ORPHANED_ROWS[0].id).hash = 'changed';

  assert.throws(
    () => planExactJournalRepair({ migrations, appliedRows: rows }),
    /exact orphaned-row set mismatch/,
  );
});

test('refuses a non-contiguous known migration prefix after removing orphans', () => {
  assert.throws(
    () =>
      planExactJournalRepair({
        migrations,
        appliedRows: appliedRows().filter((row) => row.hash !== 'known-a'),
      }),
    /missing applied migration 0000_first/,
  );
});

test('accepts identical canonical catalog inventories regardless of row order', () => {
  assert.doesNotThrow(() =>
    assertCatalogInventoriesMatch({
      baseline: [
        { key: 'table:public.alpha', definition: '{"kind":"r"}' },
        { key: 'column:public.alpha.id', definition: '{"type":"uuid"}' },
      ],
      staging: [
        { key: 'column:public.alpha.id', definition: '{"type":"uuid"}' },
        { key: 'table:public.alpha', definition: '{"kind":"r"}' },
      ],
    }),
  );
});

test('refuses missing, unexpected, or changed catalog objects', () => {
  assert.throws(
    () =>
      assertCatalogInventoriesMatch({
        baseline: [
          { key: 'table:public.alpha', definition: '{"kind":"r"}' },
          { key: 'table:public.beta', definition: '{"kind":"r"}' },
        ],
        staging: [
          { key: 'table:public.alpha', definition: '{"kind":"p"}' },
          { key: 'table:public.gamma', definition: '{"kind":"r"}' },
        ],
      }),
    (error) => {
      assert.match(
        error.message,
        /catalog inventory differs from migration 0166/,
      );
      assert.match(error.message, /changed: table:public.alpha/);
      assert.match(error.message, /missing: table:public.beta/);
      assert.match(error.message, /unexpected: table:public.gamma/);
      return true;
    },
  );
});

const targetEnv = {
  DEPLOY_ENV: 'staging',
  DATABASE_URL:
    'postgresql://owner:secret@ep-staging.example.test/mentomate?sslmode=require',
  BASELINE_DATABASE_URL:
    'postgresql://eduagent:eduagent@127.0.0.1:5432/wi1628_baseline',
  DATABASE_URL_STAGING_HOST: 'ep-staging.example.test',
  DATABASE_URL_PRODUCTION_HOST: 'ep-production.example.test',
};

test('accepts dry-run against guarded staging and local baseline targets', () => {
  assert.deepEqual(parseRepairRequest(['--dry-run'], targetEnv), {
    mode: 'dry-run',
    databaseUrl: targetEnv.DATABASE_URL,
    baselineDatabaseUrl: targetEnv.BASELINE_DATABASE_URL,
  });
});

test('requires the exact apply confirmation string', () => {
  assert.throws(
    () => parseRepairRequest(['--apply'], targetEnv),
    /WI-1628:DELETE:136,137/,
  );

  assert.equal(
    parseRepairRequest(['--apply'], {
      ...targetEnv,
      WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
      WI1628_UNRECOVERED_EFFECTS_ACK:
        'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
      WI1628_REVIEWED_DRY_RUN_ID: '12345',
      WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: 'dry-run-receipt.json',
    }).mode,
    'apply',
  );
});

test('requires explicit acceptance of unrecovered staging migration effects', () => {
  assert.throws(
    () =>
      parseRepairRequest(['--apply'], {
        ...targetEnv,
        WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
      }),
    /WI1628_UNRECOVERED_EFFECTS_ACK/,
  );
});

test('requires a reviewed dry-run run ID and receipt path before apply', () => {
  const applyEnv = {
    ...targetEnv,
    WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
    WI1628_UNRECOVERED_EFFECTS_ACK:
      'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
  };
  assert.throws(
    () => parseRepairRequest(['--apply'], applyEnv),
    /WI1628_REVIEWED_DRY_RUN_ID/,
  );
  assert.throws(
    () =>
      parseRepairRequest(['--apply'], {
        ...applyEnv,
        WI1628_REVIEWED_DRY_RUN_ID: '12345',
      }),
    /WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH/,
  );
});

test('binds a reviewed dry-run receipt to run, commit, target, and exact rows', () => {
  const receipt = {
    schema: 'zdx.wi1628.staging-journal-repair.v1',
    mode: 'dry-run',
    status: 'preflight-passed',
    githubRunId: '12345',
    headSha: 'abc123def456',
    targetFingerprint: databaseTargetFingerprint(targetEnv.DATABASE_URL),
    exactRows: EXPECTED_ORPHANED_ROWS,
  };
  assert.doesNotThrow(() =>
    validateReviewedDryRunReceipt({
      receipt,
      reviewedDryRunId: '12345',
      currentHeadSha: 'abc123def456',
      databaseUrl: targetEnv.DATABASE_URL,
    }),
  );

  for (const changedReceipt of [
    { ...receipt, githubRunId: '99999' },
    { ...receipt, headSha: 'different' },
    {
      ...receipt,
      targetFingerprint: databaseTargetFingerprint(
        targetEnv.DATABASE_URL.replace('mentomate', 'other'),
      ),
    },
    { ...receipt, exactRows: EXPECTED_ORPHANED_ROWS.slice(0, 1) },
  ]) {
    assert.throws(() =>
      validateReviewedDryRunReceipt({
        receipt: changedReceipt,
        reviewedDryRunId: '12345',
        currentHeadSha: 'abc123def456',
        databaseUrl: targetEnv.DATABASE_URL,
      }),
    );
  }
});

test('verifies an already-applied repair without requiring mutation acknowledgements', () => {
  const request = parseRepairRequest(['--verify-applied'], targetEnv);
  assert.equal(request.mode, 'verify-applied');

  const result = verifyJournalRepairApplied({
    migrations,
    appliedRows: appliedRows().filter(
      (row) =>
        !EXPECTED_ORPHANED_ROWS.some((expected) => expected.id === row.id),
    ),
  });
  assert.deepEqual(
    result.pending.map((migration) => migration.tag),
    ['0002_pending'],
  );
});

test('refuses to confirm a repair while either exact row remains', () => {
  assert.throws(
    () =>
      verifyJournalRepairApplied({ migrations, appliedRows: appliedRows() }),
    /still present/,
  );
});

test('classifies a thrown COMMIT as outcome-unknown and requires readback', async () => {
  await assert.rejects(
    () =>
      runCommitBoundary({
        commit: async () => {
          throw new Error('connection lost');
        },
        onCommitConfirmed: () => assert.fail('commit was not confirmed'),
        afterCommit: () => assert.fail('post-commit work must not run'),
      }),
    (error) => {
      assert.match(formatRepairFailure(error), /COMMIT OUTCOME UNKNOWN/);
      assert.match(formatRepairFailure(error), /do not rerun --apply/);
      assert.match(formatRepairFailure(error), /--verify-applied/);
      return true;
    },
  );
});

test('classifies post-COMMIT receipt failure as committed but unverified', async () => {
  let commitConfirmed = false;
  await assert.rejects(
    () =>
      runCommitBoundary({
        commit: async () => undefined,
        onCommitConfirmed: () => {
          commitConfirmed = true;
        },
        afterCommit: async () => {
          throw new Error('receipt disk unavailable');
        },
      }),
    (error) => {
      assert.equal(commitConfirmed, true);
      assert.match(formatRepairFailure(error), /COMMIT SUCCEEDED/);
      assert.doesNotMatch(formatRepairFailure(error), /repair refused/);
      assert.match(formatRepairFailure(error), /--verify-applied/);
      return true;
    },
  );
});

test('refuses production, a wrong staging host, or a remote baseline', () => {
  assert.throws(
    () =>
      parseRepairRequest(['--dry-run'], {
        ...targetEnv,
        DEPLOY_ENV: 'production',
      }),
    /DEPLOY_ENV=staging/,
  );
  assert.throws(
    () =>
      parseRepairRequest(['--dry-run'], {
        ...targetEnv,
        DATABASE_URL:
          'postgresql://owner:secret@ep-production.example.test/mentomate',
      }),
    /does not match the staging host guard/,
  );
  assert.throws(
    () =>
      parseRepairRequest(['--dry-run'], {
        ...targetEnv,
        BASELINE_DATABASE_URL:
          'postgresql://owner:secret@ep-other.example.test/baseline',
      }),
    /baseline database must be local/,
  );
});

test('refuses query parameters that override the validated connection identity', () => {
  for (const parameter of [
    'host',
    'hostaddr',
    'port',
    'database',
    'dbname',
    'user',
    'password',
    'service',
  ]) {
    const separator = targetEnv.DATABASE_URL.includes('?') ? '&' : '?';
    assert.throws(
      () =>
        parseRepairRequest(['--dry-run'], {
          ...targetEnv,
          DATABASE_URL:
            targetEnv.DATABASE_URL +
            separator +
            `${parameter}=ep-production.example.test`,
        }),
      /must not override connection identity/,
      parameter,
    );
  }

  assert.doesNotThrow(() =>
    parseRepairRequest(['--dry-run'], {
      ...targetEnv,
      DATABASE_URL: `${targetEnv.DATABASE_URL}&sslmode=require&channel_binding=require`,
    }),
  );
});
