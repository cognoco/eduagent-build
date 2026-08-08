---
title: Production Worker Verifier Exception — Implementation Plan
date: 2026-08-08
profile: code
work_items: [WI-3124]
status: in-progress
---

# Production Worker Verifier Exception — Implementation Plan

**Goal:** Add a production-only, exact-name and exact-fingerprint temporary verifier exception for `production_worker`, wire it into every production verification path, and document its mandatory pre-MVP removal.
**Approach:** Mirror the existing staging exception without sharing environment-specific configuration. Parse each exception independently, accept the managed-admin fingerprint only when the matching environment and role name are present, and keep all other capability violations fail-closed. Pin the production variable into both protected workflows and retain the existing trusted-trigger and least-privilege workflow posture.

## Scope

In scope:

- `packages/database/scripts/verify-worker-db-role-lib.mjs`
- `packages/database/scripts/verify-worker-db-role.mjs`
- `packages/database/scripts/verify-worker-db-role.test.mjs`
- `.github/workflows/deploy.yml`
- `.github/workflows/production-secret-sync.yml`
- `docs/deployment-and-secrets.md`
- `docs/runbooks/production-worker-secret-sync.md`
- `docs/pre-launch-checklist.md`

Out of scope:

- Neon role or credential mutation
- `DATABASE_URL_PRODUCTION_APP` rotation
- production deployment or secret sync before merge
- removal of either temporary exception, which belongs to WI-3062

## Tasks

- [x] T1: Add production exception behavior tests before implementation — done when the focused verifier suite fails because the production parser and exact-fingerprint acceptance do not exist, while tests explicitly cover wrong name, wrong environment, fingerprint drift, and unchanged staging behavior.
- [x] T2: Implement the minimal production-only parser and capability allowance — done when the focused verifier suite passes and all unapproved capability deviations retain the existing violation messages.
- [x] T3: Wire the production variable into both deploy verifier calls and the scheduled production sync verifier — done when workflow contract tests prove complete production coverage and prove the staging variable remains staging-only.
- [x] T4: Update the three required operational documents — done when each names the OPQ-163 production ruling, `PRODUCTION_WORKER_ADMIN_EXCEPTION_ROLE`, WI-3062 removal gate for both environments, and the two-key merge requirement without exposing secret values.
- [x] T5: Run the routed local validation and adversarial review — done when formatting, the complete database-script test surface, relevant workflow/document guards, and pre-PR adversarial review are green with no undispositioned findings.
- [ ] T6: Land through the protected PR path — done when the two-key production approval and all automated-review threads are dispositioned, the PR is merged, the repository variable is set at merge time, and a post-merge production-secret-sync run passes the production Worker role-verification step.
