# WS-20 Flow Remediation — Shepherd State Checkpoint

**Written:** 2026-06-19 (pre-compaction durable handoff). I am the **PRG-18 / WS-20 "Flow Remediation" shepherd**. Operator = Jorn. Orchestrator coordinates via the Clacks (`_state/inbox.jsonl` ← orchestrator, `_state/outbox.jsonl` → me, sole writer). I orchestrate; I never write production code in-seat — I dispatch typed executors.

## Current mandate (as evolved)
- **Execute-to-close:** WI-820, WI-825 (DONE), **WI-818 (IN PROGRESS — operator expanded my mandate from monitor-only to EXECUTE: "take 818 all the way through")**.
- **Refine-to-Ready only:** WI-818/822/782 were refined to Ready earlier; 818 reassigned to Zuzka then RE-taken by me per operator; 822 executed+closed by Zuzka; **WI-782 stays parked at Ready — post-Ready execution is a LATER operator decision, NOT now.**
- new-llm is FROZEN — all fixes branch from `origin/main`.

## WS-20 item states (verified via Notion REST, Stage = `.properties.Stage.select.name`)
| WI | Page ID | Stage | Notes |
|----|---------|-------|-------|
| WI-820 | 3838bce9-1f7c-817d-aca8-e7d515114f9d | **Closed/Done** | squash `bd070c62`; captureException + 13-file isIdentityV2Enabled sweep |
| WI-825 | 3838bce9-1f7c-8179-89bf-d9540e8da2bf | **Closed/Done** | operator force-close (harness deadlock); squash `6ec8b38`; 3 deletion gaps → **WI-849** (WS-18) |
| WI-822 | 3838bce9-1f7c-8159-89ce-e767c068b97b | **Closed** | Zuzka executed; closed 17:30 |
| WI-818 | 3838bce9-1f7c-81fd-adeb-e2ecb513a4c4 | **Closed/Done** ✓ (19:37) | docblock fix #1249 (`4ac215be`); reviewer closed cleanly |
| WI-782 | 3808bce9-1f7c-8126-b9e0-cc3c511b530b | **Ready (parked)** — ONLY open item | re-home=stay; awaits operator post-Ready call |
| WS-20 workstream page | 3838bce9-1f7c-812d-aa36-caea0b669e76 | Open | **graduation-ready MODULO WI-782** (operator post-Ready disposition) |

## LANE STATUS: execute work COMPLETE — only WI-782 (parked) blocks WS-20 graduation
- 820/825/822/818 all **Closed/Done**. My execute mandate fully discharged. Graduation-readiness flagged to orchestrator (prg18fr-021).
- **WI-782** is the sole remaining open item — parked at Ready; post-Ready execution is the OPERATOR's pending call (refine-only mandate). NOT mine to execute without direction.
- Monitors still armed: inbox `bgc7uj6zl`, Cosmo Stage `bdaltg3se` (818/822 now Closed; still polls 782). Stand by for operator's 782 decision or any orchestrator directive.

## WI-818 — active execution
- **Finding to fix (real DoD SHOULD_FIX, NOT a harness misfire):** `apps/mobile/e2e-web/helpers/mentor-audit-storage-state.ts` — docblock ~L14-17 claims session-revoked storage keeps the invalid token + exercises the Hono RPC revoked-token-refresh path, but code ~L155-160 clears Clerk cookies before the revoked banner. Reconcile docblock↔behavior to the real revoked-banner flow.
- Prior work already merged: **PR #1239, merge commit `16dd03774`** (16:26Z). This is a SURGICAL follow-up fix PR.
- **Executor:** `wi818-builder` (Sonnet; agent_id `wi818-builder@session-b259bdc8`), dispatched. Branch `wi-818-docblock-fix` → main.
- **PR OPEN: #1249** (head SHA `365b84767f5c4d23fbfa5f4d7a504039e8e657d4`). Fix = **comment-only** docblock correction at `apps/mobile/e2e-web/helpers/mentor-audit-storage-state.ts` L14-17: builder confirmed NO Hono RPC revoked-token-refresh path exists in prod; real mechanism = `clearClerkSessionCookies()` + `mentomate_session_revoked_at` sessionStorage via `bannerInitScript`; docblock now matches reality. One file, no test files (GC6 n/a), tsc/lint clean locally.
- **CI watcher armed:** background task `bhavfxtbw` (watches #1249 checks → output file). **SETTLED: #1249 = CLEAN, 0 failed, MERGEABLE.**
- **#1249 GREEN-WITH-TRIAGE confirmed (builder):** claude-review APPROVED, 0 findings, SHOULD_FIX NOT re-raised (genuinely cleared); CodeRabbit clean (1 doc-hygiene warning addressed in-thread); DoD Phase 6 met. **MERGE-READY.**
- **MERGE DONE (fr-orch-010):** orchestrator merged #1249 — **merge commit `4ac215bec4e9c47f2fad1bcb0f648402830def4d`** (on origin/main; passed the flag-on lane, now a REQUIRED check as of ~19:40). End-to-end 818 ownership CONFIRMED to me; finalize delegated.
- **FINALIZE — complete MALFUNCTIONED (1st attempt 19:29):** `/cosmo:execute complete` mis-derived **Fixed In = `3aac30ca`** (an AMBIENT HEAD, not the detached `4ac215be`) and left Stage=Executing (did NOT advance). Cause: the worktree was DIRTY (uncommitted `eas.json` env:sync artifact) → complete fell back to a non-worktree HEAD. Summary block DID append (parser-clean); claim settled.
- **RETRY DISPATCHED (AGENTS.md-compliant, within delegated finalize):** builder to (1) `git restore apps/mobile/eas.json` → CLEAN tree, (2) confirm HEAD = `4ac215be` (re-detach if not), (3) re-claim, (4) re-run `/cosmo:execute complete` Fixed In=`4ac215be` (appends a 2nd clean summary block — tolerable), (5) verify Fixed In=`4ac215be` + Stage=Reviewing via Notion REST. **If it STILL mis-derives after clean tree+correct HEAD → builder STOPs+reports → I escalate to ORCHESTRATOR (needs-orchestrator) for property-PATCH authorization** (PATCH bypasses the AGENTS.md no-hand-edit-Stage/Fixed-In rule, so needs explicit orchestrator/operator OK; orchestrator has precedent — it did a Fixed-In+Stage correction at 16:51 for the first landing).
- **RETRY SUCCEEDED (19:xx):** WI-818 at **Stage=Reviewing, Fixed In=`4ac215be` confirmed** (clean-tree fix worked: `git restore apps/mobile/eas.json` → complete derived correct SHA). Builder done, claim settled, authority ended.
- **WATCH-RISK — 4 cumulative summary blocks** on the page (append-only complete ×4 across both landings; final 2 parser-clean, first 2 passed review earlier). If the reviewer bounces on `cosmo:qa` parser/cumulative-body artifacts (WI-825 deadlock signature) → escalate to ORCHESTRATOR for `replace_content` authorization (complete can't clear stale blocks). Logged: prg18fr-020.
- **NOW: awaiting reviewer verdict on WI-818** (separate session; Cosmo monitor `bdaltg3se` catches Reviewing→Closed or →Executing). On Closed → **flag WS-20 graduation-readiness** (only WI-782 parked remains; operator post-Ready call pending).
- Reviewer-harness fix = **WI-851** (rel. design WI-866); operator owns prioritization. (Correction logged: merge/process questions → orchestrator via clacks `needs-orchestrator`, NOT needs-operator.)
- **Next steps when green:** (1) resume `wi818-builder` to triage the claude-review COMMENT (confirm the SHOULD_FIX is cleared) + report green; (2) coordinate merge — orchestrator merges per lane pattern (flag merge-readiness on outbox); (3) **Fixed-In MUST be an ancestor of origin/main BEFORE complete** (WI-818 already ate 2 "not-on-main" bounces 13:08/13:12) → builder detaches HEAD to the #1249 merge commit, then `/cosmo:execute complete`; (4) **completion summary MUST be parser-clean** (full repo-relative paths only, no hex/UUID/SHA in prose, no test-count numbers, no /route tokens; single colon-line `Caveats / Follow-ups:`).

## Reviewer harness — KNOWN 3 BUGS (fleet-level, escalated prg18fr-012; affects every re-finalize)
1. Test-runner broken: reviewer-clone (`/Users/vetinari/reviewer-clone/eduagent-build`) runs `C:/Tools/doppler/doppler.exe` (Windows path) on a Mac → any test-count claim "fails."
2. Brittle evidence parser: reads UUIDs as commits, `/route` as files, bare filenames as missing (full paths verify).
3. Append/cumulative-parse: `/cosmo:execute complete` APPENDS — old trip-wire summary persists, QA reads whole body → clean re-finalize via complete can't clear it (this DEADLOCKED WI-825 → operator force-close). MITIGATION: first complete-summary MUST be parser-clean.
- Reviewer closes against a FRESH `origin/main` clone → Fixed-In must be on main.
- Memory updated: `.claude/memory/project_cosmo_shepherd_finalization.md` (parser-clean-first-complete + deadlock).

## Monitors ARMED (do NOT re-arm duplicates)
- **Re-armed after a PC reboot 2026-06-20** — old IDs (bgc7uj6zl/bdaltg3se) DEAD; current IDs below. WI-782 Stage re-confirmed = Ready (still parked).
- Inbox watcher (Monitor task `b2sk06nn8`): `tail -f` on `_state/inbox.jsonl`.
- Cosmo Stage monitor (Monitor task `b9767nl5e`): polls **WI-782 only** (818/822 now Closed) every 180s, emits on Stage change.

## Clacks / outbox log (I am sole writer; entries prg18fr-001 … prg18fr-021)
- Latest: **prg18fr-021 (decision)** — WI-818 CLOSED; flagged WS-20 graduation-readiness; only WI-782 (parked) remains, gated on operator post-Ready call.
- prg18fr-019/020: WI-818 finalize + complete HEAD-derivation bug (resolved). prg18fr-018: merge-ownership → orchestrator. fr-orch-010 (inbox): orchestrator merged #1249, delegated finalize to me.

## Open / pending (current)
- **ONLY open item: WI-782** — parked at Ready. Post-Ready execution = OPERATOR's pending call. I ASKED the operator (end of last reply): execute 782 now to close out WS-20, or leave parked? **HOLD until operator answers — do NOT execute 782 without direction (refine-only mandate).**
- All execute work done: 820/825/822/818 Closed/Done. wi818-builder released.
- Reviewer-harness fix = WI-851 (rel. design WI-866) — operator owns; not my lane.

## How to resume after compaction
1. Read this file. 2. Check monitors alive (`bgc7uj6zl` inbox, `bdaltg3se` Cosmo Stage); re-arm only if dead (do NOT duplicate). 3. Read `_state/inbox.jsonl` tail for any orchestrator directive. 4. Check whether the operator answered the **WI-782 disposition** question — if "execute it," dispatch a Builder for WI-782 (read its Cosmo AC first; MMT-ADR-0022 read-time visibility rework; new-llm FROZEN, branch from main; parser-clean summary; Fixed-In-on-main-before-complete; clean worktree before complete to avoid the eas.json HEAD-derivation bug); if "leave parked," WS-20 stays graduation-ready-modulo-782 and I hold. 5. Direct-read WS-20 item Stages via Notion REST (page IDs in the table above) to ground truth.
