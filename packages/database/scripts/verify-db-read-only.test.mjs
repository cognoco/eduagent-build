/**
 * WI-1628 durable regression guard for lane-safe staging DB credentials.
 *
 * Run with:
 *   node --test packages/database/scripts/verify-db-read-only.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertReadOnlyCapabilities } from './verify-db-read-only-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const readOnlyCapabilities = {
  is_superuser: false,
  can_create_database: false,
  can_create_schema: false,
  owns_application_objects: false,
  has_table_writes: false,
  has_sequence_writes: false,
};

test('accepts a role limited to connect, schema usage, and reads', () => {
  assert.doesNotThrow(() => assertReadOnlyCapabilities(readOnlyCapabilities));
});

for (const [capability, message] of [
  ['is_superuser', /superuser/i],
  ['can_create_database', /database create/i],
  ['can_create_schema', /schema create/i],
  ['owns_application_objects', /owns application objects/i],
  ['has_table_writes', /table write/i],
  ['has_sequence_writes', /sequence write/i],
]) {
  test(`rejects a role with ${capability}`, () => {
    assert.throws(
      () =>
        assertReadOnlyCapabilities({
          ...readOnlyCapabilities,
          [capability]: true,
        }),
      message,
    );
  });
}

test('env sync verifies the staging DB role before writing local secret files', () => {
  const source = readFileSync(
    path.join(REPO_ROOT, 'scripts/setup-env.js'),
    'utf8',
  );
  const download = source.indexOf('const content = downloadSecrets');
  const verify = source.indexOf('verifyDatabaseIsReadOnly(content)');
  const localWrite = source.indexOf('fs.writeFileSync(output.path, header +');

  assert.ok(download >= 0, 'Doppler download is missing');
  assert.ok(verify >= 0, 'read-only database verifier is missing');
  assert.ok(localWrite >= 0, 'local env writer is missing');
  assert.ok(download < verify, 'verification must follow secret download');
  assert.ok(
    verify < localWrite,
    'verification must precede local secret writes',
  );
});

test('DB-writing LLM harnesses use the disposable integration DB wrapper', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  );

  assert.equal(
    packageJson.scripts['test:llm:enduser'],
    'node scripts/run-db-writing-llm-harness.mjs scripts/enduser-session-pass.ts',
  );
  assert.equal(
    packageJson.scripts['test:llm:premium-routing'],
    'node scripts/run-db-writing-llm-harness.mjs scripts/premium-routing-pass.ts',
  );

  const wrapper = readFileSync(
    path.join(REPO_ROOT, 'scripts/run-db-writing-llm-harness.mjs'),
    'utf8',
  );
  assert.match(wrapper, /'--config',\s*'integration'/);
  assert.match(wrapper, /'--config',\s*'stg'/);
  assert.match(wrapper, /--preserve-env=/);
  assert.match(wrapper, /--check-only/);
});

test('protected Worker syncs receive a separate application database credential', () => {
  const deployWorkflow = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/deploy.yml'),
    'utf8',
  );
  const productionSyncWorkflow = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/production-secret-sync.yml'),
    'utf8',
  );

  assert.match(
    deployWorkflow,
    /WORKER_DATABASE_URL:.*DATABASE_URL_STAGING_APP.*DATABASE_URL_PRODUCTION_APP/,
  );
  assert.match(
    productionSyncWorkflow,
    /WORKER_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL_PRODUCTION_APP\s*\}\}/,
  );
  assert.equal(
    [
      ...productionSyncWorkflow.matchAll(
        /WORKER_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL_PRODUCTION_APP\s*\}\}/g,
      ),
    ].length,
    3,
    'assert, bulk sync, and deletion rollback must all receive the app URL',
  );
});

test('manual production sync maps the app credential to the runtime variable', () => {
  const runbook = readFileSync(
    path.join(REPO_ROOT, 'docs/runbooks/production-worker-secret-sync.md'),
    'utf8',
  );
  const assignment = runbook.indexOf(
    '$env:WORKER_DATABASE_URL = $env:DATABASE_URL_PRODUCTION_APP',
  );
  const sync = runbook.indexOf('pnpm secrets:sync prd', assignment);

  assert.ok(assignment >= 0, 'manual app credential mapping is missing');
  assert.ok(sync > assignment, 'manual mapping must precede protected sync');
});
