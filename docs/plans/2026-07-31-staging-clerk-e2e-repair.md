---
title: Staging Clerk E2E Repair — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2948]
status: in-progress
---

# Staging Clerk E2E Repair — Implementation Plan

**Goal:** Restore the staging seed-and-sign-in chain and prevent Clerk instance drift from reaching E2E or deployment.
**Approach:** Keep the value-safe invariant at every staging credential boundary, validate opaque Clerk backend keys through an authenticated Domains lookup, and synchronize only Doppler `stg` to the staging Worker after the invariant passes. Retain no recovery-only workflow wiring.

## Scope

In scope:
- `scripts/check-clerk-key-alignment.mjs`
- `scripts/check-clerk-key-alignment.test.ts`
- `.github/workflows/e2e-web.yml`
- `.github/workflows/deploy.yml`

Out of scope:
- Production secret mutation
- Database schema or data-model changes
- Branch-protection or merge-gate weakening
- Logging, committing, or uploading plaintext credentials

## Tasks

- [x] T1: Add a Clerk key-instance invariant checker — done when `scripts/check-clerk-key-alignment.test.ts` first fails because the checker is absent, then passes for aligned keys and rejects secret/publishable/JWKS mismatches without including key material in output.
- [x] T2: Gate E2E and staging deploy on the invariant — done when workflow contract tests prove both workflows invoke the checker before using or synchronizing Clerk credentials.
- [x] T3: Validate and recover the intended staging backend secret — a newly issued multi-key Secret Key was stored directly in Doppler `stg`, then authenticated against Clerk's live Domains API to prove it targets `whole-iguana-9.clerk.accounts.dev` without exposing plaintext.
- [x] T4: Synchronize and verify staging — Doppler `stg` synchronized and verified 33 filtered secrets on `mentomate-api-stg` through `pnpm secrets:sync stg`; unrestricted Ramtop Node 22 Playwright setup seeded and signed in all three storage-state scenarios, and PR #2748's E2E Web run 30623742315 passed.
- [x] T5: Prove repository delivery is restored — the recovery-only workflow code is removed and PR #2748's permanent checks are green. After merged WI-2961 PR #2772 fixed the response-body retrieval race, PR #2740 E2E Web run 30628084286 passed the strict V2 release gate (22/22) and required-stable legacy smoke (24/24), and PR #2740 merged.

## Operator-safe repair runbook

1. Create a Clerk multi-session/backend key for the existing staging instance. Use a purpose-and-environment label such as `doppler-stg`; do not append a date unless the date encodes an actual expiry or rotation lifecycle.
2. Store the new value directly as `CLERK_SECRET_KEY` in Doppler project `mentomate`, config `stg`. Do not copy the previous value through GitHub Actions, PR text, shell history, or a tracked file.
3. Run the fail-closed invariant before any Worker mutation:

   ```bash
   doppler run --project mentomate --config stg -- \
     node scripts/check-clerk-key-alignment.mjs
   ```

   A successful run prints only `Clerk key alignment OK`. Opaque keys authenticate to Clerk's Backend API and must return a domain whose Frontend API host matches both publishable keys and `CLERK_JWKS_URL`. Authentication, network, JSON-shape, tier, or host failures all stop the repair without printing the key.
4. Synchronize staging through `pnpm secrets:sync stg` only after step 3 passes. Never use the no-argument sync command for this repair because it includes production. Do not dispatch the full staging deploy solely for secret repair: that workflow also applies database migrations.
5. Run the Node 22 Playwright `setup` project against `https://api-stg.mentomate.com`, then rerun the E2E Web workflow. Keep Playwright traces, screenshots, and video disabled so seeded credentials cannot enter artifacts.

## Secret-free execution evidence

- Doppler invariant: passed; authenticated opaque-key lookup matched `whole-iguana-9.clerk.accounts.dev`.
- Worker synchronization: `mentomate/stg` → `mentomate-api-stg`; 33 filtered Worker secrets synchronized and key-name verification passed; no production or database target used.
- Ramtop Node runtime: v22.23.1.
- Ramtop Playwright setup: Node 22, Chromium, staging API, serial `setup`, no retries; all three seed-and-sign-in scenarios passed in 1.5 minutes.
- PR #2748 E2E Web run: [30623742315](https://github.com/cognoco/eduagent-build/actions/runs/30623742315) passed the V2 and required-stable legacy gates.
- PR #2740 E2E Web rerun: [30608972409](https://github.com/cognoco/eduagent-build/actions/runs/30608972409) seeded and signed in successfully, then failed 1 of 22 V2 cases twice at `returning-learner-resume.spec.ts:157` (`Network.getResponseBody: No data found`); the workflow classified it as a product failure and the required-stable legacy lane passed.
