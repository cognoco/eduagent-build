import { execFileSync } from 'node:child_process';
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

function git(repo: string, args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
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
    rmSync(repo, { recursive: true, force: true });
  });

  it('requires the Husky typecheck gate for any changed TypeScript file', () => {
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 2;\n',
    );

    const output = execFileSync(
      './scripts/check-change-class.sh',
      ['--branch'],
      {
        cwd: repo,
        encoding: 'utf8',
      },
    );

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
    execFileSync(
      './scripts/check-change-class.sh',
      ['--branch', '--github-output'],
      {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outFile },
      },
    );
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
      rmSync(orphan, { recursive: true, force: true });
    }
  });
});
