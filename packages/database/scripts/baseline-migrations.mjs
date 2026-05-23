/**
 * Baseline migration journal for push→migrate transition.
 *
 * When a database was initially set up via `drizzle-kit push` and the deploy
 * strategy later switches to `drizzle-kit migrate`, the DB has all schema
 * objects but no `__drizzle_migrations` journal. This script detects that
 * state and seeds the journal so `migrate` skips already-applied migrations.
 *
 * Safe to run repeatedly for the initial bootstrap only. Once any migration
 * journal rows exist, missing hashes are left for `drizzle-kit migrate`.
 * Otherwise a staging DB with schema drift can record a new migration as
 * applied without running its SQL.
 */

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');

const sql = neon(process.env.DATABASE_URL);

// 1. Check if the DB was set up via push (schema objects exist)
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

// 2. Ensure journal table exists in drizzle schema (matching Drizzle's own DDL)
await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at BIGINT
  )
`;

// 3. Load existing hashes to skip already-recorded entries
const existingRows = await sql`
  SELECT hash FROM drizzle."__drizzle_migrations"
`;
const existingHashes = new Set(existingRows.map((r) => r.hash));

if (existingHashes.size > 0) {
  console.log(
    `✓ Migration journal already initialized (${existingHashes.size} entries); ` +
      'leaving missing migrations for drizzle-kit migrate',
  );
  process.exit(0);
}

// 4. Empty journal on a push-created DB: seed the current baseline once.
const journal = JSON.parse(
  fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
);

let added = 0;
for (const entry of journal.entries) {
  const filePath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  if (!existingHashes.has(hash)) {
    await sql`
      INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
    console.log(`  ✓ Baselined: ${entry.tag}`);
    added++;
  }
}

if (added === 0) {
  console.log(
    `✓ Migration journal up to date (${existingHashes.size} entries)`,
  );
} else {
  console.log(
    `✓ Added ${added} missing entries (${existingHashes.size + added} total)`,
  );
}
