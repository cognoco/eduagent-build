'use strict';

// Non-gating quarantine report lane (WI-536). Runs the quarantined tests with
// QUARANTINE_MODE=report — which makes the registry helpers return EMPTY ignore
// sets, so the exact files the PR gate SKIPS are the files this lane RUNS.
// ALWAYS exits 0: flakiness stays measured and visible, but never gates main.

const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

// Force report mode for this process AND the children we spawn.
process.env.QUARANTINE_MODE = 'report';
const { entriesFor } = require('./registry.cjs');

function run(label, cmd, args) {
  console.log(`\n=== quarantine report · ${label} ===`);
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log(`(${label} exited ${r.status})`);
}

const jest = entriesFor('jest').map((e) => e.path);
const playwright = entriesFor('playwright').map((e) => e.path);

if (jest.length === 0 && playwright.length === 0) {
  console.log('quarantine report: registry is empty — nothing to run.');
  process.exit(0);
}

if (jest.length) {
  // Positional args are jest test-path patterns; QUARANTINE_MODE=report keeps
  // them from being ignored. --passWithNoTests guards an empty match.
  run('jest', 'pnpm', ['exec', 'jest', ...jest, '--passWithNoTests']);
}

if (playwright.length) {
  // Executing e2e quarantines needs the full web-e2e harness (browsers, the
  // wrangler/expo web server, staging secrets) — that belongs to the CI
  // restructure (WI-452). By default we LIST the quarantined specs so they
  // stay visible; set QUARANTINE_E2E=1 (with the harness available) to run them.
  if (process.env.QUARANTINE_E2E === '1') {
    run('playwright', 'pnpm', [
      'exec',
      'playwright',
      'test',
      '-c',
      'apps/mobile/playwright.config.ts',
      ...playwright,
    ]);
  } else {
    run('playwright (list only)', 'pnpm', [
      'exec',
      'playwright',
      'test',
      '-c',
      'apps/mobile/playwright.config.ts',
      '--list',
      ...playwright,
    ]);
  }
}

console.log('\nquarantine report complete — non-gating (always green).');
process.exit(0);
