/**
 * Unit: database-rls-coverage
 *
 * Verifies that the RLS policy manifest (PROFILE_SCOPED_TABLES and
 * OWNER_SCOPED_TABLES) is complete and consistent. This test runs without a
 * database connection and guards against omission errors in the manifest
 * itself (e.g., a new table added to the schema file but not enrolled in the
 * coverage list).
 *
 * Policy predicate correctness (does the USING clause actually reference
 * profile_id?) is validated in database-rls-coverage.integration.test.ts
 * against a live Postgres instance.
 */

import {
  PROFILE_SCOPED_TABLES,
  OWNER_SCOPED_TABLES,
  OR_SCOPED_TABLES,
  ALL_RLS_TABLES,
  RLS_TABLE_META,
} from './database-rls-coverage';

describe('database-rls-coverage manifest', () => {
  it('ALL_RLS_TABLES is the union of profile-scoped, owner-scoped, and or-scoped', () => {
    const union = new Set([
      ...PROFILE_SCOPED_TABLES,
      ...OWNER_SCOPED_TABLES,
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
  });

  it('family_links metadata declares both columns in its predicate', () => {
    const meta = RLS_TABLE_META['family_links'];
    expect(meta).toBeDefined();
    // family_links uses an OR policy: parent_profile_id OR child_profile_id
    expect(meta!.policyType).toBe('or-both-fk-cols');
  });
});
