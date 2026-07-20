## What was done

This is a SECOND rework of WI-2223, following a second reviewer rejection and
an explicit PM ruling. The product fix landed on `main` in PR #2314 and
remains untouched. The first rework (PR #2348) closed three test/evidence
gaps a reviewer identified — a hollow AC-2 stale-edge test, a hand-mocked
AC-3 test, and a completion summary citing uncommitted RGR log files — and
added real co-located jest coverage plus a durable RGR evidence file. That
part of the first rework stands and is unchanged here.

**Decision-budget correction (why this second rework exists).** The first
rework's remaining step — AC-3's e2e clause ("any visible layout claim via a
named full nav-shell.spec.ts case") — was, at the time, judged infeasible
against the one existing `nav-shell.spec.ts` (Config-F's, which asserts the
Mentor tab absent) and the co-located jest was treated as sufficient on its
own for the entire AC-3 clause. The PM ruled that substitution out of budget:
an AC's evidence requirement, once PM-ratified, is not something an executor
may unilaterally swap for different evidence — "calling any setter directly
disqualifies the case by construction; the mechanism under test must be the
user's mechanism." This rework corrects that by adding the actually-named
compliant e2e case, per the ruling, rather than re-arguing the substitution.

## What changed

- `apps/mobile/src/lib/now-deep-link.test.ts`: rewrote the AC-2 "stale edge"
  case. The prior version's scope list still contained the person scope it
  claimed was stale, so it exercised an ordinary transition. The rewritten
  case seeds a persisted SecureStore scope key for a person scope (the same
  mechanism `setActiveScope` itself writes through), then renders against a
  CURRENT scope list that genuinely omits that person/edge — the real
  `ScopeContextProvider` fallback resolves the stale persisted key safely
  (no throw) before the support.hub pointer is followed and resolves to
  `supporter-hub`.
- `apps/mobile/src/app/(app)/mentor.support-hub-return.test.tsx` (new,
  co-located): the prior AC-3 evidence in `mentor.test.tsx` did two
  independent renders with a hand-swapped mocked `activeScope` and never
  drove an actual transition — that file mocks `../../lib/scope-context`
  entirely (a pre-existing, annotated legacy mock; left untouched since this
  rework doesn't edit that file). The new file leaves `scope-context`
  unmocked: it drives the real support.hub push (real `pushNowDeepLink` +
  real `setActiveScope`) from Me to Support-hub scope, then drives the real
  "return to Me" switch through the same `setActiveScope` call the ScopeChip
  (`_layout.tsx`) makes, and asserts the Me surface renders with zero
  Support-hub content. `scope-context.tsx` has no navigation-event listener
  (no `useFocusEffect`/blur handler) and `ScopeContextProvider` mounts once
  at `_layout.tsx` root, above the Tabs navigator, so `activeScope` is
  structurally unaffected by back/pop navigation — "return to Me" is this
  explicit scope switch, not a `router.back()` consequence, which is why the
  test drives that mechanism rather than a literal back-navigation call.
- `docs/evidence/wi2223-rgr-support-hub-scope.md` (new): a durable,
  reproducible red-green-revert capture against the exact fix hunk in
  `now-deep-link.ts` (the `setActiveScope`-before-`router.push` block for
  `support.hub`), naming the hunk, showing the actual failing-test output
  with the hunk reverted, and the restored passing output. Replaces the
  prior evidence's reference to `.workitem-artifacts/WI-2223/rgr/*.log`
  files, which were never committed and did not resolve at the reviewed
  snapshot.
- `apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts` (new, this second
  rework): the named full-nav-shell e2e case the PM ruling required. Seeds
  a real `v2-supporter-accepted` account, signs in through the real app,
  reaches the support-hub Mentor surface via a real cross-tab `Pressable`
  tap (not a raw `page.goto`), then drives a real `page.goBack()` and
  asserts on the real rendered page that the supporter-hub scope's own
  surface renders and the learner Mentor surface never bleeds through. It
  also drives the equivalent path through a person scope, the Journal tab,
  and the real `ScopeChip` (a scope switch with no navigation, confirmed
  from `ScopeChip.tsx`'s source), then a second real Back, with the same
  assertions. It additionally asserts, at runtime, that this seed fixture
  has no reachable path to Me scope — see Caveats.
- `.workitem-artifacts/WI-2223/evidence.json`: added claims for the two
  first-rework tests (marked `[rework, WI-2223 rejection fix]`), replaced
  the prior "e2e fallback is infeasible" AC-3 claim with a claim pointing at
  the new named e2e case above, kept the prior AC-3 `mentor.test.tsx` claim
  as supplementary dispatch-level coverage, and left `redGreenPointer`
  unchanged (no product code changed in either rework).

## Verification

- `now-deep-link.test.ts`'s full suite and the new
  `mentor.support-hub-return.test.tsx` pass with the fix in place (first
  rework; unchanged here).
- Red-green-revert was executed directly against the fix hunk (not against
  a prior commit): reverting the `setActiveScope`-before-`push` block turns
  the AC-1 spy-ordering assertion and both AC-2 "from Me scope" / "from a
  person scope" cases in `now-deep-link.test.ts` red, and turns the
  `mentor.support-hub-return.test.tsx` case red as corroboration; restoring
  the hunk returns both to green. `git diff` against `main` on
  `now-deep-link.ts` is empty — no net product-code change from either
  rework. Full output is captured in
  `docs/evidence/wi2223-rgr-support-hub-scope.md`.
- The new `apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts` case was run
  locally (real browser, real API, doppler stg config) against a fresh
  `v2-supporter-accepted` seed and observed rendering the correct surface
  after both real `page.goBack()` calls, with the Me-scope-unreachable
  assertions also holding. It was re-run to confirm the result was not a
  one-off (a local port-reuse artifact from repeated invocations produced
  one unrelated environment failure — a stale server process from a prior
  run occupying the export port — which cleared on a clean invocation; the
  test logic itself was consistent across runs).
- `tsc --build` against the repo-root composite project graph reports no
  errors. `nx lint mobile` reports no errors introduced by this change.

## Caveats / Follow-ups

**Decision-budget note:** the prior rework's completion summary asserted
that the co-located jest test satisfied AC-3's e2e clause on its own, with
no e2e case added. The PM ruled that assertion out of budget — an AC
evidence clause, once PM-ratified, is revisable only by the PM, not by an
executor's own infeasibility finding. This rework does not re-argue that
point; it adds the named e2e case the ruling required
(`apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts`).

**Architectural fact (unchanged from the first rework):** `scope-context.tsx`
has no navigation-event listener anywhere (no `useFocusEffect`, no blur
handler), and `ScopeContextProvider` mounts exactly once at
`apps/mobile/src/app/(app)/_layout.tsx` root, above the Tabs navigator that
owns the Mentor route. `activeScope` is therefore structurally decoupled
from back/pop navigation. The new e2e case confirms this empirically in a
real browser: a real `page.goBack()` never changes which scope is active,
only which route/tab is on screen — the fixed invariant (the surface
matching the active scope, not the wrong learner one) holds across a real
Back precisely because scope itself is untouched by it.

**Me scope is unreachable with the current seed fixture — proven at
runtime, not assumed.** `v2-supporter-accepted` gives the supporter zero
learning state of their own, so the server never adds `{kind:'me'}` to the
resolved scope list (`scope-resolution.ts`'s `hasFirstRealLearningState`
gate), and the one client-side path that could reach Me regardless
(`SupporterSelfLearningDoorway`, exported from the `support` barrel but not
imported or rendered by `mentor.tsx`, `subjects.tsx`, or any other screen)
is dead code — unmounted, not merely conditionally hidden. The new e2e case
asserts both the `scope-chip-option-me` and `supporter-self-learning-
doorway` testids resolve to zero elements on the real rendered page. This
means the specific "support.hub pointer pressed from Me scope" journey the
product code guards against (`now-feed.ts`'s `support_hub_pointer` card is
`scope==='self'`-only) has no real navigation path with today's seed
fixtures, so AC-3's "does not duplicate support content into the Me scope"
clause is evidenced by the co-located jest only (which drives that exact
transition through the real `ScopeContextProvider`), not by this e2e case.
Two independent, separable follow-ups exist if a full real-browser proof of
that specific clause is wanted later: (1) a seed scenario giving a supporter
their own learning state (so Me is a server-resolved, reachable scope), or
(2) mounting `SupporterSelfLearningDoorway` somewhere real, which is
component-tested (`SupporterSelfLearningDoorway.test.tsx`) but currently
inert in the actual app. Neither is done here — both are seed-infra/product
changes outside this WI's fix.

**Staging e2e-web target is stale relative to this repo.** The documented
CI recipe for the V2 e2e lane points Playwright at the deployed
`api-stg.mentomate.com` worker. That deployed worker rejects the
`v2-supporter-accepted` scenario outright (its seed-scenario schema predates
WI-2241) — a pre-existing deploy-drift gap, not something this WI
introduces or can fix. The new e2e case was run and verified against a
locally-run API server built from this repo's current source instead
(pointed at via `PLAYWRIGHT_API_URL` and `EXPO_PUBLIC_API_URL`, bypassing
the stale deployed worker), which is how the CI job would need to run this
scenario too until that worker is redeployed.
