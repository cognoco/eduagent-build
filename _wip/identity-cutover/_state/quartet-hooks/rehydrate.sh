#!/usr/bin/env bash
# Quartet SessionStart rehydration injector — Approach-D, context-management experiment (PRG-06).
# Fires on SessionStart source=startup|resume|compact. FAIL-OPEN: must never disrupt a session.
# Gate: inject ONLY for Quartet role-sessions — QUARTET_ROLE env (preferred, env-launched sessions)
#       OR session_id registered in roles.json (covers already-running sessions, no relaunch).
#       Everything else (human/dev sessions, executors, reviewer clone) -> silent no-op.
# Stdout becomes Claude's context (SessionStart is a documented stdout-injection exception).
# Working-tree-only artifact; NEVER commit / never `git add` this dir.

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOKDIR="$ROOT/_wip/identity-cutover/_state/quartet-hooks"
ROLES="$HOOKDIR/roles.json"
LOG="$HOOKDIR/fires.log"

input="$(cat 2>/dev/null)"
sid="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)"
src="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("source",""))' 2>/dev/null)"

# Log every fire for experiment reconciliation (session_id is not a secret).
printf '%s source=%s sid=...%s QUARTET_ROLE=%s\n' "$(date -u +%FT%TZ 2>/dev/null)" "${src:-?}" "${sid: -6}" "${QUARTET_ROLE:-}" >> "$LOG" 2>/dev/null

role="${QUARTET_ROLE:-}"
if [ -z "$role" ] && [ -n "$sid" ] && [ -f "$ROLES" ]; then
  role="$(python3 -c 'import sys,json; print(json.load(open(sys.argv[1])).get(sys.argv[2],""))' "$ROLES" "$sid" 2>/dev/null)"
fi
[ -z "$role" ] && exit 0   # not a Quartet role-session -> no-op, session unaffected

case "$role" in
  orchestrator) doc="$(ls -t "$ROOT"/_wip/umbrella-program/orchestrator-compaction-handoff-*.md 2>/dev/null | head -1)";;
  shepherd)     doc="$ROOT/_wip/identity-cutover/_state/shepherd-world.md";;
  *)            doc="";;
esac
inbox="$ROOT/_wip/identity-cutover/_state/inbox.jsonl"
outbox="$ROOT/_wip/identity-cutover/_state/outbox.jsonl"

echo "=== QUARTET REHYDRATION (Approach-D auto-inject; source=${src:-?}) ==="
echo "You are the PRG-06 \"Identity Cutover\" (WS-18) ${role}. Context was just compacted/resumed/started."
echo "Rehydrate from the DURABLE substrate BEFORE acting; do NOT rely on the auto-summary alone."
echo ""
if [ "$role" = "orchestrator" ]; then
  echo "0. 🔴 RE-READ THESE FIRST (mandatory — the anchor narrative is NOT a substitute for the protocol):"
  echo "   a. _wip/umbrella-program/orchestrator-protocol.md — your role + the 8-step Lane-activation ceremony + channel-router rules (governs HOW you act)."
  echo "   b. _wip/umbrella-program/program-roster.md — PRG-NN Initiative rows + numbering bands + activation queue + cross-program gates."
  echo "   c. _wip/umbrella-program/planning-reference.md — canonical planning rules."
  echo "   (Skipping these is the documented 2026-06-18 drift: hand-rolling a lane instead of running the defined ceremony.)"
  echo ""
fi
if [ -n "$doc" ] && [ -f "$doc" ]; then
  echo "1. Read your world-state anchor IN FULL: $doc"
else
  echo "1. World-state anchor not found — locate your role's handoff doc under _wip/ before proceeding."
fi
echo "2. Source of truth = Cosmo WS-18 (id 3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8). Verify load-bearing facts there; channel files are working-tree-only (trust less than Cosmo/git)."
echo "3. Live channel tail (current as of this rehydration — reconciles any anchor lag):"
if [ -f "$inbox" ]; then
  echo "   --- inbox (orchestrator->shepherd) last 3 ---"
  tail -n 3 "$inbox" 2>/dev/null | cut -c1-200 | sed 's/^/   /'
fi
if [ -f "$outbox" ]; then
  echo "   --- outbox (shepherd->orchestrator) last 3 ---"
  tail -n 3 "$outbox" 2>/dev/null | cut -c1-200 | sed 's/^/   /'
fi
echo ""
echo "Then: self-assess rehydration fidelity (clean vs degraded?) and report it as the Approach-D experiment data point. Resume monitoring posture; surface only the agreed signals."
exit 0
