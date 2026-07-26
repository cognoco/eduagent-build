# WI-2804 — V2 post-wrap-up Mentor-return navigation stall

## Scope and authority

Diagnostic-only evidence for BID-48. No hosted target was rerun because WI-2804
records no hosted-mutation authority. This investigation used the existing GitHub
Actions record and repository source only. It did not edit the shared V2 smoke
specification, widen a retry or timeout, implement a repair, or overlap WI-2805's
close-to-wrap-up work.

## Durable symptom

- Source run: GitHub Actions run `30212519286`, attempt 3, job `89822824508`,
  head `78cf25507b2d226611e6f9a204dcf6b2daec6799`.
- First attempt reached `first-session-wrap-up`, pressed `chat-shell-back`, then
  spent the full 15-second URL assertion on the original `/session` URL.
- The retained URL still included `entrySource=mentor&returnTo=mentor`.
- Expected `/mentor`; received `/session?...&returnTo=mentor` at
  `apps/mobile/e2e-web/flows/v2/v2-homework-manual-entry.spec.ts:193` in the
  failing revision.
- The run retained no Actions artifact or Playwright trace. Its log contains no
  `pendingMentorReturn`, `mentorReturnReady`, Now-feed request, route-call, or
  Mentor-render telemetry, so rejection versus non-settlement cannot be resolved
  from the hosted record.

## Boundary trace from current source

The production boundary is unchanged between the failing head and this diagnostic
branch for `apps/mobile/src/app/(app)/session/index.tsx`.

1. `handleChatBackPress` sees `returnTo=mentor` and calls
   `startMentorReturn`; it does not call the router directly.
2. `startMentorReturn` sets `pendingMentorReturn=true` and
   `mentorReturnReady=false`.
3. The pending-return effect invalidates and refetches the actor/profile/epoch-exact
   Now-feed query with `refetchType: 'all'` and `throwOnError: true`.
4. Only successful settlement sets `mentorReturnReady=true`.
5. Only the ready-state effect calls `router.replace('/(app)/mentor')`.
6. On refetch rejection, the catch branch clears `pendingMentorReturn` but leaves
   `mentorReturnReady=false`. The first Back is therefore consumed and the learner
   remains on Session until another Back starts another attempt.
7. A refetch that never settles has no bound in this branch. The two-second
   `MENTOR_RETURN_EPOCH_WAIT_MS` escape applies only before policy-epoch hydration,
   not to the refetch itself.

## Ranked hypotheses and disposition

1. **Now-feed refresh gate rejected or did not settle — supported root-cause
   class.** Both variants deterministically prevent the ready state and therefore
   prevent the route call. The hosted record cannot distinguish the two variants.
2. **Stale `returnTo` or `homeBackHref` — contradicted.** The failure URL retained
   `returnTo=mentor`; `homeHrefForReturnTo('mentor')` resolves to
   `/(app)/mentor`.
3. **Router replacement failed — not supported.** Existing session-boundary tests
   show that resolving the same exact invalidation invokes
   `router.replace('/(app)/mentor')`; the failing state is upstream of that call.
4. **Mentor render stalled after navigation — contradicted by the durable URL.**
   The browser never left `/session`, so Mentor render was not reached.

## Source-level feedback loop

Command:

```text
apps/mobile/node_modules/.bin/jest --config apps/mobile/jest.config.cjs \
  --runTestsByPath 'apps/mobile/src/app/(app)/session/index.test.tsx' \
  --runInBand --testNamePattern='\[WI-2234\].*(invalidates only the active profile Now feed|keeps the learner in Session when the Mentor refresh fails|routes .* exact Mentor feed projection)'
```

Result: one suite passed; four focused tests passed. The rejection case explicitly
asserts that the first action does not replace the route and that only a second,
successful attempt reaches Mentor. The success cases prove exact invalidation
precedes the route call. This is a deterministic source-level reproduction of the
swallowed-first-Back behavior, not a hosted reproduction.

## Disposition

Distinct repair scope was captured as WI-2818, **Prevent failed Now-feed refresh
from swallowing first Mentor-return Back**. It requires mutation-sensitive
session-boundary regression tests for success, rejection, and non-settlement while
preserving exact actor/profile/epoch invalidation and forbidding shared smoke-spec,
retry, timeout-widening, or quarantine changes. WI-2234 is a sibling/origin contract,
not a duplicate; WI-2805 remains a collision fence for close-to-wrap-up work.
