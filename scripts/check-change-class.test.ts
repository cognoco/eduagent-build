import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASH =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';

function git(repo: string, args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
}

function runChangeClass(
  repo: string,
  args: string[],
  options: Omit<ExecFileSyncOptions, 'cwd'> = {},
): Buffer | string {
  const command = [
    options.env?.GITHUB_OUTPUT
      ? `GITHUB_OUTPUT=${shellQuote(toBashPath(String(options.env.GITHUB_OUTPUT)))}`
      : '',
    ['./scripts/check-change-class.sh', ...args].map(shellQuote).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  return execFileSync(BASH, ['-c', command], {
    cwd: repo,
    ...options,
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toBashPath(path: string): string {
  if (process.platform !== 'win32') return path;
  return path
    .replace(/^([A-Za-z]):\\/, (_, drive: string) => {
      return `/${drive.toLowerCase()}/`;
    })
    .replace(/\\/g, '/');
}

function removeTempRepo(path: string): void {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'EBUSY'
        )
      ) {
        throw error;
      }
      if (attempt === 19) {
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

describe('check-change-class.sh', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'check-change-class-'));
    mkdirSync(join(repo, 'scripts', 'lib'), { recursive: true });
    cpSync(
      join(__dirname, 'check-change-class.sh'),
      join(repo, 'scripts', 'check-change-class.sh'),
    );
    cpSync(
      join(__dirname, 'lib', 'i18n-change-detection.sh'),
      join(repo, 'scripts', 'lib', 'i18n-change-detection.sh'),
    );
    chmodSync(join(repo, 'scripts', 'check-change-class.sh'), 0o755);

    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 1;\n',
    );
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'init']);
  });

  afterEach(() => {
    removeTempRepo(repo);
  });

  it('requires the Husky typecheck gate for any changed TypeScript file', () => {
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 2;\n',
    );

    const output = runChangeClass(repo, ['--branch'], {
      encoding: 'utf8',
    });

    expect(output).toContain('typescript');
    expect(output).toContain('pnpm exec tsc --build');
  });

  // ── --github-output router mode (WI-452) ──────────────────────────────
  // The flags emitted here gate slow CI suites (ci.yml integration tests,
  // api-quality-gate eval steps). A regression that silently emits =false
  // skips a gating suite, so each direction is pinned.

  function runRouter(cwd: string): Record<string, string> {
    const outFile = join(cwd, 'github-output.txt');
    writeFileSync(outFile, '');
    runChangeClass(cwd, ['--branch', '--github-output'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: toBashPath(outFile) },
    });
    return Object.fromEntries(
      readFileSync(outFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=', 2) as [string, string]),
    );
  }

  it('emits integration=true when a class mapping to integration tests is touched', () => {
    mkdirSync(join(repo, 'packages', 'database', 'src', 'schema'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'packages', 'database', 'src', 'schema', 'users.ts'),
      'export const users = {};\n',
    );
    git(repo, ['add', '.']); // new files must be tracked to appear in the diff

    const flags = runRouter(repo);
    expect(flags.classes).toContain('db-schema');
    expect(flags.integration).toBe('true');
  });

  it('routes API migration SQL changes through db migrations and database RLS tests', () => {
    mkdirSync(join(repo, 'apps', 'api', 'drizzle'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'drizzle', '9999_uncovered_profile_table.sql'),
      'CREATE TABLE uncovered_profile_table (profile_id uuid NOT NULL);\n',
    );
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('db-migrations');
    expect(flags.integration).toBe('true');

    const output = runChangeClass(repo, ['--branch'], {
      encoding: 'utf8',
    });
    expect(output).toContain('pnpm db:migrate:dev');
    expect(output).toContain('pnpm exec nx run @eduagent/database:test');
    expect(output).toContain('pnpm test:api:integration');
  });

  it('emits eval=true when prompt builders are touched, including services/llm subdirectories', () => {
    mkdirSync(
      join(repo, 'apps', 'api', 'src', 'services', 'llm', 'providers'),
      { recursive: true },
    );
    writeFileSync(
      join(
        repo,
        'apps',
        'api',
        'src',
        'services',
        'llm',
        'providers',
        'cerebras.ts',
      ),
      'export const p = 1;\n',
    );
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('llm-prompts');
    expect(flags.eval).toBe('true');
  });

  it('emits integration=true for a lockfile-only change (dependencies class)', () => {
    writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('dependencies');
    expect(flags.integration).toBe('true');
  });

  it('emits false flags for an unclassified-only change', () => {
    writeFileSync(join(repo, 'notes.txt'), 'hello\n');
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.integration).toBe('false');
    expect(flags.eval).toBe('false');
  });

  it('fails OPEN (all flags true) when no diff base resolves', () => {
    // A repo with no `main` branch and no BASE_REF: the router cannot prove
    // any slow suite unaffected, so it must demand them all.
    const orphan = mkdtempSync(join(tmpdir(), 'check-change-class-orphan-'));
    try {
      mkdirSync(join(orphan, 'scripts', 'lib'), { recursive: true });
      cpSync(
        join(__dirname, 'check-change-class.sh'),
        join(orphan, 'scripts', 'check-change-class.sh'),
      );
      cpSync(
        join(__dirname, 'lib', 'i18n-change-detection.sh'),
        join(orphan, 'scripts', 'lib', 'i18n-change-detection.sh'),
      );
      chmodSync(join(orphan, 'scripts', 'check-change-class.sh'), 0o755);
      git(orphan, ['init', '-b', 'feature']);
      git(orphan, ['config', 'user.email', 'test@example.com']);
      git(orphan, ['config', 'user.name', 'Test User']);
      git(orphan, ['commit', '--allow-empty', '-m', 'init']);

      const flags = runRouter(orphan);
      expect(flags.classes).toBe('unresolved');
      expect(flags.integration).toBe('true');
      expect(flags.eval).toBe('true');
    } finally {
      removeTempRepo(orphan);
    }
  });

  it('declares a database package test target for RLS coverage', () => {
    const project = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'packages', 'database', 'project.json'),
        'utf8',
      ),
    );

    const command = project.targets.test.options.command;
    expect(command).toContain('jest --config jest.config.cjs');
    expect(command).toContain('**/src/**/*.test.ts');
    expect(command).toContain('\\.integration\\.test\\.ts$');
  });
});
