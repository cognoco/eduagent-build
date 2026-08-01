# WI-2346 rework red-green-revert-restore evidence

Generated 2026-07-31 for **WI-2346 — durable deletion-teardown dead-letter
dispatch** after independent review found that writable `Error.name` values
could cross the three new handler boundaries into durable Inngest payloads.

## Scope and retained boundary

The rework covers only account deletion, subscription-store teardown, billing
alias merge, their shared terminal-failure schema contract, and the factual
launch-health runbook correction. The two pre-existing consent handlers and
schemas remain unchanged; **WI-2977 — privacy-minimize consent-revocation
dead-letter payloads** owns that separately deliverable work.

The branch began at current `origin/main` commit
`04ec2da6b00f925a51995331e74c260702f533c2`. Every phase used the same five
retained test blobs listed in [`phase-results.json`](phase-results.json). The
only files reverted between GREEN and REVERT were the three handler files, the
shared event-schema file, and the runbook.

Before publication, `origin/main` advanced by five disjoint commits to
`da7a1842066765796ed1f1a4ef988b13a5bd01a4`. None of the ten exercised
implementation or test files changed across that interval. The branch was
rebased without conflicts, then the focused suites and routed fast gate were
rerun on the publication base: 6 required gates passed, 0 failed, and the 2
slow database/integration suites were correctly skipped by change
classification. The historical mutation phases below remain tied to their
exact recorded base and blob hashes.

## Commands

API handler command:

```text
rtk env PATH=<Node-22-bin>:<system-path> DATABASE_URL=postgresql://local:local@127.0.0.1:5432/mentomate_test pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage --runTestsByPath apps/api/src/inngest/functions/account-deletion.test.ts apps/api/src/inngest/functions/billing-subscription-store-teardown.test.ts apps/api/src/inngest/functions/billing-alias-merge.test.ts --json --outputFile=<phase-api-output>
```

The explicit loopback-only dummy URL prevents the API unit harness from
consulting shared environment configuration. These focused suites mock their
database boundary and did not contact that address.

Shared-schema command:

```text
rtk env PATH=<Node-22-bin>:<system-path> pnpm exec jest --config packages/schemas/jest.config.cjs --runInBand --no-coverage --runTestsByPath packages/schemas/src/inngest-events.test.ts --json --outputFile=<phase-schema-output>
```

Runbook command:

```text
rtk env PATH=<Node-22-bin>:<system-path> pnpm exec jest --config scripts/jest.config.cjs --runInBand --no-coverage --runTestsByPath scripts/launch-health-alerts-runbook.test.ts --json --outputFile=<phase-runbook-output>
```

## Phase results

| Phase | Implementation bytes | Result |
|---|---|---|
| Baseline RED | exact `origin/main` implementations; retained candidate tests | 0/5 suites and 99/106 tests passed; the seven expected privacy/runbook assertions failed |
| Candidate GREEN | frozen candidate implementations and tests | 5/5 suites and 106/106 tests passed |
| Production-only REVERT | exact `origin/main` implementations; the same retained test blobs | 0/5 suites and 99/106 tests passed; the sorted seven-name failure set exactly equaled baseline RED |
| Exact RESTORE | every implementation and test blob matched the frozen candidate hashes | 5/5 suites and 106/106 tests passed |

The seven RED/REVERT assertions are:

1. account deletion emits a coarse dead-letter value for a malicious,
   overlong `Error.name` containing `alice@example.test`;
2. subscription-store teardown does the same;
3. billing alias merge does the same;
4. the account-deletion event schema rejects arbitrary or overlong
   `errorName`;
5. the subscription-store event schema does the same;
6. the billing-alias event schema does the same; and
7. the runbook groups the alert surface while distinguishing the three
   privacy-minimized teardown payloads from both still-raw consent payloads.

The normalized phase counts, exact assertion names, candidate blob hashes, and
raw Jest-output hashes are retained in
[`phase-results.json`](phase-results.json).

## Exact restoration

The implementation-only mutation used a path-scoped Git stash over exactly
five files. Both RED phases verified those files matched `origin/main`; the
tests remained present and byte-identical. After the final restore, all ten
working-tree blob hashes matched the frozen candidate values before the
RESTORE commands ran. No database, external provider, environment file,
deployment, or consent-handler/schema mutation occurred.
