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

> **Identity vocabulary — under clean-cut revision (Grill #1, 2026-06-01).** The terms below
> marked **[target]** are the ratified Identity Foundation model; the live schema still uses the
> legacy fused model (`profiles` / `accounts` / `isOwner`) until the clean cut lands. Where this
> section and today's schema disagree, **this section is the forward intent** (it overrides the
> usual "schema wins" rule *for these identity terms only*, during the re-platform). Decision
> record: `_wip/identity-foundation/identity-ontology.md`.

**Person** _[target]_:
One human — the permanent subject of all learning data, consent, and identity, **whether or not
they can log in**. The scoping key for every learning record. A Person may hold a Login
(*credentialed*) or not (*managed*); a managed Person is a real member with no sign-in of their own.
_Avoid_: profile (the legacy fused term), user (a login/authz word — a Person needn't authenticate),
account, learner (a Person *acting as* a learner is a hat, not the entity).
→ `_wip/identity-foundation/identity-ontology.md` §1.1 · legacy `profiles.ts:71`

**Organization** _[target]_:
The thin grouping + billing container a Person belongs to via Membership; holds the Subscription and
**never owns a Person or their data**. Always exists (an *org-of-one* is created at signup). "Family"
is a user-facing label on an Organization, not a separate entity.
_Avoid_: account (the legacy fused term), family / group / roster / tenant (all are an Organization).
→ `_wip/identity-foundation/identity-ontology.md` §1.3 · legacy `accounts`, inert `organizations` `profiles.ts:145`

**Login** _[target]_:
The authentication binding between a Person and their Clerk User — the means by which a Person signs
in. **Optional: 0 or 1 per Person** (managed = none, credentialed = one). Multiple sign-in methods
(Google, Apple, email/password) live *inside* the one Clerk User via account-linking, not as separate
Logins. Clerk owns authentication; we own everything else (MMT-ADR-0001).
_Avoid_: credential (in security that means an auth *factor* — a password/token — not the login
identity), user / Clerk user (the vendor object; Login is our binding to it), account.
→ `_wip/identity-foundation/identity-ontology.md` §1.2 · Clerk User via `clerk_user_id` `profiles.ts:85`

**Membership** _[target]_:
The link between a Person and an Organization, carrying a **role set** `{admin, learner}` (any
combination). Grants *existence-visibility* only — that you are in the org; **never** access to anyone's
learning data (that is edge-derived). The first member of an Organization is always an `admin`. Supervisory
ties (mentor, guardian) are **edges**, not roles — see *capacity*.
_Avoid_: account membership, seat (a seat is a billing count, not the link).
→ `_wip/identity-foundation/identity-ontology.md` §2.1 · inert `memberships` `profiles.ts:168`

**admin** _[target]_:
The membership role for **org management** — members, invites, settings, billing administration.
Age-agnostic; ≥1 per org; transferable; more than one allowed. Replaces the dissolved `Owner`. Holds
**no** learning-data access without a separate edge.
_Avoid_: owner (dissolved — split into admin / Payer / Guardianship), account holder.
→ `_wip/identity-foundation/identity-ontology.md` §1.5

**learner** _[target]_:
The membership role/marker meaning *"this member learns in this org"* — the switch that activates the
core learning surface. Self-*ownership* of one's own data is intrinsic to Person and needs no role;
`learner` marks active participation (and learner-seat counting). Not auto-assigned; chosen at onboarding.
_Avoid_: student (school-loaded; the term we replaced), child, child profile.
→ `_wip/identity-foundation/identity-ontology.md` §1.5

**capacity** _[target]_:
The position a Person occupies at **one end of an edge** (relationship) — *what they are in that
relationship* — as opposed to a membership **role**. `mentor`/`mentee` and `guardian`/`charge` are
capacities; `admin` and `learner` are roles. A Person carries one membership role-set but **any number of
capacities** (e.g. guardian to one child, mentor to another).
_Avoid_: relationship role / edge role (avoided so "role" stays reserved for membership roles), party.
→ `_wip/identity-foundation/identity-ontology.md` §2

**mentor** _[target]_:
A **capacity** (not a role): the helper end of a **Mentorship** edge — a **human** who helps/oversees one
specific learner. Visibility is **edge-scoped** to that named mentee; a mentor **never** sees the whole
org/family. Any age. **Distinct from the AI** (the AI is the *Mate*).
_Avoid_: mentor *role* (it is a capacity on an edge, not a membership role), AI mentor (that is the Mate), teacher.
→ `_wip/identity-foundation/identity-ontology.md` §2.3

**Mate** (AI Mate) _[target]_:
The learner's **AI** tutor (MentoMATE) — the entity formerly called "mentor" throughout the app's copy.
Renamed to free `mentor` for the human role. A copy sweep reassigns ~70 "your mentor" strings to "Mate".
_Avoid_: mentor (now the human role), bot, assistant.
→ `_wip/identity-foundation/identity-ontology.md` §8 CLEANUP-2

**Guardianship** _[target]_:
The dyadic relationship recording that an adult gave **verifiable consent** for a consent-gated learner —
a **Guardian → charge** edge that carries the consent record and establishes lawful basis to process that
learner's data (**Layer 1 — consent authority**). Withdrawable. **Not a role.** The edge grants **separable
*capabilities*** (consent-authority / operate / manage / view), not one bundled flag — a credentialed tween
operates their own profile yet still needs a guardian's consent-authority. Note **capability ≠ capacity**: a
*capacity* is which end of the edge you are (guardian / charge); a *capability* is what the edge authorizes.
**The edge is *global* (a person-pair fact); it *stores* consent-authority + the consent record only —
`operate`/`manage`/`view` are *derived* at query time** (`guardian-link ∧ shared-org ∧ charge-has-no-Login`),
not stored per-org (MMT-ADR-0008). The "may this guardian act here?" check lives in **one named resolver**.
_Avoid_: family link (the legacy table), parental role, custody.
→ `_wip/identity-foundation/identity-ontology.md` §2.2, §4.23 · **MMT-ADR-0008** · legacy `family_links`+`consent_states` `profiles.ts:284,313`

**Guardian** _[target]_:
The consenting adult who holds a Guardianship over a charge. Has inherent oversight of that charge (Layer 1).
The privacy-law umbrella ("parent or guardian"); to give valid consent one must hold parental responsibility.
_Avoid_: parent (copy-only — a guardian need not be a biological parent), owner.
→ `_wip/identity-foundation/identity-ontology.md` §2.2

**charge** _[target]_ (≡ **consent-gated learner**):
The learner on the far end of a Guardianship — a learner below their jurisdiction's consent age, who needs
a guardian's consent to be processed. **`charge`** is the formal/vernacular term; **"consent-gated learner"**
is the technical synonym used in detailed/data-model contexts.
_Avoid_: ward (custodial baggage), dependent. **`minor`** is acceptable casual shorthand (a charge is always
a minor) but **imprecise** — not every minor is a charge (16–17s and e.g. Norwegian 13–15s self-consent) —
and must **never** be a code gate; gate on `requiresGuardianConsent`.
→ `_wip/identity-foundation/identity-ontology.md` §2.2

**Mentorship** _[target]_:
A dyadic **mentor → learner** edge granting **scoped visibility/help** for one specific mentee (**Layer 2 —
supervisory access**). Granted by the guardian (below consent age) or by the data subject (above). Carries
**no** consent authority. The far-end learner is loosely called a *mentee*.
_Avoid_: org-wide mentor access (the leak this prevents), guardianship (a different layer).
→ `_wip/identity-foundation/identity-ontology.md` §2.3

**Payer** _[target · amended v1.1 2026-06-02]_:
The Person designated responsible for an Organization's Subscription. A Subscription *designation*,
**not** a membership role, and grants **no** learning-data access (**access-inert**). **Payer *capacity* is
delegated, not adjudicated by us:** for store-mediated payment (the only channel for the foreseeable future)
the store is **merchant of record** and the sole capacity adjudicator — no age gate of ours. A flat **≥18**
worst-case default (inv 29) applies **only** to a future non-store rail where we are merchant of record, not a
per-jurisdiction derivation. Separable from `admin` (an independent teen can be admin of their own org; on a
paid plan they self-pay where the store permits, else an adult Payer is attached).
_Avoid_: owner, billing contact (considered; understates legal responsibility), customer (that is the org).
→ `_wip/identity-foundation/identity-ontology.md` §2.4, §R (v1.1)

**minor** _[target · amended v1.1 2026-06-02]_:
A Person **under 18** — the **contract threshold** that applies **only** where *we* are merchant of record (a
future non-store payment rail). On store-mediated payment (the only channel for now) being a minor does
**not** bar Payer status — capacity is store-delegated (§2.4, inv 17). **Distinct from the consent gate**,
which is `requiresGuardianConsent` (below the jurisdictional consent age, 13–16). Fine in day-to-day speech;
never a structural/code gate (use the precise condition).
_Avoid_: using "minor" to mean "needs consent" (that is consent-gated / a charge — a different, jurisdictional line);
treating "minor" as an automatic Payer bar (true only on a future non-store rail).
→ `_wip/identity-foundation/identity-ontology.md` §R (v1.1), §2.4, §3.2

**Owner** _[✗ superseded — dissolved by Grill #1 C2]_:
Legacy: a Profile with `isOwner === true`. **Dissolved** in the clean cut → split into `admin` (org
management) / **Payer** (billing) / **Guardianship** (act-for-a-child). Not canonical; do not build on it.
→ `packages/schemas/src/profiles.ts:155`

**Child Profile** _[✗ superseded — Grill #1 C3/C4]_:
Legacy: a Profile with `isOwner === false`. **Replaced** by Person + Membership(`learner`) + (for a
consent-gated learner) a Guardianship edge making them a **charge**. Not canonical.
→ `packages/schemas/src/billing.ts:13` (`profileQuotaRole: 'child'`)

**Parent Proxy** _[⚠ legacy — under revision, Grill #1 C3/C5]_:
The runtime state where an Owner views the app *as* one of their Child Profiles (`isParentProxy`).
Candidate mechanism for guardian act-for under the new model; keep/retire decision pending.
_Avoid_: impersonated child (that names the role on the child, not the Owner's state).
→ `apps/mobile/src/lib/navigation-contract.ts:75`

**Age Bracket**:
A computed classification from `birthYear` used for consent, voice, and age-appropriate
copy — never for feature gating.
_Avoid_: persona, age group, age tier.
→ `computeAgeBracket()`, `packages/schemas/src/age.ts:42`

**residence_jurisdiction** _[target]_:
A Person's place of residence as a **time-versioned** attribute (history retained for audit) — the input,
with age, to the consent computation (`requiresGuardianConsent`). Keyed off **residence**, not current
location (a holiday or VPN must not re-gate). A change can re-engage the consent gate with no birthday.
_Avoid_: country (the billing/storefront country is a different, coarser signal), locale, current location.
→ `_wip/identity-foundation/identity-ontology.md` §3.4

**Consent** _[target]_:
The record that lawful basis exists to process a consent-gated learner's data — **method-typed** (how it was
obtained), **per-purpose** (a separate record per `core` / `thirdPartyShare` / `targetedAds` / `aiTraining`),
**jurisdiction-stamped**, and **withdrawable**. **Never a boolean.** Carried on a Guardianship edge (held by the
guardian, or self-held once consent-capable); stored as an ISO/IEC 27560 receipt + append-only event log.
_Avoid_: `consented = true` (the bug this prevents), consent flag.
→ `_wip/identity-foundation/identity-ontology.md` §3.2, §4.12, §4.27

**AgeConsentDecision** _[target]_:
The single **resolved-decision object** the app reads to know a Person's consent state — bundling what the law
requires + whether it is satisfied + how it was proven (`consentMethod`, `assuranceLevel`) + `purposeScope` +
expiry/`receiptId`. The COPPA-portable seam: app code reads **this**, never the underlying verification method.
Computed via `resolveConsentRequirement(age × residence_jurisdiction)` (the policy function).
_Avoid_: reading the raw method (card-on-file, vendor result) directly; `isMinor` boolean.
→ `_wip/identity-foundation/identity-ontology.md` §3.2

**Verifiable Parental Consent (VPC)** _[target]_:
The high-assurance consent ceremony required (COPPA; in practice EU for young children) **before** processing a
young charge's data — obtained via a vendor (KWS / k-ID) or a proportionate platform / card method, **not**
self-declaration. The strongest `assuranceLevel`.
_Avoid_: treating self-declared age as VPC; "parental consent" used loosely for the low-assurance case.
→ `_wip/identity-foundation/identity-ontology.md` §3.2, §6

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
