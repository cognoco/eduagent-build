# Template Repo Extraction — Proposal

**Date:** 2026-03-27
**Status:** Discussion / Awaiting partner review

---

## The Idea

The MentoMate (project name EduAgent) codebase contains months of battle-tested infrastructure that has nothing to do with tutoring. We want to extract this into a **reusable SaaS mobile app template** so future apps start with a fully wired stack instead of building from scratch.

## Why a Template, Not Starting From Scratch

| What the repo already has | Effort to rebuild from zero |
|--------------------------|---------------------------|
| Nx + pnpm monorepo with cross-package TypeScript (composite builds, path aliases, module resolution) | Days of trial-and-error |
| Hono API on Cloudflare Workers with layered middleware (CORS → Auth → DB → Scope → Metering) | Weeks |
| Clerk auth (JWKS verification via Web Crypto — CF Workers-safe, no Node.js) | Days |
| Drizzle + Neon PostgreSQL with scoped repository pattern (multi-tenant isolation at query layer) | Week+ |
| Stripe integration (checkout, portal, webhooks, signature verification) — dormant for mobile, ready for web | Weeks |
| RevenueCat (Apple/Google IAP via SDK, webhook handler, purchase → subscription sync) | Weeks |
| Inngest background jobs with CF Workers env-binding middleware | Days |
| Expo 54 + NativeWind mobile app with auth screens, push notifications, Sentry | Week+ |
| NativeWind Windows patch (auto-applied via pnpm patchedDependencies) | Hard-won fix |
| Jest testing infrastructure (co-located tests, integration test harness with real PostgreSQL) | Days |
| 6 GitHub Actions CI/CD workflows (lint, test, typecheck, deploy API via Wrangler, build mobile via EAS) | Days |
| Pre-commit hooks (Husky + lint-staged + commitlint + surgical test runner) | Hours |
| Sentry error tracking (API + mobile, with age-gated enablement for children's apps) | Hours |
| Email (Resend) + push notifications (Expo Push API) | Hours |
| Claude Code skills (/ship, /fix-ci, /dispatch, /e2e) — generic workflow automation | Already built |

**Estimated total rebuild cost: 4–6 weeks.** Extraction cost: days.

## What Gets Stripped (Domain-Specific)

- All 8 database schema files (subjects, sessions, assessments, retention, curriculum, etc.)
- All 16+ route modules and their service implementations
- All 10 Inngest functions (consent-reminder, session-completed, trial-expiry, etc.)
- All 38+ mobile screens (learning, homework, assessments, parent dashboard, etc.)
- Factory builders (profile, subject, assessment test data)
- Retention package (`@eduagent/retention` — SM-2 spaced repetition algorithm)
- Email templates (consent reminders, trial expiry notices)
- Persona/theming logic (learner age adaptation, parent/child concepts)

## What Gets Kept (Infrastructure)

### Fully generic (copy as-is)
- Monorepo config (Nx, pnpm, TypeScript, ESLint, Prettier)
- Pre-commit hooks (Husky, lint-staged, commitlint, surgical test script)
- CI/CD workflows (with minor env var renaming)
- NativeWind Windows patch
- Expo config + Metro config
- Sentry wrappers (API + mobile)
- Claude Code skills and workflow automation

### Semi-generic (keep infrastructure, make domain parts configurable)
- **Auth middleware** — Clerk JWKS verification stays as-is. Account find-or-create stays. Multi-profile becomes opt-in.
- **Payment system** — Stripe + RevenueCat infrastructure stays. Tier definitions, product IDs, and quotas move to a single `billing.config.ts` config file.
- **Metering middleware** — Quota enforcement stays. Which routes are metered and what the limits are come from config.
- **Background jobs** — Inngest client + env-binding middleware stays. Domain functions replaced with one example.
- **Database** — Drizzle + Neon connection factory stays. Scoped repository pattern stays. Schema replaced with one example table.
- **Consent/GDPR** — Middleware stays but becomes opt-in (disabled by default, available for children's apps).

## Key Design Decision: Config-Driven Billing

Currently, tier definitions are hardcoded in `subscription.ts` and product→tier mappings are hardcoded in webhook handlers. The template introduces a single `billing.config.ts`:

```
billing.config.ts          ← Each new app defines their tiers, quotas, prices, product IDs here
├── subscription.ts        reads tier config
├── metering.ts            reads quota limits
├── stripe-webhook.ts      reads price ID mappings
├── revenuecat-webhook.ts  reads product→tier mapping
└── mobile paywall UI      reads tier labels/limits via API (not hardcoded)
```

**One file to customize per app. Infrastructure untouched.**

Configurable aspects:
- Tier names and count (not locked to free/plus/family/pro)
- Monthly/daily quotas per tier
- Prices (monthly + yearly per tier)
- Stripe price IDs (via env vars)
- RevenueCat product ID → tier mapping
- Top-up credit denominations
- Trial: enabled/disabled, default tier, duration in days
- Multi-profile: enabled/disabled, max profiles per tier
- Consent: enabled/disabled

## Key Design Decision: How to Create the Repo

**Decision: Copy the folder, not a GitHub fork.**

Options considered:
1. **GitHub fork** — Fast, but creates permanent parent-child link. Risk of accidental pushes to the parent repo. Can be "unforked" via GitHub Support request but it's manual.
2. **Clone + delete `.git` + reinit** — Same result in 30 seconds, zero fork baggage, clean git history. ✅ Chosen.

The template repo starts with all MentoMate files, then domain content is stripped from a working codebase. This is faster than building up from empty because `tsc` guides the stripping — remove something, the compiler tells you exactly what else references it.

After extraction, the GitHub repo can be marked as a **Template Repository** so future apps are created via "Use this template" (no fork link, no shared history).

## Key Design Decision: No BMAD Spec Phase

This is not a new feature — it's extracting proven infrastructure. The architecture and design already exist and are validated by 1,800+ tests. A formal PRD/architecture/UX spec cycle would be overhead with no value.

## Extraction Plan — Three Phases

### Phase 1: Parallel Planning (Research)
Four agents work simultaneously (read-only, no code changes):
- **Agent A:** Database schemas — classify each table as keep/strip/genericize
- **Agent B:** API routes + services — classify each file
- **Agent C:** Mobile screens + components — classify each file
- **Agent D:** Inngest functions, CI workflows, config files — classify each

Output: File-by-file extraction inventory (the execution roadmap).

### Phase 2: Sequential Execution (Code Changes)
One agent at a time, commit after each step (dependency chain):
1. Strip schemas → replace with example table
2. Strip database package internals → keep connection factory + scoped repo pattern
3. Strip services → keep example CRUD service
4. Strip routes → keep health + example route
5. Strip Inngest functions → keep example function
6. Strip mobile screens → keep auth screens + example home
7. Extract `billing.config.ts` from hardcoded values
8. Make trial/multi-profile/consent configurable (opt-in flags)
9. Verify: `tsc --noEmit` passes, tests pass, CI green

### Phase 3: Parallel Finalization
Multiple agents work simultaneously (non-overlapping files):
- **Agent A:** Rewrite CLAUDE.md for generic template use
- **Agent B:** Adapt CI workflows, remove MentoMate-specific steps
- **Agent C:** Clean up memories (keep Windows/tooling, strip MentoMate), update skills
- **Agent D:** Write template README + "Getting Started" guide

## What the Template Ships With

| System | Default state | How to customize |
|--------|--------------|-----------------|
| Auth (Clerk) | Sign-in/up, JWT verification, account creation | Public paths list in middleware |
| Accounts | Find-or-create, single profile | Trial config (on/off, tier, days) |
| Profiles | Single profile per account | Multi-profile flag (on/off, max per tier) |
| Billing tiers | Free + one paid tier (example) | `billing.config.ts` |
| Stripe | Checkout, portal, webhooks | Price IDs via env vars |
| RevenueCat | SDK init, purchase flow, webhooks | Product→tier mapping in config |
| Metering | Quota enforcement, KV cache | Metered routes list, limits from config |
| Consent/GDPR | Disabled | Enable for children's apps |
| Database | Drizzle + Neon, one example table | Add your own schema files |
| API | Hono + middleware stack, health + example route | Add your own routes + services |
| Background jobs | Inngest client, one example function | Add your own functions |
| Mobile | Expo + NativeWind, auth + home screen | Add your own screens |
| Error tracking | Sentry (API + mobile) | DSN via env vars |
| Email | Resend integration | API key via env vars |
| Push | Expo Push API | Token registration hook included |
| CI/CD | Lint, test, typecheck, deploy, build | Env vars for staging/production |
| Pre-commit | Husky + lint-staged + commitlint | Works out of the box |

## Bug Found During Research

The mobile paywall screen (`subscription.tsx`) has hardcoded tier limits that are **out of sync** with the backend `TIER_CONFIGS`:

| Tier | Backend (correct) | Mobile UI (wrong) |
|------|-------------------|-------------------|
| Free | 100/month | 50/month |
| Family | 1,500/month | 1,000/month |
| Pro | 3,000/month | 2,000/month |

This exists in the current MentoMate app regardless of the template work. The config-driven approach (`billing.config.ts`) would prevent this class of bug — the UI would read from config via an API endpoint instead of hardcoding values.

## Open Questions

1. **Repo name and location** — `cognoco/saas-mobile-template`? Different name?
2. **Timing** — Before or after MentoMate launch?
3. **The paywall bug** — Fix in MentoMate now, or leave for the template extraction?
