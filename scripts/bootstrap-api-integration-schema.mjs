#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

const { Client } = pg;

const WORK_ITEM = 'WI-2939';
const MARKER_SCHEMA = 'zdx_integration_bootstrap';
const MARKER_TABLE = `${MARKER_SCHEMA}.schema_state`;
const PROTECTED_LABEL =
  /(^|[._-])(dev|development|stg|staging|prd|prod|production)([._-]|$)/i;
const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/i;

class BootstrapRefusal extends Error {}

function refuse(reason) {
  throw new BootstrapRefusal(
    `Disposable API integration schema bootstrap refused: ${reason}`,
  );
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    refuse(`${name} is required.`);
  }
  return value;
}

function normalizedHost(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/:\d+$/, '');
  }
}

function endpointFingerprint(host, databaseName) {
  return createHash('sha256')
    .update(host)
    .update('\0')
    .update(databaseName)
    .digest('hex');
}

export function redactDatabaseOutput(output, env) {
  let redacted = String(output ?? '');
  const exactValues = [
    env.DATABASE_URL,
    env.INTEGRATION_DATABASE_HOST,
    env.INTEGRATION_DATABASE_NAME,
  ]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const value of exactValues) {
    redacted = redacted.split(value).join('[REDACTED]');
  }
  redacted = redacted
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]');
  return redacted;
}

/**
 * Validate only operator-supplied identity metadata. It deliberately performs
 * no connection and never includes the URL or credentials in an error.
 */
export function validateDisposableApiIntegrationTarget(env) {
  if (requiredEnv(env, 'DOPPLER_PROJECT') !== 'mentomate') {
    refuse('DOPPLER_PROJECT must be mentomate.');
  }
  if (requiredEnv(env, 'DOPPLER_CONFIG') !== 'dev_integration') {
    refuse('DOPPLER_CONFIG must be dev_integration.');
  }
  if (requiredEnv(env, 'DOPPLER_ENVIRONMENT') !== 'dev') {
    refuse('DOPPLER_ENVIRONMENT must be dev.');
  }
  if (requiredEnv(env, 'INTEGRATION_DATABASE_DISPOSABLE') !== 'true') {
    refuse('INTEGRATION_DATABASE_DISPOSABLE=true is required.');
  }

  const databaseUrl = requiredEnv(env, 'DATABASE_URL');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    refuse('DATABASE_URL is not a parseable URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    refuse('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  const host = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!host || !databaseName) {
    refuse('DATABASE_URL must identify a host and database name.');
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    refuse('this path is only for the dedicated remote disposable target.');
  }

  const expectedHost = requiredEnv(
    env,
    'INTEGRATION_DATABASE_HOST',
  ).toLowerCase();
  const expectedName = requiredEnv(env, 'INTEGRATION_DATABASE_NAME');
  if (host !== expectedHost) {
    refuse('DATABASE_URL does not match INTEGRATION_DATABASE_HOST.');
  }
  if (databaseName !== expectedName) {
    refuse('DATABASE_URL does not match INTEGRATION_DATABASE_NAME.');
  }

  const targetId = requiredEnv(env, 'INTEGRATION_DATABASE_TARGET_ID');
  if (!TARGET_ID_PATTERN.test(targetId)) {
    refuse(
      'INTEGRATION_DATABASE_TARGET_ID must be a unique 8-64 character lowercase identifier.',
    );
  }
  if (!databaseName.toLowerCase().includes(targetId.toLowerCase())) {
    refuse('database name must contain the unique integration target id.');
  }

  if (PROTECTED_LABEL.test(host) || PROTECTED_LABEL.test(databaseName)) {
    refuse('endpoint identity contains a protected environment label.');
  }

  for (const [environment, key] of [
    ['development', 'DATABASE_URL_DEVELOPMENT_HOST'],
    ['staging', 'DATABASE_URL_STAGING_HOST'],
    ['production', 'DATABASE_URL_PRODUCTION_HOST'],
  ]) {
    const protectedHost = normalizedHost(requiredEnv(env, key));
    if (host === protectedHost) {
      refuse(`endpoint matches the protected ${environment} database.`);
    }
  }

  return {
    databaseUrl,
    host,
    databaseName,
    targetId,
    endpointFingerprint: endpointFingerprint(host, databaseName),
  };
}

function assertOptions(options) {
  if (!REVISION_PATTERN.test(options.revision ?? '')) {
    refuse('--revision must be an exact 40-character commit SHA.');
  }
  if (
    typeof options.operatorRuling !== 'string' ||
    options.operatorRuling.trim().length < 8 ||
    /[\r\n\0]/.test(options.operatorRuling)
  ) {
    refuse(
      '--operator-ruling must be a non-empty, single-line ruling reference.',
    );
  }
}

function cleanupRequired(reason) {
  refuse(
    `${reason} Destroy and recreate only this disposable target before retrying; ` +
      'do not repair, migrate, or copy data into it.',
  );
}

async function writeReceipt(receiptPath, receipt) {
  if (!receiptPath) {
    return;
  }
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Orchestrate the guarded bootstrap. Dependencies are explicit so the
 * mutation-sensitive tests exercise the real state machine without touching a
 * database or invoking Drizzle.
 */
export async function bootstrapDisposableApiIntegrationSchema(options, deps) {
  assertOptions(options);
  const target = validateDisposableApiIntegrationTarget(deps.env);
  const startedAt = deps.now().toISOString();

  const headRevision = await deps.resolveHeadRevision();
  if (headRevision.toLowerCase() !== options.revision.toLowerCase()) {
    refuse(
      `requested revision does not match the checked-out revision (${headRevision.slice(0, 12)}).`,
    );
  }
  if (!(await deps.schemaSourcesAreClean())) {
    refuse('uncommitted schema or bootstrap sources are present.');
  }

  let action;
  let schemaFingerprint;
  try {
    const { relations, marker } = await deps.store.inspect();

    if (marker) {
      if (
        marker.targetId !== target.targetId ||
        marker.revision.toLowerCase() !== options.revision.toLowerCase() ||
        marker.state !== 'ready' ||
        !marker.fingerprint
      ) {
        cleanupRequired(
          'The bootstrap marker belongs to another revision/target or records an interrupted run.',
        );
      }

      schemaFingerprint = await deps.store.fingerprint();
      if (schemaFingerprint !== marker.fingerprint) {
        cleanupRequired(
          'The live schema fingerprint does not match the revision-pinned bootstrap marker.',
        );
      }
      if (relations.length === 0) {
        cleanupRequired(
          'The bootstrap marker says ready but the public schema is empty.',
        );
      }
      action = 'already-compatible';
    } else {
      if (relations.length > 0) {
        refuse(
          'the target is non-empty and has no trusted bootstrap marker; incompatible schema is never mutated.',
        );
      }

      await deps.store.createApplyingMarker({
        targetId: target.targetId,
        revision: options.revision.toLowerCase(),
        operatorRuling: options.operatorRuling.trim(),
        startedAt,
      });

      try {
        await deps.runSchemaPush({
          command: 'corepack',
          args: ['pnpm', '--filter', '@eduagent/database', 'run', 'db:push'],
          env: {
            ...deps.env,
            INTEGRATION_SCHEMA_BOOTSTRAP: WORK_ITEM,
          },
        });
      } catch {
        try {
          await deps.store.markFailed({
            targetId: target.targetId,
            revision: options.revision.toLowerCase(),
          });
        } catch {
          // The primary failure remains the push. A missing failed marker only
          // strengthens the mandatory destroy/recreate recovery path.
        }
        cleanupRequired('The schema push did not complete.');
      }

      schemaFingerprint = await deps.store.fingerprint();
      await deps.store.markReady({
        targetId: target.targetId,
        revision: options.revision.toLowerCase(),
        fingerprint: schemaFingerprint,
        readyAt: deps.now().toISOString(),
      });
      action = 'bootstrapped';
    }

    const receipt = {
      schema: 'zdx.disposable-schema-bootstrap.v1',
      workItem: WORK_ITEM,
      targetId: target.targetId,
      endpointFingerprint: target.endpointFingerprint,
      revision: options.revision.toLowerCase(),
      operatorRuling: options.operatorRuling.trim(),
      action,
      schemaFingerprint,
      startedAt,
      completedAt: deps.now().toISOString(),
      cleanup:
        'Destroy the disposable target identified by endpointFingerprint; ' +
        'never migrate, repair, or copy data into shared development, staging, or production.',
    };
    await writeReceipt(options.receiptPath, receipt);
    return receipt;
  } finally {
    await deps.store.close();
  }
}

function fingerprintRows(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

class PgBootstrapStore {
  constructor(databaseUrl, targetId) {
    this.client = new Client({
      connectionString: databaseUrl,
      application_name: 'wi2939-disposable-schema-bootstrap',
    });
    this.targetId = targetId;
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async inspect() {
    await this.connect();
    const relations = await this.client.query(`
      SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY n.nspname, c.relname, c.relkind
    `);
    const markerExists = await this.client.query(
      `SELECT to_regnamespace($1) AS marker_schema, to_regclass($2) AS marker`,
      [MARKER_SCHEMA, MARKER_TABLE],
    );
    if (markerExists.rows[0]?.marker_schema && !markerExists.rows[0]?.marker) {
      cleanupRequired(
        'The bootstrap marker schema exists without its expected marker table.',
      );
    }
    if (!markerExists.rows[0]?.marker) {
      return { relations: relations.rows, marker: null };
    }

    let markerRows;
    try {
      markerRows = await this.client.query(`
        SELECT
          target_id AS "targetId",
          repo_revision AS revision,
          schema_fingerprint AS fingerprint,
          state
        FROM ${MARKER_TABLE}
        ORDER BY target_id
      `);
    } catch {
      cleanupRequired('The bootstrap marker table has an incompatible shape.');
    }
    if (markerRows.rows.length !== 1) {
      cleanupRequired(
        'The bootstrap marker table does not contain exactly one target record.',
      );
    }
    return { relations: relations.rows, marker: markerRows.rows[0] };
  }

  async createApplyingMarker(input) {
    await this.connect();
    await this.client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await this.client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${WORK_ITEM}:${input.targetId}`],
      );
      const relationCheck = await this.client.query(`
        SELECT count(*)::integer AS count
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      `);
      if (relationCheck.rows[0]?.count !== 0) {
        refuse(
          'the public schema changed after preflight; no bootstrap mutation was applied.',
        );
      }

      await this.client.query(`CREATE SCHEMA ${MARKER_SCHEMA}`);
      await this.client.query(`
        CREATE TABLE ${MARKER_TABLE} (
          target_id text PRIMARY KEY,
          repo_revision char(40) NOT NULL,
          schema_fingerprint text,
          state text NOT NULL CHECK (state IN ('applying', 'ready', 'failed')),
          operator_ruling text NOT NULL,
          started_at timestamptz NOT NULL,
          ready_at timestamptz
        )
      `);
      await this.client.query(
        `
          INSERT INTO ${MARKER_TABLE}
            (target_id, repo_revision, state, operator_ruling, started_at)
          VALUES ($1, $2, 'applying', $3, $4)
        `,
        [input.targetId, input.revision, input.operatorRuling, input.startedAt],
      );
      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  async fingerprint() {
    await this.connect();
    const result = await this.client.query(`
      WITH schema_facts AS (
        SELECT
          'column' AS kind,
          concat_ws(
            '|',
            table_schema,
            table_name,
            ordinal_position::text,
            column_name,
            data_type,
            udt_schema,
            udt_name,
            is_nullable,
            coalesce(column_default, '')
          ) AS definition
        FROM information_schema.columns
        WHERE table_schema = 'public'

        UNION ALL

        SELECT
          'constraint',
          concat_ws(
            '|',
            n.nspname,
            c.relname,
            con.conname,
            con.contype,
            pg_get_constraintdef(con.oid, true)
          )
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'

        UNION ALL

        SELECT
          'index',
          concat_ws('|', schemaname, tablename, indexname, indexdef)
        FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'

        UNION ALL

        SELECT
          'enum',
          concat_ws(
            '|',
            n.nspname,
            t.typname,
            e.enumsortorder::text,
            e.enumlabel
          )
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'public'

        UNION ALL

        SELECT
          'policy',
          concat_ws(
            '|',
            schemaname,
            tablename,
            policyname,
            permissive,
            roles::text,
            cmd,
            coalesce(qual, ''),
            coalesce(with_check, '')
          )
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'

        UNION ALL

        SELECT
          'trigger',
          concat_ws(
            '|',
            n.nspname,
            c.relname,
            t.tgname,
            pg_get_triggerdef(t.oid, true)
          )
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
      )
      SELECT kind, definition
      FROM schema_facts
      ORDER BY kind, definition
    `);
    return fingerprintRows(result.rows);
  }

  async markReady(input) {
    const result = await this.client.query(
      `
        UPDATE ${MARKER_TABLE}
        SET schema_fingerprint = $3, state = 'ready', ready_at = $4
        WHERE target_id = $1
          AND repo_revision = $2
          AND state = 'applying'
      `,
      [input.targetId, input.revision, input.fingerprint, input.readyAt],
    );
    if (result.rowCount !== 1) {
      cleanupRequired('The applying marker changed before completion.');
    }
  }

  async markFailed(input) {
    await this.client.query(
      `
        UPDATE ${MARKER_TABLE}
        SET state = 'failed'
        WHERE target_id = $1
          AND repo_revision = $2
          AND state = 'applying'
      `,
      [input.targetId, input.revision],
    );
  }

  async close() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  }).trim();
}

function defaultDependencies(env, target) {
  return {
    env,
    store: new PgBootstrapStore(target.databaseUrl, target.targetId),
    now: () => new Date(),
    resolveHeadRevision: async () => gitOutput(['rev-parse', 'HEAD']),
    schemaSourcesAreClean: async () =>
      gitOutput([
        'status',
        '--porcelain',
        '--untracked-files=no',
        '--',
        'packages/database/src/schema',
        'packages/database/drizzle.config.ts',
        'packages/database/scripts/check-db-push-target.mjs',
        'package.json',
        'scripts/bootstrap-api-integration-schema.mjs',
      ]) === '',
    runSchemaPush: async ({ command, args, env: childEnv }) => {
      const result = spawnSync(command, args, {
        cwd: resolve(import.meta.dirname, '..'),
        env: childEnv,
        encoding: 'utf8',
      });
      const safeStdout = redactDatabaseOutput(result.stdout, childEnv);
      const safeStderr = redactDatabaseOutput(result.stderr, childEnv);
      if (safeStdout) process.stdout.write(safeStdout);
      if (safeStderr) process.stderr.write(safeStderr);
      if (result.error || result.status !== 0) {
        throw new Error(
          `schema push exited ${result.status ?? 'without status'}`,
        );
      }
    },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !value ||
      !['--revision', '--operator-ruling', '--receipt'].includes(flag)
    ) {
      refuse(
        'expected --revision <sha> --operator-ruling <ref> --receipt <path>; unknown or missing argument.',
      );
    }
    if (flag === '--revision') options.revision = value;
    if (flag === '--operator-ruling') options.operatorRuling = value;
    if (flag === '--receipt') options.receiptPath = value;
  }
  if (!options.receiptPath) {
    refuse(
      '--receipt is required for durable cleanup and completion evidence.',
    );
  }
  return options;
}

function assertReceiptPath(receiptPath) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const allowedRoot = resolve(repoRoot, '.workitem-artifacts', WORK_ITEM);
  const absolute = resolve(repoRoot, receiptPath);
  const fromAllowed = relative(allowedRoot, absolute);
  if (
    fromAllowed === '' ||
    fromAllowed.startsWith('..') ||
    fromAllowed.startsWith('/')
  ) {
    refuse(`--receipt must be a file below .workitem-artifacts/${WORK_ITEM}/.`);
  }
  return absolute;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.receiptPath = assertReceiptPath(options.receiptPath);
  const target = validateDisposableApiIntegrationTarget(process.env);
  const receipt = await bootstrapDisposableApiIntegrationSchema(
    options,
    defaultDependencies(process.env, target),
  );
  console.log(
    JSON.stringify({
      workItem: receipt.workItem,
      targetId: receipt.targetId,
      endpointFingerprint: receipt.endpointFingerprint,
      revision: receipt.revision,
      action: receipt.action,
      receipt: relative(
        resolve(import.meta.dirname, '..'),
        options.receiptPath,
      ),
    }),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(
      error instanceof BootstrapRefusal
        ? error.message
        : 'Disposable API integration schema bootstrap failed; connection details were withheld.',
    );
    process.exitCode = 1;
  });
}
