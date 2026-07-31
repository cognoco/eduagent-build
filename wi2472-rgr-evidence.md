# WI-2472 — Red-Green-Revert Evidence

Bug: a V2-shell learner who types an app-navigation question **as an assessment
answer** was answered from the retired V0 destination map. The active app shell
was never threaded past the mobile send, so `buildAppHelpDirectReply` fell
through to its safe `'v0'` default on every call from the assessment-answer path.

Discriminating query: `"Where are my notes?"` — its V0 reply names
`Home > My Notes > Notes` / `Library`, its V2 reply names `Journal tab, under
Notes`. The two branches never share a fallback, so the assertion is real.

## Method

Each layer's **body-only** pass-through was reverted in turn; the widened
signatures/schema stayed in place, so every RED below is a genuine assertion
failure showing V0 behaviour where V2 was expected — not a compile error.
Driver ran GREEN → REVERT(RED) → RESTORE(GREEN) per layer.

Commands (from repo root):

```
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage <spec> [-t <filter>]
node --max-old-space-size=6144 ./node_modules/jest/bin/jest.js \
  --config apps/mobile/jest.config.cjs --runInBand --forceExit --no-coverage <spec> -t "WI-2472"
```

## Cycles

| Layer | Reverted pass-through | GREEN | RED (reverted) | GREEN (restored) |
|---|---|---|---|---|
| A. service body (`services/assessments.ts`) | `buildAppHelpDirectReply(answer, shell)` → `(answer)` | 5 passed | 4 passed / **1 failed** | 5 passed |
| B. service caller seam (`services/assessments.ts`) | dropped `options.shell` from the `buildAssessmentAppHelpEvaluation(...)` call | 4 passed | 1 passed / **3 failed** | 4 passed |
| C. route body (`routes/assessments.ts`) | dropped `shell` from the `submitAssessmentAnswer` options | 4 passed | 2 passed / **2 failed** | 4 passed |
| D. mobile body (`hooks/use-assessments.ts`) | dropped `shell:` from the answer request body | 2 passed | 0 passed / **2 failed** | 2 passed |
| E. mobile body — rider (`hooks/use-sessions.ts`) | dropped `shell:` from the non-stream message body | 2 passed | 0 passed / **2 failed** | 2 passed |

### Failing tests and observed values

**Layer A** — `apps/api/src/services/assessments.test.ts`
- ✗ `buildAssessmentAppHelpEvaluation › answers a v2 learner from the V2 destination map`
- The explicit-`'v0'` and missing-shell cases stayed green throughout, confirming
  the V2 case is the discriminator and the V0 fallback is genuinely preserved.

**Layer B** — `apps/api/src/services/assessments-submit-answer.test.ts`
- ✗ `forwards the reported v2 shell…` — `Expected: "Where are my notes?", 0.4, "v2"` / `Received: "Where are my notes?", 0.4`
- ✗ `forwards the reported v0 shell…` — `Expected: …, "v0"` / `Received: "Where are my notes?", 0.4`
- ✗ `forwards no shell when the caller reported none` — `Expected: …, undefined` / `Received: "Where are my notes?", 0.4`

**Layer C** — `apps/api/src/routes/assessments.test.ts`
- ✗ `threads a reported v2 shell into the service call` — `Expected: … ObjectContaining {"shell": "v2"}`, received options without `shell`
- ✗ `threads a reported v0 shell into the service call` — same shape for `"v0"`
- The no-shell case and the strict-schema rejection case (`shell: 'v1'` → 400,
  service never called) stayed green — the route's own reject path is
  independent of the pass-through.

**Layer D** — `apps/mobile/src/hooks/use-assessments.test.ts`
- ✗ `reports shell v2 when MODE_NAV_V2_ENABLED is on`
- ✗ `reports shell v0 when MODE_NAV_V2_ENABLED is off`

**Layer E** — `apps/mobile/src/hooks/use-sessions.test.ts`
- ✗ `reports shell v2 when MODE_NAV_V2_ENABLED is on`
- ✗ `reports shell v0 when MODE_NAV_V2_ENABLED is off`

## Outcome

Final worktree state has all five pass-throughs applied (restore step). Both
mobile flag states are asserted explicitly — neither test relies on the ambient
default. Invalid shell values are rejected by `assessmentAnswerSchema` before
reaching the service, so a malformed value can never select V2.
