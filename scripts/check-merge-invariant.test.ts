/**
 * TDD tests for check-merge-invariant.ts (WI-680).
 *
 * Constructs a synthetic three-way git fixture to verify both detection
 * directions:
 *   (a) MAIN-SIDE: a path that was modified on main but appears in the merge
 *       result unchanged from the feature side → merge silently altered main.
 *   (b) BRANCH-SURVIVAL: a path that exists only on new-llm is dropped from
 *       the merge result → a dropped feature path.
 *
 * The fixture deliberately seeds BOTH failure modes and asserts the script
 * catches them. A passing fixture (faithful merge) asserts the script exits 0.
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

  // MB commit: shared files that both sides will touch.
  writeFileSync(join(repo, 'shared.ts'), 'export const shared = 1;\n');
  writeFileSync(join(repo, 'main-only.ts'), 'export const m = 1;\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'MB: initial commit']);
  const mbSha = git(repo, ['rev-parse', 'HEAD']);

  // Create feature branch from MB.
  git(repo, ['checkout', '-b', 'feature']);

  // Feature adds feature-only-file.ts and modifies shared.ts.
  writeFileSync(
    join(repo, 'feature-only.ts'),
    'export const featureOnly = true;\n',
  );
  writeFileSync(
    join(repo, 'shared.ts'),
    'export const shared = 2; // modified by feature\n',
  );
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'feature: add feature-only and modify shared']);
  const featureSha = git(repo, ['rev-parse', 'HEAD']);

  // Return to main; main modifies main-only.ts.
  git(repo, ['checkout', 'main']);
  writeFileSync(join(repo, 'main-only.ts'), 'export const m = 2;\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'main: update main-only']);
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
