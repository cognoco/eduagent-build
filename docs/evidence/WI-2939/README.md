# WI-2939 disposable integration bootstrap evidence

This record preserves the operator-authorized development-only execution evidence for
WI-2939. It contains no credential, connection URL, raw environment value, staging or
production identifier, or copied user data.

## Authorization and stable target

The operator authorized recreation of the same disposable development database when
its Neon numeric database ID changed, provided every stable identity facet continued
to match. The executor verified these facets before each mutation and before the
canonical run:

| Facet | Verified value |
| --- | --- |
| Neon project | `lingering-violet-30592106` |
| Neon branch | `br-crimson-moon-agmi36va` |
| Neon endpoint | `ep-polished-fog-agrmhnnr` |
| Database | `eduagent_integration_wi2790_811f580999ce` |
| Owner role | `wi2939_integration` |
| Environment boundary | Disposable development only |

No other database or role mutation was invoked. Shared development databases,
staging, and production were excluded throughout.

## Revision boundary and failed-target cleanup

The first recreated target, safe database ID `4886158`, was bootstrapped at WI-2939's
landed revision `c5cc41fe64632b782f61fcb281bc05b41a1262b4`. The guarded bootstrap
reached `drizzle-kit push`, then deterministically failed during post-push replay:
that revision replayed historical RLS and policy statements for relations absent from
its Drizzle schema. The target was marked failed, the canonical Jest command was not
started, and the disposable target was deleted rather than repaired in place.

The prerequisite correction was already landed and independently Closed/Done as
WI-2996 in PR #2828 at
`55eb79c429235e3972801e3a3a5726d5c1483b40`. It guards stale historical replay
targets with relation-existence checks and preserves final policy alterations. The
successful proof therefore used that exact prerequisite revision; it did not redo or
silently patch the landed prerequisite.

## Successful recreation and bootstrap

The same logical target was recreated at safe database ID `4886176`:

- recreation started `2026-08-01T16:15:19.763Z` and completed
  `2026-08-01T16:15:20.329Z`;
- the authorized branch database count changed from eight to nine;
- the exact logical-target match count was one; and
- the stable project, branch, endpoint, database name, and owner role matched before
  and after creation.

The revision-pinned bootstrap then ran at
`55eb79c429235e3972801e3a3a5726d5c1483b40`:

- started `2026-08-01T16:16:17.199Z`;
- completed `2026-08-01T16:17:10.396Z`;
- action `bootstrapped`;
- exit code `0`;
- applied committed migration SQL only, followed by the guarded disposable schema
  push and bounded post-push replay; and
- ran no separate seed import, copied-user-data path, or `drizzle-kit migrate`.

## Exact canonical run

Exactly one authorized canonical invocation was consumed:

```text
corepack pnpm run test:api:integration
```

| Field | Result |
| --- | --- |
| Exact revision | `55eb79c429235e3972801e3a3a5726d5c1483b40` |
| Started | `2026-08-01T16:17:11.771Z` |
| Ended | `2026-08-01T16:39:19.544Z` |
| Exit | `0` |
| Nx target | `api:integration-api` succeeded |
| Suites | 150 passed, 0 failed, 6 skipped; 156 total |
| Tests | 1,141 passed, 0 failed, 52 skipped; 1,193 total |
| Snapshots | 0 total |
| Jest-reported duration | 1,318.534 seconds |
| Failed suite paths | None |
| Missing-relation failures | None |

After the run, a fresh read-only Neon inventory still contained exactly one matching
logical target at database ID `4886176`, with the same branch and owner. The branch
contained nine databases in total.

## Acceptance Criteria mapping

| Acceptance Criterion | Evidence |
| --- | --- |
| AC1 — revision-pinned disposable bootstrap, never migrate | PR #2741, PR #2809, `scripts/bootstrap-api-integration-schema.mjs`, and the successful bootstrap receipt below |
| AC2 — disposable non-protected target; forbidden targets fail closed | `packages/database/scripts/check-db-push-target.test.mjs`, `scripts/bootstrap-api-integration-schema.test.mjs`, and the stable-target preflight receipts below |
| AC3 — mutation-sensitive variants | `scripts/bootstrap-api-integration-schema.test.mjs` covers empty bootstrap, already-compatible idempotence, incompatible targets, forbidden endpoints, failed replay cleanup, relation-existence replay guards, and final policy alteration ordering |
| AC4 — explicit ruling and exact live-target boundary | authorization table plus prerequisite recreation and bootstrap receipts below |
| AC5 — canonical integration command completes without missing relations | exact one-run result above: 150 suites and 1,141 tests passed, zero failures |
| AC6 — no masking, shared-environment mutation, copied data, or migration | one canonical invocation, failed target destroyed rather than repaired, bootstrap data policy, zero failures, no retry or executor-added skip, and post-run identity check |

### Mutation-sensitive guard pointers

- `scripts/bootstrap-api-integration-schema.test.mjs` verifies the direct journal SQL,
  push, and post-push replay sequence and requires recreation after a synthetic
  post-push failure.
- The same test requires `to_regclass(...) IS NOT NULL` around replayed RLS and policy
  statements, so removing the WI-2996 prerequisite guard makes the named assertions
  fail.
- `packages/database/scripts/check-db-push-target.test.mjs` exercises production,
  staging, shared-development, and unauthorized bootstrap-sentinel refusals.

## Durable redacted receipts

The sanitized receipt payloads needed to audit AC1–AC6 are embedded below so they
remain available in every checkout. The source-file hashes retain the provenance of
the original local captures; the acceptance-criteria evidence does not depend on
access to those local files or to the large raw log.

| Local pointer | SHA-256 |
| --- | --- |
| `bootstrap-option1-cli-retry.json` | `528a2590c30016ca1f75009e0238f554f01f7648f288cec84b7e0d2f1bc2f1cf` |
| `bootstrap-option1-cli-retry.redacted.log` | `d6ccf1c274009eb35f6cbe083082fbe39e5da50ecf83903f9e10f1aed05fe803` |
| `option1-failed-target-cleanup.json` | `2cebe05069b31f1e1583390f1d6c758b37fda657b6a11153a97d0b4ff24fff1d` |
| `option1-prerequisite-recreation.json` | `597f19fed5674d42d8e48daa2cd407a606eaee159ecd4788f762053678b70eff` |
| `bootstrap-receipt-prerequisite.json` | `d3534b6325c3da1bde39b6f74b2f0fea863f1df12aac51ca91a11d25eb0a2c20` |
| `bootstrap-prerequisite.json` | `55f059aacb33c76bebb2a6100087291c5318d5f192df4356955db69228a218a0` |
| `bootstrap-prerequisite.redacted.log` | `f466927d32fd41e066469dae34618773b332c87a3cf0399d76108daea33f8ffc` |
| `full-canonical-rerun-start.json` | `6cd5d3c5c81be9a5af035b829093627cf6a24d1ca1a66188149bb7eba4fc5818` |
| `full-canonical-rerun.json` | `e135d90d585930ca80e219d11f5825381dd619de6a015b744b3f783e0b2dec00` |
| `full-canonical-rerun.redacted.log` | `5a3b5414c59fcf6c9068cdfda191c7b899151407090037d1f2d838b4f6faca50` |
| `full-canonical-rerun-normalized-summary.json` | `3d5dd1c6714a45b6004b4850b66d1a0192fbc4e5437cbe839e8eec3fac3902d2` |

The source archive was
`.workitem-artifacts/WI-2939-operational-evidence-20260801T1641Z.tar.gz`, SHA-256
`bb3a00154ff33a0e57c4f4599633c0779a72f2437331a749d0d67a421b96be7c`.
It is provenance only and is not required to audit the embedded evidence.

### Failed bootstrap and cleanup receipts

The first exact-revision bootstrap receipt records a fresh stable-identity preflight,
exit `1`, and no successful bootstrap action:

```json
{
  "schema": "zdx.wi2939.option1-bootstrap.v1",
  "workItem": "WI-2939",
  "invocation": "corepack pnpm run db:bootstrap:api-integration -- --revision <exact-head> --operator-ruling <ruling-ref> --receipt <receipt-path>",
  "exactRevision": "c5cc41fe64632b782f61fcb281bc05b41a1262b4",
  "startedAt": "2026-08-01T16:10:38.126Z",
  "endedAt": "2026-08-01T16:11:28.275Z",
  "exitCode": 1,
  "signal": null,
  "target": {
    "neonProjectId": "lingering-violet-30592106",
    "neonBranchId": "br-crimson-moon-agmi36va",
    "neonEndpointId": "ep-polished-fog-agrmhnnr",
    "neonDatabaseId": 4886158,
    "databaseName": "eduagent_integration_wi2790_811f580999ce",
    "ownerRole": "wi2939_integration"
  },
  "freshStableIdentityPreflightPassed": true,
  "bootstrapAction": null,
  "receipt": null,
  "output": ".workitem-artifacts/WI-2939/bootstrap-option1-cli-retry.redacted.log",
  "secretsPersisted": false
}
```

The corresponding sanitized terminal excerpt shows that schema push completed before
the bounded post-push phase returned failure:

```text
[✓] Pulling schema from database...
[✓] Changes applied
ELIFECYCLE Command failed with exit code 1.
```

The cleanup receipt proves that the failed disposable target was deleted and no
other database or role mutation was invoked:

```json
{
  "schema": "zdx.wi2939.failed-disposable-target-cleanup.v1",
  "workItem": "WI-2939",
  "startedAt": "2026-08-01T16:13:42.468Z",
  "completedAt": "2026-08-01T16:13:42.962Z",
  "result": "deleted-failed-disposable-target",
  "target": {
    "neonProjectId": "lingering-violet-30592106",
    "neonBranchId": "br-crimson-moon-agmi36va",
    "neonEndpointId": "ep-polished-fog-agrmhnnr",
    "neonDatabaseId": 4886158,
    "databaseName": "eduagent_integration_wi2790_811f580999ce",
    "ownerRole": "wi2939_integration"
  },
  "verification": {
    "databaseCountBefore": 9,
    "databaseCountAfter": 8,
    "logicalTargetMatchCountAfter": 0,
    "otherDatabaseOrRoleMutationInvoked": false
  },
  "reason": "Revision-pinned bootstrap marked the disposable target failed and mandated destroy/recreate; no in-place repair was attempted.",
  "secretsPersisted": false
}
```

### Successful recreation and bootstrap receipts

The authorized prerequisite recreation receipt preserves the exact revision, target,
database-count boundary, and non-mutation assertion:

```json
{
  "schema": "zdx.wi2939.prerequisite-recreation.v1",
  "workItem": "WI-2939",
  "startedAt": "2026-08-01T16:15:19.763Z",
  "completedAt": "2026-08-01T16:15:20.329Z",
  "exactRevision": "55eb79c429235e3972801e3a3a5726d5c1483b40",
  "result": "created",
  "prerequisite": {
    "workItem": "WI-2996",
    "landedCommit": "55eb79c429235e3972801e3a3a5726d5c1483b40"
  },
  "target": {
    "neonProjectId": "lingering-violet-30592106",
    "neonBranchId": "br-crimson-moon-agmi36va",
    "neonEndpointId": "ep-polished-fog-agrmhnnr",
    "neonDatabaseId": 4886176,
    "databaseName": "eduagent_integration_wi2790_811f580999ce",
    "ownerRole": "wi2939_integration"
  },
  "verification": {
    "databaseCountBefore": 8,
    "databaseCountAfter": 9,
    "exactLogicalTargetCountAfter": 1,
    "otherDatabaseOrRoleMutationInvoked": false
  },
  "secretsPersisted": false
}
```

The bootstrap tool's durable receipt records the revision, operator ruling,
fingerprints, data policy, and successful action:

```json
{
  "schema": "zdx.disposable-schema-bootstrap.v1",
  "workItem": "WI-2939",
  "targetId": "811f580999ce",
  "endpointFingerprint": "f0ca05e6457965df023f9c88d3eeb3b821f4c02a119a8a793f41b49592425bd7",
  "revision": "55eb79c429235e3972801e3a3a5726d5c1483b40",
  "chainFingerprint": "0aab8acfaf232c1e13a851beb56cd9f8ced7380c53997d59d5188a61bbd61f7b",
  "operatorRuling": "operator:BID-48/WI-2939:Option1-WI2996-landed-prerequisite",
  "action": "bootstrapped",
  "schemaFingerprint": "e0c713b33f5aed3a31c41cf866b46eb72221566f42b8ead5ba2a16f9af4f89e7",
  "startedAt": "2026-08-01T16:16:17.199Z",
  "completedAt": "2026-08-01T16:17:10.396Z",
  "cleanup": "Destroy the disposable target identified by endpointFingerprint; never migrate, repair, or copy data into shared development, staging, or production.",
  "dataPolicy": "Applied only revision-pinned committed migration SQL; no separate seed command or imported/copied user data."
}
```

Its invocation receipt independently records exit `0`, the stable-identity preflight,
and the same exact target:

```json
{
  "schema": "zdx.wi2939.option1-bootstrap.v1",
  "workItem": "WI-2939",
  "invocation": "corepack pnpm run db:bootstrap:api-integration -- --revision <exact-head> --operator-ruling <ruling-ref> --receipt <receipt-path>",
  "exactRevision": "55eb79c429235e3972801e3a3a5726d5c1483b40",
  "startedAt": "2026-08-01T16:16:16.462Z",
  "endedAt": "2026-08-01T16:17:10.451Z",
  "exitCode": 0,
  "signal": null,
  "target": {
    "neonProjectId": "lingering-violet-30592106",
    "neonBranchId": "br-crimson-moon-agmi36va",
    "neonEndpointId": "ep-polished-fog-agrmhnnr",
    "neonDatabaseId": 4886176,
    "databaseName": "eduagent_integration_wi2790_811f580999ce",
    "ownerRole": "wi2939_integration"
  },
  "freshStableIdentityPreflightPassed": true,
  "bootstrapAction": "bootstrapped",
  "receipt": ".workitem-artifacts/WI-2939/bootstrap-receipt-prerequisite.json",
  "output": ".workitem-artifacts/WI-2939/bootstrap-prerequisite.redacted.log",
  "secretsPersisted": false
}
```

The sanitized terminal excerpt agrees with the receipts:

```text
[✓] Pulling schema from database...
[✓] Changes applied
{"workItem":"WI-2939","targetId":"[REDACTED]","endpointFingerprint":"f0ca05e6457965df023f9c88d3eeb3b821f4c02a119a8a793f41b49592425bd7","revision":"55eb79c429235e3972801e3a3a5726d5c1483b40","action":"bootstrapped","receipt":".workitem-artifacts/WI-2939/bootstrap-receipt-prerequisite.json"}
```

### Canonical-run receipt

This normalized sanitized receipt preserves the complete canonical result and the
post-run target check in the tracked artifact:

```json
{
  "schema": "zdx.wi2939.full-canonical-rerun-normalized-summary.v1",
  "workItem": "WI-2939",
  "exactRevision": "55eb79c429235e3972801e3a3a5726d5c1483b40",
  "prerequisite": {
    "workItem": "WI-2996",
    "landedCommit": "55eb79c429235e3972801e3a3a5726d5c1483b40"
  },
  "invocation": "corepack pnpm run test:api:integration",
  "startedAt": "2026-08-01T16:17:11.771Z",
  "endedAt": "2026-08-01T16:39:19.544Z",
  "durationSecondsReportedByJest": 1318.534,
  "exitCode": 0,
  "suites": {
    "passed": 150,
    "failed": 0,
    "skipped": 6,
    "total": 156
  },
  "tests": {
    "passed": 1141,
    "failed": 0,
    "skipped": 52,
    "total": 1193
  },
  "snapshots": {
    "total": 0
  },
  "failedSuitePaths": [],
  "missingRelationFailures": 0,
  "nxTargetResult": "success",
  "bootstrap": {
    "action": "bootstrapped",
    "receipt": ".workitem-artifacts/WI-2939/bootstrap-receipt-prerequisite.json"
  },
  "target": {
    "neonProjectId": "lingering-violet-30592106",
    "neonBranchId": "br-crimson-moon-agmi36va",
    "neonEndpointId": "ep-polished-fog-agrmhnnr",
    "neonDatabaseId": 4886176,
    "databaseName": "eduagent_integration_wi2790_811f580999ce",
    "ownerRole": "wi2939_integration"
  },
  "postRunIdentity": {
    "databaseCountOnAuthorizedBranch": 9,
    "exactLogicalTargetCount": 1,
    "stableIdentityMatched": true
  },
  "evidence": {
    "rawMetadata": ".workitem-artifacts/WI-2939/full-canonical-rerun.json",
    "redactedOutput": ".workitem-artifacts/WI-2939/full-canonical-rerun.redacted.log",
    "startReceipt": ".workitem-artifacts/WI-2939/full-canonical-rerun-start.json"
  },
  "caveats": [
    "The repository declares Node 22.x; this Lancre invocation ran under Node 24.18.0 and emitted the engine warning, but the canonical command and Nx target exited 0.",
    "Jest used --forceExit through the repository's canonical remote integration configuration and emitted its standard open-handle advisory after all suites completed."
  ],
  "restrictions": {
    "canonicalInvocationCount": 1,
    "otherDatabaseOrRoleMutationInvoked": false,
    "stagingOrProductionTouched": false
  },
  "secretsPersisted": false
}
```

The sanitized terminal summary is consistent with the normalized receipt:

```text
NX   Successfully ran target integration-api for project api
Test Suites: 6 skipped, 150 passed, 150 of 156 total
Tests:       52 skipped, 1141 passed, 1193 total
Snapshots:   0 total
Time:        1318.534 s
Ran all test suites.
```

## Caveats

- The repository declares Node 22.x. This Lancre invocation ran under Node 24.18.0
  and emitted the package-engine warning, but the canonical command and Nx target
  exited `0`.
- The repository's canonical remote integration configuration uses Jest
  `--forceExit`; Jest emitted its standard open-handle advisory only after all suites
  completed.
- The six skipped suites and 52 skipped tests were reported by the canonical Jest
  configuration. No retry, timeout, or executor-added skip was used.
