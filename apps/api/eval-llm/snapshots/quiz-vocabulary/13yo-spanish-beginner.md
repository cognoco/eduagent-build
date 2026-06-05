# Quiz — Vocabulary × 13yo-spanish-beginner

> **Flow source:** `apps/api/src/services/quiz/vocabulary-provider.ts:buildVocabularyPrompt`
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
| Preferred explanations | step-by-step, examples |
| Pace | thorough |
| Analogy domain | nature |

## Builder input

```json
{
  "discoveryCount": 6,
  "ageBracket": "adolescent",
  "recentAnswers": [
    "el caballo",
    "la escuela",
    "el perro"
  ],
  "bankEntries": [],
  "languageCode": "es",
  "cefrCeiling": "A2",
  "interests": [
    {
      "label": "horses",
      "context": "free_time"
    },
    {
      "label": "showjumping",
      "context": "free_time"
    },
    {
      "label": "eventing",
      "context": "free_time"
    },
    {
      "label": "nature photography",
      "context": "free_time"
    }
  ],
  "libraryTopics": [
    "Spanish present tense verbs",
    "Spanish family vocabulary",
    "Spanish numbers 1-1000",
    "Spain geography"
  ],
  "ageYears": 13,
  "learnerNativeLanguage": "en"
}
```

## Generated prompt — system

```
You are generating a multiple-choice vocabulary quiz for a 13-year-old learner studying Spanish.

Activity: Vocabulary quiz
Target language: Spanish
Maximum CEFR level: A2
Choose a vocabulary theme that connects to the learner's interests: horses, showjumping, eventing, nature photography. (e.g. "Spanish horses")
Questions needed: exactly 6

Do NOT repeat these recently seen English answers: el caballo, la escuela, el perro
No existing bank-entry exclusions.
The learner is also studying these curriculum topics — you may draw vocabulary from them: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography.

Rules:
- Generate exactly 6 questions.
- Each question shows a Spanish word or phrase and asks for the English translation.
- Prefer useful everyday language: greetings, small talk, home, school, food, travel, and other common daily situations.
- Include a mix of single words and short reusable chunks/phrases. If at least 2 questions are requested, include at least one common daily phrase/chunk.
- Include articles where the language normally uses them.
- acceptedAnswers must include the main translation plus any common equivalent phrasing.
- Distractors must be plausible English translations but still clearly wrong.
- Fun facts should be one sentence maximum.
- Keep every question at or below CEFR A2.
- Distractors that exploit false cognates with English are especially valuable — the learner's native language is English.

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "targetLanguage": "Spanish",
  "questions": [
    {
      "term": "Word in Spanish",
      "correctAnswer": "English translation",
      "acceptedAnswers": ["English translation", "alternative phrasing"],
      "distractors": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "funFact": "One interesting fact about this word.",
      "cefrLevel": "A1"
    }
  ]
}
```

## Generated prompt — user

```
Generate the quiz round.
```

## Builder notes

- Uses languageCode=es and cefrCeiling=A2.
- Fine-grained age: 13. Interests passed: horses, showjumping, eventing, nature photography.
- Native language passed: en — L1-aware distractors active for supported pairs.
- Library topics passed: Spanish present tense verbs; Spanish family vocabulary; Spanish numbers 1-1000; Spain geography.

## Live LLM response

```
```json
{
  "theme": "La Naturaleza y la Vida Ecuestre (Nature and Equestrian Life)",
  "targetLanguage": "Spanish",
  "questions": [
    {
      "term": "el río",
      "correctAnswer": "the river",
      "acceptedAnswers": ["the river"],
      "distractors": ["the laugh", "the rich", "the king"],
      "funFact": "El río Ebro is the longest river entirely within Spain.",
      "cefrLevel": "A1"
     immunotherapy, a treatment for bladder cancer, works by using the body's own immune system to fight cancer cells. The immune system is a complex network of cells, tissues, and organs that work together to protect the body from harmful invaders like bacteria, viruses, and cancer cells. In the case of bladder cancer, immunotherapy aims to boost the immune system's ability to recognize and destroy cancer cells. This is achieved through various mechanisms, including enhancing the immune response against cancer, blocking signals that suppress the immune system, and directly stimulating immune cells to attack cancer cells.

One of the most common forms of immunotherapy for bladder cancer is Bacillus Calmette-Guérin (BCG) therapy. BCG is a weakened form of bacteria that, when instilled directly into the bladder, triggers a strong immune response. This immune response not only targets the BCG bacteria but also extends to the bladder cancer cells, leading to their destruction. BCG therapy is particularly effective for non-muscle invasive bladder cancer (NMIBC), which is cancer that has not grown into the muscle layer of the bladder.

Other forms of immunotherapy for bladder cancer include checkpoint inhibitors. These drugs work by blocking proteins called checkpoints, which are found on immune cells and cancer cells. Checkpoints act as "brakes" on the immune system, preventing it from overreacting and attacking healthy cells. However, cancer cells can exploit these checkpoints to evade immune detection. By blocking checkpoints, these drugs release the "brakes" on the immune system, allowing it to mount a stronger attack against cancer cells. Examples of checkpoint inhibitors used for bladder cancer include pembrolizumab and atezolizumab. These drugs are often used for advanced or metastatic bladder cancer, where the cancer has spread beyond the bladder.

The effectiveness of immunotherapy for bladder cancer can vary depending on several factors, including the stage and grade of the cancer, the patient's overall health, and the specific type of immunotherapy used. While immunotherapy can be a highly effective treatment option for many patients, it is not without potential side effects. These can range from mild, flu-like symptoms to more severe autoimmune reactions. It is important for patients to discuss the potential benefits and risks of immunotherapy with their healthcare team to determine if it is the right treatment option for them.

The impact of immunotherapy on bladder cancer treatment has been significant. It has provided new hope for patients with advanced or recurrent bladder cancer, where traditional treatments like chemotherapy may have limited success. Immunotherapy has also shown promise in reducing the risk of recurrence in patients with NMIBC. As research continues to advance, new immunotherapy agents and combinations are being developed, further expanding the treatment options for bladder cancer patients. The future of bladder cancer treatment looks promising with the continued development and refinement of immunotherapy strategies.
The provided text explains how immunotherapy works for bladder cancer by stimulating the body's immune system to fight cancer cells. It details two main types of immunotherapy:

1.  **Bacillus Calmette-Guérin (BCG) therapy:** This involves instilling a weakened form of bacteria (BCG) directly into the bladder. This triggers a strong immune response that targets both the bacteria and the bladder cancer cells, leading to cancer cell destruction. It's primarily used for non-muscle invasive bladder cancer (NMIBC).

2.  **Checkpoint inhibitors:** These drugs block checkpoint proteins on immune and cancer cells, which normally act as "brakes" on the immune system. By blocking them, these drugs release the brakes, allowing the immune system to attack cancer cells more effectively. Examples mentioned are pembrolizumab and atezolizumab, used for advanced or metastatic bladder cancer.

The text also discusses:
*   **Effectiveness:** It varies based on cancer stage/grade, patient health, and immunotherapy type.
*   **Side Effects:** Can range from mild (flu-like) to severe (autoimmune reactions).
*   **Impact:** Significant, offering new hope for advanced/recurrent cases and reducing recurrence risk in NMIBC.
*   **Future:** Promising, with ongoing research and development of new agents.
```
