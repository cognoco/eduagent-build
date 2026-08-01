import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { neon } from '@neondatabase/serverless';

export const DEVELOPMENT_SCHEMA_RECONCILIATION = [
  `
ALTER TABLE retention_cards
  ADD COLUMN IF NOT EXISTS last_recall_feedback jsonb
`,
  `
ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS past_due_at timestamp with time zone
`,
];

const SUPPORTED_DEVELOPMENT_CONFIGS = new Set(['dev', 'dev_integration']);

export async function runDevelopmentSchemaReconciliation({
  databaseUrl,
  dopplerConfig,
  expectedDopplerConfig = 'dev',
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

  try {
    await executeStatements(databaseUrl, DEVELOPMENT_SCHEMA_RECONCILIATION);
    stdout(
      'development schema reconciliation passed: added or retained retention_cards.last_recall_feedback and subscription.past_due_at',
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

async function main() {
  const targetArgument = process.argv.find((argument) =>
    argument.startsWith('--target='),
  );
  const expectedDopplerConfig = targetArgument?.slice('--target='.length);

  return runDevelopmentSchemaReconciliation({
    databaseUrl: process.env.DATABASE_URL,
    dopplerConfig: process.env.DOPPLER_CONFIG,
    expectedDopplerConfig,
    executeStatements: executeLiveStatements,
    stdout: console.log,
    stderr: console.error,
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await main();
}
