import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadDatabaseEnv } from './load-database-env';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_DOPPLER_CLI = process.env.DOPPLER_CLI;
const ORIGINAL_PATH = process.env.PATH;

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

  it('honors DOPPLER_CLI on non-Windows hosts', () => {
    const doppler = join(binDir, 'doppler');
    writeFileSync(
      doppler,
      [
        '#!/usr/bin/env sh',
        'printf \'{"DATABASE_URL":"postgres://override-db","CLERK_SECRET_KEY":"sk_test"}\'',
        '',
      ].join('\n'),
    );
    chmodSync(doppler, 0o755);
    process.env.DOPPLER_CLI = doppler;

    loadDatabaseEnv(workspaceRoot);

    expect(process.env.DATABASE_URL).toBe('postgres://override-db');
    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test');
  });

  it('discovers doppler from PATH on non-Windows hosts', () => {
    const doppler = join(binDir, 'doppler');
    writeFileSync(
      doppler,
      [
        '#!/usr/bin/env sh',
        'printf \'{"DATABASE_URL":"postgres://path-db"}\'',
        '',
      ].join('\n'),
    );
    chmodSync(doppler, 0o755);
    const repoRoot = resolve(__dirname, '../../../..');
    const output = execFileSync(
      'pnpm',
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
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      },
    );

    expect(output).toContain('DB=postgres://path-db');
  });
});
