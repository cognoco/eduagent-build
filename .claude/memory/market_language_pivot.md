---
name: Market & Language Pivot — English UI, but language teaching now active
description: UI remains English-only for launch. Language TEACHING is active. Consent/geography strategy is now governed by the age-floor decision document, not the old GDPR-everywhere shortcut.
type: project
---

**Historical decision (2026-03-23; fully superseded for launch geography):** Launch targeting USA, UK, Australia. The original "English-only UI" call was superseded in implementation — v1 shipped with **7 UI locales** (en, de, es, ja, nb, pl, pt; `SUPPORTED_LANGUAGES` in `apps/mobile/src/i18n/index.ts`) and full i18n infrastructure (react-i18next). See AGENTS.md § Languages for the UI-locale vs tutor-prose-language split.

**Why (original rationale, historical):** Simplify launch; DACH market deferred. The no-i18n premise no longer holds.

**Consent / age-floor / geography strategy → canon, not here.** The old country targets and "GDPR-everywhere" shortcut are superseded. Canonical source is `docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`: v1 is EEA-only, 13+, under-13 blocked, all 30 EEA countries within the policy perimeter, and guardian authorization triggered below the Article 8 threshold for habitual residence. Norway and Portugal require launch-day legal refreshes; the UK is denylisted and other non-EEA countries remain disabled pending a separate ruling.

**UPDATE (2026-04-04):** Language TEACHING is no longer deferred. The `diverse` branch has a full language learning feature: four_strands pedagogy mode, vocabulary CRUD, CEFR levels, language-progress tracking. This means the app teaches foreign languages (e.g., a student learning French) even though the app's own UI is English-only. See `project_language_pedagogy.md` for details.

**How to apply:**
- App UI language: 7 shipped locales (`SUPPORTED_LANGUAGES`); tutor-prose languages are an intentional superset — AGENTS.md § Languages governs adding either kind
- Subject language: Configurable per subject via `languageCode` + `pedagogyMode: four_strands`
- Consent and launch geography: follow `docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md` plus `docs/compliance/identity-compliance-register.md`. UI locale availability is not country clearance.
