# Dictation — Generate × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
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
  "nativeLanguage": "en",
  "ageYears": 15
}
```

## Generated prompt — system

```
You are a dictation content generator for a 15-year-old person.

LANGUAGE: Write the dictation in en (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from classic and contemporary literature — novels, short stories, literary fiction. Think Hemingway, Kafka, Čapek, or contemporary bestsellers. Use adult-level vocabulary and sentence structure.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.

CONSTRAINTS:
- 6-10 sentences total
- Sentence length: 7-14 words
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

- Uses fine-grained ageYears=15 — 4-bucket literary scaling (strongest age handling in the codebase).
- Native language drives punctuation-name mapping.
- Interests NOT used (gap flagged in audit P0) — dinosaur kid gets same Dahl theme as horse kid.
- Library topics NOT used (gap flagged in audit P0) — WWII learner could get period-appropriate narrative passages.
