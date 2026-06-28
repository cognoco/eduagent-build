/**
 * [ASSUMP-F14] Static analysis test: every table that has a `profile_id`
 * column must have `ENABLE ROW LEVEL SECURITY` in a migration file.
 *
 * This test prevents the exact pattern that caused F14 — new profile-scoped
 * tables are added in one migration, RLS enablement lives in another, and
 * nobody remembers to update the second.
 *
 * How it works:
 * 1. Scan schema/*.ts for `pgTable('table_name', { ... profileId: uuid('profile_id') ... })`
 * 2. Scan drizzle/*.sql for `ENABLE ROW LEVEL SECURITY` on each table
 * 3. Assert every table from step 1 appears in step 2
 *
 * This is a file-based check — no live database needed.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getProfileScopedTables,
  PROFILE_SCOPED_SCAN_EXCEPTIONS,
} from './profile-scoped-tables.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');

function getRlsEnabledTables(): Set<string> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `Migrations directory not found at ${MIGRATIONS_DIR}. ` +
        'This test expects the standard monorepo layout.',
    );
  }

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'));

  const enabled = new Set<string>();

  for (const file of sqlFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // Match: ALTER TABLE "table_name" ENABLE ROW LEVEL SECURITY
    // or:   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY
    const matches = content.matchAll(
      /ALTER\s+TABLE\s+"?([a-z_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
    );

    for (const match of matches) {
      enabled.add(match[1]!.toLowerCase());
    }
  }

  return enabled;
}

describe('RLS coverage invariant', () => {
  it('every table with profile_id has ENABLE ROW LEVEL SECURITY', () => {
    const profileTables = getProfileScopedTables();
    const rlsTables = getRlsEnabledTables();

    const missing: string[] = [];

    for (const table of profileTables) {
      if (PROFILE_SCOPED_SCAN_EXCEPTIONS[table]) continue;
      if (!rlsTables.has(table)) {
        missing.push(table);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `[ASSUMP-F14] ${missing.length} profile-scoped table(s) missing ` +
          `ENABLE ROW LEVEL SECURITY in migrations:\n` +
          missing.map((t) => `  - ${t}`).join('\n') +
          '\n\nAdd them to an existing or new migration, or add an entry ' +
          'to PROFILE_SCOPED_SCAN_EXCEPTIONS in profile-scoped-tables.ts with a documented reason.',
      );
    }
  });

  it('detects at least the known profile-scoped tables', () => {
    const profileTables = getProfileScopedTables();

    // Sanity check: if the scanner finds fewer than 15 tables, it's broken.
    // As of 2026-04-17 there are 29+ profile-scoped tables.
    expect(profileTables.length).toBeGreaterThanOrEqual(15);
  });
});
