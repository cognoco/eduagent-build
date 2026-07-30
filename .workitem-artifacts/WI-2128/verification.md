# WI-2128 verification

## Security red-green-revert

- RED: temporarily restored the pre-fix headerless resolution in `apps/api/src/middleware/profile-scope.ts` from caller-bound `getPersonScope(...)` to `findOwnerPersonScope(...)`, leaving the regression unchanged. The named integration case `resolves a headerless learner request to the learner Person` failed with expected HTTP 200 but received HTTP 403, reproducing the owner-substitution boundary.
- RESTORE: restored the exact production fix and reran the same named case against the local real database. It passed with HTTP 200 and the learner Person.
- COMPLETE GREEN: `pnpm exec jest --config tests/integration/jest.config.cjs tests/integration/wi2128-family-join-identity.integration.test.ts --runInBand --no-coverage --forceExit` succeeded for all 13 cases.

The disposable database was the repository-sanctioned `docker-compose.test.yml` instance on local port 5433. It was never a shared development or staging database.

## Proportional branch validation

| Surface | Command or scope | Result |
|---|---|---|
| Touched API suites | Jest `--runTestsByPath` for all 19 modified API test files with an explicit local `DATABASE_URL` | PASS |
| Touched mobile suites | Jest `--runTestsByPath` for the five modified mobile test files | PASS — 5 suites, 217 tests |
| API type safety | `pnpm exec nx run api:typecheck` | PASS |
| Mobile type safety | `pnpm exec tsc --noEmit` from `apps/mobile` | PASS |
| Changed-file lint | ESLint over every changed TypeScript and TSX file | PASS |
| Change-class routing | `scripts/check-change-class.sh --branch` | Identity-v2, API middleware/routes/services, and mobile source classes detected |
| Fast routed gate | `scripts/check-change-class.sh --branch --run --fast` | Eight routed commands passed; the API unit invocation refused to start because no explicit database URL was passed and inherited configuration pointed at shared staging |
| Full API unit rerun | Full API Jest suite with explicit local `DATABASE_URL` | PASS — 496 suites, 9,937 tests passed, 9 skipped |
| Diff hygiene | `git diff --check` plus conflict-marker scan | PASS |

The fast gate's API-unit refusal was a fail-closed environment guard, not a test assertion failure. The full API suite was rerun with an explicit sanctioned local database and succeeded for 496 suites and 9,937 tests, with 9 skipped.

## Baseline-only findings

- **WI-2892 — correct headerless profile-resolution documentation to caller Person:** `docs/architecture.md` still describes omitted `X-Profile-Id` as an `account.id` fallback, contradicting the login-bound caller-Person contract. Captured and admitted to BID-49 separately; no WI-2128 documentation expansion.
- **WI-2893 — initialize vector and pg_trgm extensions in the disposable test database:** a fresh temporary database required manual extension initialization before schema push. Captured separately; no WI-2128 scope expansion.
- **WI-2894 — make the API integration runner resolve Corepack on Windows:** the repository runner uses Node `spawnSync("corepack", ...)`, which returned `ENOENT` on Orion even though Corepack resolves from PowerShell. Captured separately; direct Jest execution supplied the same integration config for this verification.
- **WI-2896 — restore memory-dedup integration typecheck after the provider contract change:** repository-wide integration typecheck fails in untouched `tests/integration/memory-facts-dedup.integration.test.ts` because five fixtures omit the newly required `provider`. The file is byte-identical to `origin/main`; this memory-workstream drift is formally outside BID-49.

## Preservation and provenance

The inherited merge-forwarded implementation was preserved as commit `c14c23d11bf71c50842248039f0b625f898163dc` before this evidence pass. Its 32 tracked paths match the immutable pre-merge stash in 29 byte-identical files plus the three already-audited semantic merge files; the real-database regression and relocated root-cause plan are byte-identical to the stash, and `workitem.json` differs only by a final newline. The stash remains preserved until the published branch is verified.
