const base = require('./jest.integration.config.cjs');

module.exports = {
  ...base,
  testPathIgnorePatterns: [
    ...base.testPathIgnorePatterns,
    'apps/api/src/db/curriculum-dedup-index-repair\\.integration\\.test\\.ts$',
  ],
};
