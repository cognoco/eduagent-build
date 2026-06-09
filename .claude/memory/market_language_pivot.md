---
name: Market & Language Pivot — English UI, but language teaching now active
description: UI remains English-only for launch. Language TEACHING is active. Consent/geography strategy is now governed by the age-floor decision document, not the old GDPR-everywhere shortcut.
type: project
---

**Decision (2026-03-23):** Launch English-only UI, targeting USA, UK, Australia.

**Why:** Simplifies launch — no i18n infrastructure needed, no German translations, no locale-specific compliance branching. DACH market deferred.

**Consent / age-floor strategy → canon, not here.** The old "GDPR-everywhere" age-only shortcut is superseded; it does **not** automatically satisfy US COPPA. Canonical source is `docs/compliance/identity-compliance-register.md` (launch 13+, guardian-gated, country-allowlist, no under-13 until the COPPA/VPC/provider phase is deliberately built) — read it, don't trust a paraphrase.

**UPDATE (2026-04-04):** Language TEACHING is no longer deferred. The `diverse` branch has a full language learning feature: four_strands pedagogy mode, vocabulary CRUD, CEFR levels, language-progress tracking. This means the app teaches foreign languages (e.g., a student learning French) even though the app's own UI is English-only. See `project_language_pedagogy.md` for details.

**How to apply:**
- App UI language: English only (no i18n/react-i18next)
- Subject language: Configurable per subject via `languageCode` + `pedagogyMode: four_strands`
- Consent: follow `docs/compliance/identity-compliance-register.md`. Do not use the old age-only, jurisdiction-neutral consent shortcut for launch planning.
