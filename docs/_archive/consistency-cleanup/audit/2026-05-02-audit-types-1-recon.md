# AUDIT-TYPES-1 — `packages/schemas/` recon

**Date:** 2026-05-02
**Auditor:** audit-types-1 fork
**Scope:** Recon `packages/schemas/` for response-schema completeness vs. SCHEMA-2's 36 RAW route files, typed-error-hierarchy presence/shape, and stale/inconsistent schema definitions.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

The shared contract package is structurally healthy — 31 source modules, a clean `index.ts` barrel, 13 typed error classes, a frozen `ERROR_CODES` map, and an `apiErrorSchema`. **But the response-schema layer is in a half-finished state.** Of 22 `*ResponseSchema` exports, only **3 are actually used** (`bookmarks.ts`); 2 are **misused as input validators** (`assessments.ts:158`, `consent.ts:215` use response schemas inside `zValidator('json', …)`); and 13 are **wired-up nowhere** in `apps/api/`. Two error classes that the mobile API client throws (`QuotaExceededError`, `ResourceGoneError`) live only in `apps/mobile/src/lib/api-errors.ts`, defeating the cross-package `instanceof` guarantee that BUG-644/P-4 was meant to establish. SCHEMA-2 PR 1 (top-3 files: learner-profile/sessions/dashboard) is **unblocked** — corresponding schemas exist. SCHEMA-2 PR 2 and PR 3 are **partially blocked**: roughly 23 of the 36 RAW route files have no matching response schema in the package and will require authoring during migration.

## Severity

**YELLOW-RED** — typed-error hierarchy is incomplete in a way that violates the explicit `errors.ts` doc-comment intent ("two parallel classes mean two `instanceof` checks fail silently"), and two route files use *response* schemas as *input* validators, which is a type-vs-shape lie that will surface as a real bug once SCHEMA-2 wraps responses with the same names.

## Methodology

- `Glob` `packages/schemas/**/*.ts` — inventory: 31 source modules in `src/` (the `dist/` and `out-tsc/` matches are gitignored, confirmed via `git check-ignore`).
- `Read` `packages/schemas/src/index.ts` — confirms barrel exports 14 domain modules + `errors.ts` + `common.ts`.
- `Read` `packages/schemas/src/errors.ts` (full file) — typed-error hierarchy, `ERROR_CODES`, `apiErrorSchema`.
- `Grep` `c\.json\(` in `apps/api/src/routes/*.ts` — 232 calls across 39 files; matches SCHEMA-2 plan's "232 calls" claim.
- `Grep` `from '@eduagent/schemas'` in `apps/api/src/routes/*.ts` — 34 files (so 5 routes import nothing from the package).
- `Grep` `export const \w+ResponseSchema` in `packages/schemas/src` — **22 exports across 13 files** (not "~50" as SCHEMA-2 plan claimed; reconcile below).
- `Grep` `ResponseSchema\.parse\(` in `apps/api/src/routes` — exactly 2 hits, both in `bookmarks.ts`. No other route validates its response.
- `Grep` each named `*ResponseSchema` in `apps/api/src/routes` — 13 are never imported anywhere (dead exports for SCHEMA-2 purposes).
- `Read` `apps/mobile/src/lib/api-errors.ts` — confirms which classes are mobile-only vs. re-exported.

## Findings

### Finding 1 — Typed-error hierarchy is half-consolidated; `QuotaExceededError` and `ResourceGoneError` still mobile-only

- **Severity:** YELLOW-RED
- **Files:** `packages/schemas/src/errors.ts` (13 exported classes); `apps/mobile/src/lib/api-errors.ts:26-35` (`QuotaExceededError`); `apps/mobile/src/lib/api-errors.ts:49-64` (`ResourceGoneError`); `apps/mobile/src/lib/api-errors.ts:70-82` (`NetworkError`); `apps/mobile/src/lib/api-errors.ts:89-100` (`UpstreamError`).
- **Evidence:** `errors.ts:6-19` doc-comment states the package was created "so the API service can THROW them and mobile code CATCH them with a real `instanceof` match" and explicitly warns that "two parallel classes mean two `instanceof` checks fail silently across the package boundary." Yet `apps/mobile/src/lib/api-errors.ts:14` already imports the data type `QuotaExceeded` from `@eduagent/schemas` while defining the matching class **locally**. CLAUDE.md "UX Resilience Rules" specifies "QuotaExhaustedError, ResourceGoneError, ForbiddenError" as required typed errors — only `ForbiddenError` lives in the shared package.
- **Why it matters:** API-side code can never throw `QuotaExceededError` for a cross-package `instanceof` — this is BUG-644 in miniature, partially fixed and abandoned. Any future "unified API client middleware classifies once" work (CLAUDE.md "UX Resilience Rules → typed error hierarchy") cannot lean on these two classes across the boundary until they migrate.
- **Anticipated effort:** ~1-2 hr (move 2 classes to schemas; update mobile re-exports; verify no dual-define remains; the data-type `QuotaExceeded` is already in the package so the data half is done).
- **Suggested track:** B

### Finding 2 — Two response schemas are used as input validators (type-vs-shape lie)

- **Severity:** YELLOW-RED
- **Files:** `apps/api/src/routes/assessments.ts:158` (`zValidator('json', quickCheckResponseSchema)`); `apps/api/src/routes/consent.ts:215` (`zValidator('json', consentResponseSchema)`).
- **Evidence:** `zValidator('json', X)` validates the **request body** against `X`. Both routes pass a schema named `*ResponseSchema` to it, meaning either (a) the schema name lies and it is actually an input shape, or (b) the route is validating inputs against an output shape (likely too strict, likely silently rejecting valid requests, or — if the input/output happen to coincide — a structural coincidence the codebase will eventually break).
- **Why it matters:** SCHEMA-2 PR 2 plans to wrap `c.json(...)` with `consentResponseSchema.parse(...)`. If the schema's actual shape is "input-shaped" (because that is what assessments and consent are using it for), wrapping the response with it will reject valid responses or accept wrong ones. Must reconcile **before** SCHEMA-2 touches these files.
- **Anticipated effort:** ~30 min recon + ~1-2 hr fix (rename, split into request/response pair, or correct the misuse).
- **Suggested track:** B (must precede SCHEMA-2 PR for those two files)

### Finding 3 — Response-schema coverage gap: 13 schema files vs. 36 RAW route files

- **Severity:** YELLOW
- **Files:** schemas exist for: `account, assessments, billing, bookmarks, consent, feedback, filing, learning-profiles, notes, progress, quiz, sessions, subjects` (13 modules with at least one `*ResponseSchema`).
- **Evidence:** `Grep` for `export const \w+ResponseSchema` returned 22 matches in 13 files. SCHEMA-2's RAW list contains 36 route files; deduping against the 13 with schemas leaves **~23 RAW route files (e.g. `learner-profile.ts`, `dashboard.ts`, `settings.ts`, `retention.ts`, `interview.ts`, `curriculum.ts`, `dictation.ts`, `vocabulary.ts`, `parking-lot.ts`, `auth.ts`, `streaks.ts`, `homework.ts`, `book-suggestions.ts`, `topic-suggestions.ts`, `support.ts`, `language-progress.ts`, `coaching-card.ts`, `onboarding.ts`, `revenuecat-webhook.ts`, `profiles.ts`, `snapshot-progress.ts`, `test-seed.ts`)** with no matching response schema in the package.
- **Why it matters:** SCHEMA-2 PR 1 (top-3 by `c.json` count = `learner-profile.ts`, `sessions.ts`, `dashboard.ts`) — only `sessions.ts` has a response schema (`learnerRecapResponseSchema`); `learner-profile.ts` and `dashboard.ts` have **none**. The plan's pattern ("most do") understates the gap. PR 2 and PR 3 will be schema-authoring efforts as much as call-wrapping efforts. Either expand the stretch PR 4 ("define missing response schemas") into a prerequisite, or accept that each migration PR is also a schema-package-write PR.
- **Anticipated effort:** built into SCHEMA-2 PR estimates; this finding is a recon correction, not a separate punch-list item.
- **Suggested track:** B (reshape SCHEMA-2 plan rather than independent fix)

### Finding 4 — 13 dead-by-design `*ResponseSchema` exports + 3 dead-by-orphan in billing.ts

- **Severity:** YELLOW
- **Files:** `packages/schemas/src/quiz.ts:163,170,181,214` (4); `packages/schemas/src/filing.ts:65`; `packages/schemas/src/progress.ts:200,385` (2); `packages/schemas/src/account.ts:6,15` (2); `packages/schemas/src/sessions.ts:384`; `packages/schemas/src/subjects.ts:266,321` (2); `packages/schemas/src/feedback.ts:15`; `packages/schemas/src/notes.ts:19`; `packages/schemas/src/billing.ts:57,63,68` (3 — `checkoutResponseSchema`, `portalResponseSchema`, `cancelResponseSchema`).
- **Evidence:** `Grep` of every named `*ResponseSchema` against `apps/api/src/routes` produced **zero** import matches for the 16 schemas above. Combined with Finding 3, this means 16 of 22 (73%) schemas were defined but never wired, and SCHEMA-2 should validate each against current route output before adopting — schemas that have drifted since authoring will explode under `.parse()`.
- **Why it matters:** Confirms SCHEMA-2 plan's "migration started and abandoned" thesis with file:line precision. These are pre-built parts on a shelf; whether they **fit** the current responses is unverified. The SCHEMA-2 risk row "existing schemas are wrong or outdated" should be promoted from "risk" to "expected condition for ~16 schemas; verify each on first wrap."
- **Anticipated effort:** baked into SCHEMA-2 PRs; per-file ~5-10 min reconcile (read schema, compare to actual `c.json` payload).
- **Suggested track:** B (informational input to SCHEMA-2 plan)

### Finding 5 — `billing.ts` claim in SCHEMA-2 plan is inverted

- **Severity:** GREEN (informational; corrects a plan claim)
- **Files:** `apps/api/src/routes/billing.ts:3-10` (imports); `packages/schemas/src/billing.ts:57,63,68` (3 unused response schemas).
- **Evidence:** SCHEMA-2 plan, line 22, says billing "imports schemas but never uses." Grep shows `apps/api/src/routes/billing.ts` imports only **request** schemas (`checkoutRequestSchema`, `topUpRequestSchema`, `byokWaitlistSchema`, `familyAddProfileSchema`) plus `ERROR_CODES`. The **response** schemas (`checkoutResponseSchema`, `portalResponseSchema`, `cancelResponseSchema`) are defined in `packages/schemas/src/billing.ts` but never imported anywhere — they fall under Finding 4's "dead by orphan." The plan's wording conflates "imports something from `@eduagent/schemas`" (true) with "imports response schemas" (false).
- **Why it matters:** A small inaccuracy that will surface as confusion in the SCHEMA-2 PR 2 author's first commit. Worth correcting in the plan so the author starts with the right mental model.
- **Anticipated effort:** ~5 min — one-line edit to `2026-05-02-audit-schema-2-plan.md`.
- **Suggested track:** B (minor doc fix; bundle with the next punch-list housekeeping)

## Cross-coupling notes

- **TESTS-1:** Should expect to find that the 3 SCHEMA-2 priority surfaces (`learner-profile.ts`, `sessions.ts`, `dashboard.ts`) have tests asserting status codes but **not response shapes**, because there is no schema available to assert against (Finding 3). If TESTS-1 finds shape assertions on those files written by hand, SCHEMA-2 PR 1 should refactor them to use the new response schemas it adds. Also: TESTS-1 should be alert to tests that reuse `quickCheckResponseSchema` / `consentResponseSchema` — if those tests rely on the schema as an input shape (Finding 2), renaming the schemas will break them.
- **MOBILE-1:** Mobile already imports typed errors from `@eduagent/schemas` (verified: `apps/mobile/src/lib/api-errors.ts:14-21`). MOBILE-1 should be aware of Finding 1 — any mobile component doing `instanceof QuotaExceededError` or `instanceof ResourceGoneError` will keep working because the class is mobile-local, but the moment Finding 1 is fixed, mobile must `import { QuotaExceededError } from '@eduagent/schemas'` to retain `instanceof` integrity. MOBILE-1 should not file a new finding for this — it is a TYPES-1 finding with a mobile follow-up.
- **PACKAGE-SCRIPTS-1:** `packages/schemas/dist/` and `out-tsc/jest/` showed up in `Glob` but are gitignored (verified). PACKAGE-SCRIPTS-1 should still spot-check the `build`, `clean`, `test`, and `typecheck` scripts in `packages/schemas/package.json` — if a `clean` script doesn't remove `out-tsc/`, that build artefact will accumulate. Out of scope for this audit.

## Out of scope / not checked

- **Request schema completeness.** Only response schemas were enumerated. Request-schema gaps (e.g. routes that hand-roll Zod inline instead of importing) were not surveyed.
- **Schema correctness vs. actual response payloads.** Finding 4 names 16 dead-by-orphan schemas; this audit did not verify whether each correctly mirrors the route's current output. SCHEMA-2 must do that per-file at wrap time.
- **`common.ts` and `age.ts`.** Read briefly via barrel export; not deep-checked for stale shapes.
- **`stream-fallback.ts`, `llm-envelope.ts`, `inngest-events.ts`, `depth-evaluation.ts`.** Domain-specific contracts not directly relevant to SCHEMA-2 c.json wrapping; skipped.
- **`packages/database/`.** Out of scope by name.
- **Test files inside `packages/schemas/`.** Surfaced by glob (e.g. `errors.test.ts`, `inngest-events.test.ts`) but not opened — TESTS-1 will likely sample them.

## Recommended punch-list entries

```markdown
- **AUDIT-TYPES-1.1** Move `QuotaExceededError` and `ResourceGoneError` into `packages/schemas/src/errors.ts`
  - Severity: YELLOW-RED
  - Effort: ~1-2 hr
  - Files: `packages/schemas/src/errors.ts`, `apps/mobile/src/lib/api-errors.ts:26-64`, downstream `instanceof` callers
  - Why it matters: completes the BUG-644/P-4 consolidation that `errors.ts:6-19` doc-comment described as the entire reason the package exists; without it, `instanceof QuotaExceededError` in API code cannot match an instance caught in mobile (or vice versa) — the exact silent-failure mode the comment warns against. CLAUDE.md "UX Resilience Rules → typed error hierarchy" implicitly requires this.

- **AUDIT-TYPES-1.2** Reconcile `quickCheckResponseSchema` and `consentResponseSchema` misuse as input validators
  - Severity: YELLOW-RED
  - Effort: ~1-2 hr (per file: confirm whether shape is request-shaped or response-shaped; rename or split into request/response pair)
  - Files: `packages/schemas/src/assessments.ts:100`, `packages/schemas/src/consent.ts:22`, `apps/api/src/routes/assessments.ts:158`, `apps/api/src/routes/consent.ts:215`
  - Why it matters: SCHEMA-2 PR 2 will wrap responses with these same schemas; if the schema is in fact request-shaped, wrapping will validate against the wrong shape and reject correct responses. Must precede SCHEMA-2 PR for these two files.

- **AUDIT-TYPES-1.3** Update `2026-05-02-audit-schema-2-plan.md` with corrected coverage data
  - Severity: YELLOW
  - Effort: ~30 min
  - Files: `docs/audit/2026-05-02-audit-schema-2-plan.md`
  - Why it matters: plan claims "~50 response schemas" — actually 22. Plan claims `learner-profile.ts` migration only requires wrapping — actually requires authoring a new schema. Plan's `billing.ts` line is inverted (Finding 5). Correct numbers will reshape PR 2/PR 3 effort estimates.

- **AUDIT-TYPES-1.4** Spot-check 16 dead-by-orphan `*ResponseSchema` exports against actual route payloads
  - Severity: YELLOW (track-C-flavored, but couples tightly with SCHEMA-2 PR 2)
  - Effort: ~10 min × 16 schemas ≈ 2-3 hr
  - Files: 16 schemas listed in Finding 4
  - Why it matters: each pre-defined schema is an unverified contract. Reconciling now (before SCHEMA-2 PR 2) means PR 2 cannot inherit a stale schema and silently break a response. Could be folded into a SCHEMA-2 prerequisite step instead of a standalone item.
```

## Audit honesty disclosures

- **Sampling rule.** Full sweep of route files (39 with `c.json`) and full sweep of `*ResponseSchema` exports (22). No sampling for the headline counts. **Schema correctness was not verified** — Finding 4 says 16 schemas are unused, not that they are wrong; the SCHEMA-2 plan must do correctness reconciliation per-file at wrap time.
- **`packages/schemas/dist/` and `out-tsc/jest/`** appeared in glob output. Verified gitignored via `git check-ignore` so they were excluded from analysis. If a future `git status` shows them tracked, that's a separate finding for whoever audits package builds.
- **Inferred mappings.** Finding 3's "~23 RAW route files have no response schema" is inferred by intersecting the SCHEMA-2 plan's 36-RAW list with the 13 schema-file list — not by per-file inspection of every routing handler. A few cases may have inline literal-shape responses with no candidate schema name, which would not reduce the count but might shift the per-file effort.
- **Time spent:** ~25 min recon + writing.
