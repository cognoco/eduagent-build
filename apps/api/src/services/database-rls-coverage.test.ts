/**
 * Unit: database-rls-coverage
 *
 * Verifies that the RLS policy manifest is complete and consistent. This test
 * runs without a database connection and guards against omission errors in the
 * manifest itself (e.g., a new RLS-owned table added to the schema file but not
 * enrolled in the coverage list).
 *
 * Policy predicate correctness is validated in
 * database-rls-coverage.integration.test.ts against a live Postgres instance.
 * The schema-derived omission guard is intentionally profile-column-only;
 * post-cutover person-model RLS coverage is explicit manifest metadata.
 */

import {
  PROFILE_SCOPED_TABLES,
  OWNER_SCOPED_TABLES,
  CHARGE_SCOPED_TABLES,
  OR_SCOPED_TABLES,
  ALL_RLS_TABLES,
  EXPLICITLY_EXCLUDED_TABLES,
  RLS_TABLE_META,
} from './database-rls-coverage';
// ponytail: direct src import avoids polluting the production barrel with Node.js
// fs/path built-ins that are unavailable in Cloudflare Workers.
// This file is test-only (never bundled) so NX boundaries allow the relative path.
import {
  getProfileScopedTables,
  PROFILE_SCOPED_SCAN_EXCEPTIONS,
} from '../../../../packages/database/src/profile-scoped-tables';

describe('database-rls-coverage manifest', () => {
  it('ALL_RLS_TABLES is the union of profile-scoped, owner-scoped, charge-scoped, and or-scoped', () => {
    const union = new Set([
      ...PROFILE_SCOPED_TABLES,
      ...OWNER_SCOPED_TABLES,
      ...CHARGE_SCOPED_TABLES,
      ...OR_SCOPED_TABLES,
    ]);
    expect(ALL_RLS_TABLES).toEqual(expect.arrayContaining(Array.from(union)));
    expect(ALL_RLS_TABLES).toHaveLength(union.size);
  });

  it('PROFILE_SCOPED_TABLES and OWNER_SCOPED_TABLES are disjoint', () => {
    const profileSet = new Set(PROFILE_SCOPED_TABLES);
    const overlap = OWNER_SCOPED_TABLES.filter((t) => profileSet.has(t));
    expect(overlap).toHaveLength(0);
  });

  it('every ALL_RLS_TABLES entry has metadata in RLS_TABLE_META', () => {
    for (const table of ALL_RLS_TABLES) {
      expect(RLS_TABLE_META[table]).toBeDefined();
    }
  });

  it('metadata predicateColumn matches declared scoping', () => {
    for (const table of PROFILE_SCOPED_TABLES) {
      const meta = RLS_TABLE_META[table];
      expect(meta).toBeDefined();
      expect(meta!.predicateColumn).toBe('profile_id');
    }

    for (const table of OWNER_SCOPED_TABLES) {
      const meta = RLS_TABLE_META[table];
      expect(meta).toBeDefined();
      expect(meta!.predicateColumn).toBe('owner_profile_id');
    }

    for (const table of CHARGE_SCOPED_TABLES) {
      const meta = RLS_TABLE_META[table];
      expect(meta).toBeDefined();
      expect(meta!.predicateColumn).toBe('charge_person_id');
    }
  });
});

/**
 * Omission guard (S3-M2 closeout — hardened WI-688)
 *
 * Every profile-scoped table DERIVED from real Drizzle profile-column
 * declarations (via getProfileScopedTables()) must appear in ALL_RLS_TABLES
 * (has a policy) or EXPLICITLY_EXCLUDED_TABLES (RLS enabled, policy not yet
 * added). An unregistered profile-scoped table FAILS this test — closing the
 * vacuous-pass blind spot of the previous hand-maintained KNOWN_PROFILE_TABLES
 * list.
 *
 * Known scanner false positives for real non-ownership declarations are
 * filtered via PROFILE_SCOPED_SCAN_EXCEPTIONS from @eduagent/database.
 * Person_id tables are handled by the explicit manifest families above.
 */
describe('database-rls-coverage omission guard (S3-M2)', () => {
  it('every profile-scoped table in the schema appears in ALL_RLS_TABLES or EXPLICITLY_EXCLUDED_TABLES', () => {
    const covered = new Set([...ALL_RLS_TABLES, ...EXPLICITLY_EXCLUDED_TABLES]);
    const missing = getProfileScopedTables()
      .filter((t) => !PROFILE_SCOPED_SCAN_EXCEPTIONS[t])
      .filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('EXPLICITLY_EXCLUDED_TABLES entries are not in ALL_RLS_TABLES', () => {
    const allRlsSet = new Set(ALL_RLS_TABLES);
    const overlap = EXPLICITLY_EXCLUDED_TABLES.filter((t) => allRlsSet.has(t));
    expect(overlap).toHaveLength(0);
  });
});
