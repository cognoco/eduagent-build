# Future App Options — Reusing the EduAgent Engine

Captured 2026-05-24 from a strategy conversation. This is **forward-looking product thinking**, not a commitment. Revisit before any of these moves from idea to scoped work.

> **Read the [2026-06-06 addendum](#addendum--2026-06-06-strategy-pass) before acting on the tables below** — it supersedes several 05-24 reads (sales role-play downgraded to trap; OSCE landscape now occupied; two product-hunt survivors added with full briefs).

## What's actually reusable

The EduAgent codebase isn't "an education app" — abstracted, it's a general-purpose engine for:

> **AI-driven conversation → structured signals (LLM envelope) → server-trusted decisions → mastery / progress loops → two-role profile shape (owner + dependent) → billing + notifications + multi-locale + eval harness.**

Concretely, the reusable pieces:

- **Session lifecycle:** open → exchanges → close (apps/api/src/services/session/)
- **LLM response envelope:** `llmResponseEnvelopeSchema`, `parseEnvelope()` — LLM proposes signals, server decides outcomes
- **Server-owned decisions over LLM evidence:** Challenge Round mastery, hard caps (e.g. `MAX_INTERVIEW_EXCHANGES = 4`) — the LLM is never trusted unilaterally
- **Hierarchical content model:** subjects → books → topics → sessions (renameable to any "course → unit → lesson" shape)
- **Mastery + deepening loops:** `decideMasteryAndReview()`, `needs_deepening_topics`
- **Two-role profile shape:** guardian/learner + isOwner gating — maps to coach/client, manager/rep, parent/child, DM/player
- **Voice in/out:** big differentiator in most adjacent verticals
- **Eval harness:** `pnpm eval:llm` (Tier 1 snapshot + Tier 2 live) — catches prompt regressions in any vertical
- **Inngest durable async:** safe non-core dispatch pattern, scheduled jobs
- **Billing:** Free + Plus, daily + monthly caps (RevenueCat for mobile IAP)
- **i18n:** 7 locales live
- **Mobile + API monorepo:** Expo + Hono RPC, type-safe end to end

Content authoring — not engineering — is the dominant cost for almost every option below.

## Education-adjacent options

| Option | Engine fit | Content cost | Commercial read |
|---|---|---|---|
| **General-knowledge syllabus** | High | Massive (build from scratch) | Weak — no urgency, low willingness to pay |
| **Language learning** | Very high (already half-scaffolded in `packages/schemas/src/language.ts`, four_strands pedagogy, CEFR) | High | Proven category but Duolingo is unkillable |
| **Test prep (SAT / ACT / GRE / IELTS / driving / citizenship)** | Very high | Medium (published syllabi) | Strong — deadline-driven, $50-300 willingness to pay |
| **Professional cert prep (PMP, AWS, CFA, bar, medical boards, NCLEX, real-estate)** | Very high | Medium (published syllabi) | **Strongest** — UWorld is a $100M+ business off this pattern; $300-2000 willingness to pay; failing exam costs job |
| **University course companion (student uploads syllabus, AI tutors)** | High | Low (user-provided) | Moderate — differentiation is ingestion quality |

## Non-education options

| Option | Engine fit | Notes | Commercial read |
|---|---|---|---|
| **Coaching / habits (B2C — fitness, sobriety, productivity)** | High | Guardian/learner → coach/self; voice-first matches Calm/Noom shape | Proven ($150-700M businesses) but crowded, brutal CAC |
| **Sales-call role-play (B2B SaaS)** | Very high | Manager/rep *is* your guardian/learner shape; rubric-scored exchanges = Challenge Rounds | ~~**Strong**~~ **Superseded 2026-06-06 → trap (see addendum §2)** — Second Nature raised $15M, Hyperbound, Quantified all building this; Gong-tier incumbents bolting it on |
| **AI companion / character chat** | High | Persistent state + structured signals + safety caps all fit | Proven ($M ARR — Replika, Character.AI) but crowded, ethically loaded, well-funded incumbents |
| **Interactive fiction / D&D companion** | High | Sessions → scenes; envelope signals → narrative state; hard caps → pacing; voice DM = wow moment | Smaller market than it feels (NovelAI ~$1-3M ARR); passionate but bounded; AI Dungeon plateaued |
| **Guided intake (immigration, taxes, wills, divorce, KYC)** | Very high — "LLM proposes, server decides" is *exactly* the pattern these need | TurboTax is $4B; nobody else has solved server-trusted LLM intake well | **High ceiling** but 6-12 month compliance/trust moat before first dollar |
| **Personal finance coach** | High | Pairs with Plaid; behavior-change mastery loops | Growing category, fits engine, moderate CAC |
| **Therapy / journaling / mental-health companion** | High — crisis-flag envelope signals + server hard caps map directly | Direct Woebot/Wysa territory | Huge demand but regulatory landmine for solo founder |

## The honest commercial read

People pay reliably when there is **urgency + a measurable outcome.** Education *without* a deadline barely converts. Creative tools sell to passion buyers in smaller numbers than they feel like they should.

Ranking by "easiest path to real revenue with what's already built":

1. **Professional cert prep** — clearest yes. Pick one exam (AWS SAA, PMP, or a nursing board), own it, ship narrow.
2. ~~**Sales role-play B2B** — highest revenue per customer, longest sales cycle, engine is almost ideal.~~ *(Superseded 2026-06-06 — downgraded to trap, see addendum §2.)*
3. **AI companion / character app** — proven revenue, but you'd be fighting Character.AI and Replika.
4. **Guided intake (vertical-specific)** — highest ceiling, longest runway to first dollar.
5. **Interactive fiction** — fun and engine fits, but smaller market; treat as passion project, not revenue play.

Categories to quietly skip despite being interesting: **general-knowledge learning, open-ended creative tools, general B2C coaching** (Noom-shaped — CAC is brutal without a marketing wedge).

## Current lean (2026-05-24)

If the goal is **"build a real revenue line in 3-6 months with what I already have"**, the answer is **professional certification prep, narrow** — one exam, end-to-end. The engine is closer to ready for this than for anything else on the list, the buyer is motivated by a hard deadline, and the content lift is bounded by a published syllabus.

If the goal is **"build something I love"**, interactive fiction is the most genuinely novel use of the engine and a real differentiator (voiced, server-controlled AI storytelling) but expect a smaller revenue line.

The two are not mutually exclusive — the cert-prep play could fund the fiction play.

## Decision triggers

Revisit this doc when:

- A specific exam, vertical, or domain shows up as a real pull (someone asks, a niche community is underserved, a content partner appears).
- EduAgent itself stabilizes enough that engineering capacity opens up for a second product.
- An interactive-fiction prototype is technically feasible without distracting from EduAgent's core roadmap (likely after navigation-contract V1 ships).

Until then: this is a menu, not a roadmap.

## Addendum — 2026-06-06 strategy pass

Web-researched follow-up (folded into this doc 2026-07-18). Where a delta below conflicts with a 05-24 table read, the delta wins.

### 1. Crime/deduction game ratified as the passion candidate

Core design: authored ground-truth fact model + per-character lie model (suspects lie to protect personal secondary secrets), free LLM interrogation on top, contradiction-hunting as the core verb, batch-validated theory board (Obra Dinn rule), fair-play unique solvability. Landscape: authored deduction games crowded (Golden Idol etc.); LLM-interrogation games ~5–15 small titles (Verbal Verdict, A Detective Story) — **none combine authored solvability + free interrogation; that slot is open.** Verdict: build as a ONE-CASE web prototype post-launch (week-scale), never as a Steam business. Money variant of the same engine = corporate team-building mystery events (B2B pricing, $500–5k/event; Hunt a Killer proved consumer kits at ~$50M/yr peak).

### 2. Sales role-play — downgraded from "Strong" to trap

Supersedes the non-education table row above. Hyperbound, Second Nature, Quantified all $15M+ funded; Gong-tier incumbents bolting it on. Head-on entry is a trap.

### 3. Medical OSCE role-play — occupied, with openings

Geeky Medics already ships AI patients (800+ stations, voice) for the English/UK market; OSCE AI Pro and GoodLabs also live. Demand validated ($4.8B exam-prep market 2025; UWorld $200–400/sub, 90%+ US penetration). Remaining openings: (a) non-English markets (DE/PL/ES/JA/NO clinical exams — matches our i18n muscle), (b) nursing NCLEX-NGN / pharmacy / vet adjacencies, (c) voice-first realism with a real withholding/lie model, (d) B2B to schools as a standardized-patient cost killer. Ceiling ≈ £1–5M ARR per geography+profession; upside = stacking niches.

### 4. Parent-teen conversation role-play — not a company

Fails the deadline/budget test; D2C parenting apps run 28–35% 12-month retention; Good Inside (Dr. Becky) is the celebrity incumbent; no objective rubric → trust accrues to credentialed brands. Survivable versions: a MentoMate guardian-side feature (zero CAC, episodic use is fine for a feature), B2B2C family benefits (Maven/Cleo/EAP), or a therapist-assigned PMT/PCIT homework tool.

### 5. Retention benchmarks → MentoMate design jobs (RevenueCat, 115k apps)

12-month retention ~44% on annual / ~17% on monthly plans across categories; education has the highest refund rate (~4.9%); winning playbook = free trial → hard paywall → annual at ~5× monthly. Four concrete jobs (pre-launch backlog candidates for MentoMate, not future-app material): (a) teen weekly-active is THE metric — the payer follows the user, (b) crisis→habit conversion in the first 2–3 weeks of onboarding, (c) summer-churn design (pause/holiday mode), (d) annual-plan-forward pricing.

### 6. Mechanic worth stealing: Tamagotchi/Finch attachment loop

A daily-care companion that grows because the learner showed up is a proven churn antidote (Finch = elite retention in the worst category; Duolingo's owl = the same loop). Candidate for teen-side retention; the bar is "companion, not babysitter" — teens smell condescension.

### 7. Meta-lessons from "would you build X"

Angry Birds = timing artifact (find empty shelves on new surfaces). SimCity-class deep sims = the one game genre where craft beats marketing (13-person Cities: Skylines dethroned EA) but multi-year. Never clone the product — extract the working ingredient.

### 8. 80-finder "obvious unbuilt product" hunt

146 ideas → 19 candidates → 2 survivors after adversarial existence+blocker verification (~10M tokens, workflow `wf_8ed62667-dc1`).

- **WINNER: Deadlock (18/30)** — consumer-rights agent that runs the ENTIRE multi-round EU/UK dispute to the free ombudsman/ADR ladder (statutory clocks, auto-escalation). Lane verified open: ComplaintPilot = one-shot letters, Resolver = passive+conflicted, Pine AI = US-only, EU ODR platform shut July 2025. Architecture = exact match for our LLM-proposes/server-decides + Inngest timers. Drags: episodic use, ADR-graph forever-maintenance, the gasp needs a primer.
- **RUNNER-UP: Owed (15/30)** — statutory late-payment interest + €40/invoice collector for freelancers; killed by judges on the relational-fear demand thesis + incumbent absorption. B2B-only (the 1998 Act / Directive 2011/7/EU exclude consumer clients — intake must branch). Statutory computation already commoditized (Paidnice, Landolio) — the remaining wedge is client-language localization + zero-integration.
- **META-FINDING:** every high-gasp simple idea was already shipped within ~18 months of becoming LLM-buildable (KlarBrief, Vibrato, Murmur, Superparent…). The open slot in 2026 is never the one-shot drafter — always the **FINISHER**: a multi-round case state-machine with statutory deadlines.
- **Product briefs (v2, 6-agent panel-reviewed):** [`product-briefs/2026-06-06-deadlock-product-brief.md`](../product-briefs/2026-06-06-deadlock-product-brief.md) · [`product-briefs/2026-06-06-owed-product-brief.md`](../product-briefs/2026-06-06-owed-product-brief.md). Load-bearing panel catches baked into v2: telecoms ADR window = 6 weeks (42 days) effective 8 Apr 2026, energy stays 8 weeks — per-sector pack values, never engine constants; the "~33% abandoned" stat was a misread (claims-firm withdrawals in financial services; the consumer baseline is unmeasured — a pilot discovers it).

### Updated lean (2026-06-06)

Revenue lean unchanged: **professional cert prep, narrow** — sharpened by §3: the open flank is non-English markets. Passion lean is now specifically the **crime/deduction one-case prototype** (a concrete form of the interactive-fiction lean above). **Sales role-play is off the menu.** Deadlock is the highest-ceiling architectural match if appetite for a longer runway appears.
