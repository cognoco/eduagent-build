# Cross-Account Leak Fix — Remaining Work

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status (2026-05-10):** Mobile-side fix already shipped. `apps/mobile/src/lib/sign-out.ts` (`signOutWithCleanup`) is the single sign-out entry point; `apps/mobile/src/lib/sign-out-callsite-registry.test.ts` ratchets against new direct `signOut()` callsites; `apps/mobile/src/lib/sign-out-cleanup.ts` wipes per-profile + global SecureStore keys including `mentomate_active_profile_id`; `apps/mobile/src/hooks/use-profiles.ts:28` keys the profiles query by `['profiles', userId]`. `signOutWithCleanup` resets api-client identity (`setActiveProfileId(undefined)`, `setProxyMode(false)`) and clears transition + pending-redirect state in addition to the query cache and SecureStore. The leak chain documented in `sign-out.ts:14-22` is closed.

**Remaining goal:** Add the server-side observability needed to (a) detect any future regression of this leak class and (b) attribute Jørn's reported May usage to the right mechanism before declaring the incident resolved.

**Architecture:** Server already 403s on `getProfile() === null` in `apps/api/src/middleware/profile-scope.ts:158-161` — a request whose `X-Profile-Id` doesn't belong to the authenticated account is rejected, never executed against the wrong profile. We only add a structured log on that branch so future occurrences are queryable in worker logs.

**Tech Stack:** Hono, Drizzle, Cloudflare Workers, Neon, Jest.

---

## Task 1: Server-side audit log for ownership mismatches

**Files:**
- Modify: `apps/api/src/middleware/profile-scope.ts:158-161`
- Test: `apps/api/src/middleware/profile-scope.test.ts` (extend existing)

The branch where `getProfile()` returns null already 403s. We add a `logger.warn('profile_scope.ownership_mismatch', { accountId, requestedProfileId })` on that branch so the next time a stale `X-Profile-Id` reaches the server it's visible in worker logs. The same file already logs `profile_scope.auto_resolve_failed` at line 125 via the module-level `logger = createLogger()` (line 15) — reuse that pattern.

- [x] **Step 1: Write the failing test**

Append to `apps/api/src/middleware/profile-scope.test.ts` (read the existing file first to match its harness — it already covers the 403 branch; add a `logger.warn` assertion alongside the existing `expect(res.status).toBe(403)`).

The assertion shape:

```ts
const warnSpy = jest.spyOn(logger, 'warn'); // or whatever the test harness exposes
// ... existing setup that sends X-Profile-Id from a different account ...
expect(res.status).toBe(403);
expect(warnSpy).toHaveBeenCalledWith(
  'profile_scope.ownership_mismatch',
  expect.objectContaining({
    accountId: <account A id>,
    requestedProfileId: <profile B id>,
  }),
);
```

Read `profile-scope.test.ts` for the actual logger import/spy pattern used in the existing 125-line `auto_resolve_failed` coverage and copy that.

- [x] **Step 2: Run test to verify it fails**

```
pnpm exec nx run api:test -- --testPathPattern=profile-scope
```

Expected: FAIL — `logger.warn` not called with `profile_scope.ownership_mismatch`.

- [x] **Step 3: Add the log line**

`apps/api/src/middleware/profile-scope.ts:158-161`:

```ts
const profile = await getProfile(db, profileIdHeader, account.id);
if (!profile) {
  logger.warn('profile_scope.ownership_mismatch', {
    accountId: account.id,
    requestedProfileId: profileIdHeader,
  });
  return forbidden(c, 'Profile does not belong to this account');
}
```

- [x] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

Use `/commit`.

---

## Task 2: Forensic verification of Jørn's May usage

**Why:** Jørn reported ~100 messages used in May despite not opening the app. The mobile fix closes the leak going forward, but doesn't tell us whether Jørn's specific counter was inflated by this leak vs. a separate cause (Clerk session fixation, server-side bug, shared device with him still signed in).

**Constraint:** `learning_sessions` (packages/database/src/schema/sessions.ts:99-153) stores only `profile_id`, not the requesting Clerk user — so we cannot answer "who initiated these requests" from the DB alone. The audit log from Task 1 is what makes attribution possible going forward; for the historical incident we have to reason from indirect evidence.

**Files:** None modified. Read-only forensic.

- [ ] **Step 1: Confirm Task 1 is deployed to production**

Verify the `profile_scope.ownership_mismatch` log appears in worker logs by triggering a known-bad request (e.g., from a staging account, send `X-Profile-Id` belonging to a different account and confirm the log entry surfaces in the production logging sink). Without confirming the log path works, Step 3 will return false negatives.

- [ ] **Step 2: Pull the relevant slice of `learning_sessions` for Jørn's profile**

Connect to production Neon read-only via Doppler (`C:/Tools/doppler/doppler.exe run -c prd -- psql "$DATABASE_URL"` — verify the exact config name from `doppler configs` first; it may be `prod`/`prd`/`production` depending on project setup):

```sql
SELECT
  s.id,
  s.profile_id,
  s.created_at,
  s.session_type,
  s.exchange_count,
  s.input_mode,
  p.account_id,
  a.clerk_user_id AS owning_clerk_user_id,
  a.email         AS owning_email
FROM learning_sessions s
JOIN profiles  p ON p.id = s.profile_id
JOIN accounts  a ON a.id = p.account_id
WHERE p.id = '<jørn-profile-id>'
  AND s.created_at >= '2026-05-01'
ORDER BY s.created_at;
```

This shows what was charged to Jørn's profile. It does NOT show who initiated the request — `learning_sessions` has no requesting-user column.

- [ ] **Step 3: Cross-reference with worker logs to identify request initiator**

For each row from Step 2 that Jørn says he didn't initiate, query the production worker logs (Cloudflare Logpush / Workers Logs depending on the project's sink — confirm with the deploy docs before running) for requests against `/v1/sessions` or `/v1/messages` whose request-time `account_id` differs from `accounts.id` of Jørn's profile. The audit log from Task 1 won't have fired retroactively, so for May data we rely on whatever request metadata the existing `request-logger.ts` middleware was emitting at the time.

If existing logs don't carry `account_id` + `profile_id` together for that window, attribution from logs alone is impossible — note that and proceed to Step 4.

- [ ] **Step 4: Decide attribution and document inline**

Add a `## Incident Findings` heading to this plan and record:
- The session count and date range observed for Jørn's profile in May.
- Whether worker-log evidence (a) confirms a different account initiated them, (b) confirms the same account, or (c) is inconclusive.
- The conclusion: leak-confirmed / leak-ruled-out / unknown.

- [ ] **Step 5: If the leak is confirmed (or attribution is unknown but Jørn's account was clearly not active), zero out the May counter**

Coordinate with the user before running any data correction. This is a manual operation — not automatable from this plan.

---

## Out of Scope

- **Mobile-side fixes** — already shipped. See `apps/mobile/src/lib/sign-out.ts`, `sign-out-cleanup.ts`, `sign-out-callsite-registry.test.ts`, `hooks/use-profiles.ts`.
- **Refactor of profile-scope middleware** — current behavior is correct; we add observability only.
- **Broader sweep of users whose counters may have been corrupted** — depends on Task 2's findings. If the leak attribution is confirmed, a separate operational task can use the `profile_scope.ownership_mismatch` log (going forward) and the `learning_sessions` join (for the May window) to enumerate affected accounts.

## Notes for reviewers

- The `profile_scope.ownership_mismatch` log will be quiet in steady state because the mobile fix is shipped, but expect a brief spike on the first sign-in cycle for devices that haven't yet run the new `signOutWithCleanup` (i.e. devices upgrading with stale `mentomate_active_profile_id` in SecureStore from a previous user). Don't set an alert threshold until ~7 days post-rollout.
- Keep the log at `warn`. `error` would page on what's a closed-class leak; `info` would get filtered out of standard log queries.
