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
  )
ORDER BY table_name, column_name
`;

const REQUIRED_COLUMNS = [
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
];

function columnsByQualifiedName(rows) {
  return new Map(
    rows.map((row) => [`${row.tableName}.${row.columnName}`, row]),
  );
}

export function missingDevelopmentColumns(rows) {
  const found = columnsByQualifiedName(rows);
  return REQUIRED_COLUMNS.filter(
    ({ qualifiedName }) => !found.has(qualifiedName),
  ).map(({ qualifiedName }) => qualifiedName);
}

export function incompatibleDevelopmentColumns(rows) {
  const found = columnsByQualifiedName(rows);
  return REQUIRED_COLUMNS.flatMap((expected) => {
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
  dopplerConfig,
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
      'development schema freshness passed: retention_cards.last_recall_feedback and subscription.past_due_at are present',
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
    dopplerConfig: process.env.DOPPLER_CONFIG,
    queryCatalog: queryLiveCatalog,
    stdout: console.log,
    stderr: console.error,
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await main();
}
