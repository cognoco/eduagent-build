/**
 * Integration: database-rls-coverage (H8)
 *
 * Verifies that:
 *   1. Every table in ALL_RLS_TABLES has at least one policy in pg_policies.
 *   2. The policy predicate (qual column in pg_policies) references the correct
 *      column — `profile_id` for profile-scoped tables, `owner_profile_id` for
 *      owner-scoped tables. (Legacy `family_links`'s dedicated both-FK-columns
 *      check was retired alongside the table by migration 0132 — WI-1306.)
 *
 * A policy scoped to `user_id` instead of `profile_id` on a covered table
 * would pass a simple existence check but fail here, catching the bug before
 * it reaches the app_user role-switch cut-over.
 *
 * External boundaries: Postgres (via createIntegrationDb). No mocks.
 */

import { sql } from 'drizzle-orm';
import { createIntegrationDb } from '../../../../tests/integration/helpers';
import {
  ALL_RLS_TABLES,
  OR_SCOPED_TABLES,
  RLS_TABLE_META,
} from './database-rls-coverage';

describe('Integration: RLS policy coverage (H8)', () => {
  it('every covered table has at least one policy in pg_policies', async () => {
    const db = createIntegrationDb();

    const rows = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_policies WHERE schemaname = 'public'`,
    );

    const tablesWithPolicies = new Set(rows.rows.map((r) => r.tablename));

    for (const table of ALL_RLS_TABLES) {
      expect({ table, hasPolicies: tablesWithPolicies.has(table) }).toEqual({
        table,
        hasPolicies: true,
      });
    }
  });

  it('every profile-scoped table policy predicate references profile_id', async () => {
    const db = createIntegrationDb();

    // pg_policies.qual holds the USING expression as a string. We assert it
    // contains 'profile_id' to catch policies accidentally scoped to user_id,
    // owner_profile_id, or a different column.
    //
    // Use sql.raw() with an inline IN list — all values are compile-time
    // constants from the manifest (no user input), so no injection risk.
    // The = ANY($1) form is rejected by PG17 when the parameter is not
    // explicitly typed as an array; sql.raw IN(...) avoids the cast issue.
    const nonOrTables = ALL_RLS_TABLES.filter(
      (t) => !OR_SCOPED_TABLES.includes(t),
    );
    const tableList = nonOrTables.map((t) => `'${t}'`).join(', ');
    const rows = await db.execute<{
      tablename: string;
      qual: string | null;
      with_check: string | null;
    }>(
      sql.raw(`
        SELECT tablename, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (${tableList})
      `),
    );

    // Group by tablename so we can check at least one policy per table
    const byTable = new Map<string, Array<{ qual: string | null }>>();
    for (const row of rows.rows) {
      const existing = byTable.get(row.tablename) ?? [];
      existing.push({ qual: row.qual });
      byTable.set(row.tablename, existing);
    }

    for (const table of ALL_RLS_TABLES) {
      if (OR_SCOPED_TABLES.includes(table)) {
        continue; // handled separately below
      }

      const meta = RLS_TABLE_META[table];
      if (!meta || meta.policyType !== 'standard') continue;

      const policies = byTable.get(table);
      expect({ table, policies: policies ?? [] }).not.toEqual({
        table,
        policies: [],
      });

      // Resolve the expected predicate column from the manifest metadata so
      // charge-scoped tables (consent_request → charge_person_id) are checked
      // against their own anchor, not the profile_id default.
      const expectedColumn = meta.predicateColumn;

      const anyPolicyReferencesColumn = (policies ?? []).some((p) =>
        p.qual?.includes(expectedColumn),
      );

      expect({
        table,
        predicateReferences: expectedColumn,
        passes: anyPolicyReferencesColumn,
      }).toEqual({
        table,
        predicateReferences: expectedColumn,
        passes: true,
      });
    }
  });

  // [WI-794] GUC-key drift guard.
  //
  // The predicate-column checks above pass a policy that references the RIGHT
  // column but reads the WRONG GUC — exactly the family_preferences bug:
  // migration 0066 wrote `current_setting('app.profile_id')`, a key the app
  // never sets (it sets ONLY `app.current_profile_id`, via rls.ts
  // withProfileScope). The mismatched key always resolves to NULL, so
  // `owner_profile_id = NULL` matches no row → an effective deny-all the moment
  // RLS is enforced (FORCE ROW LEVEL SECURITY / the planned app_user role
  // split). Migration 0117 realigns it.
  //
  // This is a forward drift-guard for EVERY RLS policy, not just the one fixed
  // here: a catalog-only assertion (no profiles/FK rows, so it survives the
  // identity-cutover table drops). Red-green: against a DB with the unpatched
  // 0066 policy this fails on family_preferences; after 0117 it passes.
  it('[WI-794] no RLS policy references the legacy app.profile_id GUC key', async () => {
    const db = createIntegrationDb();

    const rows = await db.execute<{
      tablename: string;
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>(
      sql`SELECT tablename, policyname, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public'`,
    );

    // pg_policies renders the GUC as the quoted literal `'app.profile_id'`;
    // the canonical key renders as `'app.current_profile_id'`, which does NOT
    // contain `'app.profile_id'` as a substring — so a plain includes() is a
    // precise legacy-key detector.
    const usesLegacyGuc = (expr: string | null) =>
      expr != null && expr.includes("'app.profile_id'");

    const offenders = rows.rows
      .filter((r) => usesLegacyGuc(r.qual) || usesLegacyGuc(r.with_check))
      .map((r) => `${r.tablename}.${r.policyname}`);

    expect(offenders).toEqual([]);

    // Pin the fix positively: family_preferences must isolate on the canonical
    // GUC the app actually sets, in BOTH the USING and WITH CHECK clauses.
    const fp = rows.rows.filter((r) => r.tablename === 'family_preferences');
    expect(fp.length).toBeGreaterThan(0);
    const fpUsesCanonical = fp.some(
      (r) =>
        r.qual?.includes("'app.current_profile_id'") === true &&
        r.with_check?.includes("'app.current_profile_id'") === true,
    );
    expect({
      table: 'family_preferences',
      usesCanonicalGuc: fpUsesCanonical,
    }).toEqual({
      table: 'family_preferences',
      usesCanonicalGuc: true,
    });
  });
});
