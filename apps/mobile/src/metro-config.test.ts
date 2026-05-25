/**
 * [WI-260 / DS-171] Sentry source-context middleware must be disabled in Metro.
 *
 * `getSentryExpoConfig(__dirname)` with default options enables a
 * `/__sentry/context` Metro middleware that reads `frame.filename` directly
 * with `fs.readFile` and returns source-context lines in the response.
 * There is no path restriction to the project root and no authentication;
 * Expo start defaults to LAN mode and Metro is started without an explicit
 * localhost bind, so anyone who can reach the dev server can request
 * arbitrary readable local files a few lines at a time.
 *
 * The fix is to pass `{ enableSourceContextInDevelopment: false }` to
 * `getSentryExpoConfig`. This test pins both the static source (cheap, very
 * specific failure mode) and the runtime call shape (catches a refactor
 * that drops the option while keeping the literal text in a comment).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const METRO_CONFIG_PATH = resolve(__dirname, '..', 'metro.config.js');

describe('apps/mobile/metro.config.js — Sentry source-context middleware [WI-260]', () => {
  it('source contains the explicit enableSourceContextInDevelopment: false option', () => {
    const source = readFileSync(METRO_CONFIG_PATH, 'utf-8');
    // Static source check: ensures a future refactor cannot silently drop
    // the option by removing it from the call site even if the runtime
    // mock-based assertion below is bypassed.
    expect(source).toMatch(/enableSourceContextInDevelopment:\s*false/);
    // And that the option is being passed to getSentryExpoConfig (not, say,
    // sitting as an orphan in customConfig where it has no effect).
    expect(source).toMatch(
      /getSentryExpoConfig\([^)]*enableSourceContextInDevelopment:\s*false/s,
    );
  });

  it('invokes getSentryExpoConfig with enableSourceContextInDevelopment disabled at runtime', () => {
    jest.resetModules();

    const getSentryExpoConfig = jest.fn(
      (_dirname: string, _options?: Record<string, unknown>) => ({
        resolver: { assetExts: ['png'], sourceExts: ['ts'] },
        transformer: {},
      }),
    );
    jest.doMock('@sentry/react-native/metro', () => ({ getSentryExpoConfig })); // gc1-allow: external-boundary: @sentry/react-native native metro plugin
    jest.doMock('metro-config', () => ({
      // gc1-allow: external-boundary: metro-config is a native bundler module not available in JSDOM
      mergeConfig: (a: object, b: object) => ({ ...a, ...b }),
    }));
    jest.doMock('nativewind/metro', () => ({
      // gc1-allow: external-boundary: nativewind/metro is a native bundler plugin not available in JSDOM
      withNativeWind: (config: unknown) => config,
    }));

    require('../metro.config.js');

    expect(getSentryExpoConfig).toHaveBeenCalledTimes(1);
    const callArgs = getSentryExpoConfig.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs?.[1]).toEqual(
      expect.objectContaining({ enableSourceContextInDevelopment: false }),
    );
  });
});
