---
title: Render Four Strands meaning-output task with correction and retry loop — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1756]
spec: docs/plans/2026-07-02-4-strands.md
status: draft
---

# WI-1756 — Meaning-output task rendering + correction/retry — Implementation Plan

**Goal:** Mobile renders one structured meaning-output task for a `four_strands`
language subject, the learner answers via the existing text/voice composer, and
the tutor's reply gives direct correction plus a retry prompt when the answer
is incomplete or malformed — without dropping the server-emitted `meaningOutput`
artifact anywhere on the streaming/mobile path.

**Approach:** The engine-side generation of the `meaningOutput` artifact
(`buildMeaningOutputArtifact` / `buildLanguageActivityTelemetry` in
`apps/api/src/services/language-session-engine.ts`) and its schema
(`streamLanguageMeaningOutputSchema` in `packages/schemas/src/stream-fallback.ts`)
already exist and are already tested — confirmed by reading both files and
`language-session-engine.test.ts` before writing this plan. What is missing is
narrower than the WI framing suggested: (1) a mobile-side bug that drops the
whole `languageLearning` state update when `gradedInput` is absent, silently
discarding every `meaningOutput` turn; (2) no mobile card to render the task;
(3) the LLM prompt never surfaces the specific task (prompt/communicativeGoal/
responseMode) so the existing generic "direct correction" instructions have
nothing concrete to correct against. No API schema change, no engine change, no
migration.

## Scope

In scope:
- `apps/mobile/src/components/session/use-session-streaming.ts` — fix the
  state-drop bug (AC1).
- `apps/mobile/src/lib/sse.ts` — add the `meaningOutput` field to the mobile-side
  `LanguageLearningActivityEvent` type (currently only declares `gradedInput`,
  so the field is invisible to TypeScript even though the server already emits
  it).
- `apps/mobile/src/components/session/MeaningOutputCard.tsx` (new) — render the
  task (AC2).
- `apps/mobile/src/components/session/index.ts` — barrel export.
- `apps/mobile/src/app/(app)/session/index.tsx` — render the card in the
  session footer, parallel to `gradedInputCard`.
- `apps/mobile/src/i18n/locales/en.json` + `pnpm translate` output for the
  other 6 shipped locales (nb, de, es, pt, pl, ja) — new `session.meaningOutput.*`
  keys.
- `apps/api/src/services/language-prompts.ts` — inject the meaning-output task
  into the LLM prompt (AC4).
- Tests: `apps/mobile/src/components/session/use-session-streaming.test.ts`,
  `apps/mobile/src/app/(app)/session/index.test.tsx`,
  `apps/api/src/services/language-prompts.test.ts`.

Out of scope:
- `apps/api/src/services/language-session-engine.ts` and its test — the
  artifact generation is already implemented and tested; do not touch.
  **Superseded post-review (see "Post-review remediation" below): the
  answer-turn correction anchor required a small, additive change here.**
- `packages/schemas/src/stream-fallback.ts` — the schema already has
  `meaningOutput` optional on `streamLanguageLearningActivitySchema`; do not
  touch.
- Any deterministic server-side "was the retry successful" evaluator (parallel
  to `evaluatePendingGradedInputAnswer` for graded input). The spec
  (`docs/plans/2026-07-02-4-strands.md` §Strand 2) describes correction+retry
  as a live conversational behavior, not a state machine; the existing generic
  "Direct correction rules" section in `buildFourStrandsPrompt` already carries
  that instruction for every strand. Building a deterministic meaning-output
  grader is a separate, larger effort and not required by this WI's AC.
- Live/Tier-2 LLM eval runs (`pnpm eval:llm --live`) — deferred per dispatch
  brief (operator-deferred HITL). Tier-1 snapshot coverage only.

## Tasks

- [ ] T1: Fix the mobile state-drop bug in `use-session-streaming.ts` so a
      `languageLearning` result with `meaningOutput` (and no `gradedInput`) is
      preserved instead of being reset to `null`.
      Current code (`apps/mobile/src/components/session/use-session-streaming.ts:901-905`):
      ```ts
      setLanguageLearning(
        result.languageLearning?.gradedInput
          ? result.languageLearning
          : null,
      );
      ```
      New code:
      ```ts
      setLanguageLearning(
        result.languageLearning?.gradedInput ||
          result.languageLearning?.meaningOutput
          ? result.languageLearning
          : null,
      );
      ```
      done when: new test `use-session-streaming.test.ts` → "surfaces
      meaning-output activity from a completed language turn" — a
      `languageLearning` object with `meaningOutput` set and no `gradedInput`
      key at all — asserts `setLanguageLearning` was called with that object
      (not `null`). Red before the fix, green after.

- [ ] T2: Add the `meaningOutput` field to the mobile SSE event types so
      TypeScript sees what the server already sends.
      In `apps/mobile/src/lib/sse.ts`, add a new interface mirroring the
      server's `streamLanguageMeaningOutputSchema` shape (server field names
      verified in `packages/schemas/src/stream-fallback.ts:128-138`):
      ```ts
      export interface LanguageMeaningOutputEvent {
        type: 'meaning_output';
        taskType:
          | 'role_play'
          | 'personal_answer'
          | 'retell'
          | 'describe'
          | 'ask_question';
        communicativeGoal: string;
        prompt: string;
        responseMode:
          | 'dialogue_turn'
          | 'short_answer'
          | 'short_retell'
          | 'short_description'
          | 'question';
        targetWords: string[];
        targetGrammar: string[];
        retryExpectation: 'retry_after_feedback';
        correctionExpectation: 'meaning_first_then_form';
      }
      ```
      and add `meaningOutput?: LanguageMeaningOutputEvent;` to
      `LanguageLearningActivityEvent` (alongside the existing
      `gradedInput?: LanguageGradedInputEvent;`).
      done when: `cd apps/mobile && pnpm exec tsc --noEmit` passes with the new
      field referenced from `MeaningOutputCard.tsx` (T3).

- [ ] T3: Create `MeaningOutputCard` — a presentational card mirroring
      `GradedInputCard.tsx`'s structure (title/subtitle row, dismiss button,
      task body, target-words line) but without the text-to-speech button
      (the task's `prompt` is an instruction, not a passage to read aloud —
      `GradedInputCard`'s TTS button is specific to the `gradedInput.text`
      passage and `audioEnabled` flag, neither of which `meaningOutput` has).
      File: `apps/mobile/src/components/session/MeaningOutputCard.tsx`.
      ```tsx
      import { Pressable, Text, View } from 'react-native';
      import { Ionicons } from '@expo/vector-icons';
      import { useTranslation } from 'react-i18next';

      import { useThemeColors } from '../../lib/theme';
      import type { LanguageLearningActivityEvent } from '../../lib/sse';

      export interface MeaningOutputCardProps {
        activity: LanguageLearningActivityEvent;
        onDismiss?: () => void;
      }

      export function MeaningOutputCard({
        activity,
        onDismiss,
      }: MeaningOutputCardProps) {
        const { t } = useTranslation();
        const colors = useThemeColors();
        const meaningOutput = activity.meaningOutput;

        if (!meaningOutput) {
          return null;
        }

        const targetWords =
          meaningOutput.targetWords.length > 0
            ? meaningOutput.targetWords.join(', ')
            : null;

        return (
          <View
            className="mx-4 mb-3 rounded-card bg-surface-elevated px-4 py-3"
            testID="meaning-output-card"
            accessibilityRole="summary"
          >
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-caption font-semibold uppercase text-primary">
                  {t('session.meaningOutput.title')}
                </Text>
                <Text className="mt-0.5 text-caption text-text-secondary">
                  {meaningOutput.communicativeGoal}
                </Text>
              </View>
              {onDismiss ? (
                <Pressable
                  onPress={onDismiss}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('session.meaningOutput.dismissLabel')}
                  className="h-9 w-9 items-center justify-center rounded-full bg-surface"
                  testID="meaning-output-dismiss"
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Text
              className="text-body text-text-primary"
              testID="meaning-output-prompt"
            >
              {meaningOutput.prompt}
            </Text>

            {targetWords ? (
              <Text className="mt-2 text-caption text-text-secondary">
                {t('session.meaningOutput.targetWords', { words: targetWords })}
              </Text>
            ) : null}
          </View>
        );
      }
      ```
      Add `session.meaningOutput.title`, `session.meaningOutput.dismissLabel`,
      `session.meaningOutput.targetWords` keys to
      `apps/mobile/src/i18n/locales/en.json` (own namespace — do not reuse
      `session.gradedInput.*` keys across the two card components).
      Export from `apps/mobile/src/components/session/index.ts`:
      `export { MeaningOutputCard } from './MeaningOutputCard';`.
      done when: exported from the barrel and referenced by T4's render site;
      covered by T4's render test (no standalone component test file —
      `GradedInputCard` itself has none either; the repo's existing depth for
      these presentational cards is the screen-level render test).

- [ ] T4: Render `MeaningOutputCard` in the session footer, parallel to
      `gradedInputCard`, in
      `apps/mobile/src/app/(app)/session/index.tsx`.
      Add the import to the existing barrel import block (next to
      `GradedInputCard`):
      ```ts
      GradedInputCard,
      MeaningOutputCard,
      ```
      Add a derived node next to `gradedInputCard` (~line 1483):
      ```tsx
      const meaningOutputCard = languageLearning?.meaningOutput ? (
        <MeaningOutputCard
          activity={languageLearning}
          onDismiss={() => setLanguageLearning(null)}
        />
      ) : null;
      ```
      Render it alongside `gradedInputCard` in the `footer` prop (~line 1647):
      ```tsx
      footer={
        <>
          {gradedInputCard}
          {meaningOutputCard}
          {challengeOfferCard}
          ...
      ```
      `gradedInputCard` and `meaningOutputCard` are mutually exclusive by
      construction — `buildLanguageActivityTelemetry` sets exactly one of
      `gradedInput` / `meaningOutput` per activity (verified in
      `language-session-engine.ts:600-620`) — so no extra guard is needed
      beyond each card's own presence check.
      done when: new test in `index.test.tsx` → "renders a meaning-output task
      from the typed language-learning done payload" (mirrors the existing
      "renders graded input from the typed language-learning done payload"
      test at line 1475) — streams a `languageLearning` done payload with
      `meaningOutput` set and no `gradedInput`, asserts
      `getByTestId('meaning-output-card')` and the task prompt text render.
      This test exercises the REAL (unmocked) `useSessionStreaming` hook, so
      it also proves T1's fix end-to-end through the full render path, not
      just the hook in isolation.

- [ ] T5: Surface the meaning-output task in the LLM prompt so the existing
      generic "Direct correction rules" section has concrete task context to
      correct against (AC4). In `apps/api/src/services/language-prompts.ts`,
      add a `meaningOutputLines` block to `formatLanguageSessionState`,
      analogous to the existing `gradedInputLines` block:
      ```ts
      const meaningOutput = activity.meaningOutput;
      const meaningOutputLines = meaningOutput
        ? [
            'Meaning-output task:',
            `- Task type: ${meaningOutput.taskType}`,
            `- Communicative goal: ${sanitizeXmlValue(
              meaningOutput.communicativeGoal,
              200,
            )}`,
            `- Task prompt given to the learner: ${sanitizeXmlValue(
              meaningOutput.prompt,
              300,
            )}`,
            `- Expected response mode: ${meaningOutput.responseMode}`,
            "- Judge the learner's reply against this specific task. If it is incomplete, off-task, or malformed, give the corrected/model form, briefly explain why, and ask for a retry on the same task before moving on.",
          ]
        : [];
      ```
      and splice it into the returned array (next to `...gradedInputLines,`):
      ```ts
      ...gradedInputLines,
      ...meaningOutputLines,
      ...previousComprehensionLines,
      ```
      done when: new test in `language-prompts.test.ts` → "includes the
      server-selected meaning-output task and correction+retry guidance when
      present" builds a context with `nextActivity.meaningOutput` populated,
      and asserts the joined prompt contains the task type, communicative
      goal, prompt text, AND (in the same joined string) the pre-existing
      generic correction/retry instructions ("Correct errors", "Ask for a
      quick retry after correcting.") — i.e. task-specific context and the
      correction+retry instruction co-occur in one prompt. This is the
      deterministic, Tier-1-testable proxy for AC4/AC5's "one correction+retry
      happy path" (a live LLM call is out of scope per the dispatch brief).

- [ ] T6: Sync i18n. Run `pnpm translate` (Doppler + Gemini) to generate the
      `session.meaningOutput.*` translations for the 6 shipped target locales
      (nb, de, es, pt, pl, ja) from the new `en.json` keys.
      done when: `pnpm run check:i18n` passes (no stale/missing keys).

- [ ] T7: Validate. Run, from the worktree root:
      - `cd apps/mobile && pnpm exec tsc --noEmit`
      - `pnpm exec nx lint mobile`
      - `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/use-session-streaming.ts src/components/session/use-session-streaming.test.ts src/app/\(app\)/session/index.tsx src/app/\(app\)/session/index.test.tsx src/lib/sse.ts --no-coverage`
      - `pnpm exec nx run api:typecheck`
      - `pnpm exec nx run api:lint`
      - `pnpm exec nx run api:test -- language-prompts`
      - `pnpm exec tsx scripts/check-i18n-jsx-literals.ts`
      - `pnpm run check:i18n`
      done when: all of the above pass with zero failures.

## Post-review remediation (Phase 4 adversarial review, findings F1/F2)

The Phase 4 adversarial review found that T5's correction+retry test only
proved the **presentation-turn** injection of the meaning-output brief
(`meaningOutputLines`): on the turn the learner actually **answers**,
`sessionStrandCounts.meaning_output` has already incremented, round-robin
`chooseNextLanguageStrand` rotates away, and `nextActivity.meaningOutput` is
empty — so the one correction-anchoring instruction disappears exactly when
it's needed, leaving correction to rest on conversation history plus the
always-on generic "Direct correction rules" text (F2). The T5 test's
assertions (`'Correct errors'`, `'Ask for a quick retry after correcting.'`)
are static strings present on every turn regardless of strand, so it proved
nothing about the answer turn specifically (F1).

Shepherd-adjudicated fix (minimal, additive, no deterministic answer
evaluator — mirrors the *re-surfacing* pattern already used for graded input's
`previousComprehension`, not its *evaluation* pattern):

- `apps/api/src/services/language-session-engine.ts`: added
  `previousMeaningOutputTask?: LanguageMeaningOutputArtifact` to
  `LanguageSessionState`, and `findPendingMeaningOutputTask()` — a
  **recency-guarded** lookup (consults only the single most recent AI turn,
  never walking further back, unlike the pre-existing
  `findLatestGradedInputEvent`) — wired into `buildLanguageSessionState`
  alongside the existing `previousComprehension` computation. Does **not**
  touch `chooseNextLanguageStrand` or force `activeStrand` back to
  `meaning_output`.
- `apps/api/src/services/language-prompts.ts`: added a
  `previousMeaningOutputLines` block, gated on
  `state.previousMeaningOutputTask`, that anchors the correction+retry
  instruction to the specific task the learner just answered — independent of
  whether `nextActivity.meaningOutput` (the *next* presented task) is
  populated.
- Tests: `language-session-engine.test.ts` gained two `buildLanguageSessionState`
  cases proving the field is populated for the immediately-following answer
  turn and is **not** re-surfaced once a newer turn has moved on (the bounded-
  recency property that avoids F3's staleness pattern). `language-prompts.test.ts`
  gained an answer-turn case asserting the gated brief — not the static
  generic text — is what's present for that state (F1 remediation).

F3 (stale graded-input `previousComprehension` mis-attributed to
meaning-output answers, via the recency-less `findLatestGradedInputEvent`) and
F4 (no standalone `MeaningOutputCard` render test, matching sibling
`GradedInputCard` convention) were adjudicated as out of scope / accepted —
not touched here; F3 is carried forward as a follow-up WI candidate.

## AC → task cross-reference

| AC | Satisfied by |
|---|---|
| Server-emitted `meaningOutput` preserved through streaming/mobile boundary | T1, T2 |
| Session UI renders one structured meaning-output task | T3, T4 |
| Learner can answer by text or voice using the existing input floor | No code change — `inputDisabled` in `session/index.tsx` has no strand/activityType condition (verified by reading the full prop derivation before writing this plan); composer already works for any active strand |
| Tutor gives direct correction and asks for a retry when incomplete/malformed | T5 (existing generic "Direct correction rules" + new task-specific context) + Post-review remediation (answer-turn re-surfacing via `previousMeaningOutputTask`) |
| Smoke/unit coverage proves the card/state path and one correction+retry happy path | T1, T4, T5 tests + Post-review remediation tests (answer-turn-gated assertion) |
