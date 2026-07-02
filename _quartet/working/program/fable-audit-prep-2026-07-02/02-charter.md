# 02 — Fable Audit Charter

Six questions. Each has an evidence pack in `evidence/`. **Fable is not confined to these packs
or to prep's conclusions** — the packs point Fable at the terrain with fresh primary evidence;
Fable follows its own leads wherever they fall and revises these questions if reality differs.

## Required Charter

**Q1 — Cutover completeness.** Do any production code paths still read or write legacy
identity/billing tables? Verify via Drizzle table references, imports, raw SQL, route/service
paths, and tests — not English-text grep alone.
→ `evidence/Q1-cutover-completeness.md`
*Recon note:* this is LIVE and high-stakes — WI-1255 (Closed) was a real prod 500 + GDPR-deletion
gap from a v1-pinned path hitting dropped tables; WI-1239/WI-1254 (open) are the still-running
reader-convergence sweep.

**Q2 — Schema/DB convergence.** Do dev, staging, prod, CI schemas match the intended v2-only
target? Enumerate divergences per environment.
→ `evidence/Q2-schema-db-convergence.md`
*Recon note:* prep already found three envs at three cutover stages (prd > stg > dev). Prod is
cleanest (legacy `subscriptions` dropped, v2 parents empty); stg keeps an orphaned
`subscriptions` (42 rows, 0 FK); dev retains full legacy schema + legacy FK wiring with data.
CI-lane fidelity is the open sub-question.

**Q3 — Migration integrity.** Are all applied schema changes journaled and reproducible via
`drizzle-kit migrate`, or do out-of-journal/manual applications create drift? Consequences?
→ `evidence/Q3-migration-integrity.md`
*Recon note:* the terminal cutover SQL (M-REPOINT 0117 / M-DROP 0118 / M-SUBSCRIPTIONS-DROP
0119) is INTENTIONALLY de-journaled in `apps/api/drizzle/_freeze-only/`, guard-enforced,
operator-applied per-env. So `drizzle-kit migrate` alone does not reproduce prod/stg schema, and
envs sit at different stages. The question is the *consequence* of that reproducibility gap.

**Q4 — identity-v2 ↔ app-shell-v2 seam (OPERATOR PRIORITY).** Where does one system assume a
shape/role/flag/state the other does not provide? What integration gaps would unit tests inside
either system miss? Both directions: shell assumptions identity-v2 may not satisfy; identity-v2
outputs the shell may not consume.
→ `evidence/Q4-identity-app-shell-seam.md`
*Recon note:* operator states the two were built separately and "not built to fit directly." The
materialized seam bugs (WI-1255 deletion, WI-1161 export-500, WI-1138 consent GDPR leak) show
the seam is fragile in practice.

## Timeboxed Charter

**Q5 — AC / canon / shipped-reality coherence.** Are work-item ACs aligned with ratified specs
and actual shipped behavior, or are there systemic drift signs?
→ `evidence/Q5-ac-canon-shipped-coherence.md`

**Q6 — Process/state integrity.** Does Cosmo state match reality for WS-18 / WS-28?
→ `evidence/Q6-process-state-integrity.md`
*Recon note:* prep found every DB divergence is already a tracked, open Cosmo item (managed
backlog, not silent corruption) — but the workstreams are NOT closed (WS-18: 10 open; WS-28: 5
open).

## Synthesized decision (Fable produces; not a discovery question)

From the Required Charter + timeboxed findings, Fable recommends:

1. **identity-cutover completion:** go / no-go / conditional go — with explicit conditions,
   owners, verification.
2. **V2 product:** ship / hold / conditional ship — same.

Do not treat "V2 publish-readiness" as a separate broad discovery question; it is the synthesis.

## What prep did NOT adjudicate (handed to Fable open)
- Whether WI-1170/1171 (supporter gaps) shipped to the canonical plan's done-conditions or were
  closed against weaker criteria (Q5-F4 / Q5-F1 tension) — **the pivotal ship-decision question.**
- ~~Whether CI builds its test DB from journal or branch/dump~~ — **RESOLVED (Q3-F6):** journal-built
  → matches no deployed env; now a decision (waive/block), not a discovery gap.
- Whether a prd pre-drop Neon PITR marker was taken before 0119 (rollback window).
- What gates the *full* WI-1128 FK-repoint promotion (deploy-unblock slice landed `56b9ded15`; freeze-only 0117/0118/0119 still out-of-journal).
