# Facilitator Brief — Phase-E fillers walkthrough  *(read this first)*

You are about to facilitate a **PM + legal counsel** working session for the **Phase-E fillers** — the
product and legal decisions that remained as **seams** (unresolved values) when the data model
(`data-model.md`, MMT-ADR-0011) and the cut strategy (MMT-ADR-0012) were ratified on 2026-06-04. This is
the *follow-up* to the **2026-06-03 counsel walkthrough** (`_wip/identity-foundation/counsel-walkthrough/`),
which ruled the *structural* legal questions; this session rules the **values** and the **product calls**
those rulings left as seams.

The session is structurally the same (PM + counsel, side by side; you frame + ask + capture; architect is
*not* in the room). The questions are *not* the same. The 2026-06-03 session answered **"is the law
satisfied by this design?"** — the answer was **"yes, with the seams designed"**. This session answers
**"what values go in the seams, and what product call closes the last open thread?"**

---

## The setup

- **In the room:** the **PM** (owns product intent; decides product calls) and **legal counsel** (rules on
  the law; fills the value-seams where they require a legal answer). You **frame + ask + capture**.
- **Not in the room: the architect.** Two questions are canon-language calls the architect already owns
  (the `inv 17` rephrase from `I-PB-B3a`; the G7 VPC vendor pick from procurement). You **do not** bring
  those into this session — they ride the architect track async. If a counsel answer *triggers* a new
  architectural ripple, you **flag it** and the ripple goes to the architect afterward (see ripple protocol).
- **Division of labour:** you frame the situation and the **already-decided mechanism**, put the precise
  product-or-legal question, and capture the answer. **Counsel rules** on legal questions. **The PM
  decides** on product calls (often with counsel on the disclosure/regulatory implications). **The
  architect** adjudicates anything that would change the structure — async.

## How to talk in the room — the language rule  *(the most important section)*

The audience is split, so calibrate to **both** without dumbing down for either. **Carry the language
discipline from the 2026-06-03 counsel session verbatim** — the same PM is in the room, and the
discipline was tuned for that pair.

- **Speak precisely for counsel.** Legalese is **welcome** where it removes ambiguity — name the regime, the
  article, the doctrine. Do not water the substance down to sound friendly; this is a legal session.
- **Gloss only the deep, specific term — once, inline — for the PM.** A single parenthetical that *translates*,
  doesn't lecture:
  - "**verifiable parental consent (VPC — a recognised method to confirm the approver really is the parent,
    not a tick-box)**"
  - "**App-Store Declared Age Range (the age band a parent sets on the device-level family-controls)**"
  - "**Kids-Category (Apple's / Designed for Families (Google's) — the self-certification that opts a kid-
    directed app into stricter rules)**"
  - "**directed-to-children (COPPA's designation — once you serve under-13s knowingly, the rules intensify
    and don't allow most ad-tech)**"
- **Do NOT gloss general legal English** — consent, erasure, retention, disclosure, liability, grace
  period, precedence. The PM follows these fine; glossing them is the dumbing-down to avoid.
- **The test:** translate a term only if a smart non-lawyer would genuinely not know what it points to — and
  it's mostly the deep-specific COPPA / PII / AI-Act / GDPR-article / store-program terms that qualify.
  General legal language passes through untouched.
- **Keep the PM oriented without slowing counsel.** After each answer, **play it back in plain English** —
  that's where the PM's comprehension is served, not by softening the question.

## Already settled vs. being decided today

- **Settled — frame it, don't reopen it (context for counsel, not up for debate):**
  - **The data model shape.** 8 tables + the structural `person_retain` set; the clean baseline;
    append-only from the baseline forward (`data-model.md` §1 + MMT-ADR-0012).
  - **The consent model.** Append-only `consent_grant` event log; computed requirement (no stamped
    status); `birth_date` + country ISO as the only stored inputs; assurance seam (tokenised
    pass/fail only); `org_id` enforced; `controller_role` is the gated, clean-add future
    (`data-model.md` §4.8 + MMT-ADR-0011).
  - **The retention seam.** `consent_receipt` / `deletion_audit` / `financial_record` are the three
    retain-tier tables; the *value* of `retention_period` on each is the seam; the *shape* of the seam
    is locked (`data-model.md` §4.9).
  - **The structural counsel findings from 2026-06-03.** `I-C1` (receipt survives), `I-C2` (parent-
    initiated erasure lawful), `I-C4` (consent refresh at age transitions — now sweep-owned), `I-PB-B1`
    (no legal usage floor), `I-PB-B2a` (VPC disclosure-grade, tokenised), `I-PB-B2b` (direction-aware
    gate, prior value + audit fact captured), `I-PB-B3a` (architect call: `inv 17` rephrase), `I-PB-B3b`
    (platform age-signal routing-only), `I-A2` (recorded `lawful_basis`), `I-D1` v1-stance (org-scoped
    consent), `I-E3` (grace window is parameterised). These are the **decided mechanisms** each
    question *fills a value into* — counsel rules on the value, not the design.
  - **The technical scaffold.** The unified daily Inngest sweep, idempotency `personId+day`, indexes on
    `birth_date` + `residence_jurisdiction` + `last_activity_at`, denormalized `last_activity_at`
    (MMT-ADR-0009; `data-model.md` §4). The sweep *carries* some of the consumers (consent refresh at
    age crossings, moved-country grace maturation, dormancy notice); the *lengths* of those windows
    are today's inputs.

- **Deciding today — 9 questions in 2 groups** (packet §3; script order in `WALKTHROUGH.md`):
  - **Group P (Product calls — PM decides with counsel on implications):** P1 — the "11" age-floor
    (keep, raise, lower); **P2 — the store label we aim for** (IARC / App Store / Play Store band —
    4+, 9+, 12+, 17+); **P3 — does a low-age label carry additional requirements?** (Kids Category
    / Designed for Families / COPPA "directed to children" / per-jurisdiction rules); P4 — the
    Kids-Category / Designed-for-Families *posture* (opt in, or stay out); P5 — the joining-teen
    double-charge disclosure copy + grace (E4 conditioning per `I-E4`); P6 — the Family-Sharing /
    Apple-Ask-to-Buy → `payer_person_id` value (E3).
  - **Group L (Counsel parameters — counsel rules):** L1 — retention periods on the three
    `person_retain` tables; L2 — dormancy period + pre-deletion notice length; L3 — moved-country
    grace window; L4 — the boundary-crossing verification method (ties to G7); L5 — the E4
    one-of/all-of rule (co-guardian).

- **NOT this session:**
  - **The `inv 17` rephrase** (`I-PB-B3a` — canon language; architect call; out for a separate review).
  - **The G7 VPC vendor pick** (procurement, after legal requirements are clear).
  - **The Phase F build (RLS, the drizzle-kit baseline migration, the isOwner→admin-role rekey sweep).**
    Build, not design; not the right room.
  - **Product/UX re-decisions on settled flows.** The v1 family-join primitive is locked (MMT-ADR-0010);
    the e1-bis / e2 / dormancy product moves are locked (Part 10). This session is about *values* into
    seams, not redesign.

## The per-segment loop

**Frame** (the situation + what's locked, in plain English for both) → **Ask** (the precise question;
product-for-PM or legal-for-counsel, glossed-in-line) → **Capture** (one of **Rule / Parameter / Monitor /
Product call**, **always with a `basis:` citation for legal answers; product calls carry a rationale
and a downstream implication list**) → **Play back** to the PM in plain English and confirm. Run
**Group P first** (it holds the product call that gates the rest — the "11" + store posture; without
it, the legal-parameter answers may be sized to the wrong audience). Then **Group L** (the value
parameters; these can be sized once the product call is locked).

- **Rule** — a binding legal answer we build to (permissible / not / required conditions).
- **Parameter** — a legal value or threshold (a retention period, a grace window, an assurance level).
- **Monitor** — not settled in law; record current posture + the trigger to revisit.
- **Product call** — a PM-owned decision; captures the rationale + the implications (legal, UX,
  store-program), no `basis:` required but the rationale should be defensible as the product
  equivalent.

## Capture protocol

For each question: (1) say the outcome back to the PM in plain English and confirm; (2) record it in
**PRD Part 10** (the same ledger the 2026-06-03 counsel session and the B-product session both used)
tagged `Rule` / `Parameter` / `Monitor` / `Product call` with the date **and a `basis:` citation for
legal answers**; (3) if it touched something structural, add the appropriate flag (below).

**Grounding is mandatory — tell counsel up front.** No legal answer is captured as a bare yes/no; each
carries `basis:` — the provision it rests on (e.g. *GDPR Art 8 / COPPA §312.5 / Children's Code std 5 /
AI Act Art 5*). Depth scales with type: a **Rule** = provision **+ one line of reasoning**; a
**Parameter** = the governing provision; a **Monitor** = the **draft/guidance** instrument it tracks
(the honest case where no settled citation exists — Ofcom, AI-Act application). Where an answer
differs by regime, cite each (EU/US/UK). This isn't bureaucracy: the citations feed the DPIA directly
and let us re-open just the affected answers when a reg changes.

**Product calls** do not carry a `basis:` — but they **do** carry:
- the **rationale** (the product, safeguarding-capacity, or store-rating reason),
- the **implications** (legal-disclosure impact, store-program commitment, UX impact, build impact),
- the **undo cost** (how hard is this to reverse if the product call turns out to be wrong),
- the **monitor** (what signal would tell us to revisit).

**Verification-by-completion is mandatory.** Before declaring a question closed, the **factual
premises that ride the answer must be checked in code** where possible (the 2026-06-03 session found 2 of
7 load-bearing code premises false — routing keystone, PII inventory; the discipline applies here too).
Where the answer is a value, verify the *value* is in fact unsized in the current code (not silently
set somewhere we missed). The same code-citation discipline as B-tech / B-product.

## Ripple protocol — when to stop and flag

Two kinds of answer go beyond "capture and move on":

- **Architect ripple → the architect (async).** Two primary triggers in this session:
  1. **`inv 17` rephrase implications** — if the PM's "11" decision (or any other product call) lands
     in a place where the canon-language `inv 17` ("no age gate of ours; store is sole capacity
     adjudicator") becomes actively wrong vs. the product, flag it; the architect already has the
     rephrase as an open call, but the *implication* may be new.
  2. **A new consent/payment/access split** — if counsel's answer introduces a new structural axis
     (e.g. "the data must be re-keyed to a different controller than we assumed"), flag it; the
     architect's pre-wired `I-D1` posture is the canonical home for that ripple.
- **Build-side ripple → Phase F.** If the answer changes the shape of a migration step (a new
  computed column; a new event-row sub-type), flag it but don't redesign here — Phase F is where
  migrations get reshaped.

## Closing — what lands where

- **Rule / Parameter / Monitor answers** go to **PRD Part 10 §I** (the existing ledger; new `#### I-`
  headings following the 2026-06-03 numbering, e.g. `I-L1`, `I-L2`, `I-L3` for the legal parameters;
  `I-P1`, `I-P2` for the product calls — or a more readable variant; see packet §4 for the proposal).
- **Product calls** also go to **PRD Part 10 §I** under a clear `Product call` tag, with the rationale
  and implications list as the body. The PM owns the rationale wording; counsel reviews the legal
  implications section.
- **A one-paragraph handoff** at session close for the architect (any ripples), for Phase F (any
  migration-shape changes), and for the G7 procurement track (any new requirements on the VPC vendor).
- **The handoff doc** lives at `_wip/identity-foundation/_handoffs/<YYYY-MM-DD>-phase-e-fillers-complete.md`
  and follows the same shape as the 2026-06-03 counsel-walkthrough handoff: "where everything lives
  + flags for the architect + transitive next steps + monitors."

## Housekeeping the session is allowed to do

- **Re-anchor the "11" floor's parent decision** to the now-locked data model. `I-PB-B1` counsel
  ruling said "no legal usage floor, but if you keep one, document the rationale." The session
  captures the rationale in the same change.
- **Confirm the Family-Sharing / Ask-to-Buy `payer_person_id` value** (E3) by jurisdiction — counsel
  rules on whether the store-account-holder or the org-of-record is the recorded Payer.
- **Pick the moved-country grace window length** (`I-E3`) as a parameter — counsel rules, PM
  validates against the product's UX envelope.
- **Pick the dormancy + notice window** (`I-C3`) — same shape.
- **Pick the retention periods** for `consent_receipt`, `deletion_audit`, `financial_record` — counsel
  rules on the minimum; PM may opt to a longer period for product reasons (audit trail is useful past
  the legal floor).

## What the session is *not* allowed to do (without an architect re-call)

- Open a new structural data-model question. The shape is locked.
- Reopen a settled counsel finding from 2026-06-03. The findings are the seat the values sit on.
- Make a product call that would re-open a `T✓` architecture decision from the B-tech / B-product
  sessions. If it must, the architect re-runs the affected call.
- Bypass the G7 procurement gate on VPC. The vendor pick is async to this session.

## What you carry in

- The session script (`WALKTHROUGH.md`).
- The shared context (this packet + the briefing packet).
- The 2026-06-03 counsel walkthrough sources register (`counsel-walkthrough/SOURCES.md`) for citation
  cross-reference — many of today's parameter questions are *values into* the provisions the prior
  session cited.
- The `data-model.md` and MMT-ADR-0011/0012 — the schema is the canvas; values fill seams, not
  reshape it.

## What you carry out

- The capture ledger entries (Rule / Parameter / Monitor / Product call) — typed into PRD Part 10
  §I in real time if the room has a screen; otherwise into a notes file that the PM types up
  afterward (the 2026-06-03 session did the latter; pattern holds).
- A list of architect-ripple flags, if any (likely zero for this session; the open architect calls
  are inputs to the session, not outputs).
- The handoff doc written at session close (per the 2026-06-03 pattern).
