---
created: '2025-12-13'
updated: '2026-02-14'
source: 'PRD review markers + Legacy documentation + Architecture phase decisions'
status: 'in-progress-architecture-phase'
---

# Architecture Inputs - EduAgent

**Purpose:** Technical decisions and preferences captured during PRD refinement. To be validated and expanded during Architecture phase.

---

## Technology Stack (Decided in Architecture Phase)

Stack decisions made during Architecture phase, replacing earlier preferences from Legacy docs.

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **Mobile Framework** | Expo | Cross-platform iOS/Android/Web from single codebase; App Store presence required (PRD targets >4.0 rating) |
| **Database** | Neon (PostgreSQL) + pgvector | Serverless with scale-to-zero (cost savings at MVP); pgvector for RAG/memory retrieval; PostgreSQL branching for dev/staging |
| **Authentication** | Clerk | Excellent Expo/React Native SDK; social login (Google, Apple); multi-tenant support; cheaper at scale than Supabase ($25/mo at 10K+ MAU vs $599/mo) |
| **Payment Processing** | Stripe | Checkout, subscriptions, family billing, top-up credits |
| **AI/LLM** | Multi-provider (Claude, GPT-4, Gemini Flash) | Intelligent model routing by task complexity; cost optimization target €0.005/question avg |
| **Vector Search** | pgvector (in Neon) | Per-user memory retrieval (hundreds of embeddings, not millions); JOINs with relational data in single query; no separate vector DB needed |

**Previous preferences superseded:**
- ~~Supabase Auth~~ → Clerk (better cost scaling, standalone auth, no platform lock-in)
- ~~Supabase (PostgreSQL)~~ → Neon (serverless scale-to-zero, better branching, lower cost at scale)

---

## Implementation Details (moved from PRD)

### Billing & Family Account Logic

**Context:** PRD defines family accounts as "base subscription + per-profile add-ons". Architecture needs to design the billing aggregation logic. (See Product Brief for pricing anchors.)

**Requirements to satisfy:**
- Base subscription at selected tier (Free/Standard/Plus/Pro)
- Additional profiles as add-ons
- Each profile inherits tier benefits
- Token limits configurable per account or individual profile
- Monthly and yearly billing options

**Architecture considerations:**
- Billing aggregation logic for family accounts
- Proration handling for mid-cycle profile additions
- Token pool vs per-profile token allocation
- Subscription state machine (trial → active → cancelled → expired)

---

### Authentication & Session Management

**Context:** PRD requires "token-based authentication with secure session management". Clerk selected as auth provider (replaces earlier Supabase Auth preference).

**Requirements to satisfy:**
- Multi-method auth (email/password, Google OAuth, Apple Sign-in)
- Secure session management with automatic expiration
- Multi-profile support under single account
- GDPR parental consent workflow for ages 11-15 in EU

**Architecture considerations:**
- Clerk handles JWT issuance, token refresh, and social login out of the box
- Profile switching without re-authentication (Clerk organizations or custom profile layer)
- Consent state management (custom logic on top of Clerk user metadata)
- Expo integration via `@clerk/clerk-expo` SDK

---

### i18n Architecture

**Context:** PRD specifies "English UI only for MVP, German/Spanish/French/Polish post-MVP". Architecture needs to design i18n system.

**Requirements to satisfy:**
- MVP: English + German UI
- Learning languages: ANY (via LLM capability)
- Post-MVP: Multiple UI languages
- Backend: English only

**Architecture considerations:**
- i18n framework selection (react-i18next, etc.)
- String extraction and translation workflow
- RTL support considerations (future)
- Locale-specific formatting (dates, currency, numbers)
- Translation management system

---

### Infrastructure & Scalability

**Context:** PRD defines scalability targets (MVP: 1-1,000 users → Growth: 1,000-50,000 → Scale: 50,000+). Architecture designs the infrastructure.

**Requirements to satisfy:**
- API response time: <200ms (p95, excluding LLM)
- LLM first token: <2s
- App cold start: <3s
- System uptime: 99.5%
- Data durability: 99.99%
- Multi-provider AI fallback

**Architecture considerations:**
- Cloud provider selection (AWS/GCP/Azure)
- Auto-scaling strategy
- Database scaling approach
- CDN for static assets
- CI/CD pipeline design
- Disaster recovery plan
- Backup strategies
- Monitoring and observability stack

---

## Open Questions for Architecture Phase

1. ~~**Supabase vs custom backend?**~~ → **RESOLVED:** Neon (database) + Clerk (auth) + custom backend. Avoids Supabase platform lock-in; better cost scaling.
2. **Backend framework** - Hono on Cloudflare Workers, Express on Railway/Fly, or other? Needs to handle LLM orchestration, billing logic, and API layer.
3. ~~**Multi-provider LLM routing**~~ → **RESOLVED (Party Mode review):** Route by conversation state, not initial classification. Default to fastest model (Gemini Flash) for initial Socratic questions. Escalate to reasoning models (Claude/GPT-4) only at Parallel Example or Teaching Mode rungs. Routing follows Socratic Escalation Ladder triggers. Soft cost ceiling €0.05/session.
4. **Offline capability (v2.0)** - What data needs to be cached locally? Sync strategy?
5. **Code execution sandbox** - Browser-based (WebAssembly) or server-side for programming subjects?
6. **Real-time chat architecture** - WebSockets vs SSE vs polling for conversation streaming?

---

## Architecture Flags from UX Party Mode Review

_Surfaced during critical review walkthrough of UX Design Specification (2026-02-15). These require architecture-phase decisions._

| # | Flag | Detail |
|---|------|--------|
| 1 | Model routing by conversation state | Fastest model for Socratic questions, reasoning model for Parallel Example / Teaching Mode. No routing decision on initial photo. |
| 2 | Session cost ceiling | Soft ceiling €0.05/session. Most sessions (70%) = 2-3 fast-model calls (€0.005-0.01). Monitor, don't pre-optimize. |
| 3 | Parallel Example template cache | Pre-generated examples by problem type. Evaluate retrieval vs. fresh generation tradeoff. |
| 4 | Coaching card two-path loading | Cached (<1s, context-hash freshness: time_bucket + dayType + retentionSnapshot + lastSessionType) vs. Fresh (1-2s skeleton: first launch, gap >48h, context mismatch, new device). |
| 5 | Behavioral confidence score | Per-problem: time-to-answer, hints needed, escalation rung, difficulty. Feeds parent dashboard ("guided vs immediate") and coaching adaptation. |
| 6 | Dual-token retention signals | Light mode: fg strategy. Dark mode: bg strategy. 12 tokens (4 signals × fg/bg/on-bg). Supports 6 theme configurations. |
| 7 | Phrasing variation (MVP) | Last 2-3 coaching card messages in LLM context + "vary language" prompt. No dedicated phrasing store until v2.0. |

---

## Cross-References

- **Legacy Documentation:** `docs/Legacy/ARCHITECTURE_DECISIONS.md` (detailed technical decisions)
- **Legacy Data Model:** `docs/Legacy/DATA_MODEL.md` (schema design)
- **Product Brief:** `docs/analysis/product-brief-EduAgent-2025-12-11.md` (business context)
- **PRD:** `docs/prd.md` (requirements to satisfy)
