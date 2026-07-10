# ORION — Activation Queue

> Gate-ordered, not date-ordered. Each entry is a condition on a named event. Full forward view.
> Shape: `../../library/activation-queue.md`. Machine-local; not committed.

| Initiative | Gate condition(s) | Blast-radius | Notes |
|---|---|---|---|
| PRG-31 · Safety & Eval (WS-31) | Machinery live ✅ · released (autonomous, P1-first) · operator spawns shepherd + reviewer | in-radius (API/LLM safety + eval harness; WI-1154 security-critical) | Dedicated shepherd (not folded into mobile). Kickoffs handed over. Reviewer enforces break-test DoD. |
| PRG-33 · Mobile UX & Navigation (WS-33) | Machinery live ✅ · released (autonomous) · shepherd live | in-radius (mobile nav/shell — regression-sensitive across V0-off/V0-on/V1) | Running. Reviewer covers WS-33 only. |
| PRG-34 · Platform Hardening (WS-34) | **RELEASED 2026-07-08** · operator launches shepherd · non-Codex reviewer provisioning needed | in-radius, HIGH cross-lane conflict risk (mobile+API+root debt overlapping Ramtop lanes) | Active. Lane provisioned; WS-34 Status=Open; tracker refreshed. Stale-Ready items must re-enter refine before dispatch; Ramtop overlap remains an execution-time coordination hazard. |

**Standard gates (all must clear):** blast-radius class · pipeline-**proven** · attention budget ·
plus named operator/product gates. Here the binding gate is the **operator release of the On-hold
workstream** — until then the shepherd primes and holds.
