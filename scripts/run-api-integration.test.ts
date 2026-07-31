import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'run-api-integration.mjs');
const ROOT_PACKAGE_JSON = join(REPO_ROOT, 'package.json');
const API_PROJECT_JSON = join(REPO_ROOT, 'apps', 'api', 'project.json');

const CONTRACT_ENV_KEYS = [
  'DATABASE_URL',
  'DOPPLER_PROJECT',
  'DOPPLER_CONFIG',
  'DOPPLER_ENVIRONMENT',
  'INTEGRATION_DATABASE_HOST',
  'INTEGRATION_DATABASE_NAME',
  'INTEGRATION_DATABASE_DISPOSABLE',
  'DATABASE_URL_STAGING_HOST',
  'DATABASE_URL_PRODUCTION_HOST',
] as const;

function writeExecutable(
  directory: string,
  name: string,
  source: string,
): void {
  const file = join(directory, name);
  writeFileSync(file, `#!/usr/bin/env node\n${source}\n`);
  chmodSync(file, 0o755);
}

function readMarker(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe('run-api-integration.mjs', () => {
  let binDir: string;
  let corepackMarker: string;
  let pnpmMarker: string;
  let dopplerMarker: string;

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), 'api-integration-bin-'));
    corepackMarker = join(binDir, 'corepack.log');
    pnpmMarker = join(binDir, 'pnpm.log');
    dopplerMarker = join(binDir, 'doppler.log');

    writeExecutable(
      binDir,
      'corepack',
      [
        "const { appendFileSync } = require('node:fs');",
        "appendFileSync(process.env.COREPACK_MARKER, process.argv.slice(2).join(' ') + '\\n');",
        "if (process.argv[2] === 'pnpm' && process.argv[3] === '--version') {",
        "  process.stdout.write(process.env.FAKE_PNPM_VERSION || '10.19.0');",
        '  process.exit(0);',
        '}',
        'process.exit(Number(process.env.FAKE_COREPACK_EXIT || 0));',
      ].join('\n'),
    );
    writeExecutable(
      binDir,
      'pnpm',
      [
        "const { appendFileSync } = require('node:fs');",
        "appendFileSync(process.env.PNPM_MARKER, process.argv.slice(2).join(' ') + '\\n');",
        'process.exit(91);',
      ].join('\n'),
    );
    writeExecutable(
      binDir,
      'doppler',
      [
        "const { appendFileSync } = require('node:fs');",
        "const { spawnSync } = require('node:child_process');",
        'const args = process.argv.slice(2);',
        "if (args[0] === '--version') process.exit(0);",
        "appendFileSync(process.env.DOPPLER_MARKER, args.join(' ') + '\\n');",
        "const separator = args.indexOf('--');",
        'if (separator < 0) process.exit(92);',
        'const child = spawnSync(args[separator + 1], args.slice(separator + 2), {',
        '  env: process.env,',
        "  stdio: 'inherit',",
        '});',
        'process.exit(child.status ?? 93);',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(binDir, { recursive: true, force: true });
  });

  function run(
    args: string[],
    overrides: Record<string, string | undefined> = {},
  ) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      COREPACK_MARKER: corepackMarker,
      PNPM_MARKER: pnpmMarker,
      DOPPLER_MARKER: dopplerMarker,
    };
    for (const key of CONTRACT_ENV_KEYS) {
      delete env[key];
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }

    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
    });
  }

  const localDatabase = {
    DATABASE_URL:
      'postgresql://test:test@127.0.0.1:5433/eduagent_integration_test',
  };

  const dedicatedDatabase = {
    DATABASE_URL:
      'postgresql://integration:secret@ep-integration.example.test/eduagent_integration',
    DOPPLER_PROJECT: 'mentomate',
    DOPPLER_CONFIG: 'dev_integration',
    DOPPLER_ENVIRONMENT: 'dev',
    INTEGRATION_DATABASE_HOST: 'ep-integration.example.test',
    INTEGRATION_DATABASE_NAME: 'eduagent_integration',
    INTEGRATION_DATABASE_DISPOSABLE: 'true',
    DATABASE_URL_STAGING_HOST: 'ep-staging.example.test',
    DATABASE_URL_PRODUCTION_HOST: 'ep-production.example.test',
  };

  test('Nx target delegates to the guarded launcher instead of bare pnpm', () => {
    const project = JSON.parse(readFileSync(API_PROJECT_JSON, 'utf8')) as {
      targets?: { 'integration-api'?: { options?: { command?: string } } };
    };

    expect(project.targets?.['integration-api']?.options?.command).toBe(
      'node scripts/run-api-integration.mjs --jest',
    );
  });

  test('uses repository-pinned Corepack pnpm when hostile pnpm is first on PATH', () => {
    const result = run(['--jest'], localDatabase);

    expect(result.status).toBe(0);
    expect(readMarker(pnpmMarker)).toBe('');
    expect(readMarker(corepackMarker)).toContain('pnpm --version');
    expect(readMarker(corepackMarker)).toContain(
      'pnpm exec jest --config apps/api/jest.integration.config.cjs --forceExit',
    );
  });

  test('forwards optional Jest arguments after the guarded target boundary', () => {
    const result = run(
      [
        '--jest',
        'apps/api/src/services/auth-scoping.integration.test.ts',
        '--runInBand',
        '--no-coverage',
      ],
      localDatabase,
    );

    expect(result.status).toBe(0);
    expect(readMarker(corepackMarker)).toContain(
      'pnpm exec jest --config apps/api/jest.integration.config.cjs --forceExit apps/api/src/services/auth-scoping.integration.test.ts --runInBand --no-coverage',
    );
  });

  test('refuses arguments passed to the Nx launcher instead of dropping them', () => {
    const result = run(
      ['--nx', 'apps/api/src/services/auth-scoping.integration.test.ts'],
      localDatabase,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--nx does not accept arguments.*--jest/i);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('preserves the package-manager version gate before Jest', () => {
    const result = run(['--jest'], {
      ...localDatabase,
      FAKE_PNPM_VERSION: '11.10.0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /requires pnpm 10\.19\.0.*resolved 11\.10\.0/,
    );
    expect(readMarker(corepackMarker)).not.toContain('pnpm exec jest');
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test('raw target refuses a missing DATABASE_URL before Jest', () => {
    const result = run(['--jest']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DATABASE_URL is required/);
    expect(readMarker(corepackMarker)).toBe('');
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test('accepts an IPv6 loopback database with explicit integration metadata', () => {
    const result = run(['--jest'], {
      DATABASE_URL:
        'postgresql://test:test@[::1]:5433/eduagent_integration_test',
    });

    expect(result.status).toBe(0);
    expect(readMarker(corepackMarker)).toContain('pnpm exec jest');
  });

  test('refuses a local database whose ordinary name only contains test letters', () => {
    const result = run(['--jest'], {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5433/customer_contest_data',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not explicitly test\/integration-scoped/i);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('local target refuses ambient staging Doppler metadata before Jest', () => {
    const result = run(['--jest'], {
      ...localDatabase,
      DOPPLER_PROJECT: 'mentomate',
      DOPPLER_CONFIG: 'dev_integration',
      DOPPLER_ENVIRONMENT: 'stg',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Doppler environment.*stg.*refused/i);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('refuses the current mentomate/stg wrapper injection before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      DOPPLER_CONFIG: 'stg',
      DOPPLER_ENVIRONMENT: 'stg',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Doppler config.*stg.*refused/i);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('refuses the former unprefixed dev integration config before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      DOPPLER_CONFIG: 'integration',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Doppler config.*integration.*refused/i);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('refuses an endpoint matching staging identity before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      DATABASE_URL:
        'postgresql://integration:secret@ep-staging.example.test/eduagent_integration',
      INTEGRATION_DATABASE_HOST: 'ep-staging.example.test',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/endpoint.*staging/i);
    expect(result.stderr).not.toContain('secret');
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('refuses non-disposable database metadata before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      INTEGRATION_DATABASE_DISPOSABLE: 'false',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/INTEGRATION_DATABASE_DISPOSABLE=true/);
    expect(readMarker(corepackMarker)).toBe('');
  });

  test('accepts matching dedicated non-staging database identity', () => {
    const result = run(['--jest'], dedicatedDatabase);

    expect(result.status).toBe(0);
    expect(readMarker(corepackMarker)).toContain('pnpm exec jest');
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test('canonical package command selects mentomate/dev_integration explicitly', () => {
    const pkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['test:api:integration']).toBe(
      'node scripts/run-api-integration.mjs',
    );

    const result = run([], dedicatedDatabase);
    expect(result.status).toBe(0);
    expect(readMarker(dopplerMarker)).toContain(
      'run --project mentomate --config dev_integration --',
    );
    expect(readMarker(corepackMarker)).toContain(
      'pnpm exec nx run api:integration-api',
    );
    expect(readMarker(pnpmMarker)).toBe('');
  });
});
