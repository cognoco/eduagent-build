# Dictation — Generate × 17yo-french-advanced

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
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
  "nativeLanguage": "cs",
  "ageYears": 17,
  "interests": [
    {
      "label": "French literature",
      "context": "free_time"
    },
    {
      "label": "philosophy",
      "context": "free_time"
    },
    {
      "label": "existentialism",
      "context": "free_time"
    },
    {
      "label": "creative writing",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Camus — L'Étranger",
    "French subjunctive",
    "essay structure",
    "Enlightenment thinkers"
  ]
}
```

## Generated prompt — system

```
You are a dictation content generator for a 17-year-old person.

LANGUAGE: Write the dictation in cs (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from classic and contemporary literature — novels, short stories, literary fiction. Think Hemingway, Kafka, Čapek, or contemporary bestsellers. Use adult-level vocabulary and sentence structure.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.
PERSONALIZATION: This learner loves: French literature, philosophy, existentialism, creative writing. Where it fits naturally within the age-appropriate literary register, theme the passage around these interests (e.g. a dinosaur-loving child should get a narrative set in prehistoric times, not a generic fantasy forest). Do NOT sacrifice sentence quality, complexity, or literary style to chase the interest theme.
LIBRARY TOPICS: The learner is currently studying: Camus — L'Étranger, French subjunctive, essay structure, Enlightenment thinkers. Prefer narrative themes that intersect with these topics where the literary register allows (e.g. a learner studying the Mesozoic era could get a passage set in prehistoric times).


CONSTRAINTS:
- 6-10 sentences total
- Sentence length: 7-14 words
- Target age-appropriate spelling patterns and vocabulary
- Punctuation: commas and periods always. Question marks occasionally. Colons and semicolons sparingly.
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

- Uses fine-grained ageYears=17 — 2-bucket literary scaling (≤13 chapter-book, >13 literary).
- Native language drives punctuation-name mapping.
- Interests wired (audit P0.1): French literature, philosophy, existentialism, creative writing.
- Library topics wired (audit P0.1): Camus — L'Étranger, French subjunctive, essay structure, Enlightenment thinkers.
