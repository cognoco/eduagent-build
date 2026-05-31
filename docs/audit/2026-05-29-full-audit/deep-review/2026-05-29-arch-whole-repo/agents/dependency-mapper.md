# Dependency Mapper Agent — eduagent-build (whole-repo architecture review)

Scope: entire pnpm/nx monorepo at `/Users/vetinari/nexus/_dev/eduagent-build`. All findings classified **[PRE-EXISTING]** (no PR diff). Intended dependency rules read from `docs/architecture.md` (lines 702–715), `CLAUDE.md`, and `eslint.config.mjs`.

### Dependency Analysis

#### Module Structure

Workspace packages (from `pnpm-workspace.yaml` / each `package.json`):

| Package | Name | Declared internal deps |
|---------|------|------------------------|
| `apps/mobile` | `@eduagent/mobile` | `@eduagent/schemas` (runtime), `@eduagent/api` (type-only devDependency) |
| `apps/api` | `@eduagent/api` | `@eduagent/schemas`, `@eduagent/database`, `@eduagent/retention` |
| `packages/database` | `@eduagent/database` | `@eduagent/schemas` |
| `packages/schemas` | `@eduagent/schemas` | none (leaf) |
| `packages/retention` | `@eduagent/retention` | none (leaf, pure math) |
| `packages/test-utils` | `@eduagent/test-utils` | none |

Inside `apps/api/src`: clear layers — `routes/` (46 route files) → `services/` (~150 service modules, several sub-packages: `llm/`, `session/`, `challenge-round/`, `memory/`, `quiz/`, `billing/`, `needs-deepening/`, `dictation/`, `onboarding/`, `support/`, `plans/`) → `middleware/`, `inngest/` (58 functions), `config.ts`, `errors.ts`.

Inside `apps/mobile/src`: `app/` (Expo Router screens, ~88) → `components/` → `hooks/` → `lib/` (incl. `navigation-contract.ts`, `api-client.ts`, `profile.ts`, `i18n/`).

#### Dependency Layers

| Layer | Modules |
|-------|---------|
| Foundation | `@eduagent/schemas` (leaf — Zod contract + inferred types), `@eduagent/retention` (pure SM-2 math, zero deps) |
| Utilities | `@eduagent/database` (Drizzle schema + scoped repo; depends only on `@eduagent/schemas`, type-only), `@eduagent/test-utils` (test fixtures) |
| Features | `apps/api/src/services/*`, `apps/api/src/inngest/*`; `apps/mobile/src/{components,hooks,lib}` |
| App | `apps/api` (routes/index.ts wiring), `apps/mobile` (Expo Router screens) — depended on by nothing |

#### Layering Violations

| Violation | Classification | Severity | Explanation |
|-----------|----------------|----------|-------------|
| `@eduagent/database` declares & uses `@eduagent/schemas` as a workspace dependency, contradicting `architecture.md:710` ("`@eduagent/database → (no workspace deps)`… uses drizzle-zod, not `@eduagent/schemas` directly") and `:715` ("the schema package must remain a leaf… importing a Drizzle type into a shared schema creates a circular dependency"). | [PRE-EXISTING] | MEDIUM | Real divergence from documented design, but **not** an actual cycle: every database→schemas import is `import type` (`repository.ts:18 QuizActivityType`; `schema/assessments.ts:19 ChatExchange`; `schema/sessions.ts`, `schema/progress.ts`), and `packages/schemas/src` has **zero** imports of `@eduagent/database` (the lone `account.ts:14` hit is a comment). So the leaf invariant holds at runtime; the doc is stale relative to BUG-390 (`repository.ts:67` notes the type was promoted from a local redefinition to a schemas import). Action is to reconcile the doc (or move shared DB-row types so database stays a true leaf), not a build/runtime risk. |
| `apps/api/src/services/*` imports from `apps/api/src/middleware/*` (services depending on the outer HTTP layer). Sites: `services/family-access.ts:13` and `services/quiz/orchestrate-round.ts:14`, both importing `ProfileMeta` from `middleware/profile-scope`. | [PRE-EXISTING] | LOW | Direction inversion (inner business layer reaching into the HTTP/middleware layer), but both are `import type` only — erased at compile time, no runtime coupling or cycle. Cleanest fix: relocate the `ProfileMeta` type into `services/` or a shared `types/` module so middleware imports it downward instead. |
| `apps/mobile/src/lib/pre-auth-audience.ts:29` imports `WelcomeAudience` from `../components/welcome/WelcomeIntro` (lib reaching up into components). | [PRE-EXISTING] | LOW | Same pattern — `import type` only, no runtime inversion. Move the `WelcomeAudience` type down into `lib/` so the component imports it, not vice-versa. |

No CRITICAL or HIGH layering violations found:
- No circular package dependencies (schemas/retention are true runtime leaves).
- `apps/mobile → @eduagent/api` is the single documented exception and is clean: only `import type { AppType }` in `lib/api-client.ts:11` (and a comment in `lib/api.ts`). No runtime import of API server code into the mobile bundle.
- No route imports another route; no inngest function imports a route; no route imports an inngest function directly (dispatch goes through `inngest/client`). Background-job layering is intact.
- No mobile component imports an `app/` screen; no deep-path/barrel-bypass imports anywhere (`@eduagent/<pkg>/src/...` count = 0). Barrel discipline (`architecture.md:692`) is fully observed; the `@eduagent/schemas/db-jsonb` subpath appears only in comments, never as a live import.
- `@eduagent/test-utils` confined to test files (only non-test consumer is `packages/database/jest.setup.ts`, which is acceptable test infra).
- `apps/mobile` does not import `@eduagent/database` or `@eduagent/retention` at all (forbidden direction respected).

#### Fan-in / Fan-out Concerns

| Module | Fan-in | Fan-out | Classification | Severity | Concern |
|--------|--------|---------|----------------|----------|---------|
| `@eduagent/schemas` | ~497 importing files | 0 | [PRE-EXISTING] | MEDIUM | Extreme fan-in. This is intentional (the shared contract hub, by design a leaf) so it is not a layering bug, but it is a fragile bottleneck: any breaking change to a schema ripples to ~500 files across both apps + database. Risk is mostly amplified because the package is a single undifferentiated barrel — there is no sub-package segmentation (e.g. profiles vs sessions vs billing), so consumers can't depend on a narrow slice. Watch as it grows; consider internal namespacing if change-blast-radius becomes painful. |
| `apps/api/src/services/session/session-exchange.ts` | 6 | ~20 sibling services + inngest + llm | [PRE-EXISTING] | HIGH | God orchestrator: 3,321 LOC, the largest non-seed source file, with very high fan-out — pulls `exchanges`, `escalation`, `prior-learning`, `learner-profile`, `app-help-map`, `embeddings`, `memory/*`, `retention(-data)`, `evaluate`, `teach-back`, `llm/*`, `subscription`, `inngest`, `safe-non-core`, `practice-activity-events`, `curriculum-topic-ownership`, and four `challenge-round/*` modules. It is the central exchange-processing hub; its breadth makes it hard to test in isolation and a magnet for further coupling. Candidate for decomposition (e.g. split challenge-round, memory-retrieval, and verification-trigger concerns into composed sub-steps). |
| `apps/api/src/services/test-seed.ts` | (test/seed wiring) | wide | [PRE-EXISTING] | MEDIUM | 5,668 LOC — by far the largest file. It necessarily touches most domains (E2E seed), so high fan-out is expected, but at this size it is a maintenance hazard and a single point that breaks whenever any seeded schema changes. Consider splitting per-domain seed builders. |
| `apps/api/src/services/curriculum.ts` (2,643), `session/session-crud.ts` (2,228), `learner-profile.ts` (1,948), `exchanges.ts` (1,906), `progress.ts` (1,832), `inngest/functions/session-completed.ts` (1,820), `dashboard.ts` (1,664), `services/llm/router.ts` (1,463) | varies | varies | [PRE-EXISTING] | MEDIUM | Cluster of oversized service modules (>1.5k LOC). None are layering violations, but each concentrates a lot of responsibility; `session-completed.ts` in particular is the fan-out hub of the post-session pipeline (SM-2 → coaching card → dashboard → embeddings). Elevated complexity that will get harder to navigate as the codebase grows. |
| `apps/mobile` screens `shelf/[subjectId]/book/[bookId].tsx` (2,110), `homework/camera.tsx` (1,705), `(auth)/sign-in.tsx` (1,545), `session-summary/[sessionId].tsx` (1,481), `session/index.tsx` (1,334) | leaf screens | high | [PRE-EXISTING] | LOW | Several screen files are very large for Expo Router leaves. Not a dependency-direction problem (screens are top of the layer graph, depended on by nothing) but they bundle a lot of logic that would be better pushed into `hooks/` or `components/` for reuse and testability. |
| `apps/api/src/config.ts` | 13 | small | [PRE-EXISTING] | LOW | Healthy fan-in for a typed-config module; G4 lint enforces routing env reads through it. No concern beyond noting it is a deliberate shared dependency. |

#### Notes on enforcement

- `@nx/enforce-module-boundaries` is enabled (`eslint.config.mjs:106`) but configured permissively: a single `{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }` constraint. That means nx **tags** impose no directional constraint between packages — direction is enforced only by (a) what each `package.json` declares and (b) the documented `no-restricted-imports` governance rules (G1 drizzle-orm-in-routes ban, G3 LLM-SDK-only-in-providers, G4 env). The rule is turned **off** entirely for test files (`:132`). This is a reasonable setup, but it means the `database → schemas` doc divergence and the type-only middleware/component inversions above are not machine-caught — they rely on review. Tagging packages with layer tags (`scope:foundation`, `scope:feature`, etc.) and tightening `depConstraints` would convert the documented one-way flow (`architecture.md:702-715`) into an enforced one.

#### Recommendations

**[NEW] issues (introduced by this PR):**
- None — whole-repo review, no diff.

**[PRE-EXISTING] issues (in scope):**
- **MEDIUM — reconcile the `@eduagent/database → @eduagent/schemas` divergence.** Either update `architecture.md:710-715` to acknowledge the (type-only, post-BUG-390) dependency and explicitly bless it, or relocate the shared row/exchange types so `@eduagent/database` returns to being a true leaf. Right now the canonical architecture doc actively contradicts the code and warns of a "circular dependency" that does not exist — stale guidance that will mislead the next contributor.
- **HIGH — decompose `services/session/session-exchange.ts` (3,321 LOC, ~20 service fan-out).** It is the system's coupling epicenter. Pull cohesive concerns (challenge-round handling, memory retrieval, verification triggers) into composed sub-modules so the orchestrator becomes thin glue. This is the single highest-leverage structural improvement.
- **MEDIUM — split the >1.5k-LOC service/inngest files** (`test-seed.ts` 5,668, `curriculum.ts`, `session-crud.ts`, `learner-profile.ts`, `exchanges.ts`, `progress.ts`, `session-completed.ts`, `dashboard.ts`, `llm/router.ts`) along clear sub-responsibilities; each is currently a navigation and change-risk hotspot.
- **MEDIUM — consider internal segmentation of `@eduagent/schemas`** (fan-in ~497). A single barrel over a ~500-consumer contract means every change has maximal blast radius; namespaced sub-barrels would let consumers depend on narrower slices.
- **LOW — fix the two type-only layer inversions** by moving the shared types downward: `ProfileMeta` out of `middleware/profile-scope` into a services/shared types module (consumed by `services/family-access.ts`, `services/quiz/orchestrate-round.ts`); `WelcomeAudience` out of `components/welcome/WelcomeIntro` into `lib/` (consumed by `lib/pre-auth-audience.ts`).
- **LOW — adopt nx layer tags + tightened `depConstraints`** so the documented one-way dependency flow is enforced by lint rather than review.
