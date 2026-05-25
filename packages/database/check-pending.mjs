import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await pool.query(
    `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
  );
  console.log(`Applied migrations: ${rows.length}`);
  if (rows.length > 0) {
    console.log(`Last applied: ${rows.at(-1).created_at}`);
  }
  const { rows: counts } = await pool.query(
    `SELECT count(*)::int AS n FROM memory_dedup_decisions`,
  );
  console.log(`memory_dedup_decisions row count: ${counts[0].n}`);
  const { rows: hasCat } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='memory_dedup_decisions' AND column_name='category'`,
  );
  console.log(`category column present: ${hasCat.length > 0}`);
} finally {
  await pool.end();
}
