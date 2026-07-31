const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { join } = require('node:path');

const realSpawnSync = childProcess.spawnSync;
const childBoundary = join(__dirname, 'child-boundary.cjs');

function fakeResult(status) {
  return {
    pid: 0,
    output: [null, null, null],
    stdout: null,
    stderr: null,
    status,
    signal: null,
  };
}

function runChildBoundary(command, args, options) {
  return realSpawnSync(
    process.execPath,
    [childBoundary, command, ...args],
    options,
  );
}

function pnpmArgs(binary, args) {
  const pnpmCli = process.env.npm_execpath;
  if (binary === pnpmCli) return args;
  if (binary === process.execPath && args[0] === pnpmCli) return args.slice(1);
  return null;
}

childProcess.spawnSync = function spawnSync(binary, args = [], options) {
  if (process.env.DOPPLER_RUN_FAKE_EXEC_CHILD === '1') {
    const packageManagerArgs = pnpmArgs(binary, args);
    if (packageManagerArgs?.[0] === 'exec' && packageManagerArgs[1] === 'nx') {
      return runChildBoundary('nx', packageManagerArgs.slice(2), options);
    }
    if (
      packageManagerArgs?.[0] === 'exec' &&
      packageManagerArgs[1] === 'jest'
    ) {
      return runChildBoundary('jest', packageManagerArgs.slice(2), options);
    }
  }

  if (binary !== 'doppler') {
    return Reflect.apply(realSpawnSync, this, [binary, args, options]);
  }

  if (args.length === 1 && args[0] === '--version') {
    return fakeResult(0);
  }

  process.stdout.write(`ARGS:${args.join(' ')}\n`);
  if (process.env.DOPPLER_RUN_FAKE_EXEC_CHILD === '1') {
    const separator = args.indexOf('--');
    const [command, ...commandArgs] = args.slice(separator + 1);
    if (separator >= 0 && command) {
      if (command === 'nx' || command === 'jest') {
        return runChildBoundary(command, commandArgs, options);
      }
      return Reflect.apply(realSpawnSync, this, [
        command,
        commandArgs,
        options,
      ]);
    }
  }
  return fakeResult(args[0] === '--exit-check' ? 7 : 0);
};

// doppler-run.mjs imports spawnSync as a named ESM export. Keep that binding in
// sync with the patched CommonJS built-in before the wrapper module loads.
syncBuiltinESMExports();
