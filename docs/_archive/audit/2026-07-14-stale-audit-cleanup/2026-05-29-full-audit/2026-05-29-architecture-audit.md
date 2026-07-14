# Architecture Review — eduagent-build

**Date:** 2026-05-29
**Auditor:** Claude Code (`/architecture-review`, staff-engineer mode)
**Scope:** Whole-monorepo structural health review across five dimensions — module complexity, silent failures, type-safety gaps, test-coverage holes, and LLM-friendliness. Read-only.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion tracker:** none yet — see "Recommended sequencing" to spin up work items.

---

## TL;DR

The codebase is in good structural health overall: the route/service boundary (G1/G5) is clean across every large file, zod-validated LLM envelopes are the dominant pattern, and `safeSend`/`core-send` discipline is real and mostly enforced. The headline risk is **test coverage of the billing/quota tier** — ~3,300 lines of money-counting, idempotency, and quota-reconciliation logic across 6 critical files have zero co-located regression tests, including `billing/metering.ts` (1,139 lines), the per-exchange quota counter for every paid user. Secondary risks are concentrated and surgical: four trust-boundary `as` casts that bypass zod, a small set of silent-recovery catches in billing/session code, and two session-subsystem monoliths that have outgrown their files.

## Severity

**YELLOW** — No active production breakage found. The billing test-coverage gap is RED-adjacent in *latent* risk (a regression in untested money math is high-impact and would ship undetected by the suite), but nothing here is a confirmed live defect. Everything else is HIGH/MEDIUM latent risk that compounds as the codebase grows.

## Methodology

- **Largest-file census:** `git ls-files '*.ts' '*.tsx' | grep -vE '\.(test|spec)\.' | xargs wc -l | sort -rn` — identified production giants (excluding `test-seed.ts` and `scripts/*` as test/tooling infra).
- **Cast census:** `grep -hcE '\bas [A-Z]'` per area (apps/api/src: 303, apps/mobile/src: 542, packages: 21); `.match(` sites enumerated (17 in source).
- **Test-gap scan:** `for f in $(find . -name '*.ts' ! -name '*.test.ts'); do t="${f%.ts}.test.ts"; [ -f "$t" ] || echo "$f"; done` over `services/`, `inngest/functions/`, `middleware/`.
- **JSDoc heuristic:** exported-decl count vs `/**` block count in `services/**` (~543 exports, ~251 doc blocks ≈ 46%).
- **Four parallel deep-dive agents** (Explore, sonnet) one per qualitative dimension (silent failures / type safety / module complexity / test coverage), each instructed to return `file:line` evidence and verify before reporting.

---

## Findings

Ordered by compounding impact. Severity per finding uses the project scale (GREEN/YELLOW/YELLOW-RED/RED) reflecting *latent* risk.

### Finding 1 — Untested billing / quota / idempotency logic (RED, latent)

- **Severity:** RED (latent — high impact × zero detection)
- **Files:**
  - `apps/api/src/services/billing/metering.ts` (1,139 lines, 0 tests) — `decrementQuota`/`incrementQuota`, `GREATEST` underflow guards, `clampProfileQuotaLimits`, `consumeOwnerTopUpCredit` retry loop, `profile_mismatch` silent-recovery branch. Runs on every LLM exchange.
  - `apps/api/src/services/billing/subscription-core.ts` (877 lines, 0 tests) — BUG-116 race-safe `ensureFreeSubscription`, `race_fallthrough` branch (`:497`), Stripe `isValidTransition` tier gating.
  - `apps/api/src/services/billing/revenuecat.ts` (491 lines, 0 tests) — BD-01 timestamp-ordering idempotency.
  - `apps/api/src/services/billing/trial.ts` (399 lines, 0 tests) — `downgradeQuotaPool` idempotency guard + CR-2026-05-19-C7 same-transaction cycle/daily reset coordination.
  - `apps/api/src/services/billing/quota-reconcile.ts` (154 lines, 0 tests) — CASE-expression cycle resets; off-by-one on `cycleResetAt` silently wipes mid-cycle usage.
  - `apps/api/src/services/webhook-idempotency.ts` — `claimWebhookId` three-way return (`claimed`/`replay`/`unavailable`); swallowed-exception `unavailable` path gates whether the whole handler runs.
- **Evidence:** ~42 production service files lack a co-located `*.test.ts`; the 6 CRITICAL ones are all in `billing/`. 13 CRITICAL+HIGH untested files ≈ 3,294 lines of billing/quota/idempotency logic with 0 regression tests.
- **Why it matters:** A regression means users either can't chat (false quota exhaustion) or chat for free (quota bypass), or subscriptions silently downgrade/double-upgrade — none caught by the current suite. Violates the spirit of CLAUDE.md "Security/data-integrity fixes require a break test" (the guards exist; the tests don't).
- **Anticipated effort:** multi-PR (test-debt sprint).
- **Suggested track:** B — start with `metering.ts`.

### Finding 2 — Untrusted-data casts at trust boundaries (YELLOW-RED)

- **Severity:** YELLOW-RED (auth path is the worst case)
- **Files:**
  - `apps/api/src/middleware/jwt.ts:69,81` — `JSON.parse(base64UrlDecode(...)) as JWTPayload/JWTHeader`. Signature verification runs but does not validate claim *types*; a signed token with non-string `sub` flows into every downstream user lookup mistyped.
  - `apps/api/src/middleware/jwt.ts:124,151` — `(await res.json()) as JWKS` fed straight into `crypto.subtle.importKey` with no structural validation.
  - `apps/api/src/services/llm/providers/anthropic.ts:174`, `openai.ts:157,254,285`, `gemini.ts:236,293` — raw provider bodies cast to TS interfaces; a shape change or error envelope yields `undefined` content stored as empty transcript text rather than a surfaced error.
  - `apps/api/src/services/curriculum.ts:127` — `JSON.parse(jsonStr) as GeneratedTopic[]` writes curriculum DB rows with no zod check, while every sibling generator (`book-generation.ts`, `filing.ts`) validates. Clear outlier.
- **Evidence:** ~20 verified LLM call sites correctly use `schema.safeParse(JSON.parse(...))` (assessments, filing, recap, dictation, subject-classify, etc.). These four break the otherwise-strong pattern at exactly the least-trustworthy inputs.
- **Why it matters:** Defeats TypeScript's guarantees on attacker-controlled (JWT) and external (JWKS, LLM provider) bytes. Relates to CLAUDE.md "Classify/validate before use" and the LLM Response Envelope contract.
- **Anticipated effort:** hours (add zod schemas; switch `as` → `.parse`/`.safeParse`).
- **Suggested track:** B — `jwt.ts` first (security), then `curriculum.ts:127`.
- **Lower-priority same class:** `monthly-report.ts:307` (`as Partial<MonthlyReportData>` bypasses the existing `SchemaDriftError` pattern); `embeddings.ts:136` (Voyage `json.data[0]` crashes on error body); `apps/mobile/src/hooks/use-curriculum.ts:203` (`as unknown as` double-cast on API response — use Hono RPC inferred type).
- **Verified-benign (do not "fix"):** `tx as unknown as Database` Drizzle workaround (documented `packages/database/src/rls.ts:25`); `.match()?.[1] ?? fallback` sites in `extract-json.ts`/`project-response.ts`.

### Finding 3 — Silent failures in critical paths (YELLOW-RED)

- **Severity:** YELLOW-RED (billing correctness)
- **Files:**
  - `apps/api/src/routes/billing.ts:579-591` — bare `catch {}` on timezone resolution silently scopes per-profile daily usage to UTC on a bad IANA string; its sibling `billing/family.ts:172` logs the identical fallback, this one does not. (CRITICAL.)
  - `apps/api/src/services/session/session-crud.ts:326-339` — `parseTopicIntentMatcherResponse` `catch { return null }` with no log; a systematic LLM-JSON regression silently routes every session to `fallbackTopicId`. (HIGH.)
  - `apps/api/src/services/session/session-exchange.ts:1647-1654` — `catch → return []` on prior-summaries query logs `warn` but no `captureException`; caller can't distinguish "first session" from "DB error." (HIGH.)
  - `apps/api/src/services/billing/family.ts:233` (`listFamilyMembers`) and `:582` (`downgradeAllFamilyProfiles`) — return `[]` on missing subscription with no log; downgrade no-op could leave dangling entitlements. (HIGH/MEDIUM.)
  - `apps/api/src/services/billing/revenuecat-webhook-handler.ts:652-673` — `handleNonRenewingPurchase` returns `null` for both idempotent-skip and success; caller can't alert differently and a silent grant failure still returns HTTP 200. (HIGH.)
- **Evidence:** Most billing/auth/webhook catches escalate correctly (auth.ts, consent.ts, profile-scope.ts, stripe-webhook.ts, KV helpers all verified clean). These are the concentrated exceptions.
- **Why it matters:** Directly violates CLAUDE.md "Silent recovery without escalation is banned" in billing/auth/webhook code — if these fire in production, no log query or Sentry alert detects them.
- **Anticipated effort:** minutes each (add `captureException` + structured `logger.warn` matching the `family.ts:172` template; replace overloaded `null`/`[]` sentinels with a discriminated union for the two ambiguous returns).
- **Suggested track:** B — quick wins, do first.

### Finding 4 — Monolithic session & curriculum modules (YELLOW, compounds)

- **Severity:** YELLOW (compounds with growth; not a defect today)
- **Files & proposed splits** (route/service boundary clean in all — intra-service splits):

  | File | Lines | Distinct concerns | Highest-value split |
  |---|---|---|---|
  | `services/session/session-exchange.ts` | 3,321 | 8 (routing, contract types, context assembly ~1000 LOC, history fmt, persistence, orchestration) | `-routing.ts` (~75), `-types.ts` (~150), `-context.ts` (~1000), `-persist.ts` (~400); residual ~700 |
  | `services/session/session-crud.ts` | 2,228 | 10 — **500-line LLM topic-matcher embedded in CRUD** | `session-topic-matcher.ts` (clearest defect), `session-lifecycle.ts`, `session-library.ts` |
  | `services/curriculum.ts` | 2,643 | 8 (generation/CRUD/lifecycle/reporting) | `curriculum-generation.ts`, `curriculum-books.ts`, `curriculum-topic-mutations.ts` |
  | `services/learner-profile.ts` | 1,948 | 7 — 8 pure merge fns mixed with DB I/O | `learner-profile-merge.ts` (pure, low-risk), `-memory-block.ts` |

  `exchanges.ts` (1,906) and `progress.ts` (1,832) are **large-but-cohesive** — recommend only targeted extractions (`exchange-source-audit.ts`; `progress-resume.ts`), not full splits.
- **Evidence:** `session-exchange.ts` has fan-out of 28 import sources and one ~1,000-line function (`prepareExchangeContext`); `session-crud.ts` exports 41 symbols and embeds a complete LLM sub-service (`matchTopicByIntent` + helpers) inside a CRUD file.
- **Why it matters:** Pure logic can't be unit-tested without importing 2–3k-line modules; onboarding requires scrolling past whole subsystems. Splitting unlocks Finding 1's test work.
- **Anticipated effort:** multi-PR; type-only and pure-function extractions first, DB-touching last.
- **Suggested track:** B — `session-topic-matcher.ts` and `learner-profile-merge.ts` first (clean seams, low risk); `session-exchange.ts` 4-way split in a dedicated PR with its tests.

### Finding 5 — Untested guards, background jobs & mobile giants (YELLOW)

- **Severity:** YELLOW
- **Files:**
  - `apps/api/src/services/quiz/orchestrate-round.ts` — `[SECURITY]`-tagged IDOR ownership check, no regression test.
  - `apps/api/src/services/session/session-filing-dispatch.ts` — `isClosePathAutoFileEligible` guard; wrong eval = silent library data loss or duplicate filings.
  - `apps/api/src/inngest/functions/webhook-idempotency-purge.ts` — retention cutoff math (BUG-672); miscalc = unbounded table growth or over-pruning live replays.
  - `apps/api/src/services/session/session-analytics.ts` — BUG-731 `(metadata->>'escalationRung')::int` SQL cast; safe only on `ai_response` rows, no test for a future event type triggering a cast error.
  - Mobile giants (not deep-analyzed this pass): `shelf/[subjectId]/book/[bookId].tsx` (2,110), `homework/camera.tsx` (1,705), `sign-in.tsx` (1,545), `session-summary/[sessionId].tsx` (1,481).
- **Evidence:** test-gap scan + grep for guard/fallback-shaped functions.
- **Why it matters:** Security controls and data-integrity guards without regression tests can be silently removed/broken by future edits.
- **Anticipated effort:** hours (tests); mobile extraction is future-feature-work, not a refactor sprint.
- **Suggested track:** B — `orchestrate-round.ts` IDOR test first (security control, untested).

### Finding 6 — Documentation / LLM-friendliness (GREEN-YELLOW)

- **Severity:** GREEN-YELLOW (low urgency)
- **Evidence:** JSDoc on services ≈ 46% (251 blocks / 543 exported decls, heuristic). Giants are under-documented relative to complexity. Offsetting strengths: detailed `CLAUDE.md`, `docs/architecture.md`, `docs/audience-matrix.md`; named invariants (BUG-NNN, CR-dates) cited in comments; forward-only ratchet guards (GC1, persona-fossil, i18n-keep-rot); structured `event:`-tagged errors.
- **Why it matters:** AI-assisted edits are hardest exactly in the giants, where per-module responsibility headers are missing.
- **Anticipated effort:** minutes per file, opportunistically.
- **Suggested track:** C — add a file-header JSDoc (single-responsibility + pipeline position) when splitting the Finding-4 giants; no blanket sweep.

---

## What's working well (preserve)

- **Route/service separation (G1/G5)** clean across every large file audited — no Hono imports leaking into services.
- **Zod-validated LLM envelopes** are the dominant, correct pattern (~20 verified sites). The four cast-leaks in Finding 2 are deviations from a strong norm, not the norm.
- **`safeSend` / `core-send` discipline** is real and guard-tested.
- **Most billing/auth/webhook catches escalate correctly** (auth.ts, consent.ts, profile-scope.ts, stripe-webhook.ts, KV helpers verified) — Finding 3 is a small minority.
- **Forward-only ratchets** (GC1 internal-mock guard, i18n key-rot, persona-fossil, metering coverage manifest) are the right mechanism for a codebase this size.

---

## Recommended sequencing

1. **Now (surgical, low-risk):** Finding 3 silent-failure log/escalation adds; Finding 2 zod schemas for `jwt.ts` + `curriculum.ts:127`.
2. **Next (test-debt sprint):** Finding 1 billing regression tests, starting with `metering.ts` (real DB harness, no internal mocks per GC1; red-green per the "break test" rule).
3. **Dedicated PRs (with tests):** Finding 4 splits — `session-topic-matcher.ts` and `learner-profile-merge.ts` first, `session-exchange.ts` last.

## Recommended punch-list entries

```markdown
- **ARCH-1** Add regression tests for billing/quota/idempotency tier (metering.ts first)
  - Severity: RED (latent) — Effort: multi-PR
  - Files: services/billing/{metering,subscription-core,revenuecat,trial,quota-reconcile}.ts, services/webhook-idempotency.ts
  - Why it matters: ~3.3k lines of money math with 0 tests; regressions ship undetected
- **ARCH-2** Replace untrusted-data `as` casts with zod parse at trust boundaries
  - Severity: YELLOW-RED — Effort: hours
  - Files: middleware/jwt.ts:{69,81,124,151}, services/llm/providers/{anthropic,openai,gemini}.ts, services/curriculum.ts:127
  - Why it matters: bypasses TS guarantees on JWT/JWKS/LLM bytes
- **ARCH-3** Add escalation to silent-recovery catches in billing/session paths
  - Severity: YELLOW-RED — Effort: minutes each
  - Files: routes/billing.ts:585, services/session/session-crud.ts:336, session-exchange.ts:1647, billing/family.ts:{233,582}, billing/revenuecat-webhook-handler.ts:652
  - Why it matters: violates "silent recovery without escalation is banned"
- **ARCH-4** Split monolithic session/curriculum service modules
  - Severity: YELLOW — Effort: multi-PR
  - Files: services/session/{session-exchange,session-crud}.ts, services/{curriculum,learner-profile}.ts
  - Why it matters: untestable pure logic; onboarding cost
- **ARCH-5** Regression-test security guards & retention crons
  - Severity: YELLOW — Effort: hours
  - Files: services/quiz/orchestrate-round.ts, services/session/session-filing-dispatch.ts, inngest/functions/webhook-idempotency-purge.ts, services/session/session-analytics.ts
  - Why it matters: untested security controls can be silently broken
```

## Audit honesty disclosures

- **Sampling, not exhaustive.** Each qualitative dimension came from a single focused agent pass (Explore/sonnet) with `file:line` evidence; line numbers should be re-verified before editing, as several of these files change frequently.
- **Module-complexity dimension covered the 6 largest API service files** in depth; mobile giants were enumerated but not responsibility-analyzed (Finding 5 names them as future work).
- **JSDoc coverage is a heuristic** (`export` decl count vs `/**` block count) — not all blocks precede exports, so ~46% is approximate.
- **One agent pass (type safety) initially failed with an auth error and was re-run** — its findings are from the successful second pass.
- **Test-gap counts** are from a co-located-sibling scan; a file without `foo.test.ts` may still be exercised by integration tests in `tests/integration/` (those were not cross-referenced per-file).
- The finding the auditor is most confident in and would act on first is the **billing test-coverage gap (Finding 1)**.
