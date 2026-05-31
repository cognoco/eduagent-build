# [BUG] App-help early-return on /assessments/:id/answer consumes quota without an LLM call

**File:** [`apps/api/src/routes/assessments.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/assessments.ts#L108-L119) (lines 108, 112, 119)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-billing-overcharge`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

POST /assessments/:assessmentId/answer IS metered (middleware/metering.ts:219-222 decrements quota BEFORE the handler runs). Inside the handler, buildAssessmentAppHelpEvaluation(answer, ...) (routes/assessments.ts:108-119) returns a canned non-LLM 'app help' reply and the handler returns 200 immediately — without ever calling the LLM. Because the response status is < 400, the metering middleware's post-handler refund path (shouldRefundAfterHandler, metering.ts:874) does not fire, so the user is charged one quota credit for a deflection that never consumed an LLM exchange. This is a minor billing inaccuracy (over-charge of a paid resource), not a security issue, and it may be intended ('per answer submission' rather than 'per LLM call') — flagged at low confidence so it isn't 'fixed' blindly. Contrast with the deliberate, documented over-bill for curriculum create-mode (metering.ts:183-188), suggesting the team tracks such cases explicitly.

## Recommendation

If quick-check/app-help deflections should be free, either set a `Quota-Refund: skip`-style refund signal or move the app-help short-circuit ahead of metering. Otherwise, document this as an accepted over-bill (as done for curriculum create-mode) so reviewers don't treat it as a defect.

## Revalidation

**Verdict:** true-positive

Verified real. POST /assessments/:assessmentId/answer is metered, so quota is decremented in the middleware before the handler runs. Inside the handler, `buildAssessmentAppHelpEvaluation(answer, ...)` (services/assessments.ts:409-423) returns a non-null canned reply whenever `isAppHelpQuery(answer)` matches — and both `isAppHelpQuery` (regex matchers) and `buildAppHelpDirectReply` (a static string map) make NO LLM call (app-help-map.ts:60-129). The handler then returns 200 immediately (route lines 112-119). The metering refund paths fire only when `c.res.status >= 400` (`shouldRefundAfterHandler`, metering.ts:272-274, 874), so a 200 app-help deflection is not refunded and the user is charged one quota credit for a turn that consumed no LLM exchange. This is a genuine over-charge of a paid resource, but it harms only the user (no attacker advantage, no security boundary), hence BUG severity, not a security issue. Unlike the deliberately-documented curriculum create-mode over-bill (metering.ts:183-188), this deflection is not carved out, so it reads as an oversight; it may nonetheless be an accepted 'per-submission' billing policy. The mechanism is confirmed; only the product intent is ambiguous.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
