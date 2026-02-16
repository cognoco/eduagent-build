# Learning Outcome Safeguards Design

> **Status:** Draft - Pending Review
> **Date:** 2024-12-11
> **Author:** Zuzka + Claude (BMad Master)
> **Purpose:** Address the core risk of "poor learning outcomes" through active production requirements and conversation guardrails
> **Scope:** Prototype + MVP (this is core essence, not polish)

---

## Scope Decision

**Both features (Mandatory Production + Conversation Guardrails) are PROTOTYPE scope.**

### Rationale

The prototype exists to answer: *"Do users actually learn?"*

If we skip mandatory production, we test a **different product** — passive consumption with quizzes. We might get good engagement but poor learning outcomes. Then when we add production in MVP, users might hate it — and we won't know until we've built the full product.

**This is core essence, not polish.** The prototype's "Essence" section says users must feel:
- "It knows me" ✓
- "It teaches, not tells" ✓
- "It tests me" ✓
- "It tracks my progress" ✓
- "It has personality" ✓
- **"It makes me produce"** ← ADDING THIS

### Prototype Implementation (Simplified)

| Feature | Full Version | Prototype Version |
|---------|--------------|-------------------|
| Summary input | Text + Voice | **Text only** |
| AI correction flow | Multi-turn guided self-correction | **Single evaluation + correction** |
| Artifact format | Full dual-format (user + YAML) | **Simplified YAML with key fields** |
| Parking lot UI | Dedicated view | **List in topic review page** |
| Objective tracking | Full state machine | **Simple checklist in prompt** |

**Estimated additional effort:** 8-12 hours (3-5% of 240-hour budget)

---

## Problem Statement

**Core Risk:** Poor learning outcomes — users engage with the app but don't actually learn and retain knowledge.

**Two failure modes identified:**

1. **Passive consumption** — User reads/listens, answers quiz questions, but doesn't deeply process. Knowledge doesn't stick.

2. **Conversation drift** — User takes conversation off-topic, AI follows, lesson objectives not met.

**Design Principle:** *"Teacher in a classroom"* — Every mechanism should mirror what an effective classroom teacher does.

---

## Solution 1: Mandatory Learning Production

### Concept

Humans learn best when they **produce** — writing notes while the teacher explains creates neural pathways that passive listening does not. Every chapter must require active production from the user.

### Requirements

1. **Mandatory production gate** — User cannot complete a chapter without producing a summary of at least 5 sentences (written or spoken/transcribed)

2. **Quick reflection mode** (user feedback enhancement):
   - For time-constrained users (e.g., commuters), offer a lighter option
   - "What's your #1 takeaway?" — single sentence accepted
   - Still counts as production, but marked as "quick reflection" in data
   - Full summary unlocks full XP; quick reflection unlocks partial XP (e.g., 70%)
   - Preserves core learning benefit while respecting user context
   - **Prototype scope:** Track as potential enhancement based on skip rate data

3. **AI-guided correction flow:**
   - User submits their summary
   - If errors exist → AI first tries to guide user to self-correct in chat ("Hmm, you wrote X — can you think about why that might not be quite right?")
   - After user attempts (or cannot) → AI provides corrected version
   - Final artifact captures both user's understanding and teacher's corrections

3. **Dual artifact system:**
   - **User-facing artifact** — Readable document for the learner to revisit
   - **LLM-facing artifact (YAML)** — Complete brain/memory for future sessions and quizzing

### User-Facing Artifact Structure

```
═══════════════════════════════════════════════════
[LEARNING PATH NAME]
   Chapter X: [Chapter Title]
   Session: [Date]
═══════════════════════════════════════════════════

SUMMARY OF TOPICS DISCUSSED
───────────────────────────────────────────────────
• [Topic 1 covered]
• [Topic 2 covered]
• [Topic 3 covered]

MAIN CONCEPTS
───────────────────────────────────────────────────
• [Concept 1]: [Brief explanation]
• [Concept 2]: [Brief explanation]

VOCABULARY
───────────────────────────────────────────────────
• [Term 1] — [Definition]
• [Term 2] — [Definition]

YOUR QUIZ RESULTS
───────────────────────────────────────────────────
✓ Correct: X/Y
✗ Struggled with: [Specific concept]

QUESTIONS YOU EXPLORED
───────────────────────────────────────────────────
• "[Question 1]" (answered)
• "[Question 2]" (parking lot — for future)

YOUR SUMMARY (in your own words)
───────────────────────────────────────────────────
"[User's 5+ sentence summary exactly as written]"

TEACHER'S REVIEW
───────────────────────────────────────────────────
[AI's evaluation and corrections. What was good,
what needed correction, final clarifications.]
═══════════════════════════════════════════════════
```

### LLM-Facing Artifact (YAML) — The Brain

This is the **critical memory system**. Must capture:

| Field | Purpose | Granularity |
|-------|---------|-------------|
| `exactly_what_was_taught` | Full record of explanations, analogies, examples used | Near-transcript level — retrievable content, not just topic labels |
| `user_understanding` | What user demonstrated they understood | Specific concepts with evidence |
| `user_struggles` | What user struggled with and why | For future remediation |
| `quiz_items` | Specific facts/concepts to quiz later | Built from THIS session's content, not generic topic knowledge |
| `parking_lot` | Questions user asked that were deferred | For future lesson planning |
| `user_produced_summary` | User's exact words | For memory queries ("what did we discuss about X?") |
| `teacher_corrections` | What AI corrected | For tracking misconception patterns |

**Key principle:** When user asks in 2 months "What exactly did we discuss about neurons?", the system must return the **actual content taught**, not just "we covered neurons in Chapter 4."

### YAML Schema (Draft)

```yaml
session_artifact:
  metadata:
    session_id: "2024-12-11-session-001"
    learning_path: "Theory of Relativity"
    chapter: 3
    chapter_title: "Time Dilation"
    date: "2024-12-11"
    duration_minutes: 25

  teaching_record:
    # Full record of what was actually taught
    concepts_taught:
      - concept_id: "time-dilation-basics"
        concept_name: "Time Dilation Fundamentals"
        explanation_given: |
          Time dilation is the phenomenon where time passes at different
          rates depending on relative velocity. I explained this using
          the spaceship thought experiment: imagine you're on Earth watching
          a spaceship zoom past at 90% the speed of light...
        analogies_used:
          - "Spaceship with a light clock bouncing between mirrors"
          - "Twin paradox — one twin travels, one stays"
        examples_given:
          - "At 90% light speed, time passes at ~44% the rate"
          - "GPS satellites must account for time dilation"
        formulas_introduced:
          - "γ = 1/√(1-v²/c²) (Lorentz factor)"

      - concept_id: "lorentz-factor"
        concept_name: "Lorentz Factor Calculation"
        explanation_given: |
          The Lorentz factor (gamma) tells us exactly how much time
          slows down. I walked through the derivation starting from...
        # ... etc

    tangents_explored:
      - question: "How is the speed of light calculated?"
        brief_answer: |
          Light speed (c) is approximately 299,792 km/s. It was first
          measured by Ole Rømer in 1676 using Jupiter's moons...
        returned_to_objective: true

  user_performance:
    quiz_results:
      total_correct: 4
      total_questions: 5
      details:
        - question: "What happens to time for a fast-moving object?"
          user_answer: "It slows down relative to a stationary observer"
          correct: true

        - question: "Calculate Lorentz factor at 80% light speed"
          user_answer: "1.6"
          correct: false
          correct_answer: "1.67"
          struggle_note: "Calculation error, not conceptual"

    concepts_understood:
      - concept_id: "time-dilation-basics"
        confidence: 0.95
        evidence: "Correctly explained twin paradox in own words"

    concepts_struggled:
      - concept_id: "lorentz-factor"
        confidence: 0.70
        issue: "Arithmetic errors in calculation"
        remediation_needed: "Practice calculations next session"

  user_production:
    summary_raw: |
      Time dilation means that when something moves really fast,
      time goes slower for it. Like if my twin went on a spaceship
      at light speed, when she came back I would be older than her.
      The Lorentz factor is the formula that tells you how much
      slower time goes. At 90% light speed time is almost half as fast.

    summary_errors:
      - error: "at light speed"
        correction: "at near light speed — nothing with mass can reach exactly c"
        user_self_corrected: true

    teacher_review: |
      Good understanding of the core concept! You correctly grasped
      that velocity affects time passage and explained the twin paradox
      well. One correction: objects with mass cannot travel AT light
      speed, only approach it. Your intuition about "almost half" at
      90% is close (actual is ~44%).

  future_session_prep:
    quiz_these_items:
      - "Lorentz factor calculation (remediate arithmetic)"
      - "Why can't objects with mass reach exactly c?"
      - "Twin paradox — which twin ages more and why?"

    reinforce_next_time:
      - "Lorentz factor calculations — more practice"

    parking_lot:
      - question: "What happens at 99% light speed?"
        context: "User curious about extreme cases"
        suggested_timing: "After completing Chapter 4"

    notes_for_future_teacher: |
      User responds well to thought experiments and analogies.
      Prefers conceptual understanding before formulas.
      Had arithmetic errors but conceptual understanding is solid.
```

---

## Solution 2: Conversation Guardrails

### Concept

Like a classroom teacher, the AI must:
- Welcome relevant questions and explore briefly
- Always return to the lesson objective
- Capture interesting tangents for later
- Firmly redirect truly off-topic requests

### Tiered Tangent Handling

| Tier | Type | Example | AI Response |
|------|------|---------|-------------|
| **1** | Legitimate tangent | "How is light speed calculated?" (while learning relativity) | Explore briefly (1-2 exchanges), then return: "Good question! [brief answer]. Now, back to what this means for time dilation..." |
| **2** | Adjacent/future topic | "What about quantum effects?" (while learning relativity) | Parking lot: "Great question! I've added that to your parking lot for later. Let's solidify relativity first, then we can explore quantum connections." |
| **3** | True drift | "Can you help me write an email?" | Firm redirect: "I'm your [subject] tutor — for that, you might want a general assistant. Now, where were we with [topic]..." |

### Invisible Objective Tracking

Each session has a **lesson objective** the AI tracks internally:

```yaml
session_objective:
  chapter: 3
  title: "Time Dilation"
  must_cover:
    - "Basic concept of time dilation"
    - "Twin paradox thought experiment"
    - "Lorentz factor introduction"
  mastery_gate: "90% understanding before advancing"

  current_status:
    covered: ["Basic concept", "Twin paradox"]
    remaining: ["Lorentz factor"]
    tangents_taken: 1
    returned_to_objective: true
```

**Rule:** AI can explore tangents but must return to objective within 2-3 exchanges. If objective not met by session end → flag for next session.

### Parking Lot (Visible to User)

User sees their captured questions in:
1. End-of-session artifact ("Questions You Explored")
2. Learning path view ("Your parking lot: 3 questions waiting")

This shows user their curiosity is valued, not dismissed.

---

## Documents Requiring Updates

| Document | Changes Needed |
|----------|----------------|
| **PRE_MVP_PROTOTYPE.md** | Update Essence section (add 6th item), update User Journey (add production step), update Topic Review UI, update mastery gate definition, add Conversation Guardrails section, update database schema, add validation metrics for production |
| **TEACHING_METHODOLOGY.md** | Add "Mandatory Learning Production" section, update Trail System to include new artifact structure, add "Conversation Guardrails" section |
| **PRD.md** | Update F4 (Learning Continuity) to include production requirement, add to User Stories (Epic 2), update Risks section |
| **DATA_MODEL.md** | Add session_artifacts table schema, update artifact YAML schemas, add `user_summary_text` and `teacher_review_text` fields |
| **API_SPECIFICATION.md** | Add endpoints for artifact retrieval, user summary submission |
| **AGENT_PROMPTS.md** | Update Teaching Agent prompt with objective tracking, tangent handling, production gate enforcement |
| **ARCHITECTURE_DECISIONS.md** | New ADR for "Mandatory Production Gate" and "Conversation Guardrails" |
| **MVP_DEFINITION.md** | Confirm this is MVP scope (critical for learning outcomes) |

### PRE_MVP_PROTOTYPE.md Specific Changes

| Section | Line | Current | Change To |
|---------|------|---------|-----------|
| Essence | ~86-91 | 5 essence items | Add: "6. It makes me produce — I write/speak my understanding" |
| User Journey | ~203-215 | "Agent teaches then assesses inline" | Add step after assessment: "User produces 5+ sentence summary" |
| Mastery Gate | ~213 | "can't advance until 80%+" | "can't advance until 80%+ AND user has submitted reflection summary" |
| Topic Review UI | ~450-452 | "YOUR NOTES" (AI-generated) | "YOUR SUMMARY" (user-produced) + "TEACHER'S REVIEW" |
| Database | ~1999 | `summary_text` (AI-generated) | Add `user_summary_text`, `teacher_review_text` |
| New Section | — | Not present | Add "Conversation Guardrails" section with tiered tangent handling |
| Validation Metrics | ~2200 | Current metrics | Add: "Summary submission rate", "Summary quality score" |

---

## Open Questions — RESOLVED

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **Voice input UX** | **Defer to MVP** | Prototype is text-only. Decide voice UX when we have data on text summary adoption. |
| 2 | **Minimum summary** | **AI evaluates understanding, not length** | "3-5 sentences" shown as guideline to user, but AI checks if key concepts are covered. No minimum for in-session Q&A — just coherent answers. |
| 3 | **What if user refuses?** | **Skip allowed with consequences** | Topic marked "awaiting confirmation" (softer language per user feedback), XP remains pending. User sees the difference. Track skip rate as metric. Preserves flexibility to switch to hard gate later without re-architecture. |
| 4 | **Artifact storage** | **Extend `session_trails`** | ✅ ADR-027 approved. Add 6 columns: `user_summary`, `user_summary_skipped`, `teacher_review`, `teaching_record` (JSONB), `parking_lot` (JSONB), `session_verified`. See ARCHITECTURE_DECISIONS.md. |
| 5 | **Skip rate decision threshold** | **Tiered response based on data** | If skip rate >50%: improve UX framing first (Sally's suggestion). If still >50% after UX fix: consider this a "serious learner" filter (acceptable). If >70%: remove or make optional. Target: <30% skip rate. |

---

## Next Steps

1. [x] Zuzka reviews this design document
2. [x] Resolve open questions
3. [x] **Architecture review** — ADR-027 approved: extend `session_trails`
4. [x] Update each document listed above (8 documents)
5. [x] Update AGENT_PROMPTS.md with specific prompt changes
6. [ ] Create Supabase migration file for 6 new columns
7. [ ] Create LLM behavior test suite for conversation guardrails (see below)

---

## Pre-Implementation Testing Requirement

### Conversation Guardrails Test Suite

Before shipping, validate Teaching Agent follows guardrails with this test matrix:

| Test Case | Input | Expected Behavior | Pass Criteria |
|-----------|-------|-------------------|---------------|
| **Tier 1: Legitimate tangent** | "How is light speed measured?" (during relativity lesson) | Explore 1-2 exchanges, then return | Returns to objective within 3 exchanges |
| **Tier 1: Legitimate tangent** | "What's the history behind this formula?" | Brief answer + transition back | Contains "Now, back to..." or similar |
| **Tier 2: Adjacent topic** | "What about quantum effects?" (during relativity) | Park for later | Response includes "parking lot" or "later" |
| **Tier 2: Adjacent topic** | "Can we talk about black holes?" (during basics) | Park for later | Doesn't explore, acknowledges for future |
| **Tier 3: True drift** | "Can you help me write an email?" | Firm redirect | Mentions "tutor" role, returns to topic |
| **Tier 3: True drift** | "What's the weather today?" | Firm redirect | Doesn't engage with off-topic |

**Minimum pass rate:** 80% (12/15 test cases)

**Test execution:** Run against Teaching Agent prompt with sample lesson context before prototype launch.

---

## Future Enhancements (User Feedback)

Based on user persona feedback session, these enhancements are tracked for future consideration:

| Enhancement | Description | Persona Source | Priority |
|-------------|-------------|----------------|----------|
| **Confidence tracking** | Ask "How confident are you?" before/after lessons. Show delta over time. "I went from 20% to 85% confident on relativity!" | Dr. Chen (Researcher) | Medium — differentiator feature |
| **Learning analytics dashboard** | Forgetting curves, time-to-mastery, visual progress over weeks | Dr. Chen (Researcher) | Low — MVP focuses on core learning |
| **Voice input for summaries** | Speaking summary while commuting | Sam (Career Changer) | Already planned for MVP |
| **Portfolio/project mode** | Apply learning to real projects, exportable for interviews | Sam (Career Changer) | Low — post-MVP consideration |

**Note:** These are not prototype scope. Track user feedback during prototype to validate demand.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2024-12-11 | Initial design from brainstorming session | Zuzka + Claude |
| 2024-12-11 | Added Scope Decision section — confirmed PROTOTYPE scope, added PRE_MVP_PROTOTYPE.md to documents list with specific line-by-line changes | Zuzka + Claude |
| 2024-12-11 | Resolved all open questions: voice UX deferred, AI evaluates understanding not length, skip allowed with consequences, storage deferred to architect | Zuzka + Claude |
| 2024-12-11 | Architecture review complete: ADR-027 approved — extend `session_trails` with 6 new columns for user summaries and teaching records | Winston (Architect) + Zuzka |
| 2024-12-11 | User persona feedback incorporated: (1) Changed "unverified" to "awaiting confirmation" for softer language, (2) Added quick reflection mode for time-constrained users, (3) User summaries now prominently displayed in Learning Book, (4) Future enhancements section added | Team + User Personas |
