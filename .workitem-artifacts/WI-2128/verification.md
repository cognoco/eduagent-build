# WI-2128 verification

## Security red-green-revert

- RED: temporarily restored the pre-fix headerless resolution in `apps/api/src/middleware/profile-scope.ts` from caller-bound `getPersonScope(...)` to `findOwnerPersonScope(...)`, leaving the regression unchanged. The named integration case `resolves a headerless learner request to the learner Person` failed with expected HTTP 200 but received HTTP 403, reproducing the owner-substitution boundary.
- RESTORE: restored the exact production fix and reran the same named case against the local real database. It passed with HTTP 200 and the learner Person.
- COMPLETE GREEN: `pnpm exec jest --config tests/integration/jest.config.cjs tests/integration/wi2128-family-join-identity.integration.test.ts --runInBand --no-coverage --forceExit` succeeded for all 16 cases.

## Fresh-factor authority-substitution correction

- RED: added the real-database case `[MANDATORY][WI-2128][BREAK] does not let fresh-factor proof substitute the learner caller for the owner Person` while the switch route still called `getPersonScope(db, profileId, account.id)` without the authenticated caller. The other 15 cases passed; this case alone returned HTTP 200 instead of the required 403.
- GREEN: passed `callerPersonId` as the fourth `getPersonScope` argument at the profile-switch capability boundary. Both the no-factor and fresh-factor learner-to-owner attempts now fail at caller authority with `FORBIDDEN`, before any elevation ceremony can be offered. The complete real-database suite passed 16/16.

The disposable database was the repository-sanctioned `docker-compose.test.yml` instance on local port 5433. It was never a shared development or staging database.

## Proportional branch validation

| Surface | Command or scope | Result |
|---|---|---|
| Touched API suites | Jest `--runTestsByPath` for all 19 modified API test files with an explicit local `DATABASE_URL` | PASS |
| Touched mobile suites | Jest `--runTestsByPath` for the five modified mobile test files plus the profile-request remount and Clerk-session regressions | PASS — 6 suites, 227 tests |
| Profile authority remount regression | Mounted `useProfiles`, awaited the authoritative response, then remounted it against the same QueryClient/user session | RED — 2 profile requests with `refetchOnMount: 'always'`; GREEN — 1 request with the per-session authority-refresh guard |
| Clerk session boundary regression | Changed the mocked Clerk `sessionId` for the same `userId` without replacing the QueryClient | PASS — the new session issued a second headerless authority refresh |
| Supportership-only profile boundary | Flag-ON `test-seed-v2-supporter.integration.test.ts` against the real local database | RED — stale fixture expected the supportee in the operate-as profile list; GREEN — 1 suite, 22 tests, with `/v1/profiles` restricted to the supporter while the separate cold-start assertion still returns the managed supportee card |
| API type safety | `pnpm exec nx run api:typecheck` | PASS |
| Mobile type safety | `pnpm exec tsc --noEmit` from `apps/mobile` | PASS |
| Changed-file lint | ESLint over every changed TypeScript and TSX file | PASS |
| Change-class routing | `scripts/check-change-class.sh --branch` | Identity-v2, API middleware/routes/services, and mobile source classes detected |
| Fast routed gate | `scripts/check-change-class.sh --branch --run --fast` | Eight routed commands passed; the API unit invocation refused to start because no explicit database URL was passed and inherited configuration pointed at shared staging |
| Full API unit rerun | Full API Jest suite with explicit local `DATABASE_URL` | PASS — 496 suites, 9,937 tests passed, 9 skipped |
| Diff hygiene | `git diff --check` plus conflict-marker scan | PASS |

The fast gate's API-unit refusal was a fail-closed environment guard, not a test assertion failure. The full API suite was rerun with an explicit sanctioned local database and succeeded for 496 suites and 9,937 tests, with 9 skipped.

## Review-bounce correction

- RED: middleware-level joined-learner regressions ran against the membership-only explicit-header branch. Both same-organization attacks installed the family owner or credentialed sibling context with HTTP 200, and the resolver call omitted the authenticated `callerPersonId`.
- GREEN: the explicit-header branch again supplies `callerPersonId` to the central operation-authority resolver. `profile-scope.test.ts` passed all 15 cases, including self and active guardian-to-uncredentialed-charge preservation, with denied telemetry categorized as `not-operable`.
- REAL DATABASE: `wi2128-family-join-identity.integration.test.ts` passed all 16 cases with identity-v2 flags enabled, including joined-learner owner/sibling denial, fresh-factor non-substitution, and guardian-managed-charge preservation.
- PROPORTIONAL: the combined profile-scope and profile-route API suites passed 69/69; mobile profile-refresh suites passed 47/47; API/mobile typecheck and lint targets passed with baseline warnings only.
- DIFF HYGIENE: removed the two trailing-space lines in `root-cause-trace-and-plan.md`; the combined branch-plus-worktree `git diff --check origin/main` passed.

## Merge-forward publication-gate correction

- RED: after merge-forwarding current `origin/main`, the full API unit gate ran 506 suites / 10,075 tests and isolated two failures in `profile-v2.test.ts`. Its legacy chain stub did not implement the new membership lookup's `.limit(1)` call, and its sibling expectation still assumed membership enumeration rather than caller-operable filtering.
- GREEN: the test double now models the membership and guardianship reads, and the sibling case asserts the security contract directly: a same-organization non-self Person is absent from the caller-operable profile list. The focused suite passed 9/9 with the explicit isolated local database URL.
- GOVERNED PUSH: the blocking pre-push hook then passed the 362-file merge-forward delta: TypeScript build; all affected schema, test-utils, retention, database, and API targets; routed LLM evaluation; and i18n checks. Commit `87463cbeaaf79d37a1b3752d2dc9aeb9b50b7aba` was published without bypass.
- CURRENT-MAIN RECONCILIATION: refreshed `origin/main` advanced to `b6fda67c49f263374a8c56859419607158201878`. The second merge-forward auto-composed the two overlapping test files with no conflict; post-merge unit verification passed 2 suites / 137 tests, the canonical Windows API integration runner passed the supporter canary 23/23, and the mandatory learner-Person real-database suite passed 16/16.
- PR COLLISION PREFLIGHT: open PR #2710 also touches `test-seed-v2-supporter.integration.test.ts`, but only separate shared-record artifact hunks. Its additions are compatible with and independent of the WI-2128 caller-operability assertion; current-main drift is zero and no other open PR overlaps the 46-file WI-2128 delta.

## AC-7 authority-boundary audit

- **Fresh web and native cold start:** a new QueryClient has no successful-refresh marker. A missing profile query always loads, and even a hydrated same-subject cache is revalidated on its first provider mount; `[WI-2128][BREAK] withholds cached owner capabilities until an authoritative profile refetch completes` proves that cached owner metadata cannot render through that boundary.
- **Same-user sign-out/sign-in:** the centralized `signOutWithCleanup` path synchronously clears the QueryClient before Clerk sign-out, while the refresh marker is also keyed by Clerk `sessionId`. The new-session regression proves that even if the QueryClient survives, a different Clerk session for the same `userId` triggers another headerless authority refresh.
- **Token refresh:** a JWT refresh inside one Clerk session preserves the same authenticated subject/Person authority; the server re-resolves that current token on every request. The marker is deliberately not keyed to short-lived JWT `iat`, which would recreate the request storm. Out-of-band family-join changes are revalidated at the actual client authority boundaries: web focus, native foreground, reconnect, or a new Clerk session.
- **Stale saved selection:** `[WI-2128] replaces a saved family-owner ID with the joined learner returned for that credential` proves the refreshed caller-operable list rejects the former owner selection and converges on the learner.
- **Omitted-header bootstrap:** `useProfiles` uses `useApiClient({ profileContext: 'omit' })` so only its profile-list authority requests omit active-profile and proxy context; concurrent profile-scoped clients retain their shared context. After the authoritative response, `ProfileProvider` validates the saved selection against the caller-operable list and repairs an invalid active selection or stale proxy state. The mandatory real-database regression proves an omitted header resolves from `callerPersonId` to the learner rather than the family owner.
- **Route remounts and failures:** the successful-refresh marker is written only after an HTTP-successful, schema-valid response. Route-driven provider remounts reuse that authoritative result, while failed refreshes remain unmarked and therefore eligible for retry at the next boundary.

## Baseline-only findings

- **WI-2892 — correct headerless profile-resolution documentation to caller Person:** `docs/architecture.md` still describes omitted `X-Profile-Id` as an `account.id` fallback, contradicting the login-bound caller-Person contract. Captured and admitted to BID-49 separately; no WI-2128 documentation expansion.
- **WI-2893 — initialize vector and pg_trgm extensions in the disposable test database:** a fresh temporary database required manual extension initialization before schema push. Captured separately; no WI-2128 scope expansion.
- **WI-2894 — make the API integration runner resolve Corepack on Windows:** the repository runner uses Node `spawnSync("corepack", ...)`, which returned `ENOENT` on Orion even though Corepack resolves from PowerShell. Captured separately; direct Jest execution supplied the same integration config for this verification.
- **WI-2896 — restore memory-dedup integration typecheck after the provider contract change:** repository-wide integration typecheck fails in untouched `tests/integration/memory-facts-dedup.integration.test.ts` because five fixtures omit the newly required `provider`. The file is byte-identical to `origin/main`; this memory-workstream drift is formally outside BID-49.
- **WI-2899 — collapse profile-operation authority listing to one bounded query:** the server-side `listProfilesV2` authority filter can issue multiple bounded lookups per profile. Captured, refined to Ready, and admitted to BID-49 as independent follow-up work.
- **WI-2900 — keep cached-profile sessions usable after transient authority refetch failures:** the authority refresh currently fails closed over cached profile data after a transient fetch error. Captured, refined to Ready, and admitted to BID-49 as independent follow-up work.
- **WI-2901 — scope authority-refresh loading to profiles that can confer proxy capability:** the `isProfilesFetching` loading barrier currently applies more broadly than the proxy-capability transition that requires it. Captured, refined to Ready, and admitted to BID-49 as independent follow-up work.

## Preservation and provenance

The inherited merge-forwarded implementation was preserved as commit `c14c23d11bf71c50842248039f0b625f898163dc` before this evidence pass. Its 32 tracked paths match the immutable pre-merge stash in 29 byte-identical files plus the three already-audited semantic merge files; the real-database regression and relocated root-cause plan are byte-identical to the stash, and `workitem.json` differs only by a final newline. The stash remains preserved until the published branch is verified.
