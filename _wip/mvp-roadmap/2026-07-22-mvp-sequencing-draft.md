# MentoMate roadmap to MVP launch — first full cut (2026-07-22)

> **Read me first.** This is a *comprehension* document: it describes the intended shape of the
> road to launch as of today. It carries no plan authority until explicitly promoted (operator
> standing order, 2026-07-16), and no batch of work is ever started from this document alone —
> every batch kickoff re-checks reality first. The Cosmo board is always the source of truth.

**What this document is:** the roadmap spine itself — what has to happen between today and public
launch, in what order, and what gates what. It also explains (§5) how this roadmap turns into
actual delivery batches, because that translation is a mechanism, not a section of this map.

**Where the numbers come from:** the full board pull of 2026-07-22
(`2026-07-22-board-pull-delta.md`): 321 open work items, of which 213 are MVP-scoped (after the 2026-07-22 consent ruling folded 4
more in), 78 are post-MVP, and the rest are estate housekeeping (27) or closed since (WI-533).

---

## 1 · The three phases, in plain English

The road to launch has three phases. They are **not calendar periods** — each one ends when a
specific, named thing happens, and not before. (This phase frame was ruled by the operator on
2026-07-16 and is unchanged; earlier drafts referred to that ruling as "SEQ-1".)

### Phase 1 — "Full Parallel" (we are here)

Everything that *can* run, runs at once: agent lanes build and fix, the compliance paperwork
progresses, store accounts get set up, QA finds bugs. There is no internal ordering between
these beyond real dependencies.

**Phase 1 ends when WI-1577 passes.** WI-1577 ("Launch compliance closure — final gate") is a
re-run of the complete compliance checklist immediately before store submission: DPIA signed, DPO
appointed, privacy policy published, retention rules implemented, erasure working, and so on. It
is deliberately a *re-run* — it was checked once before, and the final gate proves nothing has
rotted since. Today WI-1577 is deterministically red: its blockers are the legal/compliance
cluster below.

### Phase 2 — "Submission"

Once compliance closes, we finalize the store paperwork — age ratings and child-safety
declarations (WI-1114), country availability (WI-1115) — and submit the app to the App Store and
Play Console (WI-1335). Then Apple's and Google's review cycles run, which we do not control.

**Phase 2 ends when both stores approve the app.** Store approval is *technical* launch — the
app exists in the stores but nobody is told about it yet.

### Phase 3 — "Beta & Launch"

With an approved production build: we dogfood the exact store build end-to-end ourselves
(WI-1503), then run a small closed beta with 5–10 real screened families (WI-1506 — this needs
the crisis-helpline content, WI-1764, which is counsel-gated). Only after the beta looks healthy
comes the public-launch decision.

**Phase 3 ends with the deliberate decision to launch publicly.** That decision is yours, not a
gate that auto-clears.

### Replan branches — status as of 2026-07-22 evening

1. **Consent model — RULED (OPQ-133, Option 1, 2026-07-22): jurisdiction-aware consent is IN
   the MVP.** Consent age resolves from the learner's age AND residence jurisdiction (guardian
   consent required up to 16 where the jurisdiction says so); launch markets are NOT constrained
   to consent-age-13 countries. The build enters Supporter & Linking: WI-2533 (guardian
   attachment + jurisdictional consent), WI-2534 (composed resumable family onboarding), WI-2532
   (me-or-someone-else onboarding fork), WI-2535 (correct the roadmap/policy text). All four are
   Captured — this is a real, late scope injection on the launch path and makes WS-32 refinement
   the top of the refinement queue (see §6). DPIA rider relayed onto OPQ-103.
2. **EU AI Act classification (counsel) — still open.** If counsel classifies MentoMate as
   Annex-III high-risk, WI-1663/1664 (technical file, institutional tripwire) become
   launch-gating and Phases 2–3 re-sequence around them.
3. **Mentor-notice contract audit (OPQ-134) — effectively concluded 2026-07-22** (row stays
   formally open): MMT-ADR-0036 is retained as Accepted, but **the feature does not activate
   yet** — both mentor-notice flags stay off; the current implementation is materially
   non-conformant and remediation PR #2475 must not merge as-is. A 7-point remediation list is
   recorded on OPQ-134 (terminalize `not_yet`, observed-off enforcement, mobile
   optimistic-state/SSE fixes, diagnostic-safety + retention tests, toolchain re-verification).
   **Consequence for running work: BID-35/BID-22 members must be re-briefed against this verdict
   at reboot before any further mentor-notice merges** — mentor-notice convergence in WS-46 is
   now a defined remediation cluster, and launch does not wait on activating the feature.

---

## 2 · The critical path runs through humans, not agents

The single most important fact in this roadmap: **the launch date is currently set by paperwork
and design decisions, not by engineering throughput.**

**The legal/compliance chain (Compliance — Legal & External lane).** Twelve items, all ready,
nine of them requiring you, Jørn, or counsel — appoint the outsourced DPO (WI-1105), produce and
sign the DPIA (WI-1106), the processing register (WI-1107), the breach-response plan (WI-1108),
publish the privacy policy (WI-1109), sign the vendor data-processing agreements (WI-1192), and
land counsel-approved retention periods (WI-1194, agent-executing but consuming counsel's
numbers). Every one of these feeds WI-1577, the Phase-1 exit gate. The queue rows that start
these clocks are already deadlined: **OPQ-102 (DPO retainer) and OPQ-110 (vendor DPAs) are due
2026-07-24 — two days from this writing; OPQ-24 (retention values) 07-25; the counsel packet
(OPQ-22) has still not been dispatched.** These are lead-time items: the work happens at
counsel's and the DPO's pace, so every day a clock doesn't start pushes Phase-1 exit a day.

**The trust-package design pass (OPQ-40 / WI-1767).** Five launch-scoped builds — first-week
mentor plan, memory confirmation, feedback controls, in-app support path, review-promise card —
are all hard-blocked behind one design decision that only you can make. It is the longest
pure-thinking item on your queue: until it lands, five MVP items cannot even be refined, and the
build tail compresses against the beta gate.

**Everything else human:** the store-console setup chain (Play/App Store records, RevenueCat
production, push credentials — your Tier-4 queue rows), and the hands-on QA passes (device runs,
locale copy review, voice QA) that gate the dogfood and beta steps.

---

## 3 · The agent-side picture: plenty of capacity, not enough refined work

Of the 213 MVP items, only **17 are dispatchable today** (Ready, unclaimed, unblocked, not in a
batch). About **106 sit upstream of Ready** — captured or in backlog, needing refinement
(acceptance criteria, sizing, root-cause) before any agent can pick them up. The pipeline is
**refinement-constrained, not capacity-constrained**: adding more build agents today would starve
within a day. The biggest agent-side lever at reboot is therefore reviving the refinement engine
(the "refinery" service — whose revival the ZDX program owns post-reboot) and pointing it at the
two biggest debt piles: **Supporter & Linking (27 unrefined, incl. the consent cluster)** and
**Core Learning Loop (23)**.

Per-lane state of the MVP work (a *lane* = a workstream = a functional grouping; see §5 for how
these become delivery batches):

| Lane (workstream) | open | dispatchable now | needing refinement | plain-English note |
|---|---|---|---|---|
| Core Learning Loop (WS-46) | 39 | 3 | 23 | the learning product itself; incl. the mentor-notice remediation cluster (OPQ-134 verdict: flags stay off, PR #2475 blocked, 7-point list) |
| Launch Readiness (WS-39) | 33 | 0 | 14 | 13 already executing; 5 trust builds blocked on your design pass |
| Supporter & Linking (WS-32) | 34 | 1 | 27 | family/parent flows; **+4 jurisdiction-consent build items (OPQ-133 Option 1) — refine first** |
| V2 finalization (WS-28) | 14 | 3 | 6 | the new app shell |
| Store, Billing & Release (WS-54) | 12 | 7 | 1 | **largest ready pool — natural first batch at reboot** |
| Compliance — Legal & External (WS-30) | 12 | — | 0 | the human paper chain (§2); not agent work |
| Compliance — Engineering (WS-29) | 11 | 2 | 5 | erasure, PII-scrubbing, deletion hardening — makes the DPIA signable |
| Dev-Infra & Tooling (WS-35) | 11 | 0 | 6 | CI, preview builds, test harnesses |
| Mobile UX & Navigation (WS-33) | 10 | 1 | 7 | |
| QA Fix Factory (WS-55) | 8 | 0 | 5 | rolling drain of dogfood findings |
| Identity Cutover (WS-18) | 7 | 0 | 6 | |
| Safety & Eval (WS-31) | 6 | 0 | 5 | |
| Churn-hotspot refactoring (WS-53) | 5 | 0 | 5 | ⚑ on-hold; candidate for demotion to post-MVP |
| Four Strands language (WS-38) | 2 | 0 | 1 | |

The 45 hard "blocked-by" edges among MVP items were all checked this sitting and are legitimate
(the gate spine, the trust chain, E2E capstones behind their predecessors) — nothing is spuriously
stuck.

---

## 4 · What is deliberately NOT on this roadmap

- **Post-MVP scope (78 items)** — organized today into three bucket initiatives: *Fast-follow*
  (8, explicitly ruled), *Committed* (0 yet), *Maybe* (73, default pool; triaged later by
  promotion, starting with picking fast-follows).
- **Estate housekeeping (27 items)** — the estate-canon documentation drain (WS-36) and
  agent-machinery governance items. Proposed OUT of this roadmap entirely (pending your confirm).
- **In-flight wrap-up work** — 9 batches are still Running under the pre-reboot fleet with ~28
  claims (15 of them expired/zombie). The reboot settles these; this roadmap plans *around* them,
  not over them.

---

## 5 · How this roadmap becomes actual delivery batches

Workstreams are **functional groupings — they never execute.** A **delivery batch** is the unit
that executes: a small set of items given to one shepherd for one focused burst.

The translation is deliberately **just-in-time**, at a kickoff sitting, never in advance from
this document:

1. **This roadmap says which pools to draw from first** (the priority order in §6) — that is all
   a roadmap can honestly commit to, because the board moves daily.
2. **At each kickoff sitting**, we re-check premises (gate status, human clocks, new QA
   arrivals, what landed since), look at what is *actually Ready right now* across all lanes, and
   cut a batch by **co-execution affinity**: items that touch the same files, verify in one test
   pass, form a dependency chain, or fit one agent's working context. A batch may freely cross
   workstreams — when a batch happens to equal a lane, that's coincidence, not policy.
3. **Each batch gets** a brief, hard ordering via blocked-by edges where needed, entry gates
   ("don't start until X"), and one assigned shepherd. Dispatch is a joint operator+PM decision
   per batch (ruled 2026-07-17); batch size is tuned to what review/QA bandwidth can absorb —
   the documented failure mode is flooding *you*, not the agents.

So: **roadmap = which pools, in what order, behind which gates. Batches = cut fresh on the day,
from Ready items, by affinity.** This document intentionally stops at the pool level.

---

## 6 · Proposed draw-order at reboot (the batch slate, direction only)

1. **Store & release engineering** — Store/Billing/Release has 7 items ready now (RevenueCat
   wiring, submission pipeline, credentials plumbing). Pairs naturally with your store-console
   queue rows. Longest external lead after legal, so start early.
2. **Compliance-Engineering closeout** — the erasure/PII/deletion-hardening pool (incl. the
   three items routed there today). Goal: the codebase state the DPIA describes is true.
3. **Resume, drain, and graduate the 9 running wrap-up batches** — settle the 15 zombie claims,
   finish what's mid-flight before forming successors in those areas.
4. **Refinement wave** (not a delivery batch — a refinery/groomer queue): **Supporter & Linking
   first** (the jurisdiction-consent cluster is Captured and launch-path per OPQ-133), then Core
   Learning Loop, so the Ready pools refill ahead of the build agents.
5. **Trust-build batch** — pre-formed on paper, dispatches the moment your OPQ-40 design pass
   lands. (This is the one batch worth preparing in advance, because its trigger is your ruling,
   not board state.)

---

## 7 · Open decisions on this roadmap (operator)

1. **Estate-track fence** — confirm the 27 estate items stay off this roadmap.
2. **WS-53 churn-hotspot refactoring** (5 items, lane on hold) — demote to Post-MVP Maybe
   (PM lean) or keep in MVP.
3. **WI-2346 / WI-2390 overlap** — likely fold at refinement (flag stands, no action needed now).
4. **Ratify the §6 draw-order** as working direction (not the batches themselves — those form at
   their own premise-checked kickoffs).
