#!/usr/bin/env node

/**
 * Syncs secrets from Doppler to Cloudflare Workers.
 *
 * Usage (standalone):
 *   pnpm secrets:sync           # Sync all environments (dev, stg, prd)
 *   pnpm secrets:sync dev       # Sync dev only
 *   pnpm secrets:sync stg       # Sync staging only
 *   pnpm secrets:sync prd       # Sync production only
 *
 * Also called automatically by setup-env.js (postinstall / pnpm env:sync).
 * When called as a module, failures are non-fatal — the caller decides.
 *
 * Prerequisites:
 *   - Doppler CLI installed and authenticated (doppler login)
 *   - Wrangler CLI authenticated (wrangler login)
 *   - Doppler project configured (doppler setup → mentomate)
 *
 * What it does:
 *   1. Downloads secrets from Doppler config (dev/stg/prd)
 *   2. Filters out non-Worker secrets (DOPPLER_*, EXPO_*, CLOUDFLARE_*, etc.)
 *   3. Pushes to the corresponding Cloudflare Worker via wrangler secret bulk
 *
 * This is a manual sync — run it whenever you change secrets in Doppler.
 * There is no auto-sync integration between Doppler and Cloudflare Workers.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

// Map Doppler configs to Wrangler environments
const ENV_MAP = {
  dev: {
    dopplerConfig: 'dev',
    wranglerEnv: null,
    workerName: 'mentomate-api-dev',
  },
  stg: {
    dopplerConfig: 'stg',
    wranglerEnv: 'staging',
    workerName: 'mentomate-api-stg',
  },
  prd: {
    dopplerConfig: 'prd',
    wranglerEnv: 'production',
    workerName: 'mentomate-api-prd',
  },
};

// Keys that exist in Doppler but are NOT consumed by Cloudflare Workers.
// These are CI/CD tokens, Doppler metadata, or mobile-only config.
const EXCLUDE_PREFIXES = ['DOPPLER_', 'EXPO_', 'CLOUDFLARE_', 'SENTRY_AUTH_'];
const EXCLUDE_EXACT = ['EXPO_TOKEN', 'API_ORIGIN'];

const DOPPLER_CLI =
  process.platform === 'win32' ? 'C:\\Tools\\doppler\\doppler.exe' : 'doppler';

const API_DIR = path.join(__dirname, '..', 'apps', 'api');

function shouldInclude(key, value) {
  if (EXCLUDE_EXACT.includes(key)) return false;
  if (EXCLUDE_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
  // Empty strings in Doppler become "" in Cloudflare, which fails Zod .min(1).
  // Treat them as "not set" and skip — the Worker treats missing keys as undefined.
  if (value === '') return false;
  return true;
}

function isWranglerAuthenticated() {
  const result = spawnSync('pnpm exec wrangler whoami', {
    encoding: 'utf-8',
    cwd: API_DIR,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function downloadSecrets(config) {
  try {
    const raw = execSync(
      `"${DOPPLER_CLI}" secrets download --config ${config} --no-file --format json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function filterSecrets(secrets) {
  const filtered = {};
  const excluded = [];
  for (const [key, value] of Object.entries(secrets)) {
    if (shouldInclude(key, value)) {
      filtered[key] = value;
    } else {
      excluded.push(key);
    }
  }
  return { filtered, excluded };
}

function pushToWorker(secrets, wranglerEnv) {
  const json = JSON.stringify(secrets);
  const envFlag = wranglerEnv ? ` --env ${wranglerEnv}` : '';
  const cmd = `pnpm exec wrangler secret bulk${envFlag}`;

  const result = spawnSync(cmd, {
    input: json,
    encoding: 'utf-8',
    cwd: API_DIR,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const err = result.stderr || result.stdout || 'Unknown error';
    return { success: false, error: err.trim() };
  }

  return { success: true };
}

/**
 * Sync a single environment. Returns true on success, false on failure.
 */
function syncEnvironment(envKey) {
  const env = ENV_MAP[envKey];
  if (!env) {
    console.error(
      `\x1b[31m[sync]\x1b[0m Unknown environment: "${envKey}". Use: dev, stg, prd`
    );
    return false;
  }

  console.log(`\n\x1b[36m[sync]\x1b[0m ${envKey} → ${env.workerName}`);
  console.log(`  Doppler config: ${env.dopplerConfig}`);
  console.log(`  Wrangler env:   ${env.wranglerEnv || '(default)'}`);

  const secrets = downloadSecrets(env.dopplerConfig);
  if (!secrets) {
    console.error(
      `\x1b[31m[sync]\x1b[0m Failed to download from Doppler config "${env.dopplerConfig}"`
    );
    return false;
  }

  const totalCount = Object.keys(secrets).length;
  const { filtered, excluded } = filterSecrets(secrets);
  const syncCount = Object.keys(filtered).length;

  console.log(
    `  Downloaded: ${totalCount} keys, syncing: ${syncCount}, excluded: ${excluded.length}`
  );
  if (excluded.length > 0) {
    console.log(`  \x1b[90mExcluded: ${excluded.join(', ')}\x1b[0m`);
  }

  const result = pushToWorker(filtered, env.wranglerEnv);
  if (result.success) {
    console.log(
      `  \x1b[32m✓ Synced ${syncCount} secrets to ${env.workerName}\x1b[0m`
    );
    return true;
  }

  console.error(`  \x1b[31m✗ Failed to sync to ${env.workerName}\x1b[0m`);
  console.error(`  ${result.error}`);
  return false;
}

/**
 * Sync secrets to Cloudflare Workers.
 * @param {string[]} targets - Environments to sync ('dev', 'stg', 'prd'). Defaults to all.
 * @returns {{ ok: boolean, results: Record<string, boolean> }}
 */
function syncSecrets(targets) {
  const envs = targets && targets.length > 0 ? targets : ['dev', 'stg', 'prd'];

  console.log(
    '\x1b[36m\x1b[1m[Doppler → Cloudflare Workers] Secret Sync\x1b[0m'
  );

  if (!isWranglerAuthenticated()) {
    console.log(
      '\x1b[33m[sync]\x1b[0m Wrangler not authenticated — skipping Cloudflare sync.'
    );
    console.log('   Run: pnpm exec wrangler login');
    console.log('   Then: pnpm secrets:sync\n');
    return { ok: false, results: {} };
  }

  const results = {};
  for (const target of envs) {
    results[target] = syncEnvironment(target);
  }

  console.log('');

  const ok = Object.values(results).every(Boolean);
  return { ok, results };
}

// Export for use as a module (called by setup-env.js)
module.exports = { syncSecrets };

// CLI entry point — only runs when called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const { ok } = syncSecrets(args);
  process.exit(ok ? 0 : 1);
}
