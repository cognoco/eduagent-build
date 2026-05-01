---
name: Market & Language Pivot — English UI, but language teaching now active
description: UI remains English-only for launch. GDPR-everywhere consent. Language TEACHING (foreign language tutoring via four_strands pedagogy) is now actively being built — no longer deferred.
type: project
---

**Decision (2026-03-23):** Launch English-only UI, targeting USA, UK, Australia.

**Why:** Simplifies launch — no i18n infrastructure needed, no German translations, no locale-specific compliance branching. DACH market deferred.

**Consent strategy:** Apply GDPR's under-16 parental consent threshold globally ("GDPR everywhere"). This is the strictest standard and automatically satisfies US COPPA, UK GDPR+AADC, Australia Privacy Act.

**UPDATE (2026-04-04):** Language TEACHING is no longer deferred. The `diverse` branch has a full language learning feature: four_strands pedagogy mode, vocabulary CRUD, CEFR levels, language-progress tracking. This means the app teaches foreign languages (e.g., a student learning French) even though the app's own UI is English-only. See `project_language_pedagogy.md` for details.

**How to apply:**
- App UI language: English only (no i18n/react-i18next)
- Subject language: Configurable per subject via `languageCode` + `pedagogyMode: four_strands`
- Consent: Age-only check (age < 16 → consent required), jurisdiction-neutral
