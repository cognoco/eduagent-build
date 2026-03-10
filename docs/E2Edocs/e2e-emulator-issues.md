# E2E Testing — Android Emulator Issues Log

**Date:** 2026-03-04
**Machine:** Windows 11 Pro (build 10.0.26220), Intel Core i7-10700 @ 2.90GHz, NVIDIA GeForce RTX 2070 SUPER
**Android SDK:** Emulator 36.4.9, Platform-tools 36.0.2, System image android-34 google_apis x86_64
**AVD:** "New_Device" — 1080x1920, 480dpi, 2048MB RAM, x86_64, Google APIs (no Play Store)
**Java:** OpenJDK 17.0.18 (Temurin)

---

## Issue 1: Maestro CLI — Java ClassNotFoundException on Windows

**What happened:** After installing Maestro 2.2.0 via the official installer (`curl -fsSL "https://get.maestro.mobile.dev" | bash`), running `maestro --version` failed with:

```
Error: Could not find or load main class JvmVersion
Caused by: java.lang.ClassNotFoundException: JvmVersion
Error: Could not find or load main class maestro.cli.AppKt
Caused by: java.lang.ClassNotFoundException: maestro.cli.AppKt
```

**What was tried:**
- Running the bash launcher (`maestro`) — same error
- Running the Windows .bat launcher (`maestro.bat`) — same error

**Observations:**
- The username path contains diacritical characters: `C:\Users\<your-username>\`
- Java's `jar tf` command on `jvm-version.jar` in the same path failed with: `java.nio.file.InvalidPathException: Illegal char <?> at index 19: C:\Users\<your-username>\.maestro\bin\jvm-version.jar`
- Java cannot resolve the file path due to character encoding mismatch between Git Bash (MSYS2) and Java's Windows path parser

**Workaround applied:** Copied Maestro installation to `C:\tools\maestro\` (ASCII-only path).

**Second failure at new path:** Maestro's jansi native library extracts to `%TEMP%` which still resolves to the user profile path with diacritics:
```
Failed to load native library: jansi-2.4.1-fed648149b32e3a9-jansi.dll
java.lang.UnsatisfiedLinkError: C:\Users\<your-username>\AppData\Local\Temp\jansi-2.4.1-...
```

**Workaround applied:** Overriding `TEMP` and `TMP` environment variables to `C:\tools\maestro\tmp` before launching. After this, `maestro --version` returned `2.2.0` successfully.

---

## Issue 2: Android Emulator — Perpetual "offline" ADB Status

**What happened:** The Android emulator launched (window appeared, GPU initialized, GRPC server started) but ADB reported the device as `offline` indefinitely. ADB never transitioned to `device` state.

**What was tried:**
1. Standard launch: `emulator -avd New_Device -no-snapshot-load` — emulator appeared, ADB showed `offline`
2. Kill and relaunch with `-no-snapshot -gpu host` — same result, `offline` after 3+ minutes
3. Wipe data and cold boot: `-no-snapshot -wipe-data -gpu host` — same result
4. Reduced resolution: `-skin 540x960 -no-boot-anim` — same result
5. ADB server restart (`adb kill-server && adb start-server`) — no effect
6. Explicit `adb connect localhost:5554` — connected but still `offline`
7. Waited 5+ minutes across multiple attempts — never came online
8. TCP port check: ports 5554 (console) and 5555 (ADB) were both responding

**Observations from emulator logs:**
- `WARNING | Not all modern X86 virtualization features supported, which introduces problems with slowdown when running Android on multicore vCPUs. Setting AVD to run with 1 vCPU core only.`
- `WHPX on Windows 10.0.26220 detected. Windows Hypervisor Platform accelerator is operational`
- `USER_INFO | Emulator is performing a full startup. This may take upto two minutes, or more.`
- The emulator window displayed a **black rectangle** — no Android boot animation or home screen appeared

**ADB version:** 36.0.2 — the ADB binary path also showed mangled characters: `C:\Users\<your-username>\AppData\Local\Android\Sdk\platform-tools\adb.exe`

---

## Issue 3: Acceleration Check — Only WHPX Available

**What happened:** Running `emulator -accel-check` reported:

```
accel:
0
WHPX(10.0.26220) is installed and usable.
accel
```

Only WHPX was detected. No AEHD or HAXM.

**System state:**
- Hyper-V: fully enabled (Hyper-V Platform, Hyper-V Hypervisor, Hyper-V Services, Management Tools — all checked in Windows Features)
- WMI `VirtualizationFirmwareEnabled` reported `FALSE` (note: this field can report FALSE when Hyper-V has already claimed VT-x)
- No VirtualBox, VMware, or other third-party virtualization software installed (`sc query vboxdrv`, `sc query vmci`, `sc query vmx86` all returned "service does not exist")

---

## Issue 4: AEHD Driver — Installs but Fails to Start

**What happened:** AEHD driver files were present in the SDK at `%LOCALAPPDATA%\Android\Sdk\extras\google\Android_Emulator_Hypervisor_Driver\`. Running `silent_install.bat` as Administrator:

```
[SC] ControlService FAILED 1062: The service has not been started.
[SC] DeleteService SUCCESS
[SC] StartService FAILED with error 4294967201.
```

**Observations:**
- The driver binary (`aehd.sys`) was successfully copied to `C:\Windows\System32\drivers\aehd.sys`
- The service was registered as a kernel mode driver with system start type
- `sc query aehd` showed: `STATE: 1 STOPPED`, `WIN32_EXIT_CODE: 4294967201 (0xffffffa1)`
- Windows Event Log (System, Event ID 7000): "The Android Emulator hypervisor driver Service service failed to start due to the following error: %%4294967201"
- Driver version: 2.2.0.0, marked as `IsPreRelease: True`
- Error appeared three times in event log (corresponding to three installation attempts)
- This same error code (4294967201) is documented in multiple GitHub issues on the `google/android-emulator-hypervisor-driver` repository: [#10](https://github.com/google/android-emulator-hypervisor-driver/issues/10), [#27](https://github.com/google/android-emulator-hypervisor-driver/issues/27), [#67](https://github.com/google/android-emulator-hypervisor-driver/issues/67), [#80](https://github.com/google/android-emulator-hypervisor-driver/issues/80), [#83](https://github.com/google/android-emulator-hypervisor-driver/issues/83)

---

## Environment Summary

| Component | Value |
|-----------|-------|
| OS | Windows 11 Pro 10.0.26220 |
| CPU | Intel Core i7-10700 @ 2.90GHz |
| GPU | NVIDIA GeForce RTX 2070 SUPER (driver 545.84) |
| Hyper-V | Enabled (all sub-features) |
| WHPX | Detected and "usable" (but emulator doesn't boot) |
| AEHD | v2.2.0.0 (pre-release), installed but won't start |
| HAXM | Not installed |
| Emulator | 36.4.9 |
| ADB | 36.0.2 |
| Maestro | 2.2.0 (functional after path workaround) |
| User profile path | Contains diacritical characters (`č`, `á`) |

---

## Resolution: Android Emulator Boot Failure (2026-03-04)

**Root cause:** The Unicode character `č` (U+010D) in the user profile path `C:\Users\<your-username>\` causes Windows `LoadLibrary` to silently fail when loading DLLs from paths containing this character. This affects:
- QEMU subprocess (hangs during initialization — 1s CPU over 90s instead of actively booting)
- Vulkan DLL loading (`vulkan-1.dll` fails with empty error string)
- Qt software OpenGL (`opengl32sw.dll` — "module could not be found")
- Maestro's JNI native libraries (`jansi.dll` — same issue via Java's `System.loadLibrary`)

**Diagnostic evidence:**
| Test | Acceleration | Rendering | Window | Result | QEMU CPU (90s) |
|------|-------------|-----------|--------|--------|-----------------|
| Unicode path | WHPX | SwiftShader | Yes | Frozen | 1.09s |
| Unicode path | WHPX | SwiftShader + wipe-data | Yes | Frozen | 2.25s |
| Unicode path | None (-no-accel) | SwiftShader | Yes | Frozen | 1.06s |
| Unicode path | WHPX | SwiftShader | No (-no-window) | Frozen | 0.59s |
| **ASCII path** | **WHPX** | **SwiftShader** | **Yes** | **Booted** | **307s** |

**Fix applied:**
1. Copied `emulator/` directory to `C:\Android\Sdk\emulator` (ASCII-only path)
2. Copied `platform-tools/` to `C:\Android\Sdk\platform-tools`
3. Created junction `C:\Android\Sdk\system-images` → original path (data files only)
4. Set permanent environment variables:
   - `ANDROID_HOME=C:\Android\Sdk`
   - `ANDROID_SDK_ROOT=C:\Android\Sdk`
   - `ANDROID_AVD_HOME=C:\AndroidHome\.android\avd`
5. Added `C:\Android\Sdk\emulator` and `C:\Android\Sdk\platform-tools` to user PATH

**Maintenance note:** When Android SDK Manager updates the emulator, it writes to the original Unicode path. After updates, re-copy:
```powershell
robocopy "C:\Users\<your-username>\AppData\Local\Android\Sdk\emulator" "C:\Android\Sdk\emulator" /E /NP /PURGE
```

---

## Issue 5: Gradle Build — Unicode Path Failures (2026-03-07)

**What happened:** Running `npx expo run:android` to build the debug APK failed at multiple stages due to the Unicode user profile path.

### 5a: Gradle Daemon — Java Agent JAR Load Failure

The Gradle daemon could not start because the Java agent JAR path contains `č`:

```
Error opening zip file or JAR manifest missing :
  C:\Users\ZuzanaKope?n°\.gradle\wrapper\dists\gradle-8.14.3-bin\...\agents\gradle-instrumentation-agent-8.14.3.jar
Error occurred during initialization of VM
agent library failed to init: instrument
```

**Fix:** Override `GRADLE_USER_HOME` to an ASCII path:
```bash
export GRADLE_USER_HOME="C:\\tools\\gradle"
```

### 5b: Kotlin Compiler Daemon — Temp File Creation Failure

After Gradle started, the Kotlin compiler daemon failed 4 times with:

```
Caused by: java.io.IOException: The filename, directory name, or volume label syntax is incorrect
  at java.base/java.io.WinNTFileSystem.createFileExclusively(Native Method)
  at java.base/java.io.File.createNewFile(File.java:1043)
  at org.jetbrains.kotlin.daemon.CompileServiceImplBase.<init>(CompileServiceImpl.kt:247)
```

The daemon writes temp files to `%TEMP%` which resolves to the Unicode user profile path.

**Temporary fix (env vars only):** Override `TEMP` and `TMP` to ASCII paths:
```bash
export TEMP="C:\\tools\\tmp"
export TMP="C:\\tools\\tmp"
```

Without the permanent fix below, Kotlin falls back to in-process compilation after daemon failure ("Using fallback strategy: Compile without Kotlin daemon"), so the build proceeds but is slower.

**Permanent fix (gradle.properties — added 2026-03-08):**

The Kotlin compile daemon spawns as a separate JVM process that does **not** reliably inherit `TEMP`/`TMP` environment variables. Even with `TEMP=C:/tools/tmp` set in the shell, the daemon JVM may still use the default Windows temp path (which contains Unicode characters). The fix is to pass `-Djava.io.tmpdir` directly to both the Gradle JVM and the Kotlin daemon JVM via `gradle.properties`:

```properties
# In apps/mobile/android/gradle.properties:
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Djava.io.tmpdir=C:/tools/tmp

# Kotlin daemon JVM args — redirect tmpdir to ASCII path (Windows Unicode username fix)
kotlin.daemon.jvmargs=-Djava.io.tmpdir=C:/tools/tmp
```

This makes the Kotlin daemon work properly (not just fallback in-process compilation) and eliminates the need to manually set `TEMP`/`TMP` in the shell for Gradle builds (though setting them is still needed for Maestro).

**⚠️ IMPORTANT:** `expo prebuild --clean` wipes and regenerates the entire `android/` directory, including `gradle.properties`. After any clean prebuild, you MUST re-apply these two lines to `apps/mobile/android/gradle.properties`. The lines are committed to git, so `git checkout apps/mobile/android/gradle.properties` will restore them if prebuild overwrites the file.

### 5c: NDK License Not Accepted

After fixing Gradle/Kotlin daemon issues, the build failed because the ASCII SDK path (`C:\Android\Sdk`) had no `licenses/` directory:

```
LicenceNotAcceptedException: Failed to install the following Android SDK packages
  as some licences have not been accepted.
  ndk;27.1.12297006 NDK (Side by side) 27.1.12297006
```

**Fix:** Copy license files from original SDK and create junctions for SDK components:
```powershell
# Copy licenses
Copy-Item 'C:\Users\<your-username>\AppData\Local\Android\Sdk\licenses\*' 'C:\Android\Sdk\licenses\' -Force

# Create junctions for data-only SDK components
$dirs = @('ndk', 'build-tools', 'platforms', 'extras', 'sources', 'skins')
foreach ($d in $dirs) {
    New-Item -ItemType Junction -Path "C:\Android\Sdk\$d" `
        -Target "C:\Users\<your-username>\AppData\Local\Android\Sdk\$d"
}
```

### 5d: CMake — CreateProcess Failed on cmake.exe via Junction

Native modules (react-native-screens, expo-modules-core, react-native-worklets) use CMake for C++ compilation. Ninja called `cmake.exe --regenerate-during-build` but the cmake binary path resolved through the junction to the real Unicode path:

```
C:\Users\ZuzanaKopecn?\AppData\Local\Android\Sdk\cmake\3.22.1\bin\cmake.exe
CreateProcess failed: The system cannot find the file specified.
```

**Root cause:** NTFS junctions are transparent — executables spawned from a junction-backed directory resolve their own path to the real (Unicode) target. `CreateProcess` then fails on the Unicode path.

**Fix:** For `cmake/`, use a hybrid approach — real copy for `bin/` (executables), junction for `share/` (data files):
```bash
# Remove junction
rm C:\Android\Sdk\cmake

# Copy binaries (cmake.exe, ninja.exe, etc.)
mkdir -p C:\Android\Sdk\cmake\3.22.1\bin
cp "C:\Users\<your-username>\AppData\Local\Android\Sdk\cmake\3.22.1\bin\*" \
   C:\Android\Sdk\cmake\3.22.1\bin/

# Junction for CMake modules (data files, no CreateProcess)
New-Item -ItemType Junction -Path 'C:\Android\Sdk\cmake\3.22.1\share' `
    -Target 'C:\Users\<your-username>\AppData\Local\Android\Sdk\cmake\3.22.1\share'
```

**Key insight:** Junctions are safe for data files (CMake modules, system images, NDK toolchains) but NOT for executables or JARs that get spawned via `CreateProcess` or loaded via `LoadLibrary`/`System.loadLibrary`.

### 5e: CMake — Object Path Length Exceeds 250 Characters (CMAKE_OBJECT_PATH_MAX)

After fixing all Unicode issues, CMake native builds hit `CMAKE_OBJECT_PATH_MAX` (250 chars):

```
ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

The project path (`C:\Dev\Projects\Products\Apps\eduagent-build\`, 49 chars) combined with pnpm's hash-based paths in `node_modules/.pnpm/react-native-worklets@0.5.1_1c4f77c9ace3fa1eeadccac72dfe4e19/...` produces object file paths of 224-246 characters, exceeding the 250-char limit.

**Workarounds attempted and failed:**
- NTFS junction (`C:\E` → project root) — junctions are resolved transparently; CMake sees real path
- `subst Z:` virtual drive — Gradle sees `Z:\` but pnpm symlinks resolve to `C:\`; CMake sees real path
- `pnpm install --virtual-store-dir C:\N` — places the `.pnpm` virtual store at `C:\N` (data moves there), but `node_modules/.pnpm/` still exists and symlinks within it resolve through the original long project path. Also causes **cross-module dependency failures**: react-native-reanimated looks for `libworklets.so` at the virtual store path (`C:\N\...`), while the build output goes to the `node_modules/.pnpm/...` path, breaking the prefab link.

**Partial fix — Gradle init script for `.cxx` directories:**

Created `C:\tools\gradle\init.gradle` to redirect CMake's `.cxx` build intermediates to a short path:
```groovy
allprojects {
    afterEvaluate { project ->
        try {
            def android = project.extensions.findByName('android')
            if (android != null) {
                def cmake = android.externalNativeBuild?.cmake
                if (cmake != null && cmake.path != null) {
                    cmake.buildStagingDirectory = new File("C:/B/${project.name}")
                }
            }
        } catch (Exception ignored) {}
    }
}
```

This **successfully fixed CMAKE_OBJECT_PATH_MAX** for all native library modules:
- react-native-worklets — builds to `C:\B\react-native-worklets\`
- react-native-reanimated — builds to `C:\B\react-native-reanimated\`
- react-native-screens — builds to `C:\B\react-native-screens\`
- expo-modules-core — builds to `C:\B\expo-modules-core\`

**Note:** The init.gradle only intercepts modules that have `externalNativeBuild.cmake.path` set. The `app` module's CMake is set up by the React Native Gradle Plugin differently and is NOT intercepted (its `.cxx` stays at `apps/mobile/android/app/.cxx/`). This is fine because the app module's `.cxx` path (77 chars) is short enough.

### 5f: Ninja — Windows MAX_PATH (260 chars) for Codegen Source Files

Even after resolving CMAKE_OBJECT_PATH_MAX with the init.gradle, the **app module** CMake build fails because the bundled `ninja.exe` (v1.10.2) cannot `Stat()` codegen-generated source files whose full paths exceed the Windows MAX_PATH limit (260 chars):

```
ninja: error: Stat(C:/Dev/Projects/Products/Apps/eduagent-build/node_modules/.pnpm/
@react-native-community+dat_1a6636913d17adbca047c2823dd1d518/node_modules/
@react-native-community/datetimepicker/android/build/generated/source/codegen/jni/
react/renderer/components/RNDateTimePickerCGen/ComponentDescriptors.cpp): Filename longer than 260 characters
```

This path is ~289 characters. The source files are generated by React Native's codegen inside each library module's `android/build/generated/source/codegen/jni/` directory. Since the library lives deep in pnpm's `.pnpm/` structure, the total path exceeds 260 chars.

**Workarounds attempted and failed:**
- **Windows Long Path Support** — Enabled `LongPathsEnabled` registry key (via Settings > System > Advanced > "Enable long paths"). The key is set (`HKLM\...\FileSystem\LongPathsEnabled = 0x1`), but `ninja.exe` v1.10.2 bundled with Android SDK's cmake 3.22.1 does **not** have a long-path manifest. Windows long path support requires **both** the registry key AND the application opting in via manifest. Ninja 1.10.2 ignores the setting.
- **Shallow clone at `C:\E\`** — Even with project root at 4 chars, pnpm hash paths for `@react-native-community/datetimepicker` + codegen produce 267-char paths, still 7 chars over the 260 limit.
- **`node-linker=hoisted` in `.npmrc`** — Eliminates `.pnpm/` entirely (flat npm-style node_modules), fixing path length. But **breaks React Native autolinking** — Gradle can't resolve any native modules. Dead end for Expo/RN projects.

### 5g: Resolution — Replace ninja.exe with v1.12.1

**Root cause:** Android SDK's cmake 3.22.1 bundles ninja v1.10.2 (2020), which has a hardcoded `MAX_PATH` (260) check in `disk_interface.cc`. Ninja v1.12+ (2024) uses `\\?\` prefix paths on Windows, removing this limit.

**Fix applied:**
```bash
# Backup old ninja
cp C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe.bak

# Download ninja 1.12.1
curl -L -o ninja-win.zip https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip
unzip ninja-win.zip -d ninja-extract

# Replace bundled ninja
cp ninja-extract/ninja.exe C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe
```

**Result:** BUILD SUCCESSFUL in 5m 21s from the original project path. APK installed on emulator.

CMake still emits warnings about `CMAKE_OBJECT_PATH_MAX` (250 chars) for object file paths (189-199 chars + long filenames), but these are just **warnings** — the build succeeds because ninja 1.12.1 handles the actual file I/O correctly despite paths > 260 chars.

**Maintenance note:** When Android SDK Manager updates cmake, it may overwrite `ninja.exe` with the old v1.10.2. After cmake updates, re-copy:
```bash
cp C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe.bak.1.12.1 C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe
# Or re-download from https://github.com/ninja-build/ninja/releases
```

---

## Complete Android Build Environment Setup

To build the Android debug APK on this machine, all of the following are required:

```bash
# 1. Environment variables (set permanently or in shell profile)
export ANDROID_HOME="C:\\Android\\Sdk"
export ANDROID_SDK_ROOT="C:\\Android\\Sdk"
export ANDROID_AVD_HOME="C:\\AndroidHome\\.android\\avd"
export GRADLE_USER_HOME="C:\\tools\\gradle"
export TEMP="C:\\tools\\tmp"
export TMP="C:\\tools\\tmp"

# 2. Build from the original project path (works after ninja upgrade)
cd /c/Dev/Projects/Products/Apps/eduagent-build/apps/mobile
npx expo run:android --no-bundler

# 3. Start Metro bundler separately (if using --no-bundler)
npx expo start
```

### ASCII SDK Layout (C:\Android\Sdk)

| Directory | Type | Why |
|-----------|------|-----|
| `emulator/` | **Real copy** | QEMU `LoadLibrary` fails on Unicode DLL paths |
| `platform-tools/` | **Real copy** | ADB binary path resolution |
| `cmake/3.22.1/bin/` | **Real copy** | `CreateProcess` resolves through junctions to Unicode path |
| `cmake/3.22.1/share/` | Junction | Data files — no process spawning |
| `ndk/` | Junction | Toolchain data — NDK executables run from within Gradle's JVM |
| `build-tools/` | Junction | Data files |
| `platforms/` | Junction | Android platform JARs |
| `system-images/` | Junction | Emulator disk images |
| `extras/` | Junction | Additional SDK components |
| `licenses/` | Copied files | License acceptance hashes |

### Maestro (C:\tools\maestro)

Maestro must also use ASCII paths for both installation and temp directory:
```bash
export TEMP="C:\\tools\\maestro\\tmp"
export TMP="C:\\tools\\maestro\\tmp"
/c/tools/maestro/bin/maestro --version
```

**Note:** Maestro is NOT on PATH. Add `C:\tools\maestro\bin` to PATH for convenience.

---

## Issue 6: expo-dev-client — SDK Version Mismatch (2026-03-08)

**Context:** To run E2E tests against a custom dev-client APK (with the app's native modules), we need `expo-dev-client`. Expo Go works for smoke tests but cannot load native modules like `expo-camera`, `expo-speech-recognition`, or `react-native-purchases`.

**What happened:** Installing expo-dev-client with pnpm installed the wrong SDK version:

```bash
# WRONG — installs v55 (SDK 55) on an SDK 54 project
pnpm add --filter @eduagent/mobile expo-dev-client
# Resolved to expo-dev-client@55.0.11

# CORRECT — npx expo install resolves the SDK-compatible version
npx expo install expo-dev-client
# Resolved to expo-dev-client@~6.0.20 (SDK 54 compatible)
```

**Symptom of version mismatch:** With expo-dev-client@55 on SDK 54, the app compiles and installs successfully but shows a **black screen** on launch — no crash, no error in logcat, just a permanently black screen. This is because the dev-client launcher UI is SDK 55 and incompatible with the SDK 54 runtime.

**Key lesson:** Always use `npx expo install <package>` for Expo SDK packages — it resolves the correct version range for the current SDK. Never use `pnpm add` directly for Expo packages.

**Current state:** expo-dev-client was **removed** from the project during troubleshooting because adding it triggered Issue 7 (below). It needs to be re-added once Issue 7 is resolved.

---

## Issue 7: pnpm Cannot Resolve `@expo/config-plugins` for Sentry (UNSOLVED — 2026-03-08)

**What happened:** After adding `expo-dev-client`, running `npx expo run:android` failed during Gradle's `createExpoConfig` task:

```
A/A/loading @sentry/react-native plugin
Error: Cannot find module '@expo/config-plugins'
Require stack:
- ...\node_modules\@sentry\react-native\expo.js
```

**Root cause:** `@sentry/react-native`'s Expo config plugin (`expo.js`) does `require('@expo/config-plugins')` at runtime during Gradle's `createExpoConfig` task. Under pnpm's strict module isolation, `@sentry/react-native` cannot see `@expo/config-plugins` because it's not a direct dependency of `@sentry/react-native` — it's a dependency of `expo` itself.

**Why this is critical:** This blocks **ALL** Android APK builds, not just dev-client builds. Any `npx expo run:android` or `npx expo prebuild` + `./gradlew assembleDebug` will fail.

**What was tried (all failed):**

1. **`shamefully-hoist=true` in `.npmrc`** — Already present in the project. Does not fix this because `shamefully-hoist` only affects top-level hoisting; Sentry's config plugin runs from deep within pnpm's `.pnpm/` structure where it can't see hoisted peers.

2. **Add `@expo/config-plugins` as direct dependency:**
   ```bash
   pnpm add --filter @eduagent/mobile @expo/config-plugins@54.0.4
   ```
   This adds it to `apps/mobile/node_modules/@expo/config-plugins`, but the Gradle build runs Sentry's `expo.js` from Sentry's own `node_modules` scope, not from the app's scope. The direct dependency doesn't help.

3. **`npx expo prebuild`** — Regenerates the `android/` directory but doesn't fix the module resolution. The error occurs during Gradle's invocation of `expo config`, not during prebuild itself.

4. **`npx expo prebuild --clean`** — Same result. Also wipes `gradle.properties` fixes (Issue 5b).

5. **Remove expo-dev-client entirely** — The error persists even after removing expo-dev-client. Once `@sentry/react-native` is present in the project with its Expo config plugin, the resolution failure blocks any native build.

**Analysis:**

This is a fundamental incompatibility between pnpm's strict module isolation and Expo's config plugin system. The config plugin system expects npm/yarn-style flat `node_modules` where any package can `require()` any other package. pnpm deliberately prevents this to enforce correct dependency declarations.

The error existed before adding expo-dev-client, but was masked because we were using Expo Go (which doesn't run native builds). Any attempt to build a native APK triggers it.

---

## WSL2 Build Environment (2026-03-08)

**Why WSL2:** Issue 7 blocks Android APK builds on Windows due to pnpm's strict module isolation. The plan is to build the APK inside WSL2 (where Gradle runs on Linux with no Unicode path issues and potentially different module resolution behavior), keep the emulator running on Windows (where GPU acceleration works), and bridge them via ADB.

**Status:** WSL2 environment installed, configured, and **working**. APK builds successfully in WSL2 and installs on the Windows emulator.

### What's installed

| Component | Version | Location |
|-----------|---------|----------|
| Ubuntu | 24.04.1 LTS (Noble Numbat) | WSL2 distro |
| Node.js | 22.22.1 | via NodeSource apt repo |
| npm | 10.9.2 | bundled with Node |
| pnpm | 10.19.0 | `sudo npm install -g pnpm` |
| Java | OpenJDK 17.0.18 | `openjdk-17-jdk` apt package |
| Android SDK | cmdline-tools, platform-tools, platforms;android-34, build-tools;35.0.0, ndk;27.1.12297006 | `~/Android/Sdk` |
| git | 2.43.0 | pre-installed with Ubuntu |

### How to access WSL2

From any Windows terminal (PowerShell, Git Bash, Windows Terminal):
```bash
wsl
```
This drops you into the Ubuntu shell. Your Windows drives are mounted at `/mnt/c/`, `/mnt/d/`, etc.

The WSL2 Linux username is `<wsl-user>` and the home directory is `/home/<wsl-user>/`.

### Environment variables (in `~/.bashrc`)

```bash
export ANDROID_HOME=~/Android/Sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
```

### How this was set up (for reference)

1. **Install Ubuntu on WSL2** (from admin PowerShell on Windows):
   ```powershell
   wsl --install -d Ubuntu
   ```
   Reboots, then Ubuntu opens and asks for Linux username/password.

2. **Inside WSL2:**
   ```bash
   # Node 22
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # pnpm (needs sudo for global install on Linux)
   sudo npm install -g pnpm

   # Java 17
   sudo apt-get install -y openjdk-17-jdk

   # unzip (not pre-installed on Ubuntu 24.04 minimal)
   sudo apt install -y unzip

   # Android SDK
   mkdir -p ~/Android/Sdk/cmdline-tools
   cd ~/Android/Sdk/cmdline-tools
   curl -o tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
   unzip tools.zip && mv cmdline-tools latest && rm tools.zip

   export ANDROID_HOME=~/Android/Sdk
   export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
   yes | sdkmanager --licenses
   sdkmanager "platform-tools" "platforms;android-34" "build-tools;35.0.0" "ndk;27.1.12297006"

   # Persist env vars
   echo 'export ANDROID_HOME=~/Android/Sdk' >> ~/.bashrc
   echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.bashrc
   ```

### Building the APK (tested and working)

The repo is cloned to WSL2's native Linux filesystem (NOT `/mnt/c/` — that's slow):

```bash
# One-time clone (already done)
cd ~/projects
git clone /mnt/c/Dev/Projects/Products/Apps/eduagent-build eduagent-build

# Install deps
cd ~/projects/eduagent-build
pnpm install                          # 31 seconds

# Prebuild + build
cd apps/mobile
npx expo prebuild --platform android  # generates android/ directory
cd android
./gradlew assembleDebug               # ~11 minutes first build, faster on subsequent builds
```

**Important:** The repo in `~/projects/eduagent-build` is a separate clone from the Windows repo at `C:\Dev\Projects\Products\Apps\eduagent-build`. After pulling/pushing changes on Windows, you need to `git pull` inside WSL2 too.

A `local.properties` file must exist at `apps/mobile/android/local.properties` with:
```properties
sdk.dir=/home/<wsl-user>/Android/Sdk
```
This file is `.gitignore`d so it won't conflict. `expo prebuild` does NOT create it automatically in WSL2.

### Installing the APK on the Windows emulator

ADB on WSL2 cannot directly access the Windows emulator. Instead, copy the APK to a Windows-accessible path and use Windows ADB:

```bash
# From WSL2: copy APK to Windows
cp ~/projects/eduagent-build/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/tools/tmp/app-debug.apk

# From Windows: install on emulator (emulator must be running)
C:\Android\Sdk\platform-tools\adb.exe install C:\tools\tmp\app-debug.apk
```

Or as a one-liner from Windows Git Bash / Claude's Bash:
```bash
wsl -- bash -c "cp ~/projects/eduagent-build/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/tools/tmp/app-debug.apk"
C:/Android/Sdk/platform-tools/adb.exe install C:/tools/tmp/app-debug.apk
```

**Note:** The `\\wsl$\Ubuntu\...` UNC path does NOT work with `adb install` — it can't stat the file. Copy to a Windows drive first.

### What failed / what we didn't use

- **ADB bridge from WSL2 to Windows emulator** — not needed. Simpler to copy the APK to Windows and use Windows ADB.
- **Building from `/mnt/c/`** — not attempted, expected to be extremely slow due to WSL2 ↔ Windows filesystem overhead.

---

## Issue 8: Metro `unstable_serverRoot` — Dev-Client Bundle URL Mismatch in Monorepo (2026-03-08)

**What happened:** After building the dev-client APK in WSL2 (with `expo-dev-client@~6.0.20`) and installing it on the Windows emulator, the app showed "There was a problem loading the project" with:

```text
UnableToResolveError
originModulePath: C:\Dev\...\apps\mobile/.
targetModuleName: ./apps/mobile/index
Unable to resolve module ./apps/mobile/index from C:\Dev\...\apps\mobile/.
```

URL requested by dev-client: `http://10.0.2.2:8081/apps/mobile/index.bundle?platform=android&dev=true&...`

**Root cause:** In a monorepo, the expo-dev-client always constructs the bundle URL as `/<projectRoot-relative-to-monorepo>/index.bundle`. Since our project is at `apps/mobile/` within the monorepo, the dev-client requests `/apps/mobile/index.bundle`.

Metro's `server.unstable_serverRoot` controls how URL paths map to file paths. The wrong value causes a double-path resolution:

| `unstable_serverRoot` value | URL `/apps/mobile/index.bundle` resolves to | Result |
|---|---|---|
| `__dirname` (= `apps/mobile/`) | `apps/mobile/` + `apps/mobile/index` = **double path** | 404 |
| `monorepoRoot` (= `../..`) | monorepo root + `apps/mobile/index` = **correct** | 200 |

**What was tried first (wrong):** Setting `unstable_serverRoot: __dirname` — this made `/index.bundle` work (HTTP 200 via curl), but the dev-client never requests `/index.bundle`. It always requests `/apps/mobile/index.bundle`, which caused the double-path error.

**Fix applied in `apps/mobile/metro.config.js`:**
```javascript
const monorepoRoot = path.resolve(__dirname, '../..');

const customConfig = {
  projectRoot: __dirname,
  server: { unstable_serverRoot: monorepoRoot },
  watchFolders: [monorepoRoot],
  // ...
};
```

**Key insight:** The dev-client's bundle URL construction and Metro's `unstable_serverRoot` must agree. In a monorepo where `projectRoot !== monorepoRoot`, set `unstable_serverRoot` to the monorepo root so the dev-client's `/<relative-project-path>/index.bundle` URL resolves correctly.

**Note:** This also needs to be applied in the WSL2 clone at `~/projects/eduagent-build/apps/mobile/metro.config.js`.

---

## Issue 9: ANR Dialogs on WHPX Emulator During Bundle Loading (2026-03-08)

**What happened:** During bundle loading (27-30 seconds for 2900 modules), Android repeatedly shows ANR dialogs:
- "MentoMate isn't responding" — Wait / Close app
- "System UI isn't responding" — Close app / Wait
- "Bluetooth keeps stopping" — App info / Close app

These dialogs block the app and must be dismissed manually by tapping "Wait".

**Why this happens:** WHPX (Windows Hypervisor Platform) is significantly slower than HAXM or AEHD. The Hermes JS engine blocks the main thread while parsing and executing the large JS bundle, triggering Android's ANR detection (5-second no-response threshold).

**Observations from logcat:**
- Bundle download: ~27 seconds for 2900 modules
- Choreographer: "Skipped 55/96/193/208 frames!" (normal is 0)
- Frame render times: 800ms - 4400ms (normal: 16ms @ 60fps)
- After `loadJSBundleFromMetro()`, there was a 26-minute gap with zero logs before any React context activity — Hermes was stuck parsing

**ADB-based dismissal (unreliable):**
- `adb shell input keyevent KEYCODE_BACK` — sometimes works, sometimes doesn't
- `adb shell input tap <x> <y>` — often doesn't register on the slow emulator
- Tapping "Wait" physically on the emulator window is the most reliable approach

---

## E2E Test Strategy — Current State (2026-03-08)

### What works today

| Approach | Status | Limitations |
|----------|--------|-------------|
| **Expo Go smoke tests** | Working | No native modules (camera, STT, IAP). App loads via `exp://localhost:8081` deep link. |
| **Maestro CLI** | Working | At `C:\tools\maestro` with TEMP override |
| **Emulator** | Working | From ASCII SDK path |
| **Metro bundler** | Working | `npx expo start` serves JS bundle |

### Expo Go E2E flows (available now)

These flows use `appId: host.exp.exponent` and work without a native build:

```
apps/mobile/e2e/flows/
  _setup/launch-expogo.yaml    # Reusable: launch Expo Go + deep link
  app-launch-expogo.yaml       # Smoke: verify sign-in screen elements
```

**Running Expo Go smoke tests:**
```bash
# Terminal 1: Start Metro
cd apps/mobile && npx expo start

# Terminal 2: Run Maestro (ensure emulator is running)
export TEMP="C:\\tools\\tmp" && export TMP="C:\\tools\\tmp"
/c/tools/maestro/bin/maestro test e2e/flows/app-launch-expogo.yaml
```

### Dev-client E2E flows (blocked by Issue 7)

Full E2E testing (with native modules) requires a dev-client APK build, which is currently blocked by Issue 7. Once resolved:

1. `npx expo install expo-dev-client` (resolves to `~6.0.20` for SDK 54)
2. `npx expo run:android` (builds debug APK with dev-client)
3. Write flows with `appId: com.mentomate.app` targeting the dev-client

---

## Current Status (2026-03-08)

| Component | Status | Notes |
|-----------|--------|-------|
| Emulator boot | Working | From ASCII SDK path (`C:\Android\Sdk`) |
| ADB | Working | v36.0.2 at `C:\Android\Sdk\platform-tools` |
| Maestro CLI | Working | v2.2.0 at `C:\tools\maestro` with TEMP override |
| Gradle daemon | Working | With `GRADLE_USER_HOME=C:\tools\gradle` |
| Kotlin compiler | Working | `gradle.properties` has `kotlin.daemon.jvmargs=-Djava.io.tmpdir=C:/tools/tmp` (permanent fix) |
| CMake library builds | Working | init.gradle redirects `.cxx` to `C:\B\<module>` |
| CMake app build | Working | Ninja 1.12.1 handles >260 char paths |
| Expo Go (JS-only) | Working | Smoke tests run via `exp://localhost:8081` deep link |
| Android APK build | **BLOCKED on Windows** | `@sentry/react-native` config plugin can't resolve `@expo/config-plugins` under pnpm (Issue 7) |
| Android APK build (WSL2) | **Working** | Bypasses Issue 7. Build in WSL2, copy APK to Windows. |
| expo-dev-client | **Installed (WSL2 only)** | `expo-dev-client@~6.0.20` in WSL2 clone. Not on Windows (Issue 7). |
| Metro → dev-client | **Working** | With `unstable_serverRoot: monorepoRoot` fix (Issue 8) |
| Dev-client bundle loading | **Slow (ANR)** | WHPX emulator takes minutes to parse 2900-module bundle (Issue 9) |
| WSL2 Ubuntu 24.04 | **Working** | Node 22, pnpm 10, Java 17, Android SDK. APK builds successfully (11 min). |
| APK install (WSL2→Win) | **Working** | Copy APK to `C:\tools\tmp\`, install with Windows `adb.exe` |
| Windows Long Paths | Enabled | `LongPathsEnabled=1` (good practice, not required for ninja fix) |

### What's installed where

| Path | Contents | Why |
|------|----------|-----|
| `C:\Android\Sdk\` | Android SDK (hybrid: real copies + junctions) | ASCII path for executables |
| `C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe` | Ninja 1.12.1 (upgraded from 1.10.2) | Long path support (>260 chars) |
| `C:\Android\Sdk\cmake\3.22.1\bin\ninja.exe.bak` | Ninja 1.10.2 (original) | Backup of SDK-bundled version |
| `C:\AndroidHome\.android\avd\` | AVD home | ASCII path for emulator |
| `C:\tools\gradle\` | Gradle user home + init.gradle | ASCII path for Gradle daemon + CMake `.cxx` redirect |
| `C:\tools\tmp\` | Temp directory override | ASCII path for Kotlin daemon + Maestro |
| `C:\tools\maestro\` | Maestro CLI installation | ASCII path for Java/JNI |
| `C:\B\` | CMake `.cxx` build intermediates | Short path for init.gradle redirect |
| `C:\E\` | (Can be removed) Was used for short-path build attempts | No longer needed with ninja 1.12.1 |
| WSL2 `~/Android/Sdk` | Android SDK (Linux) | For Gradle builds inside WSL2 |
| WSL2 `~/.bashrc` | ANDROID_HOME + PATH exports | Persistent env vars for WSL2 |

**Bottom line:** All Unicode path issues (Issues 1–5) are fully resolved. Android APK builds are blocked on Windows by Issue 7 (pnpm + Sentry config plugin), but **the WSL2 hybrid approach works**: build in WSL2, copy APK to Windows, install on emulator with Windows ADB. The Metro bundle URL mismatch (Issue 8) is resolved with `unstable_serverRoot: monorepoRoot`. The WHPX emulator is very slow (Issue 9) but functional.

**What works:** Expo Go smoke tests via Maestro. Day-to-day dev with `npx expo start`. Full APK builds via WSL2. Dev-client APK on emulator with Metro on Windows.

**What's blocked on Windows only:** Native APK build via `npx expo run:android` (Issue 7). Use WSL2 instead.

**What's slow but functional:** WHPX emulator — ANR dialogs during bundle loading require manual dismissal. Bundle loading + Hermes parsing takes ~15-20 minutes on first launch (subsequent launches are faster with Hermes bytecode cache).

**Confirmed working (2026-03-08):** Dev-client APK loads the sign-in screen (Clerk auth with Google SSO, Apple SSO, email/password). Dark mode renders correctly. Developer menu shows `Runtime version: exposdk:54.0.0`.

---

## Issue 10: API Server — `.dev.vars` Required for Post-Auth E2E Testing (2026-03-09)

**What happened:** The API server (`pnpm exec nx dev api`) starts but returns `ENV_VALIDATION_ERROR` on all requests because Wrangler dev has no secrets configured.

**Root cause:** Wrangler dev for Cloudflare Workers reads secrets from `apps/api/.dev.vars` (gitignored). Without this file, `DATABASE_URL` (the only required env var) is undefined and config validation fails on every request.

**Additional gotcha — LLM middleware:** Even after adding `DATABASE_URL`, the `llmMiddleware` (applied globally via `api.use('*', ...)` in `src/index.ts:154`) throws if `GEMINI_API_KEY` is missing. This blocks ALL routes including health, profiles, subjects — not just LLM routes. A placeholder value is sufficient; the provider only fails when an actual LLM call is made.

**Additional gotcha — Auth middleware:** Authenticated routes require `CLERK_JWKS_URL` to verify JWTs. Without it, all authenticated API calls return 401. The JWKS URL is derived from the Clerk publishable key:

```bash
# Decode the publishable key to get the Clerk frontend API domain
echo "pk_test_<base64-part>" | sed 's/pk_test_//' | base64 -d
# Output: <domain>$  (e.g., whole-iguana-9.clerk.accounts.dev$)
# JWKS URL: https://<domain>/.well-known/jwks.json
```

**Fix — Create `apps/api/.dev.vars`:**

```bash
# apps/api/.dev.vars (gitignored — never commit)

DATABASE_URL=<your-neon-connection-string>
CLERK_SECRET_KEY=<your-clerk-secret-key>
CLERK_PUBLISHABLE_KEY=<your-clerk-publishable-key>
CLERK_JWKS_URL=https://<clerk-domain>/.well-known/jwks.json
VOYAGE_API_KEY=<your-voyage-api-key>

# Placeholder — LLM middleware requires this to exist.
# Actual LLM calls will fail but all data endpoints work.
GEMINI_API_KEY=placeholder-for-e2e-testing
```

Copy values from the root `.env.development.local` file.

**After creating/editing `.dev.vars`, restart the API server** — wrangler reads the file only at startup.

**Network access from emulator:** The mobile app uses `http://10.0.2.2:8787` on Android (the emulator's alias for the host's `127.0.0.1`). No `adb reverse` is needed for the API port — the emulator's special `10.0.2.2` address reaches the host directly.

### Complete E2E Testing Setup (all services)

| Service | Command | Port | Required For |
|---------|---------|------|-------------|
| API server | `pnpm exec nx dev api` | 8787 | All post-auth data (profiles, subjects, sessions, etc.) |
| Metro bundler | `cd apps/mobile && pnpm exec expo start` | 8081 | JS bundle serving |
| Bundle proxy | `node apps/mobile/e2e/bundle-proxy.js` | 8082 | Windows only — BUG-7 workaround (OkHttp chunked encoding) |
| Android emulator | `C:\Android\Sdk\emulator\emulator -avd New_Device` | 5554 | Device target |

**Port forwarding:**
- `adb reverse tcp:8082 tcp:8082` — only needed for bundle proxy (BUG-7)
- Port 8787 does NOT need `adb reverse` — emulator uses `10.0.2.2:8787` natively

The Unicode path fixes that ARE working:
1. ASCII SDK path (`C:\Android\Sdk`) for executables
2. Env var overrides (`GRADLE_USER_HOME`, `TEMP`/`TMP`) for Java/Kotlin tooling
3. `gradle.properties` with `-Djava.io.tmpdir=C:/tools/tmp` for Kotlin daemon (permanent fix)
4. Gradle init.gradle to redirect CMake `.cxx` intermediates to `C:\B\`
5. Ninja 1.12.1 upgrade to handle >260 char source file paths

---

## Issue 11: Clerk CAPTCHA Blocks Automated Sign-In on Android Emulator (2026-03-09)

**What happened:** After seeding a Clerk test user via the Backend API and successfully verifying the password works (`POST /v1/users/:id/verify_password` → `verified: true`), sign-in via the app's Clerk React Native SDK fails silently. The sign-in completes without an error but returns a non-`complete` status, and the app shows "Sign-in could not be completed."

**Root cause:** Clerk has Cloudflare Turnstile CAPTCHA enabled on the instance. The environment config (`GET /v1/environment`) reveals:

```json
{
  "user_settings": {
    "sign_in": {
      "captcha_enabled": true,
      "captcha_provider": "turnstile",
      "captcha_public_key": "0x4AAAAAAAWXJGBD7bONzLBd",
      "captcha_widget_type": "invisible"
    }
  }
}
```

Even though the CAPTCHA widget is "invisible", Clerk's frontend API performs bot detection checks during sign-in. The Android emulator (or the React Native environment) fails these checks, blocking automated sign-in. The CAPTCHA is designed for web browsers and doesn't work in native mobile apps during E2E testing.

**Fix applied — `bypass_client_trust` flag:**

Clerk's Backend API supports a per-user flag `bypass_client_trust` that skips CAPTCHA/bot checks for that user. Set it via PATCH after user creation:

```bash
# Set bypass_client_trust on the test user
curl -X PATCH "https://api.clerk.com/v1/users/<user_id>" \
  -H "Authorization: Bearer <clerk_secret_key>" \
  -H "Content-Type: application/json" \
  -d '{"bypass_client_trust": true}'
```

**Implementation in `apps/api/src/services/test-seed.ts`:**

The seed service's `ensureClerkTestUser()` function now patches the user after creation to set both the password (see Issue 12) and `bypass_client_trust: true`:

```typescript
const patchRes = await fetch(`${CLERK_API_BASE}/users/${user.id}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    password: SEED_PASSWORD,
    skip_password_checks: true,
    bypass_client_trust: true,
  }),
});
```

**Key insight:** Clerk's CAPTCHA settings are instance-wide and cannot be disabled per-environment. The `bypass_client_trust` flag is the official way to allow automated testing without disabling CAPTCHA for all users.

**Clerk testing tokens alternative:** Clerk also offers `POST /v1/testing_tokens` which returns a short-lived token for bypassing bot detection. However, this is designed for web browser testing (Playwright/Cypress) and requires injecting the token into the browser's `window.__clerk_testing_token`. It is not directly usable in React Native. The `bypass_client_trust` per-user flag is the correct approach for mobile E2E.

---

## Issue 12: Clerk Backend API — POST /users Password Encoding Bug (2026-03-09)

**What happened:** Creating a Clerk user via `POST /v1/users` with a `password` field containing special characters (`!`, `-`) results in the password being silently corrupted. The `POST /v1/users/:id/verify_password` endpoint reports `verified: false` for the exact password that was provided during creation.

**Reproduction:**

```bash
# Create user with password containing special chars
curl -X POST "https://api.clerk.com/v1/users" \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"email_address": ["test@example.com"], "password": "EduAgent-E2e-Kx9!2026"}'

# Verify — FAILS even though the password was just set
curl -X POST "https://api.clerk.com/v1/users/<id>/verify_password" \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"password": "EduAgent-E2e-Kx9!2026"}'
# Returns: { "verified": false }
```

Tested passwords:
| Password | Via POST /users | Via PATCH /users | verify_password |
|----------|----------------|-----------------|-----------------|
| `TestPass123!` | Created OK | — | FAILS (`verified: false`) |
| `EduAgent-E2e-Kx9!2026` | Created OK | — | FAILS (`verified: false`) |
| `Mentomate2026xK` | Created OK | — | OK (`verified: true`) |
| `Mentomate2026xK` | — | Patched OK | OK (`verified: true`) |

**Root cause hypothesis:** The `POST /v1/users` endpoint may not correctly handle URL-encoded or JSON-escaped special characters in the password field. Characters like `!` and `-` are being silently altered during hashing. The `PATCH /v1/users/:id` endpoint does not have this bug.

**Workaround applied:**

1. Create user via `POST /v1/users` **without** a password (or with a simple alphanumeric one)
2. Set the password via `PATCH /v1/users/:id` with `skip_password_checks: true`

```typescript
// Step 1: Create user (no password in POST body)
const createRes = await fetch(`${CLERK_API_BASE}/users`, {
  method: 'POST',
  body: JSON.stringify({ email_address: [email] }),
});

// Step 2: Reliably set password via PATCH
const patchRes = await fetch(`${CLERK_API_BASE}/users/${user.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    password: 'Mentomate2026xK',
    skip_password_checks: true,
  }),
});
```

**Additional note — HaveIBeenPwned:** Even if a password is set correctly, Clerk checks it against the HaveIBeenPwned database during **sign-in** (not just during creation). `TestPass123!` was flagged as breached. Using `skip_password_checks: true` during creation does NOT skip the HIBP check at sign-in time. Use a non-breached password like `Mentomate2026xK`.

---

> **App bugs found during emulator testing** are tracked in `e2e-test-bugs.md` (BUG-1 through BUG-25). This document covers environment and tooling issues only.

## Comprehensive Post-Auth E2E Flow (2026-03-09)

A full post-auth Maestro flow is available at:
```
apps/mobile/e2e/flows/post-auth-comprehensive-devclient.yaml
```

**Prerequisites:**
1. API running at `localhost:8787` with `.dev.vars` configured (Issue 10)
2. Metro bundler running at `localhost:8081`
3. Bundle proxy at `localhost:8082` (BUG-7 workaround)
4. Android emulator running with dev-client APK installed
5. Seeded test user in Clerk with `bypass_client_trust: true` (Issue 11)

**What it tests (65 steps):**

| Phase | Screens/Features | Steps |
|-------|-----------------|-------|
| 1. Sign In | Dev-client launcher → sign-in form → auth | 15 |
| 2. Home Screen | ScrollView, subjects, retention strip, coaching card | 8 |
| 3. More Tab | Appearance, Notifications, Learning Mode, Account sections | 20 |
| 4. Sub-Screens | Privacy Policy, Terms of Service (navigate + back) | 8 |
| 5. Theme Switching | Eager Learner ↔ Teen, then Parent redirect → dashboard → back | 14 |

**Test user credentials:**
- Email: `test-e2e@example.com`
- Password: `Mentomate2026xK`
- Created by: `POST /v1/__test/seed` (scenario: `learning-active`)

**Running:**
```bash
export TEMP="C:\\tools\\tmp" && export TMP="C:\\tools\\tmp"
/c/tools/maestro/bin/maestro test apps/mobile/e2e/flows/post-auth-comprehensive-devclient.yaml
```

---

## Current Status (2026-03-09)

| Component | Status | Notes |
|-----------|--------|-------|
| Emulator boot | Working | From ASCII SDK path (`C:\Android\Sdk`) |
| ADB | Working | v36.0.2 at `C:\Android\Sdk\platform-tools` |
| Maestro CLI | Working | v2.2.0 at `C:\tools\maestro` with TEMP override |
| Gradle daemon | Working | With `GRADLE_USER_HOME=C:\tools\gradle` |
| Kotlin compiler | Working | `gradle.properties` has `kotlin.daemon.jvmargs=-Djava.io.tmpdir=C:/tools/tmp` |
| CMake library builds | Working | init.gradle redirects `.cxx` to `C:\B\<module>` |
| CMake app build | Working | Ninja 1.12.1 handles >260 char paths |
| Expo Go (JS-only) | Working | Smoke tests run via `exp://localhost:8081` deep link |
| Android APK build | **BLOCKED on Windows** | pnpm + Sentry config plugin (Issue 7) |
| Android APK build (WSL2) | **Working** | Bypasses Issue 7 |
| expo-dev-client | **Installed (WSL2 only)** | `expo-dev-client@~6.0.20` |
| Metro → dev-client | **Working** | With `unstable_serverRoot: monorepoRoot` (Issue 8) |
| API server (local) | **Working** | Requires `.dev.vars` (Issue 10) |
| Clerk test user seeding | **Working** | POST + PATCH for password + bypass_client_trust (Issues 11-12) |
| Post-auth E2E (Maestro) | **Working** | All 65 steps passing |
| Tab navigation (E2E) | **Limited** | Hidden tabs visible in dev-client (BUG-10) |
| Theme switching (E2E) | **Working** | extendedWaitUntil for timing (BUG-11), parent redirect handled (BUG-12) |

**What works end-to-end:** Seed test data → sign in → home screen → More tab full verification → Privacy Policy → Terms of Service → theme cycling. All via Maestro automation (hardcoded credentials in the comprehensive flow).

**Known limitations:**
- Tab bar taps unreliable for "Home" and "Learning Book" (BUG-10, dev-client only)
- Theme switch timing requires `extendedWaitUntil` workaround (BUG-11)
- Parent theme switch redirects to `(parent)/dashboard` (BUG-12, by design)
- WHPX emulator slow — ANR dialogs during bundle loading (Issue 9)
- Single emulator = serialized E2E flows (no parallel test execution)
- Maestro `runScript` env vars broken in sub-flows (Issue 13 — blocks 38 seed-dependent flows)

---

## Issue 13: Maestro `runScript` — `__maestro` Undefined in Sub-Flow Context (2026-03-09)

**What happened:** The reusable `seed-and-sign-in.yaml` setup flow calls `seed.js` via `runScript` with `env` variables. When executed as a sub-flow (via `runFlow` from a parent flow), the script crashes:

```
TypeError: Cannot read property 'env' of undefined
  at <js> :program(seed.js:14:428-440)
```

Line 14: `const scenario = __maestro.env['SCENARIO'] || 'onboarding-complete';`

**What was tried:**

1. **`runScript` with `env` + `outputVariable`:**
   ```yaml
   - runScript:
       file: ../../scripts/seed.js
       env:
         API_URL: ${API_URL}
         SCENARIO: ${SEED_SCENARIO}
       outputVariable: seedResult
   ```
   Result: `Unknown Property: outputVariable` — Maestro 2.2.0 does not recognize `outputVariable` on `runScript`.

2. **`runScript` with `env` only (removed `outputVariable`):**
   ```yaml
   - runScript:
       file: ../../scripts/seed.js
       env:
         API_URL: ${API_URL}
         SCENARIO: ${SEED_SCENARIO}
   ```
   Result: `TypeError: Cannot read property 'env' of undefined` — `__maestro` object does not exist in the GraalJS engine context when the script executes inside a `runFlow` sub-flow.

3. **GraalJS TruffleAttach warning:** The engine also prints:
   ```
   WARNING: Unable to load the TruffleAttach library.
   ```
   This is likely related to the Unicode path issue (Issue 1/4) — GraalVM's native libraries extract to `%TEMP%` which resolves to the Unicode profile path. The `TEMP=C:\tools\tmp` override applies to the Maestro process but may not propagate to GraalVM's internal library extraction.

**What does work:**
- The seed API endpoint itself works (verified via curl): `POST /v1/__test/seed` returns `{ email, password, accountId, profileId, ids }`.
- The Clerk find-or-create pattern works — repeated calls with the same email reuse the existing Clerk user.
- The DB idempotent seeding works — `seedScenario()` deletes existing data before inserting.
- The comprehensive flow (`post-auth-comprehensive-devclient.yaml`) works with hardcoded credentials (65/65 steps passing).

**Impact:** 38 flows depend on `seed-and-sign-in.yaml` → `seed.js`. All 38 were blocked until the shell wrapper workaround was built.

### Workaround: Shell wrapper (`seed-and-run.sh`) — WORKING

**Date:** 2026-03-09

The `runScript` + GraalJS bridge is bypassed entirely. Instead, a shell wrapper script (`apps/mobile/e2e/scripts/seed-and-run.sh`) handles seeding via `curl` + `node` (for JSON parsing) on the host machine, then passes credentials to Maestro via `-e` CLI env vars.

**New architecture (3 layers, GraalJS bypassed):**

```
Layer 3: seed-and-run.sh (bash)       ← NEW: replaces broken GraalJS bridge
  1. curl -X POST /v1/__test/seed → JSON response
  2. node -e "..." → parse email, password, accountId, etc.
  3. maestro test -e EMAIL=... -e PASSWORD=... <flow-file>
  calls ↓
Layer 2: API endpoint                  ← WORKING (verified via curl)
  POST /v1/__test/seed { scenario, email }
  returns { email, password, accountId, profileId, ids }
  calls ↓
Layer 1: test-seed.ts service          ← WORKING (321 tests pass)
  - findClerkUserByEmail() → reuses existing Clerk user or creates new one
  - PATCH password + bypass_client_trust on Clerk user
  - Deletes existing DB account for this email (idempotent)
  - Runs scenario seeder (creates account, profile, subjects, sessions, etc.)
  - Returns all IDs + password to caller
```

**Updated `seed-and-sign-in.yaml`:**
- Removed `runScript` step entirely (seeding is done by the shell wrapper before Maestro starts)
- Changed `${output.email}` → `${EMAIL}` and `${output.password}` → `${PASSWORD}` (now read from Maestro CLI env vars)
- Flow now only handles: app launch → dev-client connection → sign-in → home screen verification

**Usage:**
```bash
cd apps/mobile/e2e
TEMP='C:\tools\tmp' TMP='C:\tools\tmp' ./scripts/seed-and-run.sh <scenario> <flow-file>

# Examples:
./scripts/seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
./scripts/seed-and-run.sh learning-active flows/learning/core-learning.yaml
./scripts/seed-and-run.sh retention-due flows/retention/recall-review.yaml
```

**Verified working (2026-03-09):**
- Seeding via curl → JSON parsing → credential extraction: works
- Maestro receives `${EMAIL}` and `${PASSWORD}` via `-e` flags: works
- `seed-and-sign-in.yaml` sub-flow: all 16 steps pass (launch → Metro → dev menu → sign-in → home)
- Conditional dev tools sheet dismissal (BUG-14 fix): works

### Previous seeding architecture (for reference)

The original design had 4 layers. Layer 3 (seed.js) is now bypassed by the shell wrapper.

**Layer 1 — `apps/api/src/services/test-seed.ts`** (working):
- 12 seed scenarios implemented: `onboarding-complete`, `learning-active`, `retention-due`, `failed-recall-3x`, `parent-with-children`, `trial-active`, `trial-expired`, `multi-subject`, `homework-ready`, `trial-expired-child`, `consent-withdrawn`, `parent-solo`
- Creates real Clerk users via Backend API (find-or-create pattern)
- Sets password via PATCH (avoids POST encoding bug — Issue 12)
- Sets `bypass_client_trust: true` (CAPTCHA bypass — Issue 11)
- Idempotent: deletes existing DB data for the email before seeding

**Layer 2 — `POST /v1/__test/seed`** (working):
- Guarded by `ENVIRONMENT !== 'production'` and optional `X-Test-Secret` header
- Validates input via Zod (`scenario` + `email`)
- Returns `{ scenario, accountId, profileId, email, password, ids: { subjectId, topicId, ... } }`
- Verified working: `curl -X POST http://localhost:8787/v1/__test/seed -H "Content-Type: application/json" -d '{"scenario":"onboarding-complete"}'` returns 201 with full response

**Layer 3 — `apps/mobile/e2e/scripts/seed.js`** (bypassed):
- Originally ran in Maestro's GraalJS engine — now **bypassed** by `seed-and-run.sh`
- Kept for reference but not used in the current architecture
- Reads env vars via `__maestro.env['SCENARIO']` and `__maestro.env['API_URL']`
- Cannot work because `__maestro` is undefined when called from `runFlow` sub-flow

**Layer 4 — `apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml`** (working):
- Called by 33 flows via `runFlow: _setup/seed-and-sign-in.yaml`
- `runScript` step removed — seeding done by `seed-and-run.sh` before Maestro starts
- Reads `${EMAIL}` / `${PASSWORD}` from Maestro CLI env vars (set by wrapper's `-e` flags)
- Step 1: `launchApp: clearState: true`
- Steps 2-3: Dev-client launcher + conditional dev menu overlay handling
- Steps 4-5: Sign in with `${EMAIL}` / `${PASSWORD}`
- Step 6: Wait for `home-scroll-view` (auth complete)
- **Verified working** (2026-03-09): all 16 steps pass

**Changes made to the seed infrastructure:**

| File | Change | Status |
|------|--------|--------|
| `apps/api/src/services/test-seed.ts` | Find-or-create Clerk user (avoids 422 on duplicate email) | Working |
| `apps/api/src/services/test-seed.ts` | Idempotent DB seeding (deletes existing account before insert) | Working |
| `apps/api/src/services/test-seed.ts` | PATCH password + `bypass_client_trust` after user creation | Working |
| `apps/api/src/services/test-seed.ts` | Password changed to `Mentomate2026xK` (non-breached, no special chars) | Working |
| `apps/mobile/e2e/scripts/seed-and-run.sh` | Shell wrapper: curl + node JSON parsing + Maestro `-e` flags | **Working** |
| `apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml` | Removed runScript, uses `${EMAIL}`/`${PASSWORD}` from CLI env vars | **Working** |
| `apps/mobile/e2e/flows/_setup/dismiss-devtools.yaml` | Helper flow: `pressKey: back` (called conditionally) | **Working** |
| `apps/mobile/e2e/flows/_setup/launch-devclient.yaml` | Port 8082, `pressKey: back` for dev tools sheet | Updated |
| `apps/mobile/e2e/flows/_setup/connect-server.yaml` | Port 8082, `pressKey: back` for dev tools sheet | Updated |

### Flow inventory (50 flows total)

| Category | Count | Status |
|----------|-------|--------|
| Comprehensive (hardcoded credentials) | 1 | **Passing** (65/65 steps) |
| Standalone auth (no seed needed) | 8 | **Not yet run** (should work) |
| Seed-dependent (via `seed-and-run.sh` + `seed-and-sign-in.yaml`) | 33 | **Unblocked** — seed chain working, individual flows need testing |
| Consent (special setup) | 2 | **Blocked** (need custom seed + consent state) |
| Camera/native (ML Kit OCR) | 1 | **Blocked** (emulator has no camera) |

### Known issues in individual flows (found during first seed-dependent run)

**BUG-14: `pressKey: back` exits app from navigation root**
- When no dev tools sheet is present after "Continue" overlay, `pressKey: back` navigates back from the sign-in screen (navigation root) to the dev-client launcher, exiting the app.
- The second dev tools sheet (showing "Reload", "Connected to", etc.) appears non-deterministically.
- **Fix:** Conditional execution using `runFlow: when: visible: "Reload"` — only press Back if the sheet is detected.
- Applied in: `seed-and-sign-in.yaml`, `post-auth-comprehensive-devclient.yaml`

**BUG-15: `tabBarTestID` not propagating to Android accessibility tree**
- `tabBarTestID: 'tab-more'` set in Expo Router `Tabs.Screen` options does not appear as `resource-id` in the Android UIAutomator hierarchy. The element has `resource-id=""`.
- Affects all `tapOn: id: "tab-*"` references in flows.
- **Workaround:** Use `tapOn: text: "More"` (text-based matching) instead of `tapOn: id: "tab-more"`.

**BUG-16: Maestro regex metacharacters in theme names**
- Theme names like `Eager Learner (Calm)` and `Parent (Light)` contain parentheses, which Maestro interprets as regex capture groups.
- `tapOn: text: "Eager Learner (Calm)"` fails because `(Calm)` is treated as a regex group.
- **Workaround:** Escape parentheses in Maestro text matchers: `"Eager Learner \\(Calm\\)"`, or use testIDs on theme buttons.

**BUG-17: Parent theme switch redirects away from More screen**
- Tapping "Parent (Light)" theme button changes persona to `parent`, triggering `_layout.tsx:575`: `if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />`.
- The More screen is replaced by the parent dashboard, making subsequent theme taps fail.
- The comprehensive flow handled this by testing Eager Learner ↔ Teen first, then Parent last with explicit redirect handling.
- Individual flows that test theme switching need the same ordering strategy.

---

## Session 5 Findings (2026-03-10)

### Architecture Evolution: Full ADB Automation

The seed-and-sign-in pipeline went through 3 major revisions in Sessions 4-5:

**v1 (Session 4):** Maestro-native launch
- `seed-and-run.sh` seeds via API, passes creds to Maestro as env vars
- `seed-and-sign-in.yaml` uses `launchApp: clearState: true`, conditional `when:` checks for launcher
- **Problem:** `launchApp` fails intermittently on WHPX (BUG-19), `when:` is a one-time check that misses the launcher

**v2 (Session 5, early):** Hybrid ADB + Maestro
- `seed-and-run.sh` clears state + launches via ADB (`pm clear` + `am start`)
- `seed-and-sign-in.yaml` uses `extendedWaitUntil: "DEVELOPMENT SERVERS"` (proper wait, 120s timeout)
- Maestro handles launcher tap, bundle load wait, "Continue" dismissal
- **Problem:** Maestro's UIAutomator2 gRPC driver crashes during resource-intensive bundle loading on WHPX

**v3 (Session 5, final):** Full ADB automation
- `seed-and-run.sh` handles EVERYTHING via ADB before Maestro starts:
  1. `pm clear` + `am start` (clear state, launch app)
  2. `am force-stop com.android.bluetooth` (BUG-21: kill Bluetooth service)
  3. `pm grant POST_NOTIFICATIONS` (BUG-22: pre-grant notification permission)
  4. `uiautomator dump` + grep for "DEVELOPMENT" (wait for launcher, 120s)
  5. Parse 8081 entry bounds from `uiautomator dump`, `input tap` at center (not hardcoded)
  6. Escalating sleep loop (15/30/60/90/120s) + `KEYCODE_BACK` + verify via dump
     (`uiautomator dump` is unreliable during Continue overlay — OOM kills the dump)
  7. If dump shows "Welcome back" → sign-in screen reached, break
  8. If dump shows "DEVELOPMENT" → went back too far, re-tap Metro and continue
  9. `uiautomator dump` + grep for "Reload" → `KEYCODE_BACK` (dismiss dev tools)
- `seed-and-sign-in.yaml` simplified to: wait for "Welcome back" → sign in → wait for home
- Maestro only starts AFTER the app is on the stable sign-in screen
- **Result:** Avoids Maestro gRPC crashes entirely; much more stable on WHPX

### Key Operational Procedures Discovered

**Emulator restart procedure:**
1. `adb -s emulator-xxxx emu kill` — kill emulator
2. Wait 5s
3. `emulator.exe -avd New_Device -no-snapshot -gpu host -no-audio &` — start fresh
4. Poll `adb shell getprop sys.boot_completed` until "1" (~30-40s)
5. Set up ADB reverse: `adb reverse tcp:8081 tcp:8081 && tcp:8082 && tcp:8787`
6. Run first test with `--reinstall-driver` flag to reinstall Maestro's UIAutomator agent

**Two-emulator pitfalls:**
- Bare `adb` (without `-s`) fails with "more than one device/emulator"
- `seed-and-run.sh` has `|| true` on all ADB commands, silently failing with 2 emulators
- Maestro's `--udid emulator-xxxx` flag can report "not connected" intermittently
- **Recommendation:** Run with single emulator for reliability

**Metro stability:**
- Metro + bundle proxy crash after ~15 consecutive `clearState` + bundle reload cycles
- **Mitigation:** Run batches of 5-6 flows, restart Metro between batches
- Cold-boot WHPX can take 60-90s before the dev-client launcher appears
- `uiautomator dump` can OOM during heavy bundle loading; needs retry loop

### New Bugs Discovered

**BUG-18: Persona switch crashes app (~50%)**
- `setPersona('teen')` from parent dashboard crashes due to navigation race condition
- Affects: `switch-to-teen` button on parent dashboard
- Mitigation: Parent theme test placed last in settings-toggles.yaml

**BUG-19: Maestro `launchApp` fails on WHPX**
- `launchApp` returns "Unable to launch app" intermittently
- Persistent after app crashes (BUG-18) or concurrent sessions
- Fix: ADB-based launch (`am force-stop` + `pm clear` + `am start`)

**BUG-20: `hideKeyboard` fails on some Android configs**
- Maestro's `hideKeyboard` → "Couldn't hide the keyboard. Custom input..."
- Fix: Tap a static text element (e.g., "Welcome back" heading) to defocus input

**BUG-21: "Bluetooth keeps stopping" dialog on WHPX**
- System dialog after emulator boot/restart, blocks entire UI
- Fix: `am force-stop com.android.bluetooth` before app launch + `dismiss-bluetooth.yaml` safety net

**BUG-22: POST_NOTIFICATIONS permission dialog blocks UI**
- Android 13+ shows dialog after sign-in; `pm clear` resets grant
- Fix: `pm grant com.mentomate.app android.permission.POST_NOTIFICATIONS` before app launch

**BUG-23: Missing `href: null` on `subject` route** (app code)
- Expo Router auto-discovers `subject/` as a visible tab, showing ~9 tabs instead of 3
- **Fixed:** Added `<Tabs.Screen name="subject" options={{ href: null }} />` to `(learner)/_layout.tsx`

**BUG-24: KeyboardAvoidingView broken on Android** (app code, systemic)
- `behavior={undefined}` on Android makes KeyboardAvoidingView a no-op across 6 input screens
- Sign-in worst case: SSO buttons push password field into keyboard zone
- **Fixed:** Changed to `behavior='height'` on Android across sign-in, sign-up, forgot-password, consent, create-profile, create-subject (8 instances)

**BUG-25: `profileScopeMiddleware` falls back to `account.id` — empty data on home screen** (app code, critical)
- When `X-Profile-Id` header is absent, `profileScopeMiddleware` skipped without setting `profileId`
- All 52 route handlers used `c.get('profileId') ?? account.id` fallback
- `account.id` is NEVER a valid `profile_id` → scoped queries return empty results
- **Effect:** Seeded subjects, streaks, coaching cards invisible on home screen; ~30 E2E flows blocked
- **Fixed:** `profileScopeMiddleware` now auto-resolves to owner profile when header absent. New `findOwnerProfile(db, accountId)` service function. Commit `35ef433`.

**tabBarButtonTestID fix** (relates to BUG-15)
- `tabBarTestID` is the wrong prop name. Expo Router uses `tabBarButtonTestID` for the actual tab bar button.
- Changed in both `(learner)/_layout.tsx` and `(parent)/_layout.tsx` for all 3 tabs (Home, Learning Book, More).
- Text-based matching (`tapOn: text: "More"`) still recommended for E2E flows as Expo Router may not propagate testIDs to Android accessibility tree consistently.

### Setup Helper Inventory (10 files)

| File | Purpose |
|------|---------|
| `seed-and-sign-in.yaml` | Wait for sign-in screen, enter credentials, wait for home |
| `launch-devclient.yaml` | Launch app, connect to Metro, dismiss overlays (for standalone flows) |
| `switch-to-parent.yaml` | More → "Parent (Light)" → wait for `dashboard-scroll` |
| `tap-metro-server.yaml` | Tap 8081 Metro entry (8082 via separate `tap-metro-8082.yaml`) |
| `dismiss-anr.yaml` | Tap "Wait" on ANR dialog |
| `dismiss-bluetooth.yaml` | Tap "Close app" on Bluetooth crash dialog |
| `dismiss-devtools.yaml` | Press Back to dismiss dev tools sheet |
| `dismiss-notifications.yaml` | Tap "Allow" on notification permission dialog |
| `nav-to-sign-in.yaml` | Navigate to sign-in from launcher |
| `sign-out.yaml` | Sign out via More → sign-out-button |

---

## ADB Tap Procedure — Correct Method (2026-03-10)

**Critical: Always dump the UI hierarchy BEFORE computing tap coordinates.** An empty or stale dump leads to incorrect coordinates and wasted time. The correct sequence:

### Step-by-step ADB tap procedure

```bash
export MSYS_NO_PATHCONV=1
ADB=/c/Android/Sdk/platform-tools/adb.exe

# 1. ALWAYS dump fresh hierarchy first
$ADB shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null

# 2. Verify the dump contains expected text (sanity check)
$ADB exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -oP 'text="[^"]+"' | sort -u

# 3. Extract bounds for the target element
BOUNDS=$($ADB exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
  | grep -oP 'text="TARGET_TEXT"[^/]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
  | head -1 \
  | grep -oP 'bounds="\K[^"]+')

# 4. ALWAYS verify bounds are non-empty before computing coordinates
if [ -z "$BOUNDS" ]; then
  echo "ERROR: Element not found in dump. Do NOT tap."
  exit 1
fi

# 5. Parse bounds and compute center
X1=$(echo "$BOUNDS" | grep -oP '\d+' | sed -n '1p')
Y1=$(echo "$BOUNDS" | grep -oP '\d+' | sed -n '2p')
X2=$(echo "$BOUNDS" | grep -oP '\d+' | sed -n '3p')
Y2=$(echo "$BOUNDS" | grep -oP '\d+' | sed -n '4p')
TAP_X=$(( (X1 + X2) / 2 ))
TAP_Y=$(( (Y1 + Y2) / 2 ))

# 6. Tap at computed center
$ADB shell input tap $TAP_X $TAP_Y
```

### Common mistakes to avoid

| Mistake | What happens | Fix |
|---------|-------------|-----|
| Tap before dump completes | Stale/empty bounds → tap at (0,0) | Always `$ADB shell uiautomator dump` THEN read |
| Dump during ANR dialog, read after dismiss | Dump XML contains dialog, not launcher UI | Re-dump after dismissing dialog |
| Empty bounds check skipped | `grep -oP` returns empty → arithmetic on empty → tap at (0,0) | Always `if [ -z "$BOUNDS" ]; then abort` |
| Dump during React Native overlay | `uiautomator dump` OOM-kills → XML is empty or truncated | Retry dump; if fails 3x, the overlay is blocking |
| Parse bounds from wrong element | Multiple elements match regex → first match may not be the target | Use `head -1` and verify visually |

### ANR Dialog Coordinates (1080x1920 screen)

ANR dialogs have fixed coordinates on the "New_Device" emulator (1080x1920, 480dpi):

| Dialog | Button | Bounds | Center tap |
|--------|--------|--------|------------|
| "System UI isn't responding" | Wait | `[75,1038][1005,1182]` | `(540, 1110)` |
| "System UI isn't responding" | Close app | `[75,894][1005,1038]` | `(540, 966)` |
| "App isn't responding" | Wait | `[75,1038][1005,1182]` | `(540, 1110)` |
| "Bluetooth keeps stopping" | Close app | `[75,894][1005,1038]` | `(540, 966)` |

**Note:** These coordinates are specific to 1080x1920 resolution. If the AVD resolution changes, re-extract from `uiautomator dump`.

### Dev-client Metro server entry tap

The Metro server list in the dev-client launcher has dynamic positions (mDNS discovery order is non-deterministic). **Always parse bounds from the dump — never hardcode coordinates.**

```bash
# Find 8082 entry (bundle proxy — required for BUG-7 workaround)
BOUNDS=$($ADB exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
  | grep -oP 'text="http://10.0.2.2:8082"[^/]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
  | head -1 | grep -oP 'bounds="\K[^"]+')
```

---

## Issue 13: Maestro gRPC Driver Crash on WHPX After Multiple Test Runs (2026-03-10)

**What happens:** After running 10-16 Maestro steps, the UIAutomator2 gRPC driver crashes with `UNAVAILABLE: io exception` or `Connection reset` on port 7001. The driver process on the device dies, taking the app with it. Subsequent test runs fail with `Maestro Android driver did not start up in time`.

**Trigger pattern:**
1. Maestro starts test, driver connects on port 7001
2. 10-16 steps complete successfully (assertions, taps, keyboard input)
3. During `waitForAppToSettle` (view hierarchy polling), the driver crashes
4. `io.grpc.StatusRuntimeException: UNAVAILABLE: io exception`
5. App process dies → Android home screen shown
6. Next test run: driver can't start (stale instrumentation conflict)

**Root cause:** WHPX emulator resource contention. The UIAutomator2 instrumentation server (runs as a separate process on the device) competes with the React Native app for CPU/memory on the slow WHPX virtualization. During the `waitForAppToSettle` phase, Maestro polls the view hierarchy every ~100ms, creating a burst of gRPC calls that overwhelm the emulator.

**Recovery procedure:**
```bash
# 1. Uninstall stuck driver APKs
$ADB uninstall dev.mobile.maestro
$ADB uninstall dev.mobile.maestro.test

# 2. Force-stop the app
$ADB shell am force-stop com.mentomate.app

# 3. Relaunch (Maestro will reinstall driver on next test run)
$ADB shell am start -n com.mentomate.app/.MainActivity

# If driver still won't start, reboot the emulator:
$ADB reboot
# Then re-establish port forwarding after boot:
$ADB reverse tcp:8081 tcp:8081
$ADB reverse tcp:8082 tcp:8082
$ADB reverse tcp:8787 tcp:8788
```

**Mitigation:** Keep test flows short (< 15 steps). Split long flows into separate files. Give the emulator breathing room between tests (seed-and-run.sh adds 5-10s between steps). Avoid rapid keyboard input/dismiss cycles.

---

## Operational Checklist — Starting an E2E Session (2026-03-10)

Before running any E2E tests, verify ALL services are running:

| # | Service | Verify command | Expected |
|---|---------|---------------|----------|
| 1 | Emulator | `$ADB devices` | `emulator-5554  device` |
| 2 | Metro | `curl http://localhost:8081/status` | `packager-status:running` |
| 3 | Bundle proxy | `curl http://localhost:8082/status` | `packager-status:running` |
| 4 | API server | `curl http://localhost:8788/v1/health` | `{"status":"ok",...}` |
| 5 | ADB reverse | `$ADB reverse --list` | 3 rules: 8081→8081, 8082→8082, 8787→8788 |

**If any service is down, the app will fail to load the bundle or seed data.**

### Service startup commands

```bash
# Metro (from apps/mobile/)
cd apps/mobile && npx expo start --port 8081 &

# Bundle proxy (from project root)
node apps/mobile/e2e/bundle-proxy.js &

# API server (port 8788 — 8787 has zombie workerd processes)
cd apps/api && npx wrangler dev --port 8788 &

# Port forwarding (must re-do after emulator reboot)
$ADB reverse tcp:8081 tcp:8081
$ADB reverse tcp:8082 tcp:8082
$ADB reverse tcp:8787 tcp:8788
```

### After emulator reboot

1. Wait for `sys.boot_completed = 1`
2. Re-establish `adb reverse` port forwarding (rules are lost on reboot)
3. Pre-grant notification permission: `$ADB shell pm grant com.mentomate.app android.permission.POST_NOTIFICATIONS`
4. Kill Bluetooth: `$ADB shell am force-stop com.android.bluetooth`
5. Check for ANR dialogs and dismiss them
6. Verify all services are up before launching the app

---

## Session 7 Findings (2026-03-10) — `seed-and-run.sh` v4

### `adb reverse` is MANDATORY for Metro

Without `adb reverse tcp:8081 tcp:8081` and `tcp:8082 tcp:8082`, the dev-client cannot reach Metro on the host. The error screen shows:

```
java.lang.RuntimeException: Unable to load script.
Make sure you're running Metro or that your bundle 'index...'
```

`seed-and-run.sh` now sets up `adb reverse` automatically in the pre-flight step. Previously this was manual.

### `seed-and-run.sh` v4 Changes

**Problem:** v3 used `KEYCODE_BACK` to dismiss the "Continue" dev menu overlay. On fast cached bundles (3s load), the overlay appeared and was dismissed, but subsequent Back presses navigated backward from the sign-in screen (navigation root), exiting the app. The script then looped in "Loading..." state for the full timeout (300s in v3) with no useful output.

**Another problem:** When the bundle failed to load (Metro unreachable), the error screen showed "Reload" / "Go To Home". The script matched "Reload" as a dev tools sheet and pressed Back in an infinite loop.

**Fixes applied:**

| Change | v3 | v4 |
|--------|----|----|
| Dismiss "Continue" overlay | `KEYCODE_BACK` (exits app!) | **Tap button by bounds** (targeted) |
| Dev tools "Reload" back-presses | Unlimited loop | **Max 3 attempts**, then FATAL exit |
| Error screen detection | None | **Instant FATAL** on "problem loading" / "Unable to load script" |
| Launcher timeout | 120s (hardcoded) | **45s** default, `LAUNCHER_TIMEOUT` env var |
| Bundle timeout | 300s (hardcoded) | **120s** default, `BUNDLE_TIMEOUT` env var |
| Fast mode | N/A | `FAST=1` → 20s launcher, 60s bundle |
| Poll interval | 5s | **3s** |
| Emulator health check | None | `adb get-state` on every loop iteration |
| App relaunch attempts | Unlimited | **Max 2**, then FATAL exit |
| Ctrl+C handling | Script hangs | **Trap INT/TERM** → immediate clean exit |
| `adb reverse` setup | Manual | **Automatic** (8081 + 8082) |
| Timeout warning | "continuing anyway" | **FATAL exit** with diagnostic dump |
| Unknown state logging | "Loading..." (no detail) | Shows first 5 visible text elements |

**Performance comparison (cached bundle on E2E_Device_2):**
- v3: 120s+ (entered infinite "Loading" loop due to Back key exiting app)
- v4: **9 seconds** (launcher 3s → Metro tap → Continue tap → dev tools Back → sign-in)

---

## Issue 14: Expo Router Directory Routes Break Tab Bar in Dev-Client (2026-03-10)

**What happened:** The Learning Book tab (`(learner)/book/`) was unreachable via Maestro in dev-client builds. The `tabBarAccessibilityLabel: 'Learning Book Tab'` configured on the `Tabs.Screen` was being ignored — Android UIAutomator showed `content-desc="⏷, book/index"` instead of the configured label.

**Root cause:** Expo Router treats **directory routes** (`book/index.tsx`) differently from **file routes** (`book.tsx`). When a tab screen is a directory route:
1. The tab bar displays the raw path segment (`book/index`) instead of the configured `title` option
2. `tabBarAccessibilityLabel` is NOT propagated to the Android `contentDescription`
3. `tabBarButtonTestID` is also NOT propagated

This is likely because Expo Router internally constructs a different screen name for directory routes (using the directory path) rather than the simple file name.

**Discovery method:** `adb exec-out uiautomator dump /dev/stdout` showed the tab's `content-desc` attribute. The Learning Book tab had `content-desc="⏷, book/index"` while the Home tab (a file route) correctly had `content-desc="Home Tab"`.

**Fix:**
1. Flatten `book/index.tsx` → `book.tsx` (file route)
2. Update all import paths (component goes from `../../../hooks/...` to `../../hooks/...`)
3. Update the `(parent)/book.tsx` re-export path
4. Update the test file paths similarly

**Lesson for future agents:**
- **Always use file routes for tab screens** (e.g., `book.tsx`, not `book/index.tsx`). Directory routes break tab bar configuration in dev-client.
- **Use `tabBarAccessibilityLabel`** (not `tabBarButtonTestID`) for tab navigation in Maestro flows. It maps to Android `contentDescription` which Maestro matches via `tapOn: "label"`.
- **Verify with UIAutomator:** `adb exec-out uiautomator dump /dev/stdout | grep -o 'content-desc="[^"]*"'` shows what Maestro can actually see.
- **Never use point-tap (`tapOn: point:`) for tab navigation** — dev-client builds show extra hidden tabs (BUG-10), shifting all tab positions unpredictably.

---

## Issue 15: react-native-svg Crash on Fabric (New Architecture) — ClassCastException (2026-03-10)

**What happens:** Navigating to the Learning Book tab crashes the app with a red error screen:

```
java.lang.ClassCastException: java.lang.String cannot be cast to...
  at com.facebook.react.uimanager.BaseViewManagerDelegate
  at com.facebook.react.viewmanagers.RNSVGGroupManagerDelegate
  at com.facebook.react.fabric.mounting.SurfaceMountingManager.updateProp
```

**Environment:**
- `react-native-svg: 15.12.1`
- `newArchEnabled=true` (Fabric) in `android/gradle.properties:41`
- `react-native-reanimated` provides animated SVG transforms

**Affected component:** `BookPageFlipAnimation.tsx` uses `Svg`, `Rect`, `Line`, `G` from react-native-svg. The `G` (Group) component triggers the Fabric `RNSVGGroupManagerDelegate` crash when receiving animated props from reanimated.

**Reproduction:** 100% reproducible — tap "Learning Book Tab" on any seeded flow. The loading state renders `BookPageFlipAnimation` which crashes immediately.

**Why home screen SVG doesn't crash:** `PenWritingAnimation` (also SVG) only renders during `coachingCard.isLoading` on the home screen. In E2E tests, the coaching card API responds fast enough that the loading state is never visible — the SVG never mounts.

**Not an emulator issue:** This is a genuine react-native-svg + Fabric incompatibility. It would crash on real devices with Fabric enabled too.

**Tracked as:** BUG-33 in `e2e-test-bugs.md`

**Lesson for future agents:**
- **react-native-svg + Fabric + reanimated** is a known fragile combination. If you see `ClassCastException` in `RNSVG*ManagerDelegate`, it's a prop type mismatch in the Fabric bridge.
- **Don't modify the animation component to fix E2E tests** (CLAUDE.md Rule 4). This is an app bug that needs a proper fix (update react-native-svg, replace with non-SVG animation, or add error boundary).
- **SVG loading animations may not crash on fast networks** because the loading state resolves before SVG mounts. Test on slow connections or add artificial delays to expose these crashes.
