# BID-49 checkpoint — topology preflight hold

Timestamp: 2026-07-26T20:05Z  
Seat: `shepherd:codex:bid-49`  
Host: Orion (`zly-orion`)

Evidence:

- Live Nexus commit at preflight: `fceccbed0424bbcf3d1a5f1397be52bf5fc5102c`.
- Ratified Shepherd charter requires an operator-authorized `standalone_shepherd` declaration for the Shepherd to absorb Orchestrator.
- Live MentoMate declaration is `topology-mentomate-004`, mode `pm_bridge`, state `recovering`, with no `bid-49` lane or `shepherd:codex:bid-49` seat; its entry reason explicitly withholds delivery dispatch pending replacement topology.
- BID-49 live Brief names six members and the frontier/edge order. The batch is already Running from the prior optimistic claim, but none of its members was claimed by this seat.
- Current Clacks client was installed and identity selftest passed. Escalation `bid-49-001` was written at substrate row 66456.

Decision: fail closed on claims, dispatch, merge, and lifecycle writes; continue read-only board/Git reconciliation and durable comms monitoring.

