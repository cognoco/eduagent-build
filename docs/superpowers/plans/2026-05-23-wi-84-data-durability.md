# WI-84 Data Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate WI-84 / WP-DATA: 11 DeepSec findings where deploys, background jobs, seed tooling, consent/account deletion, feedback retry, dictation results, or Neon pool lifecycle can lose data or durable work.

**Architecture:** Keep changes scoped to the flagged surfaces. Regulatory deletion and retry-critical background work must fail loudly when the durable handoff cannot be accepted; non-core telemetry remains best-effort. Dictation idempotency uses an expand/contract rollout: first add and populate `completionKey` without breaking old deployed Workers, then a follow-up contract migration can move the write conflict target from `(profileId,date,mode)` to `(profileId,completionKey)` so retries dedupe without collapsing legitimate same-day completions.

**Tech Stack:** TypeScript, Hono, Inngest v3, Drizzle ORM, Neon serverless, Jest, Nx, Cloudflare Workers, wrangler.toml.

---

## Sources

- Work package: WI-84, Notion page `3678bce9-1f7c-81ad-87d7-c6476c059780`
- DeepSec evidence: `.deepsec/data/eduagent-build/work/findings.json`
- Traceability: `.deepsec/data/eduagent-build/deepsec-to-wi-map.md`
- Repo rules: `AGENTS.md`, `docs/project_context.md`, `docs/architecture.md`

## File Map

- Modify `.github/workflows/deploy.yml`: remove normal deploy-time baseline execution.
- Modify `packages/database/src/deploy-baseline-guard.test.ts`: guard deploy workflow does not run `baseline-migrations.mjs`.
- Modify `apps/api/src/inngest/functions/consent-reminders.ts` and `.test.ts`: bind reminder run to consent generation and bail on stale runs.
- Modify `apps/api/src/routes/feedback.ts`, `apps/api/src/inngest/functions/feedback-delivery-failed.ts`, and their tests: carry the original bounded feedback payload through retry.
- Modify `apps/api/src/inngest/functions/weekly-self-reports.ts` and `.test.ts`: throw after fan-out send failure so Inngest retries.
- Modify `apps/api/wrangler.toml` and `apps/api/src/wrangler-config.test.ts`: require staging/production `IDEMPOTENCY_KV` binding in committed worker config.
- Modify `apps/api/src/routes/account.ts` and `.test.ts`: dispatch account deletion as core durable work, not `safeSend`.
- Modify `apps/api/src/services/consent.ts` and `.test.ts`; consider `apps/api/src/routes/consent-web.integration.test.ts`: make denial status transition and profile deletion one transaction.
- Modify `apps/api/src/services/test-seed.ts`, `.test.ts`, and possibly `apps/api/src/routes/test-seed.test.ts`: only mutate/reset durable seed-marked accounts.
- Modify `packages/schemas/src/dictation.ts`, `packages/database/src/schema/dictation.ts`, `packages/database/src/repository.ts`, `apps/api/src/services/dictation/result.ts`, `apps/api/src/routes/dictation.ts`, related tests, and add a Drizzle migration + rollback note: add `completionKey` idempotency.
- Modify `packages/database/src/client.ts`, `packages/database/src/client.test.ts`, `apps/api/src/inngest/helpers.ts`, and helper tests: make Neon pool caching explicit opt-in and keep Worker/Inngest paths uncached.

## Task 1: DS-008 / WI-97 - Normal Deploy Must Not Baseline New Migrations

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `packages/database/src/deploy-baseline-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Add this assertion to `packages/database/src/deploy-baseline-guard.test.ts`:

```ts
it('[WI-84 DS-008] normal deploy workflow does not run baseline-migrations before migrate', () => {
  const workflow = readFileSync(
    resolve(__dirname, '../../../.github/workflows/deploy.yml'),
    'utf8',
  );

  expect(workflow).not.toMatch(/Baseline migration journal/);
  expect(workflow).not.toMatch(/baseline-migrations\.mjs/);
  expect(workflow).toMatch(/pnpm exec drizzle-kit migrate/);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest packages/database/src/deploy-baseline-guard.test.ts --runInBand --no-coverage`

Expected: FAIL because `deploy.yml` still contains the `Baseline migration journal` step and runs `node scripts/baseline-migrations.mjs`.

- [ ] **Step 3: Implement GREEN**

Delete only the `Baseline migration journal (push→migrate transition)` step from `.github/workflows/deploy.yml`. Leave `packages/database/scripts/baseline-migrations.mjs` in place as a manual repair tool.

- [ ] **Step 4: Verify GREEN**

Run the same Jest command. Expected: PASS.

## Task 2: DS-021 / WI-110 - Stale Consent Reminder Runs Must Bail

**Files:**
- Modify: `apps/api/src/inngest/functions/consent-reminders.ts`
- Modify: `apps/api/src/inngest/functions/consent-reminders.test.ts`
- Likely modify: consent request producer if the event payload lacks `requestedAt` or consent row id.

- [ ] **Step 1: Write the failing tests**

Add tests that execute `consentReminder` with event data `{ profileId, requestedAt: '2026-05-01T00:00:00.000Z' }` while mocked live consent state has `requestedAt: '2026-05-20T00:00:00.000Z'`.

Assertions:

```ts
expect(mockSendEmail).not.toHaveBeenCalled();
expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
```

Add the positive sibling where live `requestedAt` matches event `requestedAt`, and assert existing reminder/delete behavior still runs.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/inngest/functions/consent-reminders.test.ts --runInBand --no-coverage`

Expected: stale-run test FAILS because current code checks only current status.

- [ ] **Step 3: Implement GREEN**

Extend the consent requested event payload with `requestedAt` or `consentStateId`. In `consent-reminders.ts`, create a helper like:

```ts
async function loadMatchingConsentRun(db: Database): Promise<ConsentRun | null> {
  const row = await db.query.consentStates.findFirst({
    where: eq(consentStates.profileId, profileId),
    orderBy: desc(consentStates.requestedAt),
  });
  if (!row) return null;
  if (event.data.requestedAt && row.requestedAt?.toISOString() !== event.data.requestedAt) {
    return null;
  }
  return row;
}
```

Use that helper before every reminder and before auto-delete. Do not send reminder emails or delete if the latest row no longer matches the event generation.

- [ ] **Step 4: Verify GREEN**

Run the consent reminder test command. Then grep producers:

`rg -n "app/consent.requested|consent.requested" apps/api/src`

Ensure every producer includes the generation field.

## Task 3: DS-023 / WI-112 and DS-063 / WI-152 - Feedback Retry Must Carry Original Submission

**Files:**
- Modify: `apps/api/src/routes/feedback.ts`
- Modify: `apps/api/src/routes/feedback.test.ts`
- Modify: `apps/api/src/inngest/functions/feedback-delivery-failed.ts`
- Modify: `apps/api/src/inngest/functions/feedback-delivery-failed.test.ts`

- [ ] **Step 1: Write route RED test**

Change the existing route dispatch assertion to expect the bounded original delivery payload:

```ts
expect(inngest.send).toHaveBeenCalledWith({
  name: 'app/feedback.delivery_failed',
  data: expect.objectContaining({
    profileId: 'profile-bug767-fail',
    category: 'bug',
    message: 'Crash on launch',
    userId: 'user-bug767-fail',
    supportTo: 'support@mentomate.com',
    metaLines: expect.stringContaining('Profile ID: profile-bug767-fail'),
  }),
});
```

- [ ] **Step 2: Write worker RED test**

Add an Inngest worker test with payload containing `message`, `supportTo`, `userId`, `appVersion`, `platform`, and `osVersion`; assert `sendEmail` body contains the original message and metadata, not `[Delayed delivery]`.

- [ ] **Step 3: Verify RED**

Run:

`pnpm exec jest apps/api/src/routes/feedback.test.ts apps/api/src/inngest/functions/feedback-delivery-failed.test.ts --runInBand --no-coverage`

Expected: FAIL because payload schema and worker body currently include only `profileId` and `category`.

- [ ] **Step 4: Implement GREEN**

Extend the worker schema with bounded string fields. Reuse the already validated `feedbackSubmissionSchema` output from the route, not raw request JSON. On initial send failure, include the exact message, category, user id, support recipient, and metadata already used for the first send. In the worker, reconstruct the same support email body and subject.

- [ ] **Step 5: Verify GREEN**

Run the two Jest files again. Expected: PASS.

## Task 4: DS-038 / WI-127 - Weekly Self-Report Fan-Out Must Retry Failed Batches

**Files:**
- Modify: `apps/api/src/inngest/functions/weekly-self-reports.ts`
- Modify: `apps/api/src/inngest/functions/weekly-self-reports.test.ts`

- [ ] **Step 1: Write RED test**

Add a cron test where `step.sendEvent` rejects once:

```ts
await expect((weeklySelfReportCron as any).fn({ step })).rejects.toThrow(
  'weekly-self-report-cron-fan-out failed to queue 1 batch',
);
expect(mockCaptureException).toHaveBeenCalled();
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/inngest/functions/weekly-self-reports.test.ts --runInBand --no-coverage`

Expected: FAIL because the handler returns `{ status: 'partial' }`.

- [ ] **Step 3: Implement GREEN**

Let `sendBatchedEvents` capture context, then throw after any failed batch. Keep successful batch counts in the thrown error context if useful, but do not return `partial` from cron/backfill callers.

- [ ] **Step 4: Verify GREEN**

Run the weekly self-report Jest file. Expected: PASS.

## Task 5: DS-042 / WI-131 - Staging/Production Must Declare IDEMPOTENCY_KV Binding

**Files:**
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/src/wrangler-config.test.ts`

- [ ] **Step 1: Write RED test**

Add tests that parse `[env.staging]` and `[env.production]` KV blocks and require `binding = "IDEMPOTENCY_KV"` for both.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/wrangler-config.test.ts --runInBand --no-coverage`

Expected: FAIL because both env blocks currently comment out `IDEMPOTENCY_KV`.

- [ ] **Step 3: Implement GREEN**

Add committed staging and production `[[env.*.kv_namespaces]]` entries for `IDEMPOTENCY_KV` using the correct Cloudflare namespace ids if known in repo/Doppler. If ids are not discoverable non-interactively, do not invent ids; instead add a deploy-time config guard that fails before Worker deploy when the env-specific binding is absent and document the external Doppler/Cloudflare prerequisite.

- [ ] **Step 4: Verify GREEN**

Run the wrangler config test. Also run `pnpm exec nx run api:build` if wrangler config changed materially.

## Task 6: DS-045 / WI-134 - Account Deletion Dispatch Is Core

**Files:**
- Modify: `apps/api/src/routes/account.ts`
- Modify: `apps/api/src/routes/account.test.ts`

- [ ] **Step 1: Write RED test**

Replace the existing dispatch-failure expectation for `/account/delete`:

```ts
it('[WI-84 DS-045] returns 503 and does not claim deletion scheduled when Inngest dispatch fails', async () => {
  (inngest.send as jest.Mock).mockRejectedValueOnce(new Error('Inngest unavailable'));

  const res = await app.request('/v1/account/delete', { method: 'POST', headers: makeAuthHeaders() }, TEST_ENV);

  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/routes/account.test.ts --runInBand --no-coverage`

Expected: FAIL because current route uses `safeSend` and returns 200.

- [ ] **Step 3: Implement GREEN**

Remove `safeSend` from the deletion path. Use direct `await inngest.send(...)`; if it throws, return a typed 503 and do not say the deletion job is scheduled. If rollback is possible in `scheduleDeletion`, add a compensating clear or move scheduling and dispatch behind a service that records an observable pending state.

- [ ] **Step 4: Verify GREEN**

Run the account route test. Then run `rg -n "safeSend\\(|core-send" apps/api/src/routes/account.ts apps/api/src/services/deletion.ts`.

## Task 7: DS-056 / WI-145 - Consent Denial Status and Profile Delete Are Atomic

**Files:**
- Modify: `apps/api/src/services/consent.ts`
- Modify: `apps/api/src/services/consent.test.ts`
- Optional integration: `apps/api/src/routes/consent-web.integration.test.ts`

- [ ] **Step 1: Write RED tests**

Add service tests proving denial uses `db.transaction` and that a simulated profile-delete failure rejects without a committed terminal status. Mock transaction should call the callback with a tx object whose `delete(...).where(...)` rejects; assert outer call rejects and top-level `db.update` was not called outside the transaction.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/services/consent.test.ts --runInBand --no-coverage`

Expected: FAIL because current code updates first and deletes in a separate operation.

- [ ] **Step 3: Implement GREEN**

Move token lookup, terminal replay guard, conditional status update, and denial delete into one `db.transaction`. For approval, the transaction updates only the consent row. For denial, the same tx updates `consentStates` and deletes `profiles`.

- [ ] **Step 4: Verify GREEN**

Run the consent service tests. If existing integration coverage has token denial flow, run `pnpm exec jest apps/api/src/routes/consent-web.integration.test.ts --runInBand --no-coverage` with DB env available.

## Task 8: DS-091 / WI-180 - Test Seed Must Only Mutate Seed-Marked Accounts

**Files:**
- Modify: `apps/api/src/services/test-seed.ts`
- Modify: `apps/api/src/services/test-seed.test.ts`
- Possibly modify: `apps/api/src/routes/test-seed.test.ts`

- [ ] **Step 1: Write RED tests**

Add tests for:

```ts
// Existing Clerk user with external_id null must cause seedScenario to reject.
// resetDatabase({ prefix }) must delete only accounts whose clerkUserId starts with SEED_CLERK_PREFIX.
// resetDatabase({ clerkUserIds: ['user_real'] }) must not delete DB rows for non-seed Clerk ids.
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec jest apps/api/src/services/test-seed.test.ts apps/api/src/routes/test-seed.test.ts --runInBand --no-coverage`

Expected: FAIL because existing users are patched/tagged and reset can use arbitrary `user_` ids / prefix.

- [ ] **Step 3: Implement GREEN**

In `createClerkTestUser`, if `findClerkUserByEmail` returns a user whose `external_id` does not start with `clerk_seed_`, throw a clear error and do not PATCH password, `external_id`, or `bypass_client_trust`. In DB cleanup, constrain deletes to accounts with local seed marker (`accounts.clerkUserId LIKE 'clerk_seed_%'`) or Clerk ids verified as seed-created; never trust `user_` as seed marker.

- [ ] **Step 4: Verify GREEN**

Run the test-seed Jest files. For API behavior changes, also run `pnpm exec jest apps/api/src/routes/test-seed.test.ts --runInBand --no-coverage`.

## Task 9: DS-115 / WI-204 - Dictation Completion Key Expand Step

**Files:**
- Modify: `packages/schemas/src/dictation.ts` and `.test.ts`
- Modify: `packages/database/src/schema/dictation.ts`
- Modify: `packages/database/src/repository.ts`
- Modify: `apps/api/src/services/dictation/result.ts`
- Modify: `apps/api/src/routes/dictation.ts` and `.test.ts`
- Modify: `apps/api/src/services/dictation/result.integration.test.ts`
- Add: new `apps/api/drizzle/0092_*` migration SQL and rollback doc

**Rollout note:** This PR must be the expand step only. Production migrations run before the Worker deploy, so dropping `uniq_dictation_results_profile_date_mode` in the same deploy would break the old compiled Worker, whose insert still uses `ON CONFLICT (profile_id,date,mode)`. Keep that unique index and the repository conflict target in this PR. Follow-up #394, after this Worker is deployed everywhere, should drop the legacy unique index, add a non-unique read index if needed, and switch the repository conflict target to `(profileId, completionKey)`.

- [ ] **Step 1: Write RED schema/route tests**

Add `completionKey` to `recordDictationResultInputSchema` as required UUID or bounded opaque string. Tests should fail until schema accepts and route forwards it to `recordDictationResult`.

- [ ] **Step 2: Write RED integration test**

Add rollout-safe integration coverage:

```ts
const first = await recordDictationResult(db, profileId, { localDate: today, mode: 'homework', completionKey: keyA, ... });
const second = await recordDictationResult(db, profileId, { localDate: today, mode: 'homework', completionKey: keyB, ... });
expect(rows).toHaveLength(1);
expect(second.id).toBe(first.id);

const retry = await recordDictationResult(db, profileId, { localDate: today, mode: 'homework', completionKey: keyA, ...updated });
expect(retry.id).toBe(first.id);
```

- [ ] **Step 3: Verify RED**

Run:

`pnpm exec jest packages/schemas/src/dictation.test.ts apps/api/src/routes/dictation.test.ts --runInBand --no-coverage`

Run integration only if DB env is available:

`pnpm exec jest apps/api/src/services/dictation/result.integration.test.ts --runInBand --no-coverage`

Expected: FAIL because no `completionKey` exists yet.

- [ ] **Step 4: Implement GREEN**

Add `completion_key` to `dictation_results`, backfill existing rows with the same deterministic legacy key used by omitted-key clients, set a database default for old Worker inserts during the migration-to-deploy window, and create the new unique `(profile_id, completion_key)` index. Preserve `uniq_dictation_results_profile_date_mode` and the repository's legacy conflict target until the contract follow-up. Update mobile/API schema callers so clients can generate and submit a stable per-completion UUID; the server stores the key now even though same-day same-mode distinction is gated on the later contract step.

- [ ] **Step 5: Verify GREEN**

Run schema, route, and dictation integration tests. Then run `pnpm exec nx run api:typecheck`.

## Task 10: DS-228 / WI-317 - Neon Pool Caching Must Be Explicit Opt-In and Inngest-Safe

**Files:**
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/client.test.ts`
- Modify: `apps/api/src/inngest/helpers.ts`
- Add/modify: `apps/api/src/inngest/helpers.test.ts` if no direct coverage exists

- [ ] **Step 1: Write RED database tests**

Change client tests so `createDatabase(NEON_DSN_A)` twice does not populate `__internal_neonPoolCache` unless `{ cacheNeonPool: true }` is passed. Add explicit opt-in cache-hit test.

- [ ] **Step 2: Write RED Inngest helper test**

Mock `@eduagent/database` and assert `getStepDatabase()` calls:

```ts
expect(createDatabase).toHaveBeenCalledWith(url, { cacheNeonPool: false });
```

- [ ] **Step 3: Verify RED**

Run:

`pnpm exec jest packages/database/src/client.test.ts apps/api/src/inngest/helpers.test.ts --runInBand --no-coverage`

Expected: FAIL because default currently caches and helper passes no options.

- [ ] **Step 4: Implement GREEN**

Change `createDatabase` so Neon cache is used only when `options.cacheNeonPool === true`. Keep API request middleware's explicit `{ cacheNeonPool: false }`. Update Inngest helper to pass `{ cacheNeonPool: false }`; consider dropping module-level DB caching for Neon URLs if it still reuses a request-context-bound handle across function executions.

- [ ] **Step 5: Verify GREEN**

Run the database and Inngest helper tests.

## Task 11: Bundle Validation, DeepSec Recurrence Sweep, and Commit

**Files:**
- All modified files from Tasks 1-10.

- [ ] **Step 1: Run focused tests**

Run all touched unit tests:

```bash
pnpm exec jest \
  packages/database/src/deploy-baseline-guard.test.ts \
  packages/database/src/client.test.ts \
  packages/schemas/src/dictation.test.ts \
  apps/api/src/wrangler-config.test.ts \
  apps/api/src/inngest/functions/consent-reminders.test.ts \
  apps/api/src/inngest/functions/feedback-delivery-failed.test.ts \
  apps/api/src/inngest/functions/weekly-self-reports.test.ts \
  apps/api/src/routes/account.test.ts \
  apps/api/src/routes/feedback.test.ts \
  apps/api/src/routes/dictation.test.ts \
  apps/api/src/routes/test-seed.test.ts \
  apps/api/src/services/consent.test.ts \
  apps/api/src/services/test-seed.test.ts \
  --runInBand --no-coverage
```

- [ ] **Step 2: Run required integration tests**

Run affected integration tests that touch DB behavior:

```bash
pnpm exec jest apps/api/src/services/dictation/result.integration.test.ts --runInBand --no-coverage
pnpm exec jest apps/api/src/routes/consent-web.integration.test.ts --runInBand --no-coverage
pnpm exec jest tests/integration/account-deletion.integration.test.ts --runInBand --no-coverage
```

If `DATABASE_URL` is unavailable because `pnpm run env:sync` could not configure Doppler in the worktree, record the exact failure and run the non-DB unit coverage; do not mark integration coverage complete.

- [ ] **Step 3: Run broad validation**

Run:

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
pnpm exec nx run @eduagent/database:test
pnpm exec nx run @eduagent/schemas:test
```

- [ ] **Step 4: Re-scan recurrence classes**

Run local structural sweeps:

```bash
rg -n "baseline-migrations\.mjs|Baseline migration journal" .github/workflows packages
rg -n "safeSend\(" apps/api/src/routes/account.ts apps/api/src/services/deletion.ts
rg -n "feedback\.delivery_failed" apps/api/src
rg -n "onConflictDoUpdate|uniq_dictation_results_profile_date_mode|completionKey|completion_key" apps/api/src packages apps/api/drizzle
rg -n "cacheNeonPool" apps/api/src packages/database/src
```

Interpret results against WI-84 requirements, not just absence/presence.

- [ ] **Step 5: Commit with `/commit` workflow**

Load `.agents/skills/commit/SKILL.md`. Stage only WI-84 files. Include the required Verified-By table in the commit message per the commit skill.

- [ ] **Step 6: Adversarial review loop**

Use a subagent to review the final diff against the 11 DeepSec findings. Fix valid critical/high/medium findings and repeat until the review is clean.

- [ ] **Step 7: PR and CI**

Open a PR from branch `WI-84`. Monitor `gh pr checks`, automated review comments, and unresolved PR review findings. Green PR definition: CI passes and no valid critical/high/medium findings remain.

## Self-Review

- Spec coverage: all 11 child items are mapped to Tasks 1-10, with bundle validation in Task 11.
- Placeholder scan: no task is intentionally deferred; Task 5 has one external-state branch because real Cloudflare KV namespace ids may not be present in repo/Doppler.
- Type consistency: `completionKey` is the API/domain property, `completion_key` is the DB column.
- Rollout split: DS-115's schema/client expand step ships here. The same-day same-mode behavior remains blocked by the preserved legacy unique index until tracked follow-up #394 runs after the new Worker is deployed.
- Risk: this is a broad P1 bundle. If implementation becomes too large for one PR, split only after preserving traceability and getting explicit approval because WI-84 Definition of Done is work-package-level.
