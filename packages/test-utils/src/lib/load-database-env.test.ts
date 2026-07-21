import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDatabaseEnv } from './load-database-env';

const DOPPLER_SECRET_KEYS = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'TEST_SEED_SECRET',
] as const;
type DopplerSecretKey = (typeof DOPPLER_SECRET_KEYS)[number];

const ISOLATED_ENV_KEYS = [...DOPPLER_SECRET_KEYS, 'DOPPLER_CLI'] as const;
type IsolatedEnvKey = (typeof ISOLATED_ENV_KEYS)[number];
const SNAPSHOTTED_ENV_KEYS = [...ISOLATED_ENV_KEYS, 'PATH'] as const;
type SnapshottedEnvKey = (typeof SNAPSHOTTED_ENV_KEYS)[number];

const ORIGINAL_ENV = Object.fromEntries(
  SNAPSHOTTED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<SnapshottedEnvKey, string | undefined>;

const HOST_ENV_SENTINELS: Record<IsolatedEnvKey, string> = {
  DATABASE_URL: 'postgres://fake-host-database',
  CLERK_SECRET_KEY: 'fake-host-clerk-secret',
  CLERK_PUBLISHABLE_KEY: 'fake-host-clerk-publishable',
  INNGEST_EVENT_KEY: 'fake-host-inngest-event',
  INNGEST_SIGNING_KEY: 'fake-host-inngest-signing',
  TEST_SEED_SECRET: 'fake-host-test-seed',
  DOPPLER_CLI: 'fake-host-doppler-cli',
};

const RESTORATION_SENTINELS: Record<SnapshottedEnvKey, string> = {
  DATABASE_URL: 'postgres://fake-restoration-database',
  CLERK_SECRET_KEY: 'fake-restoration-clerk-secret',
  CLERK_PUBLISHABLE_KEY: 'fake-restoration-clerk-publishable',
  INNGEST_EVENT_KEY: 'fake-restoration-inngest-event',
  INNGEST_SIGNING_KEY: 'fake-restoration-inngest-signing',
  TEST_SEED_SECRET: 'fake-restoration-test-seed',
  DOPPLER_CLI: 'fake-restoration-doppler-cli',
  PATH: 'fake-restoration-path',
};

const DOPPLER_OUTPUT_SENTINELS: Record<DopplerSecretKey, string> = {
  DATABASE_URL: 'postgres://fake-doppler-database',
  CLERK_SECRET_KEY: 'fake-doppler-clerk-secret',
  CLERK_PUBLISHABLE_KEY: 'fake-doppler-clerk-publishable',
  INNGEST_EVENT_KEY: 'fake-doppler-inngest-event',
  INNGEST_SIGNING_KEY: 'fake-doppler-inngest-signing',
  TEST_SEED_SECRET: 'fake-doppler-test-seed',
};

const EXPECTED_TRUE_BY_SECRET_KEY = Object.fromEntries(
  DOPPLER_SECRET_KEYS.map((key) => [key, true]),
) as Record<DopplerSecretKey, boolean>;
const EXPECTED_TRUE_BY_ISOLATED_KEY = Object.fromEntries(
  ISOLATED_ENV_KEYS.map((key) => [key, true]),
) as Record<IsolatedEnvKey, boolean>;
const EXPECTED_TRUE_BY_SNAPSHOTTED_KEY = Object.fromEntries(
  SNAPSHOTTED_ENV_KEYS.map((key) => [key, true]),
) as Record<SnapshottedEnvKey, boolean>;

const itOnNonWindows = process.platform === 'win32' ? it.skip : it;

function restoreEnv(key: SnapshottedEnvKey): void {
  const originalValue = ORIGINAL_ENV[key];
  if (originalValue === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = originalValue;
  }
}

function expectHostEnvironmentIsolated(): void {
  const isolated = Object.fromEntries(
    ISOLATED_ENV_KEYS.map((key) => [key, process.env[key] === undefined]),
  );

  expect(isolated).toEqual(EXPECTED_TRUE_BY_ISOLATED_KEY);
}

function expectOriginalEnvironmentRestored(): void {
  const restored = Object.fromEntries(
    SNAPSHOTTED_ENV_KEYS.map((key) => [
      key,
      process.env[key] === ORIGINAL_ENV[key],
    ]),
  );

  expect(restored).toEqual(EXPECTED_TRUE_BY_SNAPSHOTTED_KEY);
}

function withWorkingDirectory<T>(directory: string, callback: () => T): T {
  const originalDirectory = process.cwd();
  process.chdir(directory);
  try {
    return callback();
  } finally {
    process.chdir(originalDirectory);
  }
}

function writePortableNodeDoppler(
  binDir: string,
  secrets: Record<string, string>,
  invocationMarker: string,
): string {
  writeFileSync(
    join(binDir, 'secrets'),
    [
      "const { appendFileSync } = require('node:fs');",
      `const isolatedKeys = ${JSON.stringify(ISOLATED_ENV_KEYS)};`,
      `const intendedDopplerCli = ${JSON.stringify(process.execPath)};`,
      "const entryIsolated = Object.fromEntries(isolatedKeys.map((key) => [key, key === 'DOPPLER_CLI' ? process.env[key] === intendedDopplerCli : process.env[key] === undefined]));",
      `appendFileSync(${JSON.stringify(invocationMarker)}, JSON.stringify(entryIsolated) + '\\n');`,
      `process.stdout.write(${JSON.stringify(JSON.stringify(secrets))});`,
      '',
    ].join('\n'),
  );

  return process.execPath;
}

function invocationCount(marker: string): number {
  if (!existsSync(marker)) {
    return 0;
  }

  return readFileSync(marker, 'utf-8').split('\n').filter(Boolean).length;
}

function readInvocationEvidence(
  marker: string,
): Array<Record<IsolatedEnvKey, boolean>> {
  if (!existsSync(marker)) {
    return [];
  }

  return readFileSync(marker, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<IsolatedEnvKey, boolean>);
}

function writeFakeDoppler(
  binDir: string,
  secrets: Record<string, string>,
): string {
  const doppler = join(
    binDir,
    process.platform === 'win32' ? 'doppler.cmd' : 'doppler',
  );
  const json = JSON.stringify(secrets);
  const script =
    process.platform === 'win32'
      ? ['@echo off', `echo ${json}`, ''].join('\r\n')
      : ['#!/usr/bin/env sh', `printf '${json}'`, ''].join('\n');

  writeFileSync(doppler, script);
  chmodSync(doppler, 0o755);
  return doppler;
}

describe('loadDatabaseEnv', () => {
  let workspaceRoot: string;
  let binDir: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'load-db-env-workspace-'));
    binDir = mkdtempSync(join(tmpdir(), 'load-db-env-bin-'));

    for (const key of ISOLATED_ENV_KEYS) {
      process.env[key] = HOST_ENV_SENTINELS[key];
    }
    for (const key of ISOLATED_ENV_KEYS) {
      delete process.env[key];
    }
    restoreEnv('PATH');
  });

  afterEach(() => {
    try {
      for (const key of SNAPSHOTTED_ENV_KEYS) {
        process.env[key] = RESTORATION_SENTINELS[key];
      }
      for (const key of SNAPSHOTTED_ENV_KEYS) {
        restoreEnv(key);
      }
      expectOriginalEnvironmentRestored();
    } finally {
      for (const key of SNAPSHOTTED_ENV_KEYS) {
        restoreEnv(key);
      }
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('uses existing DATABASE_URL without invoking Doppler', () => {
    expectHostEnvironmentIsolated();
    const invocationMarker = join(binDir, 'doppler-invocations');
    process.env.DOPPLER_CLI = writePortableNodeDoppler(
      binDir,
      DOPPLER_OUTPUT_SENTINELS,
      invocationMarker,
    );
    process.env.DATABASE_URL = 'postgres://fake-existing-database';

    withWorkingDirectory(binDir, () => loadDatabaseEnv(workspaceRoot));

    expect(
      process.env.DATABASE_URL === 'postgres://fake-existing-database',
    ).toBe(true);
    expect(invocationCount(invocationMarker)).toBe(0);
  });

  it('loads every projected secret through DOPPLER_CLI', () => {
    expectHostEnvironmentIsolated();
    const invocationMarker = join(binDir, 'doppler-invocations');
    const dopplerCli = writePortableNodeDoppler(
      binDir,
      DOPPLER_OUTPUT_SENTINELS,
      invocationMarker,
    );
    const repoRoot = resolve(__dirname, '../../../..');
    const loaderUrl = pathToFileURL(
      join(repoRoot, 'packages/test-utils/src/lib/load-database-env.ts'),
    ).href;
    const tsxCli = createRequire(__filename).resolve('tsx/cli');
    const output = execFileSync(
      process.execPath,
      [
        tsxCli,
        '-e',
        [
          `import { loadDatabaseEnv } from ${JSON.stringify(loaderUrl)};`,
          `loadDatabaseEnv(${JSON.stringify(workspaceRoot)});`,
          `const expected = ${JSON.stringify(DOPPLER_OUTPUT_SENTINELS)};`,
          'const matches = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, process.env[key] === value]));',
          'console.log(`PROJECTED_MATCHES=${JSON.stringify(matches)}`);',
        ].join(' '),
      ],
      {
        cwd: binDir,
        encoding: 'utf-8',
        env: {
          DOPPLER_CLI: dopplerCli,
          NODE_ENV: 'test',
          PATH: process.env.PATH,
        },
      },
    );

    const matches = output.match(/PROJECTED_MATCHES=(\{.*\})/)?.[1];
    expect(matches ? JSON.parse(matches) : null).toEqual(
      EXPECTED_TRUE_BY_SECRET_KEY,
    );
    expect(readInvocationEvidence(invocationMarker)).toEqual([
      EXPECTED_TRUE_BY_ISOLATED_KEY,
    ]);
  });

  itOnNonWindows('loads every projected secret from PATH Doppler', () => {
    expectHostEnvironmentIsolated();
    writeFakeDoppler(binDir, DOPPLER_OUTPUT_SENTINELS);
    const repoRoot = resolve(__dirname, '../../../..');
    const tsxCli = createRequire(__filename).resolve('tsx/cli');
    const output = execFileSync(
      process.execPath,
      [
        tsxCli,
        '-e',
        [
          "import { loadDatabaseEnv } from './packages/test-utils/src/lib/load-database-env.ts';",
          `const isolatedKeys = ${JSON.stringify(ISOLATED_ENV_KEYS)};`,
          'const entryIsolated = Object.fromEntries(isolatedKeys.map((key) => [key, process.env[key] === undefined]));',
          'console.log(`ENTRY_ISOLATED=${JSON.stringify(entryIsolated)}`);',
          `loadDatabaseEnv(${JSON.stringify(workspaceRoot)});`,
          `const expected = ${JSON.stringify(DOPPLER_OUTPUT_SENTINELS)};`,
          'const matches = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, process.env[key] === value]));',
          'console.log(`PROJECTED_MATCHES=${JSON.stringify(matches)}`);',
        ].join(' '),
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          NODE_ENV: 'test',
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        },
      },
    );

    const entryIsolated = output.match(/ENTRY_ISOLATED=(\{.*\})/)?.[1];
    expect(entryIsolated ? JSON.parse(entryIsolated) : null).toEqual(
      EXPECTED_TRUE_BY_ISOLATED_KEY,
    );
    const matches = output.match(/PROJECTED_MATCHES=(\{.*\})/)?.[1];
    expect(matches ? JSON.parse(matches) : null).toEqual(
      EXPECTED_TRUE_BY_SECRET_KEY,
    );
  });
});
