# Baseline delta — artefact-consistency audit corpus vs. HEAD

**Date:** 2026-05-03
**Auditor:** baseline-delta fork
**Scope:** Re-verify the eight clusters in `docs/audit/2026-05-02-consolidated-overview.md` against current HEAD. Identify findings that no longer reproduce, findings that remain true, and new instances introduced since the audit baseline.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion:** `docs/audit/2026-05-02-consolidated-overview.md`, `docs/audit/2026-05-02-artefact-consistency-punchlist.md`
**Window:** baseline `8672bdcd` (2026-05-02 14:57 — last code commit before audit-corpus authoring) → HEAD `7b070296` (2026-05-03 15:16 — merge of PR #143). 18 code-touching commits in this window.

---

## TL;DR

Of the eight clusters, **all eight remain materially live at HEAD**, but the picture has shifted: zero clusters are silently resolved; **C2 is now partially addressed by a forward-only regression guard** (`integration-mock-guard.test.ts`, BUG-743 / T-1) that was added in commit `35fd074a` — exactly the "introduce a guard then sweep" pattern the consolidated overview's meta-pattern critique implicitly recommends. **C4 is materially worse** than estimated: 252 hex-code occurrences across 67 mobile `.tsx` files (estimate was ~50-80); `session/index.tsx` shrank from 10 to 7 hex codes — a partial fix without sweep, the cluster's own meta-pattern playing out in real time. **C1 grew slightly**: `auth.ts` added 2 new `c.json` calls (501 stubs) without schemas, plus a *new* mobile-side mechanism (`contract-drift-check.ts`) that catches deploy-SHA drift but not response-shape drift, so it doesn't substitute for SCHEMA-2. C3, C5, C6, C7, C8 are unchanged at the level of the cluster framing. **One genuinely surprising thing**: the same commit that hardened consent (`35fd074a`) did *not* fix `consent.ts:215` — the `consentResponseSchema` misuse called out by TYPES-1 F2 — even though the commit's blast radius reached the file's neighborhood. That is the meta-pattern caught on a fresh commit, on the cluster the audit explicitly named.

---

## Method

- `git log --since="2026-05-02 00:00" --until="2026-05-04 00:00" --pretty=format:"%h %ci %s"` — enumerate the 18 code commits + 6 doc commits in window. Baseline established as `8672bdcd` (last code commit before audit-corpus authoring; commits `35fd074a`, `5a7db754`, `02ed3861`, `a72ebfac`, `a5834419`, plus all 2026-05-03 commits, are post-baseline).
- `git diff 8672bdcd..HEAD --stat -- 'apps/api/src/routes/'` — 24 route files changed; surveyed each for c.json delta.
- `git diff 8672bdcd..HEAD --stat -- 'apps/mobile/'` — 216 files changed (+7892 / -4371) — confirms profile-as-lens phase 1 + home UI redesign as the dominant code activity.
- `Grep zValidator\('json',\s*consentResponseSchema` in `apps/api/src/routes/consent.ts` — confirms F2 holds at HEAD.
- `Grep zValidator\('json',\s*quickCheckResponseSchema` in `apps/api/src/routes/assessments.ts` — confirms F2 holds at HEAD.
- `Grep c\.json\(` in `apps/api/src/routes` — 232 calls across 39 files (TYPES-1 found 232 across 39, exact match — no net change).
- `Grep ResponseSchema\.parse\(` in `apps/api/src/routes` — 2 hits, both in `bookmarks.ts`. SCHEMA-2's "1 of 41" claim re-confirmed at HEAD.
- `Grep export const \w+ResponseSchema` in `packages/schemas/src` — 22 exports across same 13 files as TYPES-1 found. No new schemas authored.
- `Grep #[0-9A-Fa-f]{6}` in `apps/mobile/src/**/*.tsx` — 252 occurrences across 67 files. **Original audit estimate ~50-80.** Many in `.test.tsx` (likely acceptable); needs production-vs-test split.
- `Glob apps/mobile/**/_layout.tsx` — 16 layouts. `Grep unstable_settings` — 6 layouts have it. `git log --name-only` filtered to `_layout.tsx` since baseline — only `apps/mobile/src/app/_layout.tsx` (root) was touched. No new nested layouts added.
- `Read apps/api/src/services/llm/integration-mock-guard.test.ts` — confirms NEW BUG-743 guard regression-prevents internal LLM mocks in integration tests. KNOWN_OFFENDERS allowlist of 3 files pending migration to HTTP-boundary pattern.
- `Read apps/mobile/src/lib/contract-drift-check.ts` — NEW file, BUG-954, checks deploy-SHA vs local SHA. Adjacent to C1 but does not validate response shape.
- `git log --stat aa041ca0` — plan-archival commit moved 9 specs/plans to `_archive/specs/Done/` or `plans/done/`. **None** of them is the RLS plan referenced by AUDIT-SPECS-2.
- `git diff 8672bdcd..HEAD --stat -- 'package.json' 'apps/api/package.json' 'apps/mobile/package.json' 'pnpm-lock.yaml'` — only root `package.json` touched (7 ins / 6 del; `b6f2b80f` "wrap test scripts with Doppler"). C5 dep counts not invalidated.
- `Grep jest\.mock\(['"]@eduagent/database['"]` repo-wide — 49 occurrences (mostly unit tests, expected). 6 integration-test files mock inngest.

---

## Per-cluster delta

### C1 — Schema contract enforcement

**Still true at HEAD:**
- `apps/api/src/routes/consent.ts:215` still passes `consentResponseSchema` to `zValidator('json', …)` — TYPES-1 Finding 2 holds verbatim.
- `apps/api/src/routes/assessments.ts:158` still passes `quickCheckResponseSchema` to `zValidator('json', …)` — TYPES-1 Finding 2 holds verbatim.
- 22 `*ResponseSchema` exports in `packages/schemas/src/`, identical set to TYPES-1's enumeration.
- 16 dead-by-orphan schemas (Finding 4) — no new wiring detected via grep at HEAD.
- Only `bookmarks.ts:66,80` calls `ResponseSchema.parse()`. SCHEMA-2's "1 of 41" remains "1 of 39 with c.json."

**No longer true at HEAD:** None.

**Newly drifted:**
- `apps/api/src/routes/auth.ts` rewrote three handlers (registration, password-reset-request, password-reset) to return 501 NOT_IMPLEMENTED stubs. Each is a new `return c.json({ code, message }, 501)` without schema validation. These are stubs, so the contract value of validating them is low — but they do contribute 3 new entries to the SCHEMA-2 RAW count.
- `apps/api/src/routes/sessions.ts` and `apps/api/src/routes/interview.ts` added streaming-error SSE writes (#141 hardening). These are SSE writes, not `c.json`, so they don't shift the SCHEMA-2 count, but they do introduce new payload shapes (`{type: 'error', message: string}`) that have no schema in `packages/schemas/`.
- New file `apps/mobile/src/lib/contract-drift-check.ts` (BUG-954) checks API↔mobile **deploy-SHA** mismatch. **Important:** does *not* validate response shape. C1 framing is unchanged — this is an adjacent safety net, not a substitute.

**Net delta:** Cluster framing intact; surface area marginally larger (3 new c.json sites in `auth.ts` + 2 new SSE shapes). The architectural call for SCHEMA-2 is unchanged: most routes still need schema authoring + wrapping. **TYPES-1 F2 is now a stronger finding** — it survived a touch on its neighborhood (`35fd074a` consent hardening) without being noticed, demonstrating the cluster's own meta-pattern.

### C2 — Test integration boundary

**Still true at HEAD:**
- 49 occurrences of `jest.mock('@eduagent/database', …)` repo-wide. Most are unit tests (route `.test.ts` files alongside source) which is acceptable per the rule. Need integration-test triage (still genuinely outstanding).
- 6 files in `tests/integration/` reference `jest.mock(...inngest...)` — confirms TESTS-1's "5 integration tests mock Inngest" with 1 extra surface.
- TESTS-1 F3 (tests don't assert against schemas) holds because schemas still aren't wired (see C1).

**No longer true at HEAD:** None — but the **shape of the cluster has shifted** materially (see "Newly drifted" / framework introduction below).

**Newly introduced (positive):**
- **NEW `apps/api/src/services/llm/integration-mock-guard.test.ts`** (BUG-743 / T-1, added in `35fd074a`). Regression guard: walks `git ls-files apps/api/**/*.integration.test.ts` and fails CI if a new file `jest.mock`s anything matching `(?:^|-)llm(?:-|$)` outside a 3-file `KNOWN_OFFENDERS` allowlist. CLAUDE.md "No internal mocks in integration tests" rule cited explicitly. **The guard is forward-only — it doesn't sweep the existing 3 offenders.**
- KNOWN_OFFENDERS (pending migration to HTTP-boundary mocking via `weekly-progress-push.integration.test.ts` pattern):
  - `apps/api/src/services/session-summary.integration.test.ts`
  - `apps/api/src/services/quiz/vocabulary.integration.test.ts`
  - `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`

**Net delta:** Cluster framing has changed shape. **The forward-only guard already exists for one specific subset (LLM mocks)**; what remains is (a) sweep the 3 KNOWN_OFFENDERS, (b) extend the guard pattern to `@eduagent/database` and `inngest` mocks in integration tests, (c) handle the 6 integration-test files that mock inngest. The implicit recommendation from the consolidated overview's meta-pattern ("introduce guards, then sweep") is now half-instantiated for one channel.

### C3 — Mobile navigation safety

**Still true at HEAD:**
- 16 layouts total in `apps/mobile/src/app/`. 6 have `unstable_settings`. Same set as MOBILE-1's enumeration.
- The four-child `child/[profileId]/_layout.tsx` is in the 10 that don't have it (cited as MOBILE-1 F1's worst case).

**No longer true at HEAD:** None.

**Newly drifted:** None — `git log --since="2026-05-02 14:58" --name-only` filtered to `_layout.tsx` shows only `apps/mobile/src/app/_layout.tsx` (root) was touched in window. No new nested layouts added by profile-as-lens phase 1 despite its 216-file blast radius.

**Net delta:** Cluster unchanged. The MOBILE-1 finding ("six layouts comply, three do not") needs per-layout re-evaluation against the CLAUDE.md rule (only nested layouts with both an `index` and a deeper dynamic child must export `unstable_settings`) — but that work is the original MOBILE-1 deepening, not a re-baseline issue.

### C4 — Mobile design drift

**Still true at HEAD:**
- `apps/mobile/src/app/(app)/session/index.tsx` still contains hardcoded hex codes — but the count dropped from MOBILE-1's "10 hex codes" to **7 at HEAD**. *Partial fix without sweep — the cluster's own meta-pattern playing out on the cluster's own example file.* Worth flagging in the deepening as evidence the meta-pattern is empirically real even within work that's actively being touched.
- `RemediationCard` persona-keyed-strings governance question (MOBILE-1 F4) — not touched in window per stat survey.

**Newly drifted (significant):**
- **Total hex-code occurrences across mobile `.tsx`: 252 across 67 files.** Original MOBILE-1 estimate for the deferred sweep: ~50-80 sites. **Actual is 3-5× larger.**
- Many of the 67 files are `.test.tsx` (e.g., `LearnerScreen.test.tsx:5`, `SortFilterBar.test.tsx:8`, `CelestialCelebration.test.tsx:10`). Those may be acceptable use cases (test fixtures, mock data) and shouldn't all be counted as violations. The deepening must split production .tsx vs .test.tsx.
- Several new production sites exist that weren't in the original audit: `child/[profileId]/index.tsx:4`, `MentomateLogo.tsx:6`, animation/celebration components in `common/celebrations/` (Twin Stars, Polar Star, Comet, Orions Belt — likely intentional brand assets, but worth confirming).

**Newly introduced (positive):**
- `apps/mobile/src/lib/design-tokens.ts` gained `SUBJECT_TINT_PALETTE` (5 light + 5 dark named tints). Hex codes appear in this file by design — it's the canonical source. New `subject-tints.ts` and `subject-tints.test.ts` files consume it. This is good architecture, not a violation.

**Net delta:** **Magnitude estimate for C4's deferred sweep is wrong by 3-5×.** The deepening must rebuild the count with a clean filter (production code only, exclude `.test.tsx`, exclude declared design-token files, exclude celebration brand assets). Until that's done, C4's effort estimate in `2026-05-02-consolidated-overview.md §7` is unreliable.

### C5 — Manifest hygiene

**Still true at HEAD:**
- Only one in-window touch on `package.json`: `b6f2b80f` "wrap test scripts with Doppler, skip RLS test without DATABASE_URL" (7 ins / 6 del). Did not modify dependency declarations.
- `apps/api/package.json` and `apps/mobile/package.json` not touched in window.
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` not in diff stat output.

**No longer true at HEAD:** None.

**Newly drifted:** None.

**Net delta:** Cluster fully intact at HEAD. DEP-DRIFT-1's "24 dups, 14 drifted, 2 phantom" should hold (not exhaustively recounted in this delta — recount is part of the deepening). The architectural "which deps belong at root" call is unchanged.

### C6 — apps/api config

**Still true at HEAD:**
- `apps/api` has no `eslint.config.*`, no `tsconfig.lib.json`, no `tsconfig.spec.json` — verified by glob (none exist at those paths). PACKAGE-SCRIPTS-1 F2/F3 hold.
- `sessions.ts` still imports `from 'drizzle-orm'` (the documented exception).

**No longer true at HEAD:** None — no config files touched in window.

**Newly drifted:** None.

**Net delta:** Cluster fully intact at HEAD.

### C7 — Doc reconciliation

**Still true at HEAD:**
- `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` exists at original path. AUDIT-SPECS-2 finding holds.
- AUDIT-INNGEST-2's three orphan events (`app/ask.gate_decision`, `app/ask.gate_timeout`, `app/email.bounced`) — not verified in this delta but no observer files added in window per stat survey.
- `2026-05-02-audit-schema-2-plan.md` overstated schema count claim — TYPES-1 F5 holds.

**No longer true at HEAD:** None — though commit `aa041ca0` archived 9 plan/spec files, none are in the audit's cited list. (Files moved: `2026-04-18-llm-personalization-audit.md`, `2026-04-18-llm-reliability-ux-audit.md`, `2026-04-18-llm-response-envelope.md`, `2026-04-18-parent-narrative-design.md`, `2026-04-19-prompt-tuning-design.md`, `2026-04-24-progress-screen-redesign-design.md`, `2026-04-29-filing-timed-out-observer-design.md`, `2026-04-19-parent-narrative-implementation.md`, `2026-04-20-prelaunch-llm-tuning.md`.)

**Newly drifted:** Commit `aa041ca0` may have created new inbound-link conflicts — any doc that references the moved 9 files now points at the wrong path. **The cleanup-triage 8-conflict count (consolidated overview §3) may need to be updated to reflect new inbound-link conflicts created by `aa041ca0`.**

**Net delta:** Cluster intact; one new sub-finding to fold in (post-`aa041ca0` link-conflict re-survey).

### C8 — Track C archeology

**Still true at HEAD:** Item-level static state (10 missing migration snapshots, ~96 memory files, vendored bmad, EduAgent → MentoMate sweep, 4 orphan deps, Prettier upgrade) — not exhaustively re-verified in this delta. Each is a static file-system claim and unlikely to have shifted. Trusting the original recon at HEAD pending the eventual execution check.

**No longer true at HEAD:** Unverified — but worth noting that `aa041ca0` archive activity may have absorbed some of the EduAgent → MentoMate or stale-doc work indirectly.

**Newly drifted:** None expected.

**Net delta:** Cluster unchanged for planning purposes.

---

## Cross-cluster observations

- **`35fd074a` is a textbook meta-pattern witness on a live commit.** The same commit that hardened `consent.ts` did not fix `consent.ts:215` (TYPES-1 F2). The same commit that added the `integration-mock-guard.test.ts` for LLM mocks did not extend the guard to `@eduagent/database` mocks (the larger surface). Both are local fixes without backward sweep — exactly the meta-pattern the consolidated overview names. This raises the empirical confidence in the meta-pattern claim from "well-evidenced across 5 of 6 audits at one point in time" to "demonstrably reproducing on fresh commits."
- **`integration-mock-guard.test.ts` is a positive cross-cluster signal.** It's the first live example of the "introduce a forward-only guard, then sweep the back-catalog" pattern that the consolidated overview implicitly recommends. Worth elevating in the plan as a precedent for how to address cluster-shaped problems generally — not just for C2.
- **Profile-as-lens phase 1 (216 files, +7892 / -4371) was the dominant code activity.** It did **not** introduce new layouts (good for C3) but **did** likely introduce new hex-code sites (bad for C4). It also added new production screens and components without authoring response schemas for any new endpoints they consume — perpetuating C1.
- **`b6f2b80f` (Doppler-wrap test scripts)** materially affects the test-running story — `CLAUDE.md`'s "Required Validation" commands may now have hidden Doppler dependencies that the user / agents need to know about. Worth a confirmation read of CLAUDE.md against the new scripts in a separate small recon (not part of the eight clusters but adjacent to C7).

---

## Deepening recon scope adjustments

**C1 TYPES deepening — STILL LAUNCH AS PLANNED, with one addition.**
- 16 dead-by-orphan schemas spot-check + quickCheck/consent shape determination: unchanged scope.
- ADD: confirm `auth.ts` newly-added 501-stub `c.json` calls — should they be in scope for SCHEMA-2 wrapping or excluded as "stubs not worth a schema"? Tiny scope addition.
- ADD: catalogue the new SSE error payload shape from `interview.ts` / `sessions.ts` (`{type: 'error', message: string}`) — should it have a schema in `packages/schemas/`?

**C2 TESTS deepening — REVISE SCOPE.**
- Original: "real-DB harness options memo." Still needed.
- ADD: audit the 49 `jest.mock('@eduagent/database')` occurrences and triage which are unit tests (acceptable, leave) vs integration tests (sweep targets).
- ADD: read `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts` and document the HTTP-boundary mocking pattern it exemplifies — this is the migration target for the 3 KNOWN_OFFENDERS and the broader sweep.
- ADD: propose extending the `integration-mock-guard.test.ts` pattern to cover `@eduagent/database` and `inngest` mocks in integration tests (forward-only guards on additional channels, mirroring BUG-743).
- The guard exists; the deepening's job is now scope-the-sweep, not design-from-zero.

**C4 MOBILE deepening — REVISE SCOPE materially.**
- Original: "full hardcoded-color + persona-keyed-string sweep, ~50-80 sites." Estimate is **3-5× too low**.
- New scope: rebuild the count cleanly:
  - Filter 1: production `.tsx` only (exclude `.test.tsx`).
  - Filter 2: exclude declared design-token files (`design-tokens.ts`, `subject-tints.ts`).
  - Filter 3: separately bucket animation / celebration / brand-asset files (probably acceptable, flag for governance).
  - Bucket the remainder by directory; produce a clean per-directory tally.
- Specifically: **investigate `session/index.tsx` (10 → 7)** — was the partial fix in profile-as-lens-phase-1 deliberate (incremental token migration) or accidental (some hex codes were inside replaced JSX)? This determines whether C4's plan should ride on profile-as-lens-phase-2's coattails or be its own thing.

**C5 DEP-DRIFT deepening — STILL LAUNCH AS PLANNED.**
- Manifest reconciliation worksheet: unchanged. Recount the 24 dups / 14 drifted / 2 phantom at HEAD as a sanity check on top of the deepening (the small `b6f2b80f` touch shouldn't have moved them, but verify).

**C6 PACKAGE-SCRIPTS deepening — STILL LAUNCH AS PLANNED.**
- Explicit-config blueprint for `apps/api`: unchanged. Cluster fully intact at HEAD.

---

## Audit honesty disclosures

- **Sampling rule.** Per-cluster claims were verified via direct grep + file existence checks for the headline findings (the "Still true / No longer true" rows). The tail items (C8 archeology, C5 dep counts, MOBILE-1 F4 governance) were **not** exhaustively re-verified — they're static-state claims and the time budget didn't allow per-item recheck. The deepenings will catch these.
- **C3 nested-layout rule application not re-evaluated.** I confirmed only that no new layouts were added and the 6/16 `unstable_settings` count is unchanged. I did **not** re-check whether the original "3 layouts missing" count is correct against the CLAUDE.md "nested layout with both `index` and deeper dynamic child" rule — that was MOBILE-1's job and remains its job.
- **C7 inbound-link conflicts.** The consolidated overview cites "8 inbound-link conflicts" from cleanup-triage. I noted that `aa041ca0` (9 plan/spec moves) may have created new conflicts but did not enumerate them — that's deepening / cleanup-triage execution work.
- **`@eduagent/database` mock triage** in C2 was counted (49 occurrences) but not classified per-file. The deepening must do the unit-vs-integration split.
- **No new audit findings created.** This delta is strictly a re-baseline against the existing eight clusters. Adjacent observations (e.g., `contract-drift-check.ts`, the SSE error payload shapes, the Doppler script wrap) are flagged as cross-coupling notes, not promoted to new findings.
- **Time spent:** ~30 minutes recon + ~15 minutes writing.
