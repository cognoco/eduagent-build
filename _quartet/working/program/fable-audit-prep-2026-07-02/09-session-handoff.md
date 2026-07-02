# 09 — Session Handoff (resume here)

**As of 2026-07-02.** Independent audit of identity-v2 cutover × app-shell-v2, reframed (operator-directed)
into a **convergence effort**: reconcile front (V0/V1/V2 shells) and back (identity-v2) into two supported
configs. Read `08-convergence-spine.md` first — it is the ratified authority.

## Where everything lives (durable)
- **Branch `audit/fable-2026-07-02` on origin** holds the whole bundle (00–09). This is the durable home —
  the shared `main` checkout resets constantly, so do NOT trust local main; `git fetch && git checkout
  audit/fable-2026-07-02`. Bundle is also committed on local main but that's volatile.
- Key docs: `06-fable-audit.md` (findings/risk register/roadmap), `07-strategic-direction.md` (halt/push/
  adjust → "don't halt, impose spine"), `08-convergence-spine.md` (RATIFIED spine).

## What's ratified (08 §6, operator 2026-07-02)
- Target = **two configs on the v2 backend**: Config T (V2 shell, `V0=off/V1=on/V2=on`) + Config F (V1
  fallback, `V0=off/V1=on/V2=off`). Nothing else.
- **V0 retires BEFORE ship** (M5 before M6). **F=V1** kept through launch+stability. **dev → v2-only.**
  **M1 immediate.**
- Principles: preserve-as-tagged-release-not-live-code; two flag arms only; **do NOT split into two apps**
  (86% shared).
- Collapse order: M1 harden-seam (now) · M2a journal-prep→M2b gated env-apply · M3 strip-legacy · M4
  build+prove V1 fallback · M5 retire-V0 (IRREV) · M6 ship. M4 gates M5+M6 (no retire/ship without a
  proven rollback). Flag truth-table = the R9 ratchet.

## Carry-forward findings (from 06)
- **R1 (top risk):** owner-gates on `/account/*`+`/billing/*` trust client-`X-Profile-Id`-derived `isOwner`,
  not server `callerPersonId` — armed IDOR the moment any org gets a 2nd credential. → M1.
- R3 CI tests a phantom schema · R4 dead legacy subtree (prod-500-on-resurrection) · R6 seam has no PR-gated
  test · R8 one-org-one-household is convention not DB-constraint · R9 flag dead-zones.
- **R5 CLOSED:** prd pre-drop PITR marker exists (`pre-subscriptions-drop-20260618`, `ready`, forks prod at
  21:35:17Z pre-0119-drop). Confirmed via `neonctl` project `lingering-violet-30592106`.
- Supporter gap (WI-1170/1171) **shipped to AC** — the canonical plan's "critical publish blocker" is stale.

## Independent review of 08 draft (2026-07-02) — all 6 fixes APPLIED in the ratified version
fallback-unproven (→ M4 gate) · rollback=OTA-not-flag-flip · M2 split reversible/irreversible · flag
truth-table · scope "zero users" to customer-risk-not-infra · draft→ratified authority language.

## State of the world
- **Scoped pause ACTIVE:** WS-18 (cutover) + WS-28 (V2 finalization) shepherds instructed NOT to pull new
  items, until the Phase B reconciliation map is approved. In-progress work finishes; everything outside
  those two workstreams flows; irreversible steps stay gated. The **safety item** (minor-routed synthesis
  leak, one of 5 executing) continues regardless.
- Git: commits used operator-authorized `--no-verify` (WI-1246 blocks all agent commits to shared main).
  Never land the audit bundle on origin/main without operator OK; use the branch.

## NEXT STEP (not started — needs operator go)
**Phase B — reconcile spine ↔ Cosmo.** Pull all ~100 open items (55 Captured / 33 Ready / 5 Executing / 3
Reviewing), classify each against the spine into: on-spine-keep / on-spine-resequence / off-spine-close /
spine-missing-capture / triage. Output = a **read-only mapping table** (the re-baselined pipeline). **No
Cosmo mutations** until operator approves the map. This ends the scoped pause (the map is the "resume, new
sequence" signal).

## Also pending (operator decisions)
1. Zuzka's review of the spine (operator gathering).
2. Promote 08 → `MMT-ADR` + `docs/architecture.md` line (formal-canon durability step).
3. Who executes M1 (seam-hardening, ruled immediate) — a separate dispatch from this planning work.
4. Optional: land the audit bundle on `main` via PR from `audit/fable-2026-07-02` (currently branch-only).
