#!/usr/bin/env node

/**
 * Catalog-only least-privilege check for lane/developer database credentials.
 * It never attempts a write, even inside a rollback transaction.
 */

import { neon } from '@neondatabase/serverless';

import { assertReadOnlyCapabilities } from './verify-db-read-only-lib.mjs';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for read-only verification');
  }

  const sql = neon(process.env.DATABASE_URL);
  const [capabilities] = await sql`
    SELECT
      role.rolsuper AS is_superuser,
      (
        role.rolcreatedb
        OR has_database_privilege(current_user, current_database(), 'CREATE')
      ) AS can_create_database,
      EXISTS (
        SELECT 1
        FROM pg_namespace namespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND has_schema_privilege(current_user, namespace.oid, 'CREATE')
      ) AS can_create_schema,
      EXISTS (
        SELECT 1
        FROM pg_class object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND pg_has_role(current_user, object.relowner, 'MEMBER')
      ) AS owns_application_objects,
      EXISTS (
        SELECT 1
        FROM pg_class object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND object.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            has_table_privilege(current_user, object.oid, 'INSERT')
            OR has_table_privilege(current_user, object.oid, 'UPDATE')
            OR has_table_privilege(current_user, object.oid, 'DELETE')
            OR has_table_privilege(current_user, object.oid, 'TRUNCATE')
            OR has_table_privilege(current_user, object.oid, 'TRIGGER')
            OR has_table_privilege(current_user, object.oid, 'REFERENCES')
          )
      ) AS has_table_writes,
      EXISTS (
        SELECT 1
        FROM pg_class object
        INNER JOIN pg_namespace namespace
          ON namespace.oid = object.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND object.relkind = 'S'
          AND (
            has_sequence_privilege(current_user, object.oid, 'USAGE')
            OR has_sequence_privilege(current_user, object.oid, 'UPDATE')
          )
      ) AS has_sequence_writes
    FROM pg_roles role
    WHERE role.rolname = current_user
  `;

  if (!capabilities) {
    throw new Error('Could not resolve current PostgreSQL role capabilities');
  }

  assertReadOnlyCapabilities(capabilities);
  console.log('✓ DATABASE_URL role is catalog-verified read-only');
}

try {
  await main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
