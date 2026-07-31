import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  bootstrapDisposableApiIntegrationSchema,
  validateDisposableApiIntegrationTarget,
} from './bootstrap-api-integration-schema.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
const TARGET_ID = 'wi2939_a1b2c3d4';
const DATABASE_NAME = `mentomate_api_integration_${TARGET_ID}`;
const DATABASE_HOST = 'ep-wi2939-a1b2c3d4.example.test';

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
      runSchemaPush: async (input) => {
        pushes.push(input);
      },
      ...overrides,
    },
  };
}

test('rejects shared development, staging, and production endpoints', () => {
  for (const protectedEnvironment of [
    'DEVELOPMENT',
    'STAGING',
    'PRODUCTION',
  ]) {
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

test('bootstraps an empty target exactly once with push, never migrate', async () => {
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
  assert.deepEqual(pushes[0], {
    command: 'corepack',
    args: ['pnpm', '--filter', '@eduagent/database', 'run', 'db:push'],
    env: assert.match.object,
  });
  assert.equal(pushes[0].env.INTEGRATION_SCHEMA_BOOTSTRAP, 'WI-2939');
  assert.ok(!pushes[0].args.includes('migrate'));
  assert.deepEqual(
    store.calls.map(([name]) => name),
    [
      'inspect',
      'createApplyingMarker',
      'fingerprint',
      'markReady',
      'close',
    ],
  );
});

test('accepts an already-compatible target idempotently without push', async () => {
  const store = makeStore({
    relations: [{ schema: 'public', name: 'organization', kind: 'r' }],
    marker: {
      targetId: TARGET_ID,
      revision: REVISION,
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
      fingerprint: 'schema-fingerprint-v1',
      state: 'ready',
    },
    {
      targetId: TARGET_ID,
      revision: REVISION,
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
    ['inspect', 'createApplyingMarker', 'markFailed', 'close'],
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
    'node scripts/doppler-run.mjs run --project mentomate --config dev_integration -- node scripts/bootstrap-api-integration-schema.mjs',
  );
  assert.equal(
    databasePackage.scripts?.['predb:push'],
    'node scripts/check-db-push-target.mjs',
  );
  assert.ok(
    !rootPackage.scripts?.['db:bootstrap:api-integration'].includes('migrate'),
  );
});
