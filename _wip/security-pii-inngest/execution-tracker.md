# PRG-13 · Background-Job Security — execution tracker

> **THE entry point for this workstream.** Shepherd-owned once spawned.
> Umbrella row: `_wip/umbrella-program/program-roster.md` PRG-13. Charter:
> `_wip/umbrella-program/activation-planning.md` §2 PRG-13. Full finding text:
> `docs/audit/2026-05-29-full-audit/L-gap-delta.md` (label `security-pii-inngest`).

**Activated:** 2026-06-11 (fourth run of the §2.1 recipe) · **Operator:** Jorn ·
**Shepherd:** PRG-13 shepherd session (spawn pending kickoff) ·
**Cosmo Workstream:** "Inngest Security & Correctness" (`37c8bce9-1f7c-81d7-9377-e79356055ff3`)

## 1. Charter (one paragraph)

All 6 `security-pii-inngest` findings from the 2026-05-29 full audit remediated:
minors' PII out of memoized Inngest step returns and event payloads (F-028, F-091,
F-090), env-binding isolation across concurrent runs in one isolate (F-094), and two
background-job correctness bugs (F-162 cursor skip, F-174 grade-before-claim). Gate:
**G4 fired 2026-06-11** (W1-inngest-wiring + W3 landed) — both charter open questions
resolved at activation (below).

## 2. Unit map

| Unit | Name | Findings | Priority | Order |
|---|---|---|---|---|
| **WI-665** | WP-S13-pii-step-state — minors' PII out of remaining step returns + event payloads | F-028 (2 remaining legs) · F-091 · F-090 | P1 | 1 |
| **WI-666** | WP-S13-config-correctness — env-binding isolation + 2 correctness bugs | F-094 · F-162 · F-174 | P2 | 2 |

Units are independent (different files, no shared surface) — parallel-safe if the
shepherd chooses, but small enough to run serially.

## 3. Slice-time decisions (activation, 2026-06-11)

1. **Charter OQ1 — F-028/F-091 subsumption scan vs WI-578 (WP-W3-pii-step-state, PR
   #933): PARTIAL.** Verified against PR #933's file list AND live code:
   - **F-028 shrinks 3 functions → 2.** The `freeform-filing` leg is ALREADY FIXED —
     transcript rehydrated from DB inside the `retry-filing` step closure, never
     serialized into Inngest state (explicit PII-egress comment,
     `freeform-filing.ts:170-172`). Executors must replicate that closure pattern,
     not re-fix it. Still LIVE: `auto-file-session` (`fetch-transcript` step return,
     `auto-file-session.ts:71`) and `topic-probe-extract` (`load-transcript` step,
     `topic-probe-extract.ts:176`).
   - **F-091 fully LIVE:** `extract-signals` step return (`topic-probe-extract.ts:184`).
   - WI-578 landed the sanctioned fix pattern **and** the `pii-scrub.ts` service +
     `pii-scrub.guard.test.ts` guard pattern — WI-665 extends, never reinvents.
   - F-090/F-094/F-162/F-174 were not touched by the rewrite (out-of-radius per
     charter); executors re-verify each finding fresh-grep at plan time regardless.
2. **Charter OQ2 — F-162 stays in PRG-13** (not exported to PRG-11): it is a tiny,
   self-contained fix; exporting would orphan it for weeks behind PRG-11's
   human-led decomposition.

## 4. Inherited mechanisms (wire from the start)

- **Autonomous review loop:** verify reviewer-watcher coverage for Workstream
  "Inngest Security & Correctness" on arrival (multi-workstream config array,
  `_wip/identity-foundation/review-watcher-v3.ts`; extension recipe in
  `_wip/identity-foundation/review-loop-productization-handoff.md`). Items the
  shepherd moves to Reviewing are closed (or bounced) autonomously.
- **Executor protocol:** dispatch build work via
  `_wip/identity-foundation/executor-protocol.md` (+ example). Mandatory plan-phase
  stop before code — that stop is what caught the IF cutover gap; treat it as
  load-bearing.
- **Cosmo lifecycle:** claim before execute · complete → Reviewing · never
  self-close · WP DoR bridge (`refine --to-ready`) before claiming.
- **Supervision profile (charter):** medium — WI-665's PII data-handling changes get
  review attention even when mechanical; WI-666 is agent-routine.
- **Landing checks:** adjudicate any red main at CI *step* level before bouncing or
  refuting (2026-06-11 incident lesson: run-level red conflated three independent
  failures). Known ambient reds: Deploy fails on every push (chronic staging
  IDEMPOTENCY_KV gap — captured as WI-664, NOT yours to fix).

## 5. Execution state

- 2026-06-11 — Activated. Workstream + WI-665/WI-666 created (`Stage=Backlog`).
  Subsumption scan done (§3). Shepherd kickoff prompt handed to operator.
- 2026-06-11 — Shepherd arrived. Review watcher wired for this workstream
  (`review-watcher-v3.ts` 4th config entry, commit `9a314f736`; watcher restarted,
  baseline confirms coverage). Restart-gap repair: WI-625 (L10n & A11y Mobile)
  entered Reviewing during the ~45s watcher restart window — its review agent was
  launched manually with the identical prompt contract.
- 2026-06-11 — WI-665 brought through DoR bridge to `Stage=Ready`. Bundle brief
  authored on the WP page; 4 children linked as absorbed provenance (ZDX-ADR-0001):
  WI-638 (F-028 leg 1, auto-file-session — pre-existing capture from the WI-578
  wave, adopted; dedup judge flagged it at 0.95), WI-667 (F-028 leg 2,
  topic-probe-extract load-transcript — narrowed from the initial capture to avoid
  overlap with WI-638), WI-668 (F-091), WI-669 (F-090). Execution Path=Assisted.
  Executor dispatched (wi665-executor, plan-phase stop enforced).
- 2026-06-11 — WI-666 brought through DoR bridge to `Stage=Ready` (brief authored;
  children WI-670 (F-094), WI-671 (F-162), WI-672 (F-174) linked as absorbed
  provenance; Execution Path=Assisted). Dedup adjudication: capture judge linked
  WI-672 to WI-234 (Closed, PR #415, retention-data.ts) as duplicate@0.85 —
  shepherd verified F-174 LIVE in `review-calibration-grade.ts:96` (grade step
  precedes cooldown claim); kept as related-provenance, NOT a duplicate. WI-666
  build dispatch deferred until WI-665 lands (serial per unit map order).
- 2026-06-11 — WI-665 plan-phase stop reviewed and APPROVED with rulings:
  (D1) F-090 via new `feedback_retry_queue` table, migration 0110 (enum alternative
  rejected — PG enums irreversible); insert in failure path only, insert-failure
  degrades gracefully (Sentry, no PII fallback into payload); support_to re-derived
  from config if possible; unconsumed-row purge or tracked follow-up. (D2) 4→1 step
  collapse in topic-probe-extract conditionally approved — executor must verify
  seedRetentionCard idempotency under retry, else fall back to 2-step
  reference-and-rehydrate shape. Corrections: event payload TYPE must drop
  message/supportTo; GC1 hazard on DB mocks (requireActual pattern); migration
  -before-deploy ordering in PR description. Executor implementing; next boundary
  PR-open.
- 2026-06-11 ~23:25 — wi665-executor killed mid-implementation by the account
  usage-limit window (resets 00:40 Oslo). Worktree `.worktrees/WI-665` holds
  uncommitted partial progress (F-028 legs + F-091 source/test edits;
  F-090 schema + route-test started; no migration, no commits; `_plan-WI-665.md`
  present). Recovery: shepherd scheduled a 00:47 one-shot wake-up to resume the
  SAME executor from its transcript (context preserved). If this session dies
  before the resume, a fresh executor must re-orient from `_plan-WI-665.md` +
  `git status` in the worktree and the approved-plan rulings logged above.
