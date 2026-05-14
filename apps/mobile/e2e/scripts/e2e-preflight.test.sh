#!/usr/bin/env bash
# Break-tests for e2e-preflight.sh. For each check, prove that the check
# FAILS (returns non-zero) under the exact infrastructure condition it was
# designed to detect. This is the negative-path verification required by
# ~/.claude/CLAUDE.md "Security Fixes Require a Break Test" (extended here
# to E2E-harness fixes whose absence caused BUG-594..622).
#
# Usage: bash apps/mobile/e2e/scripts/e2e-preflight.test.sh
#
# Runtime: ~5s. Spins up tiny ephemeral HTTP servers on loopback-only ports
# (no emulator required). Each test runs ONLY the specific check under
# investigation, so adb/device checks are not executed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
FAILURES=()

_tpass() { PASS=$((PASS+1)); echo "  ✓ $*"; }
_tfail() { FAIL=$((FAIL+1)); FAILURES+=("$*"); echo "  ✗ $*" >&2; }

# Port picker — each call to _next_port returns a fresh unused high port so
# consecutive mock-server spawns can't collide on the kernel's TIME_WAIT state.
_NEXT_PORT=18080
_next_port() { _NEXT_PORT=$((_NEXT_PORT + 1)); echo "$_NEXT_PORT"; }

# ── Mock servers (spawned on demand, killed in trap) ───────────────────────
_MOCK_PIDS=()
_cleanup() {
  for pid in "${_MOCK_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Wait briefly for kernel to release the ports (Windows/WSL holds TIME_WAIT briefly)
  sleep 0.3
  _MOCK_PIDS=()
}
trap _cleanup EXIT INT TERM

# Spin up a mock HTTP server that artificially sleeps before responding.
# Args: <port> <sleep_seconds> <status_code>
_spawn_slow_server() {
  local port="$1" delay="$2" status="${3:-200}"
  node -e "
    const http = require('http');
    const srv = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(${status}, {'content-type':'application/javascript','content-length':'2'});
        res.end('//');
      }, ${delay} * 1000);
    });
    srv.listen(${port}, '127.0.0.1');
  " &
  local pid=$!
  _MOCK_PIDS+=("$pid")
  # Wait for port to accept TCP connections (bind is synchronous; can't curl
  # because the mock may intentionally delay response). Use node net probe.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if node -e "
      const net=require('net');
      const s=net.connect(${port},'127.0.0.1');
      s.on('connect',()=>{s.end();process.exit(0)});
      s.on('error',()=>process.exit(1));
      setTimeout(()=>process.exit(1),500);
    " 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

# Spin up a mock proxy where the first request is slow (cold Metro transform)
# and subsequent requests are fast. Preflight should warm then pass.
_spawn_cold_then_fast_server() {
  local port="$1" first_delay="$2"
  node -e "
    const http = require('http');
    let count = 0;
    const srv = http.createServer((req, res) => {
      count += 1;
      const delay = count === 1 ? ${first_delay} : 0;
      setTimeout(() => {
        res.writeHead(200, {'content-type':'application/javascript','content-length':'2'});
        res.end('//');
      }, delay * 1000);
    });
    srv.listen(${port}, '127.0.0.1');
  " &
  local pid=$!
  _MOCK_PIDS+=("$pid")
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if node -e "
      const net=require('net');
      const s=net.connect(${port},'127.0.0.1');
      s.on('connect',()=>{s.end();process.exit(0)});
      s.on('error',()=>process.exit(1));
      setTimeout(()=>process.exit(1),500);
    " 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

# Spin up a mock /v1/health that returns 200 or 500.
_spawn_api_mock() {
  local port="$1" health_status="${2:-200}" seed_status="${3:-200}"
  node -e "
    const http = require('http');
    const srv = http.createServer((req, res) => {
      if (req.url.startsWith('/v1/health')) {
        res.writeHead(${health_status}, {'content-type':'application/json'});
        res.end('{\"status\":\"ok\"}');
      } else if (req.url.startsWith('/v1/__test/seed')) {
        res.writeHead(${seed_status}, {'content-type':'application/json'});
        res.end('{\"ok\":true}');
      } else {
        res.writeHead(404); res.end();
      }
    });
    srv.listen(${port}, '127.0.0.1');
  " &
  local pid=$!
  _MOCK_PIDS+=("$pid")
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${port}/v1/health" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

# Load the module under test in a subshell-free way. We set PREFLIGHT_QUIET=1
# so we don't flood the test output with preflight OK lines; we only care
# about the return codes and stderr content.
# shellcheck source=e2e-preflight.sh
source "$SCRIPT_DIR/e2e-preflight.sh"
PREFLIGHT_QUIET=1

echo "─── check_bundle_proxy_fast ───────────────────────────────────────────"

# CASE 1: Degraded proxy (5s delay) should FAIL. This is the exact condition
# that produced the 2026-04-22 cascade (stale proxy buffering bundle slowly).
P=$(_next_port)
_spawn_slow_server "$P" 5 200 || _tfail "could not spawn slow mock proxy on $P"
rc=0
PREFLIGHT_PROXY_PORT=$P PREFLIGHT_METRO_HOST=127.0.0.1 \
  PREFLIGHT_PROXY_MAX_SECONDS=2 \
  check_bundle_proxy_fast >/dev/null 2>/tmp/pf_err_slow.txt || rc=$?
if [ $rc -ne 0 ] && grep -q "DEGRADED" /tmp/pf_err_slow.txt; then
  _tpass "rejects a 5s-delay proxy with 'DEGRADED' in error"
else
  _tfail "check_bundle_proxy_fast did NOT fail for slow proxy (rc=$rc). stderr: $(cat /tmp/pf_err_slow.txt)"
fi
_cleanup

# CASE 2: Fresh proxy (no delay) should PASS.
P=$(_next_port)
_spawn_slow_server "$P" 0 200 || _tfail "could not spawn fast mock proxy on $P"
rc=0
PREFLIGHT_PROXY_PORT=$P PREFLIGHT_METRO_HOST=127.0.0.1 \
  PREFLIGHT_PROXY_MAX_SECONDS=2 \
  check_bundle_proxy_fast >/dev/null 2>/tmp/pf_err_fast.txt || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "accepts a fast proxy"
else
  _tfail "check_bundle_proxy_fast rejected fast proxy (rc=$rc). stderr: $(cat /tmp/pf_err_fast.txt)"
fi
_cleanup

# CASE 3: Dead proxy (port closed) should PASS/SKIP.
# The current Android E2E path uses Metro directly on 8081. The 8082 proxy is
# optional, but if it is present it must be fast.
rc=0
PREFLIGHT_PROXY_PORT=19999 PREFLIGHT_METRO_HOST=127.0.0.1 \
  PREFLIGHT_PROXY_MAX_SECONDS=2 \
  check_bundle_proxy_fast >/dev/null 2>/tmp/pf_err_dead.txt || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "skips an absent optional proxy"
else
  _tfail "check_bundle_proxy_fast rejected an absent optional proxy (rc=$rc). stderr: $(cat /tmp/pf_err_dead.txt)"
fi

# CASE 4: Cold first bundle should retry and PASS if the proxy is then fast.
P=$(_next_port)
_spawn_cold_then_fast_server "$P" 3 || _tfail "could not spawn cold mock proxy on $P"
rc=0
PREFLIGHT_PROXY_PORT=$P PREFLIGHT_METRO_HOST=127.0.0.1 \
  PREFLIGHT_PROXY_MAX_SECONDS=2 \
  check_bundle_proxy_fast >/dev/null 2>/tmp/pf_err_cold.txt || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "accepts a cold first bundle when retry is fast"
else
  _tfail "check_bundle_proxy_fast rejected cold-then-fast proxy (rc=$rc). stderr: $(cat /tmp/pf_err_cold.txt)"
fi
_cleanup

echo ""
echo "─── check_metro_reachable ─────────────────────────────────────────────"
# CASE 5: Metro not listening → fail.
PREFLIGHT_METRO_HOST=127.0.0.1 PREFLIGHT_METRO_PORT=19998 \
  check_metro_reachable >/dev/null 2>/tmp/pf_err_metro.txt
if [ $? -ne 0 ] && grep -q "not reachable" /tmp/pf_err_metro.txt; then
  _tpass "rejects unreachable Metro"
else
  _tfail "check_metro_reachable did not fail on closed port"
fi

echo ""
echo "─── check_api_reachable ───────────────────────────────────────────────"
# CASE 6: API returns 500 → fail.
P=$(_next_port)
_spawn_api_mock "$P" 500 200 || _tfail "could not spawn 500-mock API on $P"
rc=0
PREFLIGHT_API_URL="http://127.0.0.1:${P}" \
  check_api_reachable >/dev/null 2>/tmp/pf_err_api_500.txt || rc=$?
if [ $rc -ne 0 ] && grep -q "HTTP 500" /tmp/pf_err_api_500.txt; then
  _tpass "rejects API returning 500"
else
  _tfail "check_api_reachable accepted 500 response (rc=$rc)"
fi
_cleanup

# CASE 7: API healthy → pass.
P=$(_next_port)
_spawn_api_mock "$P" 200 200 || _tfail "could not spawn healthy mock API on $P"
rc=0
PREFLIGHT_API_URL="http://127.0.0.1:${P}" \
  check_api_reachable >/dev/null 2>/tmp/pf_err_api_ok.txt || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "accepts healthy API"
else
  _tfail "check_api_reachable rejected healthy API (rc=$rc). stderr: $(cat /tmp/pf_err_api_ok.txt)"
fi

echo ""
echo "─── check_seed_secret_valid ───────────────────────────────────────────"

# CASE 8: TEST_SEED_SECRET empty → fail with Doppler hint. (No API needed —
# the check short-circuits before hitting the network.)
rc=0
PREFLIGHT_API_URL="http://127.0.0.1:${P}" \
  TEST_SEED_SECRET="" \
  check_seed_secret_valid >/dev/null 2>/tmp/pf_err_seed_empty.txt || rc=$?
if [ $rc -ne 0 ] && grep -q "doppler run -c stg" /tmp/pf_err_seed_empty.txt; then
  _tpass "rejects empty TEST_SEED_SECRET with Doppler guidance"
else
  _tfail "check_seed_secret_valid did not fail on empty secret (rc=$rc). stderr: $(cat /tmp/pf_err_seed_empty.txt)"
fi
_cleanup

# CASE 9: API returns 403 on seed (wrong secret) → fail.
P=$(_next_port)
_spawn_api_mock "$P" 200 403 || _tfail "could not spawn 403-seed mock API on $P"
rc=0
PREFLIGHT_API_URL="http://127.0.0.1:${P}" \
  TEST_SEED_SECRET="wrong-secret" \
  check_seed_secret_valid >/dev/null 2>/tmp/pf_err_seed_403.txt || rc=$?
if [ $rc -ne 0 ] && grep -q "rejected TEST_SEED_SECRET" /tmp/pf_err_seed_403.txt; then
  _tpass "rejects secret that the API refuses (HTTP 403)"
else
  _tfail "check_seed_secret_valid accepted 403 from seed API (rc=$rc). stderr: $(cat /tmp/pf_err_seed_403.txt)"
fi
_cleanup

# CASE 10: Valid secret + API accepts → pass.
P=$(_next_port)
_spawn_api_mock "$P" 200 200 || _tfail "could not spawn healthy mock API on $P"
rc=0
PREFLIGHT_API_URL="http://127.0.0.1:${P}" \
  TEST_SEED_SECRET="present-and-valid" \
  check_seed_secret_valid >/dev/null 2>/tmp/pf_err_seed_ok.txt || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "accepts valid secret"
else
  _tfail "check_seed_secret_valid rejected valid secret (rc=$rc). stderr: $(cat /tmp/pf_err_seed_ok.txt)"
fi

echo ""
echo "─── METRO_URL → PREFLIGHT_METRO_PORT derivation ──────────────────────"
# CASE: when METRO_URL is set to a non-default port (e.g. running Metro on 8083
# because 8081/8082 are held by another branch's dev server), the preflight
# must check the SAME port the harness will hit — otherwise check_metro_reachable
# fails against 8081 and the regression suite stops before any test runs.
# This is the exact failure that blocked 166+ flow-review rows on 2026-05-14
# (SocketTimeoutException + dev-launcher ANR was the harness-side symptom; the
# preflight-side symptom of the same root cause is "Metro bundler not reachable
# at 127.0.0.1:8081" even though Metro is happily running on 8083).
rc=0
(
  unset PREFLIGHT_METRO_PORT
  export METRO_URL="http://10.0.2.2:8083"
  # Re-source to re-evaluate the tunables block.
  source "$SCRIPT_DIR/e2e-preflight.sh"
  [ "$PREFLIGHT_METRO_PORT" = "8083" ] || exit 1
) || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "derives PREFLIGHT_METRO_PORT=8083 from METRO_URL=http://10.0.2.2:8083"
else
  _tfail "METRO_URL=http://10.0.2.2:8083 did NOT derive PREFLIGHT_METRO_PORT=8083"
fi

rc=0
(
  unset PREFLIGHT_METRO_PORT METRO_URL
  source "$SCRIPT_DIR/e2e-preflight.sh"
  [ "$PREFLIGHT_METRO_PORT" = "8081" ] || exit 1
) || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "defaults PREFLIGHT_METRO_PORT=8081 when METRO_URL unset"
else
  _tfail "PREFLIGHT_METRO_PORT did not default to 8081 when METRO_URL unset"
fi

rc=0
(
  export PREFLIGHT_METRO_PORT=9000
  export METRO_URL="http://10.0.2.2:8083"
  source "$SCRIPT_DIR/e2e-preflight.sh"
  [ "$PREFLIGHT_METRO_PORT" = "9000" ] || exit 1
) || rc=$?
if [ $rc -eq 0 ]; then
  _tpass "explicit PREFLIGHT_METRO_PORT overrides METRO_URL derivation"
else
  _tfail "explicit PREFLIGHT_METRO_PORT=9000 was overridden by METRO_URL"
fi

echo ""
echo "─── E2E_PREFLIGHT_SKIP honored ────────────────────────────────────────"
# CASE 11: Escape hatch works.
E2E_PREFLIGHT_SKIP=1 run_preflight >/tmp/pf_skip_stdout.txt 2>&1
if [ $? -eq 0 ] && grep -q "SKIPPED" /tmp/pf_skip_stdout.txt; then
  _tpass "E2E_PREFLIGHT_SKIP=1 bypasses checks"
else
  _tfail "E2E_PREFLIGHT_SKIP=1 did not bypass. output: $(cat /tmp/pf_skip_stdout.txt)"
fi

echo ""
echo "─── Summary ────────────────────────────────────────────────────────────"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
