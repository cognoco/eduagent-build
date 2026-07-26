## What was done

Replaced the WI-2234 held-response Request-wrapper identity comparison with a
stable discriminator established before the held request is released.

## What changed

The routed request now receives a unique correlation query value. Response
selection compares GET plus the complete correlated URL, so a separately
materialized Playwright Request wrapper still matches while adjacent Now
requests cannot. Focused seam coverage exercises wrapper recreation, exact
correlation, adjacent scopes, and the wrong method. No production code changed.

## Verification

The matcher seam was executed red then green. The real returning-learner
journey passed repeatedly against staging with retries disabled, while retaining
the original Session-held, fresh-response, Mentor, and card guarantees. Exact
provenance evidence head then passed hosted E2E Web run
`30222631190`: the complete V2 release project passed 16/16 and the required
legacy lane passed 24/24. Style, lint, GC1, focused Jest, mobile typecheck, and
the local change-class gates passed. The final evidence-only head must
re-establish every required hosted check before landing.

## Caveats / Follow-ups

An earlier local no-retry V2 project passed the WI-2234 journey and exposed
WI-2822's independently owned stale nav-shell doorway assertion. The later
hosted exact-head gate passed both journeys without retries or a copied WI-2822
change. WI-2822 remains separately owned through PR #2658; this change does not
duplicate or absorb it. No WI-2838 caveat remains open.

After the implementation commit was published, the branch was externally
advanced by merging current `origin/main`. The executor did not author or
initiate that merge. Exact provenance, reflog and remote-ref evidence, an
identical before/after WI patch hash, and the subsequent exact-head hosted gate
are recorded in `verification.md` and `evidence.json`.
