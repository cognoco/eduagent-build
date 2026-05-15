# E2E Spec — Slow-network Simulation Harness

**Status:** Draft 2026-05-14
**Owner:** _TBD — pick up by E2E rotation_
**Related Notion:** Android E2E Issues Tracker `HOME-08 Home loading-timeout fallback`, `LEARN-26 First-curriculum polling / timeout behavior` (both Medium-High, both list "needs slow-network simulation" in their resolution notes)

## Goal

A whole class of error-recovery UI exists *only* to handle the case where the API is reachable but slow: timeout banners, polling backoff, "loading is taking longer than usual" hints, ErrorFallback with `Retry`. Today none of it is E2E-covered because the harness has no way to *slow* the network — only kill it (airplane mode, via `seed-and-run-sso-fallback.sh`) or run it fast (default).

This spec defines a **reusable infrastructure** that any flow can opt into via an env var, so we don't reinvent network shaping per flow.

## Trigger inventory

The following code paths fire only under slow network:

| Code path | Source | Trigger condition |
|---|---|---|
| `library` loadTimeout fallback | `library.tsx:482-506` (`subjectsLoadTimedOut` branch; testID `library-load-timeout`) | subjects query elapsed > `LOAD_TIMEOUT_MS` |
| `home` loading-timeout fallback | `home.tsx:62,84-128` (testID `home-loading-timeout`) | `setTimeout(..., 10_000)` against `isLoading` |
| First-curriculum polling | `useInterviewProgress` / curriculum hook (LEARN-26) | polling interval × N elapsed |
| Generic ErrorFallback `TimeoutLoader` | `ErrorFallback.tsx` | any consumer's timeout fires |
| SSE `reconnectable` retry banner | session chat shell | network slow enough to break SSE keep-alive but not disconnect |

Without slow-net coverage these all rot silently — see the May 2025 SVG/Fabric incident as a template for "untested error UI ships broken."

## Mechanism decision

Four options, ranked for our Windows-Android-emulator harness:

| Mechanism | Granularity | Setup cost | Use when |
|---|---|---|---|
| **Emulator console `network delay`** | emulator-wide latency in ms | low — telnet to console port, send command | **Default.** Built into AVD, no root, no extra deps. Sets a uniform RTT injection for ALL traffic. |
| **Emulator console `network speed`** | bandwidth (gprs/edge/3g/full) | low | When testing bandwidth-bound flows (large bundle download, video). Less precise than `delay`. |
| **`adb shell tc qdisc` (kernel traffic control)** | per-interface latency / loss / jitter | high — requires root + selinux-permissive AVD, brittle on Windows host | Only when `network delay` is insufficient (e.g., need 5 % packet loss). Reach for it last. |
| **API-side proxy with injected delay** | per-host, full HTTP semantics | medium — add wrapper to `wrangler dev` or run mitmproxy | When the slowness must affect *only* the API and not Metro/CDN. Needed for `redirectTo`-style flows where Metro slow would also fail. |

**Default choice: emulator console `network delay`**, controllable via a new env var `NETWORK_DELAY_MS`. Implementation sketch (Windows Git Bash):

```sh
# Example: NETWORK_DELAY_MS=12000 ./e2e/scripts/seed-and-run.sh <flow.yaml>
emulator_console_cmd() {
  local cmd="$1"
  local port="${EMULATOR_CONSOLE_PORT:-5554}"
  local token; token=$(cat "$HOME/.emulator_console_auth_token" 2>/dev/null || echo "")
  # Git Bash's bundled netcat does not support -q. Use a read timeout instead.
  # If `nc -w 2` also misbehaves, fall back to `socat` or a python one-liner.
  printf 'auth %s\n%s\nquit\n' "$token" "$cmd" \
    | "${NETCAT:-/c/Program Files/Git/usr/bin/nc.exe}" -w 2 localhost "$port" >/dev/null || true
}

apply_network_delay() {
  local delay="${NETWORK_DELAY_MS:-0}"
  if [ "$delay" -gt 0 ]; then
    emulator_console_cmd "network delay ${delay}"
    echo "[seed-and-run] Applied network delay=${delay}ms"
  fi
}

slow_net_restore() {
  emulator_console_cmd "network delay none"
}
# Compose with any existing EXIT trap so we don't clobber other wrappers'
# cleanup (e.g. seed-and-run-sso-fallback.sh already uses `trap restore_network EXIT`).
trap 'slow_net_restore; eval "${PRIOR_EXIT_TRAP:-:}"' EXIT
```

The trap ensures the next flow doesn't inherit residual slowness. Choosing a distinct function name (`slow_net_restore`) avoids colliding with the existing `restore_network` used in `seed-and-run-sso-fallback.sh`.

## API the wrapper exposes to flows

Three env vars handle all current scenarios:

| Env var | Effect | Implementation |
|---|---|---|
| `NETWORK_DELAY_MS` | Injects RTT latency for all traffic. Note: this is per-packet RTT, so a single HTTPS request with N round trips sees ~N × delay total. Pick the value relative to the screen-level timeout, not the wall-clock target. | `emulator_console_cmd "network delay $NETWORK_DELAY_MS"` |
| `NETWORK_SPEED` | One of `gsm,hscsd,gprs,edge,umts,hsdpa,lte,evdo,full` | `emulator_console_cmd "network speed $NETWORK_SPEED"` |
| `NETWORK_KILL_AFTER_MS` | Disconnect after delay (combines with current AUTH-09 mechanism — airplane mode) | `(sleep $((NETWORK_KILL_AFTER_MS/1000)); adb shell settings put global airplane_mode_on 1; adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true) &` |

A flow opts in by reading these in its `seed-and-run` invocation (env var assignment must come **before** the command):

```sh
NETWORK_DELAY_MS=2500 ./e2e/scripts/seed-and-run.sh learning-active e2e/flows/learning/first-curriculum-timeout.yaml
```

## Flows enabled by this harness

These are not authored here — listed so the surface is visible:

| Flow (new) | Scenario | NETWORK_DELAY_MS | Asserts |
|---|---|---|---|
| `e2e/flows/home/home-loading-timeout.yaml` | onboarding-complete | 12000 (home timer is 10 s on `isLoading`; need enough RTT injection that the profiles query stays in-flight past 10 s — start at 12000 and tune up) | `home-loading-timeout` testID visible, `home-loading-retry` recovers |
| `e2e/flows/learning/first-curriculum-polling-timeout.yaml` | first-curriculum-seeded | 12000 | poll backoff banner appears, retry path works |
| `e2e/flows/library/library-loading-timeout.yaml` | onboarding-complete | 12000 (verify against actual `LOAD_TIMEOUT_MS` in `library.tsx` before authoring) | `library-load-timeout` testID visible, `library-load-timeout-retry` recovers |
| `e2e/flows/session/sse-reconnect-banner.yaml` | session-active | 4000 + KILL_AFTER 6000 | reconnect banner shows; on restore, session resumes |

These are owned by the respective screen-owners, not this spec.

## Preflight extension

`e2e-preflight.sh` should add a check that the emulator console is reachable AND that we can authenticate to it. Without that check, a missing `~/.emulator_console_auth_token` would make every slow-net flow silently run at full speed and pass even when the timeout UI is broken.

```sh
check_emulator_console() {
  if [ ! -f "$HOME/.emulator_console_auth_token" ]; then
    _preflight_warn "Emulator console auth token missing — slow-network flows will be skipped."
    return 0  # warn-only; full-speed flows still work
  fi
  local port="${EMULATOR_CONSOLE_PORT:-5554}"
  if ! timeout 2 bash -c "</dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1; then
    _preflight_warn "Emulator console port ${port} not listening — slow-network flows will be skipped."
    return 0
  fi
  _preflight_ok "Emulator console reachable on :${port}"
}
```

## Failure Modes table

| State | Trigger | User sees (real device) | Recovery (assert in test) |
|---|---|---|---|
| Delay applied, query exceeds screen-level timeout | RTT > screen budget | TimeoutLoader / ErrorFallback with Retry button | Retry button visible, tapping it re-issues query |
| Delay applied, query just-barely succeeds | RTT within budget but slow | Normal screen renders after spinner | Default success path |
| Console auth fails / token missing | new AVD without prior connection | Wrapper falls back to full-speed (warn) | Flow runs but doesn't exercise timeout UI — preflight warns to surface this |
| Delay leaks between flows | wrapper trap didn't fire (script killed externally) | Subsequent flows run slow, may flake | `e2e/scripts/e2e-lib.sh` should call `slow_net_restore` (or `emulator_console_cmd "network delay none"` directly) at batch start as a safety net |
| Bandwidth profile incompatible with bundle proxy | `gsm` (9.6 kbps) too slow for 8.8 MB bundle | Bundle never loads, flow fails at seed-and-run stage | Document: `NETWORK_SPEED` profiles must NOT be used on dev-client flows; release-APK only |

## Open questions

- **Maestro can't change env vars mid-flow.** If we need to apply delay AFTER the user lands on a screen (rather than from the start), we need a Maestro `runScript` step that shells out. Maestro 2.2.0 has runScript bugs documented in `seed-and-run.sh` header (`Issue 13`). For now, slow-net is applied from boot. If mid-flow toggling is required, escalate.
- **TC qdisc on Windows AVD** — never validated. Reach for it only when emulator console can't express the needed scenario; budget a half-day for setup.
- **Release-APK slow-net** — `seed-and-run-release.sh` should grow the same env vars. Skipped here for scope; trivial port.

## Tests this spec spawns

- New wrapper code path in `e2e/scripts/seed-and-run.sh` (env var → emulator console).
- New preflight check `check_emulator_console` in `e2e/scripts/e2e-preflight.sh` (pattern: extend the existing file alongside `e2e-preflight.test.sh`).
- Updated `e2e/scripts/e2e-lib.sh` to reset `network delay none` at batch start.
- Bash regression in `e2e/scripts/seed-and-run.harness.test.sh` (matches existing `e2e-preflight.test.sh` pattern) asserting the env var → console-cmd mapping (no emulator required — mock console with a tiny netcat listener).

## Non-goals

- Per-host latency injection (would require mitmproxy).
- Packet loss / jitter scenarios (escalate to tc qdisc if needed).
- iOS emulator parity — separate spec.
