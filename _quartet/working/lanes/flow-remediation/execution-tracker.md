# PRG-18 · Flow Remediation — Execution Tracker

**Cosmo Workstream:** "Flow Remediation" = **WS-20** (page `3838bce9-1f7c-812d-aa36-caea0b669e76`; Project=MentoMate `3658bce9-1f7c-8128-9f9b-fa7fcf75a13b`; Status=Open).
**Roster row:** PRG-18 (`_wip/umbrella-program/program-roster.md` → Active).
**Created:** 2026-06-18 (orchestrator, operator green-lit + named "Flow Remediation").

## Charter / scope
Catch-all lane for **post-identity-cutover mop-up that is NOT directly tied to the identity-foundation changes.** Primary intake = the **2026-06-17 flow-revision browser sweep** (pre-existing / non-identity defects surfaced by post-cutover testing) + non-identity cleanup parked elsewhere. Ongoing intake home for future non-identity sweep findings. Explicitly distinct from:
- **PRG-06 Identity Cutover (WS-18)** — v2 read/write defects + the flip/soak/drop operation. The "ours" bugs (WI-821/823/824/826) stay there.
- **PRG-01 Identity Foundation** (graduated) — the identity build.

## Execution model — HYBRID (operator ruling 2026-06-19) — supersedes the Zuzka-lane model below for the current 6 items
A dedicated **our-Quartet shepherd** (operator-launched, this lane) now owns WS-20's current membership:
- **Execute-to-close:** **WI-820, WI-825** — fix the review-bounce findings (pre-gathered in *Review-bounce findings* below) as **`main`-based** PRs (**new-llm is FROZEN** — never branch off it again), re-review, close.
- **WI-818, WI-822 — OURS to close (SUPERSEDES the earlier Zuzka hand-off).** Operator ruled 2026-06-19 (evening) that **our Quartet shepherd takes BOTH 818 and 822 all the way to Cosmo Close** — **Zuzka is NOT working on these** (the earlier "release to Zuzka" plan is void; ignore any double-execution caveat). Status: **WI-822 CLOSED** (#1241 `387b8262`); **WI-818 finalizing** (#1249 `4ac215be` merged; builder running `/cosmo:execute complete`, Fixed-In=`4ac215be`).
- **Refine-to-Ready only — WI-819, WI-782:** carry through `/refine` to **Ready (DoR)**; **do NOT execute.** Post-Ready disposition = a later operator decision.
- **Reviewer (RESOLVED 2026-06-19):** our **autonomous Gate-2 reviewer covers the FULL Flow Remediation workstream (WS-20)** — closes both our-shepherd-executed (820/825) and Zuzka-executed (818/822) items. Caveat: the reviewer session must actually be pulling WS-20 (same pull-gap risk seen on WS-13/WS-18).
- **Channel:** `_wip/flow-remediation/_state/{inbox,outbox}.jsonl` provisioned — this model uses the FULL 8-step ceremony incl. steps 5–7 (kickoff / executors / outbox-watcher).
- **Zuzka coordination:** these 6 items move from Zuzka's plate to our shepherd — **operator to give Zuzka a heads-up** so there is no double-execution.
- **Future intake + steady-state model (Zuzka vs Quartet):** deferred — decide after the current 6 land/Ready.

## Execution model — NON-Quartet (Zuzka lane) — SUPERSEDED 2026-06-19 for current items; retained for future-intake context
- **Executor = Zuzka**, via her **own ZDX + agents** (full capture → refine → execute). NOT our Quartet shepherd/executors.
- **Orchestrator (us)** owns workstream-level steering only: scope, ordering (`Workstream Order`, ×100), dependency edges (`Blocked-by`), tracking. We do **not** execute here.
- **Done-signal:** PR merged to `main` referencing `WI-NNN` (we watch GitHub).
- **Close:** **DEFERRED (operator 2026-06-18):** for now Zuzka manually runs `/refine` + execute with her own hands-on agents while learning ZDX/Cosmo. **Orchestrator wires nothing on WS-20 — no reviewer attachment, no dependency automation — until further notice.** Reviewer-coverage (our autonomous Gate-2 vs hers) decided later.
- **Ceremony note:** the standard 8-step activation applies EXCEPT steps 5–7 (our shepherd-kickoff / executors / outbox-watcher) — those live on Zuzka's side. No orchestrator-side `_state/{inbox,outbox}` channel for this lane.

## Members (WS-20)
| WI | Type | Pri | Order | Causation / note |
|----|------|-----|-------|------------------|
| WI-819 | Bug | P1 | 100 | LEARN lost-connection (SSE 45s idle-timeout + summary-submit ~90s hang). Pre-existing (red 2026-05-15). Sized ≈ **M / 2–4 eng-days behind a ½-day spike** (two failure modes; staging latency may shrink it). |
| WI-818 | Bug | P1 | 200 | AUTH-11/17 expired/revoked re-entry banners. Pre-existing (Clerk auth, flag-agnostic). |
| WI-822 | Bug | P1 | 300 | BILLING-08 family-pool remove controls. NON-identity, non-regression — control exists+renders; **e2e-coverage gap only** (no code change expected). |
| WI-820 | Bug | P2 | 400 | QUIZ-18 no-round → ISR. Web static-export SSR guard (direct-nav without state). |
| WI-825 | Doc | P3 | 500 | SUBJECT-05 topic-interest. Product added a step after May; docs/tests drifted. |
| WI-782 | Task | P2 | 600 | V2-shell **S4/S5 visibility-contract rework** (MMT-ADR-0022: read-time relationship-derived, not a stored ledger column). Parked. **Feature-rework, not QA-mop-up** — here as the non-identity holding pen; **re-home if a dedicated V2-shell / mentor-is-the-app initiative activates.** |

## Review-bounce findings (pre-gathered 2026-06-19 — for WI-820 / WI-825 builders)
Both WIs MERGED but were **bounced from review** (Stage→Executing). Both bounced for the **same root cause: scope creep** — each branch bundled unscoped API/identity-v2 stabilization beyond the WI, and that extra code carried/left rule violations now on `main`. The documented ACs themselves PASSED. Fixes go as **surgical `main`-based PRs**.

**WI-820 (QUIZ-18) — PR #1235 (merged to main, `311cd900`):**
- **MUST-FIX (bounce cause):** `apps/api/src/middleware/account.ts` L167–178 — billing catch block `logger.error()`s a failed `ensureInitialTrialSubscriptionV2` but never `captureException()`. Violates the non-negotiable: *silent recovery without escalation is banned in billing/auth/webhook code* (emit a structured metric / Inngest event). Add the Sentry capture / structured signal.
- **SHOULD-FIX (do in the SAME PR — will re-bounce otherwise):** `isIdentityV2Enabled()` is copy-pasted **8×** across integration test files (`billing-lifecycle`, `consent-web`, `inngest-quota-reset`, `onboarding-dimensions`, `parent-dashboard`, `profile-isolation`, `stripe-webhook`, `snapshot-progress`) — 3+-sibling-drift rule. Extract to `tests/integration/helpers.ts` and sweep all sites (forward-only).
- CONSIDER (optional): `child-profile-v2.ts` L74–83 `legacyProfilesTableExists()` cache inconsistency; `stripe-webhook` local type unions duplicating `@eduagent/schemas`.

**WI-825 (SUBJECT-05) — PR #1234 (merged to new-llm→rode into main, `1b90f9c0`):**
- **MUST-FIX (bounce cause, GDPR — the heavier fix):** `tests/integration/account-deletion.integration.test.ts` L380–386 (introduced by `e83aee53`) — `legacyAccountDeletionCascadeDescribe` resolves to `describe.skip` when `IDENTITY_V2_ENABLED=true`, so the PII cascade-deletion audit is **unverified in v2 mode** (the only mode prod runs). Un-skipping the *legacy* test fails (legacy tables dropped) — write a **v2-path cascade audit** that verifies PII deletes cascade across the v2 tables. *"The test is the audit."* Security/HIGH → needs a red-green-revert regression proof.
- CONSIDER (already triaged low-risk): `identity-graph.ts` `legacyTableExistsCache` deploy-sequencing (warm-isolate 500s if drop runs mid-flight) — moot on ephemeral Workers + drop already ran on empty prod; capture only as a staging-reseed runbook note (WI-814). The `tableExists`/`to_regclass` 4-file duplication is a tidy-up, not a blocker.

> Provenance: read-only Researcher sweep of Cosmo `[zdx:review]`/`[cosmo:qa]` comments + PR #1234/#1235 claude-review verdicts, 2026-06-19. Builders should re-confirm `file:line` against current `main` before editing.

## Cross-workstream & P5 dependencies
**Audited 2026-06-18.** P5 (= the #11 identity-table drop) is now a Cosmo node: **WI-828** ("P5 — #11 drop", WS-18). Hard deps = `Blocked by`/`Blocking`; soft deps = `Related Items` + note.
- **All WS-20 (Flow Remediation) items are P5-INSIGNIFICANT** — none gate or are gated by the drop (all non-identity / drop-independent). No P5 edges recorded (per operator: record nothing where P5 has no significance).
- **No HARD cross-workstream deps** between open WS-20 and WS-18 items.
- **WI-782 ↔ P5: NO dependency.** 782 derives visibility from the v2 RELATIONSHIP model (authoritative since the #8 flip), not from the dropped legacy tables; its target `mentor_activity_ledger` is a V2-shell table, not an identity table. The #11 drop neither enables nor blocks it. Its real gates are the V2-shell track activating, not P5. → P5-insignificant, no edge.
- **SOFT cross-WS notes (documented, not Cosmo-wired):**
  - **WI-782 ~ WI-823** — both build on v2 guardianship/relationship semantics; 782's read-time-derived visibility contract should align with the guardianship-edge fix WI-823 makes. (823 in WS-18, 782 in WS-20.)
  - **WI-822 ~ WI-805** — 822 (e2e coverage of the v2 family-member-remove path) lightly overlaps 805 (legacy-subscriptions drop + billing sweep); if 805 reshapes the subscription/family surface, 822's test may need a refresh. Low confidence (822 targets the already-v2 path).

**P5 edge map (lives in WS-18, FYI):** before-P5 *hard* WI-821→P5(828); after-P5 *hard* WI-779; after-P5 *soft* WI-805/814/817; P5-insignificant WI-823/824/826/827.

## Change log
- **2026-06-19 (evening) — 818/822 review-bounce rescue (orchestrator hand-hold).** Both Zuzka-executed items bounced from review → Executing for the SAME legit reason (NOT a harness misfire like 825): reviewer ran against a fresh origin/main clone and the Fixed-In commit was **not an ancestor of main**. **WI-818:** stale bounce — PR #1239 actually merged to main (merge commit `16dd03774`, 16:26Z) after the reviewer's clone; re-finalized via property-PATCH (Fixed-In→`16dd03774`, Stage→Reviewing) for re-check; no fixwork. **WI-822:** genuinely unlanded — PR #1241 open, APPROVED + all-green, but CONFLICTS with main on one doc (`docs/flows/plans/flow-revision-plan-2026-06-17.md` totals roll-up); dispatched a Sonnet executor (`.worktrees/WI-822`) to resolve the conflict → orchestrator merges #1241 → re-finalize Fixed-In=merge commit. Teaching point captured on both WIs as Cosmo comments: close requires Fixed-In = the MERGE commit on main, not the branch head. **Update:** conflict resolved clean (head `29dc134f`), but PR claude-review (Gate-1) returned CHANGES_REQUESTED — 1 VALID should-fix: new `family-pool.yaml` Maestro steps reference unexported env vars `${CHILD_PROFILE_ID1/2}` (convention is singular `CHILD_PROFILE_ID`; maestro-validator is structural-only + WI verified via Playwright, so the gap was undetected). Executor resumed; on investigation **refuted the should-fix as a FALSE PREMISE** with primary-source evidence — the Maestro env vars ARE exported via the generic `d.ids`→UPPER_SNAKE loop in `seed-and-run.sh` (the singular `${CHILD_PROFILE_ID}` used by dozens of passing parent flows rides the same loop with no explicit export → reductio). Orchestrator independently verified (`seed-and-run.sh` loop + `test-seed.ts:5329-30` + Playwright j25 pass), **reversed the ruling to INVALID**, documented the rationale on PR #1241, and **merged `387b8262`** under strict-green (flag-on lane = allowed-red ic-116, 0 test failures). WI-822 re-finalized → Reviewing (Fixed-In=`387b8262`). Awaiting Gate-2 close. Lesson: a PR-review should-fix reasoned from the diff alone can miss a pre-existing harness mechanism — verify the crux at primary source before ruling.
- **2026-06-19 (later) — 818/822 → Zuzka; reviewer resolved.** WI-818 + WI-822: shepherd finishes refine-to-Ready then releases (unclaimed); Zuzka executes (non-Quartet). Our autonomous Gate-2 reviewer now covers the FULL WS-20 (both pipelines). Shepherd informed (inbox `fr-orch-001`). Operator to notify Zuzka the two are Ready + hers.
- **2026-06-19 — HYBRID model ruling (operator).** Current 6 WS-20 items move to a dedicated **our-Quartet shepherd**: WI-820/825 execute-to-close (fix review bounces as `main`-based PRs; findings pre-gathered above), WI-818/819/822/782 refine-to-Ready only. Post-Ready execution of the four + future-intake steady-state model = deferred. Full 8-step ceremony now applies (channel provisioned, kickoff authored, outbox-watcher armed). Operator actions: confirm reviewer pulls WS-20; heads-up to Zuzka (no double-execution). new-llm FROZEN — all fixes target `main`.
- **2026-06-18 — WS-20 created (PRG-18 Flow Remediation).** 5 sweep bugs (818/819/820/822/825) moved in from unparented-Captured; WI-782 moved from WS-18 (cleans the cutover workstream of its one non-identity holding). Orchestrator-created, operator green-lit. Open: reviewer-coverage TBD; Blocked-by edges not yet wired (none gate P5).
