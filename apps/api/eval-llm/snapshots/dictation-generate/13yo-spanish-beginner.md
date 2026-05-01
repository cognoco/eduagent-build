# Dictation — Generate × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/dictation/generate.ts:buildGeneratePrompt`
> **Profile:** 13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports

## Profile summary

| Field | Value |
|---|---|
| Age | 13 years (birth year 2013) |
| Native language | en |
| Conversation language | en |
| Location | EU |
| Pronouns | she/her |
| Interests | horses (free time), showjumping (free time), eventing (free time), nature photography (free time) |
| Library topics | Spanish present tense verbs, Spanish family vocabulary, Spanish numbers 1-1000, Spain geography |
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
  "ageYears": 13,
  "interests": [
    {
      "label": {
        "label": "horses",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "showjumping",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "eventing",
        "context": "free_time"
      },
      "context": "free_time"
    },
    {
      "label": {
        "label": "nature photography",
        "context": "free_time"
      },
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Spanish present tense verbs",
    "Spanish family vocabulary",
    "Spanish numbers 1-1000",
    "Spain geography"
  ]
}
```

## Generated prompt — system

```
You are a dictation content generator for a 13-year-old child.

LANGUAGE: Write the dictation in en (ISO 639-1 code).

THEME: Write sentences inspired by age-appropriate literature and stories.
Draw from children's novels and chapter books — school adventures, fantasy quests, historical stories, nature and discovery. Think Harry Potter, Percy Jackson, or Jules Verne.
Write sentences that feel like they come from a story — natural prose with vivid imagery.
Do NOT use geographical, scientific, or encyclopaedia-style factual content.
PERSONALIZATION: This learner loves: [object Object], [object Object], [object Object], [object Object]. Where it fits naturally within the age-appropriate literary register, theme the passage around these interests (e.g. a dinosaur-loving child should get a narrative set in prehistoric times, not a generic fantasy forest). Do NOT sacrifice sentence quality, complexity, or literary style to chase the interest theme.
LIBRARY TOPICS: The learner is currently studying: Spanish present tense verbs, Spanish family vocabulary, Spanish numbers 1-1000, Spain geography. Prefer narrative themes that intersect with these topics where the literary register allows (e.g. a learner studying the Mesozoic era could get a passage set in prehistoric times).


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

- Uses fine-grained ageYears=13 — 2-bucket literary scaling (≤13 chapter-book, >13 literary).
- Native language drives punctuation-name mapping.
- Interests wired (audit P0.1): [object Object], [object Object], [object Object], [object Object].
- Library topics wired (audit P0.1): Spanish present tense verbs, Spanish family vocabulary, Spanish numbers 1-1000, Spain geography.
