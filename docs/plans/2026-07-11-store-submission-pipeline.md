---
title: Store submission pipeline - Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1341]
status: in-progress
---

# Store submission pipeline - Implementation Plan

**Goal:** Prime a credential-safe EAS production submission path for both stores and hold the Config-T production switch until the operator gate is ruled.
**Approach:** Commit only stable configuration, validation, and runbook contracts. Use the EAS-managed Google Play submission credential assigned to the app, verified through a metadata-only preflight; do not create local credential material. Prepare the Config-T flag triple in the branch, but do not merge or submit until OPQ-155 approves the product configuration. OPQ-37 completed Google Play and App Store Connect credential provisioning on 2026-07-27.

## Scope

In scope:

- `apps/mobile/eas.json`
- `.gitignore`
- `package.json`
- `scripts/verify-eas-managed-submit-credential.js`
- `scripts/verify-eas-managed-submit-credential.test.ts`
- `docs/runbooks/store-submission.md`
- `docs/pre-launch-checklist.md`

Out of scope:

- Store listing copy, screenshots, product/catalog creation, or RevenueCat setup
- Committing any Google or Apple credential or identifier
- Triggering a production build, TestFlight upload, or Play submission before OPQ-155 approval
- Changing fallback, preview, development, or CI navigation flag combinations

## Tasks

- [x] T1: Pin the production submission contract - the focused test fails with a forced local path and pins Config T, Play internal submission, EAS-managed credential resolution, and no-secret validation.
- [x] T2: Implement managed-credential submit priming - `eas.json` omits a local path and the metadata-only preflight fails closed for absent or unassigned credentials without writing material.
- [x] T3: Document and adversarially verify the operator path - the runbook covers EAS assignment preflight, build selection, Play internal-track submission, TestFlight submission, rollback, and the OPQ-155 gate.
- [ ] T4: Execute the gated production dry run - done when: after OPQ-155 approval, the managed assignment passes preflight, the production Config-T build is verified, Android submission succeeds on Play internal testing, iOS submission reaches TestFlight, and evidence is recorded without credential material.
