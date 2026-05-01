// Reproduce BUG-947 against the staging DB by running the exact code path that
// POST /profiles takes for "parent adds child age 13". Bypasses auth and HTTP
// to surface the underlying exception.
//
// Strategy: pick an arbitrary parent profile that already exists on staging,
// run createProfileWithLimitCheck inside a transaction, then ROLL BACK so we
// don't leave test data behind.
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', target: 'es2022' },
});

const path = require('path');
const projectRoot = path.resolve(__dirname, '../..');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const { createDatabase } = require('@eduagent/database');
  const { createProfileWithLimitCheck } = require(
    './src/services/profile.ts'
  );

  const db = createDatabase(url);

  // Find a real owner profile to use as the parent so we exercise the
  // non-first-profile path (which is what BUG-947 tests).
  const owners = await db.execute({
    sql: `
      SELECT p.id AS profile_id, p.account_id
        FROM profiles p
        JOIN accounts a ON a.id = p.account_id
       WHERE p.is_owner = true
       LIMIT 1
    `,
  });
  const ownerRow = owners.rows ? owners.rows[0] : owners[0];
  if (!ownerRow) throw new Error('No owner profile on staging — cannot repro');
  console.log('Using parent profile:', ownerRow);

  // Generate a unique-ish display name to avoid colliding with previous repros.
  const stamp = Date.now();
  const input = {
    displayName: `BUG-947 repro ${stamp}`,
    birthYear: 2013, // age 13 — triggers GDPR consent path with parent grant
  };

  console.log('Calling createProfileWithLimitCheck with input:', input);

  try {
    const profile = await createProfileWithLimitCheck(
      db,
      ownerRow.account_id,
      input
    );
    console.log(
      'SUCCESS: profile created — should not happen if bug reproduces'
    );
    console.log(JSON.stringify(profile, null, 2));

    // Clean up: remove the profile we just created.
    const { profiles } = require('@eduagent/database');
    const { eq } = require('drizzle-orm');
    await db.delete(profiles).where(eq(profiles.id, profile.id));
    console.log('Cleaned up repro profile.');
  } catch (err) {
    console.error('REPRO TRIGGERED EXCEPTION:');
    console.error('  name:    ', err.name);
    console.error('  message: ', err.message);
    console.error('  code:    ', err.code);
    console.error('  detail:  ', err.detail);
    console.error('  cause:   ', err.cause && err.cause.message);
    console.error('  stack:   ', err.stack);
    if (err.cause) {
      console.error('  cause.name:   ', err.cause.name);
      console.error('  cause.code:   ', err.cause.code);
      console.error('  cause.detail: ', err.cause.detail);
      console.error('  cause.stack:  ', err.cause.stack);
    }
  }
}

main().catch((e) => {
  console.error('Bootstrap error:', e);
  process.exit(1);
});
