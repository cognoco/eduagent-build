---
title: Staging Clerk E2E Repair — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2948]
status: in-progress
---

# Staging Clerk E2E Repair — Implementation Plan

**Goal:** Restore the staging seed-and-sign-in chain and prevent Clerk instance drift from reaching E2E or deployment.
**Approach:** Add a value-safe invariant checker first, use it to validate the existing GitHub recovery secret, recover only the staging secret through an auditable one-time workflow, then synchronize staging through the existing deploy workflow. Remove recovery-only wiring before landing; retain the invariant and tests.

## Scope

In scope:
- `scripts/check-clerk-key-alignment.mjs`
- `scripts/check-clerk-key-alignment.test.ts`
- `.github/workflows/e2e-web.yml`
- `.github/workflows/deploy.yml`
- `docs/deployment-and-secrets.md`
- `.claude/memory/project_clerk_key_environments.md`

Out of scope:
- Production secret mutation
- Database schema or data-model changes
- Branch-protection or merge-gate weakening
- Logging, committing, or uploading plaintext credentials

## Tasks

- [x] T1: Add a Clerk key-instance invariant checker — done when `scripts/check-clerk-key-alignment.test.ts` first fails because the checker is absent, then passes for aligned keys and rejects secret/publishable/JWKS mismatches without including key material in output.
- [x] T2: Gate E2E and staging deploy on the invariant — done when workflow contract tests prove both workflows invoke the checker before using or synchronizing Clerk credentials.
- [ ] T3: Validate and recover the intended staging backend secret — blocked after GitHub run 30616478494 rejected the backup before mutation; the correct key was absent from Ramtop, Lancre, Git history, GitHub, and the estate secret store. Done when a newly issued Clerk key for the intended staging instance is stored directly in Doppler `stg` without exposing plaintext.
- [ ] T4: Synchronize and verify staging — done when the sanctioned staging deploy succeeds, the Worker creates users visible to the repaired Doppler key, and the Node 22 Ramtop onboarding setup passes.
- [ ] T5: Prove repository delivery is restored — done when an unchanged-main E2E dispatch and PR #2740 pass, the recovery-only workflow code has been removed, and permanent checks remain green.
