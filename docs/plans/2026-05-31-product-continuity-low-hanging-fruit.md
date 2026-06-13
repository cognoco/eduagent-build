---
title: Product Continuity Low-Hanging Fruit Implementation Plan
date: 2026-05-31
profile: ui
status: reviewed-not-started — phased (copy layer do-now; proxy-coupled tasks parked)
last_reviewed: 2026-06-09
implemented: 0 of 7 tasks
---

# Product Continuity Low-Hanging Fruit Implementation Plan

> **STATUS AT A GLANCE** (updated 2026-06-09 — read this before acting)
>
> - **What this is:** seven *small* UX-continuity improvements that surface already-shipped learning value — better next-step copy, a post-session "saved" receipt, My Notes previews, recap "coming up" hints, context-aware parent nudges, constructive retention copy, and deferred mic permission. **Not a new learning engine.**
> - **Implemented?** **No — 0 of 7 tasks built.** Verified 2026-06-09 on branch `new-llm`: none of the proposed files exist (`learner-next-step.ts`, `session-summary-artifacts.ts`, `RecapComingUpCard`), `CoachBand` still lacks `body`/`ctaLabel`, `NudgeActionSheet` has no `recommendedTemplate`/`contextLine`, the mount-time mic request still lives at `ChatShell.tsx:319-321`, and "starting to fade" is still live at `LearnerScreen.tsx:367`. Every "Current Code Evidence" claim below still describes live state.
> - **Should it be implemented?** **Partially, and phased — not as a 7-task batch.** Pre-launch with no users, building all seven on a hunch risks polishing the wrong surfaces, and three tasks depend on a parent-proxy model that is being reworked. The recommendation:
>     - **Phase A — do now (Tasks 1 + 6):** the copy layer. Identity-independent, no new data fetching, no privacy surface, safe to ship blind; these are the plan's own #1 and #6 user-pain items, at ~15–20% of total cost.
>     - **Phase B — parked (Tasks 2, 3, 5):** all depend on `isProxyMode` / parent-proxy / child-profile gating that the **identity-foundation clean-cut — the ratified identity rebuild that dissolves the `owner` role, reverts the empty `T1` org/membership tables, and re-homes `profiles` FKs onto a new `person` table** — is rewriting. Building proxy gating now = throwaway work. Re-cost after that migration lands.
>     - **Phase C — small guarded follow-ups (Tasks 4, 7):** each is cheap but carries one trap (Task 4 newly exposes LLM text to mentors with no guard; Task 7 trades instant voice for a first-use permission dialog). Do each on its own small PR with the attached guard/test.
> - **Blocked by:** identity-foundation clean-cut for Phase B. This supersedes the earlier "Classification pending" banner — the re-triage is done and lives in "80/20 Analysis & Phasing" below.
> - **Adversarial end-user review (2026-06-09):** findings folded into the tasks inline (marked **Review finding**) and summarised in "80/20 Analysis & Phasing."

## Goal

Make the already-shipped learning value easier for students and family mentors to notice, trust, and act on.

The code audit shows that many core product promises are already present: learner home can recommend the next action, session summary records library/bookmark/reflection/next-topic state, family home has parent briefing cards, recaps carry conversation prompts and next-topic fields, Learn Together can bridge a child's topic into the adult's learning, and Mentor Memory has self/child management screens.

The low-hanging opportunity is not a new learning engine. It is better continuity: show what was saved, why the next action is recommended, what a parent should do next, and how voice/memory choices behave.

## Scope

In scope:

- Student home next-step copy and CTA clarity.
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

The implementation order still groups related code changes, but this ranking is the product rationale for why these seven beat other possible low-hanging improvements.

## 80/20 Analysis & Phasing

This section is the decision layer added after the 2026-06-09 end-user review. It answers "what is worth building, when, and why" so the plan can be picked up later without re-deriving the trade-offs.

**The 80/20:** the plan ranks "best next-step copy" (#1) and "constructive retention copy" (#6) as the two highest user-pain items. Those are also the *only* parts that are identity-independent, add no data fetching, open no privacy surface, and are safe to ship before launch (copy cannot break trust the way a privacy leak can). So **the copy layer captures most of the felt value for a fraction of the cost.** The structural tasks (receipt, previews, nudges) are perceived-value bets that, with zero users today, are better validated by the first cohort than built on a hunch.

| Phase | Tasks | Status | Rationale |
|---|---|---|---|
| **A — do now** | 1 (next-step copy + CoachBand `body`/`ctaLabel`), 6 (constructive retention copy) | **Recommended, unstarted** | Identity-independent, no proxy/privacy surface, ~15–20% of total effort, delivers the #1 and #6 ranked items. Minimum slice if even this feels heavy: just the two visible deficit strings (`LearnerScreen.tsx:367` + `en.json:159`). |
| **B — parked** | 2 (session receipt), 3 (My Notes previews), 5 (context-aware nudges) | **Parked — identity-blocked** | All lean on `isProxyMode` / parent-proxy / child-profile gating that the identity-foundation clean-cut is rewriting (owner dissolved, `profiles`→`person`). Task 3 additionally has a live privacy risk (child note/saved-reply snippets to a proxy parent). Re-cost after the migration lands; do **not** build proxy gating against the old model. |
| **C — small guarded follow-ups** | 4 (recap "coming up"), 7 (defer mic permission) | **Optional, each guarded** | Cheap and identity-independent, but each carries one trap (see the task bodies). Ship on separate small PRs with the attached guard/test; not "free." |

**Why phasing and not all-in:**

- **No users to validate against** — five of seven tasks are perceived-value bets; you cannot tell which continuity gaps actually bite until a real cohort hits them.
- **Identity coupling** — Tasks 2/3/5 would be written twice if built before the clean-cut.
- **Aggregate cost** — 7 tasks × ~14 files, each carrying i18n (translate across 7 locales, orphan-key + keep-rot guards, source-baseline) and colocated tests. "Low-hanging" individually, a real chunk together.
- **One task can actively harm** — Task 3 (privacy), versus the rest which only under-deliver. Keep it out of any "quick win" framing.

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
    status: 'saved' | 'available';
  };
  ```

  Inputs should come from existing summary state only: library filing status, bookmark count, reflection submitted/skipped state, transcript availability or purge state, mentor memory cue visibility, and `nextTopicTitle`. (A real `status === 'skipped'` signal exists at `[sessionId].tsx:211`, but the **student-facing** receipt deliberately does not surface skip/not-saved states — see the done-when below.)

  Render the card near the top of `apps/mobile/src/app/session-summary/[sessionId].tsx`, after the closing line/library filing controls and before the longer "What happened" section. The card should answer "what did the app keep for me?" without adding new persistence.

  Done when:

  - A completed session summary shows library, reflection, bookmark, transcript, memory, and next-topic rows only when those signals apply.
  - Empty or unavailable artifacts are **omitted entirely**, never shown as "skipped" or "not saved" — the receipt celebrates what was kept and must not read as a failure scorecard to an anxious learner (positive-framing rule; cf. the parent-copy banned-phrase guard in `parent-card-copy.test.ts:254-265`). If a "you can still add a reflection" affordance is wanted, frame it as an opportunity CTA, not a status label.
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

  > **Review finding (2026-06-09) — privacy gate, Phase B blocker.** `useAllNotes`/`useBookmarks` key on `activeProfile?.id` with **no** parent-proxy guard (`use-notes.ts:40-43`, `use-bookmarks.ts:27-39`), unlike `useProfileSessionsArchive` which gates on `profileId === viewerProfileId` (`use-progress.ts:551`). The session-summary screen deliberately hides child chat content from a proxy parent (`[sessionId].tsx:966,1000`). Before building, **verify whether My Notes is reachable in parent-proxy mode.** If it is, gate the note/saved-reply **snippet previews** behind the same `isProxyMode` / `showLearningActions` contract the summary uses (`[sessionId].tsx:156`) — surfacing child-private snippets on the hub landing is a privacy regression. This is the main reason Task 3 sits in parked Phase B.

  Add one latest preview line per card: latest session title/date, latest note snippet, latest saved reply snippet. Keep `my-notes/[kind].tsx` as the full searchable archive.

  Done when:

  - The hub no longer implies notes/bookmarks have a count of zero just because no total exists.
  - Each card can show one recent preview when data exists.
  - Empty states are specific: no sessions, no notes, no saved replies.
  - Tests cover data-present and data-empty hub states.
  - **Proxy-mode My Notes shows no child note/saved-reply snippet previews** (test asserts this), or My Notes is confirmed unreachable in proxy mode.

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

  > **Review finding (2026-06-09) — unguarded LLM text crosses to mentors.** Today `nextTopicReason` is **learner-only** (`[sessionId].tsx:1143-1146`); parent surfaces use only `nextTopicTitle` (`parent-card-copy.ts:157-159`). Rendering `reason={recap.nextTopicReason}` in the mentor-facing recap detail makes it the **first** LLM-generated reason text shown to a parent. It is neutral *by prompt only* (`session-recap.ts:131-136`), with no enforced guard like the parent-copy banned-phrase test. Either (a) show mentors only the **title** (consistent with `parent-card-copy.ts` today), or (b) extend the `parent-card-copy.test.ts:254-265` banned-phrase guard to cover `nextTopicReason` fixtures so a future prompt drift cannot leak deficit language to a parent.

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

  > **Review finding (2026-06-09) — `contextLine` needs a guard.** The existing positive-language guard (`parent-card-copy.test.ts:254-265`) covers authored card/pulse templates but **not** a new free-form `contextLine`, which is derived from attention/review-due state and so signals to the parent that something is wrong. Route `contextLine` strings through authored i18n keys and add them to the banned-phrase guard test so contextual nudges cannot drift into surveillance/deficit phrasing.

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

  > **Review finding (2026-06-09) — scope is smaller than it looks.** The only *visible* learner-facing deficit strings are `en.json:159` ("Review what is fading…") and the **hardcoded** template at `LearnerScreen.tsx:367` ("…it's starting to fade."). The retention status labels are **already** softened ("Getting fuzzy" `en.json:1754`, "Needs a quick refresh" `:1757`, "Needs a fresh pass" `:1760`); "weak"/"forgotten" survive only as internal/enum keys and must be left alone. Note that `LearnerScreen.tsx:367` is a hardcoded template literal today — it must be **migrated into i18n** (it currently bypasses the orphan-key checker), not edited in place.

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

  Inspect the voice hook before editing so the permission call is not duplicated. If `startListening()` already requests permission, prefer using that single path. (It does: `use-speech-recognition.ts:181` already calls `requestPermissionsAsync()` before `start()` at `:193`, so removing the mount-time request leaves a single, intentional request — the right end state.)

  > **Review finding (2026-06-09) — this is a trade, not a free win; frame it honestly.** The mount-time request is *deliberate* — `ChatShell.tsx:314-318` documents that Android forbids silent `RECORD_AUDIO` grants, so the on-entry dialog is "the closest thing to allowed-by-default." Removing it helps text-first learners (the goal) but means a voice-first learner's **first** mic tap fires the OS permission dialog at the moment of intent. The flow still ends in recording (`startListening` awaits the grant, then `start()`s), so no utterance is lost — but it is a new first-use interruption, not pure upside. Supersede the `ChatShell.tsx:314-318` rationale explicitly in the code comment when you make the change.

  Done when:

  - Rendering `ChatShell` in default text mode does not call `requestMicrophonePermission`.
  - Tapping the mic still requests permission and starts the current voice flow.
  - Voice-mode sessions still prepare voice intentionally.
  - Existing mic-in-pill UI remains discoverable.
  - The first intentional voice tap flows dialog → grant → record in **one** gesture with no lost utterance (asserted by test), so deferring the prompt does not make first-use voice feel broken.

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

> Supersession note (2026-06-09): the phasing in "80/20 Analysis & Phasing" governs *whether/when* each task is built (Phase A now, B parked, C guarded). The sequence below is the code-grouping order **within** whatever phases you action.

1. Do tasks 1 and 6 together because both touch learner next-step and retention copy.
2. Do task 2 next because it improves the post-session moment students see most.
3. Do tasks 4 and 5 together because both improve mentor follow-through after a child session.
4. Do task 3 after the copy patterns settle so My Notes can reuse the same artifact language.
5. Do task 7 last because it is behavior-sensitive and needs focused voice tests.

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

- Risk: My Notes previews leak child-private notes/saved replies to a proxy parent (Task 3).
  Mitigation: Gate previews behind the existing `isProxyMode` contract, or confirm My Notes is unreachable in proxy mode. Tracked as the Phase B blocker. See Task 3 review finding.

- Risk: A post-session "receipt" listing skipped/not-saved artifacts reads as a failure scorecard (Task 2).
  Mitigation: Show only positive saved/available rows; omit the rest. See Task 2 review finding.

- Risk: Recap "coming up" surfaces unguarded LLM reason text to mentors (Task 4).
  Mitigation: Show title only, or extend the parent-copy banned-phrase guard to cover `nextTopicReason`. See Task 4 review finding.

## Review History

- **2026-06-09 — adversarial end-user review.** All 7 tasks verified unstarted on branch `new-llm`. Three HIGH end-user findings (Task 7 voice-permission framing, Task 2 deficit-framed receipt, Task 3 proxy privacy) and three MEDIUM (Task 4 unguarded mentor text, Task 6 overstated scope, Task 5 unguarded `contextLine`) folded into the task bodies as **Review finding** notes. Added the status banner, the 80/20 analysis, and phasing (A do-now / B parked-identity-blocked / C guarded follow-ups). The earlier "Classification pending" banner is resolved into the phasing.
