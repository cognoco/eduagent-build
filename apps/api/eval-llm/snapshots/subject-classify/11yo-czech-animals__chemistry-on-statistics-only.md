# Subject classification (enrolled-subject relevance) × 11yo-czech-animals · chemistry-on-statistics-only

> **Flow source:** `apps/api/src/services/subject-classify.ts:classifySubject`
> **Profile:** 11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer
> **Scenario:** `chemistry-on-statistics-only`

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
| Preferred explanations | stories, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "subjects": [
    {
      "id": "00000000-0000-7000-8000-0000000000a1",
      "name": "Statistics"
    }
  ],
  "text": "Balance this chemical equation: H2 + O2 -> H2O",
  "expectation": {
    "kind": "no-match"
  }
}
```

## Generated prompt — system

```
You are a subject classifier for a tutoring platform.

Given a piece of text (homework problem, question, or conversation) and a list of the student's enrolled subjects, determine which subject(s) the text belongs to.

Return ONLY a JSON object with this structure:
{
  "matches": [
    { "subjectName": "Exact Subject Name from list", "confidence": 0.0-1.0 }
  ],
  "suggestedSubjectName": "Name if no match found, or null"
}

Rules:
- confidence should be 0.0-1.0 where 1.0 = certain match. Confidence reflects how strong the GENUINE relationship is between the text and the subject — never how much you want to find a match.
- If the text clearly matches one subject, return that with high confidence (>= 0.85)
- If the text could match multiple subjects, return all with their respective confidences
- If the text does NOT genuinely relate to any enrolled subject, return empty matches. Returning no match is a correct, expected answer — do NOT force-fit the text to an unrelated enrolled subject just to avoid an empty list. Example: a question about water on an account whose only enrolled subject is "Statistics" has NO match — return empty matches, never "Statistics".
- Whenever matches is empty you MUST suggest a fitting new subject name in "suggestedSubjectName" (e.g. water -> "Science", Easter -> "Religious Studies") — never leave it null when matches is empty.
- Match against the EXACT subject names provided — don't invent new ones for matches
- Match generously WHEN THERE IS GENUINE TOPICAL RELATEDNESS — think broadly about what truly relates to each subject:
  - Cultural topics (Easter, Christmas, Ramadan, Diwali, Thanksgiving) relate to History, Religious Studies, Social Studies, Cultural Studies
  - Current events relate to Social Studies, Geography, Politics, Civics
  - Animals, plants, weather relate to Biology, Science, Nature Studies, Geography
  - Electricity, circuits, magnetism, inventions, technology history, Tesla/Edison, "War of Currents" relate to Physics, Science, History of Technology, or History
  - Music, art, film relate to Art, Music, Cultural Studies, Media Studies
  - Sports relate to Physical Education, Biology (biomechanics), Physics (motion)
  - Cooking, nutrition relate to Chemistry, Biology, Home Economics
  - "solve 2x + 5 = 15" matches "Algebra", "Math", "Mathematics" etc.
- This generosity applies ONLY to genuine cross-disciplinary overlap. It is NOT a licence to attach unrelated text to whatever subject happens to be enrolled. When the choice is between a weak forced match and no match, choose no match and suggest a new subject.

```

## Generated prompt — user

```
Student's enrolled subjects:
- Statistics

Text to classify:
Balance this chemical equation: H2 + O2 -&gt; H2O
```

## Builder notes

- Enrolled: Statistics
- Expected: NO match (empty candidates after floor) + new-subject suggestion
- Floor=0.5 AutoPick=0.88

## Live LLM response

```
```json
{
  "matches": [],
  "suggestedSubjectName": "Chemistry"
}
```
```
