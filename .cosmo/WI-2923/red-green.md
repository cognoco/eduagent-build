# WI-2923 audience regression proof

Executed at `2026-08-03T09:37:01Z` from clean branch `WI-2923-rgr` at
`3198e3946cecdc55fb144bb8041c1bfdf5308681` (then-current `origin/main`).

This is repository-only evidence. The already-consumed live Clerk scenario was
not rerun, and no Clerk, Doppler, Worker, staging, or production state was read
or mutated.

## Load-bearing regression

- Test: `apps/mobile/e2e-web/helpers/auth.audience.test.ts`
- Case: `rejects a wrong audience before writing local signed-in state`
- Enforcement point: `apps/mobile/e2e-web/helpers/auth.ts`, where
  `markPreAuthIntroSeen` calls `assertDevelopmentClerkTokenAudience` before
  writing signed-in browser state.
- Test command used for every phase:

  ```sh
  pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/e2e-web/helpers/auth.audience.test.ts --testNamePattern='rejects a wrong audience before writing local signed-in state'
  ```

## Exact pass → change → matching fail → restore → pass sequence

1. **Initial pass:** exit `0`; one selected test passed, two tests skipped.
   Jest reported `PASS @eduagent/mobile` and the named wrong-audience case
   passed.
2. **Temporary change:** removed only the guarded call below from
   `markPreAuthIntroSeen`; this change was never committed:

   ```ts
   if (process.env.PLAYWRIGHT_SKIP_LOCAL_API !== '1') {
     assertDevelopmentClerkTokenAudience(
       sessionCookie.value,
       process.env.CLERK_AUDIENCE,
     );
   }
   ```

3. **Matching failure:** exit `1`; the same selected test failed at
   `auth.audience.test.ts:46`. Jest reported:

   ```text
   expect(received).rejects.toThrow()
   Received promise resolved instead of rejected
   Resolved to value: true
   ```

   This is the precise behavioral regression under test: with the audience
   check removed, a wrong-audience token reaches the browser-state write and
   resolves successfully instead of failing closed.
4. **Exact restore:** restored the guarded call byte-for-byte. `git diff
   --exit-code` over the implementation and test returned `0`.
5. **Restored pass:** exit `0`; the same selected test passed again, with two
   tests skipped.

## Byte identity

The restored files have these SHA-256 digests:

```text
1da8068656967359e15ea04ba27d9abf293f88abad24dbfb9b6327a4ee488689  apps/mobile/e2e-web/helpers/auth.ts
4d31f7f56f4b2e80b790eee118eb33ea902dc356f15e09912386b626a083f865  apps/mobile/e2e-web/helpers/auth.audience.test.ts
```

Only this evidence receipt remains as a tracked change after the sequence.
