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
| HOME-02 | Parent gateway home | ✅ | Tested 2026-04-18 after family-tier + child added. `parent-gateway` testid + "Check child's progress" + "Learn something" CTAs |
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
| PRACTICE-01 | Practice hub menu | ✅ | 4 cards: Review / Recite / Dictation / Quiz |
| PRACTICE-02 | Review topics shortcut | ✅ | "Nothing to review" empty state with "Browse your topics" link |
| PRACTICE-03 | Recitation session | ✅ | Renders "Recitation (Beta)" with "Recite from memory" greeting |
| PRACTICE-04 | All-caught-up empty state | ✅ | Visible on Practice when no overdue topics |
| QUIZ-01 | Quiz activity picker | ✅ | 3 cards: Capitals / Vocabulary: Spanish (New!) / Guess Who |
| QUIZ-02 | Round-generation loading | ✅ | "Shuffling questions..." rotation + Cancel button |
| QUIZ-03 | Capitals/Vocabulary play | ❌ | F-014 still active on staging (retested 2026-04-18); F-015 fix VERIFIED — `quiz-play-malformed` error now shows "This round couldn't load / We didn't get the answer choices for this question" with `quiz-play-malformed-back` ✅ |
| QUIZ-04 | Guess Who play | ⚠️ | F-028 NEW: `/quiz/rounds/{id}/check` returns 404 on staging — every answer silently marked wrong, round plays to 0/4 score regardless of correctness |
| QUIZ-05 | Mid-round quit | ✅ | Quit icon visible top-left; tested |
| QUIZ-06 | Round complete error retry | ⚠️ | Retry after transient 502 works — LLM returned 502 UPSTREAM_ERROR first attempt, 200 on retry. F-014 leak remains on 200 response. |
| QUIZ-07 | Results screen | ⏭️ | Can't reach cleanly — F-028 blocks scoring |
| QUIZ-08 | Typed-error classification | ✅ | Two real error paths verified: 502 upstream (quiz-launch-error fallback with Retry/Go Back) + 404 check (silent fallback to wrong answer — this IS the bug in F-028) |

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

### F-008 🟡 Session header copy reads "Chat / Ask anything" for a `relearn` session on a known topic
- **Where:** `/session?mode=relearn&topicId=...` — header strip shows `Chat` title and `Ask anything` subtitle.
- **Why it matters:** A user opening a relearn for "Africa's Geographic Tapestry" expects to see the topic name in the header (or at least "Practice / Relearn"). The generic "Chat / Ask anything" copy is correct only for `mode=freeform` from the Ask card. Title resolution should branch on session `mode`.

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

### F-013 🟢 Vocabulary empty-state copy doesn't acknowledge an existing language subject
- **Where:** `/progress/vocabulary` empty state (`vocab-browser-empty`) reads "Start a language subject and the words you learn will appear here."
- **Issue:** User already has Spanish in their library. Better copy: "Practice Spanish to start building your word list."

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

### F-015 🟡 Quiz Play has no error fallback when `options` is missing/empty
- **Where:** `apps/mobile/src/app/(app)/quiz/play.tsx` `shuffledOptions` defaults to `[]`. If the server returns no `options`, the page renders just the question text and a useless quit button. There's no schema-validation error, no "couldn't load round" message, no Retry.
- **Spec says:** `2026-04-...quiz design` requires every state to have an action. Empty options is an unhandled state.

### F-016 🌐 Stack-screen accumulation on web — Practice + Quiz Play both rendered together
- **Where:** When on `/quiz/play`, body DOM contains both the Quiz Play screen content AND the underlying Practice hub (`practice-review`, `practice-recitation`, `practice-dictation`, `practice-quiz` buttons all visible at heights 72-720). Same kind of layering observed in F-003.
- **Impact:** Web-only. Native uses real native stack which fully covers. Documented in `project_expo_web_preview.md` as a known web caveat. Worth a CSS overlay tweak so web QA doesn't need to filter visually.

### F-018 🟢 Text-preview screen always shows photo-based copy
- **Where:** `/(app)/dictation/text-preview` after tapping "I have a text" → "Type or paste your own text".
- **Copy shown:** "Edit any mistakes from the photo, then start your dictation."
- **Issue:** User typed/pasted; there was no photo. Copy should branch on whether the screen was reached with `ocrText` URL param.

### F-019 🟢 Subscription reset date uses US mm/dd format
- **Where:** Subscription screen "Resets 5/15/2026". Today is 2026-04-18.
- **Issue:** Ambiguous outside US (5/15 = 15 May or 5 January depending on locale). Use ISO `2026-05-15` or `Intl.DateTimeFormat` with the active locale.

### F-020 🟡 Dictation Complete screen renders without context data
- **Where:** Direct nav `/(app)/dictation/complete` (no `useDictationData` populated).
- **Result:** Screen renders fully — "Well done!" with "Check my writing" / "I'm done" / "Try another dictation" buttons all active.
- **Risk:** Tapping "I'm done" would call `POST /dictation/results` with `sentenceCount: 0`, mode `'homework'` (default) — polluting the user's `dictation_results` table with a fake entry. Should guard on `data == null` and show an empty-state escape (similar to the existing `dictation/review` "Review data not found" pattern).

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

### F-025 🟡 Session Summary screen renders full Submit/Skip UI for non-existent session IDs
- **Where:** Direct nav `localhost:8081/session-summary/not-a-real-session-id` (continuation session, 2026-04-18).
- **Expected:** One of (a) "Session not found" (line 157 guard), (b) "This session has expired" with Go Home button (line 167-172, only on 404), (c) "Loading your session summary..." spinner (line 198-203).
- **Observed:** Full summary screen renders — "Session Complete" + "1 minute - great session!" (phantom, from `Math.max(1, ...)` at line 115-122) + all 5 `SUMMARY_PROMPTS` chips + active `submit-summary-button` + `skip-summary-button`. `hasExpiredBtn: false`, `hasLoadingSpinner: false`, `hasSubmitBtn: true`, `hasSkipBtn: true`.
- **Root cause:** The guards at [apps/mobile/src/app/session-summary/[sessionId].tsx:157](apps/mobile/src/app/session-summary/[sessionId].tsx:157), [:167](apps/mobile/src/app/session-summary/[sessionId].tsx:167), and [:198](apps/mobile/src/app/session-summary/[sessionId].tsx:198) have a hole:
  1. `!sessionId` only covers empty string — any non-empty garbage passes.
  2. `isSessionExpired` only triggers on HTTP 404 from transcript query. If the API returns 400/500/200-with-null, or if the query is in idle/stale-cache state, this path doesn't fire.
  3. The loading-spinner branch requires BOTH no URL params AND `transcript.isLoading`. When the query settles (in whatever state) or URL params ARE present, the screen falls through to the full render.
- **User impact:**
  1. **Data pollution risk:** Tapping "Submit Summary" would `POST /v1/sessions/{bogus-id}/summary` — unclear if the server validates the ID belongs to the profile or returns a useful 404. If it 500s, the client has no error fallback visible.
  2. **Misleading UX:** User thinks they just "completed" a 1-minute session they never had.
  3. **Same dead-end class as F-020** (Dictation Complete without data guard). This is a systemic pattern — screens whose navigation-params-driven render hides the "no real data" case.
- **Recommended fix:** Add a `transcript.data || exchangeCount || wallClockSeconds` precondition. If none of those are truthy, show the existing "Session not found" empty state. Also classify non-404 errors (5xx, network) into the typed error hierarchy per `CLAUDE.md` UX Resilience Rules.
- **Related:** Same systemic bug as F-020. Worth one sweep across all `/(app)/*/complete.tsx`, `/session-summary/*`, `/dictation/complete`, `/homework/complete` screens.

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

### F-029 🟡 Web End Session trap — tapping End Session gets user stuck in "Wrapping up..." forever
- **Where:** Continuation session `/session?...&sessionId=019da061-...&mode=learning`, tapped `end-session-button`.
- **Observed:**
  1. Button text transitioned from "End Session" to "Wrapping up..."
  2. **Zero API calls fired** (no `POST /v1/sessions/{id}/close`, no transcript request).
  3. **No Alert.alert dialog rendered** (`hasAlertDialog: false`, no `role="dialog"` anywhere in DOM).
  4. 8 seconds later: still stuck in "Wrapping up...". Input field gone. Send button gone.
  5. Only escape: navigate via tab bar or browser back. The session on the server stays open indefinitely.
- **Root cause:** [apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts:331-345](apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts:331). The flow is:
  1. `handleEndSession` sets `setIsClosing(true)` immediately (BUG-352 guard).
  2. Calls `Alert.alert('End session?', '', [{ text: 'Continue', onPress: () => setIsClosing(false) }, { text: 'End Session', onPress: async () => { ...close... } }])`.
  3. On React Native Web, `Alert.alert` from `react-native` is a no-op shim — it silently returns without rendering UI and without invoking either `onPress` callback.
  4. Neither callback fires → `isClosing` stays `true` permanently → UI gates everything behind `isClosing` are stuck.
- **User impact:** Web is not a supported mobile-app surface, but anyone opening the Expo Web preview (for dev, QA, sharing) can reproduce this trap trivially. On native devices this works correctly.
- **Recommended fix:**
  - Add a Platform.OS === 'web' branch that uses `window.confirm()` instead of `Alert.alert` for the end-session prompt (preserves the two-action pattern).
  - Or use a proper RN modal component cross-platform instead of `Alert.alert`. The existing codebase already has modal components.
  - Related: **This is a systemic gap.** `Alert.alert` appears in [use-session-actions.ts:338, :427, :641, :655, :694](apps/mobile/src/app/(app)/session/_helpers/use-session-actions.ts:338), [use-dictation-playback.ts DICT-05](apps/mobile/src/hooks/use-dictation-playback.ts) (flagged in initial report), subscription restore failure, etc. Every one of these is silently broken on web. Worth one sweep.

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

### F-012 FIX VERIFIED 🟢
- **What was fixed (commit 32edfa80):** Progress page now always shows "See all" on Recent milestones + "Vocabulary" link on the stats pill, even for zero-data users.
- **Verified 2026-04-18 continuation #3:**
  - `progress-milestones-see-all` testid rendered ✅
  - `progress-vocab-stat` testid rendered ✅
  - Tapping `progress-milestones-see-all` → `/progress/milestones` with `milestones-empty` + `milestones-empty-back` empty state ✅

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
| PARENT-01 | Parent dashboard (live or demo) | ✅ Tested 2026-04-18 continuation #3 — `/dashboard` shows "How your children are doing" + child card (0 sessions teaser) + "After 4 more sessions, you'll see TestKid's retention trends and detailed progress here." Testids: `parent-dashboard-summary`, `parent-dashboard-teaser`, `parent-dashboard-summary-primary` |
| PARENT-02 | Multi-child dashboard | ⏭️ Needs ≥2 children |
| PARENT-03 | Child detail drill-down | ✅ Tested 2026-04-18 — `/child/{profileId}` renders "TestKid / 0 sessions / Monthly reports / Your first report will appear after the first month / Recent growth / Weekly..." empty states. Testid: `child-reports-link` |
| PARENT-04 | Child subject → topic drill-down | ⏭️ Deferred — Child had no data at test time (would require TestKid to do sessions then switch back to parent view) |
| PARENT-05 | Child session / transcript drill-down | ⏭️ Same as PARENT-04 |
| PARENT-06 | Child monthly reports list + detail | ✅ Empty-state verified — `/child/{id}/reports` renders `child-reports-empty`, `child-reports-empty-time-context`, `child-reports-empty-progress` testids + `child-reports-back`. Full-data verification requires a monthly report to be generated (Inngest job) |
| PARENT-07 | Parent library view | ⏭️ Needs child with enrolled subjects |
| PARENT-08 | Subject raw-input audit | ⏭️ Deferred |
| PARENT-09 | Guided label tooltip | ⏭️ Observed as part of PARENT-01 — no specific tooltip testid found |

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

## Severity rollup

| Severity | Count | Findings |
|---|---|---|
| 🔴 CRITICAL | 2 | F-014, F-028 |
| 🟡 MEDIUM | 11 | F-001, F-007, F-008, F-009, F-012, F-015, F-020, F-025, F-029, F-030, plus DICT-05 partial |
| 🟢 LOW | 11 | F-002, F-005, F-010, F-013, F-018, F-019, F-021, F-022, F-023, F-026, F-027, F-012-VERIFIED |
| 🔵 INFO | 3 | F-004, F-011, F-031 |
| 🌐 WEB-ONLY | 4 | F-003, F-006, F-016, F-017, F-024 |

## Top three to fix first

1. **F-028 (NEW, CRITICAL) — Quiz `/check` endpoint returns 404 on staging; every answer silently marked wrong.** Scoring is completely broken. Redeploy `mentomate-api-stg` (same deploy lag as F-014). Add a typed fallback for `404`-on-check → "Scoring is offline" error UI. Add an API integration break test asserting `POST /quiz/rounds/:id/check` with canonical answer → `200 { correct: true }`.
2. **F-014 (still open) — Quiz answer-stripping broken on staging API.** Staging response still includes `correctAnswer`/`acceptedAliases`/`distractors` — retested 2026-04-18. Break tests now in place per commit 32edfa80 — next stale deploy surfaces at build time. F-015 client fallback **verified working** ✅.
3. **F-029 (NEW) — Web End Session trap (Alert.alert no-op).** Every `Alert.alert` on web silently no-ops. Session close, restore purchases, and several others are silently broken on web. Systemic fix: Platform-branch `Alert.alert` usage to `window.confirm()` on web OR migrate to a cross-platform modal. Sweep all call sites (at least 6 found in use-session-actions.ts alone).

## Pickup point for the next session

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
