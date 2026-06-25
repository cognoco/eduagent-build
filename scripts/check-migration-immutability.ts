// Migration-immutability ratchet — BUG-886.
//
// Applied database migrations are immutable. Drizzle stores a content hash of
// each migration SQL file in the `__drizzle_migrations` table; if an
// already-applied migration file is edited, its new hash no longer matches the
// recorded one, so `drizzle-kit migrate` treats it as a fresh, unapplied
// migration and re-runs it — replaying destructive DDL (TRUNCATE / DROP) and
// drifting the schema. This is the documented root cause of the 2026-05 staging
// ledger drift ("migration-file rewrites + manual push"); this guard is the
// never-built prevention called for in AGENTS.md → Schema And Deploy Safety.
//
// The check is a git diff against the base branch — NOT a committed hash
// manifest. The base branch is the immutable reference, so an edit to an
// existing migration cannot be "laundered" by regenerating a manifest in the
// same PR. Only numbered migration SQL files under `apps/api/drizzle/` are in
// scope; `meta/_journal.json` and `meta/NNNN_snapshot.json` legitimately change
// on every new migration and are intentionally ignored.
//
// Rule: an existing migration `.sql` may not be Modified, Deleted, or Renamed.
// Adding a new migration (status A) is always allowed and needs no extra step —
// normal development is unaffected.
//
// Escape: a genuinely exceptional maintenance change (e.g. a branch-sync
// renumber) lists the tag + reason in scripts/migration-immutability-allowlist.json.
// That edit is loud and reviewable — it is not a silent bypass.
//
// CLI usage (mirrors scripts/check-gc1-pattern-a.ts):
//   Pre-commit (default): diff the staged index vs HEAD.
//     pnpm exec tsx scripts/check-migration-immutability.ts
//   CI (PR mode):         diff origin/<base>...HEAD. Triggered by GITHUB_BASE_REF.
// Exit codes: 0 clean, 1 violations.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.resolve(
  __dirname,
  'migration-immutability-allowlist.json',
);

// A numbered migration SQL file at the top level of the drizzle dir, e.g.
// `apps/api/drizzle/0088_bug363_dedup_pairkey_category.sql`. Deliberately
// excludes `meta/` (journal + snapshots) — those are drizzle bookkeeping that
// changes on every migration add and is not the drift vector.
export const MIGRATION_FILE_RE = /^apps\/api\/drizzle\/(\d+_[^/]*)\.sql$/;

export function migrationTag(filePath: string): string | null {
  const m = MIGRATION_FILE_RE.exec(filePath);
  return m ? m[1] : null;
}

export type ChangeStatus = string;

export interface Change {
  /** First letter of the git status code (A, M, D, R, C, T, …). */
  status: ChangeStatus;
  /** For R/C this is the source (existing) path; otherwise the changed path. */
  oldPath: string;
  /** Destination path for renames/copies. */
  newPath?: string;
}

export interface Violation {
  tag: string;
  path: string;
  status: ChangeStatus;
}

/**
 * Parse `git diff --name-status` output. Rename/copy lines are tab-separated
 * triples (`R100\told\tnew`); all others are pairs (`M\tpath`).
 */
export function parseNameStatus(raw: string): Change[] {
  const out: Change[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0].charAt(0);
    if ((status === 'R' || status === 'C') && parts.length >= 3) {
      out.push({ status, oldPath: parts[1], newPath: parts[2] });
    } else {
      out.push({ status, oldPath: parts[1] ?? '' });
    }
  }
  return out;
}

/**
 * A change is a violation when it touches an existing numbered migration file
 * in any way other than adding it (status A) — i.e. Modified, Deleted,
 * Renamed-away, Copied-from, or Type-changed — and the tag is not allowlisted.
 */
export function findViolations(
  changes: Change[],
  allowlist: Set<string>,
): Violation[] {
  const out: Violation[] = [];
  for (const c of changes) {
    if (c.status === 'A') continue; // new migration — always allowed
    const tag = migrationTag(c.oldPath);
    if (!tag) continue; // not a numbered migration .sql (journal/snapshot/etc.)
    if (allowlist.has(tag)) continue;
    out.push({ tag, path: c.oldPath, status: c.status });
  }
  return out;
}

interface AllowlistEntry {
  tag: string;
  reason: string;
}

export function loadAllowlist(): Set<string> {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${ALLOWLIST_PATH} must be a JSON array of {tag, reason} entries`,
    );
  }
  return new Set(
    (parsed as AllowlistEntry[]).map((e) => e.tag).filter(Boolean),
  );
}

/** git-diff range: PR mode (CI) vs staged index (pre-commit). Mirrors GC1. */
export function resolveRange(): string[] {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef && baseRef.trim().length > 0) {
    return [`origin/${baseRef.trim()}...HEAD`];
  }
  return ['--cached'];
}

function runCli(): void {
  const range = resolveRange();
  const res = spawnSync(
    'git',
    ['diff', ...range, '--name-status', '--', 'apps/api/drizzle'],
    { encoding: 'utf8', cwd: REPO_ROOT },
  );
  // Fail-open on an infra error (base not fetched, not a git repo) — mirrors
  // GC1. The CI step is PR-only where the base ref is always fetched.
  if (res.status !== 0) {
    process.exit(0);
  }

  const violations = findViolations(
    parseNameStatus(res.stdout),
    loadAllowlist(),
  );

  if (violations.length === 0) {
    process.exit(0);
  }

  console.error('');
  console.error(
    'Migration immutability: an already-committed migration was changed.',
  );
  console.error(
    'Applied migrations are immutable — editing one re-runs its destructive',
  );
  console.error(
    'DDL on the next `drizzle-kit migrate` and drifts the schema (BUG-886).',
  );
  console.error('');
  console.error('Offending migration files:');
  for (const v of violations) {
    const verb =
      v.status === 'D'
        ? 'deleted'
        : v.status === 'R'
          ? 'renamed'
          : v.status === 'C'
            ? 'copied'
            : 'modified';
    console.error(`  ${v.path}  (${verb})`);
  }
  console.error('');
  console.error('Fix: revert the change to the existing migration and write a');
  console.error('NEW forward migration instead (pnpm db:generate:dev).');
  console.error('');
  console.error(
    'If this is a genuinely exceptional maintenance change (e.g. a branch-sync',
  );
  console.error(
    'renumber), add the tag + reason to scripts/migration-immutability-allowlist.json',
  );
  console.error('and justify it in the commit message.');
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] &&
  /check-migration-immutability(\.ts)?$/.test(
    process.argv[1].replace(/\\/g, '/'),
  );
if (invokedDirectly) {
  runCli();
}
