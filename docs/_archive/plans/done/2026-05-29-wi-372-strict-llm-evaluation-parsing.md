---
title: WI-372 Strict LLM Evaluation Parsing — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-372]
status: implemented-local-verification
---

# WI-372 Strict LLM Evaluation Parsing — Implementation Plan

**Goal:** Prevent malformed LLM JSON values from driving accepted/passed/escalated assessment state through permissive coercion.
**Approach:** Add strict shared schemas for the two discrete evaluation outputs, use them in the existing parsers, and keep the current conservative fallbacks when parsing fails. Confirm the already-migrated EVALUATE/TEACH_BACK paths with tests and greps rather than changing production code there.

## Scope

In scope:
- `packages/schemas/src/llm-envelope.ts`
- `packages/schemas/src/llm-envelope.test.ts`
- `apps/api/src/services/summaries.ts`
- `apps/api/src/services/summaries.test.ts`
- `apps/api/src/services/assessments.ts`
- `apps/api/src/services/assessments.test.ts`
- `apps/api/src/services/evaluate.test.ts`
- `docs/plans/2026-05-29-wi-372-strict-llm-evaluation-parsing.md`

Out of scope:
- LLM prompt rewrites.
- `apps/api/src/services/exchange-prompts.ts`.
- Changing EVALUATE or TEACH_BACK production parsers beyond evidence tests.
- Database migrations or integration-test-only behavior.

## Tasks

- [x] T1: Add red schema tests for strict discrete evaluation outputs — done when `packages/schemas/src/llm-envelope.test.ts` has tests proving string booleans and string numbers are rejected by `llmSummaryEvaluationSchema` and `llmAssessmentEvaluationSchema`, and those tests fail before schema implementation.
- [x] T2: Add red service tests for summary acceptance coercion — done when `apps/api/src/services/summaries.test.ts` proves an LLM payload with `"isAccepted":"false"` and `"hasUnderstandingGaps":"false"` falls back to `isAccepted=false`, without accepting the summary, and the test fails before parser changes.
- [x] T3: Add red service tests for assessment coercion and NaN handling — done when `apps/api/src/services/assessments.test.ts` proves `"passed":"false"` does not pass, `"shouldEscalateDepth":"false"` does not escalate, and `"rawScore":"abc"` falls back with `masteryScore=0`/`qualityRating=0`, with failures before parser changes.
- [x] T4: Add evidence tests for already-migrated envelope consumers — done when `apps/api/src/services/evaluate.test.ts` confirms string `challenge_passed` in metadata is rejected and legacy prose-embedded JSON remains ignored.
- [x] T5: Implement strict shared schemas and parser usage — done when services import the shared schemas from `@eduagent/schemas`, replace local `Boolean()`/`Number()` coercion with `schema.safeParse(JSON.parse(...))`, preserve existing fallback messages, and T1-T4 pass.
- [x] T6: Verify affected backend scope — done when targeted API/schema tests, `api:lint`, and `api:typecheck` pass, plus greps show no residual state-driving `Boolean(parsed...)`/`Number(parsed...)` in the two fixed parsers and no legacy free-text EVALUATE parser path.

## Tests

T1:
- `summaryEvaluationSchema rejects string booleans`
- `assessmentEvaluationSchema rejects string booleans and string numbers`

T2:
- `evaluateSummary rejects stringified boolean state fields and falls back closed`

T3:
- `evaluateAssessmentAnswer rejects stringified llm pass boolean`
- `evaluateAssessmentAnswer rejects stringified escalation boolean`
- `evaluateAssessmentAnswer falls back when numeric scores are malformed strings`

T4:
- `parseEvaluateAssessment returns null when challenge_passed is a string`
- Existing prose-embedded JSON rejection stays green.

## Verification

- Red tests were observed before implementation in schema, summary, and assessment parser tests.
- Targeted API tests passed:
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/summaries.test.ts apps/api/src/services/assessments.test.ts apps/api/src/services/evaluate.test.ts --no-coverage`
- Review loop 2 targeted API tests passed after tightening assessment state booleans and blank summary feedback:
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/assessments.test.ts apps/api/src/services/summaries.test.ts --no-coverage`
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/summaries.test.ts apps/api/src/services/assessments.test.ts apps/api/src/services/evaluate.test.ts --no-coverage`
- Review loop 3 targeted API tests passed after rejecting contradictory pass state and over-wide weak areas:
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/assessments.test.ts --no-coverage`
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/summaries.test.ts apps/api/src/services/assessments.test.ts apps/api/src/services/evaluate.test.ts --no-coverage`
- Review loop 4 targeted API test passed after rejecting contradictory summary gap state:
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/summaries.test.ts --no-coverage`
- Targeted schema tests passed with `.worktrees` ignore override:
  - `NX_DAEMON=false rtk pnpm exec jest --config packages/schemas/jest.config.cjs --testPathIgnorePatterns '/node_modules/' --testMatch '<rootDir>/src/**/*.test.ts' --runTestsByPath packages/schemas/src/llm-envelope.test.ts --no-coverage`
- Review loop 2 targeted schema tests passed after tightening assessment state booleans and blank summary feedback:
  - `NX_DAEMON=false rtk pnpm exec jest --config packages/schemas/jest.config.cjs --testPathIgnorePatterns '/node_modules/' --testMatch '<rootDir>/src/**/*.test.ts' --runTestsByPath packages/schemas/src/llm-envelope.test.ts --no-coverage`
- Review loop 3 targeted schema tests passed after rejecting contradictory pass state and over-wide weak areas:
  - `NX_DAEMON=false rtk pnpm exec jest --config packages/schemas/jest.config.cjs --testPathIgnorePatterns '/node_modules/' --testMatch '<rootDir>/src/**/*.test.ts' --runTestsByPath packages/schemas/src/llm-envelope.test.ts --no-coverage`
- Review loop 4 targeted schema tests passed after rejecting contradictory summary gap state and blank gap labels:
  - `NX_DAEMON=false rtk pnpm exec jest --config packages/schemas/jest.config.cjs --testPathIgnorePatterns '/node_modules/' --testMatch '<rootDir>/src/**/*.test.ts' --runTestsByPath packages/schemas/src/llm-envelope.test.ts --no-coverage`
- Review loop 4 affected API/schema validation passed:
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/summaries.test.ts apps/api/src/services/assessments.test.ts apps/api/src/services/evaluate.test.ts --no-coverage`
  - `NX_DAEMON=false rtk pnpm exec nx run api:typecheck`
  - `NX_DAEMON=false rtk pnpm exec nx run @eduagent/schemas:typecheck`
  - `NX_DAEMON=false rtk pnpm exec nx run api:lint`
  - `NX_DAEMON=false rtk pnpm exec nx run @eduagent/schemas:lint`
  - `rtk pnpm exec prettier --check docs/plans/2026-05-29-wi-372-strict-llm-evaluation-parsing.md packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/summaries.test.ts`
  - `rtk git diff --check`
- Review loop 5 affected API/schema validation passed after sharing the assessment pass threshold and aligning the assessment integration fixture:
  - `NX_DAEMON=false rtk pnpm exec jest --config packages/schemas/jest.config.cjs --testPathIgnorePatterns '/node_modules/' --testMatch '<rootDir>/src/**/*.test.ts' --runTestsByPath packages/schemas/src/llm-envelope.test.ts --no-coverage`
  - `NX_DAEMON=false rtk pnpm exec jest --config apps/api/jest.config.cjs --runTestsByPath apps/api/src/services/assessments.test.ts apps/api/src/services/summaries.test.ts apps/api/src/services/evaluate.test.ts --no-coverage`
  - `NX_DAEMON=false rtk pnpm exec nx run api:typecheck`
- Review loop 5 targeted integration test was attempted:
  - `rtk pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath tests/integration/assessments-routes.integration.test.ts --runInBand --no-coverage`
  - Result: failed before exercising code because local `DATABASE_URL` is unset and Doppler/env sync is not configured in this worktree.
- API lint passed:
  - `NX_DAEMON=false rtk pnpm exec nx run api:lint`
- API typecheck passed:
  - `NX_DAEMON=false rtk pnpm exec nx run api:typecheck`
- Schema package lint/typecheck passed:
  - `NX_DAEMON=false rtk pnpm exec nx run @eduagent/schemas:lint`
  - `NX_DAEMON=false rtk pnpm exec nx run @eduagent/schemas:typecheck`
- Review loop 2 Prettier check passed for the files modified in that loop:
  - `rtk pnpm exec prettier --check packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/assessments.test.ts apps/api/src/services/summaries.test.ts`
- Review loop 3 Prettier and whitespace checks passed for the files modified in that loop:
  - `rtk pnpm exec prettier --check packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/assessments.test.ts docs/plans/2026-05-29-wi-372-strict-llm-evaluation-parsing.md`
  - `rtk git diff --check`
- Targeted Prettier check passed for all modified files:
  - `rtk pnpm exec prettier --check docs/plans/2026-05-29-wi-372-strict-llm-evaluation-parsing.md packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/summaries.ts apps/api/src/services/summaries.test.ts apps/api/src/services/assessments.ts apps/api/src/services/assessments.test.ts apps/api/src/services/evaluate.test.ts`
- Full API unit target passed:
  - `NX_DAEMON=false rtk pnpm exec nx test api`
  - Result: 295 suites passed, 1 skipped; 5997 tests passed, 3 skipped.
- Required integration target was attempted:
  - `rtk pnpm exec nx test:integration api`
  - Result: failed before exercising code because local `DATABASE_URL` is unset and Doppler/env sync is not configured in this worktree. Final summary: 48 failed suites, 3 passed; failures consistently reported `DATABASE_URL is not set`.
- Residual coercion grep passed with no matches:
  - `rtk rg -n "Boolean\\(parsed\\.(isAccepted|hasUnderstandingGaps|passed|shouldEscalateDepth)|Number\\(parsed\\.(rawScore|qualityRating)" apps/api/src/services/summaries.ts apps/api/src/services/assessments.ts`
- Envelope evidence grep found no legacy free-text parser path in `evaluate.ts`; `teach-back.ts` still contains envelope metadata helper references, not state-driving prose regex parsing.

## Adversarial Review Fixes

- Review loop 1 found a valid must-fix issue: assessment payloads with high scores but no learner-visible `feedback` or `reply` could still drive pass/escalation state. Fixed by requiring nonblank `feedback` or `reply` in `llmAssessmentEvaluationSchema`, with schema and service fallback tests.
- Review loop 1 found a valid should-fix issue: decimal `qualityRating` values could pass parser validation even though downstream assessment contracts use integer quality ratings. Fixed by requiring `qualityRating` to be an integer, with schema and service fallback tests.
- Review loop 2 found a valid must-fix issue: assessment payloads could omit `passed` and `shouldEscalateDepth`, then still drive state through server-side defaults derived from high `rawScore` and `forceDepthProgression`. Fixed by requiring both state booleans in `llmAssessmentEvaluationSchema`, with schema and service fallback tests.
- Review loop 2 included a consider-level finding that blank summary feedback passed `z.string().min(1)`. Because loop 2 already required a must-fix commit, fixed it by trimming summary feedback before the nonblank check, with schema and service fallback tests.
- Review loop 3 found a valid must-fix issue: assessment payloads with contradictory `rawScore` and `passed` state could still pass schema, then state could be derived from the high raw score. Fixed by requiring `passed` to match the `rawScore >= 0.7` threshold, with schema and service fallback tests.
- Review loop 3 found a valid should-fix issue: `weakAreas` accepted entries up to 200 characters while the downstream assessment response contract caps them at 120. Fixed by trimming and capping LLM `weakAreas` entries at 120 characters, with schema and service fallback tests.
- Review loop 4 found a valid must-fix issue: summary payloads with `hasUnderstandingGaps: true` and `isAccepted: true` could pass schema, then accept a summary despite contradictory state. Fixed by rejecting that combination in `llmSummaryEvaluationSchema`, with schema and service fallback tests.
- Review loop 4 included a consider-level finding that whitespace-only `gapAreas` passed validation. Because loop 4 already required a must-fix commit, fixed it by trimming gap labels before the nonblank check, with schema coverage.
- Review loop 5 found a valid should-fix issue: the assessment pass threshold was local to `llm-envelope.ts` while the assessment parser fallback hardcoded the same `0.7` threshold. Fixed by exporting `LLM_ASSESSMENT_PASS_THRESHOLD` from `@eduagent/schemas` and importing it in `assessments.ts`.
- Review loop 5 also surfaced that `tests/integration/assessments-routes.integration.test.ts` had a mocked assessment payload with `passed: true` and `rawScore: 0.45`, which is invalid under the strict schema. Fixed by aligning the fixture score with the pass state.
