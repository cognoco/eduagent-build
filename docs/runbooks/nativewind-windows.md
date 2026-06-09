# NativeWind Windows Runbook

## Purpose

This runbook captures the Windows-specific NativeWind 4.2.1 fixes for
`react-native-css-interop@0.2.1`. The durable implementation lives in code:

- `package.json` -> `pnpm.patchedDependencies`
- `patches/react-native-css-interop@0.2.1.patch`
- `apps/mobile/metro.config.js`

Do not remove or regenerate the patch without verifying Android styling and a
clean web export on Windows.

## Symptoms

- NativeWind styles do not render on Android through Expo Go or a dev-client
  build on Windows.
- Clean Expo web export fails with a SHA-1 error for
  `react-native-css-interop/.cache/web.css`.

## Current Fixes

The pnpm patch applies these upstream-package fixes during `pnpm install`:

1. Normalizes resolver file paths in `dist/metro/index.js` so Windows
   backslashes compare correctly with slash-normalized inputs.
2. Passes an absolute `outputDirectory` to transformer config instead of a
   cwd-relative path that Metro workers may resolve from a different base.
3. Resolves transformer filenames against `projectRoot`, then normalizes paths
   before comparing with `outputDirectory`.
4. Resolves the runtime native styles module through `require.resolve(...,
   { paths: [projectRoot] })` so pnpm does not load a second copy's style
   store.
5. Pre-creates the `web.css` cache file before Metro crawls it for clean web
   exports.

The repo-side Metro config also sets:

```js
forceWriteFileSystem: process.platform === 'win32'
```

This bypasses the virtual module path-key mismatch seen on Windows.

## Android Launch Notes

For Windows Android emulator sessions:

```bash
EXPO_NO_DEPENDENCY_VALIDATION=1 REACT_NATIVE_PACKAGER_HOSTNAME=localhost npx expo start --port 8081 --clear
adb reverse tcp:8081 tcp:8081
adb shell am force-stop host.exp.exponent
adb shell am start -n host.exp.exponent/.experience.HomeActivity
adb shell am start -a android.intent.action.VIEW -d "exp://localhost:8081" host.exp.exponent
```

Notes:

- `--clear` makes the first bundle request slow because Metro rebuilds caches.
- Expo Go can cache an error state; force-stop before relaunching.
- `EXPO_NO_DEPENDENCY_VALIDATION=1` avoids the Metro dependency-validation
  crash seen with this setup.
- `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` is required for emulator
  connectivity.
- In Git Bash/MSYS shells, set `MSYS_NO_PATHCONV=1` for `adb shell` commands
  containing path-like arguments.

## Verification Before Removing The Patch

Before removing or replacing `patches/react-native-css-interop@0.2.1.patch`:

1. Run `pnpm install` and confirm the patch applies cleanly.
2. Start the mobile app on a Windows Android emulator and verify NativeWind
   styles render on a screen that uses `className`.
3. Run a clean Expo web export on Windows and confirm the `web.css` SHA-1 error
   does not reproduce.
4. Confirm `apps/mobile/metro.config.js` no longer needs
   `forceWriteFileSystem` before removing it.
