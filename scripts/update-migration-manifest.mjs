#!/usr/bin/env node
// Append-only updater for the migration-immutability manifest.
//
// The manifest pins the sha256 of every committed migration .sql so a CI guard
// (packages/database/src/migration-immutability.test.ts) can fail any PR that
// edits or deletes an ALREADY-COMMITTED migration — the exact mistake that
// drifted the staging/prod ledgers (migration files rewritten after deploy had
// applied them → "phantom" ledger rows).
//
// Workflow: after `db:generate:dev` produces a NEW migration, run
//   node scripts/update-migration-manifest.mjs
// and commit the updated manifest. This script REFUSES to rewrite the hash of an
// existing entry (that would launder an illegal edit); use --force only for a
// correction to a migration that has NEVER been deployed to any shared DB.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(here, '../apps/api/drizzle');
const MANIFEST = resolve(here, '../packages/database/src/migration-immutability-manifest.json');

const force = process.argv.includes('--force');

const files = readdirSync(DRIZZLE_DIR)
  .filter((f) => /^\d{4}.*\.sql$/.test(f))
  .sort();
const current = {};
for (const f of files) {
  current[f.replace(/\.sql$/, '')] = createHash('sha256')
    .update(readFileSync(resolve(DRIZZLE_DIR, f)))
    .digest('hex');
}

let existing = {};
try {
  existing = JSON.parse(readFileSync(MANIFEST, 'utf8')).migrations ?? {};
} catch {
  /* first run — no manifest yet */
}

const changed = [];
const deleted = [];
const added = [];
for (const [tag, hash] of Object.entries(existing)) {
  if (!(tag in current)) deleted.push(tag);
  else if (current[tag] !== hash) changed.push(tag);
}
for (const tag of Object.keys(current)) if (!(tag in existing)) added.push(tag);

if ((changed.length || deleted.length) && !force) {
  console.error(
    'REFUSING to update: committed migrations are append-only and immutable.',
  );
  changed.forEach((t) => console.error(`  MODIFIED: ${t}.sql content changed`));
  deleted.forEach((t) => console.error(`  DELETED : ${t}.sql removed`));
  console.error(
    '\nEditing/removing an applied migration causes ledger drift. Make a NEW\n' +
      'migration instead. If (and only if) this corrects a migration that has\n' +
      'NEVER been deployed to any shared DB, re-run with --force.',
  );
  process.exit(1);
}

const manifest = {
  _comment:
    'APPEND-ONLY immutability guard for committed migrations. Do NOT hand-edit ' +
    'existing entries. After adding a NEW migration run ' +
    '`node scripts/update-migration-manifest.mjs` and commit. Enforced by ' +
    'packages/database/src/migration-immutability.test.ts. Editing an applied ' +
    'migration is forbidden — make a new migration.',
  migrations: current,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Manifest updated: +${added.length} added` +
    (force && (changed.length || deleted.length)
      ? `, ${changed.length} changed, ${deleted.length} deleted (FORCED)`
      : '') +
    `. Total ${Object.keys(current).length} migrations pinned.`,
);
