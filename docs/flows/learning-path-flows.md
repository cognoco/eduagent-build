# Learning Path Flows — End-User Perspective

Complete trace of every learning path in MentoMate, from the learner's first tap to post-session recording. Last updated 2026-06-08.

> **What changed since 2026-04-14**
> - The five tutoring-session paths below are unchanged in shape; only their **entry points** moved. The intermediate `/(app)/learn-new` screen was deleted in the home IA simplification (commit 55ddcbdb). Learners now tap a quick action or the Ask Anything bar directly on `/(app)/home` to start any path.
> - **Three new "practice" paths** (Quiz, Dictation, Recitation) ship out of the Practice quick action. They are not full tutoring sessions — they are bounded activities with their own scoring loops. Recitation is a session mode; Quiz and Dictation are standalone flows with their own context state.
> - The homework path now optionally passes the captured image straight to a multimodal LLM (vision) instead of OCR-only — the same image-pass-through pipeline powers dictation photo-review.

> **What changed since 2026-04-18 (the `improvements` branch, snapshot 2026-05-04)**
> - **Home redesign (commit 435a7b89).** The four-IntentCard pattern is gone. Home now shows a subject-tint carousel (`home-subject-carousel`), an Ask Anything bar (`home-ask-anything`), a quick-action row (`home-action-study-new`, `home-action-homework`, `home-action-practice`), an add-subject tile, and an empty-subjects branch (`home-empty-subjects` / `home-add-first-subject`). Entry points in every path below are updated to match.
> - **Library v3 (PR #144, commit 1dd00262).** The shelves/books/topics tab architecture is gone. Library is a single-pane topic-first view with expandable subject shelves, inline book cards, server-side debounced search (`LibrarySearchBar` + `useLibrarySearch`), and retention pills. Guided learning and relearn paths now start from this single-pane view.
> - **Quiz history + round detail (PR #121).** Completed rounds remain discoverable after the results screen is dismissed via `/(app)/quiz/history` and `/(app)/quiz/[roundId]`.
> - **Bookmarks within sessions (commit 6e0ffb58).** Learners can bookmark AI messages mid-session; saved messages live at `/(app)/progress/saved`. A first-time `BookmarkNudgeTooltip` appears after a few AI responses. Parent-proxy mode disables delete.
> - **Session transcript for parents (commit 53524c6d, BUG-889).** New read-only `session-transcript/[sessionId]` route (top-level, not under `(app)/`) reachable from the session-summary "View full transcript" link. Bubbles are rendered through `stripEnvelopeJson` (BUG-941).
> - **Onboarding extras Bucket C — `conversationLanguage` (mandatory), `pronouns`, `interestsContext`.** These dimensions are now passed into every session prompt; see Cross-Cutting Dimensions.
> - **i18n cross-cutting layer.** UI strings (errors, dictation alerts, camera permission copy, sso-callback) are rendered via `t()` in en/nb/de/es/pl/pt/ja. App-language is now editable from More.
> - **Profile-as-lens phase 1.** Profile-scoped screens receive the active profile as a navigation lens; impersonated-child sessions hide destructive actions in More.
> - **Parent Narrative Phase 1 (commit 68a2288c).** "Understanding" replaces Mastery on the parent dashboard, plus a session-recap block and gated retention badges. See "What Parents See".
> - **Weekly progress push.** New push-driven `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` route marks the report viewed on mount.
> - **Quiz robustness fixes.** BUG-929 / CR-PR129-M4 resets `answerState` / `selectedAnswer` / `freeTextAnswer` / `guessWhoCluesUsed` and the per-question timer in the same React batch on advance. BUG-892 replaces the web `window.confirm` quit with an in-app Modal. BUG-941 envelope-strip is applied at the chat-bubble render boundary across all sessions and the new transcript view.

> **What changed since 2026-06-08**
> - **Learn Something New current flow.** Home's `home-action-study-new` quick action routes directly to `/create-subject`; the obsolete `ONBOARDING_FAST_PATH` flag is no longer part of the current mobile feature-flag set. First curriculum sessions use `POST /subjects/:subjectId/sessions/first-curriculum`, with `/ready` shown only for the first subject so the learner gets a reflection moment before opening chat.
> - **Session completion timing.** Tapping End Session closes the session and creates a pending summary row, but the normal `app/session.completed` pipeline is queued only after the learner submits or skips the "Your Words" reflection. Stale idle sessions are the exception: the stale-session cron auto-closes and dispatches completion with `summaryStatus='auto_closed'`.
> - **Notes and Challenge Round.** Topic-scoped tutoring sessions include note prompts/manual note entry, summary-to-note side effects, and the feature-gated Challenge Round path: eligible learners can accept a short evaluated challenge, then review/save a drafted note when there is solid evidence. Freeform Ask Anything does not offer Challenge Round; it offers bookmarks during chat and can offer notes at session end by asking the learner to add the session to Library first.

---

## Status legend

Each path below describes shipped, prod-active behavior unless tagged. Tags used inline:

- **prod-active** — running for real users in production today.
- **flag-gated** — code shipped, but a runtime flag keeps it dark or limited. Example: `CHALLENGE_ROUND_RUNTIME_ENABLED` is an API-side kill switch and defaults off unless set to `true`.
- **prompt-only** — implemented as an LLM prompt rule with no UI/route surface (e.g., the teach-first opener, the chatty fun-fact opener).
- **data-only** — backend computes/persists it, but no UI consumes it yet (e.g., `topicOrder`, `daysSinceLastReview`).

Where the actual prod-experience differs from the "intended" pedagogy described in a path, the gap is called out inline and cross-referenced to the relevant section of `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`.

---

## Overview: Tutoring Session Paths

| Path | Entry Point (current IA) | Session Type (DB) | UI Mode | Summary |
|---|---|---|---|---|
| **Freeform Chat** | Home Ask Anything bar (`home-ask-anything`) | `learning` | `freeform` | Open-ended — no subject or topic chosen upfront |
| **Learn Something New** | Home quick action (`home-action-study-new`) → `/create-subject` | `learning` | `learning` | Create/choose a subject, start the first curriculum topic, then continue as guided learning |
| **Guided Learning** | Library v3 single pane → topic detail (or subject carousel on home) | `learning` | `freeform` (scoped) | Focused on a specific topic within a subject |
| **Homework Help** | Home Homework quick action (`home-action-homework`) | `homework` | `homework` | Photo or typed math/science problem |
| **Practice / Review** | Topic detail | `learning` | `practice` | Timed review of a previously studied topic |
| **Retention Relearn** | Library v3 retention pills / recall-test failure / Practice hub "Review topics" | `learning` | `relearn` | Re-study a fading or forgotten topic |
| **Recitation** | Home Practice quick action (`home-action-practice`) → Practice hub "Recite" | `learning` | `recitation` | Recite a poem or text from memory; AI listens and prompts |

## Overview: Practice Activity Paths (non-session)

| Path | Entry Point | Backend | Summary |
|---|---|---|---|
| **Quiz** | Home Practice quick action → Practice hub "Quiz" | `POST /quiz/rounds` (generate), `POST /quiz/rounds/:id/check` (per answer), `POST /quiz/rounds/:id/complete` (submit) | Three activity types — Capitals, Vocabulary (per language subject), Guess Who. Server-validated answers with mid-round prefetch for instant Play Again. Past rounds discoverable via `/(app)/quiz/history` and `/(app)/quiz/[roundId]`. |
| **Dictation** | Home Practice quick action → Practice hub "Dictation" | `POST /dictation/generate` (LLM topic), `POST /dictation/prepare-homework` (sentence split), `POST /dictation/review` (multimodal photo review), `POST /dictation/results` (record) | TTS dictation with paced playback; optional photo review of handwriting; sentence-level remediation. |

Additionally, two **verification overlays** can activate within eligible learning/practice sessions:
- **Devil's Advocate** (`evaluate`) — AI presents a flawed explanation; learner finds the error
- **Feynman Technique** (`teach_back`) — learner explains the concept to a "clueless" AI

A separate **Challenge Round** can activate inside eligible learning sessions when the API flag is enabled. It is not a route-level path and not guaranteed after a fixed number of turns; the server gates it by session type, evidence, retention/readiness, quota, and cooldown.

---

## Path 0: Learn Something New / First Curriculum Session

### Who hits it
Learners who tap **Learn something new** on Home, use an Add subject affordance, or create a subject from an unresolved chat/homework prompt. This path creates or resolves the subject, gets the first usable curriculum topic, and opens a normal teaching session.

### Status (2026-06-08)
Shipped, prod-active. There is no current mobile `ONBOARDING_FAST_PATH` flag in `apps/mobile/src/lib/feature-flags.ts`. The first-curriculum route is the current path. API-side topic intent matching exists behind `MATCHER_ENABLED` and defaults off.

### Flow

```
Home
  └─ Tap "Learn something new" (`home-action-study-new`)
      └─ /create-subject
          │
          ├─ Learner types what they want to learn
          │
          ├─ Subject classification / resolution runs:
          │   ├─ direct_match           → silently creates, no confirmation card
          │   ├─ resolved (1 suggestion)→ "We'll start with X — Accept / Edit"
          │   ├─ resolved (n>1)         → suggestion list with chips
          │   └─ no-match               → "Want to create a new subject?"
          │
          ├─ Subject structure decided server-side (subject-classify.ts → subject.ts):
          │   ├─ broad         → bookSuggestions only; learner picks a book in /pick-book
          │   ├─ narrow        → topics generated synchronously (one default book wraps them)
          │   └─ focused_book  → book stub first; topics can materialize on first session start
          │
          └─ Routes by branch:
              ├─ broad                  → /pick-book/[subjectId]
              ├─ narrow / focused_book  → first curriculum session
              └─ language subject       → /onboarding/language-setup → first curriculum session

POST /subjects/:subjectId/sessions/first-curriculum
  ├─ Polls up to FIRST_CURRICULUM_SESSION_WAIT_MS = 25,000ms for a topic
  ├─ If a focused book has no topics yet, tries to materialize them inline
  ├─ If a topic is available:
  │   ├─ optionally runs topic-intent matching when `MATCHER_ENABLED=true`
  │   ├─ creates a `learning_sessions` row
  │   └─ returns sessionId + topicId
  └─ If still preparing:
      ├─ API returns 409 Conflict
      └─ Mobile retries up to 3 attempts, 2s apart

If first curriculum session is ready:
  ├─ First subject ever → /ready → learner taps CTA → Session Screen
  └─ Existing learner   → Session Screen directly

If still not ready after retries:
  ├─ First subject ever → /ready with subject/topic/raw input fallback
  └─ Existing learner   → Session Screen without precreated sessionId

→ The teaching session then behaves like Path 2 (Guided Learning):
  chat opens, the learner exchanges messages with the mentor, notes/challenge
  may appear, and End Session sends the learner to Session Summary.
```

### Status entry summary

| Item | Status |
|---|---|
| Per-subject interview screen | removed in Slice 1.5 PR 1c |
| `analogy-preference`, `interests-context`, `accommodations`, `curriculum-review` screens | removed from first-run onboarding |
| Teach-first first-turn rule | **prompt-only** (shipped TF-1..TF-8, but masked by chatty fun-fact opener — see "First-Turn AI Opener" below) |
| `startFirstCurriculumSession` 25s polling | shipped, prod-active |
| Curriculum pre-warm on subject create | shipped |
| Topic-grain intent matching | API flag-gated by `MATCHER_ENABLED`; defaults off |
| Topic-probe signal extraction | async Inngest extraction from early `session_events` |

### What gets recorded

| When | What | Where |
|---|---|---|
| Subject create | rawInput, resolvedName, focus, focusDescription, structureType | `subjects` |
| Topic-probe turns | user/assistant message events | `session_events` |
| Signal extraction | goals/experienceLevel/etc. | `learning_sessions.metadata.extractedSignals` |
| First-curriculum session create | sessionId, optional bookId | `learning_sessions` |
| Curriculum materialization (broad/focused_book) | books, topics | `curriculum_books`, `curriculum_topics` (deferred from subject create) |
| Teaching chat | user/assistant turns, quick actions, feedback, note/challenge metadata | `session_events`, `learning_sessions.metadata` |

---

## Path 1: Freeform Chat ("Just Ask Anything")

### Who uses it
Learners who are curious about something but don't want to navigate subjects or topics first. Also the default when the app doesn't know what the learner wants yet.

### Flow

```
Home Screen (LearnerScreen)
  └─ Tap Ask Anything bar (`home-ask-anything`)   ← was: "Ask" intent card; before that, "Start learning" → "Just ask anything"
      └─ Session Screen (mode=freeform, no subject, no topic)
                  │
                  ├─ Opening: "What's on your mind? I'm ready when you are."
                  │
                  ├─ Learner types first message (e.g., "How do volcanoes work?")
                  │   └─ Subject Classification (CFLF) runs:
                  │       ├─ 1 match → auto-picks subject silently
                  │       ├─ 2+ matches → "This sounds like Science or Geography. Which one?"
                  │       │   └─ Subject resolution chips appear
                  │       └─ 0 matches → "Want to create a new subject?"
                  │           └─ Navigate to Create Subject (returnTo=chat)
                  │
                  ├─ AI responds.
                  │   ├─ FIRST AI response (exchangeCount === 0) for non-language /
                  │   │   non-recitation learning sessions opens with the chatty
                  │   │   "fun fact" opener (`exchange-prompts.ts:455-468`,
                  │   │   unconditional, prompt-only). This contradicts both the
                  │   │   teach-first rule and the per-subject pedagogy below.
                  │   │   See "First-Turn AI Opener" cross-cutting note + audit
                  │   │   Section F + Slice 1 PR 5b.
                  │   │
                  │   └─ Subsequent AI responses use the subject's pedagogy:
                  │       ├─ Socratic (math/science): escalation ladder rungs 1→5
                  │       └─ Four Strands (languages): direct instruction, rotating strands
                  │
                  ├─ Learner and AI exchange messages...
                  │   ├─ Quick chips available: "Give me a hint", "Show an example", etc.
                  │   ├─ Voice mode toggle available (switches to ≤50-word responses)
                  │   └─ Each exchange writes session_events rows in real-time
                  │
                  └─ Learner taps "End Session"
                      ├─ API closes the session with `summaryStatus='pending'`
                      ├─ If still unfiled and there were at least 3 exchanges,
                      │   close-path auto-filing is requested in the background
                      └─ Session Summary opens:
                          ├─ "Your Words" reflection text box
                          │   └─ AI evaluates reflection quality and returns feedback
                          ├─ Optional "Write a note" CTA
                          │   ├─ If session already has `topicId` -> opens note input
                          │   └─ If session has no `topicId` -> asks to add session to Library first
                          ├─ OR "Skip for now"
                          └─ Recall Bridge questions (homework sessions only — not here)
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Every message | User message + AI response events | `session_events` |
| Every message | Exchange count, escalation rung | `learning_sessions` |
| Session close | Duration (active + wall-clock), status | `learning_sessions` |
| Auto-filing (if eligible) | New topic created/linked from transcript | `curriculum_topics`, `learning_sessions.topicId` |
| Freeform note (if learner accepts Library filing) | Topic-bound learner-note | `topic_notes` with `sessionId` |
| Post-session pipeline | SM-2 retention card | `retention_cards` |
| Post-session pipeline | Progress snapshot (daily aggregate) | `progress_snapshots` |
| Post-session pipeline | Session embedding (1024-dim vector) | `session_embeddings` |
| Post-session pipeline | Learner profile analysis (consent-gated) | `learning_profiles` |
| Post-session pipeline | Streak + XP | `streaks`, `xp_ledger` |
| Post-session pipeline | Topic suggestions ("What next?") | `topic_suggestions` |

### Key behavior
- Freeform close does not block the learner on a manual filing prompt. If the session is still unfiled and has at least 3 exchanges, close-path auto-filing is requested in the background.
- The post-session Inngest pipeline can wait up to 60s for filing resolution before computing topic-bound retention. If filing does not resolve in time, the pipeline proceeds with the best available placement and filing retry/observer jobs handle recovery.
- Freeform does not offer Challenge Round.
- Freeform live-chat saving uses bookmarks. Learner-notes are offered at the end/session summary; if the session is unfiled, the app asks the learner to add the session to Library before opening note input. Declining Library filing saves no topic-bound note, but the session transcript and any bookmarks remain.

---

## Path 2: Guided Learning (Subject + Topic)

### Who uses it
Learners following a curriculum — they've picked a subject, a book, and a specific topic.

### Flow

```
Library v3 (single-pane topic-first view)
  └─ Expand a subject shelf (or land on it via the home subject carousel)
      └─ Tap a book card (inline)
          └─ Tap a topic row (retention pill visible)
              └─ Topic Detail Screen
                  ├─ Shows: topic title, description, completion status, retention status
                  │
                  ├─ [not_started] "Start Learning" button
                  ├─ [in_progress] "Continue Learning" (primary) + "Start Review" (secondary)
                  └─ [completed] "Start Review" (primary) + "Continue Learning" (secondary)
                      │
                      └─ Session Screen (mode=freeform, subjectId + topicId pre-set)
                          │
                          ├─ Opening: topic-specific greeting
                          │   (e.g., "Let's explore Plate Tectonics together!")
                          │
                          ├─ No subject classification needed — subject is already known
                          │
                          ├─ AI responds using subject's pedagogy mode:
                          │   ├─ Socratic: guided questions, escalation ladder
                          │   └─ Four Strands: direct teaching, strand rotation
                          │
                          ├─ Learner and AI exchange messages
                          │   ├─ every user message + AI reply is stored as session events
                          │   ├─ learner can use quick chips and switch input mode
                          │   ├─ learner can add a note from the session tools
                          │   └─ LLM can surface a note prompt via the response envelope
                          │
                          ├─ Challenge Round may be offered (flag-gated)
                          │   ├─ only when `CHALLENGE_ROUND_RUNTIME_ENABLED=true`
                          │   ├─ server also requires enough exchanges, correct-streak evidence,
                          │   │   retention/readiness, quota, and no cooldown block
                          │   ├─ learner can Accept / Decline / Don't ask again
                          │   └─ if accepted, the round asks up to 3 evaluated questions
                          │
                          ├─ SM-2 may auto-trigger verification overlays:
                          │   ├─ Devil's Advocate: "Here's how I'd explain it... can you
                          │   │   spot what's wrong?"
                          │   └─ Feynman: "Pretend I know nothing — explain this to me"
                          │
                          └─ Learner taps "End Session"
                              ├─ API closes the session with `summaryStatus='pending'`
                              ├─ creates/updates a `session_summaries` row
                              └─ navigates to Session Summary
                                  ├─ "Your Words" reflection text box
                                  │   ├─ learner submits ≥10 chars
                                  │   ├─ LLM evaluates reflection quality
                                  │   ├─ feedback appears as "Mate feedback"
                                  │   └─ submitted reflection can auto-create a topic note
                                  └─ OR "Skip for now"
                                      └─ queues post-session processing without learner reflection
```

### What gets recorded
Same as freeform, **except**:
- No filing step — the topic already exists, so `topicId` is set from session start
- The post-session pipeline does **not** wait for a filing event
- Retention card updates immediately attach to the existing topic

---

## Path 3: Homework Help

### Who uses it
Learners with homework problems — typically math or science. Can photograph the problem or type it manually.

### Flow

```
Home Screen (LearnerScreen)
  └─ Tap Homework quick action (`home-action-homework`)   ← was: "Homework" intent card; no /learn-new step
      └─ Camera Screen
          ├─ Camera permission check (two sub-states: first-request vs permanently-denied/Settings-redirect; auto-refreshes on app resume)
          ├─ Take photo of homework problem
          │   └─ Preview + OCR processing
          │       ├─ OCR succeeds → extracted text shown for review
          │       │   └─ Learner can edit/correct OCR text
          │       └─ OCR fails/weak → manual text entry fallback
          ├─ OR pick from gallery (HOMEWORK-05)
          ├─ OR pass image straight to multimodal LLM (HOMEWORK-06)
          └─ OR type manually
              │
              └─ Session Screen (mode=homework)
                  │
                  ├─ Opening: shows the captured problem text
                  │
                  ├─ Sub-mode selection (per problem):
                  │   ├─ "Help Me Solve It" (help_me)
                  │   │   → AI explains approach → shows parallel worked example
                  │   │   → lets learner try → checks their work
                  │   │
                  │   └─ "Check My Answer" (check_answer)
                  │       → AI verifies answer → if wrong, identifies specific error
                  │       → shows parallel worked example → no Socratic follow-up
                  │
                  ├─ Multi-problem navigation:
                  │   └─ Learner can advance to next problem within the same session
                  │       (each problem can use a different sub-mode)
                  │
                  ├─ No Socratic escalation ladder in homework mode
                  │   (direct explanation, not questioning)
                  │
                  └─ Learner taps "End Session"
                      └─ Filing Prompt appears:
                          ├─ "Yes, add it" → classifies + files to library
                          └─ "No thanks" → Session Summary
                              ├─ "Your Words" summary
                              ├─ OR "Skip"
                              └─ Recall Bridge: 3 auto-generated review questions
                                  (homework-only feature)
```

### What gets recorded
Everything from the freeform path, **plus**:

| When | What | Where |
|---|---|---|
| Per problem | `homework_problem_started` / `homework_problem_completed` events | `session_events` |
| Per problem | Problem text, sub-mode (`help_me`/`check_answer`) | `session_events.metadata` |
| Session close | Problem count in metadata | `learning_sessions.metadata.homework` |
| Post-session pipeline | Homework summary (parent-facing) | `learning_sessions.metadata.homeworkSummary` |

The homework summary includes: `problemCount`, `practicedSkills`, `independentProblemCount`, `guidedProblemCount`, `summary`, `displayTitle`. This is what parents see on the dashboard.

---

## Path 4: Practice / Review Session

### Who uses it
Learners revisiting a topic they've already studied — to reinforce retention.

### Flow

```
Topic Detail Screen (status: in_progress or completed)
  └─ Tap "Start Review Session"
      └─ Session Screen (mode=practice, subjectId + topicId)
          │
          ├─ Header shows: "Practice Session" title + visible timer
          │
          ├─ AI uses spaced-repetition-aware context:
          │   └─ System prompt includes the topic's retention status
          │       (strong/fading/weak/forgotten) to calibrate difficulty
          │
          ├─ SM-2 may auto-trigger verification:
          │   ├─ Devil's Advocate (evaluate)
          │   └─ Feynman Technique (teach_back)
          │
          └─ Learner taps "End Session"
              └─ Navigate directly to Session Summary
                  (no filing prompt — topic exists)
```

### What gets recorded
Same as guided learning. The `practice` UI mode maps to `sessionType: 'learning'` at the API level — no special recording differences.

---

## Path 5: Retention Relearn

### Who uses it
Learners whose retention on a topic has decayed — triggered from the library's retention alerts or the recall-test flow.

### Flow

```
Library v3 (single pane — retention pills shown inline on each topic row)
  └─ Tap a fading or weak topic
      └─ Topic Detail Screen (shows retention status)
          └─ Tap "Start Learning" or navigate from recall failure
              │
              └─ Recall Test Screen (optional pre-check)
              │   ├─ Shows recall questions for the topic
              │   ├─ Learner self-rates: "I remembered" / "I didn't remember"
              │   │
              │   ├─ If recalled → topic retention updated, return to topic detail
              │   └─ If failed → Relearn Screen
              │
              └─ Relearn Screen
                  ├─ "Same method" — re-study with the same approach as last time
                  ├─ "Different method" — pick an alternative teaching method
                  │   └─ Shows method options (e.g., "Analogy-based", "Step-by-step")
                  │
                  └─ Session Screen (mode=relearn, subjectId + topicId)
                      │
                      ├─ AI knows this is a relearn session — uses remediation pedagogy
                      │   (focuses on gaps, uses different examples than original session)
                      │
                      └─ Learner taps "End Session"
                          └─ Session Summary (no filing prompt — topic exists)
```

### What gets recorded
Same as guided learning, with the SM-2 retention card getting a fresh review cycle. If the learner chose "different method," the method preference is stored for future relearn suggestions.

---

## Path 6: Recitation Session

### Who uses it
Learners memorising something verbatim — a poem, lines for a play, a multiplication table chant, a religious text. Recitation differs from chat tutoring: the learner produces the content and the AI listens for fidelity.

### Flow

```
Home Screen
  └─ Tap Practice quick action (`home-action-practice`)
      └─ Practice Hub (/(app)/practice)
          └─ Tap "Recite"
              └─ Session Screen (mode=recitation)
                  │
                  ├─ Opening: AI asks what to recite (or accepts a paste)
                  │
                  ├─ Voice mode is the natural input here
                  │
                  ├─ Each exchange: learner recites, AI prompts at gaps,
                  │   confirms correct lines, gently surfaces the missed word
                  │   when the learner stalls (no Socratic ladder)
                  │
                  └─ Learner taps "End Session"
                      └─ Session Summary (no close-time filing prompt)
```

### What gets recorded
Same shape as a guided session — `learning_sessions.uiMode = 'recitation'`. Verification overlays are not used. Topic-bound post-session outputs depend on whether the session already has subject/topic context; the close handler does not show a filing prompt for recitation.

---

## Path 7: Quiz Activity

### Who uses it
Learners who want low-friction practice — three to ten questions, instant feedback, an XP bump, no commitment to a tutoring session.

### Flow

```
Home Screen
  └─ Tap Practice quick action (`home-action-practice`)
      └─ Practice Hub (/(app)/practice)
          └─ Tap "Quiz"
              └─ Quiz Index (/(app)/quiz)
                  ├─ Capitals card             — always available
                  ├─ Vocabulary: <Language>    — one card per active four_strands subject
                  └─ Guess Who card            — always available
                      │
                      └─ Quiz Launch (/(app)/quiz/launch)
                          ├─ POST /quiz/rounds (LLM generates round)
                          ├─ Rotating loading copy:
                          │   "Shuffling questions..." → "Picking a theme..." → "Almost ready..."
                          ├─ After 20s: "taking longer than usual" hint + Cancel still available
                          └─ Errors classified by typed code:
                              ├─ QUOTA_EXCEEDED  → message + no Retry button (Go Back only)
                              ├─ FORBIDDEN       → message + no Retry
                              ├─ CONSENT_*       → message + no Retry (consent gate handles it)
                              └─ Other           → message + Retry button
                              │
                              └─ Quiz Play (/(app)/quiz/play)
                                  │
                                  ├─ Question header: "1 of 7" + dot indicators + elapsed seconds
                                  │
                                  ├─ For Capitals/Vocabulary:
                                  │   "What is the capital of <Country>?" / "Translate: <term>"
                                  │   4 options as large tappable cards
                                  │   Server checks via POST /quiz/rounds/:id/check
                                  │   Wrong answer: selected option turns red, others fade
                                  │   Correct answer: selected option turns green
                                  │   Optional fun fact card under the answer
                                  │
                                  ├─ For Guess Who:
                                  │   Reveals clues progressively, learner submits guess
                                  │   Score scales with cluesUsed (fewer clues → higher quality)
                                  │
                                  ├─ Mid-round prefetch at 50% progress
                                  │   POST /quiz/rounds (next round generated server-side)
                                  │   so "Play Again" on the results screen feels instant
                                  │
                                  ├─ Mid-round quit: close icon top-left → in-app Modal confirms quit (BUG-892 replaced web `window.confirm`) → goBackOrReplace('/(app)/quiz')

                                  ├─ Advance: BUG-929 / CR-PR129-M4 resets `answerState`, `selectedAnswer`,
                                  │   `freeTextAnswer`, `guessWhoCluesUsed`, and the per-question timer
                                  │   in the same React batch (no flash of stale state)
                                  │
                                  ├─ After last question: POST /quiz/rounds/:id/complete
                                  │   On error: inline retry card with Retry / Exit (no silent recovery)
                                  │
                                  └─ Quiz Results (/(app)/quiz/results)
                                      │
                                      ├─ Celebration tier (server-decided):
                                      │   perfect → trophy + BrandCelebration animation
                                      │   great   → star    + BrandCelebration animation
                                      │   nice    → thumbs-up (no big animation)
                                      │
                                      ├─ Score: <correct>/<total> + theme + +XP pill
                                      ├─ For Guess Who: also "X of Y people identified"
                                      │
                                      ├─ Play Again
                                      │   ├─ If prefetched round is hydrated → replace to /play
                                      │   └─ Else → replace to /launch (fresh generate)
                                      │
                                      └─ Done → goBackOrReplace('/(app)/practice')

After dismissal, the round remains discoverable:
  └─ /(app)/quiz/history (list of past rounds)
      └─ /(app)/quiz/[roundId] (per-round detail; Guess Who rows show first clue truncated as the prompt — BUG-932)
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Round generate | Round seed, theme, questions (with answers stripped before send to client) | `quiz_rounds` |
| Per-answer check | Server validates answer; client never sees the correct option until results | `quiz_rounds` (per-question result rows on complete) |
| Round complete | Score, total, time per question, clues used (Guess Who), `celebrationTier`, XP awarded | `quiz_rounds`, `xp_ledger` |
| Round complete | Stats aggregate (best score, rounds played per activity) | `quiz_stats` (powers Practice hub + Quiz Index subtitles) |
| Round complete | Celebration queued (perfect / great rounds) | celebration queue surfaced on next Home visit |

### Key behavior

- **Server-checked answers only** — the client receives shuffled options with the correct answer stripped, then submits each guess to `POST /quiz/rounds/:id/check`. This blocks "open the bundle and read the answer" cheating.
- **Mid-round prefetch** — at 50% progress the next round is generated and persisted server-side; the results screen eagerly hydrates that round into TanStack Query so Play Again skips the loading screen.
- **Typed error classification** — quota, consent, and forbidden errors hide the Retry button instead of bouncing the user into a useless retry loop. Code lives in `(app)/quiz/launch.tsx` and matches CLAUDE.md's "classify errors before formatting" rule.
- **Full-screen layout** — the tab bar is hidden across all four quiz screens (`FULL_SCREEN_ROUTES` in `(app)/_layout.tsx`).

---

## Path 8: Dictation Activity

### Who uses it
Learners practising spelling and writing in a target language — primary use case is grade-school children doing home dictation in Czech, English, French, etc. Either photograph a school text and have the app read it back, or let the LLM generate an age-appropriate piece.

### Flow

```
Home Screen
  └─ Tap Practice quick action (`home-action-practice`)
      └─ Practice Hub
          └─ Tap "Dictation"
              └─ Dictation Choice (/(app)/dictation)
                  │
                  ├─ "I have a text"  → Camera (homework camera) → OCR
                  │   └─ Text Preview (/(app)/dictation/text-preview)
                  │       ├─ Shows OCR'd text in editable TextInput
                  │       ├─ Learner edits any OCR errors
                  │       └─ Tap "Start dictation"
                  │           └─ POST /dictation/prepare-homework
                  │               (LLM splits sentences + annotates punctuation)
                  │               └─ → Playback
                  │
                  └─ "Surprise me"  → POST /dictation/generate
                      ├─ Loading: "Picking a topic..." then reveals topic
                      ├─ LLM generates 6-12 sentences age-appropriate to recent topics
                      └─ → Playback
                          │
                          └─ Playback (/(app)/dictation/playback)
                              │
                              ├─ Top control strip:
                              │   ├─ Pace pill (Slow / Normal / Fast — cycles on tap)
                              │   ├─ Punctuation toggle (read-aloud on/off)
                              │   ├─ Skip current sentence
                              │   └─ Progress "n / total"
                              │
                              ├─ Countdown in target language ("Pripravit? 3...2...1...")
                              ├─ TTS reads each sentence at selected pace
                              ├─ Pause = base + wordCount * paceMultiplier
                              ├─ Tap anywhere below the strip → pause/resume
                              ├─ Tap repeat button → replays current sentence from start
                              ├─ Hardware back → confirm dialog ("Are you sure?")
                              │
                              └─ After last sentence
                                  └─ Complete (/(app)/dictation/complete)
                                      │
                                      ├─ "Well done! Want to check your work?"
                                      │
                                      ├─ "Check my writing"
                                      │   ├─ Camera capture of handwritten paper
                                      │   ├─ POST /dictation/review (image base64 + sentences)
                                      │   │   (multimodal LLM compares handwriting to original)
                                      │   └─ Review (/(app)/dictation/review)
                                      │       │
                                      │       ├─ If 0 mistakes:
                                      │       │   "Perfect!" celebration screen → Done
                                      │       │
                                      │       └─ If mistakes:
                                      │           "{N} mistakes found"
                                      │           Per-mistake card:
                                      │             Original / You wrote / Error / Correct version / Explanation
                                      │           Retype input (autocorrect off, accepts whatever child types)
                                      │           Submit → next mistake → "You fixed all {N} mistakes!"
                                      │           Done → POST /dictation/results (reviewed=true)
                                      │
                                      ├─ "I'm done"
                                      │   └─ POST /dictation/results (reviewed=false)
                                      │       On save error: Alert with Retry / Continue without saving
                                      │
                                      └─ "Try another dictation" → back to Dictation Choice
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Result save (Done or after Review) | `localDate`, sentenceCount, mistakeCount (null if not reviewed), mode (`homework` / `surprise`), reviewed flag | `dictation_results` |
| Pace + punctuation preferences | Per profile, stored on device | SecureStore keys `dictation-pace-${profileId}`, `dictation-punctuation-${profileId}` |
| Streak | Consecutive days of dictation practice (any dictation counts), per profile | `dictation_streaks` |

### Key behavior

- **Client-driven playback** — once the structured sentences arrive from the server, the entire playback is local. No network calls during dictation.
- **Tab bar is hidden across all five screens** — minimises mis-taps while the child is looking at paper, not the phone.
- **Photo review depends on multimodal LLM** — same image-pass-through pipeline that powers the homework vision feature. If the feature flag is off the "Check my writing" button is hidden.
- **Mid-dictation exit is an explicit user choice** — hardware back triggers a destructive-style Alert ("Your dictation progress won't be saved") with Keep going / Leave.
- **No silent recovery on result save failure** — both `complete.tsx` and `review.tsx` surface the typed error message and offer Retry / Continue without saving (per CLAUDE.md "silent recovery without escalation is banned").

---

## Bookmarks (Within Any Tutoring Session)

Learners can save AI messages mid-session. After a few AI responses, a one-time `BookmarkNudgeTooltip` appears (gated per profile via `bookmark-nudge-shown` SecureStore key) and offers an inline "Bookmark now" CTA that bookmarks the latest AI message.

```
During any tutoring session...
  └─ Long-press / tap-bookmark on an AI message bubble
      └─ POST /bookmarks → toast confirmation
          │
          └─ Bookmark visible later at /(app)/progress/saved
              ├─ Infinite list (`useBookmarks`)
              ├─ Swipe-to-delete (`useDeleteBookmark`)
              └─ Parent-proxy mode hides delete (read-only)
```

Bookmarks do not change session pedagogy or recording — they are a per-message side index for the learner.

---

## Notes (Within Tutoring Sessions)

Learners can save their own notes while learning. Notes are topic-bound: the session needs a `topicId` before the note can be saved directly.

For freeform Ask Anything, note capture is an end-of-session flow. If the freeform session is already filed to a topic, the note input can open directly. If it is still unfiled, the learner first sees a Library filing consent step because the note will live in Library as a normal topic note. Declining filing means no learner-note is saved; bookmarks remain the instant-save option for mentor replies.

```
During a teaching session...
  ├─ Learner taps Add note in the session tools
  │   └─ NoteInput opens under the composer
  │       └─ Save → POST topic note with sessionId attached
  │
  ├─ LLM emits `ui_hints.note_prompt.show=true`
  │   ├─ after enough real exchange, usually when the learner explains
  │   │   something correctly in their own words
  │   └─ app shows "Write note" prompt / opens NoteInput
  │
  ├─ LLM emits `ui_hints.note_prompt.post_session=true`
  │   └─ app opens note input near the end-of-session prompt
  │
  ├─ Challenge Round finishes with solid learner evidence
  │   └─ app can show a drafted note for learner review
  │       ├─ Save → topic note created
  │       └─ Skip → no note saved
  │
  └─ Learner submits "Your Words" reflection on Session Summary
      └─ API may auto-create a topic note from the reflection
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Manual note / LLM note prompt | learner-authored note body, topicId, optional sessionId | notes tables via `useCreateNote` |
| Challenge drafted note | learner-reviewed note body, topicId, sessionId | notes tables |
| Reflection auto-note | submitted summary content copied to topic note when a topic exists | notes tables |

### Key behavior

- The LLM can request that the UI offer a note, but the learner still chooses whether to write or save it.
- A note cannot be saved without a topic; the app surfaces a save error instead of silently dropping it.
- Topic note caps are enforced server-side. Summary-to-note creation treats a cap conflict as non-fatal so summary submission still succeeds.

---

## First-Turn AI Opener (All Learning-Type Sessions)

Status: **prompt-only**, prod-active, **conflicts with the teach-first rule** that also ships in the same prompt files.

For every tutoring session whose `sessionType === 'learning'` and whose `uiMode` is neither language (`four_strands` pedagogy) nor `recitation`, the first AI response (`exchangeCount === 0`) is opened with an unconditional "fun fact" instruction in the prompt:

> "Open with a surprising or fun fact about it to spark curiosity, then invite them into the conversation..."

Source: `apps/api/src/services/exchange-prompts.ts` lines 455–468. No flag gates this. It applies to Path 1 (Freeform), Path 2 (Guided), Path 4 (Practice), and Path 5 (Relearn). Path 3 (Homework) is exempt because `sessionType === 'homework'`. Path 6 (Recitation) is exempt by `!isRecitation`. Language subjects are exempt by `!isLanguageMode`.

Why it matters here: the audit doc and the teach-first prompt rule (TF-1..TF-8, Epic 12.2) both ask the first AI message to teach one concrete idea and ask one focused learner action. The fun-fact opener fights with both — the model ends up doing fun fact + teach + ask, which is three things instead of one teach + one action. **Audit Section F + Slice 1 PR 5b remove this opener** as part of locking in the first-turn rule.

Until 5b ships, the path-by-path "AI responds using the subject's pedagogy" descriptions below describe the steady state from exchange #2 onward. Exchange #1 is the fun-fact opener.

---

## Next-Topic Recap Card (All Tutoring Paths)

Status: **shipped, prod-active.** Applies to Freeform, Guided, Homework, Practice, Relearn, and Recitation summary screens.

After the session is resolved (learner submits or skips the Session Summary reflection, or stale cleanup auto-closes the session), the API can generate learner-facing recap fields. The mobile summary screen polls/refreshes those fields and renders `session-next-topic-card` when `nextTopicId` and `nextTopicTitle` are available.

```
Session resolved
  └─ `app/session.completed` Inngest pipeline runs
      └─ session-recap.ts (lines 33–34, 79, 107–125, 387–388) generates:
          ├─ nextTopicId
          ├─ nextTopicTitle
          └─ nextTopicReason   (one-line "why this topic next" copy)
              │
              └─ Persists onto sessionSummary; schema fields at
                 packages/schemas/src/sessions.ts lines 426–428

Session Summary screen (apps/mobile/src/app/session-summary/[sessionId].tsx)
  ├─ initially shows existing summary/takeaway content
  ├─ shows a recap skeleton while learner recap is still loading
  └─ when next-topic fields arrive, renders `session-next-topic-card`
      └─ "Continue learning" opens a guided session at nextTopicId

Next session opens
  └─ session-context-builders.ts:324 feeds nextTopicReason back into
     the new session's system prompt so the AI opens with continuity
```

What is **not yet wired** (audit Section E):

- `topicOrder` — the ordered topic id list for the subject — is in the API response (`packages/schemas/src/subjects.ts:333`) but the mobile recap card does not render it as an ordered preview ("present tense → irregulars → sentence practice → mixed recall"). Slice 2 wires this up.
- The "next time we'll start with X" home-screen teaser at second-session open does not exist (no payload field, no component). Slice 2 adds it.

The recap is independent of the learner staying on the page. It may arrive after the Summary screen first renders, and a retry/skeleton state is expected. Topic-bound next-topic CTAs require a subject/topic context; freeform sessions with unresolved filing may still complete post-session processing without a topic-bound recommendation.

---

## Challenge Round (Within Eligible Learning Sessions)

Status: **code shipped, API flag-gated.** `CHALLENGE_ROUND_RUNTIME_ENABLED` defaults to `false`; while false, the prompt block is not injected, LLM challenge signals are ignored, and mobile receives no `challengeOffer`, `challengeRound`, or `draftedNote` fields.

Challenge Round is not the same as the `evaluate` verification overlay. It is a short transfer/application check inside an ordinary learning session, followed by mastery/review persistence and optional note capture.

### Eligibility

The server can offer a Challenge Round only when all of these are true:

- Session type is `learning`.
- Learner is in normal struggle status.
- The session has at least 5 exchanges.
- Recent correct streak is at least 2.
- Retention is strong, or the topic is new with stronger current-session evidence: at least 7 exchanges, 4 solid answers, and a 4-answer correct streak.
- Quota has at least 3 turns remaining; free tier also needs at least 5% quota fraction remaining.
- There is no active/offered/declined round blocking this session, and no recent decline cooldown for the same topic.

### Flow

```
During a learning session...
  └─ Server says the learner is eligible
      └─ LLM may emit `signals.challenge_round_offer=true`
          └─ Mobile shows ChallengeOfferCard
              ├─ Accept
              │   └─ POST /v1/challenge-round/accept
              │       └─ Next exchange starts active round
              │           ├─ app shows ChallengeRoundBanner
              │           ├─ LLM asks up to 3 questions
              │           ├─ after each learner answer, LLM emits structured
              │           │   `challenge_round_evaluation`
              │           └─ server validates answer event ids and advances state
              │
              ├─ Decline
              │   └─ records declined state for this session
              │
              └─ Don't ask again
                  └─ records session decline + topic cooldown

When the final challenge answer is evaluated:
  ├─ all solid        → mastery evidence is persisted
  ├─ partial/misconception → review targets are persisted
  ├─ all missing      → no mastery; reteach path
  └─ solid evidence   → app may show DraftedNoteReview
      ├─ Save note
      └─ Skip note
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Offer/accept/decline/active/drafting/complete | Challenge Round state | `learning_sessions.metadata.challengeRound` |
| Each evaluated answer | concept, result (`solid`/`partial`/`missing`/`misconception`), answerEventId, correction/evidence | AI event metadata + challenge state |
| Verified all-solid result | transfer-depth mastery evidence | `assessments` |
| Partial/misconception result | review targets for follow-up | `needs_deepening_topics` |
| Challenge note | learner-approved note from solid evidence | notes tables |

---

## Verification Overlays (Within Any Learning Session)

These are not separate paths — they activate **within** an ongoing learning or practice session when the SM-2 system determines the learner is ready.

### Devil's Advocate (evaluate)

```
During a learning session...
  └─ SM-2 detects topic is ready for challenge
      └─ AI switches to evaluation mode:
          "Here's how I'd explain [concept]..."
          (explanation contains a deliberate, plausible flaw)
          │
          └─ Learner tries to identify the flaw
              ├─ Correct → AI confirms, quality score recorded
              └─ Incorrect → AI reveals the flaw, explains why
                  │
                  └─ Hidden JSON assessment recorded:
                      { challengePassed, flawIdentified, quality }
                      └─ Maps to SM-2 quality score (0-5)
```

### Feynman Technique (teach_back)

```
During a learning session...
  └─ SM-2 detects topic is ready for deep check
      └─ AI switches to teach-back mode:
          "Pretend I don't know anything about [concept].
           Can you explain it to me?"
          │
          └─ Learner explains the concept
              └─ AI probes gaps: "What about...?" "Why does...?"
                  │
                  └─ Hidden JSON rubric recorded:
                      { completeness, accuracy, clarity,
                        overallQuality, weakestArea, gapIdentified }
                      └─ Maps to SM-2 quality score
```

---

## Post-Session Pipeline (All Paths)

The normal path is **not** "End Session immediately runs all background work." Current flow is:

```
Learner taps End Session
  └─ POST /sessions/:sessionId/close
      ├─ closes `learning_sessions`
      ├─ writes wall-clock + active duration
      ├─ creates/updates `session_summaries`
      └─ sets `summaryStatus='pending'`
          │
          └─ No `app/session.completed` dispatch yet

Session Summary
  ├─ Submit "Your Words"
  │   ├─ POST /sessions/:sessionId/summary
  │   ├─ LLM evaluates the reflection
  │   ├─ status becomes `accepted` or `submitted`
  │   ├─ reflection bonus XP can be applied
  │   ├─ reflection may auto-create a topic note
  │   └─ dispatches `app/session.completed`
  │
  └─ Skip for now
      ├─ POST /sessions/:sessionId/summary/skip
      ├─ status becomes `skipped`
      └─ dispatches `app/session.completed`

Stale idle session
  └─ session-stale-cleanup cron auto-closes after 30 minutes idle
      ├─ status becomes `auto_closed`
      └─ dispatches `app/session.completed` with reason `silence_timeout`
```

Once `app/session.completed` is dispatched, the Inngest function runs the post-session pipeline. The exact steps vary by session type and available topic context:

```
`app/session.completed`
  │
  ├─ [freeform/homework only] Wait for filing (up to 60s)
  │
  ├─ Step 1: Process verification (evaluate/teach_back scoring)
  ├─ Step 1b: Update SM-2 retention cards
  ├─ Step 1c: Extract vocabulary (language subjects only)
  ├─ Step 1d: Update needs-deepening progress
  ├─ Step 1e: Check milestone completion (language subjects)
  ├─ Step 2: Refresh progress snapshot + coaching card + pending summary row
  ├─ Step 2b: Generate parent-facing session insights
  ├─ Step 2c: Generate learner recap / next-topic fields
  ├─ Step 2d: Generate and store structured LLM session summary
  ├─ Step 3: Analyze learner profile (consent + GDPR gated, LLM call)
  ├─ Step 4: Update streaks + award XP
  ├─ Step 5: Generate session embedding (vector for similarity search)
  ├─ Step 6: [homework only] Extract homework summary (parent-facing)
  ├─ Step 7: Track summary skip count
  ├─ Step 8: Update pace baseline (median response time)
  └─ Step 9: Queue celebrations (streaks, mastery, verification success)
```

Daily reconciliation also protects the summary layer: `summary-reconciliation-cron` scans recent ended sessions for missing summary rows, missing LLM summaries, or missing learner recaps and fans out create/regenerate events without replaying the full `app/session.completed` pipeline.

---

## Mode Comparison Matrix — Tutoring Sessions

| Aspect | Freeform | Guided | Homework | Practice | Relearn | Recitation |
|---|---|---|---|---|---|---|
| Subject known at start | No | Yes | Sometimes | Yes | Yes | Optional |
| Topic known at start | No | Yes | No | Yes | Yes | Optional |
| Subject classification | On first message | Skipped | On first message | Skipped | Skipped | Skipped |
| Filing on close | Background auto-file if eligible | No | Manual filing prompt | No | No | No |
| Pedagogy | Depends on subject | Depends on subject | Direct (no Socratic) | Depends on subject | Remediation-focused | Verbatim recall, no Socratic |
| Escalation ladder | Yes (if Socratic) | Yes (if Socratic) | No | Yes (if Socratic) | Yes (if Socratic) | No |
| Verification overlays | None | evaluate / teach_back | None | evaluate / teach_back | None | None |
| Challenge Round | Topic-bound only, flag-gated | Flag-gated | No | Flag-gated | Flag-gated | No |
| Timer visible | No | No | No | Yes | No | No |
| Question count visible | No | No | Yes | No | No | No |
| Recall bridge | No | No | Yes | No | No | No |
| Homework summary | No | No | Yes (parent-facing) | No | No | No |
| Voice mode available | Yes | Yes | Yes | Yes | Yes | Yes (primary) |
| Session type in DB | `learning` | `learning` | `homework` | `learning` | `learning` | `learning` |
| UI mode | `freeform` | `freeform` | `homework` | `practice` | `relearn` | `recitation` |

## Mode Comparison Matrix — Practice Activities (non-session)

| Aspect | Quiz | Dictation |
|---|---|---|
| Subject known at start | Optional (Vocab quiz needs one) | No |
| Topic known at start | No | No |
| Filing prompt on close | No | No |
| Verification overlays | N/A | N/A |
| Server-validated answers | Yes (per-question check) | Yes (multimodal review of handwriting, optional) |
| Mid-activity prefetch | Yes (next round at 50% progress) | No |
| XP awarded | Yes (`celebrationTier`) | Streak only — no XP in v1 |
| Streak | Daily quiz play counts | Daily dictation play counts |
| Tab bar visible | No | No |
| Persistence on mid-activity exit | No (round dropped) | No (Alert on hardware back) |
| Database table | `quiz_rounds`, `quiz_stats` | `dictation_results`, `dictation_streaks` |

---

## Cross-Cutting Dimensions

These settings apply across all paths and modify the AI's behavior:

| Dimension | Values | Scope | Effect |
|---|---|---|---|
| **Pedagogy mode** | `socratic` / `four_strands` | Per subject | Socratic ladder vs. direct instruction with strand rotation |
| **Learning mode** | `serious` / `casual` | Per profile | Academic rigor vs. relaxed pacing |
| **Input mode** | `text` / `voice` | Per session | Full responses vs. ≤50-word spoken-style responses |
| **Celebration level** | `all` / `milestones` / `none` | Per profile | Controls which celebrations appear |
| **Conversation language** | BCP-47 (mandatory at onboarding) | Per profile | Language the AI tutor speaks/writes in. Distinct from per-subject native language and from the app UI locale |
| **Pronouns** | free-form / declined below `PRONOUNS_PROMPT_MIN_AGE` | Per profile | Used in AI-generated prose to address the learner correctly |
| **Interests context** | free-form snippet, inserted by interview when LLM returns interests | Per profile | Seeds analogies and examples in tutoring prompts |
| **App UI locale** | en / nb / de / es / pl / pt / ja | Per profile | Translates UI strings (errors, dictation alerts, camera permission, sso-callback) via `t()`. Editable inline from More |
| **Active profile lens** | owner / impersonated-child | Per navigation | Profile-as-lens phase 1: destructive actions in More are hidden when `useActiveProfileRole() === 'impersonated-child'` |

Cross-cutting render guard:
- **Envelope-strip at chat-bubble boundary (BUG-941).** Every AI message bubble in every tutoring path — and the read-only session transcript view — passes through `stripEnvelopeJson` so any leaked envelope JSON or `[MARKER]` token is hidden from the learner and the parent.

---

## What Parents See

Parents don't use learning paths directly. They see the **outputs** of the recording pipeline:

| Surface | Data Source |
|---|---|
| Dashboard activity feed | `learning_sessions` + `session_events` |
| Session recap block (Parent Narrative Phase 1, commit 68a2288c) | `learning_sessions.metadata` summary fields, surfaced as a recap card on parent dashboard |
| Read-only session transcript (`session-transcript/[sessionId]`, BUG-889, top-level route not under `(app)/`) | `session_events` (user_message + ai_response), bubbles run through `stripEnvelopeJson` |
| Homework summary | `learning_sessions.metadata.homeworkSummary` |
| Subject progress | `progress_snapshots` |
| Understanding card (replaced "Mastery" in Parent Narrative Phase 1) | Aggregated from `progress_snapshots` + `learning_profiles`; retention badges gated until enough signal |
| Retention status per topic | `retention_cards` (gated visibility per Parent Narrative Phase 1) |
| Learner strengths/struggles | `learning_profiles` (consent-gated) |
| Weekly progress report (`/(app)/child/[profileId]/weekly-report/[weeklyReportId]`) | Push-driven; route marks the report viewed on mount |
| Monthly reports | Aggregated from all tables above |
| Mentor memory | `learning_profiles` interests, strengths, communication notes |
