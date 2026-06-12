# Cutover-plan delta: new-llm strategy ruling → v1.6 inputs

**Date:** 2026-06-12 · **From:** program session · **To:** the cutover planning session
**Status:** strategy RULED by operator 2026-06-12 — fold into the plan as **v1.6**
**Source analysis:** `_wip/umbrella-program/supporting-artefacts/new-llm-integration-analysis.md`
(v1.4 @ `450e4c522`; §3 collision matrix, §6 strategy + checklist, §7 lockstep)

## The ruling (context you plan around)

**O2 — the `new-llm` branch merges to `main` BEFORE cutover execution.** The branch
(V2-shell S0 "Now feed" + ~25-module audit-fix batch, final feature SHA `6a81f7663`)
is being reconciled through the umbrella program (PRG-17, Cosmo `WI-675…682`) and
then merged. **Cutover planning and ratification proceed in parallel now; cutover
EXECUTION (CUT-A onward) starts only after the merge lands** — CUT-A's `generate`
must run against the post-merge journal. You already absorbed the two
strategy-invariant items in v1.5 (role-named migrations, generate-preflight);
this delta is everything else the ruling adds. Same profile as before: plan only —
no code, no migrations, no Cosmo writes. Deliverable: **v1.6 of
`2026-06-11-cutover-plan.md`** with a revision note in the established style.

## D1 — `mentor_activity_ledger`: one new legacy-FK dependent (C3)

From merge day, main has table `mentor_activity_ledger` (branch migration
`0111_zippy_gateway`): profile-scoped, `profile_id` FK → **legacy `profiles(id)`
ON DELETE CASCADE**, written by `apps/api/src/services/activity-ledger.ts` /
`services/now-feed.ts` / `routes/now.ts`.

- **DB side — confirm absorption, name the table.** Your M-REPOINT derives from
  live `pg_constraint`, so the FK is picked up automatically; the v1.2 "56
  re-points" snapshot becomes 57 post-merge. The plan already declares
  `pg_constraint` authoritative — add `mentor_activity_ledger` to the named
  examples so nobody reads the count drift as an error. The table is
  **re-pointed, not drop-listed**.
- **Code side — extend the CUT-B reader inventory.** `activity-ledger.ts`'s
  legacy `profiles` import, its relations, tests, and the scoped-repo accessor
  belong to CUT-B/grep-clean ownership (the analysis's C3 ownership split:
  M-REPOINT owns the FK only; CUT-B owns the code side).
- **No double-migration risk to plan around:** the V2 S4 plan's
  independently-scheduled second repoint migration is being **dropped on the
  branch** pre-merge (PRG-17 `WI-678`), per the same ownership split.

## D2 — CUT-B2 deletion twin: carry the new GDPR erase leg (C4)

The branch's `deletion.ts` gains a NEW legacy read: `accounts.email` RETURNING →
`byok_waitlist` erase (GDPR Art-17). CUT-B2's deletion-twin spec must carry this
leg explicitly or the GDPR fix silently drops at cutover.

## D3 — CUT-B2 export twin: enumerate the ledger (Art-15)

`services/export.ts` is being extended **pre-merge** (PRG-17 `WI-679`) to include
`mentor_activity_ledger` (erasure was covered by the FK cascade; access/
portability was not). The export-twin spec must mirror that inclusion so the
twin doesn't regress it.

## D4 — RLS landscape: one more profile-scoped table, handled upstream

The ledger ships RLS-enabled pre-merge (PRG-17 `WI-676`: ENABLE + isolation
policy + coverage-manifest registration). No new work for the plan beyond
awareness: your §1.2a consent_request RLS design is unaffected, and the
coverage manifest you register against will already contain the ledger entry.

## D5 — Canon intake of the account-detachment ruling (C10) rides YOUR ratification

The branch carries `2026-06-09-account-detachment-decision-capture.md` (a ratified
identity ruling, "pending canon amendment") — deliberately NOT landed via the
merge. Per the lockstep protocol, identity rulings enter canon through the IF
ratification path: include it in the v1.6 ratification package (canon edit
named, lockstep with its decision record) or flag it as an explicit
ratification-time item for the operator.

## D6 — Merge-freeze enforcement joins the runbook (lockstep rule 4)

The cross-lane agreement: from convergence step 1 through **M-DROP completion**
(the soak interval included), no merges to main from ANY lane — enforced by a
**committed freeze-marker file + a required CI check that fails while the marker
exists**; the convergence shepherd is the named detector and lifts the marker.
If v1.5's freeze section covers only the runtime freeze (write gate / Inngest
drain), add this repo-level merge freeze as its sibling mechanism in the §4
runbook with the same activation/lift points.

## D7 — Citation refresh at ratification (mechanical)

The plan's file:line citations were verified against pre-merge main. At
ratification (post-merge), a mechanical refresh pass confirms them against
post-merge main — expect only line drift in the ~25 audit-fix modules and the
six rewritten Inngest functions. No design impact anticipated; flag anything
that moved semantically.

## Not yours

The 12-item reconciliation work itself (deploy gate, baselines, ADR renumbering,
OTA bump, behavior inventory, provisioning) executes on the branch under PRG-17
— none of it lands in the cutover plan beyond the items above.
