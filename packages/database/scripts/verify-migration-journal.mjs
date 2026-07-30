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

async function probeExists(sql, probe) {
  if (probe.kind === 'relation') {
    const qualified = `"${probe.schema}"."${probe.name}"`;
    const [{ exists }] = await sql`
      SELECT to_regclass(${qualified}) IS NOT NULL AS exists
    `;
    return exists;
  }

  if (probe.kind === 'type') {
    const qualified = `"${probe.schema}"."${probe.name}"`;
    const [{ exists }] = await sql`
      SELECT to_regtype(${qualified}) IS NOT NULL AS exists
    `;
    return exists;
  }

  if (probe.kind === 'column') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ${probe.schema}
          AND table_name = ${probe.table}
          AND column_name = ${probe.name}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'constraint') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        INNER JOIN pg_class relation
          ON relation.oid = constraint_row.conrelid
        INNER JOIN pg_namespace namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = ${probe.schema}
          AND relation.relname = ${probe.table}
          AND constraint_row.conname = ${probe.name}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'enum-value') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        INNER JOIN pg_type type_row ON type_row.oid = enum_value.enumtypid
        INNER JOIN pg_namespace namespace
          ON namespace.oid = type_row.typnamespace
        WHERE namespace.nspname = ${probe.schema}
          AND type_row.typname = ${probe.type}
          AND enum_value.enumlabel = ${probe.value}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'policy') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = ${probe.schema}
          AND tablename = ${probe.table}
          AND policyname = ${probe.name}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'column-nullability') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        INNER JOIN pg_class relation
          ON relation.oid = attribute.attrelid
        INNER JOIN pg_namespace namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = ${probe.schema}
          AND relation.relname = ${probe.table}
          AND attribute.attname = ${probe.name}
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND attribute.attnotnull = ${probe.notNull}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'row-level-security') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_class relation
        INNER JOIN pg_namespace namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = ${probe.schema}
          AND relation.relname = ${probe.table}
          AND relation.relrowsecurity = ${probe.enabled}
      ) AS exists
    `;
    return exists;
  }

  if (probe.kind === 'extension') {
    const [{ exists }] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = ${probe.name}
      ) AS exists
    `;
    return exists;
  }

  throw new Error(`Unsupported DDL probe kind: ${probe.kind}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for migration-journal verification',
    );
  }

  const sql = neon(process.env.DATABASE_URL);
  const migrations = loadCommittedMigrations();
  const appliedRows = await liveJournalRows(sql);
  const { applied, pending } = reconcileMigrationJournal({
    migrations,
    appliedRows,
  });
  const drift = [];

  for (const migration of pending) {
    const unsupported = findUnsupportedDdlStatements(migration.sql);
    if (unsupported.length > 0) {
      throw new Error(
        `Cannot safely verify pending DDL in ${migration.tag}; add catalog ` +
          `probes before deploy:\n- ${unsupported.join('\n- ')}`,
      );
    }
    for (const probe of pendingMigrationDdlProbes({
      appliedMigrations: applied,
      pendingMigration: migration,
    })) {
      if (await probeExists(sql, probe)) {
        drift.push(`${migration.tag}: ${probe.description}`);
      }
    }
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
