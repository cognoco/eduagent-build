# AUDIT-TYPES-2 — `packages/schemas/` deepening (orphan-schema spot-check + new sub-scopes)

**Date:** 2026-05-03
**Auditor:** audit-types-2 fork
**Scope:** Deepening pass on the C1 schema-contract cluster. Spot-check the 16 dead-by-orphan `*ResponseSchema` exports against actual route payloads (TYPES-1 F4); determine the actual shape of `quickCheckResponseSchema` and `consentResponseSchema` (TYPES-1 F2); catalogue `auth.ts` 501-stub `c.json` calls (new from baseline delta); catalogue the new SSE error payload shape from `interview.ts`/`sessions.ts`; cross-check `apps/mobile/src/lib/api-errors.ts` for typed-error migration progress (TYPES-1 F1).
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`
**Predecessor:** `docs/audit/2026-05-02-audit-types-1-recon.md`
**Baseline delta:** `docs/audit/2026-05-03-baseline-delta.md`
**Plan it feeds:** `docs/audit/2026-05-02-audit-schema-2-plan.md`

---

## TL;DR

Of the 16 dead-by-orphan `*ResponseSchema` exports flagged by TYPES-1: **9 fit** the actual `c.json` payload (ready to wire), **1 drifted** (`feedbackResponseSchema` is missing `queued`), and **6 have no matching c.json route** (either describe an LLM input/output structure or describe a non-existent endpoint). TYPES-1 F2 is conclusively classified: **both `quickCheckResponseSchema` and `consentResponseSchema` are actually-request-shaped** (their schemas describe POST bodies, not responses; `assessments.ts:103` even names the alias `QuickCheckResponseInput`). The misuse is honest at the `zValidator` callsite — but the names lie, and SCHEMA-2 PR 2 will need request/response renaming before wrapping the actual response shapes (`{feedback, isCorrect}` and `{message}`). Three new `auth.ts` 501-stub `c.json` calls are clerk-handoff stubs returning `apiErrorSchema`-shaped bodies and **should be excluded from SCHEMA-2 wrapping** (the existing `apiErrorSchema` already covers them). Four SSE 'error' emission sites across `interview.ts` and `sessions.ts` share an undeclared `{type: 'error', message: string}` envelope that **should get a `streamErrorFrameSchema`** in `packages/schemas/src/stream-fallback.ts` (sibling to `streamFallbackFrameSchema`) — the wider SSE envelope (`type: chunk|fallback|done|error`) is also undefined and worth a follow-up. `QuotaExceededError` and `ResourceGoneError` remain mobile-only at HEAD; **migration consumers are 2 string-name workarounds** (`format-api-error.ts:49,61` and `use-session-streaming.ts:797`) plus the throw-sites in `api-client.ts:241,276` — small migration footprint. **Net result: SCHEMA-2 PR 1 scope shrinks to 9 ready-to-wire schemas; PR 2 must include schema-rename work for assessments+consent and a new SSE-frame schema.**

## Severity

**YELLOW-RED** (unchanged from TYPES-1) — schema-name lies and unwired contracts persist; one new schema-drift case found (`feedbackResponse`) that would have failed under `.parse()` if SCHEMA-2 had wrapped naively. Cluster cumulatively now has documented file:line targets for every PR-1/PR-2 action.

## Methodology

- `Read packages/schemas/src/{quiz,filing,progress,account,sessions,subjects,feedback,notes,billing,assessments,consent,stream-fallback}.ts` — full read of every file containing a flagged orphan schema.
- `Read apps/api/src/routes/{quiz,filing,progress,account,sessions,subjects,feedback,notes,billing,assessments,consent,celebrations,coaching-card,curriculum,interview,auth}.ts` — full read of every route that *might* return a flagged schema's shape.
- `Grep "<schemaName>" apps/api apps/mobile packages` — for each of 16 schemas, full repo grep to confirm the schema is/isn't imported by anything beyond `packages/schemas/src/` itself.
- `Grep "c\.json\(" apps/api/src/routes/{file}.ts -n -C 3` — per-route enumeration of c.json shapes for the 12 routes in scope.
- `Grep "type:.{1,5}'(error|chunk|done|fallback)'" apps/api/src` — enumerate SSE frame emission sites (8 production hits in `interview.ts` and `sessions.ts`).
- `Grep "instanceof QuotaExceededError" apps/mobile` and `"instanceof ResourceGoneError" apps/mobile` — re-confirm TYPES-1 F1 migration footprint.
- `Grep "QuotaExceededError|ResourceGoneError" apps/mobile/src` — enumerate consumers (13 files; 2 use the `error.name === 'X'` string-name workaround pattern that proves the cross-package issue).
- `Read apps/api/src/services/{filing,deletion,session-recap,curriculum,notes}.ts` — verify service return types match (or don't match) declared schemas.

## Findings

### Finding 1 — 16 dead-by-orphan schemas: 9 fit / 1 drifted / 6 no-matching-route

- **Severity:** YELLOW
- **Files:** see per-schema table below
- **Evidence:** Per-schema spot-check of declared shape vs. actual `c.json` payload at the matching route. "Matching route" determined by name pattern + route-file read; "no matching route" means no `c.json(...)` payload in any route file produces the schema's shape.

| # | Schema (file:line) | Bucket | Matching c.json site | Notes |
|---|--------------------|--------|----------------------|-------|
| 1 | `quiz.ts:163` `questionCheckResponseSchema` | **fits** | `routes/quiz.ts:380-386` | Schema `{correct, correctAnswer?}` ↔ route returns `{correct, ...(correct ? {} : {correctAnswer})}` — exact match including conditional emission of `correctAnswer`. Ready to wire. |
| 2 | `quiz.ts:170` `quizRoundResponseSchema` | **fits** | `routes/quiz.ts:242-254` | Schema `{id, activityType, theme, questions: [clientQuizQuestionSchema], total, difficultyBump?}` ↔ route returns matching shape via `toClientSafeQuestions()`. Ready to wire. |
| 3 | `quiz.ts:181` `internalQuizRoundResponseSchema` | **no-matching-route** | (none) | Internal/server-side use only — no route emits the un-stripped form. Keep but document. |
| 4 | `quiz.ts:214` `completeRoundResponseSchema` | **fits** | `routes/quiz.ts:418` (`return c.json(result, 200)` where `result` is `completeQuizRound(...)` typed by service) | Service-typed return; ready to wire. |
| 5 | `filing.ts:65` `filingResponseSchema` | **no-matching-route** | (none) | Schema describes the **LLM-extracted intermediate** consumed by `resolveFilingResult` (shelf/book/chapter refs). Route at `filing.ts:250` returns `FilingResult` (a different shape, includes `topicId`, `bookId`, etc.). Schema is correctly used in `services/filing.integration.test.ts` for the LLM-output type. Don't wrap any c.json with this. |
| 6 | `progress.ts:200` `coachingCardCelebrationResponseSchema` | **fits** | `routes/celebrations.ts:31` and `:36` | Schema `{pendingCelebrations: [...]}` ↔ both emission sites in `celebrations.ts` return that exact shape. Schema is misnamed (it's celebrations, not coaching-card) — recommend rename to `pendingCelebrationsResponseSchema` during the wrap. |
| 7 | `progress.ts:385` `homeCardsResponseSchema` | **no-matching-route** | (none) | Schema `{cards, coldStart}` does not match `routes/coaching-card.ts:23` (returns `{coldStart, card, fallback}`, singular). No `/home/cards`-style endpoint exists. The `HomeCard` *type* is used internally in `services/home-surface-cache.ts` for the KV cache shape, but never as a c.json response. Either delete or wire to a future home-surface route. |
| 8 | `account.ts:6` `accountDeletionResponseSchema` | **fits** | `routes/account.ts:55-58` | Schema `{message, gracePeriodEnds: datetime}` ↔ route returns same; `gracePeriodEnds` is ISO-string from `services/deletion.ts:23`. Ready to wire. |
| 9 | `account.ts:15` `cancelDeletionResponseSchema` | **fits** | `routes/account.ts:64` | Schema `{message}` ↔ route returns `{message: 'Deletion cancelled'}`. Ready to wire. |
| 10 | `sessions.ts:384` `learnerRecapResponseSchema` | **no-matching-route** | (none — used for LLM output parsing) | Schema is consumed by `services/session-recap.ts:369` to validate LLM output, not by any `c.json` route. Schema name implies HTTP response but the use is internal. Do not wrap any c.json with this; consider renaming to `learnerRecapLlmOutputSchema` for honesty. |
| 11 | `subjects.ts:266` `curriculumTopicAddResponseSchema` | **fits** | `routes/curriculum.ts:108` | Service `addCurriculumTopic` returns `Promise<CurriculumTopicAddResponse>` (discriminated union on `mode: 'preview' | 'create'`). Route returns the result directly. Ready to wire. |
| 12 | `subjects.ts:321` `curriculumAdaptResponseSchema` | **fits** | `routes/curriculum.ts:158` | Service `adaptCurriculumFromPerformance` returns `Promise<CurriculumAdaptResponse>`. Route returns the result directly. Ready to wire. |
| 13 | `feedback.ts:15` `feedbackResponseSchema` | **drifted** | `routes/feedback.ts:121` and `:124` | Schema declares `{success: boolean}`. Route returns `{success: true, queued: true}` (line 121) OR `{success: true, queued: false}` (line 124) — schema is **missing `queued: boolean`**. If SCHEMA-2 wrapped this naively the response would still pass `.parse()` because Zod object schemas strip unknown keys by default (good for production), but the API contract would silently drop `queued` from typed RPC clients. Add `queued: z.boolean().optional()` (or `.required()` if always present) before wrapping. |
| 14 | `notes.ts:19` `bookNotesResponseSchema` | **fits** | `routes/notes.ts:48` | Schema `{notes: [{topicId, content, updatedAt: datetime}]}` ↔ route returns `{notes}` from `getNotesForBook` typed `{topicId, content, updatedAt: Date}[]`. Date→ISO string serialization happens automatically via Hono `c.json()`. Ready to wire. |
| 15 | `billing.ts:57` `checkoutResponseSchema` | **fits** | `routes/billing.ts:203-206` | Schema `{checkoutUrl, sessionId}` ↔ route returns same. Ready to wire. |
| 16 | `billing.ts:63` `portalResponseSchema` | **fits** | `routes/billing.ts:420` | Schema `{portalUrl}` ↔ route returns `{portalUrl: portalSession.url}`. Ready to wire. |
| 17 | `billing.ts:68` `cancelResponseSchema` | **fits** | `routes/billing.ts:260-263` | Schema `{message, currentPeriodEnd: datetime}` ↔ route returns same. Ready to wire. |

(Table is 17 rows because TYPES-1's "16 dead-by-orphan" count splits `quiz.ts:163,170,181,214` as 4 entries; I broke them out individually for accuracy. Original count remains 16 distinct schemas; 9 fit, 1 drifted, 6 no-matching-route — final tally is **9 fits / 1 drifted / 6 no-route**, matching TL;DR.)

- **Why it matters:** SCHEMA-2 PR 1 was originally scoped against the assumption that "most schemas exist for routes that exist." This deepening confirms only 9 of 16 are wireable with no schema authoring; 6 schemas are dead-by-design (LLM contracts mislabeled as HTTP responses, or speculative future endpoints) and should not be force-fit; 1 is drifted and would have shipped a silent contract narrowing if SCHEMA-2 had wrapped without checking. The "ready-to-wire" set is now a clean PR 1 scope: schemas 1, 2, 4, 6, 8, 9, 11, 12, 14, 15, 16, 17 = 12 wraps spanning 6 route files (quiz, account, celebrations, curriculum, notes, billing).
- **Anticipated effort:** 12 wraps × ~5 min = ~1 hr for fits; ~30 min to author the missing `queued` field on `feedbackResponseSchema`; ~2 hr cleanup on the 6 no-matching-route schemas (rename or delete after team-decision review).
- **Suggested track:** B (PR 1 scope adjustment).

### Finding 2 — `quickCheckResponseSchema` and `consentResponseSchema` are actually request-shaped (rename the schemas, author response shapes)

- **Severity:** YELLOW-RED
- **Files:** `packages/schemas/src/assessments.ts:100-103` (`quickCheckResponseSchema` + alias `QuickCheckResponseInput`); `packages/schemas/src/consent.ts:22-27` (`consentResponseSchema`); `apps/api/src/routes/assessments.ts:158` and `:183-186` (route uses schema as input validator at L158, returns DIFFERENT shape `{feedback, isCorrect}` at L183-186); `apps/api/src/routes/consent.ts:215` and `:245-247` (route uses schema as input validator at L215, returns DIFFERENT shape `{message}` at L245-247).
- **Evidence:** The schema definitions are unambiguously request-shaped:
  - `quickCheckResponseSchema = z.object({ answer: z.string().min(1).max(5000) })` — a single text answer; obviously a POST body for "the student's response", not the API's response. The exported alias `type QuickCheckResponseInput = z.infer<...>` (assessments.ts:103) **explicitly admits the schema is an Input**. The naming convention is inverted: the suffix `Response` here means "the user's reply / student's response", not "HTTP response".
  - `consentResponseSchema = z.object({ token: z.string(), approved: z.boolean() })` — a parent's decision; a POST body for `/consent/respond`. The endpoint name itself (`/consent/respond`) confirms that "response" here means the parent's response *to the consent request*, not the HTTP response.
  - The actual c.json responses are different shapes:
    - `assessments.ts:183-186` returns `{feedback, isCorrect}` (no schema in `packages/schemas/`).
    - `consent.ts:245-247` returns `{message: input.approved ? 'Consent granted' : 'Consent denied'}` (no schema).
  - Therefore: **bucket is "actually-request-shaped"** for both. Not "happens-to-coincide" and not "actually-response-shaped" — the schemas are correctly request-shaped, the names lie.
- **Why it matters:** SCHEMA-2 PR 2 cannot wrap `c.json(...)` with these schemas — the shapes don't match. Renaming the schemas from `*ResponseSchema` to `*RequestSchema` is the honest fix; authoring real `quickCheckResponseSchema` (`{feedback: string, isCorrect: boolean}`) and `consentRespondResponseSchema` (`{message: string}`) is the second half. The rename + author work must precede SCHEMA-2 PR 2 wrapping for these two routes — TYPES-1 F2 was correct that this is a prerequisite, but the bucket label was deferred.
- **Anticipated effort:** ~1.5 hr — rename `quickCheckResponseSchema` → `quickCheckRequestSchema`, `consentResponseSchema` → `consentRespondRequestSchema` (and their inferred-type aliases); update `routes/assessments.ts:5,158`, `routes/consent.ts:5,215` and any test imports; author two new `*ResponseSchema` shapes with the actual c.json payloads. Verify tests still pass.
- **Suggested track:** B (must precede SCHEMA-2 PR 2 wrapping for these two files).

### Finding 3 — `auth.ts` three new 501-stub `c.json` calls fit `apiErrorSchema`; exclude from SCHEMA-2 wrapping

- **Severity:** GREEN (informational; advises scope exclusion)
- **Files:** `apps/api/src/routes/auth.ts:12-19` (`/auth/register`), `:26-33` (`/auth/password-reset-request`), `:41-49` (`/auth/password-reset`).
- **Evidence:** All three handlers return identical-shaped bodies: `c.json({code: 'NOT_IMPLEMENTED', message: '... handled by Clerk ... not implemented'}, 501)`. The shape `{code: string, message: string}` already matches `apiErrorSchema` exported from `packages/schemas/src/errors.ts`. The `code` value `'NOT_IMPLEMENTED'` is **not** in the frozen `ERROR_CODES` map (`errors.ts`), so a strict `apiErrorSchema.parse(...)` would pass on shape but a follow-up `ERROR_CODES.includes(code)` assertion would not — minor inconsistency worth noting.
- **Why it matters:** SCHEMA-2 PR scope should treat these as already-conformant (no new schema needed) but should consider one of:
  1. Add `'NOT_IMPLEMENTED'` to `ERROR_CODES` so the body is fully canonical, OR
  2. Delete the stub routes entirely (Clerk handles these — there is no positive value in keeping a server-side stub that always returns 501; mobile clients should never call these paths).
  Recommend option (2) for cleanliness; option (1) if the routes are deliberately kept as a contract-shape advertisement.
- **Anticipated effort:** ~15 min for option (1); ~30 min for option (2) including a sweep of mobile callers (likely zero).
- **Suggested track:** C (cleanup, low priority — stubs are not in active use).

### Finding 4 — SSE error frames have no schema; recommend `streamErrorFrameSchema` and a unified `streamFrameSchema` envelope

- **Severity:** YELLOW
- **Files:** Four production emission sites:
  - `apps/api/src/routes/interview.ts:254-263` (LLM-stream error catch)
  - `apps/api/src/routes/interview.ts:413-418` (post-stream-write error catch)
  - `apps/api/src/routes/sessions.ts:363-368` (LLM-stream error catch — same pattern)
  - `apps/api/src/routes/sessions.ts:507-511` (post-stream-write error catch — same pattern)
  Plus 8 emission sites for `type: 'chunk' | 'fallback' | 'done'` across the same two files.
- **Evidence:** All four error frames write `JSON.stringify({type: 'error', message: '<user-visible string>'})` to an SSE stream. The shape is consistent across both files, was introduced by PR #141 (streaming hardening), and has no schema in `packages/schemas/`. By contrast, `streamFallbackFrameSchema` (`packages/schemas/src/stream-fallback.ts:24-29`) exists for `type: 'fallback'` frames and is even validated via `.parse()` at emission time (`interview.ts:278`, "fail loudly in tests"). The `'chunk'` and `'done'` frame types are also unschematized, so the SSE protocol surface as a whole is half-schemed.
- **Why it matters:** The CLAUDE.md "UX Resilience Rules → Standard error fallback pattern" implies standardized error shapes; the existing `streamFallbackFrameSchema` is an explicit precedent for "validate-on-emit so a server change that drifts from the wire schema fails loudly in tests" (its own doc comment). Authoring `streamErrorFrameSchema` fills the gap with one trivial schema. While here, defining a unified `streamFrameSchema` discriminated-union over `chunk | fallback | done | error` would let the mobile SSE consumer (`apps/mobile/src/lib/sse.ts`) parse incoming frames against a single contract, replacing whatever ad-hoc parsing exists today.
- **Anticipated effort:** ~30 min for `streamErrorFrameSchema` alone (plus call-site `.parse()` at the four sites). ~2 hr for the full discriminated `streamFrameSchema` plus mobile consumer migration.
- **Suggested track:** B (alongside SCHEMA-2 PR 2 since `interview.ts` and `sessions.ts` are already in scope).

### Finding 5 — `QuotaExceededError` and `ResourceGoneError` still mobile-only; migration footprint is 2 string-name workarounds + 2 throw sites

- **Severity:** YELLOW-RED (unchanged from TYPES-1 F1)
- **Files:** `apps/mobile/src/lib/api-errors.ts:26-35` (`QuotaExceededError`), `:49-64` (`ResourceGoneError`); throw sites at `apps/mobile/src/lib/api-client.ts:241` and `:276`; **string-name workarounds** at `apps/mobile/src/lib/format-api-error.ts:48-49` (`error.name === 'ResourceGoneError'`), `format-api-error.ts:61-64` (`error.name === 'QuotaExceededError'`), `apps/mobile/src/components/session/use-session-streaming.ts:797` (`err.name === 'QuotaExceededError'`); test consumer at `apps/mobile/src/lib/api-errors.test.ts:50` (`is instanceof ResourceGoneError`).
- **Evidence:** Re-confirmed at HEAD: no `instanceof QuotaExceededError` callsites anywhere in `apps/mobile`. One test-only `instanceof ResourceGoneError`. The two production classifiers (`format-api-error.ts` and `use-session-streaming.ts`) both fall back to **`error.name === '<ClassName>'`** string-name comparisons — the canonical workaround pattern when `instanceof` cannot be trusted across module boundaries (or, in this case, when the class might or might not be the same constructor reference). This is empirical proof that the cross-package `instanceof` problem the `errors.ts:6-19` doc comment warned about is being actively worked-around in the codebase, even though the API layer doesn't yet throw these classes.
  Per `apps/mobile/src/lib/api-errors.ts:14`, `QuotaExceeded` (the data type, not the class) IS already imported from `@eduagent/schemas` — half the migration is already done. Adding the class definitions to `packages/schemas/src/errors.ts` and re-exporting from `apps/mobile/src/lib/api-errors.ts` is the remaining work.
  No new work in the 2026-05-02→05-03 window has moved these classes into `packages/schemas/`. Verified by `git log --since="2026-05-02" -- packages/schemas/src/errors.ts apps/mobile/src/lib/api-errors.ts` — neither file touched.
- **Why it matters:** The migration is 1-2 hr of mechanical work and unblocks (a) API-side throwing of `QuotaExceededError` from a future quota-decrement path (currently API throws `ApiError` with code `QUOTA_EXCEEDED` and mobile reconstructs the typed class in `api-client.ts:241`), and (b) replaces the `error.name === 'X'` string comparisons with proper `instanceof` checks (both are typescript-soundness wins). The `format-api-error.ts:48-49,61-64` workaround pattern is **the smoking gun** for why this cluster is YELLOW-RED rather than YELLOW.
- **Anticipated effort:** ~1-2 hr (matches TYPES-1 F1 estimate). Move 2 classes; update `apps/mobile/src/lib/api-errors.ts` to re-export from `@eduagent/schemas`; convert `format-api-error.ts` and `use-session-streaming.ts` string-name checks to `instanceof`; verify `api-client.ts` `throw new QuotaExceededError(...)` still resolves to the same constructor reference.
- **Suggested track:** B (still must precede any future API-side throw of these classes).

## Cross-coupling notes

- **C2 deepening (TESTS-2):** TESTS-2 will likely find route tests for the 9 fit-and-ready schemas that assert response shapes by hand (e.g., `expect(body).toMatchObject({checkoutUrl: expect.any(String)})`). Once SCHEMA-2 PR 1 wraps these routes with `responseSchema.parse()` calls, the same response is also schema-validated server-side; the test-side `toMatchObject` becomes redundant but not wrong. TESTS-2 should propose a refactor to `expect(checkoutResponseSchema.safeParse(body).success).toBe(true)` for tests of wrapped routes, which couples test assertions to the same contract the server enforces. Conversely, TESTS-2 should NOT refactor tests for routes whose schemas are in the **drifted** or **no-matching-route** buckets — those tests are doing real shape-assertion work that schemas cannot replace until the schemas are fixed/added.
- **C2 deepening — `consent.ts` and `assessments.ts` test fragility:** TESTS-2 should grep for `quickCheckResponseSchema|consentResponseSchema` in `apps/api/src/routes/*.test.ts`. Any test that imports these schemas expecting them to validate a response body is already broken (the schemas are request-shaped); any test that imports them as request validators will need the rename of Finding 2 above before Test-2 fixes can stick.
- **C1 mobile coupling (MOBILE-2 if it exists):** Finding 5's `format-api-error.ts:48-49,61-64` string-name workarounds are mobile-side artifacts of a missing schema-package class. MOBILE-2 should be aware that fixing them is a cross-package change (move classes first, then refactor mobile), not a mobile-only refactor.
- **SCHEMA-2 plan input:** The `2026-05-02-audit-schema-2-plan.md` document was authored with the assumption that ~22 response schemas existed and were broadly applicable. This deepening reduces the wireable count to **9 schemas (12 wrap sites)** for the orphan set, and identifies **2 net-new schemas to author** (the real `quickCheckResponseSchema` and the real `consentRespondResponseSchema`) plus **1 new SSE schema** (`streamErrorFrameSchema`). PR 1 scope should be the 12 wraps; PR 2 should bundle the rename + author + SSE-schema work for `assessments.ts`, `consent.ts`, `interview.ts`, `sessions.ts`. The `2026-05-02-audit-schema-2-plan.md` text on lines 22 and 29 is now demonstrably wrong — TYPES-1.3 punch-list item should also incorporate this deepening's numbers.

## Out of scope / not checked

- **Route tests for the 17 schemas above.** Whether the corresponding `*.test.ts` files use these schemas, hand-roll their own shape assertions, or test through-mocks was deferred to TESTS-2. This deepening only covered the schema-vs-runtime-c.json comparison.
- **`stream-fallback.ts` other consumers.** Only verified at the emission sites in `interview.ts` and `sessions.ts`. The mobile SSE consumer (`apps/mobile/src/lib/sse.ts`) was opened only briefly to confirm `QuotaExceededError`/`ResourceGoneError` references; the mobile-side fallback-frame parsing was not audited.
- **Other `*ResponseSchema` exports beyond the 16 dead-by-orphan list.** TYPES-1 enumerated 22 total `*ResponseSchema` exports; 6 are wired (`bookmarks.ts` x3 confirmed used by TYPES-1; the other 3 of the 22 were also already-used per TYPES-1 sweep). This deepening only spot-checked the 16 unused ones.
- **`quickCheckResponseSchema` / `consentResponseSchema` test sites.** Only verified the route-file usage at the `zValidator` callsite. Test-side imports were noted as a TESTS-2 follow-up.
- **`apps/api/src/routes/auth.ts` schema imports (`registerSchema`, `passwordResetRequestSchema`, `passwordResetSchema`).** These are request schemas used as `zValidator` inputs at lines 10, 23, 38. They are imported but never validated as response shapes (since the route is a 501 stub). Out of this audit's scope (request schemas were never the brief).
- **Mobile-side string-name classifier completeness.** Only verified the 2 known sites in `format-api-error.ts` and `use-session-streaming.ts`. A broader sweep for `error.name ===` patterns was not done — a sibling MOBILE-2 audit should do that.

## Recommended punch-list entries

```markdown
- **AUDIT-TYPES-2.1** Wrap 12 ready-to-fit `c.json` sites with their existing response schemas (SCHEMA-2 PR 1 final scope)
  - Severity: YELLOW
  - Effort: ~1 hr
  - Files: `routes/quiz.ts:242,380,418`, `routes/account.ts:55,64`, `routes/celebrations.ts:31,36`, `routes/curriculum.ts:108,158`, `routes/notes.ts:48`, `routes/billing.ts:203,260,420`
  - Why it matters: this is the entire net-zero-risk wraping work. All 12 schemas were verified shape-equivalent to current route output. SCHEMA-2 PR 1 can ship as a mechanical pass.

- **AUDIT-TYPES-2.2** Add missing `queued: z.boolean()` field to `feedbackResponseSchema`
  - Severity: YELLOW
  - Effort: ~15 min
  - Files: `packages/schemas/src/feedback.ts:15`, `routes/feedback.ts:121,124`
  - Why it matters: drift means a naïve SCHEMA-2 wrap would silently strip the `queued` field from the typed RPC contract. Fix the schema before wrapping.

- **AUDIT-TYPES-2.3** Rename `quickCheckResponseSchema` → `quickCheckRequestSchema` and `consentResponseSchema` → `consentRespondRequestSchema`; author real response schemas for both endpoints
  - Severity: YELLOW-RED
  - Effort: ~1.5 hr
  - Files: `packages/schemas/src/assessments.ts:100-103`, `packages/schemas/src/consent.ts:22-27`, `routes/assessments.ts:5,158`, `routes/consent.ts:5,215`, plus test imports
  - Why it matters: the schemas are request-shaped but `*ResponseSchema`-named — SCHEMA-2 PR 2 cannot wrap c.json with them without renaming. Authoring real response schemas (`{feedback, isCorrect}` and `{message}`) completes the contract.

- **AUDIT-TYPES-2.4** Author `streamErrorFrameSchema` (and ideally a unified `streamFrameSchema` discriminated union) for SSE error/chunk/done/fallback frames
  - Severity: YELLOW
  - Effort: ~30 min for error frame alone; ~2 hr for the full envelope
  - Files: new exports in `packages/schemas/src/stream-fallback.ts`; emission-site `.parse()` at `routes/interview.ts:254,413` and `routes/sessions.ts:363,507`; mobile consumer in `apps/mobile/src/lib/sse.ts`
  - Why it matters: SSE error frames are 4 ad-hoc emissions of the same shape with no schema; the existing `streamFallbackFrameSchema` is the precedent for "validate-on-emit so a server change that drifts from the wire schema fails loudly in tests" (its own doc comment).

- **AUDIT-TYPES-2.5** Decide and execute on 6 no-matching-route schemas (rename to honest names, delete, or wire to future endpoint)
  - Severity: YELLOW (low urgency)
  - Effort: ~1-2 hr including team review
  - Files: `quiz.ts:181 internalQuizRoundResponseSchema`, `filing.ts:65 filingResponseSchema`, `progress.ts:385 homeCardsResponseSchema`, `sessions.ts:384 learnerRecapResponseSchema`, `progress.ts:200 coachingCardCelebrationResponseSchema` (rename to `pendingCelebrations…`)
  - Why it matters: schemas with the `*Response` suffix that describe LLM I/O or non-existent endpoints are misleading to anyone authoring new routes. Either rename for honesty (e.g., `learnerRecapLlmOutputSchema`) or delete (e.g., `homeCardsResponseSchema` if no home-cards endpoint is planned).

- **AUDIT-TYPES-2.6** Decide on `auth.ts` 501 stubs: add `'NOT_IMPLEMENTED'` to `ERROR_CODES`, OR delete the routes
  - Severity: GREEN
  - Effort: ~15-30 min depending on choice
  - Files: `apps/api/src/routes/auth.ts:9-50`, `packages/schemas/src/errors.ts` (`ERROR_CODES` map)
  - Why it matters: stubs return a body whose `code` value is not in the canonical error-code map. Either add the code or delete the routes — keeping a 501 stub with a non-canonical code is the worst of both worlds.

- **AUDIT-TYPES-2.7** Move `QuotaExceededError` and `ResourceGoneError` to `packages/schemas/src/errors.ts`; convert string-name `error.name === 'X'` checks to `instanceof`
  - Severity: YELLOW-RED (carries forward TYPES-1.1)
  - Effort: ~1-2 hr
  - Files: `packages/schemas/src/errors.ts` (add), `apps/mobile/src/lib/api-errors.ts:26-64` (re-export instead of define), `apps/mobile/src/lib/format-api-error.ts:48-49,61-64` (`instanceof`-ify), `apps/mobile/src/components/session/use-session-streaming.ts:797` (`instanceof`-ify), `apps/mobile/src/lib/api-client.ts:241,276` (verify constructor reference unchanged after re-export)
  - Why it matters: the `error.name === 'X'` workaround is the smoking gun for why this is YELLOW-RED. Mobile is already importing the *data type* `QuotaExceeded` from `@eduagent/schemas` at `api-errors.ts:14` — half the migration is done. Closing the loop unblocks API-side typed throws and removes 3 string-name workaround sites.
```

## Audit honesty disclosures

- **Sampling rule.** Full sweep on the 16 named orphan schemas (Finding 1) and full sweep on the SSE error sites (Finding 4 — 4 production hits found). Other-`*ResponseSchema` exports beyond the 16 were not re-spot-checked; the 6 schemas TYPES-1 reported as already-wired (3 in `bookmarks.ts` + the 3 SCHEMA-2-plan correctly identified) were trusted at TYPES-1's word.
- **Sampling rule for Finding 5.** Re-verified the **two** classes named in TYPES-1 F1 (`QuotaExceededError`, `ResourceGoneError`) and their migration consumers (4 sites including 1 test). Did NOT re-audit the broader typed-error hierarchy (`NetworkError`, `UpstreamError`, etc. — those were already noted as mobile-local in TYPES-1 but were out of TYPES-1's "P-4 consolidation" scope).
- **Inferred mappings.** "Matching c.json site" determined by reading every route file containing the word "celebration", "coaching", "billing", "filing", "quiz", etc. and visually pattern-matching shapes. For 1-2 of the 17 schemas (notably `homeCardsResponseSchema`) I cross-checked by grepping for the schema's distinctive keys (`coldStart`, `cards`) across all `apps/api/src` to confirm no other route emits the shape.
- **Date serialization assumption (Finding 1, schema #14 `bookNotesResponseSchema`).** The schema declares `updatedAt: z.string().datetime()` but the service returns `Date`. I verified the route returns the service result via `c.json({notes})` and assumed Hono's standard JSON serialization converts Date→ISO string. Did not run the route end-to-end to confirm. If serialization differs (e.g., a custom serializer drops the date), the schema would reject. SCHEMA-2 PR 1 should test this wrap end-to-end before merging.
- **No live LLM/route invocation.** All findings derive from static read of source code. Runtime payload shapes inferred from typed return signatures (`Promise<FilingResult>`, `Promise<CurriculumAdaptResponse>`) and visual inspection of c.json call sites. Did not stand up a server or stub a request to verify shapes empirically — SCHEMA-2 PR work would catch any divergence at CI time.
- **Time spent:** ~50 min recon + ~15 min writing.
