import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(__dirname, 'setup-worktree.sh');
const POWERSHELL_SCRIPT = join(__dirname, 'setup-worktree.ps1');
const WORKTREE_SKILL = join(
  __dirname,
  '..',
  '.agents',
  'skills',
  'worktree-setup',
  'SKILL.md',
);
const IS_WINDOWS = process.platform === 'win32';
const BASH = IS_WINDOWS ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';

type CommandResult = {
  status: number;
  output: string;
};

function command(
  cwd: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CommandResult {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function mustRun(
  cwd: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = command(cwd, executable, args, env);
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(' ')} failed (${result.status}):\n${result.output}`,
    );
  }
  return result.output;
}

describe('setup-worktree Windows entry and partial-retry recovery', () => {
  jest.setTimeout(60_000);

  let tempRoot: string;
  let repoDir: string;
  let fakeBin: string;
  let setupEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'setup-worktree-recovery-'));
    repoDir = join(tempRoot, 'repo');
    const originDir = join(tempRoot, 'origin.git');
    fakeBin = join(tempRoot, 'fake-bin');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });

    mustRun(tempRoot, 'git', ['init', '--bare', originDir]);
    mustRun(repoDir, 'git', ['init', '-b', 'main']);
    mustRun(repoDir, 'git', ['config', 'user.email', 'test@example.com']);
    mustRun(repoDir, 'git', ['config', 'user.name', 'Worktree Test']);
    mustRun(repoDir, 'git', ['config', 'commit.gpgsign', 'false']);

    writeFileSync(join(repoDir, '.gitignore'), '.worktrees/\n');
    writeFileSync(join(repoDir, 'README.md'), '# first\n');
    mustRun(repoDir, 'git', ['add', '.gitignore', 'README.md']);
    mustRun(repoDir, 'git', ['commit', '-m', 'first']);
    writeFileSync(join(repoDir, 'README.md'), '# second\n');
    mustRun(repoDir, 'git', ['add', 'README.md']);
    mustRun(repoDir, 'git', ['commit', '-m', 'second']);
    mustRun(repoDir, 'git', ['remote', 'add', 'origin', originDir]);
    mustRun(repoDir, 'git', ['push', 'origin', 'main']);
    mustRun(repoDir, 'git', ['fetch', 'origin', 'main']);

    const fakePnpm = join(fakeBin, 'pnpm');
    writeFileSync(
      fakePnpm,
      '#!/usr/bin/env bash\nprintf \'FAKE_PNPM %s\\n\' "$*"\n',
    );
    chmodSync(fakePnpm, 0o755);

    setupEnv = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
    };
  });

  afterEach(() => {
    rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  function runSetup(
    branch: string,
    env: NodeJS.ProcessEnv = setupEnv,
  ): CommandResult {
    return command(repoDir, BASH, [SCRIPT, branch], env);
  }

  (IS_WINDOWS ? it : it.skip)(
    'uses Git for Windows Bash from the PowerShell entry and writes native-readable metadata',
    () => {
      const result = command(
        repoDir,
        'pwsh',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          POWERSHELL_SCRIPT,
          'WI-900001',
        ],
        setupEnv,
      );

      expect(result.status).toBe(0);
      expect(result.output).toContain('FAKE_PNPM install');
      expect(result.output).toContain('FAKE_PNPM run env:sync');

      const worktree = join(repoDir, '.worktrees', 'WI-900001');
      const gitPointer = readFileSync(join(worktree, '.git'), 'utf8');
      expect(gitPointer).toMatch(/^gitdir: [A-Za-z]:\//);
      expect(gitPointer).not.toContain('/mnt/c/');
      expect(command(worktree, 'git', ['status', '--short']).status).toBe(0);
    },
  );

  it('refuses simulated WSL before creating a branch or worktree', () => {
    const result = runSetup('WI-900002', {
      ...setupEnv,
      WSL_DISTRO_NAME: 'Ubuntu',
    });

    expect(result.output).toContain('scripts/setup-worktree.ps1 WI-900002');
    expect(result.status).not.toBe(0);
    expect(
      command(repoDir, 'git', ['show-ref', '--verify', 'refs/heads/WI-900002'])
        .status,
    ).not.toBe(0);
    expect(existsSync(join(repoDir, '.worktrees', 'WI-900002'))).toBe(false);
  });

  it('reuses an unpublished unregistered branch exactly at origin/main', () => {
    mustRun(repoDir, 'git', [
      'branch',
      '--no-track',
      'WI-900003',
      'origin/main',
    ]);

    const result = runSetup('WI-900003');

    expect(result.output).toContain(
      'Reusing pristine partial branch WI-900003 at origin/main.',
    );
    if (result.status !== 0) {
      throw new Error(result.output);
    }
    expect(result.status).toBe(0);
    expect(result.output).toContain('FAKE_PNPM install');
    expect(result.output).toContain('FAKE_PNPM run env:sync');
    expect(
      command(join(repoDir, '.worktrees', 'WI-900003'), 'git', [
        'status',
        '--short',
      ]).status,
    ).toBe(0);
  });

  it('refuses and preserves a branch whose tip differs from origin/main', () => {
    mustRun(repoDir, 'git', [
      'branch',
      '--no-track',
      'WI-900004',
      'origin/main^',
    ]);
    const before = mustRun(repoDir, 'git', [
      'rev-parse',
      'refs/heads/WI-900004',
    ]).trim();

    const result = runSetup('WI-900004');

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('does not match origin/main');
    expect(
      mustRun(repoDir, 'git', ['rev-parse', 'refs/heads/WI-900004']).trim(),
    ).toBe(before);
    expect(existsSync(join(repoDir, '.worktrees', 'WI-900004'))).toBe(false);
  });

  it('refuses and preserves a branch that is already published on origin', () => {
    mustRun(repoDir, 'git', [
      'branch',
      '--no-track',
      'WI-900007',
      'origin/main',
    ]);
    mustRun(repoDir, 'git', [
      'push',
      'origin',
      'refs/heads/WI-900007:refs/heads/WI-900007',
    ]);
    const before = mustRun(repoDir, 'git', [
      'rev-parse',
      'refs/heads/WI-900007',
    ]).trim();

    const result = runSetup('WI-900007');

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('already published on origin');
    expect(
      mustRun(repoDir, 'git', ['rev-parse', 'refs/heads/WI-900007']).trim(),
    ).toBe(before);
    expect(
      mustRun(repoDir, 'git', ['ls-remote', '--heads', 'origin', 'WI-900007']),
    ).toContain(before);
    expect(existsSync(join(repoDir, '.worktrees', 'WI-900007'))).toBe(false);
  });

  it('refuses a branch registered to another worktree without touching it', () => {
    const foreignWorktree = join(tempRoot, 'foreign-worktree');
    mustRun(repoDir, 'git', [
      'worktree',
      'add',
      '--no-track',
      '-b',
      'WI-900008',
      foreignWorktree,
      'origin/main',
    ]);
    const sentinel = join(foreignWorktree, 'ownership.txt');
    writeFileSync(sentinel, 'registered elsewhere\n');

    const result = runSetup('WI-900008');

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('registered to another worktree');
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('registered elsewhere\n');
    expect(existsSync(join(repoDir, '.worktrees', 'WI-900008'))).toBe(false);
  });

  it('keeps the successful bootstrap contract for a fresh branch', () => {
    const result = runSetup('WI-900005');

    expect(result.status).toBe(0);
    expect(result.output).toContain('FAKE_PNPM install');
    expect(result.output).toContain('FAKE_PNPM run env:sync');
    expect(result.output).toContain('Worktree ready at:');
    expect(
      command(join(repoDir, '.worktrees', 'WI-900005'), 'git', [
        'branch',
        '--show-current',
      ]).output.trim(),
    ).toBe('WI-900005');
  });

  it('refuses an unvalidated non-empty target without deleting it', () => {
    const target = join(repoDir, '.worktrees', 'WI-900006');
    const sentinel = join(target, 'keep.txt');
    mkdirSync(target, { recursive: true });
    writeFileSync(sentinel, 'belongs to someone else\n');

    const result = runSetup('WI-900006');

    expect(result.status).not.toBe(0);
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('belongs to someone else\n');
  });

  it('documents the PowerShell entry point instead of bare Bash on Windows', () => {
    const skill = readFileSync(WORKTREE_SKILL, 'utf8');

    expect(skill).toContain(
      'pwsh -NoProfile -File scripts/setup-worktree.ps1 <branch-name>',
    );
    expect(skill).toContain('WSL Bash');
    expect(skill).toContain('pristine partial branch');
  });
});
