/**
 * Integration: RLS context propagation (Phase 0.3)
 *
 * Verifies that withProfileScope correctly:
 *   1. Sets app.current_profile_id via SET LOCAL inside a real transaction
 *   2. Reverts the setting after the transaction commits
 *   3. Rolls back on throw (no side effects persist)
 *   4. Rejects non-UUID profileIds (injection guard)
 *
 * Requires a real Postgres connection — DATABASE_URL loaded by jest.setup.ts.
 * No mocks of db, withProfileScope, or the driver.
 *
 * Regression guard: asserts that rls.ts uses SET LOCAL (not plain SET) so
 * cross-connection scope leaks are structurally impossible.
 *
 * Ref: docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md — Phase 0.3
 */

import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createDatabase, withProfileScope, type Database } from './index.js';

// ---------------------------------------------------------------------------
// Test UUIDs — stable deterministic values for readability
// ---------------------------------------------------------------------------

const PROFILE_PROP = '11111111-1111-1111-1111-111111111111';
const PROFILE_CLEAR = '22222222-2222-2222-2222-222222222222';
const PROFILE_ROLLBACK = '33333333-3333-3333-3333-333333333333';

// ---------------------------------------------------------------------------
// DB setup — real connection (DATABASE_URL loaded by jest.setup.ts)
// ---------------------------------------------------------------------------

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local at the workspace root.'
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DbInstance = ReturnType<typeof createIntegrationDb>;

async function getCurrentProfileId(db: DbInstance): Promise<string | null> {
  const rows = await db.execute(
    sql`SELECT current_setting('app.current_profile_id', true) AS v`
  );
  const value =
    (rows as unknown as { rows: { v: string }[] }).rows[0]?.v ?? null;
  // Postgres returns empty string when the GUC has never been set in this session
  return value === '' ? null : value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb('withProfileScope — integration against real Postgres', () => {
  it('SET LOCAL propagates inside the transaction callback', async () => {
    const db = createIntegrationDb();
    let seenInside: string | null = null;

    await withProfileScope(db, PROFILE_PROP, async (tx: Database) => {
      const rows = await tx.execute(
        sql`SELECT current_setting('app.current_profile_id', true) AS v`
      );
      seenInside =
        (rows as unknown as { rows: { v: string }[] }).rows[0]?.v ?? null;
    });

    expect(seenInside).toBe(PROFILE_PROP);
  });

  it('GUC is cleared after the transaction commits', async () => {
    const db = createIntegrationDb();

    await withProfileScope(db, PROFILE_CLEAR, async (_tx: Database) => {
      // Let the transaction commit normally — no work needed
    });

    // After commit, a fresh query on the same Pool should NOT see the GUC.
    // SET LOCAL is scoped to the transaction; once committed, the connection
    // returns to the pool and the GUC is no longer set.
    const after = await getCurrentProfileId(db);
    expect(after).toBeNull();
  });

  it('rolls back the transaction when the callback throws', async () => {
    const db = createIntegrationDb();

    // Create a session-scoped temp table (no FK constraints, avoids
    // polluting real tables with throwaway rows).  The temp table is
    // created OUTSIDE the transaction so it persists for the subsequent
    // assertion query.
    await db.execute(sql`
      CREATE TEMP TABLE IF NOT EXISTS _rls_rollback_probe (
        id TEXT PRIMARY KEY
      )
    `);

    const probeId = `rls-rollback-${Date.now()}`;

    await expect(
      withProfileScope(db, PROFILE_ROLLBACK, async (tx: Database) => {
        await tx.execute(
          sql`INSERT INTO _rls_rollback_probe (id) VALUES (${probeId})`
        );
        // Throw AFTER the insert — the transaction must roll back the insert
        throw new Error('intentional rollback');
      })
    ).rejects.toThrow('intentional rollback');

    // Row must NOT be present — the transaction was rolled back
    const check = await db.execute(
      sql`SELECT id FROM _rls_rollback_probe WHERE id = ${probeId}`
    );
    expect((check as unknown as { rows: { id: string }[] }).rows).toHaveLength(
      0
    );
  });

  it('rejects non-UUID profileIds before opening a transaction', async () => {
    const db = createIntegrationDb();
    await expect(
      withProfileScope(db, 'not-a-uuid', async () => 'unreachable')
    ).rejects.toThrow('profileId must be a UUID');
  });
});

// ---------------------------------------------------------------------------
// Regression guard: rls.ts must use SET LOCAL, not plain SET
// ---------------------------------------------------------------------------

describe('withProfileScope — SET LOCAL regression guard', () => {
  it('rls.ts uses SET LOCAL (not plain SET) to prevent cross-session GUC leaks', () => {
    const rlsSource = readFileSync(resolve(__dirname, 'rls.ts'), 'utf-8');

    // Must contain SET LOCAL
    expect(rlsSource).toMatch(/SET LOCAL app\.current_profile_id/);

    // Must NOT use bare "SET app.current_profile_id" (without LOCAL).
    // Regex: look for SET followed by optional whitespace and the GUC name,
    // but exclude the "SET LOCAL" form via negative lookbehind.
    const bareSetMatch = rlsSource.match(
      /(?<!LOCAL\s{0,10})\bSET\s+app\.current_profile_id/
    );
    expect(bareSetMatch).toBeNull();
  });
});
