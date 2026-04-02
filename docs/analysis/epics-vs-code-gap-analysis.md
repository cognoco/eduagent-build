# Epics vs Code Gap Analysis

Date: 2026-04-02
Updated after a verification pass against the current codebase and a learner-session agency control update.

## Scope and method

- `docs/epics.md` was used as the expected-state guide.
- Findings below are based on implemented code in `apps/mobile`, `apps/api`, and `packages/*`, plus targeted tests where useful.
- Negative gap = the epic/story expectation is still missing, only partially wired, or implemented with a materially different architecture than the stories describe.
- Positive gap = the codebase is already ahead of the stories/status notes, so the docs should be updated to match reality.
- This is still a summary document, not a line-by-line acceptance-criteria audit of every story in `epics.md`.

## Executive summary

The previous draft overstated several learner-facing gaps. After re-checking the code, the mobile app already has:

- a ranked 2-3 card learner home surface with dismiss controls
- in-session parking lot UI
- Learning Book multi-subject browsing plus pause/resume/archive/restore controls
- a learner-facing "Why this order?" flow in curriculum review

The learner session surface is also stronger now than it was in the prior draft. It has per-message feedback, contextual quick chips (`I know this`, `Explain differently`, `Too easy`, `Too hard`, plus hint/example), a topic-switch sheet, parking lot access, and a visible `Guided` / `Independent` badge.

The biggest remaining negative gaps are now narrower than before:

- Epic 12 home-card architecture is still client-side rather than API-backed
- Epic 14 session-agency parity is close, but not fully story-complete
- OpenAI OAuth is still absent from auth flows

## Remaining negative gaps

### 1. Home cards are implemented in mobile UX, but Epic 12 backend parity is still missing

- Epic expectation: Epic 12 Story 12.7 and Epic 14 Story 14.1 expect `precomputeHomeCards(profileId)`, `GET /v1/home-cards`, server-ranked cards, and dismissal/tap telemetry feeding the ranking model.
- Code evidence:
  - `apps/mobile/src/app/(learner)/home.tsx` builds and ranks multiple learner home cards (`resume_session`, `review`, `study`, `homework`, `ask`, `restore_subjects`) and renders the top 3.
  - `apps/mobile/src/components/coaching/HomeActionCard.tsx` provides the dismiss affordance.
  - `apps/mobile/src/lib/home-card-dismissals.ts` persists dismissal counts per profile in SecureStore, and `home.tsx` deprioritizes cards after 3 dismissals.
  - The API still exposes the older single-card model in `apps/api/src/services/coaching-cards.ts` and `apps/api/src/routes/coaching-card.ts`.
  - No server-side `precomputeHomeCards()`, `/home-cards`, `home_card_tap`, or `home_card_dismiss` event was found.
- Assessment: Partial negative gap. The learner-facing UX exists, but the Epic 12 architecture and telemetry model are not fully implemented.

### 2. Session agency is mostly implemented, but not yet a perfect Story 14.5-14.8 match

- Epic expectation: Epic 14 Phase C calls for per-message feedback, contextual quick chips, topic switching, and visible guidance mode controls.
- Code evidence:
  - `apps/mobile/src/app/(learner)/session/index.tsx` now includes:
    - contextual quick chips under the latest AI message
    - per-message feedback (`Helpful`, `Not helpful`, `That's incorrect`)
    - `switch topic` and `park it` session tools
    - learner-side `Guided` / `Independent` badge with an explanation dialog
    - incorrect-answer flagging through `useFlagSessionContent`
  - `apps/api/src/routes/sessions.ts` and `apps/api/src/services/session.ts` already support `system-prompt` recording and message flagging.
- Remaining differences from the stories:
  - topic switching still uses `router.push()` into a fresh session route rather than resetting in place on the same screen
  - no explicit "Wrong subject" chip appears after suspected misclassification
  - feedback/chip confirmation is implicit rather than a dedicated toast pattern
- Assessment: Medium-confidence partial gap. This is no longer a broad missing-feature gap; it is now a smaller parity/polish gap.

### 3. OpenAI OAuth is still not implemented in the auth flow

- Epic expectation: FR1 lists email/password, Google OAuth, Apple Sign-in, and OpenAI OAuth.
- Code evidence:
  - `apps/mobile/src/app/(auth)/sign-in.tsx` and `apps/mobile/src/app/(auth)/sign-up.tsx` implement email/password, Google, and Apple flows.
  - No learner-mobile OpenAI OAuth UI or auth wiring was found.
- Assessment: Still a likely negative gap, but lower confidence as a build priority because later compliance/App Store notes in `epics.md` still make the long-term OAuth direction ambiguous.

## Resolved or stale findings from the previous draft

These were previously listed as negative gaps, but the codebase already implements them.

### 1. Multi-card learner home screen and dismissal already exist

- `apps/mobile/src/app/(learner)/home.tsx`
- `apps/mobile/src/components/coaching/HomeActionCard.tsx`
- `apps/mobile/src/lib/home-card-dismissals.ts`

The remaining gap is architectural parity with Epic 12, not absence of the learner-facing feature.

### 2. Parking lot is already surfaced in learner mobile UX

- `apps/mobile/src/app/(learner)/session/index.tsx`
- `apps/mobile/src/hooks/use-sessions.ts`
- `apps/api/src/routes/parking-lot.ts`
- `apps/api/src/services/parking-lot-data.ts`

This is not backend-only anymore. Learners can open a parking lot sheet, save questions, and view parked items during the session.

### 3. Learning Book subject lifecycle is already implemented for multi-subject use

- `apps/mobile/src/app/(learner)/book.tsx`
- `apps/mobile/src/hooks/use-subjects.ts`
- `apps/api/src/routes/subjects.ts`
- `apps/api/src/services/subject.ts`
- `apps/api/src/inngest/functions/subject-auto-archive.ts`

The Learning Book now supports:

- multi-subject browsing with filter tabs
- loading retention data across all subjects via `useQueries`
- learner-side pause, resume, archive, and restore controls
- inactive-subject visibility in the book
- auto-archive infrastructure in the backend

### 4. "Why this order?" is already wired into learner UI

- `apps/mobile/src/app/(learner)/onboarding/curriculum-review.tsx`
- `apps/mobile/src/hooks/use-curriculum.ts`
- `apps/api/src/routes/curriculum.ts`
- `apps/api/src/services/curriculum.ts`

The previous claim that this existed only in API/hooks was stale. Learners can request an explanation from curriculum review and see the response in a modal.

## Positive gaps

These are places where the implementation is ahead of the stories/status notes. The right response is to update the docs, not to remove the feature from code.

### 1. Voice mode is already implemented across session surfaces

- Epic/story baseline: Epic 8 is still framed as deferred / v1.1 in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/components/session/ChatShell.tsx`
  - `apps/mobile/src/components/session/VoiceToggle.tsx`
  - `apps/mobile/src/components/session/VoiceRecordButton.tsx`
  - `apps/mobile/src/components/session/VoicePlaybackBar.tsx`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
- Assessment: Positive gap. Voice is implemented with toggle, recording, playback, replay, and speed controls.

### 2. The homework overhaul from Epic 14 is largely implemented

- Epic/story baseline: Epic 14 Phase B is still treated as future work in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/app/(learner)/homework/camera.tsx`
  - `apps/mobile/src/app/(learner)/homework/problem-cards.ts`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
  - `apps/api/src/services/exchanges.ts`
  - `apps/api/src/services/homework-summary.ts`
  - `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`
- Assessment: Strong positive gap. The homework flow is far beyond "not started."

### 3. Advanced verification is already live in the codebase

- Epic/story baseline: `EVALUATE`, `TEACH_BACK`, and analogy-domain preferences are still treated as extensions or future-facing in the story set.
- Code evidence:
  - `apps/api/src/services/evaluate.ts`
  - `apps/api/src/services/evaluate-data.ts`
  - `apps/api/src/services/teach-back.ts`
  - `apps/api/src/services/verification-completion.ts`
  - `packages/database/src/schema/assessments.ts`
  - `apps/mobile/src/app/(learner)/onboarding/analogy-preference.tsx`
  - `apps/mobile/src/app/(learner)/subject/[subjectId].tsx`
- Assessment: Positive gap. The advanced verification model is already part of the product implementation.

### 4. Subject creation and curriculum agency are richer than the stories imply

- Epic/story baseline: Epic 14.3 and 14.4 describe add-topic and ambiguous-subject escape hatches.
- Code evidence:
  - `apps/mobile/src/app/create-subject.tsx`
  - `apps/mobile/src/app/(learner)/onboarding/curriculum-review.tsx`
  - `apps/mobile/src/hooks/use-curriculum.ts`
  - `apps/api/src/routes/curriculum.ts`
- Assessment: Positive gap. The implemented experience is richer than the minimum story text.

### 5. Consent is more robust than the baseline consent stories

- Epic/story baseline: the core consent stories focus on request/approve/deny and onboarding gating.
- Code evidence:
  - `apps/api/src/routes/consent-web.ts`
  - `apps/api/src/services/consent.ts`
  - `apps/api/src/routes/consent.ts`
  - `apps/mobile/src/app/consent.tsx`
  - `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`
- Assessment: Positive gap. The codebase has moved beyond the baseline stories.

### 6. Session lifecycle polish is ahead of the documented baseline

- Epic/story baseline: recovery, wrap-up polish, and fast post-session feedback are treated as later refinements in the docs.
- Code evidence:
  - `apps/mobile/src/app/(learner)/home.tsx`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
  - `apps/mobile/src/app/session-summary/[sessionId].tsx`
  - `apps/api/src/services/session-lifecycle.ts`
- Assessment: Positive gap. Recovery, wrap-up, and celebration handling are more mature than the current epic narrative suggests.

### 7. Celebrations are implemented as a real system, not just a concept

- Epic/story baseline: celebration work is still described in several places as partial or future cleanup.
- Code evidence:
  - `apps/api/src/services/celebrations.ts`
  - `apps/api/src/routes/celebrations.ts`
  - `apps/mobile/src/hooks/use-celebration.tsx`
  - `apps/mobile/src/hooks/use-celebrations.ts`
  - `apps/mobile/src/app/(learner)/more.tsx`
- Assessment: Positive gap. Celebration behavior is already a concrete product capability.

## Recommended doc follow-up

- Update `epics.md` and any PRD/source-of-truth docs to reflect the features that are already live:
  - parking lot learner UI
  - Learning Book subject lifecycle controls
  - learner-facing `Why this order?`
  - current learner session agency controls
  - voice mode
  - homework flow maturity
  - advanced verification
  - consent robustness
  - session lifecycle polish
  - celebrations
- Keep the remaining implementation work focused on:
  - home-surface backend parity (`precomputeHomeCards`, `/home-cards`, tap/dismiss telemetry)
  - final Story 14.5-14.8 parity items
  - OpenAI OAuth product decision and, only if still desired, implementation

## Open question before prioritizing more auth work

- FR1 still mentions OpenAI OAuth, but the compliance/App Store direction in `epics.md` remains murky. That should be resolved at the product level before treating it as a must-build gap.

---

# Epic 7 + Epic 8 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 7 expectations from `docs/epics.md` against the current curriculum schema, curriculum services, coaching-card logic, and learner mobile surface in `apps/*` and `packages/*`.
- Reviewed Epic 8 expectations from `docs/epics.md` against the current session schema/contracts plus the voice-mode mobile implementation in `apps/mobile/src`.
- This pass was code-inspection based. I did not rerun the full test suite.

## Findings

### 1. High: Epic 7 prerequisite graph storage and API contracts are still missing

- Epic/story: Epic 7 Stories 7.1, 7.3, 7.4, and 7.6.
- Evidence:
  - Story 7.1 requires a `topic_prerequisites` table, ACTIVE/SKIPPED edge status, DAG validation, and prerequisite-aware persistence: `docs/epics.md:3000-3009`.
  - `packages/database/src/schema/subjects.ts:73-116` only defines flat `curriculum_topics` and `curriculum_adaptations`; there is no prerequisite edge table, no prerequisite status enum, and no `prerequisiteContext` JSONB field.
  - `packages/schemas/src/subjects.ts:66-153` exposes only flat topic payloads plus topic-level skip/unskip request schemas.
- Impact:
  - FR118, FR120, FR122, FR124, FR151, and FR152 have no persistence layer or wire contract, which blocks the rest of Epic 7 from working end-to-end.

### 2. High: Curriculum sequencing is still pure `sortOrder`, not prerequisite-aware

- Epic/story: Epic 7 Story 7.2.
- Evidence:
  - Story 7.2 requires default ordering via topological sort with incomplete prerequisites deprioritized, not hidden: `docs/epics.md:3020-3023`.
  - `apps/api/src/services/curriculum.ts:157-160` returns topics ordered only by `asc(curriculumTopics.sortOrder)`.
  - `apps/api/src/services/progress.ts:466-473` picks the continue suggestion from the first unskipped topic in that same flat order.
  - Adding a new topic still just appends by `sortOrder + 1` with no edge generation or graph rebalancing: `apps/api/src/services/curriculum.ts:204-221`.
- Impact:
  - FR119 and FR126 are still behaving like a linear curriculum. The product cannot recommend or explain prerequisite-aware next steps.

### 3. High: Skip/restore still operates on whole topics instead of soft-skipped prerequisite edges

- Epic/story: Epic 7 Story 7.3.
- Evidence:
  - Story 7.3 requires edge-level SKIPPED state plus `curriculumAdaptations.prerequisiteContext`: `docs/epics.md:3041-3044`.
  - `apps/api/src/services/curriculum.ts:248-295` marks `curriculumTopics.skipped = true` and inserts a generic adaptation row with `skipReason: 'User skipped'`.
  - `apps/api/src/services/curriculum.ts:301-349` reverses the same topic-level flag with `skipReason: 'User restored'`.
  - The only prerequisite-aware teaching hint I found is a generic prompt instruction in `apps/api/src/services/exchanges.ts:284`; there is no stored prerequisite context being injected into exchanges.
- Impact:
  - Skipping a prerequisite currently removes the whole topic from normal flow instead of preserving a reversible faded edge, and the LLM has no persisted graph context to bridge from.

### 4. High: Graph-aware coaching, unlock celebrations, and prerequisite-specific card types are not implemented

- Epic/story: Epic 7 Story 7.5.
- Evidence:
  - Story 7.5 requires `topic_unlocked` celebrations and at-risk prerequisite quiz prompts: `docs/epics.md:3083-3085`.
  - The coaching-card service still only emits `review_due`, `streak`, `curriculum_complete`, `insight`, and `challenge`: `apps/api/src/services/coaching-cards.ts:81-170`.
  - The public coaching-card schema still only supports those same five legacy types: `packages/schemas/src/progress.ts:164-233`.
  - `packages/schemas/src/progress.ts:14-27` does not define a `topic_unlocked` celebration reason.
  - Repo searches for `topic_unlocked`, `Quick check on`, and `Not Now` found no implementation hits in the live app code.
- Impact:
  - Story 7.5 is still on the legacy Epic 4 coaching-card model; there is no prerequisite-ready or prerequisite-decay behavior in the current code path.

### 5. Medium: Concept-map UI, per-edge feedback, and prove-it override flows are absent

- Epic/story: Epic 7 Stories 7.4 and 7.6.
- Evidence:
  - The stories require a concept-map screen, age-based graph/journey rendering, `Not needed` edge feedback, and `I already know this` / `Prove it` flows: `docs/epics.md:3057-3064` and `docs/epics.md:3099-3114`.
  - `rg --files apps/mobile/src packages apps/api/src | rg "concept|graph|journey|prereq|prerequisite"` returned no concept-map or prerequisite feature files beyond the existing voice hooks.
  - Repo searches for `Start Anyway`, `Review Prerequisite`, `Not needed`, and `prove it` found no implementation hits in `apps/mobile/src`, `apps/api/src`, or `packages/*`.
- Impact:
  - FR121, FR127, FR151, and FR152 are still doc-only. There is no learner-facing graph, no parent/child prerequisite feedback path, and no self-service prerequisite override.

### 6. High: Voice input is effectively nonfunctional because STT results never update the hook transcript

- Epic/story: Epic 8 Stories 8.1-8.3.
- Evidence:
  - `apps/mobile/src/hooks/use-speech-recognition.ts:54-147` creates `transcript` state but never calls `setTranscript()` with recognition results.
  - The same hook says event listeners are handled via `useSpeechRecognitionEvent`, but the only repo hit for that symbol is the comment itself: `apps/mobile/src/hooks/use-speech-recognition.ts:97-99`.
  - `apps/mobile/src/components/session/ChatShell.tsx:121-127` and `apps/mobile/src/components/session/ChatShell.tsx:192-206` depend on that `transcript` value to populate the pending voice draft and send it.
- Impact:
  - The mic button can start and stop recognition, but as written no recognized text ever reaches the UI state that gets sent to the model.

### 7. High: Epic 8 never persists `input_mode` on the session model or the start-session contract

- Epic/story: Epic 8 Story 8.1.
- Evidence:
  - Story 8.1 requires a text/voice choice at session start and an `input_mode` field on the session record: `docs/epics.md:3154-3160`.
  - `packages/database/src/schema/sessions.ts:114-152` has `sessionType`, `verificationType`, and `metadata`, but no `input_mode`.
  - `packages/schemas/src/sessions.ts:131-187` exposes no `inputMode` field in either `sessionStartSchema` or `learningSessionSchema`.
  - `apps/mobile/src/hooks/use-sessions.ts:76-107` and `apps/mobile/src/app/(learner)/session/index.tsx:578-628` only post `subjectId`, `topicId`, `sessionType`, and optional homework metadata.
- Impact:
  - Voice mode is currently local UI state only. The backend cannot store, resume, analyze, or distinguish voice-first sessions.

### 8. Medium: The main learner flow does not implement the required session-start voice choice, and it also drops the TEACH_BACK default

- Epic/story: Epic 8 Story 8.1.
- Evidence:
  - Story 8.1 requires a session-start toggle with text as default and voice as an explicit mode choice: `docs/epics.md:3149-3160`.
  - `apps/mobile/src/app/(learner)/session/index.tsx:571-628` auto-starts only `learning` or `homework` sessions and offers no input-mode selector.
  - `apps/mobile/src/hooks/use-sessions.ts:76-95` also narrows the mobile start-session contract to `'learning' | 'homework'`, so the Epic 8 promise that voice is orthogonal to all session types is not fully represented in the client.
  - `apps/mobile/src/components/session/ChatShell.tsx:45-49` and `apps/mobile/src/components/session/ChatShell.tsx:115-118` only default voice ON when `verificationType === 'teach_back'`, but the main learner screen renders `ChatShell` without a `verificationType` prop: `apps/mobile/src/app/(learner)/session/index.tsx:1502-1524`.
- Impact:
  - Epic 8.1 is only partially present as a header toggle inside the chat screen. Even the earlier TEACH_BACK voice-default behavior is bypassed in the main learner session flow.

### 9. Medium: Accessibility spike + implementation work for VoiceOver/TalkBack is still open

- Epic/story: Epic 8 Stories 8.4 and 8.5.
- Evidence:
  - The stories require a documented spike, screen-reader detection, a selected coexistence strategy, haptics, and physical-device validation: `docs/epics.md:3206-3245`.
  - `docs/architecture.md:1147` still describes FR149 as an unresolved spike question rather than a completed decision.
  - Searching `apps/mobile/src`, `apps/api/src`, and `packages/*` for `AccessibilityInfo`, `isScreenReaderEnabled`, `VoiceOver`, `TalkBack`, `screen reader`, and `ducking` produced no implementation hits aside from an unrelated offline-banner test.
- Impact:
  - Voice mode still has no screen-reader coexistence strategy in code, so Epic 8.4 and 8.5 remain unimplemented and accessibility risk stays open.

### 10. Low: Voice playback controls are only partially implemented

- Epic/story: Epic 8 Stories 8.2 and 8.3.
- Evidence:
  - `apps/mobile/src/hooks/use-text-to-speech.ts:23-77` correctly implements Option A TTS, replay, and session-scoped speed.
  - `apps/mobile/src/components/session/VoicePlaybackBar.tsx:10-83` renders replay, stop, and 0.75x/1x/1.25x controls.
  - `apps/mobile/src/components/session/ChatShell.tsx:176-189` and `apps/mobile/src/components/session/ChatShell.tsx:228-246` stop TTS when the learner records or turns voice off.
  - There is still no pause/resume control, no recording haptics, and no accessibility-specific fallback path.
- Impact:
  - Story 8.2 is materially present, but Story 8.3 and the accessibility stories are only partially implemented.

## No new findings called out in these areas

- Epic 8's Option A TTS behavior is present: `use-text-to-speech.ts` waits for completed responses, and `ChatShell` only speaks non-streaming AI messages.
- I did not flag missing VAD as a defect because Story 8.6 is explicitly stretch and the current manual tap-to-stop approach matches the documented default.

---

# Epic 5 + Epic 6 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 5 expectations from `docs/epics.md` against the current billing, metering, webhook, and subscription-screen implementation in `apps/api`, `apps/mobile`, and `packages/*`.
- Reviewed Epic 6 placeholder stories plus the extension notes in `docs/architecture.md`, then searched `apps/*` and `packages/*` for language-learning implementation markers such as `pedagogy_mode`, `Four Strands`, `CEFR`, `FSI`, and `fluency drill`.
- Tried to run a targeted Jest slice for billing/webhook/trial-expiry files, but the run timed out while starting plugin workers (`Failed to start plugin worker`), so the findings below are based on code inspection plus the existing tests already in the repo.

## Findings

### 1. High: expired Stripe subscriptions are never downgraded to free-tier limits

- Epic/story: Epic 5, Stories 5.1 and 5.4.
- Evidence:
  - Story 5.4 requires access until the current billing period ends and then a downgrade to Free: `docs/epics.md:2827-2828`.
  - The Stripe delete path only writes `status: 'expired'` and `cancelledAt`; it does not change `tier` or the quota pool: `apps/api/src/routes/stripe-webhook.ts:187-206`.
  - The only quota-pool adjustment in the Stripe webhook route happens on active subscription updates when tier metadata is present: `apps/api/src/routes/stripe-webhook.ts:176-183`.
  - Metering reads `monthlyLimit` / `dailyLimit` and decrements quota without checking subscription status: `apps/api/src/middleware/metering.ts:146-195`.
- Impact:
  - A Stripe-backed subscription can reach `expired` state while still retaining its previous paid quota ceiling.
  - Because metering ignores `status`, this becomes an entitlement leak on the preserved web-billing path.

### 2. High: family add/remove endpoints can re-parent arbitrary profiles across accounts

- Epic/story: Epic 5, Story 5.5.
- Evidence:
  - The request schemas accept only raw UUIDs (`profileId`, `newAccountId`) and no invite/ownership proof: `packages/schemas/src/billing.ts:76-86`.
  - The routes pass those identifiers straight into the service layer: `apps/api/src/routes/billing.ts:492-506` and `apps/api/src/routes/billing.ts:527-542`.
  - `addProfileToSubscription()` updates any row matching `profiles.id = profileId` to `accountId: sub.accountId` without verifying the source account or any invitation flow: `apps/api/src/services/billing.ts:1251-1284`.
  - `removeProfileFromSubscription()` trusts a caller-supplied `newAccountId` and rewrites the profile to that account after only checking that the profile is currently in the family: `apps/api/src/services/billing.ts:1296-1338`.
- Impact:
  - The backend currently models family membership as direct account reassignment, not a controlled join/leave workflow.
  - If a caller can obtain UUIDs, they can move profiles across account boundaries without defense-in-depth ownership checks or an audit trail.

### 3. High: the shipped free-tier limits still use 100/month, not the 50/month cap Epic 5 specifies

- Epic/story: Epic 5, Stories 5.2 and 5.3.
- Evidence:
  - The reverse-trial spec says Day 29+ becomes Free tier at `50/month`, and upgrade prompts should trigger at the Free `50/month` cap: `docs/epics.md:2781` and `docs/epics.md:2802`.
  - The core tier config still defines Free as `monthlyQuota: 100`: `apps/api/src/services/subscription.ts:25-33`.
  - Free defaults in the billing API also return `monthlyLimit: 100` / `remainingQuestions: 100`: `apps/api/src/routes/billing.ts:87-89` and `apps/api/src/routes/billing.ts:331-333`.
  - The learner subscription screen hard-codes `free: '100 questions/month'`: `apps/mobile/src/app/(learner)/subscription.tsx:57`.
  - `getUpgradePrompt()` is documented as the Free `50/month` trigger, but the actual condition is `usedThisMonth >= monthlyLimit`, so it inherits the incorrect `100` threshold from config: `apps/api/src/services/billing.ts:1127` and `apps/api/src/services/billing.ts:1149-1153`.
- Impact:
  - The Day 29+ reverse-trial landing is materially looser than the product contract.
  - Free-to-Plus upgrade prompting is delayed until 100 questions instead of the specified 50, which changes the monetization behavior of the epic.

### 4. Medium: trial warning and soft-landing push notifications are sent to `accountId`, not `profileId`

- Epic/story: Epic 5, Story 5.2.
- Evidence:
  - Story 5.2 requires trial expiry warnings: `docs/epics.md:2777`.
  - The trial-expiry job sends `profileId: trial.accountId` for both pre-expiry warnings and soft-landing messages: `apps/api/src/inngest/functions/trial-expiry.ts:104-117` and `apps/api/src/inngest/functions/trial-expiry.ts:146-159`.
  - `sendPushNotification()` expects an actual profile id and immediately looks up the push token by `payload.profileId`: `apps/api/src/services/notifications.ts:80-85`.
  - `getPushToken()` is keyed by `notificationPreferences.profileId`, not account id: `apps/api/src/services/settings.ts:366-372`.
  - The existing tests encode the same mismatch by asserting `profileId: 'acc-3'` and `profileId: 'acc-4'`: `apps/api/src/inngest/functions/trial-expiry.test.ts:194` and `apps/api/src/inngest/functions/trial-expiry.test.ts:231`.
- Impact:
  - Trial reminders and soft-landing notices will miss the intended device token in normal data shapes.
  - The warning flow looks implemented in code and tests, but it is keyed to the wrong entity at runtime.

### 5. Medium: the BYOK waitlist exists server-side but is completely hidden in the mobile subscription UI

- Epic/story: Epic 5, Story 5.4.
- Evidence:
  - Story 5.4 explicitly requires a BYOK waitlist entry point: `docs/epics.md:2818` and `docs/epics.md:2829`.
  - The API route exists: `apps/api/src/routes/billing.ts:563-570`.
  - The mobile mutation hook exists: `apps/mobile/src/hooks/use-subscription.ts:222-234`.
  - The learner subscription screen comments out the hook import, state, submit handler, and the entire form block: `apps/mobile/src/app/(learner)/subscription.tsx:33`, `apps/mobile/src/app/(learner)/subscription.tsx:470-490`, `apps/mobile/src/app/(learner)/subscription.tsx:667-675`, and `apps/mobile/src/app/(learner)/subscription.tsx:1026-1057`.
- Impact:
  - There is no user-facing path to join the waitlist from the app.
  - FR114 is only partially implemented at the API layer.

## No new findings called out in these areas

- Epic 5 RevenueCat purchase/restore hooks, top-up credit grants, KV-backed quota reads, and the child-trial paywall all look materially wired up.
- Epic 6 still appears intentionally deferred rather than half-shipped. `docs/epics.md:2900-2963` and `docs/architecture.md:47` / `docs/architecture.md:1138` describe it as v1.1-only, and a repo search across `apps/*` and `packages/*` for `pedagogy_mode`, `Four Strands`, `CEFR`, `FSI`, `comprehensible input`, and `fluency drill` returned no implementation hits outside docs.

---

# Epic 9 + Epic 10 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 9 expectations from `docs/epics.md` against the current RevenueCat webhook flow, mobile subscription screen, and related billing hooks in `apps/api` and `apps/mobile`.
- Reviewed Epic 10 partial / must-ship stories against the shipped consent, session-summary, session-classification, and Expo config code paths.
- This pass is based on code inspection. I did not rerun Jest after the earlier targeted test attempt failed during plugin-worker startup.

## Findings

### 1. High: RevenueCat cancellation loses the cancel-at-period-end state the mobile UI depends on

- Epic/story: Epic 9, Story 9.5.
- Evidence:
  - Story 9.5 requires cancellation to remain effective only at the end of the billing period, with status shown in-app from the subscription state: `docs/epics.md:3418-3420`.
  - The RevenueCat cancellation handler immediately writes `status: 'cancelled'` plus `cancelledAt`, rather than keeping an `active` row with a scheduled end-of-period cancellation: `apps/api/src/routes/revenuecat-webhook.ts:270-286`.
  - The billing API only exposes `cancelAtPeriodEnd` when `subscription.cancelledAt !== null && subscription.status === 'active'`: `apps/api/src/routes/billing.ts:107-117`.
  - The learner subscription screen uses `cancelAtPeriodEnd` to render the `Cancelling` badge, the `Access until ...` copy, and the cancellation notice; otherwise it falls back to `hasActiveSubscription ? 'Active' : status` and `Renews ...`: `apps/mobile/src/app/(learner)/subscription.tsx:516-517` and `apps/mobile/src/app/(learner)/subscription.tsx:796-826`.
- Impact:
  - A store-side cancellation that should read as "cancelling at period end" is not surfaced that way through the API.
  - While RevenueCat still reports an active entitlement, the app can show `Active` plus `Renews ...` even though the subscription has already been cancelled.

### 2. Medium: successful mobile purchases do not refresh the API-backed subscription and usage state

- Epic/story: Epic 9, Story 9.3.
- Evidence:
  - Story 9.3 requires the purchase result to update local state immediately: `docs/epics.md:3357-3366`.
  - The subscription screen derives the displayed plan and quota from API hooks (`useSubscription()` / `useUsage()`) and reads RevenueCat entitlement state separately via `useCustomerInfo()`: `apps/mobile/src/app/(learner)/subscription.tsx:475-489` and `apps/mobile/src/app/(learner)/subscription.tsx:507-517`.
  - `handlePurchase()` only awaits the purchase mutation and shows a success alert; it does not refetch API-side subscription or usage data: `apps/mobile/src/app/(learner)/subscription.tsx:523-527`.
  - `usePurchase()` invalidates only the RevenueCat `customerInfo` query: `apps/mobile/src/hooks/use-revenuecat.ts:150-174`.
  - The top-up flow explicitly polls and invalidates usage until webhook confirmation arrives, which highlights that the subscription purchase path has no equivalent sync step: `apps/mobile/src/app/(learner)/subscription.tsx:622-658`.
- Impact:
  - After a successful store purchase, the screen can keep showing stale tier/quota data until a manual refresh, remount, or later background refetch.
  - RevenueCat entitlement state and API subscription state can temporarily disagree on the same screen.

### 3. Medium: the family-plan purchase UI does not show the real family pool state and its static copy overstates capacity

- Epic/story: Epic 9, Story 9.3.
- Evidence:
  - Story 9.3 requires the family plan UI to show profile count and shared-pool information: `docs/epics.md:3365`.
  - The backend exposes a dedicated family endpoint that returns pool status plus members: `apps/api/src/routes/billing.ts:465-485`.
  - The mobile subscription screen only loads generic subscription, usage, offerings, and customer-info hooks; there is no family-members / pool query in the screen, and the mobile billing hook file exposes no family query alongside those subscription hooks: `apps/mobile/src/app/(learner)/subscription.tsx:475-517` and `apps/mobile/src/hooks/use-subscription.ts:51-125`.
  - The displayed family feature list is fully static and currently says `Up to 5 child profiles`, while the backend family tier config enforces `maxProfiles: 4`: `apps/mobile/src/app/(learner)/subscription.tsx:87-93` and `apps/api/src/services/subscription.ts:46-54`.
- Impact:
  - The Story 9.3 requirement to preserve the family-plan details UX is not met on mobile.
  - The static copy also overpromises family capacity relative to backend enforcement.

### 4. High: consent email delivery status is returned by the API but dropped before the mobile flow can act on it

- Epic/story: Epic 10, Story 10.17.
- Evidence:
  - Story 10.17 requires the API to return delivery status and the mobile flow to branch on `sent` vs `failed`: `docs/epics.md:4313-4335`.
  - The consent service already computes `emailDelivered`, and the route already returns `emailStatus: 'sent' | 'failed'`: `apps/api/src/services/consent.ts:166-245` and `apps/api/src/routes/consent.ts:99-105`.
  - The shared `ConsentRequestResult` schema still only models `{ message, consentType }`: `packages/schemas/src/consent.ts:29-35`.
  - The mobile request hook casts the server response to that reduced schema type: `apps/mobile/src/hooks/use-consent.ts:8-30`.
  - The consent screen ignores the mutation result, always flips to `success`, and the success view hard-codes `We sent a consent link to ...`: `apps/mobile/src/app/consent.tsx:62-76` and `apps/mobile/src/app/consent.tsx:188-215`.
- Impact:
  - Email delivery failures are now detectable at the API boundary but still invisible in the app.
  - The flow continues to show a false-success screen even when the backend explicitly knows delivery failed.

### 5. High: `privacyPolicyUrl` is still missing from the Expo app config

- Epic/story: Epic 10, Story 10.14.
- Evidence:
  - Story 10.14 marks the missing `privacyPolicyUrl` as the remaining launch-blocking config gap: `docs/epics.md:4200` and `docs/epics.md:4234`.
  - `apps/mobile/app.json` contains the Expo app metadata, privacy manifests, and plugins, but there is still no `privacyPolicyUrl` field anywhere in the config: `apps/mobile/app.json:1-112`.
- Impact:
  - The App Store submission/compliance requirement remains open in code, not just in documentation.
  - Epic 10.14 is still materially partial even though the Sentry gating work appears to be present.

### 6. Medium: the rating-prompt hook exists but is never integrated into the session-summary flow

- Epic/story: Epic 10, Story 10.18.
- Evidence:
  - Story 10.18 requires `session-summary/[sessionId].tsx` to call `useRatingPrompt()` / `onSuccessfulRecall()` before navigating home: `docs/epics.md:4351-4375`.
  - The hook exists and encapsulates the recall-count, account-age, cooldown, and `StoreReview.requestReview()` logic: `apps/mobile/src/hooks/use-rating-prompt.ts:31-104`.
  - A repo search only finds `useRatingPrompt` / `onSuccessfulRecall` inside the hook and its tests, not in the session-summary screen or other runtime callers: `rg -n "useRatingPrompt|onSuccessfulRecall" apps/mobile/src`.
  - The session-summary screen handles submit/continue navigation directly with no rating-hook import or call: `apps/mobile/src/app/session-summary/[sessionId].tsx:124-209`.
- Impact:
  - The review prompt never fires in production despite the trigger logic being implemented.
  - Story 10.18 remains dead code rather than a shipped user-facing behavior.

### 7. Medium: ambiguous first-message subject classification still falls straight through to freeform

- Epic/story: Epic 10, Story 10.22.
- Evidence:
  - Story 10.22 requires ambiguous classifications to trigger a natural confirmation / picker, with freeform fallback reserved for no-match cases: `docs/epics.md:4575-4601`.
  - The session screen calls subject classification on the first message, but any result other than a single high-confidence match just toggles chip state and proceeds without a subject; the code comment is explicit: `Ambiguous / no match → proceed without subject (freeform)`: `apps/mobile/src/app/(learner)/session/index.tsx:671-692`.
- Impact:
  - Multiple-candidate cases skip the required confirmation step entirely.
  - Ambiguous conversations are handled the same as true no-match fallback, so sessions are less likely to attach to the correct subject.

## No new findings called out in these areas

- Epic 9 RevenueCat SDK usage, restore-purchases flow, manage-billing deep links, and top-up polling after store purchase all look materially wired up.
- Epic 10 consent unification and age-gated Sentry appear materially implemented; the remaining gaps I found are around delivery-status plumbing, App Store config, and unfinished client integrations.

---

# Epic 11 + Epic 12 Code Review Findings

Date: 2026-04-02

## Scope

- Reviewed Epic 11 expectations from `docs/epics.md` against the active mobile theme shell, design tokens, and settings surfaces in `apps/mobile/src`.
- Reviewed Epic 12 expectations from `docs/epics.md` against routing, profile schema/DB shape, consent flow, home-card services, and related mobile/API integration points across `apps/*`, `packages/*`, and the current Drizzle schema.
- This pass was code-inspection based. I did not rerun the full test suite.

## Findings

### 1. High: Epic 11's fixed-brand theme is not actually complete because persona defaults and accent presets still drive the app shell

- Epic/story: Epic 11 Stories 11.1-11.3, plus Epic 12 Story 12.3.
- Evidence:
  - `apps/mobile/src/app/_layout.tsx:84-126` still maps `teen`/`learner`/`parent` to designed color schemes and derives theme from `activeProfile.personaType`.
  - `apps/mobile/src/lib/theme.ts:6-14` and `apps/mobile/src/lib/theme.ts:43-81` still expose `persona` in `ThemeContext` and resolve colors from `tokens[persona][colorScheme]`.
  - `apps/mobile/src/lib/design-tokens.ts:48-229` still ships three persona token matrices, and `apps/mobile/src/lib/design-tokens.ts:248-540` still ships multiple accent presets including violet/purple variants.
  - `apps/mobile/src/app/(parent)/more.tsx:82-189` still exposes persona switching plus `AccentPicker`.
  - `apps/mobile/src/components/common/AccentPicker.tsx:13-40` still presents user-selectable accent swatches.
- Impact:
  - The code does not match Epic 11's documented "fixed teal + lavender, no accent picker, no persona-based defaults" end state.
  - Epic 12.3 also cannot be treated as complete while theme state still depends on persona.

### 2. High: Epic 12 route merge and persona-free navigation are still not implemented

- Epic/story: Epic 12 Stories 12.2 and 12.5.
- Evidence:
  - `apps/mobile/src/app/_layout.tsx:222-225` still mounts separate `(learner)` and `(parent)` route groups.
  - `apps/mobile/src/app/(learner)/_layout.tsx:582-635` still redirects parent-persona users away from the learner shell.
  - `apps/mobile/src/app/(parent)/_layout.tsx:115-132` still redirects non-parent personas away from the parent shell.
  - `apps/mobile/src/app/(auth)/_layout.tsx:10-12`, `apps/mobile/src/app/index.tsx:20-24`, and `apps/mobile/src/app/(auth)/sign-in.tsx:173-176` still hardcode `/(learner)/home` as the authenticated landing route.
  - `apps/api/src/routes/consent-web.ts:279-283` still deep-links approved parents to `mentomate://parent/dashboard`.
- Impact:
  - A parent still cannot access learning and family flows from one stable `(app)` shell.
  - The route split is still a product constraint, not just cleanup debt.

### 3. High: `personaType` and `birthDate` are still first-class schema and persistence fields, so Stories 12.4 and 12.6 are materially incomplete

- Epic/story: Epic 12 Stories 12.4-12.6.
- Evidence:
  - `packages/database/src/schema/profiles.ts:14-18` and `packages/database/src/schema/profiles.ts:60-62` still define the `persona_type` enum/column and `birth_date`; there is no `birth_year` / `birth_year_set_by`.
  - `packages/schemas/src/profiles.ts:4-24` and `packages/schemas/src/profiles.ts:70-83` still expose `personaType` and `birthDate` in create/read contracts.
  - `apps/api/src/services/profile.ts:32-47` and `apps/api/src/services/profile.ts:134-165` still map and persist `personaType` plus `birthDate`, deriving only a compatibility `birthYear`.
  - `apps/mobile/src/app/create-profile.tsx:59-72`, `apps/mobile/src/app/create-profile.tsx:90-111`, and `apps/mobile/src/app/create-profile.tsx:133-138` still auto-detect and submit `personaType` plus `birthDate`.
  - `packages/factory/src/profiles.ts:9-14` and `apps/api/src/services/test-seed.ts:304-331` still seed persona-based profiles and derived birth dates.
  - A targeted repo sweep still finds `33` non-test `personaType` hits and `59` non-test `birthDate` hits under `apps/` + `packages/`, which is far from Story 12.6's zero-hit exit criteria.
- Impact:
  - The repo is still in compatibility mode. Dropping the legacy columns now would break profile creation, exports, test infra, and multiple mobile/account flows.

### 4. High: client-side consent gating disagrees with the server's birth-year rule, which can strand 16-year-olds in a pending-consent profile without collecting a parent email

- Epic/story: Epic 12 Story 12.6 / FR206.7.
- Evidence:
  - `apps/mobile/src/hooks/use-consent.ts:71-85` and `apps/mobile/src/hooks/use-consent.ts:236-244` mark consent required only when the exact `birthDate` age is `< 16`.
  - `apps/api/src/services/consent.ts:111-126` requires consent for `age <= 16` using the conservative `birthYear` rule.
  - `apps/mobile/src/app/create-profile.tsx:98-101` and `apps/mobile/src/app/create-profile.tsx:146-153` use only the client-side result to decide whether to route into `/consent`.
- Impact:
  - A learner who is 16 this calendar year can be created server-side with `PENDING` consent, but the client can skip the consent handoff UI and return them to the app shell.
  - That is a broken onboarding path, not just schema debt.

### 5. Medium: the new home-card surface exists, but Story 12.7 is still learner-only and the analytics/backing-store migration is incomplete

- Epic/story: Epic 12 Story 12.7 and FR206.4.
- Evidence:
  - `apps/api/src/routes/home-cards.ts:22-63` and `apps/mobile/src/hooks/use-home-cards.ts:17-61` show that `/home-cards` and interaction posting are live, so the earlier "no route" conclusion is now stale.
  - But `apps/api/src/services/home-cards.ts:52-67` and `apps/api/src/services/home-cards.ts:107-188` only rank `restore_subjects`, `study`, `homework`, `review`, and `ask`; the service never queries `familyLinks` and never emits the spec-required `family` or `link_child` cards.
  - `packages/schemas/src/progress.ts:239-280` already reserves `family` and `link_child` IDs, which makes the omission explicit rather than postponed by schema.
  - `apps/api/src/services/home-surface-cache.ts:100-103` and `apps/api/src/services/home-surface-cache.ts:222-257` still store ranked cards and interactions inside the legacy `coaching_card_cache` JSON wrapper.
  - `apps/api/src/index.ts:181-183` still mounts both `/coaching-card` and `/home-cards`.
  - A targeted source search found no non-test `home_card_tap` hits in `apps/` or `packages/`, so the Story 12.6 / 12.7 `sessionEvents` analytics contract is still not wired.
- Impact:
  - The multi-card learner UX is real, but the Epic 12 architecture is still only partially migrated.
  - Parent-intent cards are absent, telemetry is not on the target event pipeline, and the legacy single-card system still remains live.

## No new findings called out in these areas

- Epic 12.1's age-based voice refactor appears materially present in `apps/api/src/services/exchanges.ts`.
- The earlier gap-analysis claim that `/v1/home-cards` was missing is now stale; the more accurate remaining gap is that the current implementation is still learner-only and still piggybacks on legacy home-surface storage.
