**What was done:** Upgraded `@clerk/clerk-expo` above the CVE-2026-41248 fixed floor and added a dependency guard so the mobile package manifest and lockfile snapshots cannot silently fall below the Clerk security floor again.

**What changed:** `apps/mobile/package.json`; `apps/mobile/src/lib/package-deps-classification.test.ts`; `pnpm-lock.yaml`.

**Verification:** `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/lib/package-deps-classification.test.ts --no-coverage` passed 9 tests. `pnpm exec tsc --build apps/mobile/tsconfig.app.json --pretty false` exited 0. `pnpm exec eslint apps/mobile/src/lib/package-deps-classification.test.ts` exited 0. Vulnerable-version search for old `@clerk/clerk-expo` and `@clerk/shared` floors returned zero hits. `git push origin HEAD:WI-909` passed repo pre-push validation: tsc, related Jest, and i18n checks.

**Caveats / Follow-ups:** The first push attempt exposed a real TypeScript issue in the new guard, fixed in a follow-up commit. The `WI-909` worktree needed a clean `node_modules` rebuild because stale aborted setup processes left generated package files locked. No follow-ups.
