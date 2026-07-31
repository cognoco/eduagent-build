const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');

const realSpawnSync = childProcess.spawnSync;

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

childProcess.spawnSync = function spawnSync(binary, args = [], ...rest) {
  if (binary !== 'doppler') {
    return Reflect.apply(realSpawnSync, this, [binary, args, ...rest]);
  }

  if (args.length === 1 && args[0] === '--version') {
    return fakeResult(0);
  }

  process.stdout.write(`ARGS:${args.join(' ')}\n`);
  return fakeResult(args[0] === '--exit-check' ? 7 : 0);
};

// doppler-run.mjs imports spawnSync as a named ESM export. Keep that binding in
// sync with the patched CommonJS built-in before the wrapper module loads.
syncBuiltinESMExports();
