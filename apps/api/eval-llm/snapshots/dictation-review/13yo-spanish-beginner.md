# Dictation — Review × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/dictation/review.ts:buildReviewSystemPrompt`
> **Profile:** 13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports

## Profile summary

| Field | Value |
|---|---|
| Age | 13 years (birth year 2013) |
| Native language | en |
| Conversation language | en |
| Location | EU |
| Pronouns | she/her |
| Interests | horses (free time), showjumping (free time), eventing (free time), nature photography (free time) |
| Library topics | Spanish present tense verbs, Spanish family vocabulary, Spanish numbers 1-1000, Spain geography |
| CEFR | A2 |
| Target language | es |
| Struggles | ser vs estar (Spanish); irregular verbs (Spanish) |
| Strengths | Spanish pronunciation (Spanish) |
| Learning mode | serious |
| Preferred explanations | step-by-step, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "ageYears": 13,
  "preferredExplanations": [
    "step-by-step",
    "examples"
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
Use clear, direct explanations suitable for a middle-schooler. You can name grammar concepts (e.g. "silent letter", "comma splice") but keep it brief. Structure each explanation as a numbered 1–2–3 breakdown: (1) what the mistake was, (2) the rule, (3) the correct version.
```

## Generated prompt — user

```
(multimodal — image + original sentences supplied at runtime)
```

## Builder notes

- ageYears=13 — explanation register calibrated to age.
- preferredExplanations=["step-by-step","examples"] — tone shaped by style preferences.
- Struggle history NOT used (gap flagged in audit P2) — recurring patterns not surfaced to reviewer.
