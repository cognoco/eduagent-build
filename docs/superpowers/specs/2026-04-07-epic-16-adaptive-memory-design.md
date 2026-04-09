# Epic 16: Adaptive Memory — The Mentor That Learns You

**Author:** Zuzka + Claude
**Date:** 2026-04-07
**Status:** Draft
**FRs:** FR243–FR251
**Dependencies:** Epic 13 (session lifecycle), Epic 7 (library infrastructure), LLM router (`services/llm/router.ts`)

> **Note on FR numbering:** This epic's original requirement IDs (234–242) were renumbered to 243–251 to avoid collision with Epic 15 (FR230–FR241). All internal references use the new numbering.

---

## A Note on "Memory"

Memory in this spec means something specific: the AI mentor building an understanding of each learner over time — their learning style, interests, strengths, and struggles — derived entirely from interactions. It is not a chat history feature, not a knowledge base, and not user-configured preferences. The learner never fills out a form. The mentor observes, infers, and improves. The result: after weeks of use, switching to a different app should feel like losing a tutor who truly understood you.

---

## Problem Statement

1. **Chat sessions are stateless.** The mentor does not build a model of the child across sessions. Every session starts from zero understanding — only age and subject context carry forward.
2. **No learner model exists.** There is no way to know: does this child learn better with stories or diagrams? What are their interests? What concepts do they repeatedly struggle with? What explanation styles have worked?
3. **The mentor feels generic.** Without accumulated understanding, the experience is interchangeable with any other AI tutoring app. There is no relationship, no accumulated switching cost.
4. **Context injection is limited.** The existing `buildSystemPrompt()` injects learning history (topic coverage, session recency) but nothing about the learner as a person — their preferences, communication style, or emotional responses to challenge.
5. **Parents have no visibility into what the AI "knows."** Even if we start building a learner model, without transparency and control, the feature fails trust requirements — especially for children and GDPR.

---

## Design Principles

1. **The child profile is a living document, not a static form.** Memory is built FROM interactions, not configured BY the user. The learner never fills out a questionnaire about their learning style.
2. **Memory makes the mentor BETTER, not creepy.** It improves teaching — adapting examples to interests, adjusting pace to preference, being patient on known struggle areas. It does not surveil, score, or judge.
3. **The mentor references memories naturally.** "I remember you liked the dinosaur problems — let's use dinosaurs to explore fractions." Not "Your learning profile indicates a preference for zoological examples."
4. **Privacy first.** The child and parent can see and delete what the mentor remembers. All memory data is exportable and deletable. Opt-out returns to stateless mode.
5. **Memory accumulates gradually.** Noticeable improvement over weeks, not minutes. A single session adds a small signal. Fifty sessions build a rich picture.
6. **Confidence thresholds, not assumptions.** The analysis function may infer wrong preferences. All inferences carry a confidence score. Low-confidence inferences are not injected into prompts until corroborated.
7. **Bounded context injection.** Memory enriches the system prompt — it does not bloat it. Cap at ~500 tokens. Prioritize recent + high-confidence + session-relevant memories.

---

## Implementation Status

| Story | Title | Phase | Status | FRs |
|-------|-------|-------|--------|-----|
| 16.1 | Child Learning Profile Schema | A | PLANNED | FR243 |
| 16.2 | Session Analysis Inngest Function | A | PLANNED | FR244 |
| 16.3 | Memory Context Injection | A | PLANNED | FR245 |
| 16.4 | Interest Detection & Tagging | B | PLANNED | FR246 |
| 16.5 | Struggle Pattern Detection | B | PLANNED | FR247 |
| 16.6 | Explanation Effectiveness Tracking | B | PLANNED | FR248 |
| 16.7 | "What My Mentor Knows" Screen | C | PLANNED | FR249 |
| 16.8 | Parent Memory Visibility | C | PLANNED | FR250 |
| 16.9 | Memory Warm-Start for New Subjects | C | PLANNED | FR251 |

---

## Functional Requirements

### FR243: Child Learning Profile Schema

- **FR243.1:** New `learning_profiles` table:
  ```
  learning_profiles
  ├── id               UUID, primary key
  ├── profileId        → profiles.id (FK, cascade delete, unique)
  ├── learningStyle    JSONB, nullable
  │   ├── preferredExplanations   'stories' | 'examples' | 'diagrams' | 'analogies'
  │   ├── pacePreference          'quick' | 'thorough'
  │   └── responseToChallenge     'motivated' | 'discouraged'
  ├── interests        JSONB, default '[]'    — string[] of topics/themes
  ├── strengths        JSONB, default '[]'    — { subject, topics, confidence }[]
  ├── struggles        JSONB, default '[]'    — { subject, topic, lastSeen, attempts, confidence }[]
  ├── communicationNotes JSONB, default '[]'  — string[] ("responds well to humor", "prefers short explanations")
  ├── memoryEnabled    boolean, default true   — opt-out toggle (FR250)
  ├── version          integer, default 1      — incremented on every update (optimistic concurrency)
  ├── createdAt        timestamp
  └── updatedAt        timestamp
  ```
- **FR243.2:** One `learning_profiles` row per profile. Created lazily on first session analysis (Story 16.2), not on profile creation.
- **FR243.3:** All fields are AI-inferred. No user-facing form writes to this table. The only user-facing writes are deletions (Story 16.7, 16.8) and the `memoryEnabled` toggle (Story 16.8).
- **FR243.4:** Each entry in `interests`, `strengths`, `struggles`, and `communicationNotes` carries an implicit confidence level. The `strengths` and `struggles` arrays include an explicit `confidence: 'low' | 'medium' | 'high'` field. Only `high` confidence entries are injected into prompts (FR245). `medium` entries are visible in the "What My Mentor Knows" screen (FR249) but not used for prompt construction.
- **FR243.5:** `interests` array is capped at 20 entries. Oldest entries are evicted when the cap is reached. `struggles` entries older than 90 days without recurrence are archived (removed from active array, preserved in a `_history` audit if needed for export).
- **FR243.6:** Profile-scoped read/write via `createScopedRepository(profileId)`. No cross-profile access to learning profiles.

### FR244: Session Analysis Inngest Function

- **FR244.1:** New Inngest function `session/analyze-learner-profile` triggered by the existing `session.completed` event. Runs as a step in the post-session Inngest chain (after retention update, before coaching card precomputation).
- **FR244.2:** The function reads the session's `sessionEvents` (the full interaction transcript) and sends them to a dedicated LLM call via `services/llm/router.ts` with a structured output schema.
- **FR244.3:** LLM analysis prompt extracts:
  - **Explanation effectiveness:** Which explanation styles led to understanding (child responded correctly, said "I get it", moved on quickly) vs. confusion (child asked again, said "I don't understand", needed re-explanation)?
  - **Interest signals:** Did the child mention hobbies, enthusiasms, or preferences? ("I love space", "dinosaurs are cool", "I play football")
  - **Struggle signals:** Did the child repeatedly fail or express confusion on a specific concept?
  - **Communication preferences:** Did the child respond better to humor, short answers, long explanations, examples, stories?
  - **Engagement level:** Was the child engaged (fast responses, follow-up questions, enthusiasm markers) or disengaged (short answers, topic avoidance)?
- **FR244.4:** LLM structured output schema:
  ```typescript
  {
    explanationEffectiveness: {
      effective: ('stories' | 'examples' | 'diagrams' | 'analogies')[],
      ineffective: ('stories' | 'examples' | 'diagrams' | 'analogies')[]
    } | null,
    interests: string[] | null,          // new interests detected
    struggles: { topic: string, subject: string } [] | null,
    communicationNotes: string[] | null,  // new observations
    engagementLevel: 'high' | 'medium' | 'low' | null,
    confidence: 'low' | 'medium' | 'high'  // overall confidence in this analysis
  }
  ```
- **FR244.5:** Updates to the learning profile are **incremental merge, not replace**:
  - `interests`: append new, deduplicate, respect cap (FR243.5)
  - `strengths` / `struggles`: upsert by subject+topic, increment `attempts` on struggles, update `lastSeen`
  - `learningStyle`: only update a field if the new signal has higher confidence than the existing value. Require 3+ corroborating sessions before setting `learningStyle` fields.
  - `communicationNotes`: append, deduplicate by semantic similarity (simple string match, not LLM-based)
- **FR244.6:** If `memoryEnabled = false` on the profile, the Inngest function short-circuits — no LLM call, no updates.
- **FR244.7:** The analysis LLM call uses a budget model (not premium). Target latency: under 5 seconds. This is background processing — no user-facing latency impact.
- **FR244.8:** Emit a structured metric on each analysis run: `learner_profile.analysis.completed` with `{ profileId, sessionId, fieldsUpdated: string[], confidence }`. Enables monitoring of how frequently profiles are updated and with what confidence.

### FR245: Memory Context Injection

- **FR245.1:** Modify `buildSystemPrompt()` to include a "learner memory" block when a `learning_profiles` row exists for the current profile AND `memoryEnabled = true`.
- **FR245.2:** The memory block is constructed from the learning profile with these priorities (highest first):
  1. Active struggles relevant to the current subject/topic (if any match)
  2. Learning style preferences (if set with high confidence)
  3. Top 3-5 interests (most recent first)
  4. Communication notes (max 2, most recent)
- **FR245.3:** Memory block format is natural language, not structured data. Example:
  ```
  About this learner:
  - They learn best with story-based explanations and prefer thorough, step-by-step pace
  - They're interested in: space, dinosaurs, football, Minecraft
  - They've been working hard on fractions (struggled in 3 recent sessions) — be extra patient and try different approaches
  - They respond well to humor and prefer short explanations
  ```
- **FR245.4:** Total memory block budget: 500 tokens maximum. If the full profile exceeds this, prioritize by the order in FR245.2 and truncate.
- **FR245.5:** The system prompt includes a meta-instruction for the LLM: "Use the learner memory naturally in conversation. Reference their interests when generating examples. Use their preferred explanation style. Do NOT explicitly tell the learner you are reading from a profile — weave it in naturally."
- **FR245.6:** For subjects where no learning profile data is relevant (new subject, no matching struggles), the memory block is omitted entirely — no empty placeholder.
- **FR245.7:** Memory injection is additive to the existing learning history block (FR163 from Epic 7). The learning history block covers what topics the learner has studied. The memory block covers how the learner learns best. Both are injected.

### FR246: Interest Detection & Tagging

- **FR246.1:** The session analysis function (FR244) detects interest signals from natural conversation. Interest signals include:
  - Explicit statements: "I love space", "dinosaurs are cool", "I play football"
  - Enthusiastic engagement: rapid follow-up questions about a topic, requests for more information
  - Repeated references to a theme across messages within a session
- **FR246.2:** Detected interests are stored as plain strings in the `interests` array, not categorized or taxonomized. "space", "dinosaurs", "football", "Minecraft" — not "Science > Astronomy" or "Sports > Football".
- **FR246.3:** The mentor uses interests for example generation: "Let's use a space mission to understand fractions" or "Imagine dinosaurs dividing their territory — that's what fractions do." The meta-instruction in FR245.5 covers this — no per-interest prompting needed.
- **FR246.4:** Interests that haven't been referenced or reinforced in 60+ days are demoted (moved to end of array, eventually evicted by cap).

### FR247: Struggle Pattern Detection

- **FR247.1:** A "struggle" is flagged when a child shows confusion on the same concept across 3+ sessions. Single-session confusion is normal learning — it does not trigger a struggle flag.
- **FR247.2:** Struggle detection runs as part of the session analysis (FR244). The analysis LLM compares the current session's struggle signals against the existing `struggles` array in the learning profile.
- **FR247.3:** When a new struggle is detected:
  - Increment `attempts` counter on the existing struggle entry (or create a new entry)
  - Update `lastSeen` timestamp
  - Set confidence to `medium` after 3 sessions, `high` after 5 sessions
- **FR247.4:** When a struggle is resolved (child demonstrates understanding in a subsequent session), the struggle entry's confidence is downgraded one level. After 3 consecutive sessions without the struggle appearing, the entry is removed.
- **FR247.5:** The memory context (FR245) adjusts the mentor's behavior on known struggles:
  - Slower pace, more patient
  - Try a different explanation style than what previously failed
  - Check prerequisites before diving in
  - Acknowledge growth: "Last time fractions were tricky — let's see how you do now!"
- **FR247.6:** Parent notification: when a struggle reaches `high` confidence (5+ sessions), emit an event that can surface on the parent dashboard: "{Child} has been working hard on {topic} — they may need some extra support." Implementation: add a `struggle_flagged` coaching card type for parent profiles.

### FR248: Explanation Effectiveness Tracking

- **FR248.1:** During session analysis (FR244), the LLM classifies each explanation attempt in the transcript as effective or ineffective based on the child's response:
  - **Effective signals:** correct follow-up answer, "oh I get it", "that makes sense", moves on quickly, asks a deeper question
  - **Ineffective signals:** "I don't understand", asks the same question again, gives wrong answer after explanation, disengages
- **FR248.2:** Each explanation attempt is also tagged with its style: `stories`, `examples`, `diagrams`, `analogies`, `step-by-step`, `humor`. The analysis LLM determines the style from the transcript.
- **FR248.3:** Effectiveness data feeds into the `learningStyle.preferredExplanations` field. After 5+ data points, the profile records which styles are most effective. After 10+ data points with a clear pattern, confidence is set to `high`.
- **FR248.4:** The mentor actively varies explanation styles until the profile has enough data. Early sessions should try different approaches to build the model faster. The system prompt includes: "Try different explanation styles — stories, examples, analogies — and observe which ones click."
- **FR248.5:** Effectiveness tracking respects subject boundaries where appropriate. A child who learns math best with visual examples may learn history best with stories. If cross-subject patterns emerge, they are recorded at the profile level. If subject-specific patterns emerge, they are recorded with subject context in the `strengths`/`struggles` arrays.

### FR249: "What My Mentor Knows" Screen

- **FR249.1:** New screen accessible from the child's profile settings. Route: `/(tabs)/more/mentor-memory`.
- **FR249.2:** The screen displays the learning profile in age-appropriate, friendly language:
  - **Learning style:** "Your mentor noticed you learn best with stories and examples!" (only shown if learningStyle fields are set)
  - **Interests:** "Your mentor picked up that you like: space, dinosaurs, football" (shown as tappable chips)
  - **Strengths:** "You're doing great at: Ancient Egypt, multiplication" (shown as a list with subject context)
  - **Struggles:** "You've been working hard on: fractions, verb conjugation" (positive framing — "working hard on", not "struggling with")
  - **Communication notes:** "Your mentor thinks you like humor and prefer short explanations"
- **FR249.3:** Each memory item has a delete action (swipe-to-delete or tap-to-remove). Deleting an item removes it from the `learning_profiles` JSONB immediately. The mentor will not use it again.
- **FR249.4:** Empty state: "Your mentor is still getting to know you! After a few sessions, you'll see what they've learned about how you like to learn." No dead end — back navigation always available.
- **FR249.5:** Copy is age-adapted using `birthYear`:
  - Under 10: "Your mentor noticed you really like stories about animals!"
  - 10-14: "Your mentor thinks you learn best with real-world examples."
  - 15+: "Learning preferences: example-based explanations, thorough pace."
- **FR249.6:** The screen includes a "This is wrong" action on each item that allows the child to correct the inference. Tapping "This is wrong" removes the item and records the correction so the analysis function does not re-infer it from old sessions. Implementation: store a `suppressedInferences: string[]` array on the learning profile.

### FR250: Parent Memory Visibility

- **FR250.1:** Parent dashboard gains a "What the mentor knows" section for each linked child. Route: `/(parent)/dashboard/[childId]/mentor-memory`.
- **FR250.2:** The parent sees the same data as the child (FR249) plus additional metadata:
  - When each inference was first recorded
  - How many sessions contributed to each inference
  - Confidence level for each item
- **FR250.3:** The parent can:
  - Remove specific memory items (same as child, FR249.3)
  - Toggle `memoryEnabled` off entirely — the mentor reverts to stateless mode
  - Export all memory data as JSON (GDPR Article 20 — data portability)
  - Delete all memory data (GDPR Article 17 — right to erasure). This deletes the `learning_profiles` row entirely.
- **FR250.4:** When `memoryEnabled` is toggled off:
  - The `learning_profiles` row is preserved but the `memoryEnabled` flag prevents all reads and writes
  - The session analysis Inngest function short-circuits (FR244.6)
  - The memory context block is omitted from prompts (FR245.1)
  - A confirmation dialog warns: "The mentor will stop learning about {child}'s preferences. Sessions will still work, but the mentor won't remember what works best."
- **FR250.5:** When `memoryEnabled` is toggled back on, the preserved profile data is immediately active again. No data is lost during the off period (but no new data was collected either).
- **FR250.6:** GDPR compliance: all learning profile data is included in the existing data export pipeline (`services/export.ts`). The "Delete all data" action in account settings already cascades to the learning profile via the FK on `profileId`.

### FR251: Memory Warm-Start for New Subjects

- **FR251.1:** When a child starts a new subject, the memory context injection (FR245) uses the existing profile data to bootstrap the experience. Cross-subject signals that transfer:
  - Learning style preferences (explanation style, pace, challenge response)
  - Interests (for example generation in the new subject)
  - Communication notes (humor preference, explanation length preference)
- **FR251.2:** Cross-subject signals that do NOT transfer:
  - Strengths (subject-specific)
  - Struggles (subject-specific — struggling with fractions says nothing about history)
- **FR251.3:** The mentor references the warm-start naturally: "I know you like examples with animals, so let's explore Spanish vocabulary with animal names!" The meta-instruction in FR245.5 covers this.
- **FR251.4:** Warm-start quality degrades gracefully. A child with 50 sessions across 3 subjects gets a rich warm-start. A child with 2 sessions in 1 subject gets a minimal warm-start. A brand new child gets no warm-start — the default age + subject context still works.

---

## Architecture Decisions

### AD1: Separate Table, Not a JSONB Column on Profiles

The learning profile is stored in its own `learning_profiles` table, not as a JSONB column on the `profiles` table. Reasons:

- The learning profile is large and grows over time. Keeping it separate avoids bloating profile reads that don't need memory data.
- Optimistic concurrency via `version` column prevents lost updates when the Inngest function and user deletions race.
- Clean FK cascade — deleting a profile deletes the learning profile.
- The `profiles` table is read on every API request (auth middleware). The learning profile is read only during prompt construction and the settings screen.

### AD2: LLM-Based Analysis, Not Rule-Based Heuristics

Session analysis uses an LLM call, not regex patterns or keyword matching. Reasons:

- Interest detection from natural conversation is nuanced ("I play football on Saturdays" vs. "We're learning about football formations in history class")
- Explanation effectiveness requires understanding the conversational context, not just keywords
- The LLM already has the pedagogical reasoning to classify explanation styles
- Budget model keeps cost low (~$0.002/analysis). At 10 sessions/day/user, this is $0.60/month/user — well within margin.

Trade-off: LLM hallucination risk. Mitigated by confidence thresholds (FR243.4) and the 3-session corroboration requirement for learning style fields (FR244.5).

### AD3: Background Processing Only — No In-Session Analysis

Memory analysis runs post-session via Inngest, never during a session. Reasons:

- No latency impact on the chat experience
- Full transcript available for holistic analysis (not message-by-message)
- Failures are isolated — a failed analysis does not affect the session
- Natural batching — one analysis per session, not per message

The trade-off is that the current session cannot benefit from its own analysis. This is acceptable — one session's worth of signal is rarely enough to change the profile meaningfully.

### AD4: Natural Language Memory Block, Not Structured Data in Prompts

The memory context injected into the system prompt (FR245.3) is formatted as natural language, not JSON or structured data. Reasons:

- LLMs respond better to natural language context than to structured data blobs
- Natural language encourages the LLM to weave memories into conversation naturally
- Easier to enforce the 500-token budget with prose than with structured data
- The structured data lives in the database — the prompt gets the human-readable summary

### AD5: No Embedding / Vector Search for Memory Retrieval

The learning profile is a single JSONB document per learner, not a vector store of memory fragments. Reasons:

- The profile is small enough to read in full (< 2KB even for a rich profile)
- The 500-token prompt budget means we are always selecting a small subset — simple priority ordering (FR245.2) works
- Vector search adds infrastructure complexity (pgvector is already used for session embeddings but adding memory fragments to the embedding pipeline is a different retrieval pattern)
- If the profile grows beyond what priority ordering can handle, vector search can be added later as an optimization — not a prerequisite

---

## Stories

### Story 16.1: Child Learning Profile Schema

As a system building a long-term model of each learner,
I need a structured, per-profile document to store learning preferences, interests, strengths, and struggles,
So that the mentor can accumulate understanding over time and reference it in future sessions.

**Acceptance Criteria:**

**Given** a profile exists in the system
**When** the first session analysis runs for that profile (Story 16.2)
**Then** a `learning_profiles` row is created with default values (empty arrays, null learningStyle)
**And** the row is scoped to the profile via `profileId` FK with cascade delete

**Given** a learning profile exists
**When** any field is updated by the analysis function
**Then** the `version` column is incremented (optimistic concurrency)
**And** `updatedAt` is refreshed

**Given** a profile is deleted
**When** the cascade fires
**Then** the `learning_profiles` row is deleted — no orphaned memory data

**Given** the `learning_profiles` table is queried
**When** using `createScopedRepository(profileId)`
**Then** only the current profile's learning profile is returned — no cross-profile access

**FRs:** FR243

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Concurrent updates | Two Inngest runs for same profile | Version conflict | Retry with fresh read (optimistic lock) |
| Profile deleted mid-analysis | FK cascade fires during write | Inngest step fails | Inngest retry, step idempotent — no-ops on missing profile |
| JSONB corruption | Invalid JSON written | Analysis reads null | Default to empty arrays, log error, re-create on next analysis |

---

### Story 16.2: Session Analysis Inngest Function

As the system,
I need to analyze each completed session to extract learning signals,
So that the learner's profile is incrementally enriched after every interaction.

**Acceptance Criteria:**

**Given** a session completes (status → `completed` or `auto_closed`)
**When** the `session.completed` event fires
**Then** a new Inngest step `analyze-learner-profile` runs after retention updates
**And** reads the session's `sessionEvents` transcript
**And** sends the transcript to a dedicated LLM call with structured output schema

**Given** the LLM returns analysis results
**When** the results have `confidence: 'medium'` or `confidence: 'high'`
**Then** the learning profile is updated via incremental merge (not replace)
**And** interests are appended and deduplicated
**And** struggles are upserted by subject+topic with `attempts` incremented
**And** `learningStyle` fields are only updated if the new signal has higher confidence than the existing value

**Given** the LLM returns analysis with `confidence: 'low'`
**When** merging into the profile
**Then** the analysis is logged for monitoring but NOT applied to the profile
**And** the metric `learner_profile.analysis.low_confidence` is emitted

**Given** a profile has `memoryEnabled = false`
**When** the session analysis step runs
**Then** the step short-circuits immediately — no LLM call, no profile update

**Given** the analysis LLM call fails
**When** the Inngest step retries (default retry policy)
**Then** the failure does not affect other steps in the session completion chain
**And** `captureException` reports the failure to Sentry

**FRs:** FR244

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| LLM timeout | Provider latency spike | Nothing (background) | Inngest retry, max 3 attempts |
| LLM hallucination | Wrong inference | Incorrect memory item | Confidence threshold blocks low-quality. Child/parent can delete (16.7/16.8) |
| Session has no meaningful content | Very short session, only greetings | Nothing extracted | Analysis returns null fields, no profile update |
| Transcript too long | Extended session | LLM context limit | Truncate to last N events (configurable, default 100) |

---

### Story 16.3: Memory Context Injection

As a learner returning for a new session,
I want the mentor to reference my preferences, interests, and known struggles,
So that each session feels like continuing a relationship, not starting from scratch.

**Acceptance Criteria:**

**Given** a learner starts a new session
**When** `buildSystemPrompt()` constructs the system prompt
**Then** a "learner memory" block is included if a `learning_profiles` row exists with `memoryEnabled = true`
**And** the block is formatted as natural language (not JSON)
**And** the block is capped at 500 tokens

**Given** the learner has known struggles relevant to the current subject
**When** the memory block is constructed
**Then** struggles are prioritized first (highest priority)
**And** the mentor receives instruction to be extra patient and try different explanation approaches

**Given** the learner has recorded interests
**When** the mentor generates examples
**Then** examples reference the learner's interests: "Let's use a space mission to understand fractions"

**Given** a learner has no learning profile (new user, or memory disabled)
**When** the system prompt is built
**Then** no memory block is injected — the prompt works identically to today's behavior

**Given** the memory block plus existing learning history block (FR163)
**When** both are injected
**Then** total additional context stays within a reasonable budget
**And** the two blocks serve complementary purposes: history = what was studied, memory = how the learner learns

**FRs:** FR245

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Learning profile read fails | DB error | Session starts without memory | Graceful fallback — stateless session, log error |
| Memory block exceeds 500 tokens | Very rich profile | Truncated memory | Priority-ordered truncation (FR245.2), no user impact |
| Stale memory (wrong preference) | Outdated inference | Suboptimal example style | Child corrects via "This is wrong" (FR249.6), profile updates on next session |

---

### Story 16.4: Interest Detection & Tagging

As a learner who mentions things they care about during chat,
I want the mentor to remember my interests,
So that future sessions use examples and contexts that resonate with me.

**Acceptance Criteria:**

**Given** a learner says "I love space" or "dinosaurs are cool" during a session
**When** the session analysis runs (Story 16.2)
**Then** "space" or "dinosaurs" is added to the `interests` array in the learning profile

**Given** the learner shows enthusiastic engagement about a topic (rapid follow-ups, requests for more)
**When** the session analysis runs
**Then** the topic is detected as an interest signal

**Given** the interests array reaches the 20-entry cap
**When** a new interest is detected
**Then** the oldest interest (by first-seen date) is evicted

**Given** an interest has not been referenced or reinforced in 60+ days
**When** the next analysis runs
**Then** the interest is demoted (moved to end of array) and eventually evicted by the cap

**Given** the mentor has recorded interests for the learner
**When** a new session starts in any subject
**Then** the mentor can reference interests in examples: "Imagine the dinosaurs are sharing pizza — that's how fractions work!"

**FRs:** FR246

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| False positive interest | Child mentions topic in passing | Irrelevant example in future session | Child deletes via "What My Mentor Knows" (FR249.3) |
| Interest missed | Subtle signal | No personalization | Profile builds over time — no single session is critical |

---

### Story 16.5: Struggle Pattern Detection

As a learner who repeatedly struggles with a concept,
I want the mentor to recognize the pattern and adapt,
So that I get different approaches and more patience instead of the same explanation again.

**Acceptance Criteria:**

**Given** a learner shows confusion on a concept in a single session
**When** the session analysis runs
**Then** a struggle entry is created with `attempts: 1`, `confidence: 'low'`
**And** the struggle is NOT injected into future prompts (below confidence threshold)

**Given** the same concept causes confusion across 3+ sessions
**When** the session analysis runs
**Then** `attempts` is incremented, `confidence` upgraded to `'medium'`
**And** the struggle begins appearing in the memory block for relevant sessions

**Given** a struggle reaches 5+ sessions (confidence: `'high'`)
**When** the next session analysis runs
**Then** a `struggle_flagged` event is emitted for parent notification
**And** the parent dashboard shows: "{Child} has been working hard on {topic} — they may need some extra support"

**Given** a learner demonstrates understanding of a previously flagged struggle
**When** the session analysis detects correct answers and confident engagement on that topic
**Then** the struggle's confidence is downgraded one level
**And** after 3 consecutive sessions without the struggle, the entry is removed

**Given** the mentor has a recorded struggle for the current topic
**When** the session system prompt is built
**Then** the memory block includes: "Be extra patient with [topic] — try a different explanation approach than before"

**FRs:** FR247

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| False struggle flag | Topic is genuinely hard, not a personal struggle | Overly cautious mentor | Confidence degrades after successful sessions. Child can delete. |
| Struggle persists despite adaptation | Concept requires in-person help | Parent notification | Parent sees flag, can intervene. Mentor acknowledges difficulty. |
| Struggle not detected | Subtle confusion signals | No adaptation | Default teaching behavior still works. Profile builds over time. |

---

### Story 16.6: Explanation Effectiveness Tracking

As the system,
I need to track which explanation styles work for each learner,
So that the mentor converges on the most effective teaching approach over time.

**Acceptance Criteria:**

**Given** the mentor explains a concept using a story-based approach
**When** the child responds with understanding (correct follow-up, "oh I get it", moves on)
**Then** the session analysis tags `stories` as effective for this session

**Given** the mentor explains using an analogy
**When** the child responds with confusion ("I don't understand", asks again)
**Then** the session analysis tags `analogies` as ineffective for this session

**Given** 5+ data points have been collected for explanation styles
**When** a clear pattern emerges (e.g., stories effective 4/5 times, diagrams ineffective 3/4 times)
**Then** `learningStyle.preferredExplanations` is updated

**Given** 10+ data points with a consistent pattern
**When** the learning profile is updated
**Then** `preferredExplanations` confidence is set to `'high'`
**And** the memory block consistently instructs the mentor to use the preferred style

**Given** a new user with no explanation effectiveness data
**When** the mentor teaches
**Then** the system prompt includes: "Try different explanation styles — stories, examples, analogies — and observe which ones click"
**And** early sessions actively vary approaches to build the model

**FRs:** FR248

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Wrong style inferred | Small sample size or atypical sessions | Suboptimal explanations | 3-session corroboration requirement. Child can override via "This is wrong." |
| Style varies by subject | Child likes stories for history, examples for math | Misapplied style | Subject-specific tracking (FR248.5) catches this with enough data. |
| Style changes over time | Child matures, preferences shift | Stale preference | Recency weighting in analysis. Old data naturally ages out. |

---

### Story 16.7: "What My Mentor Knows" Screen

As a learner,
I want to see what my mentor has learned about me,
So that I feel in control and can correct anything that's wrong.

**Acceptance Criteria:**

**Given** a learner navigates to profile settings
**When** they tap "What My Mentor Knows"
**Then** they see a friendly, age-appropriate display of their learning profile
**And** interests are shown as tappable chips
**And** strengths are framed positively ("You're doing great at...")
**And** struggles are framed as effort ("You've been working hard on...")

**Given** a learner wants to remove a memory item
**When** they tap the delete action on any item (interest, strength, struggle, communication note)
**Then** the item is removed from the `learning_profiles` JSONB immediately
**And** the mentor will not reference it in future sessions

**Given** a learner taps "This is wrong" on an inference
**When** the correction is recorded
**Then** the item is removed AND added to `suppressedInferences` so it is not re-inferred from old sessions

**Given** a new user with no learning profile data
**When** they open the screen
**Then** they see a friendly empty state: "Your mentor is still getting to know you! After a few sessions, you'll see what they've learned."
**And** a back navigation button is always visible (no dead end)

**Given** a learner under 10 (based on `birthYear`)
**When** viewing memory items
**Then** copy uses simple, friendly language: "Your mentor noticed you really like stories about animals!"

**Given** a learner 15+ (based on `birthYear`)
**When** viewing memory items
**Then** copy uses more direct language: "Learning preferences: example-based explanations, thorough pace"

**FRs:** FR249

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Loading fails | DB error | Error state | "Something went wrong" + Retry + Go Back |
| Delete fails | Network error | Toast: "Couldn't remove — try again" | Retry button, item remains until deletion succeeds |
| Empty profile | New user or all items deleted | Friendly empty state with guidance | Back navigation always available |

---

### Story 16.8: Parent Memory Visibility

As a parent,
I want to see and control what the mentor has learned about my child,
So that I can ensure the AI's understanding is appropriate and correct.

**Acceptance Criteria:**

**Given** a parent views a linked child's dashboard
**When** they tap "What the mentor knows"
**Then** they see the full learning profile with additional metadata:
**And** when each inference was first recorded
**And** how many sessions contributed to each inference
**And** confidence level for each item

**Given** a parent wants to disable memory entirely
**When** they toggle `memoryEnabled` off
**Then** a confirmation dialog appears: "The mentor will stop learning about {child}'s preferences."
**And** the session analysis short-circuits (no new data collected)
**And** the memory block is omitted from prompts
**And** existing data is preserved (not deleted) in case they re-enable

**Given** a parent wants to export memory data
**When** they tap "Export data"
**Then** all learning profile data is exported as JSON
**And** the export includes all fields, timestamps, and confidence levels

**Given** a parent wants to delete all memory data
**When** they tap "Delete all memory data" and confirm
**Then** the `learning_profiles` row is deleted entirely
**And** a new empty row will be created on the next session analysis (if `memoryEnabled` is still true)

**Given** a parent re-enables memory after disabling it
**When** `memoryEnabled` is toggled back on
**Then** preserved profile data becomes immediately active
**And** the next session analysis resumes updating the profile

**FRs:** FR250

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Toggle fails | Network error | Toast: "Couldn't update — try again" | Toggle reverts to previous state |
| Export fails | Large profile or timeout | Toast: "Export failed" | Retry. Fallback: data included in account-level export. |
| Delete fails | DB error | Toast: "Couldn't delete — try again" | Retry button |
| No linked children | Parent with no family links | Empty state | "Link a child to see their learning profile" + navigation to family settings |

---

### Story 16.9: Memory Warm-Start for New Subjects

As a learner starting a new subject,
I want the mentor to already know how I learn best,
So that the first session in a new subject benefits from everything learned in other subjects.

**Acceptance Criteria:**

**Given** a learner with an established learning profile starts a new subject
**When** `buildSystemPrompt()` runs for the first session in the new subject
**Then** cross-subject signals are injected: learning style, interests, communication notes
**And** subject-specific signals (strengths, struggles) are NOT injected from other subjects

**Given** the mentor has recorded interests
**When** the first session starts in a new language subject
**Then** the mentor can reference interests: "I know you like animals — let's learn Spanish animal names!"

**Given** a learner with no prior learning profile data
**When** they start their first subject
**Then** no warm-start data exists — the session uses default age + subject context
**And** the experience is identical to today's behavior

**Given** a learner with a rich profile (50+ sessions across 3 subjects)
**When** they start a 4th subject
**Then** the warm-start provides a meaningfully personalized first session
**And** the mentor uses the preferred explanation style from day one

**FRs:** FR251

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Profile exists but is sparse | Only 2 sessions total | Minimal warm-start | Graceful degradation — default behavior fills the gaps |
| Cross-subject transfer is wrong | Math learner prefers examples, but history needs stories | Suboptimal first session | Profile updates from new subject's sessions. Self-corrects over 3-5 sessions. |
| Profile read fails on new subject | DB error | No warm-start | Stateless session — identical to today. Logged for investigation. |

---

## Execution Order

### Phase A — Memory Infrastructure (Stories 16.1-16.3)

```
16.1 (Learning profile schema)                              ─── no deps
16.2 (Session analysis Inngest function)                    ─── depends on 16.1
16.3 (Memory context injection into system prompt)          ─── depends on 16.1
```

Story 16.1 ships first. Then 16.2 and 16.3 can run in parallel. Phase A delivers the core loop: sessions produce signals → signals update the profile → the profile enriches future sessions.

### Phase B — Memory Refinement (Stories 16.4-16.6)

```
16.4 (Interest detection & tagging)                         ─── depends on 16.2
16.5 (Struggle pattern detection)                           ─── depends on 16.2
16.6 (Explanation effectiveness tracking)                   ─── depends on 16.2
```

All three extend the analysis function (Story 16.2) with specialized detection logic. They can be developed in parallel. Phase B deepens the quality of signals feeding the learning profile.

### Phase C — Transparency & Control (Stories 16.7-16.9)

```
16.7 ("What My Mentor Knows" screen — child)                ─── depends on 16.1
16.8 (Parent memory visibility + GDPR controls)             ─── depends on 16.1, 16.7
16.9 (Memory warm-start for new subjects)                   ─── depends on 16.3
```

Phase C can run in parallel with Phase B. Story 16.7 and 16.8 provide transparency and control. Story 16.9 extends the context injection to cross-subject warm-start.

### Summary

```
Phase A: 16.1 → (16.2 || 16.3)           ── core infrastructure, must complete first
Phase B: (16.4 || 16.5 || 16.6)          ── depends on Phase A, internal parallelism
Phase C: (16.7 → 16.8) || 16.9           ── depends on Phase A, parallel with Phase B
```

---

## Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 13** (Session Lifecycle) | The `session.completed` event (Epic 13) triggers the memory analysis Inngest function (Story 16.2). The session close flow must emit this event reliably. No changes needed to Epic 13 — the event already exists. |
| **Epic 14** (Human Agency) | "I don't remember" feedback during recall tests (Story 14.2) feeds into struggle detection (Story 16.5). Per-message feedback (Story 14.5) — thumbs up/down on AI responses — corroborates explanation effectiveness tracking (Story 16.6). |
| **Epic 15** (Visible Progress) | Struggle and strength data in the learning profile can cross-reference progress statistics. A child who progresses quickly in a subject confirms a "strength" inference. A child who stalls confirms a "struggle" inference. Epic 15's FR numbers are FR230–FR250; this epic uses FR243–FR251 (renumbered to avoid collision). Inngest chain ordering (AD5) ensures memory analysis runs at position 4, before Epic 15's snapshot refresh at position 5. |
| **Conversation-First** (Learning Flow) | Freeform sessions (Flow 3) may have no subject — the analysis function handles this via FR244.9 (subject: null in struggles). The `rawInput` field is used as a strong interest signal (FR246.5). The Inngest chain ordering (AD5) places memory analysis after post-session filing but before the progress snapshot. System prompt token budget (AD6) is shared across all three specs. |
| **Epic 6** (Language Learning) | Vocabulary mastery data feeds into the strength/struggle model. A child mastering A1 vocabulary is a strength signal. A child failing fluency drills on the same words is a struggle signal. The session analysis function should be aware of `pedagogyMode = 'four_strands'` when analyzing language sessions. |
| **Epic 7** (Library) | The learning profile complements the learning history block (FR163). Epic 7 tells the mentor what was studied. Epic 16 tells the mentor how the learner learns. Both are injected into `buildSystemPrompt()`. |
| **Epic 12** (Persona Removal) | `birthYear` on the profiles table replaces persona for age-appropriate behavior. The learning profile adds behavioral understanding on top — the mentor adapts not just to age but to individual learning patterns. The `learningStyle` fields in the profile are persona-independent. |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **LLM hallucination in analysis** — the analysis function infers wrong preferences from ambiguous conversation | Medium | Confidence thresholds (FR243.4). 3-session corroboration for learning style (FR244.5). Child/parent can delete incorrect inferences (FR249, FR250). Low-confidence signals are logged but not applied. |
| **Privacy / GDPR compliance** — storing behavioral inferences about children requires clear consent and deletion controls | High | Story 16.8 addresses this directly: full visibility, export, deletion, opt-out. All data cascades on profile deletion. Data included in existing export pipeline. Consent state checked before first analysis. |
| **Prompt bloat** — injecting too much memory context degrades LLM response quality | Medium | Hard cap at 500 tokens (FR245.4). Priority ordering ensures the most relevant signals are injected first. Memory block omitted when irrelevant. Monitored via token count metrics. |
| **Cold start** — new users get no benefit from memory features | Low | Acceptable by design. Default age + subject context still works (identical to today). Memory adds value gradually — noticeable after 5+ sessions, meaningful after 20+. |
| **Stale preferences** — learner's style changes over time but old data persists | Medium | Recency weighting in analysis. 60-day interest demotion (FR246.4). 90-day struggle archival (FR243.5). Confidence degrades on contradicting signals. User can always delete. |
| **Cost of analysis LLM calls** — per-session background LLM call adds to operational costs | Low | Budget model (~$0.002/analysis). At scale: 10 sessions/day/user = $0.60/month/user. Well within margin. Can be further optimized by skipping very short sessions (< 5 exchanges). |
| **Analysis function failures blocking session chain** — if the memory analysis step fails, it should not block retention, coaching, or other post-session processing | Medium | The analysis step is isolated within the Inngest chain. Failures are caught, logged to Sentry, and retried independently. Other steps proceed regardless. |
| **Cross-subject style transfer is wrong** — math and history may require different explanation styles | Medium | Subject-specific tracking in `struggles` and `strengths` (FR248.5). Cross-subject transfer is limited to general preferences (pace, humor, explanation length). Subject-specific patterns override general patterns when enough data exists. |

---

## What Already Exists (No New Infrastructure Needed)

| Component | Location | How Epic 16 Uses It |
|-----------|----------|---------------------|
| LLM router | `services/llm/router.ts` | All LLM calls (session analysis, prompt construction) go through the existing router. No new LLM integration needed. |
| `buildSystemPrompt()` | `services/exchanges.ts` | Memory context block is injected alongside the existing learning history block. Single modification point. |
| Session events | `sessionEvents` table (JSONB metadata) | The session analysis function reads the full transcript from existing session events. No schema changes to sessions. |
| `session.completed` event | `inngest/functions/session-completed.ts` | The trigger for the memory analysis function already exists. New step added to the existing chain. |
| Inngest infrastructure | `inngest/` | Background processing framework already handles post-session work. Memory analysis is one more step. |
| Profile model | `profiles` table | `birthYear` for age-appropriate copy. `profileId` for scoping. FK for cascade delete. |
| Scoped repository | `createScopedRepository(profileId)` | Profile-scoped reads/writes for learning profile data. Existing pattern. |
| Data export | `services/export.ts` | GDPR data export already exists. Learning profile data added to the export payload. |
| Coaching card precomputation | `services/coaching-cards.ts` | Parent struggle notifications (FR247.6) use the existing coaching card infrastructure. |

---

## What Must Be Built

| Component | Description | Story |
|-----------|-------------|-------|
| `learning_profiles` table | New DB table with JSONB fields for learning data | 16.1 |
| `session/analyze-learner-profile` Inngest function | Post-session LLM analysis with structured output | 16.2 |
| Memory context block in `buildSystemPrompt()` | Natural language memory injection, 500-token budget | 16.3 |
| Interest detection prompts | Specialized analysis for enthusiasm/hobby signals | 16.4 |
| Struggle pattern matching | Cross-session comparison with confidence escalation | 16.5 |
| Effectiveness classification | Explanation style tagging with corroboration logic | 16.6 |
| `/(tabs)/more/mentor-memory` screen | Child-facing memory visibility with delete actions | 16.7 |
| `/(parent)/dashboard/[childId]/mentor-memory` screen | Parent-facing visibility with GDPR controls | 16.8 |
| Cross-subject warm-start logic | Subject-aware signal filtering in context injection | 16.9 |
