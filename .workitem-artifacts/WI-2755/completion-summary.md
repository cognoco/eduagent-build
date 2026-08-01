What was done:

Corrected the profiles-dropped migration replay's connection selection for the `DATABASE_URL`-only case that bounced review. When that URL is a Neon pooled endpoint, scratch-database administration and replay now use the corresponding direct endpoint instead of leaving an idle PgBouncer backend that blocks the final `DROP DATABASE`.

What changed:

Added a small URL resolver used by the replay suite. It preserves an explicit `DIRECT_URL`, converts only Neon hostnames whose endpoint segment ends in `-pooler`, and leaves disposable local/CI PostgreSQL URLs unchanged. The existing drain-aware teardown remains responsible for closing the scratch pool, waiting for database backends to disappear, and issuing a normal `DROP DATABASE` without `FORCE`.

Verification:

The focused behavioral test was first run before the resolver existed and failed because the production module was missing. After implementation it passed. A deliberate mutation that returned the pooled URL reproduced the exact bad selection and failed the assertion; restoring the direct-endpoint conversion returned the suite to green. API typecheck passed. API lint passed with zero errors and only pre-existing warnings outside the touched files. The full API unit gate passed 506/506 suites, 10,124 assertions, and three snapshots, with 11 pre-existing skips. No database-backed local command was run because this host has no proven disposable PostgreSQL runtime.

Caveats / Follow-ups:

The DB-backed acceptance gate must run in pull-request CI, where the repository provisions disposable PostgreSQL services. The executor must not use the generated local environment because it identifies a shared Neon endpoint. This artifact prepares evidence for landing; lifecycle completion remains forbidden until the PR is merged and the landed commit is known.
