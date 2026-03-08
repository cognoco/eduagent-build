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
- The username path contains diacritical characters: `C:\Users\ZuzanaKopečná\`
- Java's `jar tf` command on `jvm-version.jar` in the same path failed with: `java.nio.file.InvalidPathException: Illegal char <?> at index 19: C:\Users\ZuzanaKope?ná\.maestro\bin\jvm-version.jar`
- Java cannot resolve the file path due to character encoding mismatch between Git Bash (MSYS2) and Java's Windows path parser

**Workaround applied:** Copied Maestro installation to `C:\tools\maestro\` (ASCII-only path).

**Second failure at new path:** Maestro's jansi native library extracts to `%TEMP%` which still resolves to the user profile path with diacritics:
```
Failed to load native library: jansi-2.4.1-fed648149b32e3a9-jansi.dll
java.lang.UnsatisfiedLinkError: C:\Users\ZuzanaKope?ná\AppData\Local\Temp\jansi-2.4.1-...
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

**ADB version:** 36.0.2 — the ADB binary path also showed mangled characters: `C:\Users\ZuzanaKopecná\AppData\Local\Android\Sdk\platform-tools\adb.exe`

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

**Root cause:** The Unicode character `č` (U+010D) in the user profile path `C:\Users\ZuzanaKopečná\` causes Windows `LoadLibrary` to silently fail when loading DLLs from paths containing this character. This affects:
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
robocopy "C:\Users\ZuzanaKopečná\AppData\Local\Android\Sdk\emulator" "C:\Android\Sdk\emulator" /E /NP /PURGE
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

**Fix:** Override `TEMP` and `TMP` to ASCII paths:
```bash
export TEMP="C:\\tools\\tmp"
export TMP="C:\\tools\\tmp"
```

**Note:** Kotlin falls back to in-process compilation after daemon failure ("Using fallback strategy: Compile without Kotlin daemon"), so the build proceeds but is slower.

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
Copy-Item 'C:\Users\ZuzanaKopečná\AppData\Local\Android\Sdk\licenses\*' 'C:\Android\Sdk\licenses\' -Force

# Create junctions for data-only SDK components
$dirs = @('ndk', 'build-tools', 'platforms', 'extras', 'sources', 'skins')
foreach ($d in $dirs) {
    New-Item -ItemType Junction -Path "C:\Android\Sdk\$d" `
        -Target "C:\Users\ZuzanaKopečná\AppData\Local\Android\Sdk\$d"
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
cp "C:\Users\ZuzanaKopečná\AppData\Local\Android\Sdk\cmake\3.22.1\bin\*" \
   C:\Android\Sdk\cmake\3.22.1\bin/

# Junction for CMake modules (data files, no CreateProcess)
New-Item -ItemType Junction -Path 'C:\Android\Sdk\cmake\3.22.1\share' `
    -Target 'C:\Users\ZuzanaKopečná\AppData\Local\Android\Sdk\cmake\3.22.1\share'
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

## Current Status (2026-03-07)

| Component | Status | Notes |
|-----------|--------|-------|
| Emulator boot | Working | From ASCII SDK path (`C:\Android\Sdk`) |
| ADB | Working | v36.0.2 at `C:\Android\Sdk\platform-tools` |
| Maestro CLI | Working | v2.2.0 at `C:\tools\maestro` with TEMP override |
| Gradle daemon | Working | With `GRADLE_USER_HOME=C:\tools\gradle` |
| Kotlin compiler | Working (fallback) | Daemon fails but in-process compilation works |
| CMake library builds | Working | init.gradle redirects `.cxx` to `C:\B\<module>` |
| CMake app build | Working | Ninja 1.12.1 handles >260 char paths |
| Android APK build | **Working** | BUILD SUCCESSFUL (5m 21s), APK installed on emulator |
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

**Bottom line:** The Android debug APK builds successfully from the original project path. All issues caused by Unicode characters in the user profile path and pnpm's long hash-based paths have been resolved through a combination of:
1. ASCII SDK path (`C:\Android\Sdk`) for executables
2. Env var overrides (`GRADLE_USER_HOME`, `TEMP`/`TMP`) for Java/Kotlin tooling
3. Gradle init.gradle to redirect CMake `.cxx` intermediates to `C:\B\`
4. Ninja 1.12.1 upgrade to handle >260 char source file paths
