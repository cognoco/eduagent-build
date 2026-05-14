# Governance Enforcement Constraints

Non-obvious interactions between the repo's enforcement layer and common change types. Read this BEFORE proposing or implementing a task that touches the items listed below.

CLAUDE.md describes the *rules*. This document describes how the rules are *enforced* and what surprising things break when you change adjacent code. Past Archon runs have shipped reverted-mid-PR changes because the planner didn't model these interactions (see `bake-off-findings.md` for the catalog).

Organized by change kind. When a section's trigger applies, treat the listed constraints as preconditions on the plan.

---

## 1. Changing ESLint config (`eslint.config.mjs`, plugins, selectors)

**Trigger:** Any edit to `eslint.config.mjs` at root or any `apps/*/eslint.config.mjs`. Any new file with that name. Any change to a custom rule under `eslint-rules/`.

**Constraints:**

- **Flat config resolves globs relative to the CWD where ESLint is invoked**, not where the config file lives. A nested `apps/api/eslint.config.mjs` that re-exports the root will cause root patterns like `apps/api/src/routes/**/*.ts` to resolve to `apps/api/apps/api/src/routes/**/*.ts` — silently disabling G1/G3/G4/G5. Never add a bare re-export. If a nested config is genuinely needed, every glob must be rewritten with `import.meta.dirname` or made relative to the nested location.
- **G1 and G5 share a config block in `eslint.config.mjs`.** This is intentional — flat config uses last-match-wins, and splitting them risks dropping one. If you refactor these blocks, run `pnpm exec jest --testPathPattern eslint-governance.selftest` to confirm both still fire.
- **G6 (`reportUnusedDisableDirectives: error`) fails the build on stale `eslint-disable` comments.** Don't add `eslint-disable` as a workaround for a rule violation — the directive becomes stale the moment the underlying code changes. Fix the violation or improve the rule.
- **Custom rules use the `gov/` or `local/` plugin namespaces.** New rules must be registered in the appropriate plugin object in the config file; otherwise ESLint silently ignores them.

**Verification before commit:** `pnpm exec nx run api:lint` AND `pnpm exec jest --testPathPattern eslint-governance.selftest` (the selftest catches accidental selector regressions that lint would not notice).

---

## 2. Changing TypeScript config (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, references)

**Trigger:** Any edit to `tsconfig*.json`. Any change to the `references[]` array. Any new tsconfig file.

**Constraints:**

- **The pre-commit hook runs `pnpm exec tsc --build`**, which traverses the entire project-reference graph and type-checks every included file. Adding a new tsconfig to `references[]` means committing to its files being type-check clean — forever, on every commit, repo-wide.
- **`tsconfig.spec.json` IS now in the reference graph** (added after the ~279 test type errors were fixed in P3f). Jest also references it directly (`jest.config.cjs` → `tsconfig`). Integration tests (`*.integration.test.ts`) are excluded via the `exclude` pattern in `tsconfig.spec.json`. Any new test-file type errors will block all commits via `tsc --build`.
- **Adding `composite: true` to a tsconfig forces it into the build graph.** Don't set `composite: true` on a config that has known errors.
- **`tsc --noEmit` (per-package typecheck targets) and `tsc --build` (pre-commit) walk different file sets.** A change that's clean under `nx run mobile:typecheck` may still break `tsc --build` if it adds files to the project-reference graph.

**Verification before commit:** `pnpm exec tsc --build 2>&1 | tail -30`. If you see >5 errors in files you didn't touch, you've expanded the build graph — revert the references change.

---

## 3. Adding or modifying tests

**Trigger:** Any new `*.test.ts` / `*.test.tsx` / `*.spec.ts` file. Any change to a test file that touches `jest.mock`, `.skip`, `.todo`, or imports an internal module.

**Constraints:**

- **GC1 ratchet (CI) blocks any NEW `jest.mock('./...')` or `jest.mock('../...')` line** in test files. Diff-based — existing legacy mocks (~260 sites) are grandfathered. To stub internal exports, use `jest.requireActual()` with targeted overrides. Canonical example: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`. Bypass with `// gc1-allow: <reason>` on the same line — but `fix-locally` may not grant this exception.
- **G7 bans `.skip()` and `.todo()` outright in test files.** Conditional skips like `(hasDb ? describe : describe.skip)(...)` are allowed (callee is a ConditionalExpression). Don't add `it.skip()` as a way to land a half-finished test.
- **Integration tests (`*.integration.test.ts`) must mock at HTTP/external boundaries**, not internal services. `integration-mock-guard.test.ts` scans for `jest.mock()` referring to anything containing `/llm/` or `-llm` and fails on new violations outside the allowlist. Mock Stripe, Clerk JWKS, push providers — not your own services.
- **Tests are co-located with source**, no `__tests__/` folders. Convention enforced by reviewer.
- **The pre-commit hook runs only related tests via `jest --findRelatedTests`.** Integration tests (`.integration.test.`) are explicitly skipped at commit time and only run in CI. Don't rely on the pre-commit hook to validate integration test changes.

**Verification before commit:** Look at your diff with `rg 'jest\.mock\(' <your-test-file>`. If the path is relative (`./` or `../`), you'll trip GC1.

---

## 4. Changing LLM prompts or `services/llm/` code

**Trigger:** Any edit under `apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`.

**Constraints:**

- **The pre-commit hook requires a paired snapshot file.** When you stage a change to a `*-prompts.ts` or `services/llm/*.ts` file (excluding tests), at least one file under `apps/api/eval-llm/snapshots/` must also be staged. Run `pnpm eval:llm` to regenerate snapshots before committing.
- **No `[MARKER]` tokens in prompts.** State-machine signals must use the structured envelope (`services/llm/envelope.ts`). CI runs `scripts/check-prompt-markers.sh` which scans for `\[[A-Z][A-Z0-9_]{2,}\]` patterns (excluding `[DONE]` and `[OK]`). System prompts that *warn* the LLM not to use markers are exempt — the script detects negation context.
- **LLM SDK imports are restricted to `apps/api/src/services/llm/providers/**`.** G3 enforces this. Everywhere else must call `services/llm/router.ts`. Don't add a direct `@anthropic-ai/sdk` or `openai` import in a service outside `providers/`.
- **The structured response envelope (`llmResponseEnvelopeSchema`) is non-optional** for state-machine decisions (close interview, hold escalation, trigger UI widget). Parse with `parseEnvelope()`. Every envelope signal needs a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`).

**Verification before commit:** `pnpm eval:llm` (regenerates snapshots) → `git status` (confirms snapshot files staged) → `pnpm exec bash scripts/check-prompt-markers.sh`.

---

## 5. Changing database schema or migrations

**Trigger:** Any edit to `packages/database/**`, any new file in `apps/api/drizzle/*.sql`, any plan in `docs/plans/*.md` that describes destructive DB operations.

**Constraints:**

- **CI requires a `## Rollback` section** for any plan (`docs/plans/*.md` — active plans only; archived plans under `docs/_archive/plans/done/` are not scanned) or SQL migration that contains `DROP`, `ALTER`, `DELETE`, or `TRUNCATE`. The rollback section must specify reversibility, data loss, and recovery procedure. If rollback is impossible, say so explicitly.
- **Never run `drizzle-kit push` against staging or production.** Dev iteration uses push; staging/prod uses committed migration SQL plus `drizzle-kit migrate`.
- **A worker deploy does not migrate Neon.** Apply the target migration before shipping code that reads new columns.
- **Reads must use `createScopedRepository(profileId)`** when the query operates on a single scoped table. Multi-table joins through a parent chain (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`) use direct `db.select()` and enforce `profileId` via the parent ancestor. Don't write a route handler that calls `db.select()` directly — G5 will block it.
- **Writes must include explicit `profileId` protection** or verify ownership through the parent chain.

**Verification before commit:** `pnpm exec bash scripts/check-migration-rollback.sh` (CI runs this; mirror it locally).

---

## 6. Touching `process.env` or config in `apps/api/`

**Trigger:** Any `process.env.X` read in `apps/api/src/**`.

**Constraints:**

- **G4 bans raw `process.env.*` MemberExpression reads** outside the explicit allowlist (`apps/api/src/config.ts`, `apps/api/src/middleware/env-validation.ts`, `apps/api/src/middleware/llm.ts`, `apps/api/src/inngest/helpers.ts`, and test files). Use the typed `config` object from `apps/api/src/config.ts`.
- **Adding a new env var requires editing `config.ts`** (declare in schema, parse in init) and then reading it via `config.x`. Tests are exempt from G4 — they can read `process.env` directly.

---

## 7. Mobile UI / shared component changes

**Trigger:** Any edit to `apps/mobile/src/**` that touches colors, secure storage, default exports, crypto, or async mutations.

**Constraints:**

- **No hardcoded hex literals** outside `src/lib/design-tokens.ts` and the explicit render-asset allowlist (`AnimatedSplash.tsx`, `BrandCelebration.tsx`, `BookPageFlipAnimation.tsx`, `MentomateLogo.tsx`). Use NativeWind theme classes or design tokens.
- **No direct `expo-secure-store` imports.** Use the wrapper at `src/lib/secure-storage.ts`. SecureStore keys must use only letters, digits, `.`, `-`, `_` — invalid chars crash iOS Keychain.
- **Default exports only for Expo Router pages** under `src/app/**`. Everywhere else uses named exports.
- **No global `crypto`.** Hermes (RN engine) doesn't have it. Use `Crypto.randomUUID()` from `expo-crypto`.
- **Every `.mutateAsync()` call needs visible error handling**: `.catch()`, `try/catch`, `.then(_, onErr)`, or `return mutateAsync()` (propagation). Silent failures get flagged by `require-mutate-error-handling`.
- **Shared components stay persona-unaware.** No persona checks or hardcoded persona colors in shared components.

---

## 8. Cross-cutting / scope concerns

**Trigger:** Any task whose claimed file list undersells the actual touch surface.

**Constraints:**

- **The scope guard fails the run if files outside the work-order's claimed list are modified.** Runs twice: after `implement` and after `fix-locally`. Don't quietly touch a file because "while I'm here." If the plan needs more files, the plan needs amending.
- **The "sweep when you fix" rule** applies when a drift has 3+ sibling sites. Either install a forward-only guard test that fails CI on new violations AND sweep all current sites in the same PR, or document a deferred sweep with a tracked ID, owner, and target date. Never silently fix one of N.
- **Commit messages claiming a sweep** (containing `sweep`, `all sites`, `remaining surfaces`, `rest of`, `across all`) require a `Sweep audit:` block with grep query and result count. The `.husky/commit-msg` hook checks this. Bypass by including `(no-sweep)` if the keyword is incidental.

---

## 9. i18n changes (`apps/mobile/src/i18n/locales/`)

**Trigger:** Any edit to a locale file under `apps/mobile/src/i18n/locales/`.

**Constraints:**

- **Staging `en.json` requires staging all locale files** with matching key/variable shape. Pre-commit hook (`scripts/check-i18n-staleness.ts`) blocks otherwise.
- **CI runs `scripts/check-i18n-orphan-keys.ts`** to catch missing `t('key')` calls. i18next renders unknown keys as literal strings at runtime — typecheck won't catch this.

---

## Common Anti-Patterns (Past Archon Failures)

| Pattern | Why it failed | Right approach |
|---|---|---|
| Bare nested ESLint re-export | Glob resolution semantics silently disabled G1-G5 | Don't add nested configs unless every glob is rewritten |
| `tsconfig.spec.json` in `references[]` (pre-P3f) | `tsc --build` hit ~279 test type errors — now fixed | Post-P3f: reference is intentional; keep test files type-clean |
| New `jest.mock('./foo')` in a refactor | GC1 ratchet blocked the PR | Use `jest.requireActual()` with targeted override |
| `.skip()` to land a half-finished test | G7 fails the build | Don't add skipped tests — file a follow-up instead |
| `console.warn` in silent recovery path | "Silent recovery without escalation" rule | Emit a structured metric or Inngest event |
| New `.test.ts` file in `fix-locally` | Typically introduces internal jest.mock | File a P1 follow-up; don't create new test files in fix-locally |

---

## Quick reference: where each enforcement lives

- ESLint rules (G1-G7, GC1, mobile rules): `eslint.config.mjs`, `apps/mobile/eslint.config.mjs`, `eslint-rules/`, `apps/mobile/eslint-rules/`
- Pre-commit hook stack: `.husky/pre-commit`, `.husky/commit-msg`, `scripts/pre-commit-tests.sh`, `.lintstagedrc.cjs`
- CI checks: `.github/workflows/ci.yml`, `scripts/check-*.sh`, `scripts/check-*.ts`
- Self-tests / guard tests: `apps/api/src/eslint-governance.selftest.test.ts`, `apps/api/src/services/llm/integration-mock-guard.test.ts`, `scripts/pretest-e2e-guard.test.ts`, `apps/api/src/middleware/proxy-guard.test.ts`
