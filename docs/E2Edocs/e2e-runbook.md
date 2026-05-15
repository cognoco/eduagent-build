> **STATUS: ACTIVE** — canonical operational runbook for Maestro E2E.

# E2E Runbook — Mobile (Maestro on Android dev-client)

How to run mobile E2E tests on this project. Covers macOS (Apple Silicon),
Windows (MSYS/Git Bash), and Linux/CI (headless). For general Maestro YAML
patterns (testIDs, GraalJS, adaptive flows), see the `my:maestro-testing`
skill.

If anything in this runbook stops matching reality, the vault README under
`docs/_vault/emulator-2026-04-30/` has historical context from the original
Windows setup.

---

## Quick reference

| Item | Value |
|---|---|
| Working directory | repo root or any worktree |
| Metro port | 8081 (dev-client mode) |
| Emulator → host bundle URL | `http://10.0.2.2:8081` |
| Canonical orchestrator | `bash apps/mobile/e2e/scripts/seed-and-run.sh` |
| Smoke flow | `apps/mobile/e2e/flows/quick-check.yaml` |
| App package | `com.mentomate.app` |

### OS-specific paths

| Item | macOS | Windows (MSYS) | Linux/CI |
|---|---|---|---|
| Android SDK | `~/Library/Android/sdk` or `$ANDROID_HOME` | `C:\Android\Sdk` | `$ANDROID_HOME` (typically `/usr/local/android-sdk`) |
| Maestro binary | `~/.maestro/bin/maestro` | `/c/tools/maestro/bin/maestro` (see Windows caveats) | `~/.maestro/bin/maestro` |
| Doppler | `doppler` (Homebrew) | `C:/Tools/doppler/doppler.exe` | `doppler` (apt/brew) |
| AVD name | any Pixel API 34+ | `E2E_Device_2` | headless via `-no-window` |

---

## Prerequisites

### All platforms

- **Node.js** — repo expects v22.x (v24.x works with a warning)
- **pnpm** — v10.x
- **Doppler CLI** — configured with `doppler setup` → `mentomate` / `stg`. Only needed for seeded flows.
- **Java 17+** — required by Maestro

### macOS

- **Android SDK** via Android Studio or standalone command-line tools. Ensure `adb` and `emulator` are on PATH:
  ```bash
  export ANDROID_HOME=~/Library/Android/sdk
  export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
  ```
- **Maestro** — standard install:
  ```bash
  curl -Ls "https://get.maestro.mobile.dev" | bash
  ```
  After install, `~/.maestro/bin/maestro` should resolve. Add to PATH or invoke directly.
- **Doppler** via Homebrew:
  ```bash
  brew install dopplerhq/cli/doppler
  doppler login && doppler setup  # pick mentomate / stg
  ```

### Windows

- **Android SDK** at `C:\Android\Sdk` with `emulator` and `platform-tools` on PATH.
- **Maestro** at `C:\tools\maestro\` — **NOT** `~/.maestro/bin/`. The bare-PATH `maestro` may resolve to a broken Unicode-path install on machines with non-ASCII usernames. Always invoke via the full `/c/tools/maestro/bin/maestro` path from MSYS, or `C:\tools\maestro\bin\maestro.bat` from cmd/PowerShell.
- **Doppler CLI** at `C:\Tools\doppler\doppler.exe`.
- **WSL2 is NOT required** for E2E. WSL2 is only needed for native Android APK builds (NDK toolchain). Maestro + emulator + Metro all run on Windows-native.
- **TEMP/TMP override** — on machines with Unicode characters in the username (e.g. `ZuzanaKopečná`), Java's jansi.dll extraction fails. Set `TEMP=C:/tools/maestro/tmp` and `TMP=C:/tools/maestro/tmp` for all Maestro invocations.

### Linux / CI

- **Android SDK** via `sdkmanager`. Headless emulator requires `emulator -no-window`.
- **Maestro** — same install script as macOS.
- **Doppler** — install via apt or the standalone binary.
- **KVM acceleration** required for usable emulator performance on Linux. Verify: `ls /dev/kvm`.

---

## The boot sequence

Each step has the exact command and expected output. Stop and fix at the first failing step.

### 1. Launch the emulator

**macOS:**
```bash
emulator -avd <avd_name> -no-snapshot-load -no-metrics
```

**Windows (MSYS):**
```bash
/c/Android/Sdk/emulator/emulator.exe -avd E2E_Device_2 -no-snapshot-load -no-metrics
```

**Linux/CI (headless):**
```bash
emulator -avd <avd_name> -no-snapshot-load -no-metrics -no-window -gpu swiftshader_indirect
```

Run in background or a separate terminal. `-no-snapshot-load` forces a clean
boot (snapshot bugs are common); `-no-metrics` quiets a Google telemetry
prompt that can hang in some sessions.

### 2. Verify ADB sees the device booted

```bash
adb devices
# expect:
#   List of devices attached
#   emulator-5554   device

adb shell getprop sys.boot_completed
# expect: 1
```

If `device` is `offline`, wait — `sys.boot_completed=1` is the truth signal,
not the `adb devices` line.

### 3. Verify the dev-client APK is installed

```bash
adb shell pm list packages | grep mentomate
# expect: package:com.mentomate.app
```

The APK survives `-no-snapshot-load`. Only `-wipe-data` removes it. If
missing, reinstall via EAS or `npx expo run:android` from `apps/mobile/`.

### 4. Start Metro (port 8081, dev-client mode)

From the **main repo** (not a worktree — Metro caches per-checkout):

```bash
cd apps/mobile
pnpm exec expo start --port 8081 --dev-client
```

Wait for `packager-status:running`:

```bash
curl -s http://localhost:8081/status
# expect: packager-status:running
```

Metro loads `.env.development.local` and `.env.local` natively. Doppler is
**not** needed for Metro startup; it's only needed for the API server when
running seeded flows.

### 5. Run a flow via `seed-and-run.sh`

**macOS / Linux:**
```bash
METRO_URL=http://10.0.2.2:8081 \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
    apps/mobile/e2e/flows/quick-check.yaml
```

**Windows (MSYS):**
```bash
METRO_URL=http://10.0.2.2:8081 \
  TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
    apps/mobile/e2e/flows/quick-check.yaml
```

Expected: bundle in <30s, app reaches sign-in, 6/7 assertions pass on
`quick-check.yaml`. The "Sign up" assertion fails — known UI drift, not infra.

---

## Running flows

`seed-and-run.sh` is the canonical entry point. It does pm-clear → ADB launch →
tap Metro entry → tap Continue → close dev tools → wait for sign-in, then runs
your flow. Maestro's own `launchApp` has been unreliable on some emulator
configurations (BUG-19 on WHPX); the script does it via ADB instead.

### Smoke run (no seed)

**macOS / Linux:**
```bash
METRO_URL=http://10.0.2.2:8081 \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
    apps/mobile/e2e/flows/quick-check.yaml
```

**Windows (MSYS):**
```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
    apps/mobile/e2e/flows/quick-check.yaml
```

### Seeded flow (requires Doppler + API)

**macOS / Linux:**
```bash
doppler run -c stg -- \
  bash apps/mobile/e2e/scripts/seed-and-run.sh \
    onboarding-complete apps/mobile/e2e/flows/<your-flow>.yaml
```

**Windows (MSYS):**
```bash
C:/Tools/doppler/doppler.exe run -c stg -- \
  bash apps/mobile/e2e/scripts/seed-and-run.sh \
    onboarding-complete apps/mobile/e2e/flows/<your-flow>.yaml
```

The Doppler `-c stg` config matches the seed endpoint's `TEST_SEED_SECRET`.

### Required env vars

| Env var | When | Why |
|---|---|---|
| `METRO_URL=http://10.0.2.2:8081` | Always | Overrides the script default of `:8082` (the BUG-7 bundle proxy, empirically unnecessary since 2026-04-30). The harness parses the port from this URL and `adb reverse`s it automatically, so non-default ports such as `:8083` work when another branch holds `:8081`/`:8082`. The preflight check uses the same value. |
| `TEMP=C:/tools/maestro/tmp` | Windows only | Java jansi.dll extraction otherwise hits `C:\Users\ZuzanaKopečná\AppData\...` and fails on the Unicode `č`. |
| `TMP=C:/tools/maestro/tmp` | Windows only | Same as TEMP — both must be set. |

### Warning: `pnpm test:e2e:smoke` is currently broken on Windows

The package.json wrapper resolves bare `maestro` from PATH and hits the
Unicode-path broken install. Will surface as `Java 17 or higher is required`
even though Java 17 is installed correctly. Use `seed-and-run.sh` directly
until the Notion issue is resolved (link tracked in the snapshot doc).

On macOS/Linux, `pnpm test:e2e:smoke` may work if `maestro` is on PATH, but
`seed-and-run.sh` remains the recommended entry point for consistency.

---

## Cleanup

### Emulator (all platforms)

```bash
adb -s emulator-5554 emu kill
```

Graceful shutdown via the emulator console.

### Metro

**macOS / Linux:**
```bash
lsof -ti:8081 | xargs kill
```

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 8081 | Select OwningProcess
Stop-Process -Id <pid> -Force
```

**Windows caveat:** Do NOT use bash `taskkill /PID <pid>` — MSYS mangles `/PID`
into `C:/Program Files/Git/PID` and the call fails. Avoid `taskkill` on the
emulator process too — it leaves AVD lock files that can break the next boot.

---

## Troubleshooting

### Common (all platforms)

| Symptom | Likely cause | Fix |
|---|---|---|
| `device offline` / boot stuck | Snapshot corrupted | Restart with `-no-snapshot-load` (and `-wipe-data` only if APK is also broken) |
| Black screen / `Unable to load script` | Metro down or wrong port | `curl http://localhost:8081/status` — should return `packager-status:running` |
| `${METRO_URL}` shows up literally in Maestro output | Env var not exported into Maestro context | Set `METRO_URL` in shell AND pass `-e METRO_URL=...` to maestro if calling it directly |
| `quick-check.yaml` passes 6/7 with "Sign up" failing | Known UI drift (not infra) | Ignore; documented in snapshot doc § "Three bugs found" |
| `Maestro driver did not start up in time` | UIAutomator lock from a previous non-graceful kill | `adb reboot` and re-run |
| Bluetooth fails to start in emulator log | Bluetooth packet streamer never initializes | Harmless; ignore |
| `Could not connect to bundle proxy on 8082` | `seed-and-run.sh` defaulted to BUG-7 proxy port | Override with `METRO_URL=http://10.0.2.2:8081` |

### Windows-only

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error: Could not find or load main class JvmVersion` / `Java 17 or higher is required` | PATH points at `~/.maestro/bin/maestro` (Unicode-path broken) | Use full path `/c/tools/maestro/bin/maestro` and set `TEMP`/`TMP` to `C:/tools/maestro/tmp` |
| Bundle takes >30s to download | 1-vCPU emulator on WHPX-under-Hyper-V | Expected on this machine; see snapshot doc § HVCI / Hyper-V context |
| `adb shell` writes appear at `C:/Program Files/Git/...` | MSYS path mangling | Set `MSYS_NO_PATHCONV=1` for the call (or for the whole shell session) |
| `taskkill /PID 1234` fails with `C:/Program Files/Git/PID` | MSYS mangling on `/PID` | Use PowerShell `Stop-Process -Id <pid> -Force` instead |
| `${METRO_URL}` shows up literally in Maestro output | Env var not exported into Maestro context | Set `METRO_URL` in shell AND pass `-e METRO_URL=...` to maestro if calling it directly |
| `quick-check.yaml` passes 6/7 with "Sign up" failing | Known UI drift (not infra) | Ignore; documented in snapshot doc § "Three bugs found" |
| `Maestro driver did not start up in time` | UIAutomator lock from a previous non-graceful kill | `adb reboot` and re-run |
| Bluetooth fails to start in emulator log | Bluetooth packet streamer never initializes on this AVD | Harmless on `E2E_Device_2`; ignore |
| `Could not connect to bundle proxy on 8082` | `seed-and-run.sh` defaulted to BUG-7 proxy port | Override with `METRO_URL=http://10.0.2.2:8081` |
| Dev-client shows `java.net.SocketTimeoutException` after starting Metro on a non-default port (e.g. `--port 8083`) | The emulator's `10.0.2.2:<port>` alias is unreliable on WHPX; ports need an explicit `adb reverse` | Set `METRO_URL=http://10.0.2.2:<port>` when invoking `seed-and-run.sh`. The harness now parses the port and adds `adb reverse tcp:<port> tcp:<port>` automatically (in addition to 8081/8082). The preflight derives its check port from `METRO_URL` too. If the symptom still appears, verify with `adb reverse --list` that the port is forwarded. |

---

## Maestro MCP server

The repo's `.mcp.json` wires up the Maestro MCP server at the worktree (and
post-merge, the main repo) root. Activates on next Claude Code session start.

What it provides: 47 Maestro automation commands (`tap`, `assertVisible`,
`takeScreenshot`, `inputText`, `runFlow`, etc.) exposed as MCP tools. Useful
for **interactive ad-hoc UI inspection** without writing a YAML flow file —
e.g., "tap the button at coordinates X,Y and screenshot what's visible."

What it does NOT replace: `seed-and-run.sh` is still the orchestration entry
for actual flow execution. The MCP server is for one-off introspection,
debugging element trees, capturing screenshots mid-investigation.

For general Maestro YAML patterns (testID strategy, GraalJS scripting,
adaptive auth state, optimistic update verification), see the
`my:maestro-testing` skill. The runbook covers project + machine specifics;
the skill covers Maestro-the-tool.

---

## Things NOT needed by default

These are obsolete vault rules disproved empirically on 2026-04-30. Don't add
them as defaults; the snapshot doc records the evidence.

- **BUG-7 bundle proxy on port 8082** — direct `10.0.2.2:8081` works.
- **`adb reverse tcp:8081 tcp:8081`** — emulator's `10.0.2.2` alias reaches
  host directly.
- **Bluetooth disable procedure** — Bluetooth never starts on tested AVDs;
  the failure log is harmless.
- **`Doppler -c stg` for Metro startup** — Metro reads `.env.*.local` natively.
  Doppler is only for the API server in seeded flows.

The vault retains the historical rationale; do not re-add these as
requirements without empirical evidence.

---

## Pointers

- **Vault of pre-2026-04-30 docs (frozen, includes empirical-state snapshot):**
  `docs/_vault/emulator-2026-04-30/README.md`
- **Generic Maestro patterns:** `my:maestro-testing` skill
- **Operational shortcut:** `my:e2e` slash command (calls `seed-and-run.sh`
  with required env vars and preflight checks)
- **Maestro-source orchestrator (do not modify):**
  `apps/mobile/e2e/scripts/seed-and-run.sh`
- **Pre-flight infra health script (do not modify):**
  `apps/mobile/e2e/scripts/e2e-preflight.sh`
