import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { neon } from '@neondatabase/serverless';

import {
  DEVELOPMENT_SCHEMA_QUERY,
  incompatibleDevelopmentColumns,
  isExactDevelopmentTarget,
  missingDevelopmentColumns,
} from './check-development-schema.mjs';

export const DEVELOPMENT_SCHEMA_RECONCILIATION = [
  `
ALTER TABLE retention_cards
  ADD COLUMN IF NOT EXISTS last_recall_feedback jsonb
`,
  `
ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS past_due_at timestamp with time zone
`,
  `
ALTER TABLE session_summaries
  ADD COLUMN IF NOT EXISTS language_learning_summary jsonb
`,
];

const STATEMENT_BY_COLUMN = new Map([
  [
    'retention_cards.last_recall_feedback',
    DEVELOPMENT_SCHEMA_RECONCILIATION[0],
  ],
  ['subscription.past_due_at', DEVELOPMENT_SCHEMA_RECONCILIATION[1]],
  [
    'session_summaries.language_learning_summary',
    DEVELOPMENT_SCHEMA_RECONCILIATION[2],
  ],
]);

const SUPPORTED_DEVELOPMENT_CONFIGS = new Set(['dev', 'dev_integration']);

export async function runDevelopmentSchemaReconciliation({
  databaseUrl,
  dopplerProject,
  dopplerConfig,
  dopplerEnvironment,
  expectedDopplerConfig = 'dev',
  developmentHost,
  stagingHost,
  productionHost,
  queryCatalog,
  executeStatements,
  stdout,
  stderr,
}) {
  if (
    !SUPPORTED_DEVELOPMENT_CONFIGS.has(expectedDopplerConfig) ||
    dopplerConfig !== expectedDopplerConfig
  ) {
    stderr(
      `development schema reconciliation unavailable: run through Doppler ${expectedDopplerConfig} config only`,
    );
    return 1;
  }

  if (!databaseUrl) {
    stderr(
      'development schema reconciliation unavailable: DATABASE_URL is not set',
    );
    return 1;
  }

  if (
    expectedDopplerConfig === 'dev' &&
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
      'development schema reconciliation unavailable: exact development target verification failed',
    );
    return 1;
  }

  try {
    const rows = await queryCatalog(databaseUrl, DEVELOPMENT_SCHEMA_QUERY);
    const incompatible = incompatibleDevelopmentColumns(rows);
    if (incompatible.length > 0) {
      stderr(
        `development schema reconciliation refused: incompatible ${incompatible.join(', ')}`,
      );
      return 1;
    }

    const statements = missingDevelopmentColumns(rows).map((column) =>
      STATEMENT_BY_COLUMN.get(column),
    );
    if (statements.length > 0) {
      await executeStatements(databaseUrl, statements);
    }
    stdout(
      'development schema reconciliation passed: added or retained retention_cards.last_recall_feedback, subscription.past_due_at, and session_summaries.language_learning_summary',
    );
    return 0;
  } catch {
    stderr('development schema reconciliation failed: no changes confirmed');
    return 1;
  }
}

async function executeLiveStatements(databaseUrl, statements) {
  const sql = neon(databaseUrl);
  return sql.transaction(statements.map((statement) => sql(statement, [])));
}

async function queryLiveCatalog(databaseUrl, query) {
  return neon(databaseUrl)(query, []);
}

async function main() {
  const targetArgument = process.argv.find((argument) =>
    argument.startsWith('--target='),
  );
  const expectedDopplerConfig = targetArgument?.slice('--target='.length);

  return runDevelopmentSchemaReconciliation({
    databaseUrl: process.env.DATABASE_URL,
    dopplerProject: process.env.DOPPLER_PROJECT,
    dopplerConfig: process.env.DOPPLER_CONFIG,
    dopplerEnvironment: process.env.DOPPLER_ENVIRONMENT,
    expectedDopplerConfig,
    developmentHost: process.env.DATABASE_URL_DEVELOPMENT_HOST,
    stagingHost: process.env.DATABASE_URL_STAGING_HOST,
    productionHost: process.env.DATABASE_URL_PRODUCTION_HOST,
    queryCatalog: queryLiveCatalog,
    executeStatements: executeLiveStatements,
    stdout: console.log,
    stderr: console.error,
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await main();
}
