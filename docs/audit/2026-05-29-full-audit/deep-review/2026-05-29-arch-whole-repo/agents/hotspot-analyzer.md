# Hotspot Analyzer — eduagent-build (whole-repo architecture review)

Scope: entire monorepo at `/Users/vetinari/nexus/_dev/eduagent-build`. All findings classified **[PRE-EXISTING]** per scope.

## Method & caveats

- **Churn signal is unavailable.** Git history is squashed/imported to a single day (3048 commits, all dated 2026-05-29; first commit 16:32 same day). `git log --since=1.year --name-only` and all-time `--name-only` frequency are therefore meaningless as a change-risk proxy (the top "churned" file shows only 4-5 touches, all from the single import). Hotspot ranking below is built on **file size + responsibility count (exported symbols) + fan-in/fan-out + intrinsic complexity (hook/step counts)** instead. Where I'd normally weight churn × complexity, treat the size/complexity axis as the sole signal and re-run churn analysis once real history accumulates.
- Counts gathered with ripgrep/fd. Codebase totals: **1012 non-test source files**; **40 files >1000 lines**; **67 files in the 500–1000 line band** (non-test). So ~10% of source files exceed 500 lines — a meaningful long tail.
- Fan-in measured as "distinct files referencing the module"; fan-out as `import` statement count in the file.

---

### Hotspot Analysis

#### High Fan-in Modules (depended on by many)

| Module | Fan-in Count | Classification | Severity |
|--------|--------------|----------------|----------|
| `@eduagent/schemas` (package) | 378 non-test files (504 incl. tests) — ~37% of all source files | [PRE-EXISTING] | MEDIUM |
| `@eduagent/database` (package) | 277 files | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/lib/theme` / `design-tokens` / `useTheme` | 128 files | [PRE-EXISTING] | LOW |
| `apps/mobile` `useProfile` (`lib/profile`) | 91 files | [PRE-EXISTING] | LOW |
| `apps/api` `errors.ts` helpers | 60 route/service files | [PRE-EXISTING] | LOW |
| `apps/mobile` `useApiClient` (`lib/api-client`) | 60 files | [PRE-EXISTING] | LOW |
| `apps/api/src/services/logger` | 43 files | [PRE-EXISTING] | LOW |
| `apps/api/src/services/llm/router` (`routeAndCall`/`routeAndStream`) | 41 files | [PRE-EXISTING] | MEDIUM |
| `@eduagent/retention` (package) | 22 files | [PRE-EXISTING] | LOW |

**Analysis.** The two highest-fan-in nodes are the deliberate architectural seams (`@eduagent/schemas` as the shared contract, `@eduagent/database` as the data layer) — this is the intended dependency shape, not accidental coupling, and the architecture doc enforces a strict one-way flow (`apps → schemas/database`, leaf packages with no workspace deps). The concern is **not** that fan-in is high but that the high-fan-in nodes are **internally large and multi-domain**: `schemas` is a single package whose `progress.ts` (997 lines) and `subjects.ts` (886) are themselves oversized, and `database/repository.ts` is 1352 lines. A breaking change to any of these ripples to 280–380 files with no sub-package boundary to contain the blast radius. The package *is* split by domain file internally (progress/subjects/sessions/…), which is good; the risk is that the **barrel re-exports everything flat** (35 `export *`/`export {` in `index.ts`), so consumers can't depend on a narrow slice and tree-shaking/`affected` analysis treats any schema edit as touching all 378 consumers. `llm/router` (41 dependents) is flagged MEDIUM because it is both high-fan-in **and** the most-edited-by-policy module (CLAUDE.md requires eval-harness runs on every prompt/router change) sitting in front of the LLM trust boundary — a fragile change there is high-consequence.

#### High Fan-out Modules (depends on many)

| Module | Fan-out (imports) | Classification | Severity |
|--------|---------------------|----------------|----------|
| `apps/mobile/src/app/(app)/session/index.tsx` | 58 imports, 82 hook calls | [PRE-EXISTING] | HIGH |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | 41 imports, 68 hook calls, 2110 lines | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/session/session-exchange.ts` | 38 imports, 13 exports, 3321 lines | [PRE-EXISTING] | HIGH |
| `apps/api/src/inngest/functions/session-completed.ts` | 32 imports, 35 Inngest steps, 1820 lines | [PRE-EXISTING] | HIGH |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | 27 imports, 1147 lines | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/app/(app)/library.tsx` | 27 imports, 1248 lines | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/session/session-crud.ts` | 25 imports, 35 exports, 2228 lines | [PRE-EXISTING] | HIGH |
| `apps/api/src/routes/sessions.ts` | 25 imports, 1612 lines | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/components/session/ChatShell.tsx` | 21 imports, 1119 lines | [PRE-EXISTING] | MEDIUM |

**Analysis.** High fan-out concentrates almost entirely in the **active-learning-session vertical** on both client and server. `session/index.tsx` (58 imports / 82 hooks) and `book/[bookId].tsx` (41 imports / 68 hooks) are screen-level god components: they pull state, theming, navigation, streaming, and a dozen domain hooks into one file, which makes them hard to reason about, expensive to test, and prone to re-render/effect-ordering bugs (exactly the runtime-assumption class CLAUDE.md's deep-bugfixing rules target). On the server, `session-exchange.ts` (38 imports, 3321 lines, 13 exports spanning routing decisions, challenge-round state machines, memory merging, prompt prep, persistence, streaming) is the single most concentrated change-risk file in the repo — it mixes pure decision functions (`resolveReadyToFinish`, `resolveExchangeLlmRouting`) with async I/O orchestration (`prepareExchangeContext`, `persistExchangeResult`, `streamMessage`) in one module. `session-completed.ts` is a 35-step Inngest pipeline in one function — durable but monolithic; a failure-mode/idempotency change touches the whole chain.

#### Large Files

| File | Lines | Classification | Severity |
|------|-------|----------------|----------|
| `apps/api/src/services/test-seed.ts` | 5668 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/session/session-exchange.ts` | 3321 | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/curriculum.ts` | 2643 (29 exports) | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/session/session-crud.ts` | 2228 (35 exports) | [PRE-EXISTING] | HIGH |
| `apps/mobile/.../shelf/[subjectId]/book/[bookId].tsx` | 2110 | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/learner-profile.ts` | 1948 (30 exports) | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/exchanges.ts` | 1906 (15 exports) | [PRE-EXISTING] | HIGH |
| `apps/api/src/services/progress.ts` | 1832 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/inngest/functions/session-completed.ts` | 1820 | [PRE-EXISTING] | HIGH |
| `apps/mobile/.../homework/camera.tsx` | 1705 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/dashboard.ts` | 1664 (16 exports) | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/routes/sessions.ts` | 1612 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/retention-data.ts` | 1596 | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/app/(auth)/sign-in.tsx` | 1545 | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/.../session-summary/[sessionId].tsx` | 1481 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/llm/router.ts` | 1463 (16 exports) | [PRE-EXISTING] | MEDIUM |
| `packages/database/src/repository.ts` | 1352 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/exchange-prompts.ts` | 1254 | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/components/session/use-session-streaming.ts` | 1250 | [PRE-EXISTING] | MEDIUM |
| `apps/api/src/services/consent.ts` | 1260 | [PRE-EXISTING] | MEDIUM |
| `apps/mobile/src/app/(app)/_layout.tsx` | 771 (hosts V0 nav helpers) | [PRE-EXISTING] | MEDIUM |

(40 non-test files exceed 1000 lines; the band 500–1000 holds another 67. Table shows the top concentration.)

**Split recommendations.**
- **`test-seed.ts` (5668 lines)** is the single largest file and is mounted into the live Hono app (`index.ts:281 .route('/', testSeedRoutes)`, gated). Even gated, a 5.6k-line seeding module is a maintenance and review hazard and inflates the worker bundle. Split per-domain seed builders (`seed/profiles.ts`, `seed/sessions.ts`, `seed/curriculum.ts`, …) behind a thin orchestrator; verify it is tree-shaken/excluded from production builds.
- **`session-exchange.ts` (3321)** — separate the **pure decision layer** (`resolveReadyToFinish`, `resolveExchangeLlmRouting`, `resolveChallengeRound*`, `computeCorrectStreak`, `buildExchangeHistory`, `mergeMemoryContexts`) into `session/exchange-decisions.ts` (no I/O, trivially unit-testable) from the **orchestration layer** (`prepareExchangeContext`, `persistExchangeResult`, `processMessage`, `streamMessage`). This is the highest-leverage split in the repo.
- **`curriculum.ts` (29 exports) / `session-crud.ts` (35 exports) / `learner-profile.ts` (30 exports)** — exported-symbol counts this high mean the file is a de-facto namespace, not a cohesive service. Split along verb/aggregate lines (e.g. CRUD vs. query vs. lifecycle).
- **`session-completed.ts` (35 steps)** — extract step bodies into named, individually-tested step functions; keep the Inngest function as a thin composition so the failure/idempotency surface of each step is reviewable in isolation.
- **Mobile `session/index.tsx` (82 hooks) and `book/[bookId].tsx` (68 hooks)** — extract domain logic into custom hooks (`useSessionController`, `useBookDetail`) and presentational subcomponents; a screen file should orchestrate, not own 80 hook calls.
- **`exchanges.ts` (1906) + `exchange-prompts.ts` (1254)** sit together as a 3160-line prompt/exchange cluster — the prompt-authoring surface that policy says must be eval-tested on every change. Worth confirming prompt strings are isolated from control flow so eval snapshots are stable.

#### Implicit Coupling via Types

- **`@eduagent/schemas` flat barrel ([PRE-EXISTING], MEDIUM).** The package is the shared contract by design (378 consumers) and is internally split by domain, but `index.ts` re-exports everything flat (35 export lines). Consumers cannot depend on a sub-slice, so (a) any schema edit marks all 378 dependents as "affected" for Nx/CI purposes, and (b) the typed coupling is invisible at import sites (`import { x } from '@eduagent/schemas'` hides which domain you actually depend on). Consider per-domain subpath exports (`@eduagent/schemas/sessions`) while keeping the barrel for convenience.
- **`AppType` RPC type (mobile → api) ([PRE-EXISTING], LOW — sanctioned).** `apps/mobile/tsconfig.json` references `../api` so `import type { AppType }` resolves. This is a documented, type-only exception (CLAUDE.md + architecture doc) with a reviewer rule against runtime imports. Implicit coupling exists (mobile's types track the entire API surface) but it is intentional and guarded; no action beyond keeping the type-only guard enforced.
- **`ScopedRepository = ReturnType<typeof createScopedRepository>` ([PRE-EXISTING], LOW).** 277 files depend on `@eduagent/database`; the scoped-repo return type is a structural type threaded through service signatures. Changing the repo's shape silently re-types every consumer. Acceptable given it's the enforced data-access seam, but it means `repository.ts` (1352 lines) is a high-consequence file — keep it cohesive.
- **`llmResponseEnvelopeSchema` / escalation-rung enums ([PRE-EXISTING], MEDIUM).** State-machine decisions across the session vertical key off these shared envelope/rung types (architecture doc + CLAUDE.md non-negotiables). They tie `llm/router`, `session-exchange`, `exchanges`, and the challenge-round services together implicitly — a change to the envelope contract is a cross-module event. This is the right design (one structured contract beats `[MARKER]` tokens), but it concentrates coupling in the session vertical, reinforcing why that vertical dominates the hotspot list.

#### Top 3 Hotspots to Address

1. **`apps/api/src/services/session/session-exchange.ts` (3321 lines, 38 fan-out, 13 mixed pure+I/O exports).** Highest concentration of size × fan-out × consequence in the repo, sitting directly on the LLM trust boundary and the challenge-round mastery policy. Split pure decisions from orchestration first.
2. **`apps/api/src/services/test-seed.ts` (5668 lines), mounted in the live app.** Largest file by far; verify production exclusion and decompose per-domain. Low product risk but outsized review/bundle/maintenance cost and an unusual place to carry 5.6k lines.
3. **Mobile active-session screens — `session/index.tsx` (82 hooks/58 imports) and `book/[bookId].tsx` (68 hooks/41 imports, 2110 lines).** God components in the most-used flow; extract controllers/hooks and subcomponents to cut re-render and effect-ordering risk.

#### Recommendations

**[NEW] issues (introduced by this PR):** None — this is a whole-repo review, not a diff. No findings classified [NEW].

**[PRE-EXISTING] issues (architecture-level, prioritized):**
- Decompose the session vertical: `session-exchange.ts`, `session-crud.ts`, `exchanges.ts`, and `session-completed.ts` together form one oversized, high-fan-out cluster. Start with the pure-vs-I/O split in `session-exchange.ts` (no behavior change, immediate testability win).
- Audit/relocate `test-seed.ts`; confirm it cannot ship in the production worker bundle and split it per domain.
- Tame the screen-level god components (`session/index.tsx`, `book/[bookId].tsx`, `ParentHomeScreen.tsx`, `library.tsx`) by extracting hooks/subcomponents — the 60–80 hook-call files are the mobile change-risk concentration.
- Reduce `@eduagent/schemas` blast radius with per-domain subpath exports so a single-domain schema edit doesn't mark all 378 consumers affected; keep the leaf-package discipline intact.
- Treat `llm/router.ts` and the envelope/rung types as a guarded seam: keep the eval-harness gate (already policy) and avoid letting `router.ts` grow past its current 1463 lines / 16 exports without splitting provider-selection from streaming normalization.
- **Re-run churn analysis once real git history exists.** Today's single-day squashed history makes the size/complexity axis the only available risk signal; the highest-value hotspot ranking (churn × complexity) cannot be produced until commits accumulate over time.
