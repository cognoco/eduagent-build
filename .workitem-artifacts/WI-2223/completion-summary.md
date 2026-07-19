## What was done

This is a rework of WI-2223 following a reviewer rejection of the original
evidence and test suite. The product fix itself already landed on `main`
(PR #2314) and is untouched here — this rework closes three test/evidence
gaps the reviewer identified: an AC-2 test that didn't actually construct a
stale supportership edge, an AC-3 test that hand-swapped a mocked
`activeScope` instead of driving a real transition, and a completion summary
that cited red-green-revert log files never committed to the repo.

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
- `.workitem-artifacts/WI-2223/evidence.json`: added claims for the two
  rewritten/new tests above (marked `[rework, WI-2223 rejection fix]`),
  kept the prior AC-3 `mentor.test.tsx` claim as supplementary
  dispatch-level coverage, and repointed `redGreenPointer` at the new
  evidence markdown.

## Verification

- `now-deep-link.test.ts`'s full suite passes with the fix in place.
- The new `mentor.support-hub-return.test.tsx` passes.
- Red-green-revert was executed directly against the fix hunk (not against
  a prior commit): reverting the `setActiveScope`-before-`push` block turns
  the AC-1 spy-ordering assertion and both AC-2 "from Me scope" / "from a
  person scope" cases in `now-deep-link.test.ts` red, and turns the new
  `mentor.support-hub-return.test.tsx` case red as corroboration; restoring
  the hunk returns both to green. `git diff` against `main` on
  `now-deep-link.ts` is empty — no net product-code change from this
  rework. Full output is captured in
  `docs/evidence/wi2223-rgr-support-hub-scope.md`.
- `tsc --build` against the repo-root composite project graph reports no
  errors. `nx lint mobile` reports no errors introduced by this change.

## Caveats / Follow-ups

**Architectural fact, not a deferral:** `scope-context.tsx` has no
navigation-event listener anywhere (no `useFocusEffect`, no blur handler),
and `ScopeContextProvider` mounts exactly once at
`apps/mobile/src/app/(app)/_layout.tsx` root, above the Tabs navigator that
owns the Mentor route. `activeScope` is therefore structurally decoupled
from back/pop navigation — it cannot be affected by which screen React
Navigation currently shows, because navigation lifecycle only mounts/unmounts
what sits below where scope state lives. "Return to Me" is consequently an
explicit scope switch (the `setActiveScope({kind:'me'})` call the ScopeChip
makes), not a `router.back()` consequence. AC-3's return-path evidence is
provided by the new co-located jest test driving exactly that real switch,
per the definition above — not by a literal back-navigation call this screen
has no code path to react to.

**The AC's cited e2e fallback location is structurally infeasible, with
citations:** `apps/mobile/e2e-web/flows/config-f/nav-shell.spec.ts` is the
only file with that name in the repo. It asserts
`await expect(page.getByTestId('tab-mentor')).not.toBeVisible()` at both
`nav-shell.spec.ts:40` (family shape) and `nav-shell.spec.ts:59` (study
shape) — the Mentor tab is asserted ABSENT under the Config-F flag
configuration (V1-on/V2-off) that file tests. That whole file is also
excluded from the default Playwright run by
`playwright.config.ts:216`'s `testIgnore: [...quarantineIgnore(),
/flows[\/]config-f[\/]/]`, running only under the opt-in
`config-f-smoke` project. A Support-hub-Mentor-surface return case cannot
exist there: the tab it needs is asserted invisible in the very
configuration the file exercises, and the file wouldn't run in CI even if it
could. The other candidate, `j29-supporter-scope-journey.spec.ts` (in the
default-running `later-phases` project, already covering supporter scope),
seeds the supporter landing directly on the Support-hub surface
(`landingTestId: 'support-hub-mentor-tab'`) and never starts from Me or
exercises a return-to-Me assertion; covering this specific transition there
would need new seed fixtures (a supporter account with a Me scope), which is
real scope creep beyond this rework's three named gaps. The new co-located
jest test asserts real testIDs on real rendered components
(`support-hub-mentor-tab` / `mentor-screen` presence and absence, not a
mocked surface) for both the scope-behavior and the visible-layout portions
of the return path, so it is treated here as satisfying both, with no e2e
case added. This finding was independently verified by the requesting
session against the same line numbers during rework. A follow-up to add
proper seed fixtures for a Me-and-supporter-scope e2e journey is left as
backlog if a full pixel-rendered proof is later wanted.
