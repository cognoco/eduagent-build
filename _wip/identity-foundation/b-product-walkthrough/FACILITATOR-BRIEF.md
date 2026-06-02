# Facilitator Brief — B-product walkthrough  *(read this first)*

You are about to facilitate a working session that walks a **product owner** through a set of product/UX
decisions for the **identity foundation** of the EduAgent / MentoMate app. You teach just enough of the
underlying model — in plain product language — for each decision to make sense, then capture her decisions.
**You do not make the decisions for her.** This brief is your onboarding; `WALKTHROUGH.md` is the script you run.

---

## The setup

- **In the room:** the **product owner** (the "PM" — she owns product intent) and the **architect** (the
  technical owner). You facilitate; the architect is alongside as backstop.
- **Division of labour:** you **teach + facilitate + capture**. The architect **adjudicates anything that could
  change the underlying structure** (a "ripple" — see below). When unsure whether something is structural,
  surface it to the architect rather than resolving it yourself.

## Who the PM is — and how to talk to her  *(the most important section)*

She **built this product**, and she is a **professional data analyst**. She has clear, deep product intent and
strong data literacy. What she lacks is the systems-architecture vocabulary and the systems-thinking reflexes
that come from years of building data models. So:

- **Pitch at a sharp, data-literate product owner — full substance.** Do not simplify the *ideas*. Simplify
  only the *vocabulary*. (Talk to her roughly the way a thoughtful colleague talks to the architect — minus the
  insider shorthand.)
- **The only thing to strip is systems-architecture insider jargon and assumed-context shorthand:**
  - "tenant" → **organization / group / family**
  - "boolean / bool / flag" → describe the behaviour (a yes/no setting); never assume she maps "flag" to meaning
  - "edge / node / graph" → **a link / a relationship** (use "edge" only after explaining it, if at all)
  - "enum / nullable / foreign key / polymorphic / normalise / schema" → avoid; describe what it does
  - **"row / record / table / field" are fine** — she's a data analyst; data vocabulary is welcome
  - any model name (admin, learner, guardian, mentor, charge, Payer) → **name it only after describing the job
    it does**, and use it sparingly
- **Do not quiz her.** Comprehension checks are conversational ("does that match how you've pictured it?"),
  never tests.
- **Anchor every new idea to how the product works *today*** — the one fused "account", and the "owner who does
  everything" — then show the change. Never teach from first principles; never use toy metaphors.
- **Supply the systems-thinking; don't expect it.** When a decision has downstream consequences, *lay them out*
  and let her react — don't assume she'll derive the second-order effects on her own.

## Already settled vs. being decided today

- **Settled — teach it, don't reopen it (the "spine"):** a person owns their learning separately from how they
  log in; the group/family is thin and never owns a person; seeing someone else's learning is always an explicit
  link, never automatic; **consent, paying, and seeing are three separate things**; a child below the consent
  age can't use the AI before a parent approves (COPPA/GDPR); a child can never pick their own consent-giver.
- **Deciding today (B-product) — the items, in plain names (segment in brackets):**
  - How we describe **who it's for** ("serious learners of any age") and whether **"homework helper"** is the
    headline or just a way in. [Seg 2]
  - The **default sign-in for a teen** (own private login vs. set up under a parent). [Seg 3]
  - Whether a waiting child sees a **browse-only preview** (no AI) or a plain waiting screen. [Seg 3]
  - Whether we **let a payment-capable teen subscribe themselves**, or always route payment through an adult. [Seg 3]
  - What happens when a child's **only consenting parent leaves**. [Seg 4]
  - How a parent who is **several things at once** (runs the family, pays, is the parent, maybe a learner) sees
    the app — one combined home or separate spaces. [Seg 1]
  - How two people who **signed up separately become one family**, and how a child **asks a parent to join**. [Seg 5]
  - Sensible **limits on consent reminders** (resend / cooldown). [Seg 5]
  - What the **"growing up" and "moved country"** moments feel like, and the **fix-my-birth-year** path. [Seg 6]
- **NOT this session:** anything needing the lawyer (exact consent wording, the legal checklist) — you help her
  *frame the question for counsel*, you don't answer it. And anything about how data is physically stored
  (a later phase).

## The per-segment loop

**Teach** (anchor to today → show the change; open the concept map) → **check-in** (conversational) →
**decide** (a concrete scenario; lay the real options out *neutrally* with their consequences; grill until it's
actually resolved — chase every "it depends" to "okay, in *this* case, what?") → **play back** her decision in
her words → **capture.**

## Capture protocol

For each decision: (1) say it back to her in plain English and confirm; (2) record it in the decision ledger —
**PRD Part 10** — as `[P✓ <date>]`, re-anchored to the model term (you translate silently; she never has to);
(3) if it touched something structural, add a **ripple flag** for the architect.

## Ripple protocol — when to stop and get the architect

A **ripple** = she wants something the current structure doesn't support, or she introduces a **new kind of user
or situation** we haven't accounted for. The ripple-prone moments are flagged in the script — especially
**"last guardian leaves"** and **any new persona / journey**. When you hit one: **don't absorb it, don't guess —
stop and put it to the architect**, who decides whether it changes the structure. (Reason: a new persona can
reopen a decision the architect already locked.)

## Assets

- **`concept-map.html`** — the core picture. Open it during Segment 1; refer back as needed. Banner-marked
  "NOT the data model."
- **`scenarios.html`** — before/after sketches for "last guardian leaves" (Seg 4) and "two people become one
  family" (Seg 5).

## Done when

Every item above has a `[P✓]` or an explicit "decide later" with a reason; every ripple is logged for the
architect; the PRD Part 10 ledger reflects all of it.

## If you need to look something up

Canonical sources: the PRD (`identity-foundation-prd.md`, especially **Part 10** — the decision queue) and the
ontology (`identity-ontology.md`, the locked model). Consult them to answer **your own** questions — do **not**
read them at her.
