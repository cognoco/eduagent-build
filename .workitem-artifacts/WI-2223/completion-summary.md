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

The AC's text sanctions a full `nav-shell.spec.ts` e2e case as the fallback
for AC-3's visible-layout claim if a co-located jest genuinely cannot drive
back/pop navigation. Investigation found this fallback path does not
mechanically fit: `apps/mobile/e2e-web/flows/config-f/nav-shell.spec.ts` is
the only file with that name in the repo, and it is Config-F-scoped
(V1-on/V2-off) — opt-in only, excluded from the default Playwright run by
`playwright.config.ts`'s `testIgnore`, and it asserts the Mentor tab is NOT
visible under that flag configuration, so a Support-hub-Mentor-surface case
cannot exist there. The other candidate, `j29-supporter-scope-journey.spec.ts`
(in the default-running project, already covering supporter scope), seeds
the supporter landing directly on the Support-hub surface and never starts
from Me or exercises a return-to-Me assertion; covering this specific
transition there would need new seed fixtures, which is out of scope for
this rework. The new co-located jest test asserts real testIDs on real
rendered components (`support-hub-mentor-tab` / `mentor-screen` presence and
absence, not a mocked surface) for both the scope-behavior and the
visible-layout portions of the return path, so it is treated here as
satisfying both, with no e2e case added. This finding was raised to the
requesting session during rework; a follow-up to add proper seed fixtures
for a Me-and-supporter-scope e2e journey is left as backlog if a full
pixel-rendered proof is later wanted.
