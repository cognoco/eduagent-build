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
const FAKE_PNPM_PRELOAD =
  './scripts/__fixtures__/run-api-integration/fake-pnpm-preload.cjs';
const FAKE_DOPPLER_PRELOAD =
  './scripts/__fixtures__/doppler-run/fake-doppler-preload.cjs';

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

function readPnpmLaunches(file: string): Array<{
  command: string;
  args: string[];
}> {
  return readMarker(file)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { command: string; args: string[] });
}

function readPnpmCommands(file: string): string {
  return readPnpmLaunches(file)
    .map(({ command, args }) =>
      (command === process.execPath ? args.slice(1) : args).join(' '),
    )
    .join('\n');
}

describe('run-api-integration.mjs', () => {
  let binDir: string;
  let corepackMarker: string;
  let pnpmMarker: string;
  let pnpmLaunchMarker: string;
  let dopplerMarker: string;

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), 'api-integration-bin-'));
    corepackMarker = join(binDir, 'corepack.log');
    pnpmMarker = join(binDir, 'pnpm.log');
    pnpmLaunchMarker = join(binDir, 'pnpm-launch.log');
    dopplerMarker = join(binDir, 'doppler.log');

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
    const defaultPnpmCli = join(binDir, 'pnpm.cjs');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      PNPM_MARKER: pnpmMarker,
      DOPPLER_MARKER: dopplerMarker,
      npm_execpath: defaultPnpmCli,
      FAKE_PNPM_CLI: defaultPnpmCli,
      FAKE_PNPM_LAUNCH_MARKER: pnpmLaunchMarker,
      FAKE_COREPACK_MARKER: corepackMarker,
      DOPPLER_RUN_FAKE_EXEC_CHILD: '1',
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require=${FAKE_DOPPLER_PRELOAD}`,
        `--require=${FAKE_PNPM_PRELOAD}`,
      ]
        .filter(Boolean)
        .join(' '),
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

  function fakePnpmLauncher(
    pnpmCli: string,
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    return {
      npm_execpath: pnpmCli,
      FAKE_PNPM_CLI: pnpmCli,
      FAKE_PNPM_LAUNCH_MARKER: pnpmLaunchMarker,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${FAKE_PNPM_PRELOAD}`]
        .filter(Boolean)
        .join(' '),
      ...overrides,
    };
  }

  test('Nx target delegates to the guarded launcher instead of bare pnpm', () => {
    const project = JSON.parse(readFileSync(API_PROJECT_JSON, 'utf8')) as {
      targets?: {
        'integration-api'?: { options?: { command?: string } };
        'test:integration'?: { options?: { command?: string } };
      };
    };

    expect(project.targets?.['integration-api']?.options?.command).toBe(
      'node scripts/run-api-integration.mjs --jest',
    );
    expect(project.targets?.['test:integration']?.options?.command).toBe(
      'pnpm run test:api:integration:cross-package:ci',
    );
  });

  test('cross-package integration suite uses the disposable database guard', () => {
    const result = run(['--cross-package', '--runInBand'], dedicatedDatabase);

    expect(result.status).toBe(0);
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain(
      'exec jest --config tests/integration/jest.config.cjs --no-coverage --runInBand',
    );
  });

  test.each([
    {
      name: 'standalone Windows pnpm.exe',
      pnpmCli: 'C:\\Tools\\pnpm\\pnpm.exe',
      command: 'C:\\Tools\\pnpm\\pnpm.exe',
      prefixArgs: [],
    },
    {
      name: 'Windows pnpm.cjs CLI',
      pnpmCli: 'C:\\Tools\\pnpm\\pnpm.cjs',
      command: process.execPath,
      prefixArgs: ['C:\\Tools\\pnpm\\pnpm.cjs'],
    },
    {
      name: 'POSIX pnpm.js CLI',
      pnpmCli: '/opt/pnpm/pnpm.js',
      command: process.execPath,
      prefixArgs: ['/opt/pnpm/pnpm.js'],
    },
    {
      name: 'POSIX pnpm.mjs CLI',
      pnpmCli: '/opt/pnpm/pnpm.mjs',
      command: process.execPath,
      prefixArgs: ['/opt/pnpm/pnpm.mjs'],
    },
  ])(
    'launches $name through npm_execpath with exact forwarded arguments',
    ({ pnpmCli, command, prefixArgs }) => {
      const forwardedArgs = [
        'apps/api/src/services/auth-scoping.integration.test.ts',
        '--runInBand',
        '--no-coverage',
      ];
      const result = run(['--jest', ...forwardedArgs], {
        ...localDatabase,
        ...fakePnpmLauncher(pnpmCli),
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(readPnpmLaunches(pnpmLaunchMarker)).toEqual([
        {
          command,
          args: [...prefixArgs, '--version'],
        },
        {
          command,
          args: [
            ...prefixArgs,
            'exec',
            'jest',
            '--config',
            'apps/api/jest.integration.config.cjs',
            '--forceExit',
            ...forwardedArgs,
          ],
        },
      ]);
    },
  );

  test('rejects a lifecycle pnpm version mismatch before command dispatch', () => {
    const pnpmCli = 'C:\\Tools\\pnpm\\pnpm.exe';
    const result = run(['--jest'], {
      ...localDatabase,
      ...fakePnpmLauncher(pnpmCli, { FAKE_PNPM_VERSION: '11.10.0' }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /requires pnpm 10\.19\.0.*resolved 11\.10\.0/,
    );
    expect(readPnpmLaunches(pnpmLaunchMarker)).toEqual([
      {
        command: pnpmCli,
        args: ['--version'],
      },
    ]);
  });

  test('uses lifecycle-provided pinned pnpm when hostile pnpm is first on PATH', () => {
    const result = run(['--jest'], localDatabase);

    expect(result.status).toBe(0);
    expect(readMarker(pnpmMarker)).toBe('');
    expect(readMarker(corepackMarker)).toBe('');
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain('--version');
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain(
      'exec jest --config apps/api/jest.integration.config.cjs --forceExit',
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
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain(
      'exec jest --config apps/api/jest.integration.config.cjs --forceExit apps/api/src/services/auth-scoping.integration.test.ts --runInBand --no-coverage',
    );
    expect(readPnpmCommands(pnpmLaunchMarker)).not.toContain(
      'jest.integration.remote.config.cjs',
    );
  });

  test('refuses arguments passed to the Nx launcher instead of dropping them', () => {
    const result = run(
      ['--nx', 'apps/api/src/services/auth-scoping.integration.test.ts'],
      localDatabase,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--nx does not accept arguments.*--jest/i);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
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
    expect(readPnpmCommands(pnpmLaunchMarker)).not.toContain('exec jest');
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test('raw target refuses a missing DATABASE_URL before Jest', () => {
    const result = run(['--jest']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DATABASE_URL is required/);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test('accepts an IPv6 loopback database with explicit integration metadata', () => {
    const result = run(['--jest'], {
      DATABASE_URL:
        'postgresql://test:test@[::1]:5433/eduagent_integration_test',
    });

    expect(result.status).toBe(0);
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain('exec jest');
  });

  test('refuses a local database whose ordinary name only contains test letters', () => {
    const result = run(['--jest'], {
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5433/customer_contest_data',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not explicitly test\/integration-scoped/i);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
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
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
  });

  test('refuses the current mentomate/stg wrapper injection before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      DOPPLER_CONFIG: 'stg',
      DOPPLER_ENVIRONMENT: 'stg',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Doppler config.*stg.*refused/i);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
  });

  test('refuses the former unprefixed dev integration config before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      DOPPLER_CONFIG: 'integration',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Doppler config.*integration.*refused/i);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
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
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
  });

  test('refuses non-disposable database metadata before Jest', () => {
    const result = run(['--jest'], {
      ...dedicatedDatabase,
      INTEGRATION_DATABASE_DISPOSABLE: 'false',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/INTEGRATION_DATABASE_DISPOSABLE=true/);
    expect(readPnpmCommands(pnpmLaunchMarker)).toBe('');
  });

  test('accepts matching dedicated non-staging database identity', () => {
    const result = run(['--jest'], dedicatedDatabase);

    expect(result.status).toBe(0);
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain(
      'exec jest --config apps/api/jest.integration.remote.config.cjs --forceExit',
    );
    expect(readMarker(pnpmMarker)).toBe('');
  });

  test.each([
    'apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts',
    './apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts',
    resolve(
      REPO_ROOT,
      'apps/api/src/db/curriculum-dedup-index-repair.integration.test.ts',
    ),
  ])(
    'explicitly refuses the loopback-only repair suite on a remote target: %s',
    (suitePath) => {
      const result = run(['--jest', suitePath], dedicatedDatabase);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/repair suite.*loopback-only/i);
      expect(readPnpmCommands(pnpmLaunchMarker)).not.toContain('exec jest');
    },
  );

  test('remote config preserves base exclusions and separates the loopback suite', () => {
    const baseConfig = require('../apps/api/jest.integration.config.cjs') as {
      testPathIgnorePatterns: string[];
    };
    const remoteConfig =
      require('../apps/api/jest.integration.remote.config.cjs') as {
        testPathIgnorePatterns: string[];
      };

    expect(remoteConfig.testPathIgnorePatterns).toEqual([
      ...baseConfig.testPathIgnorePatterns,
      'apps/api/src/db/curriculum-dedup-index-repair\\.integration\\.test\\.ts$',
    ]);
  });

  test('--check-only validates the disposable DB without launching Jest', () => {
    const result = run(['--check-only'], dedicatedDatabase);

    expect(result.status).toBe(0);
    expect(readMarker(corepackMarker)).toBe('');
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
    expect(readMarker(corepackMarker)).toBe('');
    expect(readPnpmCommands(pnpmLaunchMarker)).toContain(
      'exec nx run api:integration-api',
    );
    expect(readMarker(pnpmMarker)).toBe('');
  });
});
