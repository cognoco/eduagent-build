**What was done:**
- Verified `WI-1011` was already satisfied by merged upstream work rather than creating a no-op patch.

**What changed:**
- No new code changes were made in this lane.
- The hardcoded sign-up button labels were already removed by merged commit `4c8745a87a15741dd12e3a8fcbb0c84ec29fc36e` from PR #1359.

**Verification:**
- `pnpm check:i18n:orphans` passed with 537 files checked and no findings.
- `sign-up.test.tsx` passed with 24 tests.
- Search of `apps/mobile/src/app/(auth)/sign-up.tsx` found no remaining target hardcoded label literals.

**Caveats / Follow-ups:**
- This item is completed as already fixed upstream; no new branch diff or PR was created for it.
