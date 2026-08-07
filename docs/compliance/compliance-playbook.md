# The Compliance Playbook — how this actually works, step by step

**Written:** 2026-08-07 · **Audience:** a non-legal founder (you) · **Status:** living document — update it
whenever the process teaches us something new.

This is the answer to "if I had to repeat this from the start tomorrow, where would I begin?" Everything
ZWIZZLY has done on privacy/AI-law compliance since June 2026 fits one repeatable six-step loop. Each step
below says: what it is in plain words, who does what, what documents it produces, and where the real
examples live in this repo (they double as templates).

**The division of labour, once, up front:**

- **You (founder)** make decisions, sign things, send emails, and rule on trade-offs. You never draft from
  scratch.
- **The agent** drafts everything, keeps the trackers, digs the evidence out of the codebase, and tells
  you exactly what decision is needed and what it recommends.
- **The expert (DPO / counsel)** rules on legal questions, reviews the drafts, and closes items. You buy
  their judgment, not their typing.

---

## The six-step loop

### Step 1 — Inventory: write down what the product does with whose data

Plain words: before anyone can say "is this legal?", someone has to write down what data the product
touches, why, where it goes, and how long it stays. Boring, foundational, and reused by every later step.

| Produces | Real example / template |
|---|---|
| Record of processing activities (RoPA) | [`ropa.md`](ropa.md) |
| Data-protection impact assessment (DPIA), draft | [`dpia.md`](dpia.md), [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) |
| Purpose × legal-basis × recipient × retention matrix | [`evidence/2026-07-30-purpose-basis-recipient-retention-matrix.md`](evidence/2026-07-30-purpose-basis-recipient-retention-matrix.md) |

Done when: every data flow has a written purpose and legal basis, even if some entries say "open".

### Step 2 — Get an expert, and set up how you work together

Plain words: a product for children processing personal data needs a Data Protection Officer. Finding one
is easy; the real work is agreeing the ground rules — independence, contact channel, what's in the
retainer vs. billed separately, and how they invoice.

| Produces | Real example / template |
|---|---|
| Services agreement + formal designation | [`DPO exchanges/2026-07-31-services-agreement-clean.md`](DPO%20exchanges/2026-07-31-services-agreement-clean.md), [`…formal-designation-clean.md`](DPO%20exchanges/2026-07-31-formal-designation-clean.md) |
| The dedicated contact mailbox spec | [`evidence/2026-07-31-dpo-mailbox-setup-memo.md`](evidence/2026-07-31-dpo-mailbox-setup-memo.md) |
| A correspondence log (see step 4's tracker — same file) | [`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md) |

Done when: both appointment documents are signed, the mailbox is live and tested, the authority
(Datatilsynet) is notified.

Lesson learned: log every email in and out, dated, in one table. Half the confusion in any long expert
exchange is "what did we already send them?" — the log kills it.

### Step 3 — Classify: which laws bind this product, and how hard?

Plain words: the expensive question. Is the product "high-risk" under the AI Act? Which countries can it
launch in? What age rules apply? Answers arrive as *records with reasons*, because a regulator asks "show
me why you concluded that", not "what did you conclude".

| Produces | Real example / template |
|---|---|
| AI Act classification record (the big one) | [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) |
| Prohibited-practices check (Art 5) | [`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md) |
| AI-literacy note (Art 4) + trigger card + read log | [`2026-07-30-ai-act-art4-ai-literacy-note.md`](2026-07-30-ai-act-art4-ai-literacy-note.md), [`2026-08-07-ai-act-trigger-card.md`](2026-08-07-ai-act-trigger-card.md), [`2026-08-07-ai-literacy-acknowledgement-log.md`](2026-08-07-ai-literacy-acknowledgement-log.md) |
| Launch-country perimeter ruling | [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md), [`2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md) |

Done when: the expert has reviewed the classification and the conditions that keep it true are written
down as standing constraints (our "seven triggers" + trigger card).

Lesson learned: a favourable classification is a **set of facts you must keep true**, not a certificate.
The record must say which facts, and who watches them.

### Step 4 — Get an action register: the expert turns risk into a numbered to-do list

Plain words: after reading your inventory, the expert issues advice with a numbered list of actions
("provide evidence of X", "document Y"). That list becomes THE tracker — the single page that tells you at
any moment what is open, who owes what, and what was already sent.

| Produces | Real example / template |
|---|---|
| The action-register tracker (actions + statuses + correspondence log, one file) | [`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md) |

Done when: never — this file is the workstream's heartbeat until launch. Statuses only move to
"closed" when the *expert* closes them, never by our own assertion.

Lessons learned: (1) ask the expert *bounded* questions — "confirm our reading of X" beats "what should we
do?"; (2) get scope + fee confirmed **before** sending documents for billable review; (3) when a message
seems to contradict the tracker, trust neither — check the source email.

### Step 5 — Evidence packages: prove what the product actually does

Plain words: for each register action, someone must gather *proof* — not intentions. That means reading
the actual code and documents, citing exactly where each claim is true, and marking honestly what's
missing. A package that admits its gaps with a fix plan passes review; a package that oversells gets
bounced and costs a round-trip.

| Produces | Real example / template |
|---|---|
| A per-topic evidence package (the best full example) | [`memory-unlock-package/00-overview.md`](memory-unlock-package/00-overview.md) + its five sections |
| Vendor evidence requests (what to ask an AI provider) | [`evidence/2026-07-26-provider-dpa-request-email.md`](evidence/2026-07-26-provider-dpa-request-email.md), [`evidence/2026-07-26-cerebras-dpa-followup-email.md`](evidence/2026-07-26-cerebras-dpa-followup-email.md) |
| Filed vendor artifacts (DPAs, screenshots, hashes) | `evidence/providers/` |

The house rules that make a package trustworthy (worth copying anywhere):

1. Every factual claim cites a document or a code location that was actually read — or is marked
   `[GAP: …]` with a proposed fix.
2. Planned work is labelled *planned* with its tracking ID, never described as existing.
3. Questions for the expert are stated up front, numbered ("R1–R7"), so the review produces rulings, not
   only comments.

Done when: the package answers the expert's own scope wording element by element, and every gap carries
either a fix or a question.

### Step 6 — Rulings → fix → repeat, until the gates open

Plain words: the expert reviews, sends corrections and rulings; we fix, update the tracker, and resubmit.
Each pass shrinks the register. The endgame is a small set of launch gates (for us: the consolidated DPIA,
the vendor evidence, the memory unlock, Art 50 implementation) — when they close, you launch.

Lessons learned: (1) fill your own blanks before sending anything for review — a document with your own
`[OPEN]` fields buys a correction cycle at your expense; (2) pre-fix pass before every submission: read
the document as the reviewer will, fix everything self-inflicted; (3) file the expert's replies as source
documents the day they arrive, so quotes can always be verified.

---

## If you started from zero tomorrow

Order matters less than people fear, but this sequence avoids rework:
**1 → 2 in parallel** (inventory while the DPO contract negotiates) → **3** (classification, with the
expert commissioned per-deliverable) → **4** (their advice becomes the register) → **5–6 looping** per
action, hardest-gating items first. Budget-wise: the expert costs are bounded and per-deliverable
(our reference points: retainer via platform; EUR 75/h or fixed fee for extras; EUR 450 for a three-document
review pass); the drafting labour is the agent's.

## Glossary (the acronyms, once)

| Term | Plain meaning |
|---|---|
| **DPO** | Data Protection Officer — the independent privacy expert the law requires us to appoint |
| **DPIA** | Data-protection impact assessment — the "what could go wrong for users and what we do about it" document |
| **RoPA** | Record of processing activities — the inventory table of all data flows |
| **DPA** | Data-processing agreement — the contract that binds a vendor handling our users' data |
| **Art 8 (GDPR)** | The children's-consent rule — the age at which a minor can consent themselves (13–16, varies by country) |
| **Art 9 (GDPR)** | Special-category data — health, religion, sexuality etc.; near-forbidden to process |
| **Art 50 (AI Act)** | Transparency — users must know they're talking to an AI; AI content must be machine-detectable |
| **Annex III (AI Act)** | The high-risk list; "education" is on it — our classification record proves we're outside it |
| **ZDR** | Zero data retention — a vendor promise not to keep our users' content |
| **Datatilsynet** | The Norwegian data-protection authority — our lead regulator |

---

*Meta: this playbook is itself part of the accountability evidence (it shows the process was systematic),
and it is the seed spec for the "compliance copilot" product idea parked in
[`../future ideas/future-app-options.md`](../future%20ideas/future-app-options.md) (addendum 2026-08-07).*
