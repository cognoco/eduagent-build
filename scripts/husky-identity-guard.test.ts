// WI-2807 — regression test for the placeholder-identity guard.
//
// Proves that scripts/husky-identity-guard.sh refuses a commit whose resolved
// AUTHOR or COMMITTER identity is the `Test User` / `test@example.com`
// placeholder, while leaving every legitimate identity untouched.
//
// Why the guard exists: 74 commits between 2026-07-01 and 2026-07-27 landed
// authored `Test User <test@example.com>` even though no persistent config
// surface reproduces it — the override is transient and process-scoped. A
// mis-attributed commit cannot be corrected afterwards (history rewrite on a
// shared branch is out of scope), so the only cheap moment to catch it is
// before the commit exists.
//
// The temp-repo hook invokes the REAL guard script by absolute path (not a
// copy), so a manual red-green-revert — neutralize the guard, these tests fail;
// restore it, they pass — breaks the actual shipped artifact.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IDENTITY_GUARD = join(__dirname, 'husky-identity-guard.sh');

/**
 * Clones process.env with every GIT_* key stripped. Without this, an ambient
 * GIT_DIR or GIT_AUTHOR_* (husky exports some during hook runs) leaks into the
 * child git processes and either redirects them at the wrong repo or pins an
 * identity these cases mean to control. Same pattern as
 * scripts/husky-main-guard.test.ts's childGitEnv().
 *
 * This also matters for correctness of the cases below: a GIT_* variable that
 * is PRESENT BUT EMPTY is not the same as absent — git aborts such a commit
 * with `fatal: empty ident name`, which would mask the guard's own verdict.
 * Deleting the keys outright avoids that.
 */
function childGitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) {
      delete env[key];
    }
  }
  return { ...env, ...extra };
}

function git(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): string {
  return (
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childGitEnv(extraEnv),
    }) ?? ''
  );
}

/** Assert a git command fails, returning the combined hook output it emitted. */
function expectGitToFail(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): string {
  try {
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childGitEnv(extraEnv),
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  throw new Error(`expected 'git ${args.join(' ')}' to fail, but it succeeded`);
}

/** A throwaway repo whose pre-commit hook runs the real guard script. */
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'identity-guard-'));
  git(dir, ['init', '--initial-branch=work']);
  git(dir, ['config', 'user.name', 'Real Person']);
  git(dir, ['config', 'user.email', 'real.person@example.org']);
  const hooks = join(dir, '.githooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(
    join(hooks, 'pre-commit'),
    `#!/usr/bin/env sh\nsh "${IDENTITY_GUARD.replace(/\\/g, '/')}" || exit 1\n`,
    { mode: 0o755 },
  );
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  writeFileSync(join(dir, 'file.txt'), 'contents\n');
  git(dir, ['add', 'file.txt']);
  return dir;
}

describe('[WI-2807] placeholder git-identity guard', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('allows a commit with a legitimate identity', () => {
    git(repo, ['commit', '-m', 'legit']);
    const author = git(repo, ['log', '-1', '--format=%an <%ae>']).trim();
    expect(author).toBe('Real Person <real.person@example.org>');
  });

  it('refuses a commit whose AUTHOR is the placeholder', () => {
    const out = expectGitToFail(repo, ['commit', '-m', 'bad author'], {
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test@example.com',
    });
    expect(out).toContain('PLACEHOLDER git identity');
    expect(out).toContain('author');
    // Nothing was committed — the repo still has no commits.
    expect(() => git(repo, ['rev-parse', 'HEAD'])).toThrow();
  });

  it('refuses a commit whose COMMITTER is the placeholder even when the author is clean', () => {
    // The committer trailer is the half a reviewer is least likely to notice,
    // so it must be checked independently of the author.
    const out = expectGitToFail(repo, ['commit', '-m', 'bad committer'], {
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    });
    expect(out).toContain('PLACEHOLDER git identity');
    expect(out).toContain('committer');
  });

  it('refuses a case-variant placeholder email', () => {
    // An override need not match the canonical casing; the guard folds case.
    const out = expectGitToFail(repo, ['commit', '-m', 'case variant'], {
      GIT_AUTHOR_EMAIL: 'TEST@Example.COM',
    });
    expect(out).toContain('PLACEHOLDER git identity');
  });

  it('refuses the placeholder NAME even with a real email', () => {
    const out = expectGitToFail(repo, ['commit', '-m', 'bad name only'], {
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'real.person@example.org',
    });
    expect(out).toContain('PLACEHOLDER git identity');
  });

  it('does NOT fire on a lookalike name or a domain that merely contains the placeholder', () => {
    // Over-blocking a legitimate identity would be its own defect: the guard
    // must not refuse someone genuinely called e.g. "Testing Userland", nor an
    // address that only embeds the placeholder as a substring of another host.
    git(repo, ['commit', '-m', 'lookalike'], {
      GIT_AUTHOR_NAME: 'Testing Userland',
      GIT_AUTHOR_EMAIL: 'someone@test.example.com.partner.net',
    });
    const author = git(repo, ['log', '-1', '--format=%an <%ae>']).trim();
    expect(author).toBe(
      'Testing Userland <someone@test.example.com.partner.net>',
    );
  });
});
