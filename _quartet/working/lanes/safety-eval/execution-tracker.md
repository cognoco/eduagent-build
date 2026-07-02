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

## Units / slice (3 WIs — Cosmo is live; snapshot 2026-07-02)

| WI | Name | Stage | Pri | Type | Exec path |
|---|---|---|---|---|---|
| WI-1154 | Safety: minor-routed model leaks step-by-step extraction despite no-how-to rule (eval SL-DU02) | **Ready → builder dispatched (Executing pending claim)** | **P1** | Bug | Assisted |
| WI-1155 | Envelope signal discipline: private_sources.insufficient / teach_back rubric gaps (eval HW02/HW04/SGA04/P17) | Backlog | P2 | Bug | Assisted |
| WI-781 | Decide CONCEPT_CAPTURE_ENABLED: flip on (tables landed via 0113) or confirm deferral pending cutover profiles→person FK repoint | **MERGED (PR #1828, squash 2fedbd627) → Reviewing** — awaiting separate reviewer's Cosmo Close | P2 | Task | Assisted |
| WI-1285 | Sweep: safety guards enforced only in prompt text with no server-side gate + no break test (systemic follow-up to WI-1154/558) | Backlog (refine-later) | P2 | Spike | Unset |
| WI-1288 | Repoint concepts/concept_mastery schema-code FK profiles.id→person.id + idempotent migration 0129 (split from WI-781) | Captured (PARKED — ORION in-seat schema review of 0129 pending) | P2 | Hygiene | Unset |

> **Not in this lane:** WI-1284 (dedup-judge ANTHROPIC_API_KEY crash) lives in the **Cosmo-improvements** workstream, not WS-31 — captured by ORION, don't re-file.

## Sequence
- **WI-1154 first** (P1 safety). Then WI-1155 (same eval/envelope surface — sequence after 1154 to avoid churning the same prompts/snapshots twice).
- WI-781 is an independent **decision** item (flag flip vs defer) — can run in parallel; needs a call on the cutover FK-repoint dependency (may resolve to "confirm deferral", i.e. no code).

## Supervision / escalations
- **WI-1154 is security-critical:** enforce the red-green break test; treat a fix without it as incomplete. Elevate model/effort for the fix + verification.
- Prompt/eval changes (WI-1154/1155): run `pnpm eval:llm` (Tier 1) + `--live` (Tier 2) — the pre-commit hook does not run the harness.
- WI-781 may be a no-code decision → resolve via a `decision` on the outbox + Cosmo close-as-decision, not a build.

## Current position (2026-07-02, shepherd active — 3 executors running)
- **WI-1154 (P1)** — root-caused (prompt-only safety control, no server-side gate; WI-558 fix was
  prompt-only + no break test, silently regressed once WI-560 live envelope evals ran). Refined
  Ready. **Builder DISPATCHED (opus)**: Option B server-side procedure-leak reply gate at the
  `applySourceAuditSafetyFallback` seam + deterministic red-green SL-DU02 break test + `--live`
  eval evidence + over-block guard. Scope approved by ORION (inbox-002). Option C (routing floor)
  DEFERRED. Systemic sweep captured by ORION as **WI-1285** (refine-later).
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
  fallback reserved). **Build HELD** — dispatches AFTER WI-1154 merges (WI-1155 A1 edits the same
  `applySourceAuditSafetyFallback` seam WI-1154 wraps; shared probe snapshots).
  **DISPATCH-BRIEF GUARDRAIL (ORION inbox-005):** A2 is the same prompt-only shape that regressed
  in WI-558 — it MUST carry a Tier-2 `pnpm eval:llm --live` BEHAVIORAL assertion on HW04/HW02 (a
  Tier-1 snapshot only proves the text changed), and PREFER a reachable server-side enforcement for
  A2 (e.g. key on the learner's explicit incomplete-source meta-signal — "cut off"/"blurry"/"answer
  anyway" at exchanges.ts:489-498 — rather than the eval's brittle content regex). `--live` floor
  already encoded in AC#2/#3.
- **Monitors:** inbox watcher (b7rbc9qg9) + WS-31 Cosmo-Stage poller (b2ywohp7e), both persistent,
  manifested. WS-31 now has 4 members (WI-1285 added by ORION).
- **Next:** await builder green PRs → Gate-1 merges (WI-1154 first) → `complete` → review verdicts.

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
