# Change Class Reference

**Source of truth:** `scripts/check-change-class.sh` — run it to see what your diff requires.

```bash
scripts/check-change-class.sh              # what do I need to validate?
scripts/check-change-class.sh --run        # run all validation
scripts/check-change-class.sh --run --fast # run only fast commands
scripts/check-change-class.sh --staged     # check staged files only
scripts/check-change-class.sh --branch     # check all changes vs main
```

## Quick Reference

| Class | File Pattern | Fast | Slow | Notes |
|---|---|---|---|---|
| **db-schema** | `packages/database/src/schema/**` | `db:push:dev`, `db:generate:dev` | `test:api:integration` | Never push to staging/prod |
| **db-migrations** | `packages/database/drizzle/**` | `db:migrate:dev` | `test:api:integration` | Migrate before deploy; rollback section if dropping |
| **llm-prompts** | `services/**/*-prompts.ts`, `services/llm/*.ts` | `eval:llm` | `eval:llm --live`, `test:llm:enduser` | Pre-commit enforces snapshot staging |
| **llm-routing** | `services/llm/router.ts`, `services/session/session-exchange.ts`, `services/subscription.ts`, `scripts/premium-routing-pass.ts` | — | `test:llm:premium-routing` | Live Plus/Family advanced-model routing gate |
| **llm-book-generation** | `packages/schemas/src/subjects.ts`, `services/book-generation.ts`, `services/book-suggestion-generation.ts`, `services/curriculum.ts`, `services/session/session-context-builders.ts`, `scripts/book-generation-pass.ts` | — | `test:llm:book-generation` | Live book/topic-map generation quality gate |
| **inngest** | `apps/api/src/inngest/**` | — | `test:api:integration` | Verify dashboard sync after deploy |
| **api-routes** | `apps/api/src/routes/**` | `test:api:unit` | `test:api:integration` | |
| **api-middleware** | `apps/api/src/middleware/**` | `test:api:unit` | `test:api:integration` | Auth/billing changes need break tests |
| **api-services** | `apps/api/src/services/**` (non-prompt) | `test:api:unit` | — | |
| **mobile-routes** | `apps/mobile/src/app/**` | `test:mobile:unit` | — | `unstable_settings`; push ancestor chain |
| **mobile-src** | `apps/mobile/src/**` (non-route, non-i18n) | `test:mobile:unit` | — | |
| **i18n** | `apps/mobile/src/i18n/**`, `apps/mobile/src/**/*.{ts,tsx}` | `check:i18n:orphans`, `check:i18n` | — | Shared detector catches new `t()` calls outside locale files |
| **shared-schemas** | `packages/schemas/src/**` | `test:api:unit`, `test:mobile:unit` | `test:api:integration`, `test:integration` | Never redefine types locally |
| **shared-database** | `packages/database/src/**` (non-schema) | `test:api:unit` | `test:api:integration` | |
| **security-sensitive** | `**/billing/**`, `**/auth/**`, `**/clerk*` | — | `test:api:integration` | Break tests required; no silent recovery |
| **ci-deploy** | `.github/workflows/**`, `wrangler.toml` | — | — | Manual review; check credential separation |
| **expo-config** | `app.config.*`, `eas.json` | — | — | May need native build; OTA can't ship native changes |
| **e2e** | `tests/e2e/**`, `apps/mobile/e2e/**`, `playwright.config` | — | `test:e2e:web:smoke` | Full suite via Doppler `-c stg`. Mobile smoke pack: `bash apps/mobile/e2e/scripts/run-smoke.sh` (see `docs/e2e-smoke-pack.md`) |
| **lint-config** | `eslint.config.*`, `.lintstagedrc.*`, `.husky/**`, `tsconfig*.json` | `lint`, `tsc --build` | — | |
| **retention** | `packages/retention/src/**` | `nx test retention`, `test:api:unit` | — | |
| **eval-harness** | `apps/api/eval-llm/**` (non-snapshots) | `eval:llm` | — | |
| **test-infra** | `packages/test-utils/**`, `packages/factory/**` | `test:api:unit`, `test:mobile:unit` | `test:api:integration` | |

## What the Commit / Push Hooks Already Cover

The **pre-commit** hook (`.husky/pre-commit`) runs cheap, staged-only guards:

- **lint-staged** — ESLint + Prettier on staged files
- **Secret / large-file scan** — blocks staged secret-pattern files (`.env*`, `.dev.vars`, `*.pem`, `*.key`, `credentials.json`, …) and >5 MB blobs
- **Eval snapshot guard** — blocks commit if prompt files lack companion snapshots
- **i18n staleness guard** — runs when `en.json` staged
- **GC1 ratchet** — blocks new internal `jest.mock()` without `gc1-allow`

The **pre-push** hook (`.husky/pre-push` → `scripts/pre-push-tests.sh`) is the local type/test gate, run on the push delta (working tree ≈ HEAD, so whole-tree checks are valid here):

- **tsc --build** — incremental cross-file typecheck
- **Surgical jest** — `--findRelatedTests` per project on the delta
- **Tier-1 eval / i18n** — when prompt or i18n files are in the delta

**Not covered by either hook** (the change-class script catches these):

- Integration tests (`*.integration.test.*` are intentionally skipped)
- Cross-package integration tests (`tests/integration/`)
- E2E tests (Playwright, Maestro)
- `eval:llm --live` (Tier 2 — real LLM calls)
- `test:llm:enduser` (live end-user learner quality gate)
- `test:llm:book-generation` (live generated book/topic-map quality gate)
- DB push/generate/migrate
- Manual review items (CI config, deploy config, Expo config)

## What the Pre-Push Hook Covers

The hook (`scripts/pre-push-tests.sh` + `.husky/pre-push`) runs automatically on `git push` and **blocks on failure**. It validates the push delta — all files changed since the remote last received this branch (or since `origin/main` for new branches).

- **tsc --build** — incremental typecheck on push delta (catches cross-commit type breakage)
- **Surgical jest** — `--findRelatedTests` per project on the delta (same pattern as pre-commit, but on the cumulative push range)
- **eval:llm** — when prompt files or eval harness code are in the delta
- **check:i18n:orphans** + **check:i18n** — when mobile source or i18n files are in the delta, using `scripts/lib/i18n-change-detection.sh`

Skip with `git push --no-verify` or `SKIP_PRE_PUSH=1`. Skipped automatically on protected branches (`main` by default; configure via `PREPUSH_SKIP_BRANCHES`).

**Not covered by pre-push** (left to CI):

- Integration tests (`*.integration.test.*`)
- E2E tests (Playwright, Maestro)
- Full workspace lint
- DB push/generate/migrate
- Manual review items
