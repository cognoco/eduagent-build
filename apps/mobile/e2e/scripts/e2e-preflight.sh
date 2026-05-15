#!/usr/bin/env bash
# E2E Preflight — verify infrastructure is healthy BEFORE running any tests.
#
# Motivation: the 2026-04-22 regression run logged 27 Notion bugs (BUG-594..622)
# that were all cascading "seed-and-sign-in failed" symptoms of five known
# infrastructure pitfalls documented in docs/E2Edocs/e2e-session-2026-04-22-struggles.md:
#   1. UIAutomator lock stuck from a killed Maestro run
#   2. -wipe-data uninstalled the APK
#   3. Stale bundle proxy on :8082 buffering the 8.8MB bundle for ~11s
#   4. TEST_SEED_SECRET empty because Doppler ran with default (dev) config
#   5. API server not reachable on :8787
#
# Preflight fails fast with an actionable error so the harness does not
# consume 30+ minutes producing false-positive bug reports.
#
# Usage (sourced, not executed):
#   source "$(dirname "$0")/e2e-preflight.sh"
#   run_preflight                # runs all checks, exits 1 on first failure
#   run_preflight_quiet          # same, but suppresses PASS lines on success
#
# Opt-out:
#   E2E_PREFLIGHT_SKIP=1         # skip preflight entirely (CI debugging only)
#
# Individual checks may be invoked directly for unit testing — see
# e2e-preflight.test.sh.

# ── Tunables ────────────────────────────────────────────────────────────────
: "${PREFLIGHT_API_URL:=http://127.0.0.1:8787}"
: "${PREFLIGHT_METRO_HOST:=127.0.0.1}"

# If METRO_URL is set (the same env var seed-and-run.sh uses to choose where the
# emulator points its dev-client), derive the Metro port from it so that the
# preflight check, the harness, and Maestro agree. Otherwise default to 8081.
# Without this, running Metro on a non-default port (e.g. 8083 when 8081/8082
# are held by another branch's dev server) fails preflight even though the
# harness itself was instructed to use the alternate port.
if [ -z "${PREFLIGHT_METRO_PORT:-}" ] && [ -n "${METRO_URL:-}" ]; then
  _DERIVED_METRO_PORT=$(echo "$METRO_URL" | sed -n 's#.*:\([0-9][0-9]*\)\(/.*\)\?$#\1#p')
  PREFLIGHT_METRO_PORT="${_DERIVED_METRO_PORT:-8081}"
fi
: "${PREFLIGHT_METRO_PORT:=8081}"
: "${PREFLIGHT_PROXY_PORT:=8082}"
: "${PREFLIGHT_PROXY_MAX_SECONDS:=2}"    # Fresh warm proxy serves bundle <0.2s; repeat >2s = stale
: "${PREFLIGHT_APP_ID:=com.mentomate.app}"
: "${PREFLIGHT_ADB:=${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}}"

# Resolve bundle-proxy.js path relative to this script so the check works
# regardless of the caller's CWD.
_PREFLIGHT_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${PREFLIGHT_PROXY_SCRIPT:=${_PREFLIGHT_SELF_DIR}/../bundle-proxy.js}"

# ── Output helpers ──────────────────────────────────────────────────────────
_preflight_ok()    { [ "${PREFLIGHT_QUIET:-0}" = "1" ] || echo "[preflight]   ✓ $*"; }
_preflight_warn()  { echo "[preflight]   ⚠ $*" >&2; }
_preflight_fail()  { echo "[preflight]   ✗ $*" >&2; }

# ── Check 1: adb reachable + exactly one device ready ──────────────────────
check_adb_device() {
  if ! command -v "$PREFLIGHT_ADB" >/dev/null 2>&1 && [ ! -x "$PREFLIGHT_ADB" ]; then
    _preflight_fail "adb not found at '$PREFLIGHT_ADB'. Set ADB_PATH or install platform-tools."
    return 1
  fi
  local state
  state=$("$PREFLIGHT_ADB" get-state 2>/dev/null | tr -d '\r' || echo "")
  if [ "$state" != "device" ]; then
    _preflight_fail "No Android emulator/device ready (adb get-state = '${state:-<none>}')."
    _preflight_fail "  Fix: start the emulator, or check 'adb devices'."
    return 1
  fi
  _preflight_ok "adb device connected"
}

# ── Check 2: UIAutomator lock not stuck (covers Issues 1, 5) ───────────────
# Issue: killing Maestro non-gracefully leaves the UIAutomator instrumentation
# lock held, breaking 'uiautomator dump' until adb reboot. We detect this by
# attempting a dump and checking the exit code + payload.
check_uiautomator_healthy() {
  local out
  # First free any stale Maestro driver that would hold the lock
  "$PREFLIGHT_ADB" shell am force-stop dev.mobile.maestro 2>/dev/null || true
  "$PREFLIGHT_ADB" shell am force-stop dev.mobile.maestro.test 2>/dev/null || true
  if ! MSYS_NO_PATHCONV=1 "$PREFLIGHT_ADB" shell uiautomator dump /sdcard/__preflight.xml >/dev/null 2>&1; then
    _preflight_fail "uiautomator dump failed — UIAutomator lock likely stuck."
    _preflight_fail "  Fix: run 'adb reboot' and wait for boot completion."
    _preflight_fail "  Root cause: previous Maestro run was killed externally (use Ctrl+C next time)."
    return 1
  fi
  out=$(MSYS_NO_PATHCONV=1 "$PREFLIGHT_ADB" exec-out "cat /sdcard/__preflight.xml" 2>/dev/null || echo "")
  if [ -z "$out" ] || ! echo "$out" | grep -q "<hierarchy"; then
    _preflight_fail "uiautomator dump produced no hierarchy XML. Lock stuck or emulator unresponsive."
    _preflight_fail "  Fix: 'adb reboot' and retry."
    return 1
  fi
  MSYS_NO_PATHCONV=1 "$PREFLIGHT_ADB" shell rm -f /sdcard/__preflight.xml 2>/dev/null || true
  _preflight_ok "UIAutomator responding"
}

# ── Check 3: app APK installed (covers Issue 2: -wipe-data uninstalled it) ─
check_apk_installed() {
  local pkgs
  pkgs=$("$PREFLIGHT_ADB" shell pm list packages "$PREFLIGHT_APP_ID" 2>/dev/null | tr -d '\r')
  if ! echo "$pkgs" | grep -q "package:$PREFLIGHT_APP_ID"; then
    _preflight_fail "APK '$PREFLIGHT_APP_ID' NOT installed on device."
    _preflight_fail "  Fix: adb install <path-to-dev-client.apk>"
    _preflight_fail "  Common cause: emulator was cold-booted with -wipe-data (which wipes userdata → uninstalls all apps)."
    return 1
  fi
  _preflight_ok "APK '$PREFLIGHT_APP_ID' installed"
}

# ── Check 4: Metro bundler reachable ───────────────────────────────────────
check_metro_reachable() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    "http://${PREFLIGHT_METRO_HOST}:${PREFLIGHT_METRO_PORT}/status" 2>/dev/null || echo "000")
  if [ "$status" != "200" ]; then
    _preflight_fail "Metro bundler not reachable at ${PREFLIGHT_METRO_HOST}:${PREFLIGHT_METRO_PORT}/status (HTTP ${status})."
    _preflight_fail "  Fix: cd apps/mobile && pnpm exec expo start --port ${PREFLIGHT_METRO_PORT}"
    return 1
  fi
  _preflight_ok "Metro bundler responding on :${PREFLIGHT_METRO_PORT}"
}

# ── Check 5: bundle proxy responsive AND fast (covers Issue 3 — THE root cause) ─
# A stale bundle-proxy.js process holds port 8082 but re-serves the 8.8MB bundle
# slowly (~11s), causing the dev-client's internal timeout to fire. This
# appears to the test harness as "app never reaches sign-in screen" — the exact
# signature of BUG-594..622.
#
# Fresh proxy: <200ms. Degraded proxy: 5-15s. We fail at >${PREFLIGHT_PROXY_MAX_SECONDS}s.
check_bundle_proxy_fast() {
  # Skip only if nothing is listening on the proxy port. Use a raw TCP connect
  # instead of curl: a slow proxy can delay the HTTP response and would
  # otherwise be mistaken for "not running".
  if ! timeout 2 bash -c "</dev/tcp/${PREFLIGHT_METRO_HOST}/${PREFLIGHT_PROXY_PORT}" >/dev/null 2>&1; then
    _preflight_ok "Bundle proxy on :${PREFLIGHT_PROXY_PORT} not running (skipped — not required)"
    return 0
  fi
  local url
  url="http://${PREFLIGHT_METRO_HOST}:${PREFLIGHT_PROXY_PORT}/apps/mobile/index.bundle?platform=android&dev=true&minify=false"
  local time_s
  time_s=$(curl -s -o /dev/null -w "%{time_total}" --max-time 30 "$url" 2>/dev/null || echo "999")
  # Compare as floats via awk (bash can't do float arithmetic).
  local is_slow
  is_slow=$(awk -v t="$time_s" -v limit="$PREFLIGHT_PROXY_MAX_SECONDS" 'BEGIN { print (t+0 > limit+0) ? 1 : 0 }')
  if [ "$time_s" = "999" ] || [ "$is_slow" = "1" ]; then
    # Metro can spend several seconds transforming a cold bundle after code
    # changes. Stale proxy detection should fail only when the proxy remains
    # slow after that warm-up request.
    local retry_time_s retry_is_slow
    retry_time_s=$(curl -s -o /dev/null -w "%{time_total}" --max-time 30 "$url" 2>/dev/null || echo "999")
    retry_is_slow=$(awk -v t="$retry_time_s" -v limit="$PREFLIGHT_PROXY_MAX_SECONDS" 'BEGIN { print (t+0 > limit+0) ? 1 : 0 }')
    if [ "$retry_time_s" != "999" ] && [ "$retry_is_slow" != "1" ]; then
      _preflight_ok "Bundle proxy on :${PREFLIGHT_PROXY_PORT} healthy after warm-up (first ${time_s}s, retry ${retry_time_s}s)"
      return 0
    fi
    _preflight_fail "Bundle proxy on :${PREFLIGHT_PROXY_PORT} is DEGRADED (served bundle in ${time_s}s; limit ${PREFLIGHT_PROXY_MAX_SECONDS}s)."
    _preflight_fail "  Retry also took ${retry_time_s}s."
    _preflight_fail "  Root cause: a stale 'node bundle-proxy.js' process is buffering the bundle slowly."
    _preflight_fail "  Fix:"
    _preflight_fail "    1. Kill the stale proxy: netstat -ano | grep ':${PREFLIGHT_PROXY_PORT}' | grep LISTEN → taskkill /PID <pid> /F"
    _preflight_fail "    2. Restart fresh:        node ${PREFLIGHT_PROXY_SCRIPT}"
    _preflight_fail "    3. Re-verify speed:      curl -s -o /dev/null -w '%{time_total}s' '$url' (should be <1s)"
    return 1
  fi
  _preflight_ok "Bundle proxy on :${PREFLIGHT_PROXY_PORT} healthy (bundle in ${time_s}s)"
}

# ── Check 6: API server reachable + healthy ────────────────────────────────
check_api_reachable() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${PREFLIGHT_API_URL}/v1/health" 2>/dev/null || echo "000")
  if [ "$status" != "200" ]; then
    _preflight_fail "API server not reachable at ${PREFLIGHT_API_URL}/v1/health (HTTP ${status})."
    _preflight_fail "  Fix: C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec wrangler dev"
    return 1
  fi
  _preflight_ok "API /v1/health responding on ${PREFLIGHT_API_URL}"
}

# ── Check 7: TEST_SEED_SECRET present AND accepted by the seed endpoint ────
# (covers Issue 4: Doppler ran with default `dev` config, so TEST_SEED_SECRET
# was empty while the API had the real value baked into .dev.vars from stg.)
check_seed_secret_valid() {
  local secret="${TEST_SEED_SECRET:-}"
  if [ -z "$secret" ]; then
    _preflight_fail "TEST_SEED_SECRET is empty in current environment."
    _preflight_fail "  Fix: run the harness under 'doppler run -c stg --', NOT the default -c dev."
    _preflight_fail "  Full command: C:/Tools/doppler/doppler.exe run -c stg -- bash ./scripts/run-all-regression.sh"
    return 1
  fi
  # Probe the seed endpoint with a dry-run scenario. A valid secret returns 200
  # (real seed) or 4xx (invalid payload), but specifically NOT 403 (invalid secret).
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST "${PREFLIGHT_API_URL}/v1/__test/seed" \
    -H "Content-Type: application/json" \
    -H "X-Test-Secret: ${secret}" \
    -d '{"scenario":"__preflight_probe","email":"preflight@test.invalid"}' 2>/dev/null || echo "000")
  if [ "$status" = "403" ]; then
    _preflight_fail "Seed API rejected TEST_SEED_SECRET (HTTP 403)."
    _preflight_fail "  The API's secret (from Doppler -c stg) does not match the current shell's TEST_SEED_SECRET."
    _preflight_fail "  Fix: start BOTH the API server AND this harness with the SAME Doppler config (-c stg)."
    return 1
  fi
  if [ "$status" = "000" ]; then
    _preflight_fail "Seed API probe failed (no HTTP response). Is the API server running?"
    return 1
  fi
  _preflight_ok "TEST_SEED_SECRET accepted by ${PREFLIGHT_API_URL}/v1/__test/seed (HTTP ${status})"
}

# ── Check 8: Emulator console reachable (for slow-network flows) ───────────
# Slow-network flows use the emulator console (`network delay`) to inject RTT
# latency. Without this check a missing auth token causes them to run at full
# speed, silently passing even when the timeout UI is broken (see spec §Preflight).
# This is warn-only so preflight does not block normal flows that don't use the
# slow-net env vars.
check_emulator_console() {
  if [ ! -f "$HOME/.emulator_console_auth_token" ]; then
    _preflight_warn "Emulator console auth token missing (~/.emulator_console_auth_token) — slow-network flows will run at full speed."
    return 0
  fi
  local port="${EMULATOR_CONSOLE_PORT:-5554}"
  if ! timeout 2 bash -c "</dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1; then
    _preflight_warn "Emulator console port ${port} not listening — slow-network flows will run at full speed."
    return 0
  fi
  _preflight_ok "Emulator console reachable on :${port}"
}

# ── Check 9: adb reverse ports configured ──────────────────────────────────
# Idempotent — sets up 8081, 8082, 8787 if not already forwarded. Not a hard
# failure check, but without it the emulator can't reach host services.
check_adb_reverse_ports() {
  "$PREFLIGHT_ADB" reverse tcp:"$PREFLIGHT_METRO_PORT" tcp:"$PREFLIGHT_METRO_PORT" >/dev/null 2>&1 || true
  "$PREFLIGHT_ADB" reverse tcp:"$PREFLIGHT_PROXY_PORT" tcp:"$PREFLIGHT_PROXY_PORT" >/dev/null 2>&1 || true
  "$PREFLIGHT_ADB" reverse tcp:8787 tcp:8787 >/dev/null 2>&1 || true
  _preflight_ok "adb reverse ports configured (${PREFLIGHT_METRO_PORT}, ${PREFLIGHT_PROXY_PORT}, 8787)"
}

# ── Orchestrator ────────────────────────────────────────────────────────────
run_preflight() {
  if [ "${E2E_PREFLIGHT_SKIP:-0}" = "1" ]; then
    echo "[preflight] SKIPPED (E2E_PREFLIGHT_SKIP=1)"
    return 0
  fi
  echo "[preflight] Running E2E infrastructure checks ..."
  # Order matters: cheapest+most-foundational first, so we fail fast.
  check_adb_device            || return 1
  check_uiautomator_healthy   || return 1
  check_apk_installed         || return 1
  check_emulator_console                # warn-only, never blocks
  check_adb_reverse_ports     || return 1
  check_metro_reachable       || return 1
  check_bundle_proxy_fast     || return 1
  check_api_reachable         || return 1
  check_seed_secret_valid     || return 1
  echo "[preflight] All checks PASSED — proceeding to tests."
  return 0
}

run_preflight_quiet() {
  PREFLIGHT_QUIET=1 run_preflight
}
