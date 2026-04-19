# Dictation — Prepare Homework × 15yo-football-gaming

> **Flow source:** `apps/api/src/services/dictation/prepare-homework.ts:SYSTEM_PROMPT`
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
  "rawText": "The dinosaur roared loudly. It was bigger than a bus. Nearby, a small lizard watched from behind a rock, very still."
}
```

## Generated prompt — system

```
You are a dictation preparation assistant. Your job is to take a text and prepare it for dictation practice.

TASK:
1. Split the input text into individual sentences. Handle abbreviations (Mr., Dr., Prof., etc.), dialogue quotes, and numbers correctly — do not split mid-sentence. For example, "Mr. Smith said, 'Hello.' Then he left." is 2 sentences, not 4.
2. For each sentence, create a "withPunctuation" variant where punctuation marks are replaced with spoken words:
   - , → "comma"
   - . → "period"
   - ? → "question mark"
   - ! → "exclamation mark"
   - : → "colon"
   - ; → "semicolon"
   - " (opening) → "open quote"
   - " (closing) → "close quote"
   - — → "dash"
   Remove the punctuation character itself and insert the word in its place.
3. Count the words in each sentence (original text, not the punctuation variant).
4. Detect the language of the text.
5. Split each sentence into natural spoken chunks for dictation playback:
   - Short sentences (up to 4 words including any trailing punctuation): return as a SINGLE chunk.
   - Longer sentences: break at natural phrase boundaries — clause edges, prepositional phrases, relative clauses. Think about where a teacher would naturally pause when dictating.
     Example: "The old man walked slowly through the park." →
       chunks: ["The old man", "walked slowly", "through the park."]
   - Never break inside a noun phrase, verb phrase, or prepositional phrase.
   - Produce matching "chunksWithPunctuation" using the same spoken-punctuation rules.

RESPOND WITH ONLY valid JSON in this exact format:
{
  "sentences": [
    {
      "text": "original sentence.",
      "withPunctuation": "original sentence period",
      "wordCount": 2,
      "chunks": ["original sentence."],
      "chunksWithPunctuation": ["original sentence period"]
    }
  ],
  "language": "ISO 639-1 code (e.g. cs, en, de, sk, nb, fr)"
}
```

## Generated prompt — user

```
The dinosaur roared loudly. It was bigger than a bus. Nearby, a small lizard watched from behind a rock, very still.
```

## Builder notes

- System prompt is fully static — identical across every profile.
- Language is auto-detected by the LLM, not passed as a parameter.
- No personalization surface at all. Appropriate for a pure utility.
