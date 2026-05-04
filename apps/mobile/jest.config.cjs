const path = require('path');

module.exports = {
  displayName: '@eduagent/mobile',
  rootDir: '../..',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFiles: ['<rootDir>/apps/mobile/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/apps/mobile/src/test-setup.ts'],
  testMatch: ['<rootDir>/apps/mobile/src/**/*.(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@eduagent/schemas$': '<rootDir>/packages/schemas/src/index.ts',
    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
    '\\.svg$': '@nx/expo/plugins/jest/svg-mock',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: path.join(__dirname, 'babel.config.js'),
      },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|obj)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  coverageDirectory: '<rootDir>/coverage/apps/mobile',
  // Recycle workers after each file exceeds this memory limit.
  // Prevents OOM when the session test runs after 70+ other suites in one worker process.
  workerIdleMemoryLimit: '512MB',
};
