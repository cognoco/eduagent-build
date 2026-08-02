import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

import { packageManagerLaunch } from './package-manager-launch.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const HARNESS = path.join(REPO_ROOT, 'scripts/run-db-writing-llm-harness.mjs');
const packageJson = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
);
const pnpmVersion = packageJson.packageManager.replace(/^pnpm@/, '');

test('maps a Windows pnpm JavaScript launcher through node.exe', () => {
  assert.deepEqual(
    packageManagerLaunch(
      String.raw`C:\Tools\pnpm\pnpm.cjs`,
      String.raw`C:\Program Files\nodejs\node.exe`,
    ),
    {
      binary: String.raw`C:\Program Files\nodejs\node.exe`,
      args: [String.raw`C:\Tools\pnpm\pnpm.cjs`],
    },
  );
});

test('maps a pnpm ESM launcher through the Node executable', () => {
  assert.deepEqual(
    packageManagerLaunch('/opt/pnpm/bin/pnpm.mjs', '/usr/local/bin/node'),
    {
      binary: '/usr/local/bin/node',
      args: ['/opt/pnpm/bin/pnpm.mjs'],
    },
  );
});

test('rejects an unsupported inner harness before command dispatch', () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'wi1628 dispatch-'));
  const sentinel = path.join(fixtureDir, 'child-dispatched');
  const preload = path.join(fixtureDir, 'sentinel-preload.cjs');
  const preloadOptionPath = preload.replaceAll('\\', '/');
  writeFileSync(
    preload,
    `
      const childProcess = require('node:child_process');
      const fs = require('node:fs');
      const { syncBuiltinESMExports } = require('node:module');
      childProcess.spawnSync = () => {
        fs.writeFileSync(process.env.WI1628_DISPATCH_SENTINEL, 'dispatched');
        return { status: 89 };
      };
      syncBuiltinESMExports();
    `,
  );

  try {
    const result = spawnSync(
      process.execPath,
      [HARNESS, '--inner', 'scripts/unapproved-harness.ts'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: `--require="${preloadOptionPath}"`,
          WI1628_DISPATCH_SENTINEL: sentinel,
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported harness.*unapproved-harness/i);
    assert.throws(() => readFileSync(sentinel), { code: 'ENOENT' });
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('inner harness launches tsx through the pinned npm_execpath', () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'wi1628-pnpm-'));
  const fakePnpm = path.join(fixtureDir, 'fake-pnpm.cjs');
  writeFileSync(
    fakePnpm,
    `
      if (process.argv[2] === '--version') {
        process.stdout.write(${JSON.stringify(pnpmVersion)});
        process.exit(0);
      }
      process.stdout.write('FAKE_PNPM:' + JSON.stringify(process.argv.slice(2)));
      process.exit(41);
    `,
  );

  try {
    const result = spawnSync(
      process.execPath,
      [HARNESS, '--inner', 'scripts/enduser-session-pass.ts'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL:
            'postgresql://integration:integration@localhost:5432/mentomate_integration',
          DOPPLER_PROJECT: 'mentomate',
          DOPPLER_CONFIG: 'dev_integration',
          DOPPLER_ENVIRONMENT: 'dev',
          npm_execpath: fakePnpm,
        },
      },
    );

    assert.equal(result.status, 41, result.stderr);
    assert.match(
      result.stdout,
      /FAKE_PNPM:\["exec","tsx",.*enduser-session-pass\.ts"\]/,
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
