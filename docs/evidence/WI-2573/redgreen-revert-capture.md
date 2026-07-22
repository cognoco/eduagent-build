# WI-2573 — mentor-notice push containment: red-green-revert execution evidence

This is a **fresh, clean-provenance** capture of the AC-6 red-green-revert sequence
requested by the reviewer bounce on `WI-2573 (Disable mentor-notice push delivery
for the in-app MVP)`. It supersedes prior in-repo captures that ran against a
non-local database — this run executed against a disposable local PostgreSQL 17 +
pgvector cluster (`localhost:54329`), confirmed by the `[integration-setup] Using
pg wire-protocol driver (local/CI)` line at the top of every captured log (the
integration setup only takes the `pg` wire-protocol path for a non-Neon host).

- **Base revision:** `9a4ae7c06357925969beee66d482b4cca4dbb3a0` (origin/main HEAD
  at capture time — the push-containment code from PR #2467 / commit `f346ee16`
  is an ancestor of this revision).
- **Suite:** `tests/integration/mentor-notice-push-containment.integration.test.ts`
  (jest config `tests/integration/jest.config.cjs`, `--runInBand --no-coverage`,
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`).
- **Database:** local, disposable PostgreSQL 17 (Homebrew `postgresql@17` +
  `pgvector` formula), initialized fresh via `initdb`, listening only on
  `localhost:54329`, schema applied with `drizzle-kit push`. `DATABASE_URL`
  pinned to `postgresql://test@localhost:54329/eduagent_test` for every command.
  Never touched Neon, Doppler, or staging. Cluster was `pg_ctl stop` + deleted
  after capture.
- **Toggled seam:** `apps/api/src/config.ts` → `isMentorNoticePushPostMvpEnabled`.
  For the RED phase only, its body was changed from
  `return value === 'true';` to `return true;` — unconditionally opening the
  post-MVP push boundary that both the nudge-scan and nudge-send Inngest
  handlers gate on. The edit was reverted immediately after the RED capture;
  `git diff apps/api/src/config.ts` is empty in the final worktree state (see
  "Net-zero confirmation" below) — no production code change lands with this
  evidence file.

## Phase 1 — GREEN (baseline, containment in place)

Command:

```
DATABASE_URL=postgresql://test@localhost:54329/eduagent_test \
NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
pnpm exec jest -c tests/integration/jest.config.cjs \
  tests/integration/mentor-notice-push-containment.integration.test.ts \
  --runInBand --no-coverage
```

Result: **8/8 passed.** Full verbatim output: [phase1-green-baseline.log](phase1-green-baseline.log).

```
PASS integration tests/integration/mentor-notice-push-containment.integration.test.ts
  mentor-notice push containment — real database
    ✓ delivers nothing for a replayed pre-existing send event (homework session) with the in-app flag on and permissive settings (27 ms)
    ✓ delivers nothing for a replayed pre-existing send event (ordinary learning session) with the in-app flag on and permissive settings (6 ms)
    ✓ delivers nothing when the boundary is explicitly false (6 ms)
    ✓ delivers nothing on repeated retry-shaped replays of the same event (5 ms)
    ✓ POSITIVE CONTROL: the same fixture does send when the post-MVP boundary is explicitly enabled (26 ms)
    ✓ scan enqueues nothing and reads nothing while contained (7 ms)
    ✓ POSITIVE CONTROL: scan reaches the eligibility query once the boundary is enabled (4 ms)
    ✓ cannot be activated by the in-app mentor-notice flag or by review-reminder preferences (5 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Phase 2 — RED (boundary reverted to unconditional `true`)

`isMentorNoticePushPostMvpEnabled` changed to `return true;` (ignoring its
`value` argument), re-run with the same command.

Result: **6 failed, 2 passed** (the two POSITIVE CONTROL cases, which assert the
boundary being OPEN, stay green — as expected, since the edit opens it further
than they already assumed). Full verbatim output:
[phase2-red-boundary-reverted.log](phase2-red-boundary-reverted.log).

The 6 failures are exactly the containment assertions, and each one shows the
real behavior the containment is supposed to prevent:

- **"delivers nothing for a replayed pre-existing send event (homework session) …"**
  — `expoCalls()` returns a real captured Expo POST instead of `[]`:
  ```
  Object {
    "body": "{\"to\":\"ExponentPushToken[wi2573-containment-fixture]\",\"title\":\"A quick Algebra replay-homework check\",\"body\":\"Your mentor noticed one small idea worth revisiting.\",\"sound\":\"default\",\"data\":{\"type\":\"notice_recheck\",...}}",
    "headers": Object { "Accept": "application/json", "Content-Type": "application/json" },
    "method": "POST",
    "url": "https://exp.host/--/api/v2/push/send",
  }
  ```
- **"… (ordinary learning session) …"** — same shape, a second real Expo POST captured.
- **"delivers nothing when the boundary is explicitly false"** — still failed
  (a real Expo POST is captured) even with `pushPostMvp: 'false'` passed
  explicitly, proving the reverted function ignores its argument entirely, not
  just the absent-binding case.
- **"delivers nothing on repeated retry-shaped replays of the same event"** —
  `result` returns `{ status: 'sent', ticketId: 'mock-receipt-id' }` instead of
  `{ status: 'skipped', reason: 'push_post_mvp' }`.
- **"scan enqueues nothing and reads nothing while contained"** — `runner.runNames()`
  proceeds past the boundary step to `check-feature-flag` and
  `find-eligible-notices` instead of stopping at `check-post-mvp-push-boundary`.
- **"cannot be activated by the in-app mentor-notice flag or by review-reminder
  preferences"** — `result` returns `{ status: 'sent', ticketId: 'mock-receipt-id' }`
  instead of the skipped/contained result.

```
Test Suites: 1 failed, 1 total
Tests:       6 failed, 2 passed, 8 total
```

## Phase 3 — GREEN (restore)

`isMentorNoticePushPostMvpEnabled` reverted to its committed form
(`return value === 'true';`), same command re-run.

Result: **8/8 passed** again — identical to Phase 1. Full verbatim output:
[phase3-green-restored.log](phase3-green-restored.log).

```
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Net-zero confirmation

```
$ git diff apps/api/src/config.ts
(no output — empty diff)
```

The only change landed by this evidence artifact is this `docs/evidence/WI-2573/`
directory; the containment implementation itself is untouched — the RED-phase
edit to `apps/api/src/config.ts` was applied, captured, and reverted entirely
within this local worktree before this file was committed.

## Related quarantined test (WI-2557 provenance)

`tests/integration/mentor-notice-lifecycle.integration.test.ts` carries one test
case gated by the same boundary via the file-local `itPostMvpPush` helper
(`isMentorNoticePushPostMvpEnabled(process.env['MENTOR_NOTICE_PUSH_POST_MVP_ENABLED'])
? it : it.skip`, defined at line 41): **"reserves a nudge when the daily cap was
filled in the previous learning day"** (line 426-427). That case was introduced
by WI-2557 (PR #2461) as supplementary evidence and is **quarantined** — it does
not run in the default (contained) configuration, only if the post-MVP boundary
is ever reopened. WI-2557's acceptance rests on its offer-eligibility sibling
test in the same file, which is retained MVP scope and always runs.
