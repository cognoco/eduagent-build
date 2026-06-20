# WI-864 (LEARN-50) — Align Challenge Round docs/status + deterministic mobile-surface proof

**Type:** Documentation (+ surgical proof tests). Current-state proof/docs only — NOT the learner-pull
Challenge Round redesign. No flag flip. No source-behavior change.

## Verified current state (code is ground truth, read 2026-06-20)

- **Flag:** `CHALLENGE_ROUND_RUNTIME_ENABLED: z.enum(['true','false']).default('false')` —
  `apps/api/src/config.ts:145`. API-side config flag, NOT a mobile feature flag. Off in all envs.
  Mobile renders only when the server emits typed `challengeOffer`/`challengeRound`/`draftedNote`
  fields; there is no mobile client kill-switch.
- **Drafted-note grounding (the stale-doc target):** server finalization `buildValidatedDraft`
  (`apps/api/src/services/session/session-exchange.ts:527-577`) CALLS `validateNoteDraft(...)` at
  `:556` before emitting a drafted note, and FALLS BACK to a `body: null` + `fallbackPrompt`
  "write your own" draft when `!allSourcesAreSolid || !validation.ok` (`:562`). It only emits the
  LLM-authored `body` when validation passes (`:572`). The `notes.ts:237-243` comment ("no
  production path calls validateNoteDraft") describes the downstream CLIENT save route, NOT the
  server emission path — the grounding happens at emission time.
- **Mobile fallback surface:** `DraftedNoteReview.tsx` renders `drafted-note-fallback-prompt`
  (`:32`) when `fallbackPrompt` is set, and starts in editing mode showing `drafted-note-input`
  when `initialContent === null` (`:18`). `drafted-note-skip` (`:83`) → `onSkip`.
- **Skip wiring:** `index.tsx` `handleSkipDraftedNote` (`:1062`) clears `draftedNote` state and
  calls `challengeRoundActions.skipNote()` which is a no-op `Promise.resolve()`
  (`use-challenge-round.ts:128`) — NO `/notes` POST.
- **Concept-capture:** `CONCEPT_CAPTURE_ENABLED = false` (`concept-capture.ts:19`), gated at the
  single live site `session-exchange.ts:728`. PARKED until baseline reset (MMT-ADR-0012).

## Already-covered (DO NOT duplicate / weaken)

- Flag default false + flag-off prompt suppression: `config.test.ts:523-530`,
  `exchange-prompts.test.ts:792` (offer/active/drafting blocks suppressed when flag off/undefined).
- Schema grounding (`challenge_round_offer`, `challenge_round_evaluation`, required
  `answerEventId`+`learnerQuote`): `packages/schemas/src/llm-envelope.test.ts:764+`.
- Answer-event validation (reject invalid IDs, overwrite learnerQuote with DB content):
  `apps/api/src/services/challenge-round/evaluation.test.ts:276+`.
- Conservative mastery (all-solid verified; any partial/missing/misconception blocks):
  `evaluation.test.ts:75-213`.
- `validateNoteDraft` grounded/ungrounded/empty/BUG-483/Unicode: `note-draft.test.ts`.
- needs_deepening `source='challenge_round'` persistence: `persistence.test.ts:140+`.
- Mobile offer accept/decline/dont-ask, active banner, drafted-note SAVE:
  `apps/mobile/src/app/(app)/session/index.test.tsx:1048-1283`.

## Genuinely-uncovered work (this WI)

### Task A — Docs alignment (the core of the WI)
Correct the stale "Save is NOT guarded / validateNoteDraft not called" wording in:
1. `docs/flows/learning-path-flows.md:508-509` (the Flow code block)
2. `docs/flows/learning-path-flows.md:551` (Notes route 4)
3. `docs/flows/learning-path-flows.md:554` (Corrections bullet)
4. `docs/flows/mobile-app-flow-inventory.md:220` (LEARN-49 row)

State the verified truth: server finalization (`buildValidatedDraft`, `session-exchange.ts:556`)
calls `validateNoteDraft()` before emitting a drafted note and falls back to a `body:null`
write-your-own composer prompt when grounding fails. Keep the genuinely-true distinction that the
downstream client `notes.ts` save route does not itself re-run the guard. Cite `session-exchange.ts:556`
and the fallback at `:562`. Also confirm/keep the already-accurate flag wording (server-gated,
config.ts:145, default false, no mobile flag, no flag flip in scope). Add the LEARN-50 status note
in `flow-revision-plan-2026-06-17.md:384` pointing at the proof added by this WI.

### Task B — Mobile drafted-note SKIP test (uncovered variant)
Add to `apps/mobile/src/app/(app)/session/index.test.tsx`, immediately after the existing
"renders a drafted note ... and saves it" test (`:1218-1283`). Same payload shape as the save test
but press `drafted-note-skip`; assert: card dismisses (`queryByTestId('drafted-note-review')` null)
AND no `/notes` POST fired (`fetchCallsMatching(mockFetch, '/notes')` length 0).

### Task C — Mobile drafted-note FALLBACK test (uncovered variant; proves server grounding-failed path)
Add right after Task B. `draftedNote` payload with `body: null` + `fallbackPrompt: '...'` and
`sourceAnswerEventIds: []`. Assert: `drafted-note-review` renders, `drafted-note-fallback-prompt`
shows the prompt text, `drafted-note-input` (editing mode) is present, `drafted-note-preview` is
absent. This is the visible mobile surface of `buildValidatedDraft`'s fallback.

### Task D — Concept-capture parked guard test (uncovered; proves "remaining parked/gated off")
Add a forward-only guard. Co-locate in `apps/api/src/services/concept-capture.test.ts` (NEW file,
unit — no DB; the existing `concept-capture.integration.test.ts` exercises the write path against a
real DB and must stay green). Assert `CONCEPT_CAPTURE_ENABLED === false` so a silent flip can't land
without updating the guard. Mirror the existing parked-feature guard idiom in the repo.

## Verification per task
- A: re-read each edited doc line; the claim must match `session-exchange.ts:556/562` exactly.
- B/C: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/session/index.tsx" --no-coverage`
  (run the session/index suite) — new tests pass, existing 4 CR tests still pass.
- D: `cd apps/api && pnpm exec jest src/services/concept-capture.test.ts` green.
- Then `apps/api` typecheck + `apps/mobile` tsc for touched files.
- No `eslint-disable`, no `--no-verify`, no weakened sibling assertions.

## Scope guard
Only stage: the 3 doc files, `session/index.test.tsx`, new `concept-capture.test.ts`, and the
flow-revision-plan row. NEVER stage `apps/mobile/eas.json` (env:sync artifact, pre-existing).
