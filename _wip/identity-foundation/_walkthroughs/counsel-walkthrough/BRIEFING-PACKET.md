# Briefing Packet — Counsel walkthrough  *(read before the session)*

This packet briefs a **legal-review working session** for the identity foundation of the EduAgent /
MentoMate app. In the room: the **product owner (PM)** and **legal counsel**, side by side. The PM owns
product intent; counsel rules on the law. The **architect is not in the room** — one question in this packet
can reopen a locked architecture decision; if counsel's answer triggers it, we **flag it and take it to the
architect afterward** (see *Group C → parent-delete permissibility*).

The companion `WALKTHROUGH.md` is the session script. This packet is the **shared context** both people read
first, and the **factual record** counsel needs to answer accurately.

**How this packet is pitched (the language rule):** written for counsel — precise, and legalese is welcome
where it removes ambiguity. Deep, specific terms are **glossed inline in one parenthetical** so the PM never
loses the thread — e.g. *verifiable parental consent (VPC — a recognised method to confirm the approver really
is the parent, not a tick-box)*. General legal English (consent, liability, retention, erasure, disclosure,
grace period) is **not** glossed — the PM follows it fine. We do not simplify the substance, only the few terms
that are genuinely insider.

---

## 0. What we need out of this session

Sixteen legal questions plus the DPIA launch-gate wrapper (E5), grouped into five clusters (§4). For each,
counsel gives one of:

- **Rule** — a binding answer we can build to (permissible / not / required-conditions).
- **Parameter** — a value or threshold (a retention period, a grace window, an assurance level).
- **Monitor** — "not settled in law yet; here's the current posture; revisit on a trigger."

**Every answer must be grounded — `basis:` is mandatory, not optional.** A bare yes/no is unusable: each
outcome carries a **`basis:` citation to the governing provision** (e.g. *GDPR Art 8*, *COPPA §312.5*, *UK
Children's Code std 5*), so it is auditable, reusable in the DPIA, and re-checkable when the law changes.
Depth scales with the answer type: a **Rule** cites the provision **+ one line of reasoning**; a **Parameter**
cites the governing provision; a **Monitor** cites the **draft/guidance** instrument and flags it is not yet
black-letter (the honest case where no settled citation exists — Ofcom, AI-Act application). Where an answer
spans regimes, cite each (EU/US/UK).

**Three answers are structural** — they change what we build, not just a parameter:
1. **Retention carve-out** (Group C) → constrains the **data model** (a future phase). We need the *shape*
   of the obligation, not the exact number.
2. **Parent-delete permissibility** (Group C) → can **reopen a locked architecture decision**. We need a
   **binary read** (lawful at all, yes/no) here, before the next phase locks.
3. **Store-delegation of payment liability** (Group B, B3a) → can **reopen invariant 17 v1.1** ("payment is
   store-delegated; no age gate of ours"). If the store gating a purchase does **not** discharge our liability
   for a minor's payment, we may have to impose our own gate after all. Binary read needed.

Everything else parameterises a mechanism we have **already decided** — counsel is ruling on stable ground,
not a moving target. That is deliberate: the product decisions were locked first precisely so this session
asks settled questions.

---

## 1. The product in plain English  *(so counsel can reason about the real data flows)*

**What it is.** A personal AI learning app. A learner of any age works through subjects with an **AI tutor**
(branded the "Mate"). A learner can be a young child, a teen, or an adult. Some learners are set up and
overseen by a parent; some run entirely on their own.

**The one structural fact that matters legally.** Today one "account" fuses three things — the login, the
family, and the person. The foundation **unbundles** them, and that unbundling is what makes the questions
below answerable cleanly:

- A **person** owns their learning for good. They exist whether or not they have a login.
- A **login** (a Clerk credential — the username/password the person signs in with) is separate and optional.
  A child on a parent's phone may have **no login of their own**.
- A **family/group** is a thin container — it **never owns** the person or their learning.
- Three powers that used to travel together are now **separate, independent things**:
  - **consent** — the parent who approves a child's use and can withdraw it;
  - **paying** — which grants access to *nobody's* learning data;
  - **seeing** — looking at a learner's work, which is always an explicit, per-person grant, never automatic.

**The age/consent backdrop (already locked, not for debate — context for counsel):**
- Whether a child needs a parent's approval depends on **age and country** — the digital-consent age runs
  **13–16** across our launch regimes, not a single "under-18" line.
- **Before parental approval, a consent-gated child cannot use the AI tutor at all.** Using it sends the
  child's words to an outside AI service; we treat that third-party disclosure as something a parent must
  approve first. This is the load-bearing legal floor of the whole product.
- A child can **never** choose their own consent-giver.

---

## 2. Data inventory  *(what we hold, and the flows counsel will care about)*

| Category | What it is | Where it lives | Legal sensitivity |
|---|---|---|---|
| **Learning data** | A person's subjects, sessions, progress, and their **conversations with the AI tutor** | Our database, per-person | High — a child's learning profile + chat; the core of any DPIA *(Data Protection Impact Assessment — the formal risk study regulators expect for children + AI)* |
| **AI-tutor disclosure** | Each tutor turn **sends the learner's words to a third-party LLM** (outside AI provider) | Outbound to the LLM vendor | **The COPPA/GDPR trigger.** Third-party disclosure of a child's data → parental consent required first |
| **Age & jurisdiction** | Age-range at signup, birth year, **declared country of residence** | Per-person | Drives the consent requirement; birth year is correctable (with verification on a boundary-crossing edit) |
| **Consent records** | Per-purpose records: `core`, `third-party-share`, `targeted-ads`, `AI-training` | Per-person, per-purpose | COPPA-2025 wants **separate** consent per purpose — never one blanket consent |
| **Financial / billing** | Subscription + quota, **store-delegated** (Apple/Google are merchant of record, via RevenueCat) | At the **account** level | We **cannot** initiate refunds/cancellations — only the user can, in the store. Statutory retention likely applies (tax/transaction) |
| **Auth / PII** | The login credential + email (held by Clerk, the auth provider) | Clerk | Standard PII |

**Two flows worth stating explicitly to counsel:**
- **Pre-consent state.** A consent-gated child who is waiting for approval sees a **browse-only preview** —
  static content, **no AI call, nothing collected, no network**. It is lawful pre-consent *only because* it
  makes no third-party disclosure and collects nothing. The exact "what counts as no-collection" line is a
  question for counsel (Group A).
- **Deletion is not all-or-nothing.** When a person's learning data is deleted, **financial/transaction
  records may have to survive** under separate statutory retention. The data model must therefore separate
  "purge the learning data" from "retain the financial record." Confirming the *shape* of that obligation is
  the structural question in Group C.

---

## 3. What is already decided  *(so counsel rules on permissibility/parameters, not design)*

Each question below rides one of these **locked** mechanisms. Counsel does not design these; they tell us
whether the law permits them and on what conditions/values.

- **Consent gates collection** — no learning/profile data is persisted until a lawful basis is established;
  the age-screen is the only pre-basis collection.
- **Consent is recorded per purpose** (`core` / `third-party-share` / `targeted-ads` / `AI-training`).
- **Consent rests on verifiable guardian consent, not on the parent being the account-holder** — we do *not*
  assume "parent owns the account ⇒ child is covered."
- **Worst-case default** — the system ships the strictest rule (consent age 16 / VPC-always) and relaxes only
  per *verified* jurisdiction.
- **A departing last guardian** chooses, at account deletion, to **export / attach another adult / delete** a
  genuine under-age child's data; an **explicit, audited** such deletion is treated as distinct from a silent
  cascade. *(This is the mechanism the parent-delete question tests.)*
- **A dormant account is cleaned up after long inactivity**, with a warning + export window first.
- **A payment-capable teen** may subscribe themselves; the **store** is the gatekeeper.
- **Moved to a stricter country** → the AI pauses into the browse-only preview until re-consent.
- **Birth-year is correctable in-app**; an edit that **crosses the consent boundary** requires light
  verification, an honest non-crossing edit just saves.

---

## 4. The questions  *(five groups; Group C front-loaded — it holds two of the three structural ones; the third is B3a in Group B)*

> Naming note for the record: "REQ-2" currently labels **two different lists** — the original 6-question
> consent register (Group A/D/E items below, from ontology §8) **and** a newer Phase-B counsel list
> (deletion/erasure/grace/verification/double-billing). They share a label but are different questions. This
> packet merges and de-duplicates them; a cleanup should rename the newer set so the collision stops. Flagged,
> not blocking.

### Group A — Is our consent valid? *(legal basis + disclosure)*

- **A1 — Per-purpose disclosure (REQ-1).** Our model splits "the parent approves the child being here"
  (consent authority) from "a named helper may see the child's work" (a granted visibility link). That split
  is only lawful **if the consent flow explicitly discloses** that the parent may grant such helper access —
  and COPPA-2025's per-purpose model means the consent text must **enumerate every purpose and every
  helper-access grant**, never a blanket consent. *Our current parental-consent email appears not to disclose
  this.* **Ask:** what must the consent text say, per purpose, to make the helper-access grant and each
  processing purpose lawful?
- **A2 — Contract basis for a minor's processing (register Q1).** Can contract basis *(GDPR Art 6(1)(b) — the
  "we need this to deliver the service they signed up for" basis)* carry **any** of a minor's core processing
  via the parent's account, or must it all rest on consent? (Our working assumption, per inv 28: little or
  none.) **Ask:** confirm the boundary.
- **A3 — COPPA AI-training separate consent (register Q4).** Does COPPA's separate-consent requirement for
  using a child's data to **train AI** apply to our features as built (we do not train on child data at
  launch, but record the purpose)? **Ask:** does recording-but-not-using clear the bar, and what triggers it.

### Group B — How young, and how verified? *(the age floor + assurance)*

- **B1 — The real age floor (FLAG-2).** Product intent: a child of **any age** can be a charge **with
  verifiable parental consent (VPC)** — nothing learning-wise blocks homework help for a young child. Today an
  "11" floor is hard-coded and pervasive, with **no documented legal rationale**. The spike's read: any-age
  charge is lawful *with VPC*, so the floor is a **product / app-store-rating call**, not a legal hard stop.
  **Ask:** confirm there is no legal floor below which a consented charge is impermissible (given VPC), across
  EU/US/UK — i.e. the floor is ours to set on rating grounds, not the law's.
- **B2 — Assurance level + boundary-crossing verification.** Assurance scales with age/risk —
  self-declaration is not enough for young children. Two sub-asks: (a) **what assurance level** does each
  regime require for VPC at the youngest ages; (b) for a **birth-year edit that crosses the consent boundary**
  (a person flipping themselves from "needs a parent" to "doesn't"), what verification standard prevents a
  child typing past the gate? *(The vendor pick is a later procurement step gated on this answer.)*
- **B3 — What can we rely on from Apple/Google?  `[STRUCTURAL → can reopen inv 17 v1.1]`** Our model
  **delegates payment capacity to the store** as merchant of record — *"the store is the sole capacity
  adjudicator; we impose no age gate of our own"* (inv 17 v1.1) — and **ingests a platform age signal**
  (reconciled stricter-wins vs self-declared, D4). Both lean on trusting the platform's classifications. Two
  sub-asks: **(a) Payment `[binary read — structural]`:** does the store gating a purchase (merchant of record,
  Ask-to-Buy, Family Sharing) **discharge our liability** for a **minor's** payment — COPPA, consumer-protection,
  contract — or do we retain **independent** obligations regardless of what the store permits? If we retain
  liability, inv 17 v1.1's "no age gate of ours" is reopened (architect ripple). **(b) Age signal:** is
  **ingesting and relying on** a platform-provided age signal (even as the stricter input) lawful, and does
  using it carry its own obligations (notice/consent to receive it)? *(Our read on (a): store-delegation is
  the foreseeable-future channel and likely discharges the* payment-capacity *call — but whether it discharges*
  liability *is exactly the untested assumption; counsel rules.)*

### Group C — Deletion, retention & erasure *(front-loaded — the two structural answers)*

- **C1 — Retention carve-out `[STRUCTURAL → data model]`.** When we delete a person's learning data (on
  request, or after long dormancy), which records must **survive** under statutory retention — billing/tax/
  transaction records being the obvious candidates — and for how long? We need the **shape** of the
  obligation now (which categories must be carved out of a deletion), so the data model is built with a
  retain-financial / purge-learning seam; the **exact period** can follow. **Ask:** what must we keep, and on
  what clock, when everything else is erased?
- **C2 — Parent-delete permissibility `[STRUCTURAL → can reopen architecture]`.** We let a departing last
  guardian **explicitly delete** a genuine under-consent-age child's learning data (with export offered
  first). **Ask — and we need a binary read here:** is a guardian exercising a child's erasure on the child's
  behalf **lawful at all**, across EU/US/UK? If **yes**, on what conditions. If **no**, this **reopens the
  architecture** (we flag it to the architect and revisit the rule). *(Our read leans yes — GDPR's
  storage-limitation principle encourages not over-retaining — but the law, not our read, governs.)*
- **C3 — Inactivity-deletion policy.** For the dormancy clean-up: the **mandatory pre-deletion notice +
  grace/export window**, and how a **child's** data is handled in dormancy. **Ask:** the required notice and
  the floor on the grace window. *(The exact dormancy length is a parameter, not blocking.)*
- **C4 — Child's erasure right vs the parent's authority.** Distinct from C2's "may the parent delete": when
  a **child** (or a now-grown teen) exercises **their own** erasure right, what is the scope, and where does a
  parent's authority over a genuine charge's data end? **Ask:** the limits on each side.

### Group D — Cross-org & lifecycle *(ties to "join my family" + growing up)*

- **D1 — Cross-org consent (register Q2).** When a charge's data is present in a **second** organization
  (e.g. a teen who joins a parent's family, or an external tutor's group), **whose consent governs** that
  data, and is an external tutor seeing it a **third-party share**? **Ask:** the consent-precedence rule
  across two groups.
- **D2 — Graduation & legacy data (register Q3).** When a managed child **graduates** to running their own
  account (same person, now self-determining), does the **parent's original consent survive** the change, and
  how must the **data gathered under the old consent** be handled going forward? **Ask:** does consent need
  re-taking at graduation, and what happens to the pre-graduation data.

### Group E — Forward-looking, parameters & the launch gate

- **E1 — EU AI-Act high-risk trigger (register Q5).** Does our **adaptive** path — the tutor steering what a
  learner studies next — bring us into **EU AI-Act Annex III 3(b)** *(the "AI used in education that steers
  learning outcomes" high-risk category)*? **Ask:** are we in scope, and what would that oblige.
- **E2 — Ofcom child-AI-chatbot regs (register Q6).** UK secondary regulation on child-facing AI chatbots is
  developing. **Ask:** current posture + the trigger to revisit. *(Likely "monitor.")*
- **E3 — Moved-country grace window.** When a person moves into a stricter jurisdiction and the AI pauses,
  how long may the suspended state persist before resolution is required? **Ask:** the grace-window floor.
  *(Parameter.)*
- **E4 — Minor double-billing disclosure.** A teen who joins a family while still paying their **own** store
  subscription keeps paying until they self-cancel (store billing rules out a server-side refund). **Ask:**
  the required disclosure language + any grace, given the payer is a minor. *(Parameter + consumer-protection
  sensitivity.)*
- **E5 — DPIA as the launch gate (REQ-3).** Children + AI + learning profiles ⇒ a DPIA is effectively
  mandatory (UK Children's Code + UK/EU GDPR Art 35) and should **gate launch**. This is the **wrapper** the
  answers above feed into. **Ask:** confirm DPIA scope and that it gates paid launch; identify any input still
  missing.

---

## 5. Jurisdiction scope

Answer against the **EU + US + UK baseline**: **GDPR** (EU), **COPPA** (US), **UK-GDPR + the Children's
Code** (UK). Where a regime diverges (the 13–16 digital-consent spread; COPPA's under-13 line; the UK
Children's Code's design duties), note the divergence — our model already ships the **strictest** rule and
relaxes per verified jurisdiction, so a "strictest-of-the-three" answer is directly usable. If a question has
no settled answer in a regime, "monitor + current posture" is an acceptable output.

---

## 6. After the session

- Each question carries a **Rule / Parameter / Monitor** outcome **+ a `basis:` citation** (the governing
  provision), captured in **PRD Part 10** — the same ledger B-product used — resolving the G1–G4 items there
  and recording the newer ones alongside.
- **Two architecture ripples to watch.** **(1) If C2 comes back "no/limited":** flag to the architect — it
  reopens the last-guardian deletion rule and the related invariant. **(2) If B3a comes back "we retain
  liability":** flag to the architect — it reopens inv 17 v1.1 ("payment is store-delegated; no age gate of
  ours"). Neither is final until the architect rules.
- **C1's shape** feeds the data-model phase as a design constraint (the retain/purge seam).
- The **DPIA (E5)** is opened as the launch-gating wrapper that the other answers populate.
- Rename the newer "REQ-2" set so it stops colliding with the original 6-question register.
