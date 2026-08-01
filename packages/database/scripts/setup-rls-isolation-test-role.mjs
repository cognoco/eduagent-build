#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import pg from 'pg';

const { Client } = pg;

export const RLS_TEST_ROLE = 'rls_isolation_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export class RlsRoleSetupRefusal extends Error {
  constructor(message) {
    super(`[rls-role-setup] REFUSED: ${message}`);
    this.name = 'RlsRoleSetupRefusal';
  }
}

function refuse(message) {
  throw new RlsRoleSetupRefusal(message);
}

export function parseTarget(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    refuse('DATABASE_URL must be a parseable PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    refuse('DATABASE_URL must use the postgres or postgresql protocol.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!parsed.hostname || !databaseName) {
    refuse('DATABASE_URL must identify both a host and database name.');
  }
  return {
    databaseUrl,
    databaseName,
    host: parsed.hostname.toLowerCase(),
    isLocal: LOCAL_HOSTS.has(parsed.hostname.toLowerCase()),
  };
}

function assertSafeRoleAttributes(state) {
  if (!state.roleExists) return;
  if (
    state.canLogin ||
    state.isSuperuser ||
    state.canCreateDatabase ||
    state.canCreateRole ||
    state.canReplicate ||
    state.canBypassRls
  ) {
    refuse(`${RLS_TEST_ROLE} has unsafe role attributes.`);
  }
}

function assertRoleContract(state) {
  if (!state.roleExists) {
    refuse(`${RLS_TEST_ROLE} does not exist.`);
  }
  assertSafeRoleAttributes(state);
  if (!state.canSetRole) {
    refuse(
      `current_user lacks SET membership in ${RLS_TEST_ROLE}; ` +
        'use the operator-owned setup action in docs/runbooks/rls-isolation-test-role.md.',
    );
  }
  if (
    !state.hasSchemaUsage ||
    !state.hasConceptsSelect ||
    !state.hasConceptsInsert ||
    !state.hasMasterySelect ||
    !state.hasMasteryInsert
  ) {
    refuse(`${RLS_TEST_ROLE} is missing one or more required grants.`);
  }
}

export async function ensureRlsIsolationTestRole(options, store) {
  const target = parseTarget(options.databaseUrl);
  if (options.applyLocal && !target.isLocal) {
    refuse('--apply-local may mutate only localhost/127.0.0.1/::1 targets.');
  }

  let state = await store.inspect();
  assertSafeRoleAttributes(state);
  if (options.applyLocal && !state.ready) {
    await store.applyLocal();
    state = await store.inspect();
  }
  assertRoleContract(state);

  return {
    role: RLS_TEST_ROLE,
    databaseName: target.databaseName,
    host: target.host,
    mode: options.applyLocal ? 'applied-local' : 'checked',
    currentUser: state.currentUser,
  };
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

class PgRoleStore {
  constructor(databaseUrl) {
    this.client = new Client({
      connectionString: databaseUrl,
      application_name: 'wi2643-rls-role-setup',
    });
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
    const result = await this.client.query(
      `
        SELECT
          current_user AS "currentUser",
          r.oid IS NOT NULL AS "roleExists",
          coalesce(r.rolcanlogin, false) AS "canLogin",
          coalesce(r.rolsuper, false) AS "isSuperuser",
          coalesce(r.rolcreatedb, false) AS "canCreateDatabase",
          coalesce(r.rolcreaterole, false) AS "canCreateRole",
          coalesce(r.rolreplication, false) AS "canReplicate",
          coalesce(r.rolbypassrls, false) AS "canBypassRls",
          coalesce(pg_has_role(current_user, r.oid, 'SET'), false) AS "canSetRole",
          coalesce(has_schema_privilege(r.oid, 'public', 'USAGE'), false) AS "hasSchemaUsage",
          coalesce(has_table_privilege(r.oid, 'public.concepts', 'SELECT'), false) AS "hasConceptsSelect",
          coalesce(has_table_privilege(r.oid, 'public.concepts', 'INSERT'), false) AS "hasConceptsInsert",
          coalesce(has_table_privilege(r.oid, 'public.concept_mastery', 'SELECT'), false) AS "hasMasterySelect",
          coalesce(has_table_privilege(r.oid, 'public.concept_mastery', 'INSERT'), false) AS "hasMasteryInsert"
        FROM (SELECT 1) AS singleton
        LEFT JOIN pg_catalog.pg_roles r ON r.rolname = $1
      `,
      [RLS_TEST_ROLE],
    );
    const state = result.rows[0];
    state.ready =
      state.roleExists &&
      !state.canLogin &&
      !state.isSuperuser &&
      !state.canCreateDatabase &&
      !state.canCreateRole &&
      !state.canReplicate &&
      !state.canBypassRls &&
      state.canSetRole &&
      state.hasSchemaUsage &&
      state.hasConceptsSelect &&
      state.hasConceptsInsert &&
      state.hasMasterySelect &&
      state.hasMasteryInsert;
    return state;
  }

  async applyLocal() {
    await this.connect();
    const actorResult = await this.client.query(
      'SELECT current_user AS "currentUser"',
    );
    const actor = quoteIdentifier(actorResult.rows[0].currentUser);
    await this.client.query('BEGIN');
    try {
      await this.client.query(`
        DO $setup$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${RLS_TEST_ROLE}'
          ) THEN
            CREATE ROLE ${RLS_TEST_ROLE}
              NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
              NOINHERIT NOREPLICATION NOBYPASSRLS;
          END IF;
        END
        $setup$
      `);
      await this.client.query(
        `GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`,
      );
      await this.client.query(
        `GRANT SELECT, INSERT ON TABLE public.concepts, public.concept_mastery TO ${RLS_TEST_ROLE}`,
      );
      await this.client.query(
        `GRANT ${RLS_TEST_ROLE} TO ${actor} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  async close() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return { applyLocal: false };
  if (argv.length === 1 && argv[0] === '--apply-local') {
    return { applyLocal: true };
  }
  refuse('expected no arguments (check-only) or --apply-local.');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) refuse('DATABASE_URL is required.');
  const options = { ...parseArgs(process.argv.slice(2)), databaseUrl };
  const store = new PgRoleStore(databaseUrl);
  try {
    const result = await ensureRlsIsolationTestRole(options, store);
    console.log(
      `[rls-role-setup] ${result.mode}: ${result.role} is ready for ${result.currentUser} on ${result.databaseName}@${result.host}`,
    );
  } finally {
    await store.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
