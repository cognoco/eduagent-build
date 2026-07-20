# WI-2223 — Red-Green-Revert evidence (Bug DoD)

**Item:** WI-2223 — support.hub deep links select Support-hub scope before navigation.
**Bug DoD:** executed red-green-revert, independently verifiable.

**Under test:**
- `apps/mobile/src/lib/now-deep-link.ts` — `pushNowDeepLink`'s support.hub hunk:

```ts
    if (route === 'support.hub') {
      options.setActiveScope?.({ kind: 'supporter-hub' });
    }
```

This is the entire fix (landed on `main` at `ee8f18851`, PR #2314): `pushNowDeepLink` calls
`setActiveScope({kind:'supporter-hub'})` before `router.push` whenever the route being
pushed is `support.hub`. Before this hunk existed, the function only ever pushed the
route and never touched scope state, so a support.hub pointer from a supporter's Me or
person scope rendered the learner Mentor surface instead of the supporter hub.

**Regression test:** `apps/mobile/src/lib/now-deep-link.test.ts`

**Runtime:** Node 22.16.0 (repo requires 22.x — see the node-version note in AGENTS.md).
**Command (run from `apps/mobile/`):**

```
pnpm exec jest src/lib/now-deep-link.test.ts --no-coverage
```

This is a durable, reproducible capture executed directly against the hunk above — the
revert below is a temporary local edit made only to produce the RED capture; it was
restored immediately after and the product code (`now-deep-link.ts`) carries no net
change from this rework (`git diff` against `main` on that file is empty). The previous
completion summary cited `.workitem-artifacts/WI-2223/rgr/*.log` files that were never
committed and do not exist at the reviewed snapshot; this record replaces that pointer
with the actual captured terminal output, committed in-repo.

---

## GREEN — fix present (baseline)

```
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

---

## RED — fix reverted (proves the test is load-bearing)

The hunk was removed from `pushNowDeepLink`, restoring the pre-fix behavior (push only,
no scope selection):

```diff
   for (const route of [...deepLink.chain, deepLink.route]) {
     assertSupportedRoute(route);
-    if (route === 'support.hub') {
-      options.setActiveScope?.({ kind: 'supporter-hub' });
-    }
     router.push(buildNowPath(route, deepLink.params, options) as Href);
   }
```

No test file was touched for this step.

Captured output — **3 tests fail**:

```
  ● pushNowDeepLink › [WI-2223] selects the Support-hub scope before pushing a support hub pointer

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    Expected: {"kind": "supporter-hub"}

    Number of calls: 0

      214 |     expect(setActiveScope).toHaveBeenCalledWith({ kind: 'supporter-hub' });

  ● pushNowDeepLink support.hub scope selection against real scope state › [AC-2] selects the Support-hub scope from Me scope without throwing

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Object {
    -   "kind": "supporter-hub",
    +   "kind": "me",
      }

      315 |       expect(result.current.activeScope).toEqual({ kind: 'supporter-hub' });

  ● pushNowDeepLink support.hub scope selection against real scope state › [AC-2] selects the Support-hub scope from a person scope without throwing

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 4

      Object {
    -   "kind": "supporter-hub",
    +   "displayName": "Emma",
    +   "edgeId": "00000000-0000-4000-8000-000000000201",
    +   "kind": "person",
    +   "personId": "00000000-0000-4000-8000-000000000101",
      }

      315 |       expect(result.current.activeScope).toEqual({ kind: 'supporter-hub' });

Test Suites: 1 failed, 1 total
Tests:       3 failed, 16 passed, 19 total
```

The AC-1 spy-ordering assertion fails outright (`setActiveScope` is never called — 0
calls). Both AC-2 "from Me scope" / "from a person scope" cases fail because,
without the hunk, `activeScope` never leaves its starting value (`me`, or the
`person` scope respectively) — the support.hub push no longer resolves to the
supporter-hub surface at all. These three are the tests genuinely load-bearing for
this fix.

Two tests correctly stay **green** under the revert and are not claimed as
discriminators for this hunk: `[AC-2] stays safe when the active person scope
predates the current scope list (stale edge)` uses a scope list containing only
`supporter-hub` (no other scope), so `activeScope` already resolves to
`supporter-hub` via the default-scope fallback regardless of whether
`setActiveScope` is called — it is a safety/no-throw test, not a fix-detection
test. `[AC-4]` (learner-shape) is unaffected because `setActiveScope` early-returns
for a non-supporter scope list independent of this hunk.

As corroboration, the co-located
`apps/mobile/src/app/(app)/mentor.support-hub-return.test.tsx` (AC-3 return-path
test, added by this rework) also fails under the same revert: after pressing the
support.hub-linked card's continue action, `screen.getByTestId('support-hub-mentor-tab')`
throws (element not found), because `activeScope` never changed from `me`.

---

## RESTORE — fix re-applied

The hunk was restored verbatim (`git diff` against `main` on `now-deep-link.ts` is
empty); the suite returns to green:

```
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

Red → Green → Revert-red → Restore-green confirmed: `now-deep-link.test.ts`'s AC-1 and
AC-2 assertions fail without the `setActiveScope`-before-`push` hunk and pass with it;
the product code carries no net change from this rework.
