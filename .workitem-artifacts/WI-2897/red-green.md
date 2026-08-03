# WI-2897 red/green evidence

## RED — 2026-08-03

Command:

`pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/routes/consent.test.ts --runInBand --silent --testNamePattern "guardian-attachment rate limiting"`

Result: 1 suite failed; 1 new regression failed and 4 new regressions passed. The first over-limit request returned HTTP 429 but omitted the required deterministic `Retry-After: 600` header. The run preceded the production-code change for WI-2897.

## GREEN — 2026-08-03

- Focused guardian-attachment route matrix: same command — 5/5 passed.
- Complete consent route suite: `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/routes/consent.test.ts --runInBand --silent` — 79/79 passed.
- Shared limiter contract: `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/rate-limit.test.ts --runInBand --silent` — 16/16 passed.
- Formatting: `pnpm exec prettier --check apps/api/src/routes/consent.ts apps/api/src/routes/consent.test.ts` — passed.
- Targeted lint: `pnpm exec eslint apps/api/src/routes/consent.ts apps/api/src/routes/consent.test.ts` — passed with only the repository's standalone Nx project-graph cache warning.
- API TypeScript build: `pnpm exec tsc --build apps/api/tsconfig.json --pretty false` — passed.
