---
created: '2025-12-13'
source: 'PRD Appendix - User Story Summaries'
status: 'pending-epics-phase'
---

# Epics Inputs - EduAgent

**Purpose:** Epic-level planning content captured during PRD refinement. To be validated, expanded, and refined during Epics & Stories phase.

**Source:** PRD Appendix (moved to preserve work while keeping PRD focused on requirements)

---

## Epic 0: Registration & Account Setup

**Primary Actors:** New users, parents, family members

**Core Capabilities:**
- Multi-method authentication (email, Google, Apple)
- Family account management with multi-profile support
- GDPR parental consent workflow
- Parent access to child profiles

**Representative Stories:**
- As a new user, I want to sign up with Apple/Google/email so I can create an account using my preferred method
- As a user aged 11-15 in EU, I want my parent to approve my account so I comply with GDPR
- As a parent, I want to receive email to approve my child's account so my child can use the app with consent
- As a parent, I want to switch into my child's profile so I can review conversations and progress
- As a family, I want to share one subscription across multiple profiles so we don't pay separately

**Success Indicators:**
- >90% registration completion rate
- Parental consent approval within 24 hours
- Family accounts represent >20% of premium subscribers

---

## Epic 1: Onboarding & Interview

**Primary Actors:** New users completing initial setup

**Core Capabilities:**
- Conversational interview for goal/background assessment
- Dynamic curriculum generation for any subject
- Curriculum review and customization
- Intent selection (learn new vs homework help)

**Representative Stories:**
- As a new user, I want to tell AI what I want to learn (any subject) so I get personalized content
- As a new user, I want a short interview conversation so AI understands my goals and level
- As a new user, I want to see my AI-generated learning path so I understand the journey ahead
- As a new user, I want to skip topics I already know so I don't waste time on basics
- As a new user, I want to start my first lesson immediately so I experience value in first session

**Success Indicators:**
- >60% complete onboarding
- >80% start first lesson within 24 hours
- Curriculum challenge rate <10% (high acceptance)

---

## Epic 2: Learning Experience

**Primary Actors:** Learners in active teaching sessions

**Core Capabilities:**
- Real-time conversational teaching with AI
- Adaptive explanations based on understanding
- Prior knowledge context injection
- Mandatory user production (summaries)
- Homework integrity mode (Socratic guidance)

**Representative Stories:**
- As a learner, I want to chat with AI about my current topic so I learn through conversation
- As a learner, I want AI to remember what I learned before so I don't repeat basics
- As a learner, I want to write a summary in my own words at chapter end so I retain knowledge
- As a learner, I want to get help with homework without AI giving me the answer so I learn to solve problems myself
- As a parent, I want to see that AI guided my child through homework, not solved it for them, so I trust the app isn't enabling cheating

**Success Indicators:**
- >70% session completion (don't abandon mid-topic)
- >80% submit user-written summaries
- Parent trust score >4.5/5 for homework integrity

---

## Epic 3: Assessment & Retention

**Primary Actors:** Learners verifying understanding

**Core Capabilities:**
- In-lesson quick checks and quizzes
- Topic completion assessments
- Delayed recall testing (spaced repetition)
- Detailed feedback on reasoning errors
- Mastery level tracking

**Representative Stories:**
- As a learner, I want to be quizzed during lessons so I confirm understanding
- As a learner, I want to explain my reasoning, not just give answers, so AI catches my first error in thinking
- As a learner, I want to get feedback on WHERE I went wrong (not just "wrong") so I know exactly what to fix
- As a learner, I want to see my mastery level per topic so I know what I've mastered
- As a learner, I want to request a re-test on old topics so I verify retention

**Success Indicators:**
- >50% pass delayed recall tests (2 weeks)
- >40% pass delayed recall tests (6 weeks)
- Mastery scores correlate with retention

---

## Epic 4: Progress & Motivation

**Primary Actors:** Learners tracking progress and maintaining engagement

**Core Capabilities:**
- Learning Book for reviewing past topics
- Honest streak (recall-based, not app opens)
- Retention XP (verified after delayed recall)
- Knowledge decay visualization
- Progress tracking through curriculum

**Representative Stories:**
- As a learner, I want to see my progress through the path so I feel accomplishment
- As a learner, I want to see my knowledge decay over time so I know what needs review
- As a learner, I want to earn verified XP from recall tests so XP reflects real knowledge
- As a learner, I want to maintain an honest streak so I stay motivated to review
- As a learner, I want to get reminded to review fading topics so I maintain my knowledge

**Success Indicators:**
- >30% maintain 7-day honest streak
- >20% maintain 30-day honest streak
- Users review fading topics within 48 hours of reminder

---

## Epic 5: Subscription

**Primary Actors:** Users managing payment and subscription

**Core Capabilities:**
- 14-day free trial with full access
- Premium subscription purchase
- Subscription management and cancellation
- BYOK waitlist for future feature

**Representative Stories:**
- As a free user, I want to see when I hit session limit so I understand the paywall
- As a free user, I want to upgrade to premium so I get unlimited learning
- As a premium user, I want to cancel my subscription so I control my payment
- As any user, I want to delete my account so I exercise my privacy rights

**Success Indicators:**
- >15% trial-to-paid conversion
- <5% monthly churn
- >100 BYOK waitlist signups (triggers v1.1 development)

---

## Epic 6: Language Learning Mode

**Primary Actors:** Learners studying languages

**Core Capabilities:**
- Automatic detection of language learning intent
- Four Strands methodology (explicit instruction + input + output + fluency)
- Vocabulary tracking with spaced repetition
- CEFR progress monitoring
- FSI time estimation

**Representative Stories:**
- As a learner, I want to tell AI I want to learn a language so the system switches to language mode automatically
- As a learner, I want to receive explicit grammar instruction so I understand rules directly
- As a learner, I want to be pushed to produce language (speaking/writing) so output practice forces me to notice gaps
- As a learner, I want to read comprehensible passages at my level so I get massive input
- As a learner, I want to see my vocabulary count and CEFR progress so I have concrete metrics

**Success Indicators:**
- Language learners achieve A1 within 60 hours
- Vocabulary retention >80% after 12+ exposures
- CEFR progression matches FSI estimates

---

## Additional Journey Maps Needed

The following detailed journey maps should be created during Epics phase:
- Certification seekers (exam prep focus)
- Career changers (skill acquisition focus)
- Serious students (course support focus)

These variations will inform story prioritization and acceptance criteria.

---

## Cross-References

- **PRD:** `docs/prd.md` (requirements these epics implement)
- **Product Brief:** `docs/analysis/product-brief-EduAgent-2025-12-11.md` (business context)
- **Architecture Inputs:** `docs/analysis/architecture-inputs.md` (technical context)
