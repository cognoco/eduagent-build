// Preflight guard: refuse to run `drizzle-kit migrate` when a journaled migration
// carries the structured reference-only marker on its first line.
//
// Why this exists
// ---------------
// Migrations 0106 (`identity_t1_org_membership`) and 0107 (`gorgeous_cardiac` —
// the `concepts` / `concept_mastery` tables) are journaled in
// `meta/_journal.json` but must never be applied to a live database.
// `drizzle-kit migrate` does not read SQL comments — it applies every journaled
// migration not yet recorded in `drizzle.__drizzle_migrations`. Because these two
// were never applied live, the next staging/prod migrate would execute them:
// re-introducing the reverted T1 org/membership tables and `0107`'s FKs to
// `profiles` (a table the baseline reset renames to `person`), and possibly
// hard-failing the deploy on `0106`'s backfill `RAISE EXCEPTION`.
//
// The permanent fix is the one-time baseline reset (MMT-ADR-0012), which removes
// these from the effective chain. Until that lands, this guard converts a silent,
// catastrophic auto-apply into a loud, safe deploy failure.
//
// Marker semantics (WI-675)
// -------------------------
// Detection uses a STRUCTURED FIRST-LINE marker only:
//
//   -- @reference-only
//
// The old free-text regex (`/REFERENCE ONLY|DO NOT APPLY/i`) scanned the whole
// file, causing a false-positive on 0108's header (it MENTIONS that 0106/0107
// are reference-only, but is itself a real, apply-safe migration). The new rule:
// ONLY the SQL file's FIRST LINE is inspected, and ONLY an exact match of
// `-- @reference-only` (case-insensitive, trimmed) triggers the gate. A prose
// mention of those words anywhere else in the file is harmless.
//
// Scope: wired ONLY before the real staging/production migrate step in
// `.github/workflows/deploy.yml`. It is intentionally NOT wired before the
// ephemeral quality-gate migrate (a throwaway CI database where applying these on
// empty data is harmless), so it does not break normal branch CI.
//
// Forward-only: any future migration carrying the marker on its first line is
// also blocked here, so the "do not apply" intent is machine-enforced.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

/**
 * Returns true when the SQL file's first non-empty line is exactly the
 * structured reference-only marker `-- @reference-only` (case-insensitive,
 * leading/trailing whitespace stripped).
 *
 * Checking ONLY the first line ensures that a prose mention of the phrase
 * anywhere later in the file (e.g. in 0108's header commentary) does not
 * trigger the gate.
 *
 * @param {string} sql
 * @returns {boolean}
 */
function isReferenceOnly(sql) {
  const firstLine = sql.split('\n')[0].trim();
  return firstLine.toLowerCase() === '-- @reference-only';
}

/**
 * Pure scan: given the journal entries and a reader that returns each
 * migration's SQL text by tag, return the tags whose SQL carries the
 * structured reference-only marker on its first line. Exported for unit testing.
 *
 * @param {{ entries: Array<{ tag: string }> }} journal
 * @param {(tag: string) => string} readSql
 * @returns {string[]}
 */
export function findReferenceOnlyMigrations(journal, readSql) {
  const blocked = [];
  for (const entry of journal.entries ?? []) {
    const sql = readSql(entry.tag);
    if (isReferenceOnly(sql)) {
      blocked.push(entry.tag);
    }
  }
  return blocked;
}

function findRepoRoot(startDir) {
  let dir = startDir;
  // Walk up until we find the workspace marker.
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'check-reference-only-migrations: could not locate repo root (pnpm-workspace.yaml) above ' +
      startDir,
  );
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(here);
  const drizzleDir = resolve(repoRoot, 'apps/api/drizzle');
  const journalPath = join(drizzleDir, 'meta', '_journal.json');

  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const blocked = findReferenceOnlyMigrations(journal, (tag) =>
    readFileSync(join(drizzleDir, `${tag}.sql`), 'utf8'),
  );

  if (blocked.length === 0) {
    console.log(
      '✓ No reference-only migrations in the journal — safe to migrate.',
    );
    return;
  }

  console.error(
    [
      '',
      '✗ Refusing to run drizzle-kit migrate against a live environment.',
      '',
      'The following journaled migrations are marked REFERENCE ONLY / DO NOT APPLY',
      'but are still present in meta/_journal.json, so `drizzle-kit migrate` would',
      'execute them against this database:',
      '',
      ...blocked.map((tag) => `    • ${tag}`),
      '',
      'These must be removed from the effective migration chain before a live',
      'migrate is safe. This is the one-time baseline reset — see',
      'docs/adr/MMT-ADR-0012-one-time-baseline-reset.md and the 2026-06-09',
      'codebase-atlas db-migration report, Critical #1 (bug register retired from',
      'HEAD 2026-06-10; in git history at',
      'docs/reviews/2026-06-09-codebase-atlas/bugs/db-migration.md).',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
