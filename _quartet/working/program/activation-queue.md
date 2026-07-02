# ORION — Activation Queue

> Gate-ordered, not date-ordered. Each entry is a condition on a named event. Full forward view.
> Shape: `../../library/activation-queue.md`. Machine-local; not committed.

| Initiative | Gate condition(s) | Blast-radius | Notes |
|---|---|---|---|
| PRG-31 · Safety & Eval (WS-31) | Machinery live ✅ · released (autonomous, P1-first) · operator spawns shepherd + reviewer | in-radius (API/LLM safety + eval harness; WI-1154 security-critical) | Dedicated shepherd (not folded into mobile). Kickoffs handed over. Reviewer enforces break-test DoD. |
| PRG-33 · Mobile UX & Navigation (WS-33) | Machinery live ✅ · released (autonomous) · shepherd live | in-radius (mobile nav/shell — regression-sensitive across V0-off/V0-on/V1) | Running. Reviewer covers WS-33 only. |
| PRG-34 · Platform Hardening (WS-34) | Attention budget freed from WS-31/33 · **Ramtop file-surface overlap deconflicted** (WI-1183 i18n / WI-1179 Clerk / WI-1069 hooks / WI-1098 parse) · operator go | in-radius, HIGH cross-lane conflict risk (mobile+API+root debt overlapping Ramtop lanes) | **PARKED.** Tier-3 deferrable (rank 6). Lane provisioned; no shepherd/monitors while parked. |

**Standard gates (all must clear):** blast-radius class · pipeline-**proven** · attention budget ·
plus named operator/product gates. Here the binding gate is the **operator release of the On-hold
workstream** — until then the shepherd primes and holds.
