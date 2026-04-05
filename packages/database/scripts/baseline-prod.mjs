/**
 * One-off: baseline production migrations 0000-0007 only.
 *
 * Production was set up via `drizzle-kit push` (has schema objects but no
 * journal entries). This seeds the journal for already-applied migrations
 * so that `drizzle-kit migrate` only applies 0008 (language learning schema).
 *
 * Usage: DATABASE_URL=... node packages/database/scripts/baseline-prod.mjs
 */

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');

const sql = neon(process.env.DATABASE_URL);

// Only baseline through migration 0007 — let migrate apply 0008+
const MAX_IDX = 7;

const journal = JSON.parse(
  fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
);

// Check if journal table already has entries
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
    console.log(`Journal already has ${count} entries — aborting to avoid duplicates`);
    process.exit(0);
  }
}

await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at BIGINT
  )
`;

for (const entry of journal.entries) {
  if (entry.idx > MAX_IDX) break;

  const filePath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
  const content = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  await sql`
    INSERT INTO drizzle."__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${entry.when})
  `;
  console.log(`  ✓ Baselined: ${entry.tag}`);
}

console.log(`\n✓ Baselined migrations 0000-${String(MAX_IDX).padStart(4, '0')}. Run drizzle-kit migrate to apply remaining.`);
