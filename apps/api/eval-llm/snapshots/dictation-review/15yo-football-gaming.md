# Dictation — Review × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/dictation/review.ts:buildReviewSystemPrompt`
> **Profile:** 15-year-old US teen, English native, into football and competitive gaming, low patience for formality

## Profile summary

| Field | Value |
|---|---|
| Age | 15 years (birth year 2011) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | he/him |
| Interests | football (free time), NFL (free time), esports (free time), competitive gaming (free time), sports statistics (both) |
| Library topics | algebra equations, US history: Civil War, physics: forces and motion |
| CEFR | — |
| Target language | — |
| Struggles | factoring polynomials (math); Reconstruction era (history) |
| Strengths | mental arithmetic (math); Newton's laws (physics) |
| Learning mode | casual |
| Preferred explanations | examples, analogies |
| Pace | quick |
| Analogy domain | sports |

## Builder input

```json
{
  "ageYears": 15,
  "preferredExplanations": [
    "examples",
    "analogies"
  ]
}
```

## Generated prompt — system

```
You are a dictation review assistant. Your job is to compare a child's handwritten text (visible in the image) against the original dictation sentences.

TASK:
Carefully examine the handwritten text in the image. Compare each sentence to the original provided below.
Identify all errors including: spelling mistakes, missing words, extra words, wrong punctuation, capitalisation errors.

RESPOND WITH ONLY valid JSON in this exact format — no prose before or after:
{
  "totalSentences": <number of original sentences>,
  "correctCount": <number of sentences with zero errors>,
  "mistakes": [
    {
      "sentenceIndex": <0-based index of the original sentence>,
      "original": "<the original sentence text>",
      "written": "<what the child actually wrote, as best as you can read>",
      "error": "<short label: spelling | missing_word | extra_word | wrong_punctuation | capitalisation | other>",
      "correction": "<the corrected version of what the child wrote>",
      "explanation": "<brief, child-friendly explanation of the mistake in the child's language>"
    }
  ]
}

If there are no mistakes, return an empty array for "mistakes".
Generate explanations in the child's language as instructed.

EXPLANATION STYLE:
You may use precise grammar and punctuation terminology. Keep explanations concise — the learner can handle technical language.
```

## Generated prompt — user

```
(multimodal — image + original sentences supplied at runtime)
```

## Builder notes

- ageYears=15 — explanation register calibrated to age.
- preferredExplanations=["examples","analogies"] — tone shaped by style preferences.
- Struggle history NOT used (gap flagged in audit P2) — recurring patterns not surfaced to reviewer.
