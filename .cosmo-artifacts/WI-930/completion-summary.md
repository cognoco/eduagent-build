**What was done:** Strengthened learner-profile adult non-owner write-path coverage so the tests verify the authenticated profile id is forwarded to the memory mutation services, not merely that the services were called.

**What changed:** `apps/api/src/routes/learner-profile.test.ts` now asserts the adult non-owner `DELETE /learner-profile/all` path calls `deleteAllMemory` with the adult non-owner profile id, account id, and identity options. It also asserts the adult non-owner `POST /learner-profile/consent` path calls `grantMemoryConsent` with the adult non-owner profile id, account id, consent value, and identity options.

**Verification:** Coordinator reran `pnpm test:api:unit --runTestsByPath apps/api/src/routes/learner-profile.test.ts --no-coverage`; it passed 1 suite / 39 tests. The run emitted existing route/logger warnings and the standard ts-jest `esModuleInterop` warning only.

**Caveats / Follow-ups:** No follow-up is required for this item.
