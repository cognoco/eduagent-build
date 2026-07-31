# WI-2739 red-green-revert-restore evidence

Generated 2026-07-31 for **WI-2739 — Transcript purge blind to summaries with a null generation timestamp and to sustained backlog above the daily cap**.

## Review finding addressed

The complete 2026-07-31 15:15Z global-review bounce contained one finding: the retained regression guard had been shown green at the landed revision, but there was no durable evidence that it had executed against the defective baseline, the candidate, a production-only revert, and the exact restore.

This evidence records that execution. It does not change production code or tests.

## Revisions and retained topology

- Current candidate at execution start: `2e84f0b6bae9958c7faeaae1f80c97744dd06c0a` (`origin/main`, branch `WI-2739-rgr-evidence`).
- Landed WI-2739 fix: `2a9d2724237f723055b2f32d32d20b51df2a5c70` (PR #2776 squash).
- Parent of the landed fix: `af603521d92fe03d1512a258f32aa8ffa297cf08`.
- The four current production blobs and five focused test blobs at `2e84f0b6…` are identical to those at the landed fix `2a9d2724…`.
- Claim identity verified and preserved through sanctioned same-owner renewal: `codex:consent-security:WI-2739-rgr-evidence`.

Production-only baseline/revert paths:

| Path | Parent blob | Candidate blob |
|---|---|---|
| `apps/api/src/inngest/functions/transcript-purge-cron.ts` | `45e56621c43dd4d0d5f18bfc2f4ca0510f8213a9` | `6373211203b6f25e1901c6feb3a02b49417f189e` |
| `apps/api/src/inngest/functions/transcript-purge-observe.ts` | `13ddd3dd12c75807b2357aebed580b96a78ce3c3` | `79598402ea97cb2e33b5c608af86fa2e9155b5af` |
| `apps/api/src/inngest/index.ts` | `61a29892ce11690b10fd9a0351a56a3bae3cbb1c` | `c241d89681641f451f99594f20a8e62f4b098c24` |
| `packages/schemas/src/inngest-events.ts` | `892ff055b36e57b5ff55b877249a5ffa29da1a8b` | `89ca2ce956d04604bbfa4ff1edfa2ef0eec19f0f` |

Retained focused tests, unchanged throughout all four phases:

| Path | Candidate blob |
|---|---|
| `apps/api/src/inngest/functions/transcript-purge-cron.test.ts` | `dea19d754e9b32d4827060aa5a5f837184423e96` |
| `apps/api/src/inngest/functions/transcript-purge-observe.test.ts` | `e037e8f66468f2ada5f8f18fddf2a787cb8b53dc` |
| `apps/api/src/inngest/functions/summary-regenerate.test.ts` | `13f3cc3710c9c1113d8180c0ffc50cd1265ab843` |
| `apps/api/src/services/transcript-purge.test.ts` | `fe69cecb659cf9c7f6f6715d3cfe30a773ac859f` |
| `packages/schemas/src/inngest-events.test.ts` | `46567b0d81a64d63484e626a5b3f2674a5686580` |

No narrower subset was used. Every phase ran the same four focused API suites plus the focused shared-schema suite: 5 suites and 106 tests total. This topology directly covers null-timestamp eligibility/remediation, bounded rotating pagination and wrap-around recovery, backlog signaling and the 100-record cap including the exact-capacity negative path, observer registration/validation, and consumer idempotency by Session ID.

## Commands

API command (`<phase-api-output>` was replaced with that phase's `/tmp/WI-2739-*.json` path):

```text
rtk env DATABASE_URL=postgresql://local:local@127.0.0.1:5432/mentomate_test pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage apps/api/src/inngest/functions/transcript-purge-cron.test.ts apps/api/src/inngest/functions/transcript-purge-observe.test.ts apps/api/src/inngest/functions/summary-regenerate.test.ts apps/api/src/services/transcript-purge.test.ts --json --outputFile=<phase-api-output>
```

The explicit loopback-only dummy URL prevents the shared unit-test setup from consulting ambient Doppler configuration; these focused suites mock their database boundary and do not contact that address.

Schema command (`<phase-schema-output>` was replaced with that phase's `/tmp/WI-2739-*.json` path):

```text
rtk pnpm exec jest --config packages/schemas/jest.config.cjs --runInBand --no-coverage packages/schemas/src/inngest-events.test.ts --json --outputFile=<phase-schema-output>
```

An initial attempted baseline API invocation without the explicit dummy URL exited 1 before test collection because the harness refused an ambient shared/staging Doppler fallback. It collected 0 tests, was not counted as RED, and its output was overwritten by the valid baseline run above.

## Phase results

| Phase | Production bytes | API result | Schema result | Combined result |
|---|---|---|---|---|
| Baseline RED | exact parent `af603521…` | exit 1; 2/4 suites passed; 42 passed, 13 failed | exit 1; 0/1 suites passed; 48 passed, 3 failed | expected RED: 2/5 suites and 90/106 tests passed; 16 named failures |
| Candidate GREEN | exact candidate `2e84f0b6…` | exit 0; 4/4 suites, 55/55 tests passed | exit 0; 1/1 suite, 51/51 tests passed | GREEN: 5/5 suites, 106/106 tests passed |
| Production-only REVERT | exact parent `af603521…`; candidate tests retained | exit 1; 2/4 suites passed; 42 passed, 13 failed | exit 1; 0/1 suites passed; 48 passed, 3 failed | expected REVERT failure: counts and all 16 failing names exactly equal baseline RED |
| Exact RESTORE | exact candidate `2e84f0b6…` | exit 0; 4/4 suites, 55/55 tests passed | exit 0; 1/1 suite, 51/51 tests passed | RESTORE: 5/5 suites, 106/106 tests passed |

Machine-readable normalized Jest outputs retain every test name and status:

- [`baseline-red-api.json`](baseline-red-api.json) and [`baseline-red-schemas.json`](baseline-red-schemas.json)
- [`candidate-green-api.json`](candidate-green-api.json) and [`candidate-green-schemas.json`](candidate-green-schemas.json)
- [`production-revert-api.json`](production-revert-api.json) and [`production-revert-schemas.json`](production-revert-schemas.json)
- [`exact-restore-api.json`](exact-restore-api.json) and [`exact-restore-schemas.json`](exact-restore-schemas.json)

The expected and observed failing set for both RED and REVERT was:

1. `transcriptPurgeCron [WI-2739] rotates a bounded remediation page across every stable stale-null row`
2. `transcriptPurgeCron [WI-2739] wires the rotating offset and wrap page into null-timestamp remediation`
3. `transcriptPurgeCron [BUG-189] computes cutoff INSIDE find-purge-candidates step.run for replay stability`
4. `transcriptPurgeCron [WI-2739] detects null summaryGeneratedAt rows past the delayed cutoff`
5. `transcriptPurgeCron queues purge workers and emits delayed alerts for blocked rows`
6. `transcriptPurgeCron [WI-2739] remediates a stale null timestamp independently of a full delayed page`
7. `transcriptPurgeCron [WI-2739] queues only daily capacity and emits an alertable over-cap backlog signal`
8. `transcriptPurgeCron [WI-2739] does not signal backlog at exact daily capacity`
9. `sessionPurgeDelayedObserve [BUG-369] [BREAK] emits a structured warn log with delayed count`
10. `sessionPurgeBacklogObserve [WI-2739] is registered as the listener for app/session.purge.backlog`
11. `sessionPurgeBacklogObserve [WI-2739] is included in the exported functions array`
12. `sessionPurgeBacklogObserve [WI-2739] logs the lower-bound backlog signal`
13. `sessionPurgeBacklogObserve [WI-2739] [BREAK] captures schema drift for a non-over-cap payload`
14. `retention SLO event schemas (BUG-991 / BUG-992 / BUG-993 / BUG-994) [BUG-993] accepts a valid sessionPurgeDelayedEvent payload`
15. `retention SLO event schemas (BUG-991 / BUG-992 / BUG-993 / BUG-994) [WI-2739] accepts an internally consistent purge backlog lower bound`
16. `retention SLO event schemas (BUG-991 / BUG-992 / BUG-993 / BUG-994) [WI-2739] rejects an inconsistent purge backlog deferred lower bound`

## Exact restoration and hygiene

Immediately before RESTORE verification, all four production files and all five retained tests matched their `2e84f0b6…` Git blobs, and `git diff --exit-code` over those nine paths exited 0. The final evidence-only diff and tracked-clean checks are recorded below after evidence validation.

Final evidence-freeze checks at 2026-07-31 15:28Z:

- Recomputed all nine working-tree blob IDs against the pinned candidate `2e84f0b6…`: exit 0; every production and test file matched exactly.
- Ran `git diff --exit-code` across the tracked worktree: exit 0; no tracked source, test, documentation, or configuration drift remained before evidence staging.
- Classified `git status --porcelain --untracked-files=all`: only `docs/evidence/WI-2739/` plus the pre-existing sanctioned `.workitem-artifacts/WI-2739/` lifecycle directory were present. The lifecycle artifacts were preserved and excluded from the commit.
- Parsed all eight normalized phase files with `jq empty`: exit 0.
- Compared baseline RED and production REVERT failure-name arrays and counts with `jq`: both API and schema arrays were exactly equal.
- Scanned the evidence directory for common cloud, GitHub, Slack, Notion, bearer-token, and private-key signatures: no matches. A URI-userinfo scan matched only the explicit loopback dummy `local:local@127.0.0.1`; it is non-secret test configuration. A separate absolute-home-path/email scan had no matches.
