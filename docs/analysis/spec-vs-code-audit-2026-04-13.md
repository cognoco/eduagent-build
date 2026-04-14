# Spec vs Code Audit — 2026-04-13

Systematic audit of all 23 design specs in `docs/specs/` against the current codebase. Each capability area documents what is implemented, what gaps remain, and a balanced case for/against closing each gap.

**Method:** 7 parallel code-review agents read each spec, verified key files/routes/screens against the codebase, and reported findings.

---

## Fully Implemented Specs (no gaps)

These specs are fully reflected in the codebase. No action needed.

| Spec | Title |
|------|-------|
| EAS Update OTA | OTA integration (except `fingerprint` vs `appVersion` policy — see minor gap below) |
| Async Consent Handoff (ACCOUNT-20) | Child enters parent email directly, no phone handoff |
| Child Paywall Recovery (BILLING-06) | Progress button, home button, warmer copy, XP stats |
| Homework Gallery Import (HOMEWORK-02) | Gallery picker alongside camera for homework capture |
| Retention Review Surfacing (LEARN-16) | Review-due badges on home screen and library tabs |

---

## Epic 6: Language Learning

### Language Detection

**Implemented:** Two-layer pipeline: keyword match in `data/languages.ts` + LLM boolean check in `language-detect.ts`. Routes to `language-setup` when `pedagogyMode === 'four_strands'`.

**Gap:** No learner confirmation card — if detection fires, user is routed directly without a "Confirm this is language learning" intercept. No override for "French Revolution ≠ learning French."

**Case for:** Prevents misdetection confusion, gives learner agency over mode selection, makes the pedagogical switch explicit.
**Case against:** LLM guard already handles history/culture disambiguation. Adding a screen adds friction for the majority where detection is correct. `language-setup` banner partially serves as confirmation.

### Four Strands Prompting

**Implemented:** `buildFourStrandsPrompt()` in `language-prompts.ts` produces five prompt sections. `buildSystemPrompt()` forks on `pedagogyMode === 'four_strands'` in `exchanges.ts`.

**Gap:** No real-time structured JSON extraction (`{"newVocabulary": [...], "strand": "input"}`) during sessions. Vocabulary is extracted post-session via a separate LLM call instead. No `strand` or `grammarPoint` tracking.

**Case for:** Real-time extraction enables in-session vocabulary display, comprehensible-input gating with live word counts, and per-strand attribution.
**Case against:** Post-session extraction is simpler, avoids per-exchange latency/cost, and already works. The 95-98% comprehensible-input constraint can be approximated from the pre-loaded `knownVocabulary` list.

### Vocabulary CRUD and SM-2

**Implemented:** Full data model (`vocabulary`, `vocabularyRetentionCards` tables), CRUD service in `vocabulary.ts`, SM-2 via `@eduagent/retention`, REST routes, mobile hooks.

**Gap:** No DELETE endpoint for vocabulary items. Per-item quality scoring during extraction — current implementation applies uniform session quality to all extracted words.

**Case for:** DELETE is basic CRUD learners need for removing incorrect extractions. Per-item quality makes SM-2 scheduling more accurate per word.
**Case against:** Uniform quality is safe and initializes SM-2 correctly. DELETE is low priority until a vocabulary management UI exists. Per-item quality requires complex heuristics.

### CEFR Milestones

**Implemented:** Schema has `cefrLevel`, `cefrSublevel`, `targetWordCount`, `targetChunkCount` on curriculum topics. `generateLanguageCurriculum()` produces A1-C2 milestones. `/cefr-progress` route + mobile hook exist.

**Gap:** No milestone progress bar card on the subject progress screen (the API exists but the UI never calls `useLanguageProgress`). No OrionsBelt celebration for CEFR level completion.

**Case for:** The milestone card is the primary motivational display for language learners — it replaces abstract FSI hour estimates with small, achievable goals. Without it the API exists but is invisible.
**Case against:** Raw vocabulary counts are already visible in the progress screen. The hook and API are ready, so the gap is mainly a UI card (low cost). OrionsBelt requires a level-boundary comparison — small but non-trivial.

### Vocabulary Extraction Pipeline

**Implemented:** `update-vocabulary-retention` Inngest step in `session-completed.ts` calls `extractVocabularyFromTranscript()` for `four_strands` sessions, upserts results with milestone tagging.

**Gap:** Extracted vocabulary items have no `cefrLevel` — all get `null`. The extraction LLM call doesn't know the current milestone's CEFR target.

**Case for:** CEFR level assignment makes the vocabulary-by-level breakdown meaningful and enables precise milestone-completion detection.
**Case against:** CEFR assignment requires the extraction prompt to know the session's target level, which the current prompt context doesn't include. The post-session approach is an acceptable pragmatic substitute.

### Mobile UI (Language-Specific Components)

**Implemented:** Language setup onboarding screen, `MilestoneCard` component, per-subject vocabulary stats in progress screen, hooks for vocabulary and language progress.

**Gap:** `VocabularyList`, `FluencyDrill` components don't exist. Native language selector limited to 6 European languages (not all 13 supported). No CEFR progress card rendered.

**Case for:** `VocabularyList` is the most-referenced learner-facing feature — vocabulary tracking is the primary metric. `FluencyDrill` is a distinct learning mode. Expanding native languages is a low-effort inclusivity fix.
**Case against:** Vocabulary data layer is complete; `VocabularyList` is low-risk UI work. `FluencyDrill` is correctly scoped as a separate story. The native language restriction is minor since the field is used for grammar explanation phrasing only.

### Voice Integration for Languages

**Implemented:** `languageVoiceLocale` computed from `activeSubject.languageCode` covering all 13 languages. STT and TTS locales automatically configured per language in `ChatShell`.

**Gap:** No strand-differentiated voice behavior (Input strand TTS reading passages vs Output strand spoken practice). No pronunciation feedback prompting. No fluency drill timer+voice.

**Case for:** Strand-differentiated voice is what makes Four Strands pedagogy distinctive. Without it, voice in language sessions is indistinguishable from voice in math sessions.
**Case against:** The open voice toggle already enables spoken output. Strand-aware UI requires knowing which strand the session is in — currently managed implicitly by the LLM with no server-side tracking.

### Language-Specific Coaching Cards

**Implemented:** Coaching card service has no language-specific logic — runs uniformly for all subjects.

**Gap:** No coaching cards showing CEFR milestone progress, vocabulary due for review, or suggested strand focus.

**Case for:** The coaching card is what a returning learner sees first. "3 vocabulary words due for review" and strand balance suggestions directly drive engagement.
**Case against:** Requires schema extension to `CoachingCard` + new query paths. Strand balance tracking doesn't exist yet. Generic coaching cards continue to function.

---

## Epic 7: Self-Building Library

### Data Model

**Implemented:** `curriculum_books`, `topic_connections`, `chapter` column, `bookId` on topics, `filedFromEnum`, `book_suggestions`, `topic_suggestions` tables all exist.

**Gap:** Missing `UNIQUE(subjectId, sortOrder)` on books and `UNIQUE(bookId, sortOrder)` on topics. Book status computation only implements `NOT_STARTED` / `IN_PROGRESS` — no `COMPLETED` or `REVIEW_DUE`.

**Case for:** Missing uniqueness constraints are a data integrity issue. `COMPLETED`/`REVIEW_DUE` book status is needed for the "magic library" feel.
**Case against:** Filing-based creation uses `maxOrder + 1` which is safe within transactions. The simpler two-state status may be good enough at current scale.

### LLM Book Generation

**Implemented:** `detectSubjectType()` (BROAD/NARROW), `generateBookTopics()` with chapters and connections, CAS-protected generation, background pre-generation via Inngest.

**Gap:** No 0-1 exchange prior-knowledge prompt ("What do you already know?") with "Just jump in" shortcut before topic generation. Mobile auto-triggers generation without asking.

**Case for:** The question makes learners feel seen and produces better-scoped topics, especially for those with strong background knowledge.
**Case against:** The `priorKnowledge` parameter is already wired in the API. Many learners would tap "Just jump in" anyway. The loading screen already shows book description during generation.

### Enhanced Session Context (FR163)

**Implemented:** `buildBookLearningHistoryContext()` and `buildHomeworkLibraryContext()` inject learning history into system prompts, capped at 4000 chars. `rawInput` flows into `<learner_intent>` XML block.

**Gap:** Freeform/homework sessions with `subjectId = null` (pre-filing) get no homework library context — the tutor can't connect homework to the library for sessions that haven't been filed yet.

**Case for:** The homework-to-library connection is a core value proposition. Freeform sessions are a majority of homework entries.
**Case against:** Sessions without a subject genuinely can't know which library topics are relevant until filing. The pgvector semantic context partially covers this.

### Context-Aware Coaching Cards (FR165)

**Implemented:** `continue_book` and `book_suggestion` card types exist. `urgencyBoostUntil` field on subjects. `review_due` cards enriched with book context.

**Gap:** `homework_connection` card type not implemented (no "You worked on X in homework — want to go deeper?"). `urgencyBoostUntil` column exists but nothing writes to it after sessions (no test/deadline detection).

**Case for:** `homework_connection` fills the most impactful coaching gap. The urgency boost write path is one LLM detection step in `session-completed.ts`.
**Case against:** Without FR164 knowledge signals, text-matching homework to curriculum topics is imprecise. Urgency detection adds latency to the session-completed chain.

### Library Navigation — Shelf Screen

**Implemented:** Dedicated Expo Router screen with book cards, study-next suggestions, settings, single-book auto-skip, all states.

**Gap:** No subject-level progress bar ("12/18 topics"), no "Last session X days ago", no `COMPLETED`/`REVIEW_DUE` visual styling on book cards.

**Case for:** Aggregate progress is the most compelling indicator that a shelf is alive. `COMPLETED` styling distinguishes books worth revisiting.
**Case against:** Progress bar requires an additional query per shelf load. For conversation-first flow where topics are created one session at a time, counts may look sparse.

### Library Navigation — Book Screen

**Implemented:** Full Expo Router route with sessions grouped by chapter, suggestion cards, generation lifecycle, stats row, floating CTA, notes count, auto-start.

**Gap:** No long-press "Move to different book" context menu on session rows. No session minimum threshold filter (3+ exchanges or 60+ seconds).

**Case for:** Long-press "Move" is the primary fix for misfiling, which is inevitable with LLM classification. Session threshold prevents accidental 5-second sessions from cluttering the book.
**Case against:** Long-press requires a backend "move topic" API and careful UI. Session threshold changes observable behavior for existing sessions.

### Topic Notes (Story 7.9)

**Implemented:** `topic_notes` table, CRUD endpoints, `NoteInput`/`NoteDisplay` components, mid-session note trigger via system prompt with JSON annotation, post-session variant, filing-prompt integration.

**Gap:** Notes not rendered inline on the Book screen — only shown as a count in the stats row. No date-separator append logic for multi-session notes.

**Case for:** Inline note display is the primary discovery mechanism — "I can see what I wrote before opening the session." Date separators make multi-session notes readable.
**Case against:** CFLF redesign replaced the topic-checklist Book screen with a session list, which has no natural place for inline per-topic notes. Session summary view is a reasonable substitute.

### Conversation-First Filing Mechanism

**Implemented:** `book_suggestions` and `topic_suggestions` tables, pick-book screen, full filing mechanism (`buildLibraryIndex`, `fileToLibrary`, `resolveFilingResult` with CAS locking), post-session filing prompt, async topic suggestion generation.

**Gap:** No dedicated Inngest function for freeform filing retries (filing happens inline via mutation). No "freeform archive" status when learner declines filing.

**Case for:** Inngest-based retry prevents lost learning history when filing fails. Archive status enables a "Session history" screen showing all learning.
**Case against:** Inline mutation covers the 95% success case. Archive requires a new data model and UI screen not yet in scope.

### Story 7.5 — Visual Topic Map

**Implemented:** Nothing (correctly deferred). `topic_connections` data is stored but never visualized.

**Gap:** Entire FR167: map toggle, chapter clusters, connection lines, age-adaptive styling, accessibility.

**Case for:** The connections are being generated and stored but serve no user-visible purpose. The map is the primary differentiator from "a list of topics."
**Case against:** Spec explicitly defers this. The CFLF redesign changes what the map would show (sessions, not pre-generated topics), requiring design reconciliation first.

### Story 7.6 — Unified Knowledge Tracking

**Implemented:** Nothing (correctly deferred). No `knowledge_signals` table.

**Gap:** Entire FR164: post-session topic matching, knowledge signals, cross-session library progress.

**Case for:** Knowledge signals make `homework_connection` coaching cards accurate and make the library show true cross-session progress.
**Case against:** FR163 (learning history in prompt) provides 90% of the value. Adds latency to the session-completed chain. Spec says fast-follow.

---

## Epic 8: Voice Gap Closure

### Session `inputMode` Persistence
**Fully implemented.** Column, schema, API, mobile wiring all in place.

### Session-Start Voice Choice UI
**Fully implemented.** `SessionInputModeToggle` component, ChatShell wiring, initial-voice-enabled prop.

### Pause/Resume TTS
**Fully implemented.** Hook interface, VoicePlaybackBar button, ChatShell wiring.

### Haptic Feedback
**Fully implemented.** `haptics.ts` utility, all four trigger points in VoiceRecordButton.

### VoiceOver/TalkBack Coexistence

**Implemented:** ChatShell detects screen reader via `AccessibilityInfo` and suppresses auto-TTS when active. TODO documented.

**Gap:** Full coexistence spike not done — no audio ducking, no manual play button for screen reader users, no physical device validation. Current approach silently disables TTS entirely for screen reader users.

**Case for:** Blind/low-vision users lose voice output entirely with the current suppression. A physical device spike is needed to validate the right approach.
**Case against:** Screen reader users are a small subset. Physical device testing is a prerequisite that can't be skipped. Current suppression is safe and non-disruptive.

---

## Adaptive Home Screen

### Home as Thin Intent Router
**Fully implemented.** 159 lines, routes to ParentGateway / LearnerScreen / AddFirstChildScreen.

### Parent Gateway

**Implemented:** Time-aware greeting, two intent cards (check progress, learn something), child activity highlight.

**Gap:** Routes parent to `/learn-new` directly, bypassing the Learner Screen (spec says route to `/learn` first, which shows homework option). Uses weekly activity highlight, not daily.

**Case for:** Routing to `/learn` first gives parents the homework entry point. Daily highlight is more timely.
**Case against:** Direct `/learn-new` reduces taps for the common case. Weekly data is more stable.

### Learner Screen

**Implemented:** Dynamic intent cards with review-due badge, review priority promotion (threshold 5), recovery card, expired-session banner. 293 lines.

**Gap:** Primary card labeled "Start learning" instead of spec's "Learn something new!". No `useContinueSuggestion` subtitle on the primary card.

**Case for:** `useContinueSuggestion` makes the primary card feel personalized. String alignment helps QA.
**Case against:** "Start learning" is cleaner. Review promotion and recovery card are genuine improvements over the spec.

### IntentCard, learn.tsx, learn-new.tsx, greeting.ts
**All fully implemented.** No gaps.

### Session Recovery

**Implemented:** Recovery card shows on both LearnerScreen and learn-new. Expired marker notice with cleanup.

**Gap:** Spec places recovery card only in `learn-new.tsx`, but implementation shows it on LearnerScreen too (duplication).

**Case for:** Removing duplication keeps LearnerScreen focused on intent selection.
**Case against:** Home-tab visibility is the highest-visibility location, minimizing risk that crashed-session users miss the resume option.

---

## Epic 15: Visible Progress

### Progress Snapshots, Milestones, Endpoints, Crons
**All fully implemented:** `progress_snapshots` table, `milestones` table, `monthly_reports` table, daily snapshot cron, weekly push cron, monthly report cron, `/progress/inventory`, `/progress/history`, milestone detection, manual refresh with rate limiting.

**Gap:** FR231.4 one-time historical backfill job not implemented.

**Case for:** Existing users upgrading see empty charts with no history. Backfill gives them a meaningful growth curve on day one.
**Case against:** Backfill is approximate (vocabulary retention not perfectly reconstructable). New users build real history within weeks.

### Journey Screen (FR235)

**Implemented:** Hero stat, growth chart, milestone cards, subject cards, pull-to-refresh.

**Gap:** `progress/vocabulary.tsx` (vocabulary browser) not implemented. `progress/milestones.tsx` (full milestones list) not implemented.

**Case for:** Children who learn 340 words want to see those 340 words. Tappable stat that does nothing is a dead-end.
**Case against:** Vocabulary data is accessible via inventory response CEFR breakdowns. Primarily a mobile UI task with no new API work.

### Parent Dashboard Enhancement (FR238)

**Implemented:** `buildChildProgressSummary()` with latest snapshot, 7-day deltas, engagement trend, guidance string.

**Gap:** Field naming diverges from spec (`'growing'/'steady'/'quiet'` vs `'increasing'/'stable'/'declining'`).

**Case for:** Aligning names now is cheaper than patching callers later.
**Case against:** If `@eduagent/schemas` defines the actual names, there's no live bug — just a spec-vs-code delta.

### Weekly Progress Push (FR239)

**Implemented:** Monday cron, per-parent fan-out, multi-child batching, positive-only copy, `weeklyProgressPush` preference.

**Gap:** No timezone-aware delivery — runs at fixed 09:00 UTC.

**Case for:** Parents in Asia receive notifications at 1 AM local time. Timezone support prevents opt-outs.
**Case against:** At early scale, most users may be in one timezone. Hourly cron logic adds complexity. Can backfill as user base grows.

### Monthly Report (FR240)
**Fully implemented.** Cron, LLM highlights, push notification, parent screens.

---

## Epic 16: Adaptive Memory

### Core Memory Pipeline (FR243-FR252)

**Implemented:** `learning_profiles` table with full schema (learning style, interests, struggles, communication notes, consent fields, granular controls). `analyze-learner-profile` Inngest step gated on consent. `buildMemoryBlock()` with 500-token budget and priority ordering. "What My Mentor Knows" screens for child and parent. "Tell Your Mentor" input. Suppress/unsuppress inference. GDPR export.

**Gap:** No `accommodationMode` column or logic (FR253-FR255 — short-burst, audio-first, predictable modes for ADHD/dyslexia/autism). No structured observability metrics for the memory pipeline. Interest demotion logic (60-day eviction) not confirmed. Two-tier parent struggle notification (medium → high confidence) not confirmed.

**Case for (accommodation modes):** These serve learners with attention difficulties, dyslexia, and autism-spectrum needs — a substantial portion of any classroom. They're designed to work independently of memory consent.
**Case against:** Requires schema migration, prompt changes, mobile settings UI. The core memory pipeline should be proven valuable first. Classified as Phase E (last phase) intentionally.

---

## Epic 17: Voice-First Learning

### Phase A: Voice Preferences

**Implemented:** Epic 8 basic toggle (`SessionInputModeToggle`), `inputMode` persistence per session.

**Gap:** No age-aware voice suggestion for 11-13 year-olds. No VAD mode ("auto-send when I stop talking"). No voice mode persistence across sessions (must re-select every time).

**Case for (voice persistence — FR245):** Highest-leverage change. One AsyncStorage read on session mount. Without it, users who prefer voice have to re-select every session — voice mode attrition through friction.
**Case against:** Age-aware suggestion requires reliable `birthYear`. VAD requires platform-specific audio-level monitoring APIs.

### Phase B: Server-Side Voice

**Gap (all unimplemented):** `POST /v1/voice/transcribe` (server STT), `POST /v1/voice/speak` (server TTS), voice-optimized LLM prompting (50-word-max responses for voice mode), voice persona selection, 1.5x speed step.

**Case for (voice-optimized prompting — FR256):** Lowest-cost highest-impact change. One conditional block in `buildSystemPrompt()`. Without it, the mentor gives paragraph-length responses in voice mode that take 45 seconds of TTS — killing conversational rhythm.
**Case against (server TTS):** On-device TTS is free and offline-capable. Server TTS costs $0.18-0.30 per 1000 chars, introduces latency, and requires audio CDN infrastructure. Should be gated on proven demand.

### Phase C: Pronunciation, Recall, Hands-Free
**All unimplemented.** Depends on Phases A and B. Pronunciation practice (FR258), verbal recall (FR259), hands-free mode (FR260-261).

---

## Smaller Feature Specs

### AUTH-05: MFA Fallback Recovery

**Implemented:** `backup_code` strategy fully integrated in sign-in flow. SSO-aware tiered messaging for unsupported methods.

**Gap:** Backup code entry reuses the generic code-entry UI — no distinct "Enter a backup code" heading or suppressed "Resend" button verification.

**Case for:** Distinct copy reduces confusion for users reaching backup codes after exhausting other methods.
**Case against:** The flow is functional end-to-end. Copy differentiation is polish, not correctness.

### ACCOUNT-22: Consent Pending Gate Enrichment

**Implemented:** Consent gate with preview screens (subject browser, coaching preview), resend/change-email flows, auto-check polling.

**Gap:** No time estimate ("Most parents respond within a few hours"), subject browser limited to 4 hardcoded entries (spec says 8-10), coaching preview is static list not animated chat, no progress ladder, no "How It Works" third preview.

**Case for:** The waiting screen is a high-anxiety moment. Time estimate and progress ladder cost almost nothing and directly address the "dead waiting room" feeling.
**Case against:** Polling, resend, and change-email handle the functional need. These are polish improvements for a transient onboarding gate.

### AUTH-11: Session Expiry Recovery

**Implemented:** `markSessionExpired()` + `consumeSessionExpiredNotice()` in `auth-expiry.ts`. 401 handler calls it before sign-out.

**Gap:** No return-route persistence/restoration (user always lands on Home after re-auth). Expiry notice window is 60s, not spec's 300s. Message copy doesn't match spec.

**Case for:** Return-route restoration is the highest-quality UX win — landing back at Library after re-auth vs always Home. The 60s window means backgrounding for 90s loses the explanation.
**Case against:** Session expiry is rare. Return-route adds complexity that must be maintained as routes evolve. A stale restored route that crashes is worse than landing on Home.

### Account Security: Password Change + SSO Detection

**Implemented:** Password change and SSO detection in settings, owner-gated.

**Gap:** 2FA toggle explicitly removed (broken implementation conflated email verification with TOTP). No TOTP/SMS/backup code management.

**Case for:** True 2FA is meaningful security for accounts holding children's data.
**Case against:** Spec explicitly deferred to 1,000+ users. Sign-in friction harms conversion at current scale.

### HOME-01/HOME-06: Smart Home Intent Cards

**Implemented:** Recovery card with highlight variant, review-due badge + subtitle, dynamic card ordering (review promoted at threshold 5).

**Gap:** `useContinueSuggestion` not wired into "Start learning" card subtitle — no personalized "Continue with {topic} in {subject}" text.

**Case for:** Backend endpoint and hook exist and are tested. Adds personalization at zero backend cost.
**Case against:** Adds a second network request on home mount. Subtitle may be stale for users who switch topics frequently.

### BILLING-07: Quota Exceeded In-Session Actions

**Implemented:** `QuotaExceededError` thrown by SSE layer, message reaches UI as plain text bubble.

**Gap:** No `QuotaExceededCard` component with structured upgrade/top-up/notify-parent CTAs. Chat input stays enabled after quota hit.

**Case for:** Blocked users have no forward path from a plain text message. The error details payload is already available — pure frontend work.
**Case against:** Users can navigate to subscription screen manually. Building child-profile "Ask your parent" variant adds scope. Even after card, user must start a new session.

### SUBJECT-01: Subject Creation Starter Suggestions

**Implemented:** Resolve/suggestion flow with tappable cards, "Something else" input, "Just use my words" escape.

**Gap:** No static suggestion chips below the input (Math, Science, English...). No returning-user section showing existing subjects. No descriptive hint text.

**Case for:** Blank-page paralysis at subject creation is documented. Chips require zero network calls and no new components — lowest-effort UX improvement possible.
**Case against:** Resolve flow handles any typed input gracefully. Adding `useSubjects()` introduces a network dependency on an instant-loading screen.

### BILLING-09: Top-Up Purchase Confidence

**Implemented:** 15-attempt polling loop, success/timeout alerts, "Purchase processing..." label.

**Gap:** No two-stage messaging ("Confirming..." → "Still confirming..."). Timeout copy still uses "processing" framing instead of "Purchase confirmed". Race condition in polling (invalidate → sleep 500ms → read cache can miss). No retry on missing-package error.

**Case for:** Users who paid money and see a 30-second spinner with no reassurance raise support tickets. The `fetchQuery` race fix addresses a genuine correctness bug.
**Case against:** Top-up is low-frequency. 30-second polling window catches most webhook deliveries. UI changes add branching state to an already-complex handler.

### PARENT-06: Parent Monthly Report Empty State

**Implemented:** Reports screen exists with loading/error/non-empty states.

**Gap:** Empty state is a single grey text line — no icon, no "first report" heading, no computed next-report date, no "See progress now" action button, no "You'll get a push notification" subtext. Reports button is hidden when `child.progress` is null (invisible on new accounts).

**Case for:** First-report wait can be 31 days with no indication of when to expect anything. Removing the `child.progress` gate is a one-line fix.
**Case against:** Date computation with timezone edge cases adds subtle test surface. Action button for a child with no progress may set misleading expectations.

### EAS Update OTA — Minor Gap

**Implemented:** Full OTA pipeline in CI, correct EAS config, channel-per-profile, native-change detection.

**Gap:** `runtimeVersion` policy is `appVersion` instead of spec's `fingerprint`. Developers must manually bump version to block mismatched OTA.

**Case for:** `fingerprint` eliminates manual error — the single highest-severity failure mode in the spec's risk table. One-line change.
**Case against:** Changing policy requires a fresh native build for all channels. `appVersion` gives explicit control over compatibility boundaries.
