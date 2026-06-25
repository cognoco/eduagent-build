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
  'apps/api/src/services/curriculum.ts',
  'apps/api/src/services/dictation/generate.ts',
  'apps/api/src/services/dictation/prepare-homework.ts',
  'apps/api/src/services/dictation/review.ts',
  'apps/api/src/services/exchanges.ts',
  'apps/api/src/services/filing.ts',
  'apps/api/src/services/language-detect.ts',
  'apps/api/src/services/learner-input.ts',
  'apps/api/src/services/learner-profile.ts',
  'apps/api/src/services/ocr.ts',
  'apps/api/src/services/parking-lot.ts',
  'apps/api/src/services/progress-summary.ts',
  'apps/api/src/services/quiz/generate-round.ts',
  'apps/api/src/services/recall-bridge.ts',
  'apps/api/src/services/retention-data.ts',
  'apps/api/src/services/session/session-crud.ts',
  'apps/api/src/services/subject-classify.ts',
  'apps/api/src/services/subject-resolve.ts',
  'apps/api/src/services/summaries.ts',
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
  'apps/api/src/services/session/session-depth.ts',
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
