# Language — Graded Input generation prompt × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/graded-input-prompts.ts:buildGradedInputGenerationPrompt`
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
| Preferred explanations | examples, analogies |
| Pace | quick |
| Analogy domain | sports |

## Builder input

```json
{
  "cefrLevel": null,
  "knownWords": [],
  "targetWords": [],
  "modality": "reading",
  "interests": [
    "football",
    "NFL",
    "esports",
    "competitive gaming",
    "sports statistics"
  ]
}
```

## Generated prompt — system

```
You are a language-learning content writer. Your only task is to write a
short passage for a learner to read or hear, using ONLY the vocabulary you
are given, plus one or two comprehension questions about that passage.

Rules:
1. Use ONLY vocabulary from the known-words and target-words lists provided,
   plus basic function words (articles, pronouns, conjunctions, common verbs
   like "to be"/"to have") that are unavoidable for grammar. Do NOT introduce
   other content words, names, or topics not implied by the provided vocabulary
   and interests.
2. If the known-words list is empty, treat the learner as a complete beginner:
   write the simplest possible passage using target words plus minimal
   grammar glue, introducing each target word naturally.
3. Keep the passage short: 2-5 sentences.
4. Write EXACTLY ONE comprehension question in the SAME target language,
   with a short answerHint (a phrase or sentence from the passage that
   answers it).

Return ONLY a single JSON object — no prose, no explanation, no code fence,
nothing before or after it. The object must have EXACTLY this shape:
{
  "text": "<the passage, in the target language>",
  "comprehensionQuestions": [
    { "prompt": "<question, in the target language>", "answerHint": "<short answer hint>" }
  ]
}
```

## Generated prompt — user

```
Write the passage in the target language.
CEFR level: A1.
Modality: reading (will be read silently).
Known vocabulary: NONE
Target vocabulary (must appear in the passage): NONE
Learner interests (weave in loosely if it fits naturally, do not force it): football, NFL, esports, competitive gaming, sports statistics
```

## Builder notes

- Empty known vocabulary — exercises the complete-beginner branch.
- No target language set — falls back to "the target language".
- Anti-drift instruction: use ONLY provided vocabulary + basic function words.
