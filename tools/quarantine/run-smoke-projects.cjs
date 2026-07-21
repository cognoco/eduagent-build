'use strict';

const { spawnSync } = require('node:child_process');
const {
  loadRegistry,
  resolveLanes,
  validate,
} = require('./run-smoke-lanes.cjs');

const VALID_LANES = new Set(['core', 'advisory']);

function parseLaneArgument(args) {
  return args[0] === '--' ? args[1] : args[0];
}

function resolveLaneProjects(lane, now = new Date(), entries = loadRegistry()) {
  if (!VALID_LANES.has(lane)) {
    throw new Error(
      'run-smoke-projects: lane must be "core" or "advisory" (got ' +
        JSON.stringify(lane) +
        ')',
    );
  }

  const problems = validate(entries);
  if (problems.length > 0) {
    throw new Error(
      'run-smoke-projects: quarantine registry is invalid:\n' +
        problems.map((problem) => '  - ' + problem).join('\n'),
    );
  }

  return resolveLanes(now, entries)[lane];
}

function buildPlaywrightArgs(projects) {
  if (projects.length === 0) return null;

  return [
    'exec',
    'playwright',
    'test',
    '-c',
    'apps/mobile/playwright.config.ts',
    ...projects.map((project) => '--project=' + project),
  ];
}

function runLane(lane) {
  const projects = resolveLaneProjects(lane);
  const args = buildPlaywrightArgs(projects);
  if (args === null) {
    console.log(
      'run-smoke-projects: ' + lane + ' lane is empty — nothing to run.',
    );
    return 0;
  }

  console.log('run-smoke-projects: ' + lane + ' lane → ' + projects.join(', '));
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

module.exports = {
  buildPlaywrightArgs,
  parseLaneArgument,
  resolveLaneProjects,
  runLane,
};

if (require.main === module) {
  try {
    process.exitCode = runLane(parseLaneArgument(process.argv.slice(2)));
  } catch (error) {
    console.error('✖ ' + error.message);
    process.exitCode = 1;
  }
}
