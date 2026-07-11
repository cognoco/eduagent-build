---
title: Recap Verified-Proof Block — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1665]
spec: docs/specs/2026-07-06-verified-learning-loop.md
status: done
---

# Recap Verified-Proof Block — Implementation Plan

**Goal:** Add a verified-proof block to guardian Recap details only when the session/topic has a Challenge-Round-verified, explicitly marked kept note, while preserving every existing Recap shape and rendering path when no artifact exists.

**Approach:** Extend the shared Recap response additively, add a session/topic-scoped sibling to the existing parent-proof resolver, and enrich Recaps through a session-keyed map. Reuse one presentational proof block across the existing home receipt and Recap detail so topic/date/state/retention/quote degradation remain aligned.

## Scope

In scope:
- `packages/schemas/src/recaps.ts`
- `packages/schemas/src/recaps.test.ts`
- `apps/api/src/services/parent-proof.ts`
- `apps/api/src/services/parent-proof.test.ts`
- `apps/api/src/services/recaps.ts`
- `apps/api/src/services/recaps.test.ts`
- `apps/mobile/src/components/home/VerifiedProofCard.tsx`
- `apps/mobile/src/components/family/VerifiedProofBlock.tsx`
- `apps/mobile/src/app/(app)/recaps/[recapId].tsx`
- `apps/mobile/src/app/(app)/recaps/[recapId].test.tsx`
- `apps/mobile/src/i18n/locales/en.json`
- `report.md`

Out of scope:
- Database migrations or writes
- Raw `session_events` reads or transcript fallback
- Recap generation changes
- Translation generation
- Integration tests, network, database access, commits, and `apps/mobile/eas.json`

## Tasks

- [x] T1: Extend the Recap schema with nullable/defaulted `verifiedProof` — done when schema tests prove omitted/null compatibility and populated round-trip behavior.
- [x] T2: Add `getVerifiedProofForSessionTopic` with exact profile/session/topic assessment scoping, marked-note provenance, 30-day read suppression, verification/retention co-presentation, and `nextReviewDate` — done when offline unit tests prove artifact-present, artifact-absent, and aged-quote behavior without transcript reads.
- [x] T3: Enrich parent/self Recap list and parent Recap detail results through a session-keyed proof map while leaving non-proof item fields unchanged — done when Recap service tests prove populated, null, and aged variants.
- [x] T4: Render a shared verified-proof presentation in Recap detail, including the abstracted quote line, positive strong-retention affordance, and optional re-check date — done when the Recap detail mobile test proves present, hidden, and aged variants.
- [x] T5: Record red/green evidence and run offline verification — done when `report.md` contains verbatim first-run failures, changed files, preservation/canon/i18n notes, requested Jest/TypeScript/no-clinical-copy outcomes, and host-only gaps.

## Tests

- T1: `packages/schemas/src/recaps.test.ts` parses omitted, explicit-null, and populated `verifiedProof` values.
- T2: `apps/api/src/services/parent-proof.test.ts` exercises the resolver with an offline Drizzle-query stub and asserts no `session_events` dependency exists.
- T3: `apps/api/src/services/recaps.test.ts` covers valid marked proof, no verified assessment, and an aged marked note whose quote is null while proof metadata remains.
- T4: `apps/mobile/src/app/(app)/recaps/[recapId].test.tsx` covers visible proof, null suppression, and quote-unavailable degradation.
- T5: Run the exact user-requested related API Jest command, API `tsc`, schemas Jest suite, mobile focused Jest suite, and no-clinical-copy checker; do not run `*.integration.test.ts`.
