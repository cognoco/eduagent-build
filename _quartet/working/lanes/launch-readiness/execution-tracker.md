# Launch Readiness (WS-39) — Execution Tracker

> The lane's substance. The shepherd protocol (`../../../roles/shepherd-protocol.md`) carries process
> only and points here for specifics. **Disposable by construction** — a fresh shepherd pointed at
> this tracker loses nothing but warm cache. Holds *delivery state*; points at rules, roster, and
> live per-WI state (Cosmo) — never duplicates them.

## Charter
Commercial + operational readiness to ship the MVP to production. "Done" = every WS-39 item Closed
or explicitly gate-parked, such that a Config T (V2, V0=off/V1=on/V2=on) **Google-Play-only**
production build can be published with purchases enabled and a proven V1 fallback. This lane owns
the ops/infra/commercial surface (observability, background-job env, prod secrets, transactional
email, store console + submission, monetization) — NOT app-feature code (that is WS-33 / spine).

## Canon authority
- Program roadmap: **PGM-1 "Mentomate productization"** (Cosmo Programs DB, page
  `3928bce9-1f7c-8130-ac4c-c422e9db928d`) — critical path, cross-lane edges, gate ledger, rulings
  queue. Re-read on resume; it is canon for sequencing.
- Architecture authority: `08-convergence-spine.md` (RATIFIED 2026-07-02).
- **MVP scope: Google Play only** — production EAS profile is Android-only (`eas.json`: production
  ios=false, verified 2026-07-03). iOS/App Store is post-MVP and a separate operator ruling.
  Any item scoped to App Store / APNs is refine-and-hold, NOT do-now.

## How to use
Fresh shepherd: read PGM-1, then this tracker, then start Wave A (no-dependency infra items) —
triage→refine→execute autonomously. Wave B items are operator/PM-gated (store accounts, bundle IDs,
prod credentials, irreversible/outward store actions): refine them, surface the gate, and HOLD
(prime-and-hold) — do not execute a gated item. Coordinate the two cross-lane edges with Ramtop on
the edge WI's own Cosmo comments (Ramtop reads Cosmo, not this clacks channel).

## Pointers
- Program roadmap (canon): PGM-1 · `3928bce9-1f7c-8130-ac4c-c422e9db928d`
- Cosmo Workstream: WS-39 Launch Readiness · `3928bce9-1f7c-8179-b62e-e4c252a53747`
- Initiative: INI-32 Operations
- Substrate operating rules: `../../program/planning-rules.md` (if present) / shepherd-protocol.md
- Windows workaround: every `/cosmo:triage` + capture call passes `--judge-provider claude`
  (Unix `which` auto-detect crashes on Windows — WI-1282).

## Units / slice
| WI | Prio | Coarse status | Order | Wave |
|---|---|---|---|---|
| WI-1336 Sentry source-map + alerting baseline | P1 | Executing (builder; gated remainder) | 100 | A — do-now |
| WI-1338 Inngest production environment sync | P1 | Ready — held on operator (Inngest Cloud prod env) | 200 | A — do-now |
| WI-1339 GitHub Environment protection + deploy targeting | P2 | **CLOSED / Done** (lr-inbox-008: main-only policy + orphan secret removed; reviewer-graduated) | 300 | A — do-now |
| WI-1340 Transactional email prod config (incl P0 consent-withdrawal) | P1 | Executing (builder; gated: 2 prod secrets URGENT) | 400 | A — do-now |
| WI-1310 Clerk PRODUCTION publishable key → Doppler prd + EAS | P1 | captured | 500 | **EDGE** (Ramtop spine — blocks M4 rollback build) |
| WI-1328 RevenueCat prod monetization (MVP) | P1 | captured (EP=Assisted) | 600 | B — gated (Option-A ruled; read comments; RC-keys→bundle-republish EDGE) |
| WI-1337 Push notification prod credentials (APNs/FCM) | P1 | captured | 700 | B — gated (FCM for Play; APNs deferred = iOS post-MVP) |
| WI-1335 Store publishing: Play Console records, listings, privacy labels, ratings | P1 | captured | 800 | B — gated (store accounts + operator listing/ratings calls) |
| WI-1341 Store submission pipeline (eas submit + Config T prod build) | P2 | captured | 900 | B — gated (needs store records + prod build) |
| WI-617 Re-enable main branch protection (code-owner review) | P2 | ready | 1000 | B — HOLD until near-launch (re-enabling now would disrupt the active Quartet merge flow) |

Slice scan: all 10 WS-39 items are in-slice. Wave A = 4 no-dependency infra items the operator
green-lit to start. Wave B = operator/PM-gated commercial/store/secret items — refine + prime-and-hold.

## Sequence
Wave A items are mutually independent — run them in parallel where the executor allows, else by
Order. Wave B is gated on operator rulings (store accounts, bundle IDs, product scope) tracked in the
PGM-1 rulings queue; WI-1328 already carries an Option-A ruling in its comments. Hard edges:
- WI-1310 (Clerk prod key) blocks M4 fallback proof in Ramtop's spine lane — coordinate on WI-1310.
- WI-1328 phase-4 RC keys force a fallback-bundle re-publish before M6 (Ramtop spine) — coordinate
  on WI-1328. The fallback-OTA preflight was relaxed 2026-07-03 (RC pair warn-not-fail); WI-1328
  phase-5 re-hardens it.

## Supervision / escalations
- Irreversible / outward-facing (C3): WI-1335, WI-1341 (store submission — public), WI-1337 (prod
  credentials), WI-1328 (live monetization), WI-1310 (prod secret). These require operator confirm
  before any external/irreversible step — escalate via outbox `needs-operator`, never execute silently.
- Out-of-remit (C2): store listing copy, ratings/age bands, product prices/scope, bundle IDs,
  launch timing — operator's call. Refine + hold.
- Cross-lane (edge): coordinate with orchestrator:ramtop on the edge WI's Cosmo comments.

## Current position
_Updated 2026-07-04 ~19:21Z by shepherd (session c25d4c51)._

> ### LATEST (2026-07-04 ~19:21Z) — post-compaction resume, MERGE-GO executing
> **WI-1504: CLOSED/Done.** AC5 re-scoped→WI-1588 in the Acceptance Criteria prop (RE-SCOPED marker verified); re-scope note added to completion summary Caveats; re-completed Executing→Reviewing (Fixed In squash `19739dd4`); review --disposition done → **Reviewing→Closed** (CI gate PASS: required checks green for 19739dd4). Comment 3938bce9-1f7c-810c-b382-001d742f5f6e.
> **WI-1588 confirmed CAPTURED:** page `3938bce9-1f7c-81f6-8067-daee7de1ffe0` — "LAUNCH-BLOCKING: verify activation instrumentation (WI-1504) + LLM kill-switch (WI-1505) end-to-end vs a real migrated Neon DB + KV in a staging/prod-profile build".
> **WI-1505 / #1900:** re-run 28716187835 (the flaky mobile `session/index.test.tsx [WI-859]` job = "main" job) IN FLIGHT; watcher **bu72c0dvz** (until run status=completed). ORION guardrail lr-inbox-062: GREEN→merge #1900 squash→`execute.ts complete WI-1505-artifacts success --fixed-in <#1900-squash-url>` (summary pre-validated). RED-AGAIN→STOP, check if session/index.test.tsx is red on main independently, report, NO 2nd re-run, never weaken test.
> **STILL TODO:** (A) #1900 per re-run result; (C) note deploy-time-AC re-scope pattern in docs/pre-launch-checklist.md; (D) report ORION (lr-out-083): re-run result + #1900 SHA/root-cause + WI-1588 id + both WIs final stage.

> ### RESUME SNAPSHOT (read first on resume/post-compaction)
> **Monitors DIE on session end — RECONCILE FIRST** (`clacks/monitor-hygiene.md`): re-arm both per
> `_state/monitor-manifest.json`, update task-ids. NOTE: monitors SURVIVE `/compact` (session continues) —
> after a compact, check for and TaskStop any duplicate/stale watchers before/after re-arming. (1) inbox
> watcher (live `bi7egko32`) — poll `_state/inbox.jsonl` 45s, emit id>last-seen; (2) WS-39 Stage watcher
> (live `bhx1gbegl`) — `bash _quartet/clacks/orch-stage-monitor.sh 3928bce9-1f7c-8179-b62e-e4c252a53747 180`.
> Baselines will differ; that's fine.
> **Clacks cursors:** outbox at **lr-out-080** (next id = lr-out-081); inbox last-read **lr-inbox-060**.
> **WI-1504 REVIEW-BOUNCED (Gate-2 rework, CLEAN not half-state):** cosmo:review REJECTED on AC 5 (end-to-end real-rows-in-Neon) — unsatisfiable at merge-time (migration not applied to Neon = deploy-gated/barred + mobile dispatch = WI-1570). My complete ran fully clean; bounce is normal review->rework. **ESCALATED lr-out-080 — DECISION PENDING:** re-scope end-to-end/staging-verification ACs as deploy-time/pre-launch tracked gates (my rec) vs hold in Executing. **WI-1505 #1900 has the SAME AC pattern (staging rehearsal) -> will bounce identically.** HOLDING #1900 merge+complete + WI-1504 rework until ORION rules. #1900 rebased+pushed (c530b7439).
> ============ RESUME SNAPSHOT (compact 2026-07-04 ~19:22Z) — MERGE-GO IN PROGRESS ============
> **Cursor: outbox lr-out-082, inbox last-read lr-inbox-062.** Branch=main. Monitors: inbox **b0mu7po2v**, Stage **b8icy1wlc**, #1900-CI **b999p1yao** (watching the flaky re-run). (Manifest lists b0mu7po2v/b8icy1wlc.)
> **#1894 (WI-1504): MERGED squash `19739dd411ac3c768effe73e3fce8b17f03f5dd4`** + completed(clean)→Reviewing→ **Gate-2 review REJECTED on AC5 → Executing (rework)**. Clean state, not half. AC5 = "instrumentation verified end-to-end (real event rows in Neon) in staging/prod-profile build" — UNSATISFIABLE at merge (migration not applied=deploy-gated/barred + mobile dispatch=WI-1570).
> **#1900 (WI-1505): rebased clean onto new main (head `c530b7439`), force-pushed (pre-push green). NOT merged, NOT completed.** CI red on MOBILE FLAKY (session/index.test.tsx [WI-859] 58s timing; WI-1505 API-only=can't cause). **Flaky re-run TRIGGERED ONCE (authorized, run 28716187835); monitor b999p1yao.**
> **ORION RULINGS (lr-inbox-061/062):** (1) AC-5 RE-SCOPE APPROVED (re-scope NOT drop): move deploy-time verification ACs (WI-1504 AC5 real-Neon-rows; WI-1505 staging-rehearsal) OUT of code-merge close-gate; both close on code+schema deliverable; MANDATORY verification-gate WI = **WI-1588** (CAPTURED, launch-blocking, WS-39, after migration-apply+WI-1570+WI-1503; related WI-1504/1505/1570/1503). Note the pattern in docs/pre-launch-checklist.md (guardrail: only genuinely deploy-gated ACs). (2) Flaky re-run ONCE: GREEN→merge #1900 (no stale base); RED-AGAIN→STOP, check if session/index.test.tsx red on main independently, report before merge, NO 2nd re-run, never weaken test.
> **EXACT NEXT STEPS:**
> A) On #1900 re-run (b999p1yao): GREEN→ `gh pr merge 1900 --squash` → capture squash SHA → `execute.ts complete <scratchpad>/WI-1505-artifacts success --fixed-in <#1900-squash-url>` (summary PRE-DRAFTED+VALIDATED, staging-rehearsal AC re-scoped to WI-1588). RED-AGAIN→ STOP+investigate main+report, no 2nd re-run.
> B) WI-1504 re-close (independent, MID-STEP): (i) amend AC5 in the "Acceptance Criteria" rich_text prop (page 3928bce9-1f7c-81a7-923c-cd1e961c53fa) to re-scope AC5→WI-1588; (ii) add re-scope note to scratchpad/WI-1504-artifacts/completion-summary.md Caveats; (iii) re-complete WI-1504 (Executing→Reviewing): `execute.ts complete <WI-1504-artifacts> success --fixed-in https://github.com/cognoco/eduagent-build/commit/19739dd411ac3c768effe73e3fce8b17f03f5dd4`; (iv) `review.ts --wi-id WI-1504 --disposition done --note "AC5 re-scoped to WI-1588 launch-blocking gate (ORION lr-inbox-061)"` → closes. NOTE: review.ts needs item at Reviewing (exit1 if Executing). cmd dir = cosmo/0.6.24/skills/{execute,review}/.
> C) Note the deploy-time-AC re-scope pattern in docs/pre-launch-checklist.md (ORION guardrail #4).
> D) Report ORION (lr-out): re-run result + #1900 merge SHA (or root-cause) + WI-1588 + both WIs final stage.
> Artifacts: scratchpad/WI-1504-artifacts/completion-summary.md (validated, needs re-scope note) + WI-1505-artifacts/completion-summary.md (validated, ready). bun=/c/Tools/bun/bun.exe.
> ============ END RESUME SNAPSHOT ============
> **MERGE GO (lr-inbox-059) IN PROGRESS:** #1894 (WI-1504) MERGED squash **19739dd411ac3c768effe73e3fce8b17f03f5dd4** -> /cosmo:execute complete DONE -> Stage=Reviewing (Fixed In = squash URL; draft-PR-open warning harmless=already-merged). #1900 (WI-1505) REBASED onto new main (clean, 5 commits, head c530b7439) + force-pushed (pre-push green) -> **CI re-running, monitor bx8uni32z**. At GREEN -> merge #1900 squash -> complete WI-1505 (summary pre-drafted+validated in scratchpad/WI-1505-artifacts, --fixed-in the #1900 squash URL). If #1900 CI RED on rebase -> STOP + report (don't force). Then report BOTH landed SHAs to ORION.
> **MONITORS RE-ARMED FRESH (user-requested restart ~16:50Z):** inbox **b0mu7po2v** (baseline lr-inbox-055) + WS-39 Stage **b8icy1wlc** (baseline zero-drift). Old bigee359j/b4htgdxro stopped. Manifest updated. Sent lr-out-076 RECONNECT/back-to-work ping — awaiting ORION: merge-go flipped? new work? else idle+heartbeat. Both #1894/#1900 prepped, operator active-HOLD, no self-merge.
> **ALL AUTHORIZED NON-GATED PREP COMPLETE (lr-out-069/071/073).** WI-1506 refined->Ready. WI-1503 dogfood runbook authored (21891 ch) + next-day-return reframed to push-re-engagement-by-design; attached WI-1503 Cosmo. WI-1500 operator alert-rules checklist authored (27350 ch, 6 buckets + 7th volume rule, console-form) + attached WI-1500 Cosmo — caveats: bucket2 no-signal-on-main (held code slice), bucket7 WI-1505-branch-only (create post-#1900-merge), 5a/5b overlap BUG-992/993. Staged artifacts (scratchpad WI-1503-dogfood-runbook.md + WI-1500-operator-alert-rules-checklist.md); NO repo commit (docs/ at exec). **NOW GENUINELY IDLE + HEARTBEAT** (ORION-sanctioned). #1894/#1900 operator active-HOLD (prepped, no self-merge); act on ORION merge-go relay. Boundary: no exec of gated items, no code slice, no merge-bound code.
> **BOTH authorized non-gated prep items DONE (lr-out-069/071):** WI-1506 refined->Ready (prime-and-hold split); WI-1503 dogfood RUNBOOK authored (21891 chars, scratchpad WI-1503-dogfood-runbook.md; summary attached to WI-1503 Cosmo page comment). Key finding: today's committed eas.json prod profile = LEGACY nav not Config-T -> WI-1503 device run hard-blocked on WI-1341. Both device/beta RUNS stay prime-and-hold on operator greenlight. **GENUINELY IDLE-PRODUCTIVE now:** #1894/#1900 operator active-HOLD (prepped, no self-merge); WI-1503/1506 exec + WI-1500 code slice + all merge-bound code held. Heartbeat each loop; act on ORION merge-go relay or new non-gated direction.
> **WI-1506 REFINED -> Ready (Assisted/M)** — autonomous-prep (beta runbook/cohort/feedback-mechanism/go-no-go) vs operator-human-gated-run (recruit families + Play closed-testing + run + readout) split; deps WI-1335/1341/1503. **EXEC HELD on operator greenlight (lr-inbox-050) — NOT started.** WI-1503 runbook-prep still available as next non-gated item.
> **MONITORS: single clean coverage = bigee359j (inbox, baseline lr-inbox-049) + b4htgdxro (WS-39 Stage).** Old bi7egko32/bhx1gbegl had SURVIVED the teardown (dupes) -> STOPPED both ~14:52Z. Manifest updated.
> **OPERATOR ACTIVE-HOLD on both #1894 + #1900 (lr-inbox-050, ~14:40Z)** — not imminent; keep prepped, NO self-merge, no re-post merge-readiness each loop, just heartbeat; ORION relays when hold->go.
> **AUTHORIZED non-gated prep during hold (lr-inbox-050):** WI-1506 refine-to-Ready (IN PROGRESS — research agent a4999cb2a16e57f48 drafting AC; closed-beta ops item, expect prime-and-hold shape) + WI-1503 runbook-prep (available). **NOT allowed:** WI-1506 exec (operator-gated), WI-1500 code slice / new merge-bound code.
> **BOTH #1894 (70f4e528b) + #1900 (524308181) Gate-1 CLEARED by ORION + MERGEABLE/CLEAN vs main — PREPPED, held for OPERATOR merge-go (ORION relays). NO self-merge.** MERGE-ORDER (lr-inbox-049): disjoint areas, either order; whichever lands SECOND -> rebase on main + re-run CI green BEFORE merging (first merge advances main). On operator go: merge both back-to-back -> /cosmo:execute complete each -> Reviewing. THEN launch-ops queue: WI-1500 (code slice+runbook+7 operator alert-rules incl volume rule), WI-1503 (runbook prep + device prime-and-hold), WI-1506 (refine only, exec gated on operator greenlight). Follow-ups tracked: WI-1566/1570/1574/1575.
> **#1900 (WI-1505) MERGE-READY (lr-out-065), HOLDING ORION Gate-1 + operator merge-visibility.** CI 9/0; claude-review APPROVED; CodeRabbit :199=false-positive (routeAndStream test verified @ test:138), :278=minor non-blocking, :459=WI-1566 defer (in body); ratchet-gap=WI-1575 (in body); volume-AC=metric-hook confirmed, rule folded to WI-1500. Branch 524308181 (5 commits). **BOTH #1894 + #1900 now merge-ready + Gate-1 status: #1894 Gate-1 CLEARED, #1900 awaiting ORION Gate-1; BOTH held for operator merge-go (ORION relay only). NO self-merge.**
> **WI-1575 captured** (ratchet-gap: fold ci.yml whole-tree ratchets into check-change-class.sh; Enhancement/DevEx P2, WS-39, refine-to-Ready, held behind launch-ops queue) + cited in #1900 body. ORION ACK lr-out-064.
> **#1900 no-gemini fix DONE + pushed 524308181** (branch now 5 commits). Swapped 7 test mock-vendor strings gemini->openai (identical logic), check:no-gemini-runtime exit 0 (0 new), 8/8 tests, no --no-verify, pre-push green. **#1900 CI re-running (4th) — monitor bnzf0otyw.** At GREEN -> re-triage advisory (expect APPROVE; CodeRabbit router.ts:459=WI-1566 defer + WI-1575 ratchet-gap both in body) -> #1900 merge-readiness. **#1894 held for operator merge-go (ORION relay only).**
> **#1900 CI re-run #3 = 8/1 FAIL: No-Gemini-runtime ratchet (llm-kill-switch.test.ts:269 registers `gemini` mock = new excluded-vendor coupling). WI-1505-caused.** Executor resumed: swap test mock vendor gemini->openai/cerebras + run `pnpm run check:no-gemini-runtime` explicitly + push. **RECURRING: 3rd standalone ci.yml ratchet (metering / RLS-registry / no-gemini) escaping BOTH pre-push AND change-class checker --branch.** (lr-out-063: possible follow-up to fold ratchets into check-change-class.sh.) At GREEN -> re-triage advisory -> #1900 merge-readiness. **#1894 held for operator merge-go (ORION relay only).**
> **TIMING: clacks Z-stamps are UTC (Oslo=UTC+2); my local clock reads ~2h behind — treat clacks stamps as authoritative UTC.** WI-1505 executor RESUMED cleanly (reset passed) — finishing the 3 volume tests -> commit+push -> re-CI+re-triage -> #1900 merge-readiness. #1894 held for operator merge-go (ORION relay only).
> **#1900 volume-test SHOULD-FIX DONE + pushed c05324a73** (branch now 4 commits). 3 volume tests green @ real threshold 5000 (red-green proven: no-latch=>6 alerts), router.ts unchanged (latch intact), routeAndStream test strengthened (CircuitOpenError AND provider==='kill-switch'). NO --no-verify (test-only), full hooks + pre-push green (8/8). **#1900 CI re-running — monitor b1kt1rq7b.** At GREEN -> re-triage advisory new head (should now be APPROVED — volume SHOULD-FIX resolved; CodeRabbit router.ts:459 = WI-1566 deferral, documented) -> #1900 merge-readiness. **#1894 STILL held at merge-ready — NO operator merge-go yet; merge ONLY on ORION's explicit relay.**
> **#1900 CI GREEN 9/0 (create-profile fail was mobile FLAKY, confirmed by re-run).** Advisory re-triage: NEW claude SHOULD-FIX = recordVolumeMetric (router.ts L439-468) 3 invariants (exactly-once daily alert/UTC-reset/_resetVolumeCounters) have ZERO test coverage -> resolving IN-PR (executor adding 3 GC1 volume tests w/ real threshold). CodeRabbit router.ts:459=WI-1566 deferral (no action); test:188 routeAndStream=already added (verifying). NOT merge-ready until volume tests land + CI/advisory re-clean. Executor abe9e77 running.
> **#1894 GATE-1 CLEARED by ORION (lr-inbox-043), HARD no-self-merge -> now at OPERATOR merge-visibility (ORION relaying operator go). DO NOT self-merge; wait for ORION's relay of operator merge-go.** Compliance done: WI-1574 carries owner=WS-39 + target 2026-07-31 (comment); #1894 body documents WI-1574 deferral + 4 sibling sites + retains WI-1570 note (both verified present).
> **#1900 advisory fixes DONE + pushed 8ce016f8d** (branch now 3 commits: c34e8e373 feat + 5c9e5b8b1 CI-fix + 8ce016f8d advisory). Runbook Sentry->logger.warn corrected; routeAndStream kill-switch test 5/5; _resetVolumeCounters in beforeEach; #1900 body has WI-1566 fail-open deferral + volume-AC-metric-hook confirm. No --no-verify this round (only test+doc staged). Pre-push green. **#1900 CI re-running — monitor blha1z4a9.** At GREEN -> RE-TRIAGE advisory new head -> merge-readiness. WI-1500 gains 7th operator item (llm.volume.daily_threshold_exceeded rule) at its exec.
> **#1894 MERGE-READY (lr-out-058), HOLDING ORION Gate-1 + operator merge-visibility.** CI 14/0; claude-review APPROVED (0 must/should, security fix cleared, verified); CodeRabbit 2 Major maintainability (service-layer extraction, 4 sibling sites) + 2 Minor -> DEFERRED to tracked **WI-1574** (behavior-neutral, AGENTS.md deferred-sweep; claude clean). Branch 70f4e528b. **#1900 CI re-run #2 = 8/1 FAIL 'main' = @eduagent/mobile create-profile.test.tsx [BUG-UX-PROFILE-TIMEOUT] — SUSPECTED FLAKY (WI-1505 API-only, zero mobile footprint). Re-ran failed job (run 28703745690), monitor b2zw5cyi4.** If green -> flaky confirmed. Per-PR: CI-green + advisory-clean -> merge-readiness -> HOLD ORION Gate-1 + operator merge-visibility.
> **WI-1505 #1900 CI GREEN (9/0) — advisory TRIAGED (norm applied), CHANGES_REQUESTED.** Fix in-PR: runbook Sentry->logger.warn mismatch (claude SHOULD-FIX + CodeRabbit #3, §1/§5/§6) + _resetVolumeCounters beforeEach (CONSIDER) + routeAndStream kill-switch test (CONSIDER + CodeRabbit #1). **ESCALATED (lr-out-056) — DECISION:** CodeRabbit #2 router.ts:459 isolate-concurrency (setLlmKillSwitchActive module-global race). My rec: DEFER to WI-1566/fast-follow (same as existing V2/env globals; low+transient impact; proper fix = heavy lift on router purity). **Executor HELD for ORION ruling -> batch all fixes ONE push.** DO NOT declare #1900 merge-ready until advisory dispositioned.
> **DEFERRED housekeeping:** MEMORY.md at 20.2KB (approaching 24.4KB) — hook asked to compact to <17.1KB; deferred until the launch-readiness PRs settle (non-blocking).
> **WI-1505 volume-alert AC (lr-inbox-039 confirm):** structured llm.volume.daily_threshold_exceeded log SATISFIES the AC as a metric hook. Operator alerting IS wanted -> FOLD the volume-threshold alert RULE into WI-1500's operator alert-rules checklist (7th item; do NOT re-add Sentry to router). TODO at #1900 merge-readiness: (a) note AC-confirm in #1900 PR body, (b) add llm.volume.daily_threshold_exceeded rule to the WI-1500 operator-console ask.
> **WI-1504 SECURITY FIX DONE + pushed 70f4e528b** (verified: ingest schema eventType now = clientActivationEventTypeSchema (6 client types) @ activation-events.ts:72; server-owned types rejected at Zod boundary; redundant route filter removed; red-green test; 4 server call sites verified INVOKED — NO account.ts site (ORION list was speculative); #1894 body has WI-1570 staged-boundary note via gh api PATCH). **#1894 CI re-running (4th) — monitor bkgg34h5z.** At GREEN -> RE-TRIAGE advisory on new head (norm) -> merge-readiness. HOLD Gate-1.
> [prior] **WI-1504 #1894 Gate-1 HELD (lr-inbox-040 (B)):** CI green but advisory claude-review CHANGES_REQUESTED, ORION requiring the SHOULD-FIX. Executor resumed: (1) add clientActivationEventTypeSchema z.enum(6 client types) as ingest eventType boundary + red-green test (server-owned type must 4xx at schema); keep full schema for internal writers; remove redundant CLIENT_DRIVEN_EVENT_TYPES route filter. (2) verify server-owned call sites reached (account/sessions/profiles/session-filing-dispatch); note WI-1570 (captured mobile-instrumentation follow-up — 6 client types have no mobile dispatch yet) in #1894 body. (3) optional closure refactor. Then checker+push+re-run CI+advisory. **LESSON: triage the advisory claude-review MYSELF before declaring merge-ready (I punted #1894's to ORION).** Apply to #1900.
> **PRACTICE (ORION loop-tightener lr-inbox-037):** every executor brief MUST tell the executor to run `bash scripts/check-change-class.sh --run` (or `--branch` vs main) BEFORE push — runs the whole-tree guards CI runs (both RLS guards, metering.coverage, flag-on integration) that targeted --findRelatedTests misses. Batch all guard fixes, push once green. Relayed to both live executors.
> **WI-1504 BOTH RLS guards FIXED + pushed 6bd03cd9f** (confirmed on origin). Added activation_events to PROFILE_SCOPED_TABLES (feeds ALL_RLS_TABLES) in database-rls-coverage.ts. Executor ran change-class checker: api:typecheck green, api:lint 0 err, test:api:unit 7965/0, database:test 295/295, both RLS guards green. **#1894 CI re-running (3rd) — monitor bzl4ffcz3.** At GREEN -> post WI-1504 merge-readiness to ORION, HOLD Gate-1. (Note: #1894 change-class=db-schema, does NOT trigger the flag-on integration reds #1900 hit.)
> **WI-1505 #1900 FIXES DONE + pushed 5c9e5b8b1** (confirmed origin; #1900 CI re-running, monitor **bv9a9jwxu**). Metering: REWORD kv.ts comment (no exemption). BOTH integration failures = REAL REGRESSIONS caused-by-WI-1505 (NOT pre-existing — my hypothesis was wrong): root cause = `import captureMessage from services/sentry` into router.ts coupled Sentry -> broke @sentry/cloudflare jest-mock in integration suites asserting capture. Fix = removed import, volume alert now logger.warn. Post-fix subject-management 22/22 + session-completed 3/3. Change-class checker all-green (api:unit 7969/0), pre-push 4144/0. At GREEN -> post #1900 merge-readiness. Cursor: outbox lr-out-051.
> **lr-inbox-035 refinements relayed to WI-1505 executor:** (1) metering fix = REWORD kv.ts doc comment (drop literal routeAndCall token) > exemption; (2) integration: session-completed-chain LOW-scrutiny confirm-main-red, subject-management HIGH-scrutiny explicit-repro-on-main (real regression if branch-only). Merge-readiness MUST separate caused vs pre-existing-main-red.
> **WI-1504 RLS FIX DONE (verified):** pushed 025c66f86; migration 0131 has ENABLE RLS + nullable policy (profile_id IS NULL OR =session-profile) — independently confirmed the SQL. Red-green test 11/11. Validation green (database:test 295/295 incl rls-coverage). Caveat: runtime RLS defense-in-depth-only on managed Neon (BYPASSRLS). **#1894 CI re-running — monitor b6nvj84an.** Report ORION at green; HOLD for Gate-1.
> **WI-1505 #1900 CI RED (2 checks) — executor fixing:** (1) metering.guard: add kv.ts to LLM_CALL_SITE_EXEMPT (comment-mention of routeAndCall); (2) Flag-ON integration (subject-management + session-completed-chain) = caused-vs-preexisting triage (session-completed-chain = known main-red). Executor abe9e77fef218e464 running.
> **WI-1505 global-middleware scoping (lr-inbox-033): DEFERRED** — assessed non-trivial (llmMiddleware is api.use('*'); clean options break pure-router/tests, brittle path-scope, or weaken next-request AC). Captured **fast-follow WI-1566** (P3 Enh, WS-39) + noted deferral in PR #1900 body. Wasted-I/O only, enforcement correct at choke point.
> **WI-1505 DONE:** pushed c34e8e373, **PR #1900 OPEN, CI running** (monitor). Billing-regression = self-inflicted test artifact (extra captureException from new global-middleware read on a fake-KV billing test), fixed by removing the newly-added captureException (fail-open+structured log); billing.ts untouched, no real signal-loss. Pre-push full gate GREEN (jest 4144/0). --no-verify on commit (documented eval-snapshot false-positive), real gate ran on push. Review note: kill-switch read in GLOBAL llmMiddleware. FLAG ORION full merge-readiness at #1900 green; HOLD for Gate-1.
> Re-read `_state/inbox.jsonl` for any id > lr-inbox-030 on resume (a reply may have landed).
> **WI-1504 PR #1894 CI = RED (real catch, lr-out-041):** @eduagent/database rls-coverage.test.ts ASSUMP-F14 — new `activation_events` table missing `ENABLE ROW LEVEL SECURITY` in migration. 13/14 pass, lint warnings-only. FIX (queued for 10am WI-1504 executor resume, APPROVED lr-inbox-031): add `ALTER TABLE "activation_events" ENABLE ROW LEVEL SECURITY;` to the WI-1504 migration — ALLOWED pre-merge (branch, not applied). **HARD CAVEAT: do NOT blind-copy practice_activity_events' policy — activation_events.profile_id is NULLABLE (pre-account writes). Policy MUST admit NULL-profile rows (system/pre-account) AND scope non-null rows by profile_id. REQUIRE a red-green test proving a profile_id=NULL row survives the write path after the policy. If sibling pattern can't express nullable cleanly -> ESCALATE needs-orchestrator, do NOT force.** Then push -> CI re-runs. **@10am resume BOTH executors:** WI-1505 (abe9e77fef218e464) = billing-regression resolve + amend+push; WI-1504 (a8cdcfb84e447e28d) = RLS-enable migration fix + push. CI monitor bwaomw3c5 EXITED (terminal) — re-arm a fresh CI watch after the WI-1504 re-push.
> **RULING lr-inbox-030 (post-boot):** (1) WI-1505 executor RESUMES @10am Oslo reset — MUST first resolve the "billing regression": surface exact trigger + prove structured log replaces any billing/spend observability the captureException gave; if it masks a real signal STOP+escalate (red-green-revert). I open PR on push, HOLD for Gate-1 go. (2) WI-1504 PR #1894 HOLD — ORION reviews at CI-green + operator-coordinated merge; migration committed-not-applied. (3) **WI-1506 = mine** (Task P1 "Run small closed beta w/ 5-10 real families") — TRIAGED -> Backlog; refine->Ready OK (safe/reversible) but **HOLD at execution — NO claim/exec until ORION confirms operator-greenlit** (PM provenance check pending). Likely prime-and-hold ops item like WI-1503.
> **NEXT (budget: account rate-limited until ~10am Oslo, subagents dead till then):** @10am — resume WI-1505 executor (abe9e77fef218e464) w/ billing-regression requirement; dispatch WI-1506 refine research agent (150x pattern) OR refine inline. Meanwhile: watch WI-1504 #1894 CI -> report green to ORION (do NOT merge).
> **~08:48Z BOOT RECONCILE (post 10h pause):** Monitors ALIVE (firing) — do NOT re-arm. WI-1504 PUSHED (032d7b591) + **PR #1894 OPEN, CI running**. WI-1505 committed local (a3da2b139) + UNCOMMITTED kv.ts fix (drops captureException from kill-switch read error-path -> structured log; REVIEW at CI), NOT pushed. BOTH executors DIED on account weekly API limit (resets 10am Oslo). WI-1505 finish deferred to executor-resume @10am (holds billing-regression context) OR I amend+push — awaiting ORION pick (lr-out-039). **NEW: WI-1506 in WS-39 (Captured 08:41Z) — escalated, awaiting ORION mine?**
> **HARD GATE still active:** flag ORION + hold before ANY Gate-1 merge. WI-1504 PR #1894 is UP but NOT to be merged until ORION's go.
> **HARD GATE (ORION lr-inbox-027):** FLAG ORION on the clacks BEFORE any Gate-1 merge to main (PR link + CI-green + diff summary) and HOLD for his go. Do not merge WI-1505/WI-1504 without posting merge-readiness first.
> **WI-1500 DECISION RULED (lr-inbox-026):** cover all 8 in 6 buckets, merges approved -> PROMOTED to Ready. WI-1500 operator-console alert-rule ask relayed (lr-out-036).
> **NEW WORK — RULED IN (ORION lr-inbox-024, PM program-manager:fable 21:28Z): charter 10->13, run autonomous lifecycle NOW.** "No new work" hold SUPERSEDED. Three P1 items + one excluded:
> - **WI-1500** launch health signals — MVP = **ALERTS ONLY** on the 6 named silent-failure signals, **NO dashboard** (fast-follow); absorb overlap w/ **WI-1399**. Triage->refine->**execute alert wiring** autonomously.
> - **WI-1505** LLM spend guardrails + traffic kill switch — HARD AC: shutoff **must work server-side WITHOUT an app release**. Triage->refine->**execute**.
> - **WI-1503** dogfood exact prod-profile build E2E — **sequence with WI-1341 internal-track dry run**; refine + all autonomous prep, then **PRIME-AND-HOLD at final pass** (needs human + real device -> escalate needs-operator, do NOT fake).
> - **WI-1504** activation instrumentation — **RULED IN (lr-inbox-025, exclude LIFTED).** Analytics sink = **FIRST-PARTY events only -> own API -> Neon -> SQL** for MVP. **Do NOT wire PostHog** (post-MVP fast-follow). Refine to the ACs on the WI-1504 page -> execute (event instrumentation writing to Neon).
> Guardrail intact: no irreversible/outward step without escalating needs-operator. Plan posted lr-out-033/034.
> **PROGRESS:** TRIAGE DONE 4/4 -> Backlog (EP=Assisted): WI-1500 Feature, WI-1503 Task, WI-1504 Feature, WI-1505 Feature (lr-out-034). **REFINE IN FLIGHT:** DoR --check shows AC already recorded on all 4; only Effort unset + framing checklist (surface_read/problem_framed/outcome_done) to confirm. Dispatched 4 read-only Sonnet research agents (fetch recorded AC + inspect real code surface + draft reconciled RefinePatch per rider). Page-ids: WI-1500=3928bce9-1f7c-81ee-84e1-f384b11dfb49, WI-1503=3928bce9-1f7c-8138-b802-d45c225296b1, WI-1504=3928bce9-1f7c-81a7-923c-cd1e961c53fa, WI-1505=3928bce9-1f7c-811b-9ea7-cfbb7f7a8d42. Refine cmd: `/c/Tools/bun/bun.exe "C:/Users/ZuzanaKopečná/.claude/plugins/cache/zdx-marketplace/cosmo/0.6.24/skills/refine/refine.ts" --wi-id WI-NN --to-ready` with patch on stdin/--patch-file.
> **REFINE RESULT (21:44-47Z): 3/4 -> Ready** (patches saved in scratchpad wi15xx-patch.json). WI-1505 Assisted/M (server-side KV kill switch @ routeAndCall router.ts:1309, +aggregate spend alert). WI-1504 Assisted/M (new activation_events Neon table + safeWrite path safe-non-core.ts:111, first-party/no-PostHog). WI-1503 Assisted/S (Ready but exec-blocked on WI-1341; autonomous runbook prep can start, device pass = prime-and-hold needs-operator). **WI-1500 HELD in Refining** on 6-vs-8 decision (lr-out-035). Anchors spot-verified: routeAndCall@1309, kv.ts read/write@56/85, safeWrite@111, recordPracticeActivityEvent@43, eas.json production=app-bundle+MODE_NAV-only(Config-T gap).
> **EXECUTION PHASE (IN FLIGHT as of ~21:52Z):** REFINE 4/4 Ready. WI-1505 + WI-1504 CLAIMED (Stage=Executing, claimant claude:launch-readiness:WI-NNNN, artifacts in scratchpad/WI-NNNN-artifacts/). Two worktree executors dispatched (Sonnet, background) — implement AC + typecheck/lint + tests, commit+push their OWN branch (WI-1505 / WI-1504), NO PR, NO merge. On each executor report: (1) review the pushed diff (`gh pr diff` after I open PR, or `git show`/`git diff main..WI-NNNN`); (2) open PR via `gh pr create`; (3) verify CI green (jest authoritative in CI — worktree jest unreliable per repo memory); (4) Gate-1 merge to main; (5) `/cosmo:execute complete <artifacts-dir> success` (auto Fixed In from merge commit) -> Reviewing. Migration SQL on a branch is REVERSIBLE; `drizzle-kit migrate` vs Neon is the separate deploy-gated irreversible step — NOT run here.
> **STILL TODO after 1505/1504 land:** WI-1503 autonomous runbook prep (author dogfood runbook + config-verify; device pass = prime-and-hold needs-operator, blocked on WI-1341). WI-1500: claim -> code slice (add captureException on router.ts LLM-fallback path) + author docs/runbooks/launch-health-alerts.md -> then OPERATOR creates the 6 Sentry/Inngest alert RULES (relayed lr-out-036) -> I verify rules exist -> complete.
> **Executor agent ids (background):** WI-1505=abe9e77fef218e464, WI-1504=a8cdcfb84e447e28d (resume via SendMessage if needed; both DIED on weekly API limit ~08:0x, resets 10am Oslo).
> **CI monitor** on WI-1504 PR #1894 = task **bwaomw3c5** (token-free gh poll; emits when checks terminal). Core monitors still live: inbox bi7egko32, Stage bhx1gbegl.
> **WI-1505 (~22:30Z): IMPLEMENTATION COMPLETE + validated GREEN** (typecheck+lint green; jest 4/4 new llm-kill-switch.test.ts + 27/27 existing pass, NOT worktree-blocked). 7 files +518/-0: kv.ts (readLlmKillSwitch/writeLlmKillSwitch, key `llm:kill-switch` on SUBSCRIPTION_KV), router.ts (checkLlmKillSwitch() first stmt of routeAndCall@1458 + routeAndStream@1890, throws CircuitOpenError->503 LLM_UNAVAILABLE), middleware/llm.ts (per-request KV read), index.ts/test-utils.ts (exports), llm-kill-switch.test.ts, docs/runbooks/llm-kill-switch.md. Kill switch = per-request KV read => next-request effect, no redeploy/no app release. COMMIT was blocked by the eval-snapshot pairing guard = the DOCUMENTED false-positive (memory project_eval_snapshot_guard_routing_false_positive). I VERIFIED staged diff routing-only (no *-prompts.ts, no eval-llm/snapshots changes) and AUTHORIZED the sanctioned documented `git commit --no-verify` (executor runs prettier/eslint/tsc manually first, pushes NORMALLY so pre-push real-gate runs). **DISCLOSE the --no-verify to ORION in the merge-readiness flag (transparency).** Awaiting pushed SHA + pre-push result.
> WI-1504 executor still running. Per-WI next: review diff -> gh pr create -> CI green -> **flag ORION (HARD GATE lr-inbox-027/028) + hold for go** -> Gate-1 merge -> execute.ts complete.
> **lr-out-022..029** = heartbeat ACKs (lr-inbox-014..021). **lr-out-030** = consolidated OPERATOR-ACTION CHECKLIST answering ORION pick-up directive lr-inbox-022; ORION ACK'd (lr-inbox-023) + relayed verbatim. Verified 2026-07-03T~21:12Z: PR #1857+#1861 MERGED to main, green, no changes-requested, zero open lane PRs; live Cosmo re-query = zero drift vs scorecard. **lr-out-031** = ACK lr-inbox-023 + state-integrity note.
> **STATE-INTEGRITY EVENT (~21:14Z):** the `_state/` tree across 4 lanes (launch-readiness/mobile-ux-nav/platform-hardening/safety-eval) briefly vanished then restored ~1s later with new mtimes (external git-add/sync refresh). Impact: my first lr-out-031 append failed mid-window (re-posted OK); the jsonl files kept current content, but `execution-tracker.md` was rolled back to the lr-out-028 snapshot (this cursor block + notes had to be re-applied). NO clacks data lost. If cursors here look stale after any future sync, trust `_state/*.jsonl` last ids as ground truth and re-apply.
> **NEXT expected inbound:** Ramtop hand-off of WI-1337 once operator confirms the FCM V1 key (mentomate-9d02f) is uploaded to EAS @zuzanka14/mentomate. WI-1337 task = verify credential registered + drive to done; NO code wiring (Expo push path, notifications.ts:52). Execute on hand-off.
> **Tooling:** bun=`/c/Tools/bun/bun.exe`; cosmo skills under `~/.claude/plugins/cache/zdx-marketplace/cosmo/0.6.19/skills/{triage,refine,execute}/`; every triage/capture passes `--judge-provider claude`. Doppler=`/c/Tools/doppler/doppler.exe -p mentomate`. NOTION_TOKEN in env. Repo owner/repo = `cognoco/eduagent-build`. WS-39 DS = `36fd1119-9955-4684-8bfe-deb145e6a21f`.
> **SCORECARD (10 WIs):** WI-1339 **CLOSED/Done**. WI-1336 (PR #1857 merged) + WI-1340 (PR #1861 merged) in Executing, held on lr-out-004 gated remainders. WI-1338 held on lr-out-004 (Inngest Cloud prod-env). WI-1310 ops-done, awaiting Ramtop M4 proof (no Stage change forced). Wave-B WI-1328/1335/1341/1337 = **Ready**, gated on lr-out-011; WI-1341 Config-T artifact already POSTED (prepare-not-land, ramtop-tagged). WI-617 **HOLD-until-near-launch** (Ready, untouched).
> **OPEN GATES (awaiting operator/orch):** lr-out-004 (WI-1336 alerts+symbolication, WI-1338 Inngest, WI-1340 Resend+E2E) · lr-out-011 (Wave-B console/cred asks; FCM-first per operator). All prod-secret/Clerk/Sentry-token asks RESOLVED (lr-out-003/002/005; Config-T lr-inbox-007).
> **NEXT ACTIONS on wake:** (a) any inbox reply → act (WI-1337 is primed: on Firebase key + eas credentials access, execute the FCM V1 upload; WI-1335 draft-artifacts only if operator says yes — copy is C2 out-of-remit). (b) WS-39 Stage change → if a merged/held WI's operator gated steps are confirmed done, verify + `/cosmo:execute complete` it (WI-1336/1340/1338); if reviewer bounces something, re-dispatch. (c) Non-critical: `git worktree prune` (hung `.worktrees/WI-1336` cleanup) + prune `.worktrees/WI-1340`.


Boot done. Monitors armed persistent + reconciled into manifest: inbox `bkid4rfjo` (45s),
WS-39 Cosmo Stage `beru2atzr` (own orch-stage-monitor.sh, 180s). First outbox `lr-out-001` (ACK).

**Wave A — all 4 refined Backlog→Ready (2026-07-03).** Researcher (read-only, done) produced
current-state + autonomous-vs-gated split; key finding self-verified: PROD API WORKER CANNOT BOOT
— `ANALYTICS_HASH_KEY` + `CONSENT_WITHDRAWAL_TOKEN_SECRET` MISSING from Doppler prd (both in
`PRODUCTION_REQUIRED_BASE_KEYS`, config.ts:446-457). `API_ORIGIN` is NOT a gap (wrangler prod var).
- WI-1336 Sentry: builder DONE → PR #1857 (flip prod+fallback SENTRY_DISABLE_AUTO_UPLOAD=false;
  clean 2-line diff, no MODE_NAV strip). CI FULLY GREEN + mergeStateStatus CLEAN (monitor b5ac3pemd
  ended). claude-review = CHANGES_REQUESTED, 1 SHOULD_FIX = the exact token-ordering risk I flagged;
  adjudicated resolved-by-sequencing (merge coupled to token), noted on PR. CodeRabbit rate-limited
  (no substantive review). PR #1857 MERGED 2026-07-03 (squash f27f97692c63b7f7bd1fa1fc97cb97880cd49db0,
  Gate 1: green+CLEAN). lr-out-005 executed (lr-out-009): SENTRY_AUTH_TOKEN was ALREADY in the EAS
  production env (not created/overwritten); eas.json production+fallback both map environment=production
  so the token DOES inject → flip NOT inert (builder premise corrected). CAVEAT: token PRESENCE verified,
  not VALIDITY (Doppler prd token is 32-char/non-sntrys_ shape) — symbolication-verify (lr-out-004) is the
  real proof. WI-1336 stays Executing, holds on lr-out-004 (symbolication verify + alert dashboards).
- **PROD-BOOT BLOCKER CLEARED 2026-07-03** (operator ruling lr-inbox-003 → executed, lr-out-007):
  minted ANALYTICS_HASH_KEY + CONSENT_WITHDRAWAL_TOKEN_SECRET (64-hex random, masked) in Doppler prd,
  verified present by name + synced to GH Actions. All PRODUCTION_REQUIRED_BASE_KEYS now satisfied.
  WI-1340 still NOT closeable — holds on Resend SPF/DKIM + live E2E (lr-out-004). PR #1861 MERGED
  2026-07-03 (squash 12e1ea7154a3ced6d7d1aee4106e7b0896416c06, Gate 1 passed — green+CLEAN, claude-review
  APPROVED 0 findings). WI-1340 remains Executing pending operator gated steps; complete after.
- WI-1338 Inngest: NO autonomous scope (code path already correct — prod serves /v1/inngest, 87
  fns). Held on sole operator step: create Inngest Cloud prod env + sync + fire cron/event (lr-out-004).
- WI-1339 GitHub env: **DONE → Stage=Reviewing** (operator ruling lr-inbox-008 YES+YES): added main-only
  protected-branch policy to the production Environment (reviewers jojorgen/crowka preserved) + deleted the
  orphaned env-scoped DATABASE_URL secret (repo-level DATABASE_URL_PRODUCTION is the live one; no bare
  secrets.DATABASE_URL consumer). Completed via /cosmo:execute (descriptive Fixed In, infra-only WI). **Reviewer-graduated →
  Stage=Closed / Resolution=Done (2026-07-03) — FIRST WS-39 item fully closed; review pipeline validated end-to-end.**
- WI-1340 email: builder DONE → PR #1861 (SHIPPED doc banner matching Done-spec convention +
  regression test in config.test.ts asserting prod boot throws naming both missing keys; real
  validateEnv, no mocks, 75/75 pass; env:sync MODE_NAV_V2 strip reverted; committed chore(api) —
  commitlint rejects `test`). Builder corrected my ADR ref: MMT-ADR-0029 (bearer-token withdrawal
  authority), NOT 0027. CI running (my monitor on #1861). SAFE TO MERGE ON GREEN — no prod-build-break
  risk, no merge-hold. After merge (Gate 1), WI-1340 holds for operator gated steps: mint 2 secrets
  (lr-out-003 URGENT) + Resend SPF/DKIM + E2E (lr-out-004). Withdrawal feature itself already shipped (#1530).

**Outbox ledger:** RESOLVED — lr-out-003 (2 prod secrets minted+synced, boot-blocker cleared →
lr-out-007); lr-out-002 (WI-1310 Clerk prod key wired: verified pk_live_ in Doppler prd, GH Actions
..._PRODUCTION set, EAS prod env present; unblock posted for ramtop → lr-out-008). OPEN (awaiting
operator) — lr-out-004 (Wave-A ops bundle: Inngest Cloud prod env / Sentry+uptime alerts / 2 WI-1339
decisions / Resend SPF/DKIM + E2E), lr-out-005 (Sentry SENTRY_AUTH_TOKEN→EAS, unblocks #1857 merge).
**WI-1310:** ops done 2026-07-03; lifecycle closure follows Ramtop's M4/WI-1307 rollback-proof (its
true DoD) — not forcing its Stage.

**Wave-B refined to Ready 2026-07-03** (WI-1328 Assisted/L, WI-1335 Manual/M, WI-1341 Assisted/M,
WI-1337 Assisted/S; WI-617 stays HOLD-until-near-launch). Prime-and-hold; gates escalated lr-out-011
(operator per-WI console/credential asks) + lr-out-012 (orchestrator: cross-lane Config-T flip
ownership). REFRAME: Play Developer account access already resolved 2026-05-15 (pre-launch-checklist:
71-72) → Wave-B gated on specific console actions + credential access, NOT a pending ruling. Least-
gated = WI-1337 (FCM V1 upload; Firebase mentomate-9d02f exists). Cross-lane: WI-1341 Config-T flip =
shared nav/Ramtop-M6 flag — lr-inbox-007 RULED (spine-owned, land only after V0-retirement S6); WS-39
prepare-not-land ARTIFACT POSTED to WI-1341 for ramtop M6 pickup (diff + baseline: delta NONE; fallback-
flip = open spine-owner question). WI-1328 phase-4 RC keys → fallback-OTA republish before Ramtop M6. Store listing copy is C2 out-of-remit — offered to prime
WI-1335 draft artifacts, awaiting operator yes (did NOT draft unprompted).

**Everything autonomous is done — lane at its gated boundary.** Open: lr-out-004 (Wave-A ops bundle,
operator), lr-out-011 (Wave-B gates, operator), lr-out-012 (Config-T ownership, orchestrator).
**Next on resume:** on any gate-clear → prime/execute the unblocked WI; on operator verification of a
Wave-A gated step → verify + /cosmo:execute complete that WI (WI-1336/1340 merged, awaiting their
gated remainders; WI-1338/1339 operator-gated). Non-critical: prune hung .worktrees/WI-1336.

## Launch gate
Lane feeds the program launch gates (PGM-1 gate ledger: M5 V0 retirement, M6 ship + store
submission). Wave B store/monetization items are prime-and-hold until the operator releases the
store-account + product-scope rulings.

## Change log
- 2026-07-03 — Lane created (ORION). Scaffold + kickoff (lr-inbox-001). WS-39 = 10 items, Wave A
  (4 no-dep) released for autonomous execution; Wave B gate-parked; 2 cross-lane edges flagged.
