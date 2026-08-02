# WI-2633 — dev `quota_pools` subscription orphans: execution evidence

Operator-authorized 2026-08-02 (SS-1 orchestrator session): Option A approved (delete the three
orphan rows), mutation authorized, Neon restore-branch creation authorized.

## Scope and blast radius

**Dev Neon branch only.** Migration `0129_m_repoint.sql` is a documented NO-OP on staging and
production — its own header records that the legacy tables were already dropped there out-of-band,
so the file "only has physical effect on dev/CI". **Staging and production were never connected to
and were not touched.** Every read and the mutation itself asserted
`neon.project_id = lingering-violet-30592106` and `neon.branch_id = br-weathered-silence-agw4on4x`
before doing anything; the mutation aborts on mismatch.

## Restore point (AC-3, first half)

`snapshot-marker.json` — no-compute Neon branch `br-rough-heart-ag22kigb`
(`wi2633-precheck-20260802`), parent `br-weathered-silence-agw4on4x` at LSN `0/31B53E00`,
created 2026-08-02T10:48:57Z, zero endpoints. Mirrors the `docs/evidence/WI-2487/` pattern.

## Before / after

| | before | after |
|---|---|---|
| `quota_pools` rows | 9 | 6 |
| orphans (no row in new `subscription`) | 3 | **0** |
| summed `used_this_month` / `used_today` | 0 / 0 | 0 / 0 |

The three orphans were `019d782a-ce22…`, `019dea4e-e828…`, `019df86f-0ddf…`. All three carried
`monthly_limit=100, daily_limit=10, used_this_month=0, used_today=0`, legacy `subscriptions.status
= expired`, and were referenced by nothing: `profile_quota_usage`, `subscription_payers`,
`top_up_credits` and `usage_events` were empty for them, and no FK targets `quota_pools.id`.
Cause was not a wrong id — each row's account exists in the new `organization` table, but that
organization has zero rows in the new `subscription` table.

Disposition rationale: repointing was impossible (no valid target); recreating the parent would
require inventing a `NOT NULL payer_person_id` that has no source in the legacy schema. Deletion
loses no usage data because all counters were zero.

## Files

- `snapshot-marker.json` — restore point
- `preflight.sql` / `preflight-results.json` — pre-mutation state (read-only transaction)
- `mutation.sql` / `mutation-result.json` — the guarded transaction and its committed result
- `postcheck.sql` / `postcheck-results.json` — AC-4 postchecks
- `rollback.sql` — reverse procedure
- `ac5-*.log` — AC-5 integration runs

## Guards that were active (AC-3, second half)

The mutation ran as ONE transaction that aborts on: wrong Neon project or branch; an orphan set
differing from the three expected ids; a delete count other than 3; any orphan remaining
afterwards. None fired.

## AC-4 postchecks

Zero orphans remain; the three deleted ids are absent; 6 rows intact and unchanged; total usage
across all remaining pools still 0 (no quota loss); **0 unvalidated FK constraints**.

Five live FKs still target the legacy parents. This is expected and is not a defect: re-pointing
them is migration `0129`'s job and `0129` has not been run. Per AC-6 it was deliberately NOT run
here — that requires independent confirmation that all catalog-derived target families are
compatible.

## AC-5 integration runs

Executed through the armed guard `scripts/run-api-integration.mjs` on the sanctioned
`dev_integration` route (canonical `pnpm test:api:integration --jest`). The guard refused three
earlier invocation shapes before Jest started; none was bypassed.

- quota / subscription / billing — `3 suites, 16 tests, all passed`, true exit 0.
- identity-v2 / deletion — 16 suites passed, **1 suite failed**:
  `guardian-attachment.integration.test.ts` (10 tests).

**That failure is unrelated to this work and pre-existing.** It ran against a different database
(`br-crimson-moon-agmi36va` / `eduagent_integration_wi2790_…`), not the mutated dev branch; the
suite contains zero references to `quota_pools`; and the root cause is a missing table —
`to_regclass('guardian_authority_redemptions')` returns null on that integration database, so its
schema is behind. `main` CI is green. Recorded as a separate finding, not a blocker here.

## Known deviation, disclosed for review

AC-3 requires "create and verify a no-compute restore marker **and freeze or exclude concurrent
dev writes**". The restore marker was created and verified. **Concurrent dev writes were NOT
frozen or excluded.** What partially substitutes: the mutation asserted the orphan set matched the
three expected ids and would have aborted on drift, so a concurrent write changing that set would
have stopped the delete rather than corrupting it. What that does not cover: a concurrent write
between preflight and mutation touching different rows, or mutating these rows in ways the
identity check would not detect. The operator was informed and elected to disclose the deviation
and let the independent reviewer rule on it rather than re-run the procedure. Narrowing the AC was
deliberately not done.
