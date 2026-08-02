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
