/**
 * Guard regression tests for check-db-push-target.mjs (WI-795).
 *
 * Verifies:
 *  - Push is blocked when DOPPLER_CONFIG is stg, prd, or an unknown value.
 *  - Push is permitted when DOPPLER_CONFIG is absent (local dev without Doppler).
 *  - Push is permitted when DOPPLER_CONFIG=dev.
 *  - Credential redaction is applied before logging DATABASE_URL.
 *  - packages/database/package.json wires predb:push → check-db-push-target.mjs.
 *  - Root package.json db:push:dev invokes the package db:push script (not exec).
 *
 * Run with:
 *   node --test packages/database/scripts/check-db-push-target.test.mjs
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARD_SCRIPT = path.join(__dirname, 'check-db-push-target.mjs');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DB_PKG_JSON = path.join(__dirname, '..', 'package.json');
const ROOT_PKG_JSON = path.join(REPO_ROOT, 'package.json');

/**
 * Run the guard script with the given DOPPLER_CONFIG override.
 * We deliberately strip DOPPLER_CONFIG from the inherited process env so that
 * a Doppler-wrapped test runner doesn't leak its own config into the test.
 */
function runGuard(overrides = {}) {
  const env = { ...process.env, ...overrides };
  // Always remove DOPPLER_CONFIG from inherited env unless the test explicitly
  // sets it, so that a Doppler-wrapped test runner doesn't make all tests pass.
  if (!Object.prototype.hasOwnProperty.call(overrides, 'DOPPLER_CONFIG')) {
    delete env.DOPPLER_CONFIG;
  }
  return spawnSync(process.execPath, [GUARD_SCRIPT], { env, encoding: 'utf8' });
}

// ── Blocking cases ────────────────────────────────────────────────────────────

test('guard exits 1 when DOPPLER_CONFIG=stg', () => {
  const { status, stderr } = runGuard({ DOPPLER_CONFIG: 'stg' });
  assert.equal(status, 1, 'expected exit 1 — push against stg must be blocked');
  assert.match(stderr, /drizzle-kit push is blocked/);
  assert.match(stderr, /Doppler config: stg/);
});

test('guard exits 1 when DOPPLER_CONFIG=prd', () => {
  const { status, stderr } = runGuard({ DOPPLER_CONFIG: 'prd' });
  assert.equal(status, 1);
  assert.match(stderr, /drizzle-kit push is blocked/);
  assert.match(stderr, /Doppler config: prd/);
});

test('guard exits 1 when DOPPLER_CONFIG=production', () => {
  const { status, stderr } = runGuard({ DOPPLER_CONFIG: 'production' });
  assert.equal(status, 1);
  assert.match(stderr, /drizzle-kit push is blocked/);
});

test('guard exits 1 when DOPPLER_CONFIG=staging', () => {
  const { status, stderr } = runGuard({ DOPPLER_CONFIG: 'staging' });
  assert.equal(status, 1);
  assert.match(stderr, /drizzle-kit push is blocked/);
});

test('guard exits 1 for any unknown DOPPLER_CONFIG value (err on the safe side)', () => {
  const { status } = runGuard({ DOPPLER_CONFIG: 'e2e-ci' });
  assert.equal(status, 1);
});

test('guard exits 1 when DOPPLER_CONFIG is absent and DB_PUSH_LOCAL_DEV is not set', () => {
  // Without Doppler, DATABASE_URL may already be set in the process env (a leftover
  // doppler-run shell, an exported var, or a bare packages/database/.env). Block by
  // default; require explicit opt-in.
  const { status, stderr } = runGuard({ DOPPLER_CONFIG: undefined });
  assert.equal(status, 1, 'expected exit 1 — no Doppler without override should be blocked');
  assert.match(stderr, /drizzle-kit push is blocked/);
  assert.match(stderr, /DB_PUSH_LOCAL_DEV/);
});

// ── Permitted cases ───────────────────────────────────────────────────────────

test('guard exits 0 when DOPPLER_CONFIG=dev', () => {
  const { status, stdout } = runGuard({ DOPPLER_CONFIG: 'dev' });
  assert.equal(status, 0, 'expected exit 0 — dev config is explicitly allowed');
  assert.match(stdout, /dev Doppler config confirmed/);
});

test('guard exits 0 when DOPPLER_CONFIG is absent and DB_PUSH_LOCAL_DEV=1', () => {
  const { status, stdout } = runGuard({ DOPPLER_CONFIG: undefined, DB_PUSH_LOCAL_DEV: '1' });
  assert.equal(status, 0, 'expected exit 0 — explicit local-dev override accepted');
  assert.match(stdout, /DB_PUSH_LOCAL_DEV=1 override accepted/);
});

// ── DB_PUSH_LOCAL_DEV escape must still check the resolved host (WI-1874) ────

test('guard exits 1 when DB_PUSH_LOCAL_DEV=1 but DATABASE_URL resolves to a stg/neon.tech host', () => {
  // A dev who sets DB_PUSH_LOCAL_DEV=1 intending to hit local Postgres, but has a
  // staging DATABASE_URL already set in the process env, must not be allowed
  // through — that's the exact April-2026 stg push-drift incident. (drizzle-kit
  // loads only a bare .env from packages/database cwd, never repo-root .env.development.local.)
  const { status, stderr } = runGuard({
    DOPPLER_CONFIG: undefined,
    DB_PUSH_LOCAL_DEV: '1',
    DATABASE_URL: 'postgres://stguser:stgpass@ep-example-stg.neon.tech/mydb',
  });
  assert.equal(status, 1, 'expected exit 1 — escape must not push to a neon.tech host');
  assert.match(stderr, /drizzle-kit push is blocked/);
  assert.match(stderr, /localhost/);
  assert.ok(!stderr.includes('stguser'), 'username must not appear in output');
  assert.ok(!stderr.includes('stgpass'), 'password must not appear in output');
});

test('guard exits 0 when DB_PUSH_LOCAL_DEV=1 and DATABASE_URL resolves to localhost', () => {
  const { status, stdout } = runGuard({
    DOPPLER_CONFIG: undefined,
    DB_PUSH_LOCAL_DEV: '1',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/mydb',
  });
  assert.equal(status, 0, 'expected exit 0 — localhost is the intended local-dev target');
  assert.match(stdout, /DB_PUSH_LOCAL_DEV=1 override accepted/);
});

test('guard exits 0 when DB_PUSH_LOCAL_DEV=1 and DATABASE_URL resolves to 127.0.0.1', () => {
  const { status, stdout } = runGuard({
    DOPPLER_CONFIG: undefined,
    DB_PUSH_LOCAL_DEV: '1',
    DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/mydb',
  });
  assert.equal(status, 0, 'expected exit 0 — 127.0.0.1 is the intended local-dev target');
  assert.match(stdout, /DB_PUSH_LOCAL_DEV=1 override accepted/);
});

// ── Credential redaction ──────────────────────────────────────────────────────

test('guard redacts credentials in DATABASE_URL before logging (stg config)', () => {
  const { stderr } = runGuard({
    DOPPLER_CONFIG: 'stg',
    DATABASE_URL: 'postgres://secretuser:secretpass@ep-example.neon.tech/mydb',
  });
  assert.ok(!stderr.includes('secretuser'), 'username must not appear in output');
  assert.ok(!stderr.includes('secretpass'), 'password must not appear in output');
  assert.match(stderr, /ep-example\.neon\.tech/, 'host should be visible for diagnostics');
});

test('guard redacts credentials in DATABASE_URL before logging (no Doppler)', () => {
  const { stderr } = runGuard({
    DOPPLER_CONFIG: undefined,
    DATABASE_URL: 'postgres://secretuser:secretpass@ep-example.neon.tech/mydb',
  });
  assert.ok(!stderr.includes('secretuser'), 'username must not appear in output');
  assert.ok(!stderr.includes('secretpass'), 'password must not appear in output');
  assert.match(stderr, /ep-example\.neon\.tech/, 'host should be visible for diagnostics');
});

// ── Wiring checks ─────────────────────────────────────────────────────────────

test('packages/database/package.json predb:push wires the guard', () => {
  const pkg = JSON.parse(readFileSync(DB_PKG_JSON, 'utf8'));
  const preScript = pkg.scripts?.['predb:push'];
  assert.ok(
    typeof preScript === 'string',
    'packages/database/package.json must have a "predb:push" script',
  );
  assert.match(
    preScript,
    /check-db-push-target/,
    '"predb:push" must invoke check-db-push-target.mjs',
  );
});

test('root package.json db:push:dev does not bypass predb:push via pnpm exec', () => {
  // If db:push:dev calls `pnpm exec tsx ... drizzle-kit push` directly (the old
  // form), it bypasses lifecycle hooks (predb:push) entirely. This test asserts
  // that the script now calls `pnpm run db:push` (or `pnpm --filter ... run
  // db:push`), so the pre-script fires.
  const pkg = JSON.parse(readFileSync(ROOT_PKG_JSON, 'utf8'));
  const pushScript = pkg.scripts?.['db:push:dev'];
  assert.ok(
    typeof pushScript === 'string',
    'root package.json must have a "db:push:dev" script',
  );
  // Must call the package script (lifecycle hooks) — not bypass it via exec.
  const usesExecBypass =
    pushScript.includes('exec tsx') && pushScript.includes('drizzle-kit/bin.cjs push');
  assert.ok(
    !usesExecBypass,
    'db:push:dev must not call drizzle-kit/bin.cjs directly (bypasses predb:push). ' +
      'Use `pnpm --filter @eduagent/database run db:push` instead.',
  );
  // Must invoke the package-level db:push script so predb:push fires.
  const callsRunScript =
    pushScript.includes('run db:push') ||
    pushScript.includes("run 'db:push'") ||
    pushScript.includes('run "db:push"');
  assert.ok(
    callsRunScript,
    'db:push:dev must call `pnpm run db:push` (or equivalent) so predb:push fires.',
  );
});

test('root package.json db:push:dev pins Doppler to dev config (-c dev)', () => {
  // Without `-c dev`, `doppler run --` uses the directory's configured config.
  // setup-env.js prompts users to select `stg` as their directory config, so a
  // bare `doppler run --` would inject DOPPLER_CONFIG=stg and block the push.
  const pkg = JSON.parse(readFileSync(ROOT_PKG_JSON, 'utf8'));
  const pushScript = pkg.scripts?.['db:push:dev'];
  assert.ok(
    typeof pushScript === 'string',
    'root package.json must have a "db:push:dev" script',
  );
  const pinsDevConfig =
    pushScript.includes('-c dev') ||
    pushScript.includes('--config dev');
  assert.ok(
    pinsDevConfig,
    'db:push:dev must pass `-c dev` (or `--config dev`) to doppler run so DOPPLER_CONFIG=dev is always set.',
  );
});
