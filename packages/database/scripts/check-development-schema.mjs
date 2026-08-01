import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { neon } from '@neondatabase/serverless';

export const DEVELOPMENT_SCHEMA_QUERY = `
SELECT
  table_name AS "tableName",
  column_name AS "columnName",
  data_type AS "dataType",
  is_nullable AS "isNullable"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'retention_cards' AND column_name = 'last_recall_feedback')
    OR (table_name = 'subscription' AND column_name = 'past_due_at')
    OR (table_name = 'session_summaries' AND column_name = 'language_learning_summary')
  )
ORDER BY table_name, column_name
`;

export const REQUIRED_DEVELOPMENT_COLUMNS = [
  {
    qualifiedName: 'retention_cards.last_recall_feedback',
    dataType: 'jsonb',
    isNullable: 'YES',
  },
  {
    qualifiedName: 'subscription.past_due_at',
    dataType: 'timestamp with time zone',
    isNullable: 'YES',
  },
  {
    qualifiedName: 'session_summaries.language_learning_summary',
    dataType: 'jsonb',
    isNullable: 'YES',
  },
];

function normalizedHostname(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/:\d+$/, '');
  }
}

export function isExactDevelopmentTarget({
  databaseUrl,
  dopplerProject,
  dopplerConfig,
  dopplerEnvironment,
  developmentHost,
  stagingHost,
  productionHost,
}) {
  if (
    dopplerProject !== 'mentomate' ||
    dopplerConfig !== 'dev' ||
    dopplerEnvironment !== 'dev'
  ) {
    return false;
  }

  let host;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const expected = normalizedHostname(developmentHost);
  if (!expected || host !== expected) return false;

  const protectedHosts = [stagingHost, productionHost]
    .map(normalizedHostname)
    .filter(Boolean);
  return !protectedHosts.includes(host);
}

function columnsByQualifiedName(rows) {
  return new Map(
    rows.map((row) => [`${row.tableName}.${row.columnName}`, row]),
  );
}

export function missingDevelopmentColumns(rows) {
  const found = columnsByQualifiedName(rows);
  return REQUIRED_DEVELOPMENT_COLUMNS.filter(
    ({ qualifiedName }) => !found.has(qualifiedName),
  ).map(({ qualifiedName }) => qualifiedName);
}

export function incompatibleDevelopmentColumns(rows) {
  const found = columnsByQualifiedName(rows);
  return REQUIRED_DEVELOPMENT_COLUMNS.flatMap((expected) => {
    const actual = found.get(expected.qualifiedName);
    if (!actual) return [];

    const compatible =
      actual.dataType === expected.dataType &&
      actual.isNullable === expected.isNullable;
    if (compatible) return [];

    const expectedNullability =
      expected.isNullable === 'YES' ? 'nullable' : 'non-nullable';
    const actualNullability =
      actual.isNullable === 'YES' ? 'nullable' : 'non-nullable';
    return [
      `${expected.qualifiedName} (expected ${expected.dataType} ${expectedNullability}, found ${actual.dataType} ${actualNullability})`,
    ];
  });
}

export async function runDevelopmentSchemaCheck({
  databaseUrl,
  dopplerProject,
  dopplerConfig,
  dopplerEnvironment,
  developmentHost,
  stagingHost,
  productionHost,
  queryCatalog,
  stdout,
  stderr,
}) {
  if (dopplerConfig !== 'dev') {
    stderr(
      'development schema freshness unavailable: run through Doppler dev config only',
    );
    return 1;
  }

  if (!databaseUrl) {
    stderr('development schema freshness unavailable: DATABASE_URL is not set');
    return 1;
  }

  if (
    !isExactDevelopmentTarget({
      databaseUrl,
      dopplerProject,
      dopplerConfig,
      dopplerEnvironment,
      developmentHost,
      stagingHost,
      productionHost,
    })
  ) {
    stderr(
      'development schema freshness unavailable: exact development target verification failed',
    );
    return 1;
  }

  try {
    const rows = await queryCatalog(databaseUrl, DEVELOPMENT_SCHEMA_QUERY);
    const missing = missingDevelopmentColumns(rows);
    const incompatible = incompatibleDevelopmentColumns(rows);
    if (missing.length > 0 || incompatible.length > 0) {
      const drift = [];
      if (missing.length > 0) drift.push(`missing ${missing.join(', ')}`);
      if (incompatible.length > 0) {
        drift.push(`incompatible ${incompatible.join(', ')}`);
      }
      stderr(`development schema freshness failed: ${drift.join('; ')}`);
      stderr(
        'reconcile only after approval with: pnpm db:reconcile:dev-schema',
      );
      return 2;
    }

    stdout(
      'development schema freshness passed: retention_cards.last_recall_feedback, subscription.past_due_at, and session_summaries.language_learning_summary are present',
    );
    return 0;
  } catch {
    stderr('development schema freshness unavailable: catalog query failed');
    return 1;
  }
}

async function queryLiveCatalog(databaseUrl, query) {
  return neon(databaseUrl)(query, []);
}

async function main() {
  return runDevelopmentSchemaCheck({
    databaseUrl: process.env.DATABASE_URL,
    dopplerProject: process.env.DOPPLER_PROJECT,
    dopplerConfig: process.env.DOPPLER_CONFIG,
    dopplerEnvironment: process.env.DOPPLER_ENVIRONMENT,
    developmentHost: process.env.DATABASE_URL_DEVELOPMENT_HOST,
    stagingHost: process.env.DATABASE_URL_STAGING_HOST,
    productionHost: process.env.DATABASE_URL_PRODUCTION_HOST,
    queryCatalog: queryLiveCatalog,
    stdout: console.log,
    stderr: console.error,
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await main();
}
