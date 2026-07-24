# Product Brief — Owed (working title)

**Status:** v2 — adversarially reviewed (6-agent panel: misreading / legal / operator lenses; 27 findings folded in) · **Date:** 2026-06-06
**Origin:** 80-finder product hunt (workflow `wf_8ed62667-dc1`), runner-up at 15/30.
**Honest framing:** a **staged demand experiment**, not a committed product. The hunt's judges flagged a credible demand risk (fear thesis, below); this brief is designed so that risk is tested for ~1–2 weeks of effort before any real build.

---

## One sentence

The moment a **business client** pays late, Owed computes the statutory interest **plus the fixed per-invoice compensation the law already grants you** (UK: £40/£70/£100 by invoice size) and prepares the escalating, tone-calibrated chase in your client's language — so awkwardness never costs you money.

**Scope note (load-bearing):** statutory late-payment rights are **B2B only**. The UK Late Payment of Commercial Debts (Interest) Act 1998 and EU Directive 2011/7/EU do not apply to consumer clients. The product must know which kind of client it's dealing with before it shows a single number (see Stage 0, step 1).

## Dependencies (read before estimating anything)

| Dependency | What it is | Status | Location |
|---|---|---|---|
| **Deadlock chassis** | Country/sector pack format, citation allowlist, letter engine + tone calibration, clock rails (Inngest), envelope-classified reply handling, self-help posture, Stripe billing, eval-harness letter snapshots | **Unbuilt — Deadlock is itself a reviewed brief, pre-build** | `docs/product-briefs/2026-06-06-deadlock-product-brief.md` |
| Stage 0 | Needs **none** of the chassis — static calculator + one LLM letter call, deliberately throwaway | Buildable today | — |

**Stage 1 cost is contingent (two-column truth):**

| Scenario | Stage 1 cost |
|---|---|
| Deadlock chassis exists | ~1–2 weeks (module: invoice ingestion + UK late-payment pack + reminder ladder on existing rails) |
| Chassis does not exist (Deadlock dead/not built) | Effectively the Deadlock engine build, ~5–8 weeks (state machine, letter engine, pack format, reply classifier) — **re-evaluate whether Owed alone justifies it** |

**A positive Stage 0 gate does NOT authorize Stage 1 spend until the chassis-source question is resolved.**

## The problem (competitor framing corrected after review)

- Late payment is near-universal for freelancers and chasing is hated emotional labor.
- Almost no freelancer knows the law **already** owes them money when a B2B invoice is late — no contract clause needed. It goes unclaimed by default.
- **Corrected competitive truth:** the statutory *computation* is already commoditized — Paidnice auto-applies statutory interest (BoE rate auto-updated) and publishes a free EU Directive calculator, gated behind Xero/QuickBooks and priced for finance teams; Landolio ships a free UK calculator beside its £19 template pack; the reminder category (FreshBooks/Bonsai/Wave/Reminvo/Plutio…) sends bland nudges or arbitrary user-set fees.
- **The actual unoccupied wedge is exactly two things:** (a) **client-language localization** of the chase (German Mahnung, French mise en demeure, Norwegian purring conventions — nobody does this), and (b) **zero-integration self-serve posture** (works for the freelancer emailing a PDF invoice, no accounting platform required). **Stage 0 tests whether THAT delta — not the math — drives sending.**

## The demand-risk thesis (why this is an experiment)

The hunt's strongest counterargument, kept front and center: **the real friction may be relational fear, not drafting labor.** Freelancers don't fail to chase because writing a firm letter is hard; they fail because invoking statutory rights against a client they want to keep feels like ending the relationship. An LLM makes the scary button easy to press — many still won't press it. If so, this is soft demand wearing a feature costume and must die cheaply. **The product is gated on a send-rate experiment, instrumented to be honest in the kill direction** (the proxy must not over-count sends — see gate).

## Staged plan

### Stage 0 — the send-rate test (1–2 weeks, the only committed scope)

A free, no-signup web tool: *"What your late invoice already owes you."*

1. **Intake:** invoice amount, due date (= the agreed payment date; interest accrues from the day after — the tool does **not** apply a separate 30-day default when a due date is given), client country, **and: "Is your client a business (company, sole trader, partnership, public body) or a private individual?"**
   - **Consumer client → no statutory amounts exist.** Branch immediately: plain, firm reminder letter only, clearly labeled ("statutory late-payment rights apply to business clients only"). Never assert an entitlement that does not exist. B2B-vs-consumer mix is a required analytics dimension so the gate isn't computed on a polluted denominator.
2. **The money proof (B2B only):** "Your client legally owes you **£X interest + £Y fixed compensation** as of today" — computed per the Statutory-math appendix below, server-side, never by the LLM.
3. **The letter:** tone-calibrated (gentle/standard/firm selector), in the client's language (explicit language selector, defaulting from country — see Localization split), opened in the user's own email via mailto / copy button. **User sends it themselves** (same self-help posture as Deadlock).
4. **Outcome capture:** optional email field on the letter screen ("we'll check in once") → 48h follow-up "did you actually send it?" → 2–3 week follow-up "did they pay?". Without the optional email, a returning-cookie prompt covers a sub-cohort.

**Localization split (review-mandated):** the **relational/tone wrapper** may be LLM-localized into any language; the **statutory assertion** appears only in curated locales (English/UK at launch). In uncurated languages the letter shows the amount as a figure with a neutral, non-statutory sentence. The LLM never phrases a legal demand in a language with no allowlist, and per-language formal-notice conventions (Mahnung etc.) require a named native-speaker/professional review before that locale's statutory wording ships.

**Distribution (corrected):** SEO is **not** a Stage 0 channel — a new domain cannot rank inside the test window against Paidnice/Landolio/Xero. Day-one channels: small paid-search budget on exact high-intent terms ("late payment interest calculator", "client won't pay invoice") + posts/partnership in 1–2 freelancer communities. SEO content begins at Stage 0 but is a Stage 1+ asset.

**Decision gate (instrumented honestly):**
- **Funnel events:** letter generated → mailto opened / copy clicked → 48h self-report "sent" → 2–3wk "paid". The gate reads **the latest honest signal available** (self-reported send, discounted for social-desirability), never the raw mailto click (an upper bound: opening a draft ≠ sending it — and the draft-closed-unsent case is precisely the fear thesis).
- **Minimum sample:** gate is not evaluated before **≥150 letter-generation events from non-network traffic**. Below that in 2 weeks → INCONCLUSIVE (extend or add channel), not a kill.
- **Thresholds:** confirmed-send rate **≥25% → proceed** toward Stage 1 (subject to chassis question). **<15% → archive** with findings; keep the calculator live as an SEO asset feeding the chassis products. **15–25% → one tone-variant extension** (test whether gentle-tone framing unlocks sending) of ≥100 further letters; same thresholds re-applied; **a second in-band result = archive**.
- **Honesty rule:** a high mailto rate with low confirmed-send / payment follow-through is a **KILL** signal (fear thesis confirmed at the exact moment predicted), not a pass.

### Stage 1 — the watcher (build only after the gate AND the chassis question)

Forward an invoice (email/PDF) → Owed tracks the due date silently → on lateness, proposes the escalating ladder, each step user-approved and user-sent:

1. Gentle nudge (relationship-preserving, client's language)
2. Statutory assertion (curated locales; amounts per appendix)
3. **Final notice — permitted escalation options, exhaustively:** (a) restate statutory entitlement with a final reply date; (b) signpost (link + plain explanation, no document generation) to the small-claims route and, post-reform, the Small Business Commissioner. **Forbidden at every rung:** generating court filings; letters threatening collection action; any Letter Before Action *unless* it has been explicitly legal-reviewed as a self-help template; anything implying Owed acts for the user.

GDPR (Stage 1 only): the user is **controller** of their client's data; Owed is **processor**. Define lawful basis (legitimate interest/contract), invoice retention + deletion policy before Stage 1 build. Stage 0 stays no-signup / no-PII-storage by design (the optional follow-up email is the single stored field, consented).

### Explicitly never (any stage)

- **Never collect the money / never success-fee on recovered amounts** — regulated debt-collection territory. Self-help only: the freelancer chases their own debt. (This single posture is the load-bearing compliance pillar: it is what keeps Owed simultaneously outside (a) reserved legal activities, (b) FCA claims-management regulation, and (c) regulated debt collection.)
- **Never issue, file, or manage court proceedings** — pre-action correspondence only; conduct of litigation is a reserved activity (LSA 2007). Small claims is a signpost.
- **Never legal advice, never lawyer-equivalence, never guaranteed recovery** (DoNotPay/FTC lesson): the money-proof screen asserts a **statutory calculation** ("the Act entitles you to £X"), not advice and not a promise of payment.
- Never an invoicing suite. Owed never creates invoices; it reads them.

## Statutory-math appendix (UK pack v1 — the only curated locale at launch)

- **Applies to B2B commercial debts only** (1998 Act). Consumer clients: no statutory entitlement — branch per Stage 0 step 1.
- **Interest:** simple (not compound), at **8% + the Bank of England base rate**, on the debt, accruing **from the day after the due date** (the agreed payment date supplied at intake). Day-count: 365. Reference rate: the BoE base rate per the Act's reference-date convention — implementer note: the statutory reference rate is fixed per six-month reference period (30 June / 31 Dec); encode that rule, don't poll the live rate per request.
- **Fixed compensation per invoice (banded by debt size):** **£40** (< £1,000) · **£70** (£1,000–£9,999.99) · **£100** (≥ £10,000).
- **"As of today":** interest is computed to the server's current date; the letter states the daily accrual so the figure stays honest in transit.
- **Rate updates:** automated fetch of the BoE base rate with a named owner and cadence; **a stale rate is a sev-1** (mirrors Deadlock's stale-citation rule).
- EU packs later: Directive 2011/7/EU = reference rate + ≥8pp, **€40 minimum** — a floor, not a constant; national transpositions (and Norway via EEA) differ. Never hardcode €40 across EU packs. (Figures in this appendix verified against legislation.gov.uk + solicitor sources during panel review.)

## Who pays (post-gate hypothesis — not committed)

Solo EU/UK freelancers and one-person B2B service businesses. **Pricing is unresolved on purpose:** flat monthly (€6–12) fights the episodic usage the brief itself predicts; a monthly subscription is only defensible if Stage 1 proves **>1 active dispute per user per quarter**. Until then the candidate models are pay-when-it-worked (per resolved chase) or a low annual price. Do not build billing against any of these numbers before Stage 1 authorization.

## Watch items (corrected and promoted)

- **UK Late Payment reform — now a live Bill, treat as a Stage 0 gate input.** Consultation response 24 Mar 2026; Commercial Payments Bill first reading (Lords) 19 May 2026; **proposed, not enacted**; effective no earlier than 2027. It would make statutory interest mandatory/non-contractable (validates the category) AND hand enforcement to a free state adjudicator (Small Business Commissioner) — which erodes the "we compute the entitlement you didn't know you had" hook in the launch jurisdiction. **Rule: if the Bill passes committee stage before Stage 0 completes, re-test whether the value prop survives; if UK weakens, the durable market shifts to EU jurisdictions with no such reform.**
- **E-invoicing (corrected):** UK mandatory B2B/B2G e-invoicing is confirmed for **April 2029** (Autumn Budget 2025; roadmap due Budget 2026; 2027–28 is preparation, not mandate). EU national mandates phase in ~2028–2030. Medium-term it commoditizes invoice ingestion — for Owed *and* for incumbents — but it does **not** relieve near-term Stage 1 ingestion work.

## Metrics (stage-tagged; Stage 1 rows are HYPOTHESIS — do not build against them before authorization)

| Stage | Metric | Gate / target |
|---|---|---|
| 0 (committed) | Confirmed-send rate (self-report, mailto as upper bound only) | ≥25% proceed / <15% archive / in-band → one extension |
| 0 (committed) | Min-sample precondition | ≥150 non-network letter events before gate read |
| 0 (committed) | B2B vs consumer client mix | analytics dimension (denominator hygiene) |
| 0 (committed) | Reported payment after letter | informational (the future marketing asset) |
| 1 (hypothesis) | Invoices forwarded / user / month | recurrence proof needed for any subscription pricing |
| 1 (hypothesis) | % late invoices where user approves the statutory rung | the fear metric, in-product |
| 1 (hypothesis) | Free→paid conversion | set after pricing model chosen |

## Failure modes (stage-tagged)

| Stage | State | Trigger | User sees | Recovery |
|---|---|---|---|---|
| 0 | Consumer client | Client type = private individual | No statutory amounts; clearly-labeled plain reminder letter only | Never assert a non-existent entitlement |
| 0 | Uncurated-locale statutory wording | Letter language has no reviewed allowlist | Tone wrapper localized; statutory content as figure + neutral sentence | LLM never phrases legal demands in unreviewed languages |
| 0 | Wrong-country statutory math | Client country has no curated pack | Letter without statutory amounts + "interest math for {country} coming" | Never invent legal numbers |
| 0 | User fear at send | Hesitation at mailto/copy | Tone selector + "you can send the gentle one" | Meet the fear; instrument it (this hesitation IS the experiment) |
| 0 | Relationship blowback worry | Pre-send anxiety | Plain note: "this is a normal, legal request; here's how clients typically respond" | Expectation-setting, not suppression |
| 1 | Invoice parse failure | Bad PDF/photo | Specific re-request | Same as Deadlock pattern |
| 1 | Disputed invoice | Reply classified `dispute` | Honest off-ramp: "this is now a quality dispute, not late payment" + resources | Never escalate a contested debt as if uncontested |
| 1 | Debt-collector / legal inbound to user | User reports escalation against them | Scripted off-ramp: "we can't advise here — Citizens Advice / solicitor signpost" | Support boundary, pre-written |

## Day-one operational requirements

- **Support boundary:** a named triage path with pre-written off-ramp scripts ("the number was wrong" → recompute + correction letter; "my client disputed" → quality-dispute off-ramp; anything advice-shaped → Citizens Advice/solicitor signpost). For a solo founder this inbound is otherwise unbounded.
- **Rate/figure maintenance:** automated BoE base-rate fetch + owner + sev-1 staleness rule (above).
- **Per-country pack cost is not free:** each EU locale = transposition research + interest-reference + compensation rules + formal-notice conventions + native review. Budget per-pack effort explicitly before promising any locale.

## Decision rule (binding)

Owed never becomes a build commitment on its own. Sequence: **Deadlock validates the chassis → Owed Stage 0 runs as a cheap parallel demand test whenever convenient → Stage 1 only if (a) the send-rate gate passes, (b) the chassis question is resolved, and (c) the UK reform gate-input hasn't invalidated the UK hook.** If Deadlock dies but Stage 0 gates positive, the chassis cost lands on Owed alone (~5–8 weeks) — re-run the build/kill decision with that number, don't inherit the module-cost framing.
