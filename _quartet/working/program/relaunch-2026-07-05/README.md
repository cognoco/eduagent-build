# Fleet relaunch 2026-07-05 — priming packets

Phase E of the retro (`../retro-2026-07-05/DECISION-PACK.md`). One packet per
orchestrator; the packet IS the kickoff context — paste its path into the fresh
session's first prompt.

Sequencing: **ramtop first** → stable a few hours → orion.

## Common preamble (both packets assume this)

**Version pins (state these in your first outbox/status; re-check at every wake/resume):**
- Quartet canon: Nexus repo `_quartet/roles/*` @ **nexus@92c9715** (orchestrator-protocol,
  shepherd-protocol, program-manager-protocol) + `_quartet/clacks/monitor-hygiene.md`.
- Precedent register: `_quartet/working/program/precedent-register.md` (this repo, main) —
  READ IT before filing anything to the operator.
- Plugins (OPQ-17, P0): the installed plugin cache was silently pinned at cosmo 0.6.32
  on at least two machines — all merged lifecycle fixes were runtime-inert (dedup dead,
  `claude -p` still invoked). **Ramtop is fixed** (cosmo 0.6.40 + zdx-core 1.0.2, 07-05).
  **Any other machine: verify `~/.claude/plugins/cache/zdx-marketplace/cosmo/` tops out
  at ≥0.6.40 BEFORE the first lifecycle command**; if stale, pull the marketplace clone
  (`~/.claude/plugins/marketplaces/zdx-marketplace`) then disable/enable the plugin.

**What changed while the fleet was down (retro Tier A — all landed):**
1. **Fleet-state protocol** (WI-1599/1564): PAUSE / DRAIN / SHUTDOWN are distinct tiers;
   ambiguous stop requests resolve to the SOFTEST tier; ack the tier back explicitly.
2. **Merge authority classes** (WI-1585): irreversible / schema-destructive / prod-facing =
   two-key with operator; ordinary pre-launch merges = self-rule; doubt → higher class.
3. **Operator Queue** (Notion DB `3948bce9-1f7c-8100-96d9-d78f2351a442`): anything needing
   the operator — Approval / Decision / Action — is filed as a ROW (options + rec + evidence),
   never left in chat. PM (fable) triages; rulings come back as row closes + relay.
4. **Supervisor watchdog** (WI-1563 + WI-1618 macOS port): agent sessions run supervised;
   rate-limit death → auto-resume via interactive `claude --resume`. **`claude -p` is
   VETOED fleet-wide** (Max-subscription constraint) — never build on it.
5. **Heartbeat discipline** (WI-1602, + WI-1615 writer in flight): idle/blocked lanes BACK
   OFF polling cadence. Fixed-cadence polling burned 65% of a Max-20x day; do not repeat.
6. **`_state` permanence** (WI-1245, may still be Executing at relaunch): clacks `_state`
   files are working-tree-only; never commit, never let a sweep re-add them.
7. **SESSION-HANDOFF.md standard** (WI-1603) + **monitor restart-replay rule** (WI-1606):
   keep a live resume anchor; on any monitor re-arm, replay the delta, never seed silently.
8. **Bypass-evidence rule**: any request to bypass a gate carries the verbatim guard
   output, not a characterization.

**Coordination:** PM watcher polls your WS-row COMMENTS ([orch-status]/[orch-ack]/
[orch-escalation]) — post there, positively ack fleet-wide directives. Keep ENE dates honest.
