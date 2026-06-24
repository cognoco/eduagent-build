**What was done:**
Replaced the mobile API client's unsafe quota-error detail cast with shared-schema validation at the HTTP 402 trust boundary.

**What changed:**
- `apps/mobile/src/lib/api-client.ts` now uses `quotaExceededSchema.safeParse(...)` from `@eduagent/schemas` before constructing `QuotaExceededError`.
- `apps/mobile/src/lib/api-client.test.tsx` adds a regression test proving `QUOTA_EXCEEDED` responses with malformed details fail closed as `UpstreamError` instead of becoming typed quota errors.
- `apps/mobile/src/hooks/use-clone-from-child.test.tsx` now uses the canonical quota details shape for its adult monthly-quota UX fixture.
- The existing successful quota-error fixture now matches the canonical shared quota schema.

**Verification:**
- Red test observed: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/api-client.test.tsx --testNamePattern "WI-976"` failed because the malformed response still produced `QuotaExceededError`.
- Green focused test: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/api-client.test.tsx --testNamePattern "402 error classification"` passed.
- Green full API-client test: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/api-client.test.tsx` passed.
- Green formatter suite: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/format-api-error.test.ts` passed.
- Green related hook test: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/hooks/use-clone-from-child.test.tsx --testNamePattern "monthly quota"` passed.
- Green typecheck: `pnpm exec tsc -p apps/mobile/tsconfig.json --noEmit` passed.
- Green lint target: `pnpm exec nx run @eduagent/mobile:lint` passed with pre-existing warnings only and no errors.

**Caveats / Follow-ups:**
- Mobile lint still reports existing warnings outside the touched files.
