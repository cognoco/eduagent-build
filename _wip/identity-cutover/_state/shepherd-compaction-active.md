# WS-18 Identity Cutover shepherd — COMPACTION CHECKPOINT 2026-06-29 ~22:35Z

## ROLE / CHANNEL
Fresh WS-18 "Identity Cutover" (PRG-06) shepherd. Repo `/Users/vetinari/nexus/_dev/eduagent-build`.
Channel `_wip/identity-cutover/_state/{inbox,outbox}.jsonl`. **Last in = ic-orch-315** (GO, 1-round plan APPROVED). **Last out = prg06ic-377**. **NEXT out id = prg06ic-378.**
Watchers (manifest `_state/monitor-manifest.json`): inbox **bpvn1kgam** (`tail -n0 -F inbox.jsonl | jq`), cosmo-stage **bo0oqwp5b** (`node cosmo-ws18-monitor.mjs`). NOTE: inbox watcher RE-EMITS old lines if inbox.jsonl is rewritten (saw ic-orch-001..007 replay) — ignore stale low IDs; real high-water = **ic-orch-315**.

## CRITICAL PATH = WI-867 (IDENTITY_V2_ENABLED flag collapse to v2-only)

### Branch / SHAs (branch `WI-867`, base 4a2163468)
- `4a2163468` = clean base (carries #1638 seed fix + WI-1145). 
- `17c7670d4` = collapse commit (125 files; vetinari@zaf.fleet; **triggered CI originally**).
- `78a637e78` = seed-sweep (12 integration-test files; **tree 2b435fbd**; CONFORMANCE-VERIFIED: real v2-graph db.inserts, no internal mocks, no eslint-disable, ZERO prod changes).
- `701320fc0`, `f656831f7` = 2 THROWAWAY empty "re-trigger CI" commits (DROP in rebase). origin/WI-867 = **f656831f7**.
- **Rebase target = af2bc45b** (current origin/main per ic-314; was 4a2163468→752f237f→af2bc45b).

### ROOT CAUSE saga (RESOLVED) — why CI never ran
PR was **CONFLICTING** with advanced main → GitHub can't compute `refs/pull/N/merge` → **github-actions creates ZERO check-suite** (symptom: every check app fires EXCEPT github-actions). NOT author/SHA/PR-number — 5 un-wedge attempts (re-author, close/reopen, empty-commit, fresh PR #1659, fresh SHA) all WASTED. Advisor caught it; `mergeStateStatus: DIRTY` = conflicts. Saved → memory `project_conflicting_pr_blocks_ci.md`. **PR #1591 CLOSED** (wedge), superseded by **PR #1659** (also CONFLICTING). Both on branch WI-867.

### IN FLIGHT (current step)
**builder-867-rebase** (Sonnet) dispatched: rebase `17c7670d4`+`78a637e78` onto `af2bc45b` in worktree `.worktrees/WI-867-rebase` (branch WI-867-rebase), resolve 14-file/8-prod conflicts, push to SIDE branch `WI-867-rebase`. It signaled idle; **I requested its deliverable (resolution doc + GDPR-guard/#1644 confirmation + tsc + verification + SHA). AWAITING reply.**

### CONFLICT RESOLUTION RULES (ic-orch-315 conditions)
- Keep collapse's flag-removal (v2-only) AND **preserve main's landed changes** (#1644 quotaPools/email-dedup in alias-merge/weekly-progress/session-completed; tutor→mentor rename #1593).
- **account-deletion.ts: PRESERVE `deletePersonIfNoConsentV2` requestedAt generation guard** (security-critical; don't drop/reorder/loosen).
- #1644 quotaPools-revert is ORTHOGONAL (WI-1151 track), NOT 867's concern.
- 8 prod conflict files: account-deletion.ts, session-completed.ts, weekly-progress-push.ts, archive-cleanup.ts, freeform-filing.ts, notify-parent-child-cap-hit.ts, notifications.ts, session-crud.ts, coaching-cards.ts, trial-expiry.ts (+4 test files).

## NEXT STEPS (in order)
1. Receive builder-867-rebase deliverable → CONFORMANCE-REVIEW (8 prod resolutions, GDPR guard intact, #1644 preserved, tsc green). Don't trust self-cert (applier discipline).
2. If clean: **promote WI-867-rebase → WI-867** (force-push `--force-with-lease` FROM A WORKTREE, never bare/main-checkout — husky fails "must be run in a work tree"). Makes #1659 MERGEABLE → CI fires.
3. Re-arm CI watcher on #1659 (now fires). Post **WI-905 deferral comment** on #1659 (Task 7).
4. On required-main GREEN → flag orchestrator (run ID) for re-verify. NO self-merge.
5. Orchestrator RE-VERIFIES collapse-correctness + account-deletion guard on POST-REBASE tree (tree changed; no "tree unchanged" shortcut) → confirms → I merge → `/cosmo:execute complete WI-867` → unblocks WI-868.

## MERGE GATE (1-round, ic-orch-315)
required-main GREEN on af2bc45b + WI-905 deferral comment + orchestrator re-verify (guard+collapse on post-rebase tree) + I flag run ID → orchestrator confirms. Codex review STOOD DOWN. Required checks = main, Playwright, API Quality, Merge-completeness. claude-review (CHANGES_REQUESTED: DS-021 SHOULD_FIX=WI-905 track-don't-block; 2 CONSIDER skipped) + Flag-ON = NOT blockers.
ATTRIBUTION (1-round): seed gaps = createSubscriptionV2 'no owner person'/ForbiddenError/callerPersonId-TypeError; rebase breakage = tutor/mentor + alias-merge/weekly-progress compile/type errors.

## GOTCHAS
- `doppler -c stg` forces IDENTITY_V2_ENABLED=true → `env -u IDENTITY_V2_ENABLED` for flag-off repro.
- Checkout git identity defaults to **"Test User <test@example.com>"** → re-author to vetinari@zaf.fleet (builder briefs must set it).
- Verify infra: local pg PGDATA=scratchpad/pgdata :5432 role eduagent DB `tests` (RE-MIGRATE CLEAN before trusting).
- Push: explicit refspec `HEAD:<branch>` from a worktree, never bare.

## TASKS: #4 (flag gate, pending→#1659), #6 (final rebase, in_progress=builder), #7 (WI-905 comment, pending), #8 (builder rebase+resolve, in_progress=awaiting deliverable). #1,2,3,5 done.
## DEFERRED (after 867): chain WI-868←867, 869←868, 779←869, 1123/1076←867; operator-decisions WI-885/1099/1072/1141/814/1103. WI-849 CLOSED by reviewer this session.

---
## RESUME UPDATE 2026-06-30 ~06:1xZ (post-throttle)
- Throttled ~22:23→05:55 (NOT down; session intact). Orchestrator ic-316/317/318.
- **SALVAGE DONE.** builder-867-rebase worktree CORRUPTED (garbage `30fe53dcb init` commit deleting skills tree; detached HEAD; Test-User author) → DISCARDED. Its 2 underlying commits SANE → cherry-picked CLEAN onto CURRENT origin/main **660f784d0** (#1609 WI-1097 GDPR-schema; no overlap w/ collapse) in fresh worktree `.worktrees/wi867-final` (branch `wi867-final`).
- **NEW SHAs: `b0934f5c1` (collapse) + `820975059` (seed-sweep).** Zero conflicts onto 660f784d0 ⇒ no new semantic resolution.
- GDPR guard VERIFIED INTACT: consent-reminders.ts:248 `deletePersonIfNoConsentV2(db,profileId,requestedAtDate)` unconditional + deletion-v2.ts:673-713 generation predicate (gte/lt requestedAt bounds). Guard's real home = consent-reminders→deletion-v2 (NOT account-deletion.ts; ic-315 filename slip, orch accepted ic-318).
- Collapse residual flag refs in session-completed/billing-alias-merge/daily-snapshot = BY-DESIGN (collapse commit msg; chained WI-868). dashboard/onboarding ROUTE flag calls also out-of-scope.
- **WI-905 CONFIRMED EXISTS** = "Integration twins for WI-867 gc1-allow'd unseedable seams … consent-v2 writes … stg-DB+Neon tests" — correct home for DS-021 stale-generation deletion integration test. Deferral comment can cite it.
- **IN FLIGHT: agent `verify-867`** (Sonnet, verification-only, NO git surgery) on wi867-final: pnpm install + `nx run api:typecheck` + 3 flag-off required-main suites (`env -u IDENTITY_V2_ENABLED`) + #1644 preservation diff + resolution doc → `_state/wi867-rebase-resolution.md`.

### NEXT (on verify-867 green):
1. Promote `wi867-final` → `WI-867`: from a worktree, `git push --force-with-lease=WI-867:f656831f7 origin wi867-final:WI-867` (explicit lease; never bare). Makes #1659 MERGEABLE → CI fires.
2. Re-arm CI watcher on #1659.
3. Post WI-905 deferral comment on #1659 (DS-021 SHOULD_FIX track-don't-block).
4. Flag orchestrator the post-promote run ID → orch AUTHORITATIVE re-verify (collapse + guard + tutor→mentor residual-symbol check) → orch confirm → I merge → `/cosmo:execute complete WI-867`.
- Gate (ic-318): post-promote required-main GREEN + WI-905 comment + orch re-verify + orch confirm. NO self-merge.

---
## RESUME UPDATE 2 — 2026-06-30 ~06:4xZ — PROMOTED, CI FIRING, AWAITING GATE
- **Head SHA on WI-867 = `53f465e7c`** = collapse `b0934f5c1` + seed `820975059` + account-deletion test-fix `53f465e7c`, all on current main `660f784d0`. Pushed via OBJECT-push (force-with-lease lease=f656831f7 held) — corruption-immune.
- **#1659 flipped CONFLICTING -> MERGEABLE; CI FIRING** (root cause resolved). Run IDs: CI/main=28425791290, Merge-completeness=28425791292, API-Quality=28425791313, claude-review=28425791307, E2E-Web=28425791310.
- **Pre-push found 60 fails/7 suites → triaged:** 6 env-only (gemini/anthropic/jwt/snapshot/auth.maxage/zero-drift — byte-identical to origin/main, globalThis.fetch + Neon signatures, CI-env handles) + 1 REAL: account-deletion.test.ts.
- **account-deletion = TEST-SETUP gap (primary-source, NOT prod bug):** real getSubscriptionStoreTeardownTargetsV2 (deletion-v2.ts:944) returns SubscriptionStoreTeardownTarget[] (rows.map over findMany → always array). Collapse's v1→v2 test migration omitted `mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([])` in 3 beforeEach → `.length` on undefined (44 fails). Fix = stub existing mock to [] (GC1/GC6-clean) + stale getStepDatabase count 5→6 (v2 capture-teardown step). Test-only. 27/27 green.
- **WI-905 deferral comment POSTED** on #1659 (DS-021 track-don't-block; WI-905 = integration-twin home, CONFIRMED EXISTS).
- **Flagged orchestrator prg06ic-380** (needs-orchestrator) → their AUTHORITATIVE re-verify on 53f465e7c (collapse + GDPR guard + tutor→mentor residual + account-deletion) gates the merge. NO self-merge.

### ENV HAZARD (active): rogue "Test User" process appends `init` commits onto worktree branches, wiping the index (30fe53dcb, 62e791f9a). git-METADATA-only (on-disk file content intact). Defense: reflog → `git reset --hard <your-real-sha>`; promote via OBJECT-push not working-tree. Orchestrator escalated to operator to kill it.

### NEXT (on CI verdict, watcher bcgsollf4):
- required-main GREEN + orchestrator re-verify CLEAR + orchestrator CONFIRM → I merge #1659 → `/cosmo:execute complete WI-867` → unblocks WI-868.
- If required-main RED: triage by signature (env vs real); fix real on the object, re-object-push.

---
## RESUME UPDATE 3 — 2026-06-30 ~07:0xZ — required-main RED (co-located seed gap), builder dispatched
- **CI on 53f465e7c: required `main` = RED** (run 28425791290). FAIL step = "API co-located integration tests (apps/api/src)" ONLY. GREEN: API Quality Gate, Merge-completeness, Playwright web-smoke, the 3 CROSS-PACKAGE flag-off suites (seed-sweep worked). Flag-ON integration RED = advisory.
- **8 co-located integration suites fail (27 tests), seed-gap signature** (collapse removed flag-off v1 path; these still seed v1 → v2 path finds no graph): review-due-scan (Received len 0), weekly-progress-push (counts +1/+2, BUG-699 dedup), review-due-send, recall-nudge-send, session-exchange, onboarding, memory-facts-embed-backfill, undo-orphan. NOT in the seed-sweep's coverage (it did 3 cross-package + 9 other co-located).
- **NOT a collapse-correctness issue** (orch security re-verify stands; prod diff identical) — purely test-seed coverage.
- **Builder `seed-coloc-867` (Sonnet) dispatched** off 53f465e7c → seed v2 graph (820975059 pattern + ensureLegacyProfileAnchorForTest/#1638 + consent-seed.ts), verify 8 suites green flag-off, commit (NO push), report SHA. Task #9.
- **NEXT:** conformance-review builder's deliverable → object-push new SHA to WI-867 (force-with-lease) → re-run required-main → on GREEN + orch sweep clean + orch confirm → merge → /cosmo:execute complete WI-867.
- Reported orch prg06ic-381 (blocked: contained seed gap, fixing). Orch sweep on 53f465e7c (prod-identical) unaffected.

---
## RESUME UPDATE 4 — 2026-06-30 ~07:2xZ — seed fix d04086d0d conformance-CLEAN, awaiting full-sweep
- **Builder seed-coloc-867 delivered SHA `d04086d0d`** (branch seed-coloc-867 on top of 53f465e7c, NOT pushed). 8 co-located suites + memory-facts helper, 46 tests green flag-off (local postgres).
- **CONFORMANCE REVIEW CLEAN** (shepherd, against the object — applier-distrust): ZERO prod files (test+helper only), NO new internal jest.mock (GC1/GC6), provenance vetinari@zaf.fleet. BUG-699 dedup = REAL notificationLog row seeded (line 732) + asserts reason:'dedup_24h' SUPPRESSION (line 747), NO papered counts (zero expect/toBe changes). fetch-spy change = legit CI-safe behavior-preserving (Object.defineProperty replaces jest.spyOn for jest-mock≥30/Node-26 own-vs-prototype leak; review-due-send/recall-nudge-send).
- Builder's non-obvious finds: session-exchange.integration.test.ts = NEW T7 grader file (never had v2 seeds); memory-facts root cause = INNER JOIN person (unconditional post-WI-867) → fixed in helper not test.
- **BLOCKED on ic-322 completion bar**: requested builder run FULL co-located suite flag-off (catch regressions from shared memory-facts.ts helper + any suite beyond the 8) → ZERO failures before I object-push. Re-engaged builder (has DB+worktree).
- **NEXT:** builder full-sweep ZERO → object-push d04086d0d (or newer SHA) to WI-867 (force-with-lease lease=53f465e7c) → re-run required-main → flag orch verdict. Gate: required-main GREEN + orch test-only delta-check + orch collapse-sweep clean + orch confirm → I merge → /cosmo:execute complete WI-867. NO self-merge.
- Lease for next object-push = current origin/WI-867 = 53f465e7c.

---
## RESUME UPDATE 5 — 2026-06-30 ~07:5xZ — seed fix d04086d0d PUSHED, required-main re-running
- **origin/WI-867 = d04086d0d** (fast-forward 53f465e7c..d04086d0d). #1659 head, MERGEABLE. Object-pushed.
- **Seed fix conformance-CLEAN** (8 CI-failing co-located suites green, 46 tests; test-only 7 files + memory-facts.ts helper; ZERO prod; no new jest.mock; BUG-699 seed-side suppression verified primary-source; fetch-spy Object.defineProperty fix CI-safe).
- **FULL co-located sweep done locally (ic-322 bar)**: 7 cross-package memory-facts PASS (23 tests; helper change safe), 115 co-located PASS. 3 LOCAL-ONLY fails = stale local `tests` DB missing WI-902 `sentences` column (#1618): dictation/result, test-seed.medium-priority, database-rls-coverage — all PASS on CI (green at 53f465e7c, import no changed file, missing-migration signature). NOT blocking.
- **CI re-running on d04086d0d**: CI/main=28429043414, Merge-completeness=28429043403, API-Quality=28429043507, claude-review=28429043471, E2E-Web=28429043425. Watcher bcbh2uaz2.
- **Flagged orch prg06ic-382** (needs-orchestrator). GATE: required-main GREEN on d04086d0d + orch collapse-sweep clean + orch test-only delta-check (d04086d0d vs 53f465e7c = 8 test/helper files) → orch confirm → I merge → /cosmo:execute complete WI-867. NO self-merge.
- Lease for any further object-push = current origin/WI-867 = d04086d0d.
- NOTE: 3 local-DB-stale suites — if local re-runs needed later, re-migrate the local `tests` DB (PGDATA scratchpad/pgdata) to current main first (it lacks WI-902 sentences migration).
