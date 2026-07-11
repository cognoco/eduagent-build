---
title: Superseded Dead Surface Removal — Implementation Plan
date: 2026-07-11
profile: change
work_items: [WI-1667]
status: done
---

# Superseded Dead Surface Removal — Implementation Plan

**Goal:** Remove the four census-approved dead surfaces and only their exclusive support code, tests, and translations while preserving every named shared dependency and replacement flow.
**Approach:** Re-run the caller census before editing and record the exact commands and counts in `report.md`. Apply surgical deletions and pruning, then prove absence with a second census and run the specified offline replacement, API, schema, i18n, and typecheck gates.

## Scope

In scope:
- `apps/mobile/src/hooks/use-depth-evaluation.ts`
- `apps/mobile/src/hooks/use-guardian-notification-ask.ts` and its test
- `apps/mobile/src/components/library/CollapsibleChapter.tsx` and its test
- `apps/mobile/src/components/library/NoteDisplay.tsx` and its test
- `apps/mobile/src/app/session-summary/[sessionId].test.tsx`
- `apps/mobile/src/i18n/locales/*.json` and `apps/mobile/src/i18n/source-baseline.json`
- `apps/api/src/routes/sessions.ts`, `sessions.test.ts`, and `sessions-proxy-guard.test.ts`
- `apps/api/src/services/session/session-depth.ts`, its prompt and test files, its barrel export, and gate-only config constants
- `apps/api/src/inngest/functions/ask-gate-observe.ts`, its test, and registrations in `apps/api/src/inngest/index.ts`
- `apps/api/src/middleware/metering.ts`, `metering.test.ts`, and `metering.coverage.manifest.ts`
- `packages/schemas/src/depth-evaluation.ts`, `observers.ts`, and `observers.test.ts`
- `report.md`
- This implementation plan

Out of scope:
- `apps/mobile/eas.json`
- `guardianNotificationAskKey` and its sign-out purge path
- `detectedTopicSchema`, `DetectedTopic`, `SILENT_CLASSIFY_CONFIDENCE_THRESHOLD`, and `LANGUAGE_REGEX`
- Shared InlineNoteCard translation keys and all named replacement implementations
- `apps/api/src/routes/subjects.ts` comment-only reference
- Database, network, dependency installation, commit, push, and PR operations

## Tasks

- [x] T1: Re-verify every zero-caller claim and live replacement reference — done when: `report.md` records each exact `rg` command, hit count, and classification before deletion.
- [x] T2: Remove the depth-evaluation route cluster and exclusive observer/metering/schema support — done when: the post-edit census has no production references and the preserved shared schemas/config symbols retain their live callers.
- [x] T3: Remove the guardian notification hook, CollapsibleChapter, and NoteDisplay surfaces with their dead-only tests — done when: the post-edit census finds no removed symbols/files while the SecureStore purge key and live replacement callers remain.
- [x] T4: Remove only the specified orphaned translations from every locale and the source baseline — done when: all removed keys have zero hits and all four shared `library.noteSignal` keys remain.
- [x] T5: Verify replacements and affected API/schema contracts offline — done when: the exact mobile, API, schema, i18n, and typecheck commands requested in the work order have fresh recorded results, including any explicit project-reference blocker.
- [x] T6: Audit the diff and finish the report — done when: every changed line maps to the census or required evidence, `eas.json` is untouched, and `report.md` contains files changed, the SecureStore ruling, i18n removals, and verification results.
