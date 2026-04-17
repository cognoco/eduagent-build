#!/usr/bin/env node

/**
 * Generates local env files from Doppler for local development,
 * and syncs EXPO_PUBLIC_* vars into eas.json build profiles.
 *
 * This script runs during `pnpm install` but gracefully skips if:
 * - Running in CI environment
 * - Doppler CLI is not installed
 * - Doppler is not configured for this project
 *
 * Generates (gitignored, mode 0o600):
 * - .env.development.local  (root — used by db scripts via dotenv-cli)
 * - apps/api/.dev.vars      (Wrangler local secrets)
 * - apps/mobile/.env.local  (Expo local env — EXPO_PUBLIC_* vars only)
 *
 * Updates (committed):
 * - apps/mobile/eas.json    (EXPO_PUBLIC_* + allowlisted vars per build profile)
 *   Pulls from Doppler dev/stg/prd → development/preview/production profiles.
 *
 * All files except mobile receive the full Doppler config. The mobile
 * output is filtered to EXPO_PUBLIC_* variables only. Consumers read
 * only the keys they need; extra keys are harmless and ignored.
 *
 * Developers can also run manually: pnpm env:sync
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOPPLER_CONFIG = 'stg';
const STALENESS_DAYS = 7;

const OUTPUT_FILES = [
  {
    path: path.join(__dirname, '..', '.env.development.local'),
    description: 'Root env (.env.development.local)',
  },
  {
    path: path.join(__dirname, '..', 'apps', 'api', '.dev.vars'),
    description: 'Wrangler local secrets (apps/api/.dev.vars)',
  },
  {
    path: path.join(__dirname, '..', 'apps', 'mobile', '.env.local'),
    description: 'Expo local env (apps/mobile/.env.local)',
    filter: (line) => {
      const trimmed = line.trim();
      return (
        !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('EXPO_PUBLIC_')
      );
    },
  },
];

const CI_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'VERCEL',
  'NETLIFY',
  'CIRCLECI',
  'TRAVIS',
  'GITLAB_CI',
  'JENKINS_URL',
];

function isCI() {
  return CI_ENV_VARS.some(
    (v) =>
      process.env[v] === 'true' ||
      process.env[v] === '1' ||
      (v !== 'CI' && process.env[v] !== undefined)
  );
}

function isDopplerInstalled() {
  const result = spawnSync('doppler', ['--version'], {
    stdio: 'pipe',
    shell: true,
  });
  return result.status === 0;
}

function isDopplerConfigured() {
  const result = spawnSync(
    'doppler',
    ['configure', 'get', 'project', '--plain'],
    {
      stdio: 'pipe',
      shell: true,
    }
  );
  return result.status === 0 && result.stdout.toString().trim() !== '';
}

function downloadSecrets(config) {
  try {
    return execSync(
      `doppler secrets download --config ${config} --no-file --format env`,
      {
        encoding: 'utf-8',
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  } catch {
    return null;
  }
}

function downloadSecretsJson(config) {
  try {
    const raw = execSync(
      `doppler secrets download --config ${config} --no-file --format json`,
      { encoding: 'utf-8', shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function checkStaleness(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    return ageInDays > STALENESS_DAYS;
  } catch {
    return false;
  }
}

// Doppler config → EAS build profile mapping
// stg covers both development (local Expo dev client) and preview (staging builds)
const EAS_PROFILE_MAP = {
  stg: ['development', 'preview'],
  prd: ['production'],
};

// Non-EXPO_PUBLIC_* vars that should also be synced into eas.json env blocks
const EAS_EXTRA_VARS = ['SENTRY_DISABLE_AUTO_UPLOAD'];

/**
 * Downloads EXPO_PUBLIC_* vars from all Doppler configs (dev/stg/prd)
 * and merges them into the corresponding eas.json build profile env blocks.
 * Preserves all non-env profile settings and any unmanaged env vars.
 * Only writes if content actually changed (avoids git noise).
 */
function updateEasJson() {
  const easPath = path.join(__dirname, '..', 'apps', 'mobile', 'eas.json');

  if (!fs.existsSync(easPath)) {
    console.log(
      '\x1b[33m[Doppler]\x1b[0m Skipping eas.json update (file not found)'
    );
    return;
  }

  let easConfig;
  try {
    const raw = fs.readFileSync(easPath, 'utf-8');
    easConfig = JSON.parse(raw);
  } catch (err) {
    console.log(
      `\x1b[31m[Doppler]\x1b[0m Failed to parse eas.json: ${err.message}`
    );
    return;
  }

  console.log(
    '\x1b[36m[Doppler]\x1b[0m Syncing EXPO_PUBLIC_* vars to eas.json...'
  );

  if (!easConfig.build) {
    easConfig.build = {};
  }

  let updatedCount = 0;
  let skippedCount = 0;

  for (const [envKey, profileNames] of Object.entries(EAS_PROFILE_MAP)) {
    const profiles = Array.isArray(profileNames)
      ? profileNames
      : [profileNames];
    const secrets = downloadSecretsJson(envKey);
    if (!secrets) {
      console.log(
        `\x1b[33m[Doppler]\x1b[0m   Skipping ${profiles.join(', ')} ` +
          `(cannot access Doppler config "${envKey}")`
      );
      skippedCount++;
      continue;
    }

    // Filter to EXPO_PUBLIC_* + allowlisted vars, skip empty values
    const managedVars = {};
    for (const [key, value] of Object.entries(secrets)) {
      if (key.startsWith('EXPO_PUBLIC_') || EAS_EXTRA_VARS.includes(key)) {
        if (value !== '') {
          managedVars[key] = value;
        }
      }
    }

    const varCount = Object.keys(managedVars).length;

    for (const profileName of profiles) {
      // Ensure profile exists
      if (!easConfig.build[profileName]) {
        easConfig.build[profileName] = {};
      }

      // Merge: preserve unmanaged vars, set managed vars from Doppler
      const existingEnv = easConfig.build[profileName].env || {};
      const mergedEnv = {};

      // Keep any vars not managed by this script
      for (const [key, value] of Object.entries(existingEnv)) {
        if (!key.startsWith('EXPO_PUBLIC_') && !EAS_EXTRA_VARS.includes(key)) {
          mergedEnv[key] = value;
        }
      }

      // Set all managed vars from Doppler
      for (const [key, value] of Object.entries(managedVars)) {
        mergedEnv[key] = value;
      }

      // Sort keys for deterministic output
      const sortedEnv = {};
      for (const key of Object.keys(mergedEnv).sort()) {
        sortedEnv[key] = mergedEnv[key];
      }

      easConfig.build[profileName].env = sortedEnv;

      console.log(
        `\x1b[32m[Doppler]\x1b[0m   ${profileName} \u2190 ${envKey}: ` +
          `${varCount} vars synced`
      );
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    console.log(
      '\x1b[33m[Doppler]\x1b[0m   No eas.json profiles updated ' +
        '(could not access any Doppler configs)'
    );
    return;
  }

  // Deterministic formatting (matches Prettier for 2-space JSON)
  const output = JSON.stringify(easConfig, null, 2) + '\n';

  // Only write if content actually changed
  const existing = fs.readFileSync(easPath, 'utf-8');
  if (output === existing) {
    console.log(
      '\x1b[90m[Doppler]\x1b[0m   eas.json unchanged \u2014 no write needed'
    );
    return;
  }

  fs.writeFileSync(easPath, output, 'utf-8');
  console.log(
    `\x1b[32m[Doppler]\x1b[0m   eas.json updated ` +
      `(${updatedCount} profiles, ${skippedCount} skipped)`
  );
}

function main() {
  console.log(
    '\n\x1b[36m\x1b[1m[Doppler]\x1b[0m Setting up local environment...\n'
  );

  if (isCI()) {
    console.log(
      '\x1b[33m[Doppler]\x1b[0m Skipping env generation (CI environment)\n'
    );
    process.exit(0);
  }

  if (!isDopplerInstalled()) {
    console.log('\x1b[33m[Doppler]\x1b[0m Doppler CLI not installed.\n');
    console.log('   To set up Doppler for local development:');
    console.log('   1. Install CLI: https://docs.doppler.com/docs/install-cli');
    console.log('   2. Run: doppler login');
    console.log(
      '   3. Run: doppler setup  (select project: mentomate, config: dev)'
    );
    console.log('   4. Run: pnpm env:sync\n');
    process.exit(0);
  }

  if (!isDopplerConfigured()) {
    console.log(
      '\x1b[33m[Doppler]\x1b[0m Doppler not configured for this project.\n'
    );
    console.log(
      '   Run: doppler setup  (select project: mentomate, config: stg)'
    );
    console.log('   Then: pnpm env:sync\n');
    process.exit(0);
  }

  // Check staleness of first output file
  const primaryFile = OUTPUT_FILES[0].path;
  if (fs.existsSync(primaryFile) && checkStaleness(primaryFile)) {
    console.log(
      `\x1b[33m[Doppler]\x1b[0m Env files are over ${STALENESS_DAYS} days old — regenerating...\n`
    );
  }

  const content = downloadSecrets(DOPPLER_CONFIG);
  if (!content) {
    console.log(
      '\x1b[31m[Doppler]\x1b[0m Failed to download secrets from Doppler'
    );
    console.log('   Check your Doppler configuration and try: pnpm env:sync\n');
    console.log(
      '\x1b[31m[Doppler]\x1b[0m Local secrets were NOT synced. API and mobile may fail at runtime.\n'
    );
    process.exit(1);
  }

  const header = `# Generated by Doppler (config: ${DOPPLER_CONFIG})
# Do not edit manually — run 'pnpm env:sync' to regenerate
# Generated at: ${new Date().toISOString()}
`;

  for (const output of OUTPUT_FILES) {
    const dir = path.dirname(output.path);
    if (!fs.existsSync(dir)) {
      console.log(
        `\x1b[33m[Doppler]\x1b[0m Skipping ${output.description} (directory not found)`
      );
      continue;
    }
    const outputContent = output.filter
      ? content.split('\n').filter(output.filter).join('\n')
      : content;
    fs.writeFileSync(output.path, header + '\n' + outputContent, {
      mode: 0o600,
    });
    console.log(`\x1b[32m[Doppler]\x1b[0m Generated ${output.description}`);
  }

  // Sync EXPO_PUBLIC_* vars to eas.json build profiles (dev/stg/prd)
  updateEasJson();

  console.log(
    '\n   \x1b[90mTo regenerate after secret changes:\x1b[0m pnpm env:sync\n'
  );

  // Sync secrets to Cloudflare Workers (non-fatal — skips if wrangler not authenticated)
  try {
    const { syncSecrets } = require('./sync-secrets');
    syncSecrets(['stg']);
  } catch (err) {
    console.log(
      '\x1b[33m[Doppler]\x1b[0m Cloudflare Workers sync skipped:',
      err.message
    );
    console.log('   To sync manually: pnpm secrets:sync\n');
  }
}

main();
