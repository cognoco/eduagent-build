# Implementation Plans — apps/api quick audit

> ⚠️ **This is a partial index.** A whole-repo `deep` follow-up run added plans
> 013–024 in `advisor-plans-deep/`, covering `apps/api` gaps plus `apps/mobile`
> and `packages/` (never previously audited). **The master index, execution
> order, and status tracker for all 24 plans (001–024) now live in
> [`advisor-plans-deep/README.md`](../advisor-plans-deep/README.md).** Update
> status there, not here.

Two `improve` runs against commit `8c049b93f` (origin/main), both scoped to
`apps/api` only at `quick` effort. Plan 001 is from an earlier non-interactive
run; plans 002–012 are from the 2026-07-13 interactive run (three parallel
read-only agents: correctness / security / test coverage), findings vetted
against source before planning, and all 11 selected by the operator.

The rest of this file — dependency notes, audit coverage notes, rejected
findings, provenance — is specific to this `apps/api`-scoped run and is not
duplicated in the master index; it still applies.

## Dependency notes

- **002 first.** The CI change-class router runs service-only diffs through the
  unit suite only, so integration/route tests added by 006 and 008 (and the
  break test in 003) would not be enforced by CI until 002 widens the routing.
  002 is a soft dependency for 003 (the fix is valid without it; the *break
  test* just needs it to run automatically) and a real one for 006/008.
- **010 after 003.** Both fix the same root cause (org-membership standing in
  for caller identity) — 003 on the write/owner surface, 010 on the read
  surface. Do 003 first so 010 reuses the established org-admin/guardian
  primitives; 010's Step 1 is a spike that must produce `010-findings.md`
  before any handler is touched.
- 004, 005, 007, 009, 011, 012 are independent and can run in any order /
  in parallel.
- Two plans require a mandatory red-green-revert break test (security/money):
  **003** (consent revoke) and **009** (KV-failure → no double-decrement).

## Audit coverage notes (what was and wasn't looked at)

- **Scope**: `apps/api/` only, `quick` depth. Skipped `apps/mobile`,
  `packages/`, `docs/_archive`, and `apps/api/src/services/test-seed.ts` +
  `apps/api/eval-llm/` snapshots.
- **Read substantively (2026-07-13 run)**: middleware auth/authz/CORS/metering/
  idempotency; the trust-boundary route files (billing, consent, webhooks,
  family-join, notes); `services/family-access.ts` owner/caller guards;
  `services/billing/**` money paths incl. dispatcher + top-up; `services/llm/`
  envelope + router streaming path; `inngest/functions/session-completed.ts`
  idempotency + the replay-harness infra; `services/rate-limit.ts`;
  `services/language-detect.ts`; the CI change-class router.
- **NOT covered (candidates for a `deep` follow-up)**: full bodies of
  `services/session/session-exchange.ts` (~4400 lines, highest churn),
  `services/exchanges.ts`, `services/curriculum.ts`, `learner-profile.ts`,
  `progress.ts`; `services/identity-v2/deletion-v2.ts` cascade atomicity and
  guardianship internals beyond family-join/consent; the LLM router fallback
  matrix + circuit-breaker; the other ~68 Inngest functions' retry idempotency;
  `pnpm audit` dependency posture; performance / perf / DX / docs / direction
  categories (excluded by `quick`).
- **Overall verdict**: `apps/api` is exceptionally hardened — atomic quota
  decrement with refund-on-throw, constant-time webhook signature + replay
  dedup, fail-closed CORS allowlist, JWT audience/iat hardening, envelope
  signal hard-caps, `onConflictDoNothing` on XP/streak. The residual findings
  are concentrated at the caller-identity authorization seam (003/010, a
  self-documented stalled sweep), a classic JS month-overflow on the money
  path (005), and testing/CI-routing gaps around money + minors surfaces
  (002/006/007/008). No committed secret values were found.

## Findings considered and rejected (do not re-audit)

- **Direct `db.select()` bypassing the scoped repository**: sanctioned
  deviation when `profileId` is pinned in WHERE, or for `orderBy`/`limit`/
  time-bound queries the scoped repo can't express (AGENTS.md "Non-Negotiable
  Engineering Rules"). Not a finding.
- **Legacy internal `jest.mock` density (609 sites / 177 files)**: known,
  tracked backlog gated by the GC1 ratchet / GC6 boy-scout rule. Reported as
  informational sizing only (burn down by risk tier: billing + identity-v2
  guards + the Inngest client first; leave sentry/logger mocks), not a plan.
- **Account-level Inngest events omitting `profileId`**: by design (fire before
  a profile exists). Not a finding.
- **`crisisRedirect` fail-open**: observational-only with an independent
  server-side tripwire (`safety-tripwire.ts`). Not a bug.
- **XP/streak insert idempotency, webhook signature/replay, JWKS caching, CORS,
  test-seed prod gating, the public consent token surface**: each examined and
  confirmed correctly guarded. Not findings.
- **`teachingPreferenceSchema.analogyDomain` `.nullable().optional()`**: ruled
  carve-out (WI-1160). Not a finding.

## Provenance

- Correctness / security / test-coverage findings each came from a dedicated
  read-only sub-audit; every finding was re-opened in source and confirmed by
  the advisor before a plan was written (excerpts in the plans are the
  advisor's own reads, not the sub-agents').
