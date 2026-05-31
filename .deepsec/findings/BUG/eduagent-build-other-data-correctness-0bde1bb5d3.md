# [BUG] Duplicate accepted-aliases that should be diacritic variants (accented spellings not actually accepted)

**File:** [`apps/api/src/services/quiz/capitals-data.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/quiz/capitals-data.ts#L143-L516) (lines 143, 164, 186, 494, 516)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-data-correctness`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

Several CapitalEntry.acceptedAliases arrays contain the same ASCII string twice, where the intent was clearly to list a diacritic/native variant alongside the ASCII form, but the accented characters were flattened to ASCII — producing a useless duplicate instead of the variant. Examples: Iceland `['Reykjavik', 'Reykjavik']` (L143, intended 'Reykjavík'), Latvia `['Riga', 'Riga']` (L164, intended 'Rīga'), Moldova `['Chisinau', 'Chisinau', 'Kishinev']` (L186, intended 'Chișinău'), Brazil `['Brasilia', 'Brasilia']` (L494, intended 'Brasília'), Colombia `['Bogota', 'Bogota']` (L516, intended 'Bogotá'). Net effect: the correct native spelling (e.g. 'Bogotá', 'Brasília') is NOT in the accepted-answer set, so a learner who types the orthographically-correct accented form may be marked wrong — unless the answer matcher (capitals-validation.ts, not in scope here) normalizes diacritics before comparison, in which case the duplicates are merely harmless redundancy. No security impact; correctness/UX only for an educational app.

## Recommendation

Either (a) replace the duplicate with the real diacritic spelling (e.g. 'Bogotá', 'Brasília', 'Reykjavík', 'Rīga', 'Chișinău'), or (b) if the validator already strips diacritics, drop the redundant duplicate entries. Confirm capitals-validation.ts's normalization behavior to decide which.

## Revalidation

**Verdict:** true-positive

Confirmed all five duplicate-alias entries: Iceland `capital:'Reykjavik', acceptedAliases:['Reykjavik','Reykjavik']` (intended 'Reykjavík'), Latvia `['Riga','Riga']` ('Rīga'), Moldova `['Chisinau','Chisinau','Kishinev']` ('Chișinău'), Brazil `['Brasilia','Brasilia']` ('Brasília'), Colombia `['Bogota','Bogota']` ('Bogotá'). The `capital` (correctAnswer) field is ASCII in every case, and the accented native spelling is absent from both correctAnswer and acceptedAliases. The finding's only open question — 'unless the answer matcher normalizes diacritics' — is resolved against the bug: the capitals matcher isAnswerCorrect (complete-round.ts:132-139) only does `.trim().toLowerCase()` with NO diacritic folding, and both answer paths (/check → checkQuizAnswerWithCorrect and /complete → validateResults) call it. The diacritic-stripping helper stripDiacritics (mastery-keys.ts:42-43) is used solely for computing mastery item KEYS, never for answer comparison. Therefore a learner who types the orthographically-correct accented form ('Bogotá') in free-text mode (capitals support freeTextEligible) gets normalized to 'bogotá', which never equals the stored 'bogota' → marked wrong. Impact is narrow (only free-text capitals answers; MC mode picks the ASCII option and is unaffected) and is correctness/UX, not security — so BUG severity is correct. The duplicate aliases are themselves harmless redundancy; the actual defect is the missing accented variant. Real bug, confirmed.

## Recent committers (`git log`)

- crowka <zuzana.kopecna@zwizzly.com> (2026-04-18)
