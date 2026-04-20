// Temporary DB inspection script — lists accounts + profiles on staging.
// Run via: doppler run --project mentomate --config stg -- node scripts/list-users.mjs
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

const cols = await client.query(`
  SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts' ORDER BY ordinal_position
`);
console.log('accounts columns:', cols.rows.map(r => r.column_name).join(', '));

const accounts = await client.query(`
  SELECT
    a.id AS account_id,
    a.clerk_user_id,
    a.email,
    a.created_at,
    COUNT(DISTINCT p.id) AS profile_count
  FROM accounts a
  LEFT JOIN profiles p ON p.account_id = a.id
  GROUP BY a.id, a.clerk_user_id, a.email, a.created_at
  ORDER BY a.created_at DESC
`);

console.log(`\n=== ACCOUNTS (${accounts.rows.length}) ===`);
for (const r of accounts.rows) {
  console.log(`- ${r.email}  profiles=${r.profile_count}  clerk=${r.clerk_user_id?.slice(0, 30) ?? 'null'}  id=${r.account_id}  created=${r.created_at.toISOString().slice(0, 10)}`);
}

const profiles = await client.query(`
  SELECT
    p.id AS profile_id,
    p.account_id,
    a.email AS owner_email,
    p.display_name,
    p.birth_year,
    p.is_owner,
    p.created_at
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  ORDER BY a.email, p.is_owner DESC, p.created_at
`);

console.log(`\n=== PROFILES (${profiles.rows.length}) — filtering to real (non-integ-test) accounts ===`);
const profilesFiltered = profiles.rows.filter(r => !r.owner_email.includes('integ-sess-'));
console.log(`(${profilesFiltered.length} real-account profiles)`);
profiles.rows = profilesFiltered;
let currentOwner = '';
for (const r of profiles.rows) {
  if (r.owner_email !== currentOwner) {
    currentOwner = r.owner_email;
    console.log(`\n  Owner: ${currentOwner}`);
  }
  const role = r.is_owner ? 'OWNER' : 'child';
  const age = r.birth_year ? `age ~${2026 - r.birth_year}` : 'no-birth-year';
  console.log(`    [${role}] ${r.display_name}  ${age}  id=${r.profile_id}`);
}

const familyLinks = await client.query(`
  SELECT
    fl.id,
    fl.parent_profile_id,
    fl.child_profile_id,
    fl.role,
    fl.status,
    pp.display_name AS parent_name,
    cp.display_name AS child_name
  FROM family_links fl
  LEFT JOIN profiles pp ON pp.id = fl.parent_profile_id
  LEFT JOIN profiles cp ON cp.id = fl.child_profile_id
  ORDER BY fl.created_at DESC
`);

console.log(`\n=== FAMILY LINKS (${familyLinks.rows.length}) ===`);
for (const r of familyLinks.rows) {
  console.log(`- ${r.parent_name} --[${r.role} / ${r.status}]--> ${r.child_name}`);
}

await client.end();
