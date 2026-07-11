// WI-1798 — regression guard for the shared-stash-stack hazard.
//
// All git worktrees of a repo share ONE `.git` dir → one `refs/stash` stack.
// A bare `git stash pop`/`apply` from any worktree acts on whichever entry is
// topmost, regardless of which worktree/session pushed it (incident
// 2026-07-11 ~02:40Z: a foreign session's protective stash was popped and
// reverted content-blind). `scripts/safe-stash-pop.ts` refuses a bare
// pop/apply and requires an explicit, unambiguous target.
//
// This suite builds a throwaway git repo under `os.tmpdir()` per test
// (mirrors `scripts/husky-main-guard.test.ts`'s pattern) — it never touches
// this repo's own (shared) stash stack.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import {
  listStashEntries,
  parseArgs,
  resolveTarget,
  applyStashBySha,
  popStashBySha,
  BareStashOpRefusedError,
  NoMatchError,
  AmbiguousMatchError,
} from './safe-stash-pop';

// tsx binary from the repo's node_modules (avoids depending on npx's PATH
// resolution, which -- run with cwd pointed at a throwaway repo outside the
// monorepo -- can't see node_modules/.bin/tsx and falls back to a registry
// fetch; mirrors scripts/check-merge-invariant.test.ts's TSX const).
const TSX = resolvePath(__dirname, '../node_modules/.bin/tsx');
const CLI = resolvePath(__dirname, 'safe-stash-pop.ts');

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** Create a repo with two distinct stash entries. */
function makeRepoWithTwoStashes(): string {
  const repo = mkdtempSync(join(tmpdir(), 'safe-stash-pop-'));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);
  writeFileSync(join(repo, 'file.txt'), 'base\n');
  git(repo, ['add', 'file.txt']);
  git(repo, ['commit', '-m', 'initial commit']);

  writeFileSync(join(repo, 'file.txt'), 'session-a change\n');
  git(repo, ['stash', 'push', '-m', 'session-A: preserve-monitor-owned-state']);

  writeFileSync(join(repo, 'file.txt'), 'session-b change\n');
  git(repo, ['stash', 'push', '-m', 'session-B: wip-refactor']);

  return repo;
}

describe('safe-stash-pop (WI-1798)', () => {
  let repo: string;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  test('listStashEntries parses ref/sha/message for each entry', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    expect(entries).toHaveLength(2);
    expect(entries[0].ref).toBe('stash@{0}');
    expect(entries[0].message).toContain('session-B: wip-refactor');
    expect(entries[1].ref).toBe('stash@{1}');
    expect(entries[1].message).toContain(
      'session-A: preserve-monitor-owned-state',
    );
    expect(entries[0].sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test('parseArgs rejects an action other than pop/apply', () => {
    expect(() => parseArgs(['drop'])).toThrow();
  });

  test('parseArgs accepts a bare action with no target', () => {
    expect(parseArgs(['pop'])).toEqual({ action: 'pop' });
  });

  test('parseArgs accepts -m <message>', () => {
    expect(parseArgs(['pop', '-m', 'session-B'])).toEqual({
      action: 'pop',
      message: 'session-B',
    });
  });

  test('parseArgs accepts an explicit target', () => {
    expect(parseArgs(['apply', 'stash@{1}'])).toEqual({
      action: 'apply',
      target: 'stash@{1}',
    });
  });

  test('resolveTarget refuses any bare pop/apply regardless of stack depth', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    expect(entries).toHaveLength(2);
    expect(() => resolveTarget(entries, { action: 'pop' })).toThrow(
      BareStashOpRefusedError,
    );
    // Nothing was popped.
    expect(listStashEntries(repo)).toHaveLength(2);
  });

  test('resolveTarget allows a correctly-targeted -m match, resolved to a SHA', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const sha = resolveTarget(entries, { action: 'pop', message: 'session-B' });
    // Resolves to the matched entry's commit SHA, not its stash@{N} index --
    // the index is a positional pointer that can shift under a concurrent
    // session's stash push/pop between resolution and execution.
    expect(sha).toBe(entries[0].sha);
    expect(sha).not.toMatch(/^stash@/);
  });

  test('resolveTarget allows an explicit stash@{N} target, resolved to a SHA', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const sha = resolveTarget(entries, { action: 'pop', target: 'stash@{1}' });
    expect(sha).toBe(entries[1].sha);
  });

  test('resolveTarget allows an explicit (abbreviated) SHA target', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const sha8 = entries[1].sha.slice(0, 8);
    const sha = resolveTarget(entries, { action: 'pop', target: sha8 });
    expect(sha).toBe(entries[1].sha);
  });

  test('resolveTarget refuses an ambiguous -m match', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    // Both messages contain "session-"
    expect(() =>
      resolveTarget(entries, { action: 'pop', message: 'session-' }),
    ).toThrow(AmbiguousMatchError);
  });

  test('resolveTarget refuses a -m with no match', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    expect(() =>
      resolveTarget(entries, { action: 'pop', message: 'no-such-session' }),
    ).toThrow(NoMatchError);
  });

  test('resolveTarget refuses an unknown stash@{N} ref', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    expect(() =>
      resolveTarget(entries, { action: 'pop', target: 'stash@{9}' }),
    ).toThrow(NoMatchError);
  });

  test('end-to-end CLI: bare pop is refused, stash stack untouched', () => {
    repo = makeRepoWithTwoStashes();
    expect(() =>
      execFileSync(TSX, [CLI, 'pop'], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).toThrow();
    expect(listStashEntries(repo)).toHaveLength(2);
  });

  test('end-to-end CLI: correctly-targeted pop succeeds and applies the right content', () => {
    repo = makeRepoWithTwoStashes();
    execFileSync(TSX, [CLI, 'pop', '-m', 'session-A'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(listStashEntries(repo)).toHaveLength(1);
    const content = readFileSync(join(repo, 'file.txt'), 'utf8');
    expect(content).toBe('session-a change\n');
  });

  test('parseArgs rejects unexpected extra positional arguments', () => {
    expect(() => parseArgs(['pop', 'stash@{0}', 'extra'])).toThrow();
    expect(() => parseArgs(['pop', '-m', 'msg', 'extra'])).toThrow();
  });

  test('applyStashBySha applies content without dropping the entry', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const target = entries[1]; // session-A
    const result = applyStashBySha(repo, target.sha);
    expect(result.status).toBe(0);
    // Applying leaves the stash stack untouched -- still 2 entries.
    expect(listStashEntries(repo)).toHaveLength(2);
  });

  test('popStashBySha applies content and drops exactly the targeted entry', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const target = entries[1]; // session-A, stash@{1}
    const result = popStashBySha(repo, target.sha);
    expect(result.status).toBe(0);
    const remaining = listStashEntries(repo);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sha).toBe(entries[0].sha); // session-B survives
    expect(readFileSync(join(repo, 'file.txt'), 'utf8')).toBe(
      'session-a change\n',
    );
  });

  test('popStashBySha refuses to drop a different entry if the target was already removed concurrently', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const target = entries[1]; // session-A, stash@{1}

    // Simulate a concurrent session already popping/dropping this exact
    // entry between our `listStashEntries` read and our own pop call --
    // the commit object still exists (dangling, not yet GC'd), so `apply`
    // by SHA still succeeds, but the reflog entry is gone.
    git(repo, ['stash', 'drop', target.ref]);
    expect(listStashEntries(repo)).toHaveLength(1);

    const result = popStashBySha(repo, target.sha);
    // Apply-by-SHA against the dangling commit still succeeds...
    expect(readFileSync(join(repo, 'file.txt'), 'utf8')).toBe(
      'session-a change\n',
    );
    // ...but the drop step refuses (nothing left to safely drop) rather
    // than removing the unrelated remaining entry (session-B).
    expect(result.status).not.toBe(0);
    const remaining = listStashEntries(repo);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sha).toBe(entries[0].sha); // session-B untouched
  });
});
