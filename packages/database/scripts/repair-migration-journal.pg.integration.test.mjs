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
    ];
    for (const name of databaseNames) {
      assert.match(name, /^wi1628_(?:native|mismatch)_[0-9_]+$/);
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

        const apply = runRepair({
          mode: 'apply',
          targetUrl,
          receiptPath: path.join(receiptDir, 'apply.json'),
          extraEnv: {
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
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
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
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
            WI1628_REPAIR_CONFIRM: 'WI-1628:DELETE:136,137',
            WI1628_UNRECOVERED_EFFECTS_ACK:
              'WI-1628:ACCEPT:UNRECOVERED-STAGING-MIGRATION-EFFECTS',
          },
        });
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /exact orphaned-row set mismatch/);
        assert.equal(await exactOrphanCount(mismatch), 2);
      } finally {
        await mismatch.end();
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
