---
Created: 2025-10-17T14:19
Modified: 2025-10-28T10:03
---
# AGENT 1 INPUT
## ⚠️ MAJOR WEAKNESSES

  1. Scope Creep in Stage 6

  Issue: Stage 6 bundles E2E testing (core validation) with external
  services (Sentry, CodeRabbit optimization, Dependabot). These are
  orthogonal concerns with different risk profiles.

  Rationale: If Sentry integration hits issues, should that block walking
  skeleton validation? External services are about operational maturity,
  not infrastructure compatibility validation.

  Recommendation: Split into:
  - Stage 6A: Complete E2E Testing (blocking)
  - Stage 6B: External Services Integration (optional/non-blocking)

  2. Missing Architectural Clarity

  Prisma + Supabase Relationship

  Issue: The plan uses BOTH Prisma (ORM) and Supabase (database + client).
   The relationship is ambiguous.

  Questions:
  - Is Supabase just database hosting with Prisma as the only access
  layer?
  - Or: Prisma for server-side, Supabase client for client-side
  auth/realtime?
  - Why have a separate supabase-client package if Prisma handles DB
  access?

  Recommendation: Add an "Architecture Decisions" section clarifying:
  - Prisma: Server-side database access layer
  - Supabase client: Client-side authentication and realtime features
  - Database package: Exports Prisma client
  - Supabase-client package: Exports auth client factory

  oRPC Type Sharing

  Issue: Plan doesn't explain how types flow from server to client.

  Questions:
  - Where does the oRPC router definition live?
  - Does api-client package depend on server package?
  - How are server types exported to client?

  Recommendation: Document the type flow architecture explicitly.

  3. No Environment Variable Strategy

  Issue: Stage 4 mentions .env.local but doesn't address:
  - How do different apps/packages access environment variables?
  - Shared vs. app-specific env config?
  - Multiple environments (dev/staging/prod)?
  - Mobile environment variables (React Native has different
  requirements)?

  Rationale: Environment variable configuration often becomes a major
  blocker. Mobile especially needs careful handling (dotenv doesn't work
  in Expo by default).

  Recommendation: Add Stage 4.0: "Environment Variable Management
  Strategy" with decisions on tools (dotenv-cli, Nx environment plugin,
  etc.).

  4. 80% Coverage Too Aggressive for Walking Skeleton

  Issue: 80% test coverage threshold appears in both Stage 3 and Stage 6.

  Rationale: The purpose is to validate infrastructure, not achieve
  production-grade coverage on throwaway code. This might force
  meaningless tests just to hit the number.

  Recommendation:
  - 100% coverage of the critical walking skeleton flow (health check
  end-to-end)
  - Example tests showing HOW to test each layer (unit, integration, E2E)
  - 60% overall threshold (lower bar, but still meaningful)

  5. Mobile Complexity Underestimated

  Issue: Plan treats mobile as "just another client" equivalent to web.

  Rationale: Mobile has unique challenges:
  - Expo Go vs development builds vs production builds
  - Network connectivity (localhost doesn't work - need ngrok/Expo tunnel)
  - Mobile-specific E2E testing (requires Detox/Appium setup)
  - Offline scenarios and error handling
  - Environment variable management

  Recommendation:
  - Add explicit sub-stage 5.6.1: "Configure mobile-to-server connectivity
   strategy"
  - Clarify if Expo Go is sufficient or if development builds needed
  - Specify mobile E2E testing approach (or defer to Phase 2)

  6. No Authentication Flow Validation

  Issue: Using Supabase (which has built-in auth) but health check doesn't
   validate authentication.

  Rationale: If auth infrastructure isn't tested in walking skeleton, auth
   integration issues will surface during POC development - defeating the
  purpose.

  Recommendation: Enhance health check to include:
  - pingHealth(message) - requires authentication
  - Validate Supabase auth works across web/mobile/server

# AGENT 2 Input

## Weaknesses / Risks

- Mobile app timing: Generating @nx/expo in Stage 1 may slow validation due to Android/iOS env complexity. It’s valuable, but often better once server/web are green.
- E2E timing: Playwright E2E in Stage 0 before the /health exists can create churn. Smoke E2E is fine, but functional E2E is more stable post-skeleton.
- Supabase + Prisma coupling pitfalls:
- Need explicit stance on RLS policies, roles, and connection strategy (service role vs anon) for Prisma.
- Migration strategy (Prisma Migrate vs SQL files vs db push) must be fixed early to avoid drift with Supabase.
- Local vs cloud: local Supabase CLI or cloud project? The plan implies cloud; local speeds iteration and reduces secrets handling early.
- oRPC decision risk: If oRPC is new to the team, adopting it before skeleton validation could create avoidable friction. Consider conventional HTTP first with a planned pivot.
- Coverage target early: 80% threshold in Stage 3 may block basic scaffolding; better once skeleton exists to set meaningful baselines.
- Concurrency and caching checks: Nx cache validations are listed, but no step to seed/build twice to empirically measure cache hits or to verify remote cache wiring early.
- CI gating breadth: Typecheck, build, test, lint, and coverage all in early CI can lengthen feedback cycle. Parallelization and a fast pre-merge pipeline definition would help.
- Dependency/version baseline: You list a snapshot task, but no automation to capture and diff versions (scriptable).
- Environment variability: The plan assumes a single dev environment; Expo and Playwright add host env variance. Documenting minimal required installations would reduce friction.

## Suggested improvements (rationales inline)
- Defer mobile to post-skeleton: Validate server/web/db path first, then add Expo. Rationale: reduces surface area, accelerates first integrated success.
- Use HTTP or tRPC as step 1; add oRPC later: Rationale: minimize initial RPC learning curve; swap after skeleton once types and boundaries are known.
- Pick a single migration strategy now: Prefer Prisma Migrate (sql migrations committed), avoid db push for non-prod; document Supabase RLS/roles explicitly. Rationale: prevent schema drift and production mismatch.
- Start with local Supabase via CLI; switch to cloud after skeleton: Rationale: fast iteration, stable secrets handling; later test cloud networking and policies.
- Adjust QA gates staging: Set coverage threshold initially at 0 with reporting on; raise to 60% after Stage 5, 80% at Stage 6. Rationale: avoid blocking scaffolding while still measuring.
- Reorder E2E: Do a single smoke test in Stage 0 (home page loads); add functional /health E2E after Stage 5. Rationale: keeps E2E aligned with functionality.
- Automate version snapshot: Add a script to emit docs/package-versions-baseline.md from pnpm list --depth 0 and workspace package.json versions. Rationale: reproducible baselines and easy diffs.
- Nx Cloud checks earlier: Run a two-pass build (clean → build → build again) to verify cache hits and remote cache wiring once at Stage 0. Rationale: find cache wiring issues before adding projects.
- CI split: Define a fast PR pipeline (lint, typecheck, unit tests) and a nightly/full (build all, e2e, coverage gate). Rationale: keeps dev feedback loop snappy.
- Document environment requirements: Add a short prerequisites section (Node, pnpm version, Playwright browsers install step, Expo CLI). Rationale: reduce onboarding variance.