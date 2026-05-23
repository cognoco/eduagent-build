import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
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
});
