# Dictation — Generate × 06yo-fairytales

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
> **Profile:** 6-year-old EU child, early reader, Czech native, loves fairy tales and animals, low cognitive load preferred

## Profile summary

| Field | Value |
|---|---|
| Age | 6 years (birth year 2020) |
| Native language | cs |
| Location | EU |
| Interests | fairy tales, horses, forest animals, drawing |
| Library topics | alphabet, counting to 20, farm animals |
| CEFR | — |
| Target language | — |
| Struggles | letter b vs d; silent letters (reading) |
| Strengths | rhyming words (reading) |
| Learning mode | casual |
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "nativeLanguage": "cs",
  "ageYears": 6
}
```

## Generated prompt — system

```
You are a dictation content generator for a 6-year-old child.

LANGUAGE: Write the dictation in cs (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from fairy tales, fables, and simple picture book stories — animals talking, magical adventures, friendship and kindness. Think Brothers Grimm, Aesop, or classic picture books.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.

CONSTRAINTS:
- 6-10 sentences total
- Sentence length: 4-7 words (short phrases a child can hold in memory)
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally.
- Sentences must sound natural when read aloud — good rhythm, no awkward constructions
- Include 1-2 sentences that are slightly challenging (unusual spelling, tricky grammar)

For each sentence, also create a "withPunctuation" variant where punctuation marks are replaced with spoken words in the dictation language:
- In Czech: , → "čárka", . → "tečka", ? → "otazník", ! → "vykřičník"
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
  "language": "cs"
}
```

## Generated prompt — user

```
Generate a dictation for me.
```

## Builder notes

- Uses fine-grained ageYears=6 — 4-bucket literary scaling (strongest age handling in the codebase).
- Native language drives punctuation-name mapping.
- Interests NOT used (gap flagged in audit P0) — dinosaur kid gets same Dahl theme as horse kid.
- Library topics NOT used (gap flagged in audit P0) — WWII learner could get period-appropriate narrative passages.
