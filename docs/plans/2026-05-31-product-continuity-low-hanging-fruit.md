---
title: Product Continuity Low-Hanging Fruit Implementation Plan
date: 2026-05-31
profile: ui
status: draft
---

# Product Continuity Low-Hanging Fruit Implementation Plan

> **⚠️ Classification pending** (added 2026-06-01) — re-triage against the identity-foundation clean-cut target before acting on this plan. Not yet classified as identity-coupled vs. independent. See [`_wip/identity-foundation/ROADMAP.md`](../../_wip/identity-foundation/ROADMAP.md) § "Sibling-plan re-triage".

## Goal

Make the already-shipped learning value easier for students and family mentors to notice, trust, and act on.

The code audit shows that many core product promises are already present: learner home can recommend the next action, session summary records library/bookmark/reflection/next-topic state, family home has parent briefing cards, recaps carry conversation prompts and next-topic fields, Learn Together can bridge a child's topic into the adult's learning, and Mentor Memory has self/child management screens.

The low-hanging opportunity is not a new learning engine. It is better continuity: show what was saved, why the next action is recommended, what a parent should do next, and how voice/memory choices behave.

## Scope

In scope:

- Student home next-step copy and CTA clarity.
- Age-appropriate ordering of the four home intent cards: order them by age bracket (adults → "Learn something new" first; under-18/unknown → homework first), all at **equal visual weight — no per-option highlight**. The top hero/coach card stays the single highlighted CTA (untouched). No persistence, no backend (Task 8).
- Session summary saved-artifact visibility.
- My Notes hub previews and less-empty counts.
- Parent recap next-step visibility.
- Context-aware parent nudge defaults.
- Learner-facing retention wording.
- Voice permission timing.
- Focused tests and i18n updates for changed copy.

Out of scope:

- New tutoring algorithms.
- New mastery or retention enums.
- Parent access to raw child transcripts.
- Subscription or billing behavior.
- Recap ordered topic lists from `topicOrder`. Current docs conflict: one audit says mobile does not consume `topicOrder`, while a later completion-gating decision rejected an ordered recap list in favor of one accurate recommendation. This plan preserves the existing one-next-topic model until product direction is reconciled.

## File Map

- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/components/home/resolve-home-intent-actions.ts` (new — Task 8)
- `apps/mobile/src/components/home/CoachBand.tsx`
- `apps/mobile/src/components/home/parent-card-copy.ts`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- `apps/mobile/src/components/nudge/NudgeActionSheet.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx`
- `apps/mobile/src/app/session-summary/_view-models/session-summary-derived.ts`
- `apps/mobile/src/components/session-summary/SessionSummaryLibraryFilingControls.tsx`
- `apps/mobile/src/app/(app)/my-notes/index.tsx`
- `apps/mobile/src/app/(app)/my-notes/[kind].tsx`
- `apps/mobile/src/app/(app)/recaps/index.tsx`
- `apps/mobile/src/app/(app)/recaps/[recapId].tsx`
- `apps/mobile/src/app/(app)/progress/index.tsx`
- `apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx`
- `apps/mobile/src/components/session/ChatShell.tsx`
- `apps/mobile/src/i18n/locales/en.json`
- `apps/mobile/src/i18n/locales/*.json`
- `apps/mobile/src/i18n/source-baseline.json`
- Related colocated tests beside changed components and screens.

## Current Code Evidence

- `LearnerScreen` already ranks recovery, resume, review, quiz discovery, and subject hints. The visible copy is often generic and one branch says a topic is "starting to fade."
- `CoachBand` accepts a headline and generic `common.continue` CTA, but no reason line or action-specific CTA.
- `session-summary/[sessionId].tsx` already renders library filing controls, bookmarks, reflection, next topic, mentor memory cue, transcript CTA, wins, recall bridge, and suggestions. These appear as many separate modules, so users may not understand what was saved or changed.
- `my-notes/index.tsx` currently presents "Sessions, notes, and saved replies" with session count only. The notes and bookmark APIs already support paged lists, but the hub does not show recent previews.
- Recap schema/API already include `conversationPrompt`, `nextTopicTitle`, and `nextTopicReason`. Recap detail shows the conversation prompt and Learn This Too, but not the next-topic fields.
- Parent home already computes child attention and copy. `NudgeActionSheet` offers generic templates only and does not receive the reason that made the nudge useful.
- Parent card copy already has a positive-language guard in tests. Learner-facing progress/home copy still exposes deficit-ish words such as "fading" in visible strings.
- `ChatShell` proactively requests microphone permission on session entry. That makes voice ready, but it can surprise a text-first learner.

## End User Lens

### Student Lens

A student is usually not opening the app to manage a system. They are opening it because they have a question, homework, anxiety about being behind, or a vague intention to study. The app is strongest when it removes the first decision.

Likely student friction:

- "What should I do now?" Home has signals, but the strongest next action can still feel like a generic continuation prompt.
- "Did anything get saved?" Session summary has many useful artifacts, but they are scattered across separate sections.
- "Where did that useful explanation go?" My Notes exists, but the hub can feel thin if it only emphasizes sessions and does not preview notes or saved replies.
- "Am I failing this topic?" Retention language that says a topic is fading can feel like judgment rather than help.
- "Why is my phone asking for microphone access?" A permission prompt on session entry can feel surprising if the student expected text.

What the student wants more of:

- A confident next step with a reason.
- A clear post-session receipt: saved to Library, reflection saved, bookmark saved, transcript available, next topic ready.
- A visible trail back to useful explanations.
- Memory and review language that sounds supportive, not diagnostic.
- Control over voice/text without feeling pushed.

### Family Mentor Lens

A parent or family mentor is not trying to become a teacher dashboard operator. They want to know whether the child is okay, what happened recently, and one helpful thing they can do without making the child feel monitored.

Likely mentor friction:

- "What is the next helpful thing to say or do?" Parent Home has child-card intelligence, but generic nudge templates waste that context.
- "What should we talk about after the session?" Recap detail has a conversation prompt, but the next learning step is not surfaced even though the API already returns it.
- "Can I trust this without reading everything?" The app correctly avoids raw child transcript exposure, so the derived briefing has to carry more of the clarity burden.
- "How do I support without taking over?" Learn Together exists, but the product should keep nudges and recap copy warm, specific, and non-judgmental.

What the mentor wants more of:

- One-sentence child status that feels kind and actionable.
- A suggested nudge that matches today's context.
- A "coming up next" hint after each recap.
- Confidence that the app is protecting the child's privacy while still giving enough guidance.
- Fewer generic choices.

### Shared Lens

Both students and mentors need continuity. They need the app to answer:

- What just happened?
- What did you remember or save?
- What should I do next?
- Why that next step?

The seven changes in this plan are ranked by how directly they answer those four questions using data and components that already exist.

## User Journey Stress Test

### Moment 1: Student Opens The App

What the student likely feels:

- "I have limited energy. Please do not make me decide from scratch."
- "If I stopped midway last time, help me get back in."
- "If I am behind, do not make that feel like failure."

Current gap:

- Home has the right signals, but the highest-value recommendation can read like a generic prompt.
- Retention copy can make memory decay sound like a personal shortcoming.

Best low-hanging fix:

- Task 1: a specific best-next-step card.
- Task 6: constructive retention language.

### Moment 2: Student Enters A Session

What the student likely feels:

- "I might want to type quietly."
- "I might want to speak, but only when I choose it."
- "Do not interrupt me with phone-level permission friction before I know why."

Current gap:

- `ChatShell` can request microphone permission on entry, before an explicit voice action.

Best low-hanging fix:

- Task 7: delay microphone permission until an intentional voice action or explicit voice-mode launch.

### Moment 3: Student Finishes A Session

What the student likely feels:

- "Was that productive?"
- "What did the app keep?"
- "Can I find this later?"
- "What should I do next?"

Current gap:

- Session summary contains the ingredients, but the user must assemble the meaning from many sections.

Best low-hanging fix:

- Task 2: a compact saved-artifacts card that acts like a post-session receipt.

### Moment 4: Student Comes Back Later

What the student likely feels:

- "I remember getting a good explanation, but not where."
- "Notes should feel like my learning trail, not an empty archive."

Current gap:

- My Notes has the right destination, but the hub does not make notes/bookmarks feel alive when totals are unavailable.

Best low-hanging fix:

- Task 3: recent previews for sessions, notes, and saved replies.

### Moment 5: Family Mentor Checks In

What the mentor likely feels:

- "Is my child okay?"
- "What changed since last time?"
- "What is one kind, useful thing I can do?"
- "I do not want to sound like surveillance."

Current gap:

- Parent Home has useful child-card signals, but the nudge action loses that context.
- Recaps have next-topic fields, but the UI does not surface them.

Best low-hanging fix:

- Task 5: context-aware nudges.
- Task 4: recap "Coming up" fields.

## User-Impact Ranking

This is the user-pain ranking, separate from implementation order:

1. Best next step on Learner Home: highest leverage because it removes the first decision.
2. Saved from this session: builds trust immediately after effort.
3. My Notes previews: makes the student's learning trail findable.
4. Context-aware parent nudges: turns parent support from generic to timely.
5. Recap coming-up fields: helps mentors follow through without needing transcript access.
6. Constructive retention copy: protects motivation and emotional safety across review surfaces.
7. Voice permission timing: preserves user control and reduces first-session surprise.
8. Age-appropriate home action order: stops funneling adult self-learners toward "Help with an assignment" first; orders the four equal-weight cards by age bracket. Small but removes a daily mismatch for non-student users.

The implementation order still groups related code changes, but this ranking is the product rationale for why these seven beat other possible low-hanging improvements.

## Tasks

- [ ] 1. Make Learner Home's coach band a specific "best next step" card.

  Add a pure resolver near the home components, for example `apps/mobile/src/components/home/learner-next-step.ts`, that converts the existing inputs into display data:

  ```ts
  type LearnerNextStepKind = 'recovery' | 'resume' | 'review' | 'quizDiscovery';

  type LearnerNextStepCopy = {
    kind: LearnerNextStepKind;
    headline: string;
    body: string;
    ctaLabel: string;
    testID: string;
  };
  ```

  Keep the current priority order from `LearnerScreen`: recovery marker, resume target, overdue review, quiz discovery. Update `CoachBand` to accept `body` and `ctaLabel` props, with `common.continue` as the fallback only for callers that do not yet provide a specific label.

  Replace "starting to fade" with positive, action-oriented copy such as "Ready for a quick refresh." Use i18n keys instead of new hardcoded strings.

  Done when:

  - `LearnerScreen` renders one clear next-step card with a reason line.
  - Review/resume/quiz/recovery paths have action-specific CTA labels.
  - Focused tests cover the resolver priority order and at least the review copy path.
  - A search of changed learner-facing copy no longer finds "starting to fade."

- [ ] 2. Add a "Saved from this session" card to session summary.

  Create a small view-model helper, for example `apps/mobile/src/app/session-summary/_view-models/session-summary-artifacts.ts`, that derives rows from state the summary already has:

  ```ts
  type SessionSummaryArtifact = {
    id: 'library' | 'reflection' | 'bookmarks' | 'transcript' | 'memory' | 'nextTopic';
    label: string;
    value: string;
    status: 'saved' | 'available' | 'skipped' | 'notSaved';
  };
  ```

  Inputs should come from existing summary state only: library filing status, bookmark count, reflection submitted/skipped state, transcript availability or purge state, mentor memory cue visibility, and `nextTopicTitle`.

  Render the card near the top of `apps/mobile/src/app/session-summary/[sessionId].tsx`, after the closing line/library filing controls and before the longer "What happened" section. The card should answer "what did the app keep for me?" without adding new persistence.

  Done when:

  - A completed session summary shows library, reflection, bookmark, transcript, memory, and next-topic rows only when those signals apply.
  - Empty or unavailable artifacts are omitted or shown as explicit "not saved" only when that prevents confusion.
  - Tests cover a filed-library session, a no-bookmark session, and a skipped reflection session.
  - Parent proxy summaries still respect existing transcript/privacy behavior.

- [ ] 3. Make My Notes hub show recent previews instead of empty-feeling cards.

  In `apps/mobile/src/app/(app)/my-notes/index.tsx`, fetch small first pages for notes and bookmarks using existing hooks:

  ```ts
  useAllNotes({ limit: 3 });
  useBookmarks({ limit: 3 });
  useProfileSessionsArchive(activeProfile?.id, { limit: 3 });
  ```

  `useAllNotes` and `useBookmarks` read the active profile internally; `useProfileSessionsArchive` requires the active profile id. Do not add backend totals for this slice. If exact totals are unavailable, change the hub count pill to accept a string such as `3+` or hide the count and show the latest preview.

  Add one latest preview line per card: latest session title/date, latest note snippet, latest saved reply snippet. Keep `my-notes/[kind].tsx` as the full searchable archive.

  Done when:

  - The hub no longer implies notes/bookmarks have a count of zero just because no total exists.
  - Each card can show one recent preview when data exists.
  - Empty states are specific: no sessions, no notes, no saved replies.
  - Tests cover data-present and data-empty hub states.

- [ ] 4. Surface recap "Coming up" fields for family mentors.

  Use existing recap response fields from `packages/schemas/src/recaps.ts`: `nextTopicTitle` and `nextTopicReason`.

  In `apps/mobile/src/app/(app)/recaps/[recapId].tsx`, add a compact "Coming up" section after "What happened" and before the current conversation prompt / Learn This Too actions:

  ```tsx
  {recap.nextTopicTitle ? (
    <RecapComingUpCard
      title={recap.nextTopicTitle}
      reason={recap.nextTopicReason}
    />
  ) : null}
  ```

  In `apps/mobile/src/app/(app)/recaps/index.tsx`, add a short row line such as `Coming up: Fractions with unlike denominators` when `nextTopicTitle` exists.

  Done when:

  - Recap detail shows the child's likely next learning step using existing API data.
  - Recap list gives mentors a scannable next-step hint.
  - Missing `nextTopicTitle` keeps the current layout without a blank placeholder.
  - Tests cover recap detail with and without next-topic fields.

- [ ] 5. Make parent nudges context-aware.

  Extend `NudgeActionSheet` props:

  ```ts
  type NudgeActionSheetProps = {
    childProfileId: string;
    childName: string;
    visible: boolean;
    onClose: () => void;
    recommendedTemplate?: NudgeTemplate;
    contextLine?: string;
  };
  ```

  Keep the existing template enum and send behavior. In `ParentHomeScreen`, derive a recommendation from existing child-card signals:

  - Attention needed or review due: `you_got_this`.
  - Quiet week or low activity: `quick_session`.
  - Strong recent momentum: `proud_of_you`.
  - No clear signal: leave undefined and keep current generic order.

  In the sheet, place the recommended template first or mark it with a small "Recommended" label, and show the `contextLine` above the template list.

  Done when:

  - Opening nudge from a child card can explain why one message is suggested.
  - The send payload remains compatible with existing backend behavior.
  - The sheet still works with no recommendation.
  - Tests cover recommended-first ordering and the generic fallback.

- [ ] 6. Unify learner-facing retention copy around constructive language.

  Keep internal retention states and API names unchanged. Update only visible copy in home/progress/session surfaces and i18n files.

  Replace visible language like:

  - "starting to fade"
  - "fading"
  - "weak"
  - "forgotten"

  with action-oriented alternatives:

  - "ready for a quick refresh"
  - "worth revisiting"
  - "needs a fresh pass"
  - "keep it warm"

  Be careful not to rename enum values, fixture keys, or analytics identifiers. Add or update copy tests where the repo already has parent positive-language coverage.

  Done when:

  - Learner-visible home/progress copy no longer uses deficit labels for memory state.
  - Internal enum names and API contracts are untouched.
  - i18n source baseline and locale files are updated through the repo's existing translation flow.
  - Tests or a targeted `rg` check document the intended absence of the old visible strings.

- [ ] 7. Delay microphone permission until the learner chooses voice.

  In `apps/mobile/src/components/session/ChatShell.tsx`, remove or gate the mount-time microphone permission request so a text-first learner can enter a session without a native permission prompt.

  Keep the mic button visible. Request permission when:

  - The learner taps the mic button.
  - The session is explicitly launched in voice mode.
  - Existing voice-start logic requires permission before recording.

  Inspect the voice hook before editing so the permission call is not duplicated. If `startListening()` already requests permission, prefer using that single path.

  Done when:

  - Rendering `ChatShell` in default text mode does not call `requestMicrophonePermission`.
  - Tapping the mic still requests permission and starts the current voice flow.
  - Voice-mode sessions still prepare voice intentionally.
  - Existing mic-in-pill UI remains discoverable.

- [ ] 8. Order the four home intent cards by age bracket, and remove the per-option highlight.

  > **Identity-independent** (not coupled to owner/role/profile-shape) — can proceed regardless of the plan's pending identity-foundation re-triage. No persistence, no API, no schema, no migration.
  >
  > **Scope note:** this is **Part A only**. The originally-sketched "last-used behavioral personalization" (persist the last-tapped action and promote it) is **deferred to post-launch** — its payoff requires returning-user history that doesn't exist pre-launch, it adds a moving-UI element and net code/persistence for an unproven, deferred benefit, and at launch it would behave identically to this age default anyway. See "Deferred (post-launch)" below.

  Today `HOME_INTENT_ACTIONS` in `LearnerScreen.tsx` is a static array with `home-action-homework` hardcoded `highlight: true` and first (`:80-110`), rendered at `:648` where `action.highlight` swaps the card to `bg-primary-soft border-primary/40` (`:657-661`). Two changes: (1) **order** the four cards by age bracket; (2) **remove the per-option highlight entirely** so all four sit at equal visual weight. The top hero/coach card (the genuinely highlighted CTA) is a separate element and is **not touched** by this task.

  **(a) Remove the highlight mechanic for these four cards.** Delete the `highlight?: boolean` field from the `HomeIntentAction` type, delete `highlight: true` from the homework entry, and in the render replace the conditional `className` with the single non-highlighted style for all four:

  ```tsx
  // was: action.highlight ? 'bg-primary-soft border-primary/40' : 'bg-surface border-border'
  // now: 'bg-surface border-border'   // all four equal weight
  ```

  (Grep confirms the action `highlight` field is referenced only here — `LearnerScreen.tsx:77,87,658`; the `bg-highlight-bg` chip at `:593` is an unrelated element and stays.)

  **(b) Extract the actions + a pure resolver** into `apps/mobile/src/components/home/resolve-home-intent-actions.ts`. Move the `HomeIntentAction` type and the `HOME_INTENT_ACTIONS` const out of `LearnerScreen.tsx` into this module (import them back), so the resolver is self-contained and unit-testable. The resolver only **reorders** (no highlight):

  ```ts
  import type { AgeBracket } from '@eduagent/schemas';

  const ADULT_FIRST_TEST_ID = 'home-action-study-new';   // adults → "Learn something new" first
  const DEFAULT_FIRST_TEST_ID = 'home-action-homework';  // under-18 OR unknown birthYear → preserves today's order + the homework wedge

  export function resolveHomeIntentActions(
    actions: HomeIntentAction[],
    opts: { ageBracket: AgeBracket | null },
  ): HomeIntentAction[] {
    const firstId =
      opts.ageBracket === 'adult' ? ADULT_FIRST_TEST_ID : DEFAULT_FIRST_TEST_ID;
    const first = actions.find((a) => a.testID === firstId);
    const rest = actions.filter((a) => a.testID !== firstId);
    return first ? [first, ...rest] : [...actions];
  }
  ```

  For `null` bracket (birthYear unknown) the order is byte-for-byte today's layout — no regression.

  **(c) Wire into `LearnerScreen`:** compute the bracket, resolve, render the resolved list:

  ```tsx
  const ageBracket = activeProfile?.birthYear != null
    ? computeAgeBracket(activeProfile.birthYear)
    : null;
  const intentActions = resolveHomeIntentActions(HOME_INTENT_ACTIONS, { ageBracket });
  // render intentActions.map(...) instead of HOME_INTENT_ACTIONS.map(...)
  ```

  `computeAgeBracket` is the canonical, sanctioned age-presentation helper (`packages/schemas/src/age.ts`); reordering is presentation, not feature-gating, so this is rule-clean. No new i18n keys — titles/subtitles are unchanged; only order moves. No `openIntentAction` change.

  **Relationship to Task 1 (now clean, no competing emphasis):** with the per-option highlight removed, the only highlighted CTA on the home is the top hero/coach card (Task 1's "best next step"). The four intent cards are an equal-weight menu beneath it, merely ordered by age. One hero, one menu — no two-highlight competition.

  **Deferred (post-launch), recorded so it isn't re-discovered as a gap:** last-used (recency) or most-used (frequency) behavioral personalization of the *order* of these cards, with this age default as the cold-start fallback. Deferred because the payoff needs returning-user history (none pre-launch) and it adds moving-UI + persistence for an unproven benefit. If revisited, prefer recency over frequency (one stored value vs. a running tally; "continue what you do" is the sharper signal). Cheapest implementation would be a profile-scoped local key via the `secure-storage` wrapper that `lib/intro-state.ts` uses — no backend.

  Done when:

  - `resolve-home-intent-actions.test.ts` covers: `'adult'` → `home-action-study-new` first; `'adolescent'` → `home-action-homework` first; `null` → `home-action-homework` first (today's order, no regression). (Order only — the resolver no longer sets any highlight.)
  - `LearnerScreen` renders `home-action-study-new` first for an adult fixture profile and `home-action-homework` first for an under-18 fixture, and **none** of the four cards renders the `bg-primary-soft` highlight style.
  - The existing assertion in `LearnerScreen.test.tsx` (~`:395-404`) is updated: drop any assertion that homework is *highlighted*; assert order for the fixture's `birthYear` (under-18 → homework first, unchanged; adult → `home-action-study-new` first).
  - No new i18n keys; no persistence; no backend/schema/migration changes.
  - `pnpm exec nx lint mobile` and `apps/mobile` `tsc --noEmit` are clean.

## Verification

Run focused checks first:

```powershell
Push-Location apps/mobile
pnpm exec jest --findRelatedTests 'src/components/home/LearnerScreen.tsx' 'src/components/home/CoachBand.tsx' --no-coverage
pnpm exec jest --findRelatedTests 'src/app/session-summary/[sessionId].tsx' --no-coverage
pnpm exec jest --findRelatedTests 'src/app/(app)/my-notes/index.tsx' 'src/app/(app)/recaps/[recapId].tsx' --no-coverage
pnpm exec jest --findRelatedTests 'src/components/nudge/NudgeActionSheet.tsx' 'src/components/session/ChatShell.tsx' --no-coverage
Pop-Location
```

Then run the mobile quality gates touched by this plan:

```powershell
pnpm exec nx lint mobile
Push-Location apps/mobile
pnpm exec tsc --noEmit
Pop-Location
```

If i18n files change, run the repo's i18n checks:

```powershell
pnpm translate
pnpm check:i18n
pnpm check:i18n:orphans
```

If selectors or visible flows change in tested areas, update and run the relevant Maestro smoke flows through the repo's E2E skill.

## Implementation Order

1. Do tasks 1 and 6 together because both touch learner next-step and retention copy.
2. Do task 2 next because it improves the post-session moment students see most.
3. Do tasks 4 and 5 together because both improve mentor follow-through after a child session.
4. Do task 3 after the copy patterns settle so My Notes can reuse the same artifact language.
5. Do task 7 last because it is behavior-sensitive and needs focused voice tests.
6. Do task 8 alongside task 1 — both edit `LearnerScreen` next-step emphasis; landing them together keeps the "contextual band vs. habitual action card" split coherent and avoids two passes over the same render tree.

## Risks And Mitigations

- Risk: Copy changes break tests that assert exact strings.
  Mitigation: Update tests to assert the user-visible intent and add targeted absence checks only for the problematic wording.

- Risk: My Notes hub appears to show exact totals when only first pages are loaded.
  Mitigation: Use previews or `3+` style labels only when a next cursor exists; otherwise hide exact counts.

- Risk: Contextual nudges make a parent feel judged.
  Mitigation: Phrase `contextLine` around opportunity and support, not deficit. Example: "A short encouragement fits today's review queue."

- Risk: Voice permission changes make voice feel slower.
  Mitigation: Keep the mic affordance visible and request permission on the first intentional voice action.

- Risk: Session summary gains another dense module.
  Mitigation: The new card should replace confusion, not add detail. Keep rows short and link out to Library, My Notes, or Mentor Memory only when useful.

- Risk (Task 8): removing the per-option highlight makes the homework action less prominent for students who do want homework help.
  Mitigation: For under-18 profiles homework is still ordered first; the top hero/coach card (Task 1) remains the single highlighted CTA and can itself surface a homework next-step when contextually relevant. The four cards stay an always-visible, equal-weight menu — nothing is hidden.
