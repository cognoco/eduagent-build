# Pre-Launch Checklist

Consolidated checklist of everything that must be done before MentoMate goes live.
Items are grouped by category and ordered by priority within each group.

Last updated: 2026-05-15

---

## Infrastructure & Deploy

- [ ] **Configure GitHub Environment protection rules**
  - Go to repo Settings → Environments → `production`
  - Add required reviewers so production deploys don't auto-run
  - Ref: `deploy.yml` `api-confirm-production` job uses `environment: production`

- [ ] **Verify production worker deploys successfully**
  - Trigger `.github/workflows/deploy.yml` with `api_environment: production`
  - Confirm `https://api.mentomate.com/v1/health` responds after approval
  - Verify Cloudflare account/org is correct for production

- [ ] **Sync all production secrets to Cloudflare Worker**
  - Verify Doppler `prd` config has every required key (see list below)
  - Run `pnpm secrets:sync prd` or ensure `DOPPLER_TOKEN` is set in GitHub Actions
  - After sync, verify: `curl https://api.mentomate.com/v1/health`

- [ ] **Production secrets checklist** (all must be in Doppler `prd`):
  - [ ] `CLERK_SECRET_KEY` — from Clerk Dashboard (production app)
  - [ ] `CLERK_JWKS_URL` — from Clerk Dashboard (production app)
  - [ ] `CLERK_AUDIENCE` — configure in Clerk Dashboard → Sessions → JWT audience, then add to Doppler
  - [ ] `GEMINI_API_KEY` — Google AI Studio
  - [ ] `VOYAGE_API_KEY` — Voyage AI (embeddings)
  - [ ] `RESEND_API_KEY` — Resend (transactional email)
  - [ ] `RESEND_WEBHOOK_SECRET` — Resend webhook signing secret
  - [ ] `API_ORIGIN` — `https://api.mentomate.com`
  - [ ] `REVENUECAT_WEBHOOK_SECRET` — from RevenueCat (after store connections)
  - [ ] `DATABASE_URL` — Neon production branch connection string
  - [ ] `ALLOW_MISSING_IDEMPOTENCY_KV` — only set to `true` if production must launch before `IDEMPOTENCY_KV` is bound
  - [ ] `ANTHROPIC_API_KEY` — optional, for premium tier

- [ ] **Verify GitHub Actions secrets**:
  - [ ] `CLOUDFLARE_API_TOKEN`
  - [ ] `DATABASE_URL_STAGING`
  - [ ] `DATABASE_URL_PRODUCTION`
  - [ ] `DATABASE_URL_STAGING_HOST`
  - [ ] `DATABASE_URL_PRODUCTION_HOST`
  - [ ] `EXPO_TOKEN`
  - [ ] `DOPPLER_TOKEN` (needed for automatic secret sync in deploy workflow)
  - [ ] `STAGING_API_URL` — optional override; defaults to `https://api-stg.mentomate.com`
  - [ ] `PRODUCTION_API_URL` — optional override; defaults to `https://api.mentomate.com`

- [ ] **Verify production database migration path**
  - `deploy.yml` runs committed migrations against the selected target after DB host verification and before `wrangler deploy`
  - Do not run `drizzle-kit push` against staging or production
  - If deploying outside `deploy.yml`, point `DATABASE_URL` at production Neon and run `pnpm --filter @eduagent/database db:migrate` before deploying the Workers bundle

- [ ] **Verify KV namespace bindings** in `wrangler.toml [env.production]`:
  - `SUBSCRIPTION_KV`: `cde9f81f19a34022b6dc6951928a0511`
  - `COACHING_KV`: `76b36f4748fe4d77b27387a5bebf4be6`
  - `IDEMPOTENCY_KV`: create and bind before launch, or explicitly set the temporary `ALLOW_MISSING_IDEMPOTENCY_KV=true` override in Doppler `prd`

---

## Store Publishing

- [x] **Apple Developer Program access available** — resolved 2026-05-15
  - Required for: App Store submission, iOS IAP testing via StoreKit 2

- [x] **Google Play Developer account access available** — resolved 2026-05-15
  - Continue with Play Console app setup and closed-testing requirements

- [ ] **RevenueCat store connections**
  - [ ] Connect Google Play (service account JSON from Play Console)
  - [ ] Connect App Store
  - [ ] Create products in both stores matching `PRODUCT_TIER_MAP` exactly:
    - `com.eduagent.plus.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.family.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.pro.monthly` / `.yearly` (+ `.android` variants)
    - `com.eduagent.topup.500` (+ `.android` variant)
  - [ ] Create offerings with 6 subscription packages + 1 consumable
  - [ ] Configure webhook URL → `https://api.mentomate.com/v1/revenuecat/webhook`
  - [ ] Add to Doppler `prd`: `REVENUECAT_WEBHOOK_SECRET`, `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`, `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`

- [ ] **EAS production build**
  - Build with `eas build --platform all --profile production`
  - Verify `EXPO_PUBLIC_API_URL` points to `https://api.mentomate.com`
  - Verify `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the live key
  - Verify `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` and `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` are present after running `pnpm env:sync`
  - Source-map upload is currently disabled by `SENTRY_DISABLE_AUTO_UPLOAD=true`; keep it intentional or configure Sentry auth before enabling upload

- [ ] **EAS submit production profile**
  - `apps/mobile/eas.json` intentionally contains no fake Apple/App Store Connect IDs
  - After App Store Connect and Play Console app records exist, add the real submit metadata or provide it during `eas submit`

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

- [x] **EP15-C2: Epic 15 test coverage** — RESOLVED 2026-04-19. All 8 original gaps filled. 220 new tests added: snapshot-aggregation.test.ts (35), monthly-report.test.ts (50), daily-snapshot.test.ts (17), weekly-progress-push.test.ts (40), monthly-report-cron.test.ts (37), progress/[subjectId].test.tsx (41). All passing.
- [x] **EP15-C3: Step ordering decision** — RESOLVED 2026-04-19. Pipelines are independent (computeProgressMetrics never reads learning_profiles). Latency-first order confirmed correct; plan AD6 amended. See `session-completed.ts:515-518`.
- [x] **EP15-C4: Session-complete debounce** (AR-13) — RESOLVED 2026-04-19. `RefreshProgressSnapshotOptions.sessionEndedAt` implemented in `snapshot-aggregation.ts:965-1000`. `getLatestSnapshot` returns `updatedAt`. `session-completed.ts:531` passes timestamp.
- [ ] **Progressive disclosure** — plan written 2026-04-14, zero code changes (~1 day)
- [ ] **Freeform-filing retry** — one missing Inngest function; failed freeform filing silently drops session
- [ ] **Epic 16 test gaps** — ~90% of planned tests missing (cap eviction, stale demotion, struggle resolution)

---

## UX Fixes — Pre-Launch (2026-04-20)

Ref: `docs/superpowers/plans/2026-04-19-pre-launch-ux-fixes.md`

### Already Fixed (verified in codebase)

- [x] **F-Q-08** Quiz quit confirm dialog — `platformAlert` in `quiz/play.tsx:159-168`
- [x] **F-042** Interview deadlock — `MAX_INTERVIEW_EXCHANGES=4` hard cap in `interview.ts:399`
- [x] **F-009** Topic deep-link — `useResolveTopicSubject` in `topic/[topicId].tsx:161-165`
- [x] **F-Q-02** Wrong answer reveal — green highlight in `quiz/play.tsx:392-393`
- [x] **F-Q-12** Challenge banner auto-advance — timer removed in `quiz/launch.tsx:117-119`
- [x] **F-Q-13** Quiz timer label — timer hidden in `quiz/play.tsx:456-459`

### Fixed in this pass

- [x] **F-PV-06** Parent dashboard 500 — `getChildDetail` rewritten to single-child query path (~16 subrequests vs 7+10N)
- [x] **F-Q-01** Raw JSON error body — `UpstreamError` typed class + `isTechnicalMessage` guard + SSE code extraction fix
- [x] **F-PV-03/04** False progress signals at N=1 — `calculateRetentionTrend` undefined guard + XP pill guard
- [x] **F-041** Non-language subject routing — empty `languageCode` params omitted from onboarding flow
- [x] **F-PV-05/01/02** Copy bugs — '1 sessions' plural fix + trendText guarded behind `showFullSignals`
- [x] **F-044** Loading screen timeout — 15s timeout with Retry + Go Back fallback

---

## Verification Before Go-Live

- [ ] **Health check all environments**
  - `curl https://mentomate-api-dev.zwizzly.workers.dev/v1/health`
  - `curl https://api-stg.mentomate.com/v1/health`
  - `curl https://api.mentomate.com/v1/health`
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
- [ ] Epic 17: Voice Input (~2-3 weeks)
- [x] Custom domain for production API — `https://api.mentomate.com`
