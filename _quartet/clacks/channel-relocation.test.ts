// WI-1245 regression test — Clacks _state channel data-loss under a non-fast-forward
// git reconciliation on the shared checkout (AGENTS.md § Shared checkout, WI-483).
//
// Repros the exact silent-loss mechanism confirmed live 2026-07-01 (WS-18 shepherd
// outbox reverted to a stale seq-404 snapshot, dropping 4 appended emissions) against a
// disposable fixture git repo — real `git` subprocesses, a throwaway `os.tmpdir()`
// checkout, NEVER the real `_quartet/working/lanes/*/_state` channels. Mirrors the
// fixture-only discipline already codified in `clacks-channel.md` / the role protocols
// ("WI-1245 fixture-proved 3 loss vectors on this seam").
//
// Mechanism reproduced (one of the 3 documented vectors — `git stash -u` stranding on
// a shared-tree reconciliation; the other two, `git pull --no-rebase` conflict-marker
// corruption and `git add _state/` staging sweeps, are neutralized by the identical
// out-of-repo relocation for the identical reason — nothing under a path outside the
// git working tree is reachable by ANY git operation, so one fixture stands for all
// three): a `zdx-core:commit` shared-tree-style `stash -u` anchor co-mingles the
// untracked channel file with an unstaged tracked edit; a concurrent session's append
// lands *during* the stash window; `stash pop` then hits "could not restore untracked
// files from stash" (the untracked path now differs), and the natural recovery — a
// forced checkout of the untracked side from the stash's own 3rd-parent commit
// (`stash@{0}^3`) — silently restores the STALE pre-stash snapshot, discarding the
// concurrent append. Git gives zero warning either way.
//
// Two fixture shapes, same reconciliation sequence, same file class (outbox and inbox
// are structurally identical for this purpose — an append-only JSONL co-located in
// `_state/` — so this one test stands for both variants per the AC's "or the fix's
// mechanism applies uniformly to both" clause):
//   1. UNRELOCATED (today's default: `QUARTET_LANE_STATE_ROOT` unset, channel file
//      in-tree) — the vector IS live; the concurrent append is LOST. This assertion is
//      a standing regression guard: it fails (loudly) if this mechanism is ever
//      silently "fixed" out from under WI-1245's diagnosis without anyone noticing.
//   2. RELOCATED (WI-1257 Option A / A-2: `QUARTET_LANE_STATE_ROOT` set to an
//      out-of-repo base — see `_quartet/clacks/lane-state-path.mjs`) — the identical
//      reconciliation cannot touch a path outside the repo at all; the concurrent
//      append survives.

import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneStateDir } from './lane-state-path.mjs';

const LANE = 'wi1245-fixture-lane';
const cleanupDirs: string[] = [];

afterEach(() => {
  delete process.env.QUARTET_LANE_STATE_ROOT;
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Builds a disposable repo shaped like the real checkout: a tracked README (something
 * that will carry an unstaged edit, forcing the `stash -u` anchor) + a tracked
 * `_state/monitor-manifest.json` (durable-tracked per artifact-disposition.md §2),
 * with the lane's `_state` dir resolved via the real `laneStateDir` indirection point —
 * `relocated=false` leaves it in-tree (today's default); `relocated=true` points
 * `QUARTET_LANE_STATE_ROOT` at a second, out-of-repo tmpdir (A-2).
 */
function makeFixture(relocated: boolean) {
  const repo = mkdtempSync(join(tmpdir(), 'wi1245-repo-'));
  cleanupDirs.push(repo);
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'wi1245-fixture@test.local']);
  git(repo, ['config', 'user.name', 'WI-1245 fixture']);
  // Fixture-only: pin autocrlf off so git never rewrites the channel file's line
  // endings on checkout — an artifact of this sandbox repo's config, unrelated to the
  // loss mechanism under test.
  git(repo, ['config', 'core.autocrlf', 'false']);

  mkdirSync(join(repo, '_quartet', 'working', 'lanes', LANE, '_state'), {
    recursive: true,
  });
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  writeFileSync(
    join(
      repo,
      '_quartet',
      'working',
      'lanes',
      LANE,
      '_state',
      'monitor-manifest.json',
    ),
    '{"lane":"' + LANE + '","monitors":[]}\n',
  );
  git(repo, [
    'add',
    'README.md',
    `_quartet/working/lanes/${LANE}/_state/monitor-manifest.json`,
  ]);
  git(repo, ['commit', '-q', '-m', 'init']);

  if (relocated) {
    const outOfRepo = mkdtempSync(join(tmpdir(), 'wi1245-runtime-'));
    cleanupDirs.push(outOfRepo);
    process.env.QUARTET_LANE_STATE_ROOT = outOfRepo;
  } else {
    delete process.env.QUARTET_LANE_STATE_ROOT;
  }
  const stateDir = laneStateDir(LANE, { repoRoot: repo });
  mkdirSync(stateDir, { recursive: true });
  const channelFile = join(stateDir, 'outbox.jsonl');
  writeFileSync(channelFile, '{"id":1}\n{"id":2}\n{"id":3}\n');
  return { repo, channelFile };
}

/**
 * The reconciliation sequence that fixture-proved the loss live (see file header).
 * Pathspec for the forced-checkout recovery is relative to the repo root — correct
 * whether the channel file is in-tree (matches a real path) or out-of-repo (the
 * pathspec then matches nothing, `stash pop` succeeds cleanly, and the `catch` never
 * runs — exactly the neutralization A-2 provides).
 */
function reconcileWithConcurrentAppend(
  repo: string,
  channelFile: string,
  concurrentLine: string,
  relocated: boolean,
) {
  writeFileSync(join(repo, 'README.md'), '# fixture\n# local edit\n');
  git(repo, ['stash', '-u']);
  // concurrent session appends while the channel file is (if in-tree) hidden by the stash
  writeFileSync(channelFile, concurrentLine + '\n', { flag: 'a' });
  try {
    git(repo, ['stash', 'pop']);
  } catch {
    // "could not restore untracked files from stash" — only reachable when the channel
    // file is in-tree and therefore conflicts. Recovery: force-restore the untracked
    // side from the stash's own 3rd-parent commit — silently drops the concurrent line.
    if (!relocated) {
      git(repo, [
        'checkout',
        'stash@{0}^3',
        '--',
        `_quartet/working/lanes/${LANE}/_state/outbox.jsonl`,
      ]);
    }
  }
}

describe('WI-1245 — Clacks channel survives a non-fast-forward reconciliation', () => {
  test('UNRELOCATED (todays in-tree _state/, QUARTET_LANE_STATE_ROOT unset): the vector is live — a concurrent append is silently dropped', () => {
    const { repo, channelFile } = makeFixture(false);
    reconcileWithConcurrentAppend(repo, channelFile, '{"id":4}', false);
    const finalLines = readFileSync(channelFile, 'utf8').trim().split('\n');
    // Documents today's real vulnerability: the concurrently-appended id:4 does not
    // survive to the final file. Assert on the loss itself (not the exact stale array)
    // — the precise git-internals recovery path (`stash pop` failure → forced checkout
    // from `stash@{0}^3`) is one reproduction of the vector, not the invariant; a
    // different git version taking a different internal path to the same silent drop
    // should still fail this test.
    expect(finalLines).not.toContain('{"id":4}');
  });

  test('RELOCATED (WI-1257 Option A / A-2, QUARTET_LANE_STATE_ROOT set to an out-of-repo path): the identical reconciliation preserves every concurrently-appended line', () => {
    const { repo, channelFile } = makeFixture(true);
    reconcileWithConcurrentAppend(repo, channelFile, '{"id":4}', true);
    const finalLines = readFileSync(channelFile, 'utf8').trim().split('\n');
    expect(finalLines).toEqual([
      '{"id":1}',
      '{"id":2}',
      '{"id":3}',
      '{"id":4}',
    ]);
  });
});

describe('laneStateDir (WI-1245 A-2 indirection point)', () => {
  test('default (QUARTET_LANE_STATE_ROOT unset) is a no-op: todays in-tree relative path', () => {
    delete process.env.QUARTET_LANE_STATE_ROOT;
    expect(laneStateDir('pr-cleanup', { repoRoot: '/repo' })).toBe(
      '/repo/_quartet/working/lanes/pr-cleanup/_state',
    );
  });

  test('QUARTET_LANE_STATE_ROOT set relocates outside repoRoot entirely', () => {
    process.env.QUARTET_LANE_STATE_ROOT = '/out-of-repo/runtime';
    expect(laneStateDir('pr-cleanup', { repoRoot: '/repo' })).toBe(
      '/out-of-repo/runtime/pr-cleanup/_state',
    );
  });
});
