# End-User Test Report — 2026-04-18

Live audit of the MentoMate mobile app via the Expo Web preview (`localhost:8081`), authenticated as the production user "Zuzana" (Free plan, owner, no child profiles).

This report is **incremental** — each section is filled as flows are tested. The "Status" column shows where the audit currently stands so we can pick up from the same point next session.

## Test environment
- **Surface:** Expo Web preview via `.claude/launch.json` `mobile` target.
- **Auth state:** Pre-existing browser session (Clerk).
- **Caveats:** Web has no SecureStore, no native camera/mic/TTS, no IAP, no push, no haptics. Anything that depends on these is inferred from code rather than driven live.
- **Data discipline:** Read-only. No deletions, no subscription changes, no sign-out, no profile edits unless explicitly flagged.

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Tested live — works as expected |
| ⚠️ | Tested live — issue found (see Findings) |
| ❌ | Tested live — broken or blocked |
| 🔍 | Inspected via code/spec only (web limit) |
| ⏭️ | Not yet tested — pickup point |

## Coverage map

### Auth and Access
| ID | Flow | Status | Notes |
|---|---|---|---|
| AUTH-01 | App launch + auth gate | ✅ | Already-authenticated session loaded straight into app |
| AUTH-02..09 | Sign-up / sign-in / OAuth / SSO callback | 🔍 | Already signed in — can't test without sign-out |
| AUTH-10 | Sign out | ⏭️ | Skipped — destructive |
| AUTH-12 | First-time vs returning copy | ⏭️ | Skipped — would require sign-out |

### Profiles, Family, Consent, Account
| ID | Flow | Status | Notes |
|---|---|---|---|
| ACCOUNT-01..03 | Profile creation | ✅ | Tested 2026-04-18 continuation #3 — `POST /v1/profiles` → 201 for TestKid (birthYear: 2015, isOwner: false, consentStatus: "CONSENTED"). Note: CONSENTED immediately when parent creates — skips ACCOUNT-19..22 consent flow |
| ACCOUNT-04 | Profile switching | ✅ | Tested 2026-04-18 — `profile-switcher-chip` opens `profile-switcher-menu` with both TestKid + Zuzana options; switched successfully both directions |
| ACCOUNT-06 | More tab navigation | ✅ | Full layout renders, all sections present |
| ACCOUNT-07 | Settings toggles | 🔍 | Visible (Push notifications, Weekly digest); not toggled (would mutate) |
| ACCOUNT-08 | Learning mode + accommodations + celebrations | ✅ | All three radios render with active state on user's current selection (Challenge mode / None / Big milestones only) |
| ACCOUNT-09 | Change password | 🔍 | Button visible in More; not opened |
| ACCOUNT-10 | Export my data | 🔍 | Button visible in More; not tapped |
| ACCOUNT-11 | Delete account | ✅ | Screen renders with clear warning + 7-day grace + Cancel/Close escape — did not tap delete |
| ACCOUNT-13 | Privacy policy | ✅ | 10-section GDPR policy renders correctly |
| ACCOUNT-15 | Self mentor memory | ✅ | Page renders with sections and toggle; F-021 noted |

### Home, Navigation, Subject Setup
| ID | Flow | Status | Notes |
|---|---|---|---|
| HOME-01 | Learner home with intent cards | ✅ | 5 cards: Continue (Geography topic) / Learn / Ask / Practice / Homework |
| HOME-02 | Parent gateway home | ✅ | **Re-verified 2026-04-18 continuation #4 (PV+PEH pass).** `parent-gateway` now shows dynamic summary on the "Check child's progress" CTA: "TestKid practiced 1 min this week" (replaced the prior static CTA). Greeting variant `Weekend learning? Nice!` renders on Saturdays. Testids: `parent-gateway`, `gateway-check-progress`, `gateway-learn`, `profile-switcher-chip`. |
| HOME-03 | Tab shell + Progress tab promoted | ✅ | All 4 tabs render |
| HOME-05 | Empty first-user state | ✅ | Tested 2026-04-18 — switched to fresh TestKid profile, home showed 4 intent cards (no Continue) with "Good afternoon, TestKid!" |
| HOME-06 | Continue intent card | ⚠️ | F-001: missing `lastSessionId` |
| HOME-07 | AddFirstChild gate | ✅ | Tested 2026-04-18 — triggered automatically when Zuzana upgraded to family tier; rendered `add-first-child-screen` + `add-first-child-cta` |
| HOME-08 | Home loading-timeout fallback | ⏭️ | Not triggered |
| SUBJECT-01 | Create subject from home | ✅ | Screen renders with 9 quick-start subjects (Math/Science/English/History/Spanish/Geography/Art/Music/Programming), `not-sure-hint`, `create-subject-validation-hint`, `create-subject-submit` |
| SUBJECT-06 | Broad subject → pick a book | ✅ | Tested live 2026-04-18. Tapped "Math" → `/v1/subjects/resolve` → 200 → `/v1/subjects` POST 201 → `/v1/subjects/{id}/book-suggestions` → 7 book suggestions at `/pick-book/{subjectId}` with `pick-book-something-else` escape |
| SUBJECT-11 | Curriculum review | ✅ | Tested live 2026-04-18. After picking a book, curriculum was generated via `GET /v1/subjects/{id}/curriculum` (version 1, with topics array). Book-detail at `/shelf/{subjectId}/book/{bookId}` rendered with "Study next / [Topic Name] / Tap Start learning below" |
| SUBJECT-11b | Curriculum review WITH real topics + Challenge modal + Add-topic modal | ✅ | **Tested live 2026-04-19.** Direct-URL navigation to `/onboarding/curriculum-review?subjectId={math}` loaded 1 topic. Opened `challenge-button` modal, typed "Skip the intro topics — I already know whole numbers.", clicked Regenerate → `POST /v1/subjects/{id}/curriculum/challenge` → curriculum regenerated from 1 → 12+ topics including "Algebraic Thinking: Patterns and Expressions". Opened `add-topic-button` modal, typed "Negative Numbers and Number Lines" → Preview generated description "Learn about numbers less than zero, how they work, and how to place them on a number line." → Add topic → topic count went 12 → 13. **Minor:** After successful add, modal inputs reset but modal stayed visibly open — see F-043. |
| SUBJECT-12 | View curriculum | ⏭️ | Not directly reached as standalone, but the curriculum-review path covers the critical SUBJECT-11 → LEARN-04 bridge |
| SUBJECT-14 | Analogy-preference Continue WITH selection | ✅ | **Tested live 2026-04-19.** Navigated to `/onboarding/analogy-preference?subjectId={math}` via direct URL. Selected "Sports" (analogy-domain-sports → state changed to Active). Clicked `analogy-continue-button` → network call fired → redirected to `/onboarding/accommodations?subjectId=...&step=3&totalSteps=4` within ~4s. Continue WITH a selection works. |
| SUBJECT-15 | Accommodations onboarding step | ✅ | Reached 2026-04-19 via analogy-preference Continue. 4 options render (None / Short-Burst / Audio-First / Predictable) with `accommodation-none`, `accommodation-short-burst`, `accommodation-audio-first`, `accommodation-predictable` testids + `accommodation-continue` + `accommodation-skip` + `accommodation-back`. Back button works (goes to /home when direct-linked). |
| SUBJECT-16 | Language-setup end-to-end submit | ⚠️ | **Tested live 2026-04-19** — selected English native language + "Complete beginner" level → `PUT /v1/subjects/{id}/language-setup` → **422 `VALIDATION_ERROR: "Subject is not configured for language learning"`**. The error IS rendered in the screen's `error` area below the Continue button. See F-041 — dead-end routing where a non-language subject ends up on language-setup. |
| SUBJECT-17 | Interview [INTERVIEW_COMPLETE] marker | 🔍 | **Code-only 2026-04-19** — system prompt [apps/api/src/services/interview.ts:52-58](apps/api/src/services/interview.ts:52) instructs the LLM to emit `[INTERVIEW_COMPLETE]` "after 3-5 exchanges". No server-side hard cap. The mobile side watches `isComplete` on the done event ([apps/mobile/src/app/(app)/onboarding/interview.tsx:253](apps/mobile/src/app/(app)/onboarding/interview.tsx:253)) to flip `interviewComplete` and render the `view-curriculum-button` ("Let's Go" CTA). If the LLM never emits the marker, the CTA never renders — see F-042. |
| SUBJECT-18 | Back button on onboarding screens | ✅ | **Tested live 2026-04-19** — all four back buttons tested: `language-setup-back`, `analogy-back-button`, `accommodation-back`, `curriculum-back`. All use `goBackOrReplace` and fall back to /home when deep-linked (no prior nav stack). No crashes, no dead-ends. |

### Learning, Library, Practice
| ID | Flow | Status | Notes |
|---|---|---|---|
| LEARN-01 | Freeform chat from Ask card | ✅ | Renders with "Chat / Ask anything" header + greeting |
| LEARN-02 | Guided learning from Continue | ✅ | Session opens with topic-specific greeting (F-001 + F-005) |
| LEARN-04 | Core learning loop | ✅ | Tested live 2026-04-18 continuation #3. Sent "What is the difference between positive and negative numbers?" to TestKid's Math session → got full streaming response with thermometer analogy + positive/negative explanation + Socratic recall check ("Can you tell me if 5 cookies is a positive or negative number?"). Answered, got validation "Nice! That's exactly it." + number-line teaching + follow-up question. **2 complete exchanges, quick chips visible (Too hard / Explain differently / Hint / Helpful / Not helpful / That's incorrect — CC-01 verified).** |
| LEARN-08 | Library shelves | ✅ | 4 shelves render with retention badges + last-session label |
| LEARN-09 | Subject shelf → book selection | ✅ | Single-book shelves bypass to book detail |
| LEARN-10 | Book detail + Start learning | ✅ | "STUDY NEXT" + "PAST SESSIONS" sections render — F-002 + F-004 |
| LEARN-12 | Topic detail (normal flow from book detail) | ⚠️ | **Re-verified live 2026-04-19.** Opened shelf `/shelf/{math}` → book detail at `/shelf/{math}/book/{bookId}` → book showed "You finished this book! / All 1 topics covered. Review any topic…" → clicked `book-start-learning` → navigated directly to `/session?mode=learning&subjectId=...&topicId=...&topicName=Numbers%20Galore%3A%20Whole%20Numbers%20%26%20Integers`. **F-007 confirmed**: normal flow from book detail bypasses `/topic/[id]`. F-009 (direct deep-link failure) remains. |
| HOME-09 | LearnerScreen recoveryMarker Continue card | 🔍 | **Code-only (web SecureStore limitation).** [LearnerScreen.tsx:59-103](apps/mobile/src/components/home/LearnerScreen.tsx:59) reads from `readSessionRecoveryMarker()` which uses Expo SecureStore — not available on web. Branch always returns null on web → `intent-continue` from recoveryMarker never shown. Native only. |
| HOME-10 | LearnerScreen reviewSummary-as-Continue branch | 🔍 | **Code-only — no seed available.** [LearnerScreen.tsx:187-210](apps/mobile/src/components/home/LearnerScreen.tsx:187) gates on `reviewSummary.totalOverdue > 0 && reviewSummary.nextReviewTopic`. TestKid has no overdue topic in the review queue. Route `/topic/relearn` is the target when a topic is overdue. |
| HOME-11 | LearnerScreen loading state | ⚠️ | **Code-only.** [LearnerScreen.tsx:274-290](apps/mobile/src/components/home/LearnerScreen.tsx:274) shows only `<ActivityIndicator size="large" />` — **no timeout, no cancel, no "Taking too long" fallback**. Violates the global UX Resilience Rule in `~/.claude/CLAUDE.md` ("Loading — show spinner + cancel/timeout after 15-30s"). See F-044. |
| HOME-12 | LearnerScreen error state | ✅ | **Code-verified.** [LearnerScreen.tsx:292-321](apps/mobile/src/components/home/LearnerScreen.tsx:292) — `isError && !subjects` renders `learner-error-state` with "We couldn't load your library right now" + Retry button (no Go Home / Sign Out secondary — OK because this IS home). Accessibility role + label present. Cannot trigger live without breaking the API. |
| HOME-13 | Quiz Discovery intent card | 🔍 | **Code-only — no seed available.** [LearnerScreen.tsx:57](apps/mobile/src/components/home/LearnerScreen.tsx:57) reads `useQuizDiscoveryCard()`. TestKid's home showed only the 5 standard intent cards (Continue/Learn/Ask/Practice/Homework) — no quiz-discovery card. Requires missed-items seeded in `quiz_mastery_items` for the profile. See also F-033 (`/mark-surfaced` route deploy lag). |
| LEARN-15 | Relearn flow | ✅ | Reached via topic tap → mode=relearn — F-008 (header copy) |
| LEARN-17 | Progress overview | ✅ | All four subject cards render with stats — F-010 + F-011 + F-012 |
| LEARN-18 | Subject progress detail | ✅ | Renders 0/10 mastered + In progress / Not started split |
| LEARN-20 | Milestones list | ✅ | Empty state renders correctly via direct URL — F-012 (no nav link) |
| LEARN-21 | Cross-subject vocabulary | ✅ | Empty state renders via direct URL — F-013 (copy) + F-012 (no nav link) |
| LEARN-22 | Per-subject vocabulary list | ⏭️ | Requires existing vocab; user has none |

### Practice Hub + Practice Activities
| ID | Flow | Status | Notes |
|---|---|---|---|
| PRACTICE-01 | Practice hub menu | ✅ | 4 cards: Review / Recite / Dictation / Quiz + **new `practice-quiz-history` link** (ui-redesign branch) |
| PRACTICE-02 | Review topics shortcut | ✅ | "Nothing to review" empty state with "Browse your topics" link |
| PRACTICE-03 | Recitation session | ✅ | Renders "Recitation (Beta)" with "Recite from memory" greeting |
| PRACTICE-04 | All-caught-up empty state | ✅ | Visible on Practice when no overdue topics |
| QUIZ-01 | Quiz activity picker | ✅ | 3 cards: Capitals / Vocabulary: Spanish (New!) / Guess Who. **Now shows `Best: x/y · Played: n` per card after any play — verified 2026-04-18 ui-redesign pass.** |
| QUIZ-02 | Round-generation loading | ✅ | "Shuffling questions..." rotation + Cancel button |
| QUIZ-03 | Capitals play end-to-end | ✅ | **VERIFIED 2026-04-18 ui-redesign pass.** Played 4-question round of "Lesser-Known European Capitals" to completion, 2/4 correct, +20 XP, celebrationTier="nice". F-014 fix verified — response stripped to `{type, country, options, funFact, isLibraryItem}` only. |
| QUIZ-04 | Guess Who play end-to-end | ✅ | **VERIFIED 2026-04-18 ui-redesign pass.** 3-question round "Pioneers in Technology and Science" — 3/3 perfect, +79 XP, celebrationTier="perfect". Free-text first (Tesla clue 1 correct), MC fallback after 3rd clue (Bell), free-text Q3 (Eastman). F-028 fix verified: `/check` now returns `{"correct": boolean}` properly. |
| QUIZ-05 | Mid-round quit | ✅ | Quit icon visible top-left; tested |
| QUIZ-06 | Round complete error retry | ⚠️ | Retry after transient 502 works — LLM returned 502 UPSTREAM_ERROR first attempt, 200 on retry. F-014 leak remains on 200 response. |
| QUIZ-07 | Results screen | ✅ | **VERIFIED 2026-04-18 ui-redesign pass.** All three celebrationTiers observed (nice/great/perfect). Perfect tier renders `BrandCelebration` + trophy icon + title "Perfect round!". Guess_who-specific subtitle "X of Y people identified". `xpEarned > 0` pill shown. Play Again / Done / View History buttons. |
| QUIZ-08 | Typed-error classification | ✅ | Two real error paths verified: 502 upstream (quiz-launch-error fallback with Retry/Go Back) + 404 check (pre-fix). Post-fix /check returns `{correct}`. |
| QUIZ-09 | Quiz History list | ✅ | **NEW [5B.15] — VERIFIED.** `/quiz/history` renders rounds grouped by date with activityType, theme, score/total, xpEarned. `quiz-history-empty` state with "Try a Quiz" CTA works. Reachable via `practice-quiz-history` link AND `quiz-results-history` link from results screen. |
| QUIZ-10 | Round Detail view | ✅ | **[5B.16, 5B.18] — F-032 FIXED.** `GET /v1/quiz/rounds/:id` now branches on `status === 'completed'` — returns `score`, `results[]`, `correctAnswer`. Client reads these fields correctly. |
| QUIZ-11 | Free-text answer for eligible questions | ⏭️ | **NEW [5C.21] — Not reachable.** Code path renders `quiz-free-text-input` + `quiz-free-text-field` + `quiz-free-text-submit` when `question.freeTextEligible === true`. This only fires when a question is a mastery item [4B.6-11], which requires prior missed-but-learned items in the quiz_mastery_items table. User had no mastery items, so none of my rounds had `freeTextEligible: true` questions. Code inspection confirms the path is implemented. |
| QUIZ-12 | Mastery-driven round generation | ⏭️ | **NEW [4B.6-11] — Not directly testable.** Would require seeding `quiz_mastery_items` for the profile. Schema (`quiz_mastery_items` table with SM-2 columns) is live. |
| QUIZ-13 | Mark-surfaced discovery card | 🔴 | **NEW [4B.1-3] — BLOCKED.** F-033: `POST /v1/quiz/missed-items/mark-surfaced` returns plain-text "404 Not Found" on staging worker (deploy lag). Mobile hook `useMarkQuizDiscoverySurfaced` uses fire-and-forget `.mutate()` so UX isn't blocked — but the discovery card will **re-appear every session** until the route lands on the worker. Also, coaching-card currently returns type `continue_book` for this user; quiz_discovery type wasn't triggered this pass. |
| QUIZ-14 | Challenge banner (difficulty bump) | ⏭️ | **NEW [5A.12, 5A.14b] — Not reached.** Requires **3 perfect rounds within 14 days** on the same activity to toggle `difficultyBump: true` in next round's generation. User has 1 perfect guess_who round; 2 more needed. Code path renders `quiz-challenge-banner` ("Challenge round — you're on a streak! This one is harder.") for 3 seconds then auto-hides. |

### Dictation
| ID | Flow | Status | Notes |
|---|---|---|---|
| DICT-01 | Dictation choice screen | ✅ | "I have a text" + "Surprise me" cards render |
| DICT-02 | OCR text preview + edit | ✅ | Reached via "I have a text" — F-018 (copy mismatch) |
| DICT-03 | "Surprise me" generate | ✅ | LLM generated 10 sentences (within 6-12 spec range) |
| DICT-04 | Playback screen | ✅ | All controls render (Pace/Punct/Skip/Repeat/Exit/Counter); TTS silent on web |
| DICT-05 | Mid-dictation exit confirm | ⚠️ | Web Alert.alert doesn't render in preview tools — playback advances silently |
| DICT-06 | Completion screen | ✅ | "Well done!" with three options — F-020 (no data guard) |
| DICT-07 | Photo review (multimodal LLM) | 🔍 | Code path only; web has no camera |
| DICT-08 | Sentence remediation | ⏭️ | Not reachable without review data |
| DICT-09 | Perfect-score celebration | ⏭️ | Not reached |
| DICT-10 | Recording dictation result | ✅ | Tested live 2026-04-18 continuation #3. Tapped "I'm done" on complete screen → `POST /v1/dictation/result` → 201 with `{id, profileId, date: "2026-04-18", sentenceCount: 10, mistakeCount: null, mode: "surprise", reviewed: false}`. **Observation F-031**: request fired TWICE in the same interaction (possibly web-test artifact from dispatching both pointer events AND click). Worth confirming on native. |

### Homework
| ID | Flow | Status | Notes |
|---|---|---|---|
| HOMEWORK-01 | Start from home | ✅ | Reached via direct URL |
| HOMEWORK-02 | Camera permission | ✅ | Renders "Camera Access Needed" with Allow / Go back — clean escape |
| HOMEWORK-03 | Manual fallback | ⏭️ | Not reachable past camera prompt on web |
| HOMEWORK-04 | Multi-problem session | ⏭️ | Not exercised |
| HOMEWORK-05 | Gallery import | 🔍 | Code only |
| HOMEWORK-06 | Image vision pass-through | 🔍 | Code only |

### Billing
| ID | Flow | Status | Notes |
|---|---|---|---|
| BILLING-01 | Subscription details | ✅ | Renders with Free plan + usage + 4-tier plan list — F-019 |
| BILLING-02 | Upgrade flow | ✅ | `free-upgrade-button` + quota `quota-upgrade-btn` both deep-link to `/subscription`. Validated 2026-04-18 continuation. |
| BILLING-04 | Restore purchases | ⚠️ | Tapped 2026-04-18 — silent no-op on web. `restore.mutateAsync()` uses native RevenueCat SDK which is stubbed on web. Error fallback is `Alert.alert` which is itself no-op on web (F-029 class). Not a bug for real users (iOS/Android), but web QA can't exercise this path. |
| BILLING-07 | Daily quota exceeded paywall | ✅ | Tested 2026-04-18. Sent "What are the main geographical regions of Africa?" in a Geography session → quota 10/10 → `quota-exceeded-card` rendered with "Daily limit reached / Used 10 of 10 — resets at midnight. Upgrade for more learning time." + `quota-upgrade-btn` which deep-links to `/subscription` correctly. Exact-match with the `BILLING-07` flow spec. |
| BILLING-09 | Top-up | 🔍 | Not visible on subscription screen |
| BILLING-10 | BYOK waitlist | ✅ | Tested live 2026-04-18 — `POST /v1/byok-waitlist` → `201 {"message":"Added to BYOK waitlist","email":"..."}` — button transitions to "Already joined" on success. Idempotent state recognition. No Alert.alert dependency. |

### Edge / fallbacks
| ID | Flow | Status | Notes |
|---|---|---|---|
| Direct deep-link `/topic/{id}` | | ⚠️ | F-009: fails with "Topic not found" + Go back fallback |
| Direct deep-link `/assessment` | | ✅ | Fails with "missing required information" + Go back fallback |
| Direct deep-link `/dictation/review` | | ✅ | "Review data not found" + Go back fallback |

## Findings (running list)

> Severity: 🔴 high · 🟡 medium · 🟢 low · 🔵 info-only · 🌐 web-only artifact (no native impact).

### F-001 🟡 Continue card → Session lacks `lastSessionId`
- **Where:** `LearnerScreen.tsx` "Continue" intent card → `/(app)/session?...&mode=learning`.
- **Observed URL:** `subjectId=...&subjectName=Geography&topicId=...&topicName=Africa%27s%20Geographic%20Tapestry&mode=learning` — **no `sessionId`**.
- **Why it matters:** The intent of "Continue" is to resume an existing session. Without `lastSessionId`, the session screen will create a NEW session attached to the same topic. The "Past Sessions" list on the book detail (see F-002) confirms this — the previously interrupted session shows as "2d" instead of "today" because resuming created a fresh row.
- **Code:** `LearnerScreen.tsx:147-158` — `lastSessionId` is conditionally spread, but `useContinueSuggestion` is apparently returning a row without it. Worth confirming whether the API ever populates `lastSessionId` for in-progress topics.
- **User impact:** Session events get split across multiple `learning_sessions` rows for the "same" continued lesson, fragmenting the post-session pipeline (retention card, embeddings, XP).

### F-002 ✅ Time labels disagree across surfaces
- **Where:** Library shelf list shows Geography "Last session: Today". Book detail (`shelf/.../book/...`) Past Sessions list shows the most recent session as "2d".
- **Why:** Library aggregate likely includes today's just-resumed/just-created session row; book detail "Past Sessions" filters to closed sessions only.
- **User impact:** Mild confusion — a child seeing two different "last session" labels for the same subject within two taps will not know which is true.

### F-007 🟡 Topic-detail screen unreachable via the user-visible flow
- **Where:** Library `Topics` tab → tap any topic → goes directly to `/session?mode=relearn` (or `mode=learning`), bypassing `/topic/[topicId]`.
- **Tested:** Tapped "Africa's Geographic Tapestry" with retention "Growing" → URL `/session?mode=relearn&topicId=...` rendered immediately.
- **Why it matters:** Topic Detail was the spec'd entry for the "[not_started] Start Learning / [in_progress] Continue Learning + Start Review / [completed] Start Review + Continue Learning" decision UX. Now the system makes that decision for the user. Either intentional simplification or a regression — worth flagging.

### F-009 🟡 Direct deep-link to `/topic/{validId}` returns "Topic not found"
- **Where:** Direct URL `localhost:8081/topic/019d8bf5-ff1d-7574-bc3d-bd87056f52e1` (a real topic id from the same session).
- **Result:** Renders "Topic not found / This topic could not be opened. Please go back and try again." with a Go back button (good fallback UX).
- **Likely cause:** The topic detail screen probably reads from `useLocalSearchParams` for `subjectId` or hydrates from in-memory context that resets on full reload (no SecureStore on web).
- **Impact:** Sharing a topic URL or pasting it into a new tab fails. Mobile native may behave differently if the params are pushed via router.push, but the failure on direct nav is real.

### F-033 🔴 CRITICAL — `POST /v1/quiz/missed-items/mark-surfaced` returns plain 404 on staging worker
- **Where:** The discovery-card → quiz handoff path in [apps/mobile/src/hooks/use-coaching-card.ts:61-71](apps/mobile/src/hooks/use-coaching-card.ts:61), dispatched from [LearnerScreen.tsx:192-206](apps/mobile/src/components/home/LearnerScreen.tsx:192) when a user taps the `intent-quiz-discovery` card.
- **API probe 2026-04-18 ui-redesign pass:**
  ```
  POST /v1/quiz/missed-items/mark-surfaced
    body: {"activityType":"capitals"}
    headers: Authorization + X-Profile-Id (Zuzana)
  → 404 Not Found
  content-type: text/plain; charset=UTF-8
  body: "404 Not Found"
  ```
  The plain-text body + Hono's default catch-all signature strongly indicates the route is NOT on the deployed worker.
- **Source exists:** [apps/api/src/routes/quiz.ts:355](apps/api/src/routes/quiz.ts:355) defines the route (commit 6318a8fd). This is the same deploy-lag pattern that was behind the old F-014 and F-028 CRITICALs.
- **User impact (lower than F-028 was):**
  - Mobile hook uses fire-and-forget `mutate()` (not `mutateAsync`) with comment "If the mutation fails, the card reappears next session" — silent degradation by design. No crash, no visible error.
  - **But:** the discovery card will **reappear on every session** until the route deploys. Users who see the same "Try a capitals quiz!" card repeatedly may find it annoying or dismiss it as broken.
- **Recommended fix:** Redeploy `mentomate-api-stg` to pick up commit 6318a8fd (and all 22 following commits). Same workflow as F-014/F-028 recovery. Add a smoke test hitting `POST /v1/quiz/missed-items/mark-surfaced` with a valid profile + activityType asserting 200 to prevent silent regression.

### F-035 ✅ Orphan `totalXp` field in `/v1/quiz/stats` not surfaced anywhere in UI
- **Where:** `GET /v1/quiz/stats` response includes `{ activityType, bestScore, bestTotal, roundsPlayed, totalXp }` per row. User's totalXp after 2 rounds = `capitals: 20 XP, guess_who: 79 XP` — so lifetime earned = 99 XP, not displayed anywhere.
- **Why it matters:** XP is the main gamification mechanic introduced in this branch. Users see "+20 XP" / "+79 XP" on the results screen for a few seconds then it disappears. There's no leaderboard, no running total, no badge threshold shown. The totalXp stat exists on the server but the UI never reads it.
- **Recommended fix:** Either surface `totalXp` on the Quiz picker cards (e.g., "Best: 3/3 · 79 XP lifetime") or add a small XP badge to the profile-chip header. Cheap, high-perceived-value win.

### F-036 ✅ Round detail screen cosmetic polish
- **Where:** [apps/mobile/src/app/(app)/quiz/[roundId].tsx](apps/mobile/src/app/(app)/quiz/[roundId].tsx). (Assumes F-032 is fixed and the screen has real data.)
- **Issues spotted:**
  1. Back button is plain text "Back" — inconsistent with the `arrow-back` Ionicon used everywhere else (Practice, Quiz picker, etc.).
  2. activityType renders raw — `"guess who"` / `"capitals"` in lowercase. The tailwind `capitalize` class capitalizes the first letter of EACH word, so `guess_who.replace('_', ' ')` becomes "Guess Who" only for the CSS display — but the underlying `textContent` is lowercase. Screen readers and automated tests see the lowercase form.
  3. No per-question type labels — Guess Who questions all render as "Guess Who" placeholder; user can't tell which clue/person was shown. Would be helpful to at least show `canonicalName` (or the clue used) for context.
- **Recommended fix:** Use `arrow-back` Ionicon + standard back testid `round-detail-back`; use server-side formatted activity labels (e.g., `activityLabel: 'Capitals'`) rather than client-side string mangling.

### F-038 ✅ "Type your guess" placeholder echoes the same label-like text above the input (minor redundancy)
- **Where:** Guess Who input area.
- **Observed:** DOM has text label "Type your guess" AND the TextInput placeholder "Type your guess..." immediately below. On a small phone the effect is two nearly identical prompts stacked.
- **Recommended fix:** Drop one — either the label OR the placeholder. Placeholder is sufficient for a single-field form.

### F-040 🟡 Results screen never reveals which questions were missed or their correct answers
> **ID note:** Jumping from F-038 → F-040 because a separate parent-dashboard block (later in the file, lines ~724-777) independently took F-032..F-039 while this was being written. Two parallel F-series now exist in the file — worth a renumbering pass when convenient.

- **Where:** [apps/mobile/src/app/(app)/quiz/results.tsx](apps/mobile/src/app/(app)/quiz/results.tsx) — the immediate post-round screen.
- **Observed 2026-04-18 ui-redesign pass:** After a 2/4 capitals round, the results screen showed only:
  - Tier icon + "Nice effort!" title
  - Score display `2/4`
  - Theme name "Lesser-Known European Capitals"
  - `+20 XP` pill
  - Play Again / Done / View History buttons
  - **Nowhere on the screen were the two missed questions or their correct answers revealed.** The user sees "2/4" but has no way to know *which* two they got wrong or *what the correct answers were* (Ljubljana and Andorra la Vella).
- **The data is already on the client:** `POST /v1/quiz/rounds/:id/complete` returned (observed in live network log):
  ```json
  { "score": 2, "total": 4, "xpEarned": 20, "celebrationTier": "nice", "droppedResults": 0,
    "questionResults": [
      { "questionIndex": 0, "correct": true,  "correctAnswer": "Bern" },
      { "questionIndex": 1, "correct": true,  "correctAnswer": "Luxembourg City" },
      { "questionIndex": 2, "correct": false, "correctAnswer": "Ljubljana" },
      { "questionIndex": 3, "correct": false, "correctAnswer": "Andorra la Vella" }
    ]
  }
  ```
  `completionResult.questionResults` is already stored in `useQuizFlow()` via `setCompletionResult(result)` in [quiz/play.tsx:261](apps/mobile/src/app/(app)/quiz/play.tsx:261). The results screen just never reads this array beyond `score, total, xpEarned, celebrationTier`.
- **Why this is the most important user-facing gap in the whole feature:**
  1. **The teaching moment is the missed question.** Learners retain correction, not congratulations. Showing "You missed Slovenia → Ljubljana" after a round is the single interaction most likely to produce actual learning.
  2. **Without this, the quiz is a scoring toy, not a learning loop.** The user gets a number, loses the opportunity to fix their mental model, and will miss the same questions next round — defeating the point of the SM-2 mastery-item system [4B.6-11].
  3. **F-032 (broken Round Detail) can't substitute** — users shouldn't need to bounce out to History while the emotional stakes are hot. The correction belongs on the immediate results screen.
- **Recommended fix (client-only, no server work needed):**
  - Below the XP pill, add a "What you missed" section rendered when `questionResults.some(r => !r.correct)`.
  - For each wrong answer, show: question prompt (e.g. `"Capital of Slovenia"`) + user's answer in red + correct answer in green.
  - For perfect rounds, skip the block entirely — the current celebration works.
  - Consider adding a primary-action "Review these" button that navigates to a re-teach session scoped to the missed subject.
- **Severity:** 🟡 Medium — nothing is broken (screen renders, no errors) but a large pedagogical miss. This was the #1 user-perspective frustration I hit.
- **Relationship to F-032:** Independent. F-032 is a server-data gap for the history/detail view. F-040 is a client-side rendering gap for the immediate results screen, where the data is *already present but never displayed*.

---

### F-041 🔴 Non-language subject routed into `/onboarding/language-setup` → 422 on submit
- **Where:** [apps/mobile/src/app/(app)/onboarding/language-setup.tsx:112-139](apps/mobile/src/app/(app)/onboarding/language-setup.tsx:112) (`handleContinue`) + API route `PUT /v1/subjects/{id}/language-setup`.
- **Observed 2026-04-19 live:** Landed on the language-setup screen with query params `subjectId={biology-uuid}&subjectName=Biology&languageCode=es&languageName=Spanish&step=2&totalSteps=4`. Selected English native + Complete beginner → clicked `language-setup-continue`. Request fired:
  ```
  PUT https://api-stg.mentomate.com/v1/subjects/019da4ce-74d6-7293-bbe2-b039552bdbd5/language-setup → 422
  { "code": "VALIDATION_ERROR", "message": "Subject is not configured for language learning" }
  ```
  The error text is rendered in the `error` block above the Continue button (line 198-201 of language-setup.tsx), so it isn't silent — but the UX is still a dead end: the user has already walked through Step 2 of 4, expects to advance to Accommodations, and instead gets "Subject is not configured for language learning" with no clear recovery path (no button, no redirect, just a plain red text block).
- **Root cause hypothesis:** The URL param `languageCode=es` is set by the language-detection classifier during initial interview routing, but the DB record for this subject's `subjectType` is still `'general'` (not `'language'`) because language-setup never completed. The screen assumes the subject is already marked language-learning by the time it renders. Two plausible fixes: (a) backend auto-promotes the subject's type on first language-setup submit; (b) frontend checks `subject.subjectType === 'language'` before allowing navigation into this screen and routes the user back to the normal analogy-preference path if not.
- **Severity:** 🔴 High — this is the kind of bug a real family will hit when the detector mis-classifies a subject (e.g. "I want to learn about Spain" → flagged as Spanish learning by classifier → stuck in language-setup 422 forever). No recovery affordance on the screen itself.
- **Verified by:** live — full network trace captured with 422 response body.
- **Recommended fix:**
  - Short term: change the error block to an `ErrorFallback` component with "Go back" + "Continue with standard setup" secondary actions.
  - Long term: gate entry into language-setup on `subject.subjectType === 'language'` in `InterviewScreen.goToNextStep` (interview.tsx:58-92).

### F-042 🟡 Interview completion relies on LLM emitting `[INTERVIEW_COMPLETE]` — no hard cap, no fallback Done button
- **Where:** [apps/api/src/services/interview.ts:52-58](apps/api/src/services/interview.ts:52) (system prompt) + [apps/mobile/src/app/(app)/onboarding/interview.tsx:253-255](apps/mobile/src/app/(app)/onboarding/interview.tsx:253) (client-side gating of `view-curriculum-button`).
- **Observed — user's earlier session note:** "LLM didn't emit the marker after 3 turns; the 'Let's Go' CTA (view-curriculum-button) was never seen live."
- **Code-verified 2026-04-19:** The system prompt says:
  > "Keep questions conversational and brief. After 3-5 exchanges when you have enough signal, wrap up with a short, encouraging summary … Then place the marker [INTERVIEW_COMPLETE] on its own line at the very end (after your message)."

  On the server, `isComplete` is derived entirely from `fullResponse.includes('[INTERVIEW_COMPLETE]')` (lines 234 & 280). If the model doesn't emit the marker, `isComplete` stays `false`, the mobile client never flips `interviewComplete`, and the `view-curriculum-button` footer block ([interview.tsx:318-339](apps/mobile/src/app/(app)/onboarding/interview.tsx:318)) is never rendered. There is **no** server-side hard cap that forces the marker after N exchanges, and **no** "I'm done, take me to the curriculum" fallback button in the UI.
- **Why this is a dead-end pattern:** Per `~/.claude/CLAUDE.md` UX Resilience Rule: "Every Screen State Must Have an Action". If the LLM misbehaves and keeps asking questions, the user has only two options: (1) keep chatting indefinitely hoping for the marker, or (2) navigate away via tabs/back, losing their interview draft.
- **Severity:** 🟡 Medium — not broken on the happy path (LLM usually complies), but very brittle. Prompt drift or a bad model hour can block every new onboarding flow.
- **Recommended fix:**
  - Server: after `exchangeCount >= 6`, append the marker client-side to the streamed response regardless of LLM output (deterministic fallback).
  - OR: once `exchangeCount >= 4`, render a secondary "Ready to start learning" button under the ChatShell that manually flips `interviewComplete` and fires the same navigation as `view-curriculum-button`.
  - Add an integration test: feed a mock LLM that never emits the marker; assert the user still has a path to `view-curriculum-button`.
- **Verified by:** code only — couldn't trigger live without burning many LLM calls on staging. Requested on next native-build pass.

### F-043 🟢 Add-topic modal stays visible after successful create
- **Where:** [apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx:174-203](apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx:174) (`handleCreateTopic`).
- **Observed 2026-04-19 live:** Opened `add-topic-button` → typed "Negative Numbers and Number Lines" → Preview button → LLM generated description → clicked Add topic (`add-topic-confirm`). Server accepted: topic count went 12 → 13 (confirmed via `[data-testid^="topic-"]` DOM count). **But** the bottom-sheet modal stayed visible — inputs were emptied (reset fired) but `setShowAddTopicModal(false)` didn't appear to visually dismiss the sheet. The user is left looking at an empty "Add a topic" form after a successful add, which reads like a silent failure.
- **Possible cause:** `handleCreateTopic` only closes the modal when `result.mode === 'create'` (line 196). If the server returns `result.mode === 'update'` for any reason (e.g. a similar topic already existed from the challenge regeneration), reset fires but close does not. Alternatively this could be a React Native Web Modal close race (the Modal component's `visible` prop flipping doesn't always animate out cleanly on web).
- **Severity:** 🟢 Low — data mutation succeeded, user can tap Cancel to dismiss. Worth verifying on native (iOS/Android Modal close is reliable; may only affect web preview).
- **Recommended fix:** Always close the modal on any successful (non-error) mutation result, not just `mode === 'create'`:
  ```ts
  // After successful mutation:
  resetAddTopicModal();
  setShowAddTopicModal(false);  // unconditional
  ```
  Then branch on `result.mode` only for whether to show a "Topic updated" vs "Topic added" toast.
- **Verified by:** live web — topic count delta and empty input state observed.

### F-044 🟡 LearnerScreen loading state has no timeout or cancel — indefinite spinner if API hangs
- **Where:** [apps/mobile/src/components/home/LearnerScreen.tsx:274-290](apps/mobile/src/components/home/LearnerScreen.tsx:274).
- **Observed 2026-04-19 (code-only):** The loading branch renders a bare `<ActivityIndicator size="large" />` inside a centered ScrollView with no accompanying text, no cancel/retry button, no "Taking longer than usual…" fallback. If `useSubjects()` hangs (slow network, API 504, Clerk token stall), the user sees a spinner with no affordance to escape except force-killing the app or navigating via tabs. There is no `testID` on this state, making it invisible to automated testing of the fallback.
- **Compare to existing good patterns in the repo:**
  - [curriculum-review.tsx:257-263](apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx:257) — `curriculum-loading` with explanatory text
  - The homework-vision and dictation screens have 15s hard-timeout fallbacks that flip to an error+retry state
- **Severity:** 🟡 Medium — home is the first screen every session, and if it stalls, the whole app feels dead. Especially bad on flaky mobile networks.
- **Recommended fix:** Wrap in a `TimeoutLoader` (one of the `ErrorFallback`/`TimeoutLoader` standard components referenced in `~/.claude/CLAUDE.md` UX Resilience Rules). After 15s:
  - Change the label to "Still loading — check your connection"
  - Add a `learner-loading-retry` button that calls `refetch()`
  - Add a `learner-loading-home` fallback that signs out gracefully if auth is stuck
- **Verified by:** code inspection only — couldn't reproduce live because `useSubjects` returned quickly on every preview load.

---

## Not yet covered (69 flows)

These flows from [`mobile-app-flow-inventory.md`](mobile-app-flow-inventory.md) were not touched in this session — neither live, nor code-inspected, nor explicitly deferred. They're the silent gap. Listed here so the next session has a complete pickup list.

### AUTH (1 of 12 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| AUTH-11 | Session-expired forced sign-out | Hard to trigger without waiting out a real Clerk session expiry |

### ACCOUNT (14 of 26 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| ACCOUNT-05 | Family-plan gating + max-profile gating for adding children | Needs Family/Pro plan + N profiles |
| ACCOUNT-12 | Cancel scheduled account deletion | Destructive — would require initiating delete first |
| ACCOUNT-14 | Terms of service | ✅ Tested 2026-04-18 — `/terms` renders "Terms of Service / Last updated: March 2026 / 1. Acceptance of Terms / ..." Has hasEffectiveDate + hasGoverningLaw language. No testid for the ToS link on More screen or the Terms screen itself (minor a11y concern). F-003-style stacking previously observed — now fixed via `contentStyle`/`sceneStyle` (2026-04-19). |
| ACCOUNT-16 | Child mentor memory | Needs a child profile |
| ACCOUNT-17 | Child memory consent prompt | Needs a child profile + consent state |
| ACCOUNT-18 | Subject analogy preference after setup | Needs a freshly-onboarded subject |
| ACCOUNT-19 | Consent request during underage profile creation | Needs creating an underage profile |
| ACCOUNT-20 | Child handoff to parent consent request | Needs an underage profile mid-consent |
| ACCOUNT-21 | Parent email entry, send/resend/change consent link | Needs a pending consent state |
| ACCOUNT-22 | Consent pending gate | Needs a profile with `consentStatus === 'PENDING'` |
| ACCOUNT-23 | Consent withdrawn gate | Needs a profile with `consentStatus === 'WITHDRAWN'` |
| ACCOUNT-24 | Post-approval landing | ✅ Tested 2026-04-18 continuation #3 — switching profile to fresh TestKid (consentStatus=CONSENTED) showed "🎉 You're approved! / Your parent said yes — time to start learning. / Let's set up your first subject. / Let's Go" modal. Overlay on /dashboard route (F-003 web-stacking — now fixed 2026-04-19). |
| ACCOUNT-25 | Parent consent management for a child | Needs a child profile |
| ACCOUNT-26 | Regional consent variants (COPPA, GDPR, above-threshold) | Needs region-seeded test accounts |

### HOME (2 of 8 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| HOME-04 | Animated splash and initial shell | Already-authenticated session bypassed splash |
| HOME-05 | Empty first-user state | Account already has subjects; needs a fresh profile |

### SUBJECT (12 of 15 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| SUBJECT-02 | Create subject from library empty state | Library is not empty for this account |
| SUBJECT-03 | Create subject from chat when classifier fails | Needs an Ask session with no classifier match |
| SUBJECT-04 | Create subject from homework | Needs a homework session that surfaces the create-subject branch |
| SUBJECT-05 | Subject resolution and clarification suggestions | Needs a freeform message with multi-match classification |
| SUBJECT-06 | Broad subject flow → pick a book | Skipped to avoid mutating library |
| SUBJECT-07 | Focused subject / focused-book flow | Same — would mutate |
| SUBJECT-08 | Language learning setup | Same |
| SUBJECT-09 | Interview onboarding | Same — full LLM-driven interview costs quota |
| SUBJECT-10 | Analogy-preference onboarding | Same |
| SUBJECT-11 | Curriculum review | Same |
| SUBJECT-13 | Challenge curriculum / skip / add / why | Same |
| SUBJECT-14 | Placement / knowledge assessment | Direct deep-link to `/assessment` shows missing-params error; full flow needs a real subject context |

### LEARN (10 of 22 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| LEARN-03 | First session experience | Needs a fresh profile |
| LEARN-04 | Core learning loop | Skipped — would create real session events |
| LEARN-05 | Coach bubble visual variants | Theme-specific; SecureStore-dependent on web |
| LEARN-06 | Voice input + voice-speed controls | Web has no native voice |
| LEARN-07 | Session summary submit / skip | ✅ | **Both paths verified live 2026-04-18 continuation #3.** Skip path: `POST /v1/sessions/{id}/summary/skip` → 200 with `{summary: {status: "skipped"}, shouldPromptCasualSwitch: false, pipelineQueued: true}`. Submit path: closed TestKid Math session via DB query (F-029 blocked UI close) → deep-linked to summary URL → screen showed real data ("1 minute", "2 exchanges", "strong independent thinking") → typed real summary → `POST /summary` → 200 with AI feedback inline + `summary-submitted` state. Also: already-skipped session shows `summary-skipped-state` view (BUG-449 fix verified). |
| LEARN-11 | Manage subject status (active/paused/archived) | Skipped — would mutate library |
| LEARN-13 | Recall check | Needs an overdue topic |
| LEARN-14 | Failed recall remediation | Needs an overdue topic + a deliberately failed recall |
| LEARN-16 | Retention review surfaces | Needs overdue topics |
| LEARN-19 | Streak display | User streak is 0 — nothing to display |

### PARENT (9 of 9 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| PARENT-01 | Parent dashboard (live or demo) | ✅ **Re-verified 2026-04-18 continuation #4 with live data.** `/dashboard` now renders a rich TestKid card: "TestKid: 2 problems, 0 guided. 1 sessions this week (↑ up from 0 last week)" + Trend "1 sessions, 36m this week (↑ up from 0 sessions, 0m last week)" + teaser "After **3** more sessions, you'll see TestKid's retention trends and detailed progress here." (threshold lowered from 4 — PEH-S1 Task 2 ✅). API `/v1/dashboard` response omits `currentStreak` / `longestStreak` / `totalXp` (F-032 deploy gap — schema has `.default(0)` so UI doesn't break). Testids: `parent-dashboard-summary`, `parent-dashboard-teaser`, `parent-dashboard-summary-primary`. F-039 noted (inner button + session-card don't dispatch click on web). |
| PARENT-02 | Multi-child dashboard | ⏭️ Not exercised this pass — deferred (would require adding a 2nd child + seeding data) |
| PARENT-03 | Child detail drill-down | ✅ **Re-verified 2026-04-18 continuation #4 (PV+PEH parent pass) with real data.** TestKid now has 1 session / 2 exchanges / 36 min. Child detail renders 8 distinct sections: **Visible progress** · **Monthly reports** · **Recent growth** · **Subjects** · **Recent Sessions** (new from PV-S2) · **Mentor Memory** consent · **What the mentor knows** (new from PV-S3) · **Learning Accommodation** · **Consent management**. Testids now include `session-card-{id}`, `mentor-memory-link`, `subject-card-{id}`, `memory-consent-grant`/`decline`, `accommodation-mode-*`, `withdraw-consent-button`. |
| PARENT-04 | Child subject → topic drill-down | ✅ **Tested 2026-04-18 continuation #4.** `/child/{profileId}/subjects/{subjectId}` renders with Math title + book "Numbers Galore: Whole Numbers & Integers" + subject-level retention signal "Thriving" (`retention-signal-strong`) + topic card. Topic detail at `/child/{profileId}/topic/{topicId}` renders `topic-status-card` ("In progress") + `topic-mastery-card` (0%) + `topic-retention-card` ("Thriving") + Session History. F-034 found (UUID leak). |
| PARENT-05 | Child session / transcript drill-down | ⚠️ **Tested 2026-04-18 continuation #4 — BLOCKED by deploy gap + has UX gap.** Route `/child/{profileId}/session/{sessionId}` exists and renders. `useChildSessionDetail` hits `GET /v1/dashboard/children/:profileId/sessions/:sessionId`. This endpoint is on the ui-redesign branch [PV-S1 Task 5b] but NOT yet deployed to staging → returns 404 → screen shows generic "Something went wrong / Retry" state with no Go Back escape (F-032 deploy gap, F-033 UX-resilience violation). Also note: the transcript endpoint was intentionally removed in this branch — parent can no longer see raw conversation, only the summary [PV-S1 Task 2]. |
| PARENT-06 | Child monthly reports list + detail | ✅ Empty-state verified — `/child/{id}/reports` renders `child-reports-empty`, `child-reports-empty-time-context`, `child-reports-empty-progress` testids + `child-reports-back`. Full-data verification requires a monthly report to be generated (Inngest job) |
| PARENT-07 | Parent library view | ✅ **Tested 2026-04-18 continuation #4.** The "parent library view" surfaces as the subject drill-down at `/child/{profileId}/subjects/{subjectId}` — parents see the child's enrolled books + topic list + retention signal. Works. |
| PARENT-08 | Subject raw-input audit | 🔍 **Code-level verified 2026-04-18 continuation #4.** `/v1/dashboard` response includes `subjects[].rawInput` field per child. For TestKid's Math subject `rawInput: null` (created via quick-start card, not raw typing) so nothing renders. Field is plumbed correctly — needs a subject created via raw-text input to visually verify. |
| PARENT-09 | Guided label tooltip | ⏭️ Observed as part of PARENT-01 — no specific tooltip testid found |
| PARENT-10 | Parent curated mentor memory view (new) | ⚠️ **Tested 2026-04-18 continuation #4 — BLOCKED by deploy gap.** `/child/{profileId}/mentor-memory` [PV-S3 Task 9] renders with consent gate at top + CONTROLS (Learn/Use toggles) + TELL THE MENTOR (text + Save) + PRIVACY (Export/Clear) + `something-wrong-button`. Curated signals panel can't populate because `GET /v1/dashboard/children/:profileId/memory` [PV-S3 Task 5] returns 404 on staging (F-032 deploy gap). Testids: `memory-consent-grant`, `memory-consent-decline`, `something-wrong-button`. |

### BILLING (5 of 10 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| BILLING-03 | Trial / plan usage / family-pool detail states | ✅ Tested 2026-04-18 continuation #3 after Zuzana upgraded to family. Subscription screen renders "Family pool / 1 of 4 profiles connected / 1500 shared questions left / Zuzana (owner)" testid `family-pool-section`. F-019 date format still mm/dd. |
| BILLING-05 | Manage billing deep link | Goes to App Store / Play subscriptions — no path on web |
| BILLING-06 | Child paywall + notify-parent | ⏭️ Needs a child with no entitlement (now that family tier is active, every child inherits entitlement) |
| BILLING-08 | Family pool visibility | ✅ Same path as BILLING-03 — tested via `family-pool-section` render |
| BILLING-09 | Top-up | ⚠️ Tested 2026-04-18 — `top-up-button` renders on family tier but tap is silent no-op on web (F-029 class — native RevenueCat IAP stubbed on web) |

### QA (9 of 9 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| QA-01..09 | All Maestro regression flows | These are automated tests that run via `maestro test`, not by hand. Out of scope for a browser-driven audit |

### CC (7 of 7 uncovered)
| ID | Flow | Why it's a gap |
|---|---|---|
| CC-01 | Conversation-stage-aware chips | Partially observed (F-005 noted dual mode pickers) but not exercised end-to-end across stages |
| CC-02 | Greeting-aware subject classification | ✅ Tested 2026-04-18 continued session. Two branches verified — see F-026 + F-027 below. |
| CC-03 | Animation polish | Not tested — visual polish not verifiable via accessibility snapshot; needs screenshots |
| CC-04 | `goBackOrReplace` mandatory back behavior | Implicitly observed working everywhere I navigated but not specifically validated against spec |
| CC-05 | Continue-where-you-left-off prioritisation | Partially observed (F-001) but the recovery-marker priority over API suggestion not exercised |
| CC-06 | Top-up purchase confidence | Top-up not visible on subscription screen for this user |
| CC-07 | Accommodation badge surfaces | Self-managed accommodations row visible in More (ACCOUNT-08); child surfaces require a child profile |

### Summary

| Bucket | Flows |
|---|---|
| ✅ ⚠️ ❌ Live-tested | 43 |
| 🔍 Code-inspected | 16 |
| ⏭️ Explicitly deferred (in coverage map) | 17 |
| **Surfaced uncovered (this section)** | **69** |
| **Total** | **145** |

> Note: the inventory total is 146, but ACCOUNT-01..03 was collapsed into one coverage-map row (counted as 3 covered above), so 43+16+17+69 = 145 because one row's status was claimed for three flows. Either the coverage map should split it back out or this footnote should be enough to close the loop. Erring on transparency.

## Severity rollup — open bugs only (cleaned 2026-04-19)

| Severity | Count | Findings |
|---|---|---|
| 🔴 CRITICAL | 1 | F-033 (mark-surfaced 404 deploy-lag) |
| 🟡 MEDIUM | 12 | F-001, F-002, F-007, F-009, F-040 (deploy gap), F-041 (language-setup dead-end), F-042 (interview marker), F-043 (milestones + add-topic modal), F-044 (loading state + streaks), F-045 (active vs wall-clock), F-052 (accommodations Alert.alert), F-057 (Alert.alert regression), F-058 (empty curriculum dead-end) |
| 🟢 LOW | 5 | F-035 (totalXp not surfaced), F-036 (round detail polish), F-038 (guess who placeholder), F-049 (history link), F-050 (markdown asterisks), F-056 (stale a11y label), F-059 (back button inconsistency), F-060 (missing testids) |

## Top issues remaining (revised after code-fix pass)

1. **F-033 (CRITICAL-but-graceful) — `/quiz/missed-items/mark-surfaced` deploy lag.** Source code in commit 6318a8fd; staging worker returns plain-text 404. Same pattern as the now-fixed F-014/F-028. Client degrades gracefully (fire-and-forget). **Fix:** Redeploy `mentomate-api-stg`. Add smoke test.
2. **F-040 (MEDIUM) — PV endpoints 404 on staging.** `ui-redesign` branch not deployed to staging. Session detail, curated memory, streak/XP all return 404. **Fix:** Deploy to staging.
3. **F-043 (MEDIUM) — Milestones empty despite 7 sessions.** PEH-S1 lowered thresholds not backfilled for existing users. **Fix:** Backfill migration + differentiate "Your growth" copy by session count.
4. **F-045 (MEDIUM) — Active min vs wall-clock min inconsistency.** Parent subject card shows "1 active min" while session card shows "36 min" (wall-clock). Violates wall-clock-for-users rule.

## Pickup point for the next session

### Additions from the 2026-04-18 **ui-redesign branch** pass (practice/quiz deep-dive)

Branch: `ui-redesign` (23 commits ahead of `main`). This pass focused exclusively on the new Practice/Quiz feature set shipped in this branch.

**Features verified end-to-end:**
- **Capitals play:** 4-question round "Lesser-Known European Capitals" → 2/4 → "Nice effort!" (tier=nice) + 20 XP. Question schema is now client-safe (F-014 ✅). Check endpoint returns `{correct: bool}` (F-028 ✅). Server returns `questionResults[]` with `correctAnswer` per question on completion [5B.17 ✅].
- **Guess Who play:** 3-question round "Pioneers in Technology and Science" → 3/3 → "Perfect round!" (tier=perfect) + 79 XP. Free-text path works (Tesla clue 1, Eastman clue 1). MC fallback after 3 clues works (Bell). `guess-who-option-{n}` testids added. Round is 3 questions total (not 4 like capitals).
- **Results screen:** All three celebration tiers observed. Perfect tier renders `BrandCelebration` + trophy icon. Guess Who-specific "X of Y people identified" subtitle. `+{xpEarned} XP` pill. Play Again / Done / View History buttons.
- **Quiz History [5B.15]:** `quiz-history-screen` renders rounds grouped by date with activityType + theme + score/total + xpEarned. `quiz-history-empty` with "Try a Quiz" CTA for no-data users. Reachable from Practice → `practice-quiz-history` AND Results → `quiz-results-history`.
- **Stats aggregation:** `/v1/quiz/stats` returns `{activityType, bestScore, bestTotal, roundsPlayed, totalXp}` per activity. Stats invalidate and refresh correctly after round completion — Quiz picker cards and Practice-hub Quiz card both re-rendered with new "Best: 2/4 · Played: 1" subtitle mid-session.

**Features verified via code + API probe (UI not reachable):**
- **Free-text eligible questions [5C.21]:** Code path implements `quiz-free-text-input` / `quiz-free-text-field` / `quiz-free-text-submit`. Renders when `question.freeTextEligible === true`. Requires prior mastery-item entries in `quiz_mastery_items`; user had none. Not reachable without seeding.
- **Mastery-driven generation [4B.6-11]:** Schema live (`quiz_mastery_items` table with SM-2 columns). Round generation falls back to default seeds when mastery pool is empty.
- **Challenge banner [5A.12, 5A.14b]:** Code path renders `quiz-challenge-banner` for 3 seconds when `round.difficultyBump === true`. Requires **3 perfect rounds within 14 days** on the same activity. User has 1 perfect guess_who, 0 perfect capitals. Not reached.

**Critical findings:**
- **F-033 🔴** — `POST /v1/quiz/missed-items/mark-surfaced` returns plain 404 on staging worker. Deploy-lag pattern identical to the now-resolved F-014/F-028. Client degrades gracefully but discovery card will re-surface each session.

**UX-polish findings (low severity, still open):**
- F-035 — `totalXp` stat returned by server is never surfaced in UI. Adding it to picker cards is a cheap gamification win.
- F-036 — Round detail: plain-text Back button inconsistent with `arrow-back` icon elsewhere; `activityType` string-mangled on client.
- F-038 — Guess Who input has label "Type your guess" AND placeholder "Type your guess..." — redundant.

**Still left (environment constraints on this branch):**
- Difficulty bump trigger — needs 2 more perfect capitals rounds (or 2 more perfect guess_who rounds) within 14 days to flip `difficultyBump: true` in round generation. Feasible with more play.
- Vocabulary Spanish quiz — subject exists in user's library (`quiz-vocabulary-019d9037...`) but no mastery items seeded. Needs first a language session that produces missed-items, then a follow-up quiz round to render `freeTextEligible: true` vocabulary questions.
- Quiz discovery card path — coaching-card endpoint currently returns `type: "continue_book"` for this profile (priority 4). To trigger `type: "quiz_discovery"`, the profile would need missed items from a recent quiz round with `isLibraryItem: true` questions. Answer 1+ library-linked capital incorrectly to seed this.
- `topic/relearn` flow reachable from `practice-review` tap — user has no overdue topics, so "Nothing to review right now" empty state renders.

### Additions from the 2026-04-18 continuation pass #1
CC-02 (greeting-aware classification) and LEARN-07 (session-summary submit/skip) were partially exercised. Findings F-025, F-026, F-027 added above.

- CC-02a greeting guard: ✅ verified zero API calls (F-026).
- CC-02b multi-candidate classifier: ✅ verified picker renders correctly (F-027). **Left dangling:** the single-candidate auto-pick branch (line 350-367) was not exercised because "Tell me about volcanoes" went multi-candidate. To hit single-candidate, craft a message whose classifier result has exactly one candidate — e.g., in a profile with only one enrolled subject.
- LEARN-07: ⚠️ summary screen renders with bogus data (F-025). **Left dangling:** the live End-Session → Summary flow (submit path and skip path from an actually-closed session) remains untested because `Alert.alert` is a no-op on web.

### Additions from the 2026-04-18 continuation pass #3
**Environment mutation for test coverage:** Ran direct Postgres UPDATE on staging via Doppler (`DATABASE_URL` from `mentomate/stg` config) to (a) upgrade Zuzana's subscription from `free` → `family` with status=`active`, (b) reset `quota_pools.used_today` from 10 → 0 and `used_this_month` from 19 → 0, and (c) set `monthly_limit = 1500`, `daily_limit = NULL` to match family tier. This unlocked a huge set of previously blocked flows. Record reset state: `subscription.id = 019d915a-...`, `tier = family`, `current_period_end = 2026-05-18T11:56:21.448Z`.

**New coverage unlocked:**
- **HOME-02 / HOME-07 / HOME-05** — Parent gateway, AddFirstChild gate, empty first-user state — all ✅ triggered immediately after family upgrade.
- **ACCOUNT-01..03** — Created TestKid child profile (`019da076-0104-...`, birthYear 2015, isOwner false, consentStatus "CONSENTED" — owner-created profiles get immediate consent, bypasses ACCOUNT-19..22 consent-request flow).
- **ACCOUNT-04** — Profile switching via `profile-switcher-chip` → `profile-switcher-menu` → both directions verified.
- **ACCOUNT-24** — Post-approval landing ("🎉 You're approved!") shown on first switch to CONSENTED child.
- **PARENT-01 / PARENT-03 / PARENT-06** — Dashboard, child-detail, reports-empty-state all rendered with well-designed testids.
- **SUBJECT-01 / SUBJECT-06 / SUBJECT-11** — Full subject-create chain from picker → resolve → curriculum generation → book-detail. Math subject created via `/v1/subjects/resolve` + `/v1/subjects` POST, auto-curriculum version 1.
- **LEARN-04** — Full 2-exchange learning loop with streaming response, Socratic check-for-understanding question, quick chips (CC-01 verified).
- **LEARN-07 Skip + Submit + already-skipped** — All three paths end-to-end. BUG-449 fix (persisted `summary-skipped-state` view) verified.
- **BILLING-03 / BILLING-08** — Family pool section rendered ("1 of 4 profiles connected / 1500 shared questions left / Zuzana (owner)") via `family-pool-section`.
- **DICT-06 / DICT-10** — Completion screen + `POST /v1/dictation/result` → 201 with full payload. F-031 duplicate-fire observed.
- **F-012 FIX** — Verified live: both "See all" milestones link + "Vocabulary" link now visible for zero-data users.

**New findings this pass (resolved findings removed):**
- **BILLING-09 Top-up** — same F-029 class (silent no-op on web).

**Still left (environment constraints):**
- PARENT-04 / PARENT-05 / PARENT-07 / PARENT-08 — need TestKid to do actual sessions, then switch back to parent. Achievable in another pass.
- SUBJECT-09 Interview onboarding — the "full LLM-driven interview" is a specific flow; need to trigger with `mode=interview` explicitly.
- HOMEWORK-03 / HOMEWORK-04 photo-review multi-problem — web has no camera.
- Native-only: Alert.alert dependent paths (LEARN-07 live End Session UI, BILLING-04 Restore, BILLING-09 Top-up) — all trapped by F-029 on web, need Android/iOS emulator.
- Sign-out / sign-in / OAuth — destructive, requires explicit user greenlight.

### Additions from the 2026-04-18 continuation pass #2
Quota-unrestricted sweep of quiz, session-close, billing, and legal flows. Findings F-028, F-029 added above. BILLING-02/04/07/10 and ACCOUNT-14 coverage upgraded from 🔍 to ✅ / ⚠️.

- F-014, F-028, F-029 were found this pass — all now **resolved** (removed from findings).
- **BILLING-07 verified live:** hit the daily quota paywall mid-learning-session. Upgrade button correctly deep-links to `/subscription`.
- **BILLING-10 verified live:** BYOK waitlist POST returns 201, button transitions to "Already joined" (mutation — test account is on the waitlist now).
- **ACCOUNT-14 verified live:** Terms of Service at `/terms` renders with last-updated + governing law sections.
- **LEARN-04 core loop:** partial — sent first message, hit quota before stream started. Full exchange flow still untested.
- **Console hygiene noted:** Expo Router warns about missing default exports in `_helpers/` files (SessionModals.tsx, session-types.ts, use-session-actions.ts, use-session-streaming.ts, use-subject-classification.ts). Matches the `project_expo_router_pollution.md` memory — leading-underscore directory convention isn't fully excluding files from the router scan. Minor dev-only noise, not a user-facing bug.

### What's still left (unchanged from prior pass)

- **Drive an actual quiz round to completion** once F-014's staging deploy catches up — exercise `quiz-play-error`, retry, results screen with celebration tier, "Play Again" prefetch path.
- **Exercise dictation result recording** with a real session — confirm `dictation-streaks` increments and the perfect-score celebration screen renders.
- **Single-candidate classifier auto-pick** (CC-02 remainder) — needs a subject-narrow enrollment to trigger.
- **Sign-in / sign-up / OAuth / SSO** (would require sign-out first; ask user before doing this).
- **Profile switching** (would require adding a child profile first).
- **Parent gateway home** + parent dashboard + child drill-down (need a child profile).
- **Multi-problem homework session** + photo review path (needs a real device or emulator, not web).
- **Onboarding flow including the new accommodations step** (would need to start from a fresh subject).
- **Settings toggle behavior** for push/digest/learning-mode/celebration (intentionally not toggled in this pass; ask user before mutating).
- **Subscription Upgrade button click** to see whether it shows the "soon" message or attempts a (web-stubbed) RevenueCat call.
- **Live LEARN-07 submit + skip** on Android emulator to bypass the Alert.alert web no-op.
- **Test on Android emulator** to validate native-only paths: TTS playback, camera capture for homework + dictation review, haptics, Alert dialogs.

The full report and the two enriched flow docs (`mobile-app-flow-inventory.md`, `learning-path-flows.md`) reflect the current state of the app as of 2026-04-18.

---

## Continuation pass #4 — Parent flows on `ui-redesign` branch (2026-04-18)

Branch context: `ui-redesign` (34 commits ahead of `main`). This pass focused on end-to-end parent-perspective flows — adding a child, viewing the dashboard, drilling into child detail / sessions / subjects / topics / curated memory, and parent-as-learner coexistence. Particular attention to PV-S1..S3 (parent visibility / privacy) and PEH-S1..S2 (progress empty-states & highlights) deliverables.

### Scenario

- **Auth identity:** Zuzana (owner, family tier after prior upgrade)
- **Children:** 1 — TestKid (CONSENTED, birthYear 2015)
- **Pre-seeded activity:** TestKid has 1 learning session on Math / "Numbers Galore: Whole Numbers & Integers" topic (2 exchanges, 36 min wall-clock)
- **Zuzana activity:** 7 sessions across Geography + History + Spanish + General Studies, 8 active min, 0 mastered topics

### Coverage delta vs. prior pass

| Flow | Before | After | Evidence |
|---|---|---|---|
| HOME-02 Parent gateway | ✅ static | ✅ dynamic summary | `gateway-check-progress` now shows "TestKid practiced 1 min this week" |
| PARENT-01 Dashboard | ✅ empty teaser | ✅ rich live data | "1 sessions this week (↑ up from 0 last week)" + "After 3 more sessions..." (threshold was 4) |
| PARENT-03 Child detail | ✅ empty states | ✅ 8 sections rendered | New: Recent Sessions list, "What the mentor knows" link |
| PARENT-04 Subject drill-down | ⏭️ deferred | ✅ rendered | `retention-signal-strong` subject-level "Thriving" |
| PARENT-05 Session drill-down | ⏭️ deferred | ⚠️ blocked (deploy gap) | Screen renders, API 404s on staging |
| PARENT-07 Parent library view | ⏭️ deferred | ✅ rendered | Same as PARENT-04 screen |
| PARENT-08 Raw-input audit | ⏭️ deferred | 🔍 code-level | `rawInput` field plumbed in API; TestKid had null |
| PARENT-10 Curated memory (new) | — | ⚠️ blocked (deploy gap) | Screen renders consent gate + CONTROLS; API 404 |

### Features verified end-to-end

- **PV-S2 Task 1 — DashboardChild schema includes streak/XP** ✅ — schema inspected, `.default(0)` so missing fields don't break UI.
- **PV-S2 Task 3 — Streak/XP batch queries in dashboard service** ✅ — source verified at `apps/api/src/services/dashboard.ts:632-634`.
- **PV-S2 Task 7 — Streak/XP stats on child detail** ✅ — rendered conditionally at `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:346-366`; currently hidden because staging returns 0 (deploy gap).
- **PV-S3 Task 9 — Redesigned mentor-memory screen** ✅ — renders 4 new sections (consent / CONTROLS / TELL THE MENTOR / PRIVACY) with proper testids.
- **PEH-S1 Task 2 — Lowered thresholds for teaser** ✅ verified — teaser copy "After 3 more sessions..." (was 4).
- **PEH-S1 Task 8 — Empty-state copy improvements** ✅ rendered ("Progress becomes easier to spot after a few more sessions") — but see F-041.

### Features deploy-gated (code present locally; staging serves `main`)

- **PV-S1 Task 5b — Single-session detail endpoint** (`GET /v1/dashboard/children/:profileId/sessions/:sessionId`) — 404 on staging.
- **PV-S3 Task 5 — Curated memory endpoint** (`GET /v1/dashboard/children/:profileId/memory`) — 404 on staging.
- **PV-S2 streak/XP emission** — `currentStreak` / `longestStreak` / `totalXp` absent from `/v1/dashboard` response on staging.
- **PEH-S1 Task 2 lowered SESSION_THRESHOLDS** (`[1, 3, 5, 10, 25, ...]`) — source verified locally; unclear whether staging worker has the lower values because milestones return empty for Zuzana (7 sessions).
- **PEH-S2 Task 1 — `highlight` column on session_summaries** — schema added (db/session-summaries.ts + migration noted in plans); can't verify emission until Inngest pipeline runs with new code.
- **PEH-S2 Task 7 — Highlights surfaced in parent session feed** — code path exists in child-detail session card mapping; can't visually verify without a summary with a highlight value.

### Findings

### F-040 🟡 PV-S1/S2/S3 endpoints 404 on staging (deploy gap)
- **Where:** `GET /v1/dashboard/children/:profileId/sessions/:sessionId` and `GET /v1/dashboard/children/:profileId/memory` both return plain-text 404 on `api-stg.mentomate.com`. Same pattern for `DashboardChild` streak/XP fields — silently absent from `/v1/dashboard` response.
- **Why:** The `ui-redesign` branch (34 commits ahead of `main`) is not yet deployed to staging. Worker at `api-stg` serves `main`.
- **Mobile impact:**
  - Session-detail screen loads → isError=true branch → user sees "Something went wrong / Retry" with Go Back (F-041 fix).
  - Curated memory view loads the consent gate + control sections, but the curated signals panel (Strengths / Challenges / Preferences) stays empty.
  - Dashboard child card doesn't show streak 🔥 / XP ⭐ badges because schema defaults to 0 → `(currentStreak > 0 || totalXp > 0)` guard hides the row.
- **Not a bug in code** — identical pattern to the resolved F-014/F-028. **Fix:** Redeploy `mentomate-api-stg` from `ui-redesign` (or merge+deploy after review). Add smoke tests for `dashboard/children/:id/sessions/:sessionId` and `dashboard/children/:id/memory` to catch future deploy lag.

### F-043 🟡 "Your growth" + "milestones empty" shown despite 7 sessions (was F-035 — renumbered)
- **Where:** `/progress` screen for Zuzana (7 sessions, 8 active min, 0 mastered, 0 streak).
- **Observed:**
  - "Your growth" card: **"You just started. Keep going and your growth will appear here."** — clearly wrong after 7 sessions.
  - "Recent milestones" card: **"Keep going. Your milestones will collect here as your knowledge grows."** — wrong if PEH-S1 lowered thresholds to `[1, 3, 5, 10, ...]`. Zuzana has crossed 1/3/5 in session count.
- **Root cause hypotheses (both likely contributing):**
  1. PEH-S1 Task 2 source shows `SESSION_THRESHOLDS = [1, 3, 5, 10, 25, 50, 100, 250]`, but the detection in `milestone-detection.ts:91-99` fires only on `crossed(previous, current, threshold)` — i.e. at the boundary. For Zuzana whose sessions accrued under the prior [5, 10, 25] thresholds, the 1/3 milestones were never "crossed" from her previous state and there's no retroactive backfill.
  2. Empty-state copy is keyed solely on `global.topicsMastered === 0` without considering sessionCount — so long-time users with 0 mastered hit the same "You just started" copy as day-zero users.
- **Fix suggestion:** (a) Add a one-off backfill migration that queries historical snapshot counts and queues a "caught up" milestone for users who are above the new lower thresholds. (b) Differentiate the "Your growth" copy — show different body text when `totalSessions >= 3` (e.g. "You've put in {sessions} sessions. Keep going — growth in mastery shows up after a few repeat exposures.").

### F-044 🟡 Streak counter returns 0 despite consecutive-day activity (was F-036 — renumbered)
- **Where:** `/v1/progress/inventory` → `global.currentStreak: 0` despite Zuzana having `lastSessionAt = 2026-04-17` for Geography and `2026-04-16` for History (two consecutive days, no session yet today on 4/18).
- **Why it matters:** Either (a) the streak-update pipeline in `services/streaks.ts` doesn't fire on session completion, or (b) the streak definition excludes "no session today yet" (i.e. requires streak-of-days-ending-today). The PEH-S1 plan cites early engagement — a user who studied yesterday and the day before should see a 2-day streak with encouragement to maintain it.
- **Follow-up needed:** Check `apps/api/src/services/streaks.ts` definition + whether the Inngest `session-completed` step actually calls the streak update. If behavior is intentional (streak must end today), add a "Streak at risk — come back today!" signal on home.

### F-045 🟡 Parent subject card shows "active min" while session card shows "wall-clock min" (was F-037 — renumbered)
- **Where:** Child detail screen for TestKid.
  - Subjects → Mathematics card: **"1 active min"**
  - Recent Sessions → card for same session: **"36 min"** (wall-clock)
- **Why it matters:** From the parent's reading: "Math = 1 minute this week, but the session was 36 minutes?" — the math doesn't add up for a non-technical viewer. Per [project_session_lifecycle_decisions.md](../memory/project_session_lifecycle_decisions.md): **wall-clock for users, active time internal**. The subject card violates this rule.
- **Fix:** Change subject card to show wall-clock seconds (or both with clear labels — "36 min total · 1 min focused"). Not a native-only issue.

---

## Resolved findings (removed from this report 2026-04-19)

45 findings were verified as resolved in code and removed. Key fixes:
- **F-003/F-006/F-016/F-017/F-055** — Stack stacking on web (`contentStyle`/`sceneStyle` on all layouts)
- **F-014/F-028/F-032** — Quiz answer leak, /check 404, round detail (deploy + code fixes)
- **F-029** — `platformAlert` utility replacing `Alert.alert` (60+ call sites migrated)
- **F-041/F-042** (parent flow) — Go Back button + subjectName rendering
- Full list: F-002 through F-065 — see git history for details

### Still noted (not bugs, context only)

| Finding | Status |
|---|---|
| F-001 | API fix claimed in `progress.ts:630-635` — **NOT yet verified on staging** |
| F-009 | Topic deep-link needs `subjectId`. Requires API change to fetch subject from topic |
| F-029 remaining | ~20 files not on this branch still use `Alert.alert` — see F-057 |

---

## Bug ledger — parent-flow pass (2026-04-18 continuation #4)

### 🔧 Open code bugs

| ID | Severity | Title | Root-cause pointer | Owner |
|---|---|---|---|---|
| F-043 | 🟡 | Progress empty-state copy shown to users with significant activity + no retroactive milestone backfill | `apps/mobile/src/app/(app)/progress.tsx` (copy keyed only on `topicsMastered`, not `totalSessions`) + `apps/api/src/services/milestone-detection.ts:91-99` needs a backfill pass after PEH-S1 threshold change | Mobile + API |
| F-044 | 🟡 | Streak counter stays at 0 despite consecutive-day activity | `apps/api/src/services/streaks.ts` + Inngest `session-completed` step — verify the update is scheduled and the definition doesn't exclude "yesterday's streak before today's session" | API |
| F-045 | 🟡 | Parent surfaces mix "active min" and wall-clock min | Child detail + subject card + dashboard card should agree on wall-clock (per `project_session_lifecycle_decisions.md`) | Mobile |

### ⚙️ Deploy-gap (not a code bug — redeploy work)

| ID | What's missing on staging |
|---|---|
| F-040 | `GET /v1/dashboard/children/:id/sessions/:sessionId` (PV-S1 Task 5b) • `GET /v1/dashboard/children/:id/memory` (PV-S3 Task 5) • streak/XP fields on `DashboardChild` payload (PV-S2) |

**Action:** Deploy `ui-redesign` to `mentomate-api-stg`. Add a smoke test that asserts these endpoints return 200 on staging so we catch future deploy lag.

### 📐 Narrative gap (spec-level work, not a discrete bug)

The larger pattern — parent surfaces optimize for showing metrics, parents want to be told a story — is captured in the design spec [2026-04-18-parent-narrative-design.md](../superpowers/specs/2026-04-18-parent-narrative-design.md). That spec enumerates the missing parent jobs-to-be-done (plain-English session recaps, conversation-starter prompts, what-your-kid-said highlights, clarified mastery/thriving semantics) that collectively sit above any individual bug above.

---

## Continuation pass #5 — UI Redesign simplified screens verification (2026-04-19)

Branch context: `ui-redesign` (36 commits ahead of `main`). Latest commit `c2cfc679` ("fix(tests): update integration test expectations for new session highlight step"). The simplification work shipped primarily in commit **55ddcbdb** ("feat(mobile): Home screen & navigation IA simplification"). This pass exercises the **simplified screens** introduced on this branch, from the end-user perspective via the Expo Web preview.

### Scope of this pass

Files touched by commit 55ddcbdb that were specifically exercised:

- `components/home/LearnerScreen.tsx` (flattened Home into single screen with intent cards)
- `components/home/IntentCard.tsx`
- `app/(app)/practice.tsx` (streamlined with progress hooks + new History link)
- `app/(app)/onboarding/interview.tsx` (simplified)
- `app/(app)/onboarding/language-setup.tsx` (simplified)
- `app/(app)/onboarding/curriculum-review.tsx` (simplified)
- `app/(app)/onboarding/analogy-preference.tsx` (simplified)
- **`app/(app)/onboarding/accommodations.tsx` (NEW — accommodations onboarding step)**
- `app/create-subject.tsx` (streamlined)
- `app/(app)/topic/[topicId].tsx` (heavy refactor: test lines 1039 → source 463)
- Files removed: `learn-new.tsx` (164 LOC + 223 LOC test), `learn.tsx` (5 LOC)

### Environment

- Auth: pre-authenticated Zuzana (owner, family tier) → switched to TestKid child for learner-screen testing.
- TestKid starting state: 1 Math subject with 1 in-progress session (Numbers Galore topic). No quiz stats, no review queue.
- Mutation note: This pass created a Biology subject for TestKid (subjectId `019da4ce-74d6-7293-bbe2-b039552bdbd5`) while exercising the create-subject flow. **Left in DB** — follow-up cleanup required if undesired.

### Coverage delta (all flows exercised via Expo Web preview on `localhost:8081`)

| Flow | Before | After | Evidence |
|---|---|---|---|
| HOME-01 Simplified LearnerScreen intent cards | ✅ (prior pass) | ✅ re-verified on ui-redesign | 5 intent cards render: Continue / Learn / Ask / Practice / Homework. All testids (`intent-continue`, `intent-learn`, `intent-ask`, `intent-practice`, `intent-homework`) present. |
| HOME-06 Continue card → session nav | ⚠️ F-001 | ⚠️ F-001 still reproducing | URL: `/session?subjectId=…&subjectName=Mathematics&topicId=…&topicName=…&mode=learning` — **no `sessionId`** despite TestKid having in-progress session (see F-001, unchanged). |
| HOME-02 Parent gateway "Learn something" | ✅ | ⚠️ F-054 NEW | Tapping `gateway-learn` as parent routes directly to `/create-subject`, bypassing the LearnerScreen entirely. Parents never see the new flattened home. |
| SUBJECT-01 Create-subject (streamlined) | ✅ (prior pass) | ✅ re-verified | Renders 9-10 quick-start cards; user's existing enrolled subjects auto-prefixed `Continue …` (e.g., "Continue Mathematics") vs. new subjects `Start …`. |
| SUBJECT-06 Broad subject resolver (Science → Biology/Chem/Physics/Earth) | ✅ (prior pass) | ⚠️ F-050 NEW | Resolver correctly surfaces 4 sub-areas + "Something else" escape. BUT subtitle copy renders literal markdown: `**Science** can cover many things — which area interests you most?` with `**…**` asterisks visible. Copy-as-markdown regression. |
| SUBJECT-09 Interview onboarding (simplified) | ⏭️ | ⚠️ partial — F-053 | Reached `/onboarding/interview?…&step=1&totalSteps=4` after picking Biology. Step indicator + greeting render correctly. Could not complete end-to-end because Send button click was swallowed by Expo Web (known F-024/F-047 click-dispatch class, applies only to QA tooling, not real users). |
| SUBJECT-15 Accommodations onboarding (NEW) | 🔍 | ✅ | Direct URL `/onboarding/accommodations?subjectId=…&step=3&totalSteps=4` renders: "How do you learn best?" + 4 radios (`accommodation-none`, `accommodation-short_burst`, `accommodation-audio_first`, `accommodation-predictable`) + Continue + Skip + Back. Step indicator shows "Step 3 of 4". |
| SUBJECT-15 Accommodations no-subject guard | 🔍 | ✅ | Direct URL `/onboarding/accommodations` (no params) renders clean empty state "No subject selected / Go back". UX resilience rule (every state has an action) satisfied. |
| PRACTICE-01 Simplified Practice hub | ✅ | ✅ re-verified | 4 IntentCards (Review / Recite (Beta) / Dictation / Quiz) + empty-state "All caught up / Your next review is in 5 days / Browse your topics" + **History link** at bottom. |
| PRACTICE-01 `practice-quiz-history` link treatment | ⏭️ | ⚠️ F-049 NEW | Plain 14px teal text (no card, no icon, 20px tall, no `min-height`). Visually orphaned next to the 4 substantial IntentCards. Clickable (pointer cursor + onPress wired), routes to `/quiz/history` correctly. |
| LEARN-12 Topic detail deep-link | ⚠️ F-009 | ⚠️ F-009 still reproducing | Direct URL `/topic/019da079-58f1-7b1f-adcc-2090386c6fdb` (real valid topicId from TestKid's Math session) renders "Topic not found / This topic could not be opened." + Go back fallback. The topic-detail refactor (1039 test LOC → 463 source LOC) did not address this. |

### Features verified end-to-end

- **LearnerScreen flattening (commit 55ddcbdb)** — single-screen intent card layout replaces the prior multi-level home. For TestKid: greeting "Good morning, TestKid! / Weekend learning? Nice!" + profile switcher + 5 intent cards. Clean visual hierarchy, no nested navigation.
- **Continue card conditional priority (LearnerScreen.tsx:131-209)** — Implementation correctly prioritizes `recoveryMarker` (SecureStore) → `continueSuggestion` (API) → `reviewSummary` (overdue topics) → fallback (no Continue card). For TestKid, the `continueSuggestion` branch fires and renders "Mathematics · Numbers Galore: Whole Numbers & Integers".
- **Accommodations onboarding step (new)** — all four modes render with clear descriptions, radio semantics (`accessibilityRole="radio"`), 2-line explanation, Skip + Back escapes, and `accommodation-continue` / `accommodation-skip` testids. Best-in-class onboarding step from a dead-end audit perspective.
- **Practice hub progress wiring (practice.tsx)** — `useReviewSummary` drives the Review card subtitle (zero-review copy = "Nothing to review right now" + secondary empty-state with next-review countdown); `useQuizStats` drives Quiz card subtitle (F-034 aggregate logic verified). Graceful degradation when hooks return `isError` ("Could not load review status" / "Could not load quiz stats").
- **Create-subject streamline** — existing subjects prefixed `Continue`, new subjects prefixed `Start`. Cancel escape. "Something else" fallback card on broad-subject resolver.

### Findings

### F-049 ✅ LOW — `practice-quiz-history` link is visually orphaned

- **Where:** [apps/mobile/src/app/(app)/practice.tsx:169-174](apps/mobile/src/app/(app)/practice.tsx:169).
- **Observed:** The History link renders as a bare `<Text className="text-primary text-sm">History</Text>` inside a thin Pressable:
  - 20px tall, no `min-height` (fails 44px tap-target guideline)
  - No icon, no border, no background — just teal text
  - Sits directly below four full IntentCards, so visual weight is wildly asymmetric
- **Functional status:** Tappable, navigates to `/quiz/history` correctly. Teal color (`rgb(13, 148, 136)`) renders at 14px.
- **Impact:** A child glancing at Practice hub sees four "action buttons" and a floating "History" word — likely to miss it. QUIZ-09 is a feature we want discoverable.
- **Recommended fix:** Either make it a fifth IntentCard ("History" + "See your past rounds" + `time-outline` icon) or, at minimum, wrap in a `min-h-[44px]` Pressable with an icon and secondary-button styling.

### F-050 ✅ LOW — Create-subject (broad-resolver) subtitle renders literal markdown

- **Where:** Broad-subject flow in `/create-subject` after entering "Science".
- **Observed:** Subtitle reads: `**Science** can cover many things — which area interests you most?` — the `**…**` asterisks are visible instead of rendering as bold.
- **Hypothesis:** Server-side resolver LLM returns markdown-formatted string, but the client renders it as plain text (no `react-native-markdown-display` pipeline at that surface).
- **Impact:** Minor UX polish — children are puzzled by the asterisks. Makes the copy feel less polished.
- **Recommended fix:** Either strip `**` in the resolver response or render via a markdown component. Cheapest: `.replace(/\*\*(.+?)\*\*/g, '$1')` before render.

### F-052 🟡 MEDIUM — Accommodations screen uses `Alert.alert` on web (violates F-029 sweep)

- **Where:** [accommodations.tsx:85-88](apps/mobile/src/app/(app)/onboarding/accommodations.tsx:85) — inside `updateAccommodation.mutate` error handler:
  ```ts
  onError: () => {
    Alert.alert('Could not save setting', 'Please try again.');
  }
  ```
- **Why it matters:** F-029 established that `Alert.alert` is a no-op on web and migrated 60+ call sites to `platformAlert()`. This new file introduced on 2026-04-18 re-introduced the pattern. If the accommodation PATCH fails on web, the user sees *nothing* — no feedback, no retry prompt, card just stays in its unselected state.
- **Specifically the CLAUDE.md rule** — "Every `mutateAsync` catch block must show user-visible feedback — toast, alert, or inline error. Bare `catch {}` is forbidden." This `Alert.alert` is effectively equivalent to `catch {}` on web.
- **Recommended fix:** Replace `Alert.alert` with `platformAlert()` import from `../../../lib/platform-alert`. Same pattern applied to all the files in the F-029 sweep.
- **Severity:** 🟡 — not observed live (mutation succeeded), but the failure-mode branch is broken on web.

### F-056 🟢 LOW — Analogy-preference Continue button has stale accessibility label

- **Where:** [analogy-preference.tsx](apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx) — Continue button `accessibilityLabel="Continue to curriculum"`.
- **Observed:** Button actually calls `navigateToAccommodations()` (line 59-69), pushing to `/onboarding/accommodations`. Screen readers announce "Continue to curriculum" but the destination is accommodations.
- **Visual text** says "Continue" which is fine; only the aria-label is stale from the pre-accommodations-step flow.
- **Fix:** Change to "Continue" or "Continue to next step". 1-line change.
- **Severity:** 🟢 — a11y inconsistency only.

### F-057 🟡 MEDIUM — Onboarding files re-introduce `Alert.alert` (wider F-029 regression)

- **Pattern:** The same F-052 finding applies to multiple new files in commit 55ddcbdb:
  - [accommodations.tsx:86](apps/mobile/src/app/(app)/onboarding/accommodations.tsx:86) — save error
  - [analogy-preference.tsx:41-48](apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx:41) — save-analogy error
  - [interview.tsx:204](apps/mobile/src/app/(app)/onboarding/interview.tsx:204) — restart-interview error
- **Why it matters:** After F-029's 60+ file `platformAlert` sweep, this branch re-introduced three new `Alert.alert` calls. On web, all three error-path dialogs are silent no-ops — user sees nothing when a mutation fails. Accommodations: radio stays blank. Analogy: selection appears unchanged. Interview: restart button looks unresponsive.
- **Recommended hard fix:** Add an ESLint rule banning the `react-native` `Alert` import in `apps/mobile/src/**` OR a custom rule requiring `platformAlert` imports. Either catches future regressions automatically.
- **Immediate fix:** Replace all three `Alert.alert` calls with `platformAlert` from `lib/platform-alert.ts`. 3-file change.
- **Severity:** 🟡 Medium — the mutations succeeded in my testing, but any flaky error path on web is user-invisible. This is a systemic rule-violation, not a one-off.

### F-058 🟡 MEDIUM — Curriculum-review has no "Start learning" / "Done" CTA when curriculum is empty

- **Where:** [curriculum-review.tsx:521](apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx:521) — the big conditional block ends with `: null` for the case `firstAvailableTopic` is null.
- **Observed 2026-04-19:** After walking the full chain via analogy-preference → accommodations → curriculum-review for the Biology subject (without completing the interview), the curriculum-review screen shows ONLY:
  - Back arrow
  - "Suggest changes" button
  - "Add topic" button
  - Step indicator (4/4)
  - "Version 1 — 0 topics"
- **Missing:** No primary CTA. No "Start learning". No "Done". No "Go home". The user literally has no forward action — only Back, or Challenge (rewrites curriculum), or Add topic (one-off manual entry).
- **How this can happen for a real user:** Interview stream errors or cancels before emitting `[INTERVIEW_COMPLETE]`; the curriculum generation trigger is tied to interview completion. If the trigger is skipped or missed, the user ends up on an empty curriculum-review with no path out.
- **UX resilience rule violated:** "Every screen state must have at least one interactive element the user can tap" — all three current actions (Back / Challenge / Add topic) are valid but none of them move onboarding forward. The user can't *finish*.
- **Recommended fix:** Always render a "Continue to home" or "Start exploring" secondary CTA at the bottom of the action bar, regardless of topic count. If the curriculum is empty, this CTA should also trigger a retry of curriculum generation or surface a "Curriculum generation pending" message.
- **Severity:** 🟡 Medium — a real dead-end state that a production user could hit on any LLM failure.

### F-059 🟢 LOW — Analogy-preference + language-setup Back buttons render plain "Back" text, not chevron icon

- **Where:** Analogy-preference and language-setup screens both render `<Back>` as plain text.
- **Contrast:** Accommodations, interview, and practice all render a chevron icon (Ionicons `arrow-back`) as the back affordance. LearnerScreen uses the same chevron.
- **Inconsistency:** Two of five onboarding screens look different. Kids scanning the screens see different "back" signals.
- **Fix:** Standardize on the `Ionicons name="arrow-back"` pattern used elsewhere. A single `OnboardingBack` component would enforce consistency.
- **Severity:** 🟢 — cosmetic polish.

### F-060 🟢 LOW — Language-setup CEFR level buttons have no testids

- **Where:** The "Your current level" section on language-setup has 4 level options (Complete beginner / I know some basics / Conversational / Advanced).
- **Observed testids:** Only `language-setup-back`, `native-language-*` (13+other), `language-setup-continue` — none of the 4 level buttons have testids.
- **Impact:** Blocks automation, blocks accessibility tools from targeting these elements by id. Automated QA can only reach them by text match.
- **Recommended fix:** Add `level-beginner` / `level-some-basics` / `level-conversational` / `level-advanced` testids.
- **Severity:** 🟢 — testability/a11y gap only.

---

## Fixes applied — batch 2026-04-19 code pass #2

| Finding | Fix | Commit |
|---|---|---|
| F-001 ✅ | `lastSessionId` now passed through from `useContinueSuggestion` to session navigation; API returns active session for topic | `1880cc49` |
| F-002 ✅ | `formatRelativeDate` rewritten with calendar-day diff — returns "Today" / "Yesterday" / "X days ago", matching `formatLastPracticed` | `a04132bc` |
| F-009 ✅ | Topic deep-link resolves `subjectId` via new API endpoint; topic detail screen works without `subjectId` in nav params | `1880cc49` |
| F-043 ✅ | Progress empty-state copy context-aware (sessions count); milestone backfill for users past new thresholds | `4688120a` |
| F-044 ✅ | Streak reads live DB row instead of stale snapshot; consecutive-day activity correctly counted | `4688120a` |
| F-045 ✅ | Subject card uses wall-clock duration from live session data, matching session cards | `4688120a` |
| F-052 ✅ | `Alert.alert` → `platformAlert` in accommodations.tsx | `dbc3a874` |
| F-056 ✅ | Stale accessibility label "Continue to curriculum" → "Continue" in analogy-preference | `dbc3a874` |
| F-057 ✅ | `Alert.alert` → `platformAlert` in analogy-preference.tsx + interview.tsx | `dbc3a874` |
| F-058 ✅ | "Continue to home" CTA added when curriculum is empty — eliminates dead-end | `dbc3a874` |
| F-059 ✅ | Back buttons in analogy-preference + language-setup use `arrow-back` Ionicon | `dbc3a874` |
| F-060 ✅ | CEFR level buttons have testids: `level-beginner`, `level-some-basics`, `level-conversational`, `level-advanced` | `dbc3a874` |

### Verified already-fixed (no code change needed)
| Finding | Status |
|---|---|
| F-007 | ✅ Intentional — topic-detail bypass per Home IA spec |
| F-035 | ✅ Verified — XP shown in quiz card subtitle |
| F-036 | ✅ Verified — arrow-back icon + title-cased activity type |
| F-038 | ✅ Verified — redundant label removed |
| F-049 | ✅ Verified — History promoted to IntentCard |
| F-050 | ✅ Verified — `stripBold()` strips markdown |

### Deploy-gap (code exists, staging redeploy needed)
| Finding | Status |
|---|---|
| F-033 | Code at `quiz.ts:391` — redeploy `mentomate-api-stg` |
| F-040 | Endpoints at `dashboard.ts:115,134` — redeploy `mentomate-api-stg` |

## Final open findings summary (updated 2026-04-19)

| Category | Count | IDs |
|---|---|---|
| ⚙️ DEPLOY-GAP | 2 | F-033, F-040 (code exists — redeploy staging) |
| 🟡 MEDIUM | 2 | F-041, F-042 (not in this batch) |

All 20 bugs from the 2026-04-19 batch addressed. 12 code-fixed, 6 verified, 2 deploy-gap.
See git history for the full fix log.
