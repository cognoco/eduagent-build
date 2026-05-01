// One-off staging schema introspection.
const { neonConfig, Pool } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = require('ws');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url });

  const tables = [
    'profiles',
    'consent_states',
    'family_links',
    'subscriptions',
    'quota_pools',
    'accounts',
  ];
  for (const table of tables) {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [table]
    );
    console.log(`\n=== ${table} (${rows.length} columns) ===`);
    for (const r of rows) {
      console.log(
        `  ${r.column_name.padEnd(30)} ${r.data_type.padEnd(28)} nullable=${r.is_nullable.padEnd(3)} default=${r.column_default ?? 'NULL'}`
      );
    }
  }

  // Check for FK and CHECK constraints on profiles
  console.log('\n=== profiles constraints ===');
  const { rows: cs } = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
     ORDER BY contype, conname`);
  for (const r of cs) console.log(`  ${r.conname}: ${r.def}`);

  // Triggers/Policies on profiles
  console.log('\n=== profiles triggers ===');
  const { rows: trg } = await pool.query(`
    SELECT tgname, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND NOT tgisinternal`);
  for (const r of trg) console.log(`  ${r.tgname}: ${r.def}`);

  console.log('\n=== profiles RLS policies ===');
  const { rows: pol } = await pool.query(
    `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'`
  );
  for (const r of pol)
    console.log(
      `  ${r.policyname} (${r.cmd}) qual=${r.qual} check=${r.with_check}`
    );

  console.log('\n=== profiles row count ===');
  const { rows: cnt } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM public.profiles`
  );
  console.log(`  total=${cnt[0].n}`);

  console.log('\n=== consent_states unique constraints ===');
  const { rows: u } = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
     WHERE conrelid = 'public.consent_states'::regclass AND contype IN ('u','p')`);
  for (const r of u) console.log(`  ${r.conname}: ${r.pg_get_constraintdef}`);

  console.log('\n=== family_links unique constraints ===');
  const { rows: fu } = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
     WHERE conrelid = 'public.family_links'::regclass AND contype IN ('u','p','c')`);
  for (const r of fu) console.log(`  ${r.conname}: ${r.pg_get_constraintdef}`);

  await pool.end();
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
