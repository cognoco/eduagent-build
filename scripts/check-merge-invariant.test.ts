/**
 * TDD tests for check-merge-invariant.ts (WI-680).
 *
 * Constructs a synthetic three-way git fixture (MB → main + feature → merge)
 * to verify all three directions:
 *   (a) MAIN-SIDE: a pure main-side path the merge altered (not introduced by
 *       feature) → FAIL.
 *   (b) BRANCH-SURVIVAL (branch-only paths only): a branch-only path the merge
 *       DROPS → FAIL; a branch-only path the merge ALTERS (different blob, no
 *       conflict possible since main never touched it) → FAIL.
 *   (c) BOTH-SIDES-CHANGED: a path both branches touched since MB whose merge
 *       result is a legitimate synthesis (differs from both blobs) → WARN, not
 *       FAIL.
 *
 * The fixture seeds three file classes — feature-only (branch-only),
 * main-only (main-side), and both-sides — and the sabotage tests assert the
 * script catches drops/alterations while letting synthesis through.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve as resolvePath } from 'node:path';

// Absolute path to the script under test.
const SCRIPT = resolvePath(__dirname, 'check-merge-invariant.ts');
// tsx binary from the repo's node_modules (avoids needing tsx on PATH).
const TSX = resolvePath(__dirname, '../node_modules/.bin/tsx');

function git(repo: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      HOME: process.env.HOME ?? '/tmp',
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed:\n${result.stderr}\n${result.stdout}`,
    );
  }
  return (result.stdout ?? '').trim();
}

function runScript(
  repo: string,
  args: string[],
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(TSX, [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
    },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

/**
 * Builds the three-party git fixture:
 *
 *   MB ── main-branch (adds/modifies main-side files)
 *    └── feature-branch (adds feature-only files, modifies shared files)
 *
 * Returns the SHAs for MB, main tip, and feature tip so the caller can
 * construct a merge commit with whatever strategy they choose.
 */
interface FixtureRefs {
  repo: string;
  mbSha: string;
  mainSha: string;
  featureSha: string;
}

function buildBaseFixture(): FixtureRefs {
  const repo = mkdtempSync(join(tmpdir(), 'merge-invariant-'));

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);

  // MB commit. Three classes of file, distinguishing the three diff regions:
  //   - feature-modifies-only ("shared.ts") → branch-only path
  //   - main-modifies-only ("main-only.ts") → pure main-side path
  //   - both-sides modify ("both-sides.ts") → conflict/synthesis path
  //
  // both-sides.ts has a top line and a bottom line separated by enough padding
  // that each side can touch a DIFFERENT line and git auto-merges cleanly (the
  // two edit hunks don't share diff context, so no conflict markers) — modeling
  // a legitimate synthesis where the merge result differs from BOTH the feature
  // blob and the main blob.
  const bothSidesMb =
    'export const top = 0;\n// pad1\n// pad2\n// pad3\n// pad4\n// pad5\nexport const bottom = 0;\n';
  writeFileSync(join(repo, 'shared.ts'), 'export const shared = 1;\n');
  writeFileSync(join(repo, 'main-only.ts'), 'export const m = 1;\n');
  writeFileSync(join(repo, 'both-sides.ts'), bothSidesMb);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'MB: initial commit']);
  const mbSha = git(repo, ['rev-parse', 'HEAD']);

  // Create feature branch from MB.
  git(repo, ['checkout', '-b', 'feature']);

  // Feature adds feature-only.ts, modifies shared.ts (branch-only), and
  // touches the TOP line of both-sides.ts.
  writeFileSync(
    join(repo, 'feature-only.ts'),
    'export const featureOnly = true;\n',
  );
  writeFileSync(
    join(repo, 'shared.ts'),
    'export const shared = 2; // modified by feature\n',
  );
  writeFileSync(
    join(repo, 'both-sides.ts'),
    'export const top = 1; // feature\n// pad1\n// pad2\n// pad3\n// pad4\n// pad5\nexport const bottom = 0;\n',
  );
  git(repo, ['add', '.']);
  git(repo, [
    'commit',
    '-m',
    'feature: add feature-only, modify shared + both-sides top',
  ]);
  const featureSha = git(repo, ['rev-parse', 'HEAD']);

  // Return to main; main modifies main-only.ts and the BOTTOM line of
  // both-sides.ts (different line → clean auto-merge with feature's top edit).
  git(repo, ['checkout', 'main']);
  writeFileSync(join(repo, 'main-only.ts'), 'export const m = 2;\n');
  writeFileSync(
    join(repo, 'both-sides.ts'),
    'export const top = 0;\n// pad1\n// pad2\n// pad3\n// pad4\n// pad5\nexport const bottom = 1; // main\n',
  );
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'main: update main-only + both-sides bottom']);
  const mainSha = git(repo, ['rev-parse', 'HEAD']);

  return { repo, mbSha, mainSha, featureSha };
}

/**
 * Creates a merge commit in `repo` that merges `featureSha` into `main`
 * via a low-level plumbing merge (no auto-commit) and returns the merge SHA.
 *
 * The `overrides` map allows injecting deliberate sabotage:
 * - If a path key maps to `null` → that file is DROPPED from the merge tree.
 * - If a path key maps to a string → that file gets that content in the merge tree.
 */
function createMergeCommit(
  repo: string,
  mainSha: string,
  featureSha: string,
  overrides: Record<string, string | null> = {},
): string {
  // Start from a clean merge tree: read-tree the feature tip onto main.
  // We'll build the tree manually using hash-object + update-index.

  // First, get the tree that a faithful merge would produce.
  // We do this by merging in a detached state and reading the resulting tree.
  const tempBranch = `temp-merge-${Date.now()}`;
  git(repo, ['checkout', '-b', tempBranch, mainSha]);

  // Faithful merge (no commit so we can read the tree).
  const mergeResult = spawnSync(
    'git',
    ['merge', '--no-commit', '--no-ff', featureSha],
    {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        HOME: process.env.HOME ?? '/tmp',
      },
    },
  );
  // Ignore non-zero exit from merge (expected in no-commit mode with conflicts);
  // we'll handle conflicts by writing the overrides.

  // Apply overrides: drop or replace file content.
  for (const [path, content] of Object.entries(overrides)) {
    const absPath = join(repo, path);
    if (content === null) {
      // Drop: remove from index and working tree.
      spawnSync('git', ['rm', '-f', '--cached', path], { cwd: repo });
      try {
        rmSync(absPath);
      } catch {
        // Already gone.
      }
    } else {
      writeFileSync(absPath, content);
      git(repo, ['add', path]);
    }
  }

  // Commit the merge.
  const commitResult = spawnSync(
    'git',
    [
      'commit',
      '-m',
      `merge: feature into main${Object.keys(overrides).length ? ' (sabotaged)' : ''}`,
    ],
    {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        HOME: process.env.HOME ?? '/tmp',
      },
    },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `merge commit failed:\n${commitResult.stderr}\n${commitResult.stdout}`,
    );
  }

  const mergeSha = git(repo, ['rev-parse', 'HEAD']);

  // Return to main so repo is in a known state.
  git(repo, ['checkout', 'main']);

  return mergeSha;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-merge-invariant', () => {
  const repos: string[] = [];

  afterEach(() => {
    // Clean up all temp repos created in this test block.
    for (const r of repos) {
      rmSync(r, { recursive: true, force: true });
    }
    repos.length = 0;
  });

  /**
   * PASSING CASE: a faithful merge that carries all feature paths and does
   * not modify main-only content. The script must exit 0.
   */
  it('passes a faithful merge (no drops, no main-side modifications)', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {});
    const mainRef = mainSha;
    const featureRef = featureSha;

    const result = runScript(repo, [mainRef, featureRef, mergeSha]);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toMatch(/FAIL/i);
  });

  /**
   * FAILING CASE — direction (b): the merge drops `feature-only.ts`.
   * The script must exit non-zero and name `feature-only.ts` as the
   * dropped path.
   */
  it('FAILS and names dropped feature-only path (direction b)', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    // Sabotage: drop feature-only.ts from the merge result.
    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'feature-only.ts': null,
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    expect(result.status).not.toBe(0);
    // Must name the dropped path.
    expect(result.stdout + result.stderr).toMatch(/feature-only\.ts/);
    // Must indicate direction-b failure.
    expect(result.stdout + result.stderr).toMatch(
      /branch.*surviv|drop|missing/i,
    );
  });

  /**
   * FAILING CASE — direction (a): the merge contains a modification to
   * `main-only.ts` that was not part of the feature branch.
   *
   * To create this: we create a merge that rewrites main-only.ts to a third
   * value (different from both main and MB), which is NOT part of new-llm's
   * diff. This means the merge added a change to main-side content that the
   * feature branch never introduced.
   */
  it('FAILS and names modified main-side path (direction a)', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    // Sabotage: rewrite main-only.ts to unexpected content in the merge.
    // main-only.ts is NOT in diff(MB, feature) — it's pure main-side content.
    // The merge should carry it unchanged from main. Instead, we write something
    // different → direction (a) detects main content was altered.
    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'main-only.ts': 'export const m = 999; // SABOTAGED\n',
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    expect(result.status).not.toBe(0);
    // Must name the altered main-side path.
    expect(result.stdout + result.stderr).toMatch(/main-only\.ts/);
    // Must indicate direction-a failure.
    expect(result.stdout + result.stderr).toMatch(
      /main.*modif|alter|direction.a|MAIN/i,
    );
  });

  /**
   * BOTH FAILURE DIRECTIONS simultaneously: drop a feature path AND modify a
   * main-side path. Both must be reported.
   */
  it('FAILS and reports both directions when both violations are present', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'feature-only.ts': null,
      'main-only.ts': 'export const m = 999; // SABOTAGED\n',
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    expect(result.status).not.toBe(0);
    const out = result.stdout + result.stderr;
    // Both paths must be named.
    expect(out).toMatch(/feature-only\.ts/);
    expect(out).toMatch(/main-only\.ts/);
  });

  /**
   * FAILING CASE — direction (b), branch-only ALTERATION (not a drop).
   *
   * This is the gap the WARN-only logic missed: `feature-only.ts` is
   * branch-only (in diff(MB→feature), NOT in diff(MB→main)). Main never
   * touched it, so there is NO conflict to resolve. If the merge rewrites it
   * to different content, the branch's content was silently altered — this
   * MUST fail, not merely warn.
   */
  it('FAILS and names branch-only path ALTERED (not dropped) by the merge (direction b)', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    // Sabotage: rewrite (not drop) the branch-only file in the merge result.
    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'feature-only.ts':
        'export const featureOnly = false; // SILENTLY ALTERED\n',
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    expect(result.status).not.toBe(0);
    const out = result.stdout + result.stderr;
    // Must name the altered branch-only path.
    expect(out).toMatch(/feature-only\.ts/);
    // Must indicate a direction-b (branch-survival) FAILURE, not a WARN.
    expect(out).toMatch(/FAIL direction-b|branch.*surviv/i);
    // The alteration must be reported as a failure, not buried in a WARN.
    expect(out).toMatch(/altered|different content|did not survive|mismatch/i);
  });

  /**
   * PASSING CASE — direction (c): a BOTH-SIDES-CHANGED file whose merge result
   * is a legitimate synthesis (differs from BOTH feature and main blobs).
   *
   * `both-sides.ts` is touched by both branches since MB (feature edits the
   * top line, main edits the bottom line). A faithful merge auto-combines them
   * into content that matches NEITHER side's blob. This must NOT fail
   * direction (b) — it is handled solely by direction (c) as a WARN.
   */
  it('does NOT fail when a both-sides-changed file synthesizes (direction c WARN only)', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    // Faithful merge: git auto-merges both-sides.ts (different lines) into a
    // synthesis that differs from both feature's and main's blob.
    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {});

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    // Must pass — synthesis is legitimate, no drop, no main-side alteration.
    expect(result.status).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).not.toMatch(/FAIL/i);
    // The synthesized both-sides path is surfaced for review under direction c.
    expect(out).toMatch(/both-sides\.ts/);
    expect(out).toMatch(/direction-c|both.sides.changed|BOTH-SIDES/i);
  });

  /**
   * EXCLUSION MECHANISM: feature-only.ts is in the exclusions file with a
   * documented reason. The script should pass even though it's dropped.
   */
  it('respects the exclusions file: excluded dropped path does not fail', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    // Write an exclusions file documenting the intentional drop.
    const exclusionsPath = join(repo, 'scripts', 'merge-exclusions.json');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(
      exclusionsPath,
      JSON.stringify({
        exclusions: [
          {
            path: 'feature-only.ts',
            reason: 'Replaced by new-impl.ts in reconciliation PR #999',
            replacedBy: 'new-impl.ts',
          },
        ],
      }),
    );

    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'feature-only.ts': null,
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    // Should pass because the drop is documented.
    expect(result.status).toBe(0);
  });

  /**
   * EXCLUSION WITHOUT REASON: an exclusion entry that lacks a reason field
   * must be rejected (the script must require documentation).
   */
  it('rejects an exclusion entry that is missing a reason', () => {
    const { repo, mainSha, featureSha } = buildBaseFixture();
    repos.push(repo);

    const exclusionsPath = join(repo, 'scripts', 'merge-exclusions.json');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(
      exclusionsPath,
      JSON.stringify({
        exclusions: [
          {
            path: 'feature-only.ts',
            // Missing: reason field.
          },
        ],
      }),
    );

    const mergeSha = createMergeCommit(repo, mainSha, featureSha, {
      'feature-only.ts': null,
    });

    const result = runScript(repo, [mainSha, featureSha, mergeSha]);

    // Must fail because exclusion is undocumented.
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/reason|undocumented/i);
  });
});
