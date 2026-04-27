/**
 * Regression guard for [BUG-790 / CFG-10]: build-time and test-time tools
 * must live in devDependencies, not dependencies.
 *
 * Previously several Metro bundler and Expo prebuild plugins were listed in
 * the runtime `dependencies` block of apps/mobile/package.json, which:
 *   - inflates the runtime dependency surface in vulnerability scans
 *   - misleads consumers about what is actually shipped to the device
 *   - makes it harder to reason about EAS Build vs runtime install footprints
 *
 * Metro (`@expo/metro-config`, `react-native-svg-transformer`) only runs at
 * bundle-build time, and Expo `config-plugins` run during `expo prebuild`.
 * None of these are required at runtime on the device.
 *
 * EAS Build installs both `dependencies` and `devDependencies` by default, so
 * moving these to devDeps does not affect the build pipeline.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const BUILD_ONLY_DEPS = [
  '@expo/metro-config',
  '@expo/config-plugins',
  'react-native-svg-transformer',
  'metro-config',
  'metro-resolver',
  'jest-expo',
  '@testing-library/react-native',
];

describe('mobile package.json classification [BUG-790]', () => {
  for (const name of BUILD_ONLY_DEPS) {
    it(`${name} is a devDependency, not a runtime dependency`, () => {
      const inDev = !!pkg.devDependencies?.[name];
      const inRuntime = !!pkg.dependencies?.[name];
      expect({ name, inDev, inRuntime }).toEqual({
        name,
        inDev: true,
        inRuntime: false,
      });
    });
  }
});
