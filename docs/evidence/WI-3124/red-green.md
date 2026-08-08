# WI-3124 red/green receipt

Date: 2026-08-08  
Work item: WI-3124 — temporary pinned `production_worker` verifier exception

## RED

Before implementation, the production-specific contract tests were added to
`packages/database/scripts/verify-worker-db-role.test.mjs` and run with:

```text
node --test packages/database/scripts/verify-worker-db-role.test.mjs
```

Result: 3 expected failures. The production exception parser/export did not
exist, exact `production_worker` fingerprint acceptance did not exist, and the
protected workflows did not pass the production exception variable. Existing
staging tests remained green.

## GREEN

After implementing the production-only parser, exact-fingerprint allowance,
workflow propagation, and fail-closed negative cases, the same command passed:

```text
tests 26
pass 26
fail 0
```

The wider database-script surface was then run, including the native PostgreSQL
integration tests available in the environment:

```text
tests 255
pass 251
fail 0
skipped 4
```

The four skips are the suites' existing native-environment-dependent skips; no
executed test failed.

## Repository scripts gate on Orion

The exact `pnpm test:scripts` command completed with 72 of 79 suites passing
(1,256 passed tests, 3 skipped). Seven pre-existing shell-harness suites failed
only on Windows path/argv semantics:

- `scripts/e2e-ci-injection-and-smoke-gate.test.ts`
- `scripts/check-merge-invariant.test.ts`
- `scripts/safe-stash-pop.test.ts`
- `scripts/claude-review-scope-workflow.test.ts`
- `scripts/mobile-ci-public-env.test.ts`
- `scripts/pre-push-tests.test.ts`
- `scripts/mobile-fallback-ota.test.ts`

Representative failures were `/bin/bash` receiving a collapsed `C:\...` path,
Windows CRLF comparison differences, `.cmd` launcher resolution, and temporary
directory locks. None of those suites or their inputs changed in this work.
The three script suites that exercise this change were rerun together and
passed 71 tests with zero failures:

```text
scripts/check-github-workflow-security.test.ts
scripts/deploy-yml-assert-guard.test.ts
scripts/production-secret-sync-workflow.test.ts
```

Linux PR CI remains the authoritative full scripts gate.

## Covered failure modes

- exception configured outside production;
- exception value or live role name other than `production_worker`;
- any added, removed, or changed pinned managed-admin fingerprint capability;
- BYPASSRLS posture drift;
- direct superuser status or application-object ownership;
- missing propagation to a production verifier workflow step;
- regression of the existing staging-only exception contract.
