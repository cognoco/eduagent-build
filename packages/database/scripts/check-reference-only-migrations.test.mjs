/**
 * Unit tests for check-reference-only-migrations.mjs
 *
 * WI-675 — deploy-gate false-positive fix.
 *
 * The old free-text regex (`/REFERENCE ONLY|DO NOT APPLY/i`) trips on 0108's
 * header, which MENTIONS that 0106/0107 are reference-only but is itself a
 * real, live migration.  The fix: require a structured first-line marker
 * (`-- @reference-only`) so a mere prose mention can never trip the gate.
 *
 * Run with:
 *   node --test packages/database/scripts/check-reference-only-migrations.test.mjs
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  findReferenceOnlyMigrations,
  findFreezeOnlyMigrations,
} from './check-reference-only-migrations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Locate the repo root the same way the main script does: walk up until
// pnpm-workspace.yaml is found.  This works correctly from both the main
// checkout and from a .worktrees/<branch> worktree.
function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'check-reference-only-migrations.test: could not locate repo root above ' +
      startDir,
  );
}

const repoRoot = findRepoRoot(__dirname);
const drizzleDir = path.join(repoRoot, 'apps/api/drizzle');
const journalPath = path.join(drizzleDir, 'meta/_journal.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeJournal(...tags) {
  return { entries: tags.map((tag) => ({ tag })) };
}

// ---------------------------------------------------------------------------
// Negative test: a migration whose BODY mentions "REFERENCE ONLY" in prose
// (like 0108's header) must NOT be flagged.
// ---------------------------------------------------------------------------

test('does not flag a migration that merely mentions "REFERENCE ONLY" in prose', () => {
  const journal = fakeJournal('0108_identity_foundation_baseline');
  const sql = readFileSync(
    path.join(drizzleDir, '0108_identity_foundation_baseline.sql'),
    'utf8',
  );

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(
    blocked,
    [],
    '0108 must not be blocked — it only mentions the phrase in prose, not as the structured marker',
  );
});

// ---------------------------------------------------------------------------
// Positive tests: migrations that carry the structured first-line marker
// are correctly flagged.
// ---------------------------------------------------------------------------

test('flags a migration whose first line carries the @reference-only marker (0106)', () => {
  const journal = fakeJournal('0106_identity_t1_org_membership');
  const sql = readFileSync(
    path.join(drizzleDir, '0106_identity_t1_org_membership.sql'),
    'utf8',
  );

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, ['0106_identity_t1_org_membership']);
});

test('flags a migration whose first line carries the @reference-only marker (0107)', () => {
  const journal = fakeJournal('0107_gorgeous_cardiac');
  const sql = readFileSync(
    path.join(drizzleDir, '0107_gorgeous_cardiac.sql'),
    'utf8',
  );

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, ['0107_gorgeous_cardiac']);
});

// ---------------------------------------------------------------------------
// Real-journal test: scanning the actual post-merge journal (new-llm) must
// produce ZERO blocked migrations.
//
// Context: 0106/0107 are NOT in the post-merge journal (the baseline reset,
// MMT-ADR-0012, removed them from the effective chain). 0108 IS in the journal
// and its header MENTIONS "REFERENCE ONLY" in prose — that's the false-positive
// the old free-text regex triggered. The fix (structured first-line marker)
// must let 0108 pass while keeping the gate alive for any future migration
// that genuinely carries `-- @reference-only` on line 1.
// ---------------------------------------------------------------------------

test('real journal (post-merge): gate passes — 0108 not flagged, no other reference-only migrations present', () => {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

  const blocked = findReferenceOnlyMigrations(journal, (tag) =>
    readFileSync(path.join(drizzleDir, `${tag}.sql`), 'utf8'),
  );

  // 0108 must not be in the blocked list
  assert.ok(
    !blocked.includes('0108_identity_foundation_baseline'),
    `0108 must not be flagged (false-positive). Got blocked: ${blocked.join(', ') || '(none)'}`,
  );

  // The full real journal must produce zero blocked migrations after the fix.
  assert.deepStrictEqual(
    blocked,
    [],
    `Real journal must have no blocked migrations after the structured-marker fix. Got: ${blocked.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// Synthetic edge-cases
// ---------------------------------------------------------------------------

test('does not flag a migration with no marker at all', () => {
  const journal = fakeJournal('fake_no_marker');
  const sql = '-- Normal migration\nCREATE TABLE foo (id uuid);';

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, []);
});

test('does not flag when "@reference-only" appears in the body but not on the first line', () => {
  // Someone wrote a comment mid-file that mentions the token — must not trip.
  const journal = fakeJournal('fake_body_mention');
  const sql = [
    '-- Normal migration header',
    '-- Later comment: see the @reference-only pattern in other files',
    'CREATE TABLE foo (id uuid);',
  ].join('\n');

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, []);
});

test('flags when @reference-only is on the very first line (synthetic)', () => {
  const journal = fakeJournal('fake_marked');
  const sql = [
    '-- @reference-only',
    '-- Some context',
    'CREATE TABLE bar (id uuid);',
  ].join('\n');

  const blocked = findReferenceOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, ['fake_marked']);
});

test('empty journal produces no blocked migrations', () => {
  const blocked = findReferenceOnlyMigrations({ entries: [] }, () => '');
  assert.deepStrictEqual(blocked, []);
});

// ---------------------------------------------------------------------------
// Freeze-only marker (WI-586) — findFreezeOnlyMigrations
// ---------------------------------------------------------------------------

test('flags a migration whose first line carries the @freeze-only marker (synthetic)', () => {
  const journal = fakeJournal('fake_freeze');
  const sql = [
    '-- @freeze-only',
    '-- M-DROP — operator-run inside the cutover freeze',
    'DROP TABLE legacy;',
  ].join('\n');

  const blocked = findFreezeOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, ['fake_freeze']);
});

test('does not flag @freeze-only when it appears in the body but not the first line', () => {
  const journal = fakeJournal('fake_freeze_body');
  const sql = [
    '-- Normal migration header',
    '-- see the @freeze-only convention for cutover scripts',
    'CREATE TABLE foo (id uuid);',
  ].join('\n');

  const blocked = findFreezeOnlyMigrations(journal, () => sql);

  assert.deepStrictEqual(blocked, []);
});

test('@reference-only and @freeze-only are independent markers', () => {
  const journal = fakeJournal('ref', 'freeze');
  const byTag = {
    ref: '-- @reference-only\nCREATE TABLE a (id uuid);',
    freeze: '-- @freeze-only\nDROP TABLE b;',
  };
  const read = (tag) => byTag[tag];

  assert.deepStrictEqual(findReferenceOnlyMigrations(journal, read), ['ref']);
  assert.deepStrictEqual(findFreezeOnlyMigrations(journal, read), ['freeze']);
});

// Real-journal test: after TASK A de-journaled 0117/0118, the actual journal
// must carry ZERO freeze-only migrations (they were relocated to
// drizzle/_freeze-only/ and removed from meta/_journal.json).
test('real journal (post-de-journal): no freeze-only migrations present', () => {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

  const blocked = findFreezeOnlyMigrations(journal, (tag) =>
    readFileSync(path.join(drizzleDir, `${tag}.sql`), 'utf8'),
  );

  assert.deepStrictEqual(
    blocked,
    [],
    `Real journal must have no freeze-only migrations after TASK A. Got: ${blocked.join(', ')}`,
  );
});
