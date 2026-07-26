## What was done

Replaced the WI-2234 held-response Request-wrapper identity comparison with a
stable discriminator established before the held request is released.

## What changed

The routed request now receives a unique correlation query value. After release,
that single capture-guarded route fetches the exact correlated GET response,
verifies its URL, fulfills the browser route, and resolves a route-owned response
promise. It no longer tries to rediscover the response through a later Playwright
Request wrapper. Adjacent scopes, the wrong method, and disabled capture cannot
own the lifecycle. No production code changed.

## Verification

The original matcher seam and the later continued-URL lifecycle mismatch were
both executed red then green. The corrected focused seam initially passed 4/4,
including the retained and cleared 15-second response bound. Review follow-up
coverage also proves that a mismatched fetched URL rejects with the exact
diagnostic and never fulfills the route; the current focused suite passes 5/5.
The real returning-learner journey passes 3/3 against staging with retries
disabled while retaining the original Session-held, fresh-response, Mentor, and
card guarantees. Style, lint, GC1, mobile typecheck, and the branch-scoped
TypeScript build gate pass. The complete local V2 gate passed WI-2234 under
normal four-worker parallelism and failed only the independently owned WI-2822
assertion. Hosted E2E Web run `30224090382` on implementation head `83c6d29d`
then passed V2 16/16 and required-stable legacy 24/24.

## Caveats / Follow-ups

Hosted E2E Web run `30223075316` on the pre-correction head demonstrated the
continued-URL response-wrapper mismatch by timing out the WI-2234 journey twice.
The deterministic seam reproduces and corrects that exact failure, and hosted
run `30224090382` re-established E2E strict green on the corrected implementation.
The review follow-up changes only focused test coverage and evidence wording;
its resulting head still requires the normal required checks before landing.
WI-2822 remains separately owned through PR #2658; this change does not duplicate
or absorb it.

After the implementation commit was published, the branch was externally
advanced by merging current `origin/main`. The executor did not author or
initiate that merge. Exact provenance, reflog and remote-ref evidence, an
identical before/after WI patch hash, and the subsequent exact-head hosted gate
are recorded in `verification.md` and `evidence.json`.
