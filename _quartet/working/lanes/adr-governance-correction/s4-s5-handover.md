# S4/S5 Visibility-Contract Hand-over — relay message for the V2-shell / visibility-contract orchestrator

> Persisted 2026-06-15 from the ADR-governance activity (WI-752, reverse-sweep step #5). Relay the message below **verbatim** to the orchestrator who owns the Mentor V2 S4/S5 phases. Tracks **WI-782**.

---

**For the V2-shell / visibility-contract orchestrator (owner of the Mentor V2 S4/S5 phases) — a captured finding to fold into your plan**

A new Work Item, **WI-782**, is captured but **left unassigned** — yours to triage and slot. URL: `https://app.notion.com/p/3808bce91f7c8126b9e0cc3c511b530b`

*"Rework S4/S5 visibility-contract: cross-user moment visibility must be read-time relationship-derived, not a stored ledger visibility column (MMT-ADR-0022)"*

**What it is.** The re-vet of MMT-ADR-0022 (activity ledger) ruled it **derive-on-read**: `mentor_activity_ledger` is thin seen-state with **no per-row visibility flag**; cross-user (supporter/guardian) moment sharing must be a **read-time, relationship-derived policy, never a stored column**; new moment kinds are read-time projections, not materialized writers. The unbuilt S4/S5 plans currently do the opposite — 5 hard contradictions: S4:186 (`visibility='supporter'` row), S4:243 (Kickstart chip as a stored moment), S5:30 (ledger carries supporter shared-records via `visibility`), S5:191 (`support_link_ended` materialized kind), S5:195 (`graduation` materialized kind + `templateKey`).

**Why it matters now.** ADR-0022 explicitly names "the visibility-contract work" (i.e. S4/S5) as the owner of cross-user moment sharing — so this *is* your feature, planned the prohibited way. It's coupled to the 0022 convergence: **WI-766 removes the `visibility`/`template_key` columns** these plans write to, and WI-767 converges the ledger to derive-on-read — so building S4/S5 as written would break against WI-766 or deepen the dead weight.

**Corrective guidance.** Before building, derive supporter/guardian moment visibility (and the graduation / support-link-ended moments) from the relationship edge + operational state at **read time** — no stored `visibility` column, no new materialized kinds — sequenced with WI-766/767.

**Heads-up.** A ⚠ banner pointing at MMT-ADR-0022 is now on the S4 + S5 plan headers (committed `5e37f2e91`), so it's visible when you open the file to build. WI-782 is unassigned — yours to slot.
