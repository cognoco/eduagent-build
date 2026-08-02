# WI-2899 verification

Generated on 2026-08-02 on Orion for **WI-2899 — Collapse
profile-operation authority listing to one bounded query**.

## Scope and implementation

- Final base revision: `812759793bb73e1586be6bd7cb5046c186513e8a`.
- Production path: `apps/api/src/services/identity-v2/profile-v2.ts`.
- Regression and authority matrix:
  `apps/api/src/services/identity-v2/profile-v2.integration.test.ts`.
- The organization-scoped Person/Membership query now evaluates Login presence
  and the caller-to-target active Guardianship edge as correlated `EXISTS`
  facts. JavaScript applies the unchanged authority rule: self, or an active
  guardian over an uncredentialed charge.
- The existing explicit `membership.organization_id = organizationId` and
  non-archived Person predicates remain the query boundary. No telemetry or
  route contract changed.

## Real-PostgreSQL red-green-revert

Every phase used the guarded `dev_integration` database runner and the query-
count test in the tracked integration suite.

| Phase | Production query | Roster query counts | Result |
| --- | --- | --- | --- |
| Baseline RED | Original per-member authority resolver | 1 → 7; 4 → 16; 6 → 22 | Failed against required `[6, 6, 6]` |
| Candidate GREEN | Compound membership/Login/Guardianship query | 1 → 6; 4 → 6; 6 → 6 | Passed |
| Production-only REVERT | Production file restored exactly to `origin/main`; new test retained | 1 → 7; 4 → 16; 6 → 22 | Failed with the original growth signature |
| Exact RESTORE | Candidate production diff restored | 1 → 6; 4 → 6; 6 → 6 | Passed |

The candidate production diff hash before the revert and after restoration was
identical: `8c71b2ac10f69021147c32336034ebd24a542708`.

The fixed six round trips are one bounded member/authority query, one bounded
active-edge query used to shape the Profile response, and the existing two
queries for each of the two consent purposes. Roster size no longer changes the
count.

## Authority and behavior verification

The real-database authority matrix covers and passes:

- the authenticated Person as self;
- an active guardian operating an uncredentialed charge;
- denial of a credentialed charge;
- denial of an unrelated same-organization Person;
- denial through a revoked Guardianship edge;
- exclusion of a Person without Membership; and
- exclusion of a Person in another organization, even with a cross-org edge.

The complete focused integration file passed 16/16 cases. Adjacent unit and
route tests passed 63/63 cases. API TypeScript checking completed successfully.
The existing route-test console output is pre-existing exercised error-path
logging; both suites passed without assertion failures.

## Full change-class verification

The first full `scripts/check-change-class.sh --run` invocation passed five of
six gates (TypeScript build, prompt-marker guard, API unit tests, Gemini runtime
ratchet, and test-only-export ratchet). Its API integration leg found that the
shared disposable `dev_integration` database predated the landed
`guardian_authority_redemptions` relation. A focused replay against a fresh,
revision-matched local PostgreSQL database passed the guardian-attachment suite
18/18, proving the failure was schema drift rather than this candidate.

The isolated database was then rebuilt with the same committed-migration path
used by CI: fresh `pgvector/pgvector:pg16`, `vector` and `pg_trgm` extensions,
`drizzle-kit migrate`, and the repository's local RLS isolation-role setup. This
also restored migration-only expression indexes, RLS policies, and country-policy
seed rows that a development `drizzle-kit push` intentionally does not create.
The four migration-contract suites passed 55/55 after that rebuild.

The complete API co-located integration corpus then passed on the migrated
database:

- 155 suites passed, 5 repository-defined suites skipped, 0 failed;
- 1,198 tests passed, 55 repository-defined tests skipped, 0 failed; and
- 0 snapshots, with a Jest-reported duration of 371.877 seconds.

While that run was active, `origin/main` advanced from
`14943d3e681dd55fdf1846b1fd96084f26508c2f` to the final base revision through
unrelated homework-route and mobile-screen changes. The branch rebased cleanly;
neither commit touched identity-v2 or database migrations. On the final base,
the focused real-database file passed 16/16 again, the adjacent unit/route set
passed 63/63, API TypeScript checking passed, targeted ESLint passed, and
`git diff --check` was clean.
