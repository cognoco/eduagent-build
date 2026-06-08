# Counsel Walkthrough — the script  *(read `BRIEFING-PACKET.md` first)*

Five segments, one per question-group. Each runs the loop: **frame → ask → capture → play back to the PM.**
**[Bracketed italics]** are stage directions to you, the facilitator — not spoken. This is **not** a teaching
session: counsel is the expert. Your job is to **frame the situation + state what's already locked**, **put the
precise legal question**, **capture the answer as Rule / Parameter / Monitor**, and **play it back in plain
English so the PM stays oriented**.

**Language rule (from the packet):** speak precisely for counsel — legalese is welcome where it removes
ambiguity — but **gloss a deep, specific term once, inline**, so the PM never loses the thread
(*"…verifiable parental consent — VPC, a recognised method to confirm the approver really is the parent"*).
Do **not** gloss general legal English (consent, erasure, retention, disclosure, liability). Never dumb down
the substance.

**Order — Group C leads, on purpose.** It holds the **two structural answers**; surfacing a ripple early gives
the architect maximum runway. Then A (is our consent valid), B (age floor), D (cross-org), E (forward-looking
+ the DPIA wrapper).

1. Deletion, retention & erasure → *retention carve-out; parent-delete; inactivity; child's erasure* **[structural]**
2. Is our consent valid? → *per-purpose disclosure; contract basis; AI-training consent*
3. How young, how verified? → *the real age floor; assurance + boundary-crossing verification; what we may rely on from Apple/Google* **[B3a structural]**
4. Cross-org & lifecycle → *cross-org consent; graduation & legacy data*
5. Forward-looking + the launch gate → *EU AI-Act; Ofcom; moved-country grace; minor double-billing; DPIA*

**Two architecture ripples to watch — not just in Group C.** The structural pair C1/C2 leads in Segment 1, but
**B3a (store-delegation liability) in Segment 3 is a third structural item** that can reopen inv 17 v1.1. Treat
its ripple trigger with the same weight as C2's.

**The capture verbs:** **Rule** (binding answer we build to) · **Parameter** (a value/threshold) · **Monitor**
(unsettled; record current posture + the trigger to revisit). Every question leaves with one — **plus a
`basis:` citation to the governing provision** (e.g. *GDPR Art 8 / COPPA §312.5 / Children's Code std 5*). A
bare yes/no is not a captured answer: a **Rule** needs the provision **+ one line of reasoning**; a
**Parameter** needs the governing provision; a **Monitor** needs the **draft/guidance** instrument it's
tracking. Counsel is told this up front, at the open.

---

## Segment 1 — Deletion, retention & erasure  *(front-loaded — holds the two structural answers)*

### Frame · ~2 min
> "We'll start where the answers can change what we build. Two facts set the scene. **One:** a person owns their
> learning data for good — it isn't owned by the family or the login, so deleting a relationship never silently
> deletes the person. **Two:** deletion isn't all-or-nothing — when we erase someone's learning, some records,
> like billing and transaction history, may have to *survive* for separate legal reasons. So 'delete' really
> means 'purge the learning data, keep what the law makes us keep.' Three of today's four questions turn on
> that."

### Ask — run in order; C1 and C2 are the structural pair

**C1 — Retention carve-out  `[STRUCTURAL → data model]`**
> "When we delete a person's learning data — whether they ask, or it's an automatic clean-up after long
> inactivity — **which records must we keep**, and for how long? Billing, tax, and transaction records are the
> obvious candidates. We don't need the exact number today — we need the **shape**: which categories must be
> carved out of a deletion, so we build the data store with a clean seam between 'purge the learning' and
> 'retain the financial record.'"

**[This answer is a design constraint for the data-model phase. Capture the *categories* even if the *period*
is "we'll confirm." Push for: is there anything beyond billing/tax/transaction that must survive?]**

**C2 — Parent-delete permissibility  `[STRUCTURAL → can reopen architecture]`**
> "Here's the one we most need a clear read on. When a child's **only** consenting parent leaves and deletes
> their account, we let that parent **explicitly delete** the child's learning data — after offering an export
> first — for a genuine under-consent-age child. The question is simply: **is that lawful at all?** Is a
> guardian exercising a child's erasure, on the child's behalf, permissible across the EU, US, and UK — and if
> so, on what conditions? A plain yes-or-no first, then the conditions."

**[RIPPLE TRIGGER. If counsel says NO or "only under conditions we don't meet": STOP capturing it as settled —
record it as a *ripple to the architect*. This reopens the last-guardian deletion rule and the related
invariant. Tell the PM plainly: "that answer changes an architecture decision; it goes to the architect before
anything's final." Do not let the room design the fix — that's the architect's call.]**

**C3 — Inactivity-deletion policy**
> "For the automatic clean-up of long-dormant accounts: what **notice** must we give before deleting, and
> what's the **floor** on the grace/export window — especially when the dormant account is a **child's**? The
> exact dormancy length is ours to set; the notice and the minimum window are yours to rule."

**C4 — Child's erasure vs the parent's authority**
> "Last in this group, and it's the mirror of C2: when **the child themselves** — or a teen who's now grown up
> — exercises **their own** erasure right, what's the scope? And where does a parent's authority over a genuine
> charge's data **end**? We want the line on each side."

### Capture + play back
**[Ledger → PRD Part 10:]** `C1 retention-carve-out [<Rule/Param>]`, `C2 parent-delete [<Rule + binary>]`,
`C3 inactivity-policy [<Param>]`, `C4 erasure-scope [<Rule>]`.
> "So, in plain terms: **[restate]** — e.g. 'keep billing + tax for N years, purge everything else; a parent
> *may* delete a young child's learning if X; we must warn N days before any dormancy delete; a grown teen can
> erase their own, and a parent's reach ends at Y.' Right?"

**[If C2 rippled: read the ripple flag aloud and note it goes to the architect. Mark C1's categories as a
data-model constraint.]**

---

## Segment 2 — Is our consent valid?  *(legal basis + disclosure)*

### Frame · ~2 min
> "Now the foundation under everything: when is our consent actually *valid*? Three things to test. We record
> consent **separately for each purpose** — using the service, sharing with a third party, ads, AI-training —
> never one blanket yes. We treat consent as resting on the **parent genuinely approving**, *not* on the parent
> happening to own the account. And we keep 'the parent approves the child being here' separate from 'a named
> helper may see the child's work.'"

### Ask

**A1 — Per-purpose disclosure**
> "Our model lets a parent's approval also **grant a named helper — a tutor or mentor — permission to see the
> child's work.** That's only lawful if the consent flow **explicitly discloses** it. And under the updated
> COPPA per-purpose model, the consent text has to **enumerate every processing purpose and every helper-access
> grant** — never a single catch-all. Our current parental-consent email **appears not to disclose this.**
> **Question:** what must the consent text actually say — per purpose, and for the helper-access grant — to be
> lawful?"

**A2 — Contract basis for a minor's processing**
> "Can **contract basis** — *GDPR Article 6(1)(b), the 'we need this to deliver the service they signed up for'
> ground* — carry **any** of a minor's core processing through the parent's account? Or must a minor's
> processing rest on **consent**, full stop? Our working assumption is little-to-none rides on contract.
> Confirm the boundary."

**A3 — COPPA AI-training separate consent**
> "COPPA wants a **separate** consent to use a child's data to **train AI**. At launch we **don't** train on
> child data, but we do **record** the purpose as a category. **Question:** does record-but-don't-use stay
> clear of the requirement — and what exactly would trip it?"

### Capture + play back
**[Ledger → Part 10:]** `A1 disclosure [<Rule>]`, `A2 contract-basis [<Rule>]`, `A3 ai-training [<Rule/Monitor>]`.
> "Plain version: **[restate]** — e.g. 'the consent screen must spell out each purpose and name the helper-access
> grant; basically nothing rides on contract — it's consent; and as long as we don't train on their data we're
> clear, but the moment we do it's a fresh consent.' Match?"

---

## Segment 3 — How young, and how verified?  *(the age floor + assurance)*

### Frame · ~1.5 min
> "Two linked questions about the youngest users. Our intent is that a child of **any age** can be a supervised
> learner **as long as a parent verifiably approves** — there's nothing about homework help that needs an age
> floor. Today the code has an '11' floor with no recorded legal reason. And separately: the **stronger** the
> proof of parental approval has to be the younger the child, so a self-typed 'I'm a grown-up' can't be enough
> for a young one."

### Ask

**B1 — The real age floor**
> "Is there **any legal floor** below which a consented child simply **can't** be a user — given **verifiable
> parental consent (VPC — a recognised method to confirm the approver is really the parent)** — anywhere in
> the EU, US, or UK? Our read is no: with VPC, any-age is lawful, and the floor we set is a **product and
> app-store-rating** decision, not a legal line. **Confirm or correct that** — because it decides whether we're
> free to set the floor ourselves."

**B2 — Assurance level + boundary-crossing verification**
> "Two parts. **(a)** At the youngest ages, **what assurance level** does each regime require for VPC — how
> strong does the proof have to be? **(b)** Separately: if someone **edits their birth year in a way that
> crosses the consent line** — flipping themselves from 'needs a parent' to 'doesn't' — what **verification
> standard** must we apply so a child can't simply *type* their way past the gate, while a genuine adult who
> mistyped can still fix it? *(The vendor we'd use is a later step that waits on this answer.)*"

**B3 — What can we rely on from Apple/Google?  `[STRUCTURAL → can reopen inv 17 v1.1]`**
> "Our design **leans on the app stores** in two ways, and we want to test both. **First — and this is the one
> we need a clear read on:** we let the **store decide who may pay**. Apple or Google, as merchant of record,
> gate the purchase — Ask-to-Buy, the payment method, Family Sharing — and we add **no age check of our own**.
> The question: when the store approves a payment from a **minor's** account, does that **discharge our
> liability** — under COPPA, consumer-protection, and contract law — or do we **still carry our own
> obligations** regardless of what the store allowed? A plain yes-or-no first, then the conditions. **Second,
> lighter:** we also plan to **read an age signal from the platform** and take the stricter of it and what the
> user told us — is **ingesting and relying on** that signal lawful, and does it carry its own duties, like
> telling the user we're using it?"

**[RIPPLE TRIGGER — same weight as C2. If counsel says the store approving a minor's purchase does NOT
discharge our liability (we retain our own obligations), STOP treating it as settled — log it as a ripple to
the architect. It reopens inv 17 v1.1 ("payment is store-delegated; no age gate of ours") — we may have to add
our own gate after all. Tell the PM: "that changes an architecture decision; it goes to the architect before
anything's final." Capture (b) as its own Rule/Monitor.]**

### Capture + play back
**[Ledger → Part 10:]** `B1 age-floor [<Rule> + basis]`, `B2 assurance+verification [<Rule/Param> + basis]`,
`B3a store-delegation-liability [<Rule + binary> + basis]`, `B3b age-signal-ingestion [<Rule/Monitor> + basis]`.
Re-anchor FLAG-2: if B1 confirms no legal floor, the code floor + "11" copy can be removed (gated on app-store
rating).
> "Plain version: **[restate]** — e.g. 'no legal floor with VPC, so the floor is ours to set on rating grounds;
> VPC needs <level> for under-Ns; a boundary-crossing birth-year edit needs <method>; the store approving a
> minor's payment does / does-not let us off the hook; and reading the platform age signal is fine if we
> <condition>.' Right?"

**[If B3a rippled: read the ripple flag aloud and note it goes to the architect alongside any C2 ripple.]**

---

## Segment 4 — Cross-org & lifecycle  *(joining a family; growing up)*

### Frame · ~1.5 min
> "Two situations where a child's data crosses a boundary. **One:** a child's data ends up in a **second group**
> — a teen joins a parent's family, or an outside tutor's group. **Two:** a managed child **grows up** and
> takes over their own account. Both raise 'whose consent, and what happens to the data already gathered.'"

### Ask

**D1 — Cross-org consent**
> "When a charge's data lives in a **second organization** — say a teen who joins a parent's family, or an
> external tutor's group — **whose consent governs** that data there? And is an **external tutor seeing it** a
> **third-party share** that needs its own consent? Give us the precedence rule when two groups are involved."

**D2 — Graduation & legacy data**
> "When a managed child **graduates** to their own account — same person, now deciding for themselves — does
> the **parent's original consent survive** that change, or must consent be **re-taken**? And the data gathered
> **under the old consent** — how must it be handled once the person is self-determining?"

### Capture + play back
**[Ledger → Part 10:]** `D1 cross-org-consent [<Rule>]`, `D2 graduation-legacy-data [<Rule>]`.
> "Plain version: **[restate]** — e.g. 'in a second group, the original parent's consent still governs the
> child's own data, and an outside tutor seeing it is a third-party share that must be disclosed; at graduation
> we re-take consent from the now-grown teen and the old data carries forward under their control.' Match?"

**[Ripple check: if counsel's cross-org answer implies a consent structure the model can't express — e.g.
two simultaneous governing consents — flag to the architect; it touches the join/multi-group design.]**

---

## Segment 5 — Forward-looking, parameters & the launch gate

### Frame · ~1.5 min
> "Last group — a couple of horizon questions, two small parameters, and the wrapper that ties it together: the
> formal impact assessment that gates launch."

### Ask

**E1 — EU AI-Act high-risk trigger**
> "Our tutor **adapts** — it steers what a learner studies next. Does that put us inside **EU AI-Act Annex III
> 3(b)** — *the high-risk category for AI used in education that steers a learner's outcomes*? If we're in
> scope, what does it oblige?"

**E2 — Ofcom child-AI-chatbot regulation**
> "UK rules on child-facing AI chatbots are still forming. What's the **current posture**, and what's the
> **trigger** that should make us revisit? *(We expect 'monitor' — confirm.)*"

**E3 — Moved-country grace window**
> "When someone moves into a stricter country and we **pause the AI** until they re-consent, how long may that
> paused state last before we **require** resolution? Give us the **floor** on the grace window."

**E4 — Minor double-billing disclosure**
> "A teen who joins a family **while still paying their own** app-store subscription keeps paying until **they**
> cancel it in the store — we can't refund a store purchase from our side. **Question:** what **disclosure**
> must we show, and is any **grace** required, given the person paying is a **minor**?"

**E5 — DPIA as the launch gate**
> "Finally the wrapper: children + AI + learning profiles means a **DPIA — Data Protection Impact Assessment,
> the formal risk study regulators expect** — is effectively mandatory and should **gate paid launch**.
> Confirm the **scope**, that it **gates launch**, and tell us what input it still needs that today's answers
> didn't cover."

### Capture + play back
**[Ledger → Part 10:]** `E1 ai-act [<Rule/Monitor>]`, `E2 ofcom [<Monitor>]`, `E3 grace-window [<Param>]`,
`E4 double-billing-disclosure [<Param/Rule>]`, `E5 DPIA [<Rule + gate>]`.
> "Plain version: **[restate]** — e.g. 'we're/we're-not high-risk under the AI-Act; Ofcom is monitor-only for
> now; the paused state can run N days; the double-billing notice must say X with N-day grace; and the DPIA is
> required, gates paid launch, and still needs Y.'"

---

## Closing

When all five segments are done:
- Confirm **every one of the 16 questions** (plus the DPIA wrapper, E5) carries a **Rule / Parameter / Monitor**
  outcome **+ a `basis:` citation** in **PRD Part 10** (resolving G1–G4 there; recording the newer items
  alongside), or an explicit "counsel to revert by <date>."
- **Read the ripple flags aloud — there are two.** **(1) C2 parent-delete:** if no/conditional, it reopens the
  last-guardian rule + the related invariant. **(2) B3a store-delegation liability:** if we retain liability, it
  reopens inv 17 v1.1 (payment store-delegation, no age gate of ours). Both go to the **architect**; nothing
  about either is final until the architect rules.
- Hand the PM the **two structural carries:** C1's retained-record categories (a data-model constraint) and
  the open **DPIA (E5)** as the launch-gating wrapper the rest feeds into.
- Note the **REQ-2 label-drift** cleanup (rename the newer set so it stops colliding with the original
  6-question register).
