**What was done:** Fixed WI-953 (RecentSessionsList error secondary action pushes deeper into child stack) so the load-error secondary action no longer pushes parent-viewing-child users deeper into the child curriculum stack.

**What changed:** `apps/mobile/src/components/progress/RecentSessionsList.tsx` now uses `goBackOrReplace` with the family home fallback for non-active profile load errors, while preserving the active-profile home action. `apps/mobile/src/components/progress/RecentSessionsList.test.tsx` adds regression coverage for the parent-viewing-child error action.

**Verification:** Worker reproduced the bug with a failing focused mobile Jest regression, then verified the fix with the same focused Jest command. Coordinator reran `pnpm test:mobile:unit -- src/components/progress/RecentSessionsList.test.tsx --no-coverage`, which passed 1 suite and 5 tests. Worker also ran direct ESLint on the touched files, mobile TypeScript checking, and the pre-push validation from the explicit `origin HEAD:WI-953` push. Remote `origin/WI-953` matches commit `c97c0c5525f2c6505db0d03b395feb893a7bd3ac`.

**Caveats / Follow-ups:** No pull request was created.
