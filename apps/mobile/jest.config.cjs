const path = require('path');

module.exports = {
  displayName: '@eduagent/mobile',
  rootDir: '../..',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/apps/mobile/src/test-setup.ts'],
  moduleNameMapper: {
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
};
