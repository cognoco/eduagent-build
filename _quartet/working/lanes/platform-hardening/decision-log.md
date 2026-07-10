# Decision Log — WS-34 · Platform Hardening

Append-only lane decisions and deviations for WS-34.

## 2026-07-08

- **Activation preflight deviation:** `_quartet/SYNC-PROVENANCE.md` is missing on Orion. Operator explicitly overrode this preflight requirement because Orion is not yet ZDX-standard-conformant. Recorded as local substrate deviation; no framework file patched.
- **Workstream status:** WS-34 "Platform Hardening" (`3918bce9-1f7c-8142-9b75-dfcafbc94d65`) moved from `On hold` to `Open` via Cosmo REST on operator release.
- **DoR re-gate:** live WS-34 census found 17 member WIs. Of 13 marked `Ready`, only WI-1656 currently passes dispatchability from visible properties. The remaining Ready items must go through refine before dispatch; do not route them to executors just because Stage says `Ready`.
- **Reviewer provisioning:** reviewer runtime must differ from executor runtime (Codex). Do not spawn a Codex reviewer for WS-34; operator must provision a non-Codex reviewer or explicitly record an exception outside this binding.
- **Activation gap fixed after shepherd boot probe:** shepherd reported missing `_state/monitor-manifest.json` and `.cosmo-watch/platform-hardening/inbox-watch.ps1`. ORION provisioned both as lane runtime state without patching tracked `_quartet/clacks/*`.
- **Throughput directive issued:** ORION observed WS-34 still single-frontiered (`WI-1656` Executing, 12 Ready, no Workstream Order values) and sent `ws34-orch-004` requiring a lane-shaping checkpoint by `2026-07-08T11:37:38.245Z`: classify all open items, propose Workstream Order, identify safe parallel starts, and begin/refine under shepherd mandate unless a real blocker exists. Inbox watcher logged receipt; no outbox response in the first 90 seconds.
- **PR gate processing:** operator asked ORION to process WS-34 PRs because Clacks gate relay was suspect. PR #1987 (`WI-1178`) passed ordinary gate and was squash-merged at `d791f5d36ac21c8b6db4597636cf99e2e6daa7ba`; local branch deletion failed because `WI-1178` is checked out in an executor worktree, not because merge failed. PR #1989 (`WI-1096`) was not merged: Claude review still had a valid unresolved SHOULD FIX on `curriculum.test.ts` ordering assertions; gate comment posted on the PR.
- **Lane-shaping checkpoint completed late by Orion shepherd:** Workstream Order written for all 17 WS-34 members in 100-point gaps. Missing Effort filled for stale Ready items. `WI-1248` set `State=Blocked` against existing blocker `WI-1298`. `WI-1098` unblocked because `WI-1059` is Closed and promoted to Ready after DoR check. Captured `WI-1298` and `WI-1188` triaged to Backlog and refined to Ready. `WI-1096` remains a Ready WP wrapper whose six children are Closed; it needs WP brief/finalization rather than implementation. `WI-1656` is bounced to Executing because PR #1973 is not landed on main.
- **PR gate processing:** ORION checked open WS-34 PRs at operator prompt. PR #1996 (`WI-1181`) passed gate and was squash-merged at `31dae69bddce93ceb97abb3afab9f479b6d156aa`; local branch deletion failed only because `WI-1181` remains checked out in `.worktrees/WI-1181`. PR #1997 (`WI-1190`) passed gate after CodeRabbit completed and was squash-merged at `92e4be9037185d58b61798d73b6d363ba1ffcce1`; local branch deletion likewise failed only because `WI-1190` remains checked out in `.worktrees/WI-1190`. PR #2000 (`WI-1177`) was held for rework despite green mechanics because Claude review has a valid SHOULD FIX on GC6 deferral for `apps/api/src/routes/assessments.test.ts`; gate comment posted on the PR.
- **PR gate processing:** ORION processed shepherd gate request `gate-request-20260708-green-prs`. PR #2000 (`WI-1177`) passed ordinary gate and was squash-merged at `cb0f39abc8b68392ada99fda65a0ec95ae1aab06`. PR #1998 (`WI-1069`) passed ordinary gate and was squash-merged at `b401d34cd67680391524f28f0b47251e2ebaa77a`. PR #1999 (`WI-1188`) passed ordinary gate and was squash-merged at `ca65844113adc4ab2722dc0d0daa352b87999111`. All three merge commands reported local branch deletion failures only because the corresponding branches are attached to `.worktrees/*`; merges are confirmed.
- **PR gate processing:** ORION held PR #2004 (`WI-1180`) after `main` failed in `Lint, test, typecheck, build (PR - affected only)`. The failure starts in mobile typecheck with many `TS6305` missing-built-output errors against `apps/mobile/dist/*.d.ts`, plus follow-on navigation-contract test type errors. Other checks were green, but ordinary gate remains held until `main` is green on the PR head. Gate-hold comment posted: `https://github.com/cognoco/eduagent-build/pull/2004#issuecomment-4918650930`.
- **Shepherd stale-progress intervention:** At 2026-07-08T20:15:24.8969482Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260708201524 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.

## 2026-07-08 - PR #2004 gate pass

- Ref: ws34-orch-011 / WI-1180 (Upgrade @sentry/react-native off pinned 8.1.0 and reconcile with @sentry/cloudflare).
- Ruling: ordinary gate passed after rework; PR #2004 squash-merged at 660d4c55dd5b72df66f7566bc1d27bee5831ee53.
- Evidence: required checks green; latest Claude review approved; no blocking review state.
- Note: gh reported only local branch deletion failure because .worktrees/WI-1180 owns branch WI-1180.


## 2026-07-08 - PR #2005 gate hold

- Ref: ws34-orch-012 / WI-482 (Split monolithic session/curriculum service modules, first slice).
- Ruling: HOLD, not mergeable yet.
- Evidence: required checks mostly green, but fresh claude-review is IN_PROGRESS and GitHub reports mergeStateStatus=UNSTABLE.
- Next: merge once pending claude-review completes green; current hold is not a code rejection.

- **Shepherd stale-progress intervention:** At 2026-07-08T21:10:25.9864562Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260708211025 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.

## 2026-07-09 - PR #2005 and PR #2008 gate pass

- Ref: ws34-orch-013 / WI-482 and WI-1177.
- Ruling: PR #2005 passed ordinary gate and squash-merged at 367fafb242dcac232292b5a21acde021c92dd204; WI-482 remains Executing for remaining slices.
- Ruling: PR #2008 passed ordinary gate and squash-merged at 95ef139b0bf1487690fc3393b959f2bee80dce4e.
- Note: gh reported only local branch deletion failures because the branches are checked out in .worktrees.

- **Shepherd stale-progress intervention:** At 2026-07-09T06:00:31.6672909Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709060031 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T06:25:32.0031221Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709062532 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T07:20:32.8045590Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709072032 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.

## 2026-07-09 - PR #2009 hold and PR #2010 gate pass

- Ref: ws34-orch-014 / WI-1183 and WI-1179.
- Ruling: PR #2009 (WI-1183 i18n echoed translation guard) is HOLD. Blocking issues: `TRANSLATE_GEMINI_KEY_BATCH_SIZE` must sanitize invalid/non-numeric input to a finite positive default, and the single-chunk translation path must filter returned keys back to the source-key set like the multi-chunk path.
- Follow-up: temporary ADR provenance baseline entries for MMT-ADR-0031/MMT-ADR-0032 should be tied to a hook-fix follow-up so they do not become permanent grandfathering.
- Ruling: PR #2010 (WI-1179 mobile Clerk Expo Core 3 migration) passed ordinary gate and was squash-merged at `2f2dbffb18a0d62d5738f5af8c9cbdcec792572c`.
- Note: `gh` reported only local branch deletion failure because `.worktrees/WI-1179` owns branch `WI-1179`.

## 2026-07-09 - WS-37 takeover two-key gate

- Ref: ws34-orch-015 / WI-1430 and WI-1431.
- Operator approval: two-key approval granted for the DB/migration gate.
- Ruling: PR #1974 (WI-1430 subscription_payers one-primary unique index) passed ordinary gate and was squash-merged at `96168d6c5a57f50c5b8bd9ca68405324f09ddddc`.
- Note: `gh` reported only local branch deletion failure because `.worktrees/WI-1430` owns branch `WI-1430`.
- Ruling: PR #1978 (WI-1431 payer-person FK indexes) has operator approval but remains HOLD at ordinary gate. After PR #1974 landed, GitHub recalculated #1978 as `mergeStateStatus=DIRTY`.
- Next: shepherd must rebase/reconcile #1978 onto current `main`, preserving migration ordering after WI-1430, then re-request gate when clean/green.

## 2026-07-09 - PR #1978 gate pass

- Ref: ws34-orch-016 / WI-1431.
- Ruling: PR #1978 (WI-1431 payer-person FK indexes) passed ordinary gate after rebase/reconcile and prior operator two-key approval.
- Merge: squash-merged at `97353faa30f1c559d81f33335f985b5fe533129a`.
- Note: `gh` reported only local branch deletion failure because `.worktrees/WI-1431` owns branch `WI-1431`.
- Review note: latest review surface had one non-blocking rollback-doc heading typo (`0133` vs `0135`); migration filename, SQL body, checks, and mergeability were correct, so this did not block merge.

## 2026-07-09 - PR #2009 gate pass

- Ref: ws34-orch-017 / WI-1183.
- Ruling: PR #2009 (WI-1183 i18n echoed translation guard) passed ordinary gate after rework and was squash-merged at `ffd9c6a34c3037b52a41cc3e51d0ff1020095721`.
- Evidence: PR was non-draft, `mergeStateStatus=CLEAN`, and 14 visible checks passed with zero failed.
- Prior hold resolution: `TRANSLATE_GEMINI_KEY_BATCH_SIZE` now falls back through a positive-integer parser; the single-chunk translation path now filters returned keys to source keys; the temporary ADR provenance baseline workaround is expiry-aware.
- Note: `gh` reported only local branch deletion failure because `.worktrees/WI-1183` owns branch `WI-1183`.
- **Shepherd stale-progress intervention:** At 2026-07-09T07:45:33.1830103Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709074533 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T08:10:33.5192417Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709081033 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T08:25:33.7134181Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709082533 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T09:25:34.5637475Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709092534 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T09:55:34.9684758Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709095534 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T10:20:35.3326009Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709102035 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T11:10:35.9105402Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709111035 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T11:35:36.1739516Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709113536 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T13:30:37.4817771Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709133037 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
- **Shepherd stale-progress intervention:** At 2026-07-09T19:00:41.0893473Z, watchdog detected no shepherd movement for at least 10 minutes. Sent ws34-orch-stale-20260709190041 requiring outbox acknowledgement, compact/restart if degraded, or handoff/release if blocked.
