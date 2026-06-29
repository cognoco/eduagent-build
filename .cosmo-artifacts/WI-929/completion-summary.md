**What was done:**
Finished WI-929 (Integration test: consent-gated route asserts status only, no body) by strengthening the consented child learner-profile integration test to validate the response body, not only HTTP status.

**What changed:**
- `tests/integration/learner-profile-child-consent.integration.test.ts` now parses the successful `GET /v1/learner-profile/:childId` response and asserts `body.profile.profileId === childProfileId`.
- Reverted and excluded the temporary red-proof mutation in `apps/api/src/routes/learner-profile.ts`; no production route code is changed in the final commit.

**Verification:**
- Red proof: with `GET /learner-profile/:profileId` temporarily returning `{}`, `pnpm test:integration -- tests/integration/learner-profile-child-consent.integration.test.ts -t 'CONSENTED' --runInBand` failed on `Cannot read properties of undefined (reading 'profileId')`.
- Green focused case: after restoring the route, `pnpm test:integration -- tests/integration/learner-profile-child-consent.integration.test.ts -t 'CONSENTED' --runInBand` passed, 1 passed / 4 skipped.
- Full focused file: `pnpm test:integration -- tests/integration/learner-profile-child-consent.integration.test.ts --runInBand` passed, 5 passed.
- Commit hooks ran during `git commit`; lint-staged eslint/prettier and `sync-skills` completed.
- Pushed commit `4b3f15bf39253cd50bbee46f6407c32a8034ff7f` to `origin/WI-929`.

**Caveats / Follow-ups:**
- Jest printed the existing post-run open-handle advisory after the focused integration runs, but both commands exited 0 after the route was restored.
- Per instruction, Cosmo complete was not run.
