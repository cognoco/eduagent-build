/**
 * Read-only integrity verification for the identity reseed
 * (0109_identity_reseed.sql).
 *
 * Compares the legacy identity tables (accounts, profiles, family_links,
 * consent_states, subscriptions) against the new 8-table model (person,
 * login, organization, membership, subscription, guardianship,
 * supportership, consent_grant, + subscription_payers). Every query is a
 * SELECT — this script never writes.
 *
 * Usage:
 *   DATABASE_URL=... node packages/database/scripts/verify-identity-reseed.mjs [--inventory]
 *
 *   --inventory   Print the per-table row-count matrix only (safe to run
 *                 BEFORE the reseed has been applied). No pass/fail.
 *
 * Default mode prints the inventory, runs the row-level checks, then the
 * exception report (legacy states the reseed intentionally skips).
 * Exit code: 0 = all checks pass; 1 = at least one check failed (or the
 * script could not run).
 *
 * Driver: Neon HTTP for *.neon.tech URLs (dev/stg/prd), `pg` wire protocol
 * otherwise (local scratch postgres, CI container) — mirrors
 * tests/integration/api-setup.ts.
 */

const databaseUrl = process.env.DATABASE_URL;
const inventoryOnly = process.argv.includes('--inventory');

if (!databaseUrl) {
  console.error('✗ DATABASE_URL is required');
  process.exit(1);
}

function isNeonUrl(url) {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

/** Returns { query(text) -> rows, close() }. */
async function makeClient(url) {
  if (isNeonUrl(url)) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return {
      driver: 'neon-http',
      // v0.10 has no sql.query(); the conventional call sql(text) returns rows.
      query: async (text) => {
        const res = await sql(text);
        return Array.isArray(res) ? res : res.rows;
      },
      close: async () => undefined, // Neon HTTP is connectionless; nothing to close
    };
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    driver: 'pg',
    query: async (text) => (await client.query(text)).rows,
    close: async () => client.end(),
  };
}

// ---------------------------------------------------------------------------
// Inventory — row counts, runnable before or after the reseed.
// ---------------------------------------------------------------------------

const INVENTORY = [
  ['legacy', 'accounts', 'SELECT count(*)::int AS n FROM accounts'],
  ['legacy', 'profiles', 'SELECT count(*)::int AS n FROM profiles'],
  ['legacy', 'profiles (archived)', 'SELECT count(*)::int AS n FROM profiles WHERE archived_at IS NOT NULL'],
  ['legacy', 'family_links', 'SELECT count(*)::int AS n FROM family_links'],
  ['legacy', 'consent_states', 'SELECT count(*)::int AS n FROM consent_states'],
  ['legacy', 'consent_states (CONSENTED|WITHDRAWN)', "SELECT count(*)::int AS n FROM consent_states WHERE status IN ('CONSENTED','WITHDRAWN')"],
  ['legacy', 'subscriptions', 'SELECT count(*)::int AS n FROM subscriptions'],
  ['new', 'organization', 'SELECT count(*)::int AS n FROM organization'],
  ['new', 'person', 'SELECT count(*)::int AS n FROM person'],
  ['new', 'login', 'SELECT count(*)::int AS n FROM login'],
  ['new', 'membership', 'SELECT count(*)::int AS n FROM membership'],
  ['new', 'guardianship', 'SELECT count(*)::int AS n FROM guardianship'],
  ['new', 'supportership', 'SELECT count(*)::int AS n FROM supportership'],
  ['new', 'consent_grant', 'SELECT count(*)::int AS n FROM consent_grant'],
  ['new', 'subscription', 'SELECT count(*)::int AS n FROM subscription'],
  ['new', 'subscription_payers', 'SELECT count(*)::int AS n FROM subscription_payers'],
];

// ---------------------------------------------------------------------------
// Row-level checks — each SQL returns a violation count; 0 = pass.
// The expressions mirror 0109_identity_reseed.sql's mapping exactly.
// ---------------------------------------------------------------------------

const JURISDICTION_CASE = `CASE p.location::text
  WHEN 'US' THEN 'US' WHEN 'EU' THEN 'EU' WHEN 'OTHER' THEN 'ROW'
  ELSE 'UNKNOWN' END`;

const CHECKS = [
  {
    name: 'every account has its organization (id reuse)',
    sql: `SELECT count(*)::int AS n FROM accounts a
          LEFT JOIN organization o ON o.id = a.id WHERE o.id IS NULL`,
  },
  {
    name: 'organization fields converged (timezone, deletion stamps)',
    sql: `SELECT count(*)::int AS n FROM accounts a
          JOIN organization o ON o.id = a.id
          WHERE (o.timezone, o.deletion_scheduled_at, o.deletion_cancelled_at)
            IS DISTINCT FROM (a.timezone, a.deletion_scheduled_at, a.deletion_cancelled_at)`,
  },
  {
    name: 'no orphan organizations (reverse)',
    sql: `SELECT count(*)::int AS n FROM organization o
          LEFT JOIN accounts a ON a.id = o.id WHERE a.id IS NULL`,
  },
  {
    name: 'every profile has its person (id reuse)',
    sql: `SELECT count(*)::int AS n FROM profiles p
          LEFT JOIN person per ON per.id = p.id WHERE per.id IS NULL`,
  },
  {
    name: 'person fields converged (name, birth-date convention, jurisdiction, activity)',
    sql: `SELECT count(*)::int AS n FROM profiles p
          JOIN person per ON per.id = p.id
          WHERE (per.display_name, per.birth_date, per.residence_jurisdiction, per.last_activity_at)
            IS DISTINCT FROM
                (p.display_name, make_date(p.birth_year, 1, 1), ${JURISDICTION_CASE}, p.updated_at)`,
  },
  {
    name: 'no orphan persons (reverse)',
    sql: `SELECT count(*)::int AS n FROM person per
          LEFT JOIN profiles p ON p.id = per.id WHERE p.id IS NULL`,
  },
  {
    name: 'owner persons are bound to their login; non-owners have none',
    sql: `SELECT count(*)::int AS n FROM profiles p
          JOIN person per ON per.id = p.id
          WHERE per.login_id IS DISTINCT FROM
                (CASE WHEN p.is_owner THEN p.account_id END)`,
  },
  {
    name: 'every owned account has its login (id reuse, email + clerk id + person)',
    sql: `SELECT count(*)::int AS n FROM accounts a
          JOIN profiles p ON p.account_id = a.id AND p.is_owner = true
          LEFT JOIN login l ON l.id = a.id
          WHERE l.id IS NULL
             OR (l.person_id, l.clerk_user_id, l.email)
                IS DISTINCT FROM (p.id, a.clerk_user_id, a.email)`,
  },
  {
    name: 'no orphan logins (reverse)',
    sql: `SELECT count(*)::int AS n FROM login l
          LEFT JOIN accounts a ON a.id = l.id WHERE a.id IS NULL`,
  },
  {
    name: 'every profile has its membership (org + roles)',
    sql: `SELECT count(*)::int AS n FROM profiles p
          LEFT JOIN membership m ON m.id = p.id
          WHERE m.id IS NULL
             OR (m.person_id, m.organization_id, m.roles)
                IS DISTINCT FROM
                (p.id, p.account_id,
                 CASE WHEN p.is_owner THEN ARRAY['admin','learner'] ELSE ARRAY['learner'] END)`,
  },
  {
    name: 'no orphan memberships (reverse)',
    sql: `SELECT count(*)::int AS n FROM membership m
          LEFT JOIN profiles p ON p.id = m.id WHERE p.id IS NULL`,
  },
  {
    name: 'every family link has its active guardianship',
    sql: `SELECT count(*)::int AS n FROM family_links fl
          LEFT JOIN guardianship g ON g.id = fl.id
          WHERE g.id IS NULL
             OR g.revoked_at IS NOT NULL
             OR (g.guardian_person_id, g.charge_person_id)
                IS DISTINCT FROM (fl.parent_profile_id, fl.child_profile_id)`,
  },
  {
    name: 'no orphan guardianships (reverse)',
    sql: `SELECT count(*)::int AS n FROM guardianship g
          LEFT JOIN family_links fl ON fl.id = g.id WHERE fl.id IS NULL`,
  },
  {
    name: 'every consent event (CONSENTED|WITHDRAWN) has its consent_grant',
    sql: `SELECT count(*)::int AS n FROM consent_states cs
          JOIN profiles p ON p.id = cs.profile_id
          LEFT JOIN consent_grant cg ON cg.id = cs.id
          WHERE cs.status IN ('CONSENTED','WITHDRAWN')
            AND (cg.id IS NULL
             OR (cg.charge_person_id, cg.organization_id, cg.granted,
                 cg.granted_at, cg.withdrawn_at, cg.lawful_basis)
                IS DISTINCT FROM
                (cs.profile_id, p.account_id, true,
                 COALESCE(cs.responded_at, cs.requested_at),
                 CASE WHEN cs.status = 'WITHDRAWN' THEN cs.updated_at END,
                 CASE cs.consent_type::text WHEN 'COPPA' THEN 'coppa_parental_consent'
                      ELSE 'gdpr_parental_consent' END))`,
  },
  {
    name: 'no orphan consent_grants (reverse, incl. PENDING/REQUESTED leakage)',
    sql: `SELECT count(*)::int AS n FROM consent_grant cg
          LEFT JOIN consent_states cs
            ON cs.id = cg.id AND cs.status IN ('CONSENTED','WITHDRAWN')
          WHERE cs.id IS NULL`,
  },
  {
    name: 'every subscription of an owned account is re-anchored (tier/status/org/payer/periods)',
    sql: `SELECT count(*)::int AS n FROM subscriptions s
          JOIN profiles p ON p.account_id = s.account_id AND p.is_owner = true
          LEFT JOIN subscription sub ON sub.id = s.id
          WHERE sub.id IS NULL
             OR (sub.organization_id, sub.plan_tier, sub.status, sub.payer_person_id,
                 sub.period_start_at, sub.period_end_at)
                IS DISTINCT FROM
                (s.account_id, s.tier::text, s.status::text, p.id,
                 s.current_period_start, s.current_period_end)`,
  },
  {
    name: 'no orphan subscriptions (reverse)',
    sql: `SELECT count(*)::int AS n FROM subscription sub
          LEFT JOIN subscriptions s ON s.id = sub.id WHERE s.id IS NULL`,
  },
  {
    name: 'every new subscription has exactly its primary payer join row',
    sql: `SELECT count(*)::int AS n FROM subscription sub
          LEFT JOIN subscription_payers sp
            ON sp.subscription_id = sub.id AND sp.role = 'primary'
           AND sp.person_id = sub.payer_person_id
          WHERE sp.subscription_id IS NULL`,
  },
  {
    name: 'no stale/extra subscription_payers rows',
    sql: `SELECT count(*)::int AS n FROM subscription_payers sp
          LEFT JOIN subscription sub
            ON sub.id = sp.subscription_id
           AND ((sp.role = 'primary' AND sp.person_id = sub.payer_person_id)
             OR sp.role = 'secondary')
          WHERE sub.id IS NULL`,
  },
  {
    name: 'supportership is empty (no legacy source exists)',
    sql: `SELECT count(*)::int AS n FROM supportership`,
  },
];

// ---------------------------------------------------------------------------
// Exceptions — legacy states the reseed intentionally skips. Reported with
// counts; they do not fail the run but the operator must acknowledge them
// in the go/no-go evidence.
// ---------------------------------------------------------------------------

const EXCEPTIONS = [
  {
    name: 'accounts with no is_owner profile (login + subscription seeding skipped)',
    sql: `SELECT count(*)::int AS n FROM accounts a
          WHERE NOT EXISTS (
            SELECT 1 FROM profiles p WHERE p.account_id = a.id AND p.is_owner = true)`,
  },
  {
    name: 'subscriptions on ownerless accounts (not seeded — payer_person_id NOT NULL)',
    sql: `SELECT count(*)::int AS n FROM subscriptions s
          WHERE NOT EXISTS (
            SELECT 1 FROM profiles p WHERE p.account_id = s.account_id AND p.is_owner = true)`,
  },
  {
    name: 'archived profiles seeded as persons (no archived marker in the new model)',
    sql: `SELECT count(*)::int AS n FROM profiles WHERE archived_at IS NOT NULL`,
  },
  {
    name: 'PENDING/PARENTAL_CONSENT_REQUESTED consent_states (no consent event — not seeded)',
    sql: `SELECT count(*)::int AS n FROM consent_states
          WHERE status NOT IN ('CONSENTED','WITHDRAWN')`,
  },
];

// ---------------------------------------------------------------------------

const redactedHost = (() => {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return '<unparseable>';
  }
})();

const client = await makeClient(databaseUrl);
console.log(`identity-reseed ${inventoryOnly ? 'inventory' : 'verification'} — host: ${redactedHost} (driver: ${client.driver})`);

let failures = 0;
try {
  console.log('\n── Inventory (row counts) ──');
  for (const [side, label, sql] of INVENTORY) {
    const [{ n }] = await client.query(sql);
    console.log(`  ${side.padEnd(6)} ${label.padEnd(45)} ${n}`);
  }

  if (!inventoryOnly) {
    console.log('\n── Integrity checks (0 violations = pass) ──');
    for (const { name, sql } of CHECKS) {
      const [{ n }] = await client.query(sql);
      const pass = n === 0;
      if (!pass) failures++;
      console.log(`  ${pass ? '✓' : '✗'} ${name}${pass ? '' : ` — ${n} violation(s)`}`);
    }

    console.log('\n── Exceptions (intentionally skipped by the reseed; informational) ──');
    for (const { name, sql } of EXCEPTIONS) {
      const [{ n }] = await client.query(sql);
      console.log(`  ${n === 0 ? '·' : '!'} ${name}: ${n}`);
    }
  }
} finally {
  await client.close();
}

if (!inventoryOnly) {
  if (failures > 0) {
    console.error(`\n✗ ${failures} integrity check(s) FAILED`);
    process.exit(1);
  }
  console.log('\n✓ all integrity checks passed');
}
