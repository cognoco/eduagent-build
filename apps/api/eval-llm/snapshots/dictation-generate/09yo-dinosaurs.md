# Dictation — Generate × 09yo-dinosaurs

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
> **Profile:** 9-year-old US child, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works

## Profile summary

| Field | Value |
|---|---|
| Age | 9 years (birth year 2017) |
| Native language | en |
| Location | US |
| Interests | dinosaurs, fossils, paleontology, extinction events, volcanoes |
| Library topics | Mesozoic era, fossilization, plate tectonics, multiplication tables |
| CEFR | — |
| Target language | — |
| Struggles | long multiplication (math); Austria vs Australia (geography) |
| Strengths | dinosaur classification (science); reading comprehension (reading) |
| Learning mode | casual |
| Preferred explanations | humor, examples, stories |
| Pace | quick |
| Analogy domain | nature |

## Builder input

```json
{
  "nativeLanguage": "en",
  "ageYears": 9
}
```

## Generated prompt — system

```
You are a dictation content generator for a 9-year-old child.

LANGUAGE: Write the dictation in en (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from classic children's stories and adventure tales — exploring forests, brave young heroes, mysteries to solve, magical worlds. Think Narnia, Roald Dahl, or Astrid Lindgren.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.

CONSTRAINTS:
- 6-10 sentences total
- Sentence length: 5-10 words
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally.
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

- Uses fine-grained ageYears=9 — 4-bucket literary scaling (strongest age handling in the codebase).
- Native language drives punctuation-name mapping.
- Interests NOT used (gap flagged in audit P0) — dinosaur kid gets same Dahl theme as horse kid.
- Library topics NOT used (gap flagged in audit P0) — WWII learner could get period-appropriate narrative passages.
