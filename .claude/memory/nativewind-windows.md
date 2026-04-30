---
name: NativeWind 4.2.1 on Windows — Patches Required
description: 5 fixes for react-native-css-interop on Windows (backslash paths, pnpm dual copies). Durable via pnpm patchedDependencies.
type: reference
---

# NativeWind 4.2.1 on Windows — Patches Required

## Problem
`react-native-css-interop@0.2.1` has 3 Windows-specific bugs that prevent NativeWind styles from rendering on Android (via Expo Go or dev build).

## Patch — DURABLE via `pnpm patchedDependencies`

Patch file: `patches/react-native-css-interop@0.2.1.patch` (git diff format)
Config: `package.json` → `pnpm.patchedDependencies` → auto-applied on every `pnpm install`.

### Fix 1: `dist/metro/index.js` — resolver slash normalization
**Bug:** `resolved.filePath === options.input` fails (backslash vs forward slash on Windows).
**Fix:** `.replace(/\\/g, '/')` on both sides.

### Fix 2: `dist/metro/index.js` — absolute outputDirectory
**Bug:** Original passes `path.relative(cwd, outputDirectory)` to transformer config, but Metro workers may use different relative base.
**Fix:** Pass `outputDirectory` (absolute) instead.

### Fix 3: `dist/metro/transformer.js` — path.resolve for filename
**Bug:** Metro passes relative filenames to transform workers → `dirname(filename) !== outputDirectory` always true.
**Fix:** `path.resolve(projectRoot, dirname(filename))` + slash normalization on both sides.

### Fix 4: `dist/metro/transformer.js` — require.resolve for pnpm singleton
**Bug:** pnpm dual copies → `injectData` targets wrong copy's styles.js store.
**Fix:** `require.resolve("...styles", {paths: [projectRoot]})` to resolve the same copy as app components.

### Fix 5: `metro.config.js` (our code, committed)
```js
forceWriteFileSystem: process.platform === 'win32'
```
Bypasses virtual module system (Map key path mismatches on Windows).

## Launch Sequence (Android Emulator + Expo Go)
```bash
EXPO_NO_DEPENDENCY_VALIDATION=1 REACT_NATIVE_PACKAGER_HOSTNAME=localhost npx expo start --port 8081 --clear
adb reverse tcp:8081 tcp:8081
# Force stop Expo Go, open home, then deep link:
adb shell am force-stop host.exp.exponent
adb shell am start -n host.exp.exponent/.experience.HomeActivity
adb shell am start -a android.intent.action.VIEW -d "exp://localhost:8081" host.exp.exponent
```

## Key Debugging Insight
- The `--clear` flag means first bundle request is slow (cache rebuild)
- Expo Go caches error state — must force-stop before relaunching
- `EXPO_NO_DEPENDENCY_VALIDATION=1` prevents "Body already read" Metro crash
- `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` required for emulator connectivity
- MSYS_NO_PATHCONV=1 needed for adb shell commands with path-like args
