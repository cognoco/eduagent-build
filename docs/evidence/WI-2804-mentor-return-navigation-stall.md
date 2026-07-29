# WI-2804 — V2 post-wrap-up Mentor-return navigation stall

## Scope and authority

Diagnostic-only evidence for BID-48 (Integration and migration reliability
Delivery Batch). No hosted target was rerun because WI-2804
records no hosted-mutation authority. This investigation used the existing GitHub
Actions record and repository source only. It did not edit the shared V2 smoke
specification, widen a retry or timeout, implement a repair, or overlap WI-2805
(Diagnose V2 first-session close-to-wrap-up readiness failure; collision owner
for close-to-wrap-up work).

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

## Boundary trace — revision-pinned

The hosted failing run (`78cf25507b2d226611e6f9a204dcf6b2daec6799`) predates both
boundary revisions below. This section previously described "current source"
without pinning a revision; that framing went stale the moment
`cfeeaed7d91d0099fcfa71a824c4a23ca0f5c3d9` (WI-2818, "fix(mobile): bound
Mentor-return refresh (#2654)") landed and changed the boundary it describes. The
two states are now cited explicitly by SHA.

### Pre-repair boundary — `0745243f5259cbee204b2595e2974ed43258c5e3`

This is `cfeeaed7d`'s immediate parent — the last revision of
`apps/mobile/src/app/(app)/session/index.tsx` before WI-2818's fix, and the
revision whose behavior actually matches the hosted failing run's symptom.

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

### Repaired boundary — `aa88792d5` and later (WI-2818 landed at `cfeeaed7d`)

`cfeeaed7d` changed steps 6-7 above: a new `MENTOR_RETURN_REFRESH_WAIT_MS` (2s)
timer runs alongside the refetch. Rejection (the `catch` branch) and non-settlement
(the timer firing) both now call `setMentorReturnReady(true)` — the same as
success — so the first Back always reaches Mentor; only *whether the Now-feed was
freshly invalidated* differs across the three outcomes, not whether Back navigates.
Confirmed by diff:

```text
git diff cfeeaed7d~1 cfeeaed7d -- "apps/mobile/src/app/(app)/session/index.tsx"
```

```diff
+// Give the exact projection one bounded opportunity without trapping Back.
+const MENTOR_RETURN_REFRESH_WAIT_MS = 2_000;
...
     let cancelled = false;
+    const timer = setTimeout(() => {
+      if (cancelled) return;
+      setPendingMentorReturn(false);
+      setMentorReturnReady(true);
+    }, MENTOR_RETURN_REFRESH_WAIT_MS);
     async function returnAfterMentorRefresh(): Promise<void> {
       try {
         await refreshMentorFeedBeforeReturn();
-        if (cancelled) return;
-        setPendingMentorReturn(false);
-        setMentorReturnReady(true);
       } catch {
-        if (cancelled) return;
-        setPendingMentorReturn(false);
+        // A failed exact refresh is not evidence of freshness, but Back still exits.
       }
+      if (cancelled) return;
+      clearTimeout(timer);
+      setPendingMentorReturn(false);
+      setMentorReturnReady(true);
     }
```

The production boundary at `aa88792d5` (this branch's base) is therefore the
**repaired** state, not the state the hosted failing run exhibited. Distinct repair
scope for this change was tracked and closed as WI-2818, separately from this
diagnostic WI-2804.

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

## Source-level feedback loop — revision-pinned reproduction and current state

The same command was run against both boundary revisions above. It is **not**
a reproduction at the current branch head; only the historical run reproduces
the swallowed-first-Back symptom.

Command (identical in both runs):

```bash
apps/mobile/node_modules/.bin/jest --config apps/mobile/jest.config.cjs \
  --runTestsByPath 'apps/mobile/src/app/(app)/session/index.test.tsx' \
  --runInBand --testNamePattern='\[WI-2234\].*(invalidates only the active profile Now feed|keeps the learner in Session when the Mentor refresh fails|routes .* exact Mentor feed projection)'
```

### Historical reproduction — detached worktree at `0745243f5` (pre-repair)

Set up via `git worktree add --detach <path> 0745243f5259cbee204b2595e2974ed43258c5e3`
followed by a full `pnpm install` in that worktree (isolated node_modules; the
lockfile is unchanged between `0745243f5` and `aa88792d5`, so this reflects the
same dependency graph the current branch uses). Output:

```text
PASS @eduagent/mobile apps/mobile/src/app/(app)/session/index.test.tsx (17.049 s)
    √ [WI-2234] routes Android hardware back through the exact Mentor feed projection before leaving (3186 ms)
    √ [WI-2234] routes native stack gesture through the exact Mentor feed projection before leaving (102 ms)
    √ [WI-2234] keeps the learner in Session when the Mentor refresh fails and allows a successful retry (145 ms)
    √ [WI-2234] invalidates only the active profile Now feed before returning to Mentor (139 ms)
Tests:       74 skipped, 4 passed, 78 total
```

`[WI-2234] keeps the learner in Session when the Mentor refresh fails and allows a
successful retry` is the deterministic source-level reproduction of the
swallowed-first-Back symptom: at this revision the test asserts, as accepted
contract, that a failed Now-feed refresh consumes the first Back and only a
second, successful attempt reaches Mentor — matching the hosted failing run's
observed behavior. The worktree was removed after capturing this output; the SHA
and command above are sufficient to reproduce it again.

### Current branch head — `aa88792d5` (repaired; no reproduction)

Same command, run in this branch's own worktree (no separate checkout needed —
`aa88792d5` is this branch's base):

```text
    √ [WI-2234] routes Android hardware back through the exact Mentor feed projection before leaving (571 ms)
    √ [WI-2234] routes native stack gesture through the exact Mentor feed projection before leaving (89 ms)
    √ [WI-2234] invalidates only the active profile Now feed before returning to Mentor (143 ms)
Tests:       92 skipped, 3 passed, 95 total
```

Only 3 tests match at this revision, not 4: `[WI-2234] keeps the learner in Session
when the Mentor refresh fails and allows a successful retry` no longer exists.
WI-2818's fix commit (`cfeeaed7d`) replaced it with four renamed/rescoped tests
that assert the repaired contract instead —
`[WI-2818] returns %s to Mentor after one failed exact refresh`,
`[WI-2818] waits for a successful exact Now-feed refresh before the first Back
reaches Mentor`, `[WI-2818] returns to Mentor on the first Back when the exact
Now-feed refresh rejects`, and `[WI-2818] bounds a non-settling exact Now-feed
refresh on the first Back` (`apps/mobile/src/app/(app)/session/index.test.tsx`).
The cited `[WI-2234]`-scoped filter does not — and after WI-2818 landed, cannot —
exercise the rejection/non-settlement paths; it only covers the three success-path
assertions that were never in question. Running it at the current head confirms
only that those retained success-path tests still pass; the four `[WI-2818]`
tests named above, landed at `cfeeaed7d`, are the direct repair evidence, not
this filtered run.

## Disposition

Distinct repair scope was captured as WI-2818, **Prevent failed Now-feed refresh
from swallowing first Mentor-return Back**, and has since landed at `cfeeaed7d`
(#2654) — see "Repaired boundary" above. WI-2234 is a sibling/origin contract, not
a duplicate; WI-2805 remains a collision fence for close-to-wrap-up work.
