---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
inputDocuments:
  - 'docs/prd.md'
  - 'docs/analysis/product-brief-EduAgent-2025-12-11.md'
  - 'docs/analysis/research/market-ai-tutoring-research-2024-12-11.md'
  - 'docs/analysis/epics-inputs.md'
  - 'docs/FB-Run023-parents.yaml'
  - 'docs/FB-Run023-learner.yaml'
  - 'docs/FB-Run023-languages.yaml'
documentCounts:
  briefs: 1
  research: 1
  brainstorming: 0
  projectDocs: 2
  feedback: 3
workflowType: 'ux-design'
lastStep: 14
status: 'complete'
project_name: 'EduAgent'
user_name: 'Zuzka'
date: '2026-02-14'
---

# UX Design Specification EduAgent

**Author:** Zuzka
**Date:** 2026-02-14

---

## Project Understanding

### Product Vision

EduAgent is an AI-powered personal tutoring platform targeting children aged 11-17 and adult learners. It transforms homework help into genuine understanding through four pillars: Memory (spaced repetition, knowledge retention), Structure (curriculum alignment, learning paths), Verification (understanding checks, not answer-giving), and Relationship (adaptive personality, emotional awareness).

### Target User Segments (Priority Order)

1. **Parents (Score 8.2, "Caregiver")** — Primary customer/buyer. Pain: homework battles drain 6.2 hours/week. Killer feature: Homework Integrity Mode. Willing to pay for verified learning.
2. **Eager Learners (Score 7.5, "Sage")** — Self-motivated learners aged 14-17+. Pain: video courses are passive, knowledge doesn't stick. Want mastery, not completion.
3. **Language Learners (Score 7.0, "Explorer")** — Conversational practice seekers. Pain: can complete Duolingo but can't actually speak. Want real conversation practice.

### Primary UX Challenge: The Homework-to-Learning Bridge

The core UX challenge is that **the child is the user but the parent is the customer.** Children don't choose EduAgent — parents impose it as a ChatGPT alternative. This is a **forced adoption product** for the child segment.

The child's default preference is ChatGPT: instant answers, no teaching, no oversight, no friction. EduAgent must survive this comparison not by being "better for learning" (children don't value this) but by being **fast enough that it's not worth switching.**

### Key UX Design Decisions

| # | Decision | Detail |
|---|----------|--------|
| 1 | **Homework Fast Lane** | Separate, stripped-down UI within the app. No gamification, no curriculum clutter. Optimized for speed. |
| 2 | **Camera Input in MVP** | Non-negotiable for homework mode. Children photograph worksheets/textbook pages. PRD scope change from v1.1 to MVP. |
| 3 | **Forced Adoption Lens** | Design assumes child didn't choose the app. Goal: don't be hated, then occasionally be genuinely useful. |
| 4 | **2-3 Question Limit** | Maximum 2-3 Socratic questions before switching approach. Never interrogate a stuck child. |
| 5 | **Parallel Example Pattern** | When child is stuck: demonstrate the method on a *different but similar* problem, then return to homework. Preserves integrity (homework answer not revealed) while preventing frustration. |
| 6 | **Invisible Bridge to Learning** | After homework, AI plants seeds: "You struggled with X — want me to explain the pattern?" No pressure, no lecture. |
| 7 | **Speed is Survival** | If EduAgent is slower than struggling alone, child will cheat around it. Speed is the only metric that matters for child retention. |
| 8 | **Parent/Teacher Preview at Setup** | Quick trust-building demo before handing phone to child. Same demo serves both parents and teachers. |
| 9 | **Teacher Channel (Light)** | "Teacher recommended" onboarding path. Teachers may not universally embrace AI tools, but the channel costs nothing to maintain and provides social normalization for children who receive the recommendation. |

### Design Opportunities

1. **Dual-mode teaching** — "Serious Learner" (mastery gates) vs "Casual Explorer" (no gates) allows the same app to serve motivated and reluctant users.
2. **Memory as differentiator** — EduAgent remembers what ChatGPT forgets. Cross-session continuity ("You made this same mistake last week") is genuine value even for reluctant users.
3. **Reverse trial (14 days full + 14 days soft landing)** — Lets the homework loop establish before asking for payment.
4. **Topic Status Model** — Retention (Strong/Fading/Weak/Forgotten) + Struggle (Normal/Needs Deepening/Blocked) as orthogonal dimensions creates nuanced, actionable progress visibility for parents.

### Parked: PRD Updates Needed

_To be applied after UX Design workflow completes:_

| # | Change | PRD Impact |
|---|--------|------------|
| 1 | Camera input → MVP | Move from v1.1 to MVP scope |
| 2 | Homework Fast Lane | New UI mode — separate, stripped-down homework experience |
| 3 | Parallel Example Pattern | New FR: max 2-3 Socratic questions, then demonstrate on different problem |
| 4 | ~~Fast / Full test modes~~ | ~~New FR: two test prep modes~~ — **DEFERRED v2.0** (Party Mode review: one test prep mode sufficient for MVP) |
| 5 | Verification depth levels | Enhance FR72: recall → explain → transfer (3 levels) |
| 6 | ~~Knowledge connections~~ | ~~New FR: show building-block relationships between topics~~ — **DEFERRED v2.0** (Party Mode review: graph visualization not needed to prove homework flow) |
| 7 | Retention check in homework loop | New FR: quick check on fading topics before starting new homework |
| 8 | Teacher-recommended onboarding | New onboarding path alongside parent setup |
| 9 | Homework Integrity as profile-level | Socratic method applies to child profile regardless of entry point, not per-mode |
| 10 | ~~Voice input architecture-ready~~ | ~~Design for voice input in architecture~~ — **DEFERRED v2.0** (Party Mode review: don't pay architecture cost until homework flow proven) |
| 11 | Freeform "Just ask something" mode | Third entry point — **DEFERRED v1.1** (Party Mode review: two entry points for children sufficient for MVP. Freeform handled conversationally within homework/practice. Add if usage data shows demand.) |
| 12 | No-homework day coaching card | Adaptive opening for children when no homework context detected |

## Core User Experience

### Defining Experience: Coach, Not Tool

EduAgent is a learning coach, not a Q&A chatbot. Every time the user opens the app, the AI has already done the thinking — it knows what's fading from memory, what's next in the learning path, and how much time the user probably has. The user's only job is to show up.

### The Core Learning Loop: Recall → Build → Apply → Close

Every learning session follows a structured rhythm — but this structure is the AI's internal coaching instinct, not a visible UI process. The user experiences natural conversation; the AI ensures pedagogical rigour underneath.

- **Recall**: Ask the user to retrieve something from memory before showing anything new. Retrieval is what builds retention — and it's the step every competitor skips.
- **Build**: Introduce something new, connected to existing knowledge. "This works like the concept you nailed last week, with one twist."
- **Apply**: A scenario or problem — not multiple choice. Use it, don't just recognize it.
- **Close**: Coach reports what stuck, what needs work, and when to come back. "Solid. I'll check in 4 days."

The loop adapts to context: fully structured in practice sessions, fast and light as a homework warmup (skippable), or subtly woven into freeform conversation. The user never sees "Step 1" or "Step 2."

### Three Entry Points, One Coach

The app has three entry points into the same adaptive AI coach — not three separate modes. The user never sees mode labels or switches. The AI transitions between approaches conversationally.

**For child profiles:**

| Entry Point | Opening | AI Approach |
|-------------|---------|-------------|
| **Homework Help** | Camera / Type (Voice v1.1) | Fastest path: 2-3 Socratic questions → Parallel Example → guided to answer. Skippable 30-second recall warmup. |
| **Practice for a Test** | Coaching card with recall challenge | Recall-heavy, spaced repetition, Fast or Full depth. |
| **Just Ask Something** | Open conversation | Full Socratic method — ironically the longest path to any answer. Self-policing integrity. |

**For eager learner profiles:**

| Entry Point | Opening | AI Approach |
|-------------|---------|-------------|
| **Coaching Card** (default) | AI recommendation: "Here's what we're doing today" | Full Recall → Build → Apply → Close loop. |
| **Subject Switcher** | Horizontal strip of active subjects with retention status | Tap any subject → that subject's coaching recommendation. |
| **"I have something else in mind"** | Open conversation | Curiosity-driven freeform with subtle coaching woven in. |

**For parent profiles:**
- Dashboard: subjects, retention scores, time spent, verified understanding. Glanceable in 5 seconds.

### Homework Integrity: Profile-Level, Not Mode-Level

Homework Integrity Mode applies to the **child profile**, not to a specific entry point. A child profile ALWAYS gets Socratic coaching regardless of how they entered. This makes the system watertight by design:

- Homework Help → fastest guided path (Parallel Example Pattern)
- Just Ask Something → full Socratic (longer path = natural deterrent against gaming)
- No entry point gives direct answers for a child profile

### Homework Input Methods

When a child selects homework help:
- **Camera** — photograph worksheet, textbook page (primary for math, science, visual problems)
- **Type** — paste from digital assignment or type a question
- **Voice** (v1.1) — describe the problem verbally. Architecture designed to support this from day one; ships post-MVP.

The AI auto-detects the subject from the input — no subject selection required.

### Adaptive Opening: No-Homework Days

When no homework context is detected (weekends, holidays, summer), the child's opening adapts:

> "No homework today? You've got 2 things fading — want to do a 3-minute refresh?"
>
> **[Sure, 3 minutes]** / **[Just ask something]**

Natural, low-pressure entry into retention practice without forcing "learning" language.

### Eager Learner: Subject Management

The coaching card is the default opening, but the learner's active subjects are always accessible as a compact horizontal strip beneath the card:

```
┌─────────────────────────────────────────────┐
│  "Electromagnetic forces are fading.        │
│   Let's spend 90 seconds."                  │
│                              [Let's go]     │
│                   [I have something else]   │
└─────────────────────────────────────────────┘

 [Physics ██████░░]  [Chemistry ████░░░░]  [Spanish ███████░]
      Fading              Weak              Strong
```

Tap any subject → jump to that subject's coaching recommendation. The AI still leads, but the learner chose the domain.

### Platform Strategy

- Expo (React Native): iOS, Android, Web from single codebase
- Touch-first mobile design, responsive web as secondary
- Camera integration required for MVP (homework photo input)
- Voice input: architecture-ready from MVP, ships v1.1
- Offline: v2.0 consideration (cache recent topics for review without connection)

### Effortless Interactions

- Child: Open → tap "Homework help" → camera → help. No subject selection, no navigation.
- Eager Learner: Open → coaching card → go. Zero decisions. Subject switcher available but never required.
- Parent: Open → dashboard → know if it's working. 5-second glance.

### Critical Success Moments

1. **First homework response** (under 10 seconds) — one chance to prove value
2. **First Parallel Example** ("let me show you on a similar one") — the "oh, this actually helps" moment
3. **First recall success** — child remembers something from last session, feels competent
4. **Parent's first dashboard check** — proof of learning visible in 5 seconds
5. **First "enough for today" close** — trust in the coach established
6. **First improved test result** — forced adoption converts to genuine buy-in

### Experience Principles

1. **Coach, not tool** — The AI leads with a plan, talks first, knows what's next.
2. **Recall before reveal** — Always ask what they remember first. The session creates retention.
3. **Speed is respect** — Never waste the user's time.
4. **One card, no decisions** — Default path requires zero thought. Complexity available, never imposed.
5. **Invisible teaching** — The child barely notices they're learning. Modes are invisible architecture.
6. **Know when to stop** — Tell users when enough is enough. No dark patterns.
7. **Teen-proof language** — No educational jargon in child-facing UI. Frame everything as utility.

## Desired Emotional Response

### Primary Emotional Goals by Segment

| Segment | Primary Emotion | What They Feel | What They Say |
|---------|----------------|----------------|---------------|
| **Child** | **Autonomy** | "This is mine. I chose to open it." | "It's actually faster for homework" (looking smart, not obedient) |
| **Eager Learner** | **Intellectual respect** | "This thing takes me seriously. It sees I'm capable." | "It adapted to me in a way that felt almost uncanny" |
| **Language Learner** | **Bravery** | "I just said something real in another language" | "I had an actual conversation, not an exercise" |
| **Parent** | **Relief through trust** | "It's working. I can see it in 5 seconds." | "My kid's grades went up and we stopped fighting about homework" |

### The Emotion That Matters Most: Returning on Day 15

The hardest emotional problem isn't the first session — it's the 15th, when novelty has worn off.

- **Child**: Returns because it's genuinely the fastest path to getting homework done. Not gamification, not streaks — pure utility.
- **Eager Learner**: Returns because skipping a few days creates curiosity, not guilt. "I wonder what it has for me today." The coaching card is a pull, not a push.
- **Language Learner**: Returns because the last conversation felt real and they want another one.
- **Parent**: Returns because the signal keeps proving accurate against real-world results — grades, confidence, fewer homework battles.

### The Lock-In Emotion: "Wait, I Actually Remember This"

The genuine surprise of knowing something you didn't used to know. Not streaks, not points, not badges. The moment the learner retrieves knowledge they assumed they'd forgotten — that's the emotional moment that makes EduAgent irreplaceable. This is the emotional expression of "making it STICK."

Competitors fail here emotionally: Duolingo feels productive in the moment but hollow over time because people sense it's not working. EduAgent must deliver the opposite — genuine proof of retained knowledge that surprises even the learner.

### Emotional Journey Mapping

| Stage | Child | Eager Learner | Parent |
|-------|-------|---------------|--------|
| **First open** | Skeptical — "another app mom installed" | Curious — "let's see if this is different" | Hopeful — "please let this work" |
| **First success** | Surprised — "that was actually fast" | Impressed — "it didn't talk down to me" | Relieved — "they used it without fighting" |
| **Day 15** | Habitual — "this is just how I do homework" | Engaged — "I wonder what it has today" | Confident — "the signal matches reality" |
| **Day 60** | Ownership — "this is my thing" | Loyalty — "this is my mentor" | Trust — "worth every cent" |
| **Failure moment** | "Not yet" not "wrong" | "Let's try a harder angle" | "The app flagged the gap early" |

### Micro-Emotions at Critical Interactions

**When the child gets something wrong:**
- Feel "not yet" — never "wrong." The AI's response to incorrect answers is the most emotionally loaded moment in the app. One hint of judgment destroys trust.

**When the AI doesn't understand the homework photo:**
- Feel like a tech hiccup, not the child's fault. "Let me try again — can you retake with better lighting?" Never "I couldn't read your input."

**When a topic is marked Blocked:**
- Feel like "this is a hard one, let's come back to it" — never "you failed." The child should never feel defective.

**When the eager learner exceeds expectations:**
- The AI acknowledges it: "You're picking this up faster than expected — let me skip ahead." The feeling of being seen as capable is addictive.

**When the language learner makes a mistake:**
- Feel safe, not embarrassed. Mistakes are reframed as progress: "That's a common pattern — native speakers mix this up too."

**When hitting the question limit (Free tier):**
- Feel "I want more" not "I'm locked out." Desire, not frustration.

**When the reverse trial ends:**
- Feel "I'd miss this" not "I'm losing something." Natural loss aversion, not manipulative.

### Emotions to Avoid (Design Guardrails)

| Avoid This | Because | Design Implication |
|------------|---------|-------------------|
| **Surveillance** | Child must feel autonomy, not monitoring | Transparent but not intrusive: mentioned once at setup honestly, then quiet. Never surface "your parent viewed your progress" in child UI. |
| **Guilt** | "You haven't practiced today" kills intrinsic motivation | No streak-shame, no guilt notifications |
| **Patronizing** | Eager learners leave instantly if talked down to | AI tone = sharp colleague, not elementary teacher. Adapts to age and capability. |
| **Confusion** | Parent must trust in 5 seconds | Green/yellow/red signals, one-sentence summaries, no charts to interpret |
| **Judgment** | One hint of "you're wrong" and the child is gone | Always "not yet" framing, never evaluative language |
| **Obligation** | "You should practice" feels like school | Pull mechanics (curiosity), never push (guilt) |
| **Deception** | Hiding parent oversight is worse than showing it | Be honest about what parents can see, then don't make it intrusive during daily use |

### Emotional Design Principles

1. **Autonomy over compliance** — The app feels like theirs, not something installed on them. Parent oversight is transparent (mentioned at setup) but never intrusive during daily use.
2. **Respect over encouragement** — Treat users as capable. Skip ahead when they're ready. Acknowledge when they exceed expectations. Sharp colleague tone, not cheerleader.
3. **"Not yet" over "wrong"** — Every failure is reframed as incomplete progress, never as a negative judgment.
4. **Curiosity over guilt** — Return triggers are pull-based ("I wonder what it has today") not push-based ("you haven't practiced").
5. **Proof over promise** — The "I actually remember this" moment is the only emotional argument that matters long-term. Design for genuine surprise at retained knowledge.
6. **Glanceable trust** — Parent experience = checking the weather. One signal, one sentence, move on.

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**Snapchat** — Camera-first opening (no feed, no menu), minimal gesture-based UI, private/personal feeling. Teens learn it through muscle memory. Transferable: Homework Fast Lane opens to camera like Snapchat opens to camera; swipe navigation between entry points; the feeling of "this is my space."

**TikTok** — Algorithm feels uncannily personal ("For You" page adapts to you). One piece of content at a time, full screen. Zero onboarding. Micro-format (15-60 seconds). Transferable: Coaching card = TikTok's "For You" (AI curates what's next); single-card focus; 90-second recall warmups; the "how did it know I needed this?" feeling.

**ChatGPT** — Conversational with zero learning curve. Type anything, get something back. Versatile without mode-switching. Fails at: no memory (starts blank), no plan (reactive), no structure (no recall/verification), doesn't tell you when to stop. Transferable: "Just ask something" entry point feels familiar; zero learning curve; BUT our AI talks first and remembers.

**Photomath** — Camera → instant math solution with visual step-by-step breakdown. Multiple solving methods shown. Fails at: gives direct answers (zero integrity), no retention, math only. Transferable: Camera → problem recognition UX flow; visual step-by-step presentation; EduAgent = "Photomath that actually makes you learn and works for every subject."

**Duolingo** — Micro-sessions (5 minutes feels achievable), visible progression (skill tree), placement onboarding, daily habit formation, playful tone. Fails at: hollow retention (users complete exercises but can't speak), guilt mechanics (streak-shame, passive-aggressive notifications), recognition over production (multiple choice, not producing language), patronizing at higher levels. Transferable: Micro-session format; placement/onboarding that meets you at your level; progression visibility for Learning Book.

**Cabuu** — Gesture-based vocabulary learning grounded in linguistic research ("Enactment Effect": things you physically DO are remembered better than things you read or see). Camera scan imports vocabulary from school textbooks. Connected to German school publishers (Klett, Cornelsen, Westermann). Targets parents but used by children — testimonial: "Even after many weeks, our daughter is still learning vocabulary without being told to." Transferable: Active/physical Apply step (not just text); camera scan as validated school-age input; curriculum alignment builds parent trust; the "learns without being told to" outcome is our Day 15 goal.

**Berlitz** — 145 years of immersive language method (target language only from day one). Present → Practice → Perform structured cycle. "Progress in speaking, not in streaks." Recently launched AI Speaking Tutor tied to lesson progression. Research: AI + human instruction is best; confidence-focused, not completion-focused. Transferable: Immersive language mode; Present → Practice → Perform validates our Recall → Build → Apply → Close; "confidence not streaks" messaging; structured AI practice (not open-ended) validates coaching card approach.

### Transferable UX Patterns

| From | Steal This | For This |
|------|-----------|----------|
| **Snapchat** | Camera-first, gesture nav, private feeling | Homework Fast Lane, teen-friendly UI, autonomy |
| **TikTok** | Algorithm knows you, one-at-a-time, micro-format | Coaching card, single focus, 90-sec sessions |
| **ChatGPT** | Conversational, zero learning curve, instant | "Just ask something," familiar interface |
| **Photomath** | Camera → solution, visual steps | Homework photo input, step-by-step presentation |
| **Duolingo** | Micro-sessions, placement onboarding, progression visibility | Session length, onboarding interview, Learning Book |
| **Cabuu** | Gesture/physical learning (Enactment Effect), camera scan, curriculum-aligned | Active Apply step, homework scan, school textbook connection |
| **Berlitz** | Immersive method, Present→Practice→Perform, "confidence not streaks" | Language mode immersion, validates learning loop, anti-streak positioning |

### Anti-Patterns to Avoid

| Anti-Pattern | Source | Why We Avoid |
|-------------|--------|-------------|
| **Infinite scroll / addictive loops** | TikTok | "Know when to stop." Coach tells you when enough is enough. |
| **Streaks / guilt mechanics** | Duolingo, Snapchat | Curiosity over guilt. No "you broke your streak" shame. |
| **Passive consumption** | TikTok, video courses | Our loop is active — recall and apply. Not watching. |
| **No memory / starts blank** | ChatGPT | Our core differentiator. We remember everything. |
| **Social comparison / leaderboards** | Gaming apps | Learning is personal, not competitive. |
| **Gamification overload** | Duolingo | Points and badges feel hollow. Real retention is the reward. |
| **Recognition over production** | Duolingo | Multiple choice lets you recognize, not produce. Our Apply step requires real output. |
| **Patronizing tone at higher levels** | Duolingo | Sharp colleague tone adapts to capability. Never talks down. |
| **Direct answer-giving** | Photomath, ChatGPT | Homework Integrity Mode. Guided understanding, never handed answers. |

### Design Inspiration Strategy

**Adopt directly:**
- Camera-first entry for homework (Snapchat + Photomath pattern)
- Single coaching card / one-at-a-time focus (TikTok pattern)
- Conversational interface for freeform mode (ChatGPT pattern)
- Micro-sessions of 90 seconds to 5 minutes (TikTok + Duolingo pattern)
- Immersive target-language mode for language learning (Berlitz method)

**Adapt for our context:**
- TikTok's algorithm → our coaching card AI (curates learning, not entertainment)
- Cabuu's gesture/physical learning → our Apply step should feel active and embodied where possible
- Duolingo's progression visibility → our Learning Book with knowledge connections, minus the gamification overload
- Berlitz's Present→Practice→Perform → our Recall→Build→Apply→Close (recall-first is our twist)

**Explicitly avoid:**
- Duolingo's guilt/streak model (conflicts with curiosity-over-guilt principle)
- ChatGPT's reactive/no-memory model (conflicts with coach-not-tool principle)
- Photomath's direct-answer model (conflicts with Homework Integrity Mode)
- Any visible gamification that feels hollow after day 3 (conflicts with proof-over-promise principle)

## Design System Foundation

### Design System Choice

**NativeWind v4 + React Native Reusables** — Tailwind CSS styling for React Native paired with shadcn/ui-style copy-paste components.

### Rationale for Selection

| Factor | Decision Driver |
|--------|----------------|
| **LLM-codability** | Tailwind CSS is the most LLM-friendly styling approach in the JS ecosystem. For a team using AI code generation, this compounds on every feature, every screen. |
| **Visual freedom** | EduAgent needs a teen-friendly look (Snapchat/TikTok-inspired), not Material Design corporate. Utility-first CSS gives maximum design flexibility. |
| **Three-persona theming** | CSS variables via `vars()` — define a variable set per persona (teen/adult/parent), swap at login. Components stay identical; only tokens change. |
| **Component ownership** | shadcn/ui copy-paste model means full code ownership. Critical when building highly custom components (coaching card, homework camera, Learning Book). |
| **Stability** | NativeWind v4 is stable and widely used (~400K weekly downloads). React Native Reusables has 7.9K stars and active growth. |
| **Expo compatibility** | Works with Expo; requires development builds (not Expo Go) for reliability. |

### Alternatives Considered

- **Tamagui** — best-in-class theming and web output, but RC-stage (v2.0.0-rc), steep learning curve, solo maintainer, and limited LLM training data. Not recommended for non-coding team.
- **Gluestack UI** — architecturally sound (built on NativeWind), but three major versions in two years, a 2025 supply chain attack on npm packages, and LLMs confuse it with NativeBase ~20-30% of the time.
- **Unistyles 3.0 / Uniwind** — architecturally superior (C++ engine, zero-rerender theming), but smaller LLM training footprint. Watch for post-MVP; by then LLM knowledge gap may have closed.

### Three-Persona Theme Architecture

```
teenTheme = vars({ '--color-primary': '...', '--color-background': '...', ... })
adultTheme = vars({ '--color-primary': '...', '--color-background': '...', ... })
parentTheme = vars({ '--color-primary': '...', '--color-background': '...', ... })
```

Components use semantic class names throughout (`bg-background`, `text-primary`, `border-accent`). When a teen logs in, apply teen variables. When a parent logs in, swap to parent variables. Same components, different visual personality.

### Semantic Design Token Set

_Every persona theme MUST define every token. No gaps, no fallbacks. This is the contract._

**Core Surface & Text:**

| Token | Purpose |
|-------|---------|
| `--color-background` | App background |
| `--color-surface` | Card/container background |
| `--color-surface-elevated` | Modals, sheets, coaching card |
| `--color-text-primary` | Main body text |
| `--color-text-secondary` | Supporting/muted text |
| `--color-text-inverse` | Text on accent backgrounds |

**Interactive:**

| Token | Purpose |
|-------|---------|
| `--color-primary` | Primary action (buttons, links) |
| `--color-primary-soft` | Primary tinted backgrounds |
| `--color-secondary` | Secondary actions |
| `--color-accent` | Highlights, active states |

**Semantic / Status:**

| Token | Purpose |
|-------|---------|
| `--color-success` | Correct answers, strong retention, "on track" |
| `--color-warning` | Fading retention, needs attention |
| `--color-danger` | Weak/forgotten, blocked topics |
| `--color-info` | Hints, tips, neutral notifications |

**Learning-Specific:**

| Token | Purpose |
|-------|---------|
| `--color-retention-strong` | Green signal (parent dashboard) |
| `--color-retention-fading` | Yellow signal |
| `--color-retention-weak` | Red signal |
| `--color-coaching-card` | Coaching card background |
| `--color-homework-lane` | Homework fast lane accent |

**Spacing & Shape:**

| Token | Purpose |
|-------|---------|
| `--radius-card` | Card corner radius |
| `--radius-button` | Button corner radius |
| `--radius-input` | Input field radius |
| `--spacing-card-padding` | Internal card padding |
| `--font-size-heading` | Primary headings |
| `--font-size-body` | Body text |
| `--font-size-caption` | Small/supporting text |

### Implementation Guardrails

- Pin NativeWind to latest 4.x (do NOT use v5 yet)
- Use development builds, not Expo Go
- Lock `package.json` to exact versions
- Test Expo SDK upgrades in a branch before merging
- Don't upgrade more than once every 3-6 months
- Watch Unistyles/Uniwind for post-MVP migration opportunity

## Defining Experience

### The One-Sentence Test

| Segment | How they describe it to a friend |
|---------|--------------------------------|
| **Child** | "It's faster than Googling and my teacher can't tell." |
| **Eager Learner** | "It remembers everything I've learned and tells me exactly what to work on next." |
| **Parent** | "I can see in 5 seconds that my kid is actually learning, not just copying." |

### The Defining Interaction

**"Open the app, and it already knows what you need."**

This is the experience that no competitor delivers. The AI has already done the thinking — it knows what's fading from memory, what's next in the learning path, what you struggled with last time. The user's only job is to show up.

### Competitive Triangle

> **ChatGPT answers but doesn't remember.**
> **Duolingo remembers but doesn't adapt.**
> **EduAgent remembers you and adapts to you.**

This triangle is both positioning and a feature evaluation framework. For every design and feature decision: *"Does this make the app more personal, more adaptive, more aware of the individual learner?"* If no, question whether it belongs.

### User Mental Models

**Child's mental model:** "I need to get my homework done. This app is what I use instead of ChatGPT because my parent/teacher said so." They expect: fast, no friction, don't waste my time. They tolerate: some guidance, if it's faster than struggling alone. They reject: lectures, interrogation, anything that feels slower than alternatives.

**Eager learner's mental model:** "I want to actually understand this subject. Most tools are passive or shallow." They expect: depth, continuity, respect for their intelligence. They tolerate: structure, being challenged. They reject: patronizing tone, starting from zero every session, gamification that feels hollow.

**Parent's mental model:** "Is this working? Is my child actually learning or just clicking buttons?" They expect: quick proof, clear signal. They tolerate: limited detail (don't need to understand the pedagogy). They reject: dashboards that require interpretation, uncertainty about whether the tool works.

### Success Criteria

| Criterion | Measure |
|-----------|---------|
| **Speed** | First homework help response under 10 seconds. Camera → understanding faster than Googling + copying. |
| **Proactivity** | Coaching card is relevant on first open — user feels "it knows me" within the first week. |
| **Retention proof** | Within 30 days, user experiences at least one "wait, I actually remember this" moment. |
| **Parent trust** | Parent can assess "is it working?" in under 5 seconds on any dashboard visit. |
| **Invisible teaching** | Child completes homework session without feeling they were "taught." Learning happened as a side effect of help. |

### Novel vs. Established Patterns

**Established patterns we adopt:**
- Conversational AI interface (ChatGPT-familiar)
- Camera input for problem capture (Photomath/Snapchat-familiar)
- Dashboard for oversight (universal pattern)
- Spaced repetition for retention (Anki/Duolingo-familiar)

**Novel combination that defines the product:**
- Proactive coaching (AI talks first, has a plan) layered on familiar conversational interface
- Integrity mode (guides without answering) that feels faster, not restrictive
- Cross-session memory that creates the "uncanny adaptation" feeling
- Three-persona experience from shared components via design token switching

**The innovation is in the integration, not the individual patterns.** Users don't need to learn anything new. They need to experience familiar interactions that feel unexpectedly personal.

### Experience Mechanics

**1. Initiation:** User opens app → persona-aware coaching card appears instantly (precomputed). No loading state, no menu. The AI already decided what matters.

**2. Interaction:** Recall → Build → Apply → Close loop, adapted to entry point. For homework: camera → guided help with Parallel Example Pattern. For practice: recall challenge → adaptive difficulty. For freeform: conversational with woven-in coaching.

**3. Feedback:** "Not yet" framing on errors. "You're picking this up faster than expected" when exceeding. Retention status visible but not pressuring. The coaching close tells you what stuck and when to come back.

**4. Completion:** The AI tells you when you're done. "Solid on this. I'll check in 4 days. Tomorrow: we connect this to something new." The session has a clear end — no infinite scroll, no "one more lesson."

## Visual Design Foundation

### Visual Design Philosophy

**Structure is the brand. Color is the mood.** Typography, spacing, component shapes, logo placement, and animation style are consistent across all three personas. Color palette and information density are what shift. A parent glancing at their child's screen should instantly recognize it as the same product, just tuned differently.

### Three Visual Moods

**Teen mood — dark, high-contrast, minimal:**
Dark backgrounds with content as the main character. The interface disappears behind the homework photo, the AI coach's response, the learning interaction. Single bright accent color. The app feels like a tool that gets out of your way, not a brand trying to impress you. Inspired by Snapchat/TikTok's confidence in letting the interface recede.

**Eager learner mood — calm, spacious, slightly warm:**
Muted tones, generous whitespace, subtle typographic hierarchy. This person is spending real cognitive effort — the palette reduces visual noise. Closer to Notion or Linear than Discord or Duolingo. Desaturated blues/purples that support focus without adding visual load.

**Parent mood — light, clean, high-trust:**
Minimal time in app, so every pixel communicates instantly. High contrast for readability, clear status colors (green/yellow/red) that mean something at a glance. Sparse, confident, scannable. The key design principle isn't the color — it's the information density.

**Language learners** use the eager learner mood with localized content adjustments — not a separate visual identity. Three moods is already ambitious; nail these first.

### Brand Accent: One Hue Family, Three Expressions

The brand constant is a **hue family** (blue-violet range recommended), not a single hex value. Each persona expresses it differently:

| Persona | Accent Expression | Quality |
|---------|------------------|---------|
| **Teen** | Saturated, vibrant, slight neon | Bold, energetic, pops on dark backgrounds |
| **Eager Learner** | Desaturated, sophisticated, slate-toned | Calm, doesn't compete with content |
| **Parent** | Mid-tone, confident, trustworthy | Clear, professional, readable on light |

Same DNA, different energy. Brand recognition across personas comes from the hue family, not a specific hex code.

### Typography System

**Primary typeface: Inter** (or final decision during design phase)

- Designed for screens, excellent legibility at all sizes
- Wide weight range supports confident headlines (teen) and subtle hierarchy (learner)
- Used by Linear, Notion, Vercel — the aesthetic space of the eager learner mood
- Neutral enough to not fight any of the three moods
- Open source, massively documented in LLM training data

**Type scale (consistent across all personas):**

| Level | Use | Size (mobile) |
|-------|-----|---------------|
| **Display** | Coaching card headline | 28-32px |
| **H1** | Screen titles | 24px |
| **H2** | Section headers | 20px |
| **H3** | Card titles, subject names | 18px |
| **Body** | Main content, AI responses | 16px |
| **Body small** | Supporting text, timestamps | 14px |
| **Caption** | Labels, status indicators | 12px |

Line height: 1.5 for body text (readability), 1.2 for headings (tightness).

### Spacing & Layout Foundation

**8px base grid** — NativeWind default scale. All spacing is multiples of 8.

| Persona | Density | Card Padding | Touch Targets |
|---------|---------|-------------|---------------|
| **Teen** | Spacious — content breathes | 20-24px | 48px minimum (big thumbs) |
| **Eager Learner** | Generous whitespace, reading-comfortable | 16-20px | 44px |
| **Parent** | Tighter, data-dense but clear | 12-16px | 44px |

The grid stays consistent. What changes per persona is internal padding and whitespace via design tokens.

### Accessibility Considerations

- **Contrast ratios**: WCAG AA minimum (4.5:1 for text, 3:1 for large text). Critical for parent dashboard status colors and teen dark mode text.
- **Status colors**: Green/yellow/red for retention must be distinguishable for colorblind users — pair colors with icons or labels, never rely on color alone.
- **Touch targets**: 44px minimum across all personas (48px for teen mode). Critical for a mobile-first app used by children.
- **Font sizes**: Never below 12px. Body text at 16px minimum for reading comfort.
- **Motion**: Respect reduced-motion preferences. Animations should enhance, not distract.

## Design Direction Decision

### Chosen Direction

The visual direction was established through the Visual Foundation (Step 08) decisions rather than comparative mockup exploration. The three visual moods, hue family approach, typography, and spacing system provide a clear, converged design direction.

### Design Direction Summary

| Aspect | Decision |
|--------|----------|
| **Overall approach** | Structure is brand-constant; color and density shift per persona |
| **Teen** | Dark, high-contrast, minimal. Interface recedes behind content. |
| **Eager Learner** | Calm, spacious, warm. Notion/Linear aesthetic. Focus-supportive. |
| **Parent** | Light, clean, high-trust. Sparse, scannable, weather-check speed. |
| **Brand accent** | One hue family (blue-violet recommended), persona-specific saturation/tone |
| **Typography** | Inter, consistent scale across all personas |
| **Component style** | Shared shapes and structure; only color tokens and density change |
| **Language learner** | Eager learner mood variant, not a separate visual identity |

### Rationale

The design direction converged organically from the emotional design principles (Step 04), inspiration analysis (Step 05), and visual foundation (Step 08). Three distinct but related visual moods serve three user segments with fundamentally different needs — speed for teens, focus for learners, clarity for parents — while maintaining brand cohesion through shared structure.

### Next Steps for Visual Design

- Detailed mockups and prototypes in Figma during implementation phase
- Accent hue family finalized with real color swatches across all three mood contexts
- Component library built with NativeWind + React Native Reusables using the semantic token set
- Visual QA against accessibility requirements (contrast, touch targets, colorblind safety)

## User Journey Flows

_Revised from PRD Journeys 1-5. Changes driven by UX decisions (Steps 2-9) and code reviewer feedback. Each journey includes failure states — recovery moments where trust is built or lost._

### Journey 1: Onboarding

**Actor:** New learner (child, eager learner) or parent creating child profile

**Goal:** Get from download to first successful interaction with trust established

**What changes from PRD:**
- Removed "How did you hear about us?" — friction for zero value at this stage. Attribution handled via UTM parameters or asked at a later touchpoint.
- Parent preview shows SIMULATED DASHBOARD with sample data, not just text explanation. Parent anxiety is "will I know if it's working?" — showing their future view resolves this faster than any explanation.
- Persona-aware theming applied immediately at profile type detection.
- Teacher-recommended onboarding path added (light — "who told you about us?" only if teacher UTM detected).

**Revised Flow:**

1. **Download & Account Creation**
   - Creates account: email/password, Google OAuth, Apple Sign-in
   - Basic profile: name, birthdate, country
   - If age 11-15 in EU: parent consent workflow triggers (email sent, account pending until approved)
   - No survey questions, no attribution asks — straight to value

2. **Profile Type Detection**
   - System detects from age/context: Child (11-17), Adult learner (18+), or Parent creating child profile
   - UI theme applied immediately: teen dark / learner calm / parent light
   - Teacher-recommended path: if UTM indicates teacher referral, small badge: "Recommended by your teacher" (social normalization, zero friction)

3. **Parent Setup Path (if parent creating child profile)**
   - **30-second trust demo: Simulated Dashboard**
     - "Before we set up your child's account, here's what you'll see:"
     - Mock dashboard with realistic sample data:
       - Subject cards: "Math — Strong", "Science — Fading"
       - Session log: "✓ AI guided through steps / ✓ Child found solution / ✓ No answers given"
       - Weekly summary: "4 sessions this week, 2 hours total"
       - Trend indicator: "Retention improving ↑"
     - Parent sees their future — not an explanation of features, but the actual view they'll use
   - Homework Integrity Mode enabled by default for child profiles
   - "Your child will get guidance, never direct answers. You can review all sessions."
   - [Hand phone to child]

4. **Child's First Entry**
   - AI opens proactively: contextual coaching card (not a static menu)
   - First-time: "Hi [name]. What brings you here today?" with three tappable options:
     - "Homework help" / "Practice for a test" / "Just ask something"
   - After first session: adaptive entry takes over (see Journey 2)

5. **Eager Learner's First Entry**
   - Coaching card: "Let's figure out where you are and what you want to learn."
   - Conversational interview (~3 minutes): subject, background, quick spot-check
   - AI generates personalized learning path
   - Learner can challenge order or skip known topics
   - First lesson begins immediately (Recall → Build → Apply → Close)

6. **Post-First-Session**
   - Learning Book shows first entry
   - Child: "Done for today. Come back when you need help."
   - Eager learner: Coaching card preview for next session
   - Parent (if applicable): can review first session — sees guided process, trust validated

**Failure States:**

1. **Parent consent never received (child 11-15 EU)** — Reminder emails at Day 7, 14, 25. Account auto-deleted after 30 days. Child notified before deletion with clear next steps.

2. **First homework response too slow (>10 seconds)** — Child abandons, returns to ChatGPT. Prevention: camera → AI response pipeline optimized as fastest path. This is the one chance to prove value.

3. **Parent preview doesn't resolve anxiety** — Simulated dashboard must use realistic sample data, not abstract placeholders. Show exactly what parent will see with a child who has 2 weeks of history, not empty states.

**Success Indicators:**
- Onboarding completes in <10 minutes
- Parent preview resolves "how will I monitor this?" anxiety before child setup
- First interaction response in <10 seconds
- Child completes first session without abandoning
- User returns within 24 hours

---

### Journey 2: Daily Learning Loop

**Actor:** Returning learner (child or eager learner)

**Goal:** Continue learning with continuity, proactive coaching, and contextual adaptation

**What changes from PRD:**
- ADAPTIVE ENTRY replaces static three-button menu for children. We said "no menus" — the proactive coach applies "already knows what you need" to the child segment too.
- Three-button menu ("Homework / Practice / Just ask") becomes SECONDARY fallback, not primary opening.
- Eager learners continue with coaching card as default.
- Recall warmup happens AFTER homework success (see Journey 4), not before.

**Revised Flow:**

1. **App Open — Adaptive Entry (Child)**
   - AI analyzes context before the child sees anything:
     - Time of day (4pm weekday = homework likely)
     - Days since last session
     - Retention status (topics fading?)
     - Recent events (test mentioned? test completed?)
   - Proactive coaching card with CONTEXTUAL opening:
     - **Homework pattern detected** (4pm weekday): "Ready for homework?" → [Camera] / [Something else]
     - **Gap detected** (weekend, 3+ days no practice): "You've got 2 things fading — 4-minute refresh?" → [Sure] / [Just ask something]
     - **Post-test**: "How'd the test go? Want to lock in what you studied?" → [Let's go] / [Not now]
     - **No-homework day, nothing fading**: "What do you need today?" → [Homework] / [Practice] / [Just ask]
   - Secondary options always available via bottom nav (the three-button menu lives here, not as the opening screen)
   - **Cold start (sessions 1-5):** Adaptive entry requires behavioral data that doesn't exist yet. For the first 5-7 sessions, the coaching-voiced three-button fallback IS the experience — and that's fine. Frame it through the coaching voice:
     - Session 1: "I'm still getting to know you. What are you working on today?"
     - Session 2: "What have we got today?"
     - Session 3: "Back again — what's on the homework list?"
     - Session 4: "What are we tackling?"
     - Session 5+: adaptive prediction kicks in when confident
   - Same three buttons underneath, but the voice warms up each session. The transition to real adaptive entry is invisible — one day the coach just says "Algebra homework again? Let's go." No announcement, no "I've learned your patterns" moment.

2. **App Open — Coaching Card (Eager Learner)**
   - AI recommendation: "Electromagnetic forces are fading. 90-second refresh."
   - [Let's go] / [I have something else in mind]
   - Subject switcher visible beneath card (horizontal strip with retention bars)
   - Tap any subject → that subject's coaching recommendation

3. **Homework Help Path** — See Journey 4 for full flow. Key points:
   - Camera-first, auto-detect in <3 seconds
   - Max 2-3 Socratic questions → Parallel Example Pattern if stuck
   - Recall warmup happens AFTER homework success, during bridge/completion phase

4. **Practice Path (Child or Eager Learner)**
   - Coaching card: "Here's what we're working on: [topic name]"
   - **Recall → Build → Apply → Close loop:**
     - **Recall:** "What do you remember about [prior related topic]?"
     - **Build:** New concept connected to existing knowledge
     - **Apply:** Scenario or problem — production, not recognition
     - **Close:** AI summarizes what stuck, what needs work, when to return
   - Mandatory summary in own words
   - Topic marked complete (pending verification after 2 weeks)

5. **Freeform "Just Ask Something" Path**
   - Open conversation
   - Child profiles: full Socratic method (Homework Integrity enforced — longest path to any answer, self-policing)
   - Eager learner profiles: Socratic for concepts, direct for factual lookups

6. **Post-Session Close**
   - AI tells user when done: "Solid on this. I'll check in 4 days."
   - Learning Book updated
   - No infinite scroll, no "one more lesson" dark pattern

7. **Return Triggers (Pull, Not Push)**
   - Child: utility-only notifications ("Homework time" at 4pm if enabled; "Your math test is in 2 days")
   - Eager learner: curiosity-based ("3 things fading — 5 minutes keeps them strong")
   - Never: "You haven't practiced today" or streak-shame

**Failure States:**

1. **Adaptive entry guesses wrong context** — 4pm but child wants to practice, not homework. Prevention: "Something else?" always visible as secondary. One tap to switch. AI learns from corrections and adapts future predictions.

2. **Child stuck after Parallel Example Pattern** — Still can't solve homework after seeing example. AI pivots: "This one's tough. Let's learn the concept first, then come back." Switches to teaching mode, builds foundation, returns to homework after. Parent sees: "Concept gap identified and addressed."

3. **Eager learner coaching card feels stale** — "Fading topic" recommended but learner wants something new. "I have something else in mind" always visible. Learner overrides AI, picks own subject. Card adapts next session based on override patterns.

**Success Indicators:**
- Child experiences adaptive entry as "it already knows" within first week
- Eager learner feels coaching card is relevant 80%+ of sessions
- Sessions complete without mid-topic abandonment (>70%)
- Retention checks pass at >50% rate
- Users return within 7 days consistently

---

### Journey 3: Parent Oversight

**Actor:** Parent monitoring child's learning progress

**Goal:** Verify child is learning (not cheating) and assess effectiveness in under 5 seconds

**What changes from PRD:**
- One-sentence summary per child with traffic light signals (green/yellow/red)
- TEMPORAL COMPARISON visible without any taps: "Alex practiced 4 times this week, up from 2 last week"
- Drill-across (week-over-week trends) added alongside drill-down (child → subject → topic → session)
- Glanceable dashboard replaces "switch into child's profile and review Learning Book" model

**Revised Flow:**

1. **Dashboard Access**
   - Parent opens app → parent dashboard loads in <2 seconds
   - No profile switching required — parent has their own view

2. **5-Second Glance (Primary Experience)**
   - **One-sentence summary per child with process visibility:**
     - "Alex: Math — 5 problems, 3 guided. Science fading. 4 sessions this week (↑ from 2 last week)."
     - "Emma: All subjects on track, all guided. 6 sessions this week (→ same as last week)."
   - **Confidence signal — "guided vs immediate":** Each homework session tracks whether the child worked through problems with coaching help (guided) or answered immediately without hints. "3 guided, 2 immediate" tells a perceptive parent everything without the app explicitly accusing the child. A child who consistently answers hard problems immediately but fails recall checks later → the AI adapts coaching (more recall-before-homework), but the parent sees the signal in the ratio.
   - **Temporal comparison always visible** — not a snapshot, a trend:
     - Session count: this week vs last week with directional arrow (↑ ↓ →)
     - Retention direction: improving / steady / declining
   - **Subject retention signals** per child:
     - Green (Strong) / Yellow (Fading) / Red (Weak)
     - Paired with labels, never color alone (accessibility)
   - Parent answers "is it working?" in <5 seconds: trend up? Retention green? Activity present? Process visible?

3. **Drill-Down (Optional — For Deeper Review)**
   - Tap child → subject cards with per-subject retention and session count
   - Tap subject → topic list with retention status per topic
   - Tap topic → session history for that topic
   - Tap session → full transcript:
     - Child's homework photo (if applicable)
     - AI's Socratic questions and child's responses
     - Parallel Example shown (if child was stuck)
     - Verification markers: "✓ AI guided through steps / ✓ Child found solution / ✓ No answers given"
     - Confidence breakdown: "3 problems guided, 2 answered immediately" — process visibility without accusation

4. **Drill-Across (Week-Over-Week Trends)**
   - Weekly progress summary (auto-generated, plain language):
     - "This week: 4 sessions, 3 hours. Retention improving in Math, fading in Science."
     - "Last week: 2 sessions, 1 hour."
   - No charts to interpret — plain language with directional indicators
   - Available as optional push notification or email (weekly digest)

5. **Notification Settings (Optional)**
   - Weekly progress summary (email/push)
   - Retention drop alert: "Science retention fading — may need attention"
   - Milestone achieved: "Alex completed 10 sessions"
   - All optional, off by default
   - Never surveillance-feeling (no "Alex opened the app at 4:07pm")

**Failure States:**

1. **Dashboard takes >5 seconds to understand** — Too much data, unclear signals, requires interpretation. Prevention: single sentence per child at top, traffic light retention, temporal comparison baked into the sentence. If parent needs to think about what they're seeing, the design failed.

2. **Trend indicator is misleading** — "4 sessions this week" but all 30 seconds long (child gaming the system). Prevention: trend shows BOTH session count and time: "4 sessions, 3 hours total (↑ from 2 sessions, 1 hour)." Dual signal catches gaming.

3. **Parent doubts homework integrity** — Transcript review unclear, can't tell if AI gave answers. Prevention: explicit verification markers on every homework session ("✓ AI guided / ✓ Child solved / ✓ No answers given") in non-technical language. Trust is earned through transparency, not claims.

**Success Indicators:**
- Parent assesses "is it working?" in <5 seconds
- Temporal comparison visible without any taps
- Parent reviews progress at least weekly
- Parent trusts homework integrity based on transcript transparency
- Parent uses dashboard as "weather check" — quick, low-effort, reliable
- Subscription renewal driven by visible trend: retention improving, child engaging

---

### Journey 4: Homework Help

**Actor:** Child (11-17) with homework problem — forced adoption user, likely time-pressured

**Goal:** Get help solving homework through guided thinking (not answer-giving) faster than struggling alone

**What changes from PRD:**
- Camera input is MVP (was v1.1)
- Auto-detect subject in <3 seconds (no manual selection dropdown)
- Max 2-3 Socratic questions → Parallel Example Pattern when stuck
- Recall warmup moved to AFTER homework is solved (completion/bridge phase) — the emotional window after a win is when kids are most receptive. Before homework, they're impatient and will train themselves to skip.
- "I don't know" is a valid input, not a failure state
- Speed as survival metric: under 10 seconds from camera to first AI response

**Revised Flow:**

1. **Camera-First Entry** — Child opens Homework Fast Lane → camera (Snapchat-pattern default)
   - Photograph worksheet, textbook page, or written problem
   - Alternative: type problem or paste from digital assignment
   - Voice input architecture-ready, ships v1.1
   - No subject selection — AI auto-detects from input

2. **Problem Recognition (<3 seconds)** — AI parses photo, identifies subject and problem type
   - UI: "Got it. Quadratic equation. Let's work through this."
   - First AI message under 10 seconds from camera capture
   - If image unclear: "Can you retake with better lighting?" (tech hiccup framing, never child's fault)

3. **Socratic Guidance (Max 2-3 Questions)** — Homework Integrity Mode active (profile-level)
   - AI: "What do you think the first step is?"
   - Child responds (or says "I don't know" — valid response)
   - AI: "Good start. What happens next?"
   - **If progressing:** AI continues guiding toward solution
   - **If stuck after 2-3 questions or "I don't know":** → Parallel Example Pattern

4. **Parallel Example Pattern (When Stuck)** — Never interrogate a stuck child
   - AI: "Let me show you on a similar one first."
   - Demonstrates method on a DIFFERENT but similar problem (homework answer not revealed)
   - Visual step-by-step breakdown (Photomath-style presentation)
   - AI: "Got it? Now let's go back to yours."
   - Child applies pattern to own homework

5. **Solution Discovery** — Child arrives at answer through own reasoning
   - AI confirms or uses "not yet" framing: "Almost — check step 3 again"
   - Session marked in Learning Book: "🎯 Guided problem-solving"
   - AI: "You got it."

6. **Recall After the Win (Bridge/Completion Phase)** — Emotional window after success = maximum receptivity
   - AI: "Quick — this connects to something from last week. What was the rule about [related fading concept]?"
   - 30-second recall challenge on related topic
   - Child answers or skips (low pressure, no obligation)
   - If recalled: "Still strong." If not: "Let's do 90 seconds on that tomorrow — it's fading."
   - **Bridge to learning:** "You struggled with [X] today — want me to explain the pattern?" No pressure, no lecture. Seed planted.

7. **Completion & Close**
   - AI: "Done. You're clear on this."
   - Child exits — homework complete, session logged
   - Parent can review later: sees guided process, not answer-giving

**Failure States:**

1. **Camera can't parse homework** (poor lighting, handwriting, complex layout)
   - First attempt: "Can you retake with better lighting?" (friendly, tech-blame)
   - Second attempt: "Sometimes photos are tricky. Want to type it out instead?"
   - Fallback: manual text entry. AI still helps. Child doesn't feel defective.

2. **Child stuck even after Parallel Example** — Still can't solve after seeing demonstrated method
   - AI: "This one's tricky. Let's build the foundation first, then come back."
   - Switches to teaching mode — teaches the underlying concept
   - Returns to homework after concept is understood
   - Topic flagged as "Needs Deepening" in Learning Book
   - Parent sees: "Concept gap identified and addressed before homework completed"

3. **Child tries to game the system** ("Just tell me the answer" / "I don't care, give me the answer")
   - AI: "I can't give the answer, but I can show you how on a different one. Deal?"
   - Parallel Example offered as alternative
   - If child exits in frustration: next session opens with adaptive bridge: "Last time was tough. Want to tackle the foundation first?"
   - System never breaks integrity. Child learns: the app helps, but doesn't hand out answers.

**Success Indicators:**
- First response under 10 seconds (speed is survival)
- Child completes homework without switching to ChatGPT
- Parallel Example Pattern prevents frustration-driven abandonment
- Recall-after-win increases retention without feeling forced
- Parent reviews session, sees guided process (trust reinforced)
- Child returns for future homework help (utility proven)

---

### Journey 5: Language Learning

**Actor:** Eager Learner (14-17+ or adult) studying a new language

**Goal:** Achieve conversational proficiency through immersive, research-backed methodology

**What changes from PRD:**
- Berlitz Present → Practice → Perform cycle integrated (validates Recall → Build → Apply → Close)
- Four Strands methodology explicit (Explicit Instruction + Input + Output + Fluency)
- Grammar gets explicit instruction with EXPLICIT ACKNOWLEDGMENT from coach — "Grammar is one area where I'll just explain directly — it's faster that way." Makes the Socratic → explicit style shift feel intentional, not inconsistent.
- CEFR milestones + FSI time estimates for realistic expectations
- Production count vs recognition tracked separately (two data points per vocabulary item)
- Immersive target-language mode (Berlitz: target language from day one, adapted to level)
- Uses eager learner mood (calm, spacious) — not a separate visual identity

**Revised Flow:**

1. **Mode Detection & Expectation Setting**
   - Learner types "Learn Spanish" (or any language)
   - AI detects language subject, switches to Four Strands methodology
   - Realistic expectations: "Spanish is Category I (FSI): ~600-750 hours to conversational fluency. We'll track CEFR milestones: A1 → A2 → B1..."
   - Placement conversation: "Ever studied Spanish before?" Quick exchange determines starting level.

2. **Foundation Building (Present Phase — Berlitz Cycle)**
   - **Grammar — Explicit Instruction (Style Shift Acknowledged):**
     - AI: "Grammar is one area where I'll just explain directly — it's faster that way."
     - Teaches rule with examples (not Socratic discovery — grammar doesn't benefit from "guess the rule" torture)
     - Visual pattern: "In Spanish, adjectives come AFTER nouns. 'Casa blanca' not 'blanca casa.'"
   - **Vocabulary — Comprehensible Input:**
     - New words presented in context at 95-98% known words
     - Collocation learning (phrases, not isolated words)
     - Production vs recognition tracked separately
   - **Immersive mode (intermediate+):** AI conducts session in target language (Berlitz method)

3. **Daily Practice (Practice Phase — Berlitz Cycle)**
   - **Vocabulary Review:** SM-2 spaced repetition
     - Recognition test: "What does 'biblioteca' mean?"
     - Production test: "How do you say 'library'?"
     - Both must pass 12+ times across increasing intervals for mastery
   - **Fluency Drills:** Time-pressured automatic retrieval
     - "Quick — 10 seconds — how do you say 'I am learning Spanish'?"
     - Speed builds automaticity (Four Strands: fluency development)
   - **Grammar Pattern Practice:** Apply rule in new contexts
     - AI: "Describe your house using at least 3 adjectives."
     - Direct correction + explanation (not Socratic hints)

4. **Output Practice (Perform Phase — Berlitz Cycle)**
   - **Speaking/Writing Production:** (Four Strands Output requirement)
     - AI: "Tell me about your day in Spanish. Use past tense."
     - AI corrects with explanation: "Almost! 'Yo fui' not 'yo fue.' Irregular verb."
   - **Error Framing:** Mistakes are progress
     - "That's a common pattern — native speakers mix this up too."
     - "Not yet" framing, never "wrong"
   - **Conversational immersion (intermediate+):** Full sessions in target language, complexity adapted to demonstrated level

5. **Progress Tracking & CEFR Milestones**
   - Vocabulary count (production AND recognition tracked separately)
   - Hours studied vs FSI estimate: "40 hours in, ~180 words active. On track for A2 in 3 months."
   - CEFR milestone assessments (A1 → A2 → B1 → B2)
   - "Confidence not streaks" — progress measured by capability, not login frequency

6. **Retention & Close**
   - Spaced repetition ensures long-term memory
   - Grammar patterns reviewed in new contexts (transfer test)
   - AI: "Solid on present tense. Tomorrow: past tense, then we'll mix them."
   - Session close: what stuck, what needs work, when to return

**Failure States:**

1. **Learner returns after 2+ weeks away** — No guilt mechanics. AI: "Been a while! You had 23 words on the edge of fading — want a 3-minute refresh first?" Adaptive catch-up session, not starting from zero. Pull (curiosity), not push (guilt).

2. **Learner fails CEFR milestone assessment** — AI: "Not quite A2 yet. Let's look at where the gaps are." Diagnostic breakdown by skill area. Custom practice plan generated. Failure reframed as data ("Your vocab is strong but verb conjugations need work"), not judgment.

3. **Vocabulary won't stick (5+ failed recalls on same word)** — AI recognizes pattern: "This word keeps slipping. Let's try a different approach." Offers mnemonic, uses word in multiple contexts across next sessions, moves to higher-frequency review queue. System adapts strategy rather than just repeating the same test.

**Success Indicators:**
- Vocabulary increases steadily (both recognition AND production)
- Passes CEFR milestone assessments on schedule
- Can produce (speak/write) learned material, not just recognize it
- Retains vocabulary long-term (12+ spaced exposures)
- Returns after gaps driven by curiosity, not guilt
- Grammar knowledge transfers to new contexts

---

### Cross-Journey Architecture Flags

_Collected for the Architecture phase. These are hard technical requirements surfaced by UX decisions._

| Flag | Source Journey | Requirement |
|------|--------------|-------------|
| OCR + subject classification pipeline | Journey 4 | Camera → problem parsed → subject detected in <3 seconds |
| Coaching card precomputation | Journey 2 | Background job on session close prepares next session's adaptive opening |
| Spaced repetition engine | Journey 2, 5 | Per-topic decay curves, per-vocabulary-item retention tracking |
| Learning Book as structured data model | All | Persistent, queryable — not just chat logs |
| Parent-child account linking | Journey 3 | Permission model, session visibility, profile switching |
| Parallel Example generator | Journey 4 | Needs access to problem templates by subject/type to generate similar-but-different problems |
| Temporal comparison engine | Journey 3 | Week-over-week aggregation for parent dashboard trends |
| Production vs recognition tracking | Journey 5 | Two separate data points per vocabulary item |
| Context prediction model | Journey 2 | Time-of-day, usage patterns, calendar signals for adaptive entry |
| Model routing by conversation state | Journey 4, Party Mode | Default to fastest model (Gemini Flash) for initial Socratic questions. Escalate to reasoning models (Claude/GPT-4) only at Parallel Example or Teaching Mode rungs. Routing follows Socratic Escalation Ladder, not initial photo classification. |
| Cost ceiling per session | Journey 4, Party Mode | Soft ceiling €0.05/session. Most sessions (70%) resolve in 2-3 fast-model calls (€0.005-0.01). Expensive sessions (10%) are highest-value (teaching mode). Monitor, don't pre-optimize. |
| Parallel Example template cache | Journey 4, Party Mode | Pre-generated examples by problem type. Evaluate retrieval vs. fresh generation tradeoff. Cached examples indistinguishable from fresh for the child. |
| Coaching card two-path loading | Journey 2, Party Mode | Cached path (<1s): context-hash freshness check (time_bucket + dayType + retentionSnapshot + lastSessionType). Fresh path (1-2s skeleton): first launch, gap >48h, context hash mismatch, new device. |
| Behavioral confidence score | Journey 3, 4, Party Mode | Per-problem: time-to-answer, hints needed, escalation rung reached, problem difficulty. Derived confidence feeds parent dashboard ("3 guided, 2 immediate") and coaching adaptation (low-confidence topics get more recall checks). |
| Dual-token retention signals | Journey 3, Party Mode | Light mode: fg strategy (colored text/icon on neutral surface). Dark mode: bg strategy (tinted card surface, muted foreground). 12 tokens total (4 signals × 3: fg, bg, on-bg). Supports 6 theme configurations. |

### Parked: Additional PRD Updates from Journey Flows

| # | Change | PRD Impact |
|---|--------|------------|
| 13 | Remove "How did you hear about us?" from onboarding | Simplify onboarding flow, handle attribution via UTM |
| 14 | Simulated dashboard in parent setup | New onboarding step: parent preview with sample data |
| 15 | Adaptive entry for child (context-aware opening) | Replace static three-button menu with proactive coaching card |
| 16 | Temporal comparison in parent dashboard | New FR: week-over-week trend visible without taps |
| 17 | Recall warmup moved to post-homework bridge | Modify FR: recall happens after homework win, not before |
| 18 | Grammar style shift acknowledgment | New FR: coach explicitly announces direct instruction for grammar |
| 19 | Failure state handling | New FR set: camera retry, stuck-after-example pivot, gaming response, return-after-gap |

### Parked: PRD Updates from Party Mode Review

| # | Change | PRD Impact |
|---|--------|------------|
| 25 | Confidence scoring per problem — process visibility for parents | New FR: per-problem confidence derived from time-to-answer, hints needed, escalation rung. Parent dashboard shows "guided vs immediate" ratio. AI uses low-confidence signals to adapt coaching (more recall checks). Preserves child dignity while giving parents real signal. |
| 26 | Model routing by conversation state | New architectural FR: default to fastest model for initial Socratic questions, escalate to reasoning models only at Parallel Example / Teaching Mode rungs |
| 27 | Coaching card two-path loading (cached vs fresh) | New architectural FR: cached (<1s, context-hash freshness) vs fresh (1-2s skeleton). Context hash = time_bucket + dayType + retentionSnapshot + lastSessionType |
| 28 | Phase 1 rescoped — homework-only proving flow | Profile Switcher removed from Phase 1 (parent uses separate login). SessionCloseSummary added. Practice path and eager learner flow deferred. Two entry points for children (Homework, Practice), not three. |

## UX Consistency Patterns

_Rules for how EduAgent behaves in every common situation. These patterns ensure the app feels like one coach across all journeys, personas, and states._

### AI Coaching Interaction Patterns

**The Coach Talks First — Always.**

Every screen, every session, every entry point: the AI has already prepared something. The user never faces a blank screen wondering what to do.

| Situation | Pattern | Never Do |
|-----------|---------|----------|
| App open | Coaching card with recommendation | Blank home screen, "What would you like to learn?" |
| Conversation start | AI's first message already loaded | Empty chat with cursor in input field |
| After silence (user thinking) | Wait — then gentle re-engagement at 3 minutes (see below) | "Are you still there?" before 3 min, or repeated prompts |
| Topic transition | AI bridges: "This connects to..." | Abrupt topic switch without context |
| Session end | AI closes: "Solid. I'll check in 4 days." | Session just... stops. Or "Come back tomorrow!" |

**Silence & Re-engagement Pattern:**

The coach waits patiently — but not forever. A child who photographed homework and got a Socratic question may get distracted, put the phone down, or feel stuck without knowing how to respond.

| Threshold | Behavior |
|-----------|----------|
| 0-3 minutes | Wait silently. The child may be thinking, writing on paper, or looking something up. |
| 3 minutes | Gentle re-engagement, once: "Still working on this? No rush — I'm here when you're ready." |
| After re-engagement | Silent. No second prompt. Session stays open. |
| 30 minutes inactivity | Session auto-saves, UI returns to coaching card. When child returns: "Want to pick up where we left off?" |

The re-engagement should feel like a coach glancing over, not tapping their watch. It happens exactly once. If ignored, the coach respects the silence.

**Session Maximum Length:**

A real coach manages your energy, not just your curriculum. Sessions have a ceiling to prevent cognitive fatigue that degrades retention.

| Persona | Nudge | Cap | Coach Says |
|---------|-------|-----|-----------|
| Child (teen) | 15 minutes | 20 minutes | "Good stopping point. Want to wrap up or keep going?" |
| Eager learner | 25 minutes | 30 minutes | "We've covered a lot. Worth pausing to let it settle?" |
| Language learner | 20 minutes | 25 minutes | "Good session. New vocab sticks better with a break." |

Not a hard cutoff — a coach-initiated wind-down. If the user chooses to continue, the cap extends by 10 minutes before the next nudge. The coach never forces a stop, but always advocates for quality over quantity.

**Socratic Escalation Ladder (Child Profiles):**

Five rungs, each preserving as much child agency as possible before escalating:

```
1. Socratic Questions (max 2-3)
   → Child answers correctly → confirm, move forward
   → Child answers incorrectly → "Not yet" + rephrase/hint
   → Child says "I don't know" → valid, skip to rung 3
   → Stuck after 2-3 questions → escalate to rung 3

2. (skipped — direct path from 1 to 3 when stuck)

3. Parallel Example
   → AI demonstrates method on a DIFFERENT problem
   → Child applies pattern to their own homework

4. Transfer Bridge (NEW — between parallel example and teaching)
   → Child got the parallel example right but can't apply to homework
   → This is a transfer problem, not a comprehension problem
   → AI: "You got the practice one. Your homework looks similar but has
     [this difference]. What changes?"
   → Preserves agency: child identifies the difference themselves
   → If still stuck → escalate to rung 5

5. Teaching Mode Pivot
   → AI: "This one's tricky. Let's build the foundation first."
   → Switches to concept teaching, then returns to homework
   → Topic flagged as "Needs Deepening"
```

**Grammar Style Shift (Language Learning Only):**
- AI explicitly acknowledges: "Grammar is one area where I'll just explain directly — it's faster that way."
- Said once per subject, first time grammar comes up. Not repeated every session.
- After acknowledgment, AI teaches directly without Socratic questions for grammar rules.

**Eager Learner vs Child Tone:**

| Dimension | Child Profile | Eager Learner Profile |
|-----------|--------------|----------------------|
| Vocabulary | Simple, direct, no jargon | Technical terms welcome, precise |
| Praise | "You got it." (matter-of-fact) | "You're picking this up faster than expected." (acknowledges capability) |
| Correction | "Not quite — check step 3 again" | "Close. The issue is [specific technical point]." |
| Challenge | "Want to try a harder one?" | "Let me skip ahead — you're ready for this." |
| Close | "Done for today." | "Solid. I'll check in 4 days." |

---

### Feedback Language Patterns

**The "Not Yet" System — Universal Across All Personas:**

| Situation | Say | Never Say |
|-----------|-----|-----------|
| Wrong answer | "Not quite — [specific hint]" | "Wrong" / "Incorrect" / "Try again" |
| Partially right | "Good start. [What's missing]" | "That's only half right" |
| Stuck | "Let me show you on a similar one" | "Think harder" / "You should know this" |
| Topic blocked | "This one's tricky. Let's build the foundation first." | "You failed this topic" |
| Recall failed | "It's fading — let's refresh tomorrow" | "You forgot this" |
| Test not passed | "Not quite [level] yet. Let's look at the gaps." | "You failed the assessment" |

**Success Feedback — Calibrated, Not Inflated:**

| Level | Feedback | When |
|-------|----------|------|
| Expected correct | "Got it." / Checkmark | Routine correct answers |
| Exceeded expectation | "You're picking this up faster than expected — let me skip ahead." | Consistently correct on harder material |
| Recall success | "Still strong." | Retained after 2+ weeks |
| Milestone | "That's A2. Real progress." | CEFR level, topic mastery |
| Session complete | "Solid on this. I'll check in [N] days." | Every session close |

Never: excessive praise ("Amazing!" "You're so smart!"). Never: gamification language ("Level up!" "+50 XP!"). The coach is matter-of-fact — genuine respect, not cheerleading.

**Retention Signal Language (Parent-Facing):**

| Signal | Color | Label | One-Sentence Example |
|--------|-------|-------|---------------------|
| Strong | Green | "Strong" | "Alex has this locked in." |
| Fading | Yellow | "Fading" | "Hasn't practiced in a while — may need a refresh." |
| Weak | Red | "Weak" | "Struggled with this. Needs attention." |
| Forgotten | Gray | "Forgotten" | "Been too long — needs re-learning." |

Always paired: color + label + optional sentence. Never color alone.

**Error Feedback (ErrorRecovery Pattern):**

| Persona | Tone | Example |
|---------|------|---------|
| Teen | Casual, tech-blame | "Hmm, let me try that again." |
| Eager learner | Straightforward, solution-focused | "Connection lost. Retrying..." |
| Parent | Clear, reassuring | "We hit a hiccup. Your child's data is safe." |

Consistent structure: acknowledge problem → offer recovery action → never blame the user.

---

### Navigation Patterns

**Minimal Navigation — The Coach Leads.**

EduAgent is not a menu-driven app. The primary navigation is the coaching card. Secondary navigation exists but is never the default path.

**Navigation Structure:**

```
┌─────────────────────────────────────┐
│  [Profile Switcher]     [Settings]  │  ← Top bar (minimal)
├─────────────────────────────────────┤
│                                     │
│        COACHING CARD                │  ← Primary: AI-driven entry
│        (adaptive per persona)       │
│                                     │
│  [Subject Strip - eager learner]    │  ← Secondary: manual override
│                                     │
├─────────────────────────────────────┤
│  [Home]  [Learning Book]  [More]    │  ← Bottom nav (3 items max)
└─────────────────────────────────────┘
```

**Navigation Rules:**

| Rule | Rationale |
|------|-----------|
| Max 3 bottom nav items | More = decision paralysis. Coach leads, not menu. |
| No hamburger menu | Hidden navigation = unused navigation. If it matters, it's visible. |
| No nested navigation deeper than 3 levels | Parent drill-down: child → subject → session. That's the max. |
| Back button always available | Never trap the user. But also never interrupt a coaching flow with "are you sure?" modals. |
| Profile switcher in top bar, not bottom nav | Profile switching is occasional, not primary. |

**Bottom Nav Items:**

| Item | What It Opens | Who Uses It |
|------|--------------|-------------|
| **Home** | Coaching card / Parent dashboard | All personas (dashboard IS home for parents) |
| **Learning Book** | Progress reference, topic list, retention overview | Eager learner primarily; child occasionally |
| **More** | Settings, account, notifications, help | All personas (low frequency) |

**In-Session Navigation:**
- During coaching conversation: bottom nav hidden. Full-screen conversation. Back button exits with auto-save.
- Camera mode: full-screen camera. X to exit. No nav chrome.
- The session owns the screen. Navigation returns when the session closes.

---

### Loading & Processing Patterns

**Speed Hierarchy — What Must Be Instant vs. What Can Load:**

| Action | Target | Pattern |
|--------|--------|---------|
| App open → coaching card | <1 second | Precomputed. Card ready before user arrives. Skeleton only on first-ever load. |
| Camera → processing → subject detected | <3 seconds | Progress indicator: "Reading..." → "Got it. Quadratic equation." |
| AI first response (non-camera) | <2 seconds | Streaming. First token appears fast, rest streams in. |
| AI streaming response | Continuous | Token-by-token. User sees response building. No "typing..." bubble that resolves to a wall of text. |
| Dashboard load | <2 seconds | Summary sentence loads first (most important), subject cards second. |
| Profile switch | <1 second | Theme swap instant, content uses skeleton if data fetch needed (see below). |

**Skeleton Loading Pattern:**
- Skeleton shape matches final content shape (card skeleton looks like a card)
- Coaching card skeleton: headline placeholder + button placeholder
- Never show a spinner. Skeletons feel faster than spinners.

**AI Streaming Pattern:**
- First token as fast as possible (target <2s)
- Response streams token-by-token into message bubble
- If stream fails mid-response: show what was received + "Let me try that again" retry
- Never: "typing..." indicator that hides response until complete

**Profile Switch Split Perception:**
- **Theme swap:** instant. CSS variables flip, colors shift immediately. The user sees the new persona within 100ms.
- **Content swap:** skeleton. Card shape stays (BaseCoachingCard skeleton), new content loads. If data is cached, resolves instantly. If fetch needed, skeleton for up to 1 second.
- The 300ms perception feels real because the theme changed already — the user registers the switch even while content loads.

**Parent Dashboard Real-Time Updates:**
- "No notifications during sessions" does NOT mean stale data.
- Parent dashboard refreshes silently in background (polling or WebSocket).
- If child completes a homework session while parent has dashboard open: data updates without toast or notification. Next glance shows current state.
- Rule: parent dashboard always shows current data. Silent refresh, never stale.

**Offline/Slow Connection:**
- No connection: show last coaching card + "Offline — some features unavailable" banner
- Cached content (Learning Book, recent sessions) available for review
- No AI interaction possible offline (v2.0 consideration)
- Banner dismissible, not blocking

---

### Button Hierarchy

**Three Levels — No More:**

| Level | Style | Use | Example |
|-------|-------|-----|---------|
| **Primary** | Filled, accent color, full width or prominent | The one thing the AI recommends | [Let's go], [Take photo], [Sure, 3 minutes] |
| **Secondary** | Outlined or text, muted | Alternative the user might want | [Something else], [I have something else in mind] |
| **Tertiary** | Text-only, subtle | Dismissal or low-priority action | [Not now], [Later] |

**Button Language Rule:**

Buttons should sound like something you'd say to a coach, not something you'd click in an app. The test is tonal, not grammatical.

| Good (conversational) | Bad (app-like) |
|----------------------|----------------|
| "Sure, 3 minutes" | "Start session" |
| "Let's go" | "Begin" |
| "Take photo" | "Upload image" |
| "Not now" | "Cancel" |
| "Something else" | "Back to menu" |
| "Show me" | "View example" |

**Button Rules:**

| Rule | Rationale |
|------|-----------|
| Max 1 primary button visible at a time | One clear action. No decision paralysis. |
| Primary = what the coach recommends | AI decided what's best. Primary reflects that. |
| Secondary doesn't compete visually | Quieter, positioned below or beside. Never same weight. |
| Skip/dismiss always available, never shamed | "Not now" is fine. No guilt. No "are you sure?" |
| Touch targets: 48px teen, 44px learner/parent | Per accessibility requirements |

**Coaching Card Button Layout:**

```
┌─────────────────────────────────────┐
│  "2 things fading — 4-min refresh?" │
│                                     │
│  ┌─────────────────────────────┐    │
│  │       Sure, 3 minutes       │    │  ← Primary (filled)
│  └─────────────────────────────┘    │
│       Just ask something            │  ← Secondary (text)
└─────────────────────────────────────┘
```

**Destructive Actions (Rare):**
- Delete account, cancel subscription: danger token, confirmation dialog required
- Never: destructive action as primary button
- Always: clear explanation of consequences before confirmation

---

### Transition Patterns

**Coaching Card → Conversation:**
- Card expands or morphs into the conversation. AI's card headline becomes the first message in the thread.
- **Phase 1 fallback:** If the morph animation is technically janky (shared element transitions in React Native are notoriously finicky with Reanimated), ship a quick crossfade (200ms). Validate the flow works emotionally first. Upgrade animation later.
- **Phase 2 target:** Smooth morph — card lifts, content expands, input area slides up. Feels like the coach started talking.
- Don't let the perfect transition block MVP.

**Homework Camera → Conversation:**
- Full-screen camera → capture → processing overlay → overlay resolves into first AI message
- "Got it. Quadratic equation." appears where the processing indicator was
- Camera UI dismisses, conversation takes over. One continuous flow.

**Homework Complete → Recall Bridge:**
- After "You got it." — brief pause (500ms). Let the win land.
- Recall challenge appears as new message in same thread: "Quick — this connects to something from last week..."
- Same conversation, new topic. Not a modal, not a popup.
- If child ignores or skips: thread continues to session close. No friction.

**Session Close → Home:**
- SessionCloseSummary appears as final message in thread
- Conversation collapses back to coaching card (next session preview)
- Bottom nav reappears
- Feels like the coach putting the notebook away

**Profile Switch:**
- Theme crossfade: instant (colors shift within 100ms)
- Content: skeleton if data fetch needed, instant if cached
- No loading screen, no logout/login flow. Persona swap.

**Mode Transitions (Invisible):**
- Homework → practice → freeform: no visible mode switch. AI adjusts conversationally.
- User never sees "Switching to Practice Mode."
- AI's tone and approach shift; UI elements appear/disappear naturally.

**Error → Recovery:**
- Error states don't navigate away. ErrorRecovery appears inline.
- Recovery resolves inline: retry in-place, success replaces error.
- Never: navigate to error page → navigate back.

---

### Cross-Pattern Rules

These rules apply across ALL patterns:

| Rule | Applies To | Detail |
|------|-----------|--------|
| **No empty states** | All screens | AI always has something to say. Coaching card, suggestion, or "Let's set up your first subject." |
| **No modals for learning** | Coaching, practice | Modals interrupt flow. Only for destructive confirmations (delete account, cancel subscription). |
| **No toast notifications during sessions** | Active coaching | Notifications queue until session close. Exception: parent dashboard silently refreshes data in background (current data, not stale). |
| **The coach avoids repeating recent phrasings** | All AI-generated text | Varied language within consistent patterns is what makes it feel human. MVP: last 2-3 coaching card messages included in LLM context window to prevent back-to-back repetition. v1.1: extend to last 7-10 interactions. v2.0: proper phrasing summary store for long-term variation. The most noticeable repetition is consecutive sessions — solve that first. |
| **Sessions have a maximum length** | All coaching sessions | Teen: nudge at 15min, cap at 20. Eager learner: nudge at 25, cap at 30. Coach advocates for quality over quantity. Not a hard cutoff — a coach-initiated wind-down. |
| **Consistent animation duration** | All transitions | 200-300ms. Fast enough to feel responsive, slow enough to track. Phase 1 fallback: crossfade over complex morph. |
| **Persona-aware everything** | All patterns | Every pattern checks persona token. Same behavior, different expression. |
| **Accessibility is structural** | All patterns | Patterns define ARIA roles, keyboard flow, screen reader behavior. Not an afterthought. |

## Component Strategy

### Design System Components (React Native Reusables)

Standard UI primitives available out of the box — styled via semantic design tokens, persona-themed automatically:

| Category | Components |
|----------|-----------|
| **Layout** | Card, Separator, Accordion, Collapsible, Tabs |
| **Forms** | Button, Input, Textarea, Checkbox, Radio Group, Select, Switch, Slider, Label |
| **Feedback** | Alert, Alert Dialog, Dialog, Toast, Progress, Skeleton, Badge |
| **Overlay** | Bottom Sheet, Popover, Dropdown Menu, Context Menu, Tooltip |
| **Data** | Avatar, Table, Toggle, Toggle Group |
| **Typography** | Text (with NativeWind styling) |

These cover ~80% of standard UI needs. All use semantic tokens (`bg-surface`, `text-primary`, `border-accent`), all persona-themed via CSS variable swap at login.

### Custom Components

Domain-specific components that make EduAgent, EduAgent. Refined based on code review: components sharing structure merged into hierarchies, monolithic components decomposed.

#### BaseCoachingCard (Component Hierarchy)

Four journey components share the same fundamental structure: AI-generated summary + primary action + secondary options. One base component, persona-differentiated through tokens. The card that opens a session is the same card that closes it — structural symmetry the user registers unconsciously.

```
BaseCoachingCard (layout, tokens, animation, skeleton loading)
├── CoachingCard (eager learner opening — recommendation + "Let's go")
├── AdaptiveEntryCard (child opening — context-aware headline + adaptive actions)
├── ParentDashboardSummary (parent — one-sentence summary + traffic lights + trend)
└── SessionCloseSummary (all personas — what stuck, when to return)
```

**BaseCoachingCard:**
- **Purpose:** Shared layout for all AI-initiated summary cards
- **Content:** Headline text (AI-generated), primary action button, secondary options (optional), metadata area (retention signals, temporal comparison)
- **States:** Loading (skeleton), Default, Expanded (with context explanation), Completed (transition out)
- **Props:** `persona` (teen/learner/parent), `context` (opening/closing/dashboard), `variant` (determines content layout)
- **Accessibility:** Screen reader announces headline, primary action is focus-default, skeleton state announced as "loading"
- **Animation:** Shared enter/exit animations across all variants. Persona-specific only in token values (colors, density), never in motion.

**CoachingCard variant (Eager Learner):**
- AI recommendation: "Electromagnetic forces are fading. 90-second refresh."
- Primary: [Let's go] / Secondary: [I have something else in mind]
- Subject context shown in metadata area

**AdaptiveEntryCard variant (Child):**
- Context-aware headline changes based on time/retention/patterns:
  - Homework-predicted: "Ready for homework?" → [Camera] / [Something else]
  - Gap-detected: "2 things fading — 4-minute refresh?" → [Sure] / [Just ask]
  - Post-test: "How'd the test go?" → [Let's go] / [Not now]
  - No-context fallback: "What do you need?" → [Homework] / [Practice] / [Just ask]
- Secondary options (three-button menu) live below the fold or in bottom nav — never the primary opening

**ParentDashboardSummary variant:**
- One-sentence summary per child: "Alex: Math strong, Science fading. 4 sessions this week (↑ from 2 last week)."
- Retention signals in metadata area (green/yellow/red with labels)
- Temporal comparison always visible (trend arrow + week-over-week)
- Tap to drill down

**SessionCloseSummary variant:**
- What stuck, what needs work, when AI will check back
- "Solid on this. I'll check in 4 days. Tomorrow: we connect this to something new."
- Bridge prompt (optional): "You struggled with [X] — want me to explain the pattern?"

---

#### Message Thread (Decomposed Chat System)

The original "Chat Conversation" component was doing too much — three variants, streaming, math rendering, Socratic formatting, and "AI talks first" all in one. Decomposed into a base thread + mode-specific wrappers. Changes to homework mode can't break practice mode.

```
MessageThread (base — rendering, streaming, scroll, input)
├── HomeworkChatWrapper (step-by-step guidance, integrity mode, Parallel Example inline)
├── PracticeChatWrapper (recall challenges, coaching loop formatting)
└── FreeformChatWrapper (open conversation, subtle coaching)
```

**MessageThread (Base):**
- **Purpose:** Renders message bubbles (AI/user), handles streaming indicator, scroll behavior, text input
- **Content:** Message list, streaming response animation, input area (text + camera trigger + voice trigger v1.1)
- **States:** Streaming (AI responding), Idle (waiting for user), Error (retry), Empty → never shown (AI always talks first — transition from CoachingCard into thread)
- **Key behavior:** AI messages always appear first. No blank chat state. Coaching card transitions into the first AI message.
- **Rendering:** Inline math (react-native-math-view or KaTeX for web), code blocks, bold/emphasis for Socratic questions
- **Accessibility:** Messages announced as they stream, input area labeled, retry action on error

**HomeworkChatWrapper:**
- Controls Socratic question flow (max 2-3 before Parallel Example)
- "Not yet" framing on incorrect answers (distinct styling — encouraging, never evaluative)
- **Phase 1 Parallel Example:** AI explains similar problem conversationally inline (no dedicated visual component needed yet)
- **Phase 2 upgrade:** Visual step-by-step Parallel Example View rendered inline in thread
- "I don't know" recognized as valid input → triggers Parallel Example immediately

**PracticeChatWrapper:**
- Recall challenges formatted distinctly (question card styling within thread)
- Coaching loop progress subtly visible (Recall → Build → Apply → Close, but never labeled)
- Timer for fluency drills (language learning)

**FreeformChatWrapper:**
- Minimal wrapper — mostly base MessageThread behavior
- Socratic coaching woven in subtly for child profiles (Homework Integrity enforced)
- Direct answers available for eager learner factual lookups

---

#### Camera Capture

- **Purpose:** Homework Fast Lane camera. Snapchat-style full-screen capture for photographing worksheets.
- **Content:** Camera viewfinder, capture button, retake/confirm actions, subject detection feedback
- **State machine:** Viewfinder → Captured (preview) → Processing (<3s) → Detected ("Got it. Quadratic equation.") → Error ("Can you retake with better lighting?")
- **Wraps:** expo-camera + custom overlay
- **Error recovery:** Uses shared ErrorRecovery pattern (see below). Tech-blame framing, never child's fault. After 2 failed attempts: "Want to type it out instead?"
- **Accessibility:** Capture button labeled, processing state announced, error state announced with recovery action
- **Architecture flag:** The <3s processing target (camera → OCR → subject classification → problem parsing) is the hardest technical promise in the product. Dedicated architecture spike needed.

---

#### Subject Retention Strip

- **Purpose:** Horizontal scrollable strip showing active subjects with retention status. Eager learner's subject switcher beneath coaching card.
- **Content:** Subject name, retention bar (visual fill), retention label (Strong/Fading/Weak)
- **States:** Default, Selected (active subject highlighted), Alert (subject needs attention — pulsing or accent border)
- **Built from:** Horizontal ScrollView + custom subject chips using design tokens
- **Accessibility:** Retention status announced per subject, not color-only (label + color)

---

#### Retention Signal

- **Purpose:** Universal retention indicator. Single source of truth for "how well do you know this" across parent dashboard, subject strip, Learning Book, and session close.
- **Content:** Color indicator + text label ("Strong" / "Fading" / "Weak" / "Forgotten")
- **States:** Strong (green), Fading (yellow), Weak (red), Forgotten (gray)
- **Variants:** Compact (icon + color, label on hover/tap), Full (color + text), Dashboard (color + text + trend arrow ↑↓→)
- **Accessibility:** NEVER color alone. Always paired with text label or icon. Colorblind-safe. This is a non-negotiable rule.

---

#### Parallel Example View (Phase 2 Visual Upgrade)

- **Purpose:** Photomath-style visual step-by-step breakdown for demonstrating method on a similar problem. Upgrades the conversational fallback from Phase 1.
- **Content:** Numbered steps with math/code rendering, sequential reveal (steps appear one at a time — pacing like a teacher at a whiteboard), "Now try yours" transition
- **States:** Presenting (steps revealing), Complete (all steps shown), Transition (returning to child's homework)
- **Built from:** Card + custom step layout + math renderer
- **Phase 1 fallback:** AI explains parallel example conversationally inline in MessageThread. Pedagogical pattern available from day one even without dedicated visual component.

---

#### Learning Book Entry

- **Purpose:** Topic entry in the learner's progress reference. Building block of the Learning Book.
- **Content:** Topic name, retention signal, last practiced date, session count, building-block connections (v1.1)
- **States:** Strong, Fading, Weak, Forgotten, Never-started
- **Variants:** Compact (list item), Expanded (with session history), Language (adds production vs recognition counts)

---

#### Recall Challenge

- **Purpose:** Quick recall question card (30-90 seconds). Used in practice sessions and post-homework bridge.
- **Content:** Question text, answer input (text or short production), timer (optional), feedback
- **States:** Presented, Answering, Correct ("Still strong"), Incorrect ("Let's revisit tomorrow"), Skipped
- **Key behavior:** Always skippable. Low pressure. "Not yet" framing on incorrect.

---

#### ErrorRecovery (New — From Code Review)

- **Purpose:** Shared pattern for all error and recovery states across the app. Ensures errors feel consistent and persona-appropriate.
- **Content:** Error message (persona-aware tone), recovery action(s), optional retry
- **Persona tone:**
  - Teen: casual, tech-blame ("Hmm, let me try that again")
  - Eager learner: straightforward, solution-focused ("Connection lost. Retrying...")
  - Parent: clear, reassuring ("We hit a hiccup. Your child's data is safe.")
- **States:** Transient (auto-retry with indicator), Actionable (user chooses recovery), Persistent (offline/unavailable — show cached state or clear message)
- **Used by:** Camera Capture (retake prompt), MessageThread (retry), Dashboard (loading failure), all network-dependent components

---

#### Profile Switcher

- **Purpose:** Parent/child profile switching in navigation
- **Built from:** Avatar + Dropdown Menu (both from React Native Reusables)
- **Content:** Current profile avatar/name, dropdown of available profiles, role indicator
- **Minimal custom work** — composition of existing primitives

### Theme Rule: Profile, Not Content

**Theme follows the logged-in profile, not the content being viewed.** A parent drilling into their child's session transcript sees it in parent theming (light, clean, high-trust). No jarring visual shifts mid-session. The child's experience uses teen theming only when the child is logged in.

This means: parent dashboard → tap child → tap session → view transcript — all rendered in parent theme throughout. The theme is "who am I?" not "whose data am I looking at?"

### Component Implementation Strategy

- All custom components built using NativeWind semantic tokens — no hardcoded colors or spacing
- Three-persona theming automatic via CSS variable swap at profile login
- BaseCoachingCard hierarchy shares skeleton loading, animation patterns, and layout structure — persona differentiation is ONLY through tokens
- MessageThread decomposition: base thread handles all rendering; wrappers control coaching logic. No wrapper can modify base rendering behavior.
- Every component defines ALL states explicitly — no "default only" components shipped
- Accessibility: every custom component gets ARIA labels, keyboard/VoiceOver support, never color-alone for status
- Components follow React Native Reusables copy-paste pattern (full code ownership, not npm dependency)

### Implementation Roadmap

**Phase 1 — MVP Critical** (core loop: open app → photograph homework → get help → session closes → parent sees proof):

| Component | Needed For | Notes |
|-----------|-----------|-------|
| BaseCoachingCard (AdaptiveEntry + SessionClose variants) | Journey 2, 4 — daily opening + coaching close | Foundation of entire UI. SessionCloseSummary completes the emotional arc ("I'll check Thursday") and triggers retention scheduling. |
| Camera Capture | Journey 4 — homework help (the first test) | <3s processing = architecture spike |
| MessageThread + HomeworkChatWrapper | Journey 4 — primary interaction surface | Parallel Example delivered conversationally (no visual component yet) |
| Retention Signal | Journeys 2, 3 — progress visibility everywhere | One source of truth, used by multiple components |
| ErrorRecovery | All journeys — consistent error handling | Shared pattern from day one |

_Party Mode revision: Profile Switcher removed from Phase 1. Parent uses separate web login for MVP — no profile switching needed. SessionCloseSummary added (near-zero cost as BaseCoachingCard variant, but architecturally necessary as retention scheduler trigger). Practice path and eager learner flow deferred. Prove homework help first._

**Phase 2 — MVP Complete** (full experience, visual polish):

| Component | Needed For | Notes |
|-----------|-----------|-------|
| PracticeChatWrapper + FreeformChatWrapper | Journey 2 — practice and freeform paths | Builds on MessageThread base |
| Parallel Example View | Journey 4 — visual upgrade for step-by-step | Upgrades conversational fallback from Phase 1 |
| Recall Challenge | Journey 4 — post-homework bridge | Valuable but core homework flow works without it |
| Learning Book Entry | Journey 2 — progress reference | Compact variant first, expanded later |
| ParentDashboardSummary (enhanced) | Journey 3 — full drill-down and drill-across | Basic version ships in Phase 1 via BaseCoachingCard |

**Phase 3 — Post-MVP Enhancement**:

| Component | Needed For | Notes |
|-----------|-----------|-------|
| Subject Retention Strip | Journey 2 — eager learner subject switching | Coaching card works without it; adds quick subject access |
| Learning Book Entry (expanded) | Journey 5 — production vs recognition, building blocks | Full knowledge graph visualization |
| SessionCloseSummary (enhanced) | All journeys — richer coaching close | Basic version ships in Phase 1 via BaseCoachingCard |

### Phase Changes from Code Review

| Change | Rationale |
|--------|-----------|
| Parallel Example View: keep Phase 2, but conversational fallback in Phase 1 | Pedagogical pattern available from day one via MessageThread. Visual upgrade in Phase 2. Best of both worlds. |
| Profile Switcher: moved Phase 2 → Phase 1 | Can't test parent-child relationship without it. Core to Journey 3. |
| Recall Challenge: moved Phase 1 → Phase 2 | Post-homework bridge feature. Core homework flow works without it. Profile Switcher is more critical. |
| **Party Mode revisions:** | |
| Profile Switcher: moved Phase 1 → Phase 2 | Party Mode review: parent uses separate web login for MVP. Profile switching not needed to prove homework flow. |
| SessionCloseSummary: confirmed Phase 1 (via BaseCoachingCard variant) | Completes emotional arc, triggers retention scheduler. Near-zero cost as existing variant. |
| FreeformChatWrapper: deferred consideration | Two entry points for children sufficient for MVP. Freeform handled within existing paths. |

### Architecture Flags from Component Strategy

| Flag | Component | Requirement |
|------|-----------|-------------|
| <3s camera processing pipeline | Camera Capture | OCR + subject classification + problem parsing — dedicated architecture spike |
| Coaching card precomputation | BaseCoachingCard | Background job on session close generates next opening. Must be fast enough for instant display. |
| Theme context management | All | Profile-based theme switching. Parent viewing child data stays in parent theme. |
| Math rendering cross-platform | MessageThread, Parallel Example View | react-native-math-view (native) or KaTeX (web) — needs Expo compatibility verification |

## Responsive Design & Accessibility

_EduAgent is built with Expo (React Native) for iOS, Android, and Web. Mobile is the primary platform. This section defines how the app adapts across devices and ensures accessibility for all learners, including those with disabilities._

### Responsive Strategy

**Mobile-First, Not Mobile-Also.**

The primary experience is a phone screen held by a teenager doing homework. Every design decision starts here. Web and tablet are adaptations, not the other way around.

| Platform | Priority | Strategy |
|----------|----------|----------|
| **Mobile (iOS/Android)** | Primary | Touch-first, camera-integrated, full feature set. This IS the product. |
| **Web (Expo Web)** | Secondary | Same components via React Native Web. Conversation-focused. Useful for parents on desktop and learners who prefer keyboard. |
| **Tablet** | Tertiary (v2.0) | Larger touch targets, more visible content, same single-column coaching flow. |

**Why Single-Column Everywhere (MVP):**

The coaching card → conversation flow is inherently single-column. Adding side panels on larger screens adds complexity without improving the core interaction. The conversation IS the product — it needs focus, not more space.

Post-MVP: tablet/desktop could show Learning Book as a side panel alongside conversation. But MVP ships single-column on all platforms.

### Platform-Specific Adaptations

**Mobile (Primary):**
- Bottom navigation (3 items)
- Camera integration (Homework Fast Lane)
- Swipe gestures for dismissal (coaching card, sheets)
- System font size respected (Dynamic Type on iOS, font scale on Android)
- Safe area insets handled (notch, home indicator, status bar)
- Keyboard-aware: input fields shift above keyboard, conversation scrolls

**Web (Secondary):**
- Bottom nav moves to left sidebar (standard web pattern)
- **Camera adaptation:** Don't degrade mobile — adapt to platform strength. Web users have a keyboard. "Type or paste your homework question" is primary, "Or upload a photo" is secondary. The keyboard is web's superpower; camera is mobile's.
- No swipe gestures — click/hover interactions
- Max content width: 720px centered (conversation readability), 960px for dashboard
- Keyboard shortcuts: Enter to send, Escape to dismiss
- Mouse hover states on interactive elements

**Tablet (v2.0):**
- Same layout as mobile with increased padding and touch targets
- Potential: side panel for Learning Book during conversation (post-MVP)
- Camera works natively (same as mobile)
- Landscape: conversation centered, increased side margins

### Breakpoint Strategy

NativeWind v4 responsive breakpoints for EduAgent:

| Breakpoint | Range | Layout |
|------------|-------|--------|
| **sm** (default) | <640px | Mobile — single column, bottom nav, full-width cards |
| **md** | 640-1024px | Tablet — same layout, increased padding, larger touch targets |
| **lg** | >1024px | Web desktop — left sidebar nav, centered content (max 720px), hover states |

**Font Scale Responsiveness (Separate Axis):**

Font scale is a different axis than screen size. A small Android phone at 200% system font is a fundamentally different layout challenge than a large tablet at 100%.

| Font Scale | Coaching Card Behavior |
|------------|----------------------|
| 100-125% | Default layout — headline, buttons inline, secondary text beneath |
| 125-175% | Buttons go full-width (stacked vertically), secondary text wraps |
| 175-200% | Card becomes scrollable if content exceeds viewport. No truncation. |

Implementation: custom hook that reads system font scale and adjusts layout. NativeWind's responsive utilities handle screen size; a `useFontScale()` hook handles the orthogonal font scale dimension.

### Typography Revision

**Supersedes Step 8 Inter recommendation.**

Inter was recommended for its screen legibility, wide weight range, and LLM training data coverage. However, code review flagged a real tension: Inter is the most overused font in modern apps — the generic "AI aesthetic." For a product targeting children and learners (including those with dyslexia), we can do better.

**Revised approach: Atkinson Hyperlegible (body) + distinctive display font (headings/coaching card).**

| Role | Font | Rationale |
|------|------|-----------|
| **Body text** | Atkinson Hyperlegible | Designed by the Braille Institute specifically for low-vision and dyslexic readers. Free. Has enough character to not feel generic. Excellent legibility at all sizes. |
| **Display/Headings** | TBD during design phase | Distinctive brand font for coaching card headlines, section headers, and brand-forward moments. Must pair well with Atkinson. Candidates: a humanist sans-serif with personality. |
| **Monospace** (code examples) | System monospace | Only needed for programming subject content. Default system font. |

**Why this works:**
- Body text (where dyslexia matters most) gets a font purpose-built for readability
- Headlines and coaching card (where brand matters most) get a distinctive display font
- The combination avoids the "generic AI app" aesthetic while being more accessible than Inter
- Atkinson Hyperlegible is open source, well-documented, and has LLM training data coverage

**Type scale remains unchanged** (Step 8 values hold — the sizes and line heights are font-independent).

### Accessibility Strategy

**WCAG 2.1 AA Compliance — phased realistically.**

This app serves children, including children with learning disabilities. Accessibility is a requirement, not a nice-to-have. But the team is small (LLM-driven, two non-coders). The strategy phases accessibility by effort vs. impact.

#### Accessibility Phasing

**MVP (costs almost nothing — already baked into design decisions):**

| Item | Status | Notes |
|------|--------|-------|
| Color + label on all status indicators | Designed | Retention Signal component: never color alone |
| 44px+ touch targets (48px teen) | Designed | Defined in token set, enforced in component specs |
| System font scale respect | Required | Dynamic Type (iOS), font scale (Android) |
| Clear simple language | Designed | Teen-proof copy, conversational buttons |
| "Not yet" framing | Designed | Universal across all error/incorrect states |
| No color-alone information | Designed | Cross-pattern rule |
| Atkinson Hyperlegible body font | Required | Dyslexia-friendly by default |
| Camera text-input fallback | Designed | "Want to type it out?" always available |

These cost zero extra development time — they're good design decisions already made.

**v1.1 (moderate effort, required for scale):**

| Item | Effort | Notes |
|------|--------|-------|
| VoiceOver/TalkBack basic support | Medium | `accessibilityRole`, `accessibilityLabel` on all interactive elements |
| Reduced motion respect | Low | Check `prefers-reduced-motion`, use crossfade instead of morph |
| Screen reader streaming chunks | Medium | Announce AI responses in sentence/paragraph chunks, not all-at-once |
| Sprint-end accessibility walkthrough | Low | Repeatable checklist, not per-PR testing |

**v2.0 (significant effort, operational maturity):**

| Item | Effort | Notes |
|------|--------|-------|
| Full WCAG AA audit | High | Third-party audit recommended |
| Automated accessibility testing pipeline | Medium | `eslint-plugin-react-native-a11y` + contrast checking in CI |
| RTL language support | Medium | Arabic, Hebrew. Use `start/end` tokens from day one (see below) |
| Quarterly user testing with neurodiverse participants | Ongoing | Include learners with dyslexia, ADHD in usability testing |
| Full keyboard navigation (web) | Medium | Tab order, focus management, skip-to-content |

#### Visual Accessibility

| Requirement | Standard | EduAgent Implementation |
|-------------|----------|------------------------|
| **Text contrast** | 4.5:1 (normal), 3:1 (large text) | All persona themes must pass. Critical for teen dark mode and parent dashboard status colors. |
| **Retention signals** | Never color alone | Color + text label always. Colorblind-safe by design. |
| **Font scaling** | Support system font size | Dynamic Type / font scale respected. Coaching card degrades gracefully at 200% (see breakpoint strategy). |
| **Minimum font size** | 12px absolute minimum | Body 16px, caption 12px. Never below 12px. |
| **Motion** | Respect prefers-reduced-motion | All transitions: crossfade fallback when reduced motion enabled. |
| **Focus indicators** | Visible on all interactive elements | Custom focus ring using accent token. Never remove default focus. |

#### Cognitive Accessibility

The most important accessibility dimension for EduAgent.

| Requirement | Implementation |
|-------------|---------------|
| **Clear, simple language** | Teen-proof copy. No jargon. Conversational buttons. |
| **Predictable navigation** | Coaching card → conversation. Same pattern every session. |
| **Error recovery** | "Not yet" framing. Camera retry. Text fallback. Never punitive. |
| **Minimal cognitive load** | One card, no decisions. AI leads. |
| **Session length management** | Coach-initiated wind-down (15/25 min). Prevents fatigue. |
| **Reading support** | Atkinson Hyperlegible at 16px body. Short paragraphs. 1.5 line height. Left-aligned (never justified). |
| **ADHD-friendly** | Short sessions (5-20 min). One task per card. Clear session close. No infinite scroll. |

#### Screen Reader Support

| Component | Screen Reader Behavior |
|-----------|----------------------|
| **Coaching card** | Announces: recommendation text → primary action → secondary options |
| **AI streaming response** | Announces in **sentence/paragraph chunks** as they complete streaming — not token-by-token (too noisy) and not all-at-once (too long a silence). Progressive disclosure for screen reader users matches sighted users watching text stream in. |
| **Retention signal** | Announces: "[Subject] retention [Strong/Fading/Weak]" — never just color |
| **Camera capture** | "Camera ready. Double-tap to capture." → "Processing image." → "Detected: [subject]." |
| **Navigation** | Standard tab order: top bar → content → bottom nav. Skip-to-content on web. |
| **Error recovery** | Announces error message + recovery action |

#### RTL Readiness (v2.0 — Prepare Now)

Arabic and Hebrew speakers are in the potential user base (language learners, children across countries). React Native has decent RTL support via `I18nManager`, NativeWind handles RTL via Tailwind's `rtl:` prefix.

**Don't implement for MVP. Do prepare:**
- Use `start`/`end` instead of `left`/`right` in all spacing tokens and layout code from day one
- No hardcoded directional values (`paddingLeft`, `marginRight`) — use `paddingStart`, `marginEnd`
- NativeWind: use `ps-4` (padding-start) not `pl-4` (padding-left)
- This costs nothing now and prevents a painful retrofit when RTL ships

#### Dark Mode Matrix (Beyond Teen Persona)

The teen persona defaults to dark, but what about eager learners or parents who have system-level dark mode enabled? The app should respect system dark mode preference for ALL personas.

**Theme matrix (define now, ship fixed per-persona for MVP):**

| Persona | Default | With System Dark Mode |
|---------|---------|----------------------|
| **Teen** | Dark | Dark (already matches) |
| **Eager learner** | Light (calm, spacious) | Dark variant: calm, spacious but dark background. Desaturated accent. |
| **Parent** | Light (clean, high-trust) | Dark variant: clean, high-trust on dark background. Status colors adjusted for dark contrast. |

**MVP:** Ship fixed themes per persona (teen=dark, learner=light, parent=light). System dark mode preference ignored for MVP — the persona theme takes precedence.

**v1.1:** Respect system dark mode. Each persona has light and dark variants. 3 personas × 2 color schemes = 6 theme configurations. All using the same semantic token set — just different values per configuration.

This means the semantic token set defined in Step 6 needs 6 value sets instead of 3. The token names stay identical; the values change. NativeWind's CSS variables handle this cleanly.

### Testing Strategy (Realistic for Team Size)

**Automated (Every Build):**
- Accessibility linting: `eslint-plugin-react-native-a11y`
- Contrast ratio checking against all persona themes
- Touch target size validation (no interactive element < 44px)
- Font scale screenshot comparison at 100%, 150%, 200%

**Sprint-End Walkthrough (Not Per-PR):**

A full VoiceOver/TalkBack walkthrough at the end of each sprint or feature milestone. Documented as a repeatable checklist:

1. Open app → coaching card announced correctly?
2. Navigate to homework → camera announced?
3. Complete a homework session → all AI messages announced in chunks?
4. Check parent dashboard → retention signals announced with labels?
5. Profile switch → new persona announced?
6. Error state → recovery action announced?

This is sustainable for a small team. Per-PR screen reader testing is aspirational but unrealistic — automated linting catches the obvious issues, sprint-end walkthrough catches the subtle ones.

**User Testing (v2.0, Quarterly):**
- Include learners with dyslexia and ADHD
- Test with parents over 50 (dashboard visual accessibility)
- Test on budget Android phones (not just latest iPhone)
- Validate cognitive accessibility accommodations

### Implementation Guidelines

| Guideline | Detail |
|-----------|--------|
| **Semantic components** | `accessibilityRole`, `accessibilityLabel`, `accessibilityHint` on every interactive element |
| **RTL-ready spacing** | `start`/`end` not `left`/`right`. `ps-4` not `pl-4`. From day one. |
| **Font scale hook** | Custom `useFontScale()` hook for layout adjustments beyond NativeWind breakpoints |
| **System preferences** | Respect font scale and reduced motion. Dark mode: fixed per-persona for MVP, system-aware for v1.1. |
| **Max content width** | Web: 720px conversation, 960px dashboard. Never full-width on desktop. |
| **Touch targets** | `min-h-11 min-w-11` (44px) minimum. `min-h-12 min-w-12` (48px) for teen. |
| **Color + label** | Every colored status must have text label. Enforce via code review and linting. |
| **Focus management** | Coaching card → conversation: focus moves to first AI message. Session close: focus returns to coaching card. |
| **No keyboard traps** | Escape always dismisses overlays. Tab order is logical. |
| **Web homework entry** | "Type or paste your question" primary, "Upload a photo" secondary. Adapt to platform strength. |

### Parked: Updates from Responsive & Accessibility

| # | Change | Impact |
|---|--------|--------|
| 20 | Typography: Atkinson Hyperlegible replaces Inter for body text | Supersedes Step 8 Inter recommendation. Display font TBD. |
| 21 | Dark mode matrix: 3 personas × 2 color schemes | Step 6 token set needs 6 value configurations (v1.1) |
| 22 | RTL-ready spacing tokens | Use start/end from day one across all code |
| 23 | Web homework entry: keyboard-primary, photo-secondary | Platform-adaptive entry point |
| 24 | Font scale degradation behavior | Custom hook + coaching card stacking rules |
| 25 | Confidence scoring per problem | Process visibility for parents ("3 guided, 2 immediate"). AI coaching adaptation for low-confidence topics. |
| 26 | Model routing by conversation state | Fastest model first, escalate at Parallel Example / Teaching Mode rungs |
| 27 | Coaching card two-path loading | Cached (<1s) vs fresh (1-2s skeleton) with context-hash freshness |
| 28 | Phase 1 rescoped to homework-only proving flow | Profile Switcher deferred, SessionCloseSummary added, two child entry points |

---

## Gap Remediation Specs (Added 2026-02-23)

_These sections address UX gaps identified during persona walkthroughs. Each follows the existing wireframe format with behavior notes, failure states, and component references._

### Post-Approval Child Landing Screen

**Context:** Journey 1 (Onboarding) — after parent approves GDPR/COPPA consent.

**Actor:** Child (11-15) who was previously blocked by ConsentPendingGate.

**Goal:** Celebrate approval and smoothly resume onboarding flow without confusion.

**Trigger:** Child opens app AND `consentStatus` has transitioned from `PENDING` or `PARENTAL_CONSENT_REQUESTED` to `CONSENTED` since last app open. Detected by comparing stored previous consent status (AsyncStorage key: `lastKnownConsentStatus_{profileId}`) with current profile `consentStatus`.

**Screen: PostApprovalLanding**

```
┌─────────────────────────────────┐
│                                 │
│         🎉 (celebratory)       │
│                                 │
│     You're approved!            │
│     Time to start learning.     │
│                                 │
│     Your parent said yes —      │
│     let's set up your first     │
│     subject.                    │
│                                 │
│   ┌───────────────────────┐     │
│   │      Let's Go →       │     │
│   └───────────────────────┘     │
│                                 │
└─────────────────────────────────┘
```

**Behavior:**

| State | Behavior |
|-------|----------|
| First time seeing this screen | Show once per profile. Track via AsyncStorage `postApprovalSeen_{profileId}` = `true`. |
| Child already completed onboarding | Skip directly to Home. Check: profile has at least one subject. |
| "Let's Go" tap | Navigate to Intent Screen (same as first-time user flow in Journey 1, Step 4). |
| Already seen flag is set | Skip to normal learner layout. Never show again. |

**Failure States:**

1. **Consent approved but app was already open (hot reload):** AsyncStorage check + profile refetch on app foreground event (`AppState.addEventListener`). If consent changed while app was backgrounded, show landing on next foreground.
2. **AsyncStorage write fails:** Fallback: show normal Home. Worst case: user sees the celebratory screen twice. Acceptable degradation.

**Implementation Notes:**
- Location: `apps/mobile/src/app/(learner)/_layout.tsx` — inserted between consent gate check and normal Tabs rendering.
- Component: `PostApprovalLanding` (inline in layout or separate component file).
- State tracking: AsyncStorage, not DB — this is transient one-time UI state.
- Accessibility: celebration text has `accessibilityRole="header"`, CTA button meets 44px minimum touch target.

**FRs:** Extension of FR9 (consent approval flow — child-side experience).

---

### Parent Account-Owner Landing (Browser Flow)

**Context:** Journey 1 (Onboarding) — parent clicks consent approval link from email.

**Actor:** Parent who received consent request email for their child.

**Goal:** Confirm consent and understand next steps after approval.

**Trigger:** Parent clicks `{APP_URL}/consent?token={token}` from email → `POST /v1/consent/respond` processes approval → redirect to this landing page.

**Page: ConsentApprovalLanding (Web)**

_This is a server-rendered HTML page, not a mobile screen. Served by the API or a static hosting path._

```
┌─────────────────────────────────────┐
│  EduAgent logo                      │
│                                     │
│  Family account ready!              │
│                                     │
│  [Child's name]'s account is now    │
│  active. They can start learning    │
│  right away.                        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  See [Child]'s Progress  →  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Start My Own Learning   →  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Close                      │    │
│  └─────────────────────────────┘    │
│                                     │
│  📱 Download the app for the best   │
│     experience → [App Store] [Play] │
│                                     │
└─────────────────────────────────────┘
```

**Behavior:**

| Action | Result |
|--------|--------|
| "See [Child]'s Progress" | Deep link to app (`eduagent://parent/dashboard`). If app not installed, redirect to app store. |
| "Start My Own Learning" | Deep link to app (`eduagent://onboarding?persona=learner`). If app not installed, redirect to app store. |
| "Close" | Show "You can close this tab" message. |
| Consent denied | Different page: "Consent declined. [Child]'s account will be removed. If this was a mistake, contact support." |
| Token expired/invalid | Error page: "This link has expired or is invalid. Ask your child to resend the consent request from the app." |
| Token already used | Show success page anyway (idempotent — parent may revisit the email link). |

**Failure States:**

1. **Parent doesn't have app installed:** All CTAs fall back to app store links. Smart app banner at top for iOS/Android detection.
2. **Deep link fails:** All deep links have `https://` fallback that redirects to app store.

**Implementation Notes:**
- Location: New route in `apps/api/src/routes/consent.ts` — `GET /consent` serves HTML page (or redirect).
- The current `POST /v1/consent/respond` already handles the approval logic. The landing page is a GET endpoint that renders after the POST succeeds.
- Minimal HTML page — no React, no framework. Use inline CSS with the parent theme colors.
- Smart App Banner: `<meta name="apple-itunes-app">` for iOS, Play Store intent for Android.
- May be deferred if the current email→API JSON response flow is sufficient for MVP. The current flow returns JSON, which is not user-friendly in a browser.

**FRs:** Extension of FR9 (consent response — parent-side browser experience).

---

### Child-Friendly Paywall

**Context:** Subscription & Billing — when a child's subscription expires or trial ends.

**Actor:** Child learner whose account's subscription has expired (detected: `subscription_status` is `expired` or `trialing_ended` AND profile has `accountOwnerId !== profileId`).

**Goal:** Convert trial/expired children to paid subscriptions through parent notification, not direct payment. Maintain engagement and preserve learning motivation.

**Screen: ChildPaywall (variant of SubscriptionScreen)**

```
┌─────────────────────────────────┐
│  ← Back                        │
│                                 │
│  Nice work so far!              │
│                                 │
│  You learned 4 topics and       │
│  earned 120 XP — keep going!    │
│                                 │
│  Your free trial has ended.     │
│  Ask your parent to continue    │
│  your learning journey.         │
│                                 │
│  ┌───────────────────────┐      │
│  │  Notify My Parent  →  │      │
│  └───────────────────────┘      │
│                                 │
│  While you wait, you can        │
│  still browse your Learning     │
│  Book and see your progress.    │
│                                 │
│  ┌───────────────────────┐      │
│  │  Browse Learning Book  │      │
│  └───────────────────────┘      │
│                                 │
└─────────────────────────────────┘
```

**Behavior:**

| State | Behavior |
|-------|----------|
| "Notify My Parent" tap | Sends push notification + email to account owner (parent). Rate limited: 1 notification per 24 hours per child profile. |
| Already notified (within 24h) | CTA changes to "Parent notified ✓" (disabled). Show time until re-send: "You can remind them again in X hours." |
| Notification success | Toast: "We let your parent know!" |
| While waiting | Read-only access to Learning Book, progress/achievements. Sessions and write operations blocked. |
| "Browse Learning Book" tap | Navigate to `/(learner)/book`. |
| Parent subscribes | Paywall disappears on next API call. TanStack Query invalidation refreshes subscription status. |

**Parent Notification Content:**

- **Push notification:** "[Child] wants to keep learning! They've mastered 4 topics and earned 120 XP. Subscribe to continue their journey."
- **Email template:** Child stats summary (topics learned, XP earned, streak, retention signals) + "Subscribe Now" CTA → Stripe Checkout link. Same Resend email infrastructure as consent emails.

**Failure States:**

1. **Parent push token not registered:** Fall back to email only. Email always sent regardless of push availability.
2. **Rate limit hit:** Disable button, show countdown. Never allow spam.
3. **No parent email on file:** Show "Ask your parent to open the app and subscribe" (in-person prompt).

**Design Guardrails:**
- **No pricing display for children.** No tier labels, no dollar amounts, no payment forms.
- **Coaching voice throughout.** Encouraging, not commercial. The tone is "you've done great, here's how to keep going" not "your trial ended, pay up."
- **No dark patterns.** No urgency countdowns, no "your progress will be lost" threats. The child's Learning Book data persists regardless.

**Implementation Notes:**
- Location: `apps/mobile/src/app/(learner)/subscription.tsx` — add child detection at top of component. If `isChild`, render `ChildPaywall` variant instead of standard `SubscriptionScreen`.
- Child detection: `activeProfile.accountOwnerId !== activeProfile.id` (child profiles have a parent account owner).
- Notification endpoint: New `POST /v1/notifications/parent-subscribe` (or extend existing notification service).
- Rate limiting: Check `notification_preferences` or a new `parent_notifications` table for last sent timestamp.

**FRs:** Extension of FR96-FR107 (subscription management — child-appropriate variant).

---

### GDPR Consent Revocation

**Context:** Journey 1 (Onboarding) — consent management, parent-initiated.

**Actor:** Parent who previously approved GDPR/COPPA consent for their child.

**Goal:** Allow parent to withdraw consent, triggering a graceful data deletion process with a safety window for reversal.

**Entry Point:** Parent dashboard → child management area → "[Child]'s Account" → "Withdraw Consent"

**Flow:**

1. **Parent taps "Withdraw Consent"**
   - Confirmation dialog:
     ```
     ┌────────────────────────────────┐
     │  Withdraw consent for [Child]? │
     │                                │
     │  [Child]'s account and all     │
     │  learning data will be deleted │
     │  after a 7-day grace period.   │
     │                                │
     │  You can reverse this within   │
     │  7 days.                       │
     │                                │
     │  [Cancel]    [Withdraw]        │
     └────────────────────────────────┘
     ```

2. **After confirmation: `PUT /v1/consent/:childProfileId/revoke`**
   - Sets `consentStates.status = 'WITHDRAWN'`
   - Records `revokedAt` timestamp
   - Dispatches Inngest event: `app/consent.revoked`

3. **Grace period (7 days):**
   - Child sees in-app message: "Your parent has withdrawn consent. Your account will be deleted on [date]."
   - Child's access is fully blocked (like ConsentPendingGate but with different messaging).
   - Parent sees "[Child]'s account — deletion pending (X days remaining)" with "Cancel Deletion" button.

4. **Parent reversal (within 7 days):**
   - "Cancel Deletion" → `PUT /v1/consent/:childProfileId/restore`
   - Sets `consentStates.status = 'CONSENTED'`, clears `revokedAt`
   - Cancels Inngest scheduled deletion
   - Child regains full access immediately

5. **After 7 days: Inngest function executes cascade delete**
   - Same pattern as existing `account-deletion` Inngest function
   - All child data deleted: profile, sessions, subjects, retention cards, summaries, XP, etc.
   - Audit log entry created before deletion
   - Parent receives confirmation email: "[Child]'s data has been permanently deleted."

**Audit Trail:**

| Event | Logged |
|-------|--------|
| Consent initially granted | `consentStates` row, timestamp |
| Consent revoked | `consentStates.status = 'WITHDRAWN'`, `revokedAt` |
| Revocation reversed | `consentStates.status = 'CONSENTED'`, `revokedAt` cleared |
| Deletion executed | Separate audit log (or Inngest event history) |

**Failure States:**

1. **Parent revokes but child is mid-session:** Session ends gracefully. Child sees blocked screen on next navigation.
2. **7-day Inngest function fails:** Retry with exponential backoff (Inngest default). If still failing after 3 retries, alert ops. Data must be deleted — GDPR compliance.
3. **Parent tries to restore after 7 days:** Error: "Deletion is complete and cannot be reversed. You can create a new account for [Child]."

**Child-Side Blocked Screen:**

```
┌─────────────────────────────────┐
│                                 │
│     Account deletion pending    │
│                                 │
│     Your parent has withdrawn   │
│     consent for your account.   │
│                                 │
│     Your data will be deleted   │
│     on [date].                  │
│                                 │
│     If you think this is a      │
│     mistake, ask your parent    │
│     to cancel the deletion.     │
│                                 │
│   ┌───────────────────────┐     │
│   │     Sign out           │     │
│   └───────────────────────┘     │
│                                 │
└─────────────────────────────────┘
```

**Implementation Notes:**
- API: New routes in `apps/api/src/routes/consent.ts` — `PUT /v1/consent/:childProfileId/revoke` and `PUT /v1/consent/:childProfileId/restore`.
- Service: New functions in `apps/api/src/services/consent.ts` — `revokeConsent()` and `restoreConsent()`.
- Inngest: Reuse `account-deletion` pattern — schedule deletion 7 days out, cancellable via Inngest function cancellation.
- Mobile: Extend `ConsentPendingGate` to detect `WITHDRAWN` status and show deletion-specific messaging.
- Parent dashboard: Add "Withdraw Consent" button to child management area.

**FRs:** Extension of FR11 (account/data deletion — parent-initiated for child), FR7-FR10 (consent lifecycle).

---

### Preview Mode on Pending-Consent Screen

**Context:** Journey 1 (Onboarding) — while child waits for parental consent.

**Actor:** Child (11-15) who completed registration but is blocked by `ConsentPendingGate`.

**Goal:** Maintain engagement during the consent waiting period by offering a read-only preview of the app, reducing the risk of abandonment before parent approves.

**Current State:** `ConsentPendingGate` shows a full-block screen with "Waiting for approval" message, "Check again" button, "Resend email" button, and sign-out.

**Proposed Enhancement:** Add a "Preview while you wait" section below the existing buttons.

**Screen: ConsentPendingGate (Enhanced)**

```
┌─────────────────────────────────┐
│                                 │
│     Waiting for approval        │
│                                 │
│     We sent an email to         │
│     parent@example.com.         │
│     Once they approve, you'll   │
│     have full access.           │
│                                 │
│   ┌───────────────────────┐     │
│   │     Check again        │     │
│   └───────────────────────┘     │
│   ┌───────────────────────┐     │
│   │     Resend email       │     │
│   └───────────────────────┘     │
│                                 │
│   ─── While you wait ──────    │
│                                 │
│   Here's a preview of what      │
│   you'll learn:                 │
│                                 │
│   ┌───────────────────────┐     │
│   │ 📚 Browse subjects     │     │
│   │    See what you can    │     │
│   │    learn               │     │
│   └───────────────────────┘     │
│   ┌───────────────────────┐     │
│   │ 🎯 Sample coaching     │     │
│   │    See how your coach  │     │
│   │    works               │     │
│   └───────────────────────┘     │
│                                 │
│   [Switch profile] [Sign out]   │
│                                 │
└─────────────────────────────────┘
```

**Preview Content:**

| Feature | Available in Preview | Notes |
|---------|---------------------|-------|
| Curriculum browser | ✅ Read-only | Browse available subjects and their topic lists. No subject creation. |
| Sample coaching card | ✅ Static | Pre-built example coaching card showing what daily experience looks like. |
| Learning path overview | ✅ Static | Example learning path with mock topics showing how progress works. |
| Start a session | ❌ Blocked | "You'll be able to start learning once your parent approves." |
| Create a subject | ❌ Blocked | Subject creation requires full access. |
| Camera/homework | ❌ Blocked | Requires active session capability. |
| Settings | ❌ Blocked | No write operations during preview. |

**Behavior:**

| State | Behavior |
|-------|----------|
| "Browse subjects" tap | Open a read-only curriculum browser modal/sheet showing available subject categories (Math, Science, Languages, etc.) with sample topic lists. |
| "Sample coaching" tap | Show a static coaching card example with explanatory callouts: "This is your daily opening — your coach will know what you need." |
| Subject created during onboarding (pre-consent) | If a subject exists on the profile, show it in the preview with its curriculum. |
| Consent approved while in preview | Query invalidation detects status change. `ConsentPendingGate` unmounts, normal layout renders. If `PostApprovalLanding` conditions met, show that first. |

**Failure States:**

1. **Preview data fails to load:** Preview section simply doesn't render. Core consent gate still works. Preview is progressive enhancement.
2. **Child tries to navigate past preview:** All preview screens are modal/sheet — no tab navigation, no route changes. Dismissing returns to consent gate.

**Implementation Notes:**
- Location: `apps/mobile/src/app/(learner)/_layout.tsx` — enhance existing `ConsentPendingGate` component.
- Preview content is static/hardcoded — no API calls needed for curriculum browser preview. This keeps it fast and independent of auth state.
- Sample coaching card: reuse `CoachingCard` component with hardcoded props (headline, subtext, actions that show "Available after approval" toast).
- The "Browse subjects" feature can use a simple `ScrollView` with hardcoded subject categories, not the real API.
- Keep the existing gate behavior (Check again, Resend, Switch profile, Sign out) — preview is additive, not a replacement.

**FRs:** UX enhancement for FR7/FR8 waiting period (consent pending experience).
