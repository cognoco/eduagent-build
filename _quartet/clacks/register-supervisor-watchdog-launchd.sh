#!/usr/bin/env bash
# OPERATOR-RUN helper. Registers the WI-1563/WI-1618 supervisor watchdog as a macOS
# launchd LaunchAgent that polls every 10 minutes  -  the macOS analog of
# register-supervisor-watchdog-task.ps1. This script is NOT executed automatically by
# any agent  -  it modifies system launchd state, which is an operator action (see
# supervisor-watchdog-contract.md "Poll interval"). Run it yourself once, after editing
# the HEARTBEAT_PATHS list below to match the sessions you want supervised.
#
# CONTRACT-WRITTEN, NOT macOS-VALIDATED (WI-1618 was built on Surface/Windows; this
# script and the launchd/plist mechanics it drives have not been executed on macOS --
# see the WI-1618 report for the full verified-vs-unvalidated breakdown). A Ramtop
# (macOS) execution pass is a known follow-up.
#
# .DESCRIPTION
#   Writes a LaunchAgent plist at ~/Library/LaunchAgents/com.nexus.supervisor-watchdog.plist
#   that runs supervisor-watchdog.sh every 10 minutes (StartInterval=600), then loads it
#   via launchctl, so the watchdog survives reboots/logins and can never be rate-limited
#   (it is not an agent process).
#
# .EXAMPLE
#   # Edit HEARTBEAT_PATHS below, then:
#   ./register-supervisor-watchdog-launchd.sh

set -euo pipefail

LABEL="com.nexus.supervisor-watchdog"
REPO_ROOT="${REPO_ROOT:-$HOME/nexus}"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
WATCHDOG="$REPO_ROOT/_quartet/clacks/supervisor-watchdog.sh"

# Add one path per supervised lane/program session, e.g.:
#   "$REPO_ROOT/_quartet/working/lanes/<lane>/_state/heartbeat.json"
HEARTBEAT_PATHS=(
  "$REPO_ROOT/_quartet/working/program/heartbeat.json"
)

if [ ! -f "$WATCHDOG" ]; then
  echo "Watchdog script not found at $WATCHDOG  -  check REPO_ROOT." >&2
  exit 1
fi

mkdir -p "$PLIST_DIR"

{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n'
  printf '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
  printf '<plist version="1.0">\n<dict>\n'
  printf '  <key>Label</key>\n  <string>%s</string>\n' "$LABEL"
  printf '  <key>ProgramArguments</key>\n  <array>\n'
  printf '    <string>/bin/bash</string>\n'
  printf '    <string>%s</string>\n' "$WATCHDOG"
  for hb in "${HEARTBEAT_PATHS[@]}"; do
    printf '    <string>%s</string>\n' "$hb"
  done
  printf '  </array>\n'
  printf '  <key>StartInterval</key>\n  <integer>600</integer>\n'
  printf '  <key>RunAtLoad</key>\n  <true/>\n'
  printf '  <key>StandardOutPath</key>\n  <string>/tmp/nexus-supervisor-watchdog.log</string>\n'
  printf '  <key>StandardErrorPath</key>\n  <string>/tmp/nexus-supervisor-watchdog.log</string>\n'
  printf '</dict>\n</plist>\n'
} > "$PLIST_PATH"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Registered LaunchAgent '$LABEL' polling every 10 min: $PLIST_PATH"
