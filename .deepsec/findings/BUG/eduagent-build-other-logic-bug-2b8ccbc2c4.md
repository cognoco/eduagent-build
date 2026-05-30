# [BUG] Non-answer substring matching misclassifies substantive answers as non-answers (locale false positives)

**File:** [`apps/api/src/services/session/review-calibration.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/session/review-calibration.ts#L74-L91) (lines 74, 75, 76, 77, 91)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`matchesNonAnswerPhrase` (L74-77) uses `normalized.includes(token)` for any non-answer token longer than 2 characters. The authors clearly anticipated over-matching (tokens of length <=2 require an exact whole-string match), but tokens of length 3-4 in the locale lists are still matched as substrings of legitimate words. This causes `isSubstantiveCalibrationAnswer` (call site L91) to return false (treat the answer as a non-answer like 'idk') for genuine, substantive answers that merely contain a short non-answer token inside a longer word. Concrete examples: Czech token 'nic' (L35) is a substring of 'klinický'/'technický'/'scénický' (after diacritic stripping -> 'klinicky' etc.); French token 'non' (L37) is a substring of 'mononucléaire' -> 'mononucleaire'; Spanish token 'nada' (L36) is a substring of 'granada'. A learner answering substantively in these locales can have their answer silently dropped as a non-answer, which mis-calibrates review scheduling / mastery accounting. Not a security issue (it only makes the classifier MORE conservative, never granting unauthorized access), but a real correctness bug that disproportionately affects non-English locales.

## Recommendation

Tighten the matcher so short single-word tokens match on word boundaries rather than raw substrings. Either (a) split `normalized` into words and compare each token against whole words for single-word tokens (reserving `includes` for multi-word phrases like "i don't know"), or (b) raise the exact-match length threshold and/or wrap single-word tokens in `\b` word-boundary regex checks. Add unit cases for 'klinicky'/'mononucleaire'/'granada' to lock the fix.

## Revalidation

**Verdict:** true-positive

This is a confirmed correctness bug (non-security, as the finding states). matchesNonAnswerPhrase (L74-77) special-cases tokens of length <=2 to require whole-string equality, but for tokens of length >=3 it falls through to normalized.includes(token) — a raw substring match. The locale lists contain 3-4 character single-word tokens that are common substrings of legitimate words, and I verified each cited example by tracing normalizeAnswer (NFKD + diacritic strip): Czech 'nic' (L35) is a substring of 'klinický'->'klinicky' (indices 3-5); Spanish 'nada' (L36) is a substring of 'granada' (indices 3-6); French 'non' (L37) is a substring of 'mononucléaire'->'mononucleaire' (indices 2-4). Crucially the token check runs FIRST in isSubstantiveCalibrationAnswer (L91), before the word-count/char-count gates, so a genuine multi-word answer that merely contains such a fragment returns false. I confirmed the behavioral impact at both call sites in session-exchange.ts: at L1024 the result gates review/practice calibration dispatch, and at L1133-1137 a false result causes an early return that skips topic-probe calibration entirely — so a real answer like 'El clima de Granada es muy seco' is silently dropped, mis-calibrating review scheduling/mastery, disproportionately for non-English locales. The authors' own length<=2 exact-match carve-out shows they anticipated over-matching but did not extend it to the 3-4 char tokens. BUG severity is appropriate; the recommended word-boundary fix is correct.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-07)
