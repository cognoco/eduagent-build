# Pre-Launch Checklist

Consolidated checklist of everything that must be done before MentoMate goes live.
Items are grouped by category and ordered by priority within each group.

Last updated: 2026-04-15

---

## Infrastructure & Deploy

- [ ] **Configure GitHub Environment protection rules**
  - Go to repo Settings → Environments → `production`
  - Add required reviewers so production deploys don't auto-run
  - Ref: `deploy.yml` `api-confirm-production` job uses `environment: production`

- [ ] **Verify production worker deploys successfully**
  - Run `wrangler deploy --env production` at least once (or trigger via `workflow_dispatch`)
  - Confirm `mentomate-api-prd.zwizzly.workers.dev` responds
  - Verify Cloudflare account/org is correct for production

- [ ] **Sync all production secrets to Cloudflare Worker**
  - Verify Doppler `prd` config has every required key (see list below)
  - Run `pnpm secrets:sync prd` or ensure `DOPPLER_TOKEN` is set in GitHub Actions
  - After sync, verify: `curl https://mentomate-api-prd.zwizzly.workers.dev/v1/health`

- [ ] **Production secrets checklist** (all must be in Doppler `prd`):
  - [ ] `CLERK_SECRET_KEY` — from Clerk Dashboard (production app)
  - [ ] `CLERK_JWKS_URL` — from Clerk Dashboard (production app)
  - [ ] `CLERK_AUDIENCE` — configure in Clerk Dashboard → Sessions → JWT audience, then add to Doppler
  - [ ] `GEMINI_API_KEY` — Google AI Studio
  - [ ] `VOYAGE_API_KEY` — Voyage AI (embeddings)
  - [ ] `RESEND_API_KEY` — Resend (transactional email)
  - [ ] `API_ORIGIN` — `https://mentomate-api-prd.zwizzly.workers.dev` (or custom domain)
  - [ ] `REVENUECAT_WEBHOOK_SECRET` — from RevenueCat (after store connections)
  - [ ] `DATABASE_URL` — Neon production branch connection string
  - [ ] `ANTHROPIC_API_KEY` — optional, for premium tier

- [ ] **Verify GitHub Actions secrets**:
  - [ ] `CLOUDFLARE_API_TOKEN`
  - [ ] `DATABASE_URL_STAGING`
  - [ ] `DATABASE_URL_PRODUCTION`
  - [ ] `EXPO_TOKEN`
  - [ ] `DOPPLER_TOKEN` (needed for automatic secret sync in deploy workflow)

- [ ] **Run production database migration**
  - `deploy.yml` does NOT auto-migrate — this is a manual step
  - Point `DATABASE_URL` at production Neon and run `pnpm --filter @eduagent/database db:migrate`
  - Verify migration succeeded BEFORE deploying the Workers bundle

- [ ] **Verify KV namespace bindings** in `wrangler.toml [env.production]`:
  - `SUBSCRIPTION_KV`: `cde9f81f19a34022b6dc6951928a0511`
  - `COACHING_KV`: `76b36f4748fe4d77b27387a5bebf4be6`

---

## Store Publishing

- [ ] **Apple Developer Program enrollment approved**
  - Applied ~2026-03-13, pending
  - Required for: App Store submission, iOS IAP testing via StoreKit 2

- [ ] **Google Play Developer account restored**
  - Account `zwizzly.app@gmail.com` disabled 2026-03-26, appeal submitted
  - Fallback: register new account (14-day closed testing gate, 12+ testers)

- [ ] **RevenueCat store connections**
  - [ ] Connect Google Play (service account JSON from Play Console)
  - [ ] Connect App Store (after Apple enrollment)
  - [ ] Create products in both stores matching `PRODUCT_TIER_MAP` exactly:
    - `com.eduagent.plus.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.family.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.pro.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.topup.500` (+ `.android` variant)
  - [ ] Create offerings with 6 subscription packages + 1 consumable
  - [ ] Configure webhook URL → `https://<production-api>/v1/revenuecat/webhook`
  - [ ] Add to Doppler `prd`: `REVENUECAT_WEBHOOK_SECRET`, `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`, `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`

- [ ] **EAS production build**
  - Build with `eas build --platform all --profile production`
  - Verify `EXPO_PUBLIC_API_URL` points to production worker
  - Verify `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the live key

---

## Security Hardening

Ref: `docs/plans/order.md` Tier 3 — explicitly marked "before launch"

- [ ] **S-06: Row-Level Security** (~3-5 days)
  - App has application-level scoping (`createScopedRepository`) — RLS is defense-in-depth
  - Apply RLS policies to all profile-scoped tables in Neon

- [ ] **BD-10: Billing scoped repo migration** (~1 day)
  - 31 direct `db.query.*` calls in billing.ts need scoped repo conversion
  - Do alongside S-06

- [ ] **2A.10: Row lock on `addProfileToSubscription`** (~2 hours)
  - Race condition under concurrent seat additions — low probability, high severity

---

## Code Quality & Test Debt

- [ ] **EP15-C2: Epic 15 test coverage** — 2 of 8 original gaps filled (milestone-detection, progress.tsx). Additional tests added (reports, use-progress, vocabulary, milestones, schemas, dashboard). Remaining: snapshot-aggregation.ts (1,087-line core engine — highest risk), monthly-report.ts, daily-snapshot.ts, weekly-progress-push.ts, monthly-report-cron.ts, progress/[subjectId].tsx
- [x] **EP15-C3: Step ordering decision** — RESOLVED 2026-04-19. Pipelines are independent (computeProgressMetrics never reads learning_profiles). Latency-first order confirmed correct; plan AD6 amended. See `session-completed.ts:515-518`.
- [x] **EP15-C4: Session-complete debounce** (AR-13) — RESOLVED 2026-04-19. `RefreshProgressSnapshotOptions.sessionEndedAt` implemented in `snapshot-aggregation.ts:965-1000`. `getLatestSnapshot` returns `updatedAt`. `session-completed.ts:531` passes timestamp.
- [ ] **Progressive disclosure** — plan written 2026-04-14, zero code changes (~1 day)
- [ ] **Freeform-filing retry** — one missing Inngest function; failed freeform filing silently drops session
- [ ] **Epic 16 test gaps** — ~90% of planned tests missing (cap eviction, stale demotion, struggle resolution)

---

## Verification Before Go-Live

- [ ] **Health check all environments**
  - `curl https://mentomate-api-dev.zwizzly.workers.dev/v1/health`
  - `curl https://mentomate-api-stg.zwizzly.workers.dev/v1/health`
  - `curl https://mentomate-api-prd.zwizzly.workers.dev/v1/health`
  - All should return `{"status":"ok"}` with non-empty `llm.providers`

- [ ] **End-to-end smoke test on production**
  - Sign up → create profile → pick subject → start session → LLM responds → session ends
  - Verify billing: free tier quota decrements correctly
  - Verify parent flow: link child, view dashboard

- [ ] **Sentry monitoring active**
  - Verify `SENTRY_DSN` is set in Doppler `prd`
  - Confirm error events flow to Sentry after a test error

- [ ] **GDPR compliance**
  - Privacy policy accessible at published URL
  - Consent flow blocks data collection until accepted
  - Account deletion flow tested end-to-end

---

## Nice-to-Have (Post-Launch OK)

- [x] EP15-I1: Weekly push fan-out — RESOLVED. Fan-out pattern implemented in `weekly-progress-push.ts` (see `[EP15-I1 AR-9]` comment, lines 53-69). Timezone-aware delivery via `isLocalHour9`.
- [x] EP15-I2: `vocabularyLearned` rename — RESOLVED 2026-04-19. Schema fully uses `vocabularyTotal`. Mobile label changed to "Total words". Monthly report delta computed correctly.
- [x] EP15-I5: Parent-access denial returns null instead of 403 — RESOLVED 2026-04-19. `assertParentAccess` throws `ForbiddenError` → global handler returns HTTP 403. All 10 dashboard child-scoped endpoints protected.
- [ ] Missing mobile screens (3E.1-3E.4): teach-back, evaluate-challenge, word summaries, decay viz
- [ ] Epic 17: Voice Input (~2-3 weeks, stores blocked anyway)
- [ ] Custom domain for production API (instead of `.workers.dev`)
