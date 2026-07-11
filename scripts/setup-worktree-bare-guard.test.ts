// WI-1268 — regression test for the core.bare guard in setup-worktree.sh.
//
// Proves that a shared .git/config flipped to core.bare=true (the
// hypothesized concurrent worktree-add race) is caught with an actionable
// error before it reaches `git rev-parse --show-toplevel` at line ~60,
// instead of surfacing git's raw "fatal: this operation must be run in a
// work tree" error. Also proves the two pre-existing refusals the new guard
// sits between — "already inside a worktree" and ".worktrees/ not
// gitignored" — are unaffected (AC3).
//
// The test invokes the REAL script by absolute path (not a copy) against a
// throwaway temp git repo, so a manual red-green-revert (neutralize the
// guard → the bare-guard test fails; restore → it passes) breaks the actual
// shipped artifact. Never touches this repo's own .git/config.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(__dirname, 'setup-worktree.sh');

/** Run a command, returning combined stdout+stderr. Throws on non-zero. */
function run(cwd: string, cmd: string, args: string[]): string {
  const out = execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out ?? '';
}

/** Assert a command fails, returning the combined stdout+stderr it emitted. */
function expectToFail(cwd: string, cmd: string, args: string[]): string {
  try {
    execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  throw new Error(
    `expected \`${cmd} ${args.join(' ')}\` to fail, but it succeeded`,
  );
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  run(dir, 'git', ['init', '-b', 'main']);
  run(dir, 'git', ['config', 'user.email', 'test@example.com']);
  run(dir, 'git', ['config', 'user.name', 'Test']);
  run(dir, 'git', ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'README.md'), '# seed\n');
  run(dir, 'git', ['add', 'README.md']);
  run(dir, 'git', ['commit', '-m', 'seed']);
}

describe('setup-worktree.sh core.bare guard (WI-1268)', () => {
  let tmp: string;
  let repoDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'setup-worktree-bare-guard-'));
    repoDir = join(tmp, 'repo');
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('AC1: fails with an actionable message when core.bare=true, not the raw git error', () => {
    run(repoDir, 'git', ['config', 'core.bare', 'true']);

    const out = expectToFail(repoDir, 'bash', [SCRIPT, 'WI-test']);

    expect(out).toContain('core.bare=true');
    expect(out).toContain('git config core.bare false');
    expect(out).not.toContain(
      'fatal: this operation must be run in a work tree',
    );
  });

  it('AC3: still BLOCKS running from inside an existing worktree (core.bare=false)', () => {
    const worktreeDir = join(tmp, 'wt');
    run(repoDir, 'git', ['worktree', 'add', worktreeDir, '-b', 'WI-other']);

    const out = expectToFail(worktreeDir, 'bash', [SCRIPT, 'WI-test']);

    expect(out).toMatch(/You are inside an existing git worktree/);
  });

  it('AC3: still BLOCKS when .worktrees/ is not gitignored (core.bare=false)', () => {
    // No .gitignore in this repo at all — the pre-existing refusal path.
    const out = expectToFail(repoDir, 'bash', [SCRIPT, 'WI-test']);

    expect(out).toMatch(/\.worktrees\/ is not in \.gitignore/);
  });
});
