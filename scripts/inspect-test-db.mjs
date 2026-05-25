import { Pool } from 'pg';
import { readFileSync } from 'fs';

const envPath = 'C:/Dev/Projects/Products/Apps/eduagent-build/.env.development.local';
const env = readFileSync(envPath, 'utf8');
const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
const url = line.slice('DATABASE_URL='.length).replace(/^['"]|['"]$/g, '');

const p = new Pool({ connectionString: url });

const journal = await p.query(
  "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
);
console.log('journal entries:', journal.rows.length);

const tables = await p.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('memory_facts','curriculum_books','learning_sessions') ORDER BY table_name",
);
console.log('tables present:', tables.rows.map((r) => r.table_name));

const cols = await p.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name='curriculum_books' AND column_name IN ('retry_in_flight','retry_in_flight_at')",
);
console.log('curriculum_books retry cols:', cols.rows.map((r) => r.column_name));

const enumTypes = await p.query(
  "SELECT typname FROM pg_type WHERE typname ILIKE '%filing%'",
);
console.log('filing-related enum types:', enumTypes.rows.map((r) => r.typname));

for (const row of enumTypes.rows) {
  const labels = await p.query(
    `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = $1) ORDER BY enumsortorder`,
    [row.typname],
  );
  console.log(`  ${row.typname}:`, labels.rows.map((r) => r.enumlabel));
}

await p.end();
