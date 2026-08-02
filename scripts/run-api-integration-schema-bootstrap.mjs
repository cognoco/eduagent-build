#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOPPLER_WRAPPER = join(REPO_ROOT, 'scripts', 'doppler-run.mjs');
const BOOTSTRAP_SCRIPT = join(
  REPO_ROOT,
  'scripts',
  'bootstrap-api-integration-schema.mjs',
);
const REQUIRED_FLAGS = ['--revision', '--operator-ruling', '--receipt'];

function refuse() {
  throw new Error(
    'Usage: pnpm db:bootstrap:api-integration --revision <exact-40-char-sha> ' +
      '--operator-ruling <named-ruling-reference> --receipt .workitem-artifacts/WI-2939/<receipt>.json',
  );
}

function validatedArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.length !== REQUIRED_FLAGS.length * 2) refuse();
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!REQUIRED_FLAGS.includes(flag) || seen.has(flag) || !value) refuse();
    seen.add(flag);
  }
  if (seen.size !== REQUIRED_FLAGS.length) refuse();
  return args;
}

try {
  const forwarded = validatedArgs(process.argv.slice(2));
  const result = spawnSync(
    process.execPath,
    [
      DOPPLER_WRAPPER,
      'run',
      '--project',
      'mentomate',
      '--config',
      'dev_integration',
      '--',
      process.execPath,
      BOOTSTRAP_SCRIPT,
      ...forwarded,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
