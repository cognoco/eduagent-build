---
name: Language learning pedagogy — four_strands mode actively in development
description: Language-specific pedagogy support (four_strands alongside socratic) committed on diverse branch 2026-04-04. Schema, routes, vocabulary CRUD, mobile hooks all in place.
type: project
---

**Status (2026-04-04):** Language learning feature committed to `diverse` branch, included in PR #109.

**Why:** Expands beyond the original Socratic-only tutoring to support language learning with the "four strands" pedagogy model (meaning-focused input/output, language-focused learning, fluency development).

**What was built:**
- Database: `pedagogyMode` enum (`socratic`/`four_strands`) on subjects table, `nativeLanguage` on teachingPreferences, new `language` schema (vocabulary, languageProgress tables)
- Schemas: `pedagogyModeSchema`, `languageCodeSchema`, `CefrLevel`, `Vocabulary` types in `@eduagent/schemas`
- API: language-progress routes, vocabulary CRUD + review, subject language-setup endpoint, language detection service, vocabulary extraction service
- Mobile: language-setup onboarding screen, FluencyDrill/MilestoneCard/VocabularyList components, use-vocabulary/use-language-progress hooks, language locale mapping

**Architecture notes:**
- `pedagogyMode` is required on Subject (defaults to `socratic` in DB)
- Language subjects use `four_strands` pedagogy mode, standard subjects use `socratic`
- CEFR levels (A1-C2) track language proficiency
- `nativeLanguage` stored on teachingPreferences (per subject, not per profile)

**How to apply:** This supersedes the "Epic 6 deferred to v1.1" note in market_language_pivot.md. Language learning is now actively being built, not deferred. The English-only launch decision may still apply to the UI language, but the app now supports teaching foreign languages.
