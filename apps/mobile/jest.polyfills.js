// Pre-import shim: runs via `setupFiles` (before the test framework and
// before any `require('react-native')` resolves), distinct from the
// `setupFilesAfterEnv` test-setup.ts which runs post-RN-import.
//
// Two RN module-evaluation invariants fire at require-time when a transitive
// import (e.g. expo-modules-core → Platform.ios.js) reaches into native
// before jest-expo's preset finishes wiring things up:
//
//   1. NativeModules.js → "Invariant Violation: __fbBatchedBridgeConfig is
//      not set, cannot invoke native modules"
//   2. TurboModuleRegistry.getEnforcing('PlatformConstants') →
//      "'PlatformConstants' could not be found. Verify that a module by this
//      name is registered in the native binary."
//
// Both must be stubbed BEFORE any `require('react-native')` runs — that
// rules out test-setup.ts (setupFilesAfterEnv) and per-file jest.mock.

// Pre-claim `__ExpoImportMetaRegistry` as non-configurable so expo's
// `installGlobal()` (winter/runtime.native.ts) early-returns instead of
// installing a lazy getter. The lazy getter calls `require()` from a captured
// scope long after module-eval; jest 30 rejects that with
// "ReferenceError: You are trying to `import` a file outside of the scope of
// the test code". Owning the property up front sidesteps the install entirely.
// installGlobal source: expo/src/winter/installGlobal.ts:90 — the
// `if (descriptor && !configurable)` branch logs and returns.
Object.defineProperty(global, '__ExpoImportMetaRegistry', {
  value: {
    get url() {
      return null;
    },
  },
  configurable: false,
  writable: true,
  enumerable: false,
});

// Same pattern for `structuredClone`: expo's installGlobal would otherwise
// replace Node's native `structuredClone` with a lazy getter that requires
// `@ungap/structured-clone` long after module-eval, tripping the same
// jest-30 "outside test scope" guard. Pre-claim it as non-configurable so
// installGlobal early-returns and Node's native polyfill stays in place.
if (typeof globalThis.structuredClone === 'function') {
  const native = globalThis.structuredClone;
  Object.defineProperty(global, 'structuredClone', {
    value: native,
    configurable: false,
    writable: true,
    enumerable: false,
  });
}

// RN's polyfillGlobal('FormData', ...) in setUpXHR.js overwrites global.FormData
// with RN's FormData, which crashes in Node.js test environments when append() is
// called with a plain-object file reference { uri, name, type } — resulting in
// "TypeError: Cannot read properties of undefined (reading 'push')".
// Pre-claim FormData as non-configurable so polyfillGlobal's Object.defineProperty
// call is a no-op, leaving Node.js's built-in FormData in place. Node's FormData
// converts plain objects via toString() without crashing; the fetch body content
// is irrelevant since tests use mockFetch.
if (typeof globalThis.FormData === 'function') {
  const nativeFormData = globalThis.FormData;
  Object.defineProperty(global, 'FormData', {
    value: nativeFormData,
    configurable: false,
    writable: false,
    enumerable: false,
  });
}

if (typeof global.__fbBatchedBridgeConfig === 'undefined') {
  global.__fbBatchedBridgeConfig = {
    remoteModuleConfig: [],
    localModulesConfig: [],
  };
}

// PlatformConstants is the most-queried TurboModule at RN module-eval time
// (Platform.ios.js / Platform.android.js read it synchronously). Provide a
// constants record covering both iOS and Android fields so whichever
// Platform.* file jest-expo loads gets satisfied. Other TurboModules return
// a Proxy whose property accesses are no-ops, which is enough to clear
// require-time chains without pretending to implement real native behavior.
if (typeof global.__turboModuleProxy === 'undefined') {
  const platformConstants = {
    isTesting: true,
    reactNativeVersion: { major: 0, minor: 81, patch: 5 },
    forceTouchAvailable: false,
    osVersion: '17.0',
    systemName: 'iOS',
    interfaceIdiom: 'phone',
    // Android-side fields (in case Platform.android.js is the one resolved):
    Version: 33,
    Release: '13',
    Serial: 'unknown',
    Fingerprint: 'jest',
    Model: 'jest',
    ServerHost: 'localhost',
    uiMode: 'normal',
    Brand: 'jest',
    Manufacturer: 'jest',
  };

  // Generic TurboModule stub: every property access returns a no-op function
  // that also has no-op props. expo-modules-core's
  // TurboModuleToExpoModuleProxy treats arbitrary `module[eventName]` lookups
  // as functions (event emitters), so returning undefined breaks
  // setUpJsLogger.fx.ts and similar fx files. A function-typed Proxy keeps
  // all those call sites safe without pretending to implement real behavior.
  const noopFn = () => ({ remove: () => undefined });
  const genericStub = new Proxy(noopFn, {
    get: (_target, prop) => {
      if (prop === 'getConstants') return () => ({});
      return noopFn;
    },
  });

  // RN's Dimensions.js calls NativeDeviceInfo.getConstants().Dimensions at
  // require-time and immediately reads .window/.screen — so the stub for
  // DeviceInfo must return a fully-shaped Dimensions payload.
  const deviceInfoConstants = {
    Dimensions: {
      window: { width: 375, height: 812, scale: 2, fontScale: 1 },
      screen: { width: 375, height: 812, scale: 2, fontScale: 1 },
      windowPhysicalPixels: {
        width: 750,
        height: 1624,
        scale: 2,
        fontScale: 1,
        densityDpi: 320,
      },
      screenPhysicalPixels: {
        width: 750,
        height: 1624,
        scale: 2,
        fontScale: 1,
        densityDpi: 320,
      },
    },
    isIPhoneX_deprecated: false,
  };

  // RN's Appearance.js calls NativeAppearance.getColorScheme() at require
  // time and asserts the value is 'dark' | 'light' | null. The generic stub
  // returns a subscription-shaped object, which fails the invariant.
  const appearanceStub = {
    getColorScheme: () => 'light',
    setColorScheme: () => undefined,
    addListener: () => ({ remove: () => undefined }),
    removeListeners: () => undefined,
  };

  // I18nManager's getConstants drives RTL detection at require time.
  const i18nManagerConstants = {
    isRTL: false,
    doLeftAndRightSwapInRTL: true,
    localeIdentifier: 'en_US',
  };

  global.__turboModuleProxy = (name) => {
    if (name === 'PlatformConstants') {
      return { getConstants: () => platformConstants };
    }
    if (name === 'DeviceInfo') {
      return { getConstants: () => deviceInfoConstants };
    }
    if (name === 'Appearance') {
      return appearanceStub;
    }
    if (name === 'I18nManager') {
      return { getConstants: () => i18nManagerConstants };
    }
    if (name === 'SourceCode') {
      // RN's getDevServer.js calls NativeSourceCode.getConstants().scriptURL
      // and immediately .match()s it; an undefined value throws at module
      // require-time of expo's async-require/messageSocket.native.
      return { getConstants: () => ({ scriptURL: 'http://localhost/' }) };
    }
    return genericStub;
  };
}
