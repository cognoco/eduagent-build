# WI-2838 red-green evidence

## RED — legacy wrapper identity at the reproducing seam

Command:

```text
pnpm exec jest apps/mobile/e2e-web/helpers/held-now-request.test.ts --runInBand --no-coverage
```

Executed before the stable matcher was implemented. The helper reproduced the
legacy predicate by comparing the routed request wrapper directly with the
response-side wrapper. The two wrappers exposed the same GET method and exact
correlated URL but were distinct objects.

Result: exit 1. The named case `matches the exact held request across distinct
lifecycle wrappers` failed with `Expected: true`, `Received: false`; the
adjacent-request rejection case passed.

## GREEN — stable exact discriminator

The matcher was changed to compare the request method and complete correlated
URL. A unique correlation query value is attached only to the held request
before its release.

The same command then exited 0 with all three focused cases passing:

- distinct lifecycle wrappers match;
- the explicit correlation is added to the exact held URL;
- adjacent self/supporter-hub URLs and the wrong method do not match.

## Real-browser proof

The WI-2234 named Playwright journey passed once and then three repeated times
against staging with `--workers=1 --retries=0 --no-deps`. The journey retained
its original hold/release, Session-active, successful fresh response, Mentor
arrival, and exact-card assertions.

The complete `v2-release` project was also executed with `--retries=0`. Its
WI-2234 journey passed. The run finished with 15 passing cases and one failure
in `nav-shell.spec.ts`; that independent stale doorway assertion is already
owned by WI-2822 and corrected on open PR #2658.

## BOUNCE RED — continued URL absent from response wrapper

Hosted exact-head E2E Web run `30223075316` on `fe52d114` timed out at the
response matcher in the WI-2234 journey on both the initial attempt and its
workflow retry. The gate classified the failure as product, demonstrating that
`route.continue({ url })` did not provide a stable correlated URL through the
later `response.request()` wrapper.

The focused lifecycle seam then reproduced that mismatch deterministically: a
routed request created the correlated discriminator while the later synthetic
response wrapper retained the original URL. The focused Jest command exited 1;
`keeps ownership when the response lifecycle hides the continued URL rewrite`
failed with `Expected: true`, `Received: false` (1 failed, 3 passed).

## BOUNCE GREEN — route-owned exact response

The capture-guarded route now owns the lifecycle after release: it fetches the
exact correlated GET URL, verifies the returned response URL, fulfills the
browser route with that response, and resolves the route-owned response promise.
No response-side Request wrapper is used. The same focused Jest command exited
0 with 4/4 passing, including the retained and cleared 15-second response bound.

The corrected named staging journey then passed 3/3 with
`--workers=1 --retries=0 --repeat-each=3 --no-deps`, retaining every original
Session, response success/freshness, Mentor, and exact-card assertion.
