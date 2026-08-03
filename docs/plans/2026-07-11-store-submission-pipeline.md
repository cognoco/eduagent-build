---
title: Store submission pipeline - Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1341, WI-3084]
status: completed
---

# Store submission pipeline - Implementation Plan

**Goal:** Complete a credential-safe Android production build and Google Play internal submission path while preserving the Config-T and no-public-release guard.
**Approach:** Use the EAS-managed Google Play submission credential assigned to the app, verified through a metadata-only preflight; do not create local credential material. MentoMate is Android-only per OPQ-155. WI-1341 is Closed/Done; Android production build `fd1b0e50` (STORE `1.0.1`, versionCode `2`) and Play internal submission `b3aebb23` completed. This records internal-track evidence only, not a public release.

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
- Any non-Android store build or submission work
- Promoting the internal build to a public Play release
- Changing fallback, preview, development, or CI navigation flag combinations

## Tasks

- [x] T1: Pin the production submission contract - the focused test fails with a forced local path and pins Config T, Play internal submission, EAS-managed credential resolution, and no-secret validation.
- [x] T2: Implement managed-credential submit priming - `eas.json` omits a local path and the metadata-only preflight fails closed for absent or unassigned credentials without writing material.
- [x] T3: Document and adversarially verify the Android operator path - the runbook covers EAS assignment preflight, Android build selection, Play internal-track submission, rollback, Config-T checks, and the OPQ-155 Android-only scope.
- [x] T4: Execute the Android internal submission - WI-1341 is Closed/Done. Android production build `fd1b0e50` (STORE `1.0.1`, versionCode `2`) was submitted to Play internal testing as `b3aebb23`; this is not evidence of a public release.
