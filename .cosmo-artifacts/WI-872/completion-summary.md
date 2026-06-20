## Completion Summary — WI-872 (deterministic parent/family branch coverage, PARENT-01/02/03/14/16/17/22/24/25 + QA-08)

**What was done:** Verified, ID-tagged, and (where gaps existed) extended CI-stable
jest coverage for the 10 P1 parent/family flow IDs, and promoted their flow-plan rows
to ✅ Pass with `[PARENT-NN]`/`[QA-08]`-tagged cites. Finding: all 10 IDs already had
strong co-located coverage; the remaining work was the DoD verification run the prior
pass skipped, tagging the canonical tests, adding missing branch states, and promoting
the rows.

**What changed:** Added branch-state coverage + ID tags across
`apps/mobile/src/components/home/ParentHomeScreen.test.tsx` (PARENT-01/02/24),
`child/[profileId]/index.test.tsx` (PARENT-03), `child/[profileId]/curriculum.test.tsx`
(PARENT-17), `components/family/AddToMyLearningButton.test.tsx` + `routes/curriculum.test.ts`
(PARENT-14), `services/nudge.test.ts` + `nudge.integration.test.ts` (PARENT-16),
`components/guards/RequireFamilyContext.test.tsx` (PARENT-22),
`progress/index.test.tsx` (PARENT-25), `create-profile.test.tsx` (QA-08); flow-plan
rows promoted with cites.

**Verification:** Mobile in-scope suites 167 pass / 11 suites; API 430 pass / 18 suites;
`tsc --build` clean (mobile + api via pre-push); pre-push green (12 files). PR #1271:
all 9 checks green (5 required + claude-review + CodeRabbit), CLEAN, 0 review findings.
Squash-merged to `main` as `fdb6f45c` (PR-head SHA `92ba17afe`). PARENT-16's full
invariant (count on `toProfileId` regardless of sender + `pg_advisory_xact_lock`) is
proven by `nudge.integration.test.ts` (CI-routed api/db-schema lane); unit/route tests
cover the 4-cap/429 surface.

**Caveats / Follow-ups:** Brief-vs-doc divergence resolved in favour of the doc
(PARENT-14 = Learn-This-Too clone via `routes/curriculum.ts` `/clone-from-child`, not
`library-search.ts`; PARENT-17 = child curriculum overview; PARENT-24 = ambient layer).
One out-of-scope, unmodified test (`child/[profileId]/session/[sessionId].test.tsx`) is a
slow `waitFor` timeout on this Windows machine — left untouched per surgical-changes; not
a WI-872 ID. No follow-ups for WI-872.
