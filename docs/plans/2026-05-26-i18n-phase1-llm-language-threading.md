---
title: i18n Phase 1 — LLM Language Threading — Implementation Plan
date: 2026-05-26
profile: code
spec: docs/specs/2026-05-26-i18n-phase1-llm-language-threading.md
status: draft
---

# i18n Phase 1 — LLM Language Threading — Implementation Plan

**Goal:** Thread `conversationLanguage` (and `flow:`) through every learner-facing `routeAndCall` site in `apps/api/src/{services,inngest,routes}/**` so LLM-generated cards render in the learner's selected language; lock in the contract with a forward-only ratchet test and per-flow prompt-assembly fixtures.

**Approach:** (1) Update the router with the expanded `LEARNER_FACING_FLOWS` set and warn-only tripwire. (2) Fix the signup-time race by accepting `conversationLanguage` on profile creation. (3) Sweep the 17 learner-prose call sites, adding both `conversationLanguage:` and `flow:` to every `routeAndCall` invocation, plus the matching caller wiring (route handlers / Inngest functions). (4) Mark the 15 denylisted internal-classification sites with explicit comments. (5) Add the ratchet test and per-flow Tier-1 eval fixtures.

## Scope

In scope:
- `apps/api/src/services/llm/router.ts`
- `apps/api/src/services/**` (the 16 learner-prose files + 14 denylisted files listed in §"Call sites to update" / "Services deliberately excluded" of the spec)
- `apps/api/src/inngest/functions/post-session-suggestions.ts`
- `apps/api/src/routes/test-seed.ts` (denylist marker only)
- `apps/api/src/services/profile.ts`
- `packages/schemas/src/profiles.ts`
- `apps/mobile/src/app/onboarding/profile-setup.tsx` and other `createProfile` POST call sites
- `apps/api/src/services/llm/router.language-coverage.test.ts` (new)
- `apps/api/eval-llm/fixtures/<flow>/nb-locale.fixture.ts` (~17 new)
- `apps/api/eval-llm/fixtures/session-recap/{de,es,ja,pl,pt}-locale.fixture.ts` (5 new)
- Route handlers / Inngest functions that *call* the threaded services (for caller wiring only)

Out of scope (must not change):
- `SUPPORTED_LANGUAGES` constant (UI shell — Phase 2)
- UI string files `en.json` and the six locale JSONs (Phase 2)
- The `pronouns:` parameter — explicitly deferred (spec §"`pronouns:` parameter — explicit non-goal")
- Migration to extend `conversation_language` CHECK constraint (migration 0087 already covers all 10)
- Re-generation of previously cached English LLM cards
- `useMentorLanguageSync` (steady-state path stays as-is)
- Any non-learner-prose `routeAndCall` semantics

## Tasks

### Phase A — Router foundation

- [ ] **T1: Expand `LEARNER_FACING_FLOWS` set and add the new flow tags in `apps/api/src/services/llm/router.ts`.**
  Replace the existing set with the exact list from spec §"Runtime tripwire" (17 entries including the two new tags `'recall.bridge'` and `'post.session.suggestions'`). Confirm the warn block in `router.ts` reads:
  ```ts
  if (
    options.flow &&
    LEARNER_FACING_FLOWS.has(options.flow) &&
    !options.conversationLanguage
  ) {
    console.warn(
      `[llm.language.missing] flow=${options.flow} sessionId=${options.sessionId ?? 'n/a'}`,
    );
  }
  ```
  No throw. Place immediately after option parsing, before the model call.
  **Done when:** `apps/api/src/services/llm/router.test.ts` (or a new sibling unit test if no router test exists yet) asserts that calling `routeAndCall` with `flow: 'session.recap'` and no `conversationLanguage` writes a `[llm.language.missing]` line via a spied `console.warn`, and the same call WITH `conversationLanguage: 'nb'` does not. Test passes.

### Phase B — Signup-time fix

- [ ] **T2: Extend `createProfileInputSchema` in `packages/schemas/src/profiles.ts` with `conversationLanguage?: ConversationLanguage`.**
  Use the existing `conversationLanguageSchema` for validation. The field is optional; omission falls through to the DB default `'en'`.
  **Done when:** a new unit test in `packages/schemas/src/profiles.test.ts` (or co-located) asserts `createProfileInputSchema.parse({ ..., conversationLanguage: 'nb' })` succeeds and `{ ..., conversationLanguage: 'zz' }` fails. Test passes.

- [ ] **T3: Write `conversationLanguage` through `createProfile` in `apps/api/src/services/profile.ts:307`.**
  Add `conversationLanguage: input.conversationLanguage` to the `.values({...})` block. When undefined, Drizzle omits it and the DB default applies — no special-casing needed.
  **Done when:** a new unit/integration test in `apps/api/src/services/profile.test.ts` (or co-located) asserts that `createProfile({..., conversationLanguage: 'nb'})` inserts a row with `conversation_language = 'nb'`, and that omitting the field inserts `'en'`. Test passes.

- [ ] **T4: Update mobile `createProfile` POST call sites to forward `i18next.language` for SELF-create only.**
  Files:
  - `apps/mobile/src/app/onboarding/profile-setup.tsx` (first-profile onboarding)
  - `apps/mobile/src/app/(app)/more/children/add.tsx` (**omit the field** — parent-creates-child path; see spec MED-2)
  - Any other call site found via `git grep -nl "createProfile" apps/mobile/src`
  Pattern for self-create:
  ```ts
  const parsed = conversationLanguageSchema.safeParse(i18next.language);
  await createProfile.mutateAsync({
    ...rest,
    ...(parsed.success ? { conversationLanguage: parsed.data } : {}),
  });
  ```
  For child-from-parent: do NOT include the field in the payload.
  **Done when:** (a) `git grep -n "createProfile" apps/mobile/src` shows every self-create site reads `i18next.language` and clamps it via `conversationLanguageSchema.safeParse`; (b) the parent-adds-child site does NOT pass the field (verify by reading the file); (c) the mobile typecheck `cd apps/mobile && pnpm exec tsc --noEmit` passes.

### Phase C — Service threading (learner-prose, 16 files)

Each task adds **both** `conversationLanguage?: ConversationLanguage` to the service function signature **and** `flow:` + `conversationLanguage:` to every `routeAndCall` site listed for that file, plus updates the caller (route handler / Inngest function) to load `profile.conversationLanguage` and pass it down. `flow:` values come from the spec's `LEARNER_FACING_FLOWS` list — match by file (e.g. `session-recap.ts` → `flow: 'session.recap'`).

- [ ] **T5: Thread session services — `session-recap.ts:358`, `session-highlights.ts:249`, `session-llm-summary.ts:256`.**
  Confirm `flow:` already present on each (spec table says "Verify `flow:` tagged"); add `conversationLanguage:` to each call and to the service signature. Wire the caller(s) to load `profile.conversationLanguage` from `profileScope` middleware (route handler) or load it from `profileId` inside the Inngest step.
  **Done when:** the three sites pass `conversationLanguage` and `flow:` in the same options object; the per-flow Tier-1 fixtures introduced in T14 (for these three flows) show `"in Norwegian"` in the snapshotted system prompt; `pnpm exec nx run api:test --testPathPattern=session-(recap|highlights|llm-summary)` passes.

- [ ] **T6: Thread report services — `monthly-report.ts:206`, `progress-summary.ts:172`, `homework-summary.ts:286`, `summaries.ts:119`.**
  `monthly-report.ts`, `homework-summary.ts`, `summaries.ts` currently pass NO options object — add `{ flow: '<value>', conversationLanguage }`. `progress-summary.ts` already has `flow:` — add `conversationLanguage:` next to it.
  **Done when:** all four sites carry both keys; the per-flow Tier-1 fixtures for `monthly-report`, `progress-summary`, `homework-summary` show `"in Norwegian"`; `summaries.ts` has a fixture if it maps to a `LEARNER_FACING_FLOWS` value (else N/A — add to T14 list if a new flow tag is required); `pnpm exec nx run api:test --testPathPattern=(monthly-report|progress-summary|homework-summary|summaries)` passes.

- [ ] **T7: Thread book services — `book-generation.ts:117`, `book-suggestion-generation.ts:109`.**
  Both already pass `flow:`. Add `conversationLanguage:` to each and to the service signature; wire caller(s).
  **Done when:** both sites pass both keys; per-flow fixtures for `book-generation` and `book-suggestion` show `"in Norwegian"`; `pnpm exec nx run api:test --testPathPattern=book-(generation|suggestion-generation)` passes.

- [ ] **T8: Thread `curriculum.ts:110, 157, 2296`, `assessments.ts:283, 330, 431`, and `quiz/generate-round.ts:92`.**
  `curriculum.ts` and `assessments.ts` currently pass no options at all — add `{ flow, conversationLanguage }` to every site (one site per existing call). `quiz/generate-round.ts:92` forwards an `options` object from its caller — update the function signature to require/forward `conversationLanguage`, and update its caller(s) to include both `flow: 'quiz.generate'` and `conversationLanguage`.
  **Done when:** all seven sites carry both keys; per-flow Tier-1 fixtures for `curriculum-generate`, `assessment-evaluate`, `quiz-generate` show `"in Norwegian"`; `pnpm exec nx run api:test --testPathPattern=(curriculum|assessments|quiz)` passes.

- [ ] **T9: Thread dictation services — `dictation/generate.ts:208`, `dictation/prepare-homework.ts:78`, `dictation/review.ts:216`.**
  `dictation/review.ts` already has `flow: 'dictation.review'`; add `conversationLanguage:`. The other two pass no options — add both `flow:` and `conversationLanguage:`.
  **Done when:** all three sites carry both keys; per-flow Tier-1 fixtures for `dictation-generate`, `dictation-prepare-homework`, `dictation-review` show `"in Norwegian"`; `pnpm exec nx run api:test --testPathPattern=dictation` passes.

- [ ] **T10: Thread `recall-bridge.ts:87`.**
  Add `flow: 'recall.bridge'` and `conversationLanguage:` to the call, accept `conversationLanguage` in the function signature, wire its caller(s).
  **Done when:** the site carries both keys; the `recall-bridge` Tier-1 fixture shows `"in Norwegian"` in the prompt; `pnpm exec nx run api:test --testPathPattern=recall-bridge` passes.

- [ ] **T11: Thread `apps/api/src/inngest/functions/post-session-suggestions.ts:167`.**
  Inside the Inngest step, load the profile from the event payload (`event.data.profileId`) using the existing repository helper, read `profile.conversationLanguage`, and pass it plus `flow: 'post.session.suggestions'` into the `routeAndCall` site. This file lives outside `services/**` and is the production English-leak the spec calls out for the HIGH-1 glob fix.
  **Done when:** the site carries both keys; the `post-session-suggestions` Tier-1 fixture shows `"in Norwegian"`; the Inngest function unit test (if present, else add a minimal one alongside this file) verifies the language reaches the prompt.

### Phase D — Denylist markers

- [ ] **T12: Add `// conversationLanguage not threaded: <reason>` comments to all 15 denylisted sites.**
  Files and reasons taken verbatim from the spec's "Services deliberately excluded" table. The comment goes on the same line as the `routeAndCall(` call (or the line immediately above if line-length forbids inline). Reasons:
  - `services/language-detect.ts:58` — `output is {lang} identification, not prose`
  - `services/subject-classify.ts:120,206` — `output is a fixed taxonomy slug`
  - `services/subject-resolve.ts:95` — `output is a fixed taxonomy slug`
  - `services/ocr.ts:130` — `output is extracted source-image text; UI locale irrelevant`
  - `services/memory/dedup-llm.ts:32` — `output is a similarity decision, not prose`
  - `services/filing.ts:331` — `output is JSON subject/topic categorization`
  - `services/learner-input.ts:119` — `output is JSON analysis of a note, not user-visible prose`
  - `services/learner-profile.ts:1758` — `output is JSON session-analysis inference`
  - `services/parking-lot.ts:78` — `output is binary classifier token "tangential"/"ontopic"`
  - `services/retention-data.ts:165` — `output is integer 0-5 quality score`
  - `services/session/session-crud.ts:582` — `topic-intent matcher; JSON classification`
  - `services/session/session-depth.ts:131` — `depth-analysis JSON, internal metric`
  - `services/session/topic-probe-extraction.ts:113` — `signal extraction from transcript, internal JSON`
  - `services/vocabulary-extract.ts:66` — `vocabulary extraction in source language`
  - `routes/test-seed.ts:265` — `test-seeding infrastructure, not learner-facing`
  **Done when:** `grep -rn "conversationLanguage not threaded" apps/api/src/{services,inngest,routes}` returns exactly 15 distinct file matches matching the list above.

### Phase E — Tests and ratchet

- [ ] **T13: Write the ratchet test `apps/api/src/services/llm/router.language-coverage.test.ts`.**
  Use the exact glob `apps/api/src/{services,inngest,routes}/**/*.ts` (ignoring `*.test.ts`/`*.test.tsx`) and the exact `INTERNAL_NON_PROSE_FILES` set from the spec (15 entries). Implement `findRouteAndCallSites(src)` with the brace-balanced scan shown in the spec, returning `{ startLine, text, optionsText }`. Assert both `\bconversationLanguage\s*:/` and `\bflow\s*:/` match inside `optionsText` for every non-denylisted site. Mirror the structural conventions of `apps/api/src/services/safe-non-core.guard.test.ts`.
  **Done when:** the test runs green against the codebase state after T1–T12 have landed; manually breaking any one call site (delete `conversationLanguage:` from any non-denylisted file) makes the test fail with a violation line in the form `<rel-path>:<startLine> — routeAndCall without conversationLanguage`; restoring the line returns it to green. (Run the red/green check locally; do not commit the temporary break.)

- [ ] **T14: Add per-flow Tier-1 prompt-assembly fixtures at locale `nb`.**
  Create `apps/api/eval-llm/fixtures/<flow>/nb-locale.fixture.ts` for each of the 17 flows listed in the spec's "Behavioural regression test" section: `session-recap`, `session-highlights`, `session-llm-summary`, `monthly-report`, `progress-summary`, `book-generation`, `book-suggestion`, `curriculum-generate`, `dictation-generate`, `dictation-prepare-homework`, `dictation-review`, `homework-summary`, `quiz-generate`, `assessment-evaluate`, `recall-bridge`, `post-session-suggestions`, plus a check that the existing `exchange-process` fixture is still covered (no new file if already there). Each fixture constructs the flow's context with `conversationLanguage: 'nb'`, runs prompt assembly, snapshots the system prompt, and asserts the snapshot contains the literal substring `"in Norwegian"` (the exact phrase from `CONVERSATION_LANGUAGE_NAMES` in `router.ts:151`).
  **Done when:** `pnpm eval:llm` runs all 17 fixtures green; the recorded snapshots each contain `"in Norwegian"`; deleting `conversationLanguage:` from any one threaded site causes the matching fixture to fail with a snapshot mismatch.

- [ ] **T15: Add per-locale recap fixtures for the five remaining non-English locales.**
  Files: `apps/api/eval-llm/fixtures/session-recap/{de,es,ja,pl,pt}-locale.fixture.ts`. Each builds the recap context with the locale code, snapshots the system prompt, and asserts the snapshot contains the locale's expected language name from `CONVERSATION_LANGUAGE_NAMES` (`"in German"`, `"in Spanish"`, `"in Japanese"`, `"in Polish"`, `"in Portuguese"`).
  **Done when:** `pnpm eval:llm` runs the five new fixtures green; each snapshot contains the expected language-name substring.

### Phase F — Audit and validation

- [ ] **T16: Audit `routeAndCall` site list against this plan before declaring done.**
  Run:
  ```bash
  grep -rln "routeAndCall(" apps/api/src/{services,inngest,routes} --include="*.ts" | grep -v test
  ```
  Compare the returned file list against (a) the 16 learner-prose files threaded in Phase C plus `post-session-suggestions.ts`, and (b) the 15 denylisted files marked in T12. Any file in the grep output that is in neither group is a new site introduced during this plan's execution and must be classified — add to the appropriate group and re-run the relevant task.
  **Done when:** every file returned by the grep is accounted for in exactly one group; the count matches (16 services + 1 inngest + 15 denylisted = 32 expected entries, modulo any files added since the spec was written and reclassified during this audit).

- [ ] **T17: Run full validation.**
  Execute, in order:
  ```bash
  pnpm exec nx run api:lint
  pnpm exec nx run api:typecheck
  pnpm exec nx run api:test
  pnpm exec nx test:integration api
  pnpm eval:llm
  cd apps/mobile && pnpm exec tsc --noEmit
  ```
  **Done when:** every command above exits 0. The ratchet test in T13 is included in `api:test` and must be green. If any command fails, fix the root cause (never weaken a test or suppress a lint rule per `CLAUDE.md` → "No suppression").

## Tests

Test bodies for T1, T2, T3, T13 are described inline in their `done when:` clauses — see the task entries above. T14 and T15 are snapshot fixtures (Tier-1 eval harness, no live LLM call); each fixture file is a standalone module under `apps/api/eval-llm/fixtures/<flow>/<locale>-locale.fixture.ts` following the existing harness convention.

## Sequencing notes

- T1 is a prerequisite for the warn-block check used implicitly by every subsequent task (warning will fire during dev only when `flow:` is set but language is missing — a useful local signal while threading).
- T13 (ratchet) must land **after** T5–T12 — committing the ratchet earlier would red-fail the build on every intermediate commit. Land Phase C/D first, then T13 closes the door.
- T4 (mobile) and Phase C (API services) can run in parallel — they touch disjoint files. T2/T3 (schema + API insert) are prerequisites for T4 to typecheck end-to-end.
- T14/T15 (fixtures) can be authored in parallel with Phase C; the fixtures will go green flow-by-flow as each service is threaded.
- T17 (final validation) is the merge gate.
