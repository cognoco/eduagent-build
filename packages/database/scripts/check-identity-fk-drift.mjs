import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { neon } from '@neondatabase/serverless';

/**
 * Mirrors migration 0129's live-catalog boundary. The four excluded relations
 * are the legacy identity tables that migration 0132 later drops as one set;
 * every other child must already have been repointed to person.id.
 */
export const LEGACY_PROFILE_FK_QUERY = `
SELECT
  c.conname AS "constraintName",
  c.conrelid::regclass::text AS "childTable",
  to_json(ARRAY(
    SELECT a.attname
    FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  )) AS "childColumns",
  c.confrelid::regclass::text AS "parentTable",
  to_json(ARRAY(
    SELECT a.attname
    FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = c.confrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  )) AS "parentColumns"
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = to_regclass('public.profiles')
  AND c.conrelid NOT IN (
    SELECT relation
    FROM (
      VALUES
        (to_regclass('public.profiles')),
        (to_regclass('public.accounts')),
        (to_regclass('public.family_links')),
        (to_regclass('public.consent_states'))
    ) AS legacy(relation)
    WHERE relation IS NOT NULL
  )
ORDER BY 2, 1
`;

export function legacyProfileFkDrift(rows) {
  return rows
    .map(
      (row) =>
        `${row.childTable}.${row.constraintName}: ` +
        `(${row.childColumns.join(', ')}) -> ` +
        `${row.parentTable}(${row.parentColumns.join(', ')})`,
    )
    .sort();
}

export function identityFkUnavailableMessage() {
  return 'identity FK freshness unavailable: catalog query failed';
}

export async function runIdentityFkCheck({
  databaseUrl,
  queryCatalog,
  stdout,
  stderr,
}) {
  if (!databaseUrl) {
    stderr(
      'identity FK freshness unavailable: DATABASE_URL is not set; provide the environment-scoped evidence credential',
    );
    return 1;
  }

  try {
    const rows = await queryCatalog(databaseUrl, LEGACY_PROFILE_FK_QUERY);
    const drift = legacyProfileFkDrift(rows);

    if (drift.length > 0) {
      stderr(
        `identity FK freshness failed: ${drift.length} non-legacy child constraint(s) still target profiles.id`,
      );
      for (const finding of drift) stderr(`- ${finding}`);
      return 2;
    }

    stdout(
      'identity FK freshness passed: no non-legacy child targets profiles.id',
    );
    return 0;
  } catch {
    stderr(identityFkUnavailableMessage());
    return 1;
  }
}

async function queryLiveCatalog(databaseUrl, query) {
  const sql = neon(databaseUrl);
  return sql(query, []);
}

async function main() {
  return runIdentityFkCheck({
    databaseUrl: process.env.DATABASE_URL,
    queryCatalog: queryLiveCatalog,
    stdout: console.log,
    stderr: console.error,
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await main();
}
