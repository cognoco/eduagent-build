// ---------------------------------------------------------------------------
// [WI-132] LLM call-site manifest — forward-only ratchet
//
// Two explicit lists of files in apps/api/src/ that import routeAndCall or
// routeAndStream from services/llm. The companion guard test
// (metering.coverage.guard.test.ts) enforces three invariants:
//   1. Every authenticated HTTP-route LLM call site appears in
//      LLM_CALL_SITE_FILES and is reachable from a metered route pattern.
//   2. Every entry in either list still contains an LLM call (no stale
//      entries).
//   3. No file appears in both lists.
//
// Adding a new file that calls routeAndCall/routeAndStream forces a choice:
//   - Cover it via the HTTP metering allowlist → add to LLM_CALL_SITE_FILES.
//   - Mark it as out-of-scope for HTTP metering (Inngest jobs, internal
//     test-only seed routes, scripts) → add to LLM_CALL_SITE_EXEMPT with a
//     short rationale.
//
// Paths are relative to the repo root (the worktree root). The guard test
// resolves them from process.cwd() up to the nearest pnpm-workspace anchor.
// ---------------------------------------------------------------------------

/**
 * Files under apps/api/src/ that contain an LLM provider invocation
 * (routeAndCall or routeAndStream) and are reachable from a metered HTTP
 * route pattern in LLM_ROUTE_PATTERNS_ANY_METHOD or
 * LLM_ROUTE_PATTERNS_POST_ONLY. The HTTP metering middleware is the trust
 * boundary for everything in this list.
 *
 * Excludes:
 *   - services/llm/* (the LLM router implementation itself).
 *   - *.test.ts files (test code; runtime guard ignores them).
 *   - Inngest functions (see LLM_CALL_SITE_EXEMPT — covered by Inngest
 *     idempotency / DB claim patterns, not by the HTTP metering middleware).
 */
export const LLM_CALL_SITE_FILES: readonly string[] = [
  'apps/api/src/routes/filing.ts',
  'apps/api/src/services/assessments.ts',
  'apps/api/src/services/book-generation.ts',
  'apps/api/src/services/book-suggestion-generation.ts',
  'apps/api/src/services/challenge-round/grader.ts',
  'apps/api/src/services/curriculum.ts',
  'apps/api/src/services/dictation/generate.ts',
  'apps/api/src/services/dictation/prepare-homework.ts',
  'apps/api/src/services/dictation/review.ts',
  'apps/api/src/services/exchanges.ts',
  'apps/api/src/services/filing.ts',
  'apps/api/src/services/graded-input-generation.ts',
  'apps/api/src/services/language-detect.ts',
  'apps/api/src/services/learner-input.ts',
  'apps/api/src/services/learner-profile.ts',
  'apps/api/src/services/learning-text-safety/judge.ts',
  'apps/api/src/services/mentor-notices/recheck-judge.ts',
  'apps/api/src/services/ocr.ts',
  'apps/api/src/services/parking-lot.ts',
  'apps/api/src/services/progress-summary.ts',
  'apps/api/src/services/quiz/generate-round.ts',
  'apps/api/src/services/recall-bridge.ts',
  'apps/api/src/services/retention-data.ts',
  'apps/api/src/services/session/session-topic-matcher.ts',
  'apps/api/src/services/subject-classify.ts',
  'apps/api/src/services/subject-resolve.ts',
  'apps/api/src/services/summaries.ts',
  'apps/api/src/services/teach-back-grader.ts',
];

/**
 * Files under apps/api/src/ that contain an LLM provider invocation but are
 * intentionally NOT covered by the HTTP metering middleware. Each entry must
 * be justified in a sibling comment.
 */
export const LLM_CALL_SITE_EXEMPT: readonly string[] = [
  // Inngest functions are background jobs, not HTTP routes. They cannot be
  // gated by meteringMiddleware (no Hono context). Quota safety for these
  // sites is provided by:
  //   (a) Inngest idempotency on event dispatch (deterministic event id
  //       prevents duplicate invocation).
  //   (b) DB-level claim flags before the LLM call (e.g. topicsGenerated /
  //       retryInFlight in curriculum jobs) which short-circuit replays.
  // Covered by separate WPs (WI-125 etc.).
  'apps/api/src/inngest/functions/auto-file-session.ts',
  'apps/api/src/inngest/functions/freeform-filing.ts',
  'apps/api/src/inngest/functions/post-session-suggestions.ts',
  // Service modules whose LLM-calling functions are only invoked from Inngest
  // (background jobs). Routes may import other (DB-only) functions from these
  // files, but the LLM call path is not HTTP-reachable. Listed here so a
  // future PR adding a routeAndCall to one of these files doesn't silently
  // expose an unmetered LLM endpoint — the guard test will fail until either
  // the file moves to LLM_CALL_SITE_FILES (and a route pattern is added) or
  // a new Inngest-only LLM call site is justified in this comment.
  'apps/api/src/services/homework-summary.ts',
  'apps/api/src/services/memory/dedup-llm.ts',
  'apps/api/src/services/monthly-report.ts',
  // Post-display suitability judge (MMT-ADR-0016 §7 phase 4). `runSuitabilityJudge`
  // is invoked only from the Inngest function judge-suitability.ts — a background
  // calibration call, never HTTP-reachable. It must NOT consume the learner's
  // quota (it is a system call, not a user-initiated feature), so it is exempt
  // from the HTTP metering middleware by design.
  'apps/api/src/services/policy-engine/judge-suitability.ts',
  'apps/api/src/services/session-highlights.ts',
  'apps/api/src/services/session-llm-summary.ts',
  'apps/api/src/services/session-recap.ts',
  'apps/api/src/services/session/topic-probe-extraction.ts',
  'apps/api/src/services/vocabulary-extract.ts',
  // The test-only seed route bypasses auth (gated by TEST_SEED_SECRET) and is
  // not deployed in production builds. It calls routeAndCall to seed
  // synthetic LLM exchanges for E2E setup. Out of scope for paying-customer
  // metering.
  'apps/api/src/routes/test-seed.ts',
  // The metering middleware file itself imports nothing from services/llm
  // today; it appears in the grep result because it re-exports billing
  // helpers. If the grep ever picks it up, it would belong here.
  'apps/api/src/middleware/metering.ts',
];

export interface GranularLlmConsentServiceBoundary {
  serviceFile: string;
  serviceStartToken: string;
  serviceEndToken: string;
  preConsentBranchTokens?: readonly string[];
  consentGateToken: string;
  llmDispatchToken: string;
  llmCallSiteFile: string;
}

export interface GranularLlmConsentBoundary {
  id: string;
  routeFile: string;
  routeStartToken: string;
  routeEndToken: string;
  routeServiceCallTokens: readonly string[];
  serviceBoundaries: readonly GranularLlmConsentServiceBoundary[];
}

export interface RouteOwnedLlmConsentBoundary {
  id: string;
  routeFile: string;
  routeStartToken: string;
  routeEndToken: string;
  classification:
    | 'route-owned'
    | 'route-discriminant'
    | 'independent-mixed-residue';
  rationale: string;
}

/**
 * Exhaustive inventory of consent assertions that remain in request-time
 * route code. Inclusion is not semantic approval: each entry must state
 * whether the route owns the boundary, gates a fail-closed discriminant, or
 * is independently deliverable mixed-route residue. The companion guard
 * discovers every production assertion and requires exactly one classified
 * segment, so a new route-entry gate cannot arrive silently. Service-owned
 * mixed routes belong in GRANULAR_LLM_CONSENT_BOUNDARIES instead.
 */
export const ROUTE_OWNED_LLM_CONSENT_BOUNDARIES: readonly RouteOwnedLlmConsentBoundary[] =
  [
    {
      id: 'dictation.prepare-homework',
      routeFile: 'apps/api/src/routes/dictation.ts',
      routeStartToken: "'/dictation/prepare-homework'",
      routeEndToken: ".post('/dictation/generate'",
      classification: 'route-owned',
      rationale:
        'Validated requests delegate to the LLM-backed homework parser.',
    },
    {
      id: 'dictation.generate',
      routeFile: 'apps/api/src/routes/dictation.ts',
      routeStartToken: ".post('/dictation/generate'",
      routeEndToken: "'/dictation/review'",
      classification: 'route-owned',
      rationale:
        'The route assembles context before its dictation-generation dispatch.',
    },
    {
      id: 'dictation.review',
      routeFile: 'apps/api/src/routes/dictation.ts',
      routeStartToken: "'/dictation/review'",
      routeEndToken: '',
      classification: 'independent-mixed-residue',
      rationale:
        'Rate-limit and payload-size branches still follow the route gate.',
    },
    {
      id: 'curriculum.topic-preview',
      routeFile: 'apps/api/src/routes/curriculum.ts',
      routeStartToken: "'/subjects/:subjectId/curriculum/topics'",
      routeEndToken: "'/subjects/:subjectId/curriculum/challenge'",
      classification: 'route-discriminant',
      rationale:
        "mode='create' bypasses the gate; all other and future modes fail closed.",
    },
    {
      id: 'curriculum.challenge',
      routeFile: 'apps/api/src/routes/curriculum.ts',
      routeStartToken: "'/subjects/:subjectId/curriculum/challenge'",
      routeEndToken: "'/subjects/:subjectId/curriculum/adapt'",
      classification: 'route-owned',
      rationale:
        'The accepted challenge request delegates to curriculum generation.',
    },
    {
      id: 'curriculum.topic-explanation',
      routeFile: 'apps/api/src/routes/curriculum.ts',
      routeStartToken:
        ".get('/subjects/:subjectId/curriculum/topics/:topicId/explain'",
      routeEndToken: '',
      classification: 'route-owned',
      rationale:
        'The accepted explanation request delegates to the LLM-backed explainer.',
    },
    {
      id: 'homework.ocr',
      routeFile: 'apps/api/src/routes/homework.ts',
      routeStartToken: ".post('/ocr'",
      routeEndToken: '',
      classification: 'independent-mixed-residue',
      rationale:
        'Content-length, multipart, MIME, and file-size returns still follow the route gate.',
    },
    {
      id: 'quiz.round-generation',
      routeFile: 'apps/api/src/routes/quiz.ts',
      routeStartToken: 'async function generateRoundFromInput(',
      routeEndToken: 'export const quizRoutes',
      classification: 'route-discriminant',
      rationale:
        "activityType='capitals' bypasses the gate; unknown future values fail closed.",
    },
    {
      id: 'subjects.resolve',
      routeFile: 'apps/api/src/routes/subjects.ts',
      routeStartToken: "'/subjects/resolve'",
      routeEndToken: "'/subjects/classify'",
      classification: 'route-owned',
      rationale:
        'The validated resolver request directly invokes its LLM-backed service.',
    },
    {
      id: 'subjects.classify',
      routeFile: 'apps/api/src/routes/subjects.ts',
      routeStartToken: "'/subjects/classify'",
      routeEndToken: ".get('/subjects'",
      classification: 'route-owned',
      rationale:
        'The validated classifier request directly invokes its LLM-backed service.',
    },
    {
      id: 'assessments.quick-check',
      routeFile: 'apps/api/src/routes/assessments.ts',
      routeStartToken: "'/sessions/:sessionId/quick-check'",
      routeEndToken: '',
      classification: 'independent-mixed-residue',
      rationale:
        'The deterministic missing-session response still follows the route gate.',
    },
    {
      id: 'filing.request',
      routeFile: 'apps/api/src/routes/filing.ts',
      routeStartToken: ".post('/filing',",
      routeEndToken: '',
      classification: 'route-owned',
      rationale: 'The request-time filing path owns its direct LLM dispatch.',
    },
    {
      id: 'learner-profile.tell-self',
      routeFile: 'apps/api/src/routes/learner-profile.ts',
      routeStartToken: "'/learner-profile/tell'",
      routeEndToken: "'/learner-profile/:profileId/tell'",
      classification: 'route-owned',
      rationale:
        'The learner parser dispatches for every validated tell request.',
    },
    {
      id: 'learner-profile.tell-charge',
      routeFile: 'apps/api/src/routes/learner-profile.ts',
      routeStartToken: "'/learner-profile/:profileId/tell'",
      routeEndToken: "'/learner-profile/unsuppress'",
      classification: 'route-owned',
      rationale:
        'The charge parser dispatches for every validated tell request.',
    },
  ];

/**
 * Mixed deterministic/LLM HTTP routes whose consent gate must remain inside
 * the service at the last branch before LLM dispatch. The companion guard
 * rejects both regressions: restoring an unconditional route-entry gate, or
 * moving/removing a service gate so an LLM-ready branch can bypass it.
 */
export const GRANULAR_LLM_CONSENT_BOUNDARIES: readonly GranularLlmConsentBoundary[] =
  [
    {
      id: 'books.generate-topics',
      routeFile: 'apps/api/src/routes/books.ts',
      routeStartToken: "'/subjects/:subjectId/books/:bookId/generate-topics'",
      routeEndToken: "'/subjects/:subjectId/books/:bookId/sessions'",
      routeServiceCallTokens: [
        'repairIncompleteBookGenerationClaim(',
        'expandExistingBookTopics(',
        'generateBookTopicsWithFallback(',
      ],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/curriculum.ts',
          serviceStartToken:
            'export async function generateBookTopicsWithFallback(',
          serviceEndToken: 'export async function expandExistingBookTopics(',
          consentGateToken: 'assertConsent(',
          llmDispatchToken: 'deps.generateBookTopics(',
          llmCallSiteFile: 'apps/api/src/services/book-generation.ts',
        },
      ],
    },
    {
      id: 'sessions.first-curriculum',
      routeFile: 'apps/api/src/routes/sessions.ts',
      routeStartToken: "'/subjects/:subjectId/sessions/first-curriculum'",
      routeEndToken: "'/subjects/:subjectId/sessions'",
      routeServiceCallTokens: ['startFirstCurriculumSession('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/session/session-crud.ts',
          serviceStartToken: 'async function materializeFocusedBookTopics(',
          serviceEndToken: 'const sessionCrudDependencies =',
          consentGateToken: 'sessionCrudDependencies.assertLlmConsent(',
          llmDispatchToken: 'generateBookTopics(',
          llmCallSiteFile: 'apps/api/src/services/book-generation.ts',
        },
        {
          serviceFile: 'apps/api/src/services/session/session-topic-matcher.ts',
          serviceStartToken: 'export async function matchTopicByIntent(',
          serviceEndToken: '',
          consentGateToken: 'deps.assertLlmConsent(',
          llmDispatchToken: 'deps.runTopicIntentMatcher(',
          llmCallSiteFile:
            'apps/api/src/services/session/session-topic-matcher.ts',
        },
      ],
    },
    {
      id: 'subjects.create',
      routeFile: 'apps/api/src/routes/subjects.ts',
      routeStartToken:
        ".post('/subjects', zValidator('json', subjectCreateSchema)",
      routeEndToken: '.put(',
      routeServiceCallTokens: ['createSubjectWithStructure('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/subject.ts',
          serviceStartToken:
            'export async function createSubjectWithStructure(',
          serviceEndToken: 'export async function getSubject(',
          consentGateToken: 'consentGate(',
          llmDispatchToken: 'detectSubjectType(',
          llmCallSiteFile: 'apps/api/src/services/book-generation.ts',
        },
      ],
    },
    {
      id: 'assessments.answer',
      routeFile: 'apps/api/src/routes/assessments.ts',
      routeStartToken: "'/assessments/:assessmentId/answer'",
      routeEndToken: "'/assessments/:assessmentId/decline-refresh'",
      routeServiceCallTokens: ['submitAssessmentAnswer('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/assessments.ts',
          serviceStartToken: 'export async function submitAssessmentAnswer(',
          serviceEndToken: 'export async function evaluateQuickCheckAnswer(',
          consentGateToken: 'deps.assertLlmConsent(',
          llmDispatchToken: 'deps.evaluateAssessmentAnswer(',
          llmCallSiteFile: 'apps/api/src/services/assessments.ts',
        },
      ],
    },
    {
      id: 'retention.recall-test',
      routeFile: 'apps/api/src/routes/retention.ts',
      routeStartToken: "'/retention/recall-test'",
      routeEndToken: "'/retention/relearn'",
      routeServiceCallTokens: ['processRecallTest('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/retention-data.ts',
          serviceStartToken: 'export async function processRecallTest(',
          serviceEndToken: 'export async function startRelearn(',
          preConsentBranchTokens: [
            'if (!canRetestTopic(state, lastTestAt)) {',
            "if (attemptMode !== 'dont_remember') {",
            'if (!claimed) {',
          ],
          consentGateToken: 'await assertLlmConsent(',
          llmDispatchToken: 'await evaluateRecallQuality(',
          llmCallSiteFile: 'apps/api/src/services/retention-data.ts',
        },
      ],
    },
    {
      id: 'book-suggestions.topup',
      routeFile: 'apps/api/src/routes/book-suggestions.ts',
      routeStartToken: "'/subjects/:subjectId/book-suggestions/topup'",
      routeEndToken: "'/subjects/:subjectId/book-suggestions/all'",
      routeServiceCallTokens: ['getUnpickedBookSuggestionsWithTopup('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/suggestions.ts',
          serviceStartToken:
            'export async function getUnpickedBookSuggestionsWithTopup(',
          serviceEndToken: '',
          consentGateToken: 'consentGate(',
          llmDispatchToken: 'generateCategorizedBookSuggestions(',
          llmCallSiteFile:
            'apps/api/src/services/book-suggestion-generation.ts',
        },
      ],
    },
    {
      id: 'sessions.summary.submit',
      routeFile: 'apps/api/src/routes/sessions.ts',
      routeStartToken: '// Submit learner summary ("Your Words")',
      routeEndToken: '// Start an interleaved retrieval session',
      routeServiceCallTokens: ['submitSummary('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/session/session-summary.ts',
          serviceStartToken: 'export async function submitSummary(',
          serviceEndToken: 'const SUMMARY_FEEDBACK_RETRY_COOLDOWN_MS',
          consentGateToken: 'deps.assertLlmConsent(',
          llmDispatchToken: 'deps.evaluateSummary(',
          llmCallSiteFile: 'apps/api/src/services/summaries.ts',
        },
      ],
    },
    {
      id: 'sessions.summary.retry-feedback',
      routeFile: 'apps/api/src/routes/sessions.ts',
      routeStartToken:
        '// Retry AI feedback for an already-saved learner summary.',
      routeEndToken: '// Submit learner summary ("Your Words")',
      routeServiceCallTokens: ['retrySummaryFeedback('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/session/session-summary.ts',
          serviceStartToken: 'export async function retrySummaryFeedback(',
          serviceEndToken: '',
          consentGateToken: 'deps.assertLlmConsent(',
          llmDispatchToken: 'deps.evaluateSummary(',
          llmCallSiteFile: 'apps/api/src/services/summaries.ts',
        },
      ],
    },
    {
      id: 'sessions.recall-bridge',
      routeFile: 'apps/api/src/routes/sessions.ts',
      routeStartToken:
        '// Generate recall bridge questions after homework success',
      routeEndToken: 'function qualityRatingFromSummaryStatus(',
      routeServiceCallTokens: ['generateRecallBridge('],
      serviceBoundaries: [
        {
          serviceFile: 'apps/api/src/services/recall-bridge.ts',
          serviceStartToken: 'export async function generateRecallBridge(',
          serviceEndToken: 'function buildRecallBridgePrompt(',
          consentGateToken: 'deps.assertLlmConsent(',
          llmDispatchToken: 'deps.routeAndCall(',
          llmCallSiteFile: 'apps/api/src/services/recall-bridge.ts',
        },
      ],
    },
  ];
