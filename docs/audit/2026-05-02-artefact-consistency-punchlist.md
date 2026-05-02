# Artefact-consistency audit — punch list

**Source recon:** 9-agent audit, 2 rounds, 2026-05-01.
**Last updated:** 2026-05-02 (post AUDIT-SCHEMA-2 recon).
**Coordination branch:** `artefact-consistency` (carries audit-only tracking docs; not merged to main).

---

## Already shipped

| ID | What | Where |
|---|---|---|
| AUDIT-INNGEST-1 | payment.failed observer | PR #132 (`4b63e4b4`) |
| AUDIT-SCHEMA-1 | mobile aiFeedback nullability | PR #132 (`ba3db196`) |
| AUDIT-SKILLS-1 | broken pre-commit hook removed | PR #132 (`11cd1346`) |
| AUDIT-EVAL-1 | Tier 2 runLive inertness documented | PR #132 (`9a4af1d7`) |
| AUDIT-EXTREFS-1 | `db:*:stg` → `db:*:dev` package.json rename | PR #131 |
| AUDIT-GOVERNING-1a | CLAUDE.md Snapshot counts refreshed | PR #131 |
| AUDIT-GOVERNING-1b | "Known Exceptions" subsection added | PR #131 |
| AUDIT-GOVERNING-1c | `ux-dead-end-audit` skill citation removed | PR #131 |
| AUDIT-ARCH-1 | architecture.md drizzle/AppType/route fixes | PR #131 |
| AUDIT-SPECS-1 | plan-status refresh on 4 active plans | PR #131 |
| AUDIT-MEMORY-1 | `dev_schema_drift_trap.md` self-contradiction healed | PR #131 |
| INTERACTION-DUR-L1 | MAX_INTERVIEW_EXCHANGES docs → 4 | PR #134 |
| AUDIT-MIGRATIONS-3 | Migration 0017 rollback notes | PR #135 |
| AUDIT-WORKFLOW | `_wip/` gitignored | direct push to main (`55cd30df`) |
| AUDIT-EVAL-2 | First `runLive` — exchanges flow | PR #137 (merged 2026-05-02 18:18 UTC) |

## In flight

| ID | What | Where |
|---|---|---|
| AUDIT-EVAL-2.1 | Post-merge review fixups for PR #137 | Branched session, branch `audit/eval-runlive-fixup`, PR #139. **Not subject to the audit-extension pause** below — this is hygiene on already-shipped code, not new remediation. |

## Pending audit — extended scope (decided 2026-05-02)

> **All execution work is paused** pending completion of the four audits below. Reason: SCHEMA-2 in particular has known cross-coupling with the schemas package and test infrastructure; mobile and package-scripts also have non-zero cross-coupling. Decision was to see the full picture before remediating en masse, rather than discover cross-issues mid-execution and have to reshape plans midway.
>
> These are the **next four audits in line**, in priority order. Each is a focused recon (~30 min, read-only) producing a finding entry in this punch list. Same audit-vs-execution separation rule applies: the session that conducts the audit does not execute the fix.

- **AUDIT-TYPES-1** (synthesized) — `packages/schemas/` audit: response-schema completeness vs. the 36 RAW route files in SCHEMA-2; typed error hierarchy presence/shape; stale or inconsistent schema definitions
  - Severity: pending recon (anticipated YELLOW-RED given direct SCHEMA-2 coupling)
  - Effort: ~30 min recon
  - Why it matters: direct prerequisite for SCHEMA-2 execution. Without this, every SCHEMA-2 PR may detour to write missing schemas mid-fix.

- **AUDIT-TESTS-1** (synthesized) — test convention compliance audit: test density on top SCHEMA-2 surfaces (`learner-profile.ts`, `sessions.ts`, `dashboard.ts`); `jest.mock` of internal modules in integration tests (CLAUDE.md "no internal mocks" rule); `__tests__/` directory violations of the co-location rule
  - Severity: pending recon (anticipated YELLOW)
  - Effort: ~30 min recon
  - Why it matters: SCHEMA-2 wraps `c.json` with runtime parsing — existing tests must catch shape mismatches or the migration ships silent regressions

- **AUDIT-MOBILE-1** (synthesized) — mobile artefact audit: persona-system rule compliance (`shared components stay persona-unaware`), semantic-token vs. hardcoded-color drift, screen-router convention drift (`unstable_settings`, full-ancestor-chain push rule), `apps/mobile/docs/` if any
  - Severity: pending recon (anticipated YELLOW)
  - Effort: ~30 min recon
  - Why it matters: mobile-specific CLAUDE.md rules have not been swept; latent drift could surface during mobile-touching execution. Lower urgency than TYPES/TESTS but worth front-loading per "full picture" mandate.

- **AUDIT-PACKAGE-SCRIPTS-1** (synthesized) — `package.json` script audit across root + `apps/api` + `apps/mobile` + `packages/*`: orphaned scripts, duplicates, references to renamed/removed tools, naming inconsistency, drift from CLAUDE.md Handy Commands block
  - Severity: pending recon (anticipated YELLOW)
  - Effort: ~30 min recon
  - Why it matters: PR #131 found one drift instance (`db:*:stg` rename); evidence this class has more. Lowest cross-coupling with SCHEMA-2 but standalone audit value confirmed.

## Track B remaining

> ⚠️ Track B and Track C items below are **on hold** until the four pending audits above complete. New cross-issues surfaced by those audits may reshape these plans. Do not spawn execution worktrees for items below without first reconciling against the extended audit findings.



- **AUDIT-GOVERNING-2** Resolve `apps/api/src/routes/sessions.ts` direct drizzle-orm import
  - Severity: YELLOW (governance)
  - Effort: hours (refactor) or 0 (already documented as exception in PR #131; this item is "decide if/when to refactor")
  - Files: `apps/api/src/routes/sessions.ts`
  - Why it matters: one of the non-negotiable engineering rules has a live exception; until refactor lands, every new contributor will ask whether the rule still applies

- **AUDIT-GOVERNING-1d** CLAUDE.md `db:*` Handy Commands sweep
  - Severity: YELLOW
  - Effort: ~10 min
  - Files: `CLAUDE.md` (Handy Commands block)
  - Why it matters: PR #131 renamed scripts; need to confirm all CLAUDE.md `db:*` invocations still resolve

- **AUDIT-SCHEMA-2** Response-schema gap — see [`2026-05-02-audit-schema-2-plan.md`](./2026-05-02-audit-schema-2-plan.md)
  - Severity: **YELLOW-leaning-RED** (escalated 2026-05-02 from unclassified after concrete recon)
  - Effort: multi-PR (~2-4 PRs over the course of the initiative)
  - Why it matters: 36 of 41 route files (88%) violate the CLAUDE.md non-negotiable "`@eduagent/schemas` is the shared contract." Contract exists, ~50 response schemas defined, only `bookmarks.ts` actually uses them.

- **AUDIT-INNGEST-2** Inngest event orphan sweep (escalated 2026-05-02 from unclassified after concrete recon)
  - Severity: YELLOW (silent recovery without escalation per CLAUDE.md)
  - Effort: ~10 min, single PR
  - Files: 2 new observer functions in `apps/api/src/inngest/functions/` (mirror `payment-failed-observe.ts`), wire into `inngest/index.ts`
  - Concrete orphans found:
    | Event | Emitted at | Observer to ship |
    |---|---|---|
    | `app/ask.gate_decision` | `routes/sessions.ts:260` | `ask-gate-observe.ts` (handles both ask.gate_* events) |
    | `app/ask.gate_timeout` | `routes/sessions.ts:274` | (same observer as above) |
    | `app/email.bounced` | `routes/resend-webhook.ts:199` | `email-bounced-observe.ts` |
  - Why it matters: same "consumed by observability tooling but no consumer exists" pattern PR #132 fixed for `app/payment.failed`. The team caught the new drift in #132 but didn't sweep backward; these three are the leftovers.
  - Explicitly cleared as fine (do not re-audit):
    - 27 properly-handled events (full table in `_wip/audit-inngest-2-recon.md` if needed)
    - 4 internal step-chaining signals (`filing.retry_completed`, `filing.auto_retry_attempted`, `session.completed_with_errors`, `session.filing_resolved`) — `step.sendEvent` not external Inngest emission
    - 3 infrastructure events (`idempotency.assistant_turn_lookup_failed`, `idempotency.mark_failed`, `idempotency.preflight_lookup_failed`) — instrumentation-only, intentional

- **AUDIT-SPECS-2** RLS plan status-table refresh (escalated 2026-05-02 from unclassified after concrete recon)
  - Severity: YELLOW (doc consistency — plan internally contradicts itself)
  - Effort: ~30-40 min (verify each Phase row in the status table, refresh wording, archive stale "Implication" paragraph)
  - Files: `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md`
  - Concrete state vs plan claim:
    | Phase | Plan table says (2026-04-27) | Code reality (verified 2026-05-02) | Action |
    |---|---|---|---|
    | 0.0 driver swap | NOT DONE | DONE — `client.ts` uses dual-driver `looksLikeNeon()` selector since PR #126 | Header at top already says this; refresh table row |
    | 0.1 remove fallback | NOT DONE | DONE — `client.ts:60-62` explicitly: "The silent non-atomic fallback... has been removed" | Refresh table row |
    | 0.3 integration test | NOT DONE | LIKELY DONE — `packages/database/src/rls.integration.test.ts` exists (content not verified in this recon) | Spot-check test content; refresh row |
    | 1.3 deploy + verify | unverified | unverified — needs `pg_tables.rowsecurity` query against staging/prod | Run query, document |
    | "Implication" paragraph | "ticking-bomb state" | Stale — header marks it stale but body unchanged | Move paragraph into a `## Historical context` section |
  - Why it matters: plan's reconciliation in PR #131 added a "Phase 0.0 is DONE" header but didn't update the inline status table, creating an internal contradiction that confuses readers about RLS rollout state. Not security-critical (the wording is over-stated, not under-stated), but exactly the "team detects new drift, doesn't sweep backward" pattern this audit was meant to catch.

## Track C cleanups

- **AUDIT-MIGRATIONS-1** Regenerate 10 missing snapshot files in `apps/api/drizzle/meta/`
  - Severity: YELLOW; Effort: ~1 hr
  - Files: `apps/api/drizzle/meta/*.json` (snapshots for migrations 0006–0010, 0013, 0021, 0025, 0043, 0044)
  - Why: silent time bomb for the next `drizzle-kit generate`

- **AUDIT-MIGRATIONS-2** Backward sweep of non-monotonic `_journal.json` `when` timestamps
  - Severity: YELLOW (audit-trail integrity, not runtime); Effort: ~30 min
  - Files: `apps/api/drizzle/meta/_journal.json`
  - Why: PR #129 only fixed entry 0044; backward sweep needed

- **AUDIT-MEMORY-2** `.claude/memory/` ~96-file dedupe
  - Severity: YELLOW (low-impact); Effort: ~1 hr

- **AUDIT-SKILLS-2** Vendored `commands/bmad/` vs installed plugin — pick canonical
  - Severity: YELLOW (cosmetic / maintenance); Effort: ~30 min

- **AUDIT-EXTREFS-2** EduAgent → Mentomate naming sweep across docs/code (carefully — NOT `@eduagent/*` package names)
  - Severity: YELLOW (cosmetic); Effort: ~1 hr

- **AUDIT-EXTREFS-3** Per-package READMEs for `apps/api/`, `apps/mobile/`, `packages/*`
  - Severity: YELLOW (helpful but not urgent); Effort: ~2 hr

- **AUDIT-MIGRATIONS-3-SWEEP** (synthesized) Sweep all destructive migrations for missing `## Rollback` sections
  - Severity: YELLOW; Effort: ~2 hr (PR #135 only fixed migration 0017; broader audit pending)
  - Why: closes the CLAUDE.md "Schema And Deploy Safety" rule across history

## Findings I could not classify confidently (still)

_(AUDIT-INNGEST-2 recon completed 2026-05-02; promoted to Track B above with concrete file list.)_

_(AUDIT-SPECS-2 recon completed 2026-05-02; promoted to Track B above with concrete scope.)_

---

## Audit honesty disclosures

1. Of the original 4 explicit `[AUDIT-*]` IDs in the recon transcript, all shipped in PR #132. Every other ID was synthesized post-hoc by the recon-replay agent (2026-05-02) and tagged `(synthesized)` where applicable.
2. AUDIT-SCHEMA-2 was escalated from "unclassified" after concrete recon found 88% gap, not 25%. The original heatmap underweighted this finding; treat similar "we don't have a file list yet" entries with that caveat.
3. AUDIT-INNGEST-2 was also escalated from "unclassified" after recon — original signal was real, found 3 confirmed orphans matching the same pattern PR #132 fixed for `app/payment.failed`.
4. AUDIT-SPECS-2 was also escalated from "unclassified" after recon — plan was partially reconciled in PR #131 (header) but not fully (inline status table), creating an internal contradiction. **All three originally-unclassified items validated the original recon's signal** — the unclassified bucket was real signal, not noise. Future "we don't have a file list yet" entries should be treated with that prior.
