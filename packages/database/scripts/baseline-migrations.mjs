/**
 * Baseline migration journal for push→migrate transition.
 *
 * When a database was initially set up via `drizzle-kit push` and the deploy
 * strategy later switches to `drizzle-kit migrate`, the DB has all schema
 * objects but no `__drizzle_migrations` journal. This script detects that
 * state and seeds the journal so `migrate` skips already-applied migrations.
 *
 * Safe to run repeatedly — it no-ops when the journal already has entries.
 */

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');

const sql = neon(process.env.DATABASE_URL);

// 1. Check if the migration journal table already has entries
const [{ exists: tableExists }] = await sql`
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
  ) AS exists
`;

if (tableExists) {
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM drizzle."__drizzle_migrations"
  `;
  if (count > 0) {
    console.log(`✓ Migration journal already has ${count} entries — skipping baseline`);
    process.exit(0);
  }
}

// 2. Check if the DB was set up via push (schema objects exist but no journal)
const [{ exists: hasSchema }] = await sql`
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) AS exists
`;

if (!hasSchema) {
  console.log('✓ Fresh database — migrate will apply all migrations normally');
  process.exit(0);
}

// 3. Transition detected: tables exist but no populated journal
console.log('Detected push→migrate transition. Seeding migration journal...');

const journal = JSON.parse(
  fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
);

// Create the journal table in drizzle schema (matching Drizzle's own DDL)
await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at BIGINT
  )
`;

for (const entry of journal.entries) {
  const filePath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  await sql`
    INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${entry.when})
  `;
  console.log(`  ✓ Baselined: ${entry.tag}`);
}

console.log('✓ Migration journal seeded — future deploys will run normally');
