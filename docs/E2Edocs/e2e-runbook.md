# E2E Runbook — Mobile (Maestro on Android dev-client)

How to run mobile E2E tests on this project, on this Windows + Unicode-username
machine, as of 2026-04-30. For general Maestro YAML patterns (testIDs, GraalJS,
adaptive flows), see the `my:maestro-testing` skill. For the empirical state
snapshot this runbook is built on, see
`docs/E2Edocs/e2e-2026-04-30-empirical-state.md`.

If anything in this runbook stops matching reality, the snapshot doc tells
you what was last known good and the vault README under
`docs/_vault/emulator-2026-04-30/` has historical context.

---

## Quick reference

| Item | Value |
|---|---|
| Working directory | repo root or any worktree |
| AVD name | `E2E_Device_2` (cold boot ~39s on this machine) |
| Metro port | 8081 (dev-client mode) |
| Emulator → host bundle URL | `http://10.0.2.2:8081` |
| Working Maestro (MSYS / bash) | `/c/tools/maestro/bin/maestro` |
| Working Maestro (Windows / MCP) | `C:\tools\maestro\bin\maestro.bat` |
| Required Maestro env vars | `TEMP=C:/tools/maestro/tmp`, `TMP=C:/tools/maestro/tmp` |
| Canonical orchestrator | `bash apps/mobile/e2e/scripts/seed-and-run.sh` |
| Smoke flow | `apps/mobile/e2e/flows/quick-check.yaml` |
| App package | `com.mentomate.app` |
| Doppler binary | `C:/Tools/doppler/doppler.exe` (only needed for seeded flows) |

---

## Prerequisites

- **Android SDK** at `C:\Android\Sdk` with `emulator` and `platform-tools` on
  PATH (`adb`, `emulator` resolvable from any shell).
- **Working Maestro** at `C:\tools\maestro\` — NOT `~/.maestro/bin/`. The
  bare-PATH `maestro` resolves to the broken Unicode-path install (see
  Troubleshooting). Always invoke via the full `C:\tools\maestro\bin\` path.
- **Doppler CLI** at `C:\Tools\doppler\doppler.exe`. Only needed when running
  seeded flows that hit the API server.
- **WSL2 is NOT required** for E2E. WSL2 is only needed for native Android APK
  builds (NDK toolchain). Maestro + emulator + Metro all run on Windows-native.

---

## The boot sequence

Each step has the exact command and the expected output. Stop and fix at the
first failing step.

### 1. Launch the emulator (cold boot ~39s on 1 vCPU)

```bash
/c/Android/Sdk/emulator/emulator.exe -avd E2E_Device_2 -no-snapshot-load -no-metrics
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
cd /c/Dev/Projects/Products/Apps/eduagent-build/apps/mobile
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
your flow. Maestro's own `launchApp` is unreliable on WHPX (BUG-19); the
script does it via ADB instead.

### Smoke run (no seed)

```bash
METRO_URL=http://10.0.2.2:8081 TEMP="C:/tools/maestro/tmp" TMP="C:/tools/maestro/tmp" \
  bash apps/mobile/e2e/scripts/seed-and-run.sh --no-seed \
    apps/mobile/e2e/flows/quick-check.yaml
```

### Seeded flow (requires Doppler + API)

```bash
C:/Tools/doppler/doppler.exe run -c stg -- \
  bash apps/mobile/e2e/scripts/seed-and-run.sh \
    onboarding-complete apps/mobile/e2e/flows/<your-flow>.yaml
```

The Doppler `-c stg` config matches the seed endpoint's `TEST_SEED_SECRET`.

### Required env vars for any invocation

- `METRO_URL=http://10.0.2.2:8081` — overrides the script default of `:8082`
  (the BUG-7 bundle proxy, empirically unnecessary as of 2026-04-30).
- `TEMP="C:/tools/maestro/tmp"` and `TMP="C:/tools/maestro/tmp"` — Java
  jansi.dll extraction would otherwise hit `C:\Users\ZuzanaKopečná\AppData\...`
  and fail on the Unicode `č`.

### Warning: `pnpm test:e2e:smoke` is currently broken

The package.json wrapper resolves bare `maestro` from PATH and hits the
Unicode-path broken install. Will surface as `Java 17 or higher is required`
even though Java 17 is installed correctly. Use `seed-and-run.sh` directly
until the Notion issue is resolved (link tracked in the snapshot doc).

---

## Cleanup

### Emulator

```bash
adb -s emulator-5554 emu kill
```

Graceful shutdown via the emulator console. Avoid `taskkill` on the emulator
process — it leaves AVD lock files that can break the next boot.

### Metro

Find the PID via PowerShell, then stop:

```bash
powershell.exe -Command "Get-NetTCPConnection -LocalPort 8081 | Select OwningProcess"
powershell.exe -Command "Stop-Process -Id <pid> -Force"
```

**Do NOT** use bash `taskkill /PID <pid>` — MSYS mangles `/PID` into
`C:/Program Files/Git/PID` and the call fails.

---

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error: Could not find or load main class JvmVersion` / `Java 17 or higher is required` | PATH points at `~/.maestro/bin/maestro` (Unicode-path broken) | Use full path `/c/tools/maestro/bin/maestro` and set `TEMP`/`TMP` to `C:/tools/maestro/tmp` |
| `device offline` / boot stuck | Snapshot corrupted | Restart with `-no-snapshot-load` (and `-wipe-data` only if APK is also broken) |
| Black screen / `Unable to load script` | Metro down or wrong port | `curl http://localhost:8081/status` — should return `packager-status:running` |
| Bundle takes >30s to download | 1-vCPU emulator on WHPX-under-Hyper-V | Expected on this machine; see snapshot doc § HVCI / Hyper-V context |
| `adb shell` writes appear at `C:/Program Files/Git/...` | MSYS path mangling | Set `MSYS_NO_PATHCONV=1` for the call (or for the whole shell session) |
| `taskkill /PID 1234` fails with `C:/Program Files/Git/PID` | MSYS mangling on `/PID` | Use PowerShell `Stop-Process -Id <pid> -Force` instead |
| `${METRO_URL}` shows up literally in Maestro output | Env var not exported into Maestro context | Set `METRO_URL` in shell AND pass `-e METRO_URL=...` to maestro if calling it directly |
| `quick-check.yaml` passes 6/7 with "Sign up" failing | Known UI drift (not infra) | Ignore; documented in snapshot doc § "Three bugs found" |
| `Maestro driver did not start up in time` | UIAutomator lock from a previous non-graceful kill | `adb reboot` and re-run |
| Bluetooth fails to start in emulator log | Bluetooth packet streamer never initializes on this AVD | Harmless on `E2E_Device_2`; ignore |
| `Could not connect to bundle proxy on 8082` | `seed-and-run.sh` defaulted to BUG-7 proxy port | Override with `METRO_URL=http://10.0.2.2:8081` |

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

These are obsolete vault rules. Don't add them as defaults; the snapshot doc
records which ones we empirically disproved on 2026-04-30 and how.

- **BUG-7 bundle proxy on port 8082** — direct `10.0.2.2:8081` works.
- **`adb reverse tcp:8081 tcp:8081`** — emulator's `10.0.2.2` alias reaches
  host directly.
- **Bluetooth disable procedure** — Bluetooth never starts on `E2E_Device_2`;
  the failure log is harmless.
- **`Doppler -c stg` for Metro startup** — Metro reads `.env.*.local` natively.
  Doppler is only for the API server in seeded flows.
- **`AVD New_Device` is corrupted** — no current evidence; the warning is now
  advisory rather than required. `E2E_Device_2` works; don't bother creating
  a new AVD unless `E2E_Device_2` fails.

The vault retains the historical rationale; do not re-add these as
requirements without empirical evidence.

---

## Pointers

- **Snapshot of what was verified working (2026-04-30):**
  `docs/E2Edocs/e2e-2026-04-30-empirical-state.md`
- **Vault of pre-2026-04-30 docs (frozen):**
  `docs/_vault/emulator-2026-04-30/README.md`
- **Generic Maestro patterns:** `my:maestro-testing` skill
- **Operational shortcut:** `my:e2e` slash command (calls `seed-and-run.sh`
  with required env vars and preflight checks)
- **Maestro-source orchestrator (do not modify):**
  `apps/mobile/e2e/scripts/seed-and-run.sh`
- **Pre-flight infra health script (do not modify):**
  `apps/mobile/e2e/scripts/e2e-preflight.sh`
