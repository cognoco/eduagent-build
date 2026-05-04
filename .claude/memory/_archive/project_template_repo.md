---
name: Template repo extraction plan
description: Plan to extract a reusable SaaS mobile app template from EduAgent, keeping auth/payments/account infrastructure while stripping domain logic
type: project
---

User wants to create a **template-repo** from the EduAgent codebase — keeping all reusable infrastructure while stripping MentoMate domain content.

**Why:** The monorepo has months of battle-tested infrastructure (Nx, Hono, Drizzle, Clerk, Stripe, RevenueCat, Inngest, Expo, NativeWind, Sentry, CI/CD) that would save weeks on any new project.

**How to apply:** When this work begins, follow the structured extraction approach below — not mass-delete.

## Agreed Approach

### Config-driven payment/billing system
- Extract `TIER_CONFIGS` + product mappings + price IDs into a single `billing.config.ts`
- All infrastructure reads from config, not hardcoded values
- Each new app edits one file to define their business model

### Configurable account management
- Trial auto-creation → opt-in via config (`trial: { enabled, tier, days }`)
- Multi-profile → off by default, opt-in for apps that need it
- Consent/GDPR middleware → opt-in, disabled by default

### Extraction layers (strip bottom-up)
1. Database schemas → replace with one example schema
2. Services → replace with one example service
3. Routes → replace with health + one example CRUD route
4. Inngest functions → keep framework, one example function
5. Mobile screens → auth screens + one example home screen
6. CLAUDE.md → rewrite for generic use, keep structure + rules
7. Skills (/ship, /fix-ci, /dispatch, /e2e) → keep as-is (generic)
8. Memories → keep Windows/tooling, strip EduAgent-specific

### Bug found during research — FIXED
Mobile paywall `TIER_LIMITS` was out of sync with backend `TIER_CONFIGS`. Fixed in commit `6e1b555` (2026-03-27): free=100, family=1500, pro=3000 now match. The config-driven approach in the template would prevent this class of bug.
