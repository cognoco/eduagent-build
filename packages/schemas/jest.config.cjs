const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@nx-monorepo/schemas',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/schemas',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 10, // TODO: Increase coverage threshold to 60% in Phase 2+ (Stage 5 requirement)
      functions: 10, // TODO: Increase coverage threshold to 60% in Phase 2+ (Stage 5 requirement)
      lines: 10, // TODO: Increase coverage threshold to 60% in Phase 2+ (Stage 5 requirement)
      statements: 10, // TODO: Increase coverage threshold to 60% in Phase 2+ (Stage 5 requirement)
    },
  },
};
