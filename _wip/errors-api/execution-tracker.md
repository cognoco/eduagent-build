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
| 1 | WI-639 WP-E15-catch-hygiene | backlog |
| 2 | WI-640 WP-E15-typed-errors | backlog |
| 3 | WI-641 IT-E15-mobile-classification | backlog |

---

## 5. Current position

**2026-06-11 — ACTIVATED (program session).** Tracker created; Cosmo Workstream
**API Error Handling** (`37c8bce9-1f7c-817c-98ec-d1d4ba0a15e3`) created; 3 units
sliced as **WI-639/640/641** (Backlog, order 1–3). Nothing claimed; no shepherd
session yet. Next: operator spawns the PRG-15 shepherd with the kickoff brief;
shepherd verifies the reviewer watcher covers this workstream, refines WI-639 to
Ready (DoR bridge), and proposes first pickup.

---

## 6. Change log

- **2026-06-11** — Created at PRG-15 activation (program session), immediately after
  its gate fired (`WI-581` envelope-router Closed). Charter transcribed from ratified
  activation-planning §2; both charter open questions resolved/mooted by the gate
  event; 2-WP + 1-Item slice defined; F-049 folded into catch-hygiene.
