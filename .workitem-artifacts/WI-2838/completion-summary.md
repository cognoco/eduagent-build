## What was done

Replaced the WI-2234 held-response Request-wrapper identity comparison with a
stable discriminator established before the held request is released.

## What changed

The routed request now receives a unique correlation query value. After release,
that single capture-guarded route fetches the exact correlated GET response,
verifies its URL, fulfills the browser route, and resolves a route-owned response
promise. It no longer tries to rediscover the response through a later Playwright
Request wrapper. The capture guard now requires the exact `/v1/now` pathname and
rejects adjacent scopes, the wrong method, disabled capture, and requests that are
already correlated. No production code changed.

## Verification

The original matcher seam and the later continued-URL lifecycle mismatch were
both executed red then green. A mutation that removed `route.fulfill` failed the
focused lifecycle assertion before the implementation was restored. The final
focused seam passes 5/5, including exact-path/adjacent-request rejection,
response URL verification, and the retained and cleared 15-second response
bound. The independently corrected returning-learner journey passes 5/5 against
staging with one worker and retries disabled while retaining the original
Session-held, fresh-response, Mentor, and card guarantees. Style, lint, GC1,
mobile typecheck, and the branch-scoped TypeScript build gate pass.

Hosted E2E Web run `30224090382` on implementation head `83c6d29d` passed the
complete V2 gate 16/16, classified it as success, passed required-stable legacy
Playwright 24/24, and completed the staging reset. The reconciled head must still
re-establish every required hosted check before landing.

## Caveats / Follow-ups

Hosted E2E Web run `30223075316` on the pre-correction head demonstrated the
continued-URL response-wrapper mismatch by timing out the WI-2234 journey twice.
The deterministic seam reproduces and corrects that exact failure, and hosted
run `30224090382` re-established E2E strict green on the corrected implementation.
Flag-ON CI on `83c6d29d` separately failed only
`weekly-progress-push.integration.test.ts` (`queuedParents` expected at least one,
received zero); the WI-2838 diff contains no API files and 151 other API suites
passed, so that failure is retained as unrelated hosted evidence rather than
being attributed to this E2E-only change.

After the implementation commit was published, the branch was externally
advanced by merging current `origin/main`. The executor did not author or
initiate that merge. Exact provenance, reflog and remote-ref evidence, an
identical before/after WI patch hash, and the subsequent exact-head hosted gate
are recorded in `verification.md` and `evidence.json`.

After that executor disappeared, an independent rework in an isolated worktree
produced commit `6de10687`, verified the stronger exact guard locally, and then
normal-merged remote head `83c6d29d`. No rebase, reset, force-push, or history
replacement was used; both histories remain in the reconciled ancestry.
