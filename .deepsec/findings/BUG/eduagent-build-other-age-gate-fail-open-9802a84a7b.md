# [BUG] Pronouns age gate fails open when profile birthYear is missing

**File:** [`apps/mobile/src/app/(app)/onboarding/pronouns.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/onboarding/pronouns.tsx#L62-L193) (lines 62, 67, 68, 69, 70, 71, 72, 73, 74, 138, 139, 140, 141, 142, 193)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-age-gate-fail-open`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The screen documents a hard safety invariant (lines 1-9, 58-62): learners below PRONOUNS_PROMPT_MIN_AGE (13) must NEVER be shown the pronouns field, and the authors added a loading holding-view and an in-flight redirect view to avoid even momentarily flashing it. However, the age computation fails open: `learnerAge` is `null` whenever `activeProfile.birthYear` is falsy (null/0/undefined), and `ageGated = profileResolved && learnerAge !== null && learnerAge < PRONOUNS_PROMPT_MIN_AGE` is therefore `false` when age is unknown. The result is that a profile with no birthYear renders the full pronouns form (including the free-text 'Other' input), which directly violates the 'never shown the field' invariant for any learner whose age cannot be established. The gate should default to hidden/skip when age is indeterminate (fail closed), mirroring the caution already applied during the loading window. Note this is a child-safety / data-minimization logic gap, not an attacker-controlled exploit — the input is the profile's own birthYear.

## Recommendation

Fail closed when age is unknown: treat a missing/unparseable birthYear as age-gated (e.g. `const ageGated = profileResolved && (learnerAge === null || learnerAge < PRONOUNS_PROMPT_MIN_AGE)`), so the screen self-skips forward instead of rendering the field. Alternatively, block reaching this step until birthYear is known. Add a unit test covering `birthYear == null` that asserts the form is not rendered and navigateForward fires.

## Revalidation

**Verdict:** true-positive

Confirmed present in the current code exactly as described. learnerAge is null whenever activeProfile.birthYear is falsy (pronouns.tsx:67-70), and ageGated = profileResolved && learnerAge !== null && learnerAge < PRONOUNS_PROMPT_MIN_AGE (L71-74) therefore evaluates to false when age is indeterminate. The only render guards are `if (!profileResolved) return holding view` (L188) and `if (ageGated) return empty view` (L193), so a resolved profile with a missing/0 birthYear falls through and renders the full pronouns form including the free-text 'Other' input — violating the file's own documented hard invariant that sub-min-age learners 'must NEVER be shown the field' (L1-9, 58-62). The gate fails open rather than closed; the fix is the finding's suggestion (treat learnerAge === null as gated). This is correctly scoped as a non-attacker-exploitable child-safety/data-minimization logic gap (the input is the profile's own birthYear), and in practice it is likely latent (onboarding typically captures birthYear earlier) with the server-side assertPronounsSelfEditAllowed acting as a write backstop — but the specific client invariant the finding cites is genuinely broken, so the BUG-severity finding stands.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
