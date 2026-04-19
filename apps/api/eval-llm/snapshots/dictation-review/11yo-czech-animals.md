# Dictation — Review (multimodal) × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/dictation/review.ts:SYSTEM_PROMPT`
> **Profile:** 11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer

## Profile summary

| Field | Value |
|---|---|
| Age | 11 years (birth year 2015) |
| Native language | cs |
| Conversation language | cs |
| Location | EU |
| Pronouns | — (not provided) |
| Interests | horses (free time), forest animals (free time), nature journaling (both), drawing (free time) |
| Library topics | Czech reading comprehension, basic fractions, human body systems, water cycle |
| CEFR | — |
| Target language | — |
| Struggles | fraction addition (math); long multi-clause sentences (reading) |
| Strengths | vocabulary retention (Czech) |
| Learning mode | casual |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "language": "cs",
  "originalSentences": [
    "Kočka běžela zahradou.",
    "Za chvíli začalo pršet."
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
1. Kočka běžela zahradou.
2. Za chvíli začalo pršet.

Please generate all explanations in cs.
```

## Builder notes

- System prompt is static — zero personalization.
- The ONLY personalized parameter is the explanation language.
- Missing: age (explanation complexity calibration), learning style (humor/step-by-step register), struggle history (recurring-pattern-aware feedback).
- Tier 2 (--live) requires a real handwriting image; not synthesized by this harness.
