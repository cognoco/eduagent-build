---
title: Store submission pipeline - Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1341]
status: in-progress
---

# Store submission pipeline - Implementation Plan

**Goal:** Prime a credential-safe EAS production submission path for both stores and hold the Config-T production switch until the operator gate is ruled.
**Approach:** Commit only stable configuration, validation, and runbook contracts. Materialize the Google Play service-account JSON from a Doppler-injected environment variable into an ignored local file, never into source control or logs. Prepare the Config-T flag triple in the branch, but do not merge or submit until OPQ-37 supplies credentials and authorizes the shared production flag change.

## Scope

In scope:

- `apps/mobile/eas.json`
- `.gitignore`
- `package.json`
- `scripts/prepare-eas-submit-credentials.js`
- `scripts/prepare-eas-submit-credentials.test.ts`
- `docs/runbooks/store-submission.md`
- `docs/pre-launch-checklist.md`

Out of scope:

- Store listing copy, screenshots, product/catalog creation, or RevenueCat setup
- Committing any Google or Apple credential or identifier
- Triggering a production build, TestFlight upload, or Play submission before OPQ-37 approval
- Changing fallback, preview, development, or CI navigation flag combinations

## Tasks

- [x] T1: Pin the production submission contract - the focused test failed before implementation and now pins Config T, Play internal submission, ignored credentials, and no-secret validation.
- [x] T2: Implement credential-safe submit priming - the focused test and synthetic materialization smoke pass; `eas.json` carries the held Config-T/submit diff and no credential material is tracked or logged.
- [ ] T3: Document and adversarially verify the operator path - done when: the runbook covers Doppler injection, credential checks, build selection, Play internal-track submission, TestFlight submission, rollback, and the OPQ-37 gate; formatting, mode-nav ratchet, EAS config parsing, and independent review have no unresolved findings.
- [ ] T4: Execute the gated production dry run - done when: after OPQ-37 approval, the approved credentials are materialized, the production Config-T build is verified, Android submission succeeds on Play internal testing, iOS submission reaches TestFlight, and evidence is recorded without credential material.
