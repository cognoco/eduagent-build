#!/usr/bin/env bash
# Self-contained verification for WI-1618's supervisor-watchdog.sh (macOS/bash port of
# WI-1563's supervisor-watchdog.ps1). Mirrors supervisor-watchdog.test.ps1's cases so
# both OS implementations of _quartet/library/supervisor-watchdog-contract.md are held
# to the same bar. Builds fixture heartbeat files in a scratch dir and drives the
# watchdog with --now overrides so the 5-hour window gate and 30-minute staleness
# threshold are exercised deterministically, without waiting real time.
#
# Not a test framework suite (none is wired in for bash any more than for the .ps1  -
# see clacks/lease.test.ts for the .ts convention). Plain pass/fail assertions,
# printed, non-zero exit on any failure. Covers the adversarial cases called out in
# supervisor-watchdog-contract.md: no premature respawn before window reset, no
# respawn while the old process is still alive (duplicate guard), no respawn-loop
# (backoff), and the actual detect->wait->resume->breadcrumb path with a stub
# relaunch_command.
#
# Run via git-bash on Surface (or bash on macOS/Linux):
#   ./supervisor-watchdog.test.sh

set -u
set -o pipefail

failures=0
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
watchdog="$script_dir/supervisor-watchdog.sh"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/wi1618-watchdog-test-XXXXXX")
local_host=$(hostname)
dead_pid=999999

assert_true() {
  # assert_true <exit-status-of-preceding-check> <msg>
  if [ "$1" -eq 0 ]; then
    echo "  PASS: $2"
  else
    echo "  FAIL: $2"
    failures=$((failures + 1))
  fi
}

new_fixture() {
  # new_fixture <name> <session_id> <pid> <last_alive> <window_resets_at> <relaunch_marker_path>
  local name="$1" session_id="$2" pid="$3" last_alive="$4" window_resets_at="$5" marker="$6"
  local dir="$scratch/$name"
  mkdir -p "$dir"
  jq -n --arg session_id "$session_id" --arg role "shepherd" --arg lane "ws-test" \
    --arg host "$local_host" --argjson pid "$pid" --arg last_alive "$last_alive" \
    --arg window_resets_at "$window_resets_at" --arg relaunch_command "touch '$marker'" \
    '{session_id:$session_id, role:$role, lane:$lane, host:$host, pid:$pid,
      last_alive:$last_alive, window_resets_at:$window_resets_at, relaunch_command:$relaunch_command}' \
    > "$dir/heartbeat.json"
  echo "$dir/heartbeat.json"
}

recovery_log_count() {
  # recovery_log_count <heartbeat-path> <event>
  local dir; dir=$(dirname "$1")
  local log="$dir/supervisor-recovery.jsonl"
  if [ ! -f "$log" ]; then echo 0; return; fi
  jq -s --arg event "$2" '[.[] | select(.event == $event)] | length' "$log"
}

# ---------------------------------------------------------------------------
echo "Case 1: HEALTHY  -  fresh heartbeat, no action, no breadcrumb"
hb1=$(new_fixture "healthy" "shepherd:test-1" "$$" "2026-07-05T00:28:00Z" "2026-07-05T05:28:00Z" "$scratch/healthy/RESPAWNED.marker")
bash "$watchdog" --now "2026-07-05T00:30:00Z" "$hb1" >/dev/null
[ ! -f "$scratch/healthy/RESPAWNED.marker" ]; assert_true $? "healthy session not respawned"
[ ! -f "$scratch/healthy/supervisor-recovery.jsonl" ]; assert_true $? "no breadcrumb for a healthy session"

# ---------------------------------------------------------------------------
echo "Case 2: WINDOW-NOT-RESET  -  stale, dead pid, but window not reset -> NO respawn (the load-bearing negative case)"
hb2=$(new_fixture "windownotreset" "shepherd:test-2" "$dead_pid" "2026-07-05T00:00:00Z" "2026-07-05T05:00:00Z" "$scratch/windownotreset/RESPAWNED.marker")
# now = 00:40 -> stale (40min > 30min threshold), pid dead, but window resets 05:00 -> must NOT respawn.
bash "$watchdog" --now "2026-07-05T00:40:00Z" "$hb2" >/dev/null
[ ! -f "$scratch/windownotreset/RESPAWNED.marker" ]; assert_true $? "no premature respawn before window reset"
[ "$(recovery_log_count "$hb2" "window-wait")" -ge 1 ]; assert_true $? "window-wait breadcrumb posted"
[ "$(recovery_log_count "$hb2" "respawn-attempt")" -eq 0 ]; assert_true $? "no respawn-attempt breadcrumb while window closed"

# ---------------------------------------------------------------------------
echo "Case 3: HANG-SUSPECTED  -  stale but pid still alive -> NO respawn (duplicate-session guard)"
hb3=$(new_fixture "hang" "shepherd:test-3" "$$" "2026-07-05T00:00:00Z" "2026-07-05T00:10:00Z" "$scratch/hang/RESPAWNED.marker")
# now = 00:40 -> stale, window already reset (00:10), but $$ (this test process) is alive -> must NOT respawn.
bash "$watchdog" --now "2026-07-05T00:40:00Z" "$hb3" >/dev/null
[ ! -f "$scratch/hang/RESPAWNED.marker" ]; assert_true $? "no respawn while recorded pid is still alive"
[ "$(recovery_log_count "$hb3" "hang-suspected")" -ge 1 ]; assert_true $? "hang-suspected breadcrumb posted"

# ---------------------------------------------------------------------------
echo "Case 4: RESPAWN  -  stale, dead pid, window reset -> respawns and posts breadcrumb (positive path)"
hb4=$(new_fixture "respawn" "shepherd:test-4" "$dead_pid" "2026-07-05T00:00:00Z" "2026-07-05T00:10:00Z" "$scratch/respawn/RESPAWNED.marker")
bash "$watchdog" --now "2026-07-05T00:40:00Z" "$hb4" >/dev/null
sleep 2   # relaunch_command is backgrounded; give the stub command time to run.
[ -f "$scratch/respawn/RESPAWNED.marker" ]; assert_true $? "relaunch_command executed on confirmed dead+reset session"
[ "$(recovery_log_count "$hb4" "respawn-attempt")" -eq 1 ]; assert_true $? "respawn-attempt #1 breadcrumb posted"

echo "Case 4b: BACKOFF  -  immediately re-polling the same still-stale heartbeat must NOT respawn-loop"
rm -f "$scratch/respawn/RESPAWNED.marker"
bash "$watchdog" --now "2026-07-05T00:41:00Z" "$hb4" >/dev/null
sleep 2
[ ! -f "$scratch/respawn/RESPAWNED.marker" ]; assert_true $? "no second respawn one minute later (10-min backoff in effect)"

# ---------------------------------------------------------------------------
echo "Case 5: RECOVERED  -  once last_alive advances, backoff state clears"
jq '.last_alive = "2026-07-05T00:41:30Z"' "$hb4" > "$hb4.tmp" && mv "$hb4.tmp" "$hb4"
bash "$watchdog" --now "2026-07-05T00:42:00Z" "$hb4" >/dev/null
attempt_count=$(jq -r '.attempt_count' "$scratch/respawn/supervisor-recovery-state.json")
[ "$attempt_count" -eq 0 ]; assert_true $? "backoff attempt_count reset after heartbeat resumed"

# ---------------------------------------------------------------------------
rm -rf "$scratch"

if [ "$failures" -gt 0 ]; then
  echo ""
  echo "$failures assertion(s) FAILED"
  exit 1
else
  echo ""
  echo "All assertions passed."
  exit 0
fi
