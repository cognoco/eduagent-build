# PRG-17 · new-llm Integration (LLM) — execution tracker

**Status:** ACTIVATED 2026-06-12 (operator ruling: strategy O2 approved — merge new-llm
first, gated by the 12-item reconciliation checklist + final rescan)
**Owner:** Jorn (+ LLM shepherd session; program session orchestrates)
**Source of truth for findings:** `_wip/umbrella-program/supporting-artefacts/new-llm-integration-analysis.md`
(v1.4 @ `450e4c522` — §3 collision matrix C1–C12, §6 checklist, §7 lockstep, §8 rescan)
**Executive summary (stakeholder-facing):** `_wip/umbrella-program/supporting-artefacts/new-llm-integration-exec-summary.md`

## §1 Charter

Reconcile the `origin/new-llm` branch (FINAL feature SHA `6a81f7663`, 268 files,
±20k lines: V2-shell S0 "Now feed" + ~25-module audit-fix batch, all live-on-merge)
so it can merge to `main` BEFORE the IF cutover executes. The strategy ruling
(2026-06-12) and its rationale live in the analysis §6. This workstream executes
checklist items 1–7, 9–12 **on the branch**; item 8 (account-detachment canon
intake) is routed to the IF ratification path, not this workstream.

**The merge gate (program-session-owned, not WPs):**
1. All WPs below closed → **§8 final rescan** of the exact reconciled SHA +
   main-drift delta, including the Inngest cross-file semantic check (main moved
   `inngest/client.ts` + `helpers.ts` vs the branch's six rewritten functions —
   drift already triggered). Program session runs this as a workflow.
2. Operator merge approval (against the WP-7 behavior-change inventory).
3. Merge to main with the WP-6 content-level verification recorded on the merge PR.
4. Merge lands → boundary event "new-llm merged" → unlocks IF cutover execution
   (CUT-A generates against the post-merge journal).

**Working mode for the shepherd (amended 2026-06-12 — standard PR loop, base `new-llm`):**
- Isolated worktree per unit at `.worktrees/<branch>` **branched off `new-llm`**
  (e.g. `git worktree add .worktrees/WI-675 -b WI-675 origin/new-llm`, then
  `pnpm install` + `pnpm env:sync` per the worktree-setup skill). NEVER
  `git checkout`/`switch`/`stash` in the shared root checkout.
- **One PR per unit, base = `new-llm`** (operator-sanctioned 2026-06-12) — the
  standard Cosmo loop applies unchanged: PR is the WI's review evidence, CI runs
  on it (`ci.yml` `pull_request` has no base filter; verified), the autonomous
  review loop closes via `/cosmo:review`. Docs-only units (WI-678) skip CI via
  `paths-ignore` — review is the gate there. WI-682 (provisioning) has no PR;
  its evidence is the probe output recorded on the WI.
- Pre-existing red on the base branch is a **finding to record, not noise to
  fix-around** (the known one — the RLS guard — IS WI-676's subject).
- Zuzka's lane is halted; the branch is ours until merge. She retains a courtesy
  review slot on the final new-llm → main merge PR, which stays operator-gated
  and program-owned — the per-unit PRs against `new-llm` are NOT that gate.
- Migration numbers: next-free at landing, never pre-assigned (lockstep rule 2).

## §2 Unit map (Cosmo slice)

Order = recommended execution order; WP-1/WP-2 are the two Highs and gate everything.

Cosmo Workstream **"new-llm Integration & Reconciliation"**
(`37d8bce9-1f7c-8145-80ef-cec4b55dcba4`), sliced 2026-06-12:

| Order | Unit | Checklist | Severity | Shape |
|---|---|---|---|---|
| 1 | `WI-675` WP deploy-gate code fix | item 4 (C5) | **High** | code + test + CI |
| 2 | `WI-676` WP RLS for `mentor_activity_ledger` | item 12 | **High** | migration + test |
| 3 | `WI-677` WP guard/baseline reconciliation | items 1, 2 (C1, C7) | Med | file regeneration |
| 4 | `WI-678` WP ADR surgery + V2-plan re-key | items 3, 11 (C6) | Med | docs |
| 5 | `WI-679` WP GDPR export + OTA version bump | items 9, 10 | Med→High | code + config |
| 6 | `WI-680` WP merge-verification CI invariant | item 5 (C9) | Med | script + PR check |
| 7 | `WI-681` Task behavior-change inventory | item 7 | — | generated artifact |
| 8 | `WI-682` Task Doppler/Cloudflare provisioning | item 6 (= WI-664 fix) | P1 infra | secrets/KV |

Routed elsewhere: **item 8** (C10 account-detachment ruling) → IF ratification path,
carried in the planner hand-off (`_wip/identity-foundation/cutover-plan-delta-newllm.md`).

## §3 Slice-time notes

- The branch's `0111_zippy_gateway` SQL + snapshot are **hand-curated**, not clean
  `generate` output (unshipped concepts DDL hand-trimmed). Any new migration in
  WP-2 must be generated cleanly and diffed against the hand-doctored snapshot
  with eyes open; CUT-A's generate-preflight downstream depends on this state
  being understood.
- WP-2 must also answer WHY the branch's own CI never tripped the
  `rls-coverage.test.ts` [ASSUMP-F14] guard (suspected change-class routing
  skipping database-package tests on the branch). If real, that routing hole is
  its own finding — capture it, don't fix it here.
- WP-3's i18n baseline resolves by **intersection of both sides' entries + checker
  re-run** — NOT main-wins (the branch legitimately burned entries main still
  grandfathers, and main's WI-621 burn-down must survive: 361 → 12).
- WP-6's both-sides-changed set is **computed at merge time, never from a static
  list** (a static list went stale within hours during the analysis).

## §4 Log

- **2026-06-12** — Activated (fifth run of the §2.1 recipe). Strategy O2 ruled by
  operator; tracker + Cosmo workstream + 8-unit slice created; exec summary for
  Zuzka written; planner hand-off (cutover-plan delta) issued the same day.
- **2026-06-12** — Dedicated review watcher armed separately from the general
  multi-workstream watcher because this workstream has two scoped review-policy
  differences: PR landing evidence is against `new-llm`, and missing Work
  Package child/sub-item formality is an approved Cosmo dogfooding override.
  Watcher log: `/tmp/cosmo-watch-new-llm/logs/new-llm-reviewing-watcher.log`;
  review outputs: `/tmp/cosmo-watch-new-llm/reviews/`.
