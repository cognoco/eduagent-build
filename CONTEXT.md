# EduAgent / MentoMate

The domain language of the MentoMate AI-tutoring app — the nouns the code, schemas,
and docs use to talk about learners, curriculum, sessions, and the AI mentor. This
file is the opinionated source of truth for what each term **is** and which competing
words to avoid. `@eduagent/schemas` is the hard contract; where this file and a schema
disagree, the schema wins and this file should be corrected.

> **Status: mined draft (2026-05-29).** Bootstrapped by reading `packages/schemas`,
> `docs/project_context.md`, `docs/architecture.md`, and `CLAUDE.md`. Sharpen it through
> the `/improve-codebase-architecture` grilling loop rather than rewriting it cold.

## Language

### People & roles

**Profile**:
A named learning identity within a Clerk account; the atomic unit of ownership for all
learning data. A Clerk account contains one or more Profiles.
_Avoid_: user (an account holds many Profiles), account.
→ `packages/schemas/src/profiles.ts:178`

**Owner**:
A Profile with `isOwner === true` — the account holder who can subscribe, manage billing,
add child Profiles, and reach guardian-facing surfaces. `isOwner` is the canonical check.
_Avoid_: parent (copy-only), guardian (a retired V0 tab-shape label), account owner.
→ `packages/schemas/src/profiles.ts:155`

**Child Profile**:
A Profile with `isOwner === false` — a family-linked learner whose data the Owner can see.
_Avoid_: learner (every Profile is a learner), student.
→ `packages/schemas/src/billing.ts:13` (`profileQuotaRole: 'child'`)

**Parent Proxy**:
The runtime state where an Owner is actively viewing the app *as* one of their Child
Profiles via the proxy banner (`isParentProxy`).
_Avoid_: impersonated child (that names the role on the child, not the Owner's state).
→ `apps/mobile/src/lib/navigation-contract.ts:75`

**Age Bracket**:
A computed classification from `birthYear` used for consent, voice, and age-appropriate
copy — never for feature gating.
_Avoid_: persona, age group, age tier.
→ `computeAgeBracket()`, `packages/schemas/src/age.ts:42`

### Curriculum structure

**Subject**:
A top-level learning domain a Profile pursues (e.g. "French", "Algebra"); owns exactly
one Curriculum.
_Avoid_: course, class.
→ `packages/schemas/src/subjects.ts:58`

**Curriculum**:
The ordered, versioned collection of Books generated for a Subject.
_Avoid_: syllabus, course plan.
→ `packages/schemas/src/subjects.ts:141`

**Book**:
A named, chapter-grouping unit within a Curriculum, with its own progress status.
_Avoid_: module, unit, chapter (a chapter is a sub-grouping inside a Book).
→ `packages/schemas/src/subjects.ts:158`

**Topic**:
The atomic unit of study within a Book; what a learner works on in one or more Sessions.
_Avoid_: lesson, unit, concept.
→ `packages/schemas/src/subjects.ts:121`

**Pedagogy Mode**:
The tutoring approach applied to a Subject: `socratic` (question-driven, general subjects)
or `four_strands` (vocabulary/grammar/fluency/pronunciation, language subjects).
_Avoid_: teaching mode, learning mode (overloaded — see "mode" ambiguity below).
→ `packages/schemas/src/language.ts:4`

### Sessions & exchanges

**Learning Session**:
A bounded tutoring conversation between a learner and the AI mentor, scoped to a Subject
and optionally a Topic; lifecycle `active → paused → completed → auto_closed`.
_Avoid_: chat, conversation.
→ `packages/schemas/src/sessions.ts:333`

**Session Type**:
What a Session does: `learning`, `homework`, or `interleaved` (cross-Subject spaced practice).
Distinct from Session Effective Mode.
→ `packages/schemas/src/sessions.ts:87`

**Session Effective Mode**:
A Session's behavioural shape at runtime: `learning` (curriculum-guided) or `freeform`
(open-ended ask). Stored in `sessionMetadata.effectiveMode`.
_Avoid_: session type (that is the separate `sessionType` enum).
→ `packages/schemas/src/sessions.ts:269`

**Exchange**:
A single learner↔AI message *pair* within a Session; the unit counted toward the per-session
cap (`MAX_EXCHANGES_PER_SESSION = 50`).
_Avoid_: message, turn (a turn is one side; an Exchange is both).
→ `packages/schemas/src/sessions.ts:18`

**Escalation Rung**:
An integer 1–5 for the AI's current teaching intensity within a Session; low rungs use
Socratic questioning on a Flash-tier LLM, rung 5 is full teaching mode on a top-tier LLM.
_Avoid_: difficulty level, help level.
→ `packages/schemas/src/sessions.ts:308`; semantics `apps/api/src/services/escalation.ts:116`

**Continuation Opener**:
The session-start mechanism that probes a learner's recall of the previous Session before
teaching new content; runs `probe` then `score`.
→ `packages/schemas/src/sessions.ts:211`

**Parking Lot**:
A per-Session queue of questions the learner wants to revisit later without breaking flow.
→ `packages/schemas/src/sessions.ts:542`

**Session Summary**:
The learner-**written** reflection submitted at the end of a Session, LLM-evaluated before
XP is awarded.
_Avoid_: recap (that is AI- or guardian-facing — see ambiguities).
→ `packages/schemas/src/sessions.ts:497`

**Learner Recap**:
The AI-**generated** takeaway card shown to the learner at session close (`closingLine`,
`takeaways`, `nextTopicReason`).
_Avoid_: summary (the learner-written piece is the Session Summary).
→ `packages/schemas/src/sessions.ts:526`

**Recap**:
A guardian-facing card in the Recaps tab describing one of a child's completed Sessions.
_Avoid_: session summary, report.
→ `packages/schemas/src/recaps.ts:11`

### Assessment & mastery

**Assessment**:
A formal knowledge-check on a Topic, separate from in-session Exchanges, with its own
lifecycle, Mastery Score, and quality rating.
→ `packages/schemas/src/assessments.ts:27`

**Mastery Score**:
A 0–1 float for how well a learner demonstrated understanding in an Assessment or Challenge
Round; gates retention-card updates and XP.
_Avoid_: score, quality rating (a separate 0–5 integer).
→ `packages/schemas/src/assessments.ts:32`

**Retention Card**:
The SM-2 spaced-repetition record per Topic (`easeFactor`, `intervalDays`, `nextReviewAt`,
`xpStatus`); drives the review schedule.
_Avoid_: flashcard, review card.
→ `packages/schemas/src/assessments.ts:174`

**Retention Status**:
A Topic's SM-2-derived health: `strong | fading | weak | forgotten` (`unknown` before any card).
→ `packages/schemas/src/retention-status.ts:3`

**Struggle Status**:
Whether a learner is stuck on a Topic: `normal | needs_deepening | blocked`.
→ `packages/schemas/src/struggle-status.ts:3`

**Needs-Deepening Record**:
The `needs_deepening_topics` row created when a Topic needs more explanation; cycles
`active → pending_review → resolved`.
_Avoid_: weak spot, "needs-deepening topic" (reserve "Topic" for the curriculum entity).
→ `packages/schemas/src/assessments.ts:252`

**XP**:
The learner-facing point currency for completing Sessions and Assessments; states
`pending | verified | decayed`.
→ `packages/schemas/src/progress.ts:89`

### Challenge Round

**Challenge Round**:
An opt-in mid-Session retrieval challenge (up to 10 questions) over Topics covered; mastery
is awarded only when every concept evaluates `solid`. Server-owned and conservative over
structured LLM evidence.
→ `packages/schemas/src/sessions.ts:160`; `docs/project_context.md:214`

**Challenge Round Evaluation Item**:
A per-concept score the LLM emits at round end (`solid | partial | missing | misconception`);
only `solid` items feed the note drafter, and each must carry `answerEventId` + `learnerQuote`.
→ `packages/schemas/src/llm-envelope.ts:210`

### LLM pipeline

**LLM Response Envelope**:
The single structured JSON shape every state-machine LLM call must return: `reply`,
`signals`, `ui_hints`, `private_sources`, `confidence`.
_Avoid_: `[MARKER]` tokens (the legacy anti-pattern it replaced), raw LLM output.
→ `packages/schemas/src/llm-envelope.ts:428`

**Signals**:
The binary/enum fields inside an Envelope that drive server-side flow decisions
(`ready_to_finish`, `challenge_round_offer`, …); never rendered to the learner.
→ `packages/schemas/src/llm-envelope.ts:222`

**UI Hints**:
Presentation-only Envelope fields the mobile client *may* render (`note_prompt`,
`fluency_drill`, `challenge_round`, `note_draft`); never drive control flow.
→ `packages/schemas/src/llm-envelope.ts:365`

**Filing**:
The async Inngest pipeline that classifies a completed freeform/homework Session into the
learner's curriculum; status `filing_pending → filing_failed | filing_recovered | filing_kept_out`.
_Avoid_: categorisation, auto-tag.
→ `packages/schemas/src/sessions.ts:262`

**Depth Evaluation**:
The gate deciding whether an Exchange is "meaningful" (`substantial | partial | introduced`);
gates the Filing pipeline and Coaching Card generation.
→ `packages/schemas/src/depth-evaluation.ts:17`

### Mentor memory

**Learning Profile**:
The AI mentor's accumulated knowledge about a learner (style, interests, strengths, struggles,
accommodation, memory consent). Distinct from the identity **Profile**.
_Avoid_: profile (that is the identity record), memory (a sub-feature within it).
→ `packages/schemas/src/learning-profiles.ts:103`

**Mentor Memory**:
The per-learner persistent context the mentor uses to personalise Sessions; gated by
`memoryEnabled` and `memoryConsentStatus`.
→ `packages/schemas/src/learning-profiles.ts:103`

**Tell Mentor**:
The text input letting a guardian (or learner) add context to the mentor's memory about a child.
→ `packages/schemas/src/learning-profiles.ts:284`

**Accommodation Mode**:
A per-learner adaptive setting for neurodivergent/accessibility needs:
`none | short-burst | audio-first | predictable`.
→ `packages/schemas/src/learning-profiles.ts:65`

### Languages

**Conversation Language**:
The language the AI mentor *speaks* with a learner (ISO 639-1, on Profile, default `en`).
Distinct from the language being studied.
_Avoid_: tutor language, UI language, locale.
→ `packages/schemas/src/profiles.ts:10`

**Native Language**:
The learner's mother tongue (on Learning Profile); used by language Subjects for L1 context.
→ `packages/schemas/src/language.ts:26`

**CEFR Level**:
The `A1…C2` proficiency level on language Topics and Vocabulary; paces content.
→ `packages/schemas/src/language.ts:10`

### Progress & guardian reporting

**Engagement Signal**:
A guardian-facing per-Session classification: `curious | stuck | breezing | focused | scattered`.
_Avoid_: mood, performance signal.
→ `packages/schemas/src/sessions.ts:74`

**Coaching Card**:
An AI-contextualised home-screen card surfacing a personalised next action.
_Avoid_: home card (that is the fixed-shortcut card — see below).
→ `packages/schemas/src/progress.ts:401`

**Home Card**:
A server-computed fixed-shortcut card for common actions (`resume_session | review | study |
homework | ask | family | link_child`). Not AI-contextualised.
→ `packages/schemas/src/progress.ts:538`

**Knowledge Inventory**:
A guardian-facing snapshot of a child's cumulative learning state.
→ `packages/schemas/src/snapshots.ts:81`

**Celebration**:
A queued in-app trophy event shown when a Milestone is reached; celestial-themed, level-gated.
→ `packages/schemas/src/progress.ts:17`

### Billing

**Subscription Tier**:
The billing plan: `free | plus | family | pro`; sets quota, family-link capacity, and LLM tier.
→ `packages/schemas/src/billing.ts:4`

**Family Plan**:
A `family | pro` subscription where one Owner shares a Quota across linked Child Profiles.
→ `packages/schemas/src/billing.ts:160`

**Quota**:
The monthly/daily Exchange limits gating LLM calls; enforced `per-profile` or `shared-pool`.
→ `packages/schemas/src/billing.ts:10`

**Premium LLM**:
A Profile flag (`hasPremiumLlm`) granting higher-tier models from Escalation Rung 4 onward.
→ `packages/schemas/src/profiles.ts:156`

### Navigation & app context

**App Context**:
The Owner's active viewing mode: `study` (personal learning) or `family` (child overview);
persisted as `defaultAppContext`, runtime React state `AppMode`.
_Avoid_: bare "mode" (overloaded — see ambiguities).
→ `packages/schemas/src/profiles.ts:31`; `apps/mobile/src/lib/app-context.tsx:18`

**Tab Shape**:
The abstract label for which tab-bar layout a Profile receives. V0 (legacy, production):
`guardian | learner`. V1 (nav contract): `study | family` (Navigation Shape).
→ V0 `apps/mobile/src/lib/legacy-navigation-contract.ts:38`; V1 `navigation-contract.ts:12`

### Consent

**Consent Status**:
GDPR/COPPA lifecycle for a Child Profile:
`PENDING → PARENTAL_CONSENT_REQUESTED → CONSENTED | WITHDRAWN`.
→ `packages/schemas/src/consent.ts:7`

**Memory Consent Status**:
A *separate* three-state consent for Mentor Memory: `pending | granted | declined`.
_Avoid_: conflating with the GDPR Consent Status.
→ `packages/schemas/src/learning-profiles.ts:58`

## Relationships

- A **Clerk account** contains 1..N **Profiles**; each is an **Owner** or a **Child Profile**.
- A **Profile** owns 0..N **Subjects**; each **Subject** has exactly one **Curriculum**.
- A **Curriculum** contains 1..N **Books**; a **Book** contains 1..N **Topics**.
- A **Topic** has at most one active **Assessment** and one **Retention Card** per Profile.
- A **Learning Session** belongs to one Profile and one Subject, optionally scoped to one Topic.
- A **Session** contains 0..N **Exchanges** (hard-capped at 50).
- A **Challenge Round** is an optional state machine embedded in one Session's metadata.
- A **Profile** has exactly one **Learning Profile** (its Mentor Memory store).
- An **Owner** with linked **Child Profiles** sees the guardian surfaces: **Recaps**,
  **Knowledge Inventory**, monthly/weekly reports.
- A **Family Plan** links multiple Profiles under one shared **Quota**.

## Example dialogue

> **Dev:** "When an **Owner** opens the **Recaps** tab, are we showing the **Session Summary**?"
> **Domain expert:** "No — three different things share that word. The **Session Summary** is
> what the *learner writes* at the end. The **Learner Recap** is the AI's takeaway card the
> *learner* sees on close. The **Recap** in the Recaps tab is the *guardian-facing* card about
> the child's Session. Only the last one belongs in that tab."
>
> **Dev:** "And the tab only appears for a **guardian**, right?"
> **Domain expert:** "Say **Owner with linked Child Profiles**. 'Guardian' is a V0 **Tab Shape**
> label we're retiring; the entity is `isOwner === true`. 'Parent' is copy only — never a type."
>
> **Dev:** "Got it. If the child's **Challenge Round** comes back with one `partial`, do they
> get the mastery badge?"
> **Domain expert:** "No. Mastery is server-owned and conservative — *every* concept must
> evaluate `solid`. Any `partial`, `missing`, or `misconception` blocks it and routes the
> weak concept to a **Needs-Deepening Record**."

## Flagged ambiguities

1. **owner / guardian / parent** — three words, one person. The schema check is `isOwner`.
   "Guardian" is a retiring V0 **Tab Shape** label; "parent" is UX copy only. **Use Owner.**
2. **learner / child / student** — all mean a non-owner Profile. The schema has no "learner"
   type — every Profile is a learner. **Use Child Profile (`isOwner=false`) for the entity;
   "learner" only in copy.**
3. **summary / recap** — three distinct objects: **Session Summary** (learner-written),
   **Learner Recap** (AI card to the learner), **Recap** (guardian-facing card). Use full names.
4. **"mode"** — four enums collide: **App Context** (`study|family`, profile preference),
   `AppMode` (its runtime React state), **Session Effective Mode** (`freeform|learning`),
   and `homeworkMode` (`help_me|check_answer`). **Never write bare "mode."**
5. **Topic** — the **Curriculum** entity vs. the loosely-named "needs-deepening topic." Reserve
   **Topic** for the curriculum entity; call the remediation row a **Needs-Deepening Record**.
6. **conversation vs native vs subject language** — `conversationLanguage` (mentor speaks),
   `nativeLanguage` (learner's L1), `languageCode` (Subject being studied). All ISO; different questions.
7. **"new"** — `NEW_LEARNER_SESSION_THRESHOLD` (progressive-disclosure UI) vs. `retentionStatus`
   meaning a Topic has no card yet. Coincidental word collision; unrelated concepts.
8. **role enums** — `Profile.isOwner` (boolean, canonical), `AgeGateRole`
   (`owner|child|impersonated-child`, for age gating), `profileQuotaRole` (`owner|child`, billing).
   Consistent in meaning, different shapes. Prefer `isOwner` for profile checks.
