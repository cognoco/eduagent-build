// WI-1246 — regression test for the shared-main guards.
//
// Proves that the husky main-guards (scripts/husky-main-commit-guard.sh and
// scripts/husky-main-push-guard.sh) stop a commit/push from landing on shared
// `main`, while leaving the legitimate worktree-branch path untouched. This is
// the negative-path break test for the /commit fork-cwd hazard: a forked
// commit whose cwd escaped onto the shared main checkout is refused at the
// shell layer regardless of what the caller believed.
//
// The temp-repo hooks invoke the REAL guard scripts by absolute path (not
// copies), so a manual red-green-revert (neutralize the guard → these tests
// fail; restore → they pass) breaks the actual shipped artifact.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COMMIT_GUARD = join(__dirname, 'husky-main-commit-guard.sh');
const PUSH_GUARD = join(__dirname, 'husky-main-push-guard.sh');

/**
 * Clones process.env with every GIT_* key stripped. Prevents an ambient
 * GIT_DIR (e.g. exported by husky during pre-push -> nx -> jest) from
 * leaking into these child git processes and redirecting them at the
 * ambient repo instead of the mkdtemp fixtures passed as `cwd` (WI-1345
 * sweep). Same pattern as scripts/check-merge-invariant.test.ts's
 * childGitEnv(). Does not affect this suite's own git-dir/worktree
 * semantics: git computes GIT_DIR for `worktree add`/hook invocation from
 * `cwd`, not from an inherited env var.
 */
function childGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) {
      delete env[key];
    }
  }
  return env;
}

/** Run a git command, returning combined stdout+stderr. Throws on non-zero. */
function git(cwd: string, args: string[], input?: string): string {
  const out = execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childGitEnv(),
  });
  return out ?? '';
}

/** Assert a git command fails, returning the combined hook output it emitted. */
function expectGitToFail(cwd: string, args: string[], input?: string): string {
  try {
    execFileSync('git', args, {
      cwd,
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childGitEnv(),
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  throw new Error(
    `expected \`git ${args.join(' ')}\` to fail, but it succeeded`,
  );
}

function writeHook(hooksDir: string, name: string, guardPath: string): void {
  const path = join(hooksDir, name);
  // Minimal hook: run the real guard by absolute path. For pre-push, git feeds
  // the refspec on the hook's stdin, which `sh <guard>` inherits.
  writeFileSync(path, `#!/usr/bin/env sh\nsh "${guardPath}" || exit 1\n`, {
    mode: 0o755,
  });
}

describe('husky main-guards (WI-1246)', () => {
  let tmp: string;
  let mainDir: string;
  let worktreeDir: string;
  let originDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'husky-main-guard-'));
    mainDir = join(tmp, 'repo');
    worktreeDir = join(tmp, 'wt');
    originDir = join(tmp, 'origin.git');

    // Bare remote to push against.
    git(tmp, ['init', '--bare', originDir]);

    // Main checkout on branch `main`, with an initial commit BEFORE the hooks
    // are installed (so setup itself is never blocked by the guard).
    mkdirSync(mainDir);
    git(mainDir, ['init', '-b', 'main']);
    git(mainDir, ['config', 'user.email', 'test@example.com']);
    git(mainDir, ['config', 'user.name', 'Test']);
    git(mainDir, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(mainDir, 'README.md'), '# seed\n');
    git(mainDir, ['add', 'README.md']);
    git(mainDir, ['commit', '-m', 'seed']);
    git(mainDir, ['remote', 'add', 'origin', originDir]);

    // Install the guards into the shared hooks dir (worktrees share it).
    const hooksDir = join(mainDir, '.git', 'hooks');
    writeHook(hooksDir, 'pre-commit', COMMIT_GUARD);
    writeHook(hooksDir, 'pre-push', PUSH_GUARD);

    // Linked worktree on a WI branch (the legitimate isolated-work path).
    git(mainDir, ['worktree', 'add', worktreeDir, '-b', 'WI-test']);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('BLOCKS a commit on main in the shared checkout', () => {
    writeFileSync(join(mainDir, 'change.txt'), 'edit\n');
    git(mainDir, ['add', 'change.txt']);
    const out = expectGitToFail(mainDir, ['commit', '-m', 'should be blocked']);
    expect(out).toContain('WI-1246');
    expect(out).toMatch(/refusing to commit on 'main'/);
  });

  it('BLOCKS a push whose target ref is refs/heads/main', () => {
    // `git push origin main` resolves the remote ref to refs/heads/main.
    const out = expectGitToFail(mainDir, ['push', 'origin', 'main']);
    expect(out).toContain('WI-1246');
    expect(out).toMatch(/refusing to push to refs\/heads\/main/);
    // The push must not have reached the remote.
    expect(() => git(originDir, ['rev-parse', 'refs/heads/main'])).toThrow();
  });

  it('ALLOWS a commit AND a push on a worktree branch', () => {
    writeFileSync(join(worktreeDir, 'feature.txt'), 'work\n');
    git(worktreeDir, ['add', 'feature.txt']);
    // Commit in the linked worktree — git-dir != common-dir, so not blocked.
    expect(() =>
      git(worktreeDir, ['commit', '-m', 'feature work']),
    ).not.toThrow();
    // Push to the worktree branch ref — not refs/heads/main, so not blocked.
    expect(() =>
      git(worktreeDir, ['push', 'origin', 'HEAD:refs/heads/WI-test']),
    ).not.toThrow();
    // It landed on the remote.
    expect(git(originDir, ['rev-parse', 'refs/heads/WI-test'])).toMatch(
      /^[0-9a-f]{40}/,
    );
  });

  it('does NOT block a non-main branch committed in the shared checkout', () => {
    // Guard specificity: the commit guard blocks only `main` in the shared
    // checkout, so ordinary feature work in the main checkout is unaffected.
    git(mainDir, ['checkout', '-b', 'feature']);
    writeFileSync(join(mainDir, 'f.txt'), 'x\n');
    git(mainDir, ['add', 'f.txt']);
    expect(() => git(mainDir, ['commit', '-m', 'feature'])).not.toThrow();
  });
});
