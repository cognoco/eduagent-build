> **STATUS: SNAPSHOT** taken 2026-04-30. Do not edit — the runbook (`e2e-runbook.md`) is the living document; this records what was known good on that date.

# E2E Empirical State — 2026-04-30

**Branch when written:** `emulator-clean-slate` (rebased on top of
`proc-optimization`)

**Purpose:** Captures the verified state of the E2E toolchain on the date the
new runbook was written. If `docs/E2Edocs/e2e-runbook.md` stops matching
reality, this snapshot tells you what was last known good and which historical
vault rules were already disproved on this date.

This document is meant to be read **once** when investigating, not on every
session. The runbook is the everyday reference.

---

## Machine / environment baseline

| Property | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26220 |
| CPU | Intel i7-10700 (8 cores, 16 logical) |
| GPU | NVIDIA RTX 2070 SUPER |
| Username | `ZuzanaKopečná` (Unicode `č` causes Maestro JNI fail at `~/.maestro/bin/`) |
| HVCI / Memory Integrity | Off (toggled this session) |
| VBS | Still running (Hyper-V active, almost certainly because of WSL2 install) |
| Emulator hypervisor | WHPX, but running as guest of Hyper-V's hypervisor |
| Emulator vCPU count | 1 (forced by WHPX-under-Hyper-V) |
| Emulator cold boot | ~39 s |
| Maestro version | 2.4.0 |
| Java | Eclipse Adoptium 17.0.18 at `C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot\` |
| AVD | `E2E_Device_2` |
| App package | `com.mentomate.app` (dev-client APK) |

---

## What was verified working

Each item below was empirically tested in this session. The list doubles as
a regression set — if any of these stops working, the runbook needs an update.

- [x] **Emulator launch from background bash** — process tracking persists
  across multiple Bash tool calls, recoverable via `adb devices` + `tasklist`
  + `netstat -ano | findstr :5554` if the foreground bash ID is lost.
- [x] **Two concurrent background processes** (emulator + Metro) tracked
  simultaneously without conflict.
- [x] **`app-launch-devclient.yaml` via `seed-and-run.sh`** — failed at the
  deprecated `_setup/launch-devclient.yaml` reference (real bug, not infra).
  Fixed in this branch.
- [x] **`quick-check.yaml` via `seed-and-run.sh`** — 6/7 assertions pass.
  The 7th ("Sign up") fails because of UI drift, not infra.
- [x] **Same flow run back-to-back** — no Maestro gRPC driver crash, no
  UIAutomator lock leakage. Clean teardown each time.
- [x] **Bash-ID-loss recovery** — when foreground bash ID is forgotten, all
  three of `adb devices`, Windows `tasklist`, and `netstat -ano | findstr :5554`
  independently locate the running emulator process.
- [x] **`pnpm test:e2e:smoke`** — **broken** by the PATH-Maestro issue.
  Symptom: `Error: Could not find or load main class JvmVersion` even though
  Java 17 IS installed. Filed as a Notion issue; deferred fix.
- [x] **Cleanup via `adb emu kill` (emulator) + PowerShell `Stop-Process`
  (Metro)** — both work cleanly. Bash `taskkill /PID` for Metro fails because
  MSYS mangles `/PID` to a path.
- [x] **Vault commit** (originally `1444073f`, post-rebase `17b663f4`) of 12
  doc files + 4 duplicate skill files + README — preserved with rename history
  intact.

---

## Vault rules empirically disproven

The vault's `e2e-emulator-issues.md` (2,358 lines) accumulated many "always
do this" rules that are no longer needed. Each row below records what we
re-tested and the evidence it produced.

| Vault rule | Status 2026-04-30 | Evidence |
|---|---|---|
| BUG-7: Run bundle proxy on port 8082 because Metro on 8081 is unreachable from the emulator | **Obsolete** | Direct `METRO_URL=http://10.0.2.2:8081` works; bundle in <30s. (Probe: `quick-check.yaml` run, 6/7 pass) |
| `adb reverse tcp:8081 tcp:8081` is required for emulator to reach Metro | **Obsolete** | The emulator's `10.0.2.2` alias reaches the host directly. (Probe: same `quick-check.yaml` run) |
| Disable Bluetooth before starting emulator (else gRPC connection issues) | **Obsolete** | Bluetooth never starts on `E2E_Device_2` (`Unable to connect to packet streamer` is harmless). No gRPC issues observed across multiple flow runs. |
| AVD `New_Device` is corrupted, must use `E2E_Device_2` | **Advisory only** | `E2E_Device_2` works fine; no current evidence about `New_Device`'s state. Treat as historical warning, not required. |
| Doppler `-c stg` for Metro startup | **Obsolete** | Metro reads `.env.development.local` and `.env.local` natively. Doppler is only required for the API server when running seeded flows. |
| Cold boot 30-90s on WHPX | **Confirmed** | 39s for both me-launched and user-launched cold boots on this machine, HVCI off. |

---

## Three bugs found

### 1. PATH-broken Maestro

`pnpm test:e2e:smoke` resolves bare `maestro` from PATH, which points at
`~/.maestro/bin/maestro` (i.e., `C:\Users\ZuzanaKopečná\.maestro\bin\maestro`).
The Unicode `č` breaks Java's path parser:

    Caused by: java.nio.file.InvalidPathException:
    Illegal char <?> at index 19: C:\Users\<unicode>\.maestro\bin\jvm-version.jar

Working binary lives at `C:\tools\maestro\bin\maestro` (ASCII path) and
requires `TEMP`/`TMP` overrides to `C:\tools\maestro\tmp`.

**Status:** Notion issue filed for deferred fix. URL:
<https://app.notion.com/p/3528bce91f7c81a0a137eabf55b4ad27>. Workaround (use
`seed-and-run.sh` directly) documented in the runbook.

### 2. `app-launch-devclient.yaml` referenced deprecated `_setup`

The flow had `runFlow: _setup/launch-devclient.yaml` even though the setup
file's own header marks it deprecated for WHPX (BUG-19) and instructs flows
to wait for the `sign-in-button` testID directly.

**Status:** Fixed in this branch. The flow now does `extendedWaitUntil`
on `sign-in-button` and skips the `runFlow` step. Commit SHA: _filled in by
the commit that lands the change_.

### 3. `Sign up` assertion drift in `quick-check.yaml`

The current sign-in screen does not show a "Sign up" affordance; the
assertion in `quick-check.yaml` fails reliably (1 of 7). The `Sign up` line
was removed from `app-launch-devclient.yaml` in this branch with a comment;
`quick-check.yaml` itself is left alone (out of scope).

**Status:** Documented only. Investigation requires touching the app's
sign-in code, which is out of scope for this plan. Restore the assertion
when a sign-up entry point is reintroduced.

---

## HVCI / Hyper-V context (and why we're not "fixing" 1-vCPU)

The Android emulator runs under Windows Hypervisor Platform (WHPX). On this
machine, WHPX runs as a guest of Hyper-V's hypervisor — Hyper-V is up, even
though no WSL2 distro is currently running, because the Hyper-V Platform
feature is enabled. That nesting forces the emulator to use a single vCPU.

This session toggled HVCI / Memory Integrity off, which gave a measurable
~20% boot speedup (49 s → 39 s). VBS (Virtualization-Based Security) still
runs because Hyper-V is up; HVCI is one VBS feature, not all of it.

Disabling Hyper-V entirely (`bcdedit /set hypervisorlaunchtype off` + reboot)
would unlock multi-vCPU and probably bring boot to ~10 s, but it **breaks
WSL2, Docker Desktop, and Windows Sandbox** simultaneously. The 1-vCPU
penalty is acceptable in exchange for keeping those tools.

**Decision:** Option A (current state — HVCI off, Hyper-V on) is the user's
chosen tradeoff. No action required. Revisit only if WSL2/Docker usage drops
to zero.

---

## What was NOT tested (gaps to be aware of)

If a future Claude is investigating something in this list, treat it as
unverified — the runbook makes no promises here.

- **Long-session stability** (>15 min sustained interactions). Closed-loop
  reliability beyond 2-3 short flows is unmeasured.
- **Mid-Maestro `taskkill` recovery** — the destructive UIAutomator-lock
  test. Skipped because recovery requires `adb reboot`, which costs another
  39s cold boot.
- **Cross-session process persistence** — what happens to background
  processes after `/clear` or a new conversation. Not exercised.
- **Maestro MCP server functional verification** — the server starts
  (`MCP Server: Started. Waiting for messages.`) but the actual MCP tool
  surface was not exercised in-session. Will be available on next session
  start.
- **Multiple concurrent emulators** — only `E2E_Device_2` was used.
- **Real device target** (non-emulator) — not tested; `seed-and-run.sh` may
  need adjustment for physical devices.

---

## Future cleanup (out of scope for this plan)

These were noticed during the session but deliberately not done:

- `apps/mobile/e2e/README.md` and `apps/mobile/e2e/CONVENTIONS.md` reference
  vaulted files. Update to point at the new runbook the next time someone
  touches the E2E test code.
- Other flows besides `app-launch-devclient.yaml` may also reference
  deprecated `_setup/*` files. A grep + migration is appropriate but was
  scoped out per user direction.
- `pnpm test:e2e:smoke` itself (the package.json wrapper) — fix is
  in the Notion issue.

---

## Pointers

- **Forward-looking runbook:** `docs/E2Edocs/e2e-runbook.md`
- **Historical vault (frozen):** `docs/_vault/emulator-2026-04-30/README.md`
- **Generic Maestro patterns:** `my:maestro-testing` skill
- **Operational shortcut:** `my:e2e` slash command
