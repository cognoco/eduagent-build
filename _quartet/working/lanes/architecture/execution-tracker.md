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

### Tier 2 — PARALLEL-SAFE, HUMAN-GATED (decomposition gate RUN 2026-06-13 → sliced to Cosmo)

Each carried an architectural decision (where to cut a cycle, which adapter wins, the
nav-gating abstraction). The operator decomposition session ran **2026-06-13**: 5 read-only
investigators re-verified each finding against today's code and framed its cut; the operator
approved; **6 are now sliced into the "Architecture Clean-Out" workstream** (WI-724…729 —
the fresh Tier-2 shepherd's mandate). Two findings left the wave: **F-103 deferred**
(cutover collision), **F-112 closed won't-fix** (no violators).

| Finding | Theme | Cosmo | Approved cut |
|---|---|---|---|
| F-011 | circular-deps | **WI-724** | extract `ensureDefaultBook` → new `curriculum-core.ts` (break the runtime cycle one-way) |
| F-030 | circular-deps | **WI-725** | extract `ExchangeContext` → `exchange-types.ts` (type-only cycle; land promptly vs the 586 re-point) |
| F-104 | domain-org | **WI-726** | move `dispatchSessionCompletedEvent` → `services/session/session-filing-dispatch.ts` (G1/G5) |
| F-105 | domain-org | **WI-727** | `filing.ts` imports `FILING_CONFIG.maxRetries`, drops the hardcoded `3` (live drift bug) |
| F-108 | mobile-nav | **WI-728** | extract `useEntryGate()` hook over 7 screens (+ Sentry breadcrumb); mandatory flag-matrix regress test |
| F-109 | mobile-nav | **WI-729** | remove the dead `showParentHome` prop+branch (home routing already migrated to `home.tsx`) |
| F-103 | god-modules | **DEFERRED** | touches `session-exchange.ts` (active cutover surface; Tier-3 F-106/107 live there) → joins the post-586 wave |
| F-112 | data-access | **CLOSED wont-fix** | no violators; AGENTS.md already sanctions the scoped-repo/parent-chain split (audit itself: "deliberate and working") |

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
  verdicts; **two mandatory gates — a green PR to *merge*, then Cosmo Close to *graduate***;
  see shepherd-protocol.md → *Merging the WP*), dispatch + model/effort defaults.
- `_wip/identity-foundation/executor-protocol.md` (+ `-example`) — the scaffold your
  executors follow and the thin pointer-brief shape.

Lane-specific — **CURRENT WAVE = TIER 2** (Tier 1 done; read carefully):

- **SCOPE — Tier 2.** Your mandate is **WI-724, WI-725, WI-726, WI-727, WI-728, WI-729**
  (§2 Tier-2 table — F-011/030/104/105/108/109). Each WI carries its **operator-approved cut**
  in its Acceptance Criteria + Description — execute WITHIN that cut; do **not** re-open the
  architectural decision. Drive all six to Cosmo Close via the normal loop. Tier 1 is **DONE**;
  **F-103 is DEFERRED** (not yours — post-586 wave); **F-112 is CLOSED won't-fix**; **Tier 3**
  stays parked (post-flip + re-scan). When all six are Closed, post a checkpoint and **stand
  by — do NOT declare the lane graduated** (Tier 3 remains).
- **Green-PR merge gate — non-negotiable (corrected protocol).** Merge each PR ONLY when green
  by the strict definition in `shepherd-protocol.md` → *Merging the WP*: every required check
  `SUCCESS`, **`claude-review` actually green** (silence ≠ approval — diagnose a red review,
  incl. a broken *workflow*, before merging; not just "tokens"), no valid
  blocker/must-fix/should-fix, `mergeStateStatus` `CLEAN`. **NEVER call a red PR "green".**
  (The Tier-1 run merged PRs while `claude-review` was red — do not repeat it.)
- **Reviewer coverage:** the separate reviewer (Codex) covers Workstream "Architecture
  Clean-Out" (`37e8bce9-1f7c-81fe-be97-e063ce8f17e8`) — confirm on arrival; don't wire/own it.
- **Care items (most are S/M mechanical — the decision is already made):**
  - **WI-728 (F-108) is nav-contract-sensitive:** the `useEntryGate()` refactor must NOT
    regress any shipped flag state (flags-off / V0-on / V1-on) × proxy/non-proxy — a
    flag-matrix regress test for ≥1 learning route is mandatory; no internal `jest.mock`
    (GC1/GC6) — use the `__fixtures__/navigation-matrix` fixture pattern.
  - **WI-725 / WI-726 / WI-727 touch cutover-adjacent files** (`exchanges.ts` / `sessions.ts`
    / `filing.ts`): parallel-safe, but coordinate PR timing — land promptly; if a WI-586
    re-point touches the same file first, rebase rather than fight it.
- **Model/effort:** **Sonnet end-to-end** for all six — bounded refactors, architectural
  decision pre-made; no Opus plan-phase needed.
- **Landing checks:** PR base `main`; **re-grep each finding fresh at plan time** — the cuts
  cite specific `file:line`s from the 2026-06-13 investigation that may have drifted. If a NEW
  ambient red appears on `main`, capture it as a WI — don't fix inline.

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
- 2026-06-13 — **Tier 2 ACTIVATED** (operator decomposition gate run). 5 read-only
  investigators re-verified the 8 Tier-2 findings against today's code; operator approved the
  cuts. **6 sliced** to the workstream — **WI-724…729** (`Stage=Backlog`, each carrying its
  approved cut as AC): F-011→724, F-030→725, F-104→726, F-105→727, F-108→728, F-109→729.
  **F-103 deferred** to the post-586 wave (edits `session-exchange.ts`, the active cutover
  surface — Tier-3 collision). **F-112 closed won't-fix** (no violators; AGENTS.md already
  sanctions the scoped-repo / parent-chain split — audit itself: "deliberate and working").
  Fresh Tier-2 shepherd to be spawned under the **corrected** shepherd-protocol (green-PR
  -before-merge gate restored 2026-06-13). Tier 3 unchanged (post-flip + re-scan).
- 2026-06-14 — **Tier 2 COMPLETE.** All six units **Closed / Resolution=Done** by the
  separate reviewer. Refined Backlog→Ready (Execution Path Auto→**Assisted** to prevent an
  unsupervised Archon pickup racing the in-Harness executors; WI-727's AC amended for the
  Bug DoR — explicit root cause + single-variant + regression test, within the operator
  min-fix). One Sonnet executor each; merged to `main` (squash) + finalized via
  `/cosmo:execute complete` (Fixed In authored from the landed squash commit via
  detached-HEAD). Landed commits: WI-724 `f24f33d0d` (F-011 `ensureDefaultBook` →
  `curriculum-core.ts`), WI-725 `f48b76909` (F-030 `ExchangeContext` → `exchange-types.ts`),
  WI-726 `be9eb335f` (F-104 dispatch fn → service layer), WI-727 `ab70b7e3f` (F-105 retry-cap
  → `FILING_CONFIG`), WI-729 `fed929522` (F-109 dead `showParentHome` removal), WI-728
  `d5adf68bb` (F-108 `useEntryGate` hook) + rework `9d5ad0e4c`. Two notable events:
  (1) a host **reboot** killed all six executors + the verdict monitor mid-flight (after
  claim+worktree, before any commit) — recovered in-place from the partial worktrees;
  WI-727's crashed run had wrongly set `config/filing.ts maxRetries 3→2` (a behavior change),
  caught + reverted. (2) **WI-728 took one reviewer rework round** — the shepherd first
  wrongly excluded `practice` (checked `practice/_layout.tsx`, which has no gate); the
  reviewer's source-artifact check flagged the real ternary at `practice/index.tsx:431-433`
  (cited by F-108); migrated it (PR #1158), all 7 screens now on the hook. Adjudication that
  held: the `useEntryGate` hook keeps the `MODE_NAV_V1_ENABLED ? !canEnter : isParentProxy`
  flag-branch verbatim (behavior-identical) — the cut's "collapse to `!canEnter()`" premise
  was unsafe vs the V0 profile-load guard; the hook's `isParentProxy` read is registered in
  the nav-usage ratchet's `V0_FALLBACK_FILES`. **Follow-up filed: WI-730** — the data-access
  atomic claim predicate `claimSessionForFilingRetry` still hardcodes `lt(filingRetryCount, 3)`
  (out of WI-727's operator-deferred data-access scope; surfaced as a Codex P2 on #1150).
  Nothing stranded in Reviewing — all six verified `Closed/Done`. Tier-2 delivery branches +
  worktrees cleaned up. **Lane NOT graduated — Tier 3 deferred to post-WI-586**
  (cutover-serialized): to be kicked off fresh with a re-scan once WI-586 lands. Tier-2
  shepherd stands down.
