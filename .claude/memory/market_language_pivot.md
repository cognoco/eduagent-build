---
name: Market & Language Pivot — English UI, but language teaching now active
description: UI remains English-only for launch. Language TEACHING is active. Consent/geography strategy is now governed by the age-floor decision document, not the old GDPR-everywhere shortcut.
type: project
---

**Decision (2026-03-23, the UI-language half is superseded):** Launch targeting USA, UK, Australia. The original "English-only UI" call was superseded in implementation — v1 shipped with **7 UI locales** (en, de, es, ja, nb, pl, pt; `SUPPORTED_LANGUAGES` in `apps/mobile/src/i18n/index.ts`) and full i18n infrastructure (react-i18next). See AGENTS.md § Languages for the UI-locale vs tutor-prose-language split.

**Why (original rationale, historical):** Simplify launch; DACH market deferred. The no-i18n premise no longer holds.

**Consent / age-floor strategy → canon, not here.** The old "GDPR-everywhere" age-only shortcut is superseded; it does **not** automatically satisfy US COPPA. Canonical source is `docs/compliance/identity-compliance-register.md` (launch 13+, guardian-gated, country-allowlist, no under-13 until the COPPA/VPC/provider phase is deliberately built) — read it, don't trust a paraphrase.

**UPDATE (2026-04-04):** Language TEACHING is no longer deferred. The `diverse` branch has a full language learning feature: four_strands pedagogy mode, vocabulary CRUD, CEFR levels, language-progress tracking. This means the app teaches foreign languages (e.g., a student learning French) even though the app's own UI is English-only. See `project_language_pedagogy.md` for details.

**How to apply:**
- App UI language: 7 shipped locales (`SUPPORTED_LANGUAGES`); tutor-prose languages are an intentional superset — AGENTS.md § Languages governs adding either kind
- Subject language: Configurable per subject via `languageCode` + `pedagogyMode: four_strands`
- Consent: follow `docs/compliance/identity-compliance-register.md`. Do not use the old age-only, jurisdiction-neutral consent shortcut for launch planning.
