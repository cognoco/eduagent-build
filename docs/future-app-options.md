# Future App Options — Reusing the EduAgent Engine

Captured 2026-05-24 from a strategy conversation. This is **forward-looking product thinking**, not a commitment. Revisit before any of these moves from idea to scoped work.

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
| **Sales-call role-play (B2B SaaS)** | Very high | Manager/rep *is* your guardian/learner shape; rubric-scored exchanges = Challenge Rounds | **Strong** — Second Nature raised $15M, Hyperbound, Quantified all building this; $50-200/seat/mo; hardest part is enterprise sale, not product |
| **AI companion / character chat** | High | Persistent state + structured signals + safety caps all fit | Proven ($M ARR — Replika, Character.AI) but crowded, ethically loaded, well-funded incumbents |
| **Interactive fiction / D&D companion** | High | Sessions → scenes; envelope signals → narrative state; hard caps → pacing; voice DM = wow moment | Smaller market than it feels (NovelAI ~$1-3M ARR); passionate but bounded; AI Dungeon plateaued |
| **Guided intake (immigration, taxes, wills, divorce, KYC)** | Very high — "LLM proposes, server decides" is *exactly* the pattern these need | TurboTax is $4B; nobody else has solved server-trusted LLM intake well | **High ceiling** but 6-12 month compliance/trust moat before first dollar |
| **Personal finance coach** | High | Pairs with Plaid; behavior-change mastery loops | Growing category, fits engine, moderate CAC |
| **Therapy / journaling / mental-health companion** | High — crisis-flag envelope signals + server hard caps map directly | Direct Woebot/Wysa territory | Huge demand but regulatory landmine for solo founder |

## The honest commercial read

People pay reliably when there is **urgency + a measurable outcome.** Education *without* a deadline barely converts. Creative tools sell to passion buyers in smaller numbers than they feel like they should.

Ranking by "easiest path to real revenue with what's already built":

1. **Professional cert prep** — clearest yes. Pick one exam (AWS SAA, PMP, or a nursing board), own it, ship narrow.
2. **Sales role-play B2B** — highest revenue per customer, longest sales cycle, engine is almost ideal.
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
