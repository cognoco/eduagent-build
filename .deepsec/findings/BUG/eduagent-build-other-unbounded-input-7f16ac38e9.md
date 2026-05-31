# [BUG] Server-side grading input answerGiven has no maximum length before reaching O(m·n) Levenshtein routine

**File:** [`packages/schemas/src/quiz-utils.ts`](https://github.com/cognoco/eduagent-build//blob/main/packages/schemas/src/quiz-utils.ts#L5-L56) (lines 5, 40, 56)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-unbounded-input`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

isGuessWhoFuzzyMatch()/levenshteinDistance() in quiz-utils.ts run the Wagner-Fischer edit-distance algorithm (O(m·n) time) over user-supplied input. The caller is isAnswerCorrect() in apps/api/src/services/quiz/complete-round.ts (L145-151), which passes the request-controlled answerGiven into the matcher. The corresponding wire schema in packages/schemas/src/quiz.ts validates answerGiven only as z.string() (L117) / z.string().min(1) (L158) — there is no .max() bound. An attacker can therefore submit an arbitrarily large answer string. Impact is limited: the second operand (canonicalName/acceptedAliases) is server-stored and short, the function swaps so the smaller string drives memory (O(min) space, recursion depth capped at 1), making runtime effectively linear (~candidateLen × inputLen) rather than quadratic, and Cloudflare Workers isolate/CPU-limit each request. So this is a hardening/robustness gap (a free-text answer field should be length-capped as defense-in-depth) rather than an exploitable algorithmic-complexity DoS. Other answer types (capitals/vocabulary) only do exact string comparison, so they are unaffected.

## Recommendation

Add a reasonable upper bound to the answer field in quiz.ts (e.g. answerGiven: z.string().min(1).max(200)) so unbounded input cannot reach the edit-distance routine. Optionally, short-circuit isGuessWhoFuzzyMatch() when Math.abs(input.length - candidate.length) already exceeds maxDistance to avoid computing the full matrix for obviously-too-long inputs.

## Revalidation

**Verdict:** true-positive

Verified every factual claim. questionResultSchema.answerGiven is z.string() with no .max() (quiz.ts:117), questionCheckInputSchema.answerGiven is z.string().min(1) with no .max() (quiz.ts:158), and completeRoundInputSchema.results is also uncapped (z.array(...).min(1), quiz.ts:150), so an authenticated client can submit an arbitrarily large answer string. isAnswerCorrect (services/quiz/complete-round.ts:128-153) routes answerGiven into isGuessWhoFuzzyMatch only for type 'guess_who' (L145-150); capitals/vocabulary use exact normalized comparison (L134-143) and are unaffected. The matcher (quiz-utils.ts:40-59) calls levenshteinDistance, which is genuine Wagner-Fischer O(m·n). However the finding's impact analysis is correct: the second operand (canonicalName/acceptedAliases) is short server-stored data; the algorithm swaps so n<=m and the row buffer is O(min) space (L12-16); with a short candidate the runtime is effectively candidateLen×inputLen (near-linear in attacker input, not quadratic, because true O(n²) blowup needs both operands attacker-controlled); and Cloudflare Workers isolate CPU limits cap any single request. The amplification factor (~candidateLen × number-of-guess_who-candidates) is modest and the attacker must already send the large body. So this is a legitimate defense-in-depth hardening gap (a free-text answer field should carry a sane .max()), not an exploitable algorithmic-complexity DoS — precisely how the finding scopes it. The uncapped field genuinely exists, so it is a true-positive at BUG severity; the recommended z.string().min(1).max(200) cap is appropriate. No severity change.

## Recent committers (`git log`)

- crowka <zuzana.kopecna@zwizzly.com> (2026-05-10)
