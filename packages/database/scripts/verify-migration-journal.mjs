#!/usr/bin/env node

/**
 * Read-only deploy preflight for WI-1628.
 *
 * Compares the live Drizzle ledger with the committed migration chain, then
 * probes PostgreSQL catalogs for DDL effects belonging to pending migrations.
 * If a pending migration's effect already exists, the schema was changed
 * without the matching ledger row and migrate would collide.
 */

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findUnsupportedDdlStatements,
  pendingMigrationDdlProbes,
  reconcileMigrationJournal,
} from './verify-migration-journal-lib.mjs';
import {
  probeExists,
  probeIndicatesDrift,
} from './migration-catalog-probes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');

function loadCommittedMigrations() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  );

  return journal.entries.map((entry) => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
      'utf8',
    );
    return {
      ...entry,
      sql,
      hash: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });
}

async function liveJournalRows(sql) {
  const [{ exists }] = await sql`
    SELECT to_regclass('drizzle."__drizzle_migrations"') IS NOT NULL AS exists
  `;
  if (!exists) {
    return [];
  }
  return sql`
    SELECT hash, created_at
    FROM drizzle."__drizzle_migrations"
    ORDER BY created_at, id
  `;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for migration-journal verification',
    );
  }

  const sql = neon(process.env.DATABASE_URL);
  const query = (text, params) => sql(text, params);
  const migrations = loadCommittedMigrations();
  const appliedRows = await liveJournalRows(sql);
  const { applied, pending } = reconcileMigrationJournal({
    migrations,
    appliedRows,
  });
  const drift = [];
  const priorPendingMigrations = [];

  for (const migration of pending) {
    const unsupported = findUnsupportedDdlStatements(migration.sql, {
      appliedMigrations: applied,
      priorPendingMigrations,
    });
    if (unsupported.length > 0) {
      throw new Error(
        `Cannot safely verify pending DDL in ${migration.tag}; add catalog ` +
          `probes before deploy:\n- ${unsupported.join('\n- ')}`,
      );
    }
    for (const probe of pendingMigrationDdlProbes({
      appliedMigrations: applied,
      priorPendingMigrations,
      pendingMigration: migration,
    })) {
      const exists = await probeExists(query, probe);
      if (probeIndicatesDrift(probe, exists)) {
        drift.push(`${migration.tag}: ${probe.description}`);
      }
    }
    priorPendingMigrations.push(migration);
  }

  if (drift.length > 0) {
    throw new Error(
      'Out-of-band DDL detected: live schema effects exist without matching ' +
        `Drizzle journal rows:\n- ${drift.join('\n- ')}`,
    );
  }

  console.log(
    `✓ Migration journal preflight: ${appliedRows.length} applied, ` +
      `${pending.length} pending, no out-of-band DDL effects`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
