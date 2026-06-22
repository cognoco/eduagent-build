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
import { parse } from 'yaml';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const rootLockfile = parse(
  readFileSync(resolve(__dirname, '../../../../pnpm-lock.yaml'), 'utf8'),
) as {
  packages?: Record<string, unknown>;
  snapshots?: Record<string, { dependencies?: Record<string, string> }>;
};

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8'),
) as {
  pnpm?: { overrides?: Record<string, string> };
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

function parseVersion(version: string): [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse semver from ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(version: string, minimum: string): boolean {
  const actualParts = parseVersion(version);
  const minimumParts = parseVersion(minimum);
  for (const index of [0, 1, 2] as const) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
}

describe('mobile Clerk dependency security floor [WI-909]', () => {
  it('@clerk/clerk-expo stays at the CVE-2026-41248 fixed floor', () => {
    const declaredVersion = pkg.dependencies?.['@clerk/clerk-expo'];

    expect(declaredVersion).toBeDefined();
    expect(isAtLeast(declaredVersion ?? '', '2.19.36')).toBe(true);
  });

  it('@clerk/clerk-expo lockfile snapshots do not pull vulnerable @clerk/shared', () => {
    const clerkExpoSnapshots = Object.entries(rootLockfile.snapshots ?? {})
      .filter(([key]) => key.startsWith('@clerk/clerk-expo@'))
      .map(([key, snapshot]) => ({
        key,
        sharedVersion: snapshot.dependencies?.['@clerk/shared'],
      }));

    expect(clerkExpoSnapshots.length).toBeGreaterThan(0);
    for (const snapshot of clerkExpoSnapshots) {
      expect({
        package: snapshot.key,
        sharedVersion: snapshot.sharedVersion,
      }).toEqual({
        package: snapshot.key,
        sharedVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
      });
      expect(isAtLeast(snapshot.sharedVersion ?? '', '3.47.4')).toBe(true);
    }
  });
});

describe('workspace protobufjs dependency security floor [WI-1029]', () => {
  it('uses parent-scoped overrides for vulnerable OpenTelemetry protobufjs paths', () => {
    expect(rootPkg.pnpm?.overrides).toEqual(
      expect.objectContaining({
        '@opentelemetry/otlp-transformer>protobufjs': '8.6.4',
        '@grpc/proto-loader>protobufjs': '7.6.4',
      }),
    );
  });

  it('lockfile no longer resolves vulnerable protobufjs versions', () => {
    const packageKeys = Object.keys(rootLockfile.packages ?? {});

    expect(packageKeys).not.toContain('protobufjs@8.0.1');
    expect(packageKeys).not.toContain('protobufjs@7.5.6');
    expect(packageKeys).toContain('protobufjs@8.6.4');
    expect(packageKeys).toContain('protobufjs@7.6.4');
  });

  it('OpenTelemetry and gRPC snapshots resolve patched protobufjs versions', () => {
    const snapshots = rootLockfile.snapshots ?? {};

    for (const [key, snapshot] of Object.entries(snapshots)) {
      if (key.startsWith('@opentelemetry/otlp-transformer@')) {
        expect(snapshot.dependencies?.protobufjs).toBe('8.6.4');
      }

      if (key.startsWith('@grpc/proto-loader@')) {
        expect(snapshot.dependencies?.protobufjs).toBe('7.6.4');
      }
    }
  });
});
