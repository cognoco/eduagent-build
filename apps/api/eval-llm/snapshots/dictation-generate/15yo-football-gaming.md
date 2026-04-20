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
  "ageYears": 15,
  "interests": [
    {
      "label": {
        "label": "football",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "NFL",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "esports",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "competitive gaming",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "sports statistics",
        "context": "both"
      },
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "algebra equations",
    "US history: Civil War",
    "physics: forces and motion"
  ]
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
PERSONALIZATION: This learner loves: [object Object], [object Object], [object Object], [object Object], [object Object]. Where it fits naturally within the age-appropriate literary register, theme the passage around these interests (e.g. a dinosaur-loving child should get a narrative set in prehistoric times, not a generic fantasy forest). Do NOT sacrifice sentence quality, complexity, or literary style to chase the interest theme.
LIBRARY TOPICS: The learner is currently studying: algebra equations, US history: Civil War, physics: forces and motion. Prefer narrative themes that intersect with these topics where the literary register allows (e.g. a learner studying the Mesozoic era could get a passage set in prehistoric times).


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

- Uses fine-grained ageYears=15 — 2-bucket literary scaling (≤13 chapter-book, >13 literary).
- Native language drives punctuation-name mapping.
- Interests wired (audit P0.1): [object Object], [object Object], [object Object], [object Object], [object Object].
- Library topics wired (audit P0.1): algebra equations, US history: Civil War, physics: forces and motion.
