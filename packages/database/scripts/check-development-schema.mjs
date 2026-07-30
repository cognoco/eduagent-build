import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { neon } from '@neondatabase/serverless';

export const DEVELOPMENT_SCHEMA_QUERY = `
SELECT table_name AS "tableName", column_name AS "columnName"
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'retention_cards' AND column_name = 'last_recall_feedback')
    OR (table_name = 'subscription' AND column_name = 'past_due_at')
  )
ORDER BY table_name, column_name
`;

const REQUIRED_COLUMNS = [
  'retention_cards.last_recall_feedback',
  'subscription.past_due_at',
];

function qualifiedColumns(rows) {
  return new Set(
    rows.map(({ tableName, columnName }) => `${tableName}.${columnName}`),
  );
}

export function missingDevelopmentColumns(rows) {
  const found = qualifiedColumns(rows);
  return REQUIRED_COLUMNS.filter((column) => !found.has(column));
}

export async function runDevelopmentSchemaCheck({
  databaseUrl,
  queryCatalog,
  stdout,
  stderr,
}) {
  if (!databaseUrl) {
    stderr('development schema freshness unavailable: DATABASE_URL is not set');
    return 1;
  }

  try {
    const missing = missingDevelopmentColumns(
      await queryCatalog(databaseUrl, DEVELOPMENT_SCHEMA_QUERY),
    );
    if (missing.length > 0) {
      stderr(
        `development schema freshness failed: missing ${missing.join(', ')}`,
      );
      stderr('reconcile only after approval with: pnpm db:push:dev');
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
  if (process.env.DOPPLER_CONFIG !== 'dev') {
    console.error(
      'development schema freshness unavailable: run through Doppler dev config only',
    );
    return 1;
  }

  return runDevelopmentSchemaCheck({
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
