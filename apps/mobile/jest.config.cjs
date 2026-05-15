const path = require('path');

// CI-only readability defaults — silence captured console output from passing
// tests + custom reporter for GitHub Actions annotations and end-of-log
// summary. See docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md.
const ciDefaults = process.env.CI
  ? {
      silent: true,
      reporters: [
        'default',
        path.join(__dirname, '../../scripts/jest-ci-reporter.cjs'),
      ],
    }
  : {};

module.exports = {
  ...ciDefaults,
  displayName: '@eduagent/mobile',
  rootDir: '../..',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFiles: ['<rootDir>/apps/mobile/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/apps/mobile/src/test-setup.ts'],
  testMatch: ['<rootDir>/apps/mobile/src/**/*.(spec|test).[jt]s?(x)'],
  modulePathIgnorePatterns: ['\\.claude/worktrees'],
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
    // ActivityIndicator has the same Platform.OS module-eval capture pattern.
    '(?:^|[\\\\/])Libraries/Components/ActivityIndicator/ActivityIndicator$':
      '<rootDir>/apps/mobile/jest.activity-indicator-mock.js',
    // Nativewind pnpm haste-map resolution fix — see jest.nativewind-mock.js for rationale.
    // pnpm stores nativewind under a content-addressed path whose dist build requires 'react'
    // via a path Jest cannot resolve without native Metro transforms, yielding:
    //   Cannot find module 'react' from '.../nativewind/dist/index.js'
    // Mapping the bare specifier to a shim prevents the resolution failure without
    // affecting any test that manually mocks 'nativewind' via jest.mock().
    '^nativewind$': '<rootDir>/apps/mobile/jest.nativewind-mock.js',
    // react-native-fit-image pnpm haste-map resolution fix — see jest.fit-image-mock.js.
    // react-native-markdown-display depends on react-native-fit-image, which pnpm places
    // under a hashed path where Jest cannot resolve 'react' without native transforms.
    '^react-native-fit-image$': '<rootDir>/apps/mobile/jest.fit-image-mock.js',
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
