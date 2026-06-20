# WI-586 drop-4 — Clean-DB proof, billing-reader bucket, prod-reader inventory

**Session:** fresh executor replacing crashed exec-586. Date 2026-06-16.
**Branch:** WI-586 (worktree `.worktrees/WI-586`). Not pushed.

---

## 1. Clean-DB proof (orchestrator ic-orch-054 GO invariant)

Replicated the CI **`integration-flag-on`** lane locally (the gold-standard
authoritative gate): ephemeral local Postgres 17 + pgvector 0.8.2, `drizzle-kit
migrate` full committed chain **0 → 0118**, no manual psql, no faked tracking.

- **Result: full chain applied cleanly.** 117 migrations, exit 0.
- End-state verified: `accounts`/`profiles`/`consent_states`/`family_links`
  DROPPED; `subscriptions` + all v2 tables (person/organization/membership/
  consent_grant/consent_request/guardianship) RETAINED.
- **This empirically validates the committed 0117 (M-REPOINT) / 0118 (M-DROP)
  drop-4 migrations against a zero-state DB** — the only trustworthy proof for a
  table-DROP. (The shared dev Neon was hand-mutated by exec-586 and is NOT a
  trustworthy proof surface.)

Ephemeral DB recipe (port 5433, data dir under gitignored `.tmp/`):
`initdb` → `pg_ctl start -o "-p 5433"` → `CREATE DATABASE tests_v2` +
`CREATE EXTENSION vector` → `DATABASE_URL=…:5433/tests_v2 pnpm exec drizzle-kit
migrate` (run from `packages/database`) → flag-on `api:test:integration`.

---

## 2. Billing-reader a/b/c bucket (subscriptions table — kept by WI-586, dropped by WI-805)

Static source analysis of every non-test reader of the legacy `subscriptions`
table in `apps/api/src`. Buckets:
- **(a) DEFER-TO-805, webhook-subsystem-internal** — 22 sites / 11 files
  (subscription-core, revenuecat, trial, tier, family, quota-reconcile,
  quota-provision, metering, child-cap, export, safe-refresh-kv, access). Each
  reads legacy `subscriptions` only on the flag-off branch OR inside the legacy
  webhook bundle that the flag-on route dispatcher never reaches. WI-805 owns.
- **(b) DEFER-TO-805, M-REPOINT-neutralized** — 0 sites. The 4 quota satellites
  (quota_pools/profile_quota_usage/top_up_credits/usage_events) had their
  `subscription_id` FK repointed to v2 `subscription` by 0117; metering hot path
  does not join legacy `subscriptions`.
- **(c) FLIP-CRITICAL** — **1 site**:
  - **C-1 `inngest/functions/quota-reset.ts:46-51`** — daily quota-cycle-reset
    cron calls legacy `resetExpiredQuotaCycles` (raw SQL `FROM subscriptions`,
    `services/billing/trial.ts:152`) with NO `isIdentityV2EnabledInStep()`
    branch. v2 twin `resetExpiredQuotaCyclesV2` (`billing-v2/trial-v2.ts:317`)
    EXISTS but is UNWIRED. Flag-on this cron reads legacy `subscriptions` daily;
    post-WI-805-drop it 500s. Fix: ~5-line flag branch mirroring
    `trial-expiry.ts:175`. (Strictly a WI-805 fast-follow, surfaced now.)

---

## 3. Production-reader inventory — the 4 DROPPED tables (the real flip de-risk)

Static audit of every non-test reader/writer of `profiles`/`accounts`/
`family_links`/`consent_states` in `apps/api/src`. ~93 sites. Buckets:
- **(G) FLAG-GATED-SAFE** — **~79 sites** [was: 84]. Legacy read sits in a
  flag-off else-branch / ternary; flag-on never reaches it. (Includes
  notifications, dashboard, consent, profile-scope middleware, billing, most
  Inngest functions.)
  - **CORRECTION (WI-586, ic-orch-068 thorough re-audit):** 5 of the original 84
    were MISCLASSIFIED — they were ungated legacy reads on live-prod paths that
    would 500 the moment flip #8 sets `IDENTITY_V2_ENABLED=true`, not flag-gated.
    All 5 are now genuinely flag-gated (fixed IN 586, each with a flag-on→v2 /
    flag-off→legacy non-vacuous test): MISS 1 `loadProfileRowById`
    (`session-cache.ts:142`, hottest exchange path → authored `loadProfileRowByIdV2`);
    MISS 2 `getProfileAgeBracket` (`routes/sessions.ts` evaluate-depth → authored
    `getPersonAgeBracket`); MISS 3 `getProfileAge` (`routes/books.ts` ×2 +
    `curriculum.ts`); MISS 4 `getProfileAge` (`session-crud.ts` materialize);
    MISS 5 `getProfileAge` (`subject.ts`). The remaining ~79 are genuine.
- **(T) UNGUARDED, v2-twin-exists** — 1 site (T1 `POST /profiles/switch` →
  `profile.ts:817`; twin `getPersonScope`).
- **(C) FLIP-CRITICAL, unguarded** — **7 distinct paths that 500 in production
  the moment flip #8 sets IDENTITY_V2_ENABLED=true:**
  - **C1 `GET /profiles/:id`** (`routes/profiles.ts:239`→`profile.ts:604`) —
    reads profiles+consentStates+familyLinks. Twin `getPersonScope` exists,
    unwired.
  - **C2 `PATCH /profiles/:id`** (`routes/profiles.ts:309`→`profile.ts:630`) —
    UPDATE profiles + consent/family meta. **No v2 update twin** — must author.
  - **C4 `PATCH /account/email`** (`routes/account.ts:131`→`account.ts:410`) —
    UPDATE accounts. **No v2 twin anywhere** — must author. Most severe.
  - **C5 `PATCH /onboarding[/:profileId]/interests/context`**
    (`onboarding/index.ts:165,221`) — ownership guard reads profiles
    unconditionally; interests write itself stays on learning_profiles. Fix:
    membership-based v2 ownership guard.
  - **C6 `sessionSummaryRegenerate` Inngest** (`summary-regenerate.ts:280`) —
    reads profiles.conversationLanguage unconditionally; sibling
    `summaryRegenerate` IS gated, this one was missed.
  - (C3 reclassified to T1 above.)

**Discover-by-test-failure misses every (C) site in an unconverted suite** —
this static inventory is the only complete view. `getLatestConsentStatus`
(now fixed this session) was exactly such a hidden reader, found only because a
converted dashboard test happened to exercise it.

---

## 4. Fixes landed this session (committed, not pushed)

- `4263aad` notifications.ts v2 dual-mode (displayName/parentEmail/GDPR).
- `a6887c10` (concurrent committer — see §6) test-seed conversions +
  session-completed.ts 3-reader gate + helpers.ts (env propagation + FK-safe
  teardown) — INCLUDES this session's helpers.ts + filing.ts work.
- `83e70a6` dashboard.ts v2 consent-gate (`getLatestConsentStatus` →
  `getChildGdprConsentStatusV2`, threaded through `assertChildDashboardDataVisible`
  + 8 callers) + `getChildSessions` active-profile v2 read; dashboard test
  same-org family seeds (seedProfile orgId param + seedFamilyLink co-membership).

**Fixture-layer fix proven at scale:** the 7 route-fixture-based suites
(createProfileViaRoute path) go GREEN with the helpers.ts env-propagation +
FK-safe-cleanup fix alone (sampled 4 suites: 23/0).

---

## 5. Scope finding — the conversion is L–XL, mostly pre-existing flag-on debt

- **60 non-billing integration test files** still seed dropped `accounts`/
  `profiles` via local `.insert(accounts)` and need v2 conversion. (+8 billing
  files = 68 total; billing DEFERS to WI-805 per brief.)
- Most of these were **already RED on the flag-on lane before drop-4** (they
  seeded legacy tables that existed, but the flag-on service read empty v2
  tables → silent red). Drop-4 changed the failure *signature* ("relation does
  not exist"), not the redness. This is why the lane is `continue-on-error`.
- **Seed conversion ≠ green:** converting seeds surfaces the NEXT flag-on defect
  (session-completed residual Inngest reds; dashboard PENDING/REQUESTED consent
  semantics). Proven this session.
- This matches `wi586-scope-report.md`'s SPLIT recommendation: the reader/writer
  + fixture cutover is **WP-CUT-B (multiple PRs by domain)**, with WI-586 shrunk
  to just the drop. The "resume the sweep inside WI-586" framing in the executor
  brief contradicts the measured scope.

**Local clean-DB flag-on full-suite snapshot (this session):** 192 passed / 488
failed / 4 skipped (684 total, 93 suites). Dominant signature: 1119×
`relation "accounts" does not exist` (test seeds, 60 files). This is NOT
drop-4's denominator — it is the flag-on lane's pre-existing v2-migration debt
re-signatured.

---

## 6. HAZARD — concurrent committer on branch WI-586

HEAD advanced 6→7→8 mid-session; commit `a6887c103` was authored by another
session (same Lord Vetinari identity) committing the SAME exec-586 surviving
files I was building on. Shared-checkout hazard. **Deconflict before anyone
pushes.** Possible duplicate executor converting the same files.

---

## 7. Open decision for orchestrator

Does WI-586 **absorb** the full flag-on test-fixture (60 files) + production
(C) reader cutover (7 paths, 2 needing net-new v2 twins)? Or **split** per the
scope report (WI-586 = drop only; WP-CUT-B = the cutover, parallelizable by
domain)? Measured scope says split. The clean-DB proof + a/b/c bucket + prod
inventory are done regardless of the ruling.
