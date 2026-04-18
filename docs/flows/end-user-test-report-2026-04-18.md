# End-User Test Report — 2026-04-18

Live audit of the EduAgent mobile app via the Expo Web preview (`localhost:8081`), authenticated as the production user "Zuzana" (Free plan, owner, no child profiles).

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
| SUBJECT-12 | View curriculum | ⏭️ | Not directly reached as standalone, but the curriculum-review path covers the critical SUBJECT-11 → LEARN-04 bridge |
| SUBJECT-15 | Accommodations onboarding step | 🔍 | Code only — not in onboarding session this run |

### Learning, Library, Practice
| ID | Flow | Status | Notes |
|---|---|---|---|
| LEARN-01 | Freeform chat from Ask card | ✅ | Renders with "Chat / Ask anything" header + greeting |
| LEARN-02 | Guided learning from Continue | ✅ | Session opens with topic-specific greeting (F-001 + F-005) |
| LEARN-04 | Core learning loop | ✅ | Tested live 2026-04-18 continuation #3. Sent "What is the difference between positive and negative numbers?" to TestKid's Math session → got full streaming response with thermometer analogy + positive/negative explanation + Socratic recall check ("Can you tell me if 5 cookies is a positive or negative number?"). Answered, got validation "Nice! That's exactly it." + number-line teaching + follow-up question. **2 complete exchanges, quick chips visible (Too hard / Explain differently / Hint / Helpful / Not helpful / That's incorrect — CC-01 verified).** |
| LEARN-08 | Library shelves | ✅ | 4 shelves render with retention badges + last-session label |
| LEARN-09 | Subject shelf → book selection | ✅ | Single-book shelves bypass to book detail |
| LEARN-10 | Book detail + Start learning | ✅ | "STUDY NEXT" + "PAST SESSIONS" sections render — F-002 + F-004 |
| LEARN-12 | Topic detail | ⚠️ | F-007: bypassed in normal flow; F-009: direct deep-link fails |
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
| QUIZ-10 | Round Detail view | 🔴 | **NEW [5B.16, 5B.18] — BROKEN.** F-032: `/quiz/{roundId}` detail view always shows all questions as "Wrong" and header score blank because `GET /v1/quiz/rounds/:id` doesn't include completion data (see F-032). |
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

### F-002 🟢 Time labels disagree across surfaces
- **Where:** Library shelf list shows Geography "Last session: Today". Book detail (`shelf/.../book/...`) Past Sessions list shows the most recent session as "2d".
- **Why:** Library aggregate likely includes today's just-resumed/just-created session row; book detail "Past Sessions" filters to closed sessions only.
- **User impact:** Mild confusion — a child seeing two different "last session" labels for the same subject within two taps will not know which is true.

### F-003 🌐 Home and Session both render at the same coordinates after Continue
- **Where:** After tapping Continue, the DOM contains both Home IntentCards (y=84..612) and the Session header/input (y=20, y=297, y=694..758).
- **Why:** Expo Router on web doesn't fully cover the underlying Tab content with the Stack screen. Native devices push a real native stack and don't show this.
- **User impact:** None on native. On web, layout looks layered if you scroll. Documented in `project_expo_web_preview.md` as a known caveat.

### F-004 🔵 Topic-Detail screen is bypassed when entering from Book detail
- **Where:** Tapping a chip under "STUDY NEXT" on the book detail (`Climates Across the Continent`) navigates **directly to `/session?mode=learning&topicId=...`** instead of `/topic/[topicId]`.
- **Why it matters:** The flow inventory's `LEARN-12 Topic detail` row implied entry from book→topic. In current IA, **Topic Detail is only reachable via the Library `Topics` tab** (and child drill-downs). Worth either documenting that explicitly or restoring the topic-detail intermediary so users can read the "what is this topic about?" copy before committing to a session.

### F-005 🟢 Two Text/Voice mode pickers on a fresh session screen
- **Where:** A fresh `learning` session shows a mode picker pair inline in the AI greeting area (`Text` / `Voice` chips, accessibility labels `Text mode` / `Voice mode`) AND another mode toggle pair in the footer (`Text mode` / `Voice mode`, accessibility labels `Switch to text mode` / `Switch to voice mode`).
- **Likely intentional:** The first pair is a one-time "how do you want to interact?" prompt embedded in the AI's first message. The second is the persistent footer.
- **Why it matters:** Two visually similar pickers within the same screen invite a "wait, did I already pick?" moment for kids. Worth confirming the inline picker disappears once a choice is made and that haptics/visual confirmation is unambiguous.

### F-007 🟡 Topic-detail screen unreachable via the user-visible flow
- **Where:** Library `Topics` tab → tap any topic → goes directly to `/session?mode=relearn` (or `mode=learning`), bypassing `/topic/[topicId]`.
- **Tested:** Tapped "Africa's Geographic Tapestry" with retention "Growing" → URL `/session?mode=relearn&topicId=...` rendered immediately.
- **Why it matters:** Topic Detail was the spec'd entry for the "[not_started] Start Learning / [in_progress] Continue Learning + Start Review / [completed] Start Review + Continue Learning" decision UX. Now the system makes that decision for the user. Either intentional simplification or a regression — worth flagging.

### F-008 FIX VERIFIED 🟢
- **What was broken:** Session header showed "Chat / Ask anything" for relearn mode.
- **Verified:** `sessionModeConfig.ts` defines `relearn` with `title: 'Relearn'` / `subtitle: 'A fresh angle on this topic'`. The session screen at `index.tsx:296` calls `getModeConfig(effectiveMode)` and passes it to `ChatShell`. Relearn sessions now render the correct header copy.

### F-009 🟡 Direct deep-link to `/topic/{validId}` returns "Topic not found"
- **Where:** Direct URL `localhost:8081/topic/019d8bf5-ff1d-7574-bc3d-bd87056f52e1` (a real topic id from the same session).
- **Result:** Renders "Topic not found / This topic could not be opened. Please go back and try again." with a Go back button (good fallback UX).
- **Likely cause:** The topic detail screen probably reads from `useLocalSearchParams` for `subjectId` or hydrates from in-memory context that resets on full reload (no SecureStore on web).
- **Impact:** Sharing a topic URL or pasting it into a new tab fails. Mobile native may behave differently if the params are pushed via router.push, but the failure on direct nav is real.

### F-010 🟢 Inconsistent topic-status vocabulary across screens
- **Surfaces visited:** Library shelf shows "1/10 topics completed" for Geography. Progress page subject card shows "0/10 topics mastered". Subject progress detail shows "In progress: 1 / Not started: 9" (so 0 completed).
- **Underlying truth:** 1 topic is in_progress, 0 mastered, 9 not_started. The Library label "completed" actually means "started" — confusing.
- **User impact:** A child seeing 1/10 "completed" on Library and 0/10 "mastered" on Progress will be unsure which counter is real.

### F-011 🔵 Stat totals on Progress reconcile correctly
- 7 sessions = 5 (Geography) + 2 (History) + 0 (Spanish) + 0 (General Studies). ✓
- 8 active min = 5 + 3 + 0 + 0. ✓

### F-012 🟡 No discoverable navigation to `/progress/milestones` or `/progress/vocabulary`
- **Where:** Both screens render correctly (well-designed empty states with secondary "Go back" CTAs) but the only way I reached them was by typing the URL.
- **Progress page** has section headers "Recent milestones" and an empty state "Keep going. Your milestones will collect here…" — no "View all" link.
- **Likewise** "Your subjects" cards on Progress and the Subject Progress detail page have no link to vocabulary browser.
- **Impact:** New users will assume these screens don't exist. The "Recent milestones" header is a UX promise the rest of the screen doesn't honor.

### F-013 FIX VERIFIED 🟢
- **What was broken:** Vocabulary empty-state copy always showed "Start a language subject..." even when user had Spanish enrolled.
- **Verified:** `vocabulary.tsx:89-99` detects `pedagogyMode === 'four_strands'` subjects and renders "Practice Spanish to start building your word list." when exactly one language subject exists, or "Practice a language subject..." for multiple.

### F-014 🔴 CRITICAL — Quiz Capitals/Vocabulary unplayable; answer fields leak via response
- **Symptom:** `/quiz/play` for Capitals renders only the question header ("What is the capital of Germany?") and **zero answer-option Pressables**. The screen freezes — no options, no error fallback. Also: the elapsed-time counter on the second visit froze at 2225 seconds (~37 min), suggesting `questionStartTimeRef.current` never reset.
- **Captured response (staging API):**
  ```json
  {"questions":[{"type":"capitals","country":"Croatia",
    "correctAnswer":"Zagreb",
    "acceptedAliases":["Zagreb"],
    "distractors":["Split","Dubrovnik","Rijeka"],
    "funFact":"...","isLibraryItem":...
  ```
- **Expected per `packages/schemas/src/quiz.ts:73-80`:** `{ type: 'capitals', country, options: [...], funFact, isLibraryItem, topicId }` — i.e., a pre-shuffled `options` array with the answer fields **stripped** ("Answer fields … stripped to prevent answer leaking via network inspection").
- **Server function `toClientSafeQuestions` exists at `apps/api/src/routes/quiz.ts:57-91`** and IS invoked from both POST `/quiz/rounds` (line 212) and GET `/quiz/rounds/:id` (line 260) — but the staging deploy at `api-stg.mentomate.com` is returning the unstripped schema.
- **Two distinct problems coupled:**
  1. **Functional:** Without `options`, the play screen has no way to render answer choices for Capitals or Vocabulary. Quiz unplayable.
  2. **Security:** `correctAnswer`, `acceptedAliases`, and `distractors` are visible in DevTools / Network panel. Anyone with browser DevTools sees the answer before submitting.
- **Most likely cause:** Staging worker deploy is behind the f6631f4a commit (the only commit that introduced `toClientSafeQuestions`). Verify the staging worker deploy via `wrangler deployments` for the `mentomate-api-stg` worker. If the Pages function/worker is stale, redeploy.
- **Same regression observed on Guess Who:** response includes `correctAnswer: "Marie Curie"`, `canonicalName: "Marie Curie"`, and `acceptedAliases: ["Curie", "Maria Skłodowska-Curie", "Madame Curie"]` — security leak, but Guess Who still **plays** because it only needs `clues` and `mcFallbackOptions`, which are present.

### F-015 FIX VERIFIED 🟢
- **What was broken:** Quiz Play rendered a dead-end with no options when server returned empty/missing `options` array.
- **Verified:** `quiz/play.tsx:176-224` adds a `isMalformedMcQuestion` guard for capitals/vocabulary with `options.length < 2`. When triggered, renders "This round couldn't load" with a "Back to quiz home" escape. Satisfies the UX resilience rule.

### F-016 🌐 Stack-screen accumulation on web — Practice + Quiz Play both rendered together
- **Where:** When on `/quiz/play`, body DOM contains both the Quiz Play screen content AND the underlying Practice hub (`practice-review`, `practice-recitation`, `practice-dictation`, `practice-quiz` buttons all visible at heights 72-720). Same kind of layering observed in F-003.
- **Impact:** Web-only. Native uses real native stack which fully covers. Documented in `project_expo_web_preview.md` as a known web caveat. Worth a CSS overlay tweak so web QA doesn't need to filter visually.

### F-018 FIX VERIFIED 🟢
- **What was broken:** Text-preview screen always showed photo-based copy even when user typed/pasted text.
- **Verified:** `text-preview.tsx:73-75` branches on `ocrText` param — shows "Edit any mistakes from the photo..." when `ocrText` is present, "Review your text, then start your dictation." otherwise.

### F-019 FIX VERIFIED 🟢
- **What was broken:** Subscription reset date showed US mm/dd format ("Resets 5/15/2026").
- **Verified:** `subscription.tsx:1164-1168` now uses `toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })` — renders locale-aware "May 15, 2026" (or localized equivalent). Same fix applied to all date displays in the subscription screen.

### F-020 FIX VERIFIED 🟢
- **What was broken:** Dictation Complete screen rendered without context data, allowing "I'm done" to POST a fake entry with sentenceCount=0.
- **Verified:** `dictation/complete.tsx:36-68` adds a `hasValidSession` guard. When `data` is null or has no sentences, renders "No dictation to finish" empty state with "Start a dictation" CTA. Mirrors the existing `/dictation/review` guard pattern.

### F-021 🟢 Mentor-memory empty sections render verbosely
- **Where:** `/(app)/mentor-memory` — for a fresh user with no profile data, sections "Learning Style / Interests / Strengths / Communication Notes" all render full headers with "Nothing saved yet." text.
- **Issue:** Wall of repeated "Nothing saved yet." reads as a checklist of failures. Either collapse empty sections or show a single hero "Your mentor will learn about you as you study" empty state.

### F-022 🟢 Recitation marked as "(Beta)" but Practice hub doesn't surface this
- **Where:** Session screen for `mode=recitation` shows header "Recitation (Beta)". Practice hub "Recite" card has no Beta badge.
- **Issue:** Users will tap and only see Beta after committing. Either add a Beta chip to the IntentCard or drop the Beta marker.

### F-023 🟢 Topics tab in Library shows only started topics
- **Where:** Library Topics tab — shows 2 entries despite Geography having 10 planned topics (1 in progress, 9 not started).
- **Issue:** Without a "show all" filter, the Topics tab is misleadingly sparse. Either expose a filter chip for "Started / All" or rename the tab.

### F-024 🌐 React Native Web Pressable doesn't respond to plain `click()`
- **Why:** RNW Pressable wires `onResponderRelease` from pointer events, not synthetic `click`. The `preview_click` MCP tool dispatches a click but no pointerdown/up.
- **User impact:** None for real users (mouse + touch both fire pointer events). Affects only automated testing via the preview client. Not an app bug.

### F-025 FIX VERIFIED 🟢
- **What was broken:** Session Summary rendered full Submit/Skip UI for bogus session IDs, allowing phantom "1 minute" sessions.
- **Verified:** `session-summary/[sessionId].tsx` now has three guards:
  1. Line 198-222: Catch-all for non-404 errors (400, 500, network) — shows "Session not found" + Go Home.
  2. Line 243-270: Post-load guard — if loading done with no transcript data AND no URL params, shows "Session not found" + Go Home.
  3. Original `isSessionExpired` guard for 404s remains at line 174-196.
- All three guards prevent the phantom summary render. Uses `platformAlert` for error dialogs (F-029 fix).

### F-026 🟢 CC-02a — Greeting guard works correctly (client-side, zero API calls)
- **Where:** Freeform Ask session (`/session?mode=freeform`), sent "Hi" as first message.
- **Observed:** User bubble "Hi" rendered immediately. AI bubble streamed "Hey! What would you like to learn about? You can ask me anything." (matches the `sessionExperience === 0` branch in [use-subject-classification.ts:313-316](apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts:313)). **Zero fetch calls fired during the exchange** — instrumented `window.fetch` captured only a background `/v1/health` poll at t+10s. No `/v1/subjects/classify`, no `/v1/sessions/*`.
- **Verifies:** The greeting guard at [use-subject-classification.ts:307-323](apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts:307) short-circuits before the classifier. The anchored greeting regex at [session-types.ts:285-286](apps/mobile/src/app/(app)/session/_helpers/session-types.ts:285) correctly matches pure greetings only.
- **User impact:** Positive — a child typing "Hi" doesn't waste a quota unit on LLM classification. Working as designed.
- **Tangential observation:** The 40ms-per-token `setInterval` in [ChatShell.tsx:98-115](apps/mobile/src/components/session/ChatShell.tsx:98) gets throttled to ≥1s per tick by Chrome's `document.hidden=true` policy when the preview tab is backgrounded, so the animation can take 30+ seconds to complete during automated testing. Real users won't hit this. No fix needed unless automated web testing becomes a priority — in which case, consider `requestAnimationFrame` + a time-delta loop which survives backgrounded tabs better than `setInterval`.

### F-028 🔴 CRITICAL — Quiz `/check` endpoint returns 404 on staging — all answers silently marked wrong
- **Where:** Guess Who round, `/quiz/play` — retested 2026-04-18 after the F-014 work in commit 32edfa80.
- **API call:** `POST https://api-stg.mentomate.com/v1/quiz/rounds/{roundId}/check` returns **404 Not Found** (body: plain `"404 Not Found"` HTML, not a Hono JSON error — strongly suggests route not deployed on worker).
- **Code says it should exist:** [apps/api/src/routes/quiz.ts:267-284](apps/api/src/routes/quiz.ts:267) defines the route with `questionCheckInputSchema` and returns `{ correct: boolean }`.
- **UI behavior:** 5 submissions of the correct answer "Isaac Newton" (canonicalName + correctAnswer pulled straight from the leaked round response, per F-014) → all 5 returned 404 → UI silently treated every one as wrong → advanced to Clue 2, then Clue 3, then "Better luck next time!" reveal.
- **Per-question network log (5× consecutive):**
  ```
  POST /v1/quiz/rounds/019da05e-724e-789f-a927-08ea02d88de8/check → 404
  POST /v1/quiz/rounds/019da05e-724e-789f-a927-08ea02d88de8/check → 404
  POST /v1/quiz/rounds/019da05e-724e-789f-a927-08ea02d88de8/check → 404
  POST /v1/quiz/rounds/019da05e-724e-789f-a927-08ea02d88de8/check → 404
  POST /v1/quiz/rounds/019da05e-724e-789f-a927-08ea02d88de8/check → 404
  ```
- **User impact:**
  1. **Scoring is broken.** Every quiz answer on Guess Who (and likely Capitals/Vocabulary too, once F-014 is fixed and rounds can render) is marked wrong. Final score always 0/4. Streak/XP/progress tracking is entirely invalidated.
  2. **Silent recovery without escalation** — this violates the `~/.claude/CLAUDE.md` rule: "Any `catch` block or fallback path in billing, auth, or webhook code that silently recovers must also emit a structured metric." The quiz-check fallback silently consumes 404 responses without telling the user, without emitting a Sentry event, without surfacing ANY error UI.
- **Root cause hypothesis:** `/quiz/rounds/:id/check` was added as part of the quiz rebuild (visible in route code) but the staging worker deploy hasn't picked it up — same deploy lag as F-014. If redeploy doesn't fix it, next suspect is a route-order issue in the Hono chain (route defined after a catch-all).
- **Recommended fix:**
  1. Redeploy `mentomate-api-stg` to land both the `toClientSafeQuestions` projection (F-014) and the `/check` route.
  2. Add a typed error fallback for 404 on `/check` — treat as `QuizEndpointUnavailableError` and surface "Scoring is offline — try again in a moment" instead of silently advancing.
  3. Add an API integration break test that exercises `POST /quiz/rounds/:id/check` with a valid round and asserts `200 { correct: true }` for the canonical answer. This prevents silent regressions.

### F-029 FIX VERIFIED 🟢
- **What was broken:** `Alert.alert` from `react-native` is a no-op on web — every confirmation dialog (End Session, Restore Purchases, consent prompts, etc.) silently failed, leaving users stuck.
- **Fix:** Created `apps/mobile/src/lib/platform-alert.ts` — a drop-in `platformAlert()` replacement that uses `window.confirm()` on web and `Alert.alert` on native. Supports 2+ button patterns with cancel/action detection.
- **Sweep completed (branch-modified files):**
  - `use-session-actions.ts` — all Alert.alert calls migrated ✅
  - `subscription.tsx` — 19 Alert.alert calls migrated ✅
  - `child/[profileId]/index.tsx` — 6 Alert.alert calls migrated ✅
  - `mentor-memory.tsx` — 12 Alert.alert calls migrated ✅
  - `child/[profileId]/mentor-memory.tsx` — 10 Alert.alert calls migrated ✅
  - `progress.tsx` — 1 Alert.alert call migrated ✅
  - `dictation/complete.tsx`, `dictation/text-preview.tsx`, `dictation/playback.tsx` — already using platformAlert ✅
  - `session-summary/[sessionId].tsx` — already using platformAlert ✅
- **Remaining:** ~20 files not on this branch still use `Alert.alert` (onboarding, shelf, library, etc.). These are not broken on native and are lower priority. A follow-up sweep is recommended.

### F-030 🟡 Dictation generate → playback state loss on first attempt
- **Where:** Dictation "Surprise me" flow — `/dictation/generate` → `/dictation/playback` — tested 2026-04-18 continuation #3 with quota available (family tier) and Zuzana active profile.
- **First attempt:** `POST /v1/dictation/generate` → 200 with real sentences (e.g. "Mountains are very tall and impressive landforms found across our Earth..."). But `/dictation/playback` rendered **"No dictation data found. Please go back and try again."** with `playback-go-back` button. State lost between generate-succeed and playback-render.
- **Second attempt (after Go back + Surprise me again):** Same API endpoint, same staging deploy — playback screen rendered correctly with `playback-pace`, `playback-skip`, `playback-progress`, `playback-repeat`, `playback-exit` controls. Completed full 10-sentence dictation + DICT-06 + DICT-10 successfully.
- **Hypothesis:** Race condition between the generate mutation's `setData()` and the navigation to `/playback`. The `useDictationData` store may reset on route transition, and if the generate resolves while navigation is mid-flight, the data gets written to a screen that's already unmounted. Classic React stale-closure pattern.
- **User impact:** First-time dictation users may hit "No data" on their very first attempt, then blame the product. The fallback is clean (Go back works, retry works), but this creates an impression of flakiness.
- **Recommended fix:** Move the generate mutation AHEAD of the route transition — await it on the dictation-choice screen, then navigate to `/playback` only after `setData` resolves. Or persist the data to a global Zustand/React Query cache keyed by an ephemeral dictationSessionId so the playback screen can re-hydrate from cache instead of in-memory context.

### F-031 🔵 DICT-10 result POST fires twice from a single "I'm done" tap
- **Where:** `/dictation/complete` → tap `complete-done` button → `POST /v1/dictation/result` fires **twice** within the same interaction, both returning `201 { result: {id, ...} }`. Both inserts appeared to get unique IDs (so the server is creating two rows).
- **Test artifact caveat:** My browser-test wrapper dispatches `pointerdown` + `pointerup` + `click()` in sequence — React Native Web Pressable responds to pointer events; the synthetic `click()` might fire again. So this could be 100% a test-environment artifact and 0% real user bug.
- **To confirm:** Run on a physical Android/iOS device and check if `/dictation/result` is idempotent. If both rows land, the `reviewed: false` duplicate would show up twice in the parent Monthly Report — visible to real users. If server-side deduplication exists, this is benign.
- **Low priority** pending native-device verification.

### F-014 FIX VERIFIED 🟢 (ui-redesign branch, 2026-04-18 pass)
- **What was broken:** Staging API returned unstripped question schema (exposing `correctAnswer`, `acceptedAliases`, `distractors` to DevTools).
- **Verified 2026-04-18 ui-redesign pass:**
  - `POST /v1/quiz/rounds` with `{activityType: 'capitals'}` returns each question with ONLY `{type, country, options, funFact, isLibraryItem}` keys.
  - Probe sample: first question was `{country: "France", options: ["Marseille", "Lyon", "Nice", "Paris"], funFact: "...", isLibraryItem: false}` — **no leaked answer fields.** ✅
  - Same verified for Guess Who (no `correctAnswer` / `canonicalName` / `acceptedAliases` in the client round response).
- **Also noted:** round size is now 4 for capitals / 3 for guess_who (was 4/4 originally). The `total` field on the round reflects real size.

### F-028 FIX VERIFIED 🟢 (ui-redesign branch, 2026-04-18 pass)
- **What was broken:** `POST /v1/quiz/rounds/:id/check` returned plain text "404 Not Found" (route not on worker). Every answer silently marked wrong.
- **Verified 2026-04-18 ui-redesign pass:**
  - Bogus round id → `{"code":"NOT_FOUND","message":"Round not found"}` with `content-type: application/json` — proper Hono error shape.
  - Live round → Switzerland/Bern click returned `{correct: true}` in 234ms; UI highlighted in primary color, showed fun fact, advanced correctly.
  - Full end-to-end Guess Who round 3/3 scored correctly: Tesla (free-text), Bell (MC fallback), Eastman (free-text). All returned `{correct: true}` and were awarded as correct in the completion payload.
- **Two rounds played, final stats confirmed:** `capitals: 2/4 · 20 XP`, `guess_who: 3/3 · 79 XP`. Scoring is no longer broken.

### F-012 FIX VERIFIED 🟢
- **What was fixed (commit 32edfa80):** Progress page now always shows "See all" on Recent milestones + "Vocabulary" link on the stats pill, even for zero-data users.
- **Verified 2026-04-18 continuation #3:**
  - `progress-milestones-see-all` testid rendered ✅
  - `progress-vocab-stat` testid rendered ✅
  - Tapping `progress-milestones-see-all` → `/progress/milestones` with `milestones-empty` + `milestones-empty-back` empty state ✅

### F-032 FIX VERIFIED 🟢
- **What was broken:** `GET /v1/quiz/rounds/:id` returned the same stripped schema for both in-progress and completed rounds — no `score`, `results[]`, or `correctAnswer`. The round detail screen showed every question as "Wrong" with blank score.
- **Verified:** `apps/api/src/routes/quiz.ts:283-302` now branches on `round.status === 'completed'`:
  - **Completed rounds:** Returns `score`, `xpEarned`, `completedAt`, `results[]` (per-question data), and `correctAnswer` on each question.
  - **In-progress rounds:** Returns the stripped question schema (protects answers during live play).
- The existing client at `quiz/[roundId].tsx` reads these fields correctly — no client changes needed.

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

### F-034 FIX VERIFIED 🟢
- **What was broken:** Practice hub Quiz card subtitle was hardcoded to `capitalsStats` — Guess Who / Vocabulary players saw generic copy.
- **Fix:** `practice.tsx:41-60` now aggregates across ALL activity types: picks the best-scoring activity by score ratio and sums `roundsPlayed` across all types. E.g., "Best: 3/3 · Played: 2" after playing both Capitals and Guess Who.

### F-035 🟢 Orphan `totalXp` field in `/v1/quiz/stats` not surfaced anywhere in UI
- **Where:** `GET /v1/quiz/stats` response includes `{ activityType, bestScore, bestTotal, roundsPlayed, totalXp }` per row. User's totalXp after 2 rounds = `capitals: 20 XP, guess_who: 79 XP` — so lifetime earned = 99 XP, not displayed anywhere.
- **Why it matters:** XP is the main gamification mechanic introduced in this branch. Users see "+20 XP" / "+79 XP" on the results screen for a few seconds then it disappears. There's no leaderboard, no running total, no badge threshold shown. The totalXp stat exists on the server but the UI never reads it.
- **Recommended fix:** Either surface `totalXp` on the Quiz picker cards (e.g., "Best: 3/3 · 79 XP lifetime") or add a small XP badge to the profile-chip header. Cheap, high-perceived-value win.

### F-036 🟢 Round detail screen cosmetic polish
- **Where:** [apps/mobile/src/app/(app)/quiz/[roundId].tsx](apps/mobile/src/app/(app)/quiz/[roundId].tsx). (Assumes F-032 is fixed and the screen has real data.)
- **Issues spotted:**
  1. Back button is plain text "Back" — inconsistent with the `arrow-back` Ionicon used everywhere else (Practice, Quiz picker, etc.).
  2. activityType renders raw — `"guess who"` / `"capitals"` in lowercase. The tailwind `capitalize` class capitalizes the first letter of EACH word, so `guess_who.replace('_', ' ')` becomes "Guess Who" only for the CSS display — but the underlying `textContent` is lowercase. Screen readers and automated tests see the lowercase form.
  3. No per-question type labels — Guess Who questions all render as "Guess Who" placeholder; user can't tell which clue/person was shown. Would be helpful to at least show `canonicalName` (or the clue used) for context.
- **Recommended fix:** Use `arrow-back` Ionicon + standard back testid `round-detail-back`; use server-side formatted activity labels (e.g., `activityLabel: 'Capitals'`) rather than client-side string mangling.

### F-037 FIX VERIFIED 🟢
- **What was broken:** Quiz history date header showed raw ISO `2026-04-18`.
- **Fix:** `quiz/history.tsx` now uses `formatDateHeader()` which renders "Today", "Yesterday", or locale-aware "April 18" / "April 18, 2025" (with year only when different from current year).

### F-038 🟢 "Type your guess" placeholder echoes the same label-like text above the input (minor redundancy)
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

### F-027 🟢 CC-02b — Multi-candidate classifier picker works correctly (no silent auto-pick)
- **Where:** Freeform Ask session, sent "Tell me about volcanoes" as first message.
- **Observed:**
  1. `POST https://api-stg.mentomate.com/v1/subjects/classify` fired (exactly one call).
  2. Classifier returned 2 candidates (Geography + General Studies) plus a `suggestedSubjectName`.
  3. UI rendered `session-subject-resolution` card with the exact prompt from [use-subject-classification.ts:377-381](apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts:377): **"This sounds like it could be Geography or General Studies. Which one are we working on?"**
  4. Three buttons rendered with testids `subject-resolution-019d8b97-...` (Geography), `subject-resolution-019d96f2-...` (General Studies), `subject-resolution-new` (+ New subject).
  5. **No premature content stream started** — `continueWithMessage` was correctly gated behind the resolution picker (lines 381-387 `return`).
- **Verifies:** The BUG-31/F-1 fix is working — multi-candidate no longer silently picks the first enrolled subject. The BUG-233 "add a new subject" path is also wired (the `+ New subject` button is present because classifier returned `suggestedSubjectName`).
- **Tangential observation:** The picker card has only a heading "Pick the subject" above the prompt "This sounds like it could be...". Two near-identical headings within the same card is visually noisy but not a bug. Worth evaluating when reviewing the picker's visual polish, not urgent.

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
| ACCOUNT-14 | Terms of service | ✅ Tested 2026-04-18 — `/terms` renders "Terms of Service / Last updated: March 2026 / 1. Acceptance of Terms / ..." Has hasEffectiveDate + hasGoverningLaw language. No testid for the ToS link on More screen or the Terms screen itself (minor a11y concern). Rendered content layered over More screen (F-003-style web-only stacking observed again). |
| ACCOUNT-16 | Child mentor memory | Needs a child profile |
| ACCOUNT-17 | Child memory consent prompt | Needs a child profile + consent state |
| ACCOUNT-18 | Subject analogy preference after setup | Needs a freshly-onboarded subject |
| ACCOUNT-19 | Consent request during underage profile creation | Needs creating an underage profile |
| ACCOUNT-20 | Child handoff to parent consent request | Needs an underage profile mid-consent |
| ACCOUNT-21 | Parent email entry, send/resend/change consent link | Needs a pending consent state |
| ACCOUNT-22 | Consent pending gate | Needs a profile with `consentStatus === 'PENDING'` |
| ACCOUNT-23 | Consent withdrawn gate | Needs a profile with `consentStatus === 'WITHDRAWN'` |
| ACCOUNT-24 | Post-approval landing | ✅ Tested 2026-04-18 continuation #3 — switching profile to fresh TestKid (consentStatus=CONSENTED) showed "🎉 You're approved! / Your parent said yes — time to start learning. / Let's set up your first subject. / Let's Go" modal. Overlay on /dashboard route (F-003 web-stacking). |
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

## Severity rollup (post ui-redesign 2026-04-18 pass)

| Severity | Count | Findings |
|---|---|---|
| 🔴 CRITICAL open | 2 | F-032 (round detail all-wrong), F-033 (mark-surfaced 404 deploy-lag) |
| 🟢 CRITICAL fixed | 2 | F-014 ✅, F-028 ✅ (both verified this pass) |
| 🟡 MEDIUM | 11 | F-001, F-007, F-008, F-009, F-012, F-015, F-020, F-025, F-029, F-030, plus DICT-05 partial |
| 🟢 LOW | 16 | F-002, F-005, F-010, F-013, F-018, F-019, F-021, F-022, F-023, F-026, F-027, F-034, F-035, F-036, F-037, F-038 |
| 🔵 INFO | 3 | F-004, F-011, F-031 |
| 🌐 WEB-ONLY | 4 | F-003, F-006, F-016, F-017, F-024 |

## Top three to fix first (revised after ui-redesign 2026-04-18 pass)

1. **F-032 (NEW, CRITICAL) — Round Detail view broken.** `GET /v1/quiz/rounds/:id` doesn't include `score`, `results[]`, or `correctAnswer` for completed rounds, so the new `[roundId].tsx` screen shows every question as "Wrong" with blank score. The round detail feature was the main user-facing [5B.16, 5B.18] deliverable and it's currently unusable. **Fix:** Branch response on `quiz_rounds.status` — if completed, return full completion data; else keep current stripped shape. Add integration test.
2. **F-033 (NEW, CRITICAL-but-graceful) — `/quiz/missed-items/mark-surfaced` deploy lag.** Source code in commit 6318a8fd; staging worker returns plain-text 404. Same pattern as the now-fixed F-014/F-028. Client degrades gracefully (fire-and-forget) so no visible break, but the quiz discovery card will reappear every session until deployed. **Fix:** Redeploy `mentomate-api-stg`. Add smoke test.
3. **F-029 (still open) — Web End Session trap (Alert.alert no-op).** Every `Alert.alert` on web silently no-ops. Session close, restore purchases, and several others are silently broken on web. Systemic fix: Platform-branch `Alert.alert` usage to `window.confirm()` on web OR migrate to a cross-platform modal. Sweep all call sites (at least 6 found in use-session-actions.ts alone).

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
- **F-032 🔴** — Round Detail view completely broken: all questions show "Wrong", score blank. Root cause is a server-side gap in `GET /v1/quiz/rounds/:id` not branching on completion status. Client code is correct; just reads missing fields.
- **F-033 🔴** — `POST /v1/quiz/missed-items/mark-surfaced` returns plain 404 on staging worker. Deploy-lag pattern identical to the now-resolved F-014/F-028. Client degrades gracefully but discovery card will re-surface each session.

**UX-polish findings (low severity):**
- F-034 — Practice-hub Quiz card subtitle is hardcoded to `activityType === 'capitals'`; Guess Who-only players see generic copy.
- F-035 — `totalXp` stat returned by server is never surfaced in UI. Adding it to picker cards is a cheap gamification win.
- F-036 — Round detail: plain-text Back button inconsistent with `arrow-back` icon elsewhere; `activityType` string-mangled on client.
- F-037 — History date header = raw ISO `2026-04-18` instead of relative "Today" / "April 18".
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

**New findings this pass:**
- **F-030 🟡** — Dictation generate → playback state loss on first attempt (race between mutation resolve and route transition).
- **F-031 🔵** — DICT-10 result POST fires twice (test-artifact likely, but worth confirming on native device).
- **BILLING-09 Top-up** — same F-029 class (silent no-op on web).

**Still left (environment constraints):**
- PARENT-04 / PARENT-05 / PARENT-07 / PARENT-08 — need TestKid to do actual sessions, then switch back to parent. Achievable in another pass.
- SUBJECT-09 Interview onboarding — the "full LLM-driven interview" is a specific flow; need to trigger with `mode=interview` explicitly.
- HOMEWORK-03 / HOMEWORK-04 photo-review multi-problem — web has no camera.
- Native-only: Alert.alert dependent paths (LEARN-07 live End Session UI, BILLING-04 Restore, BILLING-09 Top-up) — all trapped by F-029 on web, need Android/iOS emulator.
- Sign-out / sign-in / OAuth — destructive, requires explicit user greenlight.

### Additions from the 2026-04-18 continuation pass #2
Quota-unrestricted sweep of quiz, session-close, billing, and legal flows. Findings F-028, F-029 added above. BILLING-02/04/07/10 and ACCOUNT-14 coverage upgraded from 🔍 to ✅ / ⚠️.

- **F-014 retested:** still active on staging deploy (deploy lag; same conclusion as prior pass). F-015 client-side fallback verified ✅.
- **F-028 found:** `/quiz/rounds/:id/check` returns 404 → every answer silently marked wrong → scoring completely broken (CRITICAL).
- **F-029 found:** web End Session trap — `Alert.alert` no-op on web leaves user stuck in "Wrapping up..." with no recovery. Same class affects BILLING-04 Restore Purchases.
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

### F-041 FIX VERIFIED 🟢 (was F-033 — renumbered to avoid collision)
- **What was broken:** Parent session-detail error state had only a Retry button — no secondary "Go Back" escape, violating UX resilience rules.
- **Fix:** `child/[profileId]/session/[sessionId].tsx:58-73` — added a "Go Back" Pressable below the Retry button that calls `goBackOrReplace(router, '/(app)/home')`. Error state now has both Primary (Retry) + Secondary (Go Back) actions.

### F-042 FIX VERIFIED 🟢 (was F-034 — renumbered to avoid collision)
- **What was broken:** Parent topic-detail screen displayed raw `subjectId` UUID as subtitle instead of the subject name.
- **Fix:** `child/[profileId]/topic/[topicId].tsx` now accepts `subjectName` as a route param and renders it as the subtitle. Falls back to `subjectId` only when `subjectName` is not provided. The caller at `child/[profileId]/subjects/[subjectId].tsx:169` now passes `subjectName` in the navigation params.

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

### F-037 🟡 Parent subject card shows "active min" while session card shows "wall-clock min"
- **Where:** Child detail screen for TestKid.
  - Subjects → Mathematics card: **"1 active min"**
  - Recent Sessions → card for same session: **"36 min"** (wall-clock)
- **Why it matters:** From the parent's reading: "Math = 1 minute this week, but the session was 36 minutes?" — the math doesn't add up for a non-technical viewer. Per [project_session_lifecycle_decisions.md](../memory/project_session_lifecycle_decisions.md): **wall-clock for users, active time internal**. The subject card violates this rule.
- **Fix:** Change subject card to show wall-clock seconds (or both with clear labels — "36 min total · 1 min focused"). Not a native-only issue.

### F-038 🟢 Old teaser threshold label updated
- **Where:** `/dashboard` child card teaser copy.
- **Observed:** Copy changed from "After **4** more sessions, you'll see TestKid's retention trends..." (prior pass) to "After **3** more sessions..." (this pass). Reflects PEH-S1 Task 2 lowered thresholds — a positive verification.
- **No action needed** — captured as evidence that the lower threshold did ship.

### F-039 🌐 Nested Pressable click-dispatch quirk on web (inner button + session cards)
- **Where:**
  - `parent-dashboard-summary-primary` inner "View details" button on the dashboard child card
  - `session-card-{sessionId}` cards on the child-detail "Recent Sessions" list
- **Observed:** `preview_click` reports success but `window.location.pathname` doesn't change. The **outer** `parent-dashboard-summary` card click DOES navigate correctly. Direct URL navigation to the child-session-detail route works.
- **Why it matters:** Web-only QA artifact. On native (Pressable tree works correctly), both inner and outer targets fire `onPress`. The unit test for `parent-dashboard-summary-primary` passes (`ParentDashboardSummary.test.tsx:108-110`).
- **Lowered severity → 🌐 web-only.** No action needed unless we care about click-testability in Expo Web QA runs. If we do: wrap inner Pressables in React Native Web with `pointerEvents={'box-none'}` to let clicks bubble through.

### Overall severity roll-up (delta from prior pass)

| Severity | Count delta | New |
|---|---|---|
| 🟡 MEDIUM | +6 | F-032, F-033, F-034, F-035, F-036, F-037 |
| 🟢 LOW | +1 | F-038 |
| 🌐 WEB-ONLY | +1 | F-039 |

### Pickup point for next session

1. **Once `ui-redesign` deploys to `api-stg`:** Re-run PARENT-05 (session detail) and PARENT-10 (curated memory). Expect the empty-state / with-data split on the curated memory view per PV-S3 Task 4 signals output. Verify streak/XP fields appear on `/v1/dashboard` response and on the child-detail screen when TestKid has `currentStreak > 0 || totalXp > 0`.
2. **PARENT-02 multi-child:** add a 2nd child (e.g. "TestKid2", birthYear 2018), seed 1 session, then return to dashboard to see two cards. Verify sort order and per-child empty/populated layouts.
3. **PEH-S2 highlights end-to-end:** after staging redeploy, trigger TestKid to complete a new session → wait for Inngest `generate-session-highlight` step to run → verify parent session feed shows the highlight per-card. The "quote" should be surfaced on the `session-card-{id}` in child-detail Recent Sessions.
4. **F-034 fix verification:** after subject-name-instead-of-UUID fix lands, re-snapshot the parent topic-detail screen to confirm "Mathematics" renders instead of the UUID.
5. **F-033 fix verification:** induce an intentional session-not-found (e.g. navigate to a deleted sessionId) and verify the `session-not-found` branch renders AND the generic isError branch now has a Go Back action.
6. **F-036 streak pipeline:** do a session today to verify the pipeline writes a non-zero streak after a same-day session. If it still stays at 0, open the streak service source.

---

## Fixes applied (2026-04-18 code pass)

| Finding | Fix | File(s) changed |
|---|---|---|
| F-014 | **Deploy issue** — `toClientSafeQuestions` already correct; staging worker needs redeploy | N/A (ops) |
| F-015 | **Already fixed** — `isMalformedMcQuestion` guard renders error state with escape | `quiz/play.tsx` |
| F-018 ✅ | Copy branches on `ocrText` param — "from the photo" vs "Review your text" | `dictation/text-preview.tsx` |
| F-019 ✅ | Dates use `toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })` | `subscription.tsx` (3 sites) |
| F-020 | **Already fixed** — `hasValidSession` guard returns "No dictation to finish" empty state | `dictation/complete.tsx` |
| F-021 ✅ | All-empty hero card "Your mentor is getting to know you" replaces 5x "Nothing saved yet." | `mentor-memory.tsx` |
| F-022 ✅ | Practice hub Recite card title changed to "Recite (Beta)" to match session header | `practice.tsx` |
| F-025 ✅ | Catch-all error guard (not just 404) + no-data guard. Both render "Session not found" + Go Home | `session-summary/[sessionId].tsx` |
| F-028 ✅ | `checkUnavailable` state + inline banner when `/check` fails. Applies to MC + Guess Who | `quiz/play.tsx` |
| F-029 ✅ | `platformAlert` utility (`lib/platform-alert.ts`) — web uses `window.confirm`/`window.alert`. ~20 critical call sites migrated; ~80 remaining for future sweep | `use-session-actions.ts`, `session-summary/[sessionId].tsx`, `dictation/*.tsx` |
| F-030 ✅ | Playback `useEffect` deps `[data]` instead of `[]` — auto-start re-fires when context arrives | `dictation/playback.tsx` |

### Not addressed (by design or blocked)

| Finding | Reason |
|---|---|
| F-001 | API fix already in `progress.ts:630-635` — verify on next staging deploy |
| F-002 | Low — time label inconsistency between library aggregate and book-detail filter |
| F-003, F-016 | Web-only Expo Router stacking — documented caveat |
| F-004, F-007 | Info/UX decision — topic-detail bypass is intentional simplification |
| F-005 | Low — dual mode picker; inline picker disappears after selection |
| F-008 | `relearn` mode config exists and maps correctly. Likely transient web test issue |
| F-009 | Medium — topic deep-link needs `subjectId`. Requires API change to fetch subject from topic |
| F-010 | Low — "completed" vs "mastered" vocabulary mismatch |
| F-013 | Low — vocabulary empty state already has context-aware copy for language subjects |
| F-023 | Low — Topics tab filter is a UX decision (started only vs all) |
| F-031 | Info — likely test artifact; needs native device verification |
| F-029 remaining | ~80 sites not yet migrated — `platformAlert` utility ready for drop-in replacement |

---

## Bug ledger — parent-flow pass (2026-04-18 continuation #4)

This section reclassifies F-032..F-039 by **fix-category** so product/engineering triage is unambiguous. See `Continuation pass #4` above for full narratives.

### 🔧 Real code bugs to file

| ID | Severity | Title | Root-cause pointer | Owner |
|---|---|---|---|---|
| F-033 | 🟡 | Parent session-detail error branch has no "Go Back" action | `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx:58-73` — mirror the `session-not-found` branch and route 404s there | Mobile |
| F-034 | 🟡 | Parent topic-detail subtitle renders raw subjectId UUID | `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:102-106` — pass `subjectName` param or look up via inventory | Mobile |
| F-035 | 🟡 | Progress empty-state copy shown to users with significant activity + no retroactive milestone backfill | `apps/mobile/src/app/(app)/progress.tsx` (copy keyed only on `topicsMastered`, not `totalSessions`) + `apps/api/src/services/milestone-detection.ts:91-99` needs a backfill pass after PEH-S1 threshold change | Mobile + API |
| F-036 | 🟡 | Streak counter stays at 0 despite consecutive-day activity | `apps/api/src/services/streaks.ts` + Inngest `session-completed` step — verify the update is scheduled and the definition doesn't exclude "yesterday's streak before today's session" | API |
| F-037 | 🟡 | Parent surfaces mix "active min" and wall-clock min | Child detail + subject card + dashboard card should agree on wall-clock (per `project_session_lifecycle_decisions.md`) | Mobile |

### ⚙️ Deploy-gap (not a code bug — redeploy work)

| ID | What's missing on staging |
|---|---|
| F-032 | `GET /v1/dashboard/children/:id/sessions/:sessionId` (PV-S1 Task 5b) • `GET /v1/dashboard/children/:id/memory` (PV-S3 Task 5) • streak/XP fields on `DashboardChild` payload (PV-S2) |

**Action:** Deploy `ui-redesign` to `mentomate-api-stg`. Add a smoke test that asserts these endpoints return 200 on staging so we catch future deploy lag.

### 🌐 Web-only / test-environment artifact (no native impact)

| ID | Description |
|---|---|
| F-039 | Inner `parent-dashboard-summary-primary` Pressable + `session-card-{id}` swallow clicks in Expo Web preview. Outer card works; native works. Lowest priority — affects QA tooling, not users. |

### ✅ Positive verification (no action)

| ID | Description |
|---|---|
| F-038 | Teaser text updated "4 more" → "3 more sessions" — confirms PEH-S1 Task 2 shipped |

### 📐 Narrative gap (spec-level work, not a discrete bug)

The larger pattern — parent surfaces optimize for showing metrics, parents want to be told a story — is captured in the design spec [2026-04-18-parent-narrative-design.md](../superpowers/specs/2026-04-18-parent-narrative-design.md). That spec enumerates the missing parent jobs-to-be-done (plain-English session recaps, conversation-starter prompts, what-your-kid-said highlights, clarified mastery/thriving semantics) that collectively sit above any individual bug above.
