#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import {
  findUnsupportedDdlStatements,
  pendingMigrationDdlProbes,
  reconcileMigrationJournal,
} from './verify-migration-journal-lib.mjs';
import {
  probeExists,
  probeIndicatesDrift,
} from './migration-catalog-probes.mjs';
import {
  assertCatalogInventoriesMatch,
  databaseTargetFingerprint,
  formatRepairFailure,
  parseRepairRequest,
  planExactJournalRepair,
  runCommitBoundary,
  validateReviewedDryRunReceipt,
  verifyJournalRepairApplied,
} from './repair-migration-journal-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../apps/api/drizzle');
const RECEIPT_SCHEMA = 'zdx.wi1628.staging-journal-repair.v1';

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

const CATALOG_INVENTORY_SQL = `
WITH extension_owned AS (
  SELECT classid, objid
  FROM pg_depend
  WHERE deptype = 'e'
), inventory AS (
  SELECT
    'relation:' || namespace.nspname || '.' || relation.relname AS key,
    jsonb_build_object(
      'kind', relation.relkind,
      'persistence', relation.relpersistence,
      'rowSecurity', relation.relrowsecurity,
      'forceRowSecurity', relation.relforcerowsecurity,
      'partitionKey', pg_get_partkeydef(relation.oid),
      'viewDefinition', CASE
        WHEN relation.relkind IN ('v', 'm') THEN pg_get_viewdef(relation.oid, false)
        ELSE NULL
      END
    )::text AS definition
  FROM pg_class relation
  INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    AND NOT EXISTS (
      SELECT 1 FROM extension_owned owned
      WHERE owned.classid = 'pg_class'::regclass AND owned.objid = relation.oid
    )

  UNION ALL

  SELECT
    'column:' || namespace.nspname || '.' || relation.relname || '.' || attribute.attname,
    jsonb_build_object(
      'position', attribute.attnum,
      'type', format_type(attribute.atttypid, attribute.atttypmod),
      'notNull', attribute.attnotnull,
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'default', pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    )::text
  FROM pg_attribute attribute
  INNER JOIN pg_class relation ON relation.oid = attribute.attrelid
  INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_attrdef attribute_default
    ON attribute_default.adrelid = attribute.attrelid
    AND attribute_default.adnum = attribute.attnum
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND NOT EXISTS (
      SELECT 1 FROM extension_owned owned
      WHERE owned.classid = 'pg_class'::regclass AND owned.objid = relation.oid
    )

  UNION ALL

  SELECT
    'constraint:' || namespace.nspname || '.' ||
      COALESCE(relation.relname, type_row.typname) || '.' || constraint_row.conname,
    jsonb_build_object(
      'type', constraint_row.contype,
      'definition', pg_get_constraintdef(constraint_row.oid, false),
      'deferrable', constraint_row.condeferrable,
      'deferred', constraint_row.condeferred,
      'validated', constraint_row.convalidated
    )::text
  FROM pg_constraint constraint_row
  LEFT JOIN pg_class relation ON relation.oid = constraint_row.conrelid
  LEFT JOIN pg_type type_row ON type_row.oid = constraint_row.contypid
  INNER JOIN pg_namespace namespace
    ON namespace.oid = COALESCE(relation.relnamespace, type_row.typnamespace)
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'index:' || index_namespace.nspname || '.' || index_relation.relname,
    jsonb_build_object(
      'table', table_namespace.nspname || '.' || table_relation.relname,
      'definition', pg_get_indexdef(index_relation.oid),
      'unique', index_row.indisunique,
      'primary', index_row.indisprimary,
      'valid', index_row.indisvalid,
      'ready', index_row.indisready
    )::text
  FROM pg_index index_row
  INNER JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
  INNER JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
  INNER JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid
  INNER JOIN pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
  WHERE index_namespace.nspname = 'public'

  UNION ALL

  SELECT
    'policy:' || namespace.nspname || '.' || relation.relname || '.' || policy.polname,
    jsonb_build_object(
      'permissive', policy.polpermissive,
      'command', policy.polcmd,
      'roles', ARRAY(
        SELECT role.rolname
        FROM pg_roles role
        WHERE role.oid = ANY(policy.polroles)
        ORDER BY role.rolname
      ),
      'using', pg_get_expr(policy.polqual, policy.polrelid),
      'check', pg_get_expr(policy.polwithcheck, policy.polrelid)
    )::text
  FROM pg_policy policy
  INNER JOIN pg_class relation ON relation.oid = policy.polrelid
  INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'trigger:' || namespace.nspname || '.' || relation.relname || '.' || trigger.tgname,
    pg_get_triggerdef(trigger.oid, false)
  FROM pg_trigger trigger
  INNER JOIN pg_class relation ON relation.oid = trigger.tgrelid
  INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal

  UNION ALL

  SELECT
    'function:' || namespace.nspname || '.' || procedure.proname ||
      '(' || pg_get_function_identity_arguments(procedure.oid) || ')',
    pg_get_functiondef(procedure.oid)
  FROM pg_proc procedure
  INNER JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM extension_owned owned
      WHERE owned.classid = 'pg_proc'::regclass AND owned.objid = procedure.oid
    )

  UNION ALL

  SELECT
    'type:' || namespace.nspname || '.' || type_row.typname,
    jsonb_build_object(
      'typeKind', type_row.typtype,
      'category', type_row.typcategory,
      'baseType', CASE
        WHEN type_row.typbasetype <> 0 THEN format_type(type_row.typbasetype, type_row.typtypmod)
        ELSE NULL
      END,
      'notNull', type_row.typnotnull,
      'default', type_row.typdefault
    )::text
  FROM pg_type type_row
  INNER JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
  WHERE namespace.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM extension_owned owned
      WHERE owned.classid = 'pg_type'::regclass AND owned.objid = type_row.oid
    )

  UNION ALL

  SELECT
    'enum:' || namespace.nspname || '.' || type_row.typname || '.' || enum_row.enumlabel,
    jsonb_build_object('order', enum_row.enumsortorder)::text
  FROM pg_enum enum_row
  INNER JOIN pg_type type_row ON type_row.oid = enum_row.enumtypid
  INNER JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'sequence:' || namespace.nspname || '.' || relation.relname,
    jsonb_build_object(
      'start', sequence.seqstart,
      'increment', sequence.seqincrement,
      'minimum', sequence.seqmin,
      'maximum', sequence.seqmax,
      'cache', sequence.seqcache,
      'cycle', sequence.seqcycle
    )::text
  FROM pg_sequence sequence
  INNER JOIN pg_class relation ON relation.oid = sequence.seqrelid
  INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT 'extension:' || extension.extname, '{}'::jsonb::text
  FROM pg_extension extension
)
SELECT key, definition
FROM inventory
ORDER BY key
`;

async function loadCatalogInventory(client) {
  return (await client.query(CATALOG_INVENTORY_SQL)).rows;
}

async function verifyPendingCatalog(client, plan) {
  const query = async (text, params) => (await client.query(text, params)).rows;
  const drift = [];
  const priorPendingMigrations = [];

  for (const migration of plan.pending) {
    const unsupported = findUnsupportedDdlStatements(migration.sql, {
      appliedMigrations: plan.applied,
      priorPendingMigrations,
    });
    if (unsupported.length > 0) {
      throw new Error(
        `Cannot safely verify pending DDL in ${migration.tag}:\n- ` +
          unsupported.join('\n- '),
      );
    }
    for (const probe of pendingMigrationDdlProbes({
      appliedMigrations: plan.applied,
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
      'Out-of-band DDL would collide with pending migrations:\n- ' +
        drift.join('\n- '),
    );
  }
}

function writeReceipt(receiptPath, receipt) {
  if (!receiptPath) {
    throw new Error('WI1628_RECEIPT_PATH is required');
  }
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function main() {
  const request = parseRepairRequest(process.argv.slice(2), process.env);
  const receiptPath = process.env.WI1628_RECEIPT_PATH;
  const migrations = loadCommittedMigrations();
  if (request.mode === 'apply') {
    let reviewedReceipt;
    try {
      reviewedReceipt = JSON.parse(
        fs.readFileSync(request.reviewedDryRunReceiptPath, 'utf8'),
      );
    } catch (error) {
      throw new Error(
        'Cannot read the reviewed dry-run receipt: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
    validateReviewedDryRunReceipt({
      receipt: reviewedReceipt,
      reviewedDryRunId: request.reviewedDryRunId,
      currentHeadSha: process.env.GITHUB_SHA,
      databaseUrl: request.databaseUrl,
    });
  }
  const staging = new pg.Client({ connectionString: request.databaseUrl });
  const baseline = new pg.Client({
    connectionString: request.baselineDatabaseUrl,
  });
  let transactionOpen = false;

  await Promise.all([staging.connect(), baseline.connect()]);
  try {
    const capability = (
      await staging.query(`
        SELECT
          current_user,
          current_setting('transaction_read_only') AS transaction_read_only,
          has_schema_privilege(current_user, 'drizzle', 'USAGE') AS schema_usage,
          has_table_privilege(
            current_user,
            'drizzle.__drizzle_migrations',
            'SELECT'
          ) AS can_select,
          has_table_privilege(
            current_user,
            'drizzle.__drizzle_migrations',
            'DELETE'
          ) AS can_delete
      `)
    ).rows[0];
    if (!capability.schema_usage || !capability.can_select) {
      throw new Error('Staging credential cannot read the Drizzle journal');
    }
    if (
      request.mode === 'apply' &&
      (capability.transaction_read_only !== 'off' || !capability.can_delete)
    ) {
      throw new Error(
        'Staging credential cannot perform the exact journal delete',
      );
    }

    await staging.query(
      request.mode === 'apply'
        ? 'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE'
        : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    transactionOpen = true;
    await staging.query("SET LOCAL statement_timeout = '60s'");
    if (request.mode === 'apply') {
      await staging.query("SET LOCAL lock_timeout = '10s'");
      await staging.query(
        'LOCK TABLE drizzle."__drizzle_migrations" IN ACCESS EXCLUSIVE MODE',
      );
    }

    const journalShape = (
      await staging.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'drizzle'
          AND table_name = '__drizzle_migrations'
        ORDER BY ordinal_position
      `)
    ).rows.map((row) => row.column_name);
    if (journalShape.join(',') !== 'id,hash,created_at') {
      throw new Error(
        `Unexpected Drizzle journal shape: ${journalShape.join(',')}`,
      );
    }

    const appliedRows = (
      await staging.query(`
        SELECT id, hash, created_at
        FROM drizzle."__drizzle_migrations"
        ORDER BY created_at, id
      `)
    ).rows;
    const plan =
      request.mode === 'verify-applied'
        ? verifyJournalRepairApplied({ migrations, appliedRows })
        : planExactJournalRepair({ migrations, appliedRows });
    const [baselineInventory, stagingInventory] = await Promise.all([
      loadCatalogInventory(baseline),
      loadCatalogInventory(staging),
    ]);
    assertCatalogInventoriesMatch({
      baseline: baselineInventory,
      staging: stagingInventory,
    });
    await verifyPendingCatalog(staging, plan);

    if (request.mode === 'verify-applied') {
      const receipt = {
        schema: RECEIPT_SCHEMA,
        mode: request.mode,
        status: 'committed-readback-verified',
        databaseRole: capability.current_user,
        journalRowsAfter: appliedRows.length,
        appliedMigrationsAfterRepair: plan.applied.length,
        pendingMigrationsAfterRepair: plan.pending.map(
          (migration) => migration.tag,
        ),
        catalogObjectsCompared: baselineInventory.length,
      };
      writeReceipt(receiptPath, receipt);
      await staging.query('ROLLBACK');
      transactionOpen = false;
      console.log(
        `WI-1628 committed repair verified: rows 136/137 absent; ` +
          `${plan.applied.length} migrations applied and ` +
          `${plan.pending.length} pending.`,
      );
      return;
    }

    const receipt = {
      schema: RECEIPT_SCHEMA,
      mode: request.mode,
      status: 'preflight-passed',
      databaseRole: capability.current_user,
      journalRowsBefore: appliedRows.length,
      exactRows: plan.deleteRows,
      appliedMigrationsAfterRepair: plan.applied.length,
      pendingMigrationsAfterRepair: plan.pending.map(
        (migration) => migration.tag,
      ),
      catalogObjectsCompared: baselineInventory.length,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      headSha: process.env.GITHUB_SHA ?? null,
      targetFingerprint: databaseTargetFingerprint(request.databaseUrl),
      reviewedDryRunRunId: request.reviewedDryRunId ?? null,
      unrecoveredEffectsResidual:
        'The SQL bodies for journal rows 136/137 were not retained in Git ' +
        'or local worktrees. The bounded catalog comparison cannot exclude ' +
        'historical DML, grants/default privileges, role changes, comments, ' +
        'non-public-schema effects, or provider metadata changes.',
      unrecoveredEffectsAccepted: request.mode === 'apply',
    };
    writeReceipt(receiptPath, receipt);

    if (request.mode === 'dry-run') {
      await staging.query('ROLLBACK');
      transactionOpen = false;
      console.log(
        `WI-1628 dry-run passed: exact rows 136/137; ` +
          `${baselineInventory.length} bounded catalog objects match migration 0166; ` +
          `${plan.pending.length} migration pending.`,
      );
      return;
    }

    const deleted = await staging.query(
      `DELETE FROM drizzle."__drizzle_migrations"
       WHERE
         (id = $1::integer AND hash = $2 AND created_at = $3::bigint)
         OR
         (id = $4::integer AND hash = $5 AND created_at = $6::bigint)
       RETURNING id, hash, created_at`,
      [
        plan.deleteRows[0].id,
        plan.deleteRows[0].hash,
        plan.deleteRows[0].created_at,
        plan.deleteRows[1].id,
        plan.deleteRows[1].hash,
        plan.deleteRows[1].created_at,
      ],
    );
    if (deleted.rowCount !== 2) {
      throw new Error(
        `Exact delete affected ${deleted.rowCount} rows, expected 2`,
      );
    }

    const remainingRows = (
      await staging.query(`
        SELECT id, hash, created_at
        FROM drizzle."__drizzle_migrations"
        ORDER BY created_at, id
      `)
    ).rows;
    const after = reconcileMigrationJournal({
      migrations,
      appliedRows: remainingRows,
    });
    if (
      after.applied.length !== plan.applied.length ||
      after.pending.length !== plan.pending.length
    ) {
      throw new Error('Post-delete migration plan changed unexpectedly');
    }

    const confirmed = await runCommitBoundary({
      commit: () => staging.query('COMMIT'),
      onCommitConfirmed: () => {
        transactionOpen = false;
      },
      afterCommit: async () => {
        const committedRows = (
          await staging.query(`
            SELECT id, hash, created_at
            FROM drizzle."__drizzle_migrations"
            ORDER BY created_at, id
          `)
        ).rows;
        const readback = verifyJournalRepairApplied({
          migrations,
          appliedRows: committedRows,
        });
        writeReceipt(receiptPath, {
          ...receipt,
          status: 'committed-readback-verified',
          journalRowsAfter: committedRows.length,
          deletedRows: deleted.rows,
        });
        return readback;
      },
    });
    console.log(
      `WI-1628 repair committed: deleted exact rows 136/137; ` +
        `readback verified ${confirmed.applied.length} migrations applied and ` +
        `${confirmed.pending.length} pending.`,
    );
  } catch (error) {
    if (transactionOpen) {
      await staging.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    await Promise.allSettled([staging.end(), baseline.end()]);
  }
}

try {
  await main();
} catch (error) {
  console.error(formatRepairFailure(error));
  process.exitCode = 1;
}
