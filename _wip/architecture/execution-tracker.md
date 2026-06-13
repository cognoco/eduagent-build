# PRG-11 · Architecture Clean-Out — execution tracker

> **THE entry point for this workstream.** Shepherd-owned once spawned.
> Umbrella row: `_wip/umbrella-program/program-roster.md` PRG-11. Charter:
> `_wip/umbrella-program/activation-planning.md` §2 PRG-11. Per-finding text:
> `docs/audit/2026-05-29-full-audit/L-gap-delta.md` (label `architecture`).
> Moot scan: `_wip/umbrella-program/supporting-artefacts/prg-11-moot-scan.md`.

**Activated:** 2026-06-13 (seventh run of the §2.1 recipe) · **Operator:** Jorn ·
**Shepherd:** PRG-11 shepherd session (running) ·
**Cosmo Workstream:** "Architecture Clean-Out" (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`)

## 1. Charter (one paragraph)

All ~24 LIVE code-structural + correctness findings from the 2026-05-29 full audit
(`Defer-to-workstream=architecture`) remediated: circular dependencies, god-modules /
oversized files, domain-organisation, architecture-class test-coverage gaps, mobile-nav
copy-paste, data-access seams, three correctness races (F-169/170/171 merged in from the
§1 normalization), and `architecture.md` doc-rot. The moot-by-refactor scan (2026-06-11,
vs IF W0–W4) found **3 mooted** (F-029/F-010/F-153), **1 partial** (F-103), **23 LIVE +
INV-2** sweep, and 2 deferred-excluded (F-008/F-100, bucket-4 — not in scope). Supervision
profile (charter) = **human-led**: this is the one lane where the slice is *not* pure
transcription — god-module / circular-dep / seam-extraction decomposition boundaries
require operator sign-off; agents execute within approved decomposition plans.

## 2. Unit map — three tiers

The cutover-coordination scan (§3) crossed **two axes** — *parallel-safe vs the live IF
cutover* and *mechanically-bounded vs needs-architectural-judgment* — yielding three tiers.
**Only Tier 1 is in Cosmo today**; Tiers 2 and 3 are deferred to the operator decomposition
gate and are recorded here so the lane scope is not lost and the lane does not graduate early.

### Tier 1 — AUTONOMOUS-NOW (in Cosmo · the shepherd's whole mandate today)

Parallel-safe **and** mechanically-bounded (red-green testable, no decomposition decision).
The shepherd executes these autonomously on spawn.

| Unit | Name | Alt | Findings | Pri | Order | Model note |
|---|---|---|---|---|---|---|
| **WI-717** | WP-arch-correctness-races — SM-2 + celebration lost-updates | WP | F-169 · F-170 · F-171 | P1 | 1 | **Opus plan-phase** (subtle concurrency/atomicity); Sonnet implements |
| **WI-718** | WP-arch-test-coverage — three missing regression tests | WP | F-097 · F-098 · F-099 | P2 | 2 | Sonnet. F-097 evidence is **B1-stale → re-grep** `orchestrate-round.ts` first |
| **WI-719** | IT-arch-gc1-multiline-guard — fix the GC1 multiline-mock blind spot | Item | F-156 | P2 | 3 | Sonnet |
| **WI-720** | WP-arch-mock-burndown — GC6 internal-mock sweep | WP | INV-2 | P3 | 4 | Sonnet; **exclude cutover-surface test files** (see desc) |

All four are independent — no `Blocked-by` edges, parallel-safe with the live cutover.

### Tier 2 — PARALLEL-SAFE but HUMAN-GATED (NOT in Cosmo — operator decomposition gate)

Parallel-safe vs the cutover (can run alongside it) **but** each carries an architectural
decision (where to cut a cycle, which adapter wins, the nav-gating abstraction). Sliced into
WPs at the operator decomposition session, **then** executed (not cutover-blocked).

| Finding | Theme | Decomposition decision |
|---|---|---|
| F-011 | circular-deps | `curriculum.ts` ⇄ `language-curriculum.ts` — which edge to cut / extract a shared module |
| F-030 | circular-deps | `exchanges.ts` ⇄ `exchange-prompts.ts` type/runtime cycle break |
| F-103 | god-modules (partial) | wire `challenge-round/persistence.ts` into the main flow, retire the private copy in `session-exchange.ts` |
| F-104 | domain-org | promote `dispatchSessionCompletedEvent` from `routes/sessions.ts` to the service layer |
| F-105 | domain-org | unify the drifted retry-filing cap across `routes/sessions.ts` + `routes/filing.ts` (live bug; bounded part + dedup decision) |
| F-108 | mobile-nav | dedup V0/V1 entry-gating across 8 screens into `canEnter()` — nav-contract-sensitive |
| F-109 | mobile-nav | eliminate the `showParentHome` magic-prop home routing |
| F-112 | data-access | `createScopedRepository` vs parent-chain adapters — revisits a CLAUDE.md rule |

### Tier 3 — CUTOVER-SERIALIZED (NOT in Cosmo — Blocked behind the cutover tail)

The finding's file(s) are actively rewritten by the in-flight CUT-B2/B3 or the pending
WI-586 re-point/grep-clean; fixing now collides. Most also need decomposition judgment.
Sliced **post-flip**, with a fresh re-scan (the cutover may shift line numbers / reshape
modules). Block on the relevant CUT-B unit or **WI-586**.

| Finding | Theme | Cutover blocker (scan §3) |
|---|---|---|
| F-007 | god-modules | `session-crud.ts` + `learner-profile.ts` in WI-586 grep-clean re-point scope |
| F-014 | god-modules | `test-seed.ts` — B2/B3 append domain seeding, WI-586 deletes legacy |
| F-031 | god-modules | `consent.ts` is an active B2 rewrite target |
| F-009 | domain-org | `billing/metering.ts` is an active B3 rewrite target |
| F-111 | domain-org | `safeRefundQuota` lives in `billing/metering.ts` (B3) |
| F-034 | layer-inversion | `family-access.ts` is in B2's active scope |
| F-106 | data-access | `monthly-report-cron.ts` re-targeted in B2 |
| F-107 | data-access | `session-completed.ts` in WI-586 re-point scope |
| F-012 | doc-rot | WI-586 step 9 rewrites `docs/architecture.md` |

## 3. Slice-time decisions (activation, 2026-06-13)

1. **Moot scan (2026-06-11) adopted** — 3 mooted (F-029/F-010/F-153), 1 partial (F-103),
   23 LIVE + INV-2; F-008/F-100 excluded (bucket-4). Net active ~24 + INV-2.
2. **Cutover-coordination scan (sub-agent, 2026-06-13) — 16 PARALLEL-SAFE / 9 SERIALIZE /
   0 MOOT-RISK.** B1 (WI-691) landed; B2 (WI-692) + B3 (WI-693) executing; WI-586 pending.
   No MOOT-RISK: the cutover adds inert v2 twins, it does not rewrite the legacy logic where
   these defects live — the defects survive the flip unchanged. SERIALIZE set + evidence in
   the scan result (in the activation thread; reproduce via the cutover plan Appendix B +
   §2.5/§3/§4-step-9).
3. **Two-axis tiering (§2).** parallel-safe ∩ mechanically-bounded = Tier 1 (autonomous).
   parallel-safe ∩ needs-judgment = Tier 2 (human gate, not cutover-blocked).
   serialize = Tier 3 (cutover-blocked, mostly also needs judgment).
4. **Only Tier 1 sliced into Cosmo** (WI-717–720). Tiers 2/3 are operator-gated and
   recorded here, not as WIs — so an unsupervised shepherd cannot wander into a decomposition
   decision or a cutover collision. They are sliced when the operator runs the decomposition
   session (Tier 2 any time; Tier 3 post-flip + re-scan).
5. **B1-stale evidence (executor re-grep before plan):** F-097 (`orchestrate-round.ts` — PR
   875 drift) for WI-718. Tier-3 F-106/F-107 (`session-completed.ts`) also flagged but those
   are deferred anyway.

## 4. How to run it (process lives in the protocols — this section is lane-specific only)

Read the standard scaffolds; don't re-derive process here:
- `_wip/identity-foundation/shepherd-protocol.md` — the shepherd scaffold: your job, the
  three-role split (the **reviewer is a SEPARATE session** — you self-monitor Cosmo for
  verdicts; **DoD = Cosmo Close, not a green PR**), dispatch + model/effort defaults.
- `_wip/identity-foundation/executor-protocol.md` (+ `-example`) — the scaffold your
  executors follow and the thin pointer-brief shape.

Lane-specific (THIS lane differs from the mechanical lanes — read carefully):

- **SCOPE — Tier 1 ONLY.** Your entire mandate today is **WI-717, WI-718, WI-719, WI-720**
  (§2). Drive those four to Cosmo Close via the normal loop. Do **NOT** touch Tiers 2/3 —
  they are not in Cosmo by design; they await the operator decomposition gate. When all four
  Tier-1 units are Closed, **do not declare the lane graduated** — post a checkpoint, report
  "Tier 1 complete; Tiers 2/3 await the operator decomposition session", and stand by.
- **Reviewer coverage:** the separate reviewer (Codex) session covers Workstream
  "Architecture Clean-Out" (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`) — confirm on arrival; do
  not wire/own the watcher.
- **Supervision (Tier 1 is agent-routine):** the deferred human-led decomposition is Tiers
  2/3, which you are NOT executing. Within Tier 1, WI-717 (concurrency) warrants care:
  red-green concurrency break tests are mandatory; HIGH-correctness fixes need the negative
  path proven (write test → pass → revert fix → fail → restore).
- **Model/effort (default Sonnet per the protocol):** run **WI-717** with an **Opus
  plan-phase** (subtle SELECT-FOR-UPDATE / read-lock ordering), Sonnet implements; WI-718 /
  WI-719 / WI-720 stay Sonnet end-to-end.
- **WI-720 scope fence:** the GC6 sweep must **exclude** any test file whose module-under-test
  is in the live cutover surface (identity / consent / family-access / billing / metering /
  auth / session-exchange / sessions / stripe-webhook / revenuecat-webhook) — those collide
  with CUT-B2/B3; defer to post-flip. Per-file judgment at execution.
- **Landing checks:** PR base `main`; re-grep each finding fresh at plan time (F-097 evidence
  is B1-stale). If a NEW ambient red appears on `main`, capture it as a WI — don't fix inline.

## 5. Execution state

- 2026-06-13 — **Activated** (program session). Workstream "Architecture Clean-Out"
  (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`) created; **Tier 1 sliced** — WI-717…720
  (`Stage=Backlog`, order 1–4). Cutover-coordination scan done (§3): 16 parallel-safe / 9
  serialize / 0 moot-risk. Tiers 2/3 deferred to the operator decomposition gate (recorded
  §2, not in Cosmo). Roster + dashboard promoted. Shepherd spawned + running (normal
  activation; the trigger-priming experiment was dropped for this lane).
- 2026-06-13 — **Tier 1 COMPLETE.** All four units **Closed / Resolution=Done** by the
  separate reviewer (no rework rounds). WIs sliced WP→demoted to Item (single-PR units;
  `/cosmo:bundle` unavailable), refined to Ready (Execution Path=Assisted), dispatched to
  one executor each (WI-717 Opus plan-phase for the concurrency reasoning; rest Sonnet),
  merged to `main` (squash) and finalized via `/cosmo:execute complete`. Landed commits:
  WI-717 `d99562583` (F-169/170/171 lost-update races; CodeRabbit also caught + fixed a
  TOCTOU in the fix), WI-718 `f70c02164` (F-098 regression test; F-097/F-099 pre-existed),
  WI-719 `15f388414` (F-156 GC1 multiline-mock guard), WI-720 `620cca77b` (INV-2 GC6
  burndown, cutover-surface fence honored). Claude Code Review APPROVED 0/0 on all four
  (after a mid-run breakage from PR #1121's WI-698 workflow-hardening was reverted on main
  and each PR's `claude-code-review.yml` re-synced). **Tiers 2/3 still await the operator
  decomposition gate — lane NOT graduated.**
