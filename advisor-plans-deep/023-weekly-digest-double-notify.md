# Plan 023: Stop a swallowed log-write from double-notifying the parent

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/notifications.ts apps/api/src/inngest/functions/weekly-progress-push.ts`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `8c049b93f`, 2026-07-13
- **Audit finding**: #8

## Why this matters

The weekly digest uses `notification_log` rows as its **dedup ledger**: the push
step writes a row, and the email step later reads the row count to decide whether
the parent has already been told. Push is the preferred channel; email is the
fallback.

`sendPushNotification` breaks that ledger. When the push **succeeds** but the
subsequent `logNotification` write **fails**, it swallows the error and returns
`{ sent: true, ticketId, reason: 'log_write_failed' }`. The push went out. No row
was written.

The email step then re-reads the count, sees **0**, concludes "push must not have
gone out", and **sends the email too**. The parent gets both a push and an email
for the same digest.

What makes this unusually clear-cut is that **the code documents the exact
invariant it violates**. The email step's own comment says:

> *"The push step runs first; if it sent, its log makes this count > 0 and the
> email is suppressed (push preferred). If push was skipped/failed (no log
> written), the email still goes out as the fallback channel."*

"If push sent → a log row exists" is stated as a fact. `notifications.ts` has a
path where push sent and no log row exists. The email step's inference —
"count == 0, therefore push didn't send" — is then simply wrong.

Note this is *not* a case of a missing escalation: the failure **is** logged and
**is** sent to Sentry (BUG-688 did that deliberately, and correctly). The bug is
the **return value**. It reports success to a caller whose dedup contract depends
on a side effect that did not happen.

## Current state

### The swallow

`apps/api/src/services/notifications.ts:210-229`:

```ts
  if (!options?.skipRateLimitLog && payload.type !== 'store_cancel_nudge') {
    try {
      await logNotification(db, payload.profileId, payload.type, ticketId);
    } catch (err) {
      logger.error('[push] log write failed after successful send', {
        event: 'notification.push.db_error',
        profileId: payload.profileId,
        type: payload.type,
        ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        profileId: payload.profileId,
        tags: { surface: 'push_notification', reason: 'db_error' },
        extra: { ticketId, type: payload.type },
      });
      // Push was delivered; surface success to the caller but with a reason
      // tag so tests/observability can detect the divergence.
      return { sent: true, ticketId, reason: 'log_write_failed' };
    }
  }

  return { sent: true, ticketId };
}
```

The `reason: 'log_write_failed'` tag was added **precisely so callers could detect
this divergence**. No caller does.

### The comment above it, stating the intent

`apps/api/src/services/notifications.ts:200-205`:

```
  // [BUG-688] DB errors classified as `db_error` (not network_error). The push
  // itself succeeded — we still report `sent: true` because the user got it —
  // but escalate the log-write failure so on-call can see the divergence
  // between Expo tickets and our notification_log rows.
```

`sent: true` is correct **as a statement about delivery**. It is wrong as an input
to a dedup gate. Both facts can be true; the caller has to distinguish them.

### The push step

`apps/api/src/inngest/functions/weekly-progress-push.ts:737-750`:

```ts
            const recentPushCount = await getRecentNotificationCount(
              db,
              parentId,
              'weekly_progress',
              24,
            );
            if (recentPushCount > 0) {
              return { sent: false, reason: 'dedup_24h' as const };
            }
            return sendPushNotification(db, {
              profileId: parentId,
              title: 'Weekly learning progress',
              body: childSummaries.join(' '),
              type: 'weekly_progress',
```

### The email step, and the assumption that breaks

`apps/api/src/inngest/functions/weekly-progress-push.ts:815-828`:

```ts
            // regardless of push/email. The push step runs first; if it sent,
            // its log makes this count > 0 and the email is suppressed (push
            // preferred). If push was skipped/failed (no log written), the email
            // still goes out as the fallback channel. Reading inside this step
            // (not the prepare step) keeps the gate retry-safe: an email-step
            // retry re-reads the log written by its own first attempt and skips
            // the re-send, matching the [WI-998] rationale on the push side.
            const recentEmailCount = await getRecentNotificationCount(
              db,
              parentId,
              'weekly_progress',
              24,
            );
            if (recentEmailCount > 0) {
              return { sent: false, reason: 'dedup_24h' as const };
            }
```

The email step **never looks at the push step's result**. It re-derives the answer
from the ledger — which is exactly the right instinct for retry-safety (the WI-998
rationale is sound), and exactly what fails when the ledger has a hole in it.

**This is the tension the fix must respect**: reading the ledger inside the step is
what makes the step retry-safe. The fix must not sacrifice that.

### Repo conventions

- **"Silent recovery without escalation is banned in billing, auth, and webhook
  code."** Notifications are not on that list, and escalation already happens here.
  The problem is the contract, not the logging.
- Business logic lives in `services/`, not in route handlers.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| Notification tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/notifications --no-coverage` | all pass |
| Weekly-push tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/weekly-progress-push --no-coverage` | all pass |

## Scope

**In scope:**
- `apps/api/src/inngest/functions/weekly-progress-push.ts` — make the email gate
  account for a push that sent without logging.
- The corresponding tests.

**Out of scope (do NOT touch):**
- **The `sent: true` return value in `notifications.ts`.** It is a truthful
  statement — the user *did* get the push — and other callers rely on it. Do not
  flip it to `false`; that would make every caller believe delivery failed. Fix the
  **consumer** of the contract, not the truthful part of it.
- The Sentry escalation and structured log (BUG-688). Correct as-is. Keep them.
- The `store_cancel_nudge` carve-out at `:206-210`. It is deliberate and documented.
- Making `logNotification` transactional with the Expo send. You cannot make a
  third-party HTTP call and a DB write atomic; do not try.
- The monthly-report cron. It **shares this root cause** — see Step 4 — but fixing
  it is a separate, follow-on change once the pattern here is agreed.

## Git workflow

- Branch from `main`: `advisor/023-weekly-digest-double-notify`
- Conventional commits (e.g. `fix(notifications): suppress email when push sent but log write failed`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the failing regression test

In the weekly-progress-push test file, add a test for the exact divergence.

Mock only the **external boundary** (the Expo push transport) and force
`logNotification`'s underlying write to fail — do not mock `sendPushNotification`
itself, or you will be testing your own mock instead of the contract.

```ts
it('[WI-XXXX] does not email when the push sent but its dedup log write failed', async () => {
  // push transport succeeds; the notification_log insert throws
  // → sendPushNotification returns { sent: true, reason: 'log_write_failed' }
  // → notification_log has NO row
  // → the email step must STILL suppress the email

  await runWeeklyProgressPush(...);

  expect(pushTransport).toHaveBeenCalledTimes(1);
  expect(emailSender).not.toHaveBeenCalled();   // <-- FAILS today
});
```

Also add the test that pins the **fallback** behaviour you must not break:

```ts
it('[WI-XXXX] still emails when the push genuinely failed to send', async () => {
  // push transport fails → sent: false → email IS the fallback channel
  expect(emailSender).toHaveBeenCalledTimes(1);
});
```

That second test is the guard. The naive fix ("email whenever the push step ran")
would break it and silently kill the fallback channel.

**Verify**: the first test **MUST FAIL** (email sent). The second must **pass**
both before and after your change.

**If the first passes before the fix, STOP and report.**

### Step 2: Gate the email on the push result *as well as* the ledger

The email step must keep its ledger read (that is what makes it retry-safe) and
**additionally** honour what the push step actually returned.

The push step's result is already available to the email step in the Inngest
function body — pass it through rather than re-deriving it. The email gate becomes,
in effect:

```ts
const pushAlreadyNotified =
  pushResult.sent === true;                 // push reached the parent, logged or not

const recentEmailCount = await getRecentNotificationCount(
  db, parentId, 'weekly_progress', 24,
);

if (pushAlreadyNotified || recentEmailCount > 0) {
  return { sent: false, reason: pushAlreadyNotified ? 'push_sent' as const : 'dedup_24h' as const };
}
```

Why this shape:

- `pushResult.sent === true` covers **both** the healthy case (row written) and the
  `log_write_failed` case (no row written). The parent got a push either way; that
  is the fact the email gate actually cares about.
- `recentEmailCount > 0` is **retained**, so an email-step *retry* still re-reads
  its own first attempt's row and does not double-send. The WI-998 retry-safety
  rationale is preserved intact.
- The push **genuinely failing** (`sent: false`) still falls through to the email —
  the fallback channel keeps working.

Do not gate on `reason === 'log_write_failed'` specifically. Gate on `sent`. The
narrow check would work today and rot the moment another `reason` tag is added.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0; both Step-1 tests pass.

### Step 3: Green, then revert-check

1. Both tests pass.
2. Remove the `pushAlreadyNotified` term from the gate.
3. Re-run → the double-notify test **FAILS**; the fallback test still passes.
4. Restore. Re-run → both **PASS**.

### Step 4: Report the sibling, do not fix it

The **monthly report cron** was flagged during the audit as sharing this exact root
cause (a swallowed log-write feeding a ledger-based gate).

```
rg -n 'getRecentNotificationCount' apps/api/src
```

For each hit, determine whether it gates a fallback channel on a ledger the push
path can fail to write. **Report what you find. Do not fix it in this PR.**

If more than ~2 sites share the pattern, that is a signal the ledger contract
itself needs hardening (e.g. `sendPushNotification` returning a discriminated
`delivered | delivered-unlogged | failed`, so callers cannot ignore the middle
case). That is the durable fix and it deserves its own plan — say so.

**Verify**: you can state, for every `getRecentNotificationCount` caller, whether
it has this bug.

### Step 5: Validate

**Verify**, all of:
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- Notification service tests pass
- Weekly-progress-push tests pass, including all pre-existing ones

## Test plan

- **Double-notify regression**: push sent + log write failed → **no** email. Red-green.
- **Fallback preserved**: push genuinely failed → email **is** sent. Guard; must
  pass before and after.
- **Retry safety preserved**: an email-step retry after a successful first email
  does not re-send (the `recentEmailCount > 0` path still fires). If a test for
  this already exists, cite it; it must remain green.
- **Dedup still works**: a second digest run within 24h sends neither channel.
- Mock only the external boundaries (Expo transport, email provider). Do **not**
  `jest.mock` `sendPushNotification` or `getRecentNotificationCount` — mocking the
  internal contract is what would let this bug through.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] Notification + weekly-progress-push suites pass, including pre-existing tests
- [ ] The double-notify test provably fails when the gate term is removed (Step 3)
- [ ] The fallback test (push genuinely failed → email sent) passes
- [ ] The email-retry test still passes — retry-safety not sacrificed
- [ ] `notifications.ts` is **unchanged** (`sent: true` and the Sentry escalation intact)
- [ ] Step 4's sweep of `getRecentNotificationCount` callers is reported
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- The Step-1 test passes before the fix. The premise is wrong; report.
- You find yourself changing `sent: true` to `sent: false` in `notifications.ts`.
  That is out of scope and it lies to every other caller about delivery.
- The fallback test breaks. You have gated the email on "the push step ran" rather
  than "the push was delivered", and you have just disabled the fallback channel.
- Step 4 turns up more than ~2 sibling sites. The right fix is then a contract
  change (a discriminated result type), not N gate patches — report and let the
  team decide.

## Maintenance notes

- **The deeper design smell**: `{ sent: true, reason: 'log_write_failed' }` is a
  success value carrying a failure in a side channel that nothing is obliged to
  read. The comment even says the tag exists "so tests/observability can detect the
  divergence" — but detection was never wired to a decision. A discriminated union
  (`delivered` | `delivered-unlogged` | `failed`) would make the middle case
  **unignorable at the type level**. This plan does not do that (it would touch
  every caller); it is the right follow-up, and Step 4 sizes it.
- **What a reviewer should scrutinize**: that `recentEmailCount > 0` is still in the
  gate. Removing it would "fix" the double-notify while quietly reintroducing the
  email-retry double-send that WI-998 closed — trading one duplicate for another.
- **Why not make the push+log atomic**: you cannot transactionally couple a
  third-party HTTP send with a Postgres write. The ledger will always have a window
  where the push landed and the row did not. Callers must therefore treat "push
  delivered" and "push logged" as **separate facts** — which is precisely what this
  fix does.
