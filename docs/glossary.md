# Glossary — shared product & learning vocabulary

**Status:** DRAFT · working reference, **NOT canon** · started 2026-06-08 · owners: product (Zuzana) + agent

> [!IMPORTANT]
> **This is not a canonical document.** It was reverse-engineered from the
> (drifted) codebase and shipped copy, so it is a **drift-mapping artifact**: it
> records what the code and UI *currently say* — including where that has drifted
> from the ratified model — and must be **validated against canon before any
> entry is trusted**. The sources of truth are:
>
> - **Identity / tenancy / roles, and the authoritative definition of any term:**
>   the **L0 glossary `CONTEXT.md`** (root + per-area) and **`docs/canon/`**
>   (identity canon lives under `docs/canon/identity/`).
> - Where this file and canon disagree, **canon wins** and this file is corrected
>   to point at it — it never overrides canon.
>
> The section-level `STATUS: settled` tags below are **pre-canon claims by the
> authoring pass, not ratifications**; treat them as draft until reconciled.

## Why this exists

We kept using one word for several different things — the trigger was "note"
and "star" meaning different things to each of us, then "mentor" (which the
shipped app uses for the **AI**, not the parent). This file is the **single
shared dictionary** for the learning product. When a term here is used loosely
anywhere — a spec, a plan, a chat message, UI copy — it should mean what this
file says, or this file gets updated first.

**Conventions:**

- **In code:** points at the file/table/component that is ground truth.
- **STATUS: settled** — fixed; don't redefine casually.
- **STATUS: undecided** — we are actively choosing; the entry records *all*
  candidates and must not be treated as resolved.
- ⚠ marks a known trap where two ideas are easy to conflate.

Living file — add a term the moment a misunderstanding reveals one.

---

## 1. Actors — who is who (STATUS: settled 2026-06-08)

The five actors. **Use these words and only these words** for these roles —
no "AI", "tutor", "parent", "guardian", "user" as loose synonyms.

| Actor | Is | Notes / traps |
|---|---|---|
| **mentor** | The **AI / LLM tutor** — the thing that teaches, talks to the learner, drafts, grades, remembers. | ⚠ Counterintuitive: "mentor" is the **AI**, not a human. Matches shipped copy ("your personal **mentor**", "so your mentor talks to you the right way" — `create-profile.tsx:595`, `welcome.test.tsx:108`). |
| **learner** | The **student / end user** — the person being taught. | Any age (11+ today). Not "user", not "child" (a learner needn't be a minor's child). |
| **supporter** | **Any human in the learner's corner** — parent, grandparent, older sibling, tutor, family friend. Reads recaps, gets nudges, encourages. | **No age or legal requirement** — a 15-yo sister can be a supporter. Replaces the too-narrow "parent" and the too-custodial "guardian". |
| **owner** | The **account / consent / billing holder.** | ⚠ Narrower than supporter and a *different* axis: this is the legal/control role, which **must be an adult where the law requires** (minors-compliance spine). Existing code term (`isOwner`). A supporter is not automatically an owner. |
| **system** | Deterministic, **non-LLM** server code — templates, schedulers (SM-2), fallbacks. | Use when an artifact is machine-generated but **not** by the mentor (e.g. a template `highlight` fallback). |

> **Two layers — engineering name vs product voice.** The table above is the
> **engineering vocabulary** (code, specs, this glossary, team-speak). What the
> learner is *shown* — the **product voice** — can differ, and that's fine as
> long as we never mix the layers.

> **`mate` / "learning mate"** — the **mentor's product voice**: how the AI
> refers to *itself* to the learner ("Hi, I'm your learning **mate**"), and the
> "...mate" in the **MentoMate** wordmark (`AnimatedSplash.tsx:559`). Same
> entity as **mentor** — `mentor` is its engineering name, "(learning) mate" is
> its in-product voice. ⚠ **Never** use "mate" as an engineering actor word or
> for any **human**: for a person it reads as "friend" and collides with the
> AI's own companion voice. (This is a second, independent reason the human
> overseer can't be "mate".)

> **`guardian`** is **retired** as a relationship word (too adult/custodial — a
> minor sibling isn't a guardian). It survives only as the legacy **tab-shape**
> name (`resolveTabShape` → guardian/learner shapes); that UI-layer usage is
> grandfathered and means "the tab set an owner-with-linked-learners sees",
> not the human relationship. Prefer **supporter** (relationship) / **owner**
> (control) in all new vocabulary.

---

## 2. Naming convention for ambivalent/repeating concepts

Whenever a word covers many distinct things (note, card, screen…), name each
instance with a consistent formula so the referent is unambiguous:

- **Content artifacts (notes, recaps, feedback):** `‹author›-‹audience›-‹type›`
  - `author` ∈ {learner, mentor, system}; `audience` ∈ {learner, supporter, internal}.
  - **Collapse** when author == audience: a learner's own note is `learner-note`,
    not `learner-learner-note`.
  - `internal` audience = hidden from all humans (the mentor's own working state).
- **UI artifacts (cards, later screens):** `‹audience›-‹surface›-‹family›`
  - `audience` ∈ {learner, supporter, shared}; `surface` ∈ {home, library,
    progress, session, practice, onboarding, subscription, welcome};
    `family` = what the card *does* (see §6).
  - Code component names are **not** renamed by this file — the convention is a
    shared *vocabulary tag* layered over the existing component.

Same underlying logic — *who it's by / who it's for / where / what it is* —
instantiated where each axis is the real disambiguator (audience for notes,
surface for cards).

---

## 3. Structure terms (STATUS: settled)

### Subject → Book → Topic
Curriculum hierarchy. A **Subject** (e.g. Biology) contains **Books**; a Book
contains **Topics**. A **Topic** is the smallest unit the app schedules, tracks,
and attaches notes/mastery/review to.
**In code:** `subjects`, `curriculum_books`, `curriculum_topics`.

### Session (learning session)
One sitting where a learner studies a topic with the mentor — the chat that
produces answers, a reflection, and optionally a Challenge Round.
**In code:** `learning_sessions`.

---

## 4. Notes — the full taxonomy

A "note" is saved text *about learning*. There are ~12 distinct kinds across
the actor/audience axes below. **Canonical name** is what we say; **In code** is
where it lives.

### A · Authored by the learner

| Canonical name | What it is | In code |
|---|---|---|
| **learner-note** | A note the learner writes by hand on a topic (their own words). | `topic_notes` (manual create path) |
| **learner-reflection** | The end-of-session "in your own words: what did you learn?" text. Also **copied into a `learner-note`** row. | `session_summaries.content` |
| **learner-reflection-draft** | Ephemeral on-device autosave of the reflection while typing (7-day TTL, no server copy). | `summary-draft` (`lib/summary-draft.ts:5`) |

### B · Authored by the mentor *from* the learner's words

| Canonical name | What it is | In code |
|---|---|---|
| **mentor-draft-note** | A note the mentor **lightly tidies** from the learner's `solid` Challenge-Round answers (smooths into legible prose, keeps the learner's substance) — offered via a "save your answers as your note?" prompt; learner reviews → edit / save / skip. Once saved it becomes a `learner-note` with `source = 'challenge_draft'` and shows the **MentoMate logo** (not the checkmark). ⚠ Draft-building exists (`buildValidatedDraft`); the save-prompt + `validateNoteDraft` lexical guard + logo stamp are **unwired** (see plan below). | `buildValidatedDraft` → (TBD save) → `topic_notes` (`session-exchange.ts:842`) |

### C · Authored by the mentor *for* the learner

| Canonical name | What it is | In code |
|---|---|---|
| **mentor-learner-feedback** | 2–4 sentence response grading the learner-reflection. | `session_summaries.aiFeedback` |
| **mentor-learner-recap** | Bullet "here's what you covered" takeaways. | `session_summaries.learnerRecap` |
| **mentor-learner-closing-line** | One encouraging line at the top of the summary screen. | `session_summaries.closingLine` |

### D · Authored by the mentor *for* the supporter (learner never sees)

| Canonical name | What it is | In code |
|---|---|---|
| **mentor-supporter-narrative** | Prose paragraph: what the learner did this session. | `session_summaries.narrative` |
| **mentor-supporter-highlight** | One-line teaser of the session (system template fallback if the mentor fails → then it's `system`-authored). | `session_summaries.highlight` |
| **mentor-supporter-starter** | A suggested conversation-opener for the supporter. | `session_summaries.conversationPrompt` |
| **mentor-supporter-engagement** | Short signal about the learner's engagement level. | `session_summaries.engagementSignal` |
| **mentor-supporter-progress-summary** | Cross-subject progress paragraph, refreshed on demand. | `progress_summaries.summary` |

### E · Authored by the mentor, internal (hidden from everyone)

| Canonical name | What it is | In code |
|---|---|---|
| **mentor-memory** | Durable facts about the learner (interests, strengths, struggles), injected into future prompts. Profile-global. *(Surfaced read-only on the "Mentor Memory" screen.)* | `memory_facts` |
| **mentor-correction** | The "weak spot": a per-concept `misconception` + the right-version `correction`, from a Challenge Round. Hidden, but the correction is surfaced to the learner on review. | `needs_deepening_topics.misconception` / `.correction` |
| **mentor-session-state** | Compact `{narrative, topicsCovered, sessionState, reEntryRecommendation}` blob so the next session re-orients the mentor. | `session_summaries.llmSummary` |

### F · Captured, not authored

| Canonical name | What it is | In code |
|---|---|---|
| **learner-bookmark** | A mentor reply the learner tapped "save" on (verbatim). | `bookmarks` |
| **parked-question** | A question the learner or mentor flagged to revisit. | `parking_lot_items` |
| **vocab-item** | A `{term, translation}` pair from a language session — a **flashcard, not a note** (listed for completeness; do not call it a note). | `vocabulary` |

### ⚠ Two structural traps

1. **`session_summaries` is one DB row holding ~8 different texts** — the
   learner-reflection (A) plus mentor-learner-feedback/recap/closing-line (C)
   plus all the mentor-supporter-* (D) plus mentor-session-state (E). **"The
   session summary" is a *row*, not a *note*.** Always name the specific field.
2. **`topic_notes` is one table written by three flows** — `learner-note`
   (manual), the copy of `learner-reflection` (session-summary submit), and a
   saved `mentor-draft-note` (Challenge Round). There is **no `source` column**;
   the only discriminator today is `sessionId` null vs set (and even that
   doesn't separate the latter two).

### Two stars — both kept (STATUS: settled 2026-06-08)

Earlier framed as a contest (A *vs* B); **resolved: they grade different objects,
carry different value, and both ship.** They never supersede each other.

- **mastery star (model B)** — derived from **Challenge-Round concept mastery**: a
  topic earns it when its **live captured concepts are all `solid`** (§5 Mastery;
  the concept-capture layer). Object = **the topic / its concepts**. Meaning =
  *"you proved it under questioning."* **Status: core path built + wired**
  (`concepts`/`concept_mastery`, derived by `getConceptMasterySignalsForTopics`,
  rendered on the note surfaces) — **but not live until the 0107 migration is
  applied**; until then the tables don't exist and the star stays neutral.
- **note-correctness check (model A)** — the **mentor grades the learner's actual
  `learner-note` text**: an accurate note earns a **green checkmark** (decided
  2026-06-08 — *not* a star); the weak bit shows as a `mentor-correction` *of the
  note*. Object = **the note text itself**. Meaning = *"what you wrote is right."*
  Implies free-text grading. **Status: not yet built** (net-new/additive —
  unblocked by this decision; the concept-capture spec explicitly deferred
  note-text grading).

**Note marks — at most one per note, decided by *how the note was made*
(collision resolved 2026-06-08):**

| How the note was made | Mark | Means | Status |
|---|---|---|---|
| Hand-typed by the learner, mentor checks the text | ✅ **green checkmark** (model A) | "your own words are correct" | not built |
| **Saved from Challenge-Round answers** (lightly tidied — mentor smooths the learner's `solid` answers, keeps the substance) | 🔷 **MentoMate logo** | "built from your verified `solid` answers" | draft *built* (`buildValidatedDraft`, `session-exchange.ts:842`); save-prompt + stamp + lexical guard **unwired** |
| Hand-typed, not (yet) verified | *(no mark)* | neutral — **never** a red ✗ (no-struggle rule) | — |

⚠ **Checkmark and logo are mutually exclusive by provenance.** A challenge-saved
note is `solid`-by-construction, so the **logo is its quality signal** — it never
also needs A's free-text check. A hand-typed note never gets the logo.
⚠ The **mastery star (B)** is a *different surface entirely*: the topic / book
"mastered" badge, **never on the note** — so concept-capture's note-surface star
(T10) **moves off the note**.
**In code:** A — TBD (note-text-grading service); logo — finish wiring
`buildValidatedDraft` → `validateNoteDraft` (lexical guard) → save →
`MentomateLogo`; B — `concepts`/`concept_mastery`. See the implementation plan
`docs/plans/2026-06-08-note-correctness-and-challenge-draft.md`.

---

## 5. Learning-loop vocabulary — activities, grading & tracking (STATUS: settled)

The words for *what the learner does* and *how the app measures it*. These
overlap constantly — **quiz / assessment / challenge / review / progress /
report** are six different things and must not be used interchangeably.

### 5a · Activities — what the learner does

#### Practice
The **umbrella hub** of optional, self-initiated exercises (the Practice tab):
quizzes, assessments, dictation, recite, review/recall, history. "Practice" is
the *container*, never one specific activity.
**In code:** `app/(app)/practice/`.

#### Quiz
A short, **mechanical, auto-graded** practice round. Exactly **three kinds**
(`quizActivityTypeSchema`): **capitals** (multiple-choice facts), **vocabulary**
(language MC), **guess_who** (identify from clues). One round = a `quiz_rounds`
row (status `active`/`completed`/`abandoned`), scored into a `celebrationTier`.
⚠ **dictation** and **recite** are *sibling* practice activities, **not** quiz
types (outside the enum). ⚠ A quiz is **not** a Challenge Round and **not** an
Assessment. **In code:** `app/(app)/quiz/`, `packages/schemas/src/quiz.ts:4`.

#### Assessment
A **formal mastery test** the learner opts into — gated by a "ready to start?"
readiness reply, weightier than a quiz. ⚠ **Two referents, keep them apart:**
(1) the *test screen* (`app/(app)/practice/assessment/`); (2) the **`assessments`
table**, which is really the per-topic **mastery + XP record** —
`mastery_challenge_verified_at` is stamped there by **Challenge Rounds**, not
only by the assessment screen. The table name ≠ the screen.
**In code:** `assessments` (`schema/assessments.ts:54`).

#### Challenge Round
The optional, short, **open-ended, mentor-graded** round offered at the end of a
topic when the learner seems confident. **At most 3 open-ended questions**
("explain why", "compare", "apply", "teach it back"), one at a time, each graded.
The most rigorous activity, and the **only** one whose success verifies mastery.
⚠ Not a "quiz" (that word is reserved for the auto-graded rounds above).
**In code:** `services/challenge-round/`, `MAX_CHALLENGE_QUESTIONS = 3`.

### 5b · Grading & mastery — what a Challenge Round produces

#### Concept
⚠ **Not a curriculum unit.** A **mentor-invented label** describing whatever a
single Challenge-Round answer covered — produced fresh, ~one per question, **not**
from a stable list of the topic's parts. Two rounds invent **different** labels,
and a round only probes ~3 — so "every concept ever tested" ≠ "the whole topic."
(This is why the spec's `supersededAt`-by-absence retirement doesn't hold; the
plan switched to an explicit per-round marker.)
**In code:** the `concept` field of `challenge_round_evaluation` items.

#### Verdict
The grade on one Challenge-Round answer: `solid | partial | missing | misconception`.
**In code:** `result` on `challengeRoundEvaluationItemSchema`.

#### Weak spot
A concept graded `partial`/`misconception`, stored for revisiting; carries the
`mentor-correction`. **In code:** `needs_deepening_topics`.

#### Mastery (mastery-verified)
Today: a topic is mastery-verified when **a single Challenge Round on it came out
all `solid`** (timestamp stamped). ⚠ Per-round, not "everything ever."
**In code:** `assessments.mastery_challenge_verified_at`.

### 5c · Tracking & resurfacing — how the app remembers and reports

#### Review (spaced review)
The app **resurfacing a topic later** on a spaced-repetition schedule (SM-2),
one timer **per topic**. This is the canonical noun "Review".
**In code:** `retention_cards`, `packages/retention/src/sm2.ts`.
⚠ Three *other* senses of "review" — keep them out of the noun: **remediation**
(the Relearn/Retest recovery path after a topic decays — `RemediationCard`,
surfaced in Progress); **recall nudge** (a notification prompting return —
`recall_nudge`); and plain-English "review/check" (a learner eyeballing a
`mentor-draft-note` before saving). Only the SM-2 sense is **Review**.

#### Progress
⚠ **Three referents** — say which: (1) the **Progress tab** (learner UI surface,
`app/(app)/progress/`); (2) **progress data** — `progress_snapshots` (one
daily-metrics row), `xp_ledger`, `streaks`, `milestones`; (3) **`progress_summaries`**
— the one-per-profile **LLM prose paragraph** (this is §4's
`mentor-supporter-progress-summary`). "Progress" alone is ambiguous between the
tab, a snapshot, and the summary.
**In code:** `schema/snapshots.ts` (`progress_snapshots`, `progress_summaries`,
`milestones`), `schema/progress.ts` (`streaks`, `xp_ledger`).

#### Report
A **supporter-facing periodic digest** about **one** learner: **weekly**
(`weekly_reports`, Monday-keyed) or **monthly** (`monthly_reports`) — each a
`reportData` jsonb keyed by (supporter, learner, period) with a `viewedAt`,
delivered via push/email (`weekly_progress` / `monthly_report` notifications).
⚠ **Not** the learner-facing **`LatestReportCard`** in the Progress tab — that
shows the *learner's own* latest stats (a "progress report card"), a different
thing. So: **Report** (noun) = the supporter digest; the learner's stat tile is
a card, not a Report. **In code:** `weekly_reports` / `monthly_reports`
(`schema/snapshots.ts:118,150`).

### ⚠ The six-way trap, in one line each

- **Quiz** — auto-graded mini-game (3 types). **Assessment** — formal opt-in test
  (+ the mastery/XP table). **Challenge Round** — open-ended mentor-graded
  mastery probe. **Review** — SM-2 resurfacing. **Progress** — the tab / the
  data / the prose summary. **Report** — the weekly/monthly supporter digest.

---

## 6. Cards — naming, families, and full inventory

⚠ **There is no base `Card` component.** A "card" is a styling convention:
`rounded-card` + a background token (`bg-surface` / `bg-surface-elevated` /
`bg-coaching-card`). The nearest shared shell is `BaseCoachingCard`. This is
*why* "card" is so overloaded — nothing anchors it.

**Refer to a card as `‹audience›-‹surface›-‹family›`** (e.g. "the supporter-home
command card", "a learner-library tile"). Component names stay; the tag is the
shared vocabulary.

### Card families (the `family` slot)

| Family | What it does | Examples |
|---|---|---|
| **primitive** | Generic shell others build on. | `BaseCoachingCard`, `ErrorFallback`, `EmptyStateCard`, `MetricCard` |
| **tile** | Compact nav / selection. | `SubjectTile`, `BookCard`, `SuggestionCard`, `IntentCard`, `MilestoneCard` |
| **coaching** | A mentor suggestion / nudge / hero band. | `CoachBand`, `MentorSlot`, `ConversationStarterCard`, `ProgressNudgeCard`, progress hero |
| **command** | Supporter's per-learner dashboard. | `ChildCommandCard`, `FamilySummaryPanel` |
| **gate** | Blocking / interrupt state. | `QuotaExceededCard`, `ChallengeOfferCard` |
| **report** | Data summary / stats. | `LatestReportCard`, `RecentFocusCard`, `PracticeActivitySummaryCard`, `SubscriptionUsageCard`, report-headline blocks |
| **content** | A saved-content tile. | `InlineNoteCard`, `BookmarkCard` |
| **action-row** | A list/nav row styled as a card. | child-profile `RowLink`/`InfoRow`, practice rows |

### Full inventory (grouped by surface)

**Shared / primitives**

| Tag | Component | Family | Shows |
|---|---|---|---|
| shared-*-primitive | `BaseCoachingCard` (`components/coaching/BaseCoachingCard.tsx:39`) | primitive | Headline + optional CTA shell on `bg-coaching-card`; skeleton state |
| shared-*-gate | `ErrorFallback` (`components/common/ErrorFallback.tsx:30`) | primitive/gate | Title + message + primary/secondary action (card variant) |
| shared-*-primitive | `EmptyStateCard` (`components/common/EmptyStateCard.tsx:19`) | primitive | Thin wrapper over `ErrorFallback` (⚠ near-duplicate) |
| shared-*-primitive | `MetricCard` (`components/progress/MetricCard.tsx:3`) | primitive | Single label + value stat tile |

**Learner — Home**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-home-coaching | `CoachBand` (`components/home/CoachBand.tsx:22`) | coaching | Time-aware resume / review-due / quiz nudge + dismiss |
| learner-home-tile | `SubjectTile` (`components/home/SubjectTile.tsx:18`) | tile | Subject name, hint, progress bar |
| learner-home-coaching | `EarlyAdopterCard` (`components/home/EarlyAdopterCard.tsx:18`) | coaching | "Early user — your feedback shapes MentoMate"; auto-hides |
| learner-home-tile | Intent action rows (inline, `LearnerScreen.tsx:579`) | tile | Homework / Ask / Practice / Study New |
| learner-home-coaching | Family-setup / proxy-summaries CTAs (inline, `LearnerScreen.tsx:748,784`) | coaching | One-off promo / informational CTAs |
| learner-home-gate | Subjects load-error card (inline, `LearnerScreen.tsx:679`) | gate | "Couldn't load your subjects" + Retry |

**Supporter — Home** *(the parent/family home; "guardian" tab shape)*

| Tag | Component | Family | Shows |
|---|---|---|---|
| supporter-home-command | `ChildCommandCard` (`components/home/ParentHomeScreen.tsx:335`) | command | Per-learner dashboard: identity, momentum, solid/coming-up, starter, actions |
| supporter-home-coaching | `ConversationStarterCard` (`components/home/parent-card-prompts.tsx:167`) | coaching | One mentor-generated conversation starter |
| supporter-home-command | `FamilySummaryPanel` (`components/home/ParentHomeScreen.tsx:564`) | command | Family-level summary + "Add learner" (2+ learners) |
| supporter-home-coaching | `MentorSlot` (`components/home/MentorSlot.tsx:90`) | coaching | A mentor insight (celebration / learning-style) |
| supporter-home-coaching | `ParentTransitionNotice` (`components/home/ParentTransitionNotice.tsx:12`) | coaching | One-time "now in family mode" notice |
| supporter-home-gate | `ChildCapNotificationBanner` (`ParentHomeScreen.tsx:108`) | gate | A learner hit their quota; dismiss |

**Library**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-library-tile | `BookCard` (`components/library/BookCard.tsx:23`) | tile | Book: title, status, mastered badge, progress |
| learner-library-tile | `SuggestionCard` (`components/library/SuggestionCard.tsx:21`) | tile | Book/topic suggestion (browse/add) |
| learner-library-content | `InlineNoteCard` (`components/library/InlineNoteCard.tsx:25`) | content | A `learner-note`: title, source, content, kebab |
| learner-library-content | `BookmarkCard` (`components/library/BookmarkCard.tsx:13`) | content | A `learner-bookmark` (saved mentor reply) |
| supporter-library-tile | `SubjectCard` (inline, `child/[profileId]/index.tsx:432`) | tile | A learner's subject as seen by the supporter |

**Progress**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-progress-tile | `MilestoneCard` (`components/progress/MilestoneCard.tsx:66`) | tile | Milestone: icon, label, date |
| learner-progress-coaching | `RemediationCard` (`components/progress/RemediationCard.tsx:14`) | coaching | Retention status + Relearn/Retest CTAs (cooldown) |
| learner-progress-report | `PracticeActivitySummaryCard` (`components/progress/PracticeActivitySummaryCard.tsx:83`) | report | Practice totals + breakdowns |
| learner-progress-report | `LatestReportCard` (`progress/_components/LatestReportCard.tsx:10`) | report | Latest-report preview: headline + 4 `MetricCard`s |
| learner-progress-report | `RecentFocusCard` (`progress/_components/RecentFocusCard.tsx:7`) | report | 2 most-recent sessions |
| learner-progress-coaching | Progress hero (inline, `progress/index.tsx:565`) | coaching | "You've mastered X topics" hero |
| learner-progress-report | Report-headline blocks (inline, weekly/monthly/index — ⚠ triplicated) | report | Big stat + comparison |
| learner-progress-report | Stats chips / reports-list / saved-link (inline, `progress/`) | report/action-row | Lifetime stats; previous reports; Saved nav |

**Session / Study**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-session-gate | `ChallengeOfferCard` (`components/session/ChallengeOfferCard.tsx:4`) | gate | Challenge pitch + Try / Not now / Don't ask |
| learner-session-gate | `QuotaExceededCard` (`components/session/QuotaExceededCard.tsx:17`) | gate | Limit message + owner/non-owner CTAs |

**Practice / Quiz**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-practice-tile | `IntentCard` (`components/home/IntentCard.tsx:26`) | tile | Most-reused action picker (icon/title/subtitle/badge) |
| learner-practice-tile | Review / Quiz / mode / history / assessment rows (inline, `practice/index.tsx` — ⚠ 5 near-`IntentCard` copies) | tile/action-row | Practice-hub entry cards |
| learner-practice-tile | `LanguageVocabCard` / quiz explainer (inline, `quiz/index.tsx`) | tile | Per-language quiz picker; explainer |

**Coaching / Onboarding / Subscription / Other**

| Tag | Component | Family | Shows |
|---|---|---|---|
| learner-onboarding-* | `WelcomeIntro` scenes (`components/welcome/WelcomeIntro.tsx:68`) | primitive | Swipeable 3-card intro deck |
| learner-subscription-report | `SubscriptionUsageCard` (`_subscription/_components/SubscriptionUsageCard.tsx:17`) | report | Usage meters + per-learner breakdown |
| learner-subscription-tile | `PackageOption` (`_subscription/_components/PackageOption.tsx:14`) | tile | Pricing option (selectable) |
| shared-*-report | `ArchivedTranscriptCard` (`session-transcript/_components/archived-transcript-card.tsx:12`) | report | Archived-session summary + Continue |
| supporter-*-coaching | `ProgressNudgeCard` (inline, `child/[profileId]/index.tsx:346`) | coaching | "Ask about X while fresh" nudge |
| supporter-*-action-row | child-profile `RowLink` / `InfoRow` (inline) | action-row | Nav rows / info pairs |

### ⚠ Confusable card clusters worth distinct names

1. `IntentCard` **vs** the 5 inline practice-hub cards — same "pick an activity"
   role, separate code. Candidate: converge on `IntentCard`.
2. `LatestReportCard` **vs** the weekly/monthly report-headline JSX — the same
   headline copied into 3 files. Candidate: one `ReportHeadlineCard`.
3. learner `CoachBand` **vs** supporter `ConversationStarterCard` — both
   "a suggestion", opposite audiences, no shared code. The audience tag fixes it.
4. `EmptyStateCard` **vs** `ErrorFallback` — the former is a thin rename.

---

## 7. Celebrations — bands, naming, and full inventory

⚠ **There is no single celebration entry point.** Celebrations grew as two
*engines* plus a scatter of one-offs:

- **The overlay engine** — `useCelebration` (`hooks/use-celebration.tsx`) renders
  **one** `CelebrationOverlay` (the "celestial" ladder), fed two ways: an
  imperative **`trigger()`** (in-session, `session/index.tsx`) and a server-pushed
  **`queue`** of `PendingCelebration`s (`home.tsx`). `useMilestoneTracker`
  (`hooks/use-milestone-tracker.ts`) is the in-session **calculation** engine that
  decides which milestones the exchange just earned.
- **The one-off bursts** — `RewardBurst`, `BrandCelebration`,
  `CelebrationAnimation`, `CheckmarkPopAnimation`, `PostApprovalLanding`, each
  mounted directly by the screen that wants it.

So "celebration" is overloaded the same way "card" is — nothing anchors it. This
section gives the shared vocabulary + a **when-to-use-which** policy.

**Refer to a celebration as `‹occasion›-celebration`, tagged with its band**
(e.g. "the topic-mastered landmark", "the homework-capture spark", "the
three-in-a-row milestone"). Component names stay; the tag is the vocabulary.

### The three bands (the `band` slot — this is the "when to use which")

| Band | Use for | Treatment | Dismiss |
|---|---|---|---|
| **spark** | a single positive **action** — correct answer, homework captured, reflection submitted | small, local burst/pop; non-blocking | auto |
| **milestone** | **in-session progress** — first independent answer, 3-/5-in-a-row, persistence, thoughtful depth | the celestial overlay ladder + the dots counter | auto, throttled ≤2/batch |
| **landmark** | a **durable win** — topic mastered, assessment passed, book/curriculum complete, multi-day streak, consent approved | hero burst + brand logo; full-screen only for the biggest | auto (or tap for the full-screen ones) |

**The intensity ladder is mostly already there:** `RewardBurst` scales
`answer → round → hero`, and the celestial tier system is itself a milestone
ladder. The gaps are about *which occasion maps to which band/surface*, not the
primitives.

### Full inventory (grouped by band)

**spark — per-action micro**

| Tag | Component / where | Fires on |
|---|---|---|
| learner-quiz-spark | `RewardBurst` `intensity='answer'` (`quiz/play.tsx:750`) | a correct quiz answer |
| learner-homework-spark | `CelebrationAnimation` (`homework/camera.tsx:1109`) | OCR capture/parse succeeded (⚠ **not** manual entry — suppressed at `camera.tsx:452`) |
| learner-reflection-spark | `CheckmarkPopAnimation` (`ready.tsx`, `session-summary/[sessionId].tsx`) | reflection / "ready" submitted |

**milestone — in-session progress (the celestial ladder)**

| Tag | Component | Earned when (`use-milestone-tracker.ts`) |
|---|---|---|
| learner-session-milestone · **Polar Star** (tier 1) | `PolarStar` | first low-rung (independent) answer |
| learner-session-milestone · **Twin Stars** (tier 2) | `TwinStars` | 3 independent answers in a row; also `evaluate`/`teach_back` success |
| learner-session-milestone · **Comet** (tier 3) | `Comet` | breakthrough (was rung ≥3, now low); also reused for topic_mastered / streak_7 / curriculum_complete |
| learner-session-milestone · **Orion's Belt** (tier 4) | `OrionsBelt` | 5 in a row; also streak_30 |
| learner-session-milestone · Deep Diver / Persistent | (Polar/Twin variants) | 3 long answers / kept going after a correction |
| learner-session-milestone · counter | `MilestoneDots` (`session/_components/SessionScreenChrome.tsx`) | running tally of milestones hit this session |

**landmark — durable wins**

| Tag | Component / where | Fires on |
|---|---|---|
| learner-quiz-landmark | `RewardBurst` `intensity='round'` (`quiz/results.tsx:175`) | a strong quiz result (`celebrationTier` `perfect`/`great`) |
| learner-assessment-landmark | `RewardBurst` `intensity='hero'` (→ embeds `BrandCelebration`, `practice/assessment/index.tsx:568`) | passing an assessment |
| learner-summary-landmark | `BrandCelebration` (`session-summary/[sessionId].tsx`) | the session-summary header moment |
| learner-library-landmark | `BrandCelebration` (`library.tsx`) | curriculum-complete banner |
| learner-book-landmark | `CelebrationAnimation` (`shelf/[subjectId]/book/[bookId].tsx:1974`) | a book completed |
| learner-mastery-landmark | server-pushed `comet`/`orions_belt` via `home.tsx` queue | topic_mastered / streak_7 / streak_30 / curriculum_complete |
| learner-consent-landmark | `PostApprovalLanding` (`_layout.tsx`) | supporter approved the learner's account (full-screen) |

**supporter-facing — summarized, never animated**

| Tag | Component / where | Shows |
|---|---|---|
| supporter-home-summary | `MentorSlot` celebration chip (`components/home/MentorSlot.tsx:108`) | static text chip: long streak or ≥N topics this week |
| supporter-home-summary | `ChildCommandCard` momentum (`ParentHomeScreen.tsx`) | static momentum line per learner |

### Audience rule + the celestial schema

- **Learner = animated/sensory; supporter = summarized (static chip/text).** A
  supporter never gets the learner's overlay — they get a `MentorSlot` line.
- ⚠ **`audience: 'child' | 'adult'` on `useCelebration` is copy-*tone*, not the
  learner/supporter split** — it only swaps phrasing ("You had a breakthrough!"
  vs "Breakthrough — concept clicked."). It does **not** route a celebration to a
  supporter. Don't read it as the supporter switch.
- **In code:** `CelebrationReason` (the trigger), `CelebrationName` (the celestial
  component), `CelebrationLevel` (`off`/`big_only`/`all`) are enums in
  `@eduagent/schemas`. `celebrationForReason()` maps reason→celestial name;
  `CelebrationLevel` is gated through `resolveCelebrationLevelForAccommodation()`
  then `filterByLevel()` (tier ≥3 for `big_only`).

### Deliberate choices (do **not** "fix" these)

These look like inconsistencies but are intentional — flagged so a future
contributor doesn't "tidy" them into a regression:

1. **Quiz/homework celebrate every positive outcome, scaled — never on a
   failure.** `celebrationTier` has only positive rungs (`perfect`/`great`/`nice`)
   — there is no "poor"/"fail" tier, by the positive-framing rule (never
   surface struggle). The burst *intensity* scales; it is not suppressed on a
   low-but-honest result. Correct as-is.
2. **`celebrationLevel: 'off'` is honored** even with no accommodation mode set —
   the resolver returns the stored level when `accommodationMode` is `undefined`
   (`celebration-level.ts:12`, covered by `celebration-level.test.ts`). (An
   earlier audit mis-flagged this as a bug; it isn't.)
3. **Homework's `showCelebration` defaults `true` and re-arms on focus** only
   while *not* in the result phase — so it shows once per genuine parse, not on
   idle re-focus.

### Genuine gaps (future work — not bugs, do not silently build)

Tracked here so they're not mistaken for "covered"; each needs a product call
before any code:

1. **Topic-mastery may surface on up to three paths** — session overlay
   (`comet`) + a summary card + the home `queue`. Consolidating to **one** owning
   surface needs a server+client trace (the mastery push is server-driven) and a
   decision on which surface owns it. Deferred.
2. **No celebration for:** first-ever session, vocabulary milestones, CEFR
   level-up, first subject added. These are net-new occasions needing band +
   surface design, not wiring of an existing primitive.
3. **Multi-day streaks fire only async** (server push → home), so a streak hit
   mid-session has no in-session moment. Whether to add an in-session streak
   spark is an open product call.

---

## 8. Modes — the most overloaded word in the app

⚠ "Mode" means **at least ten different things** across identity, sessions,
accommodations, and per-feature toggles. Never write bare "mode" — always say
*which* mode. The five load-bearing ones first, then the narrow per-feature ones.

### The load-bearing five

#### App mode *(a.k.a. app context / profile mode)*
The top-level shape of the account: **`study` | `family`** — ⚠ the non-family
value is **`study`**, **not** "solo". `family` is an owner with linked learners;
it drives the guardian tab shape + `ParentHomeScreen`. The single most-referenced
"mode". Related flags: `MODE_NAV_V0/V1_ENABLED`, `MODE_TABS`, `MODE_CONFIGS`,
`MODE_SCOPED_KEYS`.
**In code:** `appContextSchema` (`profiles.ts:31`); `mode === 'family'`.

#### Proxy mode
A **runtime** state where a **supporter is acting through a learner's identity**
(viewing a child's data / limited actions). **Orthogonal** to app mode. Derived
**server-side** (not from a client header) and enforced: `assertNotProxyMode`
blocks billing/sensitive routes. ⚠ A learner is never "in proxy mode"; only a
supporter-acting-as is.
**In code:** `middleware/proxy-guard.ts`, `isParentProxy`.

#### Session mode *(the session-screen `mode`)*
What kind of session the learner is in — the `mode` the session screen renders
from. ⚠ **Six UI values** (`sessionModeConfig.ts`): **freeform** (Chat / "ask
anything", the default), **learning** (build understanding), **homework**
(homework help), **relearn** (a fresh angle after a topic decays), **review**
(refresh — the session-screen face of §5's *Review*), **recitation** (recite from
memory, beta).
⚠ **The same idea wears different value-sets at other layers** — never assume one
list: `SessionEffectiveMode` = `freeform` | `learning` (coarse 2-value
resolution, `sessions.ts:263`); `SessionType` = `learning` | `homework` |
`interleaved` (parent-recap classification, `session-enums.ts:24`); the filing
`sessionMode` = `freeform` | `homework` (`filing.ts:22`).
⚠ **`practice` is a *retired alias* for `review`** (renamed 2026-05-06;
`normalizeModeForConfig` still maps old persisted `practice` → `review`) — not
the **Practice** hub of §5.
⚠ Switching session mode swaps the chat theme; the bg-vs-text split here caused
the recurring invisible-chat-text bug — never split colours across two theme systems.
**In code:** `components/session/sessionModeConfig.ts` (the UI set),
`sessions.ts:263` (`SessionEffectiveMode`).

#### Accommodation mode
A sensory/pacing **preference**: **`none` | `short-burst` | `audio-first` |
`predictable`**. Feeds celebration level (`resolveCelebrationLevelForAccommodation`)
and pacing. Not a feature gate — comfort tuning.
**In code:** `accommodationModeSchema` (`learning-profiles.ts:65`).

#### Learning mode *(RETIRED — do not reintroduce)*
⚠ A **fossil**: was a persistent `serious | casual` rigor toggle, **removed in
Phase 0 (PR #325)**. Today `casual` is the single default tone; rigor is
expressed **per Challenge Round**, not globally. If you see "learning mode" in
new code or copy meaning a rigor toggle, it's a regression.
⚠ **Don't confuse with the session modes.** The session-screen modes
(`freeform`/`learning`/`review`/…) are often *loosely* called "learning modes" —
but that's **Session mode** above, not this retired `serious|casual` toggle. The
`learning` value there is a *session kind*, unrelated to this fossil.

### The narrow per-feature modes (catalogue)

| Mode | Values | Where | In code |
|---|---|---|---|
| **input mode** | `text` \| `voice` | how the learner sends a message | `sessions.ts:88` |
| **homework mode** | `help_me` \| `check_answer` | what the learner wants from a homework photo | `sessions.ts:91` |
| **answer mode** | `free_text` \| `multiple_choice` | how a quiz question is answered | `quiz.ts:120` |
| **attempt mode** | `standard` \| `dont_remember` | an assessment-question attempt | `assessments.ts:197` |
| **pedagogy mode** | `socratic` \| `four_strands` | language-teaching style | `language.ts:4` |
| **dictation mode** | `DictationMode` | dictation sub-variant | `dictation.ts:39` |
| **topic-add mode** | `preview` \| `create` | curriculum-add request discriminator | `subjects.ts:490` |
| **demo mode** | `true` | demo/seed flag | `progress.ts:983` |
| **theme / colour scheme** | `dark` \| `light` | UI appearance (`colorScheme`) — call it *theme*, not "mode" | `lib/theme` |

### ⚠ The traps in one line each

- **App mode** = `study`/`family` (account shape). **Proxy mode** = supporter
  acting-as (runtime, orthogonal). **Session mode** = the session-screen kind
  (freeform/learning/homework/relearn/review/recitation). **Accommodation mode**
  = comfort prefs. **Learning mode** = retired `serious|casual` toggle, don't use
  (≠ the session modes, despite the loose name). Everything else is a
  *per-feature* toggle — qualify it.

---

## 9. Learning-science foundations — the borrowed concepts

The product leans on a handful of named concepts from learning science and
language pedagogy. Code and canon reference them by name without explanation;
this section is the one place that says what each one is, where we use it, and
how our version deviates from the textbook.

#### SM-2 (SuperMemo-2)
The 1988 spaced-repetition scheduling algorithm (Piotr Woźniak) behind Anki and
most flashcard apps. Each item carries a card — ease factor (starts 2.5, floor
1.3), interval in days, consecutive-success count. After each review the recall
is graded 0–5: a grade < 3 resets the item to short intervals; grades ≥ 3
advance it (1 day → 6 days → previous interval × ease factor), so well-known
material gets reviewed exponentially less often. We schedule **one card per
Topic** (not per flashcard item). **In code:** `packages/retention/src/sm2.ts`
(pure math), orchestrated by `apps/api/src/services/retention.ts`, fired from
the `session.completed` Inngest chain. ⚠ Our deviations from canonical SM-2
(grading source, EVALUATE quality floor, clamping) are catalogued in
`packages/retention/README.md` → "Deviations from canonical SM-2".

#### Retrieval practice & the spacing effect
The two findings the whole Review backbone rests on: actively recalling
something strengthens memory far more than re-reading it (the "testing
effect"), and reviews spread over time beat massed cramming. This is *why* the
app resurfaces topics and asks the learner to produce answers rather than
showing summaries. **In code:** the entire retention loop (`retention_cards`,
recall nudges, quiz/assessment grading feeding SM-2).

#### Bloom's taxonomy
A hierarchy of cognitive skill: remember → understand → apply → analyze →
evaluate → create. We use it to pitch challenge difficulty: EVALUATE mode (the
"devil's advocate" flow where the mentor presents deliberately flawed reasoning
and the learner must find the flaw) targets the top levels (Evaluate/Create)
and only triggers on topics with strong retention (`easeFactor >= 2.5`,
`repetitions > 0`). **In code:** `apps/api/src/services/evaluate.ts`
(`shouldTriggerEvaluate`); design rationale in `docs/architecture.md` →
EVALUATE scoring.

#### Feynman technique
"You understand it when you can explain it simply, in your own words." The
basis of TEACH_BACK (the learner explains the concept back to the mentor) and
of the Challenge Round grading philosophy — mastery evidence must be grounded
in the learner's own quotes, not multiple-choice hits. **In code:**
`apps/api/src/services/teach-back.ts`, `teach-back-grader.ts`; learner-quote
grounding in `services/challenge-round/note-draft.ts`.

#### Four Strands (Paul Nation)
A balanced language course spends roughly equal time on four strands:
meaning-focused **input** (reading/listening), meaning-focused **output**
(speaking/writing), **language-focused learning** (explicit grammar/vocab
study), and **fluency development** (using what's already known, faster). Our
default pedagogy mode for language subjects — session planning rotates
activities across the strands. **In code:** `pedagogyModeSchema`
(`packages/schemas/src/language.ts:4`, default `four_strands`), strand
selection in `apps/api/src/services/curriculum.ts` and the session pipeline.

#### CEFR
The Common European Framework of Reference for Languages — the six-level
proficiency ladder A1, A2 (basic) → B1, B2 (independent) → C1, C2 (proficient).
Used for language-learner placement at onboarding and level tracking in
progress. **In code:** `cefrLevelSchema` (`packages/schemas/src/language.ts:10`).

#### Interleaving
Mixing topics or subjects within one practice session produces more durable
learning than practicing one thing in a block, even though it *feels* harder.
Basis of the cross-subject `interleaved` session type. **In code:**
`apps/api/src/services/interleaved.ts`; session kind in `session-enums.ts`.

---

## 10. Not yet defined (extend when it bites)

- **Screens** — same convention applies (`‹audience›-‹surface›-screen`); add when
  screen names start colliding.
- Navigation/identity vocabulary (tab shapes, proxy mode) lives in `CLAUDE.md` /
  `docs/audience-matrix.md`; pull it in here if it ever causes a "note"/"star"-class mix-up.
