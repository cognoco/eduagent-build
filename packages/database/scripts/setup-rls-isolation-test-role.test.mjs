import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import {
  RLS_TEST_ROLE,
  RlsRoleSetupRefusal,
  ensureRlsIsolationTestRole,
} from './setup-rls-isolation-test-role.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readyState(overrides = {}) {
  return {
    ready: true,
    currentUser: 'integration_harness',
    roleExists: true,
    canLogin: false,
    isSuperuser: false,
    canCreateDatabase: false,
    canCreateRole: false,
    canReplicate: false,
    canBypassRls: false,
    canSetRole: true,
    hasSchemaUsage: true,
    hasConceptsSelect: true,
    hasConceptsInsert: true,
    hasMasterySelect: true,
    hasMasteryInsert: true,
    ...overrides,
  };
}

function fakeStore(states) {
  let index = 0;
  return {
    applyCount: 0,
    async inspect() {
      return states[Math.min(index++, states.length - 1)];
    },
    async applyLocal() {
      this.applyCount += 1;
    },
  };
}

test('remote targets are check-only and never invoke role mutation', async () => {
  const store = fakeStore([readyState()]);
  await assert.rejects(
    ensureRlsIsolationTestRole(
      {
        databaseUrl: 'postgresql://example.invalid/integration',
        applyLocal: true,
      },
      store,
    ),
    (error) =>
      error instanceof RlsRoleSetupRefusal &&
      error.message.includes('may mutate only localhost'),
  );
  assert.equal(store.applyCount, 0);
});

test('localhost URL with a host or socket override never invokes role mutation', async () => {
  for (const hostOverride of [
    'shared.neon.tech',
    encodeURIComponent('/var/run/postgresql'),
  ]) {
    const store = fakeStore([
      readyState({ ready: false, roleExists: false, canSetRole: false }),
      readyState(),
    ]);
    await assert.rejects(
      ensureRlsIsolationTestRole(
        {
          databaseUrl: `postgresql://user:password@localhost/integration?host=${hostOverride}`,
          applyLocal: true,
        },
        store,
      ),
      (error) =>
        error instanceof RlsRoleSetupRefusal &&
        error.message.includes('host override'),
    );
    assert.equal(store.applyCount, 0);
  }
});

test('check mode reports missing SET membership without mutating', async () => {
  const store = fakeStore([readyState({ ready: false, canSetRole: false })]);
  await assert.rejects(
    ensureRlsIsolationTestRole(
      {
        databaseUrl: 'postgresql://shared.invalid/integration',
        applyLocal: false,
      },
      store,
    ),
    (error) =>
      error instanceof RlsRoleSetupRefusal &&
      error.message.includes('lacks SET membership'),
  );
  assert.equal(store.applyCount, 0);
});

test('local apply provisions once and then verifies the full contract', async () => {
  const store = fakeStore([
    readyState({ ready: false, roleExists: false, canSetRole: false }),
    readyState(),
  ]);
  const result = await ensureRlsIsolationTestRole(
    {
      databaseUrl: 'postgresql://localhost/wi2643_integration_test',
      applyLocal: true,
    },
    store,
  );
  assert.equal(store.applyCount, 1);
  assert.deepEqual(result, {
    role: RLS_TEST_ROLE,
    databaseName: 'wi2643_integration_test',
    host: 'localhost',
    mode: 'applied-local',
    currentUser: 'integration_harness',
  });
});

test('an unsafe existing role is refused instead of repaired', async () => {
  const store = fakeStore([readyState({ ready: false, isSuperuser: true })]);
  await assert.rejects(
    ensureRlsIsolationTestRole(
      {
        databaseUrl: 'postgresql://127.0.0.1/wi2643_integration_test',
        applyLocal: true,
      },
      store,
    ),
    (error) =>
      error instanceof RlsRoleSetupRefusal &&
      error.message.includes('unsafe role attributes'),
  );
  assert.equal(store.applyCount, 0);
});

test('required table grants are checked individually', async () => {
  const store = fakeStore([
    readyState({ ready: false, hasMasteryInsert: false }),
  ]);
  await assert.rejects(
    ensureRlsIsolationTestRole(
      {
        databaseUrl: 'postgresql://shared.invalid/integration',
        applyLocal: false,
      },
      store,
    ),
    (error) =>
      error instanceof RlsRoleSetupRefusal &&
      error.message.includes('missing one or more required grants'),
  );
  assert.equal(store.applyCount, 0);
});

test('every CI job that runs profile isolation provisions the local role first', () => {
  const workflow = parseYaml(
    readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'),
  );
  const contracts = [
    ['main', 'API integration tests'],
    ['integration-flag-on', 'API integration tests (flag-ON)'],
  ];

  for (const [jobName, integrationStepName] of contracts) {
    const steps = workflow.jobs[jobName].steps;
    const provisionIndex = steps.findIndex(
      (step) => step.run === 'pnpm db:setup:rls-test-role:local',
    );
    const integrationIndex = steps.findIndex(
      (step) => step.name === integrationStepName,
    );

    assert.notEqual(
      provisionIndex,
      -1,
      `${jobName} must provision the RLS isolation test role`,
    );
    assert.notEqual(
      integrationIndex,
      -1,
      `${jobName} must retain ${integrationStepName}`,
    );
    assert.ok(
      provisionIndex < integrationIndex,
      `${jobName} must provision the role before ${integrationStepName}`,
    );
  }
});
