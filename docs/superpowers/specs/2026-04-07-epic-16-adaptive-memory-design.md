# Epic 16: Adaptive Memory — The Mentor That Learns You

**Author:** Zuzka + Claude
**Date:** 2026-04-07
**Status:** Draft
**FRs:** FR243–FR252
**Dependencies:** Story 16.0 (fix existing memory layers — **IMPLEMENTED**), Epic 13 (session lifecycle), Epic 7 (library infrastructure), LLM router (`services/llm/router.ts`)
**UX Review:** 2026-04-09 — 10 improvements added (FR246.6, FR247.6–7, FR248.6, FR249.7–8, FR250.7–8, FR252). New Story 16.10, Phase D, AD6.
**Spec Alignment:** 2026-04-09 — FR244.4 output schema updated (added `strengths`, `resolvedTopics`, expanded explanation style enum to 6 values per FR248.2). `engagementLevel` clarified as captured-but-not-stored. FR244.8 metric notes added. Story 16.0 added as dependency. Amendments cross-referenced.
**Amendments integrated:** 2026-04-09 — Amendment 2 (Epic 15 mastery cross-reference → FR247.4.1) and Amendment 3 (memory layer deduplication → FR245.8) from `docs/superpowers/plans/2026-04-08-epic-16-amendments.md` formalized as spec requirements.

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
8. **Memory is collaborative, not surveillance.** The learner is a participant in building their profile, not a subject being observed. They can contribute ("Tell your mentor"), see what the mentor knows, correct mistakes, undo corrections, and control granularly what is collected vs. used. The mentor occasionally asks rather than only silently observing. The profile screen leads with positives, not struggles.

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
| 16.10 | "Tell Your Mentor" — Learner-Initiated Input | D | PLANNED | FR252 |

---

## Functional Requirements

### FR243: Child Learning Profile Schema

- **FR243.1:** New `learning_profiles` table:
  ```
  learning_profiles
  ├── id               UUID, primary key
  ├── profileId        → profiles.id (FK, cascade delete, unique)
  ├── learningStyle    JSONB, nullable
  │   ├── preferredExplanations   'stories' | 'examples' | 'diagrams' | 'analogies' | 'step-by-step' | 'humor'
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
      effective: ('stories' | 'examples' | 'diagrams' | 'analogies' | 'step-by-step' | 'humor')[],
      ineffective: ('stories' | 'examples' | 'diagrams' | 'analogies' | 'step-by-step' | 'humor')[]
    } | null,
    interests: string[] | null,          // new interests detected
    strengths: { topic: string, subject: string }[] | null,  // topics where learner demonstrates mastery
    struggles: { topic: string, subject: string | null }[] | null,  // subject nullable for freeform sessions (FR244.9)
    resolvedTopics: { topic: string, subject: string | null }[] | null,  // previously-struggled topics where learner now shows understanding (FR247.4)
    communicationNotes: string[] | null,  // new observations
    engagementLevel: 'high' | 'medium' | 'low' | null,  // captured for future use (monitoring, analytics)
    confidence: 'low' | 'medium' | 'high'  // overall confidence in this analysis
  }
  ```
  > **Note:** `strengths` and `resolvedTopics` were added during adversarial plan review to enable FR247.4 (struggle resolution) and populate the strengths UI. `engagementLevel` is captured for monitoring and future analytics but is not currently stored on the learning profile.
- **FR244.5:** Updates to the learning profile are **incremental merge, not replace**:
  - `interests`: append new, deduplicate, respect cap (FR243.5)
  - `strengths` / `struggles`: upsert by subject+topic, increment `attempts` on struggles, update `lastSeen`
  - `learningStyle`: only update a field if the new signal has higher confidence than the existing value. Require 3+ corroborating sessions before setting `learningStyle` fields.
  - `communicationNotes`: append, deduplicate by semantic similarity (simple string match, not LLM-based)
- **FR244.6:** If `memoryEnabled = false` on the profile, the Inngest function short-circuits — no LLM call, no updates.
- **FR244.7:** The analysis LLM call uses a budget model (not premium). Target latency: under 5 seconds. This is background processing — no user-facing latency impact.
- **FR244.8:** Emit a structured metric on each analysis run: `learner_profile.analysis.completed` with `{ profileId, sessionId, fieldsUpdated: string[], confidence }`. Enables monitoring of how frequently profiles are updated and with what confidence. When the analysis returns `confidence: 'low'` (logged but not applied per FR244.5 thresholds), emit `learner_profile.analysis.low_confidence` for monitoring.
- **FR244.9:** Sessions from Conversation-First Flow 3 (freeform) may have no subject. The analysis function must handle `subjectId = null`: run analysis on the transcript regardless, store struggles with `subject: null` when unfiled, and use the filing result (topic → subject mapping) when available from the preceding Inngest step. The `rawInput` field (the learner's initial free-text prompt) is treated as a strong interest signal alongside the transcript (FR246.5).

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
- **FR245.8:** *(Amendment 3)* When multiple memory sections are injected into the system prompt (prior learning, cross-subject highlights, book history, embedding memory, learner profile), `buildSystemPrompt()` appends a deduplication instruction: *"The memory sections above may overlap. Synthesize them into a unified understanding of the learner. Do not repeat the same prior knowledge reference multiple times."* This prevents the mentor from saying "I remember you studied photosynthesis" three times because three memory layers each mention photosynthesis. The instruction is only appended when 2+ memory sections are present. The five memory layers and their approximate token budgets are:
  | Layer | Source | Budget |
  |-------|--------|--------|
  | Prior Learning | `prior-learning.ts` | ~1500 tokens |
  | Cross-Subject Highlights | `prior-learning.ts` | ~200 tokens |
  | Book History | `session.ts` | ~1000 tokens |
  | Embedding Memory | `memory.ts` | ~375 tokens |
  | Learner Profile | `learner-profile.ts` | 500 tokens (FR245.4) |

  Total combined budget is ~3,575 tokens, well within model context limits for both Claude and Gemini.

### FR246: Interest Detection & Tagging

- **FR246.1:** The session analysis function (FR244) detects interest signals from natural conversation. Interest signals include:
  - Explicit statements: "I love space", "dinosaurs are cool", "I play football"
  - Enthusiastic engagement: rapid follow-up questions about a topic, requests for more information
  - Repeated references to a theme across messages within a session
- **FR246.2:** Detected interests are stored as plain strings in the `interests` array, not categorized or taxonomized. "space", "dinosaurs", "football", "Minecraft" — not "Science > Astronomy" or "Sports > Football".
- **FR246.3:** The mentor uses interests for example generation: "Let's use a space mission to understand fractions" or "Imagine dinosaurs dividing their territory — that's what fractions do." The meta-instruction in FR245.5 covers this — no per-interest prompting needed.
- **FR246.4:** Interests that haven't been referenced or reinforced in 60+ days are demoted (moved to end of array, eventually evicted by cap).
- **FR246.5:** The session's `rawInput` field (the learner's initial free-text prompt) is treated as a strong interest signal alongside the transcript. Include it in the analysis payload so the LLM can detect interests from what the learner chose to explore.
- **FR246.6:** The memory block includes a soft interest-relevance hint for the LLM: "Use interests for example generation but don't force them — if the learner doesn't engage with an interest-based example, drop it and try a different approach." This prevents interests from one subject being awkwardly shoehorned into another (e.g., a child who loves Minecraft doesn't need every Spanish lesson framed around Minecraft).

### FR247: Struggle Pattern Detection

- **FR247.1:** A "struggle" is flagged when a child shows confusion on the same concept across 3+ sessions. Single-session confusion is normal learning — it does not trigger a struggle flag.
- **FR247.2:** Struggle detection runs as part of the session analysis (FR244). The analysis LLM compares the current session's struggle signals against the existing `struggles` array in the learning profile.
- **FR247.3:** When a new struggle is detected:
  - Increment `attempts` counter on the existing struggle entry (or create a new entry)
  - Update `lastSeen` timestamp
  - Set confidence to `medium` after 3 sessions, `high` after 5 sessions
- **FR247.4:** When a struggle is resolved (child demonstrates understanding in a subsequent session), the struggle entry's confidence is downgraded one level. After 3 consecutive sessions without the struggle appearing, the entry is removed.
- **FR247.4.1:** *(Amendment 2)* Struggle entries are cross-referenced against Epic 15's retention/mastery data before injection into the memory block (FR245). When `buildMemoryBlock()` is called, it accepts an optional `retentionContext: { strongTopics: string[] }` parameter. Topics with strong retention (spaced repetition `intervalDays >= 21`) are excluded from the "struggles" section of the memory block. This prevents contradictory signals — e.g., the mentor saying "You've been working hard on fractions" when the spaced repetition system shows fractions are well-retained. Both signals can be simultaneously true (a child can pass a test but still get confused in conversation), but the system prompt should not present them as contradictory. The retention data is the source of truth for what is *retained*; the session transcript is the source of truth for what is *confusing in practice*. When they disagree, retention wins for prompt injection — the struggle remains in the profile for tracking but is suppressed from the LLM context.
- **FR247.5:** The memory context (FR245) adjusts the mentor's behavior on known struggles:
  - Slower pace, more patient
  - Try a different explanation style than what previously failed
  - Check prerequisites before diving in
  - Acknowledge growth: "Last time fractions were tricky — let's see how you do now!"
- **FR247.6:** Parent notification uses a two-tier system:
  - **Early signal** at `medium` confidence (3+ sessions): emit a `struggle_noticed` coaching card with softer language: "It looks like {child} is finding {topic} challenging. Nothing to worry about — just keeping you in the loop."
  - **Escalated signal** at `high` confidence (5+ sessions): emit a `struggle_flagged` coaching card with stronger language: "{Child} has been working hard on {topic} — they may need some extra support."
  
  The early signal ensures parents aren't in the dark for 5+ sessions while their child struggles. Parents who don't want early notifications can dismiss them without affecting the system.
- **FR247.7:** When a struggle is resolved (entry removed after 3 consecutive sessions without recurrence per FR247.4), emit a `struggle_resolved` coaching card for both the child and parent profiles:
  - **Child card:** "Great news — you've conquered {topic}!" (age-appropriate copy via `birthYear`)
  - **Parent card:** "Great news — {child} seems to have overcome their difficulty with {topic}."
  - The mentor also references the achievement naturally in the next relevant session: "Remember when {topic} felt tough? Look at you now!" The meta-instruction in FR245.5 covers this — no per-topic prompting needed.

### FR248: Explanation Effectiveness Tracking

- **FR248.1:** During session analysis (FR244), the LLM classifies each explanation attempt in the transcript as effective or ineffective based on the child's response:
  - **Effective signals:** correct follow-up answer, "oh I get it", "that makes sense", moves on quickly, asks a deeper question
  - **Ineffective signals:** "I don't understand", asks the same question again, gives wrong answer after explanation, disengages
- **FR248.2:** Each explanation attempt is also tagged with its style: `stories`, `examples`, `diagrams`, `analogies`, `step-by-step`, `humor`. The analysis LLM determines the style from the transcript.
- **FR248.3:** Effectiveness data feeds into the `learningStyle.preferredExplanations` field. After 5+ data points, the profile records which styles are most effective. After 10+ data points with a clear pattern, confidence is set to `high`.
- **FR248.4:** The mentor actively varies explanation styles until the profile has enough data. Early sessions should try different approaches to build the model faster. The system prompt includes: "Try different explanation styles — stories, examples, analogies — and observe which ones click."
- **FR248.5:** Effectiveness tracking respects subject boundaries where appropriate. A child who learns math best with visual examples may learn history best with stories. If cross-subject patterns emerge, they are recorded at the profile level. If subject-specific patterns emerge, they are recorded with subject context in the `strengths`/`struggles` arrays.
- **FR248.6:** The mentor occasionally asks lightweight preference check-in questions to make memory feel collaborative rather than surveillance-like. Implementation:
  - The system prompt includes a conditional instruction: "If this learner's profile has fewer than 5 data points on explanation style, occasionally ask a natural check-in question like 'Did that example help?' or 'Would you prefer I explain it differently?' — no more than once per session."
  - Check-in responses are treated as high-confidence signals in the session analysis (they are explicit, not inferred).
  - Once the profile has sufficient data (5+ effectiveness data points), check-in questions stop — the mentor adapts silently based on observed patterns.
  - Check-in questions are conversational and natural, never form-like: "Did the story about the pirates help you understand fractions better?" not "Rate this explanation 1-5."

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
- **FR249.7:** Suppressed inferences are recoverable. The "What My Mentor Knows" screen includes a "Hidden items" section (collapsed by default) showing all `suppressedInferences` entries with an "Bring back" action. Tapping "Bring back" removes the item from `suppressedInferences`, allowing the analysis function to re-infer it from future sessions. This prevents accidental taps on "This is wrong" from permanently killing a correct inference.
- **FR249.8:** The screen layout prioritizes positive information to avoid feeling like a report card:
  - **Strengths and interests are shown first** (prominent, expanded by default)
  - **Struggles are shown in a collapsible section** titled "Things you're improving at" (collapsed by default on first visit, remembers toggle state). Each struggle shows a directional indicator when available: attempts trending down = "Getting better!" marker.
  - This ordering ensures the first impression is positive. Children who don't want to see their struggle list don't have to.

### FR250: Parent Memory Visibility

- **FR250.1:** Parent dashboard gains a "What the mentor knows" section for each linked child. Route: `/(parent)/dashboard/[childId]/mentor-memory`.
- **FR250.2:** The parent sees the same data as the child (FR249) plus additional metadata:
  - When each inference was first recorded
  - How many sessions contributed to each inference
  - Confidence level for each item
- **FR250.3:** The parent can:
  - Remove specific memory items (same as child, FR249.3)
  - Toggle memory collection and/or injection off (FR250.8)
  - Export all memory data in **human-readable format** (GDPR Article 20 — data portability). The primary export is a well-formatted summary (structured text or rendered HTML) that a non-technical parent can understand. A secondary "Download raw data (JSON)" link provides the machine-readable format for technical users or regulatory compliance. The summary includes: all profile fields with labels, timestamps in local format, confidence levels explained in plain language ("confirmed over 5 sessions" not "high").
  - Delete all memory data (GDPR Article 17 — right to erasure). This deletes the `learning_profiles` row entirely.
- **FR250.4:** When memory collection is toggled off (FR250.8):
  - The `learning_profiles` row is preserved but the collection flag prevents new analysis writes
  - The session analysis Inngest function short-circuits (FR244.6)
  - If injection is also off, the memory context block is omitted from prompts (FR245.1)
  - A confirmation dialog warns: "The mentor will stop learning about {child}'s preferences. Sessions will still work, but the mentor won't remember what works best."
- **FR250.5:** When memory collection is toggled back on, the preserved profile data is immediately active again. No data is lost during the off period (but no new data was collected either). If injection was kept on while collection was off, the mentor continued using existing data during the off period.
- **FR250.6:** GDPR compliance: all learning profile data is included in the existing data export pipeline (`services/export.ts`). The "Delete all data" action in account settings already cascades to the learning profile via the FK on `profileId`.
- **FR250.7:** Memory collection requires **explicit parental consent** before first activation. Implementation:
  - On the first session analysis trigger for a child profile, if no consent has been recorded, the system skips analysis (same as `memoryEnabled = false`).
  - The parent sees a one-time in-app prompt on the child's dashboard: "Would you like {child}'s mentor to remember how they learn best? The mentor will build a learning profile over time to personalize sessions. You can view, edit, or delete this data anytime."
  - Options: "Yes, enable" / "Not now" / "Learn more" (links to the memory visibility screen).
  - "Not now" can be revisited from settings. The prompt surfaces again after 7 days if not dismissed permanently.
  - Consent state is stored as `memoryConsentStatus: 'pending' | 'granted' | 'declined'` on the learning profile (or a new field on the profile). `memoryEnabled` is only set to `true` after consent is granted.
  - For child profiles without a linked parent (self-managed teen accounts), the consent prompt appears on the child's own settings screen.
  - This satisfies GDPR Article 8 (conditions applicable to child's consent in relation to information society services) for behavioral profiling of minors.
- **FR250.8:** Memory controls are **granular**, not all-or-nothing. The parent (and child for self-managed accounts) can independently control:
  - **Collection:** Whether the session analysis runs and updates the profile (`memoryCollectionEnabled: boolean`, default depends on consent status FR250.7)
  - **Prompt injection:** Whether the memory block is included in system prompts (`memoryInjectionEnabled: boolean`, default `true` when collection is enabled)
  
  Use cases:
  - Collection ON + Injection ON = full adaptive memory (default after consent)
  - Collection ON + Injection OFF = data is collected for parent visibility but the mentor doesn't adapt (parent wants to monitor without AI behavioral changes)
  - Collection OFF + Injection ON = existing data is used but no new data collected (profile is frozen at current state)
  - Collection OFF + Injection OFF = fully stateless, equivalent to old `memoryEnabled = false`
  
  The UI presents these as two clearly labeled toggles, not a matrix. The old `memoryEnabled` boolean is replaced by these two fields.

### FR252: "Tell Your Mentor" — Learner-Initiated Memory Input

- **FR252.1:** The "What My Mentor Knows" screen (FR249) includes a "Tell your mentor" input at the top of the screen. This allows the learner to directly contribute to their profile rather than waiting for the system to infer preferences over many sessions.
- **FR252.2:** The input accepts freeform text. Examples:
  - "I love Pokémon"
  - "I hate when you explain things too slowly"
  - "I'm dyslexic"
  - "I like short answers"
  
  The text is sent to the same analysis LLM (budget model, FR244.7) with a dedicated prompt that extracts structured signals (interests, communication notes, learning style preferences) from the learner's statement. The extracted signals are merged into the profile using the same incremental merge logic (FR244.5).
- **FR252.3:** Learner-initiated inputs are treated as **high-confidence signals** — they require no corroboration threshold because the learner explicitly stated them. They bypass the 3-session requirement for learning style fields (FR244.5) since they are direct declarations, not inferences.
- **FR252.4:** Each learner-contributed item is tagged with `source: 'learner'` (vs. `source: 'inferred'` for analysis-derived items) so the "What My Mentor Knows" screen can distinguish them. Learner-contributed items display a "You told your mentor" badge. This makes the profile feel collaborative — "I told my mentor I like dinosaurs" vs. "My mentor figured out I like dinosaurs."
- **FR252.5:** Parents can also use the "Tell the mentor" input on the parent memory visibility screen (FR250) to add context they know about their child: "She's dyslexic", "He had a bad experience with his math teacher", "She loves art." Parent inputs are tagged with `source: 'parent'` and displayed with a "Added by parent" badge.
- **FR252.6:** Learner-initiated inputs are subject to the same caps as inferred data (20 interests, 10 communication notes, etc.). If the cap is reached, the learner is informed: "Your mentor already knows 20 interests — remove one to add a new one."
- **FR252.7:** The "Tell your mentor" input is age-adapted:
  - Under 10: "Tell your mentor something about you!" with example prompts shown as tappable suggestions ("I like dinosaurs", "I like stories", "Please be funny")
  - 10-14: "Tell your mentor something" with placeholder text
  - 15+: "Add a note for your mentor" with placeholder text

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

### AD6: Collaborative Memory, Not Surveillance

The original design treated memory as purely observation-based: the AI watches, infers, and silently adapts. The 2026-04-09 UX review identified this as the single biggest risk to user trust — it makes the system feel like it's studying children behind a one-way mirror. The revised design shifts the mental model from "the AI observes you" to "you and your mentor build understanding together."

Key design changes that support this:

- **"Tell your mentor" input (FR252):** Children and parents can directly contribute to the profile, making it feel like a collaboration rather than inference.
- **Mentor check-in questions (FR248.6):** The mentor occasionally asks "Did that example help?" instead of only silently observing. This is what a real tutor does.
- **Consent-first activation (FR250.7):** Parents explicitly opt in instead of discovering profiling after the fact.
- **Granular controls (FR250.8):** Parents can separate "collect data" from "use data in prompts" — e.g., monitor without AI adaptation.
- **Undo suppression (FR249.7):** Mistakes are recoverable, reducing anxiety around profile management.
- **Celebration on resolution (FR247.7):** The system doesn't just track negatives — it celebrates growth.
- **Strengths-first layout (FR249.8):** The profile screen feels positive, not like a report card.

Trade-off: more complexity in the UI and API. Justified by the trust requirements of a children's education app under GDPR.

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

**Given** the mentor uses an interest-based example in a subject where it doesn't fit
**When** the learner doesn't engage with the interest framing
**Then** the memory block's soft relevance hint (FR246.6) instructs the mentor to drop it and try a different approach
**And** the lack of engagement is not counted against the interest

**FRs:** FR246

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| False positive interest | Child mentions topic in passing | Irrelevant example in future session | Child deletes via "What My Mentor Knows" (FR249.3). Soft relevance hint (FR246.6) tells mentor to drop it if learner doesn't engage. |
| Interest forced into wrong subject | Cross-subject interest transfer | Awkward example | FR246.6 hint: "don't force them." Mentor drops interest framing on low engagement. |
| Interest missed | Subtle signal | No personalization | Profile builds over time — no single session is critical. Learner can add via "Tell your mentor" (FR252). |

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

**Given** a struggle reaches 3+ sessions (confidence: `'medium'`)
**When** the next session analysis runs
**Then** a `struggle_noticed` coaching card is emitted for the parent profile
**And** the parent dashboard shows: "It looks like {child} is finding {topic} challenging. Nothing to worry about — just keeping you in the loop."

**Given** a struggle reaches 5+ sessions (confidence: `'high'`)
**When** the next session analysis runs
**Then** a `struggle_flagged` coaching card is emitted for the parent profile
**And** the parent dashboard shows: "{Child} has been working hard on {topic} — they may need some extra support."

**Given** a learner demonstrates understanding of a previously flagged struggle
**When** the session analysis detects correct answers and confident engagement on that topic
**Then** the struggle's confidence is downgraded one level
**And** after 3 consecutive sessions without the struggle, the entry is removed

**Given** a struggle entry is removed (resolved after 3 sessions without recurrence)
**When** the resolution is confirmed
**Then** a `struggle_resolved` coaching card is emitted for both the child and parent profiles
**And** the child card says: "Great news — you've conquered {topic}!" (age-appropriate copy)
**And** the parent card says: "Great news — {child} seems to have overcome their difficulty with {topic}."
**And** the memory block includes a growth reference for the next relevant session: "This learner recently overcame {topic} — acknowledge their growth!"

**Given** the mentor has a recorded struggle for the current topic
**When** the session system prompt is built
**Then** the memory block includes: "Be extra patient with [topic] — try a different explanation approach than before"

**FRs:** FR247

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| False struggle flag | Topic is genuinely hard, not a personal struggle | Overly cautious mentor | Confidence degrades after successful sessions. Child can delete. |
| Struggle persists despite adaptation | Concept requires in-person help | Parent notification at medium (3 sessions) | Parent sees early signal, can intervene sooner. Mentor acknowledges difficulty. |
| Struggle not detected | Subtle confusion signals | No adaptation | Default teaching behavior still works. Learner can flag via "Tell your mentor" (FR252). |
| False resolution | One good session on a shaky topic | Premature celebration | Requires 3 consecutive clear sessions — one good session isn't enough. If struggle recurs, re-enters at previous attempt count. |
| Celebration feels hollow | Child doesn't feel they improved | Irrelevant card | Celebration only triggers on verified 3-session resolution. Mentor references it naturally, not mechanically. |

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

**Given** a learner's profile has fewer than 5 effectiveness data points
**When** the mentor finishes explaining a concept
**Then** the mentor may ask a natural check-in question: "Did that example help?" or "Would you prefer I explain it differently?"
**And** the check-in happens at most once per session
**And** the learner's response is treated as a high-confidence signal

**Given** a learner's profile has 5+ effectiveness data points
**When** the mentor teaches
**Then** check-in questions stop — the mentor adapts silently based on observed patterns

**FRs:** FR248

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Wrong style inferred | Small sample size or atypical sessions | Suboptimal explanations | 3-session corroboration requirement. Child can override via "This is wrong." Learner can declare preference via "Tell your mentor" (FR252). |
| Style varies by subject | Child likes stories for history, examples for math | Misapplied style | Subject-specific tracking (FR248.5) catches this with enough data. |
| Style changes over time | Child matures, preferences shift | Stale preference | Recency weighting in analysis. Old data naturally ages out. |
| Check-in feels mechanical | Rigid phrasing or too frequent | Learner annoyed | Once per session max. Stops after 5+ data points. Natural phrasing only. |

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

**Given** a learner views the screen
**When** the profile has both strengths and struggles
**Then** strengths and interests are shown first (expanded, prominent)
**And** struggles are in a collapsible section titled "Things you're improving at" (collapsed by default)

**Given** a learner previously tapped "This is wrong" on an item
**When** they view the "Hidden items" section (collapsed by default)
**Then** they see the suppressed inference with a "Bring back" action
**And** tapping "Bring back" removes it from `suppressedInferences`

**Given** a learner wants to tell the mentor something directly
**When** they use the "Tell your mentor" input at the top of the screen
**Then** the freeform text is analyzed by the LLM and merged into the profile as high-confidence signals
**And** the resulting items are tagged with `source: 'learner'` and show a "You told your mentor" badge

**FRs:** FR249, FR252

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Loading fails | DB error | Error state | "Something went wrong" + Retry + Go Back |
| Delete fails | Network error | Toast: "Couldn't remove — try again" | Retry button, item remains until deletion succeeds |
| Empty profile | New user or all items deleted | Friendly empty state with guidance + "Tell your mentor" input still visible | Back navigation always available |
| Accidental suppress | Wrong item tapped | Item disappears | "Hidden items" section shows suppressed items with "Bring back" action (FR249.7) |
| "Tell your mentor" parse fails | LLM can't extract signals | Toast: "I didn't understand that — try something like 'I love dinosaurs'" | Input remains, learner retries with simpler phrasing |
| Cap reached | 20 interests already stored | Inline message: "Your mentor already knows 20 interests — remove one to add a new one" | Swipe-to-remove on existing items, then retry |

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

**Given** a parent views a child's dashboard for the first time after Epic 16 ships
**When** the child has no recorded memory consent
**Then** a one-time prompt appears: "Would you like {child}'s mentor to remember how they learn best?"
**And** options are: "Yes, enable" / "Not now" / "Learn more"
**And** "Not now" resurfaces after 7 days unless permanently dismissed

**Given** a parent wants to control memory granularly
**When** they view the memory settings
**Then** they see two toggles: "Learn about {child}" (collection) and "Use what the mentor knows" (injection)
**And** each toggle has a clear description of its effect

**Given** a parent disables collection
**When** they toggle collection off
**Then** a confirmation dialog appears: "The mentor will stop learning about {child}'s preferences."
**And** the session analysis short-circuits (no new data collected)
**And** if injection is also off, the memory block is omitted from prompts
**And** existing data is preserved (not deleted) in case they re-enable

**Given** a parent wants to export memory data
**When** they tap "Export data"
**Then** a human-readable summary is presented (structured text with labels, dates, plain-language confidence)
**And** a secondary "Download raw data (JSON)" link provides machine-readable format
**And** the export includes all fields, timestamps, and confidence levels

**Given** a parent wants to add context about their child
**When** they use the "Tell the mentor" input on the memory screen
**Then** the text is analyzed and merged as high-confidence signals tagged with `source: 'parent'`
**And** items show an "Added by parent" badge

**Given** a parent wants to delete all memory data
**When** they tap "Delete all memory data" and confirm
**Then** the `learning_profiles` row is deleted entirely
**And** a new empty row will be created on the next session analysis (if collection is enabled and consent was granted)

**Given** a parent re-enables collection after disabling it
**When** the collection toggle is turned back on
**Then** preserved profile data becomes immediately active
**And** the next session analysis resumes updating the profile

**FRs:** FR250, FR252

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Toggle fails | Network error | Toast: "Couldn't update — try again" | Toggle reverts to previous state |
| Export fails | Large profile or timeout | Toast: "Export failed" | Retry. Fallback: data included in account-level export. |
| Delete fails | DB error | Toast: "Couldn't delete — try again" | Retry button |
| No linked children | Parent with no family links | Empty state | "Link a child to see their learning profile" + navigation to family settings |
| Consent prompt dismissed permanently | Parent tapped "Not now" + "Don't ask again" | No memory features | Discoverable via settings: "Enable mentor memory" in child's profile settings |
| Parent input parse fails | LLM can't extract signals from parent text | Toast: "I didn't understand — try something like 'She loves art'" | Input remains, parent retries |

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

### Story 16.10: "Tell Your Mentor" — Learner-Initiated Input

As a learner (or parent),
I want to directly tell the mentor about my preferences, interests, or needs,
So that the mentor doesn't have to guess from conversations alone — I feel like a collaborator, not a subject.

**Acceptance Criteria:**

**Given** a learner views the "What My Mentor Knows" screen
**When** they see the "Tell your mentor" input at the top
**Then** they can type freeform text like "I love Pokémon" or "I hate slow explanations"

**Given** a learner under 10 (based on `birthYear`)
**When** they see the "Tell your mentor" input
**Then** the prompt says "Tell your mentor something about you!" with tappable suggestions: "I like dinosaurs", "I like stories", "Please be funny"

**Given** a learner submits text via "Tell your mentor"
**When** the text is sent to the analysis LLM
**Then** structured signals are extracted and merged into the profile as high-confidence items
**And** extracted items are tagged with `source: 'learner'`
**And** items display a "You told your mentor" badge on the profile screen

**Given** a parent views a child's memory screen
**When** they use the "Tell the mentor" input
**Then** extracted signals are tagged with `source: 'parent'` and display "Added by parent" badge

**Given** a learner-contributed signal conflicts with an inferred signal
**When** both exist in the profile
**Then** the learner-contributed signal takes precedence in the memory block (FR245.2)

**Given** the interest array is at the 20-entry cap
**When** the learner tries to add a new interest via "Tell your mentor"
**Then** an inline message says: "Your mentor already knows 20 interests — remove one to add a new one."
**And** the input is not blocked — other signal types (communication notes, etc.) can still be extracted

**FRs:** FR252

**Failure Modes:**

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| LLM parse fails | Ambiguous or unrelated input | Toast: "I didn't understand that — try something like 'I love dinosaurs'" | Input remains, learner retries |
| Cap reached | 20 interests, 10 communication notes | Inline message explaining the cap | Remove existing items first, then retry |
| Duplicate input | "I love space" when space already in profile | No visible change, timestamp updated | Not an error — signal is reinforced |
| Offensive input | Profanity or inappropriate content | Input rejected | Same content moderation as session messages |
| LLM timeout | Provider latency spike | Toast: "Couldn't save — try again" | Retry button |

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

### Phase D — Collaborative Memory (Story 16.10 + UX refinements)

```
16.10 ("Tell Your Mentor" — learner-initiated input)         ─── depends on 16.7, 16.8
UX refinements: consent-first, granular toggles,             ─── depends on 16.8
  strengths-first layout, undo suppression,
  earlier notifications, celebration, check-in questions
```

Phase D makes memory feel collaborative rather than surveillance-like. Story 16.10 adds direct learner/parent input. The UX refinements from the 2026-04-09 review (consent-first, granular toggles, undo suppression, strengths-first layout, earlier struggle notifications, struggle resolution celebration, mentor check-in questions, human-readable export, per-subject interest hints) are folded into the existing stories they extend but grouped here for execution sequencing. Phase D depends on Phase C (the screens must exist before they can be enhanced).

### Summary

```
Phase A: 16.1 → (16.2 || 16.3)           ── core infrastructure, must complete first
Phase B: (16.4 || 16.5 || 16.6)          ── depends on Phase A, internal parallelism
Phase C: (16.7 → 16.8) || 16.9           ── depends on Phase A, parallel with Phase B
Phase D: 16.10 + UX refinements           ── depends on Phase C, collaborative memory
```

---

## Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 13** (Session Lifecycle) | The `session.completed` event (Epic 13) triggers the memory analysis Inngest function (Story 16.2). The session close flow must emit this event reliably. No changes needed to Epic 13 — the event already exists. |
| **Epic 14** (Human Agency) | "I don't remember" feedback during recall tests (Story 14.2) feeds into struggle detection (Story 16.5). Per-message feedback (Story 14.5) — thumbs up/down on AI responses — corroborates explanation effectiveness tracking (Story 16.6). |
| **Epic 15** (Visible Progress) | Struggle and strength data in the learning profile can cross-reference progress statistics. A child who progresses quickly in a subject confirms a "strength" inference. A child who stalls confirms a "struggle" inference. **FR247.4.1 (Amendment 2):** `buildMemoryBlock` cross-references struggles against Epic 15's retention data — topics with strong retention (`intervalDays >= 21`) are excluded from the struggle section of the memory block to prevent contradictory signals. Epic 15's FR numbers are FR230–FR241; this epic uses FR243–FR252 (renumbered to avoid collision). Inngest chain ordering ensures memory analysis runs at position 4, before Epic 15's snapshot refresh at position 5. |
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
| **Cross-subject style transfer is wrong** — math and history may require different explanation styles | Medium | Subject-specific tracking in `struggles` and `strengths` (FR248.5). Cross-subject transfer is limited to general preferences (pace, humor, explanation length). Subject-specific patterns override general patterns when enough data exists. Interest relevance hint (FR246.6) prevents forced cross-subject examples. |
| **Memory feels like surveillance** — the system silently profiles children without their input | Medium | "Tell your mentor" input (FR252) makes memory collaborative. Mentor check-in questions (FR248.6) make adaptation conversational. Strengths-first layout (FR249.8) keeps the profile feeling positive. Consent-first activation (FR250.7) ensures parents opt in explicitly. |
| **Accidental suppression is permanent** — child taps "This is wrong" by mistake, inference is gone forever | Medium | Undo suppression (FR249.7): "Hidden items" section shows suppressed items with "Bring back" action. Suppression is recoverable, not permanent. |
| **Struggle list feels like a judgment** — children with anxiety see a list of things they're bad at | Medium | Strengths-first layout (FR249.8): struggles are in a collapsible section titled "Things you're improving at" (collapsed by default). Progress indicators show improvement. Struggle resolution celebration (FR247.7) turns resolved struggles into achievements. |
| **Parent learns about struggles too late** — 5 sessions of struggling before any notification | Medium | Two-tier notification (FR247.6): early signal at `medium` confidence (3 sessions), escalated signal at `high` (5 sessions). Parents are informed earlier without false-positive overload. |
| **Default opt-in for children's behavioral profiling** — potential GDPR Article 8 non-compliance | High | Consent-first activation (FR250.7): memory collection requires explicit parental consent before first activation. One-time prompt on child dashboard. Consent state tracked in profile. |

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
| "Tell your mentor" input + LLM parsing | Freeform learner/parent input → structured profile signals | 16.10 |
| Consent-first prompt | One-time parental consent before memory activation | 16.8 (FR250.7) |
| Granular memory toggles | Separate collection vs. injection controls | 16.8 (FR250.8) |
| Undo suppression UI | "Hidden items" section with "Bring back" action | 16.7 (FR249.7) |
| Strengths-first layout | Collapsible struggles, strengths prominent | 16.7 (FR249.8) |
| Two-tier struggle notification | Early signal at medium, escalated at high | 16.5 (FR247.6) |
| Struggle resolution celebration | Coaching cards for child + parent on mastery | 16.5 (FR247.7) |
| Mentor check-in prompt | Conditional "Did that help?" in system prompt | 16.6 (FR248.6) |
| Human-readable export | Formatted summary + JSON download | 16.8 (FR250.3) |
| Interest relevance hint | Soft LLM instruction to not force interests | 16.4 (FR246.6) |
