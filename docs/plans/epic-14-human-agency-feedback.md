# Epic 14: Human Agency & Feedback — The Student Always Has a Voice

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Status:** Spec complete, priority TBD (recommended: Phase A pre-launch, Phase B post-launch)

---

## Problem Statement

An audit of all learner-facing screens revealed a consistent pattern: the system is well-designed at **boundaries** (subject creation, session start, session end) but loses human agency **during** active interactions.

Specific gaps:

1. **No per-message feedback in sessions.** If the AI gives a bad explanation, the student's only option is to end the session. There's no "that's wrong," "too easy," or "explain differently" affordance.

2. **No topic change mid-session.** Switching topics requires 5 taps across 3 screens. If the AI misclassified the subject in a freeform session, the student must start over.

3. **Coaching cards are not dismissible.** The home screen coaching card has no close button — it's a forced prompt that blocks screen real estate.

4. **No "I don't remember" on recall tests.** Once in a recall test, the student must type something or navigate away. There's no dignified "I'm stuck" option.

5. **No escalation control.** The AI's difficulty level (escalation rung 1-5) is invisible and uncontrollable. Students who want more challenge or more help have no direct way to request it.

6. **No "add my own topic" to curriculum.** Topics are 100% LLM-generated. The only recourse for a missing topic is "challenge" which regenerates the entire curriculum.

7. **No "none of these" on ambiguous subject suggestions.** When the LLM suggests subjects for ambiguous input, there's no explicit "something else" option with a text field.

8. **Homework students can't move between problems.** A student with 10 problems on a worksheet must end and start a new session for each one. There's no "next problem" flow within a single homework session.

9. **No OCR correction or problem splitting.** When the camera reads a page with 6 problems, the garbled text goes to the AI as one blob. The student can't fix OCR errors, and the AI may merge or skip problems.

10. **Socratic questioning on routine homework is painfully slow.** The student solved `2x + 5 = 17` and just wants to check if x = 6 is correct. Instead, the AI asks "What's your first step?" and turns a 10-second verification into a 5-minute interrogation. Multiplied by 6 problems, students stop using the app.

11. **Parents see "homework — 38 min" and nothing else.** The learning that happened during homework is invisible. No topics practiced, no struggle areas, no independence level.

### Core Principle

**Every screen where the AI suggests, recommends, or decides something must allow the human to override, redirect, or provide feedback.** This is not a per-feature decision — it's a platform principle.

---

## Design Principles

- **The student is always right about their own experience.** "Too hard," "I know this," and "that's wrong" are valid signals even when the AI disagrees.
- **Feedback is a gift, not a complaint.** Per-message feedback improves the AI's behavior within the session. Make feedback feel easy and rewarded, not confrontational.
- **Override ≠ escape.** Overriding a recommendation should redirect the experience, not end it. "Switch topic" stays in the session. "I know this" skips ahead. "Too hard" adjusts difficulty.
- **Consistent affordances.** The same feedback patterns (chips, dismiss, flag) appear across all screens. One design language, learned once.
- **Progressive disclosure.** Quick-action chips are visible; advanced overrides (flag content, switch topic) are behind a menu or long-press. Don't overwhelm the chat with buttons.

---

## Functional Requirements (FR218-FR225)

### FR218: Per-Message Feedback in Sessions

- **FR218.1:** Each AI message bubble in a learning session has a subtle feedback affordance: a small thumbs-down icon (or "..." menu) that appears on tap/long-press of the message.
- **FR218.2:** Tapping the feedback affordance reveals options:
  - "Not helpful" — logs negative feedback, sends a system message to the LLM: "The student found your last response unhelpful. Try a different approach."
  - "That's incorrect" — logs content flag. System message: "The student believes your last response contains an error. Re-examine and correct if needed."
- **FR218.3:** Feedback is recorded in `sessionEvents` with `eventType: 'user_feedback'` and `metadata: { type: 'not_helpful' | 'incorrect', exchangeIndex }`.
- **FR218.4:** The LLM receives the feedback as a system-injected message in the conversation context. This allows it to self-correct within the same session.
- **FR218.5:** Feedback affordance is not shown on the student's own messages or system messages — only on AI responses.
- **FR218.6:** No confirmation dialog — feedback is instant and low-friction. A brief toast: "Got it — I'll try differently" (from the AI's perspective).

### FR219: Quick-Action Chips in Sessions

- **FR219.1:** Below the AI's message (or above the chat input), contextual quick-action chips appear:
  - **"I know this"** — tells the AI to skip ahead. System message: "The student already understands this concept. Move to the next point or a harder question."
  - **"Explain differently"** — requests alternative explanation. System message: "The student needs a different explanation approach. Try a different analogy, simpler language, or a worked example."
  - **"Too easy"** — nudges escalation down (less scaffolding). System message: "The student finds this too easy. Increase difficulty — ask harder questions, reduce scaffolding."
  - **"Too hard"** — nudges escalation up (more scaffolding). System message: "The student is struggling. Provide more scaffolding — break the problem into smaller steps, give a hint, or use a simpler example."

- **FR219.2:** Chips are contextual — not all chips appear at all times:
  - During explanation: "I know this," "Explain differently," "Too easy"
  - During question: "Too hard," "Explain differently"
  - After correct answer: "Too easy" (if it felt trivial)
  - After wrong answer: "Too hard" (if they're lost)
  - Context detection: based on the AI's last message type (question vs explanation) from exchange metadata.

- **FR219.3:** Chip taps are recorded in `sessionEvents` with `eventType: 'quick_action'` and the chip type. This data feeds into future coaching card personalization.
- **FR219.4:** Chips disappear after the student types a message or taps a chip (one action per AI response). They reappear after the next AI response.
- **FR219.5:** Chips use the app's existing button/tag component styles. Horizontal scroll if more than 3 chips. Below the AI message bubble, above the text input.

### FR220: Topic Switch Mid-Session

- **FR220.1:** The session header menu (alongside "I'm Done") includes a "Switch Topic" option.
- **FR220.2:** Tapping "Switch Topic" shows a bottom sheet with:
  - The current subject's topics (from curriculum), ordered by retention urgency
  - A search/filter field for subjects with many topics
  - The current topic highlighted
- **FR220.3:** Selecting a different topic:
  - Ends the current session (with normal close flow — active time computed, session-completed chain fires)
  - Immediately starts a new session on the selected topic (same mode)
  - Transition is seamless — the student stays on the session screen, chat clears, new topic begins
- **FR220.4:** If the student is in a freeform session (no topic), "Switch Topic" allows them to **assign** a topic to the current session retroactively, or start a new one.
- **FR220.5:** "Switch Topic" is also available via a quick-action chip after subject misclassification: if the AI's first message references the wrong subject, a "Wrong subject" chip appears that triggers the topic/subject picker.

### FR221: Coaching Card Dismissal

- **FR221.1:** All coaching cards on the home screen have a dismiss affordance (small "×" button in the top-right corner).
- **FR221.2:** Dismissing a card hides it for the current session (app lifecycle). On next app open, the card may reappear if the conditions still apply.
- **FR221.3:** Dismissal is logged in `sessionEvents` (or a lightweight client-side counter) with the card type. If a card type is dismissed 3+ times across sessions, it is deprioritized for that profile (lower priority in coaching card precomputation).
- **FR221.4:** The home screen always shows at least the chat input — dismissing the coaching card reveals more of the home screen content (subjects, retention strip).
- **FR221.5:** Coaching card dismissal data is stored per-profile so the system learns which card types the student finds unhelpful.

### FR222: "I Don't Remember" on Recall Tests

- **FR222.1:** The recall test screen includes an "I don't remember" button below the text input area.
- **FR222.2:** Tapping "I don't remember" counts as a failed recall attempt (quality 0 for SM-2) but with dignified UX:
  - System message: "That's okay — let's see what you do remember. Here's a hint: [brief topic summary]. Does anything come back?"
  - If student types something after the hint: evaluate as normal.
  - If student taps "I don't remember" again (or a "Still stuck" variant): count as second failure, show encouraging message and offer review.
- **FR222.3:** After 2 "I don't remember" taps (or 3 total failures from any mix), the existing remediation flow kicks in (relearn/review options).
- **FR222.4:** "I don't remember" is distinct from "Skip" — it acknowledges the gap honestly and gives the system an SM-2 data point, rather than silently moving on.

### FR223: Escalation Nudge (Difficulty Visibility + Control)

- **FR223.1:** The session header shows a subtle difficulty indicator — e.g., a small icon or label: "Guided" (rung 3-5) or "Independent" (rung 1-2). Not a number — a human-readable label.
- **FR223.2:** Tapping the difficulty indicator opens a brief tooltip: "The AI adjusts how much help it gives based on your answers. You can nudge it with the 'Too easy' or 'Too hard' chips below messages."
- **FR223.3:** Quick-action chips "Too easy" and "Too hard" (FR219) are the primary control mechanism. They inject system messages that the LLM uses to adjust escalation within the session.
- **FR223.4:** The difficulty indicator updates after each AI response to reflect the current escalation state. This gives the student visibility into what the AI is doing.
- **FR223.5:** No direct numeric control (no "set difficulty to 3" slider). The student communicates in natural language ("too easy" / "too hard") and the AI interprets.

### FR224: "Add My Own Topic" to Curriculum

- **FR224.1:** The curriculum review screen (subject detail) includes an "Add topic" button below the topic list.
- **FR224.2:** Tapping "Add topic" opens a text input: "What topic do you want to add? (e.g., 'Trigonometry', 'The French Revolution')"
- **FR224.3:** The input is sent to `POST /v1/subjects/:subjectId/curriculum/topics` (new endpoint).
- **FR224.4:** Server-side: LLM normalizes the topic name (spelling correction, scope clarification) and generates a description + estimated minutes. Returns the normalized topic for user confirmation.
- **FR224.5:** User confirms or edits the normalized topic → topic is added to `curriculumTopics` with `sortOrder` at the end (or after a user-specified position).
- **FR224.6:** If Epic 7 prerequisite edges exist, targeted LLM call generates edges for the new topic (FR122.2 — already specified).
- **FR224.7:** User-added topics are flagged `source: 'user'` in the database (vs `source: 'generated'` for LLM-created topics). This allows future analytics on user-added vs system-generated topic engagement.

### FR225: "None of These" on Ambiguous Subject Suggestions

- **FR225.1:** When subject resolution returns `ambiguous` with multiple suggestions, a "Something else" card appears at the bottom of the suggestion list.
- **FR225.2:** Tapping "Something else" reveals a text input: "What exactly do you want to learn? Be as specific as you like."
- **FR225.3:** The new input is sent through the same `/subjects/resolve` flow. If it resolves to a known subject: proceed. If still ambiguous: show new suggestions. If `no_match`: allow direct creation with the user-typed name.
- **FR225.4:** The "Something else" flow also has a "Just use my words" escape hatch — if the student types "ants" and the system keeps suggesting Biology/Ecology, they can tap "Just use 'ants' as my subject" to create a subject with their exact input.

---

## Stories

### Phase A — Low Effort, High Impact (Pre-Launch Recommended)

#### Story 14.1: Coaching Card Dismissal

As a returning learner,
I want to dismiss coaching card suggestions I don't need,
So that I can get straight to what I came to do.

**Acceptance Criteria:**

**Given** a coaching card is displayed on the home screen
**When** the learner taps the dismiss button
**Then** the card is hidden for the current session
**And** dismissal is logged with card type
**And** cards dismissed 3+ times across sessions are deprioritized
**And** the chat input and subject list remain accessible below

**FRs:** FR221

---

#### Story 14.2: "I Don't Remember" on Recall Tests

As a learner taking a recall test,
I want to honestly say I don't remember,
So that the system helps me instead of waiting for me to guess.

**Acceptance Criteria:**

**Given** a recall test is in progress
**When** the learner taps "I don't remember"
**Then** it counts as a failed recall (SM-2 quality 0)
**And** the system provides a hint and asks if anything comes back
**And** a second "still stuck" leads to remediation options (review/relearn)
**And** the tone is encouraging, not punitive

**FRs:** FR222

---

#### Story 14.3: "Add My Own Topic" to Curriculum

As a learner with specific learning needs,
I want to add a topic that the AI didn't suggest,
So that my curriculum matches what I actually need to learn.

**Acceptance Criteria:**

**Given** a learner is on the curriculum review screen
**When** they tap "Add topic" and type a topic name
**Then** the LLM normalizes the name and generates description/estimate
**And** the learner confirms or edits before adding
**And** the topic is added to the curriculum with `source: 'user'`
**And** prerequisite edges are generated if Epic 7 is implemented

**FRs:** FR224

---

#### Story 14.4: "Something Else" on Ambiguous Subject Suggestions

As a learner creating a subject,
I want to clarify what I mean when AI suggestions miss the mark,
So that I don't have to pick a subject I didn't want.

**Acceptance Criteria:**

**Given** subject resolution returns ambiguous suggestions
**When** the learner taps "Something else"
**Then** a text input appears for clarification
**And** the new input goes through resolution again
**And** a "Just use my words" escape hatch creates the subject with exact input
**And** no infinite loop — after 2 rounds, always offer direct creation

**FRs:** FR225

---

### Phase B — Medium Effort, High Impact (Post-Launch)

#### Story 14.5: Per-Message Feedback

As a learner in a session,
I want to tell the AI when something is wrong or unhelpful,
So that it adjusts in real-time instead of me having to start over.

**Acceptance Criteria:**

**Given** an AI message is displayed in the chat
**When** the learner taps the feedback affordance
**Then** options appear: "Not helpful" / "That's incorrect"
**And** feedback is injected as a system message to the LLM
**And** the AI responds differently on its next turn
**And** feedback is recorded in `sessionEvents` for analytics
**And** a brief toast confirms the feedback was received

**FRs:** FR218

---

#### Story 14.6: Quick-Action Chips

As a learner in a session,
I want quick ways to redirect the AI without typing,
So that I can say "I know this" or "too hard" with one tap.

**Acceptance Criteria:**

**Given** the AI has just sent a message
**When** the chat renders
**Then** contextual quick-action chips appear below the AI message
**And** chips are contextual: explanation → "I know this" / "Explain differently" / "Too easy"; question → "Too hard" / "Explain differently"
**And** tapping a chip sends a system message to the LLM and clears the chips
**And** chips reappear after the next AI response
**And** chip taps recorded in `sessionEvents`

**FRs:** FR219

---

#### Story 14.7: Topic Switch Mid-Session

As a learner who wants to study a different topic,
I want to switch without leaving the session screen,
So that I stay in flow instead of navigating back and forth.

**Acceptance Criteria:**

**Given** a session is active
**When** the learner taps "Switch Topic" in the session menu
**Then** a bottom sheet shows the current subject's topics
**And** selecting a topic ends the current session and starts a new one seamlessly
**And** the chat clears and the new topic begins without leaving the screen
**And** "Wrong subject" chip appears after suspected misclassification

**FRs:** FR220

---

#### Story 14.8: Escalation Visibility + Difficulty Nudge

As a learner who wants more or less challenge,
I want to see the AI's current difficulty level and nudge it,
So that the session matches my comfort level.

**Acceptance Criteria:**

**Given** a session is active
**When** the learner looks at the session header
**Then** a subtle label shows current mode: "Guided" or "Independent"
**And** tapping the label explains what it means
**And** "Too easy" / "Too hard" chips (FR219) are the control mechanism
**And** the label updates after each AI response

**FRs:** FR223

---

#### Story 14.9: Homework Problem Card Preview + OCR Correction

As a student photographing homework,
I want the app to show me each detected problem separately so I can verify and fix OCR errors,
So that the AI works with correct input from the start.

**Acceptance Criteria:**

**Given** a student photographs a homework page
**When** OCR extracts the text
**Then** client-side heuristics split the text into probable problems (by numbered lines, blank gaps, pattern shifts)
**And** each problem is shown as a separate editable card in a scrollable list
**And** the student can edit each card's text, merge two cards (wrongly split), split a card (wrongly merged), or remove cards they don't need help with
**And** an "Add problem I missed" button at the bottom allows manual entry
**And** "Send all" submits the confirmed problem list to the session
**And** original OCR text + corrections logged for analytics

**FRs:** FR227

---

#### Story 14.10: Homework "Help Me" vs "Check My Answer" Per Problem

As a student working through homework,
I want to choose whether I need guidance or just want my answer checked,
So that I don't waste 5 minutes on Socratic questioning for a problem I already solved.

**Acceptance Criteria:**

**Given** the AI presents the next homework problem
**When** the problem is displayed
**Then** two chips appear: [Help me solve it] / [Check my answer]
**And** "Check my answer": student types their answer → AI verifies right/wrong → if wrong, points to the specific error with a brief explanation and a similar worked example → done, next problem
**And** "Help me solve it": AI explains the approach briefly, shows a similar worked example, then lets the student try → brief targeted feedback → done, next problem
**And** neither mode uses extended Socratic questioning — responses are concise
**And** teen profiles get even shorter responses (1-2 sentences + example, not paragraphs)
**And** the AI never gives the direct final answer to the actual homework problem — it explains HOW and shows SIMILAR examples

**FRs:** FR228

---

#### Story 14.11: Homework Multi-Problem Session Flow

As a student with multiple homework problems,
I want to work through them in one session without starting over between each,
So that I finish my homework in one sitting.

**Acceptance Criteria:**

**Given** the student confirmed their problem list (Story 14.9)
**When** the homework session starts
**Then** all problems are sent to the LLM with the instruction to work through them one at a time
**And** the AI presents the first problem and waits for the student's mode choice (help / check answer)
**And** after each problem, a "Next problem" chip advances to the next one
**And** a visual separator and "Problem 2 of 6" indicator marks transitions
**And** camera icon in chat input allows photographing additional problems mid-session
**And** the session stays active across all problems — one session per homework sitting
**And** `problemCount` and per-problem mode choices stored in `learningSessions.metadata`

**FRs:** FR226

---

#### Story 14.12: Homework Learning Extraction + Parent Display

As a parent,
I want to see what my child actually learned during homework — not just "38 minutes",
So that I can understand their progress and where they need support.

**Acceptance Criteria:**

**Given** a homework session completes
**When** the session-completed Inngest chain fires
**Then** an LLM extraction step (homework sessions only) reads the conversation and produces: problem count, topics/skills practiced, which problems were independent vs needed guidance, brief parent-facing summary
**And** extraction stored in `learningSessions.metadata.homeworkSummary` (JSONB, no schema migration)
**And** parent dashboard shows: "Math Homework — 5 problems, practiced linear equations" with scaffolding summary
**And** Learning Book shows homework sessions with topics practiced
**And** sessions without `homeworkSummary` (old sessions, extraction failure) gracefully show current display ("Homework — X min")

**FRs:** FR229

---

### Homework FRs (Revised — Final)

### FR226 (Revised): Homework Multi-Problem Sessions

- **FR226.1:** Homework sessions support working through multiple problems within a single session. One session per homework sitting — `durationSeconds`, `exchangeCount`, and milestones accumulate across all problems.
- **FR226.2:** Problems are presented one at a time. After each problem, a "Next problem" chip advances to the next. Visual separator + "Problem N of M" indicator between problems.
- **FR226.3:** `learningSessions.metadata` stores: `problemCount`, `problems: [{ text, mode, scaffoldingLevel }]`. Visible in parent dashboard.
- **FR226.4:** Camera icon in chat input allows photographing additional problems mid-session (reuses existing camera capture + OCR flow). New photos go through the same editable preview (FR227) before being added.
- **FR226.5:** The student can also just type a new problem without photographing. The chip/camera are conveniences, not requirements.

### FR227 (Revised): Problem Card Preview After OCR

- **FR227.1:** After OCR extracts text from a homework photo, **client-side heuristics** split the text into probable individual problems. Heuristics: lines starting with number + period/parenthesis, blank line gaps, pattern shifts (equation → prose → equation). Not LLM-powered — just regex + line analysis.
- **FR227.2:** Preview UI: scrollable list of editable problem cards. Each card shows the extracted text for one problem with [edit] and [remove] affordances.
- **FR227.3:** Student can: edit text in any card, merge two cards (tap "merge with above"), split a card (tap a line to split at), remove cards they don't need help with, add a missed problem manually ("+ Add problem").
- **FR227.4:** "Send all" submits the confirmed problem list. "Retake" reopens camera. "Type instead" switches to manual text entry.
- **FR227.5:** If the student edits text, both original OCR output and corrections logged in `sessionEvents` with `eventType: 'ocr_correction'` for analytics.
- **FR227.6:** If heuristic splitting fails entirely (no clear boundaries), fall back to single editable TextInput with the full OCR text. The student can manually add line breaks or just send as-is (the multi-problem prompt from FR228 still handles it).

### FR228 (New): Homework Help Mode — Explain, Don't Question

- **FR228.1:** Homework mode uses a fundamentally different AI approach than learning mode. **No Socratic questioning.** The AI explains, demonstrates, and verifies — concisely.
- **FR228.2:** Two interaction modes per problem, selected by the student via chips:
  - **"Check my answer"**: Student provides their answer. AI responds: "Correct!" or "Not quite — [specific error] + [brief explanation]. Here's a similar example: [worked example]. Try again?" Response target: 2-4 sentences.
  - **"Help me solve it"**: AI explains the approach in 2-3 sentences, shows a worked example of a **similar** (not identical) problem, then says: "Now try yours." After student attempts: brief targeted feedback. Response target: 4-6 sentences max.
- **FR228.3:** The AI **never gives the final answer** to the actual homework problem. It explains the method, shows similar examples, and verifies the student's work. This is the boundary: teach HOW, not WHAT.
- **FR228.4:** Teen profiles (13+, from `birthDate`) get even shorter responses. One sentence of explanation + one worked example. No preamble, no encouragement padding, no "Great question!" filler.
- **FR228.5:** The homework system prompt replaces the current Socratic-only constraint:
  ```
  Session type: HOMEWORK HELP
  You are a homework helper — concise, direct, and efficient.
  The student has specific problems to solve. They don't have time for exploration.

  For EACH problem, the student will choose:
  - "Check my answer": Verify their answer. If correct, say so briefly. If wrong,
    identify the specific error, explain briefly, show a similar worked example.
  - "Help me solve it": Explain the approach in 2-3 sentences. Show a similar
    worked example (NOT the actual problem). Let them try. Give brief feedback.

  RULES:
  - NEVER give the final answer to their actual homework problem.
  - NEVER use Socratic questioning ("What do you think?" "What's your first step?").
  - BE BRIEF. Target 2-4 sentences for answer checks, 4-6 for help. No filler.
  - For teens: even shorter. One explanation + one example. No padding.
  - Show SIMILAR worked examples, not the identical problem solved.
  ```
- **FR228.6:** This overrides FR31 ("NEVER provide direct answers, Socratic only") specifically for homework sessions. Learning sessions retain Socratic guidance unchanged.

### FR229 (New): Homework Learning Extraction

- **FR229.1:** After a homework session closes, a new step in the `session-completed` Inngest chain extracts learning data. Only fires for `sessionType: 'homework'`.
- **FR229.2:** LLM reads the session exchanges and produces structured JSON:
  ```typescript
  homeworkSummary: {
    problemCount: number,
    topicsCovered: string[],        // free text, not curriculum-linked
    summary: string,                // parent-facing, 2-3 sentences
    scaffoldingLevel: 'independent' | 'mixed' | 'heavy',
    problemDetails: Array<{
      problemText: string,          // first ~100 chars
      mode: 'check' | 'help',
      result: 'correct' | 'corrected' | 'guided',
    }>
  }
  ```
- **FR229.3:** Stored in `learningSessions.metadata.homeworkSummary`. No schema migration — metadata is JSONB.
- **FR229.4:** Extraction is async and non-blocking. If it fails after Inngest retries, the session is still fully closed. Parent sees the old display as fallback.
- **FR229.5:** Topic-to-curriculum matching is explicitly deferred. `topicsCovered` is free text. Matching (and SM-2 retention bridging) is a future enhancement once extraction quality is validated.

---

## Execution Order

```
Phase A (pre-launch, parallelizable):
  14.1  (Dismiss coaching card)        ─── no deps, frontend only
  14.2  (I don't remember)             ─── no deps, frontend + minor API
  14.3  (Add my own topic)             ─── no deps, new API endpoint + frontend
  14.4  (Something else)               ─── no deps, frontend only

Phase B — Homework Overhaul (high priority, sequential):
  14.10 (Help me / Check my answer)    ─── no deps (prompt change only)
  14.9  (Problem card preview + OCR)   ─── no deps (frontend only, camera.tsx)
  14.11 (Multi-problem session flow)   ─── depends on 14.9 + 14.10
  14.12 (Learning extraction + parent) ─── depends on 14.11 (needs homework sessions to extract from)

Phase C — Session Agency (post-launch):
  14.5  (Per-message feedback)         ─── no deps
  14.6  (Quick-action chips)           ─── depends on 14.5 (same session event infrastructure)
  14.7  (Topic switch mid-session)     ─── no deps (but complex — session lifecycle changes)
  14.8  (Escalation visibility)        ─── depends on 14.6 (chips are the control mechanism)
```

Phase A stories are independent and parallelizable.
Phase B: 14.10 and 14.9 can be parallel (prompt vs frontend). Then 14.11, then 14.12.
Phase C: light dependencies between stories.

---

## Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 7** (concept map) | FR224 (add topic) triggers FR122.2 (prerequisite edge generation for new topics). FR151 (per-edge feedback) uses same feedback affordance pattern as FR218. |
| **Epic 13** (session lifecycle) | FR220 (topic switch) ends a session — must use the same `closeSession()` flow from Epic 13 (active time, milestone storage). FR219 chips interact with FR214 milestones (chips don't count as exchanges for milestone purposes). |
| **Epic 12** (persona removal) | FR219 chip context detection uses exchange metadata, not persona. No persona dependency. |
| **Epic 3** (retention) | FR222 ("I don't remember") feeds into SM-2 via quality score. FR219 ("I know this") could trigger recall to validate the claim — stretch goal. |
| **Epic 2** (homework help) | FR226 (multi-problem) extends the homework session flow from Story 2.5 (camera capture). FR227 (OCR correction) adds an edit step to the existing OCR pipeline. The camera UI and `useHomeworkOcr` hook are reused. |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Quick-action chips clutter the chat | Chips hidden after any user action. Max 3 visible. Progressive disclosure. |
| "Not helpful" feedback abused by disengaged students | Feedback logged but doesn't auto-penalize the AI. The LLM interprets the signal contextually. Abuse patterns detectable in analytics. |
| Topic switch mid-session causes data loss | Current session fully closed (active time, retention, XP) before new session starts. Uses existing `closeSession()` path. |
| "Add my own topic" creates garbage entries | LLM normalization catches most issues. User confirms before creation. `source: 'user'` flag enables cleanup. |
| Escalation visibility makes students game the system | Labels are approximate ("Guided" vs "Independent"), not precise numbers. No direct slider. The AI still controls actual difficulty. |
| "I don't remember" becomes a lazy shortcut | Counts as quality 0 for SM-2 — has retention consequences. The hint system encourages genuine attempt before giving up. |
| Too many feedback mechanisms overwhelm the UI | Phase A is minimal (dismiss, button, text input). Phase B adds chat affordances gradually. User testing between phases. |
| Multi-problem "Next problem" loses context the student needs | LLM context reset is a system message, not a hard wipe. If the student references a previous problem ("like the last one"), the full session history is still available server-side. The client view clears for UX clarity, but the AI can look back. |
| OCR problem card splitting is wrong (merges or splits incorrectly) | Heuristic is a first pass — the student confirms, merges, or splits cards. Fallback: single TextInput with full OCR text. The LLM multi-problem prompt handles unsplit text gracefully. |
| "Check my answer" mode lets students cheat (type random answer, read error explanation) | The AI never gives the ACTUAL answer — it identifies the error location, explains the concept, and shows a SIMILAR example. The student still has to solve their actual problem. |
| Homework prompt change makes AI too brief / loses teaching quality | Monitor session analytics (exchange count, scaffolding level). The prompt targets 2-6 sentences, not 1 word. "Brief" means no filler, not no substance. Can tune prompt if feedback shows quality drop. |
| Learning extraction LLM call produces low-quality summaries | Extraction is async and non-blocking. If quality is bad, parent sees old display. Start with free-text topics (no curriculum matching) to keep expectations realistic. Improve prompt with real data. |
| Inconsistent parent display (some sessions have summaries, some don't) | Graceful fallback: sessions without `homeworkSummary` show current "Homework — X min" display. Over time, all new homework sessions will have summaries. Old sessions are fine as-is. |

---

## What Already Exists (no changes needed)

- `sessionEvents` table — already supports arbitrary `eventType` and `metadata` JSONB (ready for feedback events)
- `ChatShell` text input — will gain chips alongside, not replacing existing input
- `CoachingCard` / `AdaptiveEntryCard` — will gain dismiss button, existing CTA buttons unchanged
- `processRecallTest()` — will be extended with "I don't remember" handling
- `createSubject()` + `resolveSubject()` — add topic endpoint is new, but follows existing patterns
- Subject resolution flow on mobile — "Something else" is a UI addition to existing suggestion cards
- Camera capture UI + `useHomeworkOcr` hook — FR227 adds an editable preview step to the existing pipeline
- `OcrProvider` interface in `services/ocr.ts` — OCR correction logging extends existing analytics
