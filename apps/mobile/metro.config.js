const path = require('path');
const fs = require('fs');
const { mergeConfig } = require('metro-config');
const { withNativeWind } = require('nativewind/metro');

const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// [WI-260 / DS-171] Disable Sentry's source-context Metro middleware. With the
// default `getSentryExpoConfig(__dirname)`, @sentry/react-native installs a
// `/__sentry/context` middleware that accepts JSON stack frames and reads
// `frame.filename` directly with `fs.readFile`, returning the surrounding
// source lines. There is no path restriction to the project root and no
// authentication; Expo start defaults to LAN mode and Metro binds without an
// explicit localhost-only bind, so anyone on the same network (or a tunnel
// reaching the dev server) can request a few lines from arbitrary readable
// local files by varying `lineno`. We don't rely on this middleware for
// debugging — turn it off so the dev server stops handing out file contents.
const defaultConfig = getSentryExpoConfig(__dirname, {
  enableSourceContextInDevelopment: false,
});
const { assetExts, sourceExts } = defaultConfig.resolver;

const monorepoRoot = path.resolve(__dirname, '../..');
const monorepoRealRoot = fs.realpathSync.native(monorepoRoot);
const currentCheckoutIsWorktree = /[/\\]\.worktrees[/\\]/.test(
  monorepoRealRoot,
);

// [BUG-725] Exclude the `apps/mobile/src/app/dev-only/` Expo Router segment
// from non-E2E bundles. The directory contains seed routes
// (`seed-pending-redirect`, `seed-preview-state`) that exist only to support
// Maestro flows by priming SecureStore state without waiting for real TTLs.
// Each file carries a runtime `EXPO_PUBLIC_E2E === 'true'` guard, but the
// component code (including the seed helpers) is still shipped in the JS
// bundle when the runtime guard is the only line of defence — increasing the
// attack surface on production APKs and bloating the bundle. Blocking the
// directory at the resolver level means the files never enter the bundle in
// the first place when E2E is off, and the runtime guard stays as
// defence-in-depth for E2E builds. E2E builds are produced with
// `EXPO_PUBLIC_E2E=true` (see `apps/mobile/eas.json` env profiles + CI APK
// build steps).
const isE2EBuild = process.env.EXPO_PUBLIC_E2E === 'true';
const devOnlyBlockList = isE2EBuild
  ? []
  : [/[/\\]apps[/\\]mobile[/\\]src[/\\]app[/\\]dev-only[/\\].*/];

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
    blockList: [
      /\.test\.[jt]sx?$/,
      /\.stories\.[jt]sx?$/,
      /[/\\]__mocks__[/\\].*/,
      /[/\\]test-utils[/\\].*/,
      ...(currentCheckoutIsWorktree ? [] : [/[/\\]\.worktrees[/\\].*/]),
      ...devOnlyBlockList,
    ],
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
