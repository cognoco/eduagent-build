# Consistency Cleanup Plan

**Last updated:** 2026-05-11 UTC (plan-PRs PR-01 – PR-10 merged via bake-off; see bake-off findings)
**Branch:** `consistency2`
**Replaces:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md` (superseded; preserved as historical record only)
**Maintained by:** `/my:audit-status` skill (read mode refreshes PR/file claims; deviation mode appends to Deviations Log)

---

## Orientation

Living tracker for the artefact-consistency cleanup workstream. **This is not a recap of audit findings** — read the source recons (`docs/audit/2026-05-03-*.md`, `docs/audit/2026-05-02-consolidated-overview.md`) for evidence and reasoning. This doc tracks **what's left to do, who owns it, and what's blocked on a decision**.

### Stage model

Work is bucketed into three stages by status:

- **Stage 1 — Autonomous (`status: todo`, no `Owner`):** Subagent-executable work with files-claimed metadata. Coordinator dispatches; subagent fixes; coordinator commits.
- **Stage 2 — Blocked (`status: blocked`):** Notes column specifies the block type: `blocked-dependency on PR-XX` (must wait for another PR), `blocked-validation: <criteria>` (needs production data or time-gated verification), or `blocked on D-XXX` (decision pending — now all resolved). Once the block clears, status moves to `todo`.
- **Stage 3 — In-flight or shipped (`in-progress` / `review` / `done`):** PR column populated; coordinator drives.

### Reading the status tables

Each cluster table uses the audit-status skill schema:

```
| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
```

- `Status` ∈ {`todo`, `in-progress`, `blocked`, `review`, `done`}
- `Owner` is agent name or empty (claim by setting it)
- `PR` is `#NNNN` GitHub number or commit hash for direct merges
- `Files-claimed` is a glob/path list — coordination metadata so two agents don't touch the same files concurrently
- `Notes` carries severity tag `[YELLOW]` / `[YELLOW-RED]` / `[RED]`, effort estimate, and decision-ID dependencies

---

## Recent main activity (since 2026-05-04)

PRs that landed on main since the plan was first written, and how they affect plan items. Maintained across validation sweeps (DEV-002: 2026-05-08, DEV-003: 2026-05-09).

| PR | Date | Summary | Effect on plan |
|---|---|---|---|
| #153 | 2026-05-05 | "cleanup branch — schemas, i18n, polyfills, Hermes leak guards" | Added `queued` field to `feedbackResponseSchema` (closes **C1 P2**). Touched many schema files but did NOT do the renames or wraps the plan targets. |
| #155 | 2026-05-05 | "harden external-boundary mocks per C1 D-MOCK-1/D-MOCK-2" | Touched C2 P3 target files; hardened mock patterns only. C2 P3 still pending. |
| #163 | 2026-05-05 | "Student UX v2 + library/shelf fixes + API stream resilience" | **C4 P1 hex count shrank from 20→6** (`session/index.tsx` and `_layout.tsx` now zero hex). |
| #170 | 2026-05-06 | "tighten integration test mock comments and break-test assertions" | Same as #155 — C2 P3 still pending. |
| #171 | 2026-05-06 | **"GC1 ratchet — block new internal jest.mock() in PRs"** | **Supersedes C2 P1 and C2 P2. Unblocks C2 P4.** |
| #175 | 2026-05-07 | "app-ev" | Touched `inngest/index.ts`, `notes.ts`, `progress/_layout.tsx`, `sessions.ts`, `progress.ts`. New features, no plan-item closures. |
| #177 | 2026-05-07 | "consistency2" merge | Plan housekeeping + Archon scaffolding. No execution. |
| #180 | 2026-05-07 | "app-ev2" (267 files) | **C2 P3 shrank: removed all `jest.mock` from `interview-persist-curriculum.integration.test.ts`** — only 2 of 3 LLM offenders remain. Touched `sessions.ts`, `interview.ts`, `billing.ts`, `billing.ts` schema, `sessions.ts` schema. |
| #183 | 2026-05-08 | **"Stabilization: library drill-through and progress polish"** | **C5 P1 mostly done:** deleted ~17 mobile-runtime deps from root. Added `scripts/check-no-mobile-deps-at-root.cjs` forward guard. **C5 P8 done:** Prettier 3 upgrade (`^2.6.2` → `^3.0.0`). Lockfile regen. |
| #169, #172, #173, #174 | 2026-05-06 | memory/profilelens/ux-emotion/consistency | No direct plan-item closures. |

**Merged 2026-05-09: PR #187** ("UX cleanup and mobile reliability polish", 368 files). Touched 8 plan-relevant files but did NOT execute any plan items (no three-way `AgeBracket`, no `QuotaExceededError`/`ResourceGoneError` move to schemas, no orphan observers, no `streamErrorFrameSchema`). Net effect on the plan: file content shifted in 8 plan-claimed paths; the `blocked-validation: PR #187` gates are now LIFTED. Agents claiming the affected phases (C1 P1, C1 P3, C1 P5, C4 P7, C7 P1) must re-read those files at HEAD because line numbers and surrounding code have changed, but no further wait is required.

Touched files (verified 2026-05-09, pre-merge):
- `apps/api/src/routes/sessions.ts` — C1 P5 emission sites
- `apps/api/src/inngest/index.ts` — C7 P1 observer registration point
- `packages/schemas/src/age.ts` — C4 P7 (adds `isAdultOwner()` helper; does NOT expand `AgeBracket` to three-way)
- `packages/schemas/src/errors.ts` — C1 P1 (adds `SafetyFilterError`; does NOT add `QuotaExceededError`/`ResourceGoneError`)
- `packages/schemas/src/progress.ts` — C1 P3 territory
- `apps/mobile/src/lib/profile.ts` — C4 P7
- `apps/mobile/src/app/(app)/_layout.tsx` — C4 P7
- `apps/mobile/src/app/(app)/mentor-memory.tsx` — C4 P7
- `apps/api/drizzle/meta/0063-0068_snapshot.json` — fills 3 of 14 missing snapshots + ships 3 new migrations with snapshots

**Phases formerly blocked-validation on PR #187:** C1 P1, C1 P3, C1 P5, C4 P7, C7 P1. **All gates lifted 2026-05-09 (PR #187 merged).** Agents claiming these phases must re-read claimed files at HEAD because line numbers shifted, but they are no longer blocked. C8 P1 shrunk from 14→11 missing snapshots after merge.

**PR #188** is open from `consistency2` (this branch); informational only, not subject to plan-overlap analysis.

**Workflow-development drafts (do NOT merge):** PRs #179, #184, #185 and similar Archon-flavored drafts are workflow-scaffolding artifacts, not cleanup landings. All to be closed unmerged.

**Net effect on Stage 3 plan (cumulative to 2026-05-09):**
- **Done:** C1 P2 (PR #153), C2 P1 + C2 P2 (superseded by PR #171), **C5 P8** (PR #183)
- **Unblocked:** C2 P4 (was blocked on P2)
- **Scope shrank:** C4 P1 (6 hex / 4 files, was 20 / 6), **C2 P3** (2 offenders, was 3 — PR #180 drained `interview-persist-curriculum`), **C5 P1** (~17 changes remaining, was 32 — PR #183 deleted most root mobile deps + added guard script)
- **Scope will shrink on PR #187 merge:** C8 P1 (11 missing snapshots, currently 14)
- **C1 P3 re-scoped (DEV-004):** all 6 target route files are fully wrapped (multi-line `c.json(\n  schema.parse({...}),\n  status\n)` pattern). Earlier sweep grep was single-line-only and missed it. P3 is now just a dead-export deletion in `progress.ts`.

---

## Pending Decisions (Stage 2 input)

Each ID below blocks one or more cluster phases. Resolve in any order; once resolved, mark blocked phases as `todo` and update Notes.

| ID | Decision needed | Source | Blocks | Recommendation |
|---|---|---|---|---|

---

## Resolved Decisions

Decisions promoted from Pending to executable. Captured here so the rationale survives even after the affected cluster phases close.

| ID | Resolved | Decision | Resolution | Rationale |
|---|---|---|---|---|
| D-C1-1 | 2026-05-03 | Disposition of no-matching-route `*ResponseSchema` exports | **Hybrid (2 deletes + 2 renames + 1 deferred):** (a) Delete `internalQuizRoundResponseSchema` + `InternalQuizRoundResponse` (zero consumers anywhere). (b) Delete `homeCardsResponseSchema` + `HomeCardsResponse` (zero consumers — `HomeCard` singular type is separate and stays). (c) Rename `learnerRecapResponseSchema` → `learnerRecapLlmOutputSchema` (+ type alias `LearnerRecapLlmOutput`). (d) Rename `filingResponseSchema` → `filingLlmOutputSchema` (+ type alias `FilingLlmOutput`); **keep function name `buildFallbackFilingResponse` unchanged** — only the schema and type rename. (e) Defer adjacent `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema` rename to C1 P3 (the wrap PR), where celebrations.ts is already in scope. **Note (2026-05-09):** the `coachingCardCelebrationResponseSchema → pendingCelebrationsResponseSchema` rename actually shipped upstream before C1 P3 ran. C1 P3 is retained only to delete the now-dead `coachingCardCelebrationResponseSchema` export — see DEV-004. | Deletes match the strict "zero consumers" evidence bar set by `internalQuizRound*`. Renames give honest `*LlmOutputSchema` names that future SCHEMA-2 sweeps can filter by suffix convention. Function name kept stable to minimize cascade — type rename is the high-signal change. Adjacent rename deferred to keep D-C1-1 PR focused on dead-or-misnamed `*Response` exports without a real route. |
| D-C1-2 | 2026-05-03 | Disposition of `auth.ts` 501 stubs | **Delete the entire stub surface (Option 2, scope expanded post-verification).** Delete `apps/api/src/routes/auth.ts` (3 stub routes), `apps/api/src/routes/auth.test.ts` (9 test cases for 501 stubs), `packages/schemas/src/auth.ts` (3 schemas + 3 type aliases — zero consumers anywhere). Remove import + mount from `apps/api/src/index.ts:35` and `:199`. Verification confirmed: zero mobile callers, zero non-route consumers of the schemas, `@eduagent/factory.buildRegisterInput` is archival noise (the package doesn't exist on disk — separate ghost-package cleanup tracked under C8). **Revision (2026-05-09):** the original "zero consumers outside stubs" claim for `ERROR_CODES.NOT_IMPLEMENTED` was based on incomplete grep. `apps/api/src/routes/billing.ts:729` consumes it via `ProfileRemovalNotImplementedError` for cross-account family profile removal — a live business path. P7 scope reduced: keep `ERROR_CODES.NOT_IMPLEMENTED` and the `/v1/auth/` `PUBLIC_PATHS` exemption removal is the only safe cleanup beyond auth-stub deletion itself. | 404 surfaces real bugs that 501-with-explanation would mask. ERROR_CODES kept clean of non-error codes (`NOT_IMPLEMENTED` is "intentionally absent," not "something went wrong" — different concerns). Schemas had no consumers despite a JSDoc claim of mobile/Clerk client-side validation use — the JSDoc is aspirational; reality is dead code. Expanded scope = same direction, more dead code removed. |
| D-C4-1 | 2026-05-03 | `RemediationCard` persona-keyed strings governance | **Delete the dead branch (supersedes original "Allow + clarify CLAUDE.md" recommendation).** Epic 12 deleted `personaType`; `isLearner` is a Story-10.9 fossil missed by Story 12.5's literal-string `personaType` sweep. The single caller (`recall-test.tsx:215`) hard-codes `isLearner={true}`, so the teen branch is provably unreachable dead code. Delete `isLearner` prop + teen branch + `getCooldownMessage` teen path; hard-code learner copy. ~30 min YAGNI cleanup, not refactor. Also sweep 3 stale persona comments (`MentomateLogo.tsx:25`, `QuotaExceededCard.tsx:12`, `LivingBook.tsx:19`). Broader persona-fossil sweep surfaced `relearn.tsx` as a second `isLearner` fossil and `personaFromBirthYear()` as root cause — tracked separately as D-C4-3 and D-C4-4. | Original recommendation "Allow + clarify CLAUDE.md" was architectural backsliding post-Epic-12 — it would codify the exact failure mode that let the fossil survive Story 12.5's sweep. Both MOBILE-1 and MOBILE-2 deepenings asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all?" (Epic 12 answered: no). The "2-4 hr refactor" cost estimate was wrong — actual cost is ~30 min dead-branch deletion at the real call-site count (1 caller, hard-coded `true`). |
| D-C4-2 | 2026-05-04 | Brand/animation/celebration hex carve-out in CLAUDE.md | **Codify exemption.** Add exception clause to CLAUDE.md "Non-Negotiable Engineering Rules" hex-color rule: brand-fixed hex in SVG-internal animation and celebration components (`*Animation.tsx`, `*Celebration.tsx`, `AnimatedSplash.tsx`, `MentomateLogo.tsx`) is acceptable when annotated in-file with brand intent. Covers 13 files / 98 hex occurrences. | Tokenizing 98 SVG-internal brand colors adds indirection with no runtime or maintenance benefit — SVG fills/strokes are design primitives co-located with animation timing. Without the carve-out, every future hex sweep re-flags the same 13 files, creating noise that masks real violations (the 20 across 6 production files tracked in C4 P1). Pattern-based exemption is greppable and enforceable by future lint rules. |
| D-C4-3 | 2026-05-04 | `personaFromBirthYear()` root migration | **Option C: Expand shared schema to three-way.** (1) Update `packages/schemas/src/age.ts`: `AgeBracket = 'child' \| 'adolescent' \| 'adult'`; add `< 13 → 'child'` branch to `computeAgeBracket()`. (2) Update `packages/schemas/src/age.test.ts`: replace BUG-642 two-value guard with three-value contract test. (3) Delete mobile's `personaFromBirthYear()` from `apps/mobile/src/lib/profile.ts`; all 5 mobile callers import `computeAgeBracket` from `@eduagent/schemas` instead. (4) Update `consent-copy.ts` to accept `AgeBracket`. (5) Update existing shared-schema consumers (`tell-mentor-input.tsx`, `use-rating-prompt.ts`) to handle new `'child'` value. (6) Update 4 test mocks. `relearn.tsx` included (D-C4-4). **Note (2026-05-09):** `packages/schemas/src/age.ts:14-16` JSDoc currently says "Same thresholds, different purpose. **Do not unify.**" — that text is the artifact this resolution invalidates and must be rewritten as part of P7. Also: `apps/mobile/src/app/(app)/session/index.tsx:304` has a doc comment referencing `personaFromBirthYear` thresholds — comment-only update, add to Files-claimed. | Preserves the three-way age-appropriate copy split (child-friendly for <13, descriptive for 13-17, clinical for 18+) that `mentor-memory.tsx` and `consent-copy.ts` depend on. An 11-year-old and a 17-year-old have meaningfully different reading comprehension — collapsing to two-way would lose the simpler-language tier. Expanding the shared schema is cleaner than maintaining a parallel mobile-only function: one function, one type, one source of truth. BUG-642's guard was correct for the previous product state but the three-axis Epic 12 model supports the finer granularity. The `@see personaFromBirthYear` JSDoc in `age.ts:14` already acknowledged the relationship — now we unify them. |
| D-C4-4 | 2026-05-04 | `relearn.tsx` `isLearner` fossil disposition | **Migrate within P7 scope (absorbed into root migration).** Verified: `relearn.tsx` has a live two-way branch (not dead code like RemediationCard) — the value comes from the real profile `birthYear`, so both adolescent and non-adolescent paths are reachable. Rename `isLearner` → `isAdolescent`, rename constants `TEACHING_METHODS_LEARNER` → `TEACHING_METHODS_ADOLESCENT` and `COPY_LEARNER` → `COPY_ADOLESCENT`. P8 merged into P7 — same mechanical change as other callers. | Unlike RemediationCard (caller hard-coded `true` → dead teen branch), `relearn.tsx` receives a real computed value. Both branches serve users. The fix is vocabulary alignment (same as 4 sibling callers), not dead-code deletion. Separate phase tracking was unnecessary overhead — one atomic migration PR is cleaner than splitting the same rename across two phases. |
| D-C7-1 | 2026-05-04 | Stale plan/spec memory sweep | **Sweep executed and completed.** 10 project-type memory entries checked against `git log --since=2026-04-18`. Results: 4 STALE (archived: `project_parent_visibility_spec`, `project_ux_review_pass`, `project_open_bugs`, `project_multiple_coaching_cards`), 2 archived with Notion issue follow-ups (`project_prod_approval_gate` → Notion P2, `project_template_repo` → Notion P3), 1 archived as abandoned (`project_f8_memory_source_refs` — spec file missing, user-facing features unimplemented), 1 archived per user (`project_deploy_config_open` → covered by Notion prod gate issue). 1 flagged for post-C4-P7 update (`project_persona_removal.md` line 31). MEMORY.md Active Work section updated. | Sweep confirmed the drift audit's suspicion: 8 of 10 entries were stale or better tracked in Notion. Memory system should hold durable architectural decisions and active constraints, not work-item status — Notion is the canonical tracker for that. |
| D-MEM-1 | 2026-05-04 | Memory overlap-flags reconciliation | **REINFORCES is authoritative — keep entries, supersede older doc.** The `2026-05-03-memory-drift-audit.md` classification (REINFORCES) takes precedence over `memory-overlap-flags.md` (DELETE) for the conflicting entries. Mark the affected entries in `memory-overlap-flags.md` as superseded with a reference to the drift audit's per-entry classification. Do not delete the memory entries. | The drift audit is newer, more thorough, and used a nuanced classification that distinguishes "overlapping" from "reinforcing." Two entries approaching the same topic from different angles (e.g., one describing the rule, one describing the rationale) are both useful — the overlap-flags doc's simpler dedup heuristic didn't account for this. Keeping both entries costs nothing (memory files are small); deleting a reinforcing entry risks losing context in future sessions. |
| D-C6-2 | 2026-05-04 | Maestro guard symmetry | **Option (b): Drop the broken `nx.json targetDefaults.e2e` block (lines 71-87).** The nx target runs bare `maestro test` bypassing the `pretest:e2e*` barricade hooks in root `package.json`. Nobody uses `nx run mobile:e2e` — documented workflow is direct Maestro CLI, and the active e2e entrypoint is Playwright via `pnpm test:e2e:web*`. Verify `nx graph` after removal. | Clean removal beats parallel guard maintenance. The nx target is unused infrastructure that creates a false affordance — someone running `nx run mobile:e2e` gets no barricade, no environment setup, and a confusing failure. If Maestro re-enters the CI/dev flow, add the target back properly with the barricade wired in. |
| D-C6-1 | 2026-05-04 | `jest.config.cjs` tsconfig switch | **Option A: Switch jest to `tsconfig.spec.json`.** One-line change in `apps/api/jest.config.cjs`: swap `tsconfig.app.json` → `tsconfig.spec.json` in the ts-jest transform config. Verify with `pnpm exec nx run api:test` smoke run before merging. | Standard pattern matching `packages/database` and `apps/mobile`. Eliminates the config split where typecheck and jest disagree on what's in scope — `tsconfig.app.json` excludes `**/*.test.ts` but ts-jest silently ignores that exclusion. After the switch, both `tsc --build` and jest use `tsconfig.spec.json` for test files, making type errors in tests visible to CI typecheck. Low breakage risk since both configs extend `tsconfig.base.json` with identical base settings. |
| D-C5-2 | 2026-05-04 | Pin-style convention for SDK-coupled mobile deps | **`~` (tilde) per Expo recommendation.** During 1a-EXECUTE, align the 8 drifted Expo SDK-coupled deps from `^` to `~`: `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-svg-transformer`, `metro-config`, `metro-resolver`. Document in CLAUDE.md Repo-Specific Guardrails: "Expo SDK-coupled mobile deps use `~` (tilde) pins, not `^`." | Expo SDK releases are tested against specific minor versions of these packages. `^` allows untested minor combinations to creep in between SDK upgrades. `~` constrains to patch-only, matching Expo's compatibility matrix. Slightly more manual work on SDK bumps (explicit minor version changes) is a worthwhile trade for build stability. |
| D-C5-1a | 2026-05-04 | 83-row dependency worksheet architectural call | **Execute Buckets B + C + E confirmed removals.** Scope: (1) Delete 23 Bucket B entries from root `package.json` (mobile-runtime deps with 0 root/api consumers — mobile already declares all of them). (2) Delete 7 Bucket C entries from root (multi-workspace deps already declared per-workspace — `hono`, `react`, `react-dom`, `react-native`, `react-native-web`, `nativewind`, `@testing-library/react-native`). (3) Delete 2 confirmed Bucket E orphans from `apps/api/package.json` (`@neondatabase/serverless`, `@clerk/types`). (4) Align root `dotenv` from `^16.4.5` → `^16.4.7` (drive-by, matches `packages/test-utils`). (5) For `react-native-css-interop`: move dep to `apps/mobile`, leave `pnpm.patchedDependencies` entry + `patches/` file at root (pnpm reads patches from root regardless). (6) Single `pnpm install` + lockfile regen. Verify: `pnpm exec nx run-many -t typecheck`. Total: 32 deletions + 1 version align. Prettier 3 upgrade (C5 P8) deferred to standalone PR — Notion issue created. | Root manifest is a "tooling + mobile-runtime junk drawer." All 30 B+C entries are already declared in their consuming workspace — the root copies are historical duplicates from before per-workspace manifests. Zero behavioral change expected (pnpm resolves from workspace declarations, not root). Bucket E removals are confirmed zero-import orphans. Keeping Prettier 2→3 separate preserves clean `git blame`. |
| D-C1-3 | 2026-05-03 | SSE schema scope (error-frame only vs. unified envelope) | **Option 1: error-frame only.** Author `streamErrorFrameSchema = z.object({type: z.literal('error'), message: z.string()})` in `packages/schemas/src/stream-fallback.ts` (sibling to existing `streamFallbackFrameSchema`). Add `.parse()` at the 4 emission sites in `interview.ts:254-263, 413-418` and `sessions.ts:363-368, 507-511`. **Drop `apps/mobile/src/lib/sse.ts` from C1 P5 Files-claimed** — server-side validation only, no consumer-side change. Defer unified `streamFrameSchema` discriminated union (covering `chunk + fallback + done + error`) and mobile-consumer migration to new C1 P8 (blocked on P5 + production validation period). **Revision (2026-05-09):** schema must be `z.object({ type: z.literal('error'), message: z.string(), code: z.string().optional() })` to accept the existing `code: errorCode` field on the first error frame. `apps/api/src/routes/interview.ts` no longer exists; emission sites are now only in `sessions.ts` (lines around 570 and 712 — verify line numbers before edit, PR #187 modifies `sessions.ts`). Drop `interview.ts:254-263, 413-418` from the emission-site list. | Bounded blast radius beats theoretical completeness. Mirrors `streamFallbackFrameSchema` precedent (single-frame schema, not union). Bundling the consumer-side refactor with the server-side schema gap mixes risk profiles in one PR; debugging gets harder. After P5 ships and the `.parse()` pattern is validated, an envelope follow-up can revisit *with data* rather than committing to a design upfront. Optional `code` field preserves the machine-readable error classification that mobile clients rely on while keeping the schema permissive for the no-code variant. |

---

## PR Execution Plan (Stage 3)

Consecutive numbering across all clusters. **Numbering does not imply strict sequential order** — many PRs are independently startable. See "Key dependencies" below for ordering constraints.

| PR | Cluster | Phases | Summary |
|---|---|---|---|
| PR-01 | C1 | P1+P2 | Move typed errors to `@eduagent/schemas/errors.ts` + add `queued` to `feedbackResponseSchema` → merged #200 |
| PR-02 | C1 | P3 | Delete dead `coachingCardCelebrationResponseSchema` export from `progress.ts` (zero consumers; route wraps + rename already shipped upstream). → merged #198 |
| PR-03 | C1 | P4+P5+P6 | Rename misnamed request schemas, author response schemas, add `streamErrorFrameSchema`, execute D-C1-1 dispositions → merged #199 |
| PR-04 | C1 | P7 | Delete auth 501 stub surface (routes, tests, schemas, mount) → merged #201 |
| ~~PR-05~~ | C2 | ~~P1+P2~~ | **SUPERSEDED by PR #171 (GC1 ratchet).** No PR needed; C2 P1 and P2 closed-as-done. |
| PR-06 | C2 | P3 | Drain 2 remaining LLM mock allowlist offenders (~7-10 hr). → merged #209 |
| PR-07 | C2 | P4 | Drain 5 Inngest mock allowlist offenders + shared `tests/integration/mocks.ts` setup. ~~Blocked on PR-05.~~ **Unblocked** — GC1 ratchet (#171) prevents regression during/after drain. → merged #204 |
| PR-08 | C3 | P1+P2 | `unstable_settings` on `quiz/_layout.tsx` + `AccordionTopicList` cross-tab push fix. (Workflow-development drafts #179/#184/#185 ran this PR's input; all to be closed unmerged.) → merged #196 |
| PR-09 | C4 | P1+P2 | Replace 6 hex literals across 4 files with tokens + CLAUDE.md brand hex carve-out → merged #208 |
| PR-10 | C4 | P3+P4+P6 | RemediationCard dead branch deletion + persona comment sweep + weekly-report route verification + persona-fossil guard test → merged #206 |
| PR-11 | C4 | P7 | Root migration: `personaFromBirthYear()` → `computeAgeBracket()` across all callers. **Land before PR-17.** |
| PR-12 | C5 | P1 | ~17 dep changes (6 root duplicate deletions, 2 api orphan deletions, dotenv align, 8 mobile tilde pins, expand `check-no-mobile-deps-at-root.cjs` FORBIDDEN list). **Land before PR-13.** |
| PR-13 | C5 | P3+P7 | Small dep fixes bundle — declare `@react-navigation/native`, consolidate `onlyBuiltDependencies`. (P4/P5 absorbed into PR-12. P6 verified: not orphan, kept.) |
| PR-14 | C6 | P1b+P2 | Drizzle-import guard test + `apps/api/eslint.config.mjs` |
| PR-15a | C6 | P3a | `tsconfig.spec.json` plumbing + jest config switch (2 files as delivered — see P3a notes). Defers ~279 type errors and project-reference wiring to PR-15b–f. |
| PR-15b | C6 | P3b | TS18046 — type unknown response bodies and mock vars (~99 errors / 15 files). |
| PR-15c | C6 | P3c | TS7006 — implicit `any` callback params in test files (~119 errors / ~42 files). |
| PR-15d | C6 | P3d | TS7006 + TS2345 in `eval-llm/flows/*.ts` production files (~7 errors / 5 files). |
| PR-15e | C6 | P3e | TS2769/2339/2353/2345/2352/2322 — heterogeneous test type fixes (~50 errors / ~24 files). |
| PR-15f | C6 | P3f | Closure — add `tsconfig.spec.json` to `apps/api/tsconfig.json` references, re-enable `noUncheckedIndexedAccess` and `noUnusedLocals`, gate `tsc --noEmit -p tsconfig.spec.json` in `api:typecheck`. |
| PR-16 | C6 | P4+P5 | Drop broken nx e2e block + rename `db:generate` → `db:generate:dev` |
| PR-17 | C7 | P1+P2+P3+P4+P5+P7 | Doc reconciliation bundle — Inngest observers, RLS plan refresh, CLAUDE.md persona rule + db:* commands, UX spec paths, SCHEMA-2 plan numbers, baseline-delta amendment, overlap-flags supersede. **Co-land with PR-27.** |
| PR-18 | C8 | P1 | Regenerate 11 missing drizzle migration snapshots |
| PR-19 | C8 | P2 | Fix non-monotonic `_journal.json` timestamps |
| PR-20 | C8 | P3 | Sweep destructive migrations for missing rollback sections |
| PR-21 | C8 | P4 | Memory file dedupe (~96 files) |
| PR-22 | C8 | P5 | Resolve vendored bmad commands vs installed plugin |
| PR-23 | C8 | P6 | EduAgent → Mentomate naming sweep (docs/code string literals, NOT `@eduagent/*` package names) |
| PR-24 | C8 | P7 | Per-package READMEs |
| PR-25 | C9 | P1 | Archive/delete 25 Cat 1 obsolete files with link redirects |
| PR-26 | C9 | P2 | Per-file decision on 23 Cat 2 possibly-obsolete files |
| PR-27 | C9 | P3 | 8 inbound-link conflicts. **Co-land with PR-17.** |
| PR-28 | C9 | P4 | Verify 116 Cat 3 keep-files for current relevance |
| PR-29 | C9 | P5 | Archive `docs/specs/done/` and `docs/plans/done/` folder moves with inbound-link fixes |

### Key dependencies

- ~~**PR-02 → PR-06:** C2 LLM mock drain needs C1 schema wraps for test assertions~~ — **stale (DEV-004):** the route wraps were already shipped upstream; PR-02 is now just a single dead-export deletion. PR-06 is independently startable.
- ~~**PR-05 → PR-07:** Inngest mock drain needs the guard test in place first~~ — superseded; GC1 ratchet (PR #171) provides forward-only protection at CI level. PR-07 is independently startable.
- **PR-11 → PR-17:** CLAUDE.md persona rule wording depends on `computeAgeBracket()` vocabulary (specifically PR-17 sub-phase P3; other PR-17 sub-phases are independent of PR-11).
- **PR-12 → PR-13:** Shared lockfile — small dep fixes must follow the large manifest cleanup.
- **PR-17 ↔ PR-27:** Inbound-link conflicts must co-land with doc reconciliation.
- **PR-25 ↔ PR-27:** Cat 1 archive moves must co-land with inbound-link fixes to avoid broken references.
- **PR-25 (or PR-29) ↔ PR-27:** PR-29's folder moves create new archive paths; if PR-29 lands separately from PR-25, its inbound-link fixes still need PR-27's coordination. Co-land or sequence carefully.

### Independently startable (no ordering constraints)

PR-11, PR-12, PR-14, PR-15, PR-16, PR-18, PR-19, PR-20, PR-21, PR-22, PR-23, PR-24, PR-26, PR-28, PR-29.

(PR-05 superseded by GC1 ratchet. PR-13 sequenced after PR-12. PR-17 / PR-25 / PR-27 are co-land-coordinated. PR #187 `blocked-validation` gates lifted 2026-05-09 — agents claiming PR-01, PR-02, PR-03, PR-11, PR-17 must re-read affected files at HEAD but no longer wait.)

### Human involvement required

These PRs need coordinator or human review beyond agent execution:
- **PR-12** (C5 P1): ~17 dep changes (6 root duplicate deletions, 2 api orphan deletions, dotenv align, 8 mobile tilde pins, FORBIDDEN list expansion) — human review of manifest changes before merge
- **PR-20** (C8 P3): Migration rollback sections — requires reading each destructive migration and writing rollback assessment
- **PR-23** (C8 P6): EduAgent→Mentomate naming sweep — broad string-literal change needs human review to avoid touching `@eduagent/*` package names
- **PR-25** (C9 P1): Obsolete file archival — human decision on link redirects
- **PR-26** (C9 P2): Possibly-obsolete files — per-file human decision required

---

## Cluster status

### C1 — Schema contract enforcement

**Source:** TYPES-1, SCHEMA-2 plan, TYPES-2 deepening, baseline-delta
**Severity (recalibrated):** **RED** (gates C2 timing)
**Headline:** Route wraps and the celebrations rename already shipped upstream (verified 2026-05-09 — see DEV-004). 1 schema needs `queued` field added (DONE in PR #153). 2 schema renames + 2 new response schemas needed (P4). 1 SSE schema needed with optional `code` field (P5, revised). 2 typed errors must move to `@eduagent/schemas` for type co-location (P1, BUG-947 guard pattern preserved). 4 no-route schemas need disposition: 2 deletes + 2 renames per D-C1-1 (P6). 1 dead schema export to delete in `progress.ts` (P3). 3 auth 501 stubs to delete; `ERROR_CODES.NOT_IMPLEMENTED` preserved per DEV-004 (P7).

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Move `QuotaExceededError` and `ResourceGoneError` class definitions to `@eduagent/schemas/errors.ts` for type co-location. **Do NOT change the mobile classifier's `error.name` + shape guards** — Metro HMR breaks `instanceof` for cross-module class identity (BUG-947). The guard pattern is intentional and stays. Update mobile imports to pull the classes from `@eduagent/schemas`. | done | | #200 | `packages/schemas/src/errors.ts`, `apps/mobile/src/lib/api-errors.ts`, `apps/mobile/src/lib/format-api-error.ts`, `apps/mobile/src/components/session/use-session-streaming.ts`, `apps/mobile/src/lib/api-client.ts` | [YELLOW-RED] ~1-2 hr. **PR #187 modified `packages/schemas/src/errors.ts` (added `SafetyFilterError` + formatting) — agent must re-read at HEAD before editing.** Definition of Done: `QuotaExceededError` and `ResourceGoneError` are exported from `@eduagent/schemas/errors.ts`, mobile imports updated, BUG-947 tests pass unchanged. Verify: `pnpm exec jest --findRelatedTests packages/schemas/src/errors.ts apps/mobile/src/lib/api-errors.ts --no-coverage` + `pnpm exec nx run api:typecheck` + `cd apps/mobile && pnpm exec tsc --noEmit`. |
| P2 | AUDIT-TYPES-2.2 — Add `queued: z.boolean()` to `feedbackResponseSchema` before any wrap | done | | PR #153 | `packages/schemas/src/feedback.ts` | [YELLOW] ~15 min. **Shipped 2026-05-05 in PR #153** — `feedback.ts:17` now has `queued: z.boolean()`. |
| P3 | Delete the dead `coachingCardCelebrationResponseSchema` export (and its inferred type) from `packages/schemas/src/progress.ts`. **Note (2026-05-09):** route wraps and the celebrations rename were already shipped upstream; only the dead schema export remains. Verified zero consumers via `rg 'coachingCardCelebrationResponseSchema'` returning only the export site. | done | | #198 | `packages/schemas/src/progress.ts` | [YELLOW] ~10 min. **PR #187 modified `progress.ts` — agent must re-read at HEAD before editing.** Definition of Done: `rg 'coachingCardCelebrationResponseSchema' packages apps` returns zero hits. Verify: `pnpm exec nx run api:typecheck` + `pnpm exec jest --findRelatedTests packages/schemas/src/progress.ts --no-coverage`. |
| P4 | AUDIT-TYPES-2.3 — Rename `quickCheckResponseSchema` → `*RequestSchema` and `consentResponseSchema` → `consentRespondRequestSchema`; author real response schemas | done | | #199 | `packages/schemas/src/assessments.ts`, `packages/schemas/src/consent.ts`, `apps/api/src/routes/assessments.ts`, `apps/api/src/routes/consent.ts` | [YELLOW-RED] ~1.5 hr. Verify: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage` + `pnpm exec nx run api:typecheck`. |
| P5 | Per D-C1-3 (revised 2026-05-09): author `streamErrorFrameSchema = z.object({ type: z.literal('error'), message: z.string(), code: z.string().optional() })` in `packages/schemas/src/stream-fallback.ts` (sibling to `streamFallbackFrameSchema`). Add `.parse()` at the 2 emission sites in `sessions.ts` (the one with `code: errorCode` and the one without). Add a unit test asserting both shapes parse. Server-side only. | done | | #199 | `packages/schemas/src/stream-fallback.ts`, `packages/schemas/src/stream-fallback.test.ts`, `apps/api/src/routes/sessions.ts` | [YELLOW] ~30 min. Resolved by D-C1-3 (revised). **PR #187 modified `sessions.ts` — agent MUST re-read at HEAD to find the current emission-site line numbers (they are around 574-578 and 743-746 on origin/main as of 2026-05-09; verify before edit).** Definition of Done: both error frames parse via `streamErrorFrameSchema.parse()` in unit tests; `apps/api/src/routes/interview.ts` does NOT exist (already deleted upstream). Verify: `pnpm exec jest --findRelatedTests packages/schemas/src/stream-fallback.ts apps/api/src/routes/sessions.ts --no-coverage` + `pnpm exec nx run api:typecheck`. |
| P8 | AUDIT-TYPES-2.4-FOLLOWUP — Unified `streamFrameSchema` discriminated union; migrate `apps/mobile/src/lib/sse.ts`. | blocked | | (future) | `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/sessions.ts`, `apps/mobile/src/lib/sse.ts` (+ tests) | [GREEN] ~2 hr. **blocked-dependency on PR-03 + blocked-validation: PR-03 must run in production ≥1 week without `.parse()` errors before expanding to full envelope.** **Note (2026-05-09):** `apps/api/src/routes/interview.ts` removed from Files-claimed — file was deleted upstream before this phase was authored. |
| P6 | AUDIT-TYPES-2.5 — Resolve no-matching-route schemas per D-C1-1: 2 deletes + 2 renames. **Do NOT rename function `buildFallbackFilingResponse`.** | done | | #199 | `packages/schemas/src/quiz.ts`, `packages/schemas/src/progress.ts`, `packages/schemas/src/sessions.ts`, `packages/schemas/src/filing.ts`, `packages/schemas/src/filing.test.ts`, `apps/api/src/services/session-recap.ts`, `apps/api/eval-llm/flows/session-recap.ts`, `apps/api/src/services/filing.ts`, `apps/api/src/services/filing.integration.test.ts` | [YELLOW] ~2 hr. Resolved by D-C1-1. |
| P7 | Per D-C1-2 (revised 2026-05-09): delete entire auth stub surface (routes, tests, schemas, mount). Also: remove `export * from './auth'` from schema barrel and remove `/v1/auth/` from `PUBLIC_PATHS` (dead exemption — **pre-executed by PR #195, see DEV-006**). **Do NOT delete `ERROR_CODES.NOT_IMPLEMENTED`** — `apps/api/src/routes/billing.ts:729` is a live consumer (`ProfileRemovalNotImplementedError` for cross-account family profile removal). Post-deletion behavior: unauthenticated calls → 401 (auth middleware rejects before routing — correct, don't reveal path existence); authenticated calls → 404 (route not found — surfaces real bugs per D-C1-2 rationale). Add a test confirming `POST /v1/auth/register` returns 401/404 after deletion. Update the assertion in `tests/integration/auth-chain.integration.test.ts` (line ~66 + JSDoc at line 10) — it currently asserts `/v1/auth/*` skips auth via PUBLIC_PATHS, which is now false. | done | | #201 | `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth.test.ts`, `packages/schemas/src/auth.ts`, `packages/schemas/src/index.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/index.ts`, `tests/integration/auth-chain.integration.test.ts` | [GREEN] ~1 hr. Resolved by D-C1-2 (revised). **`ERROR_CODES.NOT_IMPLEMENTED` is preserved — `billing.ts:729` consumes it.** Definition of Done: `rg "from '\\./auth'"` returns zero hits in `packages/schemas/src/index.ts`; `auth.ts` files are deleted; `billing.ts:729` still compiles and references `ERROR_CODES.NOT_IMPLEMENTED`. Verify: `pnpm exec nx run api:typecheck` + `pnpm exec nx run api:test`. |

**Cross-coupling:**
- ~~C1 P3 → unblocks C2 sweep~~ — stale (DEV-004): route wraps already shipped upstream; PR-02 is now a dead-export deletion only. C2 P3 has no upstream dependency.
- C1 P4 must precede SCHEMA-2 PR 2 (current schemas can't validate the actual response shapes)
- C1 P5 (P6, P7 closely follow) constitute SCHEMA-2 PR 2 effective scope

---

### C2 — Test integration boundary

**Source:** TESTS-1, TESTS-2 deepening, baseline-delta (BUG-743 finding)
**Severity:** **YELLOW** (unchanged; guard exists for one channel; sweep + extend remains)
**Headline:** Real-DB harness already exists (`weekly-progress-push.integration.test.ts` is the migration exemplar). BUG-743 LLM mock guard is the precedent. TESTS-1 F2 was overstated (driver shim, not behavior mock). **Sweep target after PR #180 + DEV-004 corrections:** 2 LLM integration offenders (was 3) + 5 Inngest integration offenders + `tests/integration/mocks.ts` shared setup (was "6"). New per-channel guards superseded by GC1 ratchet (PR #171).

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-TESTS-2A — Extend BUG-743 guard pattern to `@eduagent/database` mocks in integration tests (forward-only, empty allowlist) | done | | PR #171 | n/a | **Superseded 2026-05-06 by GC1 ratchet (PR #171)** — CI step blocks any new internal `jest.mock()` in test diffs across all channels (db, inngest, llm, anything). Per-channel runtime guard test no longer needed. See "Closed/revised" section. |
| P2 | AUDIT-TESTS-2B — Extend BUG-743 guard pattern to `inngest` mocks (initial allowlist of 6) | done | | PR #171 | n/a | **Superseded 2026-05-06 by GC1 ratchet (PR #171)** — same as P1. C2 P4 is no longer blocked; GC1 prevents regressions during/after the drain. |
| P3 | AUDIT-TESTS-2C — Drain LLM allowlist: migrate ~~3~~ **2** remaining KNOWN_OFFENDERS to HTTP-boundary or provider-registry pattern | done | | #209 | `apps/api/src/services/session-summary.integration.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/services/llm/integration-mock-guard.test.ts` | [YELLOW] ~~~10-15 hr~~ ~7-10 hr (scope shrank). **Update (2026-05-09):** PR #180 removed all `jest.mock` from `interview-persist-curriculum.integration.test.ts` — drained automatically. 2 offenders remain (`session-summary`, `vocabulary`). **Update (2026-05-11):** added `integration-mock-guard.test.ts` to Files-claimed — it holds `KNOWN_OFFENDERS` and must be edited when offenders are drained. Prior runs (codex `3a329af3…`, claude `768ea6fe…`) tripped scope-guard on this file. |
| P4 | Drain inngest allowlist: migrate the 5 integration tests that mock `apps/api/src/inngest/client` to use the real client (or a HTTP-boundary stub). Update the shared `tests/integration/mocks.ts` setup if its consumers no longer need it. **Note (2026-05-09):** `sessions-routes.integration.test.ts` already carries a `gc1-allow:` comment but is still a live offender — drain in scope. | done | | #204 | `tests/integration/account-deletion.integration.test.ts`, `tests/integration/consent-email.integration.test.ts`, `tests/integration/learning-session.integration.test.ts`, `tests/integration/sessions-routes.integration.test.ts`, `tests/integration/stripe-webhook.integration.test.ts`, `tests/integration/mocks.ts` | [YELLOW] ~10-18 hr. ~~**blocked-dependency on PR-05**~~ **Unblocked 2026-05-08** — GC1 ratchet (PR #171) supersedes the per-channel guard. **File list corrected 2026-05-09:** previous list named `onboarding` (does not exist) and `interview-persist-curriculum.integration.test.ts` (deleted by PR #180); replaced with verified offender list (`sessions-routes` was missing). Definition of Done: `rg "apps/api/src/inngest/client" tests/integration/account-deletion.integration.test.ts tests/integration/consent-email.integration.test.ts tests/integration/learning-session.integration.test.ts tests/integration/sessions-routes.integration.test.ts tests/integration/stripe-webhook.integration.test.ts tests/integration/mocks.ts` returns zero hits inside `jest.mock(...)` blocks (any non-mock import of the client is fine — the drain target is the mock boundary, not the symbol itself). Verify: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage` per file. |
| P5 | AUDIT-TESTS-2E — Close TESTS-1 F2 as not-actionable (driver shim, not behavior mock) | done | | (closed in this plan) | n/a | [N/A] Documentation-only. See "Closed / revised" section below. |

**Cross-coupling:**
- P1, P2 are independent and parallelizable
- P3 should pair with C1 P3 wraps (route tests can re-assert against schemas once routes parse them)
- P4 unblocks AUDIT-INNGEST-2 observers being verifiable end-to-end (C7 P1)

---

### C3 — Mobile navigation safety nets

**Source:** MOBILE-1, MOBILE-2 deepening
**Severity:** **YELLOW** (unchanged)
**Headline:** Same 3 layouts MOBILE-1 named (`progress`, `quiz`, `child/[profileId]`) survive strict re-evaluation. `child/[profileId]` urgency increased — now 5 dynamic children (not 4) due to in-window `weekly-report` addition.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | MOBILE-1 1a / MOBILE-2 F5 — Add `unstable_settings = { initialRouteName: 'index' }` to 3 nested layouts | done | | #196 | `apps/mobile/src/app/(app)/quiz/_layout.tsx` (only file to change; the other two layouts already had the export on `origin/main`) | [YELLOW] ~10 min. Workflow-development drafts (#179, #184, #185) exercised this fix; all closed unmerged. Real PR still pending. |
| P2 | MOBILE-1 F2 — `AccordionTopicList` cross-tab push must push parent chain | done | | #196 | `apps/mobile/src/components/progress/AccordionTopicList.tsx`, `apps/mobile/src/components/progress/AccordionTopicList.test.tsx` | [YELLOW] ~30 min. Use route-aware guard via `useSegments` to avoid double-push when component renders inside the same stack. Workflow-development drafts (#179, #184, #185) exercised this fix; all closed unmerged. |

**Cross-coupling:** None — independent of all other clusters.

---

### C4 — Mobile design system drift

**Source:** MOBILE-1, MOBILE-2 deepening, baseline-delta, **Epic 12 persona-fossil sweep (2026-05-03)**
**Severity:** **YELLOW-RED** (upgraded from YELLOW — persona-fossil sweep expanded scope significantly beyond hex-code cleanup)
**Headline:** ~~20 hex codes across 6 production .tsx files.~~ **6 hex codes across 4 files at HEAD** (re-verified 2026-05-08; PR #163 resolved `session/index.tsx` and `_layout.tsx`). 13 brand/animation/celebration files (98 occurrences) governed by D-C4-2 carve-out (RESOLVED). **Epic 12 persona-fossil sweep:** RemediationCard `isLearner` dead branch (D-C4-1 RESOLVED → delete), `relearn.tsx` `isLearner` fossil (D-C4-4 RESOLVED → absorbed into P7), `personaFromBirthYear()` root migration to `computeAgeBracket()` (D-C4-3 RESOLVED). All 4 C4 decisions resolved. Forward-only guard test + root migration + CLAUDE.md persona-rule tightening remain as execution work.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-MOBILE-2a — Replace hex literals across production files with `tokens.colors.*` references | done | | #208 | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` (3 hex), `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` (1), `apps/mobile/src/app/profiles.tsx` (1), `apps/mobile/src/components/library/NoteInput.tsx` (1) | [YELLOW] ~30-45 min (scope shrank). **Re-verified 2026-05-08:** `session/index.tsx` and `app/_layout.tsx` now have 0 hex hits — dropped from scope. Total: 6 hex across 4 files. |
| P2 | AUDIT-MOBILE-2b — Codify brand/animation/celebration hex carve-out in CLAUDE.md | done | | #208 | `CLAUDE.md` (Non-Negotiable Engineering Rules section) | [YELLOW] ~15 min. Resolved by D-C4-2. |
| P3 | Per D-C4-1: delete `RemediationCard.tsx` dead teen branch + sweep 3 stale persona comments. | done | | #206 | `apps/mobile/src/components/progress/RemediationCard.tsx`, `apps/mobile/src/app/(app)/topic/recall-test.tsx`, `apps/mobile/src/app/(app)/topic/recall-test.test.tsx`, `apps/mobile/src/components/MentomateLogo.tsx`, `apps/mobile/src/components/session/QuotaExceededCard.tsx`, `apps/mobile/src/components/session/LivingBook.tsx` | [YELLOW] ~45 min. Resolved by D-C4-1. |
| P4 | AUDIT-MOBILE-2c — Confirm `weekly-report/[weeklyReportId]` route auto-discovery | done | | #206 | `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | [GREEN-YELLOW] ~5 min. |
| P5 | AUDIT-MOBILE-2d — Amend `2026-05-03-baseline-delta.md` C4 section | todo | | **PR-17** | `docs/audit/2026-05-03-baseline-delta.md` (lines 14, 89-103) | [GREEN] ~10 min. Cross-listed with C7 PR-17. |
| P6 | EPIC-12-GUARD — Forward-only persona-fossil guard test | done | | #206 | `apps/mobile/src/components/persona-fossil-guard.test.ts` (new) | [YELLOW] ~30 min. Independent of root migration. |
| P7 | Expand shared `computeAgeBracket()` to three-way (`'child' \| 'adolescent' \| 'adult'`). Delete mobile's `personaFromBirthYear()` from `apps/mobile/src/lib/profile.ts`. All 5 mobile callers import `computeAgeBracket` from `@eduagent/schemas` instead. Update existing schema consumers (`tell-mentor-input.tsx`, `use-rating-prompt.ts`) and 4 test mocks. **Rewrite `packages/schemas/src/age.ts:14-16` JSDoc** — the current "Same thresholds, different purpose. Do not unify." text is now stale per D-C4-3 and must be replaced with documentation of the unified three-way bracket model. Update the doc comment in `apps/mobile/src/app/(app)/session/index.tsx:304` that still references `personaFromBirthYear` thresholds (comment-only, swap to `computeAgeBracket`). **Post-land:** update `.claude/memory/project_persona_removal.md`. | todo | | **PR-11** | `packages/schemas/src/age.ts`, `packages/schemas/src/age.test.ts`, `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/lib/consent-copy.ts`, `apps/mobile/src/lib/consent-copy.test.ts`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/(app)/_layout.test.tsx`, `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/app/session-summary/[sessionId].tsx`, `apps/mobile/src/app/session-summary/[sessionId].test.tsx`, `apps/mobile/src/app/(app)/mentor-memory.tsx`, `apps/mobile/src/app/(app)/mentor-memory.test.tsx`, `apps/mobile/src/app/(app)/topic/relearn.tsx`, `apps/mobile/src/app/(app)/topic/relearn.test.tsx`, `apps/mobile/src/components/tell-mentor-input.tsx`, `apps/mobile/src/hooks/use-rating-prompt.ts`, `apps/mobile/src/hooks/use-rating-prompt.test.ts` | [YELLOW-RED] ~2-3 hr. **Land before PR-17.** Resolved by D-C4-3 (option C). **PR #187 modified `age.ts`, `_layout.tsx`, `mentor-memory.tsx`, `profile.ts` — agent must re-read all four at HEAD before editing. `age.ts` now has an `isAdultOwner()` helper and `AgeGateProfile` interface that PR #187 added; the three-way `AgeBracket` expansion is still pending.** Definition of Done: `rg 'personaFromBirthYear' apps/mobile packages/schemas/src` returns zero hits (the `docs/architecture.md` reference is owned by C7 P3 and updated in PR-17; audit docs are historical evidence and stay as-is) AND `age.ts` JSDoc reflects the unified three-way model (no "Do not unify" text). Verify: `pnpm exec nx run-many -t typecheck` + `pnpm exec jest --findRelatedTests packages/schemas/src/age.ts apps/mobile/src/lib/profile.ts --no-coverage`. |
| P8 | ~~EPIC-12-RELEARN~~ — Absorbed into P7 per D-C4-4 resolution. `relearn.tsx` is a live two-way branch, not dead code; same mechanical rename as other callers. | done | | (merged into P7) | n/a | [N/A] See D-C4-4 in Resolved Decisions. |

**Cross-coupling:**
- P5 also lives in C7 (doc reconciliation). Owner should claim once.
- P8 absorbed into P7 (D-C4-4 resolved: relearn is live two-way branch, same rename).
- P6 (guard test) is independent — can land anytime, even before P3.
- P3 (RemediationCard deletion) is independent of P7 — the dead branch is dead regardless of root migration approach.

---

### C5 — Manifest & dep-declaration hygiene

**Source:** DEP-DRIFT-1, DEP-DRIFT-2 deepening, baseline-delta
**Severity:** ~~**RED**~~ **YELLOW** (downgraded 2026-05-09 — PR #183 executed the bulk of the root-dep cleanup + added a forward guard)
**Headline:** ~~24 root↔mobile duplicates, 15 drifted at HEAD.~~ **PR #183 deleted ~17 mobile-runtime deps from root and added `scripts/check-no-mobile-deps-at-root.cjs` guard.** Remaining: 6 root duplicates to delete (`react`, `react-dom`, `hono`, `metro-config`, `metro-resolver`, `@testing-library/react-native`), 2 api orphans (`@neondatabase/serverless`, `@clerk/types`), 8 mobile tilde pins (`^` → `~`), 1 dotenv version align. Prettier 3 upgrade done (PR #183). `@eduagent/test-utils` phantom dep was DECLARED in commit `e622dd15` (pre-P0).

**Guard scope (2026-05-09):** `check-no-mobile-deps-at-root.cjs` blocks Expo/RN runtime packages only — it does NOT cover the 6 remaining root duplicates listed above. Without expanding the guard, those deps could be re-added at root after C5 P1 ships. Expanding the FORBIDDEN list to include them is part of P1 scope.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | ~17 remaining dep changes: (a) delete 6 root duplicates (`react`, `react-dom`, `hono`, `metro-config`, `metro-resolver`, `@testing-library/react-native`); (b) delete 2 api orphans (`@neondatabase/serverless`, `@clerk/types`); (c) align root `dotenv` from `^16.4.5` → `^16.4.7`; (d) flip 8 mobile SDK-coupled deps from `^` to `~` (`react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-svg-transformer`, `metro-config`, `metro-resolver`); (e) **expand `scripts/check-no-mobile-deps-at-root.cjs` FORBIDDEN list** to include the 6 newly-deleted root duplicates so they cannot be re-added at root; (f) regenerate `pnpm-lock.yaml`. | todo | | **PR-12** | `package.json`, `apps/api/package.json`, `apps/mobile/package.json`, `scripts/check-no-mobile-deps-at-root.cjs`, `pnpm-lock.yaml` | [YELLOW] agent ~20-25 min, human review ~30 min. **Scope halved by PR #183** (already deleted ~17 mobile deps from root, added `check:root-deps` guard script, Prettier 3 upgrade). `css-interop` already moved out of root deps (only patch entry remains — correct). **Land before PR-13.** Definition of Done: root `package.json` declares neither the 6 duplicates nor the 2 api orphans; mobile manifest uses `~` for the 8 SDK-coupled deps; `pnpm run check:root-deps` exits 0; `pnpm exec nx run-many -t typecheck` is green. Verify: `pnpm install` + `pnpm exec nx run-many -t typecheck` + `pnpm run check:root-deps`. |
| P2 | AUDIT-DEPENDENCY-DRIFT-2-1b — Declare `@eduagent/test-utils` | done | | `e622dd15` | n/a | Shipped pre-P0. |
| P3 | AUDIT-DEPENDENCY-DRIFT-2-1c — Declare `@react-navigation/native` | todo | | **PR-13** | `apps/mobile/package.json`, `pnpm-lock.yaml` | [YELLOW] ~3 min. |
| P4 | AUDIT-DEPENDENCY-DRIFT-2-1d — Remove orphan `@neondatabase/serverless` | done | | (absorbed into PR-12) | n/a | Bucket E removal included in D-C5-1a scope. |
| P5 | AUDIT-DEPENDENCY-DRIFT-2-1e — Remove orphan `@clerk/types` | done | | (absorbed into PR-12) | n/a | Bucket E removal included in D-C5-1a scope. |
| P6 | AUDIT-DEPENDENCY-DRIFT-2-1f — Verify `expo-system-ui` orphan status | done | | (verified — kept) | n/a | Verified: NOT orphan — required by `userInterfaceStyle: automatic` in `app.json:9`. Expo SDK 54 requires `expo-system-ui` for Android. Kept. |
| P7 | AUDIT-DEPENDENCY-DRIFT-2-1g — Consolidate `onlyBuiltDependencies` | todo | | **PR-13** | `package.json`, `pnpm-workspace.yaml` | [GREEN-YELLOW] ~3 min. |
| P8 | AUDIT-DEPENDENCY-DRIFT-2-1h — Prettier 3 upgrade | done | | PR #183 | `package.json`, `pnpm-lock.yaml` | **Shipped 2026-05-08** in PR #183 (`^2.6.2` → `^3.0.0`). Notion issue can be closed. |

**Cross-coupling:**
- P1 should land before C4, C6, C7 if they're in flight simultaneously (manifest changes have wide rebase implications)
- P3-P7 are independent and parallelizable (different files except shared `pnpm-lock.yaml`)
- Lockfile coordination: any 2+ phases touching `pnpm-lock.yaml` should serialize

---

### C6 — apps/api config & E2E symmetry

**Source:** PACKAGE-SCRIPTS-1, PACKAGE-SCRIPTS-2 deepening, baseline-delta
**Severity:** **YELLOW** (unchanged; partial pre-P0 ship)
**Headline:** Stale `sessions.ts` drizzle Known Exception removed in `e622dd15` (PR #130 had silently fixed the underlying violation). Forward-only guard test still pending. `apps/api` needs explicit `eslint.config.mjs` + `tsconfig.spec.json` (NOT `tsconfig.lib.json` — it's an application, not a library). Maestro guard symmetry resolution pending.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1a | AUDIT-PACKAGE-SCRIPTS-2a (part 1) — Remove stale `sessions.ts` drizzle Known Exception from CLAUDE.md | done | | `e622dd15` | n/a | [YELLOW-RED] doc/code reality drift. Shipped pre-P0. |
| P1b | AUDIT-PACKAGE-SCRIPTS-2a (part 2) — Drizzle-import forward-only guard test | todo | | **PR-14** | `apps/api/src/routes/no-drizzle-orm-imports.test.ts` (new) | [YELLOW] ~30 min. |
| P2 | AUDIT-PACKAGE-SCRIPTS-2b — Add `apps/api/eslint.config.mjs` re-exporting root | todo | | **PR-14** | `apps/api/eslint.config.mjs` (new) | [YELLOW] ~10 min. |
| P3a | AUDIT-PACKAGE-SCRIPTS-2c — `tsconfig.spec.json` plumbing only | todo | | **PR-15a** (PR #214) | `apps/api/tsconfig.spec.json` (new), `apps/api/jest.config.cjs` | [YELLOW] ~15 min. Spec config relaxes `noUncheckedIndexedAccess` and `noUnusedLocals` for tests; remaining `strict: true` inherits from base and exposes ~279 errors. **Do not modify test files in this PR.** Verify: `pnpm exec nx run api:test --no-coverage` passes (jest behavior unchanged; ts-jest is permissive). Typecheck on spec config will still fail — deferred to P3b–e and closed in P3f. Resolved by D-C6-1. **Scope-as-delivered**: 2 files. The adversarial review of the initial PR-15a attempt caught that adding `{ "path": "./tsconfig.spec.json" }` to `apps/api/tsconfig.json` makes `tsc --build` walk the ~279 errors and break pre-commit hooks; the reference was reverted within the PR and is intentionally deferred to P3f. A later claude-review pass on the same PR flagged the missing reference as CRITICAL (incomplete plumbing vs. sibling packages); this is a known intentional gap closed by P3f, not a regression. |
| P3b | TS18046 — type unknown response bodies and mock vars (~99 errors / 15 files) | todo | | **PR-15b** | `apps/api/src/errors.test.ts`, `apps/api/src/inngest/functions/monthly-report-cron.test.ts`, `apps/api/src/inngest/functions/quota-reset.test.ts`, `apps/api/src/inngest/functions/subject-auto-archive.test.ts`, `apps/api/src/inngest/functions/topup-expiry-reminder.test.ts`, `apps/api/src/inngest/functions/trial-expiry.test.ts`, `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`, `apps/api/src/middleware/account.test.ts`, `apps/api/src/middleware/auth.test.ts`, `apps/api/src/middleware/consent.test.ts`, `apps/api/src/middleware/profile-scope.test.ts`, `apps/api/src/middleware/proxy-guard.test.ts`, `apps/api/src/routes/resend-webhook.test.ts`, `apps/api/src/routes/revenuecat-webhook.test.ts`, `apps/api/src/routes/stripe-webhook.test.ts` | [YELLOW] ~1 hr. Fix pattern: type response bodies — `const body = (await res.json()) as { id: string; … }` (declare a local type or interface). Mock vars (`mockStep`, `mockResolvedValue` results) get explicit `jest.Mock<…>` or interface types. **Forbidden:** `as never`, `as unknown as` blanket casts. Verify: `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json 2>&1 \| grep -c TS18046` returns `0`. **Scope guard:** diff touches only the 15 listed files. Depends on P3a. |
| P3c | TS7006 — implicit `any` callback params in test files (~119 errors / 41 files) | todo | | **PR-15c** | `apps/api/src/data/languages.test.ts`, `apps/api/src/inngest/functions/subject-prewarm-curriculum.integration.test.ts`, `apps/api/src/services/billing/family.test.ts`, `apps/api/src/services/billing/metering.integration.test.ts`, `apps/api/src/services/bookmarks.integration.test.ts`, `apps/api/src/services/consent.integration.test.ts`, `apps/api/src/services/curated-memory.test.ts`, `apps/api/src/services/curriculum-topics.integration.test.ts`, `apps/api/src/services/dashboard.integration.test.ts`, `apps/api/src/services/export.test.ts`, `apps/api/src/services/filing.integration.test.ts`, `apps/api/src/services/home-surface-cache.integration.test.ts`, `apps/api/src/services/interleaved.test.ts`, `apps/api/src/services/language-curriculum.test.ts`, `apps/api/src/services/learner-profile.test.ts`, `apps/api/src/services/library-search.integration.test.ts`, `apps/api/src/services/llm/router.test.ts`, `apps/api/src/services/memory/backfill-mapping.test.ts`, `apps/api/src/services/memory/dedup-pass.test.ts`, `apps/api/src/services/memory/projection.test.ts`, `apps/api/src/services/milestone-detection.test.ts`, `apps/api/src/services/monthly-report.test.ts`, `apps/api/src/services/overdue-topics.test.ts`, `apps/api/src/services/parking-lot-data.integration.test.ts`, `apps/api/src/services/profile.integration.test.ts`, `apps/api/src/services/progress-helpers.test.ts`, `apps/api/src/services/progress.test.ts`, `apps/api/src/services/quiz/generate-round.test.ts`, `apps/api/src/services/quiz/guess-who-provider.test.ts`, `apps/api/src/services/quiz/vocabulary-provider.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/services/session-lifecycle.integration.test.ts`, `apps/api/src/services/session-operations.integration.test.ts`, `apps/api/src/services/session/session-exchange.test.ts`, `apps/api/src/services/session/session-subject.integration.test.ts`, `apps/api/src/services/settings.integration.test.ts`, `apps/api/src/services/snapshot-aggregation.integration.test.ts`, `apps/api/src/services/snapshot-aggregation.test.ts`, `apps/api/src/services/support/spillover.test.ts`, `apps/api/src/services/test-seed.language-learner.integration.test.ts`, `apps/api/src/services/test-seed.medium-priority.integration.test.ts` | [YELLOW] ~1.5 hr. Fix pattern: add explicit types to callback params — `.map((i) => …)` → `.map((i: number) => …)`. Infer from surrounding context (array type, mock shape). **Forbidden:** annotating with `: any`. If a param is truly unknown, declare a proper interface. Verify: `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json 2>&1 \| grep "TS7006" \| grep -v "eval-llm/flows"` returns nothing. **Convergence risk:** if the implement node doesn't finish, split into P3c-1 (`src/services/billing/`, `services/memory/`, `services/quiz/`, `services/session/`, `services/support/`), P3c-2 (top-level `src/services/*.test.ts`), P3c-3 (everything else — `src/data/`, `src/inngest/`). Depends on P3a. |
| P3d | TS7006 + TS2345 in `eval-llm/flows/*.ts` production code (~7 errors / 5 files) | todo | | **PR-15d** | `apps/api/eval-llm/flows/dictation-generate.ts`, `apps/api/eval-llm/flows/exchanges.ts`, `apps/api/eval-llm/flows/quiz-capitals.ts`, `apps/api/eval-llm/flows/quiz-guess-who.ts`, `apps/api/eval-llm/flows/quiz-vocabulary.ts` | [YELLOW] ~30 min. **Non-test production code** — runtime-affecting. TS7006 fixes: same param-typing pattern as P3c. TS2345 (`InterestEntry[]` → `string[]`): the function expects strings but a richer interest object is being passed; pick the right field (`.label` or `.value`) rather than casting. Verify per-file: `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json <file>` clean. Depends on P3a. |
| P3e | Heterogeneous test type fixes — TS2769/2339/2353/2345/2352/2322/2367/2556 (~50 errors / ~24 files) | todo | | **PR-15e** | `apps/api/src/inngest/functions/email-digest-channel.test.ts`, `apps/api/src/inngest/functions/monthly-report-cron.test.ts`, `apps/api/src/inngest/functions/session-completed.test.ts`, `apps/api/src/inngest/functions/topup-expiry-reminder.test.ts`, `apps/api/src/inngest/functions/weekly-progress-push.test.ts`, `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`, `apps/api/src/middleware/account.test.ts`, `apps/api/src/middleware/profile-scope.test.ts`, `apps/api/src/routes/billing.test.ts`, `apps/api/src/routes/learner-profile.test.ts`, `apps/api/src/routes/notes.test.ts`, `apps/api/src/routes/revenuecat-webhook.test.ts`, `apps/api/src/routes/stripe-webhook.test.ts`, `apps/api/src/services/billing.test.ts`, `apps/api/src/services/dashboard.integration.test.ts`, `apps/api/src/services/memory/projection.test.ts`, `apps/api/src/services/milestone-detection.test.ts`, `apps/api/src/services/monthly-report.test.ts`, `apps/api/src/services/progress-helpers.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/services/retention-data.test.ts`, `apps/api/src/services/session/session-exchange.orphan.test.ts`, `apps/api/src/services/snapshot-aggregation.test.ts`, `apps/api/src/services/stripe.test.ts`, `apps/api/src/services/test-seed.test.ts`, `apps/api/src/services/weekly-report.test.ts` | [YELLOW] ~2 hr. Each error category gets a distinct real fix — **no blanket casts.** TS2769 (Hono `c.set('customKey', …)`): extend the Hono `Variables` type to declare custom keys (`db`, `profileId`, `profileMeta`); see `apps/api/src/types/hono.ts` if exists, otherwise create. TS2353 (`weeklyDeltaTopicsMastered` not in type): inspect the target type — either the property was renamed/removed (update fixtures) or the type is missing the field (update the schema). TS2339 (property does not exist on `{}`): type the variable before destructuring (often a mock result needs a proper return-type annotation). TS2352 (`Promise<undefined>` → `Record<…>`): the helper is `async` and returning nothing; fix the test to await and assert, not cast. TS2345 in `email-digest-channel.test.ts`: align the mock `db` shape with what `processEmailDigest` expects (add `familyLinks.findMany` to the mock, don't cast). Verify: `pnpm exec tsc --noEmit -p apps/api/tsconfig.spec.json` returns zero errors across all listed categories. **Scope guard:** diff touches only the listed files (≤ 26). Depends on P3a, P3b, P3c, P3d. |
| P3f | Closure — re-tighten deferred flags, wire project reference, enforce CI gate | todo | | **PR-15f** | `apps/api/tsconfig.json`, `apps/api/tsconfig.spec.json`, `apps/api/project.json` (or nx target wherever `typecheck` is defined), CI workflow if a separate gate is needed | [YELLOW] ~30 min. Three changes that must land together: (1) Add `{ "path": "./tsconfig.spec.json" }` to the `references` array in `apps/api/tsconfig.json` — aligns with `packages/database`, `packages/schemas`, `packages/retention`, `apps/mobile` and closes the claude-review CRITICAL flagged on PR-15a. (2) In `apps/api/tsconfig.spec.json`, remove `"noUncheckedIndexedAccess": false` and `"noUnusedLocals": false` so the spec config inherits the strict base settings. PR-15b–e must have already fixed the underlying errors. (3) Wire `tsc --noEmit -p apps/api/tsconfig.spec.json` into the `api:typecheck` chain so future test-file type regressions fail CI (the `--build` walk via the new project reference may already cover this; verify before adding a separate invocation). Verify: `pnpm exec nx run api:typecheck` and `pnpm exec tsc --build` both exit zero with the relaxations removed. Land only after P3b–e are merged. |
| P4 | AUDIT-PACKAGE-SCRIPTS-2d — Drop broken `nx.json` e2e block | todo | | **PR-16** | `nx.json` | [YELLOW] ~10 min. Resolved by D-C6-2. |
| P5 | AUDIT-EXTREFS-1 — Rename `db:generate` → `db:generate:dev` | todo | | **PR-16** | `package.json` (scripts), `CLAUDE.md` (Handy Commands), `docs/architecture.md` if cited | [YELLOW] ~10 min. |
| P6 | PACKAGE-SCRIPTS-1d — WITHDRAWN (replaced by P3, scoped down) | done | | (closed in this plan) | n/a | [N/A] Bookkeeping. See "Closed / revised" section. |

**Cross-coupling:**
- P1b lands clean — sweep already done
- P3a is a behavior-affecting change in test compilation; smoke run required pre-merge. P3b–e depend on P3a being merged (they need `tsconfig.spec.json` to exist on the branch they target). P3f depends on P3b–e all merging clean.
- P3 was split from a single ~30-min work package into six sub-phases (P3a–P3f) on 2026-05-11 after the original PR-15 attempt failed to converge: the strict-mode errors that surface once test files become typecheck-visible (~279) exceeded what a single Archon `implement` node could fix in one run.
- P5 is partial-cleanup of the rename PR #131 missed (the meta-pattern instance the audit batch is targeting)

---

### C7 — Doc & plan reconciliation

**Source:** AUDIT-INNGEST-2, AUDIT-SPECS-2, AUDIT-GOVERNING-1d, TYPES-1 F5, cleanup-triage 8 conflicts, memory-drift-audit
**Severity:** **YELLOW** (unchanged)
**Headline:** Three plan/doc reconciliations + 2 new Inngest observers + memory hygiene. RLS plan internally contradicts itself (header says 0.0 done, table says NOT DONE). SCHEMA-2 plan numbers superseded by TYPES-2.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Ship 2 new observer functions for orphan events: `ask-gate-observe.ts` (listens to `app/ask.gate_decision` and `app/ask.gate_timeout`) and `email-bounced-observe.ts` (listens to `app/email.bounced`). Register both in the `functions` array exported from `apps/api/src/inngest/index.ts`. Add per-observer test files mirroring the existing pattern (`payment-failed-observe.test.ts`, `ask-classification-observe.test.ts`): tests must assert the trigger event-name string and that each observer is included in the exported `functions` array. | todo | | **PR-17** | `apps/api/src/inngest/functions/ask-gate-observe.ts` (new), `apps/api/src/inngest/functions/ask-gate-observe.test.ts` (new), `apps/api/src/inngest/functions/email-bounced-observe.ts` (new), `apps/api/src/inngest/functions/email-bounced-observe.test.ts` (new), `apps/api/src/inngest/index.ts` | [YELLOW] ~30-45 min (was ~10 min before tests added). Observers are safe to ship before PR-07 — they log only. End-to-end verification comes when PR-07 drains Inngest mocks. **PR #187 modified `inngest/index.ts` (added `transcriptPurgeHandlerOnFailure` registration) — agent must re-read at HEAD before editing.** Definition of Done: both observer files + their test siblings exist; `apps/api/src/inngest/index.ts` exports both in the `functions` array; tests assert trigger event names and array inclusion. Verify: `pnpm exec nx run api:test apps/api/src/inngest/functions/ask-gate-observe.test.ts apps/api/src/inngest/functions/email-bounced-observe.test.ts && pnpm exec nx run api:typecheck`. |
| P2 | AUDIT-SPECS-2 — Refresh RLS plan status table | todo | | **PR-17** | `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` | [YELLOW] ~30-40 min. |
| P3 | AUDIT-GOVERNING-1d — CLAUDE.md `db:*` commands + persona-rule tightening + UX spec `(learner)/` → `(app)/` paths + update `docs/architecture.md` `personaFromBirthYear` references | todo | | **PR-17** | `CLAUDE.md`, `docs/ux-design-specification.md`, `docs/architecture.md` | [YELLOW] ~35 min. **Land after PR-11.** |
| P4 | TYPES-1 F5 — Update SCHEMA-2 plan numbers | todo | | **PR-17** | `docs/audit/2026-05-02-audit-schema-2-plan.md` | [YELLOW] ~15 min. |
| P5 | AUDIT-MOBILE-2d — Amend baseline-delta C4 section | todo | | **PR-17** | `docs/audit/2026-05-03-baseline-delta.md` | [GREEN] ~10 min. Same as C4 P5. |
| P6 | D-C7-1 sweep — Memory entry verification | done | | (D-C7-1 session) | `.claude/memory/` | Resolved. 8 archived, 3 Notion issues. |
| P7 | D-MEM-1 reconciliation — Mark overlap-flags superseded | todo | | **PR-17** | `docs/audit/claude-optimization/memory-overlap-flags.md` | [YELLOW] ~15 min. Resolved by D-MEM-1. |

**Cross-coupling:**
- P1 + C2 P4 should land in close succession — observers without an unmocked dispatch path are wired-but-untriggered code
- P5 is the same edit as C4 P5
- P2 may also touch the deploy-safety story — couples loosely with C5

---

### C8 — Track C archeology

**Source:** Original cleanup-triage + DEP-DRIFT-1 + AUDIT-MIGRATIONS series
**Severity:** **GREEN-leaning-YELLOW** (unchanged; standalone-shippable janitor work)
**Headline:** Each item ships independently for clean git blame. No cross-coupling.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Regenerate 11 missing drizzle snapshots | todo | | **PR-18** | `apps/api/drizzle/meta/{0006,0007,0008,0009,0010,0013,0021,0025,0043,0044,0055}_snapshot.json` | [YELLOW] ~1 hr. **Confirmed 2026-05-09 post-#187 merge:** 69 migrations / 58 snapshots on `origin/main` = 11 missing. PR #187 filled 0063-0065 and shipped 0066-0068 with snapshots, as predicted. Verify: `pnpm run db:generate:dev` completes without errors (or `db:generate` if PR-16 hasn't landed yet). |
| P2 | AUDIT-MIGRATIONS-2 — Fix non-monotonic `_journal.json` timestamps | todo | | **PR-19** | `apps/api/drizzle/meta/_journal.json` | [YELLOW] ~30 min. Verify: timestamps are monotonically increasing in `_journal.json`. |
| P3 | AUDIT-MIGRATIONS-3-SWEEP — Sweep destructive migrations for missing rollback sections | todo | | **PR-20** | `apps/api/drizzle/0*_*.sql`, `apps/api/drizzle/*.rollback.md` | [YELLOW] ~2 hr. |
| P4 | AUDIT-MEMORY-2 — Memory file dedupe (~96 files) | todo | | **PR-21** | `.claude/memory/*.md` | [YELLOW] ~1 hr. |
| P5 | AUDIT-SKILLS-2 — Resolve vendored bmad vs installed plugin | todo | | **PR-22** | `.claude/commands/bmad/`, `.claude/plugins/` | [YELLOW] ~30 min. |
| P6 | AUDIT-EXTREFS-2 — EduAgent → Mentomate naming sweep (NOT `@eduagent/*` package names) | todo | | **PR-23** | `docs/**/*.md`, `README.md`, `apps/**/*.{ts,tsx}` (string literals only) | [YELLOW] ~1 hr. |
| P7 | AUDIT-EXTREFS-3 — Per-package READMEs | todo | | **PR-24** | `apps/api/README.md`, `apps/mobile/README.md`, `packages/{database,schemas,test-utils,retention}/README.md` | [YELLOW] ~2 hr. |

**Cross-coupling:** None.

---

### C9 — Cleanup-triage (parallel track)

**Source:** `docs/audit/2026-04-30-cleanup-triage.md`
**Severity:** **YELLOW** (parallel-track; not summed into main effort estimate)
**Headline:** 164 active files in 3 categories + 8 inbound-link conflicts requiring co-changes with C7. Execution dominated by human review of category assignments.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Cleanup-triage E1 — Process 25 Cat 1 obsolete files | todo | | **PR-25** | per cleanup-triage doc; touches `docs/_archive/` | [YELLOW] varies. |
| P2 | Cleanup-triage E2 — Process 23 Cat 2 possibly-obsolete files | todo | | **PR-26** | per cleanup-triage doc | [YELLOW] varies. |
| P3 | Cleanup-triage E3 — Process 8 inbound-link conflicts | todo | | **PR-27** | per cleanup-triage doc + targets in C7 | [YELLOW] ~2-3 hr. **Co-land with PR-17.** |
| P4 | Cleanup-triage E4 — Verify 116 Cat 3 keep-files | todo | | **PR-28** | per cleanup-triage doc | [GREEN-YELLOW] ~1 hr sample-based. |
| P5 | Folder-level archive moves (cleanup-triage E3 follow-on) — relocate `docs/specs/done/` → `docs/_archive/specs/done/` and `docs/plans/done/` → `docs/_archive/plans/done/`. Update inbound links surfaced by `rg 'docs/(specs|plans)/done' docs --glob '!docs/_archive/**' --glob '!docs/audit/**' --glob '!docs/specs/done/**' --glob '!docs/plans/done/**'` in active docs. `docs/specs/deffered/` is already absent — no action needed. | todo | | **PR-29** | `docs/specs/done/`, `docs/plans/done/`, `docs/_archive/`, plus active docs surfaced by inbound-link grep | [YELLOW] ~30 min. Co-land with PR-25/PR-27 to keep archive-related changes batched. Definition of Done: `ls docs/specs/done docs/plans/done` returns "no such directory"; `docs/_archive/specs/done/` and `docs/_archive/plans/done/` exist; the grep above (with all four `--glob` excludes) returns zero hits in active docs. Verify: `rg` post-move + `pnpm exec markdownlint docs/` if available. |

**Cross-coupling:**
- P3 ↔ C7 P1-P5 (inbound-link conflicts)
- P5 (PR-29) ↔ P1+P3 (PR-25/PR-27): folder-level archive moves create new paths that the inbound-link fixes target. PR-29's link-fix scope overlaps with PR-27. Co-land or sequence the three together to avoid broken references.
- P1, P2 may surface new audit findings (deviation log them)

---

## Cross-cluster sequencing

Structural information only — sequencing decisions belong to the user.

- **C1 ↔ C2 paired (historical).** Originally C1 was supposed to introduce runtime parsing on `c.json` and C2 was to add test-side parsing in lockstep. **Status (DEV-004, 2026-05-09):** the route wraps already shipped upstream, so C1 P3 is now a dead-export deletion. C2 P3 and P4 have no upstream dependency on C1. Keeping this note as evidence in case the original pairing rationale becomes relevant for future schema work.
- **C5 P1 (1a-EXECUTE) is a parallel architectural call.** Can run any time; lockfile blast radius. Any deps-touching PR landed before P1 may cause merge conflict P1 must absorb. **PR #144 doesn't touch manifests** — current open window is safe. Land P1 early to lock that in.
- **C5 P3-P7 are independent of one another** except for shared `pnpm-lock.yaml` coordination. Two agents working different `package.json` files concurrently must serialize on the lockfile regen.
- **C6 P1a + C7** — CLAUDE.md correction is partial (P1a done) — couple any further `CLAUDE.md` edits with the new explicit configs landing.
- **C7 P1 + C2 P4** — Inngest observers must land alongside Inngest sweep (P4) so observers are verifiable end-to-end. Wired-but-untriggered code is worse than dead code.
- **Cleanup-triage (C9 P3) ↔ C7 P1-P5** — inbound-link conflicts must be reconciled in lockstep. Splitting creates a window where cross-references are broken.
- **C3 is independent** of all other clusters. Smallest dispatch surface.
- **C4 now couples to C7 P3** (CLAUDE.md persona-rule tightening). C4 P7 (root migration) should land before C7 P3 (CLAUDE.md edit) so the rule wording aligns with the actual code state. C4 P3 (RemediationCard dead branch) and C4 P6 (guard test) are independent and can land anytime.
- **C8 is independent** of all others. Each phase ships standalone.

### Parallel-work conflict gate (MANDATORY before Stage 3)

Before starting Stage 3 execution, re-sweep `origin/language-add` (320 files, i18n + library v3 + relearn redesign + post-session reflection) against the plan's Files-claimed columns. Initial sweep (2026-05-03) confirmed no decision inputs are invalidated, but **execution-time file conflicts are significant** — particularly C1 (schema/route files), C4 P7 (`_layout.tsx`), C5 (manifest/lockfile), and C7 P3 (CLAUDE.md). Run `git diff --name-only origin/main...origin/language-add` and cross-reference before claiming any phase that touches overlapping files. If language-add has merged to main by then, rebase `consistency` first.

**Gate status (2026-05-04): RESOLVED.** `origin/language-add` is now merged to main. Branch rebased onto current main. Only CLAUDE.md + lockfile overlap found — trivially resolvable. No plan adjustments needed.

---

## Closed / revised (audit honesty)

These items appeared in earlier audit docs but were demoted, contradicted, or already shipped silently. Listed here so future readers don't re-derive contradicted conclusions from originating audits.

| ID | Original claim | Actual state | Source of correction |
|---|---|---|---|
| TESTS-1 F2 | `@eduagent/database` mocked in `tests/integration/setup.ts` and `api-setup.ts` violates "no internal mocks in integration tests" rule | Driver shim swapping Neon HTTP for `pg` wire on non-Neon URLs; spreads `...actual` through. Required CI infrastructure, not a behavior mock. | TESTS-2 F3 |
| PACKAGE-SCRIPTS-1d | Add `apps/api/tsconfig.lib.json` mirroring `packages/*` shape | Wrong move — `apps/api` is an application not a library; would create shadow `build` target conflicting with explicit `wrangler deploy --dry-run` target. Replaced by C6 P3 (only `tsconfig.spec.json`). | PACKAGE-SCRIPTS-2 F2 |
| PACKAGE-SCRIPTS-1 F4 / CLAUDE.md "Known Exceptions" | `apps/api/src/routes/sessions.ts` imports `from 'drizzle-orm'` as sanctioned exception | Import removed by PR #130 (commit `8672bdcd`, 2026-05-02) silently. Zero route files import drizzle-orm at HEAD. CLAUDE.md exception entry removed in commit `e622dd15`. Forward-only guard test still pending (C6 P1b). | PACKAGE-SCRIPTS-2 F4-1 |
| baseline-delta C4 narrative | `session/index.tsx` shrank from 10→7 hex codes — partial fix without sweep, the cluster's own meta-pattern playing out on its own example file | Measurement artifact — baseline-delta ran 6-digit-only grep, dropping 3 three-digit hits at L191/211/238. File still has 10 occurrences at HEAD; zero churn since baseline. The meta-pattern claim still stands generally (the `35fd074a` consent example is solid), just not on this file. Amendment scheduled (C4 P5 / C7 P5). | MOBILE-2 F3 |
| 2026-05-02-audit-schema-2-plan.md (lines 22, 29) | ~50 response schemas exist; SCHEMA-2 PR scope is "wrap most" | 22 schemas exist; 9 wrappable as-is + 3 need authoring + 6 no-route disposition. Actual PR1 scope is 12 wraps; PR2 is rename + author + SSE. Update scheduled (C7 P4). | TYPES-1 F5, TYPES-2 F1 |
| TYPES-1 F2 | `quickCheckResponseSchema` and `consentResponseSchema` shape ambiguous | Conclusively classified: both are actually-request-shaped (the `*Response` suffix means "user's response", not "HTTP response"). Schema rename + new response-schema authoring scheduled (C1 P4). | TYPES-2 F2 |
| D-C4-1 original recommendation | "Allow + clarify CLAUDE.md ('prop-injected persona is persona-unaware')" — cheaper than refactor, architectural pattern otherwise clean | **Superseded by Epic 12 awareness.** Persona is not an architectural axis — it's a deleted concept (Epic 12). `isLearner` is a Story-10.9 fossil missed by Story 12.5's literal-string `personaType` sweep. The "allow" path would codify a pattern Epic 12 specifically eliminated. The "2-4 hr refactor" cost estimate was wrong (actual: ~30 min dead-branch deletion at the real call-site count of 1). Both MOBILE-1 and MOBILE-2 deepenings asked governance-posture questions without checking whether `personaType` still existed — a methodology gap, not a finding gap. | Epic 12 persona-fossil sweep (2026-05-03 session) |
| MOBILE-2 F4 severity | YELLOW (governance call pending, no code change required) | Upgraded to YELLOW-RED. The broader persona-fossil sweep discovered `relearn.tsx` as a second active `isLearner` violation and `personaFromBirthYear()` as root cause with 5 callers returning deleted vocabulary. C4 scope expanded from 5 phases to 8. | Epic 12 persona-fossil sweep (2026-05-03 session) |
| C2 P1 + P2 (per-channel runtime guard tests) | Build a database-mock guard test and an inngest-mock guard test, mirroring the BUG-743 LLM mock guard. Each runs at jest-time, scans test files, fails if mocks exceed allowlist. | **Superseded 2026-05-06 by PR #171 (GC1 ratchet).** GC1 is a CI step that blocks any new internal `jest.mock('./...')` or `jest.mock('../...')` line in test files at PR-diff time, with `// gc1-allow: <reason>` escape hatch. Broader (covers all channels at once), simpler to maintain (no per-channel allowlist files), forward-only on additions. The runtime guard tests would have duplicated enforcement at a different layer with negligible additional benefit. **Decision (2026-05-08):** close P1 + P2 as done; trust GC1. P4 unblocked since GC1 protects the drain. | DEV-002 (validation sweep, 2026-05-08) |
| `.scratch/notion_key.txt` security note | Cleanup-triage flagged a potentially-committed Notion API key under `.scratch/` | **Resolved 2026-05-09.** `.scratch/` is gitignored on this branch (`.gitignore` includes `.scratch/`) and the file is absent from the working tree. No action needed. | DEV-004 (adversarial-review remediation, 2026-05-09) |
| C1 P3 (route-wrap portion) | Wrap 12 ready-to-fit `c.json` sites across 6 route files; rename `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema`. | **Largely done by upstream work; only schema-export deletion remains.** All 6 route files (quiz, account, celebrations, curriculum, notes, billing) have every `c.json(...)` call wrapped with `.parse(...)` (multi-line pattern: `c.json(\n  schema.parse({...}),\n  status\n)`). `celebrations.ts` already uses `pendingCelebrationsResponseSchema`. The previous "12 wrappable sites" claim was based on a flawed grep that only matched single-line wraps. P3 re-scoped to deleting the dead `coachingCardCelebrationResponseSchema` export from `progress.ts` (zero consumers verified). | DEV-004 (adversarial-review remediation, 2026-05-09) |

---

## Already shipped (preserved from punch list)

Reference table only — these items are NOT in the cluster status tables (they'd false-positive the audit-status PR/file-claim refresh).

| ID | What | Where |
|---|---|---|
| AUDIT-INNGEST-1 | payment.failed observer | PR #132 (`4b63e4b4`) |
| AUDIT-SCHEMA-1 | mobile aiFeedback nullability | PR #132 (`ba3db196`) |
| AUDIT-SKILLS-1 | broken pre-commit hook removed | PR #132 (`11cd1346`) |
| AUDIT-EVAL-1 | Tier 2 runLive inertness documented | PR #132 (`9a4af1d7`) |
| AUDIT-EXTREFS-1 | `db:*:stg` → `db:*:dev` rename (3 of 4 — `db:generate` straggler tracked as C6 P5) | PR #131 |
| AUDIT-GOVERNING-1a | CLAUDE.md Snapshot counts refreshed | PR #131 |
| AUDIT-GOVERNING-1b | "Known Exceptions" subsection added | PR #131 |
| AUDIT-GOVERNING-1c | `ux-dead-end-audit` skill citation removed | PR #131 |
| AUDIT-ARCH-1 | architecture.md drizzle/AppType/route fixes | PR #131 |
| AUDIT-SPECS-1 | plan-status refresh on 4 active plans | PR #131 |
| AUDIT-MEMORY-1 | `dev_schema_drift_trap.md` self-contradiction healed | PR #131 |
| INTERACTION-DUR-L1 | MAX_INTERVIEW_EXCHANGES docs → 4 | PR #134 |
| AUDIT-MIGRATIONS-3 | Migration 0017 rollback notes | PR #135 |
| AUDIT-WORKFLOW | `_wip/` gitignored | direct push (`55cd30df`) |
| AUDIT-EVAL-2 | First `runLive` — exchanges flow | PR #137 |
| AUDIT-EVAL-2.1 | PR #137 review fixups | PR #139 |
| BUG-743 / T-1 | Forward-only LLM mock guard for integration tests | commit `35fd074a` |
| Pre-P0 hygiene batch | "Sweep when you fix" rule + phantom test-utils + memory hygiene + audit-status skill + 6 deepening recons + memory drift audit + relatedness step in /my:commit | commit `e622dd15` |
| C1 P2 — `queued` field on `feedbackResponseSchema` | Schema field added (`feedback.ts:17`) | PR #153 (2026-05-05) |
| C2 P1 + P2 — per-channel mock guard tests | Superseded by GC1 ratchet — broader CI gate on all channels | PR #171 (2026-05-06) |
| C2 P3 partial — `interview-persist-curriculum` LLM mock drain | All `jest.mock` calls removed from the file as part of feature work | PR #180 (2026-05-07) |
| C5 P1 partial — ~17 mobile-runtime root dep deletions + guard script | Deleted from root: expo, expo-*, nativewind, react-native, react-native-css-interop, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-svg, react-native-svg-transformer, react-native-web. Added `check:root-deps` forward guard. | PR #183 (2026-05-08) |
| C5 P8 — Prettier 3 upgrade | `prettier` `^2.6.2` → `^3.0.0` | PR #183 (2026-05-08) |

---

## Deviations Log

> Captured via `/my:audit-status deviation`. Each entry records a finding that requires plan adjustment. Status transitions: `open` → `processed-YYYY-MM-DD` (delta applied) or `rejected-YYYY-MM-DD` (deferred or contradicted).

### DEV-001

**Status:** `processed-2026-05-03`
**Source:** Epic 12 persona-fossil sweep (Stage 2 decision burndown for D-C4-1)
**Finding:** Both MOBILE-1 and MOBILE-2 deepening audits asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all in this codebase?" Epic 12 had already deleted `personaType` and decomposed it into three orthogonal axes (age from `birthYear`, role from `familyLinks`, intent from per-session state). The audits' governance recommendation ("Allow + clarify CLAUDE.md") was framed against the wrong baseline — it would have codified a pattern the preceding epic specifically eliminated.

**Root cause:** Methodology gap — audits of shared-component conventions did not cross-reference against the spec/epic history to check whether the underlying concept had been removed. Story 12.5/12.6's verification sweep used literal-string `grep personaType` which missed the boolean alias `isLearner` (same concept under a different name). This is a generalizable failure mode: any deleted concept can survive under aliases that the original sweep didn't cover.

**Delta applied:**
- D-C4-1 recommendation flipped from "Allow + clarify" to "Delete dead branch" (see Resolved Decisions)
- New decisions added then resolved: D-C4-3 (`personaFromBirthYear()` → `computeAgeBracket()`, RESOLVED 2026-05-04), D-C4-4 (`relearn.tsx` absorbed into P7, RESOLVED 2026-05-04)
- C4 expanded from 5 phases to 8: P6 (forward-only guard test), P7 (root migration), P8 (absorbed into P7)
- C4 severity upgraded YELLOW → YELLOW-RED
- C7 P3 scope expanded: tighten CLAUDE.md persona-unaware rule + update UX spec stale `(learner)/` paths
- Closed/revised: 2 entries added (D-C4-1 original recommendation + MOBILE-2 F4 severity)
- Methodology lesson: future audits should grep `docs/specs/epics.md` for the relevant axis before recommending governance posture. Forward-only guard tests (per BUG-743 pattern) should cover persona-shaped booleans in shared components.

### DEV-002

**Status:** `processed-2026-05-08`
**Source:** Stage-3-prep validation sweep (user-requested re-baseline before dispatching subagents)
**Finding:** Between the plan's last update (2026-05-04) and the start of Stage 3 execution, commits landed on main across PRs #153, #155, #163, #169, #170, #171, #172, #173, and #174. (PR #179 was an Archon workflow-development draft against PR-08 and never landed — it and follow-up dev drafts #184, #185 are all to be closed unmerged.) Several plan items were closed silently by the merged PRs, one item was scope-shrunk, one was scope-grown, and one had a previously-blocking dependency superseded. Without re-baselining, subagents would have re-validated against stale plan state at dispatch time, causing wasted work and noisy "already done" reports.

**Root cause:** The plan was written assuming a serial Stage-3 dispatch, but parallel work (Archon spike + UX redesigns + integration test hardening) continued on `main` while Stage 3 was being prepared. The plan-doc has no built-in re-baseline cadence — drift accumulates silently until a Stage-3 dispatch tries to reconcile.

**Delta applied (2026-05-08):**
- New "Recent main activity (since 2026-05-04)" section at top of plan body, summarizing all 10 PRs and their effect on plan items.
- C1 P2 marked `done` (PR #153).
- C2 P1 + P2 marked `done` as superseded by PR #171 (GC1 ratchet); rationale captured in Closed/revised + this entry.
- C2 P4 status changed from `blocked` to `todo` (was blocked on P2; GC1 now provides equivalent forward-only protection).
- C4 P1 scope shrunk from 6 files / 20 hex to 4 files / 6 hex (re-verified counts; PR #163 resolved 2 of the original 6 files).
- C8 P1 scope grew from 10 to 14 missing drizzle snapshots; specific list captured in Files-claimed.
- C1 P3 Notes flagged for re-audit — many sites already use `.parse()` wraps; original "12 wrappable sites" count needs re-verification before claiming.
- PR-05 marked superseded in PR Execution Plan table.
- Independently-startable PR list updated: PR-05 removed (superseded), PR-07 added (unblocked).
- C3 P1 + P2 remain `todo`. (Earlier notes had moved them to `review` while workflow-development drafts #179/#184/#185 were open against PR-08; those drafts will be closed unmerged.)

**Methodology lesson:** Plan should be re-baselined at the start of each Stage-3 dispatch wave, not just on deviation. Adding a lightweight "main-activity" PR-table at the top of the plan (and updating it before each dispatch) gives subagents and the coordinator a fast cross-check against drift.

### DEV-003

**Status:** `processed-2026-05-09`
**Source:** Second validation sweep — re-baseline after Archon spike week and continued feature work
**Finding:** Four additional PRs landed on `origin/main` since DEV-002: #175 (app-ev), #177 (consistency2 merge-back), #180 (app-ev2, 267 files), #183 (stabilization, 122 files). PR #187 (368 files) is open and incoming. The combined delta closed or partially closed 3 plan items and reshaped 3 more.

**Delta applied (2026-05-09):**
- **C2 P3** offender count 3→2: PR #180 removed all `jest.mock` from `interview-persist-curriculum.integration.test.ts`. Effort estimate reduced ~10-15 hr → ~7-10 hr.
- **C5 severity downgraded RED→YELLOW:** PR #183 deleted ~17 mobile-runtime deps from root, added `check:root-deps` guard script, and shipped Prettier 3 upgrade (closes **C5 P8**). C5 P1 scope halved from 32 to ~17 remaining changes.
- **C8 P1** will shrink from 14→11 missing snapshots when PR #187 merges (fills 0063-0065, ships 0066-0068 with snapshots). Phase blocked on #187 merge.
- **C1 P3** `billing.ts` grew from 9→15 total `c.json` calls (6 new routes added in PRs #175/#180). Original "12 wrappable sites" claim increasingly stale — Notes column flagged for re-audit. **Correction (DEV-004):** the "1/15 wrapped in billing.ts" claim was itself wrong — DEV-003's grep `c\.json(.*\.parse(` only matched single-line patterns and missed the codebase's actual multi-line `c.json(\n  schema.parse({...}),\n  status\n)` pattern. All 15 sites in billing.ts ARE wrapped, as are all sites in the other 5 target files. C1 P3 is now re-scoped to the dead-schema-export deletion only. See DEV-004 for the methodology lesson.
- **PR #187 (incoming)** touches `age.ts`, `errors.ts`, `inngest/index.ts`, `profile.ts`, `mentor-memory.tsx` — all plan-claimed files — but does NOT execute any plan items (no three-way `AgeBracket`, no `QuotaExceededError` move, no orphan observers). File content may shift on merge; subagents should re-read on claim.
- **C3 P1 + P2** remain `todo` — Archon workflow-development drafts (#179, #184, #185) were never merged. C3 scope confirmed correct (only `quiz/_layout.tsx` needs `unstable_settings`).
- Activity table at top of plan updated with all 10 PRs + PR #187 in-flight note.
- "Already shipped" table updated with PR #180 (C2 P3 partial), PR #183 (C5 P1 partial + C5 P8).

### DEV-004

**Status:** `processed-2026-05-09`
**Source:** Adversarial-review remediation pass (review document at `docs/audit/cleanup-review.md`, dated 2026-05-09)
**Finding:** An external adversarial review identified 4 dispatch-blocking errors and 7 important corrections in the cleanup plan. The blockers, ordered by severity:
1. **C1 P3 / PR-02 was stale** — the route-wrap work was already done. My earlier validation grep `c\.json(.*\.parse(` only matched single-line wraps and missed the codebase's actual multi-line pattern (`c.json(\n  schema.parse({...}),\n  status\n)`). All 6 target route files are fully wrapped; the celebrations rename was already shipped. Only the dead `coachingCardCelebrationResponseSchema` export remains.
2. **C1 P5 schema shape was wrong for current code** — `apps/api/src/routes/interview.ts` no longer exists; `sessions.ts` emits two error frames, one of which includes `code: errorCode`. The originally-resolved schema `{ type: 'error', message: string }` would reject the first frame at runtime.
3. **C2 P4 file claims were wrong** — `onboarding.integration.test.ts` does not exist; `interview-persist-curriculum.integration.test.ts` was deleted upstream. The actual offender set is 5 files plus `tests/integration/mocks.ts`, with `sessions-routes.integration.test.ts` missing from the original list.
4. **C1 P7's `NOT_IMPLEMENTED` deletion was unsafe** — `apps/api/src/routes/billing.ts:729` is a live consumer (`ProfileRemovalNotImplementedError` for cross-account family profile removal). Deleting `ERROR_CODES.NOT_IMPLEMENTED` would break a real route.

**Root cause:** Two compounding issues. First, **methodology gap**: the multi-sweep validation pattern in DEV-002/003 used grep heuristics that didn't match the codebase's actual formatting (single-line patterns missed multi-line wraps). Second, **plan-as-input fragility**: the Archon execute-cleanup-pr workflow's `cleanup-extract.sh` parses the plan deterministically into a work order, and the implement agent operates on the work order alone. Stale or incorrect Description / Files-claimed / Notes fields translate directly into wrong implementations, scope-guard failures (Phase 2.5 / 5.5 hard stops + Notion P1), or 3-strike circuit-breaker blocks. The plan needed adversarial verification before dispatch, not just self-validation.

**Delta applied (2026-05-09):**
- **C1 P3** re-scoped from "wrap 12 sites" to "delete dead `coachingCardCelebrationResponseSchema` export from progress.ts" (~10 min). PR-02 summary refreshed; "Gates PR-06" annotation removed.
- **C1 P5** schema shape corrected to include `code: z.string().optional()`; `interview.ts` dropped from Files-claimed; `stream-fallback.test.ts` added; D-C1-3 amended with revision.
- **C2 P4** file list replaced with verified offender set (`account-deletion`, `consent-email`, `learning-session`, `sessions-routes`, `stripe-webhook` + `mocks.ts`).
- **C1 P7** description rewritten to remove the `ERROR_CODES.NOT_IMPLEMENTED` deletion; D-C1-2 amended; Notes call out the live billing consumer.
- **C1 P1** description rewritten to remove the misleading "convert to instanceof" instruction; explicit "Do NOT change name+shape guards (BUG-947)" warning added.
- **C4 P7** Files-claimed expanded to include `session/index.tsx`; description appended with `age.ts:14-16` JSDoc rewrite (the "Do not unify" text contradicts D-C4-3); Definition of Done grep added.
- **C5** headline expanded to document `check-no-mobile-deps-at-root.cjs` guard scope limitation; P1 description expanded to include "expand FORBIDDEN list to cover the 6 remaining duplicates"; P1 Files-claimed updated.
- **C7 P1** Files-claimed expanded with two new test files; description appended with test-assertion requirements; verification command updated.
- **C9 P5** new phase added for folder-level archive moves; PR-29 added to PR Execution Plan.
- **PR Execution Plan** summary rows refreshed for PR-02, PR-06, PR-09, PR-12, PR-18 to match cluster-row scope.
- **Branch header** updated `consistency` → `consistency2`.
- **PR #187 overlap** documented with full 8-file list and `blocked-validation: re-read after PR #187 merges` Notes added to C1 P1, C1 P3, C1 P5, C4 P7, C7 P1.
- **Closed/revised** entries added for `.scratch/notion_key.txt` (resolved), and for the C1 P3 route-wrap re-scope.
- **DEV-003** corrected: the "1/15 wrapped in billing.ts" claim was itself produced by the same flawed grep methodology.

**Methodology lesson:** Two changes for future validation passes.
1. **Grep patterns must match the codebase's actual formatting.** For wrap-detection, use either `rg -U 'c\.json\(\s*\n?\s*\w+\.parse'` (multiline-aware) or count `c.json(` and `\.parse(` calls in proximity, NOT a single-line-only pattern. Always sample-validate the grep result by reading 1-2 hits manually before drawing scope conclusions.
2. **Adversarial cross-check before dispatch.** A plan ready for Stage 3 should be reviewed by a fresh agent with no prior context against the live codebase, NOT only re-baselined by the same model that wrote it. Past sweeps (DEV-002, DEV-003) were performed by the same author; an adversarial review caught what self-review missed. Add adversarial review as a standard pre-dispatch step.

### DEV-005

**Status:** `processed-2026-05-09`
**Source:** Round-2 adversarial review (`docs/audit/cleanup-review-round-2.md`, dated 2026-05-09)
**Finding:** Round 2 surfaced 6 issues post-DEV-004: 2 BLOCKER (R2-1: PR #187 in-flight references after merge; R2-2: C2 P4 DoD grep scope-creeps into unit tests), 3 HIGH (R2-3: zero-hit DoDs include audit/historical docs; R2-4: stale `PR-02 → PR-06` references in 3 places DEV-004 missed; R2-5: 7 stale summary counts/headlines/list entries), 1 MEDIUM (R2-6: PR-29 missing from C9 cross-coupling, broken-backtick DoD, missing audit-history excludes).

**Root cause:** Same anti-pattern DEV-004 named: detailed phase rows updated, downstream summaries/cross-couplings/DoDs not propagated. DEV-004's "sweep all non-phase-row summaries" recommendation was followed in 5 places but missed C1/C2 cluster headlines, the C1 cross-coupling subsection, the C2 P3 "Pairs with PR-02" Notes phrase, the cross-cluster sequencing paragraph, the C1 P8 stale Files-claimed, and the human-involvement-required count. Additionally, R2-2 and R2-3 surfaced a new sub-class of error: Definition-of-Done grep commands that are impossible to satisfy because they scope to the workspace or include directories the phase doesn't own.

**Delta applied (2026-05-09):**
- C1 P5 line-number reference refined to post-#187-merge sites (`sessions.ts:574-578` and `:743-746`).
- C2 P4 DoD rewritten to scope to the 6 claimed files only and target the `apps/api/src/inngest/client` boundary.
- C1 P3 DoD scoped to `packages apps` (was workspace-wide).
- C4 P7 DoD scoped to `apps/mobile packages/schemas/src` (was including `docs/`).
- C1 cross-coupling, C2 P3 Notes, and Cross-cluster sequencing paragraphs all amended to remove stale `PR-02 → PR-06` and `C1 P3 gating` claims.
- Net-effect bullet, C1 cluster headline, C2 cluster headline, PR-07 summary, human-involvement PR-12 entry, C1 P8 Files-claimed, and D-C1-1 resolution text all updated to reflect post-DEV-004 reality.
- C9 P5 row: PR-29 added to cross-coupling subsection; broken-backtick DoD command fixed; `--glob '!docs/_archive/**' --glob '!docs/audit/**'` excludes added.

**Methodology lessons:**
1. **DoD commands are part of the work order, not commentary.** Every grep in a Definition-of-Done must be tested against the current working tree to confirm it returns the expected zero hits in scope, AND that it does NOT return spurious hits in out-of-scope paths (audit history, sibling clusters' Files-claimed). A DoD that fails on accidental hits is a workflow blocker, not a typo.
2. **Sweep more aggressively.** A targeted edit to a phase row should trigger a `rg` for any of the changed identifiers across the entire plan doc, not just the row. Cluster headlines, cross-coupling sections, the PR Execution Plan table, the Independently-startable list, the Human-involvement-required list, and the Resolved Decisions resolutions are all at-risk surfaces. Add a checklist for these to the audit-status skill.
3. **Adversarial review must run after each remediation, not just once before dispatch.** R2 found 6 issues that DEV-004 introduced or failed to clean up. Self-review missed them. Treat adversarial review as a per-remediation-pass step, not a one-shot.

### DEV-006

**Status:** `processed-2026-05-11`
**Source:** Post-run reconciliation — PR #195 landed on main before either Archon agent ran for PR-04
**Finding:** The C1 P7 task to remove `/v1/auth/` from `PUBLIC_PATHS` in `apps/api/src/middleware/auth.ts` was pre-executed by PR #195 (a separate bugfix batch that merged before the PR-04 Archon agents were dispatched). Both the Claude and Codex implementations correctly detected that the removal was already done and left the file untouched. The plan description still read as if the removal was pending.

**Delta applied:**
- C1 P7 description annotated: "pre-executed by PR #195, see DEV-006".
- No scope change — all other P7 work (route/test/schema deletion, schema barrel, integration test update) remains `todo`.
