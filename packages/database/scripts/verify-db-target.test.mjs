/**
 * BUG-782 / CFG-2 regression tests:
 *  - host extraction is robust against bad URLs
 *  - environment matcher refuses cross-env hosts
 *  - deploy.yml does not reintroduce the flat `secrets.DATABASE_URL` reference
 *
 * Run with:
 *   node --test packages/database/scripts/verify-db-target.test.mjs
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { extractHost, hostMatchesEnvironment } from './verify-db-target-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github/workflows/deploy.yml');

test('extractHost returns hostname from a valid postgres URL', () => {
  const host = extractHost('postgresql://user:pass@db.example.com:5432/mydb');
  assert.equal(host, 'db.example.com:5432');
});

test('extractHost returns hostname from a Neon-style URL', () => {
  const host = extractHost(
    'postgres://user:pass@ep-quiet-cell-12345.eu-central-1.aws.neon.tech/eduagent',
  );
  assert.equal(host, 'ep-quiet-cell-12345.eu-central-1.aws.neon.tech');
});

test('extractHost returns null for non-URL strings', () => {
  assert.equal(extractHost('not-a-url'), null);
  assert.equal(extractHost(''), null);
});

test('hostMatchesEnvironment: ok when expected substring matches and no cross-env hit', () => {
  const verdict = hostMatchesEnvironment({
    host: 'ep-staging-1234.aws.neon.tech',
    expectedSubstring: 'staging',
    wrongEnvSubstring: 'prod',
  });
  assert.equal(verdict.status, 'ok');
});

test('hostMatchesEnvironment: mismatch when host contains the wrong-env substring', () => {
  // Break test for BUG-782: a staging deploy resolving to a prod host must be
  // rejected even if no expected substring is provided. This is the exact
  // attack the verification step is meant to prevent.
  const verdict = hostMatchesEnvironment({
    host: 'ep-prod-9876.aws.neon.tech',
    expectedSubstring: 'staging',
    wrongEnvSubstring: 'prod',
  });
  assert.equal(verdict.status, 'mismatch');
  assert.match(verdict.reason, /wrong environment/);
});

test('hostMatchesEnvironment: mismatch when expected substring is absent', () => {
  const verdict = hostMatchesEnvironment({
    host: 'ep-other-env.aws.neon.tech',
    expectedSubstring: 'staging',
    wrongEnvSubstring: undefined,
  });
  assert.equal(verdict.status, 'mismatch');
});

test('hostMatchesEnvironment: unverifiable when no substrings are configured', () => {
  const verdict = hostMatchesEnvironment({
    host: 'ep-anything.aws.neon.tech',
    expectedSubstring: undefined,
    wrongEnvSubstring: undefined,
  });
  assert.equal(verdict.status, 'unverifiable');
});

test('hostMatchesEnvironment: cross-env check fires even when expected substring also matches', () => {
  // Pathological host containing both substrings is treated as a mismatch —
  // we err on the side of refusing to run.
  const verdict = hostMatchesEnvironment({
    host: 'staging-prod-mixed.example.com',
    expectedSubstring: 'staging',
    wrongEnvSubstring: 'prod',
  });
  assert.equal(verdict.status, 'mismatch');
});

test('deploy.yml does not reference flat secrets.DATABASE_URL', () => {
  // Regression guard: BUG-782's root cause was deploy.yml referencing
  // `${{ secrets.DATABASE_URL }}`. If anyone reintroduces it, this test fails.
  const yml = readFileSync(DEPLOY_YML, 'utf8');
  // Tolerate the documentation comment naming the bug but reject the actual
  // expression. The expression token always sits inside `${{ ... }}`.
  const flatRefs = yml.match(/\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/g) ?? [];
  assert.equal(
    flatRefs.length,
    0,
    `deploy.yml still references flat secrets.DATABASE_URL (${flatRefs.length} occurrence(s)). ` +
      'Use DATABASE_URL_STAGING / DATABASE_URL_PRODUCTION via the env conditional.',
  );
});

test('deploy.yml references both env-suffix-named DATABASE_URL secrets', () => {
  const yml = readFileSync(DEPLOY_YML, 'utf8');
  assert.match(yml, /secrets\.DATABASE_URL_STAGING/);
  assert.match(yml, /secrets\.DATABASE_URL_PRODUCTION/);
});

test('deploy.yml passes DATABASE_URL_STAGING_HOST and DATABASE_URL_PRODUCTION_HOST to the verify step', () => {
  // Regression guard for the silent 'unverifiable' path: if the HOST hint
  // env vars are missing from the verify step's env: block, the script falls
  // through to verdict.status === 'unverifiable' and exits 0 without enforcing
  // any cross-env check. Asserting these expressions appear in the verify step
  // block ensures the plumbing is wired so that once the Doppler secrets are
  // configured they actually reach the script.
  const yml = readFileSync(DEPLOY_YML, 'utf8');
  const verifyStepStart = yml.indexOf('Verify deploy target before migrations');
  assert.ok(verifyStepStart >= 0, 'verify deploy target step not found in deploy.yml');
  // The verify step ends at the next `- name:` line.
  const afterVerifyStep = yml.indexOf('\n      - name:', verifyStepStart);
  const verifyBlock = yml.slice(verifyStepStart, afterVerifyStep > 0 ? afterVerifyStep : undefined);
  assert.match(
    verifyBlock,
    /DATABASE_URL_STAGING_HOST/,
    'verify step env block missing DATABASE_URL_STAGING_HOST',
  );
  assert.match(
    verifyBlock,
    /DATABASE_URL_PRODUCTION_HOST/,
    'verify step env block missing DATABASE_URL_PRODUCTION_HOST',
  );
});

test('deploy.yml runs verify-db-target before migrations in the api-deploy job', () => {
  // Order matters: the verification step must precede baseline-migrations.mjs
  // and drizzle-kit migrate inside the api-deploy job, otherwise it would log
  // mismatches AFTER the damage is already done. (The api-quality-gate job
  // also runs drizzle-kit migrate, but against an ephemeral PG service — that
  // ordering is irrelevant to BUG-782.)
  const yml = readFileSync(DEPLOY_YML, 'utf8');
  const apiDeployStart = yml.indexOf('\n  api-deploy:');
  assert.ok(apiDeployStart >= 0, 'api-deploy job not found in deploy.yml');
  const apiDeployEnd = yml.indexOf('\n  ', apiDeployStart + 1) > 0
    ? yml.indexOf('\n  mobile-confirm-production:', apiDeployStart)
    : yml.length;
  const apiDeployBlock = yml.slice(apiDeployStart, apiDeployEnd);

  const verifyIdx = apiDeployBlock.indexOf('verify-db-target.mjs');
  const baselineIdx = apiDeployBlock.indexOf('baseline-migrations.mjs');
  const migrateIdx = apiDeployBlock.indexOf('drizzle-kit migrate');
  assert.ok(verifyIdx >= 0, 'verify-db-target.mjs step missing from api-deploy job');
  assert.ok(baselineIdx >= 0, 'baseline-migrations.mjs step missing from api-deploy job');
  assert.ok(migrateIdx >= 0, 'drizzle-kit migrate step missing from api-deploy job');
  assert.ok(verifyIdx < baselineIdx, 'verify-db-target must run before baseline-migrations');
  assert.ok(verifyIdx < migrateIdx, 'verify-db-target must run before drizzle-kit migrate');
});
