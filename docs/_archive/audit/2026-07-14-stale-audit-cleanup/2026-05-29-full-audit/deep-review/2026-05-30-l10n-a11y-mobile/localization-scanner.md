# Localization / i18n Scanner — `apps/mobile/src`

Scope: path-scoped i18n audit of the Expo / React Native mobile app (~461 source files,
~88 screens). This is a **known-gap-quantification pass** — CLAUDE.md documents that the
AST orphan-key checker (`scripts/check-i18n-orphan-keys.ts`) only sees strings that pass
through `t()`, and that **hardcoded English literals in JSX bypass i18n entirely** with no
automated guard (Phase 3 ratchet not yet landed). All findings are **[PRE-EXISTING]**.

i18n is **live**: `FEATURE_FLAGS.I18N_ENABLED = true` (`lib/feature-flags.ts:10`) and 7 UI
locales ship (en, de, es, ja, nb, pl, pt — `i18n/index.ts:23`). Locale-key parity is
**perfect** (all 7 `*.json` files = 1906 keys each) — so there are **no missing-key
defects**; the entire problem is *strings that never enter the i18n system in the first
place*. Every hardcoded literal below renders **English to all 7 locales**, including
de/es/ja/nb/pl/pt users who picked a non-English UI.

---

## QUANTIFIED ESTIMATE (lead finding)

**≈ 358 hardcoded user-visible English string sites across 59 of ~88 screens/components.**
Note `platformAlert(...)` sites carry **two** user-facing strings each (title + body), so the
true leaked-string count is higher (~383). Breakdown by class:

| Class | Sites | Notes |
|---|---|---|
| Multiline `<Text>…</Text>` children (English sentence between tags) | **163** | Largest class. Headings, empty-states, error copy, CTAs. |
| `accessibilityLabel="…"` literals | **110** | Screen-reader text — VoiceOver/TalkBack reads English to every locale. |
| `label="…"` (button/CTA labels) | **35** | Auth screens dominate (sign-up, forgot-password). |
| `placeholder="…"` (text inputs) | **12** | "Enter your password", "Type a name", etc. |
| `title="…"` (error/loading cards) | **7** | "Session not found", "Taking too long…". |
| `message="…"` props | **6** | |
| `platformAlert('Title','Body')` dialogs | **25** | Native confirm/error dialogs — each leaks 2 strings. |
| **TOTAL string sites** | **≈358** | (~383 leaked strings counting alert bodies) |

**Worst-offender screens (combined leak count):**

| Leaks | File |
|---|---|
| 44 | `app/session-summary/[sessionId].tsx` |
| 43 | `app/(app)/shelf/[subjectId]/book/[bookId].tsx` |
| 22 | `app/(auth)/sign-in.tsx` |
| 21 | `app/(app)/topic/[topicId].tsx` |
| 19 | `app/(auth)/sign-up.tsx` |
| 18 | `app/(app)/pick-book/[subjectId].tsx` |
| 15 | `app/(app)/subscription.tsx` |
| 14 | `app/(auth)/forgot-password.tsx` |
| 13 | `components/session-summary/SessionSummaryLibraryFilingControls.tsx` |
| 9  | `app/session-transcript/[sessionId].tsx` |

Two screens are **systemically un-internationalized**, not incidentally leaky:
- `app/(auth)/sign-in.tsx` — **zero `t()` calls in the entire file**; the whole primary
  sign-in flow is hardcoded English.
- `app/(app)/shelf/[subjectId]/book/[bookId].tsx` — **47 `<Text>` components, exactly 1
  `t()` call**; ~98% of the screen's copy is hardcoded.

This is the single highest-impact, fully-unguarded i18n defect class in the app.

---

## [PRE-EXISTING] Findings

### CRITICAL — Hardcoded English in user-visible JSX (the unguarded gap)

#### C1. Multiline `<Text>` children — 163 hardcoded English sentences/labels
**Category:** Hardcoded String · **Severity:** CRITICAL (volume + zero guard)
**Representative locations:**
- `app/session-summary/[sessionId].tsx:445` `This session has expired`
- `app/session-summary/[sessionId].tsx:448` `This session is no longer available. Head home to start a new one.`
- `app/session-summary/[sessionId].tsx:818` `Session Complete` · `:1426` `Submit Summary` · `:1475` `See your Library`
- `app/(app)/shelf/[subjectId]/book/[bookId].tsx:1273` `Missing book details. Please go back and try again.` · `:1436` `Writing your book...` · `:1448` `Couldn't finish this book right now.` · `:1469` `Set up this book`
- `app/profiles.tsx:254` `No profiles yet` · `:257` `Create your first profile to get started` · `:265` `Create profile`
- `app/(app)/subscription.tsx:735` `Unable to load subscription details. Please try again.`

**User impact:** A German/Japanese/Polish user who selected their language at onboarding sees
English headings, empty-states, and error copy throughout session-summary, book, profile, and
subscription flows.
**Fix:** Wrap each in `t('…')`, add the key to `en.json` (and run `pnpm translate` for the
other 6 locales). Example:
`<Text>This session has expired</Text>` → `<Text>{t('sessionSummary.expired.title')}</Text>`
then add `"sessionSummary": { "expired": { "title": "This session has expired" } }` to `en.json`.

#### C2. Auth screens render entirely in English
**Category:** Hardcoded String · **Severity:** CRITICAL
- `app/(auth)/sign-in.tsx` — **0 `t()` calls**; e.g. `:1022` `title="Still signing you in"`,
  `:1430` `placeholder="Enter your password"`, plus all button labels.
- `app/(auth)/sign-up.tsx:413-653` — `label="Try Again"`, `"Resend code"`, `"Use a different email"`,
  `"Continue with Google"`, `"Continue with Apple"`, `"Continue with OpenAI"`, `"Sign up"`, `"Sign in"`,
  `:387` `placeholder="Enter 6-digit code"`, `:618` `placeholder="Create a password"`.
- `app/(auth)/forgot-password.tsx:326-504` — `label="Try Again"`, `"Reset password"`,
  `"Send reset code"`, `"Back to sign in"`, `:354` `placeholder="Enter 6-digit code"`.

**User impact:** The first screens a non-English user touches (account creation, sign-in,
password reset) are 100% English — worst possible first impression for localization, and the
flow where users are least able to recover if confused.
**Fix:** Add `useTranslation()` to `sign-in.tsx`; route every `label`/`title`/`placeholder` and
`<Text>` child through `t('auth.…')`; add keys to `en.json`.

---

### HIGH — Accessibility labels, alerts, and broken pluralization

#### H1. `accessibilityLabel="…"` — 110 hardcoded English screen-reader strings
**Category:** Hardcoded String (a11y) · **Severity:** HIGH
**Representative locations:**
- `components/session/SessionMessageActions.tsx:69` `"Reconnect to the conversation"`, `:168` `"Helpful — mark this reply helpful"`, `:238` `"Mark this reply as incorrect"`
- `components/session/VoiceRecordButton.tsx:133,141,163` `"Voice transcript — tap to edit"`, `"Send voice message"`, `"Discard recording"`
- `components/session/ChatShell.tsx:703,1045,1092` `"Go back"`, `"Message input"`, `"Send message"`
- `components/memory-consent-prompt.tsx:35,47` `"Enable mentor memory"`, `"Decline mentor memory"`
- Heaviest files: `[sessionId].tsx` (15), `[bookId].tsx` (12), `[topicId].tsx` (6), `subscription.tsx` (5), `[subjectId].tsx` (5).

**User impact:** VoiceOver (iOS) / TalkBack (Android) speak English aloud to blind/low-vision
users regardless of UI locale — a hard accessibility + localization failure combined.
**Fix:** `accessibilityLabel={t('a11y.session.reconnect')}` etc.; add keys to `en.json`.

#### H2. `platformAlert(...)` native dialogs — 25 hardcoded English title+body pairs
**Category:** Hardcoded String · **Severity:** HIGH
**Representative locations:**
- `app/profiles.tsx:90` `platformAlert('Could not rename profile', …)` · `:135` `('Taking longer than expected', 'Please try again.')` · `:177` `('Could not switch profiles', …)`
- `app/(app)/session/index.tsx:1027` `("Couldn't save the note", 'Please try again.')` · `:1067` `('Could not skip warm-up', 'Please try again.')`
- `app/(app)/homework/camera.tsx:197,611` `('Microphone unavailable', …)`, `('Could not create subject', …)`
- `app/(app)/quiz/play.tsx:347,595` `("Couldn't check your answer", …)`
- `app/(app)/pick-book/[subjectId].tsx:292` `('Something went wrong', …)`

**User impact:** Error/confirmation dialogs (the moments users most need to understand) appear
in English. Note many bodies are `'Please try again.'` literals, also untranslated.
**Fix:** `platformAlert(t('errors.renameProfile.title'), t('errors.tryAgain'))`. (Good: the app
already standardized on `platformAlert` over `Alert.alert` per `lib/platform-alert.ts` — only
the message arguments need i18n.)

#### H3. Manual pluralization with hardcoded English words — 29 sites
**Category:** String Construction (plurals) · **Severity:** HIGH
i18next plural rules (`_one`/`_other`/`_few`/`_many`) are bypassed with `count === 1 ? 'x' : 'xs'`
ternaries embedded in English:
- `components/progress/MilestoneCard.tsx:17,22,28,47` `${threshold === 1 ? 'word' : 'words'}`, `'topic'/'topics'`, `'session'/'sessions'`, `'hour'/'hours'`
- `components/progress/SubjectProgressRow.tsx:62,78` `'session'/'sessions'`, `'topic'/'topics'`
- `components/session/LivingBook.tsx:142,148,189` `'page'/'pages'`
- `components/session/MilestoneDots.tsx:28` `'1 milestone reached' : '${count} milestones reached'`
- `components/mentor-memory-sections.tsx:65` `'time'/'times'`
- `app/session-summary/_view-models/session-summary-derived.ts:125,132` `=== 1 ? '' : 's'`
- `app/session-transcript/[sessionId].tsx:242` `'message'/'messages'`

**User impact:** Doubly broken — (a) the words are hardcoded English; (b) the binary
singular/plural model is wrong for Polish (3 forms: 1 / 2-4 / 5+) and others, so even after
translation the counts would read ungrammatically.
**Fix:** Use i18next count plurals: `t('progress.wordsLearned', { count: threshold })` with
`en.json` keys `"wordsLearned_one"` / `"wordsLearned_other"`; translators supply `_few`/`_many`
for Polish. Do **not** translate the singular/plural words separately.

#### H4. `label=` / `title=` / `placeholder=` / `message=` literals outside auth — 60 sites
**Category:** Hardcoded String · **Severity:** HIGH
Beyond the auth screens (C2), the same prop classes leak app-wide:
- `title=`: `app/session-summary/[sessionId].tsx:418` `"Session not found"`, `:502` `"Taking longer than expected"`; `app/session-transcript/[sessionId].tsx:122,142` `"Still loading"`, `"Couldn't load conversation"`; `app/(app)/topic/[topicId].tsx:563` `"Taking too long to open this topic"`; `app/(app)/_layout.tsx:457` `"We could not load your profile"`.
- `placeholder=`: `components/feedback/FeedbackSheet.tsx:184` `"Describe the issue or your idea..."`; `components/quiz/GuessWhoQuestion.tsx:225` `"Type a name"`; `app/(app)/pick-book/[subjectId].tsx:578` `"Book or topic to add"`.
- `label=`: `app/(app)/topic/[topicId].tsx:817` `"Notes for this topic"`.

**Fix:** Route each through `t('…')`, add keys to `en.json`.

---

### MEDIUM — Locale-unaware date formatting

#### M1. `toLocaleDateString('en-US', …)` — date hardcoded to US locale (4 sites)
**Category:** Locale-Sensitive Operation · **Severity:** MEDIUM
- `lib/format-note-source.ts:10` — formats a note byline with `'en-US'`; **also** hardcodes the
  surrounding English text: returns `` `From session · ${monthDay}` `` / `` `Note · ${monthDay}` ``
  (`:14`). This entire user-facing note source line bypasses i18n (both the words and the date).
- `app/(app)/topic/[topicId].tsx:82` `` `Last studied ${date.toLocaleDateString('en-US', …)}` `` (English word + US date) · `:103` `toLocaleDateString('en-US', { month:'short', day:'numeric' })`
- `app/(app)/child/[profileId]/session/[sessionId].tsx:36` `toLocaleDateString('en-US', …)`

**User impact:** Month names render in English ("Mar 5") and US ordering for users in any locale,
even though the rest of the app correctly uses device locale.
**Fix:** Pass the active locale — `toLocaleDateString(i18n.language, …)` or `toLocaleDateString(undefined, …)` (device default), matching the pattern already used elsewhere. For
`format-note-source.ts`, also move `"From session ·"` / `"Note ·"` into `t()` keys.

**Positive note (no action):** The other ~31 `toLocale*` call sites are already correct — they
pass `undefined` (device locale) or `i18n.language` (e.g. `app/delete-account.tsx:145`,
`components/progress/ReportsList.tsx:47`, `app/session-transcript/_components/archived-transcript-card.tsx:22`). Only the 4 `'en-US'` hardcodes are defects.

---

## Things checked and found CLEAN (no defects)

- **Locale-key parity:** all 7 `i18n/locales/*.json` have identical 1906 keys — no missing-key
  or partial-coverage defects.
- **Variable-interpolation ellipsis fallback** (`t('k', { x: x || '…' })`): **0 occurrences** —
  the CLAUDE.md guidance to avoid ellipsis interpolation appears already honored.
- **Concatenated `t()` fragments** (`t('a') + ' ' + t('b')`): **0 real occurrences** (the only
  `+` near a `t(` match was a code comment in `CheckmarkPopAnimation.tsx:40`).
- **`Alert.alert` with literals:** none in app code — the app standardized on `platformAlert`
  (`lib/platform-alert.ts`); see H2 for the message-arg leaks.
- **Conversation-vs-UI language divergence** (10 conversation langs ⊋ 7 UI langs): **intentional
  and documented** — NOT flagged.
- **RTL `left/right` vs `start/end`:** no RTL locale ships; not audited beyond noting it's a
  non-issue today.
- **Currency `$` literals:** the one `$`-match was a regex backreference (`create-subject.tsx:39`),
  not a price string — no currency-format defects found in scope.

---

## Recommended remediation order

1. **Auth flow first** (`sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`) — 55 leaks, first
   impression, and `sign-in.tsx` has no i18n at all (C2).
2. **High-traffic screens** `session-summary/[sessionId].tsx` (44) and `shelf/.../book/[bookId].tsx`
   (43, ~98% hardcoded) (C1).
3. **Accessibility labels** (110, H1) — both an a11y and an i18n obligation.
4. **Pluralization** (H3) — convert to i18next count plurals so Polish/other plural forms work.
5. **Land the Phase 3 ratchet** (baseline-allowlist on `JsxText` + JSX-children `StringLiteral`,
   mirroring `scripts/no-clinical-copy-baseline.json`) so this class stops regrowing — the root
   cause of all of the above is that there is no guard, only a `t()`-only orphan checker.

---

## Notes / caveats

- Counts are heuristic regex/AST-lite scans (ripgrep + a Python JSX-text line scanner), tuned to
  require a capitalized word + a space (English-sentence shape) to suppress identifiers/enums.
  They **undercount**: single-word leaks (`<Text>Save</Text>`, `label="Continue"` already counted
  but `label="Save"` not), lowercase-leading copy, and template-literal JSX text are not fully
  captured. Treat ~358 as a **floor**, not a ceiling.
- All locations were spot-verified in context (e.g. `session-summary/[sessionId].tsx:443-449`,
  `book/[bookId].tsx` 47 `<Text>` vs 1 `t()`, `sign-in.tsx` 0 `t()` calls) to confirm they are
  genuine user-visible literals, not comments/test fixtures/identifiers.
