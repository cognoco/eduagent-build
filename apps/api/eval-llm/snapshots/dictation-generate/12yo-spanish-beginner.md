# Dictation — Generate × 12yo-spanish-beginner

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
> **Profile:** 12-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports

## Profile summary

| Field | Value |
|---|---|
| Age | 12 years (birth year 2014) |
| Native language | en |
| Location | EU |
| Interests | horses, showjumping, eventing, nature photography |
| Library topics | present tense verbs, family vocabulary, numbers 1-1000, Spain geography |
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
  "nativeLanguage": "en",
  "ageYears": 12
}
```

## Generated prompt — system

```
You are a dictation content generator for a 12-year-old child.

LANGUAGE: Write the dictation in en (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from children's novels and chapter books — school adventures, fantasy quests, historical stories, nature and discovery. Think Harry Potter, Percy Jackson, or Jules Verne.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.

CONSTRAINTS:
- 6-10 sentences total
- Sentence length: 5-10 words
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally. Colons and semicolons sparingly.
- Sentences must sound natural when read aloud — good rhythm, no awkward constructions
- Include 1-2 sentences that are slightly challenging (unusual spelling, tricky grammar)

For each sentence, also create a "withPunctuation" variant where punctuation marks are replaced with spoken words in the dictation language:
- In English: , → "comma", . → "period", ? → "question mark", ! → "exclamation mark"
- For other languages, use the standard spoken name for each punctuation mark in that language.

Count the words in each sentence (original text, not the punctuation variant).

CHUNKING FOR DICTATION PLAYBACK:
Split each sentence into natural spoken chunks for dictation. The child hears one chunk, writes it, then hears the next.
- Short sentences (up to 4 words including any trailing punctuation): return as a SINGLE chunk. Do not split.
- Longer sentences: break at natural phrase boundaries — clause edges, prepositional phrases, relative clauses. Think about where a teacher would naturally pause when dictating.
  Example: "A black cat that I usually see out of window is not there today." →
    chunks: ["A black cat", "that I usually see out of window", "is not there today."]
- Never break inside a noun phrase, verb phrase, or prepositional phrase.
- Each chunk should carry a complete thought fragment that a child can hold in working memory.
- Produce matching "chunksWithPunctuation" where punctuation in each chunk is replaced with spoken words (same rules as withPunctuation).

RESPOND WITH ONLY valid JSON:
{
  "sentences": [
    {
      "text": "original sentence.",
      "withPunctuation": "original sentence tečka",
      "wordCount": 2,
      "chunks": ["original sentence."],
      "chunksWithPunctuation": ["original sentence tečka"]
    }
  ],
  "title": "Short title for this dictation",
  "topic": "The literary theme you chose",
  "language": "en"
}
```

## Generated prompt — user

```
Generate a dictation for me.
```

## Builder notes

- Uses fine-grained ageYears=12 — 4-bucket literary scaling (strongest age handling in the codebase).
- Native language drives punctuation-name mapping.
- Interests NOT used (gap flagged in audit P0) — dinosaur kid gets same Dahl theme as horse kid.
- Library topics NOT used (gap flagged in audit P0) — WWII learner could get period-appropriate narrative passages.
