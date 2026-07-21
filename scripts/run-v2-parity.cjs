#!/usr/bin/env node

'use strict';

const { spawnSync } = require('node:child_process');
const { dirname, join } = require('node:path');

const V2_PARITY_JEST_FLAGS = Object.freeze([
  '--config',
  'apps/mobile/jest.config.cjs',
  '--no-coverage',
  '--forceExit',
]);
const V2_PARITY_TEST_PATTERNS = Object.freeze([
  'apps/mobile/src/app/\\(app\\)/mentor\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/subjects\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/journal/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/subject-hub/\\[subjectId\\]/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/session/index\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/quiz/results\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/dictation/review\\.test\\.tsx',
  'apps/mobile/src/components/support/PersonScopeJournalPlaceholder\\.test\\.tsx',
  'apps/mobile/src/components/support/SupportHubJournalTab\\.test\\.tsx',
  'apps/mobile/src/components/support/PersonScopeStructuralSubjects\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/link/initiate\\.test\\.tsx',
  'apps/mobile/src/app/\\(app\\)/link/\\[contractId\\]\\.test\\.tsx',
]);

function resolveJestCliPath() {
  return join(dirname(require.resolve('jest/package.json')), 'bin', 'jest.js');
}

function runV2Parity({
  jestCliPath = resolveJestCliPath(),
  testPatterns = V2_PARITY_TEST_PATTERNS,
  spawnSyncImpl = spawnSync,
} = {}) {
  const result = spawnSyncImpl(
    process.execPath,
    [jestCliPath, ...V2_PARITY_JEST_FLAGS, ...testPatterns],
    { stdio: 'inherit', shell: false },
  );

  if (result.error) {
    console.error(`Failed to start Jest: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  process.exitCode = runV2Parity();
}

module.exports = {
  V2_PARITY_TEST_PATTERNS,
  runV2Parity,
};
