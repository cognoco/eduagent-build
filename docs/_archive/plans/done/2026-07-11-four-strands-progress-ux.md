---
title: Four Strands Progress UX — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1554]
status: done
---

# Four Strands Progress UX — Implementation Plan

**Goal:** Show recent Four Strands balance and evidence-backed language skill progress, while preserving existing practice navigation and adding the CEFR vocabulary entry point.
**Approach:** Extend the shared response contract first, then derive bounded recent-session evidence in the API with profile ownership pinned through `learning_sessions → subjects`. Render only populated evidence in the existing language block using flexible rows and existing navigation/test idioms.

## Scope

In scope:
- `packages/schemas/src/language.ts`
- `packages/schemas/src/language.test.ts`
- `apps/api/src/services/language-curriculum.ts`
- `apps/api/src/services/language-curriculum.test.ts`
- `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx`
- `apps/mobile/src/app/(app)/progress/[subjectId]/index.test.tsx`
- `apps/mobile/src/i18n/locales/en.json`
- `report.md`
- This plan

Out of scope:
- Routes and database schema/migrations
- Integration tests
- Translation generation
- Network, database, commits, and pull requests

## Tasks

- [x] T1: Extend and test the required nullable progress contract — done when schema tests first fail for missing `strandBalance` / `skillProfile`, then pass for populated and null round-trips plus invalid values.
- [x] T2: Derive bounded Four Strands and skill evidence in the service — done when language-curriculum unit tests first fail for absent fields, then pass for populated recent data, sparse data returning both fields null, non-language behavior, and profile-scoped parent-chain query construction.
- [x] T3: Render responsive progress sections and vocabulary navigation — done when mobile tests first fail for absent UI/navigation, then pass for populated data, sparse omission, non-language omission, full-ancestor vocabulary push, and long-label flexible rendering.
- [x] T4: Record evidence and verify offline — done when `report.md` contains verbatim red Jest failure lines, mapping/i18n/layout choices, and fresh results for the exact requested Jest and TypeScript commands.
