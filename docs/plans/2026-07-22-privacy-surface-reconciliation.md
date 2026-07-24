---
title: Privacy Surface Reconciliation — Implementation Plan
date: 2026-07-22
profile: change
status: completed
---

# Privacy Surface Reconciliation — Implementation Plan

**Goal:** Produce one internally consistent, code-evidenced privacy package for DPO review across the app configuration, in-app notice, repository policy artifact, and supporting transparency drafts.

**Approach:** Treat the July 2026 public notice as the starting text, correct it where current code requires qualification, and keep unresolved contractual/legal assertions visible in an evidence matrix rather than inventing proof. Add regression checks before changing user-facing behavior, then regenerate and review the supported-locale drafts.

## Scope

In scope:
- `apps/mobile/app.json`
- `apps/mobile/src/app/privacy.tsx`
- `apps/mobile/src/app/privacy.test.tsx`
- `apps/mobile/src/i18n/locales/*.json`
- `apps/mobile/src/i18n/source-baseline.json`
- `docs/compliance/privacy-policy.html`
- `docs/compliance/privacy-surface-evidence-2026-07-22.md`
- `docs/compliance/child-readable-privacy-summary-draft.md`

Out of scope:
- Provider DPAs, SCCs/TIAs, account-tier evidence, and provider-console settings
- Naming the DPO or UK representative without confirmed publishable details
- Store-console metadata changes outside the repository
- DPIA approval, Article 36 rulings, and management sign-off
- Implementing new retention, consent, or AI-routing behavior

## Tasks

- [x] T1: Add privacy-surface regression checks — focused tests failed for the stale app-store URL and the March/ten-section in-app notice before the implementation, while the existing navigation tests remained intact.
- [x] T2: Reconcile the English legal surfaces — the app URL targets the live notice, the in-app screen renders the July 2026 eleven-section notice, and `docs/compliance/privacy-policy.html` carries the same material facts and explicit pre-publish dependencies.
- [x] T3: Regenerate and semantically review supported-locale policy drafts — all seven locale files have the same 32-key privacy shape, no 11–17/11–15 launch-floor wording remains in the active privacy/terms copy, and the automated i18n checks pass. The generated translations remain subject to native/legal publication review.
- [x] T4: Produce the DPO engineering evidence matrix — every material public claim is classified as code-verified, configuration-dependent, contract-dependent, legal-decision-dependent, or human-review-dependent with current source citations and a named evidence owner.
- [x] T5: Draft the child-readable privacy summary — the plain-language draft explains AI interaction, learning memory/profiling, recipients, transfers, retention, rights, and guardian visibility without presenting unresolved legal matters as settled.
- [x] T6: Run proportional verification and review the final diff — the focused mobile tests, mobile TypeScript check, i18n checks, JSON parsing, privacy-text searches, URL checks, and diff hygiene checks pass, with no unrelated main-checkout changes in the worktree.

## Verification record

- `pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/app/privacy.test.tsx --runInBand` — 6/6 tests passed.
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` — exited successfully.
- `pnpm check:i18n` — all translation files up to date.
- `pnpm check:i18n:orphans` — 587 files checked; no findings.
- `pnpm check:i18n:jsx-literals` — no new findings.
- All locale privacy objects contain the same 32 keys; stale 11–15/11–17 policy wording search returned no matches.
- `https://mentomate.com/privacy` and `https://www.mentomate.com/privacy` both returned HTTP 200 on 2026-07-22.
