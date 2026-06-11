/**
 * Integration coverage for 0109_identity_reseed.sql.
 *
 * Executes the committed migration's DO block against a real PostgreSQL,
 * inside a single transaction that is ROLLED BACK — the database is left
 * exactly as found.
 *
 * Runs only against a wire-protocol PostgreSQL (the CI container, a local
 * scratch postgres). It SKIPS on Neon URLs, for two reasons:
 *  1. The Neon HTTP driver has no interactive transactions, so the
 *     rollback-isolation pattern is impossible there.
 *  2. The shared dev/stg Neon databases are live shared infrastructure — the
 *     reseed block operates on whole tables and must never run against them
 *     implicitly from a test (hard rule for this operation: shared-DB writes are gated).
 *
 * Uses its own dedicated pg client (not the shared drizzle pool) so that
 * BEGIN / fixtures / reseed / assertions / ROLLBACK all happen on one
 * connection.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const MIGRATION_PATH = join(
  __dirname,
  '../../apps/api/drizzle/0109_identity_reseed.sql',
);

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

const databaseUrl = process.env.DATABASE_URL ?? '';
const describeWire = isNeonUrl(databaseUrl) ? describe.skip : describe;

if (isNeonUrl(databaseUrl)) {
  console.log(
    '[identity-reseed] skipping: DATABASE_URL is Neon (shared DB; no interactive transactions). CI runs this against its postgres container.',
  );
}

type Pg = typeof import('pg');
type PgClient = InstanceType<Pg['Client']>;

describeWire('identity reseed (0109) — legacy → 8-table model', () => {
  let client: PgClient;
  const reseedSql = readFileSync(MIGRATION_PATH, 'utf8');

  // Fixture ids — generated per run; everything is rolled back regardless.
  const A1 = randomUUID(); // account: owner + child + family link + consent + subscription
  const A2 = randomUUID(); // account: NO profiles (ownerless) + subscription
  const A3 = randomUUID(); // account: archived owner, NULL location, withdrawn + pending consents
  const P1 = randomUUID(); // A1 owner (adult)
  const P2 = randomUUID(); // A1 child
  const P3 = randomUUID(); // A3 archived owner
  const L1 = randomUUID(); // family link P1 -> P2
  const CS1 = randomUUID(); // P2 COPPA CONSENTED
  const CS2 = randomUUID(); // P3 GDPR WITHDRAWN
  const CS3 = randomUUID(); // P2 GDPR PENDING (must NOT be seeded)
  const S1 = randomUUID(); // A1 subscription (plus/active, stripe)
  const S2 = randomUUID(); // A2 subscription (ownerless — must NOT be seeded)
  const uniq = randomUUID().slice(0, 8);

  async function one<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const res = await client.query(sql, params);
    return res.rows[0] as T | undefined;
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const row = await one<{ n: string | number }>(sql, params);
    return Number(row?.n ?? NaN);
  }

  beforeAll(async () => {
    // Dedicated wire-protocol connection; the shared drizzle pool cannot pin
    // one session across BEGIN…ROLLBACK.
    const pg = require('pg') as Pg;
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('BEGIN');

    // ── legacy fixtures ────────────────────────────────────────────────
    await client.query(
      `INSERT INTO accounts (id, clerk_user_id, email, timezone, created_at, updated_at) VALUES
       ($1, $4, $5, 'Europe/Prague', '2025-01-01T00:00:00Z', '2025-06-01T00:00:00Z'),
       ($2, $6, $7, NULL,            '2025-02-01T00:00:00Z', '2025-02-01T00:00:00Z'),
       ($3, $8, $9, 'America/New_York', '2025-03-01T00:00:00Z', '2025-03-02T00:00:00Z')`,
      [
        A1,
        A2,
        A3,
        `clerk_reseed_${uniq}_1`,
        `reseed_${uniq}_1@example.test`,
        `clerk_reseed_${uniq}_2`,
        `reseed_${uniq}_2@example.test`,
        `clerk_reseed_${uniq}_3`,
        `reseed_${uniq}_3@example.test`,
      ],
    );

    await client.query(
      `INSERT INTO profiles (id, account_id, display_name, birth_year, location, is_owner, created_at, updated_at, archived_at) VALUES
       ($1, $4, 'Parent One', 1990, 'EU', true,  '2025-01-01T01:00:00Z', '2025-06-01T01:00:00Z', NULL),
       ($2, $4, 'Child Two',  2014, 'EU', false, '2025-01-02T00:00:00Z', '2025-01-03T00:00:00Z', NULL),
       ($3, $5, 'Archived Three', 1985, NULL, true, '2025-03-01T01:00:00Z', '2025-03-02T01:00:00Z', '2025-04-01T00:00:00Z')`,
      [P1, P2, P3, A1, A3],
    );

    await client.query(
      `INSERT INTO family_links (id, parent_profile_id, child_profile_id, created_at)
       VALUES ($1, $2, $3, '2025-01-02T12:00:00Z')`,
      [L1, P1, P2],
    );

    await client.query(
      `INSERT INTO consent_states (id, profile_id, consent_type, status, parent_email, requested_at, responded_at, policy_version, request_ip, user_agent, created_at, updated_at) VALUES
       ($1, $4, 'COPPA', 'CONSENTED', $6, '2025-01-02T12:00:00Z', '2025-01-02T13:00:00Z', 'v1.2', '203.0.113.7', 'jest', '2025-01-02T12:00:00Z', '2025-01-02T13:00:00Z'),
       ($2, $5, 'GDPR', 'WITHDRAWN', NULL, '2025-03-01T02:00:00Z', '2025-03-01T03:00:00Z', 'v1.2', NULL, NULL, '2025-03-01T02:00:00Z', '2025-04-01T00:00:00Z'),
       ($3, $4, 'GDPR', 'PENDING',   NULL, '2025-05-01T00:00:00Z', NULL, NULL, NULL, NULL, '2025-05-01T00:00:00Z', '2025-05-01T00:00:00Z')`,
      [CS1, CS2, CS3, P2, P3, `parent_${uniq}@example.test`],
    );

    await client.query(
      `INSERT INTO subscriptions (id, account_id, tier, status, stripe_subscription_id, current_period_start, current_period_end, created_at, updated_at) VALUES
       ($1, $3, 'plus', 'active', $5, '2025-06-01T00:00:00Z', '2025-07-01T00:00:00Z', '2025-01-01T02:00:00Z', '2025-06-01T02:00:00Z'),
       ($2, $4, 'free', 'trial', NULL, NULL, NULL, '2025-02-01T01:00:00Z', '2025-02-01T01:00:00Z')`,
      [S1, S2, A1, A2, `sub_reseed_${uniq}`],
    );

    // ── execute the committed migration block ──────────────────────────
    await client.query(reseedSql);
  }, 60_000);

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end().catch(() => undefined);
    }
  });

  it('creates one organization per account (id reuse, owner-name fallback chain)', async () => {
    const o1 = await one<{ name: string; timezone: string }>(
      'SELECT name, timezone FROM organization WHERE id = $1',
      [A1],
    );
    expect(o1).toEqual({ name: 'Parent One', timezone: 'Europe/Prague' });

    // Ownerless account: name falls back to the email local-part.
    const o2 = await one<{ name: string }>(
      'SELECT name FROM organization WHERE id = $1',
      [A2],
    );
    expect(o2?.name).toBe(`reseed_${uniq}_2`);

    // Archived owner still provides the name (archived included).
    const o3 = await one<{ name: string }>(
      'SELECT name FROM organization WHERE id = $1',
      [A3],
    );
    expect(o3?.name).toBe('Archived Three');
  });

  it('maps profiles to persons: Jan-1 birth-date convention + jurisdiction mapping', async () => {
    const p1 = await one<{
      display_name: string;
      birth_date: string;
      residence_jurisdiction: string;
      login_id: string | null;
      has_own_account: boolean;
    }>(
      `SELECT display_name, birth_date::text, residence_jurisdiction, login_id, has_own_account
       FROM person WHERE id = $1`,
      [P1],
    );
    expect(p1).toEqual({
      display_name: 'Parent One',
      birth_date: '1990-01-01',
      residence_jurisdiction: 'EU',
      login_id: A1, // owner is bound to the account's login
      has_own_account: false,
    });

    const p2 = await one<{ login_id: string | null; birth_date: string }>(
      'SELECT login_id, birth_date::text FROM person WHERE id = $1',
      [P2],
    );
    expect(p2).toEqual({ login_id: null, birth_date: '2014-01-01' }); // managed child

    // NULL legacy location → fail-closed 'UNKNOWN', residence cache stays NULL.
    const p3 = await one<{
      residence_jurisdiction: string;
      residence_knowing: unknown;
      age_knowing: { method?: string } | null;
    }>(
      'SELECT residence_jurisdiction, residence_knowing, age_knowing FROM person WHERE id = $1',
      [P3],
    );
    expect(p3?.residence_jurisdiction).toBe('UNKNOWN');
    expect(p3?.residence_knowing).toBeNull();
    expect(p3?.age_knowing?.method).toBe('self_attested_birth_year');
  });

  it('creates a login per owned account and skips ownerless accounts', async () => {
    const l1 = await one<{ person_id: string; email: string }>(
      'SELECT person_id, email FROM login WHERE id = $1',
      [A1],
    );
    expect(l1).toEqual({
      person_id: P1,
      email: `reseed_${uniq}_1@example.test`,
    });

    expect(
      await count('SELECT count(*)::int AS n FROM login WHERE id = $1', [A2]),
    ).toBe(0);
  });

  it('creates memberships with owner → {admin,learner}, non-owner → {learner}', async () => {
    const m1 = await one<{ organization_id: string; roles: string[] }>(
      'SELECT organization_id, roles FROM membership WHERE id = $1',
      [P1],
    );
    expect(m1).toEqual({ organization_id: A1, roles: ['admin', 'learner'] });

    const m2 = await one<{ roles: string[] }>(
      'SELECT roles FROM membership WHERE id = $1',
      [P2],
    );
    expect(m2?.roles).toEqual(['learner']);
  });

  it('maps family links to active guardianships', async () => {
    const g = await one<{
      guardian_person_id: string;
      charge_person_id: string;
      qualification: string;
      revoked_at: string | null;
    }>(
      'SELECT guardian_person_id, charge_person_id, qualification, revoked_at FROM guardianship WHERE id = $1',
      [L1],
    );
    expect(g).toEqual({
      guardian_person_id: P1,
      charge_person_id: P2,
      qualification: 'biological_parent',
      revoked_at: null,
    });
  });

  it('maps consent events; PENDING rows are not seeded; audit metadata survives', async () => {
    const c1 = await one<{
      charge_person_id: string;
      organization_id: string;
      purpose: string;
      lawful_basis: string;
      granted: boolean;
      withdrawn_at: string | null;
      snapshot_age_at_grant: number;
      snapshot_jurisdiction_at_grant: string;
      audit_fact: Record<string, unknown>;
    }>(
      `SELECT charge_person_id, organization_id, purpose, lawful_basis, granted,
              withdrawn_at, snapshot_age_at_grant, snapshot_jurisdiction_at_grant, audit_fact
       FROM consent_grant WHERE id = $1`,
      [CS1],
    );
    expect(c1).toMatchObject({
      charge_person_id: P2,
      organization_id: A1,
      purpose: 'platform_use',
      lawful_basis: 'coppa_parental_consent',
      granted: true,
      withdrawn_at: null,
      snapshot_age_at_grant: 11, // 2025 (responded_at year) - 2014, Jan-1 convention
      snapshot_jurisdiction_at_grant: 'EU',
    });
    expect(c1?.audit_fact).toMatchObject({
      source: 'reseed_0109:consent_states',
      legacy_status: 'CONSENTED',
      legacy_consent_type: 'COPPA',
      policy_version: 'v1.2',
      request_ip: '203.0.113.7',
      parent_email: `parent_${uniq}@example.test`,
    });

    const c2 = await one<{
      withdrawn_at: Date | string | null;
      lawful_basis: string;
    }>('SELECT withdrawn_at, lawful_basis FROM consent_grant WHERE id = $1', [
      CS2,
    ]);
    expect(c2?.lawful_basis).toBe('gdpr_parental_consent');
    expect(c2?.withdrawn_at).not.toBeNull();

    expect(
      await count(
        'SELECT count(*)::int AS n FROM consent_grant WHERE id = $1',
        [CS3],
      ),
    ).toBe(0);
  });

  it('re-anchors subscriptions to the org with the owner as primary payer; skips ownerless', async () => {
    const s1 = await one<{
      organization_id: string;
      plan_tier: string;
      status: string;
      payer_person_id: string;
      store_platform: string;
    }>(
      `SELECT organization_id, plan_tier, status, payer_person_id, store_platform
       FROM subscription WHERE id = $1`,
      [S1],
    );
    expect(s1).toEqual({
      organization_id: A1,
      plan_tier: 'plus',
      status: 'active',
      payer_person_id: P1,
      store_platform: 'stripe',
    });

    const sp = await one<{ person_id: string; role: string }>(
      'SELECT person_id, role FROM subscription_payers WHERE subscription_id = $1',
      [S1],
    );
    expect(sp).toEqual({ person_id: P1, role: 'primary' });

    expect(
      await count('SELECT count(*)::int AS n FROM subscription WHERE id = $1', [
        S2,
      ]),
    ).toBe(0);
  });

  it('does not invent supporterships (no legacy source)', async () => {
    expect(await count('SELECT count(*)::int AS n FROM supportership')).toBe(0);
  });

  it('re-run is idempotent and converges on legacy updates + deletions', async () => {
    const freedEmail = `reseed_${uniq}_3@example.test`; // A3's email, freed below

    // Mutate legacy: rename owner, retier subscription, unlink the child,
    // delete a whole account (cascades its profiles + consents in legacy),
    // and have a surviving account claim the deleted account's email.
    await client.query(
      `UPDATE profiles SET display_name = 'Parent One Renamed', updated_at = '2025-06-02T00:00:00Z' WHERE id = $1`,
      [P1],
    );
    await client.query(
      `UPDATE subscriptions SET tier = 'family' WHERE id = $1`,
      [S1],
    );
    await client.query('DELETE FROM family_links WHERE id = $1', [L1]);
    await client.query('DELETE FROM accounts WHERE id = $1', [A3]);
    await client.query('UPDATE accounts SET email = $2 WHERE id = $1', [
      A1,
      freedEmail,
    ]);

    await client.query(reseedSql); // second run

    // No duplicates for the surviving fixture graph.
    expect(
      await count(
        'SELECT count(*)::int AS n FROM person WHERE id IN ($1, $2)',
        [P1, P2],
      ),
    ).toBe(2);
    expect(
      await count(
        'SELECT count(*)::int AS n FROM membership WHERE id IN ($1, $2)',
        [P1, P2],
      ),
    ).toBe(2);
    expect(
      await count(
        'SELECT count(*)::int AS n FROM subscription_payers WHERE subscription_id = $1',
        [S1],
      ),
    ).toBe(1);

    // Updates converged.
    const p1 = await one<{ display_name: string }>(
      'SELECT display_name FROM person WHERE id = $1',
      [P1],
    );
    expect(p1?.display_name).toBe('Parent One Renamed');
    const s1 = await one<{ plan_tier: string }>(
      'SELECT plan_tier FROM subscription WHERE id = $1',
      [S1],
    );
    expect(s1?.plan_tier).toBe('family');

    // Mirror-delete: the guardianship whose family link vanished is gone.
    expect(
      await count('SELECT count(*)::int AS n FROM guardianship WHERE id = $1', [
        L1,
      ]),
    ).toBe(0);

    // Mirror-delete: the deleted account's whole graph is gone (org, person,
    // login, consent mirror).
    expect(
      await count('SELECT count(*)::int AS n FROM organization WHERE id = $1', [
        A3,
      ]),
    ).toBe(0);
    expect(
      await count('SELECT count(*)::int AS n FROM person WHERE id = $1', [P3]),
    ).toBe(0);
    expect(
      await count('SELECT count(*)::int AS n FROM login WHERE id = $1', [A3]),
    ).toBe(0);
    expect(
      await count(
        'SELECT count(*)::int AS n FROM consent_grant WHERE id = $1',
        [CS2],
      ),
    ).toBe(0);

    // Freed unique value: A1 claimed the deleted account's email; the re-run
    // must not abort (mirror-deletes run before the upserts) and the login
    // converges to the new email.
    const l1 = await one<{ email: string }>(
      'SELECT email FROM login WHERE id = $1',
      [A1],
    );
    expect(l1?.email).toBe(freedEmail);

    // Org name converged with the owner rename.
    const o1 = await one<{ name: string }>(
      'SELECT name FROM organization WHERE id = $1',
      [A1],
    );
    expect(o1?.name).toBe('Parent One Renamed');
  });
});
