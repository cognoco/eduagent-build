const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withNativeWind } = require('nativewind/metro');

const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const defaultConfig = getSentryExpoConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

const monorepoRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  projectRoot: __dirname,
  // TODO: unstable_ API — verify dev-client bundle loading still works after Metro/SDK upgrades
  server: { unstable_serverRoot: monorepoRoot }, // Required for expo-dev-client in monorepo — see docs/e2e-emulator-issues.md Issue 8
  watchFolders: [monorepoRoot],
  cacheVersion: '@eduagent/mobile',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    blockList: [/\.test\.[jt]sx?$/, /[/\\]\.worktrees[/\\].*/],
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
};

module.exports = withNativeWind(mergeConfig(defaultConfig, customConfig), {
  input: './global.css',
  // Windows: bypass virtual module system (Map key path mismatches)
  forceWriteFileSystem: process.platform === 'win32',
});
