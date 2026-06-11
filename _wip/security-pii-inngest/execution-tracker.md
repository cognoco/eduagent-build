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
