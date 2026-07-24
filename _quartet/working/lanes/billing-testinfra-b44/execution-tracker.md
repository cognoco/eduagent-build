# BID-44 billing-v2 + test-infra hardening — Execution Tracker

> The lane's substance. `roles/shepherd-protocol.md` holds the process; this holds the
> lane specifics. Disposable by construction — per-WI state lives in Cosmo, never here.

## 🔴 REFINERY RESHAPE — 2026-07-23 (READ BEFORE THE BINDING TABLE BELOW)

The refinery pass (work order 39481) reshaped this batch AFTER the membership table
below was written. The table is the *formation* membership; **this note is the current
dispatchable state.** Where they conflict, this note wins until the PM rules.

- **WI-2619 — DISPATCH-READY.** Refinery: Ready, DoR-sound, unchanged. Start here.
- **WI-2620 — DISPATCH-READY.** Refinery: Ready, DoR-sound. Second (shared billing surface).
- **WI-2000 — HOLD (needs-pm).** Refinery wants LRU-by-touch `maxEntries` eviction+reset
  variants added to the AC. Do not dispatch until the PM amends.
- **WI-1999 — HOLD (split-proposed).** Refinery: A family-join / B speaking-practice /
  C mobile stale-response are distinct change classes. Awaiting PM topology decision.
- **WI-2344 — HOLD (needs-pm).** AC says ~30 sites; origin/main actually has 113
  fake-timer test files. Refinery wants a property-defined matching set. Await PM.
- **WI-1847 — DISSOLVED, DO NOT CLAIM.** Already implemented by WI-1862. Pending PM
  disposition. (Note: a prior directive listed this as dispatch-now; the refinery
  overrode that — it is dead work.)
- **WI-1866 — DISSOLVED, DO NOT CLAIM.** Exact guard already landed under WI-1862;
  residual cross-suite sweep is subsumed by WI-2344. Pending PM disposition.

**Net: dispatch WI-2619 → WI-2620 now; hold the other five; claim NOTHING that is
DISSOLVED.** The orchestrator (`orchestrator:claude:mentomate`) will feed corrected
items as the PM rules. Your own tracker below predicted 1847/1866 would dissolve — it
was right, though the cause was WI-1862, not WI-2344.

## Charter

Land the seven BID-44 member items to Cosmo Close: real (non-mocked) coverage for the
billing-v2 webhook path, real-database regressions for top-up credit, and the test-infra
hardening that keeps the API suite honest and runnable on current local Node.

"Done" = every member item Closed by the independent reviewer, with no absorption of
adjacent work.

## BINDING membership — exactly seven items, no absorption

| WI | Stage at formation | Pri | Workstream | Item |
|---|---|---|---|---|
| WI-2619 | Ready | P2 | Store, Billing & Release | Non-mocked billing-v2 webhook selector + route-binding |
| WI-2620 | Ready | P2 | Store, Billing & Release | Real-database regressions for billing-v2 top-up credit |
| WI-2000 | Backlog | P2 | Launch Readiness | Unit-test sliding-window rate limiter and IP resolver |
| WI-1999 | Backlog | P2 | Supporter & Linking | Route-handler tests for family-join + speaking-practice |
| WI-2344 | Backlog | P2 | Dev-Infra & Tooling | Centralize jest fake-timer save/restore in apps/api |
| WI-1847 | Ready | P3 | Post-MVP pen | Local pre-push jest failures: setTimeout/clearTimeout |
| WI-1866 | Backlog | P3 | Post-MVP pen | gemini.test.ts fails under local Node 26 |

Anything outside these seven is a **formation finding** — escalate on the lane, do not absorb.

## Sequence

Pair the two billing-v2 items first (WI-2619 → WI-2620; shared surface, warm context), then
the test-infra cluster. **WI-2344 before WI-1847 and WI-1866** — centralizing fake-timer
save/restore is plausibly the root cause of both timer failures, so doing it first may
shrink or dissolve them. Re-check both after WI-2344 lands rather than assuming.

## Canon authority

Repo `AGENTS.md` (eduagent-build) governs engineering rules. **Read it knowing it is
truncated**: it is ~54.5k characters against a ~40k harness ceiling, so everything from
"Repo-Specific Guardrails" (char 41,090) onward — including **PR Review & CI Protocol**
(char 50,054), Secrets Management, Code Quality Guards and Fix Development Rules — may be
absent from your context. If you need a rule from those sections, read the file directly
rather than relying on what loaded.

## Gate discipline

- **No merge without an explicit Gate-1 grant** from `orchestrator:claude:mentomate`, per PR,
  naming the exact head SHA. `/cosmo:merge`'s own predicate is NOT sufficient — it knows
  nothing of Gate-1 and a rule-following shepherd breaches by default.
- Request Gate-1 with the verdict **BODY**, not a check status. A CodeRabbit *check* going
  SUCCESS is not a verdict; a completed review **rewrites its summary comment into a
  walkthrough**. A frozen "currently processing" marker is a dead review, not a pending one.
- "Review skipped / no new commits since the last review" is the **incremental-ledger trap**
  — bookkeeping, not coverage. Escalate to `@coderabbitai full review` once.
- Never push a commit to re-trigger a reviewer: a new head voids the claude-review verdict
  you hold and restarts the whole predicate.
- **Gate-1 is a code-quality gate, not an AC-conformance gate.** The independent adversarial
  reviewer owns conformance and the close. Point each AC at what *demonstrates* it — an
  executed red→green — never at a passing suite.

## Scope fences

No schema migrations, no external-contract changes, no clacks/substrate edits, no
quartet-protocol edits. Executors never merge. Never self-close.

Dev Neon is **push-only by design** (WI-649): `db:migrate:dev` is a disabled stub and
`deploy.yml` migrates staging/production only. Shared-dev-DB hygiene is an open defect class
(WI-1628 and relations) — leave no test rows behind and do not "fix" dev by hand.

## Pointers

- Batch brief: BID-44 page in Cosmo (item list + rationale)
- Orchestrator: `orchestrator:claude:mentomate` — route `needs-orchestrator` / `blocked` /
  `decision` lines to lane `billing-testinfra-b44`
- Standard: `zdx/standard/` (schema, lifecycle, DoR/DoD, conformance)
