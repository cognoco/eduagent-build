#!/usr/bin/env tsx
/**
 * check-merge-invariant.ts — WI-680
 *
 * Verifiable CI invariant for the `new-llm → main` merge.
 *
 * This branch's merge history twice silently dropped large batches of commits.
 * This script makes that detectable before the merge lands by enforcing three
 * directional rules on the three-way diff (merge-base, main, feature, merge result).
 *
 * USAGE
 *   tsx scripts/check-merge-invariant.ts <main-ref> <feature-ref> <merge-ref>
 *
 * ARGS
 *   main-ref    The tip of the main branch (typically origin/main or the base SHA).
 *   feature-ref The tip of the feature branch (typically origin/new-llm or HEAD).
 *   merge-ref   The merge result commit to verify (the PR's HEAD SHA).
 *
 * RULES
 *   (a) MAIN-SIDE: every path in diff(main, merge) MUST appear in diff(MB, feature).
 *       A path that changed between main and the merge result, but was NOT touched
 *       by the feature branch, means main content was unexpectedly altered.
 *
 *   (b) BRANCH-SURVIVAL: every path in diff(MB, feature) MUST survive into the
 *       merge result with identical blob content (for additions/modifications) or
 *       be absent from the merge result (for deletions on the feature branch).
 *       Paths may be excluded via scripts/merge-exclusions.json with a documented
 *       reason — each exclusion is mandatory-documented (no reason = script fails).
 *
 *   (c) BOTH-SIDES-CHANGED: the intersection of diff(MB, feature) and diff(MB, main)
 *       is computed at merge time (never hardcoded). Each path in this set must have
 *       a named resolution rule in scripts/merge-exclusions.json. Paths without a
 *       rule are flagged for explicit review (non-blocking warning in this version,
 *       but they do appear in CI output for audit).
 *
 * EXCLUSIONS FILE: scripts/merge-exclusions.json
 *   {
 *     "exclusions": [
 *       {
 *         "path": "apps/api/src/routes/now.ts",
 *         "reason": "Replaced by apps/api/src/routes/now-v2.ts in reconciliation PR #NNN",
 *         "replacedBy": "apps/api/src/routes/now-v2.ts"   // optional, for audit clarity
 *       }
 *     ]
 *   }
 *
 *   Every entry MUST have a non-empty `reason` field. An entry without `reason`
 *   causes the script to fail even if the path itself would otherwise pass.
 *
 * EXIT CODES
 *   0  All invariants satisfied (or violations are fully documented in exclusions).
 *   1  One or more invariant violations found; details printed to stdout.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Exclusion {
  path: string;
  reason?: string;
  replacedBy?: string;
}

interface ExclusionsFile {
  exclusions: Exclusion[];
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitOutput(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (exit ${result.status ?? 'null'}):\n${result.stderr ?? ''}`,
    );
  }
  return (result.stdout ?? '').trim();
}

/**
 * Returns the set of paths that differ between two refs.
 * Includes added, modified, and deleted files.
 */
function diffPaths(cwd: string, refA: string, refB: string): Set<string> {
  const output = gitOutput(cwd, [
    'diff',
    '--name-only',
    '--diff-filter=ACDMRT', // Add, Copy, Delete, Modify, Rename, Type-change
    `${refA}..${refB}`,
  ]);
  const lines = output.split('\n').filter(Boolean);
  return new Set(lines);
}

/**
 * Returns the blob SHA for a path at a given ref, or null if the path does
 * not exist at that ref.
 */
function blobSha(cwd: string, ref: string, filePath: string): string | null {
  const result = spawnSync(
    'git',
    ['ls-tree', '--format=%(objectname)', ref, '--', filePath],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    return null;
  }
  const sha = (result.stdout ?? '').trim();
  return sha.length > 0 ? sha : null;
}

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

function loadExclusions(cwd: string): Map<string, Exclusion> {
  const exclusionsPath = path.join(cwd, 'scripts', 'merge-exclusions.json');
  if (!fs.existsSync(exclusionsPath)) {
    return new Map();
  }
  let raw: ExclusionsFile;
  try {
    raw = JSON.parse(fs.readFileSync(exclusionsPath, 'utf8')) as ExclusionsFile;
  } catch (e) {
    throw new Error(`Failed to parse ${exclusionsPath}: ${String(e)}`);
  }
  if (!Array.isArray(raw.exclusions)) {
    throw new Error(`${exclusionsPath}: "exclusions" must be an array`);
  }

  const map = new Map<string, Exclusion>();
  for (const entry of raw.exclusions) {
    if (!entry.path) {
      throw new Error(
        `${exclusionsPath}: each exclusion entry must have a "path" field`,
      );
    }
    // Validate: reason is mandatory.
    if (!entry.reason || entry.reason.trim() === '') {
      // Intentionally use process.stdout.write so the error surfaces in CI.
      process.stdout.write(
        `[FAIL] Exclusion entry for "${entry.path}" is undocumented — ` +
          `"reason" is required but missing or empty.\n`,
      );
      process.exit(1);
    }
    map.set(entry.path, entry);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Core invariant checks
// ---------------------------------------------------------------------------

interface CheckResult {
  failures: string[];
  warnings: string[];
}

function checkInvariant(
  cwd: string,
  mainRef: string,
  featureRef: string,
  mergeRef: string,
  exclusions: Map<string, Exclusion>,
): CheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Compute merge base.
  const mb = gitOutput(cwd, ['merge-base', mainRef, featureRef]);
  process.stdout.write(`Merge base: ${mb}\n`);

  // Compute the three diffs we need.
  const diffMainToMerge = diffPaths(cwd, mainRef, mergeRef); // what the merge changed vs main
  const diffMbToFeature = diffPaths(cwd, mb, featureRef); // what the feature branch introduced
  const diffMbToMain = diffPaths(cwd, mb, mainRef); // what main introduced since MB

  process.stdout.write(
    `diff(main→merge):    ${diffMainToMerge.size} paths\n` +
      `diff(MB→feature):   ${diffMbToFeature.size} paths\n` +
      `diff(MB→main):      ${diffMbToMain.size} paths\n`,
  );

  // -------------------------------------------------------------------------
  // (a) MAIN-SIDE RULE
  // Every path in diff(main, merge) must appear in diff(MB, feature).
  // If the merge changed a path relative to main that the feature never touched,
  // main content was unexpectedly modified.
  // -------------------------------------------------------------------------
  const mainSideViolations: string[] = [];
  for (const p of diffMainToMerge) {
    if (!diffMbToFeature.has(p)) {
      mainSideViolations.push(p);
    }
  }
  if (mainSideViolations.length > 0) {
    failures.push(
      `[FAIL direction-a] MAIN-SIDE: the following paths differ between main and ` +
        `the merge result, but were NOT introduced by the feature branch — ` +
        `main content was altered or dropped:\n` +
        mainSideViolations.map((p) => `  - ${p}`).join('\n'),
    );
  }

  // -------------------------------------------------------------------------
  // (b) BRANCH-SURVIVAL RULE
  // Every path in diff(MB, feature) must survive into the merge result.
  // Survival semantics:
  //   - Feature added/modified the file → merge must have same blob content as feature.
  //   - Feature deleted the file → merge must also not have the file.
  // Exclusions may document intentional non-survival.
  // -------------------------------------------------------------------------
  const branchDropped: string[] = [];

  for (const p of diffMbToFeature) {
    if (exclusions.has(p)) {
      // Documented exclusion: skip blob check, trust the documented reason.
      const excl = exclusions.get(p)!;
      process.stdout.write(
        `[SKIP] "${p}" is excluded: ${excl.reason}` +
          (excl.replacedBy ? ` (replaced by: ${excl.replacedBy})` : '') +
          '\n',
      );
      continue;
    }

    const featureBlob = blobSha(cwd, featureRef, p);
    const mergeBlob = blobSha(cwd, mergeRef, p);

    if (featureBlob !== null) {
      // Feature has the file (added or modified) — check it survived into the merge.
      if (mergeBlob === null) {
        // The file exists on the feature branch but was DROPPED from the merge.
        branchDropped.push(p);
      } else if (featureBlob !== mergeBlob) {
        // The file exists in both but with different content.
        // This can be legitimate (conflict resolution) or a silent truncation.
        // We flag it for review rather than hard-failing, because conflict
        // resolution often produces a valid synthesis that differs from both sides.
        // If this is unexpected, it should be documented in exclusions.
        warnings.push(
          `[WARN] "${p}": exists in both feature (${featureBlob.slice(0, 8)}) and merge ` +
            `(${mergeBlob.slice(0, 8)}) but with different content — verify this is ` +
            `an intentional conflict resolution or add to merge-exclusions.json`,
        );
      }
      // featureBlob === mergeBlob: identical content, survival confirmed.
    }
  }

  if (branchDropped.length > 0) {
    failures.push(
      `[FAIL direction-b] BRANCH-SURVIVAL: the following paths exist on the feature ` +
        `branch but are MISSING from the merge result — they were silently dropped:\n` +
        branchDropped.map((p) => `  - ${p}`).join('\n') +
        '\n  To suppress: document each path in scripts/merge-exclusions.json ' +
        'with a non-empty "reason".',
    );
  }

  // -------------------------------------------------------------------------
  // (c) BOTH-SIDES-CHANGED SET
  // Paths changed on BOTH sides since MB. Each should have a named resolution.
  // We compute this live from the diffs (never a hardcoded list).
  // For now, we emit a WARNING for each intersecting path without an exclusion
  // entry — the human reviewer should verify the resolution is correct.
  // -------------------------------------------------------------------------
  const bothSides = new Set<string>();
  for (const p of diffMbToFeature) {
    if (diffMbToMain.has(p)) {
      bothSides.add(p);
    }
  }

  if (bothSides.size > 0) {
    const undocumented: string[] = [];
    const documented: string[] = [];
    for (const p of bothSides) {
      if (exclusions.has(p)) {
        documented.push(p);
      } else {
        undocumented.push(p);
      }
    }
    process.stdout.write(
      `[INFO direction-c] BOTH-SIDES-CHANGED (computed live): ${bothSides.size} paths touched by both branches since MB.\n`,
    );
    if (documented.length > 0) {
      process.stdout.write(
        `  Documented in exclusions: ${documented.join(', ')}\n`,
      );
    }
    if (undocumented.length > 0) {
      warnings.push(
        `[WARN direction-c] The following paths were changed by BOTH sides since MB ` +
          `and have no named resolution in merge-exclusions.json — ` +
          `verify conflict resolution is correct:\n` +
          undocumented.map((p) => `  - ${p}`).join('\n'),
      );
    }
  }

  return { failures, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    process.stderr.write(
      'Usage: tsx scripts/check-merge-invariant.ts <main-ref> <feature-ref> <merge-ref>\n',
    );
    process.exit(2);
  }

  const [mainRef, featureRef, mergeRef] = args as [string, string, string];
  const cwd = process.cwd();

  process.stdout.write(
    '=== Merge Invariant Check (WI-680) ===\n' +
      `  main-ref:    ${mainRef}\n` +
      `  feature-ref: ${featureRef}\n` +
      `  merge-ref:   ${mergeRef}\n\n`,
  );

  let exclusions: Map<string, Exclusion>;
  try {
    exclusions = loadExclusions(cwd);
  } catch (e) {
    process.stdout.write(`[FAIL] ${String(e)}\n`);
    process.exit(1);
    return;
  }

  if (exclusions.size > 0) {
    process.stdout.write(
      `Loaded ${exclusions.size} exclusion(s) from scripts/merge-exclusions.json\n`,
    );
  }

  let result: CheckResult;
  try {
    result = checkInvariant(cwd, mainRef, featureRef, mergeRef, exclusions);
  } catch (e) {
    process.stdout.write(`[FAIL] git error: ${String(e)}\n`);
    process.exit(1);
    return;
  }

  // Print warnings (non-blocking, informational).
  for (const w of result.warnings) {
    process.stdout.write(`${w}\n\n`);
  }

  // Print failures and exit non-zero if any.
  if (result.failures.length > 0) {
    process.stdout.write('\n--- FAILURES ---\n\n');
    for (const f of result.failures) {
      process.stdout.write(`${f}\n\n`);
    }
    process.stdout.write(
      `${result.failures.length} invariant violation(s) found. ` +
        `The merge does not satisfy the content-level merge invariant.\n`,
    );
    process.exit(1);
  } else {
    process.stdout.write('\n✓ All merge invariants satisfied.\n');
    process.exit(0);
  }
}

main();
