# Quiz — Guess Who × 11yo-czech-animals

> **Flow source:** `apps/api/src/services/quiz/guess-who-provider.ts:buildGuessWhoPrompt`
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
  "discoveryCount": 4,
  "ageBracket": "adolescent",
  "recentAnswers": [],
  "topicTitles": [
    "Czech reading comprehension",
    "basic fractions",
    "human body systems",
    "water cycle"
  ],
  "interests": [
    {
      "label": "horses",
      "context": "free_time"
    },
    {
      "label": "forest animals",
      "context": "free_time"
    },
    {
      "label": "nature journaling",
      "context": "free_time"
    },
    {
      "label": "drawing",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Czech reading comprehension",
    "basic fractions",
    "human body systems",
    "water cycle"
  ],
  "ageYears": 11
}
```

## Generated prompt — system

```
You are generating a clue-by-clue Guess Who quiz for a 11-year-old learner.

Activity: Guess Who
Choose a theme of famous people connected to the learner's interests: horses, forest animals, nature journaling, drawing.
Questions needed: exactly 4

No recent-person exclusions.
Topic hints from the learner's active curriculum: Czech reading comprehension; basic fractions; human body systems; water cycle. At least 2 of the 4 people MUST relate clearly to one or more of those topics.

Rules:
- Generate exactly 4 questions.
- Each question must be a real famous person who is broadly appropriate for a young learner.
- acceptedAliases must include common learner-typed variants such as surnames, titles, or short forms.
- clues must contain exactly 5 clues and get progressively easier from clue 1 to clue 5.
- clue 1 should be broad, clue 5 should be close to a giveaway.
- NEVER mention the person's canonical name or any accepted alias inside any clue.
- mcFallbackOptions must contain exactly 4 names total: the correct answer plus 3 plausible distractors from a related domain, era, or category.
- funFact should be a single short sentence under 200 characters.
- Include the person's era or century (e.g. "17th century", "19th century", "5th century BCE").

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "questions": [
    {
      "canonicalName": "Isaac Newton",
      "era": "17th century",
      "acceptedAliases": ["Newton", "Sir Isaac Newton"],
      "clues": ["Clue 1", "Clue 2", "Clue 3", "Clue 4", "Clue 5"],
      "mcFallbackOptions": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
      "funFact": "One short fact."
    }
  ]
}
```

## Generated prompt — user

```
Generate the quiz round.
```

## Builder notes

- Fine-grained age: 11. Interests passed: horses, forest animals, nature journaling, drawing.
- Library topics passed: Czech reading comprehension; basic fractions; human body systems; water cycle.
- Topic titles passed: Czech reading comprehension; basic fractions; human body systems; water cycle.

## Live LLM response

```
```json
{
  "theme": "Nature's Curious Minds and Artists",
  "questions": [
    {
      "canonicalName": "Leonardo da Vinci",
      "era": "15th-16th century",
      "acceptedAliases": ["Da Vinci", "Leonardo"],
      "clues": [
        "I was an incredibly curious person from Italy, living during the Renaissance.",
        "My notebooks are filled with inventions, scientific observations, and detailed drawings.",
        "I created famous artworks like the 'Mona Lisa' and 'The Last Supper.'",
        "I studied human anatomy extensively, sketching the body's systems with incredible detail.",
        "I also designed flying machines and studied how water moves, centuries before they were fully understood."
      ],
      "mcFallbackOptions": ["Leonardo da Vinci", "Michelangelo", "Raphael", "Donatello"],
      "funFact": "He famously wrote many of his private notes and journals in mirror writing!"
    },
    {
      "canonicalName": "Rachel Carson",
      "era": "20th century",
      "acceptedAliases": ["Carson", "Rachel Louise Carson"],
      "clues": [
        "I was an American marine biologist and writer.",
        "I wrote books that helped people understand how pesticides can harm nature and wildlife.",
        "My most famous book, published in 1962, warned about environmental dangers.",
        "I helped start the modern environmental movement and protected our planet.",
        "I opened people's eyes to the 'silent spring' that could result from pollution."
      ],
      "mcFallbackOptions": ["Rachel Carson", "Jane Goodall", "Sylvia Earle", "Dian Fossey"],
      "funFact": "She studied marine biology and was originally very interested in the ocean's mysteries."
    },
    {
      "canonicalName": "Beatrix Potter",
      "era": "19th-20th century",
      "acceptedAliases": ["Potter", "Helen Beatrix Potter"],
      "clues": [
        "I was a British author and illustrator, fascinated by nature and animals.",
        "I spent much of my childhood drawing and observing creatures in the countryside.",
        "My charming stories often feature anthropomorphic animals in clothes.",
        "One of my most famous characters is a mischievous rabbit wearing a blue jacket.",
        "I wrote and illustrated the beloved tales of Peter Rabbit and his friends."
      ],
      "mcFallbackOptions": ["Beatrix Potter", "A.A. Milne", "Lewis Carroll", "Dr. Seuss"],
      "funFact": "She was also a talented mycologist, studying and painting fungi."
    },
    {
      "canonicalName": "John James Audubon",
      "era": "18th-19th century",
      "acceptedAliases": ["Audubon", "J.J. Audubon"],
      "clues": [
        "I was an American ornithologist, naturalist, and painter, originally from Haiti.",
        "I dedicated my life to exploring the wilderness and documenting its winged inhabitants.",
        "I'm famous for my highly detailed, life-sized illustrations of North American birds.",
        "My most famous work is a collection of 435 hand-colored prints.",
        "The National Society for the protection of birds is named after me."
      ],
      "mcFallbackOptions": ["John James Audubon", "Charles Darwin", "Carl Linnaeus", "George Washington Carver"],
      "funFact": "To capture the precise details of birds, he sometimes wired them into lifelike positions."
    }
  ]
}
```
```
