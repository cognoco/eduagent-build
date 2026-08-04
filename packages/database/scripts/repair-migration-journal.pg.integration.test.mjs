import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { EXPECTED_ORPHANED_ROWS } from './repair-migration-journal-lib.mjs';

const baselineUrl = process.env.WI1628_PG_INTEGRATION_URL;
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'repair-migration-journal.mjs',
);

function databaseUrl(source, database) {
  const result = new URL(source);
  result.pathname = `/${database}`;
  return result.toString();
}

function runRepair({ mode, targetUrl, receiptPath, extraEnv = {} }) {
  return spawnSync(process.execPath, [scriptPath, `--${mode}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_ENV: 'staging',
      DATABASE_URL: targetUrl,
      BASELINE_DATABASE_URL: baselineUrl,
      DATABASE_URL_STAGING_HOST: new URL(targetUrl).hostname,
      DATABASE_URL_PRODUCTION_HOST: 'production.invalid',
      WI1628_RECEIPT_PATH: receiptPath,
      GITHUB_SHA: 'abcdef0123456789abcdef0123456789abcdef01',
      GITHUB_RUN_ID: '7001',
      ...extraEnv,
    },
  });
}

async function seedExactOrphans(client) {
  await client.query('BEGIN');
  try {
    await client.query(
      'UPDATE drizzle."__drizzle_migrations" SET id = id + 1000 WHERE id >= 136',
    );
    await client.query(
      'UPDATE drizzle."__drizzle_migrations" SET id = id - 998 WHERE id >= 1136',
    );
    for (const row of EXPECTED_ORPHANED_ROWS) {
      await client.query(
        `INSERT INTO drizzle."__drizzle_migrations" (id, hash, created_at)
         VALUES ($1, $2, $3)`,
        [row.id, row.hash, row.created_at],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function exactOrphanCount(client) {
  return Number(
    (
      await client.query(
        `SELECT count(*)::integer AS count
         FROM drizzle."__drizzle_migrations"
         WHERE id = ANY($1::integer[])`,
        [EXPECTED_ORPHANED_ROWS.map((row) => row.id)],
      )
    ).rows[0].count,
  );
}

test(
  'native PostgreSQL repair is dry-run safe, exact, rollback-safe, and recoverable',
  { skip: !baselineUrl, timeout: 120_000 },
  async () => {
    const runId = `${process.pid}_${Date.now()}`;
    const databaseNames = [
      `wi1628_native_${runId}`,
      `wi1628_mismatch_${runId}`,
      `wi1628_catalog_stable_${runId}`,
      `wi1628_catalog_${runId}`,
    ];
    for (const name of databaseNames) {
      assert.match(
        name,
        /^wi1628_(?:native|mismatch|catalog_stable|catalog)_[0-9_]+$/,
      );
    }

    const baseline = new URL(baselineUrl);
    const baselineDatabase = baseline.pathname.slice(1);
    assert.match(baselineDatabase, /^wi1628[_a-z0-9]+$/);
    const admin = new pg.Client({
      connectionString: databaseUrl(baselineUrl, 'postgres'),
    });
    const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi1628-native-'));

    await admin.connect();
    try {
      for (const name of databaseNames) {
        await admin.query(
          `CREATE DATABASE "${name}" TEMPLATE "${baselineDatabase}"`,
        );
      }

      const targetUrl = databaseUrl(baselineUrl, databaseNames[0]);
      const target = new pg.Client({ connectionString: targetUrl });
      await target.connect();
      try {
        await seedExactOrphans(target);

        const dryRun = runRepair({
          mode: 'dry-run',
          targetUrl,
          receiptPath: path.join(receiptDir, 'dry-run.json'),
        });
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.equal(await exactOrphanCount(target), 2);
        const dryRunReceipt = JSON.parse(
          fs.readFileSync(path.join(receiptDir, 'dry-run.json'), 'utf8'),
        );
        assert.equal(dryRunReceipt.catalogInventory.differences, 0);
        assert.match(
          dryRunReceipt.catalogInventory.fingerprint,
          /^[a-f0-9]{64}$/,
        );

        const apply = runRepair({
          mode: 'apply',
          targetUrl,
          receiptPath: path.join(receiptDir, 'apply.json'),
          extraEnv: {
            GITHUB_RUN_ID: '7002',
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
            WI1628_REVIEWED_DRY_RUN_ID: '7001',
            WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: path.join(
              receiptDir,
              'dry-run.json',
            ),
          },
        });
        assert.equal(apply.status, 0, apply.stderr);
        assert.equal(await exactOrphanCount(target), 0);
        assert.equal(
          JSON.parse(
            fs.readFileSync(path.join(receiptDir, 'apply.json'), 'utf8'),
          ).status,
          'committed-readback-verified',
        );

        const verify = runRepair({
          mode: 'verify-applied',
          targetUrl,
          receiptPath: path.join(receiptDir, 'verify.json'),
        });
        assert.equal(verify.status, 0, verify.stderr);

        const repeatApply = runRepair({
          mode: 'apply',
          targetUrl,
          receiptPath: path.join(receiptDir, 'repeat.json'),
          extraEnv: {
            GITHUB_RUN_ID: '7003',
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
            WI1628_REVIEWED_DRY_RUN_ID: '7001',
            WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: path.join(
              receiptDir,
              'dry-run.json',
            ),
          },
        });
        assert.notEqual(repeatApply.status, 0);
        assert.match(repeatApply.stderr, /exact orphaned-row set mismatch/);
        assert.equal(await exactOrphanCount(target), 0);
      } finally {
        await target.end();
      }

      const mismatchUrl = databaseUrl(baselineUrl, databaseNames[1]);
      const mismatch = new pg.Client({ connectionString: mismatchUrl });
      await mismatch.connect();
      try {
        await seedExactOrphans(mismatch);
        const mismatchDryRun = runRepair({
          mode: 'dry-run',
          targetUrl: mismatchUrl,
          receiptPath: path.join(receiptDir, 'mismatch-dry-run.json'),
          extraEnv: { GITHUB_RUN_ID: '8001' },
        });
        assert.equal(mismatchDryRun.status, 0, mismatchDryRun.stderr);
        await mismatch.query(
          `UPDATE drizzle."__drizzle_migrations"
           SET hash = 'changed'
           WHERE id = $1`,
          [EXPECTED_ORPHANED_ROWS[0].id],
        );
        const refused = runRepair({
          mode: 'apply',
          targetUrl: mismatchUrl,
          receiptPath: path.join(receiptDir, 'mismatch.json'),
          extraEnv: {
            GITHUB_RUN_ID: '8002',
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
            WI1628_REVIEWED_DRY_RUN_ID: '8001',
            WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: path.join(
              receiptDir,
              'mismatch-dry-run.json',
            ),
          },
        });
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /exact orphaned-row set mismatch/);
        assert.equal(await exactOrphanCount(mismatch), 2);
      } finally {
        await mismatch.end();
      }

      const stableCatalogUrl = databaseUrl(baselineUrl, databaseNames[2]);
      const stableCatalog = new pg.Client({
        connectionString: stableCatalogUrl,
      });
      await stableCatalog.connect();
      try {
        await seedExactOrphans(stableCatalog);
        await stableCatalog.query(
          'CREATE TABLE public.wi1628_catalog_drift_probe (id integer)',
        );
        const stableDryRunPath = path.join(
          receiptDir,
          'catalog-stable-dry-run.json',
        );
        const stableDryRun = runRepair({
          mode: 'dry-run',
          targetUrl: stableCatalogUrl,
          receiptPath: stableDryRunPath,
          extraEnv: { GITHUB_RUN_ID: '9001' },
        });
        assert.equal(stableDryRun.status, 0, stableDryRun.stderr);
        const stableReceipt = JSON.parse(
          fs.readFileSync(stableDryRunPath, 'utf8'),
        );
        assert.ok(stableReceipt.catalogInventory.differences > 0);
        const stableApply = runRepair({
          mode: 'apply',
          targetUrl: stableCatalogUrl,
          receiptPath: path.join(receiptDir, 'catalog-stable-apply.json'),
          extraEnv: {
            GITHUB_RUN_ID: '9002',
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
            WI1628_REVIEWED_DRY_RUN_ID: '9001',
            WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: stableDryRunPath,
          },
        });
        assert.equal(stableApply.status, 0, stableApply.stderr);
        assert.equal(await exactOrphanCount(stableCatalog), 0);
      } finally {
        await stableCatalog.end();
      }

      const catalogUrl = databaseUrl(baselineUrl, databaseNames[3]);
      const catalog = new pg.Client({ connectionString: catalogUrl });
      await catalog.connect();
      try {
        await seedExactOrphans(catalog);
        await catalog.query(
          'CREATE TABLE public.wi1628_catalog_drift_probe (id integer)',
        );
        const catalogDryRunPath = path.join(receiptDir, 'catalog-dry-run.json');
        const catalogDryRun = runRepair({
          mode: 'dry-run',
          targetUrl: catalogUrl,
          receiptPath: catalogDryRunPath,
          extraEnv: { GITHUB_RUN_ID: '9101' },
        });
        assert.equal(catalogDryRun.status, 0, catalogDryRun.stderr);
        await catalog.query(
          'ALTER TABLE public.wi1628_catalog_drift_probe ALTER COLUMN id TYPE bigint',
        );
        const changedDryRunPath = path.join(
          receiptDir,
          'catalog-changed-dry-run.json',
        );
        const changedDryRun = runRepair({
          mode: 'dry-run',
          targetUrl: catalogUrl,
          receiptPath: changedDryRunPath,
          extraEnv: { GITHUB_RUN_ID: '9102' },
        });
        assert.equal(changedDryRun.status, 0, changedDryRun.stderr);
        const before = JSON.parse(
          fs.readFileSync(catalogDryRunPath, 'utf8'),
        ).catalogInventory;
        const after = JSON.parse(
          fs.readFileSync(changedDryRunPath, 'utf8'),
        ).catalogInventory;
        assert.equal(after.baselineObjects, before.baselineObjects);
        assert.equal(after.stagingObjects, before.stagingObjects);
        assert.equal(after.differences, before.differences);
        assert.notEqual(after.fingerprint, before.fingerprint);
        const refused = runRepair({
          mode: 'apply',
          targetUrl: catalogUrl,
          receiptPath: path.join(receiptDir, 'catalog-apply.json'),
          extraEnv: {
            GITHUB_RUN_ID: '9103',
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
            WI1628_REVIEWED_DRY_RUN_ID: '9101',
            WI1628_REVIEWED_DRY_RUN_RECEIPT_PATH: catalogDryRunPath,
          },
        });
        assert.notEqual(refused.status, 0);
        assert.match(
          refused.stderr,
          /catalog inventory changed since the reviewed dry run/,
        );
        assert.equal(await exactOrphanCount(catalog), 2);
      } finally {
        await catalog.end();
      }
    } finally {
      for (const name of databaseNames) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      await admin.end();
      fs.rmSync(receiptDir, { recursive: true, force: true });
    }
  },
);
