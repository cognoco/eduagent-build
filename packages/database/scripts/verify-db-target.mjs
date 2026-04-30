/**
 * Verifies that DATABASE_URL targets the expected deploy environment before
 * migrations run. Defensive backstop for BUG-782 / CFG-2: if the wrong
 * env-scoped secret resolves at the YAML conditional (or someone reintroduces
 * a flat repo secret), the migration step will fail-fast with a clear error
 * instead of silently corrupting the wrong database.
 *
 * Required env:
 *   DEPLOY_ENV    — "staging" | "production"
 *   DATABASE_URL  — the connection URL the deploy is about to migrate
 *
 * Optional env (recommended for production-grade verification):
 *   DATABASE_URL_STAGING_HOST     — expected hostname substring for staging
 *   DATABASE_URL_PRODUCTION_HOST  — expected hostname substring for production
 *
 * If neither HOST hint is provided, the script logs the resolved host (with
 * credentials redacted) so misconfigurations are visible in the deploy log.
 *
 * Exit codes:
 *   0 — verification passed (or only informational logging)
 *   1 — DEPLOY_ENV / DATABASE_URL missing, or hostname does not match the
 *       expected pattern for DEPLOY_ENV.
 */

import { extractHost, hostMatchesEnvironment } from './verify-db-target-lib.mjs';

const deployEnv = process.env.DEPLOY_ENV;
const databaseUrl = process.env.DATABASE_URL;

if (!deployEnv) {
  console.error('✗ DEPLOY_ENV is required (expected "staging" or "production")');
  process.exit(1);
}

if (deployEnv !== 'staging' && deployEnv !== 'production') {
  console.error(`✗ DEPLOY_ENV="${deployEnv}" is not a valid deploy target`);
  process.exit(1);
}

if (!databaseUrl) {
  console.error(
    `✗ DATABASE_URL is empty for DEPLOY_ENV="${deployEnv}". The env-scoped ` +
      `secret (DATABASE_URL_${deployEnv.toUpperCase()}) is missing or did not ` +
      `resolve. See docs/deployment-and-secrets.md.`,
  );
  process.exit(1);
}

const host = extractHost(databaseUrl);
if (!host) {
  console.error('✗ DATABASE_URL is not a parseable URL — refusing to run migrations');
  process.exit(1);
}

console.log(`Deploy target: env=${deployEnv} host=${host}`);

const expectedSubstring =
  deployEnv === 'staging'
    ? process.env.DATABASE_URL_STAGING_HOST
    : process.env.DATABASE_URL_PRODUCTION_HOST;

const wrongEnvSubstring =
  deployEnv === 'staging'
    ? process.env.DATABASE_URL_PRODUCTION_HOST
    : process.env.DATABASE_URL_STAGING_HOST;

const verdict = hostMatchesEnvironment({
  host,
  expectedSubstring,
  wrongEnvSubstring,
});

if (verdict.status === 'mismatch') {
  console.error(`✗ ${verdict.reason}`);
  process.exit(1);
}

if (verdict.status === 'unverifiable') {
  console.warn(
    `⚠ ${verdict.reason} — set DATABASE_URL_STAGING_HOST / ` +
      `DATABASE_URL_PRODUCTION_HOST in the workflow env to enforce a hard check.`,
  );
}

if (verdict.status === 'ok') {
  console.log(`✓ ${verdict.reason}`);
}

process.exit(0);
