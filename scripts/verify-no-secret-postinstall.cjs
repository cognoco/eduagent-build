#!/usr/bin/env node
/**
 * [BUG-781 / CFG-1] Verify the setup-env script (which writes live staging
 * secrets to .dev.vars) is NOT wired into any auto-running install hook.
 *
 * Background: setup-env.js downloads Doppler-managed secrets and writes them
 * to apps/api/.dev.vars (mode 0o600). If it ran on every `pnpm install`,
 * any contributor with Doppler scope would auto-populate the file, and a
 * single careless `git add .` could ship staging credentials to a public
 * commit. This script enforces the invariant — runs in CI / pre-commit /
 * locally — that no install lifecycle hook calls setup-env.
 *
 * Exits non-zero with a clear error if violated.
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN_HOOKS = [
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'postprepare',
];

const ROOT_PKG = path.join(__dirname, '..', 'package.json');
const violations = [];

function checkPackageJson(filePath) {
  if (!fs.existsSync(filePath)) return;
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    violations.push(`${filePath}: failed to parse — ${err.message}`);
    return;
  }
  const scripts = pkg.scripts || {};
  for (const hook of FORBIDDEN_HOOKS) {
    const cmd = scripts[hook];
    if (typeof cmd === 'string' && /setup-env|env:sync/.test(cmd)) {
      violations.push(
        `${filePath}: script "${hook}" references setup-env / env:sync — ` +
          `auto-running on install would write live staging secrets to disk.`
      );
    }
  }
}

checkPackageJson(ROOT_PKG);

const workspaces = ['apps/api', 'apps/mobile', 'apps/web'];
for (const ws of workspaces) {
  checkPackageJson(path.join(__dirname, '..', ws, 'package.json'));
}

if (violations.length > 0) {
  console.error('[BUG-781 / CFG-1] Postinstall safety check FAILED:');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}

console.log(
  '[BUG-781 / CFG-1] OK — no install hooks reference setup-env / env:sync.'
);
