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
    // TextInput native component stubs — see jest.text-input-native-mock.js for rationale.
    // jest.polyfills.js sets Platform.OS='ios' at module-eval time, leaving AndroidTextInput
    // undefined. Tests that override Platform.OS to 'android' at test-time then crash when
    // react-native-css-interop's wrapJSX reads type.displayName on the undefined component.
    //
    // moduleNameMapper keys match the raw require() string. TextInput.js uses relative requires
    // ('./AndroidTextInputNativeComponent'), so we match on the basename pattern. The more-specific
    // full-path patterns below are kept as belt-and-suspenders for any code that imports by full
    // package path.
    '.*AndroidTextInputNativeComponent.*':
      '<rootDir>/apps/mobile/jest.text-input-native-mock.js',
    '.*RCTSingelineTextInputNativeComponent.*':
      '<rootDir>/apps/mobile/jest.text-input-native-mock.js',
    '.*RCTMultilineTextInputNativeComponent.*':
      '<rootDir>/apps/mobile/jest.text-input-native-mock.js',
    // Mock TextInput itself so it renders a stable host component regardless of
    // Platform.OS — the module-level platform conditional caches undefined for
    // the non-default platform's native component, crashing on platform override.
    // Match both the absolute (`react-native/Libraries/.../TextInput`) and
    // the relative (`./Libraries/.../TextInput` from `react-native/index.js`)
    // require strings. `(?:.*[\\\\/])?` allows zero-or-more leading path
    // segments before the canonical tail.
    '(?:^|[\\\\/])Libraries/Components/TextInput/TextInput$':
      '<rootDir>/apps/mobile/jest.text-input-mock.js',
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
