const childProcess = require('node:child_process');
const { appendFileSync } = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const { basename } = require('node:path');

const realSpawnSync = childProcess.spawnSync;

childProcess.spawnSync = function fakePnpmSpawnSync(
  command,
  args = [],
  options = {},
) {
  if (
    command === process.execPath &&
    basename(args[0] ?? '') === 'verify-api-integration-schema.mjs' &&
    process.env.FAKE_SCHEMA_VERIFY_RESULT
  ) {
    appendFileSync(
      process.env.FAKE_SCHEMA_VERIFY_MARKER,
      `${process.env.FAKE_SCHEMA_VERIFY_RESULT}\n`,
    );
    const compatible = process.env.FAKE_SCHEMA_VERIFY_RESULT === 'compatible';
    const stderr = compatible
      ? ''
      : 'Schema drift detected; refused before Jest. No schema mutation was attempted. Obtain named operator authorization.\n';
    return {
      pid: 1,
      output: [null, '', stderr],
      stdout: '',
      stderr,
      status: compatible ? 0 : 1,
      signal: null,
      error: undefined,
    };
  }

  const pnpmCli = process.env.FAKE_PNPM_CLI;
  const viaNode = command === process.execPath && args[0] === pnpmCli;
  const direct = command === pnpmCli;

  if (command === 'corepack' && pnpmCli) {
    appendFileSync(process.env.FAKE_COREPACK_MARKER, `${args.join(' ')}\n`);
    return {
      pid: 1,
      output: null,
      stdout: null,
      stderr: null,
      status: null,
      signal: null,
      error: new Error('bare corepack blocked by fake pnpm preload'),
    };
  }

  if (!viaNode && !direct) {
    return realSpawnSync.call(childProcess, command, args, options);
  }

  const pnpmArgs = viaNode ? args.slice(1) : args;
  appendFileSync(
    process.env.FAKE_PNPM_LAUNCH_MARKER,
    `${JSON.stringify({ command, args })}\n`,
  );

  const stdout =
    pnpmArgs.length === 1 && pnpmArgs[0] === '--version'
      ? process.env.FAKE_PNPM_VERSION || '10.19.0'
      : '';

  return {
    pid: 1,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: Number(process.env.FAKE_PNPM_EXIT || 0),
    signal: null,
    error: undefined,
  };
};

syncBuiltinESMExports();
