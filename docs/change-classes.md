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
| **i18n-cross-package** | `apps/mobile/src/i18n/locales/en.json` (exact) | `test:api:unit` | — | `app-help-map.test.ts` reads en.json via `readFileSync` — invisible to `nx affected`. Emits `--github-output unit=true`; the `API unit tests (cross-package en.json change — WI-886)` ci.yml step runs the suite on PRs |
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

## Flag-ON Integration Lane (advisory / WI-789)

The `integration-flag-on` CI job (`Flag-ON integration (IDENTITY_V2_ENABLED)`)
runs the full integration suite with `IDENTITY_V2_ENABLED=true` against a fresh
committed-migration DB (`drizzle-kit migrate`). It is the first flag-ON coverage
for the identity-v2 HTTP-route surface (diagnostic root `prg06ic-021`).

**Current status: NON-BLOCKING** (`continue-on-error: true` in `ci.yml`).
Reds here are expected diagnostic signal while WI-790/791/792/793 (D1-D4) and
:709/FG1 defects exist. They do not fail the `main` job or block unrelated PRs.

**Not a Gate-2 close-blocker for identity WIs (until the flip below).** Because
the lane is allowed-red *by design*, a red `Flag-ON integration` result is NOT
grounds to bounce or block an identity-v2 Work Item's Gate-2 close during the
burndown. The lane's committed-migration DB lacks the post-repoint FK graph
(`0117_m_repoint` / `0118_m_drop` are de-journaled freeze-only, applied only at
cutover), so identity-v2 `/v1/profiles` paths 500 there with FK errors
(`quota_pools_subscription_id_subscriptions_id_fk`,
`learning_profiles_profile_id_profiles_id_fk`) regardless of WI correctness.
Identity WIs instead validate their flag-on surface on a **repointed DB** (the
gated integration suite runs green only there) plus claude-review / adversarial
review; the comprehensive live flag-on validation is the pre-#8 **staging
rehearsal**. Reviewers MUST treat this lane as non-blocking for close until the
make-required flip below — close on the required-4 checks + the WI's
repointed-surface evidence. Caveat: watch for NEW failures *beyond* the known
structural baseline (currently `account-deletion.integration.test.ts` + the
unrepointed-DB FK set); failures outside that set indicate a real regression,
not the known structural red. (Operator-ratified 2026-06-17, PRG-06 / WS-18.)

**How to flip to REQUIRED (WI-586/WP-FLAG close gate):**

Mirrors the i18n-ratchet precedent (`pnpm audit (High+, advisory)` and
`sync-skills orphan check (advisory)` — both started `continue-on-error` and
are promoted to required once blocking reds resolve).

1. Confirm all D1-D4/FG1/:709 defect WIs are green on this job (watch the
   "Flag-ON integration (IDENTITY_V2_ENABLED)" check in GitHub PR checks).
2. Remove `continue-on-error: true` from the `integration-flag-on` job in
   `.github/workflows/ci.yml`.
3. Add `Flag-ON integration (IDENTITY_V2_ENABLED)` to branch protection
   required-status-checks: GitHub Settings → Branches → main → Edit →
   "Require status checks to pass" → search by name → add.
4. This job is then the WI-586/WP-FLAG close gate.

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
