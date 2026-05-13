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
| **llm-prompts** | `services/**/*-prompts.ts`, `services/llm/*.ts` | `eval:llm` | `eval:llm --live` | Pre-commit enforces snapshot staging |
| **inngest** | `apps/api/src/inngest/**` | — | `test:api:integration` | Verify dashboard sync after deploy |
| **api-routes** | `apps/api/src/routes/**` | `test:api:unit` | `test:api:integration` | |
| **api-middleware** | `apps/api/src/middleware/**` | `test:api:unit` | `test:api:integration` | Auth/billing changes need break tests |
| **api-services** | `apps/api/src/services/**` (non-prompt) | `test:api:unit` | — | |
| **mobile-routes** | `apps/mobile/src/app/**` | `test:mobile:unit` | — | `unstable_settings`; push ancestor chain |
| **mobile-src** | `apps/mobile/src/**` (non-route, non-i18n) | `test:mobile:unit` | — | |
| **i18n** | `apps/mobile/src/i18n/**` | `check:i18n`, `check:i18n:orphans` | — | Pre-commit enforces en.json staleness |
| **shared-schemas** | `packages/schemas/src/**` | `test:api:unit`, `test:mobile:unit` | `test:api:integration`, `test:integration` | Never redefine types locally |
| **shared-database** | `packages/database/src/**` (non-schema) | `test:api:unit` | `test:api:integration` | |
| **security-sensitive** | `**/billing/**`, `**/auth/**`, `**/clerk*` | — | `test:api:integration` | Break tests required; no silent recovery |
| **ci-deploy** | `.github/workflows/**`, `wrangler.toml` | — | — | Manual review; check credential separation |
| **expo-config** | `app.config.*`, `eas.json` | — | — | May need native build; OTA can't ship native changes |
| **e2e** | `tests/e2e/**`, `apps/mobile/e2e/**`, `playwright.config` | — | `test:e2e:web:smoke` | Full suite via Doppler `-c stg` |
| **lint-config** | `eslint.config.*`, `.lintstagedrc.*`, `.husky/**`, `tsconfig*.json` | `lint`, `tsc --build` | — | |
| **retention** | `packages/retention/src/**` | `nx test retention`, `test:api:unit` | — | |
| **eval-harness** | `apps/api/eval-llm/**` (non-snapshots) | `eval:llm` | — | |
| **test-infra** | `packages/test-utils/**`, `packages/factory/**` | `test:api:unit`, `test:mobile:unit` | `test:api:integration` | |

## What the Pre-Commit Hook Already Covers

The hook (`scripts/pre-commit-tests.sh` + `.husky/pre-commit`) runs automatically:

- **lint-staged** — ESLint + Prettier on staged files
- **tsc --build** — incremental typecheck (when `.ts/.tsx` staged)
- **Surgical jest** — `--findRelatedTests` per project for staged files
- **Eval snapshot guard** — blocks commit if prompt files lack companion snapshots
- **i18n staleness guard** — runs when `en.json` staged
- **GC1 ratchet** — blocks new internal `jest.mock()` without `gc1-allow`

**Not covered by pre-commit** (the script catches these):

- Integration tests (`*.integration.test.*` are intentionally skipped)
- Cross-package integration tests (`tests/integration/`)
- E2E tests (Playwright, Maestro)
- `eval:llm --live` (Tier 2 — real LLM calls)
- DB push/generate/migrate
- Manual review items (CI config, deploy config, Expo config)
