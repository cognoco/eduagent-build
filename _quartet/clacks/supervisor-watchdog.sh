#!/usr/bin/env bash
# WI-1618 macOS/bash port of WI-1563's supervisor-watchdog.ps1  -  implements the
# algorithm in _quartet/library/supervisor-watchdog-contract.md. Polls one or more
# heartbeat.json files (_quartet/library/heartbeat-contract.md), and resume-relaunches
# a session ONLY once its process is confirmed gone (not just quiet) AND its recorded
# token-window reset time has passed. Never itself an agent/LLM, so it can never be
# rate-limited into uselessness.
#
# Run every 10 minutes by a macOS launchd LaunchAgent (see
# register-supervisor-watchdog-launchd.sh). Pure, deterministic given --now  -  same
# shape as clacks/l1-liveness-check.js's --now convention and the .ps1's -Now, so a
# simulated death can be tested without waiting real hours.
#
# Usage:
#   supervisor-watchdog.sh [--now ISO8601] [--stale-threshold-minutes N] <heartbeat.json> [<heartbeat.json> ...]
#
# Example:
#   ./supervisor-watchdog.sh /path/to/heartbeat.json
#
# Example (deterministic test):
#   ./supervisor-watchdog.sh --now "2026-07-05T00:35:00Z" ./fixture/heartbeat.json
#
# PORT NOTE (WI-1618): date parsing has a GNU/BSD dual path (to_epoch/epoch_to_iso
# below) because macOS ships BSD date while this port is git-bash-tested on Surface
# (GNU date, via MSYS2/cygwin). Only the GNU branch is exercised by
# supervisor-watchdog.test.sh on Surface  -  the BSD branch is written per the same
# contract but is NOT macOS-verified. See the WI-1618 report for the full
# verified-vs-unvalidated breakdown.
#
# Dependency note: uses jq for JSON read/write (no bash JSON parser assumed present).

set -u
set -o pipefail

STALE_THRESHOLD_MIN=30
NOW_OVERRIDE=""
HEARTBEAT_PATHS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --now)
      NOW_OVERRIDE="$2"; shift 2 ;;
    --stale-threshold-minutes)
      STALE_THRESHOLD_MIN="$2"; shift 2 ;;
    *)
      HEARTBEAT_PATHS+=("$1"); shift ;;
  esac
done

if [ "${#HEARTBEAT_PATHS[@]}" -eq 0 ]; then
  echo "usage: supervisor-watchdog.sh [--now ISO8601] [--stale-threshold-minutes N] <heartbeat.json> ..." >&2
  exit 1
fi

# ---- time helpers  -  GNU/BSD dual path, see PORT NOTE above ----

to_epoch() {
  # ISO-8601 UTC (e.g. 2026-07-05T00:35:00Z) -> epoch seconds
  local iso="$1" out
  out=$(date -u -d "$iso" +%s 2>/dev/null) && { printf '%s\n' "$out"; return; }
  date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s
}

epoch_to_iso() {
  local epoch="$1" out
  out=$(date -u -d "@$epoch" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null) && { printf '%s\n' "$out"; return; }
  date -u -r "$epoch" +"%Y-%m-%dT%H:%M:%SZ"
}

get_now_epoch() {
  if [ -n "$NOW_OVERRIDE" ]; then
    to_epoch "$NOW_OVERRIDE"
  else
    date -u +%s
  fi
}

backoff_minutes() {
  case "$1" in
    1) echo 10 ;;
    2) echo 30 ;;
    3) echo 60 ;;
    *) echo 120 ;;
  esac
}

add_breadcrumb() {
  # add_breadcrumb <dir> <session_id> <event> <msg> [attempt]
  local dir="$1" session_id="$2" event="$3" msg="$4" attempt="${5:-}"
  local ts; ts=$(epoch_to_iso "$(get_now_epoch)")
  local line
  if [ -n "$attempt" ]; then
    line=$(jq -nc --arg ts "$ts" --arg session_id "$session_id" --arg event "$event" \
      --argjson attempt "$attempt" --arg msg "$msg" \
      '{ts:$ts, session_id:$session_id, event:$event, attempt:$attempt, msg:$msg}')
  else
    line=$(jq -nc --arg ts "$ts" --arg session_id "$session_id" --arg event "$event" --arg msg "$msg" \
      '{ts:$ts, session_id:$session_id, event:$event, msg:$msg}')
  fi
  printf '%s\n' "$line" >> "$dir/supervisor-recovery.jsonl"
}

get_recovery_attempt_count() {
  local dir="$1" state="$dir/supervisor-recovery-state.json"
  if [ -f "$state" ]; then jq -r '.attempt_count // 0' "$state" 2>/dev/null || echo 0
  else echo 0
  fi
}

get_recovery_next_attempt() {
  local dir="$1" state="$dir/supervisor-recovery-state.json"
  if [ -f "$state" ]; then jq -r '.next_attempt_not_before // empty' "$state" 2>/dev/null || echo ""
  else echo ""
  fi
}

set_recovery_state() {
  local dir="$1" attempt_count="$2" next_attempt="$3" state="$dir/supervisor-recovery-state.json"
  if [ -n "$next_attempt" ]; then
    jq -n --argjson ac "$attempt_count" --arg nab "$next_attempt" \
      '{attempt_count:$ac, next_attempt_not_before:$nab}' > "$state"
  else
    jq -n --argjson ac "$attempt_count" \
      '{attempt_count:$ac, next_attempt_not_before:null}' > "$state"
  fi
}

process_heartbeat() {
  local path="$1"
  local dir; dir=$(dirname "$path")
  local now_epoch; now_epoch=$(get_now_epoch)
  local now_iso; now_iso=$(epoch_to_iso "$now_epoch")

  if [ ! -f "$path" ]; then
    echo "[$now_iso] SKIP $path  -  heartbeat file not found"
    return
  fi

  local hb; hb=$(cat "$path")
  local session_id host pid last_alive window_resets_at relaunch_command
  session_id=$(jq -r '.session_id' <<<"$hb")
  host=$(jq -r '.host' <<<"$hb")
  pid=$(jq -r '.pid' <<<"$hb")
  last_alive=$(jq -r '.last_alive' <<<"$hb")
  window_resets_at=$(jq -r '.window_resets_at' <<<"$hb")
  relaunch_command=$(jq -r '.relaunch_command' <<<"$hb")

  local last_alive_epoch window_resets_epoch staleness_min
  last_alive_epoch=$(to_epoch "$last_alive")
  window_resets_epoch=$(to_epoch "$window_resets_at")
  staleness_min=$(( (now_epoch - last_alive_epoch) / 60 ))

  local attempt_count next_attempt
  attempt_count=$(get_recovery_attempt_count "$dir")
  next_attempt=$(get_recovery_next_attempt "$dir")

  # A resumed session's last_alive advances past our last respawn attempt -> clear backoff.
  if [ "$attempt_count" -gt 0 ] && [ "$staleness_min" -lt "$STALE_THRESHOLD_MIN" ]; then
    set_recovery_state "$dir" 0 ""
    add_breadcrumb "$dir" "$session_id" "recovered" "[orch-status] heartbeat resumed  -  backoff state cleared"
  fi

  if [ "$staleness_min" -lt "$STALE_THRESHOLD_MIN" ]; then
    echo "[$now_iso] HEALTHY $session_id  -  last_alive ${staleness_min}min ago"
    return
  fi

  # Stale. Duplicate-session guard: only trust PID when the heartbeat's host is this host.
  local local_host; local_host=$(hostname)
  if [ "$host" = "$local_host" ] && [ -n "$pid" ] && [ "$pid" != "null" ]; then
    if kill -0 "$pid" 2>/dev/null; then
      echo "[$now_iso] HANG-SUSPECTED $session_id  -  stale ${staleness_min}min but pid $pid still running; NOT respawning"
      add_breadcrumb "$dir" "$session_id" "hang-suspected" \
        "[orch-status] heartbeat stale ${staleness_min}min but process $pid alive on $local_host  -  no respawn (duplicate-session guard)"
      return
    fi
  fi

  # Window-reset gate  -  never respawn before the recorded reset time, regardless of cause of death.
  if [ "$now_epoch" -lt "$window_resets_epoch" ]; then
    echo "[$now_iso] WINDOW-NOT-RESET $session_id  -  stale but window resets $window_resets_at; waiting"
    add_breadcrumb "$dir" "$session_id" "window-wait" \
      "[orch-status] stale since $last_alive; window not reset until $window_resets_at  -  not respawning"
    return
  fi

  # Backoff gate  -  paces retries of a broken relaunch; cannot fire before the window gate above.
  if [ -n "$next_attempt" ]; then
    local next_attempt_epoch; next_attempt_epoch=$(to_epoch "$next_attempt")
    if [ "$now_epoch" -lt "$next_attempt_epoch" ]; then
      echo "[$now_iso] BACKOFF-WAIT $session_id  -  next attempt not before $next_attempt"
      return
    fi
  fi

  local attempt=$((attempt_count + 1))
  if [ "$attempt" -ge 6 ]; then
    echo "[$now_iso] ESCALATE $session_id  -  5 respawn attempts exhausted, giving up"
    add_breadcrumb "$dir" "$session_id" "escalate" \
      "[orch-status] needs-operator: 5 respawn attempts exhausted for $session_id  -  clear supervisor-recovery-state.json to retry" \
      "$attempt"
    return
  fi

  echo "[$now_iso] RESPAWN $session_id  -  attempt $attempt : $relaunch_command"
  nohup bash -c "$relaunch_command" >/dev/null 2>&1 &

  local backoff_min; backoff_min=$(backoff_minutes "$attempt")
  local next_not_before; next_not_before=$(epoch_to_iso $((now_epoch + backoff_min * 60)))
  set_recovery_state "$dir" "$attempt" "$next_not_before"
  add_breadcrumb "$dir" "$session_id" "respawn-attempt" \
    "[orch-status] stale since $last_alive; window reset confirmed $window_resets_at; relaunching (attempt $attempt, next retry not before $next_not_before if this fails)" \
    "$attempt"
}

for p in "${HEARTBEAT_PATHS[@]}"; do
  process_heartbeat "$p"
done
