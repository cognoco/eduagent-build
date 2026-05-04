// Pre-import shim: runs via `setupFiles` (before the test framework and
// before any `require('react-native')` resolves), distinct from the
// `setupFilesAfterEnv` test-setup.ts which runs post-RN-import.
//
// Without this, `react-native/Libraries/BatchedBridge/NativeModules.js`
// throws at module-evaluation time:
//   Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules
// jest-expo normally seeds the bridge config, but a few transitive imports
// (notably anything pulling RN before jest-expo's setup completes) reach
// NativeModules first. Seeding the global here is the safe pre-import fix.

if (typeof global.__fbBatchedBridgeConfig === 'undefined') {
  global.__fbBatchedBridgeConfig = {
    remoteModuleConfig: [],
    localModulesConfig: [],
  };
}
