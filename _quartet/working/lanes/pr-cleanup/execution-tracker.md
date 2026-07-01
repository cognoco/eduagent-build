# Execution Tracker — PR-CLEANUP lane (Cosmo Workstream WS-27 "PR cleanup")

## Charter
Drive the stuck **crowka** PR backlog (opened by a now-stood-down agent session) to
Cosmo Close. Every in-scope PR is **already built and pushed**; the work is *un-sticking +
finalizing*, not building features. "Done" = every WS-27 Work Item Closed/Done, its PR
merged to `main` green, and the lane graduated.

## Canon authority
- Repo `AGENTS.md` Cosmo rules + the `cosmo`/`zdx-core` skills — **authoritative** for
  lifecycle (claim → complete → review → close) and the commit/merge gates.
- This lane has **no source plan/spec** — the PRs themselves + their Cosmo WI pages are the
  substance. Conform to repo engineering rules, not to a design doc.

## How to use (fresh shepherd orientation)
The bulk blocker was a **stale base**: all PRs branched before three fixes landed on `main`
today (#1635 integration-seed, #1646 drizzle-0125, #1638 flag-on-unblock). The orchestrator
already ran an `update-branch` wave on the 13 non-DIRTY PRs. **The orchestrator owns the
green-batch finalization** (merge → `complete` → Reviewing). **You own the residue**:
DIRTY-conflict PRs, PRs still red after the wave, and any WI bounced back to Executing by the
reviewer. You are **prime-and-hold** — orient, arm your inbox watcher, then wait for the
release `directive` before touching any PR (avoids racing the orchestrator's green sweep).

## Pointers
- **Cosmo Workstream:** WS-27 "PR cleanup" — page `38e8bce9-1f7c-80c7-b212-c6a1d258966b`
  (Project: MentoMate). Membership added *in addition* to each WI's existing workstream.
- **Repo root:** `/Users/vetinari/nexus/_dev/eduagent-build`
- **Channel:** `_quartet/working/lanes/pr-cleanup/_state/{inbox,outbox}.jsonl`
- **Reviewer:** a SEPARATE session must cover WS-27 (Stage=Reviewing → close/bounce). Confirm
  coverage on arrival; do not own the watcher.

## Units / slice (14 Cosmo WIs · ×100 order; live PR/CI state is canonical — re-read on arrival)
All PRs by `crowka`, base `main`. "DIRTY" = merge conflict (needs hands-on resolution; the
wave could not auto-merge). Coarse status only — derive live state from `gh pr view` + Cosmo.

| Order | WI | PR | What | Wave/known state |
|---|---|---|---|---|
| 100 | WI-480  | 1597 | billing/quota/idempotency regression tests | updated; expect green |
| 200 | WI-481  | 1605 | zod-validate untrusted LLM/JWT responses | updated; expect green |
| 300 | WI-560  | 1598 | live-eval drift check scoping | updated (UNSTABLE pre-wave) |
| 400 | WI-885  | 1569 | subscription teardown on GDPR erasure | updated; expect green |
| 500 | WI-902  | 1618 | dictation history persist | **DIRTY** + mobile manual-plural-guard fail |
| 600 | WI-1059 | 1617 | mobile parse API responses at trust boundary | residual: SessionSummaryScreen testIDs |
| 700 | WI-1070 | 1600 | UTC-safe age computation | updated; expect green |
| 800 | WI-1071 | 1595 | notes ownership helper dedupe | **DRAFT** + Merge-completeness (dropped `single-wi-executor-protocol.md`) |
| 900 | WI-1075 | 1642 | @inngest-admin scope annotations | updated (drizzle-0125 fixed on main) |
| 1000 | WI-1087 | 1593 | tutor→mentor schema rename | updated; schema-touch — sequence merge to avoid cross-PR collisions |
| 1100 | WI-1097 | 1609 | tighten 19 GDPR export schemas | updated; claude-review infra (no verdict artifact) |
| 1200 | WI-1119 | 1604 | subject-hub manage sheet | **DIRTY** + nav-contract guards + missing `accessibilityViewIsModal` |
| 1300 | WI-1132 | 1643 | restore Subjects richness | updated (UNSTABLE pre-wave) |
| 1400 | WI-1151 | 1644 | alias-merge quota + email dedup + test schema | **DIRTY** (integration test files); NOT redundant vs #1638 (zero overlap) |

**Satellite PRs — now MIRRORED into WS-27 (operator ruling, supersedes the out-of-lane note):**
PR 1603 + PR 1613 were Open-tracker bug issues, not Cosmo WIs. Per operator ruling they were
mirrored via /cosmo:capture → /cosmo:triage → /cosmo:refine into **WI-1165** (←PR 1603/BUG-897,
order 1500) and **WI-1166** (←PR 1613/BUG-784, order 1600), both Ready/EP=Assisted, in WS-27.
Shepherd executes them as normal lane work. **Bug-tracker close stays orchestrator-owned:** the
Open-tracker issues (37b8…/36f8…) are closed by the orchestrator only AFTER the global reviewer
closes the mirrored WI (provenance comment posted on each source issue).

## Sequence
- Mostly independent. **Schema-touching PRs** (1593 tutor→mentor; 1644 alias-merge) can
  conflict *with each other* and with sibling integration-test edits at merge — merge them
  deliberately, not in PR-number order, re-checking `mergeStateStatus` after each land.
- `strict=false` on `main` (no up-to-date-before-merge, no merge queue) — a land does **not**
  un-green the others absent a real conflict, so no per-merge re-CI grind.

## Supervision / escalations
- Standard tier / standard effort executors by default. No known reasoning-hard units; the
  residual fixes are mechanical (conflict resolution, testIDs, a dropped file, a11y prop).
- Claims are held by the stood-down `crowka` session — executors must **take over the claim**
  (`/cosmo:execute claim` / `--claimant`); verify claim-expiry isn't blocking before assuming.
- Required `main` checks (branch protection): `main`, `Playwright web smoke`,
  `API Quality Gate`, `Merge completeness check`. A PR is "green" only when ALL required
  checks SUCCESS **and** the automated review ran green **and** `mergeStateStatus=CLEAN`.

## Current position
**Released + executing.** 6 clean-green WIs in Reviewing (885/480/560/1070/481/1075, orchestrator).
Shepherd residue (builders in flight, Sonnet/isolated worktrees): b-1119/1604, b-902/1618,
b-1151/1644, b-1059/1617, b-1132/1643, b-1087/1593, b-1097/1609, b-1165/1603, b-1166/1613.
- **WI-1071/#1595 MERGED** (squash 90edc43a) → Stage=Reviewing (first through pipeline).
- **Ambient main red** (WI-885 teardown file missing WI-1075 @inngest-admin annotation; strict=false
  batch interaction) FIXED via standalone hotfix **#1654 (squash 411803de, `no-db`)**. Whole residue
  re-merging main to clear `main` check. (#1603/#1132 had wrong `event-profile` token → drop + take main no-db.)
- Pipeline per WI: builder claim→fix→green PR→report; shepherd merges (squash) + builder runs
  Phase-7 `/cosmo:execute complete` detached to squash SHA. **Merge constraint:** schema/integration
  PRs (#1644, #1593) sequenced deliberately, re-check `mergeStateStatus` after each land.
- Monitors: inbox `bg12m7pqi`, WS-27 Cosmo-Stage `b8v6l9yuv`. Outbox through pr-cleanup-5.

### Progress (2026-06-30 ~06:00) — 9/10 residue WIs MERGED
Merged + finalized → Reviewing: WI-1071(90edc43a), WI-1087(752f237f), WI-1165(cb2fb93f),
WI-1166(cd1a6400), WI-1151(af2bc45b — shepherd-owned lifecycle: was Captured-stranded → bridged →
shepherd-completed), WI-1119(b8ce52aa — needed force-push branch repair + eas.json V2-flag-regression
fix), WI-902(dd58d9bd — Phase-7 pending confirm), WI-1059(f2bbc17c), WI-1097(660f784d).
**LAST open: WI-1132/#1643** — `main` check failing, behind main; b-1132 re-merging + diagnosing.
Gate-1 discipline caught: stale "green" reports, green-check-but-CHANGES_REQUESTED-verdict (#1644 billing
should-fix, #1604 eas.json), event-profile-vs-no-db across #1603/#1643/#1644. Awaiting global-reviewer
verdicts on the 8 Reviewing WIs.

## Launch gate (prime-and-hold)
Released when the orchestrator posts an inbox `directive` (`type:"directive"`, `msg` ≈
"released — work the residue") after sweeping the green batch into Reviewing. Until then:
orient, confirm reviewer coverage of WS-27, arm the inbox watcher, hold.

## Change log
- **<provisioned>** — Lane created. WS-27 holds 14 WIs (added alongside existing workstreams).
  Orchestrator ran update-branch wave on the 13 non-DIRTY PRs; CI re-running. Split ruled by
  operator: orchestrator finalizes green batch; shepherd owns DIRTY (500/1200/1400) + residual
  reds (600, 800-draft) + review bounces. Satellite PRs 1603/1613 orchestrator-owned, out-of-lane.
- **<wave-settled + green sweep>** — Wave settled (4 min). 6 PRs green by strict gate (CI +
  APPROVED review + CLEAN): merged (squash) and finalized → Reviewing via /cosmo:execute complete
  (Fixed In = merge SHA, template summaries, claims cleared): WI-885/1569, WI-480/1597,
  WI-560/1598, WI-1070/1600, WI-481/1605, WI-1075/1642. Shepherd released (inbox-2). Residue to
  shepherd: 1604/1618/1644 DIRTY, 1617/1643 red, 1595 draft. 1593 (blocking schema-dup) + 1609
  (should-fix GDPR regression) held for operator ruling. Satellite 1603/1613 pending orch handling.
- **<satellites mirrored>** — Operator ruled: mirror the 2 satellite bugs as Cosmo WIs + let the
  shepherd handle them (not the orchestrator side-pipeline). Created WI-1165 (←PR1603/BUG-897) +
  WI-1166 (←PR1613/BUG-784) via /cosmo:capture → /cosmo:triage (Captured→Backlog; triage bridge
  required — refine rejects Captured) → /cosmo:refine --to-ready (EP=Assisted, AC authored). Added
  to WS-27 (order 1500/1600 → 16 members). Provenance comments on both source issues. Shepherd
  directed via inbox-4. 1593/1609 routed to fix via inbox-3. WS-27 now: 6 Reviewing, 8 shepherd-
  residue (1593/1609/1604/1618/1644/1617/1643/1595), 2 new Ready (1165/1166).

## ⚠️ BOUNCE RECONCILE (2026-06-30 ~06:20) — READ ON RESUME
**Monitor went BLIND:** closed/processed WIs were dropped from the WS-27 `Workstream` relation, so the
relation-filtered poll (`cosmo-ws27-monitor.mjs`) stopped seeing my 10 WIs → I missed 6 reviewer bounces
(operator caught it). **FIX ON RESUME: read my WIs by ID, not WS-27 relation** — use `/tmp/wi-stage-read2.mjs`
pattern (filter `{property:'ID', unique_id:{equals:N}}` on DB `f170be9e-04ae-45d4-9618-28f2438666bd`;
read the page's own unique_id, NOT a blob scan which catches relation WIs). Re-arm a per-ID monitor.

**True state (direct per-ID read):**
- **CLOSED (done):** WI-1151, WI-1119, WI-1097. Their builders correctly shut down.
- **WI-1132/#1643:** still PRE-MERGE. `main` fails on transient `pnpm: command not found` (poisoned run-context,
  passes on main+all siblings). b-1132 (STILL ALIVE) pushing empty commit for fresh run. Watch + merge when green.
- **6 BOUNCED → Executing (real fix-forward rework; originals already MERGED so each needs a NEW PR):**
  - **WI-1071** (Fixed-In 90edc43a): post-merge `main` red on run 28399946343. main is GREEN now (660f784d) —
    likely just needs that commit's required `main` context rerun green, then reviewer re-verifies. Lightest.
  - **WI-1087** (752f237f): incomplete tutor→mentor sweep — leftover `mateFeedback: 'Opinia tutora'` at
    `apps/mobile/src/i18n/locales/pl.json:3145` (+ sweep all locales for non-exception `tutor`). Rename/regen + rerun i18n.
  - **WI-1165** (cb2fb93f): onFailure getStepDatabase sweep MISSED siblings `subject-retry-curriculum.ts:65-93`
    + `subject-prewarm-curriculum.ts:85-111` (call getStepDatabase()/markBookFailed without
    runWithStepDatabaseScope+closeStepDatabases). Scope them same pattern OR documented tracked deferral.
  - **WI-1166** (cd1a6400): identity-v2 reclaim path `apps/api/src/services/identity-v2/identity-graph.ts` still
    emits reclaim event with old orphan-allow comment + payload can give existingClerkUserId=null (new handler
    only validates non-null). Fix/verify that emitter/handler path OR document scope exclusion.
  - **WI-902** (dd58d9bd): integration test fails — `column "sentences" of relation "dictation_results" does not
    exist` on Doppler dev DB (migration 0126 committed but not applied to validation DB). Apply/verify migration
    on validation DB OR provide green integration evidence. 16/17 failed: `result.integration.test.ts`.
  - **WI-1059** (f2bbc17c): `parseJson` calls `res.json()` OUTSIDE try/catch → 2xx non-JSON body throws raw
    SyntaxError not ApiResponseShapeError. Classify JSON-parse failures at API client boundary + negative test.

**RE-ENGAGE PLAN (post-compact):** re-dispatch a builder per bounced WI (fresh, fix-forward NEW PR; brief points at
builder.md + the exact finding above + builder.md GATE-0 premise-verify). I SHUT DOWN the original 6 builders
(b-1071/1087/1165/1166/902/1059) prematurely — dispatch fresh ones. Shepherd merges + re-completes (new Fixed-In).
Gate-1 lesson reinforced: closure verifies against origin/main, so a green-PR-at-merge can still bounce if the
post-merge `main` run is red or a completeness sweep finds siblings. Outbox through pr-cleanup-6.

## ✅ LANE EXECUTION COMPLETE (2026-06-30 ~08:28)
All 12 in-scope WS-27 WIs landed. **CLOSED (11):** 1151, 1119, 1097, 1071, 1075, 902, 1087, 1059, 560, 1165, 1166. **REVIEWING (1, awaiting reviewer close):** WI-1132 (#1669 squash aa94a68a). Plus 2 no-WI incidental hotfixes merged: #1654 (no-db @inngest-admin annotation, 411803de) + #1664 (docs_only gate on @inngest-admin step, 5dad2616 — killed the spurious `pnpm: command not found` class).

**Bounce taxonomy (this round):**
- **Zero-code closure-verification artifacts (re-completed, no new PR):** WI-1071 (ambient main-red false-negative), WI-1075 (annotation already on main via #1654), WI-902 (validation-DB unmigrated — applied 0126 forward), WI-560 (drift verdict now explicit via WI-1148 evaluateGates: "Baseline check passed, 5.0pp"; exit-1 was orthogonal scenario-quality).
- **Real fix-forward code rework (new PR → merge → re-complete):** WI-1087 (#1663 tutor sweep), WI-1165 (#1666 onFailure scope siblings), WI-1166 (#1665 reclaim null-guard), WI-1059 (#1667 parseJson boundary).
- **BOTH:** WI-1132 — zero-code-completed in error; reviewer correctly re-bounced on an unresolved a11y finding (identical accessibilityLabel/row) in already-merged source + a red Fixed-In rollup; fixed forward (#1669: subject-specific interpolated label + 7-locale key + baseline regen + regression test).

**Process catches:** (1) per-ID Cosmo monitor (bzcbvwm1s) caught WI-1059's premature builder-run `/cosmo:execute complete` (wrong/old Fixed-In) → corrected in place. (2) WS-27 relation monitor proved unreliable (stale WI-1075=Reviewing) — per-ID authoritative. **Lesson → memory:** `feedback_shepherd_zerocode_completion_gates`. Remaining: reviewer closes WI-1132 → lane graduates.
