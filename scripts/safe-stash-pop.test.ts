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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listStashEntries,
  parseArgs,
  resolveTarget,
  BareStashOpRefusedError,
  NoMatchError,
  AmbiguousMatchError,
} from './safe-stash-pop';

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

  test('resolveTarget refuses a bare pop when 2+ stash entries exist', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    expect(entries).toHaveLength(2);
    expect(() => resolveTarget(entries, { action: 'pop' })).toThrow(
      BareStashOpRefusedError,
    );
    // Nothing was popped.
    expect(listStashEntries(repo)).toHaveLength(2);
  });

  test('resolveTarget allows a correctly-targeted -m match', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const ref = resolveTarget(entries, { action: 'pop', message: 'session-B' });
    expect(ref).toBe('stash@{0}');
  });

  test('resolveTarget allows an explicit stash@{N} target', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const ref = resolveTarget(entries, { action: 'pop', target: 'stash@{1}' });
    expect(ref).toBe('stash@{1}');
  });

  test('resolveTarget allows an explicit (abbreviated) SHA target', () => {
    repo = makeRepoWithTwoStashes();
    const entries = listStashEntries(repo);
    const sha8 = entries[1].sha.slice(0, 8);
    const ref = resolveTarget(entries, { action: 'pop', target: sha8 });
    expect(ref).toBe(entries[1].ref);
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
    const cliPath = join(__dirname, 'safe-stash-pop.ts');
    expect(() =>
      execFileSync('npx', ['tsx', cliPath, 'pop'], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).toThrow();
    expect(listStashEntries(repo)).toHaveLength(2);
  });

  test('end-to-end CLI: correctly-targeted pop succeeds and applies the right content', () => {
    repo = makeRepoWithTwoStashes();
    const cliPath = join(__dirname, 'safe-stash-pop.ts');
    execFileSync('npx', ['tsx', cliPath, 'pop', '-m', 'session-A'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(listStashEntries(repo)).toHaveLength(1);
    const content = execFileSync('cat', [join(repo, 'file.txt')], {
      encoding: 'utf8',
    });
    expect(content).toBe('session-a change\n');
  });
});
