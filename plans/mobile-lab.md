# Mobile Lab Setup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a lightly isolated dedicated macOS user account named `mobile-lab` for MentoMate mobile E2E work, with Android support now and a clean path to add iOS support later.

**Architecture:** Use one dedicated GUI-capable macOS account as the owner of the mobile test environment. Keep shared machine-level software minimal, but keep SDKs, emulator/simulator state, shell config, secrets, Maestro state, and repo execution under `mobile-lab` so the environment is reproducible and isolated from the primary user.

**Tech Stack:** macOS, Homebrew, Node.js, pnpm, Java 17, Maestro CLI, Android SDK, Android Emulator, Doppler CLI, Expo dev-client, Metro, later Xcode + iOS Simulator.

---

## Scope

This plan covers:

- creation and use of the `mobile-lab` user
- light-isolation setup on the current Mac Mini
- Android E2E prerequisites for the repo's Maestro workflow
- validation of the local Android execution stack
- preparation for later iOS expansion in the same account

This plan does not cover:

- full CI automation
- Maestro Cloud or BrowserStack migration
- app-code changes
- signing/release-distribution workflows

## File Structure / Ownership

Expected machine-level/shared components:

- `/Applications/Android Studio.app` if installed
- `/Library/Java/JavaVirtualMachines/...` for Java 17
- Homebrew installation under `/opt/homebrew`
- Xcode Command Line Tools under `/Library/Developer/CommandLineTools`

Expected `mobile-lab` user-owned components:

- `/Users/mobile-lab/.zshrc`
- `/Users/mobile-lab/.maestro/`
- `/Users/mobile-lab/Library/Android/sdk/`
- `/Users/mobile-lab/.doppler/` and Doppler auth/config
- `/Users/mobile-lab/...` repo checkout or worktree
- Android AVD state in the `mobile-lab` home directory
- later: iOS Simulator/Xcode derived data under the same user

---

### Task 1: Create The `mobile-lab` Account

**Files:**
- Create/OS-managed: `/Users/mobile-lab`
- Verify later: `/Users/mobile-lab/.zshrc`

- [ ] **Step 1: Create the macOS user account**

Create a standard macOS user named `mobile-lab` using System Settings.

Required choices:
- Username: `mobile-lab`
- Account type: `Standard`
- Password: store per team policy

Expected result:
- `/Users/mobile-lab` exists after first login

- [ ] **Step 2: Perform the first GUI login**

Log into `mobile-lab` through Jump Desktop once so macOS creates the full home/profile directories and GUI-session metadata required for emulator work.

Expected result:
- Desktop session opens successfully
- Home directory and standard Library folders are created

- [ ] **Step 3: Verify SSH access**

From an existing terminal session, verify that `mobile-lab` can be targeted for CLI work after the initial GUI login.

Run:

```bash
id mobile-lab
ls -la /Users/mobile-lab
```

Expected:
- user exists
- home directory exists

---

### Task 2: Confirm Shared Machine Baseline

**Files:**
- Verify only: machine-level shared installations

- [ ] **Step 1: Verify current shared tooling**

Run:

```bash
brew --version
node -v
pnpm -v
doppler --version
rg --version | head -n 1
xcode-select -p
```

Expected:
- Homebrew available
- Node 24.x available
- pnpm available
- Doppler available
- ripgrep available
- Xcode Command Line Tools path returned

- [ ] **Step 2: Decide whether Node 24 is acceptable for first pass**

Current repo guidance says Node 24 works with a warning. Keep Node 24 unless a concrete incompatibility appears during Expo/Maestro setup.

Decision:
- default: keep existing Node 24
- fallback: install Node 22 later only if needed

---

### Task 3: Install Java 17 For Maestro

**Files:**
- Machine-level install managed by Homebrew cask
- Modify later: `/Users/mobile-lab/.zshrc`

- [ ] **Step 1: Install Java 17**

Run:

```bash
brew install --cask temurin@17
```

Expected:
- Java 17 is installed system-wide

- [ ] **Step 2: Verify Java**

Run:

```bash
/usr/libexec/java_home -V
java -version
```

Expected:
- Java 17 appears in the installed JVM list
- `java -version` reports 17.x

---

### Task 4: Prepare `mobile-lab` Shell Environment

**Files:**
- Create/Modify: `/Users/mobile-lab/.zshrc`

- [ ] **Step 1: Create a minimal shell profile**

Add the following baseline to `/Users/mobile-lab/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:$HOME/.maestro/bin:$PATH"
```

Expected:
- Java and Homebrew binaries resolve correctly for `mobile-lab`

- [ ] **Step 2: Load the shell config**

As `mobile-lab`, run:

```bash
source ~/.zshrc
echo "$JAVA_HOME"
java -version
```

Expected:
- `JAVA_HOME` points to Java 17
- `java -version` succeeds

---

### Task 5: Install Maestro Under `mobile-lab`

**Files:**
- Create/Modify: `/Users/mobile-lab/.maestro/`

- [ ] **Step 1: Install Maestro CLI as `mobile-lab`**

Run as `mobile-lab`:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Expected:
- Maestro installs under `~/.maestro`

- [ ] **Step 2: Verify Maestro**

Run as `mobile-lab`:

```bash
source ~/.zshrc
maestro --version
```

Expected:
- Maestro version prints successfully

---

### Task 6: Install Android Tooling With Light Isolation

**Files:**
- Machine-level shared app: `/Applications/Android Studio.app`
- User-owned SDK: `/Users/mobile-lab/Library/Android/sdk/`

- [ ] **Step 1: Install Android Studio**

Run:

```bash
brew install --cask android-studio
```

Expected:
- Android Studio is available in `/Applications`

- [ ] **Step 2: Provision the Android SDK as `mobile-lab`**

Log into the `mobile-lab` GUI session and use Android Studio only for initial provisioning.

Install these components:
- Android SDK Platform-Tools
- Android SDK Command-line Tools
- Android Emulator
- Android 14 / API 34 platform
- Android 14 / API 34 ARM64 system image with Google APIs

Expected:
- SDK is installed under `/Users/mobile-lab/Library/Android/sdk`

- [ ] **Step 3: Create one emulator**

Inside Android Studio's device manager, create one AVD with:
- Pixel 8 or similar
- API 34
- ARM64 image
- Google APIs image

Expected:
- exactly one working AVD exists for initial setup

---

### Task 7: Add Android Paths To `mobile-lab`

**Files:**
- Modify: `/Users/mobile-lab/.zshrc`

- [ ] **Step 1: Append Android environment variables**

Add this block to `/Users/mobile-lab/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Expected:
- Android tooling resolves from the `mobile-lab` shell

- [ ] **Step 2: Verify CLI access**

Run as `mobile-lab`:

```bash
source ~/.zshrc
adb version
emulator -version
sdkmanager --list | head
avdmanager list avd
emulator -list-avds
```

Expected:
- all commands resolve
- at least one AVD is listed

---

### Task 8: Configure Doppler And Repo Access For `mobile-lab`

**Files:**
- Create/Modify: `/Users/mobile-lab/.doppler/`
- Create/Clone: repo checkout or worktree under `/Users/mobile-lab/...`

- [ ] **Step 1: Verify Doppler in the `mobile-lab` shell**

Run as `mobile-lab`:

```bash
source ~/.zshrc
doppler --version
```

Expected:
- Doppler CLI resolves successfully

- [ ] **Step 2: Authenticate Doppler as `mobile-lab`**

Run as `mobile-lab`:

```bash
doppler login
doppler setup
```

Choose:
- project: `mentomate`
- config: `stg`

Expected:
- the `mobile-lab` account has its own valid Doppler config

- [ ] **Step 3: Create repo access under `mobile-lab`**

Choose one of:
- fresh clone under `/Users/mobile-lab`
- dedicated worktree owned by `mobile-lab`

Preferred default:
- fresh checkout for runner cleanliness

Expected:
- `mobile-lab` can run repo commands without depending on the main user's checkout

---

### Task 9: Validate Android Runtime Prerequisites

**Files:**
- Verify only: emulator/device state, local repo state

- [ ] **Step 1: Boot the emulator**

Run as `mobile-lab`:

```bash
source ~/.zshrc
emulator -avd "<YOUR_AVD_NAME>" -no-snapshot-load -no-metrics
```

Expected:
- emulator launches successfully in the GUI session

- [ ] **Step 2: Verify ADB sees the emulator**

Run in another shell as `mobile-lab`:

```bash
adb devices
adb shell getprop sys.boot_completed
```

Expected:
- one emulator is listed as `device`
- boot completion returns `1`

- [ ] **Step 3: Start Metro**

From the `mobile-lab` repo checkout:

```bash
cd apps/mobile
pnpm exec expo start --port 8081 --dev-client
```

In another shell:

```bash
curl -s http://localhost:8081/status
```

Expected:
- `packager-status:running`

---

### Task 10: Install Or Verify The Android Dev Client

**Files:**
- Verify app package on emulator

- [ ] **Step 1: Check whether the app is already installed**

Run as `mobile-lab`:

```bash
adb shell pm list packages | grep mentomate
```

Expected:
- `package:com.mentomate.app` if already installed

- [ ] **Step 2: Install the app if missing**

Use the repo-approved method. Current documented options are:
- install an existing Android build artifact
- run Expo Android build/install flow from `apps/mobile`
- use the team's EAS/dev-client install workflow

Expected:
- `com.mentomate.app` is present on the emulator

---

### Task 11: Run The First Smoke Flow

**Files:**
- Verify only: repo E2E orchestration

- [ ] **Step 1: Execute the smoke flow**

From the repo root as `mobile-lab`, run:

```bash
METRO_URL=http://10.0.2.2:8081 \
bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
  apps/mobile/e2e/flows/quick-check.yaml
```

Expected:
- Maestro starts
- the dev-client launches
- the flow reaches the sign-in area
- any known drift is clearly distinguishable from infrastructure failure

- [ ] **Step 2: Record infrastructure state**

Document:
- Java version
- Maestro version
- emulator AVD name
- whether the app package was preinstalled or newly installed
- whether Metro and smoke flow started cleanly

Expected:
- the environment can be reproduced later without guesswork

---

### Task 12: Add Lightweight Operating Rules

**Files:**
- Optional doc note in team docs later

- [ ] **Step 1: Define usage boundaries**

Adopt these rules for `mobile-lab`:
- run emulator and Metro only from `mobile-lab`
- keep one Android AVD initially
- avoid installing unrelated dev tools there
- do not mix normal-user and `mobile-lab` mobile test processes

Expected:
- environment drift stays low

- [ ] **Step 2: Define cleanup habits**

Use these commands when done:

```bash
adb -s emulator-5554 emu kill
lsof -ti:8081 | xargs kill
```

Expected:
- emulator and Metro shut down cleanly

---

### Task 13: Reserve The Same User For Future iOS Setup

**Files:**
- Future user-owned iOS/Xcode state under `/Users/mobile-lab`

- [ ] **Step 1: Keep `mobile-lab` as the shared mobile runner account**

Decision:
- Android and iOS should share the same dedicated user unless a real conflict appears later

Reason:
- one repo checkout
- one Maestro install
- one secrets/auth context
- one operator workflow

- [ ] **Step 2: Document future iOS additions**

When iOS work begins, add to the same user:
- Xcode.app
- iOS Simulator runtimes
- any required Apple ID/signing access
- Maestro iOS execution validation

Expected:
- the machine evolves into one mobile test workstation, not two fragmented environments

---

## Validation Checklist

Before calling the setup complete, all of these should be true:

- [ ] `mobile-lab` exists and has completed one GUI login
- [ ] `java -version` returns 17.x in the `mobile-lab` shell
- [ ] `maestro --version` succeeds in the `mobile-lab` shell
- [ ] `adb version` succeeds in the `mobile-lab` shell
- [ ] `emulator -list-avds` returns at least one AVD
- [ ] `doppler --version` and `doppler setup` work in the `mobile-lab` account
- [ ] Metro starts on port 8081 from the `mobile-lab` repo checkout
- [ ] `adb shell pm list packages | grep mentomate` shows `com.mentomate.app`
- [ ] `seed-and-run.sh --no-seed` launches the smoke flow without infrastructure failure

## Open Decisions

These are the only unresolved choices before execution:

1. Whether `mobile-lab` gets a fresh repo clone or a dedicated worktree
2. Whether Android Studio is installed immediately via Homebrew or manually later
3. Which exact method the team prefers for installing the Android dev client on the emulator
4. Whether Node 24 is kept or downgraded to Node 22 if Expo tooling objects
