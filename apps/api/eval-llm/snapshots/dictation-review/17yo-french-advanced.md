# Dictation — Review (multimodal) × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/dictation/review.ts:SYSTEM_PROMPT`
> **Profile:** 17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy

## Profile summary

| Field | Value |
|---|---|
| Age | 17 years (birth year 2009) |
| Native language | cs |
| Conversation language | fr |
| Location | EU |
| Pronouns | they/them |
| Interests | French literature (both), philosophy (both), existentialism (free time), creative writing (free time) |
| Library topics | Camus — L'Étranger, French subjunctive, essay structure, Enlightenment thinkers |
| CEFR | B2 |
| Target language | fr |
| Struggles | subjonctif imparfait (French); nuanced connectors (French) |
| Strengths | reading comprehension (French); essay argument structure (writing) |
| Learning mode | serious |
| Preferred explanations | step-by-step, analogies |
| Pace | thorough |
| Analogy domain | music |

## Builder input

```json
{
  "language": "fr",
  "originalSentences": [
    "Le soleil se couche tôt.",
    "Elle marchait sans parler."
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
```

## Generated prompt — user

```
[image part omitted]

Original sentences:
1. Le soleil se couche tôt.
2. Elle marchait sans parler.

Please generate all explanations in fr.
```

## Builder notes

- System prompt is static — zero personalization.
- The ONLY personalized parameter is the explanation language.
- Missing: age (explanation complexity calibration), learning style (humor/step-by-step register), struggle history (recurring-pattern-aware feedback).
- Tier 2 (--live) requires a real handwriting image; not synthesized by this harness.
