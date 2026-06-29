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
- Monitors: inbox `bg12m7pqi`, WS-27 Cosmo-Stage `b8v6l9yuv`. Outbox through pr-cleanup-4.

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
