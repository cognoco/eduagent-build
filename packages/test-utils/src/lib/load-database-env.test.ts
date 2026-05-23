import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { loadDatabaseEnv } from './load-database-env';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_DOPPLER_CLI = process.env.DOPPLER_CLI;
const ORIGINAL_PATH = process.env.PATH;
const itOnNonWindows = process.platform === 'win32' ? it.skip : it;

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
    delete process.env.DATABASE_URL;
    delete process.env.DOPPLER_CLI;
    process.env.PATH = ORIGINAL_PATH;

    workspaceRoot = mkdtempSync(join(tmpdir(), 'load-db-env-workspace-'));
    binDir = mkdtempSync(join(tmpdir(), 'load-db-env-bin-'));
  });

  afterEach(() => {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (ORIGINAL_DOPPLER_CLI) {
      process.env.DOPPLER_CLI = ORIGINAL_DOPPLER_CLI;
    } else {
      delete process.env.DOPPLER_CLI;
    }
    process.env.PATH = ORIGINAL_PATH;
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  });

  it('uses existing DATABASE_URL without invoking Doppler', () => {
    process.env.DATABASE_URL = 'postgres://existing-db';

    loadDatabaseEnv(workspaceRoot);

    expect(process.env.DATABASE_URL).toBe('postgres://existing-db');
  });

  itOnNonWindows('honors DOPPLER_CLI on non-Windows hosts', () => {
    const doppler = writeFakeDoppler(binDir, {
      DATABASE_URL: 'postgres://override-db',
      CLERK_SECRET_KEY: 'sk_test',
    });
    process.env.DOPPLER_CLI = doppler;

    loadDatabaseEnv(workspaceRoot);

    expect(process.env.DATABASE_URL).toBe('postgres://override-db');
    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test');
  });

  itOnNonWindows('discovers doppler from PATH on non-Windows hosts', () => {
    writeFakeDoppler(binDir, {
      DATABASE_URL: 'postgres://path-db',
    });
    const repoRoot = resolve(__dirname, '../../../..');
    const output = execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'exec',
        'tsx',
        '-e',
        [
          "import { loadDatabaseEnv } from './packages/test-utils/src/lib/load-database-env.ts';",
          'delete process.env.DATABASE_URL;',
          'delete process.env.DOPPLER_CLI;',
          `loadDatabaseEnv(${JSON.stringify(workspaceRoot)});`,
          "console.log(`DB=${process.env.DATABASE_URL ?? ''}`);",
        ].join(' '),
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          DOPPLER_CLI: '',
          DATABASE_URL: '',
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        },
      },
    );

    expect(output).toContain('DB=postgres://path-db');
  });
});
