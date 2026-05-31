// ---------------------------------------------------------------------------
// Migration immutability guard [DB drift prevention] — file-based, no DB.
//
// The staging/prod ledgers drifted in 2026-05 because migration .sql files were
// rewritten/squashed AFTER deploy had already applied them, leaving "phantom"
// ledger rows that `drizzle-kit migrate` could no longer reconcile (29 phantom
// on staging, 8 on prod; see 0056_schema_drift_repair for a prior occurrence).
//
// This guard makes committed migrations APPEND-ONLY: editing or deleting an
// already-committed migration fails CI loudly instead of silently drifting the
// shared DBs. New migrations must be registered (pins them going forward).
//
// To add a migration: `db:generate:dev`, then
//   node scripts/update-migration-manifest.mjs
// and commit the updated manifest. Editing an APPLIED migration is forbidden —
// make a new migration instead.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

const DRIZZLE_DIR = resolve(__dirname, '../../../apps/api/drizzle');
const MANIFEST = resolve(__dirname, 'migration-immutability-manifest.json');

function migrationFiles(): string[] {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .sort();
}

function hashOf(file: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(DRIZZLE_DIR, file)))
    .digest('hex');
}

const manifest: Record<string, string> = JSON.parse(
  readFileSync(MANIFEST, 'utf8'),
).migrations;

const current: Record<string, string> = Object.fromEntries(
  migrationFiles().map((f) => [f.replace(/\.sql$/, ''), hashOf(f)]),
);

describe('migration immutability [drift guard]', () => {
  it('sanity: the manifest pins a realistic number of migrations', () => {
    // Guards against an empty/broken manifest silently disabling the check.
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(100);
  });

  it('no committed migration has changed content or been deleted (append-only)', () => {
    const violations: string[] = [];
    for (const [tag, hash] of Object.entries(manifest)) {
      if (!(tag in current)) {
        violations.push(
          `DELETED/RENAMED: ${tag}.sql — applied migrations are append-only; make a new migration.`,
        );
      } else if (current[tag] !== hash) {
        violations.push(
          `MODIFIED: ${tag}.sql content changed — applied migrations are immutable; make a new migration.`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('every committed migration is registered in the manifest', () => {
    const unregistered = Object.keys(current).filter(
      (tag) => !(tag in manifest),
    );
    // A new migration must be pinned so it is protected going forward:
    //   node scripts/update-migration-manifest.mjs   (then commit)
    expect(unregistered).toEqual([]);
  });

  it('the journal still contains every pinned migration (no entry removed)', () => {
    const journal = JSON.parse(
      readFileSync(resolve(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const missing = Object.keys(manifest).filter(
      (tag) => !journalTags.has(tag),
    );
    expect(missing).toEqual([]);
  });
});
