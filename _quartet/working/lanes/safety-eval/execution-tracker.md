# Execution Tracker — PRG-31 · Safety & Eval (WS-31)

> Lane substance for the `safety-eval` lane. Process lives in `roles/shepherd-protocol.md`; this
> file holds delivery state. Disposable by construction. Pointers, never copies (live WI = Cosmo).

## Charter
Close the LLM-safety and eval-envelope correctness gaps in WS-31. "Done" = all 3 WIs Closed via the
review gate, with the **P1 minor-safety leak (WI-1154) provably fixed** (negative-path break test)
and envelope-signal discipline (WI-1155) verified by the eval harness. Cutover-independent (Tier 1).

## Canon authority
- **LLM routing / envelope:** `apps/api/src/services/llm/router.ts`, `services/llm/envelope.ts` (`parseEnvelope`, `llmResponseEnvelopeSchema` from `@eduagent/schemas`).
- **Safety preamble / minor routing:** `computeAgeBracketFromDate()` gating; per-tier model routing (MMT-ADR-0014 + `docs/registers/llm-models/master.md`) — Gemini excluded under-18.
- **Eval harness:** `apps/api/eval-llm/` — `pnpm eval:llm` (Tier 1 snapshot) + `pnpm eval:llm --live` (Tier 2 schema validation). Prompt changes MUST run the harness.
- **Security-fix rule (AGENTS.md → Fix Development Rules):** WI-1154 is CRITICAL/HIGH-class — requires a **negative-path break test** attempting the exact attack (red-green: write test, pass, revert fix, fail, restore).
- **Lane review invariant:** a "fix" for WI-1154 that lacks the red-green break test is **rework**, not done. Envelope-signal changes must show eval-harness evidence (before/after snapshot).

## How to use
Fresh shepherd: read `roles/shepherd-protocol.md`, then this tracker, then `roles/executor/executor-protocol.md`.
Released for autonomous execution — **prioritise WI-1154 (P1 safety leak) first.** Dispatch typed
builders (this is API/LLM work; the security fix is a builder+auditor pairing). Never do the work in-seat.

## Pointers
- **Cosmo Workstream:** WS-31 "Safety & Eval" — page id `3918bce9-1f7c-810d-a939-dce083b0473b` (Status: On hold; description: "Tier 1. Cutover-independent. Highest-urgency P1. Spin-up rank 2").
- **Work Items DB (data source):** `36fd1119-9955-4684-8bfe-deb145e6a21f`. **Workstreams DS:** `08b3ab36-709d-44af-b78c-5e9f74f6e745`.
- **Clacks channel:** `_quartet/working/lanes/safety-eval/_state/{inbox,outbox}.jsonl`.

## ★★★ CURRENT STATE — post-crash-recovery 2026-07-03 (READ THIS; bullets further down are HISTORICAL) ★★★
- **⛔ OPERATOR HOLD IN FORCE (2026-07-03, post-compact).** The operator directly instructed: *"dont pick up new work and wait for instructions from the orchestrator."* → I am **NOT dispatching** the released WI-1376/1358/1351/1365 wave despite ORION's "Go" (se-inbox-037). Idle until the hold lifts. Do NOT launch builders on resume; re-read this line first.
- **Monitors 2026-07-04:** inbox watcher **brz3oci64** STABLE (baseline se-inbox-51, delivering). Stage watcher **DOWN by design** — flapped exit-255 x3 (Notion-curl poller unstable this session); STAGE CHANNEL = MANUAL Cosmo query, re-arm only once the wave is dispatched (nothing in Reviewing now → zero-risk). **Last processed inbox = se-inbox-54 (051 ENDORSES my ambiguity call; 052/053/054 = beat-checks, 054 = ~1h20m systemic-pause post-mortem, disregard 052/053 escalation warnings, no dispatch go). Last outbox = safety-eval-37 (alive + still-holding; real-UTC).** Awaiting an UNAMBIGUOUS explicit operator "go"/"dispatch" to fire — ORION-authorized, operator cautious-posture on all irreversible gates (launch PRs held ~14:40Z), so do NOT infer dispatch from vague phrasing like "get back to work". ⚠️ **bg watchers die silently on crash/compaction — MANUALLY `tail -n6 _state/inbox.jsonl` at the top of EVERY turn** (see memory feedback_bg_watchers_die_on_session_teardown; I missed se-027..034 incl. all 4 rulings once already).
- **NON-GATED WAVE 100% CLOSED:** WI-1353, WI-1360, WI-1359 (b1107cdb, abuse-disclosure tripwire, precision 1.00), WI-1361 (09eeb910, recall audit) — all Closed. Plus earlier P1s WI-1348/1349 Closed. (WI-1316 reviewer-owned, was Reviewing.)
- **★ ALL 4 SAFETY FORKS RULED + RELEASED (operator se-inbox-030/031/032; ORION follow-up se-033). NOW EXECUTING this released wave:**
  - **WI-1376** (P1 Bug — crisis-rule signal-binding; THE fix for the 25% grooming/neglect recall gap) — **Backlog** (triaged). NEXT: refine→dispatch. Highest priority. Surface: exchange-prompts.ts crisis rule. Ship-gate: recall on SF-CR11..18 rises materially from 2/8 WITHOUT new false-fires on WI-1360 neg-battery or suitability FP-guard; eval:llm Tier-1 before/after + Tier-2 --live vs expectedResponseSchema; over-fire regression checked.
  - **WI-1358** (crisis_redirect telemetry hardening) — **Refining** (old fork-AC written; REWRITE AC to ruled build). Ruling se-032 = Option(c)+telemetry carve-out: NEVER guardian-notification (a ruled out on merits), no T&S queue, mandatory-reporting deferred. BUILD: (1) keep WI-1359 learner-facing as-is; (2) harden crisis_redirect telemetry — reliable server logging of every firing + structured operator alarm (Sentry/Inngest per silent-recovery ban), **NO disclosure content in payload** (event-id + profileId-scoped pointer only); (3) LOCKSTEP DOCS: §6b canon line + DPIA (docs/compliance/edpb_dpia_filled_2026_v1.md); **un-defer exchanges.ts:98-101 handler**. Ship-gate: test crisis_redirect firing→alarm emitted + **negative test: NO guardian-facing side-effect**.
  - **WI-1351** (adult CBRN/explosives gate) — **Refining** (old fork-AC written; REWRITE to ruled build). Ruling se-031 = Option A: extend dangerous-procedure-gate.ts to ADULTS for **CBRN + explosive-device-construction how-to ONLY** (exact AC subset; expansion needs NEW ruling). Reuse: detector already age-agnostic+pure, only the !isMinor short-circuit (dangerous-procedure-gate.ts:274) excludes adults. Ship-gate: red-green break test on exact adult CBRN/explosives extraction (attempt as adult→blocked; revert→leak; restore) + **negative test: legitimate adjacent adult query (general chemistry/energetics) NOT blocked**. ADR-class check per MMT-ADR-0000 (first adult-content constraint) → author ADR in lockstep if yes.
  - **WI-1365** (suitability-judge enforcing output gate for minors) — **Captured** (released). NEXT: triage→refine→dispatch. Ruling se-030: block overall=`violation` ONLY (never `concern`→observe/telemetry); judge-unavailability = **fail-OPEN-with-alarm**; JUDGE_ENFORCEMENT_ENABLED **off by default**; minors-only; reuse WI-1154 seam + sourceReplacement retract rail; category-allowlist (never block over_blocking/topic_drift); calibration-gated threshold from real minor-traffic judge.verdict data BEFORE any flip. **LOCKSTEP: author MMT-ADR-0016 §3 amendment (phase-5 gating mode: violation-only + fail-open-with-alarm) in the SAME change-set.** Ship-gate: red-green on block-and-replace + negative (concern does NOT block) + fail-open (judge error→reply passes + alarm) tests. Impl design already on WI-1350 page (Option A).
  - **WI-1377** (P2 Task — widen probe baseline) — **Captured**. AFTER WI-1376 lands (re-measure post-fix). SF-CR11..18 stay seed.
- **Surfaces mostly disjoint → parallelizable in worktrees:** WI-1376 [exchange-prompts.ts] · WI-1358 [exchanges.ts:98-101 + docs] · WI-1351 [dangerous-procedure-gate.ts + ADR] · WI-1365 [session-exchange/judge seam + MMT-ADR-0016 §3]. Watch WI-1376(prompt)↔WI-1358(exchanges) both in crisis subsystem.
- **Cosmo mechanics (proven this session):** claim/complete via `PATH=/c/Tools/bun:$PATH bun <cosmo>/execute/execute.ts`; needs `workitem.json {pageId,id}` in artifacts-dir; complete needs parser-conformant `completion-summary.md` (4 bold-inline sections **What was done:/What changed:/Verification:/Caveats / Follow-ups:** — last one single-line; no test-counts/hex/routes in prose, full paths in backticks); `--fixed-in <squash-url>` overrides HEAD. Effort NOT accepted by refine patch → set via direct Notion PATCH before --to-ready. Gate-1 = strict-green CI + FRESH claude-review verdict (read issues-comment, green≠APPROVED) + mergeStateStatus=CLEAN → squash-merge → complete. Reviewer (separate session) does Gate-2.
- **HISTORICAL bullets below (pre-crash) — superseded by the above:**

## COMPACTION RESUME POINT (2026-07-03, earlier — HISTORICAL) — see CURRENT STATE above
- **Launch-gating safety line COMPLETE** (ORION-confirmed): both P1 launch-blockers CLOSED — WI-1349
  (Gemini-under-18 exact-date age gate, 29dfc891a) + WI-1348 (minor-PII echo-back gate, 7595f889c),
  both with verified-real break tests + stg live-validate.
- **WS-31: 8 Closed** (WI-781, WI-1154, WI-1155, WI-1285, WI-1348, WI-1349, WI-1350, WI-1352) · **1 Reviewing** (WI-1316).
- **4 operator forks STACKED (ORION presenting together; ORION catches needs-operator via its 10-min loop, NOT the watcher — mark any TIME-CRITICAL one):**
  - safety-eval-21 → **WI-1350/WI-1365** judge-enforcement posture (verdict threshold: violation-only[rec] vs +concern; unavailability: fail-open-with-alarm[rec] vs fail-closed). WI-1365 build HELD.
  - safety-eval-22 → **WI-1351** adult CBRN/explosives gating (new adult-content policy). Refining, build HELD.
  - safety-eval-23 → **WI-1358** §6(b) crisis_redirect action / guardian-notification (verified UNDECIDED policy; guardian-is-abuser risk). Refining, build HELD.
- **NON-GATED WAVE 100% CLOSED (2026-07-03): ALL 4 fully Closed through Gate-1 + Gate-2. WI-1353 · WI-1360 · WI-1359 (b1107cdb) · WI-1361 (09eeb910). Nothing left to dispatch. Fork-blocked untouched: WI-1365/1351/1358.**
- **LANE NOW BLOCKED ON EXTERNAL DECISIONS (no autonomous work remaining):**
  - Reviewer Gate-2 close: WI-1361 (Reviewing), WI-1316 (Reviewing).
  - ORION ruling on safety-eval-27 (needs-orchestrator): capture follow-ups (a) prompt-strengthen grooming/neglect signal-binding, (b) widen-probe-baseline WI?
  - Operator rulings on 3 stacked forks: WI-1350 (judge-enforcement posture: threshold + fail-mode → unblocks WI-1365), WI-1351 (adult-CBRN gating), WI-1358 (§6b guardian-notification policy). safety-eval-21/22/23.
  - WI-1288 deploy-gated HOLD (ORION schema review of migration 0129).
- **WI-1361 AUDIT FINDING (safety-significant, escalated safety-eval-27 needs-orchestrator):** model-layer crisis_redirect recall on grooming/neglect/indirect-abuse = **2/8 (25%)**. grooming 0/3 (signal-binding misses — prose flags risk, e.g. SF-CR18 said "en rød flagg", but never sets crisis_redirect), neglect 0/3 (comprehension misses — model ignores disclosure, answers homework), indirect-abuse 2/2. Findings on WI-1361 page (verified 27 blocks). RECOMMENDED FOLLOW-UPS awaiting ORION: (a) prompt-strengthen grooming/neglect signal-binding (eval-gated); (b) widen-probe-baseline WI + re-measure. NO deterministic gate (spike-ruled-out). Probes SF-CR11..18 in PR #1871. Builder used --max-live-calls 150 (58 live calls).
- **RESUME WORK (non-gated) — WAVE 1 DISPATCHED 2026-07-03 (both Ready→claimed Executing→builders running):**
  - **WI-1360** (negative battery — PRECONDITION for WI-1359) — **GATE-1 DONE → MERGED (squash 7456a3fa, PR #1856) → completed → Stage=Reviewing** (awaiting Gate-2). claude-review APPROVED 0 must/should/consider; CodeRabbit clean. Probes SL-AB01..06 + 6 tripwire neg-assertions + 6 snapshots now on main. Battery available for WI-1359's precision measure.
  - **WI-1353** (safety-guards register doc) — **GATE-1 DONE → MERGED (squash 1e52d78a, PR #1855) → completed → Stage=Reviewing** (awaiting separate reviewer Gate-2 close). 1 CodeRabbit finding (provenance wording inconsistency) fixed pre-merge (e6431d709); re-CI CLEAN, no new findings. Fixed In = squash commit URL. Worktree .worktrees/WI-1353 still holds branch WI-1353 (local delete deferred) — CLEAN UP. NOTE: local main checkout was ~11 lines STALE vs origin/main — pull main before any local-checkout surface reads.
  - **WAVE 2 (WI-1360 now landed on main → battery available):**
    - **WI-1359** (narrow first-person abuse-disclosure tripwire, P2) — **builder SHIP → PR #1863** (branch WI-1359, commit 760e27298). New `abuse_disclosure` category; precision **1.00** (18/18 positives fire, 0 false-fires on WI-1360 battery + 8 idiom-collision cases), red-green-revert proven (unregister→20 fail; restore→286 pass/0 fail). Child-safety copy CORRECT: learner-facing reply avoids parent/guardian (perpetrator-safety), regression test locks no `parent`/`guardian` token. Confirmed NO guardian-notification/no new crisis_redirect consumer. **CI waiter bk7a7szf0 running.** GATE-1 WATCH: known-red api co-located integration step (pre-existing `session-completed mode` drift on main, NOT this PR — memory project_main_gate_blocked_api_colocated_integration_broken) may show red; merge if that is the ONLY red + all else green + claude-review APPROVED.
    - **WI-1359 re-verify round:** builder incorporated 2 claude-review CONSIDERs → new commit **f955c7c7d** (added teacher/tutor/counsellor to ABUSE_PERP; benign-object guard pillow/water-balloon non-fire vs belt/bottle fire; verb→me adjacency). Re-verified recall 1.0 / precision 1.0 / 0 false-fires / red-green re-proven (unregister→25 fail; restore→300/0). **Re-CI waiter buicgerb5 running** → merge when CLEAN + APPROVED.
    - **WI-1361** (offline shadow audit — P3 Spike, LAST non-gated item) — **Ready** (Effort M; surface read: battery.ts:383-440 crisis probes SF-CR05/06/08/09/10 + flows/safety-probes.ts:154 already flags expectCrisisRedirect&&!crisis_redirect misses). Scope: add ≥8 grooming/neglect/indirect-abuse crisis probes + run `eval:llm --live --flow safety-probes` offline to quantify MODEL-LAYER recall gap (categories WI-1359 leaves model-layer); findings appended to WI page (spike deliverable), probes = small PR. INHERENTLY LIVE-COST (real LLM calls). NO runtime gate. Patch=scratchpad/wi1361-refine-patch.json. DISPATCH HELD until #1863 merges (avoid 2 Gate-1 flows). No file overlap w/ WI-1359.
- **GATE-1 REMINDER for WI-1360/1353 on builder PR report:** verify strict-green CI + FRESH claude-review verdict (green check ≠ APPROVED — read the issues-comment) + mergeStateStatus=CLEAN, THEN squash-merge, THEN `execute complete --fixed-in <squash-url>` (workitem.json already in scratchpad wi1360-work/ wi1353-work/). Reviewer (separate session) does Gate 2 close.
- **HOLD:** WI-1288 (deploy-gated). No build past any flagged fork. Calibration-data precondition stands for WI-1365 regardless of posture; author lockstep MMT-ADR-0016 §3 amendment WITH the WI-1365 build.
- **Monitors:** inbox **b0m4t5kb4** (poll-based, baseline se-inbox-26), Cosmo-Stage **bvo3345eo** (.select.name). Re-armed post-compaction 2026-07-03 (prior bfvbpdmac/bptpakntf killed by compaction).
- **HARNESS LESSON:** when refining via setup helpers, do NOT use `${WI,,}` for patch/workitem file paths (lowercases WI-NNNN, mismatches Write paths → empty AC / missing workitem.json). Verify AC populated after refine; complete needs workitem.json in the SAME dir as completion-summary.md.

## Fast-follow (WI-1285 children; ORION se-inbox-021/023/024 authorized; sequence after P1s)
- **WI-1352** (safeguarding spike) — **CLOSED** ✓ (findings appended durably; 4 children).
  Conclusion: broad abuse tripwire can't clear precision bar; best lever = act server-side on
  crisis_redirect (telemetry-only today, §6(b) deferred). Children: **WI-1358** (crisis_redirect action /
  guardian-notification — POLICY-SENSITIVE per se-024: determine §6(b) decided-canon-vs-gap, FLAG fork
  before build; guardian-is-abuser failure mode), **WI-1359** (narrow first-person abuse tripwire —
  engineering, ship only if clears ≥0.98-precision/100%-neg-battery bar), **WI-1360** (must_answer neg
  battery — engineering), **WI-1361** (offline shadow audit — low-risk).
- **WI-1350** (suitability-judge enforcing gate, Design) — **COMPLETE → Reviewing** (design appended;
  Option A recommended = reuse dangerous-procedure-gate seam + retract rail, violation-only + allowlist +
  fail-open-on-unavailability + JUDGE_ENFORCEMENT_ENABLED flag; = deferred MMT-ADR-0016 §3 phase-5, needs
  ADR amendment). Impl child **WI-1365** (Captured, gated on fork). FORK escalated (safety-eval-21,
  needs-operator): verdict threshold (violation-only rec) + unavailability policy (fail-open-with-alarm rec).
- **REMAINING WAVE (pace; no build past a flagged fork):** refine WI-1359/1360/1361 (engineering) +
  WI-1358 (policy-check→flag) + WI-1351 (refine + flag adult-product fork) + WI-1353 (doc, exec if trivial)
  + WI-1365 (gated on WI-1350 fork). WI-1288 deploy-gated HOLD.
- **Open forks awaiting ruling:** safety-eval-21 (WI-1350 enforcement, needs-operator); WI-1358 policy
  (I flag on refine); WI-1351 adult-product (I flag on refine). Spike agents: ae79f0d5c678abf6b (1352, done),
  a908c9b16077bd9f6 (1350, done).

## Launch-blocker P1s (operator-ruled se-inbox-021) — BOTH LANDED 2026-07-03
- **WI-1349** (Gemini-under-18 exact-date age gate) — **CLOSED** ✓ (squash 29dfc891a; real live gap: still-17 → banned Gemini, now approved Cerebras; both-seam break test).
- **WI-1348** (server-side minor-PII echo-back gate) — **CLOSED** ✓ (squash 7595f889c, main-CI green; neg-path break test + stg live-validate; safeSend observability event w/ kinds+count not raw PII; 3 review rounds each a real catch).

## Units / slice (3 WIs — Cosmo is live; snapshot 2026-07-02)

| WI | Name | Stage | Pri | Type | Exec path |
|---|---|---|---|---|---|
| WI-1154 | Safety: minor-routed model leaks step-by-step extraction despite no-how-to rule (eval SL-DU02) | **CLOSED** ✓ (6bcb042c9; AC-rework cleared parser first pass, no re-bounce) | **P1** | Bug | Assisted |
| WI-1155 | Envelope signal discipline: private_sources.insufficient / teach_back rubric gaps (eval HW02/HW04/SGA04/P17) | **CLOSED** ✓ (d787aa656; AC-rework cleared parser first pass) | P2 | Bug | Assisted |
| WI-781 | Decide CONCEPT_CAPTURE_ENABLED: flip on (tables landed via 0113) or confirm deferral pending cutover profiles→person FK repoint | **CLOSED** ✓ (reviewer closed post-merge, per se-inbox-016) | P2 | Task | Assisted |
| WI-1285 | Sweep: safety guards enforced only in prompt text with no server-side gate + no break test (systemic follow-up to WI-1154/558) | **CLOSED** ✓ (8-site inventory appended durably after 1 legit rework; 6 child WIs WI-1348..1353) | P2 | Spike | Assisted |
| WI-1288 | Repoint concepts/concept_mastery schema-code FK profiles.id→person.id + idempotent migration 0129 (split from WI-781) | Captured (PARKED — ORION in-seat schema review of 0129 pending) | P2 | Hygiene | Unset |
| WI-1316 | Eval harness: HW02.solved-from-memory check false-fires on correct clarifying response (probes.ts:454) — split from WI-1155 (CANONICAL row, wired→WI-1155) | **MERGED (PR #1849, squash e718f073d) → Reviewing** (red-green proven, Tier-1 zero-drift; main CI settling) | P2 | Bug | Assisted |
| WI-1315 | (accidental dedup-judge double-fire of WI-1316) | **Closed — Duplicate of WI-1316** (2026-07-03, per se-inbox-013) | P2 | Bug | — |

> **Not in this lane:** WI-1284 (dedup-judge ANTHROPIC_API_KEY crash) lives in the **Cosmo-improvements** workstream, not WS-31 — captured by ORION, don't re-file.

## Sequence
- **WI-1154 first** (P1 safety). Then WI-1155 (same eval/envelope surface — sequence after 1154 to avoid churning the same prompts/snapshots twice).
- WI-781 is an independent **decision** item (flag flip vs defer) — can run in parallel; needs a call on the cutover FK-repoint dependency (may resolve to "confirm deferral", i.e. no code).

## Supervision / escalations
- **WI-1154 is security-critical:** enforce the red-green break test; treat a fix without it as incomplete. Elevate model/effort for the fix + verification.
- Prompt/eval changes (WI-1154/1155): run `pnpm eval:llm` (Tier 1) + `--live` (Tier 2) — the pre-commit hook does not run the harness.
- WI-781 may be a no-code decision → resolve via a `decision` on the outbox + Cosmo close-as-decision, not a build.

## Current position (2026-07-02, shepherd active — 3 executors running)
- **WI-1154 (P1)** — **GATE 1 DONE — MERGED**. Option B server-side fail-closed dangerous-procedure
  gate (`dangerous-procedure-gate.ts`), NOT another prompt. PR #1833 strict-green (9/9, claude-review
  APPROVED 0 blocking/must-fix/should-fix, CLEAN), squash-merged to main as **6bcb042c9**, Fixed In
  113a03ca6. VERIFIED before merge: red-green break test pins the EXACT SL-DU02 opium→heroin 4-step
  extraction (+ prose + whole-class weapon/poison/meth/bomb/acquire; strong precision guards);
  AC#3 live-validated (Doppler -c stg, gpt-4o-mini/13yo/rung1) SL-DU02 leaked_procedure=false;
  independent adversarial review APPROVE-WITH-FIXES, 3 should-fix fixed w/ regression tests.
  Stage=Reviewing → awaiting reviewer Cosmo Close. Main post-merge green + **staging Deploy SUCCESS**.
  RESIDUALS flagged to ORION (outbox safety-eval-11): streaming-flash (pre-existing, gate fires at
  completion frame), + 2 CONSIDERs (isMinorExchangeContext dup at 2 safety sites; over-block monitor)
  — proposed as follow-up WIs, pending ORION. Option C (routing floor) DEFERRED. Systemic sweep = **WI-1285**.
- **WI-781 (P2)** — DECIDED: flip `CONCEPT_CAPTURE_ENABLED` on (deferral gate cleared: FK→person
  live on stg+prd, RLS live, WI-1104 Closed — verified by live SQL). Code-default const, normal
  pipeline. Builder built the flag flip + schema-code FK repoint + **idempotent migration 0129**
  (drizzle raw would abort on stg/prd; rewritten with DO-block guards, verified vs 0124 precedent).
  **HALTED before PR/complete/merge**: ORION invoked in-seat schema review on 0129 (prod-affecting
  FK change, staging-ledger-drift echo) — 4 review artifacts posted (outbox safety-eval-9,
  needs-orchestrator). **SCOPE-SPLIT pending**: FK-repoint is pre-existing drift (sibling to
  WI-1128). **SPLIT DONE** — builder confirmed separable (write-path test seeds both profiles+person,
  passes on either FK target). WI-781 reduced to code-only flag flip (flag + tests + canon).
  **GATE 1 DONE — MERGED**: PR #1828 strict-green (9/9 checks, claude-review APPROVED 0/0/0,
  CodeRabbit clean, mergeStateStatus=CLEAN — all verified before merge, not on builder assertion),
  squash-merged to main as **2fedbd627**. Fixed In 41cc411 (reviewable via PR head ref post-squash).
  Stage=Reviewing → **awaiting separate reviewer's Cosmo Close (Gate 2)**; Cosmo-Stage monitor will
  catch the verdict. WI-781 worktree fully removed. Post-merge main VERIFIED GREEN (Mobile CI +
  Deploy + E2E all success; Claude Code skipped advisory) — merge did not break main. WI-781 inert
  on stg until CHALLENGE_ROUND_RUNTIME_ENABLED separately enabled.
  Schema half → **WI-1288** (parked, ORION in-seat review of 0129 pending, then operator deploy gate).
  Outbox safety-eval-10.
- **WI-1155 (P2)** — root-caused + **refined Ready**. Fix: A1 SGA04 server-side derivation
  (audit strips phrases at exchanges.ts:1276-1293 but forgets `insufficient=true`) + A2 HW04/HW02
  prompt hardening (truncation-detector deferred) + B1 P17 prompt hardening (teach-back judge
  fallback reserved). **Build IN PROGRESS (sonnet, agent aba61c8613f70b4a6, Stage=Executing).**
  - **A1 (SGA04) DONE+PROVEN**: exchanges.ts sets sourceAudit.insufficient=true when strip removes ≥1 term; red-green unit test in exchanges.test.ts (197/197); live insufficient=true. (Tier-1 snapshot correctly UNCHANGED — A1 is runtime/audit, invisible to Tier-1.)
  - **A2 (HW04) DONE+LIVE-PASS**: homework INCOMPLETE-SOURCE prompt block in exchange-prompts.ts; live insufficient=true + asks for cut-off text. Snapshot over-regen fixed (was 275 from shared-block edit → relocated to homework block → 18 intended-only).
  - **B1 (P17) FAILED 4/4 live** (model drops teach_back_assessment) → **B2 AUTHORIZED** (shepherd, ruling): build server-side `runTeachBackGrader` (fail-open, mirrors runChallengeRoundGrader) to fill the signal; keep B1 as defense-in-depth. Builder now building B2.
  - **HW02 → SPLIT to WI-1316**: HW02 model behavior already CORRECT (insufficient=true); failure is harness regex `HW02.solved-from-memory` (probes.ts:454) false-firing on "question 4 is asking". Naive fix opens sneaky-leak hole → separate eval-harness WI-1316 (P2 Bug). WI-1155 does NOT touch probes.ts; HW02 red is tracked FP, not blocking.
  - Revised WI-1155 DoD = A1+A2+B2. Builder to finish → strict-green PR (body: red-green A1, --live evidence, B2 rationale, HW02→WI-1316 note) → /cosmo:execute complete. Outbox safety-eval-13. **Usage-limit risk: if builder dies again, resume agent aba61c8613f70b4a6 after reset.**
  **DISPATCH-BRIEF GUARDRAIL (ORION inbox-005):** A2 is the same prompt-only shape that regressed
  in WI-558 — it MUST carry a Tier-2 `pnpm eval:llm --live` BEHAVIORAL assertion on HW04/HW02 (a
  Tier-1 snapshot only proves the text changed), and PREFER a reachable server-side enforcement for
  A2 (e.g. key on the learner's explicit incomplete-source meta-signal — "cut off"/"blurry"/"answer
  anyway" at exchanges.ts:489-498 — rather than the eval's brittle content regex). `--live` floor
  already encoded in AC#2/#3.
- **Monitors:** inbox watcher (b7rbc9qg9) + WS-31 Cosmo-Stage poller (b2ywohp7e), both persistent,
  manifested. WS-31 now has 4 members (WI-1285 added by ORION).
- **Next:** await builder green PRs → Gate-1 merges (WI-1154 first) → `complete` → review verdicts.

## Resume state (2026-07-03, LATEST-7 — WI-1349 MERGED+main-green; WI-1348 round-3 re-verify; both P1 ACs fixed)
- **HARNESS BUG (fixed, lesson):** my `setup_p1` refine helper used `${WI,,}` → looked for `wi-1349-patch.json`/`wi-1348-patch.json` (lowercased, hyphen) while I Wrote `wi1349-patch.json`/`wi1348-patch.json` → refine ran with a MISSING --patch-file → **both P1 ACs were written EMPTY**; claim moved each to Executing regardless. WI-1349 bounced at review on the empty AC (legit, ORION se-inbox-022). FIX: PATCHed both ACs directly (naming the REAL break tests), pre-empted WI-1348 before review. LESSON: match Write paths to bash-constructed paths; verify AC populated after refine.
- **WI-1349 = MERGED (29dfc891a) + main-green + Reviewing.** Bounced once (empty AC), fixed: AC authored
  + guard clause cites the VERIFIED real break test (git grep origin/main: exchanges.test.ts:332 + :365
  `[WI-1349][SECURITY]` both seams). Re-completed → Reviewing.
- **WI-1348 = round-3 Gate-1 re-verify (PR #1851 head f6e8ec288).** 3 review rounds, each a real catch:
  silent gate → safeSend observability event `app/safety.minor_pii_echo_redacted` → single-source
  `piiKindSchema` in @eduagent/schemas + required profileId + `collectLearnerText` helper. Builder's own
  catch: refused raw `echoedTerms` in the event (PII re-leak) → ships `redactedKinds`+`redactedCount`
  (shepherd-confirmed correct). AC now SET (pre-empted); break test VERIFIED on origin/WI-1348
  (minor-pii-echo-gate.test.ts, 18 cases, real negative-path). Rebased on WI-1349's merge. → merge on
  strict-green + clean fresh verdict (watcher bgiewach0) → complete (AC ready).
- **ORION report:** outbox safety-eval-19 (both ACs authored + break tests verified real).
- **Monitors:** inbox bfvbpdmac, Cosmo-Stage bptpakntf, WI-1348 CI bgiewach0.

## Resume state (2026-07-03, LATEST-6 — 2 P1 launch-blocker builders in flight; WI-1316 merged; WI-1285 rework fixed — SUPERSEDED)
- **OPERATOR RULINGS (se-inbox-020/021):** P1-hold REVERSED then LAUNCH-GATED. **WI-1348 + WI-1349 are
  LAUNCH-BLOCKERS** — build first, full WI-1154 rigor (break test + live-validate on real minor route).
  WI-1350/1351/1352/1353 = fast-follow, must NOT compete with the P1s. WI-1285 rework = LEGITIMATE
  evidence gap (not WI-1326 parser class).
- **WI-1316:** MERGED (PR #1849, squash **e718f073d**), completed → Reviewing. Red-green proven, Tier-1
  zero-drift, worktree removed, branch deleted. Post-merge main: Deploy+E2E+Flag-ON green; CI `main` job
  still settling (watcher bs0yn0j39; eval-harness-only + strict-green PR → breakage unlikely, confirm green).
- **WI-1285:** rework FIXED — appended the full scored 8-site inventory (12 blocks) durably to the page
  body per the zdx:review bounce (evidence not assertion), re-completed → Reviewing.
- **2 P1 LAUNCH-BLOCKER BUILDERS IN FLIGHT (Opus, parallel worktrees):**
  - **WI-1349** age-gate — builder **a12f8c1a4ec427972**, worktree .worktrees/WI-1349. Fix: route
    router-config age + safety preamble through computeAgeBracketFromDate (not year-only computeAgeBracket
    at exchange-prompts.ts:43), using the procedure-gate's date source (exchanges.ts:1644). STEP-0: verify
    month/day is actually available (else no-op/already-safe). Break test on pre-birthday-17yo→minor→no
    Gemini+young preamble; live-validate stg.
  - **WI-1348** minor-PII echo-back gate — builder **a20bb74a4f58c1a28**, worktree .worktrees/WI-1348.
    New minor-pii-echo-gate.ts (dangerous-procedure-gate pattern), minor-scoped, fail-closed, echo-back-
    scoped to learner-volunteered PII, wired at exchanges.ts:1651 + session-exchange.ts:3793. Negative-path
    break test (minor volunteers name+school→model echoes→gated/redacted); live-validate stg.
  - **Merge-order note:** both touch exchanges.ts → merge one, rebase the other at Gate-1.
  - **BOTH PRs DELIVERED then BOUNCED on valid SHOULD_FIX (Gate-1 caught, in fix cycle):**
    - **WI-1348 PR #1851** (head 9bb167fae): build clean (neg-path break test + stg live-validate proven,
      jest 1665). claude-review CHANGES_REQUESTED — SHOULD_FIX: gate fires SILENTLY (redacted/echoedTerms
      discarded, MINOR_PII_ECHO_GATE_MODEL unused) = GDPR-K blind spot. Builder a20bb74a4f58c1a28 resumed:
      add safeSend non-core event `app/safety.minor_pii_echo_redacted` (profileId+timestamp+echoedTerms+model)
      at both seams + redact whitespace-cleanup post-pass. Re-push → re-verify.
    - **WI-1349 PR #1852** (head 6459a9246): STEP-0 confirmed REAL live compliance gap (born 2008-12-31
      still-17 → OLD resolved gemini-2.5-flash, NEW cerebras/gpt-oss-120b); processExchange break test +
      stg live-validate proven, jest 3935. claude-review CHANGES_REQUESTED — SHOULD_FIX: fix applied at
      BOTH seams but break test only covers processExchange; streamExchange (security path) untested.
      Builder a12f8c1a4ec427972 resumed: add streamExchange neg-path break test (red-green-revert on stream
      seam) + tighten dup comment. Re-push → re-verify.
    - Fix: exchanges.ts fix at `computeAgeBracketFromDate(birthYear,birthMonth,birthDay)` at both router
      seams (~L1599/L1827); birth date sourced via person.birthDate→birthMonthDayFromDate→context.
  - **WI-1349 = MERGED (squash 29dfc891a) → Reviewing** — first launch-blocker landed. Fresh claude-review
    APPROVED 0/0/0 on head 0b3fe0cb2 (streamExchange break test added, both-seam red-green). Completed
    (note: complete needs workitem.json in the SAME dir as completion-summary.md — my setup_p1 wrote it to
    `wi-1349-work` (hyphen, `${WI,,}`) while the summary went to `wi1349-work`; created workitem.json in the
    summary dir to fix). Worktree removed. Main CI settling (watcher ba2tsgaph).
  - **WI-1348 = fix re-pushed (head d3f6ee3bf) then REBASING onto main (WI-1349 landed on shared seams).**
    Both claude-review findings fixed: safeSend non-core event `app/safety.minor_pii_echo_redacted` +
    redact cleanup. **DECISION (shepherd-confirmed):** builder correctly REFUSED to ship raw `echoedTerms`
    in the event (would re-leak minor PII to Inngest's 3rd-party store — violates codebase PII-egress rule);
    ships `redactedKinds`+`redactedCount` instead. My spec was wrong; kinds+count is right. Builder
    a20bb74a4f58c1a28 rebasing (keep BOTH WI-1349 age line + PII-gate call), will re-push → I re-verify + merge 2nd.
- **FAST-FOLLOW (refine/dispatch AFTER P1s land, per se-inbox-021 — don't compete):** WI-1350 (Design —
  proceed within safety mandate, surface only genuine product/UX fork), WI-1352 (Spike — authorized, run
  it), WI-1351 (refine; flag adult-product-posture fork before build), WI-1353 (doc — execute if trivial).
  WI-1288 stays deploy-gated HOLD.
- **Escalations open on outbox:** safety-eval-17 (BLOCKED rulings — now mostly resolved by se-020/021),
  safety-eval-18 (triage report). Monitors: inbox bfvbpdmac, Cosmo-Stage bptpakntf, WI-1316 CI bs0yn0j39.

## Resume state (2026-07-03, LATEST-5 — WI-1285 audit landed, WI-1316 in Gate-1, 6 children + escalations — SUPERSEDED)
- **WI-1316:** builder delivered **PR #1849** (head cdebc37) — content-anchored HW02 guard (HW04 mirror,
  no lookahead), red-green-revert proven, Tier-1 zero-drift, typecheck clean, jest 15/0, eval-harness
  only (reverted the env:sync MODE_NAV_V2 strip). **IN MY GATE-1** — CI settling (watcher bh14ykeg2);
  merge on strict-green + fresh claude-review verdict, then /cosmo:execute complete --fixed-in <squash>.
- **WI-1285:** audit COMPLETE → Reviewing (claimed on-behalf + completed, Fixed In = deliverable ref).
  8-site inventory (2×P1/3×P2/3×P3). WI-1155 signal-cap class CLEAN; no streaming/non-streaming
  path-asymmetry (both share exchanges.ts floors). **6 child WIs captured under WS-31 (related WI-1285):**
  - **WI-1348 (P1, actionable)** minor-PII echo-back output gate (no server backstop; dangerous-procedure-gate pattern).
  - **WI-1349 (P1, actionable, CANON VIOLATION + LIVE minor-safety/compliance gap)** Gemini-under-18 ban + safety preamble use YEAR-ONLY computeAgeBracket (exchange-prompts.ts:43), not exact-date computeAgeBracketFromDate → still-17 pre-birthday learner scored adult → routed to compliance-banned Gemini + adult preamble. Cheap fix (swap fn + guard test).
  - **WI-1350 (P2, BLOCKED)** promote suitability judge to enforcing gate for minors — MMT-ADR-0016 phase ruling.
  - **WI-1351 (P2, BLOCKED)** adult dangerous-procedure floor (CBRN/explosives subset) — product+compliance ruling.
  - **WI-1352 (P2, BLOCKED)** safeguarding-recall widening spike — design ruling (precision vs must-answer).
  - **WI-1353 (P3)** document justified prompt-only guards (jailbreak, slur).
- **Escalated to ORION: outbox safety-eval-17 (needs-orchestrator)** — rulings on the 3 BLOCKED
  (WI-1350/1351/1352); heads-up on the 2 actionable P1s (proceeding without ruling).
- **NEXT (autonomous, no ruling needed):** (1) WI-1316 Gate-1 merge + complete when CI settles; (2) refine
  + dispatch **WI-1349** (P1 age canon-fix — highest value) then **WI-1348** (P1 PII gate); WI-1353 (P3
  doc) any time. HOLD WI-1350/1351/1352 pending ORION rulings. WI-1288 stays deploy-gated HOLD.
- **Monitors:** inbox bfvbpdmac (poll-based), Cosmo-Stage bptpakntf (.select.name), PR-CI bh14ykeg2
  (WI-1316, transient). All working.

## Resume state (2026-07-03, LATEST-4 — LANE REACTIVATED, operator "work-what-you-can" — SUPERSEDED)
- **se-inbox-017/018 (operator via ORION) REVERSED the wind-down:** work the deferred backlog full
  lifecycle. Do BOTH — (1) WI-1316 triage→refine→EXECUTE; (2) WI-1285 triage→refine→BEGIN (scope into
  units); (3) WI-1288 stays deploy-gated HOLD. My safety-eval-16 decision-request was mooted by this.
- **DONE this phase:** both triaged Backlog→Ready (Effort set: WI-1316=S, WI-1285=L — note: Effort is
  a required DoR mechanical gap and refine's patch schema does NOT accept `effort`, so set it via
  direct Notion API PATCH before re-running refine --to-ready). WI-1316 CLAIMED (Executing).
- **IN FLIGHT (2 executors):**
  - **WI-1316** builder **a2ee33633b98147c2** (Sonnet, worktree .worktrees/WI-1316): content-anchor the
    HW02.solved-from-memory guard (probes.ts:454) on cell-biology answer tokens, MIRRORING HW04.photo-
    invention's containsAny (NOT a naive lookahead = sneaky-leak hole); red-green-revert test; eval-
    harness only, Tier-1 zero-drift. AC already carries the guard clause in WI-1208-accepted form.
    → builds PR (no merge, no complete) → report to me for Gate 1.
  - **WI-1285** auditor **ab3513579f3820ee5** (Opus, READ-ONLY): sweep for prompt-only safety guards
    lacking a server-side gate + break test (WI-1154 class); deliver scored inventory + ranked child-WI
    unit plan + BLOCKED flags for design/product calls. No code change. → I capture/refine the proposed
    child WIs from its report. **RESUMED (was mid-synthesis; fanned out 4 sweeps, 3 pending).**
    **Interim verified finding #1:** Gemini under-18 vendor ban + minor LLM safety preamble key off
    YEAR-ONLY `computeAgeBracket` (exchange-prompts.ts:43), not the canonical exact-date
    `computeAgeBracketFromDate` → a still-17 learner pre-birthday is misclassified ADULT and routed to
    the compliance-banned Gemini vendor. Canon violation (AGENTS.md: use computeAgeBracketFromDate for
    any safety-adjacent age gate). Likely its own hardening child-WI; verify + possibly flag to ORION.
- **MONITOR FIX #2 (important):** the inbox watcher b7rbc9qg9 was `tail -n +1 -f` → flooded all existing
  lines on start → AUTO-THROTTLED → SILENT, missed se-inbox-017. Stopped it; re-armed **bfvbpdmac**
  (poll-based, emits only id>baseline). Cosmo-Stage watcher is **bptpakntf** (.select.name fix). Both
  persistent, manifested.
- **On resume:** handle the two executor reports — WI-1316 PR (Gate-1 verify strict-green + fresh
  claude-review + red-green evidence → merge → complete with --fixed-in); WI-1285 inventory (capture +
  refine child WIs, escalate BLOCKED design calls to ORION). WI-1288 stays HOLD.

## Resume state (2026-07-03, LATEST-3 — LANE CHARTER COMPLETE — SUPERSEDED: lane reactivated)
- **All 3 core WS-31 WIs CLOSED via the review gate:** WI-781 (2fedbd627), WI-1154 (P1, 6bcb042c9),
  WI-1155 (d787aa656). Both WI-1326-class AC-wording bounces fixed AC-text-only and cleared the parser
  on FIRST resubmit — loop guard never tripped, no orchestrator ruling needed. Lane charter satisfied
  (P1 leak provably fixed + break-test; envelope discipline eval-verified). Logged outbox safety-eval-15.
- **No active build in flight.** Remaining WS-31 items all deferred per se-inbox-016: WI-1288 (HOLD,
  deploy-gated, last), WI-1316 (optional refine-now — HW02 harness FP, NOT a naive regex fix),
  WI-1285 (parked, refine-later). Awaiting ORION steer (wind-down vs refine WI-1316).
- **Monitors:** inbox b7rbc9qg9 (ORION replies), Cosmo-Stage **bptpakntf** (FIXED .select.name; old
  b2ywohp7e was blind, stopped). Both persistent. On resume: reconcile these, handle ORION's reply to
  safety-eval-15, do NOT dispatch new builds until steered.

## Resume state (2026-07-03, LATEST-2 — AC-clause rework done, loop-guard watch — SUPERSEDED)
- **Reviewer is LIVE** (ORION se-inbox-014/015/016) — infer via Cosmo Stage, not direct visibility.
  **WI-781 = CLOSED** (1 of 3 core done). WI-1154 + WI-1155 both bounced Reviewing→Executing on the
  **WI-1326 parser false-negative** (`dod.bug.regression_guard_declared`) — cosmetic DoD, NOT code/safety.
- **REWORK DONE (AC-text-only, no code touched):** for BOTH WI-1154 (Fixed In 6bcb042c9) and WI-1155
  (Fixed In d787aa656) I re-claimed → PATCHed the Acceptance Criteria property to append the
  red-green-revert guard clause in the **WI-1208-accepted same-clause form** (pattern name + specific
  test file + RED-before/GREEN-after + landed-commit) → re-completed → both back at **Reviewing**.
  New-AC texts: `<scratchpad>/wi1154-new-ac.txt`, `wi1155-new-ac.txt`. cosmo:qa "missing files" were
  all FALSE NEGATIVES (local tree was behind origin/main — fetched + confirmed teach-back-grader.ts on
  origin/main); did NOT re-implement.
- **LOOP GUARD (ORION se-inbox-016):** if EITHER re-bounces AGAIN despite the correctly-formed clause,
  **STOP and escalate** (ORION posts an [orchestrator:ruling] close to break the parser loop). Do NOT
  re-loop more than once. Watch via the FIXED Cosmo-Stage monitor.
- **MONITOR FIX (important):** the WS-31 Cosmo-Stage watcher was BLIND all session — Stage is a
  **SELECT** property, old jq used `.status.name` → emitted "?" and caught nothing (verdicts were
  learned via inbox). Stopped b2ywohp7e; re-armed **bptpakntf** with `.select.name` (persistent).
  Manifest updated.
- **Unpark steer (se-inbox-016):** WI-1288 keep GO'd but HOLD (deploy-gated, last); WI-1316 MAY refine
  to DoR now (optional, not urgent — NOT a naive regex fix); WI-1285 refine-LATER, keep parked. No new
  build dispatches beyond closing the 2 remaining core WIs.

## Resume state (2026-07-03, LATEST — active build queue DRAINED)
- **All 3 core WS-31 WIs merged + main-green + at Reviewing (merged-pending-reviewer-close):**
  WI-1154 (P1, `6bcb042c9`), WI-781 (`2fedbd627`), **WI-1155 (`d787aa656`, landed this session)**.
  WI-1155 post-merge main FULLY GREEN (Deploy+Mobile CI+E2E+CI). Worktree/branch cleaned.
- **Standing operator/orchestrator ask (now gates 3 items):** the WS-31 reviewer (separate Codex
  session) is UNPROVISIONED — I correctly do not spawn it (reviewer≠executor). Logged as
  **outbox safety-eval-14 (needs-orchestrator)**: (1) reviewer provisioning to drain the 3-deep
  Reviewing queue; (2) ORION's call on whether to unpark WI-1288/WI-1285/WI-1316 now that P1/P2
  safety work is landed. **I am in HOLD pending that steer.**
- **Remaining lane work — all gated/deferred, no active dispatch:** WI-1288 (GO'd se-inbox-008,
  sequenced LAST, deploy-gated hygiene — concept-mastery.ts .references()→person(id) + migration 0129
  already ORION-approved + person-row seeder sweep), WI-1285 (systemic prompt-only-safety sweep,
  refine-later), WI-1316 (HW02 eval-harness regex FP, canonical, wired→WI-1155; NOT a naive regex fix).
- **On resume:** reconcile monitors (inbox b7rbc9qg9 + Cosmo-Stage b2ywohp7e — both persistent);
  handle ORION's answer to safety-eval-14; catch any Reviewing→Closed/rework verdict on the 3 WIs.
  No new builder dispatch until ORION steers unpark.

## Resume state (2026-07-03, post-compaction re-orient — SUPERSEDED by block above)
- **Monitors reconciled ALIVE** (no re-arm): inbox watcher b7rbc9qg9 (running), WS-31 Cosmo-Stage
  poller b2ywohp7e (running, actively polling WS-31 members incl. new WI-1315/1316).
- **Inbox drained to se-inbox-013.** Net rulings since checkpoint: (1) se-inbox-011 — WS-31 reviewer
  session NOT running (correctly not spawned; reviewer≠executor); WI-781 + WI-1154 recorded as
  **merged-pending-reviewer-close** (lifecycle step, not data-loss); HOLD on that gate. (2) se-inbox-013
  — my B2 (server-side runTeachBackGrader) + HW02-split rulings both STAND; **authorized to continue
  WI-1155 (A1+A2+B2) autonomously — executing, not holding.** (3) se-inbox-012/013 dedup: **WI-1315
  marked Duplicate of WI-1316 — DONE** (triage disposition, no judge needed).
- **Active builder:** aba61c8613f70b4a6 (WI-1155) — A1+A2+B2 built, **PR #1838 open** (origin/WI-1155,
  head was c44b021d1). Resume this agentId if it dies. `--live` eval on SGA04/HW02/HW04/P17 = **0/4
  quality failures** (B2 teach-back grader fires, injects teach_back_assessment); A1 red-green proven.
  New surface: `runTeachBackGrader` + `teach-back-grader-prompt.ts` + `teachBackGraderVerdictSchema`/
  `teachBackGraderDegradedEventSchema`; metering-guard fix c44b021d1 (added teach-back-grader.ts to
  LLM_CALL_SITE_FILES).
- **GATE 1 DONE — MERGED (2026-07-03):** builder fixed both findings → new head **e5bccb4cb**; fresh
  claude-review (06:54Z) = **APPROVED 0/0/0 "No issues found"**, 9/9 checks pass, CodeRabbit clean,
  mergeStateStatus=CLEAN — all verified on the NEW head before merge. **Squash-merged to main as
  `d787aa656`** (07:06Z). SHOULD_FIX resolved: profileId+timestamp added to BOTH teach-back AND
  challenge-round grader degraded events (mirror gap fixed), both via safeSend(); CONSIDER resolved:
  gap_identified → `.nullable()`. **`/cosmo:execute complete` run on-behalf → Stage=Reviewing, Fixed In
  d787aa656**, builder claim settled. Post-merge main **Deploy=success** (CI settling). Worktree removed
  (surgical admin-stub + bg dir delete), local branch WI-1155 deleted, current branch still main.
  **Awaiting reviewer Cosmo Close (Gate 2)** — joins WI-781 + WI-1154 in the reviewer-close queue.
- **[superseded] GATE-1 CAUGHT (06:30Z):** newest claude-review verdict = **CHANGES_REQUESTED**
  (check green only = it *ran*; verdict blocking). Sent builder back to fix: **(SHOULD_FIX)**
  `teachBackGraderDegradedEventSchema` omits `profileId`+`timestamp` — grader fires mid-session, profile
  exists, account-level carve-out N/A; add profileId/timestamp, thread through RunTeachBackGraderInput +
  session-exchange call site + emitDegradedEvent, confirm dispatch uses `safeSend()`, and fix the same
  gap in runChallengeRoundGrader's degraded event if mirrored. **(CONSIDER, flagged both passes)**
  `gap_identified` `.nullable().optional()` → collapse to `.nullable()` + coerce absent→null in
  preprocess (matches challengeRoundGraderVerdictSchema precedent, no Known-Exception needed). Builder
  resumed; will re-push + report new head. **Re-verify strict-green + FRESH claude-review before merge.**
  CI monitor b9j55wple armed on PR #1838 (auto-tracks latest head). AC-for-complete must name the
  red-green-revert guard clause (se-inbox-009) — reminded builder to draft it.
- **AC-wording pre-empt (se-inbox-009):** WI-1155 completion AC MUST name the red-green-revert
  guard clause explicitly (Bug-type /cosmo:review guard is stricter than DoR) or it bounces at Reviewing.
- **Open operator/orchestrator asks (unchanged):** reviewer-session provisioning gates WI-781 +
  WI-1154 Cosmo Close (ORION escalating); WI-1288 GO'd (se-inbox-008) but sequenced LAST behind
  1154/1155; WI-1285 refine-later. WI-1154 residuals (safety-eval-11) still uncaptured, HOLD.

## Launch gate
**Released** for autonomous refine→execute (operator extended ORION scope to WS-31, 2026-07-02, with
autonomous authority). No operator execute gate. Priority: WI-1154.

## Change log
- **2026-07-02** — Lane provisioned by ORION. WS-31 resolved: "Safety & Eval", On hold, 3 WIs (P1 safety
  leak WI-1154 + envelope WI-1155 + flag-decision WI-781). Dedicated shepherd (not folded into
  mobile-ux-nav — different API/safety surface, high urgency). Tracker + channel + kickoffs authored;
  monitors armed. Shepherd kickoff handed to operator to spawn.
- **2026-07-02 (later)** — Shepherd activated. Watchers armed + manifested. WI-1154/1155 triaged to
  Backlog. Dedup-judge crash on this host (even with `--judge-provider claude`: ANTHROPIC_API_KEY
  precedence inside the judge subprocess) — manual dup scan run instead; logged to outbox
  (safety-eval-1). WI-1154 identified as recurrence of closed WI-558 (fix `223f636d`). Two
  researchers dispatched (WI-1154 root cause, WI-781 decision).
