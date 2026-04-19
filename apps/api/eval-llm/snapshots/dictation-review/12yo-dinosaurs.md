# Dictation — Review (multimodal) × 12yo-dinosaurs

> **Flow source:** `apps/api/src/services/dictation/review.ts:SYSTEM_PROMPT`
> **Profile:** 12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works

## Profile summary

| Field | Value |
|---|---|
| Age | 12 years (birth year 2014) |
| Native language | en |
| Conversation language | en |
| Location | US |
| Pronouns | — (not provided) |
| Interests | dinosaurs (both), fossils (both), paleontology (both), extinction events (free time), volcanoes (free time) |
| Library topics | Mesozoic era, fossilization, plate tectonics, long division |
| CEFR | — |
| Target language | — |
| Struggles | long division (math); Austria vs Australia (geography) |
| Strengths | dinosaur classification (science); reading comprehension (reading) |
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "language": "en",
  "originalSentences": [
    "The cat ran through the garden.",
    "After a while it began to rain."
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
1. The cat ran through the garden.
2. After a while it began to rain.

Please generate all explanations in en.
```

## Builder notes

- System prompt is static — zero personalization.
- The ONLY personalized parameter is the explanation language.
- Missing: age (explanation complexity calibration), learning style (humor/step-by-step register), struggle history (recurring-pattern-aware feedback).
- Tier 2 (--live) requires a real handwriting image; not synthesized by this harness.
