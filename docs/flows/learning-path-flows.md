# Learning Path Flows — End-User Perspective

Complete trace of every learning path in EduAgent, from the learner's first tap to post-session recording. Written as of 2026-04-14.

---

## Overview: The Five Learning Paths

| Path | Entry Point | Session Type (DB) | UI Mode | Summary |
|---|---|---|---|---|
| **Freeform Chat** | "Just ask anything" | `learning` | `freeform` | Open-ended — no subject or topic chosen upfront |
| **Guided Learning** | Topic detail or book | `learning` | `freeform` (scoped) | Focused on a specific topic within a subject |
| **Homework Help** | Camera / manual entry | `homework` | `homework` | Photo or typed math/science problem |
| **Practice / Review** | Topic detail | `learning` | `practice` | Timed review of a previously studied topic |
| **Retention Relearn** | Library / retention alerts | `learning` | `relearn` | Re-study a fading or forgotten topic |

Additionally, two **verification overlays** can activate within any learning session:
- **Devil's Advocate** (`evaluate`) — AI presents a flawed explanation; learner finds the error
- **Feynman Technique** (`teach_back`) — learner explains the concept to a "clueless" AI

---

## Path 1: Freeform Chat ("Just Ask Anything")

### Who uses it
Learners who are curious about something but don't want to navigate subjects or topics first. Also the default when the app doesn't know what the learner wants yet.

### Flow

```
Home Screen
  └─ Tap "Start learning"
      └─ Learn New Screen
          └─ Tap "Just ask anything"
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
                  ├─ AI responds using the subject's pedagogy:
                  │   ├─ Socratic (math/science): escalation ladder rungs 1→5
                  │   └─ Four Strands (languages): direct instruction, rotating strands
                  │
                  ├─ Learner and AI exchange messages...
                  │   ├─ Quick chips available: "Give me a hint", "Show an example", etc.
                  │   ├─ Voice mode toggle available (switches to ≤50-word responses)
                  │   └─ Each exchange writes session_events rows in real-time
                  │
                  └─ Learner taps "I'm Done"
                      └─ Filing Prompt appears:
                          ├─ "Yes, add it" → LLM classifies transcript → creates/finds
                          │   subject + book + topic in library → navigates to book detail
                          └─ "No thanks" → navigates to Session Summary
                              ├─ "Your Words" text box → learner writes what they learned
                              │   └─ AI evaluates summary quality → accepted/needs revision
                              ├─ OR "Skip for now"
                              └─ Recall Bridge questions (homework sessions only — not here)
```

### What gets recorded

| When | What | Where |
|---|---|---|
| Every message | User message + AI response events | `session_events` |
| Every message | Exchange count, escalation rung | `learning_sessions` |
| Session close | Duration (active + wall-clock), status | `learning_sessions` |
| Filing (if accepted) | New topic created, linked to session | `curriculum_topics` (filedFrom=`freeform_filing`) |
| Filing (if accepted) | Session backfilled with topicId | `learning_sessions.topicId` |
| Post-session pipeline | SM-2 retention card | `retention_cards` |
| Post-session pipeline | Progress snapshot (daily aggregate) | `progress_snapshots` |
| Post-session pipeline | Session embedding (1024-dim vector) | `session_embeddings` |
| Post-session pipeline | Learner profile analysis (consent-gated) | `learning_profiles` |
| Post-session pipeline | Streak + XP | `streaks`, `xp_ledger` |
| Post-session pipeline | Topic suggestions ("What next?") | `topic_suggestions` |

### Key behavior
- The post-session Inngest pipeline **waits up to 60s** for filing to complete before computing retention — because without filing, there's no `topicId` to attach the retention card to.
- If filing fails, a retry Inngest function fires (up to 2 attempts). If all fail, the pipeline proceeds without a topic link.

---

## Path 2: Guided Learning (Subject + Topic)

### Who uses it
Learners following a curriculum — they've picked a subject, a book, and a specific topic.

### Flow

```
Library
  └─ Tap a shelf (subject)
      └─ Tap a book
          └─ Tap a topic
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
                          ├─ SM-2 may auto-trigger verification overlays:
                          │   ├─ Devil's Advocate: "Here's how I'd explain it... can you
                          │   │   spot what's wrong?"
                          │   └─ Feynman: "Pretend I know nothing — explain this to me"
                          │
                          └─ Learner taps "I'm Done"
                              └─ Navigate directly to Session Summary
                                  (no filing prompt — topic already exists)
                                  ├─ "Your Words" summary
                                  └─ OR "Skip for now"
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
Home Screen
  └─ Tap "Homework help"
      └─ Camera Screen
          ├─ Camera permission check
          ├─ Take photo of homework problem
          │   └─ Preview + OCR processing
          │       ├─ OCR succeeds → extracted text shown for review
          │       │   └─ Learner can edit/correct OCR text
          │       └─ OCR fails/weak → manual text entry fallback
          ├─ OR pick from gallery
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
                  └─ Learner taps "I'm Done"
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
          └─ Learner taps "I'm Done"
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
Library (Topics tab shows retention badges: strong/fading/weak/forgotten)
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
                      └─ Learner taps "I'm Done"
                          └─ Session Summary (no filing prompt — topic exists)
```

### What gets recorded
Same as guided learning, with the SM-2 retention card getting a fresh review cycle. If the learner chose "different method," the method preference is stored for future relearn suggestions.

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

After every session ends, the `app/session.completed` Inngest function runs a 9-step pipeline. The steps vary by session type:

```
Session Close
  │
  ├─ [freeform/homework only] Wait for filing (up to 60s)
  │
  ├─ Step 1: Process verification (evaluate/teach_back scoring)
  ├─ Step 1b: Update SM-2 retention cards
  ├─ Step 1c: Extract vocabulary (language subjects only)
  ├─ Step 1d: Update needs-deepening progress
  ├─ Step 1e: Check milestone completion (language subjects)
  ├─ Step 2: Write coaching card + progress snapshot + milestones
  ├─ Step 3: Analyze learner profile (consent-gated, LLM call)
  ├─ Step 4: Update streaks + award XP
  ├─ Step 5: Generate session embedding (vector for similarity search)
  ├─ Step 6: [homework only] Extract homework summary (parent-facing)
  ├─ Step 7: Track summary skip count
  ├─ Step 8: Update pace baseline (median response time)
  └─ Step 9: Queue celebrations (streaks, mastery, verification success)
```

---

## Mode Comparison Matrix

| Aspect | Freeform | Guided | Homework | Practice | Relearn |
|---|---|---|---|---|---|
| Subject known at start | No | Yes | Sometimes | Yes | Yes |
| Topic known at start | No | Yes | No | Yes | Yes |
| Subject classification | On first message | Skipped | On first message | Skipped | Skipped |
| Filing prompt on close | Yes | No | Yes | No | No |
| Pedagogy | Depends on subject | Depends on subject | Direct (no Socratic) | Depends on subject | Remediation-focused |
| Escalation ladder | Yes (if Socratic) | Yes (if Socratic) | No | Yes (if Socratic) | Yes (if Socratic) |
| Verification overlays | None | evaluate / teach_back | None | evaluate / teach_back | None |
| Timer visible | No | No | No | Yes | No |
| Question count visible | No | No | Yes | No | No |
| Recall bridge | No | No | Yes | No | No |
| Homework summary | No | No | Yes (parent-facing) | No | No |
| Voice mode available | Yes | Yes | Yes | Yes | Yes |
| Session type in DB | `learning` | `learning` | `homework` | `learning` | `learning` |

---

## Cross-Cutting Dimensions

These settings apply across all paths and modify the AI's behavior:

| Dimension | Values | Scope | Effect |
|---|---|---|---|
| **Pedagogy mode** | `socratic` / `four_strands` | Per subject | Socratic ladder vs. direct instruction with strand rotation |
| **Learning mode** | `serious` / `casual` | Per profile | Academic rigor vs. relaxed pacing |
| **Input mode** | `text` / `voice` | Per session | Full responses vs. ≤50-word spoken-style responses |
| **Celebration level** | `all` / `milestones` / `none` | Per profile | Controls which celebrations appear |

---

## What Parents See

Parents don't use learning paths directly. They see the **outputs** of the recording pipeline:

| Surface | Data Source |
|---|---|
| Dashboard activity feed | `learning_sessions` + `session_events` |
| Session transcript | `session_events` (user_message + ai_response) |
| Homework summary | `learning_sessions.metadata.homeworkSummary` |
| Subject progress | `progress_snapshots` |
| Retention status per topic | `retention_cards` |
| Learner strengths/struggles | `learning_profiles` (consent-gated) |
| Monthly reports | Aggregated from all tables above |
| Mentor memory | `learning_profiles` interests, strengths, communication notes |
