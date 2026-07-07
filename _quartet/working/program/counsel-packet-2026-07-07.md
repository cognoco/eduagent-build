# Counsel packet — MentoMate launch compliance questions (2026-07-07)

**From:** program management (drafted by PM, sent by operator) · **Commissioned:** Roadmap-A
Phase-0 rulings, operator 2026-07-07 (substrate events 33 + 38). **One consolidated engagement**
covering four interlocking questions; Q1 (controller entity) determines whose regulator's
guidance frames the other three.

## Product facts counsel needs

- **MentoMate**: mobile AI-tutoring app; children are a core audience (guardian-owned accounts
  with linked child profiles; solo adult learners also supported). Pre-launch: closed beta with
  invited families, then EU app-store launch.
- Learner conversation content is processed by third-party LLM providers (US-based processors)
  under DPAs; a DPIA and ROPA exist (`docs/compliance/dpia.md`, `ropa.md`), privacy policy
  drafted (`docs/privacy-policy.html`).
- UI locales: en, de, es, ja, nb, pl, pt. Company presence: Czech Republic (Cognoco s.r.o.) and
  Norway (operator-resident; entity TBD).

---

## Q1 — Controlling legal entity (WI-1559; blocks privacy-policy publish)

The draft privacy policy names the controller **Cognoco s.r.o.** (Czech); the DPIA and ROPA say
controller "[legal entity name — TODO], established in Norway". Clean contradiction.

**Question:** which entity should be the data controller for launch — Cognoco s.r.o., or a
Norwegian entity to be established? Please advise on the deciding factors (lead supervisory
authority under GDPR one-stop-shop, children's-data guidance divergence CZ ÚOOÚ vs Datatilsynet,
tax/operational nexus is out of scope for this packet) and confirm the choice so policy/DPIA/ROPA
can be reconciled to one name.

**The answer decides:** the regulator whose children's-data guidance applies to Q2-Q4; the name
stamped across all three compliance documents before publish.

## Q2 — Guardian consent denial: may we retain, or must we erase? (spec-triage ruling 4-D2)

Product ruling (operator-co-signed): when a guardian **denies or withdraws consent** for a child,
the account enters a dormant "denied" state — child data retained but processing suspended,
resumable if the guardian later consents — **unless legal requires that denial close the account**.

**Question:** under GDPR (Art. 6/8, storage-limitation, and the applicable regulator's
children's-data guidance), may we retain a child's profile and learning history in a suspended
non-processing state after explicit guardian denial/withdrawal, and if so for how long and under
what safeguards? Or does denial/withdrawal trigger an erasure obligation (and on what timeline)?

**The answer decides:** whether we build a new "denied" account state (retention permitted) or
route denial to the existing account-deletion path (erasure required). Note to counsel: we have
not yet audited what the current build does on denial; if erasure is obligatory we will treat any
retain-behavior as a pre-launch fix.

## Q3 — Crisis disclosure + safety escalation duties (audit A-03; operator-ruled launch slice)

We are building, pre-launch: crisis-disclosure detection (child discloses self-harm/abuse/crisis
to the tutor) → age-appropriate in-app resources + guardian notification, plus routing of
blocked-safety events (dangerous-procedure requests, PII exposure, suitability violations) to a
daily human-review digest.

**Questions:**
1. **Duty to notify/report:** in the launch jurisdictions (CZ / NO / DE / ES / PL / PT — plus JP
   if in scope), does a private ed-tech provider have any mandatory-reporting or
   duty-of-care obligation when its system detects a minor's self-harm or abuse disclosure?
2. **Guardian notification:** is notifying the guardian on a crisis disclosure legally required,
   merely permitted, or in some scenarios *contraindicated* (e.g. disclosed abuse **by** the
   guardian) — and what should the product's default be?
3. **Helpline resources:** any legal constraints on surfacing third-party crisis helplines
   in-app to minors per locale (we will source locale-correct numbers separately; the question is
   whether display carries obligations or liability).

**The answer decides:** the escalation flow's legal floor (what must happen vs. what we choose),
and the guardian-notification default including the abuse-by-guardian carve-out.

## Q4 — DPIA name-minimization contradiction (WI-1558)

DPIA §4/A13 claims identifiers are "stripped from LLM requests," but the learner's **first name
is sent verbatim to the LLM** (`exchange-prompts.ts:734`) — an affirmative false minimization
claim in a legal document, material for a children's product. Product will resolve it one of two
ways: **(a)** tokenize/strip the name before the prompt (name shown in UI only), or **(b)** amend
the DPIA to disclose that the first name reaches processors.

**Question:** does counsel see (b) as defensible for a children's product under the applicable
regulator's minimization expectations, or should we treat (a) as effectively required? (Product
has not foreclosed either; engineering cost of (a) is modest.)

**The answer decides:** a small engineering WI (a) vs a DPIA amendment (b), before publish.

---

**Requested form of answer:** short memo per question; flag anything that changes if the Q1
entity answer goes the other way.
