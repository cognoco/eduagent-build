---
stepsCompleted: [1, 2]
inputDocuments:
  - 'docs/analysis/product-brief-EduAgent-2025-12-11.md'
  - 'docs/analysis/research/market-ai-tutoring-research-2024-12-11.md'
  - 'docs/analysis/research/evidence based learning science.md'
  - 'docs/Legacy/AI Model pricing.md'
  - 'docs/legacy/PRD.md'
  - 'docs/legacy/MVP_DEFINITION.md'
  - 'docs/legacy/USER_MOTIVATION.md'
  - 'prd-workflow-execution-brief.md'
documentCounts:
  briefs: 1
  research: 3
  brainstorming: 0
  projectDocs: 3
workflowType: 'prd'
lastStep: 1
project_name: 'EduAgent'
user_name: 'Zuzka'
date: '2025-12-11'
---

# Product Requirements Document - EduAgent

**Author:** Zuzka
**Date:** 2025-12-11
**Version:** 1.0 (BMAD Standard)

---

## Executive Summary

### Product Vision

*"A teacher who grows with you."*

EduAgent is a premium AI tutoring platform that teaches through conversation—using research-backed methodologies to guide motivated learners aged 11+ to understanding, remembering what they've learned across sessions, and verifying retention.

### The Problem

No affordable option exists that actually teaches—with memory, structure, verification, and personalization.

Learners don't need more information—they need guided practice, systematic verification, and continuity across sessions. Current solutions (video courses, gamified drills, generic AI chat, human tutors) optimize for engagement or scale, not learning outcomes. None provide structured teaching with retention verification at an accessible price point.

*See Product Brief for detailed competitive analysis.*

### The Solution

EduAgent delivers personalized AI tutoring through tiered subscriptions—combining the teaching quality of human tutors with the accessibility and consistency of AI.

**Four Pillars:**

1. **Memory:** Remembers what you learned, your struggles, and how you learn best—eliminating redundant explanations and building on prior knowledge

2. **Structure:** Builds personalized curricula and sequences topics in optimal order—not random Q&A but a guided learning journey

3. **Verification:** Tests understanding through learner-generated demonstrations of mastery and systematic assessment—you can't just consume, you must prove comprehension

4. **Relationship:** Knows your goals, learning style, and progress history—a persistent teacher, not a disposable tool

### Target Users

Motivated learners aged 11+ who really want to learn—not casual browsers:

- **Parents of struggling students** (primary): Kid needs to pass, catch up, get into good school. Affordable subscription tiers cheaper than tutor, available anytime
- **Career changers**: Need new skills for hiring/promotion. Investment in earning potential
- **Certification seekers**: Preparing for exams (AWS, CPA, language tests). Structured prep that sticks
- **Serious students**: University courses they're struggling with. On-demand help that remembers gaps
- **Committed lifelong learners**: Learning language for move abroad, skill for passion project. Real progress, not dabbling

### Pricing Structure

> **Note:** All pricing is preliminary and subject to beta validation. See Pricing Specification (`docs/Legacy/eduagent-pricing-specification.md`) for full details.

- **Tiers:** Free → Plus → Family → Pro (account required for all tiers)
- **Pricing:** €18.99/mo (Plus) | €28.99/mo (Family, up to 4 users) | €48.99/mo (Pro, up to 6 users)
- **Family/Pro:** Shared question pools across all users
- **Trial:** 14 days Plus access + 14 days soft landing (reverse trial)
- **Free Tier:** 50 questions/month with first-week boost (10/day for days 1-7)
- **Top-ups:** Plus €10/500, Family/Pro €5/500 (12-month expiry)

---

## Success Criteria

### North Star Metric

**Weekly Active Learners who completed verification** (not just app opens)

### Primary Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Onboarding Completion** | >60% | Product clarity and value communication |
| **First Week Retention** | >30% | Early product-market fit signal |
| **Trial → Paid Conversion** | >15% | Business viability |
| **30-Day Retention** | >40% | Product stickiness and sustainable growth |
| **Session Completion** | >70% | Engagement quality (not abandoning mid-topic) |
| **Learning Efficacy** | >50% | Pass rate on re-tests (2 weeks later) validates retention |
| **App Store Rating** | >4.0 | User satisfaction |

### Secondary Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Weekly Active Learners (WAL) | Users completing ≥1 session/week | Growing 20%/month |
| Session Completion Rate | Sessions not abandoned mid-topic | >70% |
| NPS | User satisfaction | >40 |
| LLM cost per question | System must optimize AI costs (multi-model routing) | <€0.005 avg |

### Validation Approach

**Beta Users (Target Weeks 10-13 post-launch):**
- Key assumption to validate: Parents will pay premium pricing (Plus tier) for verified learning outcomes
- Method: User interviews + conversion data across pricing tiers

#<<< MISSING: Detailed validation plan, beta program structure, hypothesis testing framework, instrumentation/analytics setup, cohort analysis approach, funnel optimization strategy >>>

*Future: Create Analytics & Validation Plan auxiliary document.*

---

## Product Scope

### MVP Scope (v1.0)

**Core Value Proposition:**
A user can learn ANY subject through AI-powered tutoring with personalized curriculum and retention verification.

**In Scope:**

| Feature Category | Included Features |
|------------------|-------------------|
| **Authentication** | Email + password, Google OAuth, Apple Sign-in, OpenAI OAuth (exploring), multi-profile (family), GDPR parental consent (11-15, EU) |
| **Onboarding** | Subject selection (any topic), conversational interview, dynamic curriculum generation, homework help quick entry |
| **Learning Experience** | Real-time AI chat, prior knowledge context, adaptive explanations, mandatory user summaries, homework integrity mode |
| **Assessments** | In-lesson quizzes, topic completion tests, re-testing from summaries |
| **Progress** | Learning Book (review past topics), mastery tracking, knowledge decay visualization |
| **Gamification** | Honest streak (recall-based), retention XP (verified after delayed recall), decay bars |
| **Language Learning** | Four Strands methodology (explicit instruction + input + output + fluency), vocabulary tracking, CEFR progress |
| **Subscription** | Free tier + 14-day Plus trial + reverse trial, tiered pricing (Free/Plus/Family/Pro), shared question pools, top-up credits, payment gateway integration, BYOK waitlist |
| **Platforms** | iOS, Android, Web (cross-platform) |

**Subject Coverage:** ANY subject via dynamic curriculum generation (no pre-curated content bottleneck)

**Teaching Modes:**
- **Socratic Method** (default): Conceptual subjects—guide learners to discover answers
- **Four Strands** (language learning): Explicit grammar instruction + comprehensible input + output practice + fluency drills

### Explicitly Out of Scope (v1.0)

| Feature | Rationale | Target Version |
|---------|-----------|----------------|
| Cohorts, buddy matching, study groups | Needs user volume | v1.5 |
| Human coaching add-on | New business model | v2.0 |
| Portfolio projects | Complexity, needs curriculum stability | v2.0 |
| Multi-language UI (beyond EN/DE) | English + German MVP | v2.0 |
| Offline mode | Significant caching complexity | v2.0 |
| Age 6-10 mode | Different UX, stricter COPPA requirements | v2.0 |
| B2B/Team licensing | Focus on B2C first | v2.0 |
| Concept Map visualization library choice | Deferred to implementation (Epic 7) | v1.1 |

*See Product Brief for post-MVP roadmap (v1.5, v2.0).*

---

## User Journeys

### Journey 1: New User Onboarding

**Actor:** New learner (or parent creating child profile)

**Goal:** Get from discovery to first lesson completion with clear value demonstration

**Journey Flow:**

1. **Discovery & Registration**
   - Downloads app or visits web app
   - Creates account (email/Google/Apple)
   - Completes profile (name, birthdate, country)
   - If 11-15 in EU: Parent receives consent email
   - Parent approves consent (if applicable)

2. **Intent Selection**
   - Sees fork: "Learn something new" vs "Get help with homework"
   - Selects learning intent

3. **Curriculum Creation (if "Learn something new")**
   - Types any subject they want to learn
   - Conversational interview with AI (goal, background, spot check) ~3 minutes
   - AI generates personalized learning path
   - Reviews curriculum, can skip known topics or challenge order
   - Sees "why this order?" explanations on demand

4. **First Lesson**
   - AI introduces first topic
   - Learns through conversation, asks questions
   - AI adapts explanations based on responses
   - Quick understanding checks during lesson
   - Writes 3-5 sentence summary in own words (mandatory production)
   - Receives AI feedback on summary, guided to self-correct
   - Lesson completes, progress saved

5. **Post-First-Lesson**
   - Sees progress in Learning Book
   - Views personalized curriculum path
   - Receives notification reminder for next lesson

**Success Indicators:**
- Completes onboarding in <10 minutes
- Starts first lesson within 24 hours
- Completes first lesson (doesn't abandon mid-topic)
- Returns for second session within 7 days

### Journey 2: Daily Learning Loop

**Actor:** Returning learner

**Goal:** Continue learning journey with continuity from previous sessions

**Journey Flow:**

1. **Session Entry**
   - Opens app, sees "Continue where you left off"
   - OR receives push notification: "Ready for your next lesson?"
   - OR clicks "New Topic" to advance curriculum

2. **Learning Session**
   - AI references prior learning: "Remember when we covered..."
   - Teaches new concept through conversation
   - Adapts based on demonstrated understanding
   - Asks questions, AI clarifies with different examples if confused
   - Provides worked examples (for novices) or problem-first (for advanced)

3. **Verification**
   - In-lesson quick checks (2-3 questions)
   - Explains reasoning, not just answers
   - Receives feedback on WHERE thinking went wrong
   - Writes summary in own words
   - AI guides self-correction if summary shows misunderstanding

4. **Progress Update**
   - Topic marked complete (pending verification)
   - Mastery level updated
   - XP remains pending until recall test passes
   - Curriculum adapts based on performance

5. **Retention Loop**
   - After 2 weeks: Receives review reminder
   - Takes quick recall test on old topic
   - Pass → XP becomes verified, mastery maintained
   - Fail → XP decays, topic marked for re-learning

**Success Indicators:**
- Completes sessions without abandoning
- Returns within 7 days consistently
- Passes >50% of delayed recall tests
- Progresses through curriculum steadily

### Journey 3: Parent Oversight

**Actor:** Parent monitoring child's learning

**Goal:** Verify child is learning (not cheating) and track progress

**Journey Flow:**

1. **Profile Access**
   - Opens app, switches into child's profile
   - Full access to child's learning history (no separate dashboard)

2. **Progress Review**
   - Views Learning Book with all topics
   - Sees retention scores and decay indicators
   - Reviews "Problems worked through" section
   - Verifies homework sessions show guidance, not answers given
   - Sees: "✓ AI guided through factoring steps / ✓ You found the solution / ✓ No answers were given"

3. **Curriculum Insight**
   - Reviews personalized learning path
   - Sees topics completed vs pending
   - Checks mastery levels and knowledge decay

4. **Trust Validation**
   - Sees child's own written summaries in their voice
   - Reviews AI's teaching notes and feedback
   - Confirms Socratic guidance for homework (not answer-giving)

**Success Indicators:**
- Parent reviews progress at least weekly
- Parent trusts app isn't enabling cheating
- Parent renews subscription based on visible learning outcomes

### Journey 4: Homework Help

**Actor:** Student with specific homework problem

**Goal:** Get help solving problem through guided thinking (not getting answers)

**Journey Flow:**

1. **Quick Entry**
   - Selects "Get help with homework" from intent screen
   - OR clicks "Homework Help" quick action button
   - Selects subject from dropdown

2. **Problem Input**
   - Types homework problem description
   - OR photographs problem (v1.1)

3. **Socratic Guidance**
   - AI detects "help with problem" vs "teach concept"
   - AI switches to homework integrity mode
   - Asks: "What do you think the first step is?"
   - Student explains thinking
   - AI guides: "Good! Now what happens next?"
   - Student works through problem with prompting
   - AI NEVER gives final answer

4. **Solution Discovery**
   - Student arrives at solution through own reasoning
   - AI confirms correctness
   - Session marked as "🎯 Guided problem-solving" in Learning Book

5. **Parent Visibility**
   - Parent can review session
   - Sees student did thinking, AI only guided
   - Trust reinforced: "App helps, doesn't cheat"

**Success Indicators:**
- Student solves problem independently
- Parent sees guided process, not answer-giving
- Student returns for future homework help
- Retention maintained for underlying concepts

### Journey 5: Language Learning

**Actor:** Learner studying a new language

**Goal:** Achieve conversational proficiency through structured progression

**Journey Flow:**

1. **Mode Detection**
   - Types "Learn Spanish" (or German, Chinese, etc.)
   - System detects language subject, switches to Four Strands methodology
   - AI explains realistic time expectations (FSI categories: 600-2200 hours)

2. **Foundation Building**
   - Receives explicit grammar instruction (not Socratic discovery)
   - Practices vocabulary with spaced repetition
   - Reads comprehensible passages at 95-98% known words
   - Writes/speaks to produce language (output practice)

3. **Daily Practice**
   - Vocabulary review queue (SM-2 spaced repetition)
   - Time-pressured fluency drills for automatic retrieval
   - Grammar pattern practice
   - Comprehensible input (reading/listening)

4. **Progress Tracking**
   - Sees vocabulary count growing
   - Tracks hours studied vs FSI estimate
   - CEFR milestone progress (A1 → A2 → B1...)
   - Production count (not just recognition)

5. **Error Correction**
   - Direct correction + explanation (not Socratic hints)
   - Collocation learning (phrases, not just isolated words)
   - Natural speech patterns

**Success Indicators:**
- Vocabulary count increases steadily
- Passes CEFR milestone assessments
- Can produce (speak/write) learned material
- Retains vocabulary long-term (12+ exposures)

*Note: Detailed journey maps for certification seekers, career changers, and serious students to be created during Epics phase. See `docs/analysis/epics-inputs.md`.*

---

## Domain Requirements

### Age & Compliance Requirements

**Minimum Age:** 11 years old
- Conversational AI works better with older learners
- Can sustain 20-30 minute sessions
- Can learn independently (parents don't need to hover)

**GDPR Compliance (Ages 11-15 in EU):**
- Parental consent required for users aged 11-15 in EU countries
- Parent email collection during registration
- Consent email with approve/decline links
- Pending consent state (child cannot start until parent approves)
- Consent confirmation stored in database
- Account deletion flow (GDPR right to erasure)
- Data export capability

**COPPA Compliance (Ages 11-12 in US):**
- Verifiable parental consent required for users aged 11-12 in US
- Same consent workflow as GDPR (email verification)
- Cannot collect personal data before consent obtained
- Parent must be able to review and delete child's data
- Clear privacy policy in child-accessible language

**Consent Decline Flow:**
- If parent declines consent → Account deleted immediately
- No data retained (child's registration data purged)
- Child notified: "Your parent declined. You can register again when you're [16 in EU / 13 in US]."
- Email not blocked (can re-register at appropriate age)

**Consent Timeout & Non-Response:**
- Consent email links expire after **7 days**
- Child can request "Resend consent email" from pending state (maximum 3 resends)
- If parent never responds:
  - Reminder emails sent at Day 7, Day 14, Day 25
  - After **30 days** in pending state → account auto-deleted
  - Child notified before deletion: "Your parent didn't respond. Your account will be deleted on [date]."
- Requesting new consent email resets the 30-day clock (up to 3 times total)

#<<< MISSING: Detailed GDPR/COPPA implementation requirements, consent management workflows, data retention policies, cross-border data transfer compliance >>>

*Future: Create Privacy Compliance Guide auxiliary document (covers both GDPR and COPPA).*

**Ages 6-10 (Out of Scope):**
- v2.0 target
- Would require different UX (simpler interface)
- Stricter COPPA requirements for younger children

### Family Account Requirements

**Multi-Profile Support (Family/Pro Tiers):**
- **Family tier (€28.99/mo):** Up to 4 learner profiles, 1,500 questions/month shared
- **Pro tier (€48.99/mo):** Up to 6 learner profiles, 3,000 questions/month shared
- Each profile has own curriculum, progress, preferences
- Eligibility: Anyone can be invited (no household verification, like Duolingo)
- Owner sends invite via email or link; can add/remove members anytime

**Parent Access Model:**
- Parent can switch INTO child's profile for full access
- No separate "parent dashboard" (uses same learner UI)
- Full visibility into:
  - Learning history and conversations
  - Progress and mastery scores
  - Homework sessions (integrity verification)
  - Knowledge retention patterns

**Data Isolation:**
- Each profile has separate learning history
- No cross-contamination of curricula
- Individual mastery tracking
- Separate XP and streak counters

**Family Owner Cancellation:**
- Family owner cancellation → **all profiles downgrade** to Free tier
- Owner warned before cancellation: "This will affect X family members"
- Each family member notified: "Your family subscription ended. You're now on Free tier."
- **Transfer option:** Before cancellation, owner can transfer ownership to another adult family member
- Family members can upgrade to individual subscription to retain premium access
- All progress preserved (downgrade, not delete)

**Family Member Removal:**
- **Parent removes child:**
  - Child's profile becomes standalone Free account (if child is 16+ EU / 13+ US)
  - Child's profile deleted if under consent age (data can't exist without consent)
  - All progress preserved for eligible standalone accounts
  - Child notified: "You've been removed from family. Your account is now Free tier."
- **Child leaves voluntarily:**
  - Same rules apply (standalone if eligible, deleted if under consent age)
  - Child must confirm: "Leaving will convert you to Free tier. Continue?"

**Parent Account Deletion with Children:**
- Parent cannot delete account while children are attached
- Must first: Remove all children OR transfer ownership to another adult
- Prompt: "You have X family members. Remove them or transfer ownership before deleting."
- If children are under consent age: Parent must explicitly confirm deletion of children's data too

#<<< MISSING: Family account management workflows, profile switching UX specifications >>>

*Future: Covered in UX Design phase and Architecture phase. Billing logic in `docs/analysis/architecture-inputs.md`.*

### Regulatory Compliance

**Data Protection:**
- GDPR compliance for EU users
- Data encryption in transit and at rest using industry-standard protocols
- Token-based authentication with secure session management
- Session management and timeout policies
- Account deletion within 30 days of request

**Content Safety:**
- Age-appropriate content filtering
- No inappropriate subject matter
- Homework integrity enforcement (no cheating enablement)
- Parent visibility into all child interactions

**Inappropriate Subject Handling:**
- AI-level filtering for prohibited topics (weapons, drugs, self-harm, illegal activities, adult content)
- LLM refuses to create curriculum for harmful subjects
- No explicit blocklist maintained; trust AI judgment for edge cases
- If AI refuses subject, user can rephrase or choose different topic

**Accessibility:**
- WCAG 2.1 Level AA compliance (target)

#<<< MISSING: Detailed accessibility requirements, WCAG compliance checklist, screen reader support specifications, keyboard navigation requirements >>>

*Future: Create Accessibility Testing Plan auxiliary document.*

### Internationalization

**MVP:** English + German UI
**Post-MVP:** Spanish, French, Polish UI translations

**Learning Languages:** ANY language can be taught (via LLM capability)
**UI Languages:** English + German in v1.0

#<<< MISSING: Translation workflows, locale-specific compliance requirements >>>

*Note: i18n architecture design captured in `docs/analysis/architecture-inputs.md` for Architecture phase.*

---

## Teaching & Learning Specifications

### Teaching Methodology

**Dual-Mode Teaching:** System automatically detects subject type and applies appropriate methodology:

| Subject Type | Method | Application |
|--------------|--------|-------------|
| **Conceptual** (math, programming, science) | Socratic Method | Guide learner to discover answers through questioning |
| **Language Learning** | Four Strands (Nation) | Explicit instruction + comprehensible input + output practice + fluency |

**Four Strands Implementation (25% time allocation each):**
1. **Meaning-Focused Input:** Comprehensible passages at 95-98% known words
2. **Meaning-Focused Output:** Speaking/writing practice (production)
3. **Language-Focused Learning:** Explicit grammar and vocabulary instruction
4. **Fluency Development:** Time-pressured drills for automatic retrieval

**Research Basis:**
- Socratic method effective for conceptual subjects (guided discovery)
- Four Strands framework (Nation) required for language acquisition
- Adults need explicit grammar instruction, not discovery-based learning for languages

### Gamification Mechanics

**Philosophy:** Reward knowledge retention, not app engagement

**XP and Streak System:**

| Mechanic | Specification |
|----------|---------------|
| Topic completion | 0 XP immediately; XP awarded only after verification |
| Honest Streak | Streak counts only when recall test passed (not app opens) |
| XP Decay | XP decays over time without review (reflects knowledge fading) |
| Retention XP | Verified after 2-week and 6-week delayed recall tests |
| Badges | Awarded for demonstrated retention (e.g., "90%+ recall at 6 weeks") |

**Research Basis:**
- Interleaved retrieval practice (d=1.21 effect size)
- Spaced repetition (SM-2 algorithm)
- Knowledge decay visualization (metacognitive awareness)

### Step-Level Feedback (Critical)

**Research basis:** Step-level tutoring achieves d=0.76 vs answer-level tutoring at d=0.31 (VanLehn meta-analysis). The difference accounts for 2x effectiveness.

**Requirement:**
- AI must provide real-time feedback during problem-solving, not just evaluate final answers
- When learner makes error mid-reasoning, AI intervenes immediately: "Let's pause here - what made you choose that step?"
- Feedback targets the specific step where thinking went wrong, not just "incorrect"
- AI guides through each step: "Good, what's the next step?" rather than waiting for complete answer

**Implementation:**
- For multi-step problems: AI checks understanding at each step
- For explanations: AI asks clarifying questions during learner's explanation
- For homework help: Socratic guidance operates at step level, not problem level

### Adaptive Difficulty (80% Success Target)

**Research basis:** Rosenshine's Principles - optimal learning occurs at ~80% success rate during practice. Too easy = no learning; too hard = frustration and cognitive overload.

**Requirement:**
- AI calibrates question difficulty to maintain approximately 80% success rate per session
- If learner succeeds >90% consistently → increase difficulty (harder questions, less scaffolding)
- If learner succeeds <70% consistently → decrease difficulty (more hints, simpler questions)
- Tracks success rate per topic and adjusts dynamically

**Implementation:**
- Rolling window of last 10 questions determines adjustment
- Difficulty dimensions: question complexity, scaffolding level, time pressure
- User can see their success rate in session summary (transparency)

### Interleaved Practice

**Research basis:** Interleaving produces d=1.21 effect size - one of highest in learning science. Mixing related topics forces discrimination and improves long-term retention.

**Default behavior (Interleaved Recall Tests):**
- Recall tests mix **3-5 topics from the same subject**
- Topics selected based on: due for review + related/confusable content
- Forces discrimination: "Which concept applies here?"
- Example: Math recall mixes multiplication, division, fractions (not all multiplication)

**User choice (Focused Practice):**
- User can select "Practice only [current topic]" after completing a lesson
- Or from Learning Book: "Practice this topic only"
- Useful for struggling learners who need reinforcement before mixing

**UI flow:**
- After completing a topic: "Ready for review?" → [Mixed Practice (Recommended)] or [Just This Topic]
- Learning Book: Each topic has "Practice" button with dropdown for Mixed/Focused

**Not interleaved:**
- Cross-subject mixing (Spanish + Calculus) is NOT interleaving - topics must be related/confusable

### Learning Science Explanations

**Research basis:** 93% of students incorrectly believe massed study is more effective than spaced study. Learners prefer ineffective strategies because they feel easier.

**Requirement:**
- AI explains WHY the system uses certain techniques when learners might resist
- When learner complains about difficulty: "This feels harder because we're mixing topics - research shows this doubles your retention"
- Brief explanations, not lectures: 1-2 sentences max

**When to explain:**
- First interleaved recall test: "We're mixing topics to help your brain discriminate - this is proven to work better"
- First delayed recall test: "Testing yourself is the #1 way to remember - better than re-reading"
- When difficulty increases: "I'm making this harder because you're doing well - challenge helps you grow"
- When user skips summary: "Writing in your own words cements learning - skipping means weaker memory"

**Opt-out:**
- User can disable explanations in Settings: "Don't show learning tips"
- Default: ON for first 30 days, then reduced frequency

### Chunk-Based Language Learning

**Research basis:** 32-59% of natural language consists of formulaic sequences (chunks). High-proficiency learners store and retrieve chunks holistically; low-proficiency learners analyze word-by-word, losing fluency.

**Requirement:**
- Language learning mode teaches phrases/chunks, not just isolated words
- Vocabulary tracking includes chunk count alongside word count
- Examples: "por favor", "it turns out", "on the other hand", "je voudrais"

**Implementation:**
- Vocabulary list shows: Words (2,450) | Chunks (380)
- Spaced repetition applies to chunks as single units
- AI introduces chunks in context, not as word lists
- Common chunks prioritized (greetings, transitions, discourse markers)

### Pattern Noticing Prompts

**Research basis:** Schmidt's Noticing Hypothesis - "input does not become intake unless consciously registered." Explicit attention to patterns accelerates acquisition.

**Requirement:**
- AI explicitly highlights patterns learners might miss
- After examples, AI draws attention: "Notice how all these verbs end in -tion? That's a pattern..."
- For language learning: "See how 'ser' is used for permanent things, 'estar' for temporary?"

**Implementation:**
- AI summarizes patterns after 3+ related examples shown
- Patterns saved to topic notes in Learning Book
- User can ask "What patterns should I notice?" for any topic
- Visual highlighting in text where applicable (bold key patterns)

**Streak Outage Protection:**
- If system detects **server outage >1 hour** during user's active streak day:
  - Automatic "streak freeze" applied for affected users
  - User notified: "We had an outage. Your streak is protected."
- Manual streak restoration available via support request (with evidence of app issue)
- Streak already has 3-day pause buffer, so minor issues covered

**Learning Mode Switching:**
- Two modes: "Serious Learner" (mastery gates, verified XP) and "Casual Explorer" (no gates, completion XP)
- Mode can be changed from Settings **OR** by asking AI conversationally ("Switch me to Serious mode")
- AI confirms before switching: "Switching to [mode] means [consequences]. Are you sure?"
- **Casual → Serious transition:**
  - All existing "completion XP" converts to "pending XP"
  - Topics marked as "Unverified" until recall tests passed
- **Serious → Casual transition:**
  - All "pending XP" immediately converts to "verified XP"
  - Mastery gates removed
- Mode applies per-profile (not per-subject)

### Homework Integrity Mode

**Trigger:** System detects "help with this problem" vs "teach me concept"

**Workflow:**
1. AI switches to homework integrity mode automatically
2. Guides through solution: "What do you think the first step is?"
3. Student explains thinking, AI prompts next step
4. AI never provides final answers directly
5. Session marked as "Guided problem-solving" in Learning Book

**Parent Visibility:**
- All homework sessions flagged in Learning Book
- Parent can see: AI guidance provided / Student found solution / No answers given
- Full conversation history available for review

### Summary Quality & Skip Consequences

**Summary Quality Validation:**
- AI evaluates summary quality before accepting
- **Gibberish detection:** If summary is <20 characters or nonsensical → prompt "Please write a real summary in your own words"
- **Copy detection:** If >80% similarity to AI's explanation → prompt "This looks copied. Try explaining in YOUR words."
- User gets **3 attempts** to write acceptable summary
- After 3 failed attempts → summary marked as "skipped"

**Skip Consequences:**
- Skipped summary → Topic marked as "Unverified" (not "Completed")
- Unverified topics:
  - Don't count toward curriculum progress percentage
  - Get recall tests sooner (1 week instead of 2 weeks)
  - No XP awarded until verified via recall OR user writes summary later
- User can return to topic anytime from Learning Book to "Add summary" and convert to Verified status

**Repeated Skipping Escalation:**
- After **5 consecutive skips**: Warning "Summaries help you remember. Your recent topics are unverified."
- After **10 consecutive skips**: Prompt "Would you like to switch to Casual Explorer mode?" (no summary requirement)
- No hard block; user can keep skipping but sees impact (unverified topics, no XP)
- Skip counter resets when user writes an accepted summary

**Parked Question Limits:**
- **Soft limit:** 20 parked questions per subject
- At 21st: "You have 20 parked questions. Review some before adding more?"
- User can override and add anyway
- **Hard limit:** 50 parked questions per subject
- At hard limit: Must review/delete before adding new
- "Clear all parked questions" bulk action available

**Notifications Disabled Handling:**
- User can disable all notifications (their choice respected)
- In-app banner shown on home screen: "You have X topics ready for review" (passive reminder)
- If notifications disabled AND user hasn't reviewed in 14+ days:
  - One-time in-app prompt: "Your knowledge is fading. Enable reminders?"
- No forced notifications; respect user preference
- Parent (if applicable) still sees decay status when viewing child's profile

### Adaptive Teaching (In-Lesson)

**Three-Strike Rule:** When user fails to answer correctly 3 times on same concept:

1. **Strikes 1-2:** AI rephrases question, provides hints, guides with Socratic method
2. **Strike 3:** AI automatically switches to direct instruction:
   - Explains concept with concrete examples
   - Shows worked solution
   - Rephrases original question
3. **After AI explanation:**
   - If user answers correctly → Topic saved to Learning Book (normal)
   - If user still struggles → Topic saved to Learning Book "Needs Deepening" section

**"Needs Deepening" Topics:**
- Automatically scheduled for more frequent review
- Flagged in Learning Book with ⚠️ indicator
- When eventually mastered (3+ successful recalls) → moves to normal section

### Adaptive Teaching (Subject-Level)

**Trigger:** User fails recall test 3+ times and chooses "Different method" during re-learning

**Method Preferences Storage:**
- Stored per-subject in learner profile (not global)
- Options: "More examples", "Step-by-step", "Different analogies", "Simpler language", "Direct instruction"
- System remembers preference for future sessions

**Auto-Apply Logic:**
- When user starts new session in subject with stored preference → AI applies that method
- If user struggles again (3 wrong answers) → AI can suggest trying another approach
- Preferences can be reset from Settings

**Tunable Teaching Dimensions:**
| Dimension | Default | Alternatives |
|-----------|---------|--------------|
| Method | Socratic (questions) | Direct instruction, Worked examples first |
| Chunking | 1 concept/exchange | Micro-chunks, Larger context |
| Examples | Examples before theory | Theory first, Analogy-heavy |
| Language | Age-appropriate | Simpler, Step-by-step procedural |

### Recall Test Handling

**Optional but Encouraged:**
- Recall tests are optional; users are not forced to take them
- If user dismisses recall notification **3 times**:
  - Topic stays in "Pending Verification" status
  - XP remains unverified (shown as "pending XP")
  - Decay visualization shows "?" instead of decay bar
- User can take test anytime from Learning Book
- Gamification naturally incentivizes testing (verified XP, honest streak)

### Perpetual Failure Escalation

**When All Methods Exhausted:**
- After **3 different teaching methods** all fail for same topic:
  - Topic marked as "Blocked" in Learning Book
  - AI suggests: "This topic might need prerequisite knowledge. Would you like to review [suggested prerequisite]?"
  - User can choose:
    - Review prerequisite topic
    - Skip topic entirely
    - Try again later
- If user skips: Topic removed from active curriculum, preserved in Learning Book as "Skipped - Blocked"
- User can always revisit skipped topics later from Learning Book

### Needs Deepening Limits

**Overflow Prevention:**
- Maximum **10 active** "Needs Deepening" topics per subject
- When 11th topic would be added:
  - Oldest "Needs Deepening" topic auto-converts to "Weak" status (regular decay)
  - User notified: "You have many struggling topics. Consider focusing on review."
- Needs Deepening section shows priority order (most recent failures first)
- Bulk action available: "Clear all to Weak" if user wants to reset

**Delete Struggling Topic:**
- User can delete any topic from Learning Book (including Needs Deepening)
- Confirmation required: "Delete [topic]? This removes all progress and summaries."
- Deleted topics:
  - Removed from curriculum entirely
  - Can be re-added by requesting curriculum regeneration or asking AI
- Deletion is permanent (no undo)
- Rationale: User autonomy; if topic isn't relevant, let them remove it

**Method Preference Conflict Resolution:**
- User can change method preference anytime:
  - From Settings → Subject preferences
  - By telling AI: "Try teaching me differently"
- If user fails 3 times AFTER preference was applied:
  - AI suggests: "Your preferred method doesn't seem to be working. Try a different approach?"
  - User can accept (AI tries new method) or decline (keep current)
- "Reset all preferences" option in Settings clears all stored methods

---

## Project-Type Requirements

### Application Type

**Primary Classification:** Web Application + Mobile Application (cross-platform)

**Platform Requirements:**
- iOS (native application)
- Android (native application)
- Web (browser-based application)

**Rationale:**
- Mobile-first learning (users prefer apps over desktop)
- Cross-platform reduces development overhead
- Web access for desktop users and SEO

### Technical Category Requirements

**Real-Time Conversational AI:**
- System must support real-time bidirectional communication for conversational chat
- System must stream AI responses progressively for natural conversation flow
- System must persist session state across temporary disconnections
- System must retrieve conversation history for continuity

**Session Recovery:**
- Session state auto-saved after each AI exchange (not just at session end)
- On reconnection: Show "Welcome back! Continue where you left off?" with last message displayed
- If disconnected >30 minutes: Session marked as "paused", can resume from Learning Book
- If disconnected >24 hours: Session auto-closes, partial progress saved as "incomplete topic"

**AI/LLM Integration:**
- System must integrate with AI language model APIs for conversational teaching
- System must implement provider fallback to maintain availability during outages
- System must optimize AI model selection based on task complexity to control costs
- System must track token usage and costs per session
- System must implement rate limiting to prevent abuse and control costs

**Personalization Engine:**
- System must store user profiles including learning style, goals, and background
- System must generate and adapt personalized curricula based on user progress
- System must inject prior knowledge context into teaching sessions
- System must update learner models after each session

**Spaced Repetition System:**
- System must schedule review sessions using spaced repetition algorithms
- System must track and visualize knowledge decay over time
- System must generate daily review queues based on retention scores
- System must calculate and update retention scores per topic

**Authentication & Authorization:**
- System must support multiple authentication methods including social login and email/password
- System must manage multiple learner profiles under single subscription (family accounts)
- System must implement parental consent workflow for users aged 11-15 in EU
- System must maintain user sessions with automatic expiration for security

**Payment Processing:**
- System must process recurring monthly subscription billing
- System must manage 14-day trial periods with full access
- System must integrate with payment processor for secure checkout
- System must track and display subscription status to users

**Code Execution (Programming Subjects):**
- System must execute user-written code safely in isolated environment
- System must provide in-browser code execution without server-side compilation
- System must display code execution results in real-time within learning interface
- System must validate code output against test cases

### Infrastructure Requirements

**Hosting & Deployment:**
- System must deploy backend services to managed cloud hosting with auto-scaling capability
- System must build and distribute native mobile applications through automated CI/CD pipeline
- System must serve web application via content delivery network for global performance
- System must persist data in relational database with ACID compliance and 99.99% durability
- System must cache frequently accessed data to meet response time targets

**Scalability Targets:**
- MVP: 1-1,000 users
- Growth: 1,000-50,000 users
- Scale: 50,000+ users

**Performance Requirements:**
- API response time: <200ms (p95, excluding LLM)
- LLM first token: <2s (streaming start)
- App cold start: <3s (modern devices)
- Real-time chat latency: <100ms

**Reliability Requirements:**
- System uptime: 99.5% (excluding planned maintenance)
- Data durability: 99.99%
- AI provider availability: Multi-provider fallback capability

*Note: Infrastructure architecture, disaster recovery, backup strategies, and CI/CD pipeline specifications captured in `docs/analysis/architecture-inputs.md` for Architecture phase.*

### Security Requirements

**Data Protection:**
- System must encrypt all data in transit using industry-standard protocols
- System must encrypt sensitive data at rest using strong encryption algorithms
- System must use token-based authentication with automatic expiration
- System must implement rate limiting to prevent abuse
- System must validate and sanitize all user inputs

**Privacy:**
- System must comply with GDPR (account deletion, data export, parental consent)
- System must verify user age (11+ minimum)
- System must require parental consent for users aged 11-15 in EU
- System must not collect PII from minors without parental consent

**API Security:**
- System must implement rate limiting per user and IP address
- System must validate all API inputs
- System must prevent SQL injection attacks
- System must prevent cross-site scripting (XSS) attacks

#<<< MISSING: Detailed security architecture, threat model analysis, penetration testing requirements, security audit checklist >>>

*Future: Create Security Audit Checklist auxiliary document.*

---

## Functional Requirements

### User Management

- FR1: Users can register using email/password, Google OAuth, Apple Sign-in, or OpenAI OAuth
- FR2: Users can verify email addresses to activate accounts
- FR3: Users can reset passwords via email link
- FR4: Users can create multiple learner profiles under single subscription (family accounts)
- FR5: Users can switch between learner profiles
- FR6: Parents can switch into child's profile for full access to learning history
- FR7: Users aged 11-15 in EU can request parental consent during registration
- FR8: Users aged 11-12 in US can request parental consent during registration (COPPA)
- FR9: Parents can approve or decline consent via email link
- FR10: If parent declines consent, child account is deleted immediately with no data retained
- FR11: Users can delete their accounts and all associated data (GDPR)
- FR12: Users can export their learning data (GDPR)

**OpenAI OAuth (Exploring):**
- Enables authentication via OpenAI account
- Future potential: Users with ChatGPT Plus could use their own API quota, reducing EduAgent LLM costs
- MVP scope: Authentication only; token usage integration deferred to BYOK feature (v1.1+)
- Implementation details TBD during Architecture phase

### Learning Path Personalization

- FR13: Users can specify any subject they want to learn
- FR14: Users can complete conversational interview to assess goals, background, and current level
- FR15: Users can receive AI-generated personalized curriculum based on interview
- FR16: Users can view complete learning path with topics and learning outcomes
- FR17: Users can request explanation for curriculum topic sequencing ("why this order?")
- FR18: Users can skip topics they already know
- FR19: Users can challenge curriculum and request regeneration
- FR20: Users can see confidence levels on curriculum topics (Core/Recommended/Contemporary/Emerging)
- FR21: Users can have curriculum adapt after module completion based on performance
- FR22: Users can see realistic time estimates per topic

See also FR134-FR137 (Analogy Domain Preferences) for subject-level learning style customization.

**Interview Abandonment:**
- Interview progress auto-saved after each exchange
- On return: "Continue your interview?" with summary of what was discussed
- Interview expires after **7 days** of inactivity → must restart
- User can manually "Restart interview" anytime from draft curriculum screen

**Skip All Topics Prevention:**
- If user skips >80% of curriculum topics:
  - AI asks: "You know most of this! Want a placement assessment instead?"
  - **Option A:** Take assessment → AI places user at appropriate level
  - **Option B:** Continue anyway → curriculum generated with advanced/edge topics only
  - **Option C:** Choose different subject
- Cannot skip 100% (at least 1 topic required to proceed)

**Goal Change Mid-Curriculum:**
- User can request "Change my learning goal" from Settings or by asking AI
- AI conducts mini-interview: "What's your new goal?"
- Curriculum regenerated, preserving completed topics
- Progress on incomplete topics converted to "Paused" status
- User warned: "Changing goals will reorganize your curriculum. Completed topics stay completed."

**Curriculum Regeneration Limit:**
- **3 free regenerations** per curriculum
- After 3rd: "You've regenerated 3 times. Would you like to talk through what's not working?"
- AI offers guided refinement instead of blind regeneration
- No hard block, but friction encourages conversation over repeated regeneration
- Regeneration count resets if user completes interview again

### Interactive Teaching

- FR23: Users can chat with AI tutor in real-time with streaming responses
- FR24: Users can ask follow-up questions for clarification
- FR25: Users can request simpler or more complex explanations
- FR26: Users can receive adaptive explanations based on demonstrated understanding
- FR27: Users can see worked examples appropriate to their skill level:
  - **Full examples**: mastery < 0.3 (novice) - complete step-by-step walkthrough
  - **Fading examples**: mastery 0.3-0.6 (developing) - first steps shown, user completes rest
  - **Problem-first**: mastery > 0.6 (competent) - attempt problem, example only if stuck
- FR28: Users can receive cognitive load management (1-2 concepts per message maximum)
- FR29: Users can flag content that seems incorrect
- FR30: Users can choose between "Learn something new" and "Get help with homework" modes
- FR31: Users can receive Socratic guidance for homework (guided problem-solving, never answer-giving)
- FR32: Users can photograph homework problems for AI analysis (v1.1)
- FR33: Users can see sessions marked as "guided problem-solving" in Learning Book

**Session Timeout Handling:**
- After **5 minutes** inactivity: First soft prompt "Still there?"
- After **10 minutes** inactivity: Second prompt "Your session will pause soon"
- After **15 minutes** inactivity: Session auto-pauses, state saved
- On return: "Welcome back! Continue where you left off?"
- No penalty for timeout; session simply pauses

**Content Flag Resolution:**
- Flag submitted → User sees "Thanks! We'll review this."
- Flags queued for human review (not auto-actioned)
- If confirmed incorrect: Content corrected in AI prompts/knowledge base
- User NOT notified of resolution (low priority for MVP)
- Flag data used for AI improvement and prompt refinement

**User Abuse Handling:**
- AI-level filtering: AI declines to engage with abusive content
- AI responds: "I'm here to help you learn. Let's focus on your studies."
- No account penalties for occasional outbursts (teens may vent)
- Persistent abuse (10+ abusive messages in session): Session ends, user warned
- Extreme content (threats, illegal): Logged for review, parent notified (if child account)

**Jailbreak Attempt Handling:**
- AI trained to resist jailbreak attempts for answer-giving
- If user persists after 3 attempts: AI says "I can only guide you to the answer, not give it. Want to work through it together?"
- No penalties; just persistent refusal
- Homework integrity mode cannot be disabled by user
- Parent visibility shows all attempts (transparency)

**Learn/Homework Mode Mid-Session Switch:**
- User can switch modes anytime by saying "Help me with homework" or "Teach me this concept"
- AI acknowledges: "Switching to homework help mode" or "Switching to teaching mode"
- Session history preserved; mode change logged
- Learning Book shows session with mixed modes: "Teaching + Homework help"

**Tiered Tangent Handling:**

AI maintains lesson focus while respecting learner curiosity through tiered responses:

| Tangent Type | AI Response | Example |
|--------------|-------------|---------|
| **Legitimate tangent** (directly related, deepens understanding) | Explore briefly (2-3 exchanges), then return | "Great question about recursion! [brief explanation] Now back to functions..." |
| **Adjacent topic** (related but off-curriculum) | Acknowledge + park for later | "That's a good question about databases. I've saved it to your parking lot. For now, let's finish loops..." |
| **True drift** (unrelated, off-topic) | Gentle redirect | "Interesting! But let's stay focused on Python. You can explore that separately." |
| **Repeated drift** (3+ true drifts in session) | Firmer redirect | "I notice we keep going off-topic. Let's focus on finishing this lesson first." |

**Implementation:**
- AI tracks invisible session objective (user doesn't see)
- Tangent classification happens automatically based on topic relevance
- Parked questions appear in Learning Book for later exploration
- No penalty for tangents; natural curiosity is welcome
- After lesson completes: "You had 3 parked questions. Want to explore any now?"

### Knowledge Retention

- FR34: Users can write 3-5 sentence summaries in their own words at topic completion (mandatory production)
- FR35: Users can receive AI feedback on summary quality and understanding
- FR36: Users can be guided to self-correct misunderstandings before AI provides corrections
- FR37: Users can skip summary production (with consequences: pending verification status)
- FR38: Users can have questions parked for later exploration (parking lot)
- FR39: Users can access parked questions in Topic Review
- FR40: Users can have AI reference prior learning in new lessons
- FR41: Users can receive understanding checks during lessons
- FR42: Users can choose in-app or push notifications for review reminders

### Learning Verification

- FR43: Users can take in-lesson quick checks (2-3 questions)
- FR44: Users can explain reasoning for answers (not just final answer)
- FR45: Users can receive feedback on WHERE thinking went wrong (not just "wrong")
- FR46: Users can take topic completion assessments
- FR47: Users can request re-tests on old topics from saved summaries
- FR48: Users can see mastery level per topic (0-1 score)
- FR49: Users can take delayed recall tests (2-week, 6-week intervals)
- FR50: Users can have XP verified only after passing delayed recall
- FR51: Users can see XP decay if recall tests fail

**Verification Types:**

AI uses different assessment types based on subject and skill being verified:

| Type | Description | Subjects | Example |
|------|-------------|----------|---------|
| **RECALL** | Remember facts, definitions, terminology | All | "What is the Pythagorean theorem?" |
| **APPLY** | Use a procedure correctly | Math, Programming, Science | "Solve for x: 2x + 5 = 15" |
| **EXPLAIN** | Demonstrate understanding in own words | All | "Explain why water expands when it freezes" |
| **ANALYZE** | Interpret, reason, compare/contrast | Humanities, Science, Business | "Why did the Roman Empire decline?" |
| **CREATE** | Produce original work | Essays, Code, Languages | "Write a function that sorts a list" |
| **LISTEN** | Comprehend spoken language | Languages | "What did the speaker say about the weather?" |
| **SPEAK** | Produce spoken language | Languages | "Describe your morning routine in Spanish" |
| **EVALUATE** | Identify flaws in presented reasoning (Bloom L5-6) | All | "Here's an explanation of photosynthesis — can you spot what's wrong?" |
| **TEACH_BACK** | Explain concept verbally; AI identifies gaps (Bloom L6) | All | "Teach me about photosynthesis — pretend I know nothing" |

**Implementation:**
- AI selects verification type based on learning objective and topic
- Mix of types within a session (not all RECALL)
- EXPLAIN required for every topic (confirms understanding, not just memorization)
- Language learning emphasizes LISTEN + SPEAK (production, not just recognition)

> Note: Visual/point-based verification (diagrams, visual matching) deferred to v1.5.

**Cheating Mitigation (Trust-Based):**
- **No active cheating detection** for MVP (invasive, complex)
- Trust-based system; recall tests are for user's benefit
- Mitigation: Questions require explanation of reasoning, not just answers
- If user copy-pastes obvious web text: AI detects and prompts "Explain this in your own words"
- Future consideration: Time-based anomaly detection (answering complex question in <5 seconds)

**Remediation Refusal Handling:**
- Relearning is optional; user can dismiss remediation prompts
- If user dismisses remediation **3 times** for same topic:
  - Topic stays in "Failed" status in Learning Book
  - XP for that topic set to 0 (fully decayed)
  - Topic no longer scheduled for recall tests
  - User can manually "Restart topic" anytime from Learning Book
- No forced relearning; natural consequences instead

**XP Floor and Forgotten Topics:**
- XP can decay to **0** (no artificial floor)
- Topic at 0 XP shows "Forgotten" status in Learning Book
- "Forgotten" topics:
  - Removed from active recall schedule
  - Shown in separate "Forgotten" section in Learning Book
  - User can "Relearn" to restart from beginning
- Total profile XP has floor of 0 (can't go negative)
- Rationale: Honest system; forgotten knowledge is forgotten

### Failed Recall Remediation

- FR52: Users who fail recall tests (3+ times) are guided to Learning Book for that topic
- FR53: Users can see their previous scores, "Your Words" summary, and decay status
- FR54: Users can choose "Review & Re-test" (re-test available after 24+ hours)
- FR55: Users can choose "Relearn Topic" to restart learning
- FR56: Users who choose Relearn can select "Same method" or "Different method"
- FR57: Users who select "Different method" are asked by AI what would help (conversational prompt)
- FR58: AI adapts teaching approach based on user's feedback (more examples, simpler, analogies, step-by-step, etc.)

### Adaptive Teaching

- FR59: AI applies three-strike rule during lessons (3 wrong answers → switch to direct instruction)
- FR60: AI explains with examples after 3 failed attempts, then rephrases question
- FR61: Topics where AI had to explain are saved to "Needs Deepening" section if user still struggles
- FR62: "Needs Deepening" topics are automatically scheduled for more frequent review
- FR63: "Needs Deepening" topics move to normal section after 3+ successful recalls
- FR64: Users can store teaching method preference per subject (not global)
- FR65: System auto-applies stored method preference when user starts session in that subject
- FR66: Users can reset teaching method preferences from Settings

See also FR128-FR133 (EVALUATE Verification) for devil's advocate verification mode.

See also FR134-FR137 (Analogy Domain Preferences) for analogy-based teaching customization.

See also FR138-FR143 (Feynman Stage) for teach-back verification via voice.

### Progress Tracking

- FR67: Users can view Learning Book with all past topics
- FR68: Users can browse topic summaries with "Your Words" (user's own writing)
- FR69: Users can see retention scores and knowledge decay bars
- FR70: Users can see topic retention status (Strong/Fading/Weak/Forgotten) and struggle status (Normal/Needs Deepening/Blocked) as separate indicators
- FR71: Users can view progress through learning path (topics completed vs remaining)
- FR72: Users can see "completed vs verified" topic status
- FR73: Users can access topic review with key concepts, examples, user summary, and teacher notes
- FR74: Users can initiate re-learning for weak topics
- FR75: Users can continue from last topic ("Continue where I left off")
- FR76: Users can view "Needs Deepening" section with topics requiring extra review

### Multi-Subject Learning

- FR77: Users can create multiple curricula (subjects) under one profile
- FR78: Users can view all active subjects on Home Screen with progress summary
- FR79: Users can switch between subjects from Home Screen or Learning Book
- FR80: Users can pause a subject (hidden from Home, accessible in Learning Book)
- FR81: Users can resume a paused subject
- FR82: Users can archive a subject (removes from active view, Learning Book entries preserved)
- FR83: Users can restore archived subjects from Settings
- FR84: Users can see subjects auto-archived after 30 days of inactivity
- FR85: Learning Book organizes topics by subject with subject switcher

**Learning Book Structure:**
- Home Screen = subject switcher (all active/paused paths visible)
- Learning Book = per-subject topic list with status indicators
- Each subject shows: progress %, last studied, topics completed/total
- Topics within subject show: title, retention status, struggle indicator (if applicable), actions

**Topic Status Model (Two Orthogonal Dimensions):**

Topics have TWO independent status types that can combine:

| Dimension | Statuses | Based On |
|-----------|----------|----------|
| **Retention** (time-based) | Strong → Fading → Weak → Forgotten | Time since last successful recall |
| **Struggle** (difficulty-based) | Normal / Needs Deepening / Blocked | Learning difficulty during sessions |

**Retention Status (time-based decay):**
- **Strong**: Recently reviewed, high retention (decay_level >80%)
- **Fading**: Review soon recommended (decay_level 50-80%)
- **Weak**: Needs review urgently (decay_level 25-50%)
- **Forgotten**: No recall activity, XP = 0 (decay_level <25%)
- **Stable**: 5+ consecutive successful recalls - exits active decay tracking

**Struggle Status (learning difficulty):**
- **Normal**: No struggle flags (default)
- **Needs Deepening**: AI had to explain after 3 wrong attempts; user still struggled
- **Blocked**: 3 different teaching methods all failed; requires user decision

**Combined Examples:**
- Topic can be "Strong + Needs Deepening" (recently reviewed but historically struggled)
- Topic can be "Weak + Normal" (hasn't reviewed lately but learned it easily)
- Topic can be "Forgotten + Blocked" (abandoned difficult topic)

**Visual Representation:**
```
┌─────────────────────────────────────────────────┐
│ Variables & Data Types                          │
│ ████████░░ Strong            [Review] [Details] │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Recursion                        ⚠️ Needs Deepening │
│ ██████░░░░ Fading               [Review] [Details] │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Pointers                         🚫 Blocked     │
│ ███░░░░░░░ Weak                 [Restart] [Skip] │
└─────────────────────────────────────────────────┘
```

**Subject Limits:**
- **Soft limit:** 10 active subjects per profile
- When creating 11th subject: Prompt "You have 10 active subjects. Would you like to pause or archive one first?"
- User can override soft limit and create anyway (no hard block)
- **Hard limit:** 25 total subjects (active + paused + archived)
- At hard limit: Must archive or delete before creating new

**Archive Behavior with Pending Tests:**
- When archiving subject with pending recall tests:
  - Warning shown: "This subject has X pending recall tests. Archive anyway?"
  - If archived: Pending tests are **suspended** (not deleted)
  - When subject restored: Suspended tests resume from where they were
- Archived subjects don't send recall notifications
- Learning Book entries preserved; just not actively scheduled

**Archive Behavior with Needs Deepening Topics:**
- When archiving subject with Needs Deepening topics:
  - Warning: "This subject has X topics that need extra review. Archive anyway?"
  - If archived: Needs Deepening status preserved but notifications suspended
  - When restored: Needs Deepening schedule resumes
- Archived subjects don't clutter active review queue

**All Subjects Inactive Handling:**
- If all subjects auto-archived due to inactivity (30+ days):
  - User sees "Welcome back!" screen on next login
  - Prompt: "Your subjects are archived. Which would you like to resume?"
  - Shows list of archived subjects with last activity date
- Account remains active; just no active learning paths
- Push notification after 30 days all-inactive: "We miss you! Ready to continue learning?"
- After 90 days: One final "win-back" email, then silence (respect user's choice)

### Engagement & Motivation

- FR86: Users can maintain Honest Streak (consecutive days passing recall, not just opening app)
- FR87: Users can see Streak pause for 3 days (not instant break)
- FR88: Users can earn Retention XP (pending → verified after delayed recall)
- FR89: Users can see "topics completed" vs "topics verified" distinction
- FR90: Users can view knowledge decay visualization (progress bars fading over time)
- FR91: Users can receive review reminders for fading topics
- FR92: Users can take interleaved retrieval sessions (multiple topics mixed, questions randomized)
- FR93: Users can see topics become "Stable" after 5+ consecutive successful retrievals
- FR94: Users can choose learning mode: "Serious Learner" (mastery gates, verified XP) or "Casual Explorer" (no gates, completion XP)
- FR95: Users can receive daily push notifications for learning reminders

### Language Learning

- FR96: Users can have system detect language learning intent and switch to Four Strands methodology automatically
- FR97: Users can specify native language for grammar explanations
- FR98: Users can see realistic time estimates (FSI category: 600-2200 hours)
- FR99: Users can receive explicit grammar instruction (not Socratic discovery)
- FR100: Users can practice output (speaking/writing) every session
- FR101: Users can read comprehensible passages at 95-98% known words
- FR102: Users can practice vocabulary with spaced repetition (SM-2 algorithm)
- FR103: Users can see vocabulary count and CEFR progress (A1 → A2 → B1...)
- FR104: Users can practice fluency with time-pressured drills
- FR105: Users can learn collocations and phrases (not just isolated words)
- FR106: Users can see hours studied vs FSI estimate
- FR107: Users can receive direct error correction (not Socratic hints)

**Multi-Language Vocabulary Isolation:**
- Vocabulary is **isolated per subject** (per language)
- Each language subject has its own vocabulary list and spaced repetition queue
- No cross-contamination (Spanish vocab doesn't appear in French reviews)
- Vocabulary stats shown per-language: "Spanish: 450 words | 85 chunks / French: 230 words | 42 chunks"
- CEFR progress tracked independently per language
- Rationale: Languages are distinct domains; mixing would confuse learners

**FSI Time Estimates:**

Realistic time expectations based on Foreign Service Institute research (for English speakers achieving professional working proficiency):

| Category | Languages | Hours to Proficiency | Daily Practice (1hr) |
|----------|-----------|---------------------|----------------------|
| **I** | Spanish, French, Italian, Portuguese, Dutch, Norwegian, Swedish, Danish, Romanian | 600-750 hours | ~2 years |
| **II** | German, Indonesian, Malay, Swahili | 900 hours | ~2.5 years |
| **III** | Russian, Polish, Greek, Hindi, Hebrew, Czech, Finnish, Hungarian, Vietnamese | 1,100 hours | ~3 years |
| **IV** | Chinese (Mandarin/Cantonese), Japanese, Korean, Arabic | 2,200+ hours | ~6 years |

**Implementation:**
- AI explains FSI category during language onboarding: "German is a Category II language. At 1 hour/day, expect ~2.5 years to professional proficiency."
- Progress dashboard shows: "Hours studied: 124 / ~900 FSI estimate (14%)"
- Manages expectations early to prevent dropout from unrealistic goals
- CEFR milestones provide interim progress markers (A1 achievable in ~60-100 hours for Category I)

### Concept Map — Prerequisite-Aware Learning (Epic 7 — v1.1)

- FR118: Topic prerequisite graph — DAG data model with `topic_prerequisites` join table. Each edge has relationship type (REQUIRED or RECOMMENDED). Validated for cycle-freedom on insert.
- FR119: Prerequisite-aware session ordering — when coaching card recommends a topic, check prerequisite completion first. If prerequisites incomplete, recommend prerequisite topic instead.
- FR120: Skip warning on prerequisite topics — when student explicitly skips a prerequisite, show warning dialog explaining which dependent topics may be harder. Log skip decision in `curriculumAdaptations.prerequisiteContext` JSONB for coaching awareness.
- FR121: Visual concept map — read-only DAG visualization showing topic nodes colored by retention status (green=strong, yellow=fading, red=weak, grey=not started). Edges show prerequisite relationships.
- FR122: Prerequisite edge generation — when new subject is created, LLM generates initial prerequisite edges based on curriculum structure. When new topic is added to existing subject, targeted LLM call generates edges for the new topic only (not full regeneration).
- FR123: Graph-aware coaching card — coaching card precomputation considers prerequisite graph. New card type: "newly unlocked" for topics whose prerequisites were just completed.
- FR124: Orphan edge handling — when prerequisite topic is skipped, dependent topics remain accessible but coaching card notes missing foundation. The `prerequisiteContext` JSONB records which prerequisites were skipped and when.
- FR125: Prerequisite context as teaching signal — when LLM teaches a topic whose prerequisite was skipped, the system prompt includes prerequisite context so the LLM can bridge knowledge gaps.
- FR126: Topological sort for learning path — default topic ordering uses topological sort of the prerequisite graph, with ties broken by retention urgency.
- FR127: Manual prerequisite override — parent or advanced learner can mark a prerequisite as "already known" to unlock dependent topics without completing the prerequisite in-app.

**Prerequisite Relationship Types:**
- **REQUIRED** — topic is locked until prerequisite reaches "strong" retention. Enforced by unlock logic (FR119).
- **RECOMMENDED** — advisory only. Topic is unlocked regardless of prerequisite status. Coaching card and LLM context mention the gap but do not block progress.

**Graph Constraints:**
- Prerequisite graph must be a DAG (directed acyclic graph). Cycles are rejected on insert (FR118).
- Each edge has a `relationshipType` enum: `REQUIRED | RECOMMENDED`.
- Maximum depth: 5 levels. LLM prompt instructs shallow prerequisite chains to avoid deep lock cascades.

**Visual Concept Map (FR121):**
- Node colors: strong (green), fading (yellow), weak (red), grey (not started)
- Edges: solid lines for REQUIRED, dashed lines for RECOMMENDED
- Read-only visualization (tap a node to navigate to topic detail / start session)
- Graph auto-layouts using force-directed algorithm; user can pan/zoom

**Coaching Card Integration (FR123):**
- Coaching card precomputation considers prerequisite graph
- New card type: `topic-unlocked` for topics whose prerequisites were just completed
- Card text: "You just unlocked [Topic Name]! Your mastery of [prerequisite list] means you're ready."

**LLM Context Injection (FR124, FR125):**
- When prerequisite was skipped, system prompt includes prerequisite context so LLM can bridge knowledge gaps
- `prerequisiteContext` JSONB records which prerequisites were skipped and when
- Context is advisory — LLM adapts teaching style but never refuses to teach a topic

### Devil's Advocate / EVALUATE Verification (Epic 3 extension — MVP)

- FR128: EVALUATE verification type — 8th verification type where AI presents deliberately flawed reasoning about a concept and student must identify the error. Targets Bloom's Taxonomy Level 5-6 (Evaluate/Create). Only triggers on topics with strong retention (easeFactor >= 2.5, repetitions > 0).
- FR129: Strong-retention gating — EVALUATE challenges are never presented for new, weak, or fading topics. The verification selector checks retention card state before offering EVALUATE as an option.
- FR130: Persona-appropriate framing — Teen (11-15): playful/competitive tone ("I think this explanation is right — can you prove me wrong?"). Learner (16+): academic/collaborative ("Here's a common explanation — what's the flaw in this reasoning?"). Uses existing `buildSystemPrompt()` persona voice system.
- FR131: Difficulty calibration — EVALUATE difficulty tied to existing escalation rung system (1-4). Rung 1-2: obvious logical errors, clear factual mistakes. Rung 3-4: subtle misconceptions, plausible-but-wrong reasoning. `evaluateDifficultyRung` (integer 1-4, nullable, default null) stored on retention card alongside SM-2 state. Advances on consecutive success, demotes on failure.
- FR132: Modified SM-2 scoring floor — EVALUATE failure maps to quality 2-3 (not 0-1). Rationale: missing a subtle flaw in presented reasoning ≠ not knowing the concept. Standard verification failure = quality 0-3. Without this floor, tricky EVALUATE challenges would tank retention scores unfairly. The SM-2 library (`packages/retention/`) math is unchanged — only the quality INPUT is different.
- FR133: Three-strike escalation for EVALUATE — First failure: reveal the flaw with explanation (teach the analytical skill, not the concept). Second failure: lower difficulty rung, retry with more obvious flaw. Third consecutive failure: mark topic for standard review (not EVALUATE) — don't re-teach from scratch, the student knows the concept, just needs practice identifying flaws.

**EVALUATE Scoring Model (FR132):**

| Scenario | Standard Quality | EVALUATE Quality | Rationale |
|----------|-----------------|-----------------|-----------|
| Correct identification | 4-5 | 4-5 | Full understanding demonstrated |
| Partial identification | 2-3 | 3 | Analytical skill developing |
| Failed to identify flaw | 0-1 | 2-3 | Missing subtle flaw ≠ no knowledge |
| "I don't know" response | 0 | 1 | Honest uncertainty, minimal penalty |

**EVALUATE Difficulty Calibration:**

| Rung | Flaw Type | Example |
|------|-----------|---------|
| 1 | Obvious factual error | "Water boils at 50°C" |
| 2 | Clear logical mistake | Reversing cause and effect |
| 3 | Subtle misconception | Conflating correlation with causation |
| 4 | Plausible-but-wrong reasoning | Applying a rule correctly to the wrong domain |

**Persona Framing:**

| Persona | Opening Frame | Tone |
|---|---|---|
| Teen (11-15) | "I think this explanation is right — can you prove me wrong?" | Playful/competitive |
| Learner (16+) | "Here's a common explanation — what's the flaw in this reasoning?" | Academic/collaborative |

**LLM Prompt Requirements:**
The EVALUATE prompt template needs access to: (a) the topic's key concepts, (b) common misconceptions for that topic, (c) the student's current mastery level, (d) the current EVALUATE difficulty rung. The prompt must generate a plausible-but-wrong explanation calibrated to difficulty — too obviously wrong is useless, too subtle is frustrating.

### Analogy Domain Preferences — Multiverse of Analogies (Epic 3 extension — MVP)

- FR134: Analogy domain selection — student can choose from 6 curated analogy domains per subject: cooking, sports, building, music, nature, gaming. Stored in `teachingPreferences.analogyDomain` (nullable — null means no analogy preference, direct explanation only). Changeable anytime from subject settings.
- FR135: System prompt injection — when `analogyDomain` is set, `buildSystemPrompt()` appends: "When explaining abstract or unfamiliar concepts, prefer analogies from the domain of [domain]. Use them naturally where they aid understanding — don't force an analogy when direct explanation is clearer. Adapt analogy complexity to the learner's level." Prompt hash naturally invalidates cached prompts when domain changes.
- FR136: Onboarding integration — optional "How do you like things explained?" step during subject onboarding interview. Presents 6 domain options as icons/labels. Skippable — defaults to null (no analogy preference).
- FR137: Preference persistence and immediacy — analogy domain preference takes effect on the next exchange within the same session (no session restart required). `ExchangeContext` is rebuilt per exchange, so preference changes are picked up immediately.

### Feynman Stage — Teach-Back Via Voice (Epic 3 extension — MVP)

- FR138: TEACH_BACK verification type — 9th verification type. AI plays a "clueless but interested student." User explains the concept verbally. LLM analyzes transcript for completeness, accuracy, and clarity, then asks a clarifying question about the weakest area. Targets Bloom's Level 6 (Create). Only triggers on topics with moderate-to-strong retention (student must have learned the concept before teaching it back). Nothing solidifies knowledge like teaching it — this is the Feynman Technique at scale.
- FR139: On-device speech-to-text — `expo-speech-recognition` wrapping iOS/Android native recognition. No cloud dependency, no additional billing, no network latency. Transcript appears as a user message in MessageThread. Audio permissions handled via standard Expo permission flow.
- FR140: Structured assessment rubric — LLM outputs two-part response: (1) conversational "confused student" follow-up question (visible to student in MessageThread), (2) hidden JSON assessment stored in `session_events.structured_assessment` JSONB: `{ completeness: 0-5, accuracy: 0-5, clarity: 0-5, overallQuality: 0-5, weakestArea: string, gapIdentified: string }`. `overallQuality` maps directly to SM-2 quality input. Accuracy weighted highest (wrong > incomplete > unclear). Coaching card precomputation and parent dashboard consume the structured data downstream. Same two-output pattern as EVALUATE — student sees natural interaction, system gets machine-readable scoring.
- FR141: Voice response (TTS) — `expo-speech` (built into Expo, no install) reads AI response aloud after SSE streaming completes (Option A: wait for complete response, then speak). Text streams visually into chat during generation, then audio plays once complete. No cloud dependency, no cost.
- FR142: Voice toggle — session-level toggle to mute AI voice output. Not a persistent preference — same student may want voice at home, text at school. TEACH_BACK defaults to voice-on. Toggle visible in session header.
- FR143: Recording UI — microphone button in chat input area, waveform/pulse animation while speaking, transcript preview before sending. "Tap to speak" affordance. Tap again to stop recording.

**TEACH_BACK Scoring Model (FR140):**

| Dimension | Weight | 5 (Excellent) | 3 (Adequate) | 1 (Poor) | 0 (Missing) |
|-----------|--------|---------------|---------------|----------|-------------|
| Completeness | 30% | All key concepts covered | Most concepts, minor gaps | Major concepts missing | No meaningful content |
| Accuracy | 50% | Everything correct | Minor inaccuracies | Significant errors | Fundamentally wrong |
| Clarity | 20% | Beginner would understand | Some confusing parts | Hard to follow | Incoherent |

**TEACH_BACK Prompt Template (FR138):**

> "You are a curious but clueless student. The user is trying to teach you [topic]. Analyze their explanation for: completeness (did they cover the key concepts?), accuracy (did they state anything incorrectly?), and clarity (would a beginner understand this?). Ask one clarifying question about the weakest area. Stay in character — be genuinely curious, not evaluative."

### Full Voice Mode (Epic 8 — v1.1)

- FR144: Voice-first session mode — any learning, homework, or interleaved session can be conducted via voice. Student speaks questions/answers, AI responds with voice. Toggle at session start: "Text mode" or "Voice mode." Session type is orthogonal to input mode.
- FR145: TTS playback — Option A at launch: wait for complete SSE response, then play via `expo-speech`. Sentence-buffered Option B (accumulate tokens to sentence boundary, speak incrementally) documented as upgrade path — only built if user feedback shows delay matters. Sentence boundary detection is non-trivial (abbreviations, decimals, URLs, code) and not worth solving upfront.
- FR146: Voice integration for Language SPEAK/LISTEN verification types — see Epic 6 (Language Learning). Epic 6 SPEAK/LISTEN stories depend on Epic 8.1-8.2 (voice infrastructure) completing first.
- FR147: Voice session controls — pause/resume recording, replay last AI response, speed control for TTS playback (0.75x, 1x, 1.25x), interrupt AI mid-speech to respond.
- FR148: Voice activity detection — OPTIONAL/STRETCH. Auto-detect silence to end recording. Manual tap-to-stop (from Feynman Stage) is the reliable default. VAD has false-positive issues in classrooms, with thinking pauses, and across devices. Only build if user feedback demands it.
- FR149: Voice accessibility — screen reader (VoiceOver/TalkBack) coexistence with app TTS. Hard problem: both compete for audio channel. Requires spike/research before implementation. Options: detect active screen reader and defer to it (disable app TTS, rely on VoiceOver reading transcript), or implement audio ducking. Visual transcript always visible for deaf/HoH users.

### Subscription Management

> **Canonical Source:** Full pricing specification in `docs/Legacy/eduagent-pricing-specification.md`

**Subscription Tiers:**

| Tier | Monthly | Annual | Users | Questions/Month | Top-Up Price |
|------|---------|--------|-------|-----------------|--------------|
| **Free** | €0 | - | 1 | 50* | N/A |
| **Plus** | €18.99 | €169 (26% off) | 1 | 500 | €10/500 |
| **Family** | €28.99 | €259 (26% off) | Up to 4 | 1,500 shared | €5/500 |
| **Pro** | €48.99 | €439 (25% off) | Up to 6 | 3,000 shared | €5/500 |

*\*Free tier includes first-week boost: 10 questions/day for days 1-7*

**Free Tier:**
- Unlimited onboarding (interview + curriculum generation)
- 50 questions/month with first-week boost (10/day for days 1-7)
- Full feature access (no feature gating, only usage limits)
- Progress tracking and Learning Book (progress saved forever)
- Top-ups not available (must upgrade)
- Purpose: Ensure "aha moment" before friction, create upgrade pressure
- Est. LLM cost: ~€0.25/month per free user

**Plus Tier:**
- 500 questions/month for individual learner
- Full feature access
- Top-up credits: €10/500 questions
- Target: Individual serious learners

**Family Tier:**
- 1,500 questions/month SHARED across all users
- Up to 4 learner profiles
- Top-up credits: €5/500 questions (50% cheaper than Plus)
- Anyone can be invited (no household verification)
- Target: Parents with children, households learning together

**Pro Tier:**
- 3,000 questions/month SHARED across all users
- Up to 6 learner profiles
- Top-up credits: €5/500 questions
- Fair use soft limit: ~500/user/month before review
- Target: Power users, large families, heavy exam prep

**Shared Pool Mechanics (Family/Pro):**
- All users draw from same monthly allocation
- Creates natural household coordination
- When pool exhausted: purchase top-ups or upgrade tier
- Example: Family (1,500/mo) with 4 users averaging 375 each

**Top-Up Credits:**
- Purchase anytime to extend monthly allocation
- Expiration: 12 months from purchase date
- Usage order: Monthly quota first, then top-ups (FIFO)
- Rollover: Monthly quota does NOT roll over; top-ups DO (until expiry)
- Notifications: Month 6, 8, 10, 12 (early), 12 (late) expiry reminders

**Downgrade Policy:**
- All progress preserved when downgrading tiers (Pro → Family → Plus → Free)
- Learning Book, curricula, XP, summaries remain fully accessible
- Only usage limits change (questions/month)
- No data archived or deleted on downgrade
- Unused top-ups remain valid until expiration (can be used after re-upgrade)
- Rationale: Progress is switching cost moat; preserved data incentivizes re-upgrade

**Cancellation Policy:**
- Users can cancel subscription at any time
- Access continues until end of billing period
- Progress preserved indefinitely (reverts to Free tier limits)
- Account deletion available separately (GDPR right to erasure)

**Payment Failure Handling:**
- **3-day grace period** after failed payment
- Automatic payment retry on Day 1, Day 2, Day 3
- Email notification sent on each failed attempt
- After Day 3 without successful payment → Downgrade to Free tier (progress preserved)
- User can upgrade again anytime with valid payment method

**Trial Strategy (Reverse Trial with Soft Landing):**

| Period | Access Level | Daily Limit | Purpose |
|--------|--------------|-------------|---------|
| Days 1-14 | Full Plus access | Up to 500/month | Experience full value |
| Days 15-28 | Extended trial | 15 questions/day | Soft landing (friction without cliff) |
| Day 29+ | Free tier | ~5/day (50/month) | Standard free limits |

**Soft Landing Messaging:**
- Day 15: "Your trial ended, but we're giving you 15 questions/day for 2 more weeks"
- Day 21: "1 week left of extended access — upgrade to keep learning without limits"
- Day 28: "Tomorrow you'll move to Free (50 questions/month). Upgrade now?"

**Trial Mechanics:**
- Credit card required for trial (2.7x higher conversion)
- Trial messaging: Use "Try for €0" (outperforms "Free trial")
- Trial expires at **end of day** (midnight user's timezone), not mid-session
- If user is mid-session when period ends → session completes, then next period limits apply
- Countdown notifications: "3 days left", "1 day left", "Last day of trial"

**Question Counting Rules:**
- **What counts:** Each user message that triggers an AI response
- **What doesn't count:** System messages, curriculum generation (unlimited), onboarding interview (unlimited)
- **Counter reset:** Monthly questions reset on billing cycle date
- **Display:** Show remaining questions in app header/dashboard

**Usage Limit Enforcement:**
- **Soft warning** at 80% of monthly ceiling: "You're approaching your monthly limit"
- **Hard warning** at 95%: "X questions remaining this month"
- At ceiling: Current AI exchange completes fully, then upgrade/top-up prompt shown
- Never interrupts mid-AI-response
- Ceiling resets on billing cycle date

**Upgrade Triggers:**

| From | To | Trigger & Message |
|------|-----|-------------------|
| Free | Plus | User hits 50/month cap: "Upgrade for 10x more questions" |
| Plus | Family | User wants to add family member: "Add up to 3 more people, 3x the questions" |
| Plus | Family | User buys 3+ top-ups: "You've spent €30 on top-ups. Family tier saves you money" |
| Family | Pro | Need 5-6 users: "Need more seats? Pro includes up to 6 users" |
| Family | Pro | Running out of questions: "Double your questions with Pro" |

- FR108: Users can start 14-day free trial with full access
- FR109: Users can have progress saved during and after trial
- FR110: Users can receive trial expiry warnings (3 days before)
- FR111: Users can upgrade to premium subscription (tiered: Standard/Plus/Pro)
- FR112: Users can cancel subscription at any time
- FR113: Users can view subscription status and renewal date
- FR114: Users can access BYOK waitlist (email capture for future feature)
- FR115: Users can choose monthly or yearly billing (with annual discount)
- FR116: Users can add additional profiles to family account (per-profile pricing)
- FR117: Users can view token usage against tier ceiling

**BYOK (Bring Your Own Key) - Future Feature:**

BYOK allows power users who already have AI subscriptions (Claude Pro, ChatGPT Plus) to use their own API keys, reducing their EduAgent cost.

**MVP:**
- BYOK waitlist capture (email + preferred provider)
- Track waitlist signups as demand signal
- If <100 signups by v1.0 launch → defer BYOK indefinitely

**v1.1 (if demand validated):**
- Claude API key support only (simplest implementation)
- Reduced pricing tier for BYOK users (methodology + infrastructure only)
- Token usage dashboard with cost estimates
- User responsible for their own API costs

**v1.2+ (if v1.1 successful):**
- OpenAI API key support
- Gemini API key support
- Per-model prompt optimization (different providers need tuned prompts)

**Implementation Notes:**
- LLM abstraction layer required (Architecture phase decision)
- Token logging from MVP validates cost estimates before BYOK commitment
- User bill shock prevention: usage alerts at 50%, 80%, 100% of estimated monthly cost

#<<< MISSING: Functional requirements for admin/support tools, moderation workflows, analytics dashboards, A/B testing framework, customer support tooling >>>

*Future: Create Admin & Support Tools auxiliary document.*

---

## Non-Functional Requirements

### Performance

| Requirement | Target | Measurement Context |
|-------------|--------|---------------------|
| API Response Time | <200ms (p95) | Excluding LLM calls |
| LLM First Token | <2s | Streaming response start |
| App Cold Start | <3s | On modern devices (iPhone 12+, Android 2021+) |
| WebSocket Latency | <100ms | Real-time chat feel |
| Database Query Time | <100ms (p95) | Simple queries (profile, progress) |
| Page Load Time | <2s | Initial app load |

### Reliability

| Requirement | Target | Notes |
|-------------|--------|-------|
| System Uptime | 99.5% | Excluding planned maintenance |
| Data Durability | 99.99% | Managed database service |
| AI Provider Availability | Multi-provider fallback | Automatic failover between providers |
| Session Recovery | Automatic reconnection | Restore state after temporary disconnection |
| Backup Frequency | Daily automated | Automated backup retention |

### Security

| Requirement | Implementation |
|-------------|---------------|
| Authentication | Token-based authentication with secure session management |
| Data Encryption (Transit) | Industry-standard encryption for all API calls |
| Data Encryption (Rest) | Strong encryption at rest for sensitive data |
| API Rate Limiting | 100 requests/minute per user |
| Input Validation | All user inputs validated and sanitized |
| SQL Injection Prevention | Parameterized queries and input validation |
| XSS Prevention | Content security policies and output encoding |
| Session Management | Automatic session expiration with secure refresh mechanism |

### Privacy & Compliance

| Requirement | Implementation |
|-------------|---------------|
| GDPR Compliance | Account deletion, data export, parental consent |
| Age Verification | 11+ minimum, birthdate validation |
| Parental Consent | Required for ages 11-15 in EU |
| Data Retention | User data deleted within 30 days of account deletion request |
| Cookie Consent | EU cookie banner (web only) |
| Privacy Policy | Available during registration |
| Terms of Service | Acceptance required during registration |

### Scalability

| Phase | User Count | Infrastructure Scaling | LLM Cost/User/Month |
|-------|------------|------------------------|---------------------|
| MVP | 1-1,000 | Managed services with auto-scaling | €0.50-2.00 (model routing) |
| Growth | 1,000-50,000 | Scaled managed services | €0.50-1.50 (optimized routing) |
| Scale | 50,000+ | Enterprise cloud infrastructure | €0.30-1.00 (volume + caching) |

**AI Cost Model (per question, 3,600 input + 1,500 output tokens):**

| Model Tier | Cost/Question | Use Case |
|------------|---------------|----------|
| Gemini 1.5 Flash | €0.0007 | Simple Q&A, drills |
| GPT-4o-mini | €0.0013 | Standard teaching |
| GPT-4o | €0.022 | Complex reasoning |
| Claude 3.5 Sonnet | €0.030 | Nuanced explanations |

**Cost Optimization Strategy:**
- Multi-model routing based on query complexity
- Aggressive prompt caching (50-90% input cost reduction)
- Target: €0.001-0.005/question average with intelligent routing

### Accessibility

| Requirement | Target | Standard |
|-------------|--------|----------|
| WCAG Compliance | Level AA | WCAG 2.1 |
| Keyboard Navigation | Full support | All interactive elements |
| Screen Reader Support | Tested on iOS VoiceOver, Android TalkBack | ARIA labels |
| Color Contrast | 4.5:1 minimum | Text and UI elements |
| Font Sizing | Supports system font scaling | Up to 200% |

#<<< MISSING: Detailed screen reader testing checklist, keyboard navigation map, ARIA attribute specifications, accessibility audit results >>>

*Future: Covered in Accessibility Testing Plan auxiliary document.*

### Localization

| Requirement | MVP | Post-MVP |
|-------------|-----|----------|
| UI Languages | English + German | Spanish, French, Polish |
| Learning Languages | ANY (via LLM) | ANY (via LLM) |
| Time Zones | UTC + user local | UTC + user local |
| Currency | EUR | EUR, USD, GBP (based on region) |

### Monitoring & Observability

| Requirement | Capability | Metrics |
|-------------|------------|---------|
| Error Tracking | Application error monitoring | Error rates, stack traces, user impact |
| Analytics | User behavior analytics | User events, funnels, retention cohorts |
| Performance Monitoring | System performance tracking | CPU, memory, response times, throughput |
| AI Usage Tracking | AI model usage logging | Token usage, cost per session, provider distribution |
| Uptime Monitoring | Service availability monitoring | Uptime percentage, response time, incident detection |

#<<< MISSING: Detailed monitoring dashboard specifications, alerting thresholds, incident response procedures, SLA definitions >>>

*Future: Create Monitoring & Operations Runbook auxiliary document.*

---

## Appendix

*Epic-level planning content (7 epics with representative stories and success indicators) has been moved to `docs/analysis/epics-inputs.md` for use during Epics & Stories phase.*

---

**Document Status:** BMAD v1.0 - PRD Complete
**Completed:**
- Phase 1 cleanup (23 markers processed)
- Phase 2 gap analysis (38 gaps addressed, research-based features added, legacy PRD cross-referenced)
- Added: Verification Types taxonomy, Tiered Tangent Handling, FSI Time Estimates, Step-Level Feedback, Adaptive Difficulty, Interleaved Practice, Learning Science Explanations, Chunk-Based Language Learning, Pattern Noticing Prompts
- Technical docs cross-reference: BYOK feature roadmap, Topic Status Model (orthogonal retention + struggle dimensions), worked example mastery thresholds
- Pricing finalized: 4-tier model (Free/Plus/Family/Pro), reverse trial, top-up credits, shared pools
**Next Steps:**
1. Stakeholder review
2. Proceed to Architecture phase
3. Create auxiliary docs as needed (listed in MISSING notes)
