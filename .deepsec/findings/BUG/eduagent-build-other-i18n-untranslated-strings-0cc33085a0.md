# [BUG] Hardcoded English strings in mode-switch error row bypass i18n

**File:** [`apps/mobile/src/components/chrome/ModeSwitcher.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/components/chrome/ModeSwitcher.tsx#L116-L133) (lines 116, 122, 133)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-i18n-untranslated-strings`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The component obtains the translate function (`const { t } = useTranslation()`, L21) and uses it correctly for the tab labels (`t('tabs.myLearning')` L68, `t('tabs.children')` L103). However, the error-row UI renders hardcoded English literals instead of going through `t()`: "Couldn't switch. Tap to try again." (L116), the retry button's `accessibilityLabel="Retry mode switch"` (L122), and `accessibilityLabel="Dismiss"` (L133). For a 7-locale UI app (en, de, es, ja, nb, pl, pt per `apps/mobile/src/i18n/index.ts`), non-English users see/hear English in the failure path. This is not a security vulnerability — it is a localization/quality bug. It matches exactly the documented known gap in the repo CLAUDE.md ("Hardcoded English literals in JSX ... bypass i18n entirely and render English to every locale. There is no automated guard against this today."), so reviewers have full context that this class is acknowledged and currently un-ratcheted. The visible-text literal (L116) is the user-facing part; the two accessibility labels affect screen-reader users.

## Recommendation

Route the three strings through `t()` with keys added to `en.json` in the same change, e.g. `t('modeSwitcher.error.message')`, `t('modeSwitcher.error.retryLabel')`, `t('modeSwitcher.error.dismissLabel')`. This is consistent with how the sibling tab labels are already handled in this file.

## Revalidation

**Verdict:** true-positive

Verified line-by-line against the full component and the i18n setup. The component obtains t from useTranslation at L21 and uses it correctly for tab labels (t('tabs.myLearning') L68, t('tabs.children') L103), but the error row renders three hardcoded English literals that never pass through t(): the visible Text 'Couldn't switch. Tap to try again.' (L116), accessibilityLabel="Retry mode switch" (L122), and accessibilityLabel="Dismiss" (L133). i18n/index.ts:23-31 confirms 7 supported UI locales (en, de, es, ja, nb, pl, pt), so non-English users genuinely exist and will see/hear English in the failure path — the visible literal affects all users, the two accessibility labels affect screen-reader users. This is exactly the acknowledged, currently un-ratcheted gap documented in CLAUDE.md ('Hardcoded English literals in JSX … bypass i18n entirely and render English to every locale'). It is a localization/quality defect, not a security vulnerability, so BUG severity is correct. The recommended fix (route the three strings through t() with keys added to en.json, mirroring the sibling tab labels in the same file) is sound and consistent with existing patterns.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
