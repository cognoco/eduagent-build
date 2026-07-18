# Product Brief — Deadlock (working title)

**Status:** v2 — adversarially reviewed (6-agent panel: misreading / legal / operator lenses; 28 findings folded in) · **Date:** 2026-06-06
**Origin:** 80-finder product hunt (workflow `wf_8ed62667-dc1`), winner at 18/30. Survivor dossier + 17-candidate kill list archived in session tool-results and indexed in project memory (`project_future_app_options.md`, delta 8).
**Relationship to EduAgent/MentoMate:** separate product, shared architecture patterns. Nothing in this brief modifies EduAgent scope.

---

## One sentence

Forward one ignored complaint — or snap a photo of the bill, refusal, or contract — and Deadlock runs your entire consumer dispute to the end: it drafts each legally-grounded letter, watches the statutory clock, and walks you up to the **free** national ombudsman the moment the company has stalled long enough.

The name is the UK term of art: a **deadlock letter** is what a company issues when a complaint is exhausted, unlocking the free ombudsman early. The product manufactures deadlock on schedule instead of letting the consumer drift.

## Glossary (read first — terms used throughout)

- **ADR / ombudsman scheme:** the free, statutory alternative-dispute body for a sector. The consumer becomes eligible after a sector-specific waiting window *or* on receiving a deadlock letter, whichever is first.
- **Eligibility window:** the per-sector statutory wait before ADR is available. **These differ by sector and change over time** — they are pack data, never engine constants. Current: telecoms = **6 weeks (42 days)** for complaints raised on/after 8 Apr 2026 (Ofcom, July 2025 statement); energy = **8 weeks (56 days)**.
- **Envelope pattern:** LLM output is a structured JSON signal validated against a schema; the **server** owns all state transitions; every flow has a hard cap so it terminates even if the LLM never emits the expected signal. (Same pattern as EduAgent's `llmResponseEnvelopeSchema` + `parseEnvelope`; for a contractor without EduAgent access: structured-output tool call + schema validation + server-side state machine.)
- **Rung:** a named position on the escalation ladder. v1 ladder: `complaint → chaser → deadlock-demand → ombudsman-pack`. The server proposes rung transitions; configurably, the user confirms (see Legal posture).
- **Country/sector pack:** versioned data per jurisdiction+sector: provider→scheme mapping, eligibility window (with effective dates), admissibility rules, evidence expectations, citation allowlist, letter templates.

## The problem (evidence — corrected after legal/operator review)

1. The UK/EU consumer enforcement ladder (sector ombudsmen / ADR bodies) is **free at point of use** and frequently finds for the consumer.
2. Companies deflect as strategy: ignore, lowball, re-route to chat, wait out the clock — increasingly with seller-side AI doing the deflecting.
3. **Honest evidence status on abandonment:** the widely-quoted "a third of cases abandoned" figure measures *professional representatives* (claims firms) withdrawing financial-services complaints at the Financial Ombudsman — a sector this product excludes — and fell to ~19% after FOS introduced fees. The consumer-side signal is smaller and differently shaped (Which?: ~9% of unsuccessful complainants don't escalate, citing time/hassle). **Per-sector consumer abandonment in telecoms/energy is unmeasured. The pilot's first job is therefore to DISCOVER the baseline, not to beat a borrowed number.** The qualitative problem (consumers quit mid-dispute; nobody walks them up the free ladder) stands on the deflection dynamics and the tooling gap below.
4. Every existing consumer tool ships the **first letter** and abandons the user at round two:
   - **ComplaintPilot** (closest competitor, EU): €8.99 one-shot letter PDF. Names the escalation path; never walks it.
   - **Resolver** (UK, 5M+ users): passive webform; states in its own docs it "does not act on your behalf… does not argue your case"; monetized via B2B services to the complained-about companies.
   - **Pine AI**: real finish-the-fight agent, US-only, goodwill negotiation — not the statutory ladder.
   - **DoNotPay**: FTC consent order (finalized 16 Jan 2025, announced Feb 2025; $193k relief) for unsubstantiated "robot lawyer" claims — the cautionary framing, not a competitor.
   - The **EU ODR platform** was switched off 20 July 2025 (Regulation (EU) 2024/3228 repealing Reg 524/2013); only ~2% of submitted complaints were ever forwarded to an ADR body. Official vacuum.

**The open slot is not the drafter. It is the finisher** — the multi-round case state machine with statutory deadlines. (The hunt's meta-finding: every one-shot "snap a letter, get a letter" idea is already shipped; nobody runs the loop.)

## Who it's for + the moment of need

A consumer with a **live dispute and a dying clock**: overbilled telecom, mis-sold broadband speed, energy billing error. They have complained once and been fobbed off. They do not know the free ladder exists, and they will quit at round two without external structure. The product's one job: **don't let them quit.**

## What this is NOT (day-one invariants — violating any of these is a redline)

1. **NOT a lawyer, not legal advice, not representation.** Deadlock is a **self-help tool**: it prepares documents and tracks deadlines; **the user reviews and sends everything themselves** from their own email (the app pre-fills; a "I've sent it" confirmation step records the send). DoNotPay lessons applied: never claim legal-professional status; never make accuracy claims without evidence; ground every assertion in the user's own statutory rights; route to the free ombudsman, not court.
2. **The provider only ever corresponds with the user's own email address.** The `case@` ingestion address is inbound-only, used by the *user* to forward documents. It never appears in From/Reply-To/CC of any company-directed mail. Any future deviation is a legal-review item, not an engineering choice.
3. **NOT a claims-management company.** No success fees, no % cut, no acting-on-behalf in regulated claim categories. The six FCA-regulated CMC sectors are: financial services/products, personal injury, housing disrepair, **specified benefit**, criminal injury, employment. **v1 sectors (telecoms, energy) are outside all six** — analogous to aviation, which the FCA treats as out of scope.
4. **NOT litigation.** Small claims court is a signpost at the end of the ladder, never a feature. Issuing or conducting court proceedings on a user's behalf would cross into "conduct of litigation" (a reserved activity) and is permanently out of scope.
5. **NOT a US product.** UK first; EU later. US has no equivalent free ladder.
6. **NOT a general complaints box.** v1 supports exactly two sectors in one jurisdiction. Out-of-scope intake is told so immediately and pointed to the right free resource (Citizens Advice / correct ombudsman link) — never silently accepted. An unknown provider (not in the pack) is treated as out-of-scope with the same honest path — **never guess a scheme**.
7. **NOT free-text LLM legality.** Every legal citation in every letter comes from a **server-owned, hand-curated citation allowlist** per sector. The LLM never invents a statute. If the allowlist doesn't cover the situation, the system falls back to the **safe generic letter** (defined in Failure modes) — factual complaint + remedy sought + reply deadline, no citation, still clock-anchoring.
8. **NOT a quantum engine.** Claim value shown to the user is the **user's own remedy-sought figure from intake**, echoed back for comparison. Computed claim valuation is advice-adjacent and out of v1 scope (cut line).

## Clock model (canonical — resolves all timing questions)

- **Day 0 = the date of the user's FIRST complaint to the company**, captured as a required intake field (the user's chat/email/call date — not the app's Letter 1).
- The **eligibility window** (telecoms 42 days / energy 56 days — pack values with effective dates) runs from day 0, regardless of anything the app does.
- A **deadlock letter** from the company unlocks ADR immediately, independent of the window.
- **14-day letter reply windows are internal cadence**: they run concurrently inside the eligibility window, drive nudges and rung proposals, and never extend or pause the statutory clock.
- If intake reveals day 0 is already past the window (or a deadlock letter exists), the user may be **immediately eligible**: Letter 1 is skippable and the flow can go straight to the ombudsman submission pack.
- A **paused** case (e.g. awaiting better evidence) pauses nudges, never the statutory clock — the company's deadline keeps approaching, and the UI says so.
- Post-eligibility limits are also pack data (e.g. energy: 12 months from deadlock letter to escalate).

## How it works — one case, end to end (walkthrough)

> Anna's broadband provider raised her price mid-contract without the required notice. She complained in chat on May 2; got a scripted brush-off.

1. **Scope gate (cheap pre-pass).** Anna forwards the thread to `case@…` (Cloudflare Email Routing → Worker) or uses the web app. A lightweight classification pass determines sector + jurisdiction *before* any interview. Out-of-scope → immediate honest rejection + correct free resource. Ambiguous → one clarifying question, not a full interview.
2. **Intake interview** (in-scope only). Structured LLM interview (envelope-validated) collects: provider, **date of first complaint (required — sets day 0)**, issue class, remedy sought (her figure), evidence inventory. Server resolves provider → scheme via pack lookup (telecoms has two approved schemes — Communications Ombudsman and CISAS — every provider belongs to exactly one; energy routes to the Energy Ombudsman). Unknown provider → honest out-of-scope path.
3. **Case open + clocks.** Day 0 = May 2. Telecoms window = 42 days → eligibility lands June 13. Durable timers (Inngest): eligibility countdown, 14-day letter windows, nudge schedule.
4. **Letter 1 — the formal complaint.** Generated from the citation allowlist, states facts from Anna's own evidence, names her remedy, sets a 14-day reply window. Anna reviews a plain-language summary, sends from her own email, **taps "I've sent it"** (self-attested send — the system's recorded event).
5. **Response handling.** Anna forwards whatever comes back. The classifier emits an envelope signal — `offer | rejection | fob-off | info-request | unclassifiable` (silence is *not* a classifier output; it is a timer-detected state) — and the server executes the transition table below. Partial offer → decision aid comparing the offer to *her own* remedy figure. Human override everywhere: accept any offer at any time.
6. **The anti-abandonment engine.** Every state has a next action and a deadline; company silence is itself a tracked, narrated state ("day 31 of 42 — on June 13 you qualify for the free ombudsman; here's what happens then"). One nudge per state change, **delivered by transactional email to Anna** (see Nudge channel), framed as momentum.
7. **Escalation.** Day 42 or deadlock letter: the app generates the **ombudsman submission pack** — admissibility pre-checked against pack rules, evidence shaped to the scheme's expectations, chronology auto-built. Anna submits via the scheme's own portal (copy-paste/upload assist; no robotic form-filling of third-party portals).
8. **Outcome.** End-of-case prompt captures the result (self-reported; known reporting bias — see Metrics). Recovered money logged; anonymized, consented outcome data feeds the playbook (which letters move which providers) — internal-only in v1.

## State-transition table (v1 canonical)

| Current state | Signal/event | Server action | Clock effect | Nudge to user |
|---|---|---|---|---|
| `letter1-sent` | `offer` | Decision aid (offer vs user's remedy figure); options: accept (close) / counter (chaser rung) | none | "They made an offer — compare & decide" |
| `letter1-sent` | `rejection` | Propose chaser rung (rebuttal letter citing same allowlist) ; if window already passed → propose ombudsman pack | none | "They said no — here's the next move" |
| `letter1-sent` | `fob-off` | Propose chaser rung ("substantive reply required"); 14-day window restarts for the chaser only | statutory clock unaffected | "That's a brush-off, not an answer" |
| `letter1-sent` | `info-request` | Draft reply from existing evidence; if evidence missing → specific re-request to user | none | "They asked for X — here's a ready reply" |
| any active | 14-day window lapses (timer) | Mark `company-silent`; propose next rung; narrate countdown | none | "Silence is progress: day X of Y" |
| any active | eligibility reached / deadlock letter (timer/classifier) | Generate ombudsman submission pack | post-eligibility limit starts (pack) | "You now qualify for the free ombudsman" |
| any | `unclassifiable` (low confidence) | Human-in-loop: show reply, ask user to characterize | none | "We read their reply — does this look like an offer to you?" |
| any | user accepts offer / abandons | Close case (accepted/abandoned); end-of-case outcome prompt | timers cancelled | honest close, zero dark-pattern retention |

All rung *proposals* are server-decided; whether the server may auto-advance or must wait for user confirmation is a **config flag, default = user confirms** (legal-review-friendly fallback is therefore the default, not a rebuild).

## v1 scope

| Dimension | v1 decision | Why |
|---|---|---|
| Jurisdiction | **United Kingdom** | English-only; densest free-ombudsman ladder; complaint-letter drafting is not a reserved activity (LSA 2007 s.12); deadlock-letter mechanic |
| Sectors | **Telecoms + Energy** | Mandatory free ADR, crisp (but **different**) eligibility windows, huge volume, outside all six CMC-regulated sectors |
| Clocks | Per-sector pack values w/ effective dates (telecoms 42d eff. 8 Apr 2026; energy 56d) + a test asserting the two sectors differ | Ofcom changed telecoms in 2026 — the engine must handle divergent timers from day one |
| Surface | **Web app + inbound email** (Hono API on Cloudflare Workers; web client with auth (Clerk), evidence upload, case dashboard, decision aids) | Disputes are document-and-email-shaped; mobile is v2 |
| Sending (to company) | **User sends everything** from own email + "I've sent it" confirmation | Legal posture; zero agency risk |
| Nudge channel (to user) | **Transactional email** (provider in scope, e.g. Resend/Postmark) + open/click tracking | The anti-abandonment thesis requires reaching users who left the app; in-app-only nudges would silently destroy the core metric. App→user transactional mail is distinct from the redlined app→company sending |
| Instrumentation | Event log of all case-advancing actions + nudge opens (required for the kill metric) | Metrics below are computable only with this |
| Pilot cap | **75 accepted cases** (cap on cases, not users; one user may run multiple). At cap: honest waitlist, never silent drop | Big enough to discover the baseline; small enough to hand-review every letter |
| Pilot funnel | **One named community partnership** (money-saving/consumer community) as precondition, optionally + small paid-search test on exact high-intent terms. **SEO is a v2 growth bet, not a pilot channel** — new domains don't rank in pilot timeframes | Operator finding: no funnel existed in v1 of this brief |
| Languages | English only | Multi-language is EU expansion, not validation |

**Cut lines (v1 ships without):** financial-services complaints (CMC + FCA adjacency — separate legal review first), flights/EU261, auto-submission to third-party portals, computed claim valuation, payment handling of recovered money (never touch the money), mobile apps, B2B2C deals, more jurisdictions, public playbook data.

## Legal posture

**Gate, not garnish: the citation allowlist + the automated rung-decision logic must pass review by a qualified UK adviser BEFORE the pilot accepts a real user's case.** Build may start in parallel; launch may not. If the adviser rejects automated rung-advancement, the config default (server proposes, user confirms) is already the shipped behavior.

- **Self-help framing throughout:** the product prepares; the user acts. Complaint-letter drafting and ombudsman submission assistance are not reserved legal activities under s.12 Legal Services Act 2007 (the six reserved: rights of audience, conduct of litigation, reserved instruments, probate, notarial, oaths). Redline: anything touching court proceedings.
- **CMC scope:** the six FCA-regulated claims sectors (financial services/products, PI, housing disrepair, specified benefit, criminal injury, employment) exclude telecoms/energy. Financial sector stays out of product until separately cleared.
- **DoNotPay consent-order lessons (16 Jan 2025, $193k):** beyond "never say lawyer" — the FTC faulted *untested accuracy claims*. Therefore: a qualified adviser reviews the allowlist and sample letters; no accuracy claims without evidence; publish plainly what the tool does and doesn't do.
- **Citations allowlist:** versioned data, named review cadence (monthly + on regulator announcements). A stale citation **or stale deadline** is a sev-1 bug (this brief's own v1 shipped one — the 8-week telecoms window — caught in review; the failure mode is real).
- **GDPR (not "standard"):** Art 6(1)(b) contract performance for running the case, BUT complaint narratives routinely contain **special-category data** (health, financial hardship) → identify an Art 9 condition (explicit consent at intake, or the legal-claims condition) before pilot. Forwarded threads contain third-party personal data → minimisation + transparency note. No training on user docs; deletion on request.

## Architecture (reuse map)

| Need | Source | Status |
|---|---|---|
| LLM proposes / server decides | EduAgent envelope pattern (structured signals, schema validation, server transitions, hard caps) | Reuse pattern; new schemas |
| Durable statutory timers | Inngest | Reuse |
| Case state machine | **Net-new** (EduAgent's session machine is a learning loop, not a legal-deadline machine) | New build |
| Citation allowlist + letter templates | **Net-new**; LLM writes prose around server-supplied citations, never the reverse | New build + legal curation (calendar-gated) |
| Country/sector pack | **Net-new, the moat**: mappings, windows w/ effective dates, admissibility, templates. Forever-maintenance is real — v1 = 2 sectors × 1 country so one person can keep it correct | New build |
| Email ingestion + OCR | Cloudflare Email Routing → Worker; **parsing arbitrary forwarded threads + phone-photo bills is a risk spike, not a footnote** | New build (spike first) |
| Transactional email (nudges) | Provider TBD (Resend/Postmark tier) | New, small |
| Auth/billing | Clerk + Stripe (dormant in EduAgent, correct for web) | Reuse |
| Eval harness | EduAgent `eval-llm` pattern: letter snapshots per fixture; classifier accuracy fixtures | Reuse pattern |
| Event instrumentation | Case-action event log + nudge open/click | New, required for metrics |

**Build estimate (re-baselined per operator review):** engine (state machine + timers + envelope) 2–3 wk · citation/template engine + 2 sector packs 2–3 wk of code **plus uncapped legal-curation calendar time** · email-ingest/OCR 1–2 wk (spike) · web client 1–2 wk · eval + fixtures 1 wk → **7–11 weeks of build**, with legal review as a parallel track that **gates pilot launch independently**. The original "4–6 weeks" undercounted net-new subsystems.

## Monetization (phased; no pricing promises in v1 UI)

1. **Pilot:** free, 75-case cap. Goal: discover the abandonment baseline + prove the loop. Not revenue.
2. **v1.1 test:** end-of-case "pay what it was worth" + a household legal-cover tier (~£2–4/mo). **Honest status: episodic-dispute subscription retention is UNPROVEN** (the previously-cited DoNotPay "~70% retention" is uncorroborated and measures a different thing); whether anyone holds a subscription between disputes is itself a v1.1 kill question. Minimum N for the pricing test: ≥100 completed cases before reading conversion.
3. **v2 channel:** B2B2C (insurers' legal-protection arms, neobanks). Asserted, not proven; don't build for it pre-validation.

## Metrics + kill criteria (all defined on observable events)

Definitions: **"send"** = user taps "I've sent it" (self-attested). **"Return event"** = any case-advancing action (app open from nudge, document forward, letter confirmed sent) within 7 days of a state change. **"Completed case"** = user reports an outcome, accepts an offer, or the post-eligibility limit lapses. Company replies are observable **only via user forward** — an ignored company reply is indistinguishable from silence; the round-2 metric is therefore defined on nudge response, not on company behavior.

| Metric | Definition | Target | Kill threshold |
|---|---|---|---|
| Activation | accepted intake → letter 1 confirmed sent | ≥ 70% | < 40% |
| **Round-2 continuation (the thesis)** | of users who reach `letter1-sent`: % with a return event after the first post-Letter-1 state change + nudge | ≥ 80% | **< 50% after nudges → thesis dead, kill product** |
| Abandonment | active cases with no return event for 21 days | **pilot discovers the baseline** (no trustworthy public benchmark exists — see Problem #3) | judged vs. discovered baseline at pilot review |
| Resolution | of completed cases: offer accepted or ombudsman decision (self-reported; bias noted) | ≥ 50% | — |
| Time intake → letter 1 | median | < 15 min | — |
| Letter accuracy (pilot, human-checked) | citation correctness | 100% | any invented citation = stop-ship |

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Out-of-scope intake | Sector/jurisdiction unsupported (pre-pass) | Immediate honest "we can't run this one" + correct free resource | Trust kept; nothing silently accepted |
| Unknown provider | Provider not in pack | Same honest out-of-scope path | **Never guess a scheme** |
| Company never replies | 14-day window lapses | "Silence is progress: day X of Y" + next rung ready | Clock runs toward eligibility |
| Unreadable evidence | OCR/extraction confidence below threshold (tunable config, documented v1 default) | Specific re-request ("photo of the full bill, all four corners") | Case **paused** — nudges pause, **statutory clock continues and UI says so** |
| Classifier unsure | `unclassifiable` signal | "Does this look like an offer to you?" | Server never acts on low-confidence signals |
| Admissibility pre-check fails | Scheme rules unmet (too early, wrong scheme, time-barred) | Plain explanation + what would change it | No doomed submissions |
| Allowlist gap | Situation not covered by citations | **Safe generic letter**: factual complaint + remedy sought + 14-day reply deadline, no statutory citation, still clock-anchoring, still send-worthy | Letters say less, not more; pack gap ticketed |
| Stale pack | Regulator changes rule/window | Ops alert (review cadence); affected templates frozen → generic fallback | Sev-1 until pack updated |
| User wants to quit | Explicit abandon | One honest "here's what you're walking away from" then immediate respectful close | Never dark-pattern retention |

## Risks (honest)

1. **Gasp needs a primer** — value prop requires teaching that the free ladder exists. Lead with recovered-money proof, not mechanism.
2. **Episodic use** — 1–3 disputes/year. v1.1's subscription question is open and might kill the business model even if the loop works.
3. **Pack maintenance is forever-work** — and this brief itself demonstrated the failure mode (stale telecoms window). Scope discipline + effective-dated pack values + review cadence are the mitigation, not a cure.
4. **Acquisition is unproven** — pilot funnel depends on one partnership being signed; SEO is a multi-month v2 bet against Resolver/Citizens Advice authority.
5. **All external-facing statistics must be re-verified against primary sources** (Energy Ombudsman / Communications Ombudsman / CISAS annual reports) before marketing use.

## Open decisions (none block build start; #2 blocks pilot launch)

1. Name check: "Deadlock" trademark/domain.
2. **Which community partnership** for the pilot funnel (precondition to pilot).
3. Transactional-email provider pick.

## Relationship to "Owed"

Companion brief: `docs/product-briefs/2026-06-06-owed-product-brief.md` (statutory late-payment collector for freelancers). Shares the chassis (pack, allowlist, letter engine, clock rails, self-help posture). Decision rule: **Deadlock validates the chassis first**; Owed's Stage 0 demand test can run independently and cheaply at any time. Owed carries its own statutory-figure verification debt (Late Payment Act bands, Directive 2011/7/EU) — verified in its own brief, not inherited from this one.
