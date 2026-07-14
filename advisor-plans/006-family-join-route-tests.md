# Plan 006: Add route-handler tests for family-join (and speaking-practice)

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". When done, update the
> status row in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/routes/family-join.ts apps/api/src/routes/speaking-practice.ts`
> On any change, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 002 (so a routes-only diff runs these + any integration tests in CI)
- **Category**: tests
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`routes/family-join.ts` (191 lines) is the wiring that adds a minor to a guardian's account — an invite/accept flow with real gates: authz via `callerPersonId`, a per-IP rate limiter, and `zValidator` on the request bodies. It is one of only two route files in the whole app with **no co-located test** (`routes/speaking-practice.ts`, 75 lines, is the other). The *service* layer is tested (`services/identity-v2/family-join-invite.integration.test.ts`, `family-join-v2.integration.test.ts`), but the **route handler** — the auth check, rate-limit enforcement, and validation rejection — has zero coverage. For the highest-consequence surface in a minors product, a dropped `callerPersonId` check or a bypassed limiter would fail no test.

## Current state

```ts
// routes/family-join.ts (structure — verified line anchors)
import { zValidator } from '@hono/zod-validator';                       // :17
import { createSlidingWindowRateLimiter } from '...rate-limit';         // :37
const familyJoinInviteLimiter = createSlidingWindowRateLimiter({ ... }); // :50

type FamilyJoinRouteEnv = { Variables: { callerPersonId: string | undefined; ... } }; // :73

function withCaller(c): { db; callerPersonId: string } {   // :79
  const callerPersonId = c.get('callerPersonId');          // :84
  if (!callerPersonId) { throw ... }                       // :85 (401-class)
  return { db, callerPersonId };
}

export const familyJoinRoutes = new Hono<FamilyJoinRouteEnv>()
  .post('/family-join/invite',                              // :92
    zValidator('json', familyJoinInviteRequestSchema),      // :94
    async (c) => {
      const { db, callerPersonId } = withCaller(c);         // :96
      ...
      if (familyJoinInviteLimiter.isLimited(ipKey)) { ...429... }  // :103
      ...inviterPersonId: callerPersonId...                 // :124
    })
  .post('/family-join/accept',                              // :142
    zValidator('json', familyJoinAcceptRequestSchema),      // :144
    async (c) => {
      const { db, callerPersonId } = withCaller(c);         // :146
      ...teenPersonId: callerPersonId...                    // :173
    });
```

The route is mounted (`index.ts` mounts `familyJoinRoutes`), so it is reachable.

Repo conventions for route tests (copy the pattern):
- Every other route test builds a `Hono` app with a stub env and mounts the route. See `apps/api/src/routes/feedback.test.ts` head:

```ts
// feedback.test.ts:1-45 — the canonical route-test scaffold
jest.mock('inngest/hono', () => ({ serve: jest.fn().mockReturnValue(jest.fn()) }));
jest.mock('../inngest/client' /* gc1-allow: inngest-boundary: ... */, () => {
  const actual = jest.requireActual('../inngest/client') as typeof import('../inngest/client');
  return { ...actual, inngest: { send: jest.fn().mockResolvedValue(undefined) } };
});
import { Hono } from 'hono';
import { feedbackRoutes } from './feedback';
type FeedbackEnv = { Variables: {...}; Bindings: {...} };
```

- Internal-mock ban (GC1/GC6): do NOT `jest.mock('./family-join')` or mock the service under test. Mock only true external boundaries (the Inngest client, per the `gc1-allow` pattern above). Set `callerPersonId` and a stub `db` via middleware on the test app, and let the real handler run. If the accept/invite path calls the DB in a way that needs a real DB, prefer an `*.integration.test.ts` variant that uses the real DB (the integration suite already exercises the service; here you want the route's gating behavior).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Run new test | `cd apps/api && pnpm exec jest --findRelatedTests src/routes/family-join.ts --no-coverage` | pass |
| Integration | `pnpm exec nx run api:integration-api` | pass |
| Confirm no test today | `ls apps/api/src/routes/family-join.test.ts` | (before) no such file |

## Scope

**In scope**:
- `apps/api/src/routes/family-join.test.ts` (create).
- `apps/api/src/routes/speaking-practice.test.ts` (create — lower stakes, same pattern).

**Out of scope**:
- `apps/api/src/routes/family-join.ts` / `speaking-practice.ts` — do NOT modify the routes. This is a test-only plan. If you find a genuine bug while writing tests, STOP and report it (don't fix it here).
- The already-tested service layer (`services/identity-v2/family-join-*`) — don't duplicate its coverage; test the route's gating, not the business logic.

## Git workflow

- Branch: `advisor/006-family-join-route-tests`.
- Conventional commits, e.g. `test(api): add family-join and speaking-practice route tests`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: family-join route test

Create `apps/api/src/routes/family-join.test.ts` using the `feedback.test.ts` scaffold. Build a Hono app, mount `familyJoinRoutes`, and inject a middleware that sets `callerPersonId` and a stub `db`. Cover:
1. **Missing caller** → `POST /family-join/invite` with no `callerPersonId` set → 401-class (whatever `withCaller`'s throw maps to; assert the actual status/code the app returns).
2. **Schema-invalid body** → post a body failing `familyJoinInviteRequestSchema` → 400.
3. **Rate limit** → drive `familyJoinInviteLimiter` over its `max` from the same IP (set the `cf-connecting-ip` / `x-forwarded-for` header the route uses for `ipKey`) → 429. Note: the limiter is module-scoped and in-memory; call the route repeatedly in one test to trip it, and be aware other tests in the file share that limiter — reset or use distinct IP keys per test to avoid cross-test coupling.
4. **Happy path** → valid caller + valid body → the handler delegates to the service and returns success (stub the service boundary only if it's an external call; otherwise assert the response shape).
5. Same core set for `POST /family-join/accept` (missing caller → 401; invalid body → 400; happy path).

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/family-join.ts --no-coverage` → pass, ≥5 new tests.

### Step 2: speaking-practice route test

Create `apps/api/src/routes/speaking-practice.test.ts` with the same scaffold, covering its handler's auth/validation gates (read the 75-line file first to enumerate them). Lower stakes — happy path + the one or two negative gates the route actually has.

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/speaking-practice.ts --no-coverage` → pass.

### Step 3: Full type + suite check

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. `pnpm exec nx run api:integration-api` → pass (in case a test is `*.integration.test.ts`).

## Test plan

Covered by Steps 1–2. Structural pattern: `apps/api/src/routes/feedback.test.ts` (scaffold) and any route test with rate-limit assertions (search `rg -l 'isLimited\|429' apps/api/src/routes/*.test.ts` for a nearby example). No new production code, so the "regression" is the coverage itself.

## Done criteria

- [ ] `apps/api/src/routes/family-join.test.ts` exists, covers missing-caller (401), invalid-body (400), rate-limit (429), and happy path for both invite and accept.
- [ ] `apps/api/src/routes/speaking-practice.test.ts` exists and covers its handler's gates.
- [ ] No internal mock of the route/service-under-test (only the Inngest-client external boundary, with a `gc1-allow` reason).
- [ ] `pnpm exec nx run api:typecheck` exits 0; new tests pass; `api:integration-api` passes.
- [ ] The PostToolUse jest-mock hook reports no new internal mocks on the created test files.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

- Writing the happy-path test reveals the handler can be reached without `callerPersonId` (the gate is missing, not just untested) — STOP and report; that's a security finding, not a test gap.
- The rate limiter cannot be tripped from a test because the IP key derivation ignores your headers — read `resolveRateLimitIp` (`services/rate-limit.ts`) for the exact header precedence, and if it still can't be driven, report it.
- A required schema (`familyJoinInviteRequestSchema` / `familyJoinAcceptRequestSchema`) isn't exported where you can import it — report; don't inline a fake schema.

## Maintenance notes

- These tests pin the route's *gating contract* (auth, validation, rate limit), not its business logic. If the family-join flow changes shape, update the gate assertions here.
- Reviewer should confirm the module-scoped rate limiter doesn't cause order-dependent flakiness across tests in the file (distinct IP keys or a reset between tests).
- The module-level limiter is per-isolate in-memory (`rate-limit.ts` [BUG-99] accepted limitation) — the test asserts the algorithm, not distributed enforcement.
