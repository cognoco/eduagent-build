# LLM-Powered Internationalization (i18n)

**Status:** Draft
**Date:** 2026-05-03

## Problem

The app UI is English-only. All ~700 user-facing strings are hardcoded inline in JSX across ~80 screens. There is no i18n infrastructure. Expanding to non-English markets requires translating every button, label, error message, and accessibility label — but maintaining static translation files for every language manually doesn't scale.

## Solution

Build-time LLM translation. English remains the source of truth. A developer runs `pnpm translate`, which feeds the English string catalog through the Claude API and produces one JSON file per target language. The generated files ship as static bundles — zero LLM calls at runtime.

## Target Languages

| Code | Language           | Review         |
|------|--------------------|----------------|
| `en` | English            | Source         |
| `nb` | Norwegian Bokmål   | Human (owner)  |
| `de` | German             | Partial human  |
| `es` | Spanish            | LLM-trusted    |
| `pt` | Portuguese         | LLM-trusted    |
| `pl` | Polish             | LLM-trusted    |
| `ja` | Japanese           | LLM-trusted    |

Adding a language = adding a code to the config array and running the script.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language detection | Device locale, manual override in Settings | Standard UX; expats/learners can switch |
| Relationship to conversationLanguage | Auto-suggest skipped during onboarding; fires post-onboarding only if user didn't explicitly set conversationLanguage to match UI language | Avoids double-prompt; respects explicit onboarding choice |
| API error messages | API returns error codes; mobile maps codes to localized display strings via stable `errorCode` property | API text stays English for logs; user-facing copy lives in mobile i18n |
| Translation trigger | Manual `pnpm translate` + CI staleness check that fails the build on missing keys | Human in the loop for generation; CI prevents shipping stale translations |
| Quality assurance | Back-translation validation + glossary enforcement + mandatory human review for `nb`/`de` | LLM output is good but not infallible; educational context demands correctness |
| Language storage | Device-local (AsyncStorage) with device locale default | No DB migration; conventional for UI language. Acceptable tradeoff — bilingual users may need to re-set after storage reset |
| Pluralization / date formatting | Out of scope for v1 but key naming is plural-ready (`_one`/`_other` suffixes reserved) | Separate concern, layered in later without a second migration pass |
| i18n framework | i18next + react-i18next + expo-localization | Industry standard, battle-tested in React Native, extraction tooling available |
| Feature flag for language picker | Hidden behind `i18n.enabled` flag until migration is 100% complete | Prevents shipping a half-translated app |

## Architecture

### File Structure

```
apps/mobile/
  src/
    i18n/
      index.ts              # i18next init, locale detection, fallback
      locales/
        en.json             # source of truth
        nb.json             # LLM-generated, human-reviewed
        de.json
        es.json
        pt.json
        pl.json
        ja.json
  i18next-parser.config.js  # extraction config
scripts/
  translate.ts              # LLM translation pipeline (monorepo root)
  check-i18n-staleness.ts   # CI check: en.json keys vs target language files
```

### i18n Initialization (`i18n/index.ts`)

1. Check AsyncStorage for manual override key (`app-ui-language`)
2. If no override, read device locale via `expo-localization` `getLocales()[0].languageTag`
3. Extract language code (e.g., `nb-NO` → `nb`)
4. If language code matches a supported locale, use it; otherwise fall back to `en`
5. Initialize i18next with the resolved language and all locale bundles
6. Export the initialized instance; import this file at app root before any screen renders

### ConversationLanguage Auto-Suggest

**Interaction with onboarding:** The onboarding flow already collects `conversationLanguage` as a mandatory field. The auto-suggest does NOT fire during or immediately after onboarding. It fires only when ALL of the following are true:

1. The user has completed onboarding (profile exists with `conversationLanguage` set)
2. The resolved UI language differs from the profile's current `conversationLanguage`
3. The UI language is in the `ConversationLanguage` enum
4. The user did NOT explicitly choose their `conversationLanguage` during onboarding to match their device locale (i.e., they left it at the default or picked something else)
5. The dismissal flag (`i18n-auto-suggest-dismissed`) is not set in AsyncStorage

If all conditions met, show a one-time prompt: "Would you like [Tutor Name] to talk to you in [UI language]?" If accepted, update `conversationLanguage`. If dismissed, never ask again. After this moment, the two settings are fully independent.

Note: Norwegian (`nb`) is not currently in the `ConversationLanguage` enum (which has: en, cs, de, es, fr, it, pl, pt). The auto-suggest only fires when the UI language overlaps with the enum. Adding `nb` to the enum is a separate decision that requires updating the schema, DB CHECK constraint, and LLM prompt surfaces.

### Settings Override

New row in the existing More/Settings screen: **"App Language"**. Tapping opens a picker showing all supported languages (with native labels, e.g., "Deutsch", "Español", "日本語"). Selecting a language writes to AsyncStorage and calls `i18next.changeLanguage()`, which triggers a re-render of all `t()` calls. No app restart required.

**Feature gate:** The language picker row is only visible when the `i18n.enabled` feature flag is true. This flag is set to `true` only after all ~80 screens have been migrated to `t()` calls and all language files pass validation. During the migration period, the app remains English-only from the user's perspective.

### String Catalog Shape (`en.json`)

Namespaced by screen/feature, flat within each namespace. Key naming is **plural-ready** — when plural forms are added later, they use i18next's suffix convention (`_one`, `_other`, `_few`, `_many`) on the same base key without restructuring:

```json
{
  "home": {
    "retry": "Retry",
    "goToLibrary": "Go to Library",
    "takingLonger": "Taking longer than expected..."
  },
  "more": {
    "family": "Family",
    "account": "Account",
    "signOut": "Sign out",
    "addChild": "Add a child",
    "exportData": "Export my data"
  },
  "common": {
    "cancel": "Cancel",
    "save": "Save",
    "loading": "Loading...",
    "errorRetry": "Something went wrong. Tap to retry."
  },
  "errors": {
    "quotaExhausted": "You've used all your sessions for today. Come back tomorrow!",
    "networkError": "Can't connect. Check your internet and try again.",
    "sessionNotFound": "This session is no longer available."
  }
}
```

Interpolation uses i18next's `{{variable}}` syntax: `"greeting": "Welcome back, {{name}}"`.

Future plural example (no migration needed — just add the suffixed keys):
```json
{
  "library": {
    "bookCount_one": "{{count}} book",
    "bookCount_other": "{{count}} books"
  }
}
```

### Translation Script (`scripts/translate.ts`)

Inputs:
- `apps/mobile/src/i18n/locales/en.json` (source)
- Target language list from config
- `scripts/i18n-glossary.json` (term glossary — see Quality Assurance below)

For each target language:
1. Read `en.json`
2. If the target file already exists, compute a diff of changed/added keys since last run (only re-translate changed keys to preserve human edits and reduce cost)
3. Send to Claude API (Sonnet) with prompt caching enabled (system prompt cached across language calls) and a system prompt:
   - Translate JSON values only, never keys
   - Preserve `{{interpolation}}` markers exactly
   - Keep translations concise — mobile UI has limited space; aim for ≤130% of English character length
   - Educational app for ages 11+, use age-appropriate language
   - For technical terms, follow the glossary provided (XP, streak, etc.)
   - Target a maximum character length per string (provided as metadata where applicable)
   - Return valid JSON only
4. Parse response, validate it has the same key structure as source
5. Run back-translation check on a random 10% sample (translate back to English, flag semantic drift)
6. Write to `{lang}.json`

**Rate limiting and retry:** The script uses a concurrency limit of 3 parallel requests with exponential backoff (max 3 retries per language, delays: 1s, 4s, 16s). If a language still fails after retries, it is skipped with a clear error message listing which languages failed and why.

Validation checks after each language:
- All keys present (no missing translations)
- No keys added (no hallucinated entries)
- All `{{variable}}` markers preserved
- Valid JSON
- No string exceeds 150% of the English source length (warning) or 200% (hard fail)

If validation fails for a language, log the errors and skip that language file (don't overwrite a good existing translation with a broken one).

**Diff mode (default):** Only re-translates keys that changed in `en.json` since the last run. Existing translations for unchanged keys are preserved. This protects human edits to `nb.json`/`de.json` and reduces API cost on iterative runs.

**Full mode (`--full`):** Re-translates all keys. Use when updating the system prompt or glossary.

CLI: `pnpm translate` (runs `scripts/translate.ts` via `tsx`). Uses `ANTHROPIC_API_KEY` from Doppler (`doppler run -- pnpm translate` or key already in environment).

Options:
- `--lang de` — translate only one language
- `--full` — re-translate all keys (not just changed)
- `--dry-run` — show what would change without writing files
- `--review` — output a side-by-side diff of previous vs. new translations for human review

**Cost estimate:** ~$0.50 per full run (all languages, all keys). Diff-mode runs on typical PRs (5-20 changed keys) cost <$0.05. Prompt caching reduces cost by ~90% on repeated runs within the cache TTL (5 min).

### Quality Assurance

**Glossary (`scripts/i18n-glossary.json`):** A JSON file mapping English terms to their required translation in each language. Terms like "XP", "streak", "session", "tutor" that have domain-specific meaning get locked translations. The glossary is included in the LLM prompt and validated post-translation.

**Back-translation sampling:** On each run, 10% of translated strings are sent back through the LLM with "translate this [language] text to English." If the back-translation diverges semantically from the original English (checked via embedding similarity threshold), the string is flagged for human review. Flagged strings are written to `scripts/i18n-review-needed.json`.

**Human review workflow for `nb`/`de`:**
1. `pnpm translate --review --lang nb` outputs a Markdown diff showing previous → new for each changed string
2. Owner reviews and manually edits any incorrect translations directly in `nb.json`
3. Manual edits are preserved on subsequent diff-mode runs (only changed `en.json` keys are re-translated)

### String Length and Layout Overflow

German and Portuguese translations are typically 30-40% longer than English. Japanese uses fewer characters but may be wider in certain fonts. Mitigations:

1. **LLM prompt constraint:** System prompt instructs the model to keep translations concise and provides a soft character budget (130% of English length)
2. **Post-translation length validation:** Strings exceeding 150% of source length trigger a warning; 200% is a hard fail
3. **Layout guidelines for developers:** All text containers must use `numberOfLines` with `ellipsizeMode="tail"` where space is physically constrained (buttons, tab labels, headers). For body text, containers must be scrollable or expandable.
4. **Visual regression testing:** The smoke test suite (see Testing Strategy) renders key screens in each language and captures screenshots. Overflow is caught by checking that no `Text` component is clipped (Detox/Maestro screenshot comparison).
5. **Design token for max button width:** Buttons use a max-width design token. Translations that exceed button width wrap to a second line (acceptable) or are flagged by visual regression (if truncated).

### Component Migration Pattern

Before:
```tsx
<Text>Taking longer than expected...</Text>
<Button title="Retry" onPress={handleRetry} />
```

After:
```tsx
const { t } = useTranslation();
<Text>{t('home.takingLonger')}</Text>
<Button title={t('home.retry')} onPress={handleRetry} />
```

Accessibility labels follow the same pattern:
```tsx
// Before
<Pressable accessibilityLabel="Go back">
// After
<Pressable accessibilityLabel={t('common.goBack')}>
```

### Migration Rollout Strategy

The migration touches ~80 screens. During the migration period:

1. **Feature flag `i18n.enabled`** gates the language picker. Set to `false` until migration is complete.
2. While the flag is off, the app always uses `en` regardless of device locale. Users cannot switch languages.
3. Screens are migrated in batches (parallelized across agents). Each batch:
   - Wraps all strings with `t()` calls
   - Adds keys to `en.json`
   - Runs `pnpm translate` for the batch
   - Verifies no visual regression on the migrated screens
4. Once all screens are migrated and all language files pass validation, flip `i18n.enabled` to `true`.
5. The language picker becomes visible. The app begins respecting device locale.

This ensures users never see a half-translated app.

### String Extraction

Use `i18next-parser` (devDependency) to scan JSX and generate the initial `en.json`. Configuration scans `apps/mobile/src/**/*.{tsx,ts}` for `t('...')` calls. This means the extraction works *after* components have been migrated to use `t()` — it doesn't extract raw inline strings.

Migration order:
1. Set up i18n infrastructure (init, provider, dependencies, feature flag)
2. Migrate screens to use `t()` calls, building `en.json` as you go
3. Run `pnpm translate` to generate all language files
4. Add language picker to Settings (gated behind feature flag)
5. Flip feature flag once all screens are migrated and validated

The screen migration is the bulk of the work. It's mechanical (replace string literal with `t()` call, add key to `en.json`) and parallelizes well across agents — each screen is independent.

### API Error Code Mapping

The mobile client already classifies API errors via typed error hierarchy. Each error class exposes a stable `errorCode` string property (not dependent on class name minification). The i18n layer maps error codes to translation keys:

```typescript
const ERROR_KEY_MAP: Record<string, string> = {
  QUOTA_EXHAUSTED: 'errors.quotaExhausted',
  RESOURCE_GONE: 'errors.resourceGone',
  FORBIDDEN: 'errors.forbidden',
  NETWORK_ERROR: 'errors.networkError',
};

function getLocalizedErrorMessage(error: ClassifiedError): string {
  const key = ERROR_KEY_MAP[error.errorCode] ?? 'errors.generic';
  return i18next.t(key);
}
```

**Why `errorCode` instead of `constructor.name`:** In production builds with Hermes/minification, class names may be mangled. A stable string property (`errorCode`) is minification-safe. Each error class in the typed hierarchy must define this property as a readonly literal type.

API response bodies continue to return English text for logging/debugging. The mobile client never displays raw API error text to users.

### CI Staleness Check (`scripts/check-i18n-staleness.ts`)

Runs in CI on every PR that touches `apps/mobile/src/i18n/locales/en.json`. Checks:

1. Every key in `en.json` exists in all target language files
2. No target language file has keys that don't exist in `en.json` (orphaned translations)
3. All `{{variable}}` markers in `en.json` are present in corresponding target strings

If any check fails, CI fails with a clear message: "Translation files are stale. Run `pnpm translate` and commit the result."

This prevents the silent English-fallback drift problem where non-English users see untranslated strings because a developer forgot to regenerate translations.

### Server-Generated User-Facing Strings

The following strings are generated server-side and reach the user's eyes. They are **out of scope for v1** but inventoried here to prevent assumptions:

| Source | Content | Current language | i18n plan |
|--------|---------|-----------------|-----------|
| Inngest → push notifications | Session reminders, streak alerts | English | v2: template-based with locale param |
| LLM session content | Tutoring, quiz, dictation | `conversationLanguage` (already localized) | N/A — already handled |
| API validation errors | "Field X is required" | English (never shown to user — mobile maps error codes) | N/A |
| Email (transactional) | Welcome, password reset | English | v2: email template localization |

No action needed for v1 because push notifications are not yet shipped, emails use a separate pipeline, and LLM content already respects `conversationLanguage`. But any new server→user string channel must be added to this table.

## Scope Boundary

**In scope:**
- i18next setup + expo-localization integration
- English source catalog extraction from all ~80 screens
- `t()` wrapping of all user-facing strings including accessibility labels
- LLM translation script with validation, retry, prompt caching, and diff-mode
- CI staleness check for translation files
- Language picker in Settings (behind feature flag until migration complete)
- ConversationLanguage auto-suggest (post-onboarding only, with explicit interaction rules)
- AsyncStorage for language override
- Stable `errorCode` property on all ClassifiedError subclasses
- Translation glossary for domain terms
- Back-translation sampling for quality validation
- String length validation (150% warning / 200% hard fail)

**Out of scope (v1):**
- Plural form extraction (key naming is plural-ready; extraction deferred)
- Date/number/currency locale formatting (`Intl.DateTimeFormat` etc.)
- Right-to-left (RTL) layout support (none of the 6 target languages are RTL)
- Server-side i18n / push notification localization / email template localization
- Adding Norwegian to the `ConversationLanguage` enum
- Translation management platform (Crowdin, Lokalise, etc.)
- Visual regression CI (manual smoke testing for v1; automated screenshot comparison for v2)

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Missing translation key | Developer adds string to `en.json` but doesn't run `pnpm translate` | CI fails; cannot merge PR | Run `pnpm translate` and commit |
| LLM returns malformed JSON | API error or truncated response | Previous translation file preserved (script retries 3x then skips) | Re-run `pnpm translate --lang <code>` |
| Unsupported device locale | User has locale not in our 7 languages (e.g., Arabic) | English fallback | No action needed; user can manually pick a supported language in Settings |
| Translation quality issue | LLM produces an awkward or incorrect translation | User sees bad copy | Back-translation flags it; or user reports via feedback; developer fixes in language JSON and commits |
| AsyncStorage cleared | OS clears app storage or Expo update resets storage | Reverts to device locale detection; if device locale is supported, user gets their language back. If bilingual user had manual override, they must re-set. | User re-selects in Settings. Acceptable tradeoff — low frequency event. |
| Variable marker stripped | LLM removes `{{name}}` from translation | Caught by validation; file not written | Re-run; if persistent, manually fix and commit |
| Rate limit (429) from Claude API | Too many parallel requests | Script retries with backoff (1s, 4s, 16s) | If all retries fail, that language is skipped with clear error output |
| String overflow in UI | Translation >150% of English length | Text may truncate (ellipsis) on constrained elements | Length validation warns at 150%, hard-fails at 200%. Developer shortens translation or adjusts layout. |
| Half-translated app visible to users | Feature flag accidentally enabled before migration complete | Mix of English and translated strings | Feature flag is code-level (not remote config); requires a code change + PR to flip. Difficult to accidentally enable. |
| Human edits overwritten | `pnpm translate --full` overwrites manual fixes in `nb.json` | Previously-correct Norwegian translations regressed | Default is diff-mode (preserves unchanged keys). `--full` requires explicit flag. `--review` mode shows diff before writing. Git history preserves all previous versions. |
| `errorCode` missing on error class | Developer adds new error class without `errorCode` | Falls through to `errors.generic` message | TypeScript: make `errorCode` abstract on base class so subclasses must implement it |

## Testing Strategy

- **Unit:** i18n init resolves correct language from device locale, override takes precedence, fallback to English works
- **Unit:** translate script validates key parity between source and output
- **Unit:** translate script rejects output with missing `{{variable}}` markers
- **Unit:** translate script rejects output exceeding length thresholds
- **Unit:** translate script respects diff-mode (doesn't overwrite unchanged keys)
- **Unit:** `errorCode`-based error mapping resolves correctly (not dependent on class names)
- **Integration:** language picker writes to AsyncStorage and triggers re-render
- **Integration:** conversationLanguage auto-suggest appears only post-onboarding when conditions met, dismissal persists
- **Integration:** CI staleness check fails when `en.json` has keys missing from target files
- **Smoke (per language):** render 5+ representative screens (home, library, session, settings, error state) and verify:
  - No text truncation on Galaxy S10e viewport (360×640 dp)
  - No layout overflow or horizontal scroll
  - All interactive elements remain tappable (translated labels don't push buttons off-screen)
- **Glossary:** spot-check that glossary terms (XP, streak, session) use the locked translation in all languages
