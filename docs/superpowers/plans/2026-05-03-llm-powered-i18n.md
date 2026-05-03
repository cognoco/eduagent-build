# LLM-Powered Internationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full i18n infrastructure with build-time LLM translation to support 7 languages (en, nb, de, es, pt, pl, ja), then migrate all ~80 user-facing screens to externalized strings.

**Architecture:** i18next + react-i18next for runtime string resolution. expo-localization for device locale detection. AsyncStorage for manual language override. Build-time translation via Claude Sonnet API with diff-mode, prompt caching, structural validation (key parity, interpolation preservation, length thresholds), and glossary enforcement (both prompt-side instruction AND post-translation verification). Feature flag gates the language picker until migration is 100% complete — users see English-only during the migration period. The flag is removed in a final cleanup task once stable.

**Out of scope (acknowledged tradeoffs, not silently dropped):**
- **Back-translation / semantic QA.** Earlier drafts of the spec mentioned back-translation sampling with embedding similarity. This is removed from v1: structural validation + glossary enforcement + mandatory human review for `nb`/`de` is the QA bar. Add semantic QA as a v2 task if review surfaces quality drift.
- **Pluralization.** Key naming reserves `_one`/`_other`/`_few`/`_many` suffixes (per i18next convention). No plural-form keys ship in v1. The first feature requiring plurals must add a follow-up task to wire `i18next` count interpolation and update the translation prompt to handle plural families.
- **RTL.** None of the 7 v1 languages are RTL. Adding Arabic/Hebrew later requires a separate layout audit.
- **Date / number / currency formatting.** `Intl.*` integration deferred to v2.

**Tech Stack:** i18next, react-i18next, expo-localization, @anthropic-ai/sdk (devDep for translation script), tsx (script runner, already installed)

**Spec:** `docs/specs/2026-05-03-llm-powered-i18n.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/mobile/src/i18n/index.ts` | i18next initialization, locale detection, AsyncStorage override |
| `apps/mobile/src/i18n/locales/en.json` | English source catalog (all ~700 strings) |
| `apps/mobile/src/i18n/locales/nb.json` | Norwegian — LLM-generated, human-reviewed |
| `apps/mobile/src/i18n/locales/de.json` | German — LLM-generated, partial human review |
| `apps/mobile/src/i18n/locales/es.json` | Spanish — LLM-generated |
| `apps/mobile/src/i18n/locales/pt.json` | Portuguese — LLM-generated |
| `apps/mobile/src/i18n/locales/pl.json` | Polish — LLM-generated |
| `apps/mobile/src/i18n/locales/ja.json` | Japanese — LLM-generated |
| `apps/mobile/src/i18n/index.test.ts` | Tests for locale resolution, override, fallback |
| `apps/mobile/src/i18n/error-keys.ts` | Error code → translation key mapping |
| `apps/mobile/src/i18n/error-keys.test.ts` | Tests for error key mapping |
| `apps/mobile/src/hooks/use-conversation-language-suggest.ts` | Auto-suggest hook |
| `apps/mobile/src/hooks/use-conversation-language-suggest.test.ts` | Tests for auto-suggest |
| `apps/mobile/i18next-parser.config.js` | Extraction config for validation |
| `scripts/translate.ts` | LLM translation pipeline |
| `scripts/translate.test.ts` | Translation script tests (validation, diff-mode, glossary) |
| `scripts/i18n-glossary.json` | Domain term glossary |
| `scripts/check-i18n-staleness.ts` | CI staleness check |
| `scripts/check-i18n-staleness.test.ts` | Tests for staleness check |

### Modified files

| File | Change |
|------|--------|
| `apps/mobile/package.json` | Add i18next, react-i18next, expo-localization deps |
| `apps/mobile/src/lib/feature-flags.ts` | Add `I18N_ENABLED: false` |
| `apps/mobile/src/app/_layout.tsx` | Import i18n init (side-effect import) |
| `packages/schemas/src/errors.ts` | Add `errorCode` readonly property to all error classes |
| `apps/mobile/src/lib/api-errors.ts` | Add `errorCode` readonly property to mobile error classes |
| `apps/mobile/src/lib/format-api-error.ts` | Replace hardcoded English strings with `t()` calls |
| `apps/mobile/src/components/common/ErrorFallback.tsx` | Default title/message via `t()` |
| `apps/mobile/src/components/common/ErrorBoundary.tsx` | Strings via `t()` |
| `apps/mobile/src/app/(app)/more.tsx` | Add language picker row (gated) |
| `package.json` | Add `translate` and `check:i18n` scripts |
| All ~70 screen `.tsx` files | Replace inline strings with `t()` calls |

---

### Task 1: Install Dependencies and Feature Flag

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `package.json` (root — devDep for translation script)
- Modify: `apps/mobile/src/lib/feature-flags.ts`

- [ ] **Step 1: Install mobile i18n dependencies**

```bash
cd apps/mobile && pnpm add i18next react-i18next expo-localization
```

- [ ] **Step 2: Install root devDependency for translation script**

```bash
pnpm add -Dw @anthropic-ai/sdk
```

- [ ] **Step 3: Add feature flag**

In `apps/mobile/src/lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  I18N_ENABLED: false,
} as const;
```

- [ ] **Step 4: Add script entries to root package.json**

Add to the `"scripts"` block in `package.json`:

```json
"translate": "C:/Tools/doppler/doppler.exe run -- tsx scripts/translate.ts",
"check:i18n": "tsx scripts/check-i18n-staleness.ts"
```

- [ ] **Step 5: Verify install succeeded**

```bash
pnpm exec nx lint mobile
```

Expected: PASS (no lint errors from new deps)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json package.json pnpm-lock.yaml apps/mobile/src/lib/feature-flags.ts
git commit -m "chore: install i18n dependencies and add I18N_ENABLED feature flag"
```

---

### Task 2: i18n Initialization Module + Tests

**Files:**
- Create: `apps/mobile/src/i18n/index.ts`
- Create: `apps/mobile/src/i18n/locales/en.json`
- Create: `apps/mobile/src/i18n/index.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/i18n/index.test.ts`:

```typescript
import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';

describe('resolveLanguage', () => {
  it('returns stored language when it is a supported language', () => {
    expect(resolveLanguage('nb', 'en')).toBe('nb');
  });

  it('ignores stored language that is not supported', () => {
    expect(resolveLanguage('ar', 'de')).toBe('de');
  });

  it('returns device language when no stored language and device is supported', () => {
    expect(resolveLanguage(null, 'ja')).toBe('ja');
  });

  it('falls back to en when neither stored nor device language is supported', () => {
    expect(resolveLanguage(null, 'ar')).toBe('en');
    expect(resolveLanguage('zh', 'ko')).toBe('en');
  });

  it('handles empty string stored language as no override', () => {
    expect(resolveLanguage('', 'es')).toBe('es');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('contains exactly the 7 target languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'nb', 'de', 'es', 'pt', 'pl', 'ja']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/i18n/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create the empty en.json**

Create `apps/mobile/src/i18n/locales/en.json`:

```json
{
  "common": {
    "cancel": "Cancel",
    "save": "Save",
    "done": "Done",
    "loading": "Loading...",
    "retry": "Retry",
    "goBack": "Go Back",
    "goHome": "Go Home",
    "tryAgain": "Try Again",
    "signOut": "Sign Out",
    "continue": "Continue",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "next": "Next",
    "back": "Back",
    "search": "Search",
    "noResults": "No results found"
  },
  "errors": {
    "generic": "Something unexpected happened. Please try again.",
    "networkError": "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    "serverError": "Something went wrong on our end. Please try again in a moment.",
    "notFound": "That page or item no longer exists.",
    "resourceGone": "This resource is no longer available.",
    "rateLimited": "You've hit the limit. Wait a moment and try again.",
    "forbidden": "You do not have permission to view this.",
    "quotaExhausted": "You've used all your sessions for today. Come back tomorrow!",
    "sessionNotFound": "That session isn't available anymore. Start a new one.",
    "sessionLimitReached": "Session limit reached. Start a new session to keep going.",
    "badRequest": "That didn't work. Please check your input and try again.",
    "exchangeLimitExceeded": "Session limit reached. Start a new session to keep going.",
    "subjectInactive": "This subject is on pause right now. You can resume it from your subjects list.",
    "notLanguageLearning": "This subject isn't set up for language learning. Try the standard learning path instead.",
    "curriculumNotFound": "We haven't set up your learning path yet. Go back and start the interview first.",
    "topicNotFound": "That topic isn't available right now. Try picking a different one.",
    "draftNotFound": "Your progress was lost. Please start again.",
    "profileNotFound": "We had trouble loading your profile. Please sign out and back in.",
    "alreadyCompleted": "You've already finished this. Head back and pick something new.",
    "validationFailed": "Something didn't look right. Please check what you entered and try again.",
    "timedOut": "That reply took too long. Tap reconnect to try again."
  },
  "errorBoundary": {
    "title": "Something went wrong",
    "message": "An unexpected error occurred. You can try again or go back to the home screen.",
    "sessionCrashTitle": "Session screen crashed"
  }
}
```

- [ ] **Step 4: Create placeholder locale files for each target language**

Create each of `nb.json`, `de.json`, `es.json`, `pt.json`, `pl.json`, `ja.json` in `apps/mobile/src/i18n/locales/` as copies of `en.json`. These will be overwritten by the translation script. For now they ensure the import doesn't fail:

```bash
cd apps/mobile/src/i18n/locales
for lang in nb de es pt pl ja; do cp en.json "$lang.json"; done
```

- [ ] **Step 5: Create the i18n init module**

Create `apps/mobile/src/i18n/index.ts`:

```typescript
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FEATURE_FLAGS } from '../lib/feature-flags';

import en from './locales/en.json';
import nb from './locales/nb.json';
import de from './locales/de.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import pl from './locales/pl.json';
import ja from './locales/ja.json';

export const SUPPORTED_LANGUAGES = ['en', 'nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, { english: string; native: string }> = {
  en: { english: 'English', native: 'English' },
  nb: { english: 'Norwegian Bokmål', native: 'Norsk bokmål' },
  de: { english: 'German', native: 'Deutsch' },
  es: { english: 'Spanish', native: 'Español' },
  pt: { english: 'Portuguese', native: 'Português' },
  pl: { english: 'Polish', native: 'Polski' },
  ja: { english: 'Japanese', native: '日本語' },
};

const LANGUAGE_STORAGE_KEY = 'app-ui-language';

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
}

export async function setStoredLanguage(lang: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export async function clearStoredLanguage(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
}

function getDeviceLanguage(): string {
  const locales = Localization.getLocales();
  const tag = locales[0]?.languageTag ?? 'en';
  return tag.split('-')[0];
}

export function resolveLanguage(stored: string | null, deviceLang: string): SupportedLanguage {
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(deviceLang)) {
    return deviceLang as SupportedLanguage;
  }
  return 'en';
}

// Resolve the language BEFORE init so the first render is in the correct
// language. Initializing with `lng: 'en'` and then async-switching produces
// a flash-of-English for non-English users (jarring on cold start).
const initPromise = (async () => {
  let resolved: SupportedLanguage = 'en';
  if (FEATURE_FLAGS.I18N_ENABLED) {
    try {
      const stored = await getStoredLanguage();
      const deviceLang = getDeviceLanguage();
      resolved = resolveLanguage(stored, deviceLang);
    } catch {
      // AsyncStorage failure → fall through to 'en'. Logged at higher level
      // if needed; never block app boot on i18n.
      resolved = 'en';
    }
  }
  await i18next.use(initReactI18next).init({
    lng: resolved,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      nb: { translation: nb },
      de: { translation: de },
      es: { translation: es },
      pt: { translation: pt },
      pl: { translation: pl },
      ja: { translation: ja },
    },
    interpolation: { escapeValue: false },
  });
})();

/**
 * Awaitable handle to the in-flight i18n init. The app root MUST await this
 * before rendering any tree that uses `useTranslation()` — otherwise
 * non-English users see a flash of English on cold start.
 */
export function ensureI18nReady(): Promise<void> {
  return initPromise;
}

export default i18next;
```

Note on bundle size: importing all 7 locale JSON files eagerly is the standard
i18next-RN pattern. With ~700 keys × 7 languages, bundled size is well under
1 MB for v1. If bundle growth becomes a concern as the catalog scales, switch
to `i18next-resources-to-backend` with dynamic `import()` per locale — out of
scope here.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/i18n/index.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/i18n/
git commit -m "feat(mobile): add i18n initialization module with locale resolution"
```

---

### Task 3: Wire i18n Into the App Root

**Files:**
- Modify: `apps/mobile/src/app/_layout.tsx`

- [ ] **Step 1: Add the i18n import**

At the top of `apps/mobile/src/app/_layout.tsx`, after the `import '../../global.css';` line (line 1), add:

```typescript
import { ensureI18nReady } from '../i18n';
```

No `I18nextProvider` wrapper is needed — `react-i18next` uses a singleton pattern when initialized via `i18next.use(initReactI18next).init(...)`. The `useTranslation()` hook reads from the global i18next instance.

- [ ] **Step 2: Gate render on init readiness**

Why awaited init: i18next initialization reads AsyncStorage to detect the user's language preference. Initializing synchronously with `lng: 'en'` and async-switching afterward produces a visible flash of English text on the first render for non-English users. Awaiting init eliminates the flash at the cost of a few ms on cold start (negligible — the read is local).

**Decision tree (do exactly one of these — pick based on what the layout already does):**

**(a) If `_layout.tsx` already calls `SplashScreen.preventAutoHideAsync()` and hides the splash via `SplashScreen.hideAsync()` after some readiness check:** add `await ensureI18nReady()` to that existing readiness path *before* the existing `hideAsync()` call. Do NOT add a second gate. The native splash stays visible until i18n is ready, no separate render gate is needed.

**(b) If the layout has its own `isReady` / loading state already (e.g., for fonts, auth bootstrap):** add `ensureI18nReady()` to the same `Promise.all(...)` (or sequential await) that flips that state. Do NOT add a parallel state.

**(c) If neither pattern exists** (fresh layout with no readiness gate at all): add a minimal local gate. Inside the root layout component:

```typescript
const [i18nReady, setI18nReady] = useState(false);

useEffect(() => {
  let cancelled = false;
  ensureI18nReady().then(() => {
    if (!cancelled) setI18nReady(true);
  });
  return () => { cancelled = true; };
}, []);

if (!i18nReady) return null;
```

Render `null` (not a custom loading view) so the native Expo splash stays visible until React mounts the real tree. Document the choice in a one-line comment at the top of the gate so future contributors know which pattern (a/b/c) was used.

**Verification before moving on:** confirm via the discovery grep `rg -n 'SplashScreen|preventAutoHideAsync|isReady' apps/mobile/src/app/_layout.tsx` which pattern actually exists. Do not assume.

- [ ] **Step 3: Set per-platform accessibility language on language change**

When `i18next.language` changes, screen readers (TalkBack, VoiceOver) need to know — otherwise Japanese text is read aloud by an English speech engine and is unintelligible. React Native exposes `accessibilityLanguage` per `Text` component (no global setting). For v1, add a single line in the i18n init module that subscribes to language changes and logs them; full per-component `accessibilityLanguage` propagation is deferred to a follow-up task. Document this as a known limitation:

In `apps/mobile/src/i18n/index.ts`, append:

```typescript
i18next.on('languageChanged', (lang) => {
  // Per-component accessibilityLanguage propagation deferred. Track:
  // GitHub issue / TODO for full screen-reader locale wiring.
  if (__DEV__) console.log(`[i18n] languageChanged → ${lang}`);
});
```

- [ ] **Step 4: Verify the app still builds**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Run existing layout tests**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/app/_layout.test.tsx
```

Expected: PASS — if any test mounts the layout and asserts on rendered content, it may need to await `ensureI18nReady()` or the `i18nReady` state flip. If a test fails because the gate renders `null`, update the test to await readiness; do NOT remove the gate.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/_layout.tsx
git commit -m "feat(mobile): wire i18n init into app root layout"
```

---

### Task 4: Standardize `errorCode` on All Error Classes

**Files:**
- Modify: `packages/schemas/src/errors.ts`
- Modify: `apps/mobile/src/lib/api-errors.ts`
- Create: `apps/mobile/src/i18n/error-keys.ts`
- Create: `apps/mobile/src/i18n/error-keys.test.ts`

The spec requires a stable string property on all error classes that survives Hermes minification (class names get mangled in production). The codebase already has a `code` field on some classes — but its semantics are inconsistent: `ForbiddenError.code` is a `'FORBIDDEN' as const` string literal, `RateLimitedError.code` is `string | undefined`, `UpstreamError.code` is a free-form `string`, and `NetworkError` / `BadRequestError` / `ConflictError` / `NotFoundError` have no `code` at all.

We add a *new* `errorCode` property — distinct from `code` — with two strict guarantees:

1. **Always present.** Every error class declares it as `readonly errorCode = '...' as const`.
2. **Always a stable string literal.** Never `undefined`, never variable. Safe to switch on.

`code` is left untouched (it serves the existing API-wire-format contract). The i18n layer uses *only* `errorCode`. Future consolidation (deprecate `code`, fold into `errorCode`) is a follow-up refactor — out of scope here to keep this plan focused.

- [ ] **Step 1: Write the error-keys test**

Create `apps/mobile/src/i18n/error-keys.test.ts`:

```typescript
import { getLocalizedErrorKey } from './error-keys';

describe('getLocalizedErrorKey', () => {
  it('maps QUOTA_EXCEEDED to errors.quotaExhausted', () => {
    expect(getLocalizedErrorKey('QUOTA_EXCEEDED')).toBe('errors.quotaExhausted');
  });

  it('maps NETWORK_ERROR to errors.networkError', () => {
    expect(getLocalizedErrorKey('NETWORK_ERROR')).toBe('errors.networkError');
  });

  it('maps NOT_FOUND to errors.notFound', () => {
    expect(getLocalizedErrorKey('NOT_FOUND')).toBe('errors.notFound');
  });

  it('maps FORBIDDEN to errors.forbidden', () => {
    expect(getLocalizedErrorKey('FORBIDDEN')).toBe('errors.forbidden');
  });

  it('maps RESOURCE_GONE to errors.resourceGone', () => {
    expect(getLocalizedErrorKey('RESOURCE_GONE')).toBe('errors.resourceGone');
  });

  it('maps RATE_LIMITED to errors.rateLimited', () => {
    expect(getLocalizedErrorKey('RATE_LIMITED')).toBe('errors.rateLimited');
  });

  it('maps UPSTREAM_ERROR to errors.serverError', () => {
    expect(getLocalizedErrorKey('UPSTREAM_ERROR')).toBe('errors.serverError');
  });

  it('maps BAD_REQUEST to errors.badRequest', () => {
    expect(getLocalizedErrorKey('BAD_REQUEST')).toBe('errors.badRequest');
  });

  it('returns errors.generic for unknown codes', () => {
    expect(getLocalizedErrorKey('SOME_UNKNOWN_CODE')).toBe('errors.generic');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/i18n/error-keys.test.ts
```

Expected: FAIL — `Cannot find module './error-keys'`

- [ ] **Step 3: Add `errorCode` to schema error classes**

In `packages/schemas/src/errors.ts`, add a `readonly errorCode` property to every error class. The existing `code` properties on `ForbiddenError` and `RateLimitedError` stay (they serve different purposes — `code` is the API wire format, `errorCode` is the stable i18n key).

Apply these changes:

`NotFoundError` — add `readonly errorCode = 'NOT_FOUND' as const;` in the constructor body after `this.name = 'NotFoundError'`.

`ForbiddenError` — add `readonly errorCode = 'FORBIDDEN' as const;` after `this.name`.

`ConflictError` — add `readonly errorCode = 'CONFLICT' as const;`.

`RateLimitedError` — add `readonly errorCode = 'RATE_LIMITED' as const;`.

`UpstreamLlmError` — add `readonly errorCode = 'UPSTREAM_LLM_ERROR' as const;`.

`BadRequestError` — add `readonly errorCode = 'BAD_REQUEST' as const;`.

`LlmStreamError` — add `readonly errorCode = 'LLM_STREAM_ERROR' as const;`.

`LlmEnvelopeError` — add `readonly errorCode = 'LLM_ENVELOPE_ERROR' as const;`.

The domain-specific errors (`VocabularyContextError`, `SubjectNotFoundError`, `VocabularyNotFoundError`, `TopicNotSkippedError`, `PersistCurriculumError`) don't need `errorCode` — they're API-internal and never surface to the mobile client.

- [ ] **Step 4: Add `errorCode` to mobile error classes**

In `apps/mobile/src/lib/api-errors.ts`:

`QuotaExceededError` already has `readonly code = 'QUOTA_EXCEEDED'`. Add `readonly errorCode = 'QUOTA_EXCEEDED' as const;` on the line after `this.name`.

`ResourceGoneError` — add `readonly errorCode = 'RESOURCE_GONE' as const;` after `this.name`.

`NetworkError` — add `readonly errorCode = 'NETWORK_ERROR' as const;` after `this.name`.

`UpstreamError` — add `readonly errorCode = 'UPSTREAM_ERROR' as const;` after `this.name`.

- [ ] **Step 5: Create the error-keys module**

Create `apps/mobile/src/i18n/error-keys.ts`:

```typescript
const ERROR_KEY_MAP: Record<string, string> = {
  QUOTA_EXCEEDED: 'errors.quotaExhausted',
  NETWORK_ERROR: 'errors.networkError',
  NOT_FOUND: 'errors.notFound',
  FORBIDDEN: 'errors.forbidden',
  RESOURCE_GONE: 'errors.resourceGone',
  RATE_LIMITED: 'errors.rateLimited',
  UPSTREAM_ERROR: 'errors.serverError',
  UPSTREAM_LLM_ERROR: 'errors.serverError',
  BAD_REQUEST: 'errors.badRequest',
  CONFLICT: 'errors.generic',
  LLM_STREAM_ERROR: 'errors.serverError',
  LLM_ENVELOPE_ERROR: 'errors.serverError',
};

export function getLocalizedErrorKey(errorCode: string): string {
  return ERROR_KEY_MAP[errorCode] ?? 'errors.generic';
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/i18n/error-keys.test.ts
```

Expected: PASS

- [ ] **Step 7: Typecheck both packages**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run api:typecheck
```

Expected: PASS

- [ ] **Step 8: Run related tests to check for regressions**

```bash
cd apps/mobile && pnpm exec jest --no-coverage --findRelatedTests src/lib/api-errors.ts src/lib/format-api-error.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/schemas/src/errors.ts apps/mobile/src/lib/api-errors.ts apps/mobile/src/i18n/error-keys.ts apps/mobile/src/i18n/error-keys.test.ts
git commit -m "feat: add stable errorCode property to all error classes for i18n mapping"
```

---

### Task 5: Externalize Error and Recovery Strings

**Files:**
- Modify: `apps/mobile/src/lib/format-api-error.ts`
- Modify: `apps/mobile/src/components/common/ErrorFallback.tsx`
- Modify: `apps/mobile/src/components/common/ErrorBoundary.tsx`
- Modify: `apps/mobile/src/i18n/locales/en.json`

This task replaces all hardcoded English strings in the error formatting layer and error display components with `t()` calls. These are non-React utility functions, so they use `i18next.t()` directly (not the `useTranslation` hook).

> **Known fragility — flagged, not fixed here.** `FRIENDLY_MESSAGE_MAP` matches regex patterns against the **raw English text of the API response body** (`/curriculum.*not.*found/i` etc.). This means: (a) any backend wording change silently breaks the friendly-message lookup, and (b) the regex-on-English approach is incompatible with the `errorCode`-based mapping introduced in Task 4. The right long-term shape is errorCode-only — all friendly variants keyed off the stable code, no regex on English bodies. That refactor is *out of scope* for this plan to keep the i18n migration mechanical. We preserve the existing regex map and externalize the messages it produces. A follow-up task should retire the regex map by emitting structured `friendlyReason` codes from the API layer.

- [ ] **Step 1: Add recovery action keys to en.json**

Add to `apps/mobile/src/i18n/locales/en.json` under a new `"recovery"` namespace:

```json
{
  "recovery": {
    "tryAgain": "Try Again",
    "goBack": "Go Back",
    "goHome": "Go Home",
    "signOut": "Sign Out"
  }
}
```

Also add `"friendlyErrors"` namespace for the `FRIENDLY_MESSAGE_MAP` entries:

```json
{
  "friendlyErrors": {
    "notLanguageLearning": "This subject isn't set up for language learning. Try the standard learning path instead.",
    "subjectPaused": "This subject is on pause right now. You can resume it from your subjects list.",
    "curriculumNotFound": "We haven't set up your learning path yet. Go back and start the interview first.",
    "topicNotFound": "That topic isn't available right now. Try picking a different one.",
    "draftNotFound": "Your progress was lost. Please start again.",
    "profileNotFound": "We had trouble loading your profile. Please sign out and back in.",
    "sessionNotFound": "That session isn't available anymore. Start a new one.",
    "alreadyCompleted": "You've already finished this. Head back and pick something new.",
    "validationFailed": "Something didn't look right. Please check what you entered and try again."
  }
}
```

- [ ] **Step 2: Replace hardcoded strings in format-api-error.ts**

In `apps/mobile/src/lib/format-api-error.ts`:

Add import at the top:

```typescript
import i18next from '../i18n';
```

Replace the constant declarations (lines 77-83):

```typescript
const NETWORK_MESSAGE = () => i18next.t('errors.networkError');
const SERVER_MESSAGE = () => i18next.t('errors.serverError');
const DEFAULT_MESSAGE = () => i18next.t('errors.generic');
```

These become functions (thunks) so they resolve at call time, not module-load time (when i18next may not have loaded the correct language yet).

Update every reference from `NETWORK_MESSAGE` to `NETWORK_MESSAGE()`, `SERVER_MESSAGE` to `SERVER_MESSAGE()`, `DEFAULT_MESSAGE` to `DEFAULT_MESSAGE()`.

Replace the `FRIENDLY_MESSAGE_MAP` entries — change each `message:` string to use `i18next.t('friendlyErrors.xxx')`:

```typescript
const FRIENDLY_MESSAGE_MAP: Array<{
  pattern: RegExp;
  key: string;
}> = [
  { pattern: /not configured for language learning/i, key: 'friendlyErrors.notLanguageLearning' },
  { pattern: /subject.*(paused|archived|inactive)/i, key: 'friendlyErrors.subjectPaused' },
  { pattern: /curriculum.*not.*found/i, key: 'friendlyErrors.curriculumNotFound' },
  { pattern: /topic.*not.*found/i, key: 'friendlyErrors.topicNotFound' },
  { pattern: /draft.*not.*found/i, key: 'friendlyErrors.draftNotFound' },
  { pattern: /profile.*not.*found/i, key: 'friendlyErrors.profileNotFound' },
  { pattern: /session.*not.*found/i, key: 'friendlyErrors.sessionNotFound' },
  { pattern: /already.*completed/i, key: 'friendlyErrors.alreadyCompleted' },
  { pattern: /validation.*failed|invalid.*input|expected.*string/i, key: 'friendlyErrors.validationFailed' },
];
```

Update `friendlyMessage()` (line 167-174):

```typescript
function friendlyMessage(raw: string): string | null {
  for (const entry of FRIENDLY_MESSAGE_MAP) {
    if (entry.pattern.test(raw)) {
      return i18next.t(entry.key);
    }
  }
  return null;
}
```

Replace hardcoded strings in `recoveryActions()` labels (lines 260-301):

```typescript
const goHome = handlers.goHome
  ? { label: i18next.t('recovery.goHome'), onPress: handlers.goHome, testID: 'recovery-go-home' }
  : undefined;
```

And for each case:
- `'retry'` → label: `i18next.t('recovery.tryAgain')`
- `'go-back'` → label: `i18next.t('recovery.goBack')`
- `'sign-out'` → label: `i18next.t('recovery.signOut')`

Replace remaining inline English strings in `classifyApiError()`:
- `'That page or item no longer exists.'` → `i18next.t('errors.notFound')`
- `'This resource is no longer available.'` → `i18next.t('errors.resourceGone')`
- `"You've hit the limit. Wait a moment and try again."` → `i18next.t('errors.rateLimited')`
- `'You do not have permission to view this.'` → `i18next.t('errors.forbidden')`
- `'Session limit reached. Start a new session to keep going.'` → `i18next.t('errors.sessionLimitReached')`
- `'Something went wrong on our end. Please try again.'` → `i18next.t('errors.serverError')`
- `"That didn't work. Please check your input and try again."` → `i18next.t('errors.badRequest')`
- `"That reply took too long. Tap reconnect to try again."` → `i18next.t('errors.timedOut')`
- `'This subject is paused or archived...'` → `i18next.t('friendlyErrors.subjectPaused')`

- [ ] **Step 3: Update ErrorFallback defaults**

In `apps/mobile/src/components/common/ErrorFallback.tsx`, add:

```typescript
import { useTranslation } from 'react-i18next';
```

Inside the component, before the return:

```typescript
const { t } = useTranslation();
```

Change the default prop values in the destructuring:

```typescript
export function ErrorFallback({
  title,
  message,
  ...rest
}: ErrorFallbackProps): React.ReactElement {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('errorBoundary.title');
  const resolvedMessage = message ?? t('errors.generic');
```

Then use `resolvedTitle` and `resolvedMessage` in the JSX instead of `title` and `message`.

- [ ] **Step 4: Update ErrorBoundary strings**

In `apps/mobile/src/components/common/ErrorBoundary.tsx`, update `ErrorFallbackView`:

```typescript
import { useTranslation } from 'react-i18next';
```

Inside `ErrorFallbackView`:

```typescript
const { t } = useTranslation();
const router = useRouter();
return (
  <ErrorFallback
    variant="centered"
    title={t('errorBoundary.title')}
    message={t('errorBoundary.message')}
    primaryAction={{
      label: t('recovery.tryAgain'),
      onPress: onRetry,
      testID: 'error-boundary-retry',
    }}
    secondaryAction={{
      label: t('recovery.goHome'),
      onPress: () => { onGoHome(); router.replace('/(app)/home' as never); },
      testID: 'error-boundary-go-home',
    }}
    testID="error-boundary-fallback"
  />
);
```

- [ ] **Step 5: Run all related tests**

```bash
cd apps/mobile && pnpm exec jest --no-coverage --findRelatedTests src/lib/format-api-error.ts src/components/common/ErrorFallback.tsx src/components/common/ErrorBoundary.tsx
```

Expected: PASS — the English strings in en.json are identical to the previous hardcoded values, so test assertions against English output should still pass.

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/format-api-error.ts apps/mobile/src/components/common/ErrorFallback.tsx apps/mobile/src/components/common/ErrorBoundary.tsx apps/mobile/src/i18n/locales/en.json
git commit -m "feat(mobile): externalize error and recovery strings to i18n"
```

---

### Task 6: Translation Glossary + Translation Script

**Files:**
- Create: `scripts/i18n-glossary.json`
- Create: `scripts/translate.ts`
- Create: `scripts/translate.test.ts`

- [ ] **Step 1: Create the glossary**

Create `scripts/i18n-glossary.json`:

```json
{
  "_meta": {
    "description": "Locked translations for domain-specific terms. The LLM translation prompt includes these as constraints.",
    "format": "term → { langCode: translation }"
  },
  "XP": {
    "nb": "XP",
    "de": "XP",
    "es": "XP",
    "pt": "XP",
    "pl": "XP",
    "ja": "XP"
  },
  "streak": {
    "nb": "streak",
    "de": "Streak",
    "es": "racha",
    "pt": "sequência",
    "pl": "seria",
    "ja": "ストリーク"
  },
  "session": {
    "nb": "økt",
    "de": "Sitzung",
    "es": "sesión",
    "pt": "sessão",
    "pl": "sesja",
    "ja": "セッション"
  },
  "tutor": {
    "nb": "veileder",
    "de": "Tutor",
    "es": "tutor",
    "pt": "tutor",
    "pl": "tutor",
    "ja": "チューター"
  },
  "quiz": {
    "nb": "quiz",
    "de": "Quiz",
    "es": "quiz",
    "pt": "quiz",
    "pl": "quiz",
    "ja": "クイズ"
  },
  "dictation": {
    "nb": "diktat",
    "de": "Diktat",
    "es": "dictado",
    "pt": "ditado",
    "pl": "dyktando",
    "ja": "ディクテーション"
  },
  "library": {
    "nb": "bibliotek",
    "de": "Bibliothek",
    "es": "biblioteca",
    "pt": "biblioteca",
    "pl": "biblioteka",
    "ja": "ライブラリ"
  }
}
```

- [ ] **Step 2: Write the translation script tests**

Create `scripts/translate.test.ts`:

```typescript
import {
  validateTranslation,
  computeChangedKeys,
  type ValidationResult,
} from './translate';

describe('validateTranslation', () => {
  const source = {
    common: { save: 'Save', cancel: 'Cancel' },
    errors: { generic: 'Something went wrong. {{action}} to retry.' },
  };

  it('accepts valid translation with same keys and preserved variables', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
      errors: { generic: 'Etwas ist schiefgelaufen. {{action}} um erneut zu versuchen.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects translation with missing keys', () => {
    const translated = {
      common: { save: 'Speichern' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing_key', key: 'common.cancel' })
    );
  });

  it('rejects translation with extra keys', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen', extra: 'Bonus' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'extra_key', key: 'common.extra' })
    );
  });

  it('rejects translation with missing interpolation variable', () => {
    const translated = {
      common: { save: 'Speichern', cancel: 'Abbrechen' },
      errors: { generic: 'Etwas ist schiefgelaufen.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing_variable', key: 'errors.generic', variable: '{{action}}' })
    );
  });

  it('warns when translation exceeds 150% of source length', () => {
    const translated = {
      common: { save: 'S'.repeat(100), cancel: 'Abbrechen' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'length_warning', key: 'common.save' })
    );
  });

  it('flags glossary violation when translated string omits the locked term', () => {
    const glossarySource = { home: { streak: 'Your streak is on!' } };
    const glossaryTranslated = { home: { streak: '¡Tu serie está activa!' } };
    const glossary = { streak: { es: 'racha' } };
    const result = validateTranslation(glossarySource, glossaryTranslated, 'es', glossary);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'glossary_violation', key: 'home.streak' })
    );
  });

  it('passes when translated string contains the glossary-locked term', () => {
    const glossarySource = { home: { streak: 'Your streak is on!' } };
    const glossaryTranslated = { home: { streak: '¡Tu racha está activa!' } };
    const glossary = { streak: { es: 'racha' } };
    const result = validateTranslation(glossarySource, glossaryTranslated, 'es', glossary);
    expect(result.valid).toBe(true);
  });

  it('hard-fails when translation exceeds 200% of source length', () => {
    const translated = {
      common: { save: 'S'.repeat(200), cancel: 'Abbrechen' },
      errors: { generic: 'Fehler. {{action}}.' },
    };
    const result = validateTranslation(source, translated, 'de');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'length_exceeded', key: 'common.save' })
    );
  });
});

describe('computeChangedKeys', () => {
  it('returns all keys when previous is null', () => {
    const current = { common: { save: 'Save', cancel: 'Cancel' } };
    expect(computeChangedKeys(current, null)).toEqual(['common.save', 'common.cancel']);
  });

  it('returns only changed and added keys', () => {
    const previous = { common: { save: 'Save', cancel: 'Cancel' } };
    const current = { common: { save: 'Save', cancel: 'Abort', done: 'Done' } };
    const changed = computeChangedKeys(current, previous);
    expect(changed).toContain('common.cancel');
    expect(changed).toContain('common.done');
    expect(changed).not.toContain('common.save');
  });

  it('returns removed keys', () => {
    const previous = { common: { save: 'Save', cancel: 'Cancel', old: 'Old' } };
    const current = { common: { save: 'Save', cancel: 'Cancel' } };
    const changed = computeChangedKeys(current, previous);
    expect(changed).toContain('common.old');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm exec jest --config apps/api/jest.config.cjs --no-coverage scripts/translate.test.ts 2>/dev/null || npx tsx --test scripts/translate.test.ts 2>/dev/null || echo "Expected failure — module not yet created"
```

Note: This test file lives in `scripts/`, which may not be in the mobile jest config's `roots`. Decide the runner: either add `scripts/` to a jest config, or use Node's built-in test runner (`node --test`), or a dedicated jest config for scripts. The simplest approach: add a `scripts/jest.config.cjs` that extends the root.

Create `scripts/jest.config.cjs`:

```javascript
/** @type {import('jest').Config} */
module.exports = {
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: false }] },
  testMatch: ['<rootDir>/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
```

Then run:

```bash
pnpm exec jest --config scripts/jest.config.cjs --no-coverage scripts/translate.test.ts
```

Expected: FAIL — `Cannot find module './translate'`

- [ ] **Step 4: Create the translation script**

Create `scripts/translate.ts`. This is a large file — here is the full implementation:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationError {
  type:
    | 'missing_key'
    | 'extra_key'
    | 'missing_variable'
    | 'length_exceeded'
    | 'glossary_violation';
  key: string;
  variable?: string;
  detail?: string;
}

interface ValidationWarning {
  type: 'length_warning';
  key: string;
  detail: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

type NestedStrings = { [k: string]: string | NestedStrings };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');
const GLOSSARY_PATH = path.resolve(__dirname, 'i18n-glossary.json');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');
const MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000];
const LENGTH_WARN_RATIO = 1.5;
const LENGTH_FAIL_RATIO = 2.0;

// Model ID is env-overridable so the script doesn't break silently when a
// model is retired/superseded. Default tracks the current Sonnet snapshot;
// CI/devs can pin a different version via TRANSLATE_MODEL=claude-...-YYYYMMDD.
const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL ?? 'claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenKeys(obj: NestedStrings, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

function unflattenKeys(flat: Record<string, string>): NestedStrings {
  const result: NestedStrings = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: NestedStrings = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] === 'string') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as NestedStrings;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

function extractVariables(str: string): string[] {
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return matches ?? [];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeChangedKeys(
  current: NestedStrings,
  previous: NestedStrings | null
): string[] {
  const currentFlat = flattenKeys(current);
  if (!previous) return Object.keys(currentFlat);

  const previousFlat = flattenKeys(previous);
  const changed: string[] = [];

  for (const key of Object.keys(currentFlat)) {
    if (!(key in previousFlat) || currentFlat[key] !== previousFlat[key]) {
      changed.push(key);
    }
  }
  for (const key of Object.keys(previousFlat)) {
    if (!(key in currentFlat)) {
      changed.push(key);
    }
  }

  return changed;
}

export function validateTranslation(
  source: NestedStrings,
  translated: NestedStrings,
  lang: string,
  glossary?: Record<string, Record<string, string>>
): ValidationResult {
  const sourceFlat = flattenKeys(source);
  const translatedFlat = flattenKeys(translated);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Glossary post-validation: when an English source string contains a glossary
  // term as a whole word, the translated string MUST contain the glossary's
  // locked translation for that language. Catches LLM drift even when the
  // term was injected into the system prompt. Case-insensitive match on source,
  // exact match on target — glossary entries define the canonical form.
  const glossaryEntries =
    glossary
      ? Object.entries(glossary).filter(
          ([term, translations]) => term !== '_meta' && lang in translations
        )
      : [];

  for (const [term, translations] of glossaryEntries) {
    const expected = translations[lang];
    const expectedLower = expected.toLowerCase();
    const sourceWordRe = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    for (const key of Object.keys(sourceFlat)) {
      if (!sourceWordRe.test(sourceFlat[key])) continue;
      if (!(key in translatedFlat)) continue;
      // Case-insensitive containment: handles sentence-initial capitalization
      // (e.g. glossary "racha" vs. translation "Racha está activa"). Inflected
      // forms still pass via substring (e.g. "økten" contains "økt"). Word-
      // boundary matching is intentionally NOT used on the target — Japanese
      // and other non-space-delimited scripts have no reliable \b semantics.
      if (!translatedFlat[key].toLowerCase().includes(expectedLower)) {
        errors.push({
          type: 'glossary_violation',
          key,
          detail: `source contains "${term}" but translation is missing locked term "${expected}"`,
        });
      }
    }
  }

  for (const key of Object.keys(sourceFlat)) {
    if (!(key in translatedFlat)) {
      errors.push({ type: 'missing_key', key });
      continue;
    }

    const sourceVars = extractVariables(sourceFlat[key]);
    const translatedVars = extractVariables(translatedFlat[key]);
    for (const v of sourceVars) {
      if (!translatedVars.includes(v)) {
        errors.push({ type: 'missing_variable', key, variable: v });
      }
    }

    const sourceLen = sourceFlat[key].length;
    const translatedLen = translatedFlat[key].length;
    if (sourceLen > 0) {
      const ratio = translatedLen / sourceLen;
      if (ratio > LENGTH_FAIL_RATIO) {
        errors.push({
          type: 'length_exceeded',
          key,
          detail: `${translatedLen} chars is ${Math.round(ratio * 100)}% of source (${sourceLen}). Max: ${LENGTH_FAIL_RATIO * 100}%`,
        });
      } else if (ratio > LENGTH_WARN_RATIO) {
        warnings.push({
          type: 'length_warning',
          key,
          detail: `${translatedLen} chars is ${Math.round(ratio * 100)}% of source (${sourceLen})`,
        });
      }
    }
  }

  for (const key of Object.keys(translatedFlat)) {
    if (!(key in sourceFlat)) {
      errors.push({ type: 'extra_key', key });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// LLM Translation
// ---------------------------------------------------------------------------

function buildSystemPrompt(lang: string, glossary: Record<string, Record<string, string>>): string {
  const glossaryEntries = Object.entries(glossary)
    .filter(([_, translations]) => lang in translations)
    .map(([term, translations]) => `- "${term}" → "${translations[lang]}"`)
    .join('\n');

  return `You are a professional translator for a mobile educational app for ages 11+.

RULES:
- Translate JSON values only, never modify keys
- Preserve all {{interpolation}} markers exactly as they appear
- Keep translations concise — mobile UI has limited space. Aim for ≤130% of the English character length
- Use age-appropriate language (11+ audience)
- Return ONLY valid JSON — no markdown fences, no commentary
- Maintain the exact JSON structure (nested objects with same keys)

GLOSSARY — use these translations for domain-specific terms:
${glossaryEntries || '(no glossary entries for this language)'}

Target language: ${lang}`;
}

async function translateWithRetry(
  client: Anthropic,
  systemPrompt: string,
  sourceJson: string,
  lang: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: TRANSLATE_MODEL,
        max_tokens: 8192,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: `Translate the following English JSON to ${lang}. Return only the translated JSON:\n\n${sourceJson}`,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      JSON.parse(text);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.warn(`[${lang}] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw new Error(`[${lang}] All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  lang?: string;
  full?: boolean;
  dryRun?: boolean;
  review?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      opts.lang = args[++i];
    } else if (args[i] === '--full') {
      opts.full = true;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--review') {
      opts.review = true;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const languages = opts.lang
    ? [opts.lang].filter((l) => (TARGET_LANGUAGES as readonly string[]).includes(l))
    : [...TARGET_LANGUAGES];

  if (languages.length === 0) {
    console.error(`Unknown language: ${opts.lang}. Supported: ${TARGET_LANGUAGES.join(', ')}`);
    process.exit(1);
  }

  const source: NestedStrings = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8'));
  delete glossary._meta;

  const client = new Anthropic();
  const failed: string[] = [];
  const succeeded: string[] = [];

  // Proper async limiter: queue-based, no polling. When a slot frees up the
  // next waiter is resolved directly, so there's no 50ms polling jitter.
  function createLimiter(maxConcurrency: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const acquire = (): Promise<void> =>
      new Promise((resolve) => {
        const tryRun = () => {
          if (active < maxConcurrency) {
            active++;
            resolve();
          } else {
            queue.push(tryRun);
          }
        };
        tryRun();
      });
    const release = () => {
      active--;
      const next = queue.shift();
      if (next) next();
    };
    return { acquire, release };
  }
  const limiter = createLimiter(MAX_CONCURRENCY);

  const tasks = languages.map(async (lang) => {
    await limiter.acquire();
    try {
      const targetPath = path.join(LOCALES_DIR, `${lang}.json`);
      const previousExists = fs.existsSync(targetPath);
      const previous: NestedStrings | null = previousExists
        ? JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
        : null;

      let toTranslate: NestedStrings;
      let previousFlat: Record<string, string> | null = null;

      if (opts.full || !previous) {
        toTranslate = source;
        console.log(`[${lang}] Full translation (${Object.keys(flattenKeys(source)).length} keys)`);
      } else {
        const changedKeys = computeChangedKeys(source, previous);
        if (changedKeys.length === 0) {
          console.log(`[${lang}] No changes detected, skipping`);
          succeeded.push(lang);
          return;
        }
        const sourceFlat = flattenKeys(source);
        const changedFlat: Record<string, string> = {};
        for (const key of changedKeys) {
          if (key in sourceFlat) {
            changedFlat[key] = sourceFlat[key];
          }
        }
        toTranslate = unflattenKeys(changedFlat);
        previousFlat = flattenKeys(previous);
        console.log(`[${lang}] Diff-mode: ${changedKeys.length} changed keys`);
      }

      const systemPrompt = buildSystemPrompt(lang, glossary);
      const sourceJson = JSON.stringify(toTranslate, null, 2);

      if (opts.dryRun) {
        console.log(`[${lang}] Dry run — would translate ${Object.keys(flattenKeys(toTranslate)).length} keys`);
        succeeded.push(lang);
        return;
      }

      const translatedJson = await translateWithRetry(client, systemPrompt, sourceJson, lang);
      let translated: NestedStrings = JSON.parse(translatedJson);

      if (previousFlat) {
        const translatedFlat = flattenKeys(translated);
        const merged = { ...previousFlat };
        for (const [key, value] of Object.entries(translatedFlat)) {
          merged[key] = value;
        }
        const sourceFlat = flattenKeys(source);
        for (const key of Object.keys(merged)) {
          if (!(key in sourceFlat)) {
            delete merged[key];
          }
        }
        translated = unflattenKeys(merged);
      }

      const validation = validateTranslation(source, translated, lang, glossary);

      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) {
          console.warn(`[${lang}] WARNING: ${w.key} — ${w.detail}`);
        }
      }

      if (!validation.valid) {
        console.error(`[${lang}] Validation FAILED:`);
        for (const e of validation.errors) {
          console.error(`  ${e.type}: ${e.key}${e.variable ? ` (${e.variable})` : ''}${e.detail ? ` — ${e.detail}` : ''}`);
        }
        console.error(`[${lang}] Skipping — previous file preserved`);
        failed.push(lang);
        return;
      }

      if (opts.review) {
        console.log(`\n=== ${lang} Review ===`);
        const prevFlat = previous ? flattenKeys(previous) : {};
        const newFlat = flattenKeys(translated);
        for (const key of Object.keys(newFlat)) {
          if (prevFlat[key] !== newFlat[key]) {
            console.log(`  ${key}:`);
            if (prevFlat[key]) console.log(`    - ${prevFlat[key]}`);
            console.log(`    + ${newFlat[key]}`);
          }
        }
      }

      fs.writeFileSync(targetPath, JSON.stringify(translated, null, 2) + '\n', 'utf-8');
      console.log(`[${lang}] ✓ Written to ${targetPath}`);
      succeeded.push(lang);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${lang}] FAILED: ${msg}`);
      failed.push(lang);
    } finally {
      limiter.release();
    }
  });

  await Promise.all(tasks);

  console.log(`\nResults: ${succeeded.length} succeeded, ${failed.length} failed`);
  if (failed.length > 0) {
    console.error(`Failed languages: ${failed.join(', ')}`);
    process.exit(1);
  }
}

// Only run main when executed directly (not imported in tests)
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm exec jest --config scripts/jest.config.cjs --no-coverage scripts/translate.test.ts
```

Expected: PASS

- [ ] **Step 6: Run a dry-run to verify the script loads**

```bash
C:/Tools/doppler/doppler.exe run -- pnpm translate --dry-run
```

Expected: Output showing "Dry run — would translate N keys" for each language.

- [ ] **Step 7: Commit**

```bash
git add scripts/i18n-glossary.json scripts/translate.ts scripts/translate.test.ts scripts/jest.config.cjs
git commit -m "feat: add LLM-powered translation script with validation, diff-mode, and glossary"
```

---

### Task 7: CI Staleness Check

**Files:**
- Create: `scripts/check-i18n-staleness.ts`
- Create: `scripts/check-i18n-staleness.test.ts`

- [ ] **Step 1: Write the test**

Create `scripts/check-i18n-staleness.test.ts`:

```typescript
import { checkStaleness, type StalenessResult } from './check-i18n-staleness';

describe('checkStaleness', () => {
  const source = {
    common: { save: 'Save', cancel: 'Cancel' },
    errors: { generic: 'Error. {{action}} to retry.' },
  };

  it('passes when all target files have matching keys and variables', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen' },
        errors: { generic: 'Fehler. {{action}} zum Wiederholen.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when target is missing a key', () => {
    const targets = {
      de: {
        common: { save: 'Speichern' },
        errors: { generic: 'Fehler. {{action}}.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ lang: 'de', type: 'missing_key', key: 'common.cancel' })
    );
  });

  it('fails when target has orphaned keys', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen', orphan: 'Waise' },
        errors: { generic: 'Fehler. {{action}}.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ lang: 'de', type: 'orphaned_key', key: 'common.orphan' })
    );
  });

  it('fails when target is missing an interpolation variable', () => {
    const targets = {
      de: {
        common: { save: 'Speichern', cancel: 'Abbrechen' },
        errors: { generic: 'Fehler.' },
      },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ lang: 'de', type: 'missing_variable', key: 'errors.generic', variable: '{{action}}' })
    );
  });

  it('reports errors from multiple languages', () => {
    const targets = {
      de: { common: { save: 'Speichern' }, errors: { generic: 'Fehler. {{action}}.' } },
      es: { common: { save: 'Guardar', cancel: 'Cancelar' }, errors: {} },
    };
    const result = checkStaleness(source, targets);
    expect(result.pass).toBe(false);
    const langs = result.errors.map((e) => e.lang);
    expect(langs).toContain('de');
    expect(langs).toContain('es');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm exec jest --config scripts/jest.config.cjs --no-coverage scripts/check-i18n-staleness.test.ts
```

Expected: FAIL — `Cannot find module './check-i18n-staleness'`

- [ ] **Step 3: Create the staleness check script**

Create `scripts/check-i18n-staleness.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');

type NestedStrings = { [k: string]: string | NestedStrings };

interface StalenessError {
  lang: string;
  type: 'missing_key' | 'orphaned_key' | 'missing_variable';
  key: string;
  variable?: string;
}

export interface StalenessResult {
  pass: boolean;
  errors: StalenessError[];
}

function flattenKeys(obj: NestedStrings, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

function extractVariables(str: string): string[] {
  return str.match(/\{\{[^}]+\}\}/g) ?? [];
}

export function checkStaleness(
  source: NestedStrings,
  targets: Record<string, NestedStrings>
): StalenessResult {
  const sourceFlat = flattenKeys(source);
  const errors: StalenessError[] = [];

  for (const [lang, target] of Object.entries(targets)) {
    const targetFlat = flattenKeys(target);

    for (const key of Object.keys(sourceFlat)) {
      if (!(key in targetFlat)) {
        errors.push({ lang, type: 'missing_key', key });
        continue;
      }

      const sourceVars = extractVariables(sourceFlat[key]);
      const targetVars = extractVariables(targetFlat[key]);
      for (const v of sourceVars) {
        if (!targetVars.includes(v)) {
          errors.push({ lang, type: 'missing_variable', key, variable: v });
        }
      }
    }

    for (const key of Object.keys(targetFlat)) {
      if (!(key in sourceFlat)) {
        errors.push({ lang, type: 'orphaned_key', key });
      }
    }
  }

  return { pass: errors.length === 0, errors };
}

function main(): void {
  const enPath = path.join(LOCALES_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`Source file not found: ${enPath}`);
    process.exit(1);
  }

  const source: NestedStrings = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  const targets: Record<string, NestedStrings> = {};

  for (const lang of TARGET_LANGUAGES) {
    const targetPath = path.join(LOCALES_DIR, `${lang}.json`);
    if (!fs.existsSync(targetPath)) {
      console.error(`Missing translation file: ${targetPath}`);
      process.exit(1);
    }
    targets[lang] = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  }

  const result = checkStaleness(source, targets);

  if (result.pass) {
    console.log('✓ All translation files are up to date');
    return;
  }

  console.error('✗ Translation files are stale:\n');
  for (const err of result.errors) {
    switch (err.type) {
      case 'missing_key':
        console.error(`  [${err.lang}] Missing key: ${err.key}`);
        break;
      case 'orphaned_key':
        console.error(`  [${err.lang}] Orphaned key: ${err.key}`);
        break;
      case 'missing_variable':
        console.error(`  [${err.lang}] Missing variable ${err.variable} in: ${err.key}`);
        break;
    }
  }

  console.error('\nRun `pnpm translate` and commit the result.');
  process.exit(1);
}

if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm exec jest --config scripts/jest.config.cjs --no-coverage scripts/check-i18n-staleness.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/check-i18n-staleness.ts scripts/check-i18n-staleness.test.ts
git commit -m "feat: add CI staleness check for translation files"
```

---

### Task 8: Language Picker in Settings

**Files:**
- Modify: `apps/mobile/src/app/(app)/more.tsx`
- Modify: `apps/mobile/src/i18n/locales/en.json`

- [ ] **Step 1: Add settings namespace to en.json**

Add to `apps/mobile/src/i18n/locales/en.json`:

```json
{
  "settings": {
    "appLanguage": "App Language",
    "appLanguageDescription": "Change the language of the app interface"
  }
}
```

- [ ] **Step 2: Add language picker row to more.tsx**

In `apps/mobile/src/app/(app)/more.tsx`, add imports:

```typescript
import { useTranslation } from 'react-i18next';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  setStoredLanguage,
  type SupportedLanguage,
} from '../../i18n';
import i18next from '../../i18n';
```

Inside the component, after the existing hook calls:

```typescript
const { t } = useTranslation();
```

Add the language picker state and handler:

```typescript
const [showLanguagePicker, setShowLanguagePicker] = useState(false);
const currentLanguage = i18next.language as SupportedLanguage;

const handleLanguageChange = useCallback(async (lang: SupportedLanguage) => {
  await setStoredLanguage(lang);
  await i18next.changeLanguage(lang);
  setShowLanguagePicker(false);
}, []);
```

In the JSX, in the "Account" section (after the "Tutor language" `SettingsRow` around line 651), add — guarded by the feature flag:

```tsx
{FEATURE_FLAGS.I18N_ENABLED && (
  <SettingsRow
    label={t('settings.appLanguage')}
    value={LANGUAGE_LABELS[currentLanguage].native}
    onPress={() => setShowLanguagePicker(true)}
    testID="settings-app-language"
  />
)}
```

Add a language picker modal (bottom sheet or simple modal) before the closing `</ScrollView>`. Use the same `LearningModeOption` card pattern already used for learning mode and accommodations:

```tsx
{showLanguagePicker && (
  <View className="mt-4 px-4">
    <Text className="text-body-sm font-semibold text-text-secondary mb-2 uppercase tracking-wider">
      {t('settings.appLanguage')}
    </Text>
    {SUPPORTED_LANGUAGES.map((lang) => (
      <Pressable
        key={lang}
        onPress={() => handleLanguageChange(lang)}
        className={`flex-row items-center justify-between p-4 rounded-xl mb-2 ${
          lang === currentLanguage ? 'bg-primary/10 border border-primary' : 'bg-surface-secondary'
        }`}
        testID={`language-option-${lang}`}
      >
        <View>
          <Text className="text-body font-medium text-text-primary">
            {LANGUAGE_LABELS[lang].native}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {LANGUAGE_LABELS[lang].english}
          </Text>
        </View>
        {lang === currentLanguage && (
          <Ionicons name="checkmark-circle" size={24} color="var(--color-primary)" />
        )}
      </Pressable>
    ))}
  </View>
)}
```

Note: The exact UI implementation depends on the existing visual patterns in `more.tsx`. Adapt the classNames and layout to match the existing `LearningModeOption` component style. The core requirement is: show a list of languages with native labels, highlight the current selection, write to AsyncStorage + call `changeLanguage()` on tap.

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/app/(app)/more.test.tsx
```

Expected: PASS

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/more.tsx" apps/mobile/src/i18n/locales/en.json
git commit -m "feat(mobile): add language picker to settings, gated behind I18N_ENABLED flag"
```

---

### Task 9: ConversationLanguage Auto-Suggest Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-conversation-language-suggest.ts`
- Create: `apps/mobile/src/hooks/use-conversation-language-suggest.test.ts`
- Modify: `apps/mobile/src/i18n/locales/en.json`
- Modify: `apps/mobile/src/lib/sign-out-cleanup.ts` (register the new AsyncStorage key — see Step 6)

This hook fires a one-time suggestion when the UI language differs from the user's `conversationLanguage` and certain conditions are met. See spec section "ConversationLanguage Auto-Suggest" for the full condition list.

- [ ] **Step 1: Add auto-suggest strings to en.json**

Add to `apps/mobile/src/i18n/locales/en.json`:

```json
{
  "autoSuggest": {
    "title": "Chat in {{language}}?",
    "message": "Would you like your tutor to talk to you in {{language}}?",
    "accept": "Yes, switch",
    "dismiss": "No thanks"
  }
}
```

- [ ] **Step 2: Write the test**

Create `apps/mobile/src/hooks/use-conversation-language-suggest.test.ts`:

```typescript
import { shouldShowSuggestion, type SuggestionInput } from './use-conversation-language-suggest';
import type { ConversationLanguage } from '@eduagent/schemas';

describe('shouldShowSuggestion', () => {
  const base: SuggestionInput = {
    profileExists: true,
    conversationLanguage: 'en',
    uiLanguage: 'de',
    supportedConversationLanguages: ['en', 'cs', 'es', 'fr', 'de', 'it', 'pt', 'pl'],
    dismissed: false,
  };

  it('returns true when all conditions are met', () => {
    expect(shouldShowSuggestion(base)).toBe(true);
  });

  it('returns false when profile does not exist', () => {
    expect(shouldShowSuggestion({ ...base, profileExists: false })).toBe(false);
  });

  it('returns false when UI language matches conversationLanguage', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'en' })).toBe(false);
  });

  it('returns false when UI language is not in ConversationLanguage enum', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'nb' })).toBe(false);
  });

  it('returns false when already dismissed', () => {
    expect(shouldShowSuggestion({ ...base, dismissed: true })).toBe(false);
  });

  it('returns false when UI language is ja (not in ConversationLanguage enum)', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'ja' })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/hooks/use-conversation-language-suggest.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 4: Create the hook**

Create `apps/mobile/src/hooks/use-conversation-language-suggest.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from '../i18n';
import { LANGUAGE_LABELS, type SupportedLanguage } from '../i18n';
import { useProfile } from '../lib/profile';
import { useUpdateConversationLanguage } from './use-onboarding-dimensions';
import { conversationLanguageSchema, type ConversationLanguage } from '@eduagent/schemas';
import { FEATURE_FLAGS } from '../lib/feature-flags';

const DISMISS_KEY = 'i18n-auto-suggest-dismissed';

export interface SuggestionInput {
  profileExists: boolean;
  conversationLanguage: string;
  uiLanguage: string;
  supportedConversationLanguages: readonly string[];
  dismissed: boolean;
}

export function shouldShowSuggestion(input: SuggestionInput): boolean {
  if (!input.profileExists) return false;
  if (input.uiLanguage === input.conversationLanguage) return false;
  if (!input.supportedConversationLanguages.includes(input.uiLanguage)) return false;
  if (input.dismissed) return false;
  return true;
}

export function useConversationLanguageSuggest(): {
  visible: boolean;
  suggestedLanguage: string;
  suggestedLanguageLabel: string;
  accept: () => void;
  dismiss: () => void;
} {
  const { activeProfile } = useProfile();
  const updateLanguage = useUpdateConversationLanguage();
  const [dismissed, setDismissed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!FEATURE_FLAGS.I18N_ENABLED) return;
    AsyncStorage.getItem(DISMISS_KEY).then((val) => {
      setDismissed(val === 'true');
      setChecked(true);
    });
  }, []);

  const uiLanguage = i18next.language;
  const conversationLanguage = activeProfile?.conversationLanguage ?? 'en';
  const conversationLanguages = conversationLanguageSchema.options;

  const show =
    FEATURE_FLAGS.I18N_ENABLED &&
    checked &&
    shouldShowSuggestion({
      profileExists: !!activeProfile,
      conversationLanguage,
      uiLanguage,
      supportedConversationLanguages: conversationLanguages,
      dismissed,
    });

  const accept = useCallback(() => {
    const lang = uiLanguage as ConversationLanguage;
    updateLanguage.mutate({ conversationLanguage: lang });
    AsyncStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }, [uiLanguage, updateLanguage]);

  const dismiss = useCallback(() => {
    AsyncStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }, []);

  const label =
    LANGUAGE_LABELS[uiLanguage as SupportedLanguage]?.english ?? uiLanguage;

  return {
    visible: show,
    suggestedLanguage: uiLanguage,
    suggestedLanguageLabel: label,
    accept,
    dismiss,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/hooks/use-conversation-language-suggest.test.ts
```

Expected: PASS

- [ ] **Step 6: Register the auto-suggest dismissal key with sign-out cleanup**

The codebase has `apps/mobile/src/lib/sign-out-cleanup.ts` as the single source of truth for SecureStore/AsyncStorage cleanup at sign-out, plus a `sign-out-cleanup-registry.test.ts` meta-test that scans callsites for unregistered keys. The new `i18n-auto-suggest-dismissed` key MUST be registered there or the meta-test fails on CI.

Add the constant to whatever exported registry the file uses (the existing pattern — match it; do NOT invent a new one). On sign-out, the key should be **cleared** so the next user gets the auto-suggest fresh.

The `app-ui-language` key, by contrast, must NOT be cleared on sign-out — it's a device-level UI preference, not user-tied data. Document this distinction in a one-line comment next to the registration:

```typescript
// app-ui-language: device preference, preserved across sign-out
// i18n-auto-suggest-dismissed: per-user, cleared on sign-out
```

- [ ] **Step 7: Run the sign-out-cleanup-registry meta-test**

```bash
cd apps/mobile && pnpm exec jest --no-coverage src/lib/sign-out-cleanup-registry.test.ts
```

Expected: PASS — both new AsyncStorage callsites must be registered.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/hooks/use-conversation-language-suggest.ts apps/mobile/src/hooks/use-conversation-language-suggest.test.ts apps/mobile/src/i18n/locales/en.json apps/mobile/src/lib/sign-out-cleanup.ts
git commit -m "feat(mobile): add conversationLanguage auto-suggest hook for post-onboarding language alignment"
```

---

### Task 10: i18next-parser Config

**Files:**
- Create: `apps/mobile/i18next-parser.config.js`

This config is used for validation — scanning all `t()` calls and verifying they exist in `en.json`. Not used for initial extraction (the migration builds `en.json` manually).

- [ ] **Step 1: Create the config**

Create `apps/mobile/i18next-parser.config.js`:

```javascript
/** @type {import('i18next-parser').UserConfig} */
module.exports = {
  locales: ['en'],
  output: 'src/i18n/locales/$LOCALE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  createOldCatalogs: false,
  keySeparator: '.',
  namespaceSeparator: false,
  defaultNamespace: 'translation',
  useKeysAsDefaultValue: false,
  verbose: true,
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/i18next-parser.config.js
git commit -m "chore(mobile): add i18next-parser config for t() call validation"
```

---

### Task 11: Screen Migration — Pattern and Batches

This task defines the migration pattern and organizes all user-facing screens into parallelizable batches. The `apps/mobile/src/app/` tree contains ~146 `.tsx` files total, including layout files, dynamic-route segments, and helper modules under `_components/` / `_hooks/` directories that have no user-facing strings. The batches below cover ~80 screens with user-visible text. The remaining ~66 files (layouts with no UI text, helper modules, route stubs) are scanned during Batch L's component sweep and either migrated or confirmed string-free.

Each batch is independent and can be dispatched to a separate agent.

**Migration pattern for each screen file:**

1. Add `import { useTranslation } from 'react-i18next';` at the top
2. Add `const { t } = useTranslation();` as the first line inside the component
3. Replace every inline English string with `t('namespace.key')`
4. Replace every `accessibilityLabel="..."` with `accessibilityLabel={t('namespace.accessLabel')}`
5. Add all new keys to `apps/mobile/src/i18n/locales/en.json` under the appropriate namespace
6. Run `cd apps/mobile && pnpm exec jest --no-coverage --findRelatedTests <file>` and fix any test assertions that match on English strings (update them to match the `t()` key or the English value)
7. Run `cd apps/mobile && pnpm exec tsc --noEmit` to verify no type errors

**Namespace convention:** Use the screen/feature name as namespace. Examples:
- `apps/mobile/src/app/(app)/home.tsx` → `"home"` namespace
- `apps/mobile/src/app/(app)/more.tsx` → `"more"` namespace
- `apps/mobile/src/app/(app)/quiz/launch.tsx` → `"quiz"` namespace
- `apps/mobile/src/app/(app)/dictation/complete.tsx` → `"dictation"` namespace
- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` → `"parentView"` namespace
- Shared components → `"common"` namespace (already started in Task 5)

**What NOT to translate:**
- `testID` values
- Route paths (`/(app)/home`, etc.)
- Log messages (`console.log`, `console.error`)
- Analytics event names (`track('session_start', ...)`)
- Variable names, enum values, error codes
- Strings that are never displayed to the user

**Batches:**

Each batch below is a single agent task. Agents must NOT commit — they write code, run tests, and report changed files. The coordinator commits.

- [ ] **Batch A: Auth screens (3 files)**
  - `apps/mobile/src/app/(auth)/_layout.tsx`
  - `apps/mobile/src/app/index.tsx` (sign-in)
  - `apps/mobile/src/app/sso-callback.tsx`
  - Namespace: `"auth"`

- [ ] **Batch B: Onboarding screens (8 files)**
  - `apps/mobile/src/app/(app)/onboarding/_layout.tsx`
  - `apps/mobile/src/app/(app)/onboarding/language-picker.tsx`
  - `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`
  - `apps/mobile/src/app/(app)/onboarding/pronouns.tsx`
  - `apps/mobile/src/app/(app)/onboarding/accommodations.tsx`
  - `apps/mobile/src/app/(app)/onboarding/analogy-preference.tsx`
  - `apps/mobile/src/app/(app)/onboarding/interests-context.tsx`
  - `apps/mobile/src/app/(app)/onboarding/interview.tsx`
  - `apps/mobile/src/app/(app)/onboarding/curriculum-review.tsx`
  - Namespace: `"onboarding"`

- [ ] **Batch C: Home + Dashboard (2 files)**
  - `apps/mobile/src/app/(app)/home.tsx`
  - `apps/mobile/src/app/(app)/dashboard.tsx`
  - Namespaces: `"home"`, `"dashboard"`

- [ ] **Batch D: Settings / More (1 file, large)**
  - `apps/mobile/src/app/(app)/more.tsx`
  - Namespace: `"more"`
  - Note: This is the largest single screen (~750 lines). Contains `LEARNING_MODE_OPTIONS`, `ACCOMMODATION_OPTIONS`, `TUTOR_LANGUAGE_LABELS`, section headers, and many inline strings.

- [ ] **Batch E: Session screens (4 files)**
  - `apps/mobile/src/app/(app)/session/_layout.tsx`
  - `apps/mobile/src/app/session-transcript/[sessionId].tsx`
  - `apps/mobile/src/app/(app)/mentor-memory.tsx`
  - Namespace: `"session"`

- [ ] **Batch F: Quiz screens (5 files)**
  - `apps/mobile/src/app/(app)/quiz/_layout.tsx`
  - `apps/mobile/src/app/(app)/quiz/index.tsx`
  - `apps/mobile/src/app/(app)/quiz/launch.tsx`
  - `apps/mobile/src/app/(app)/quiz/[roundId].tsx`
  - `apps/mobile/src/app/(app)/quiz/history.tsx`
  - Namespace: `"quiz"`

- [ ] **Batch G: Dictation screens (6 files)**
  - `apps/mobile/src/app/(app)/dictation/_layout.tsx`
  - `apps/mobile/src/app/(app)/dictation/index.tsx`
  - `apps/mobile/src/app/(app)/dictation/complete.tsx`
  - `apps/mobile/src/app/(app)/dictation/playback.tsx`
  - `apps/mobile/src/app/(app)/dictation/review.tsx`
  - `apps/mobile/src/app/(app)/dictation/text-preview.tsx`
  - Namespace: `"dictation"`

- [ ] **Batch H: Progress screens (6 files)**
  - `apps/mobile/src/app/(app)/progress/_layout.tsx`
  - `apps/mobile/src/app/(app)/progress/index.tsx`
  - `apps/mobile/src/app/(app)/progress/[subjectId].tsx`
  - `apps/mobile/src/app/(app)/progress/milestones.tsx`
  - `apps/mobile/src/app/(app)/progress/vocabulary.tsx`
  - `apps/mobile/src/app/(app)/progress/saved.tsx`
  - Namespace: `"progress"`

- [ ] **Batch I: Library / Shelf / Topic / Subject / Vocabulary (10 files)**
  - `apps/mobile/src/app/(app)/shelf/_layout.tsx`
  - `apps/mobile/src/app/(app)/shelf/[subjectId]/_layout.tsx`
  - `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`
  - `apps/mobile/src/app/(app)/topic/_layout.tsx`
  - `apps/mobile/src/app/(app)/topic/index.tsx`
  - `apps/mobile/src/app/(app)/topic/recall-test.tsx`
  - `apps/mobile/src/app/(app)/subject/_layout.tsx`
  - `apps/mobile/src/app/(app)/subject/[subjectId].tsx`
  - `apps/mobile/src/app/(app)/vocabulary/_layout.tsx`
  - `apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx`
  - Namespaces: `"library"`, `"topic"`, `"subject"`, `"vocabulary"`

- [ ] **Batch J: Parent / Child views (9 files)**
  - `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/report/[reportId].tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx`
  - `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`
  - Namespace: `"parentView"`

- [ ] **Batch K: Modals + Standalone screens (8 files)**
  - `apps/mobile/src/app/consent.tsx`
  - `apps/mobile/src/app/create-subject.tsx`
  - `apps/mobile/src/app/delete-account.tsx`
  - `apps/mobile/src/app/privacy.tsx`
  - `apps/mobile/src/app/terms.tsx`
  - `apps/mobile/src/app/assessment/index.tsx`
  - `apps/mobile/src/app/(app)/homework/_layout.tsx`
  - `apps/mobile/src/app/(app)/homework/camera.tsx`
  - `apps/mobile/src/app/(app)/pick-book/_layout.tsx`
  - Namespaces: `"consent"`, `"subject"`, `"account"`, `"legal"`, `"assessment"`, `"homework"`, `"pickBook"`

- [ ] **Batch L: Shared components and remaining strings**

  Concrete file list (do not invent — these are the components/files known to contain user-facing text after the screen sweep):

  - `apps/mobile/src/components/common/ErrorFallback.tsx` (already partially done in Task 5 — verify all strings externalized)
  - `apps/mobile/src/components/common/ErrorBoundary.tsx` (already partially done in Task 5 — verify)
  - `apps/mobile/src/components/common/LoadingIndicator.tsx` (if it contains text)
  - `apps/mobile/src/components/common/EmptyState.tsx` (or equivalent — empty-state message components)
  - `apps/mobile/src/components/common/ConfirmDialog.tsx` (or equivalent — confirmation dialog component)
  - All `apps/mobile/src/components/coaching/*.tsx` (intent cards, coaching prompts)
  - All `apps/mobile/src/components/session/*.tsx` (session UI fragments)
  - Tab labels in `apps/mobile/src/app/(app)/_layout.tsx`

  Discovery sweep (use to find anything missed, NOT as the sole source of files):

  ```bash
  cd apps/mobile && rg -n '"[A-Z][a-zA-Z ,.!?\']{3,}"' src/components/ src/app/ --type tsx \
    | rg -v 'testID=|accessibilityRole|accessibilityHint=|console\.(log|warn|error)|require\(' \
    | head -100
  ```

  Each result must be either: (a) wrapped in `t()`, (b) a non-user-visible string (testID, route path, log message, type discriminator), or (c) explicitly justified in a code comment. No silent dismissal.

  Completion criterion: zero results from the discovery sweep that aren't accounted for. Do NOT mark this batch done until the grep is clean.

- [ ] **After all batches: Run full validation**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --no-coverage
pnpm exec nx lint mobile
tsx scripts/check-i18n-staleness.ts
```

All must pass before proceeding to the next task.

---

### Task 12: Generate Translations

**Files:**
- Modify: `apps/mobile/src/i18n/locales/nb.json` (overwritten)
- Modify: `apps/mobile/src/i18n/locales/de.json` (overwritten)
- Modify: `apps/mobile/src/i18n/locales/es.json` (overwritten)
- Modify: `apps/mobile/src/i18n/locales/pt.json` (overwritten)
- Modify: `apps/mobile/src/i18n/locales/pl.json` (overwritten)
- Modify: `apps/mobile/src/i18n/locales/ja.json` (overwritten)

- [ ] **Step 1: Run full translation**

```bash
C:/Tools/doppler/doppler.exe run -- pnpm translate --full
```

Expected: All 6 languages succeed with validation pass. Warnings about string length are acceptable.

- [ ] **Step 2: Review Norwegian**

```bash
C:/Tools/doppler/doppler.exe run -- pnpm translate --review --lang nb
```

Human-review the output diff for Norwegian. Make manual corrections directly in `nb.json` as needed.

> **Diff-mode quality tradeoff — flagged.** Subsequent runs of `pnpm translate` (without `--full`) only re-translate keys that changed in `en.json`. Because the LLM sees changed keys in isolation, it can't match the register/tone of the rest of the file written months earlier. Over many iterative runs, the file drifts toward an inconsistent patchwork of formality and term choice. Mitigations: (a) run `pnpm translate --full --lang nb` quarterly to re-baseline reviewed languages, (b) treat any large feature merge (>50 changed keys) as a `--full` event rather than diff-mode.

- [ ] **Step 3: Run staleness check**

```bash
tsx scripts/check-i18n-staleness.ts
```

Expected: `✓ All translation files are up to date`

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): generate translations for nb, de, es, pt, pl, ja via LLM"
```

---

### Task 13: Flip Feature Flag and Final Validation

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts`

- [ ] **Step 1: Verify all screens are migrated**

Run a scan for remaining hardcoded strings in screen files:

```bash
cd apps/mobile && rg -c ">['\"][A-Z]" src/app/ --type tsx | sort -t: -k2 -rn | head -20
```

Review the output — legitimate remaining strings include:
- Component/type names in JSX (e.g., `<Stack.Screen name="index"`)
- testID values
- Route paths
- Strings already wrapped in `t()`

Any user-visible English string NOT wrapped in `t()` must be migrated before flipping the flag.

- [ ] **Step 2: Run full test suite**

```bash
cd apps/mobile && pnpm exec jest --no-coverage
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
tsx scripts/check-i18n-staleness.ts
```

All must pass.

- [ ] **Step 3: Flip the feature flag**

In `apps/mobile/src/lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  I18N_ENABLED: true,
} as const;
```

- [ ] **Step 4: Run tests again after flag flip**

```bash
cd apps/mobile && pnpm exec jest --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: PASS — the flag flip should not break any tests since the English catalog produces the same strings as the previous hardcoded values.

- [ ] **Step 5: Smoke test — start the dev server and verify**

```bash
cd apps/mobile && pnpm expo start --web
```

Verify:
- App loads in English by default
- Language picker is visible in Settings
- Selecting a different language re-renders all visible text
- Switching back to English restores all strings
- Navigation between screens preserves the selected language

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/feature-flags.ts
git commit -m "feat(mobile): enable i18n — flip I18N_ENABLED flag after full migration"
```

---

### Task 14: Remove the I18N_ENABLED Feature Flag

This task runs **after** at least one full release cycle on `I18N_ENABLED: true` with no rollback signals. Feature flags that ship and stay become permanent dead branches; we remove the flag once stable to keep the code honest.

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts`
- Modify: `apps/mobile/src/i18n/index.ts` (remove the `if (FEATURE_FLAGS.I18N_ENABLED)` guard around the AsyncStorage read)
- Modify: `apps/mobile/src/app/(app)/more.tsx` (remove the `{FEATURE_FLAGS.I18N_ENABLED && ...}` guard around the language picker row)
- Modify: `apps/mobile/src/hooks/use-conversation-language-suggest.ts` (remove the `FEATURE_FLAGS.I18N_ENABLED` guard in both the `useEffect` and `show` derivation)

- [ ] **Step 1: Find every reference**

```bash
cd apps/mobile && rg -n 'I18N_ENABLED' src/
```

Every match must be removed: the flag definition, every conditional, every test that asserts on flag-off behavior.

- [ ] **Step 2: Remove the flag and unwrap each conditional**

In each file, delete the `if (FEATURE_FLAGS.I18N_ENABLED)` wrapping (keep the body). In `feature-flags.ts`, delete the `I18N_ENABLED` line.

- [ ] **Step 3: Update tests that previously covered both flag states**

Any test asserting "language picker is hidden when flag is off" can be deleted — that path no longer exists. Tests asserting "language picker is visible" stay.

- [ ] **Step 4: Validate**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --no-coverage
pnpm exec nx lint mobile
```

Expected: PASS. The grep from Step 1 must now return zero matches.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/
git commit -m "chore(mobile): remove I18N_ENABLED feature flag — i18n is now permanent"
```

---

## Appendix: Test Gotchas

1. **Tests that assert on English strings** — After migration, tests that assert `expect(screen.getByText('Cancel'))` will continue to work because `t('common.cancel')` resolves to `'Cancel'` in the test environment (i18next initializes with `en`). No test changes needed unless the test explicitly mocks i18next.

2. **Snapshot tests** — If any exist, they will need updating because JSX now contains `{t('key')}` instead of literal strings. Run `jest --updateSnapshot` after migration.

3. **AsyncStorage in tests** — The `@react-native-async-storage/async-storage` mock (auto-provided by the jest setup) handles `getItem`/`setItem` correctly. The i18n init module's async language detection runs in the background and doesn't affect synchronous test rendering.
