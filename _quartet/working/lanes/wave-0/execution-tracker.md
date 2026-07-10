# Wave 0 — Unblock & protect · Execution Tracker

> The lane's substance. The shepherd protocol (`../../../roles/shepherd-protocol.md`) carries process
> only and points here for specifics. **Disposable by construction** — a fresh shepherd pointed at
> this tracker loses nothing but warm cache. Holds *delivery state*; points at rules, roster, and
> live per-WI state (Cosmo) — never duplicates them.

## Charter

Deliver the ratified runway's **Wave 0** (RUNWAY.md, roadmap-of-record `docs/plans/2026-07-10-mvp-roadmap/`).
This is a **wave lane, not a workstream lane**: it cuts across WS-18/28/30/38/39/46 — the Cosmo
`Sprint = "Wave 0 — Unblock & protect"` relation is the authoritative membership, workstreams stay
bookkeeping axes. "Done" = every buildable Wave-0 item Closed (or explicitly gate-parked), clearing
the dependency floor for Wave 1's two product verticals.

**Freeze status: LIFTED 2026-07-10 (operator, across all of MentoMate).** This lane is the dedicated
Wave-0 delivery engine.

## Canon authority

- Sequencing: `docs/plans/2026-07-10-mvp-roadmap/RUNWAY.md` (ratified). Scope: `MVP-DEFINITION.md` (same dir).
- Program roadmap: **PGM-1** (Cosmo Programs DB, page `3928bce9-1f7c-8130-ac4c-c422e9db928d`) — gate ledger, rulings. Re-read on resume.
- Cosmo Sprint row (membership SoR): `Wave 0 — Unblock & protect` · `3998bce9-1f7c-8167-9a33-e69d85713641`.
- Engineering rules: repo `AGENTS.md` (claim-before-execute, complete-at-land, review-gate closes).

## How to use

Fresh shepherd: read PGM-1 → this tracker → query the Sprint row for live membership → claim the
highest-leverage unblocked item (`/cosmo:execute claim`) → TDD → land → `/cosmo:execute complete`.
All items are parallel except: WI-1167 → WI-1685 (hard edge), and WI-1469 precedes anything that
writes "verified". The two operator items (WI-1105/1106 counsel-DPO path) are in motion externally —
never claim them; surface blockers on their Cosmo comments.

## Units / slice (11 items · 9 buildable · Sprint row is SoR, this table is warm cache)

| WI | WS | What | Why first | Note |
|---|---|---|---|---|
| WI-1105/1106 | WS-30 | DPO appointment + DPIA signing path | THE launch gate (C-5), pure lead time | OPERATOR — in motion, do not claim |
| WI-1167 | WS-18 | Staging deploy-migration fix | Gates 1685's staging validation (F6) | Executing (pre-lift carry-over) |
| WI-1685 | WS-28 | V2 LLM-routing cutover chain | Platform prerequisite (caching, per-tier routing) | after 1167; rollback = flag flip |
| WI-1438 | WS-46 | Challenge grader bake-off | Gates the verified-learning spine | |
| WI-1469 | WS-46 | Mastery-axis rule | Everything "verified" waits on the definition | precedes 1445/1464/1754 |
| WI-1666 | WS-46 | Loop e2e/eval pack scaffold | Ruled "early, before visible rollout" | |
| WI-1755 | WS-38 | Language-mode safety/eval guard | Before any visible Four Strands rollout | eval-snapshot gated |
| WI-1447 | WS-38 | STT/TTS locale fix | Blocks speaking bundle WI-1777; breaks promise while open | |
| WI-1500 | WS-39 | Launch-health alerts (6 signals) | Observability before feature waves | Sentry (1336) already done |
| WI-1659 | WS-30 | AI-Act compliance plan / self-assessment | IN unconditionally; pairs with counsel answer | |

## Wave exit

All buildable items Closed → PM verifies against the Sprint row → operator/PM opens Wave 1
(29 items, Sprint `Wave 1 — Product verticals`). Degrade lines and the cross-vertical yield
(language yields to verified-learning) live in RUNWAY.md §pressure-valves.

## Log

- 2026-07-10 — Lane stood up at freeze lift (operator ruling: freeze lifted across all MentoMate;
  delivery model = one dedicated wave lane). Waves recorded as Cosmo Sprint rows (0: 11 · 1: 29 · 2: 27 · 3: 11).
