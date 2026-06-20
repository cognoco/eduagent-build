# WI-867 disjoint-worktree builder — prompt template

Fill `{PARTITION}` (suite list + per-suite bucket from the mapper) and `{BRANCH}` (e.g. `WI-867-p1`).
Dispatch as **local_agent, Sonnet**. ONE builder per worktree. Builder does the work ITSELF — **MUST NOT spawn sub-agents** (the orphan-fleet disaster).

---
You are a test-migration builder for WI-867 (collapse `IDENTITY_V2_ENABLED` → v2-only). Work ONLY in your OWN worktree — create it, do not touch any other.

## Setup (your own isolated worktree — race-free)
```
cd /Users/vetinari/nexus/_dev/eduagent-build
git worktree add -b {BRANCH} .worktrees/{BRANCH} a85ca25d9
cd .worktrees/{BRANCH}
```
Base a85ca25d9 already has the validated foundation. Do NOT modify the 4 foundation files
(neon-mock.ts, database-module.ts, identity-v2-scope-mock.ts, dashboard.test.ts).

## Your partition + per-suite bucket
{PARTITION}

## The ONLY allowed fixes (by bucket — from the mapper)
- **A SEAM-CONTINUITY**: add a per-file `jest.mock('../services/identity-v2/profile-v2' | '.../family-v2' | '../services/billing/billing-v2', ...)` continuity mock that returns the rows the test needs, using `mock`-prefixed consts + `personScope()` from `../test-utils/identity-v2-scope-mock`. MIRROR the file's pre-collapse legacy mock defaults (incl. `null` defaults). Copy the dashboard.test.ts pattern EXACTLY.
- **B CUSTOM-DB-RESOLVE**: the suite passes its own `db`; seed `db.query.{login,membership,organization}` (import `makeV2IdentityQuery`/`seedV2IdentityGraph` from `../test-utils/database-module`) OR route it through `createDatabaseModuleMock`. Do NOT mock resolveIdentityV2.
- **C OBSOLETE-DELETE**: delete the named obsolete `it()`/`describe()` case(s) only. If the WHOLE suite is obsolete, delete the file. account/* → do NOT delete without an integration twin (flag to shepherd instead).
- **D BEHAVIORAL-DRIFT**: update the stale assertion to the corrected expectation the mapper gave. No mock changes.
- **E PRE-EXISTING**: leave as-is. Note it; do not "fix" unrelated flake.

## HARD PROHIBITIONS (the rejected mechanism — instant reject)
- NEVER `jest.mock('../services/identity-v2/identity-resolve')` or otherwise mock `resolveIdentityV2`. It is seeded centrally; mocking it is the rejected approach.
- `gc1-allow` ONLY on the db.select-chain continuity mocks (profile-v2/family-v2/billing-v2), justified as **CONTINUITY** ("rename of the pre-collapse findOwnerProfile/getProfile mock this suite already had; db.select chain unrunnable on the unit mock; real path covered by the identity/billing integration suite"). NEVER `gc1-allow: covered by integration tests` as a blanket on a fresh internal mock.
- Do NOT add any NEW internal `jest.mock('./...'|'../...')` beyond the continuity mocks above.
- Do NOT spawn sub-agents. Do NOT push. Do NOT touch the foundation files.

## Verify + hand off
1. Run your partition green: `cd apps/api && pnpm exec jest <your suite paths> --no-coverage`. ALL must pass.
2. Commit each logical cluster via the repo commit skill (`.agents/skills/commit/SKILL.md`) — stage ONLY your partition's files. Do NOT push.
3. Report back: per-suite bucket applied, the exact `gc1-allow` lines you added (verbatim), any suite you reclassified vs the mapper, and `git log --oneline a85ca25d9..HEAD`.
The shepherd reviews your diff (esp. every gc1-allow) and cherry-picks your commits onto WI-867. If you hit a suite that doesn't fit its assigned bucket, STOP that suite and report — do not improvise a new mock pattern.
