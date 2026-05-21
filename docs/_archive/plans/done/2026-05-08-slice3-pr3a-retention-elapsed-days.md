# Slice 3 PR 3a — Surface "Remembered After N Days" On Retention

**Date:** 2026-05-08
**Status:** Draft plan, ready to implement
**Branch:** TBD (off `main` after stabilization merges)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` → Section G (Slice 3)
**Wave:** Slice 3 Wave 1 — independent, ship first
**Size:** S (~80 LoC source + tests)

---

## Goal

Expose `daysSinceLastReview` to the learner UI so retention surfaces show **"Remembered after 9 days"** / **"Getting fuzzy after 14 days"** alongside the status pill. Today the field is computed and used as LLM context only — the kid never sees it.

Single emotional payoff for an 11-17 audience: the app starts to feel like it noticed me. Status enums alone read like a quiz score; elapsed-days copy reads like a tutor.

---

## Current state (verified 2026-05-08)

### Where the data lives today

- `daysSinceLastReview` is computed server-side in `apps/api/src/services/session/session-exchange.ts:1065-1080,1448` and threaded into `apps/api/src/services/exchanges.ts:152` (`ImageData`-adjacent context type).
- It reaches the LLM via `apps/api/src/services/exchange-prompts.ts:698-700`: `last reviewed ${rs.daysSinceLastReview} day${...}`. **This is the only consumer today.**
- Zero mobile UI consumes it. Confirmed by full-tree grep — no `daysSinceLastReview` reference in `apps/mobile/`.

### Where the pill renders today

`apps/mobile/src/components/library/RetentionPill.tsx:19-73` — small component, takes `status: RetentionStatus` and renders dot + label only. No elapsed-days line, no date, no copy beyond the status enum (`strong`/`fading`/`weak`/`forgotten`).

Consumers (5 files total):
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` — book screen topic list
- `apps/mobile/src/components/library/TopicHeader.tsx` — topic detail header
- `apps/mobile/src/components/library/RetentionPill.test.tsx`
- `apps/mobile/src/components/library/TopicHeader.test.tsx`

The audit referenced `RetentionSignal.tsx` — that file does not exist. Only `RetentionPill` is in scope.

### What's missing on the wire

The query that feeds book screen + topic detail does not currently carry `daysSinceLastReview` per topic. It must be added to `topicProgressSchema` (or the closest progress shape consumed by these screens) and threaded through whatever service computes per-topic progress. Implementer to confirm exact shape on first pass — see `packages/schemas/src/progress.ts:226-251` (topicProgressSchema) and the resolver behind the book screen.

---

## Files to change

- `packages/schemas/src/progress.ts` — extend `topicProgressSchema` with `daysSinceLastReview: z.number().int().min(0).nullable()`.
- `apps/api/src/services/...` — service that produces topic progress for the book screen and topic detail. Compute `daysSinceLastReview` from `retention_cards.lastReviewedAt` (or equivalent) and include in the response. Reuse the same calculation already running in `session-exchange.ts:1065-1080` if a shared helper exists; if not, factor a small helper.
- `apps/mobile/src/components/library/RetentionPill.tsx` — extend props with optional `daysSinceLastReview?: number | null`. Render an additional small subtitle line when present and above the suppression threshold (see step 3 below).
- `apps/mobile/src/components/library/RetentionPill.test.tsx` — add cases for: line shown when value present, line hidden when value below threshold, line hidden when value null.
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` — pass the new field into `RetentionPill`.
- `apps/mobile/src/components/library/TopicHeader.tsx` — pass the new field into `RetentionPill`.
- `apps/mobile/src/i18n/locales/{en,nb,de,es,pl,pt,ja}.json` — new keys: `progress.retention.elapsed.remembered`, `progress.retention.elapsed.fading`, `progress.retention.elapsed.weak`, `progress.retention.elapsed.forgotten`. Each takes `{{count}}` and uses i18next plural rules.

---

## Copy

Status-aware copy, age-neutral, kept short:

- `strong` → "Remembered after {{count}} day" / "Remembered after {{count}} days"
- `fading` → "Getting fuzzy after {{count}} days"
- `weak` → "Slipping after {{count}} days"
- `forgotten` → "Last seen {{count}} days ago"

Norwegian (consistency with the rest of the app):
- `strong` → "Husket etter {{count}} dager"
- `fading` → "Begynner å bli uklart etter {{count}} dager"
- `weak` → "Glemmes etter {{count}} dager"
- `forgotten` → "Sist sett for {{count}} dager siden"

Other locales: english fallback for now; sweep in next i18n pass.

---

## Implementation steps

1. **Schema:** add `daysSinceLastReview` to `topicProgressSchema`. Run `pnpm exec nx run @eduagent/schemas:typecheck` — every consumer of `TopicProgress` will now know the field exists optionally.
2. **API:** thread the field through the per-topic progress resolver. The calculation already exists in `session-exchange.ts:1065-1080` — extract a small helper (`computeDaysSinceLastReview(lastReviewedAt: Date | null): number | null`) into a shared module under `apps/api/src/services/retention-data.ts` or similar, and call from both sites.
3. **Component:** extend `RetentionPill` props. When `daysSinceLastReview` is non-null **and ≥ 2** (suppression threshold — 0/1 days reads weird), render the elapsed-days line beneath the existing dot+label using the `STATUS_KEY`-style mapping above. Below the threshold, render only the existing pill.
4. **Wire-up:** update both consumers (book screen + topic header) to pass the new field. Both already destructure topic-progress shape, so this is one prop addition each.
5. **Tests:** RetentionPill test covers the three branches (show / suppress-low / suppress-null). Snapshot/render test on book screen verifies an existing topic with N days and a fresh topic without.

---

## Out of scope

- Recap card: showing "remembered after 9 days" on the session-summary screen. **High-value follow-up**, but the recap surface uses a different data shape (it's a per-session summary, not a per-topic progress row) and threading the field there is a separate small change. Leaving for PR 3a.1 if validated post-launch.
- Parent-side surfacing of elapsed days. Parent dashboard reads a different schema (`dashboardChildProgressSchema`) and shows aggregate retention status, not per-topic detail. Out of scope.
- `RetentionSignal` component referenced in the audit — file does not exist; nothing to update.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Topic just reviewed (0–1 days) | Learner reviewed today / yesterday | Elapsed-days line hidden; pill alone renders | Working as intended (suppression threshold) |
| Topic never reviewed | Brand-new card, `lastReviewedAt` null | `daysSinceLastReview: null`; line hidden | Working as intended |
| Stale data — reviewed but cache lag | Snapshot vs. real-time mismatch | "Remembered after 9 days" briefly when actually 0 | Refetch on screen focus (existing pattern); next render corrects |
| Plural rule mismatch (1 day) | English "1 days" / Norwegian fallback | Grammatically wrong copy | i18next pluralization keys handle this — verify singular form in tests |
| Schema field missing on existing client (rolling deploy) | Old client + new API | Optional field — old client ignores | No breakage; field is additive |
| API forgets to populate field | Backend regression | Field is `null` on every topic; line never shows | Rendering still safe; flag in API integration test that the field is non-null for at-least-once-reviewed topics |

---

## Verification

- `pnpm exec nx run @eduagent/schemas:typecheck` — schema additions are clean.
- `pnpm exec nx run api:typecheck` — API consumers of `TopicProgress` still compile.
- `pnpm exec nx run api:test --testPathPatterns 'retention|progress'` — touch covers retention-data and progress shaping.
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/library/RetentionPill.tsx --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- Manual on dev-client: open a book with at least one topic the kid reviewed > 2 days ago; verify the elapsed-days line renders alongside the pill.

---

## Risk and rollback

- **Blast radius:** small. Component extension is additive (new optional prop), schema field is additive (nullable). Two existing consumers updated with a single prop pass-through each.
- **Rollback:** revert. The pill falls back to status-only rendering, the optional field is ignored, the API change has no consumer.
- **No DB migration.** `lastReviewedAt` already exists on `retention_cards`; we're computing a derived value at read time.

---

## Wave dependencies

- **Depends on:** none. This is the cleanest of the three Slice 3 quick wins.
- **Parallel-safe with:** PR 3b (`book_completed`), PR 3c (learner weekly deltas), Slice 1.5 leftovers.
- **Blocks:** nothing.
