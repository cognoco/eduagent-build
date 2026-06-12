# API Error Handling — Execution Tracker

**Stream:** errors-api (umbrella roster **PRG-15**) · **Activity:** error-handling clean-out (catch-block hygiene, typed classification, mobile boundary)
**Last updated:** 2026-06-11 (activation — program session) · **Owner:** Jorn (+ shepherd session agents)

> **This is the durable entry point for this activity.** Point a fresh session here:
> it should be enough to know *what this is*, *where the detail lives*, and *where to
> pick up*. It is **not** a second source of truth — see §2.

---

## 1. Charter

**What this activity is.** Resolve all 8 `errors-api` findings from the 2026-05-29
full audit (ratified charter: `_wip/umbrella-program/activation-planning.md` §2 →
PRG-15): silent-failure catch blocks logged/escalated, error misclassification fixed,
missing error context restored, and error classification enforced at the API client
boundary in mobile.

**Blast-radius class (ratified):** `partly in-radius`, serialized behind
WP-W3-envelope-router — **that gate is SATISFIED**: `WI-581` Closed 2026-06-11, so
the server envelope contract is final on `main`. Executors build against the landed
envelope/router code; no remaining cross-Initiative gates.

**Supervision profile:** agent-heavy for the catch-block sweep; **medium** for
typed-error classification (touches API boundaries incl. the JWKS auth path — review
required).

**The unit model (2 WPs + 1 Item, flat, no hard edges).** All units live in Cosmo
under the **API Error Handling** Workstream. Independent surfaces; order is soft
(Workstream Order).

| # | WI | Unit | Findings absorbed | Priority |
|---|---|---|---|---|
| 1 | WI-639 | WP-E15-catch-hygiene — silent-failure catch blocks logged/escalated + webhook error context | F-022, F-047, F-048, F-049 | P1 |
| 2 | WI-640 | WP-E15-typed-errors — typed errors + classification fixes at API boundaries | F-015, F-016, F-017 | P2 |
| 3 | WI-641 | IT-E15-mobile-classification — error classification enforced in 6 mobile screens | F-110 | P2 |

Coverage check: 8 findings, each absorbed exactly once. Full finding text lives in
the register (§3) — unit bodies carry the one-line gists + register pointer
(planning-reference §2.2). F-110 is a single-constituent unit → `Item`, not WP
(§2.2: never create empty containers).

**Slice-time decisions (recorded at activation, 2026-06-11):**

- **Charter open question 1 (F-110 timing) — RESOLVED by events:** the constraint
  was "don't hard-code new error types until W3 defines the final envelope contract."
  `WI-581` (envelope-router) Closed 2026-06-11 → the contract is final. WI-641
  classifies against the landed envelope; read `WI-581`'s diff before designing.
- **Charter open question 2 (closed-not-just-started) — MOOT:** activation happened
  after `WI-581` reached Closed; the strict reading is satisfied.
- **F-049 folded into the catch-hygiene WP** (not its own unit): same surface class —
  catch-block discipline — even though its symptom is missing context rather than
  silence.
- **Priority derivation:** WP-E15-catch-hygiene P1 — silent recovery in billing and
  GDPR-adjacent consent paths is *banned* by repo rules (Fix Development Rules:
  "Silent recovery without escalation is banned in billing, auth, and webhook code"),
  so these are standing rule-violations, not just hygiene. Others P2.

**Repo rules that bind this work specifically** (executors must read these AGENTS.md
sections): *UX Resilience Rules* (classify at the API client boundary, never
per-screen status-code parsing; shared typed error hierarchy in the schema package) ·
*Fix Development Rules* (silent-recovery ban; structured metric or Inngest event via
`safeSend()`, `console.warn` alone insufficient; 3+ sibling drift → forward-only
guard or tracked sweep) · *Code Quality Guards* (classify raw errors before
formatting; single-use response bodies).

**The bar ("done").** All 8 findings resolved or explicitly re-dispositioned at
review; no bare `catch {}` remains in the swept surfaces; every silent-failure fix
emits a structured signal; mobile screens classify via the shared boundary; every
unit Closed via `/cosmo:review`.

---

## 2. How to use this doc

- **Cosmo is authoritative for live per-WI state.** This file carries charter,
  pointers, unit map, and coarse status only — refresh at checkpoints.
- **Claim before you execute.** Repo AGENTS.md Cosmo operating rules apply in full:
  claim → execute → complete → Reviewing; never self-close; close via `/cosmo:review`.
- **Worktrees:** `.worktrees/<WI-NN>/` via `.agents/skills/worktree-setup/SKILL.md` —
  never EnterWorktree.
- **Status vocabulary (coarse):** `backlog` · `ready` · `in-progress` · `review` · `done`.

### Operating patterns inherited from the IF + PRG-12 dogfoods (apply here)

- **WP DoR bridge** for the two top-down WPs (WI-639/640): bundle brief into page
  body, 2 thin provenance children, `Sub-item` relation, `refine --to-ready` — per
  the IF operator ruling 2026-06-10, extension assumed (operator may veto). The Item
  (WI-641) takes the normal item-level refine path, no bridge.
- **Children pre-sweep at merge** (validated by WI-576).
- **Conditional merge authority** — merge once Reviewing via `complete`, with
  independent green re-verification. Merge ≠ close.
- **Autonomous review loop:** the reviewer watcher
  (`_wip/identity-foundation/review-watcher-v3.ts`, multi-workstream since the
  PRG-12 extension) must cover the **API Error Handling** workstream — the shepherd
  adds it to the config array (one watcher process for all workstreams, never a
  second watcher).

---

## 3. Pointers / index

| What | Where |
| --- | --- |
| **Ratified charter** (THE slice source) | `_wip/umbrella-program/activation-planning.md` §2 → PRG-15 |
| **Findings register** (full finding text, label `errors-api`) | `docs/audit/2026-05-29-full-audit/L-gap-delta.md` |
| **Landed envelope contract** (WI-641's design input; WI-640 context) | `WI-581` diff + `docs/architecture.md` → "LLM Response Envelope" |
| **Umbrella roster** (program altitude) | `_wip/umbrella-program/program-roster.md` |
| **Substrate operating rules** | repo `AGENTS.md` → Cosmo operating rules + UX Resilience + Fix Development Rules |
| **Cosmo Workstream** | "API Error Handling" (Workstreams DB), all 3 units related |

---

## 4. Execution sequence + coarse status

Soft order = Workstream Order. No hard `Blocked-by` edges. WI-639 and WI-640 touch
neighboring API surfaces — run them serially by default; WI-641 (mobile) is safe in
parallel with either.

| Order | Unit | Coarse status |
|---|---|---|
| 1 | WI-639 WP-E15-catch-hygiene | **done** — Closed/Done by autonomous review 2026-06-11 (PR #948, `f54dd3c0f`; one rework round: PR body child-list, shepherd-fixed) |
| 2 | WI-640 WP-E15-typed-errors | **done** — Closed/Done by autonomous review 2026-06-11 (PR #966, `c64327985`, first-pass close; JWKS medium-supervision check passed shepherd-side) |
| 3 | WI-641 IT-E15-mobile-classification | **done** — Closed/Done by autonomous review 2026-06-11 (PR #943, `fc52f96f3`, first-pass close) |

---

## 5. Current position

**2026-06-12 — GRADUATED & WOUND DOWN.** Graduation ratified and processed by the
umbrella orchestrator (roster: `✓ graduated 2026-06-11`; PRG-13 took the lane).
Shepherd shutdown complete: residue items **WI-646** (stripe-webhook Sentry
escalation) and **WI-650** (raw 'Session not found' sweep) triaged → Backlog
(Assisted/P3) via `/cosmo:triage`, deliberately NOT attached to this graduated
workstream — tails are roster-level constructs (PRG-02 precedent); they sit in
normal backlog flow, retrievable for any future quick-land batch. Stage monitor
stopped; WI-639/640/641 worktrees already swept (no local branches remain). The
reviewer-watcher's "API Error Handling" config entry is left in place (shared
infra, harmless — flag for removal at the next watcher maintenance touch).
This stream is dormant; nothing executes from here.

*Residue addendum (2026-06-12):* on operator request, WI-646 and WI-650 were
autonomously refined to Ready, then **executed and merged the same day**:
WI-650 → PR #1036 (merge `8184ecafb`) — all 11 raw throws converted, grep-clean,
Inngest retry semantics verified unchanged (NotFoundError extends plain Error;
no instanceof checks in inngest/). WI-646 → PR #1035 (merge `9d3a1910f`) —
`services/webhooks/signature-failure-escalator.ts`, 5-failures-per-5-min
threshold → one deduplicated captureException per episode (per-isolate
best-effort on Workers, documented), Resend webhook included; two Codex P2s
(flag-before-capture, unbounded timestamp array) fixed in review. Both
finalized via `complete` and **rest at Stage=Reviewing pending a manual
`/cosmo:review`** — they are deliberately outside this workstream, so the
autonomous reviewer does not cover them. Executor worktrees/branches removed.

---

**2026-06-11 — ALL 3 UNITS CLOSED — GRADUATION CANDIDATE.** WI-639, WI-640,
WI-641 all Closed/Done via the autonomous review loop, same day as activation.
All 8 charter findings resolved on `main`: F-022/047/048/049 (PR #948,
`f54dd3c0f`), F-015/016/017 (PR #966, `c64327985`), F-110 (PR #943, `fc52f96f3`).
Provenance children WI-642/643/647/648 swept Closed at their merges. Incidental
captures during the run: **WI-646** (stripe-webhook rate-limited Sentry
escalation, P3) and **WI-650** (raw 'Session not found' sibling-site sweep, P3)
— both outside the charter, left Captured for normal triage. The bar in §1 is
met; awaiting operator graduation ruling. Worktrees `.worktrees/WI-639/640/641`
left in place (merged branches) for a later sweep.

---

## 6. Change log

- **2026-06-11 (shepherd, graduation candidate)** — **WI-640 Closed/Done
  first-pass** (PR #966 → merge `c64327985`; 2 CI rounds; final verdict APPROVED
  0/0/0; shepherd's JWKS medium-supervision diff check passed — shape-validation
  only, no auth-flow shape change, Clerk token-template fallback untouched, so no
  operator escalation was triggered; children WI-647/648 swept at merge; deferred
  raw-'Session not found' sweep captured as WI-650). **All 3 units Closed; all 8
  findings resolved. PRG-15 is a graduation candidate.** Reviewer-side note for
  productionization: CodeRabbit was rate-limited (org credits) for the entire
  WI-639/640 PR lifecycle — claude[bot] + the shepherd gate were the effective
  review layer tonight.
- **2026-06-11 (shepherd, first closes)** — **WI-641 and WI-639 both CLOSED (Done)
  by the autonomous reviewer.** WI-641 closed first-pass. WI-639 took one rework
  round — the reviewer caught a WP DoD conformance gap (PR #948 body listed finding
  IDs but not children WI-642/643); shepherd fixed the PR body directly, restored
  Stage=Reviewing with a `[shepherd:rework]` comment, re-review closed it with full
  AC mapping. 5 of 8 charter findings resolved (F-022/047/048/049, F-110); the
  remaining 3 (F-015/016/017) ride WI-640, still executing. *Lesson:* WP briefs /
  executor briefs should tell executors to list child WIs in the PR body — added to
  the amendments for future WP dispatches (WI-640's PR will need it too; flagged at
  its merge gate).
- **2026-06-11 (shepherd, first merges)** — **WI-641 and WI-639 both MERGED and in
  Reviewing.** WI-641: PR #943 → merge `fc52f96f3` (4 CI rounds: i18n source-baseline
  staleness fix; review round added 2 boundary tests; final verdict APPROVED 0
  findings). WI-639: PR #948 → merge `f54dd3c0f` (3 rounds: billing Sentry
  escalation + 2 regression tests; consent `event` field; final verdict APPROVED,
  2 non-blocking considers). Both finalized via `complete` (Fixed In = landed merge
  commits); children WI-642/643 swept Closed/Done at merge. Incidental **WI-646**
  (stripe-webhook rate-limited Sentry escalation, P3) captured from the un-folded
  consider. **WI-640** bridged (brief + children WI-647/648) → Ready → executor
  dispatched (JWKS hard constraint in brief: shape-validation only, design-divergence
  → STOP → operator before merge). *Ops lesson for the mechanics doc:* the one-shot
  CI watcher can fire in the push→check-suite-registration gap, and claude[bot]
  RE-REVIEWS every push — the merge gate must re-read verdict + checks against the
  exact head SHA and verify the verdict comment postdates the head push (caught a
  stale-green twice tonight).
- **2026-06-11 (shepherd, post-join)** — **WI-639 + WI-641 Ready and dispatched.**
  WI-639 bridged per the standing WP DoR ruling: bundle brief written to the page
  body; provenance children **WI-642** (silence half: F-022/F-047/F-048) and
  **WI-643** (webhook-context half: F-049) captured, `Parent item`-linked;
  `refine --to-ready` passed (Assisted, risk recorded). WI-641 refined normally
  (framing confirmed against existing Description/AC; Assisted). Executors
  `wi639-executor` + `wi641-executor` launched in parallel (Sonnet, worktrees
  `.worktrees/WI-639` / `.worktrees/WI-641`); briefs follow the IF
  protocol-example shape incl. the binding amendments block + merge-before-
  complete ordering (Fixed In must cite the landed commit; reviewer fires on the
  Reviewing transition and expects a merged PR). Stage monitor live on this
  workstream (90s poll, `/tmp/errors-api-wi-stage-state.tsv`). WI-640 held
  serial behind WI-639's merge (neighboring API surfaces; medium supervision).
- **2026-06-11 (shepherd session start)** — **Review loop joined.** The watcher
  config entry for **API Error Handling** (`37c8bce9-1f7c-817c-98ec-d1d4ba0a15e3`,
  no overrides) was already present in `review-watcher-v3.ts` when this shepherd
  read it (pre-added alongside the PRG-12 multi-workstream extension); the shepherd's
  act was **verification, not the edit**: confirmed exactly one watcher process
  (bun pid 79192, restarted 12:30:32Z), baseline + poll 2 (12:31:35Z) list all three
  workstreams, `Reviewing=none` everywhere → seeded cleanly, nothing re-fired. One
  watcher process for all workstreams holds.
- **2026-06-11** — Created at PRG-15 activation (program session), immediately after
  its gate fired (`WI-581` envelope-router Closed). Charter transcribed from ratified
  activation-planning §2; both charter open questions resolved/mooted by the gate
  event; 2-WP + 1-Item slice defined; F-049 folded into catch-hygiene.
