# Dictation Mode

**Date:** 2026-04-16
**Status:** Draft
**Dependencies:** Gallery picker fix (item 1), Image pass-through to LLM (item 2)

## Summary

A dictation practice feature where the app reads text aloud at a configurable pace while the child writes on paper. Two modes: homework dictation (photograph a school text, app reads it back) and spontaneous dictation (LLM generates age-appropriate content from recent topics). Optional photo-based review lets the child check their work, with sentence-level remediation for mistakes.

## Entry Point

"Repeat & Review" on the `learn-new.tsx` screen becomes **"Practice"**. Always visible (no longer conditional on overdue topics). Opens a new Practice menu screen:

| Option              | Description                              | Status   |
| ------------------- | ---------------------------------------- | -------- |
| Review topics       | Relearn overdue topics or browse library | Existing |
| Dictation           | Dictation practice                       | New      |

Future items (quiz, flashcards) are added to this menu as they are built. No placeholders shown.

Tapping **Dictation** opens a choice screen:

| Option          | Flow                                          |
| --------------- | --------------------------------------------- |
| I have a text   | Camera -> OCR -> text preview -> playback      |
| Surprise me     | LLM generates content -> loading -> playback   |

Both paths converge on the same dictation playback screen.

## "I Have a Text" Flow

1. Child taps "I have a text."
2. Camera opens (reuses existing homework camera component).
3. Child photographs the dictation text from school.
4. OCR runs (ML Kit on-device + Gemini fallback -- existing pipeline).
5. Text preview screen: child sees extracted text and can edit OCR errors before starting.
6. Child taps "Start dictation."
7. Text is sent to `POST /dictation/prepare-homework` for sentence splitting and punctuation annotation.
8. Playback screen opens.

## "Surprise Me" Flow

1. Child taps "Surprise me."
2. Request sent to `POST /dictation/generate`.
3. Purposeful loading screen with two phases:
   - "Picking a topic..." then reveals the topic name (e.g., "Volcanoes!")
   - "Writing your dictation..."
4. Playback screen opens.

### Content Generation Constraints

The LLM prompt for `generate` includes explicit linguistic constraints:

- **Theme:** Pulled from the child's recent library topics (last 2-3 sessions).
- **Language:** Inferred from profile context (native language, subjects, chat history).
- **Sentence length:** Age-appropriate. 8-12 words for younger children, up to 20 for older.
- **Spelling patterns:** Targeted to the child's level.
- **Punctuation variety:** Commas, periods, question marks for younger children. Colons and semicolons only for older.
- **Rhythm:** Sentences must sound natural read aloud.
- **Length:** 6-12 sentences (roughly 2-4 minutes at slow pace).

## Text Preparation

Regardless of which flow was used, text is prepared into a structured format before playback begins.

**For "I have a text" (`prepare-homework`):** The LLM receives the OCR'd/edited text and:
- Splits into sentences intelligently (handling abbreviations, dialogue, numbers).
- Generates a punctuation-spoken variant of each sentence (e.g., "The dog **comma** who was very tired **comma** lay down **period**").
- Returns structured JSON.

**For "Surprise me" (`generate`):** The LLM generates content and returns the same structured format directly.

### Preparation Output Format

```json
{
  "sentences": [
    {
      "text": "The dog, who was very tired, lay down.",
      "withPunctuation": "The dog comma who was very tired comma lay down period",
      "wordCount": 8
    }
  ],
  "title": "A Tired Dog",
  "topic": "Animals",
  "language": "cs"
}
```

The client receives this JSON and drives the entire playback locally. No server calls during dictation.

## Dictation Playback Screen

### Layout

Minimal by design. The child is looking at their paper, not the phone.

```
+-----------------------------------+
| [Pace] [Punctuation]     4 / 12  |  <- top control strip
|-----------------------------------|
|                                   |
|              * * *                |  <- sentence (hidden, tap to peek)
|                                   |
|                                   |
|      TAP ANYWHERE TO PAUSE        |  <- entire area is pause target
|                                   |
|                                   |
|          [ Repeat ]               |  <- large repeat button
|                                   |
+-----------------------------------+
```

### Tap Zones

Explicit and non-conflicting:
- **Top strip:** Pace indicator (tappable, cycles presets) and punctuation toggle (tappable). Taps here trigger the control action, not pause.
- **Everything below the top strip except the repeat button:** Tap to pause/resume.
- **Repeat button:** Large target at bottom. Tap replays the current sentence from the start.

No swipe gestures. Accidental swipes while the phone is on a desk are too likely.

### Current Sentence Display

Hidden by default (shows dots). Child can tap the sentence area to peek at the text. Optional per-profile setting to always show the sentence text during playback.

### Pace Presets

All presets are well below natural speech speed. Writing is slow.

| Preset   | Label             | Speech rate | Pause formula               | Default for       |
| -------- | ----------------- | ----------- | --------------------------- | ----------------- |
| Slow     | I'm just starting | ~0.5x       | `base + wordCount * 1.5s`   | Younger / A1-A2   |
| Normal   | I can keep up     | ~0.6x       | `base + wordCount * 1.0s`   | Middle / B1       |
| Fast     | Challenge me      | ~0.75x      | `base + wordCount * 0.7s`   | Older / B2+       |

Stored per profile in SecureStore (`dictation-pace-${profileId}`). Adjustable mid-session via top strip.

The `base` pause constant (roughly 1-2 seconds of silence before word-count scaling begins) and all multipliers are initial estimates. Tune through real testing with children.

### Punctuation Read-Aloud

- Toggle in top strip. Default ON for younger children and lower levels.
- When ON, TTS reads the `withPunctuation` variant.
- When OFF, TTS reads plain `text` -- child infers punctuation from intonation.
- Stored per profile in SecureStore (`dictation-punctuation-${profileId}`).

### Playback Sequence

1. Brief countdown: "Ready? 3... 2... 1..."
2. TTS reads sentence 1 at the selected speech rate.
3. Pause for the calculated duration (pace preset + word count).
4. TTS reads sentence 2.
5. Repeat until the last sentence.
6. Completion chime. Transition to review prompt.

### Interaction During Playback

| Action         | Trigger                                     | Effect                                 |
| -------------- | ------------------------------------------- | -------------------------------------- |
| Pause          | Tap anywhere (below top strip, not repeat)  | Freezes immediately, even mid-sentence |
| Resume         | Tap anywhere again                          | Picks up where it left off             |
| Repeat         | Tap repeat button                           | Replays current sentence from start    |
| Change pace    | Tap pace indicator in top strip             | Cycles slow -> normal -> fast          |
| Toggle punct.  | Tap punctuation icon in top strip           | Switches read-aloud on/off             |

No voice commands in v1. TTS audio would interfere with STT (echo cancellation needed). Tap controls only.

No skip sentence in v1. If the child wants to move on, they pause and wait for the next auto-advance. Deliberate skip is a future enhancement.

## Review and Remediation

After the last sentence, the screen shows:

> "Well done! Want to check your work?"
> - **Check my writing** (opens camera)
> - **I'm done** (exits to practice menu)

### Photo Review Flow

1. Camera opens. Child photographs their handwritten dictation.
2. Image (base64) + original text sent to the API as a session exchange.
3. The LLM receives both the photo (multimodal vision) and the original sentences as context.
4. LLM compares the handwriting to the original and returns structured feedback.

This depends on the image pass-through feature (item 2) being complete. Until then, review is unavailable and the "Check my writing" option is hidden.

### Review Screen

- **Score summary** at top: "2 mistakes in 12 sentences" or "Perfect!"
- **List of mistake sentences** with the error word highlighted.
- **Per mistake:** The sentence, what went wrong, the correction, and a brief grammatical explanation. Especially important for inflected languages (e.g., why "mesete" not "mesto" in locative case).

### Remediation

For each mistake:
1. The full sentence is displayed with the mistake word highlighted.
2. The child retypes the entire sentence (not just the word). Reinforces the correct form in grammatical context.
3. **Autocorrect is disabled** on the text input. The point is the child writing the correct form themselves.
4. **App accepts whatever they type.** The value is in the focused rewriting act. No correction loop. If they mistype again, the correct sentence is shown after submission and they move on.

After all corrections: celebration screen.

### Celebration and Streaks

- **Perfect score:** Celebration animation.
- **Mistakes corrected:** Encouraging message ("You fixed all 2 mistakes!").
- **Streak tracks consecutive days of dictation practice**, not consecutive perfect scores. Rewards showing up. A short easy dictation and a long hard one both count as one day.
- Streak stored per profile.

## Data Model and API

### New API Endpoints

**`POST /dictation/prepare-homework`**

Sentence splitting and punctuation annotation of existing text.

- Input: `{ text: string }`
- Output: `{ sentences: [{ text: string, withPunctuation: string, wordCount: number }] }`
- LLM prompt: restructuring only. Fast.
- Timeout: standard.

**`POST /dictation/generate`**

Content generation from scratch using profile context.

- Input: `{ profileId }` (context pulled server-side from recent sessions/topics)
- Output: `{ sentences: [...], title: string, topic: string, language: string }`
- LLM prompt: content generation with full linguistic constraints.
- Timeout: extended (expect 3-5 seconds).

Two separate endpoints because they have different prompts, latency profiles, token costs, and failure modes.

### Review

Creates a real `learning_sessions` row with `sessionType = 'homework'` and `effectiveMode = 'dictation'`. The review exchange sends the photo + original text as a multimodal message. The LLM responds with structured feedback. This gives us session history, event tracking, and a natural home for the remediation exchanges that follow.

### Stored Preferences (SecureStore, per profile)

- `dictation-pace-${profileId}`: `'slow' | 'normal' | 'fast'`
- `dictation-punctuation-${profileId}`: `boolean`

### Dictation History

For streak tracking. Entries in `session_events` or a lightweight `dictation_results` table:

| Field         | Type    | Description                        |
| ------------- | ------- | ---------------------------------- |
| profileId     | string  | Child's profile                    |
| date          | date    | Day of practice                    |
| sentenceCount | number  | How many sentences in the dictation|
| mistakeCount  | number  | Mistakes found (null if not reviewed) |
| mode          | enum    | `'homework'` or `'surprise'`       |
| reviewed      | boolean | Whether the child checked their work |

## Dependencies and Build Order

| Dependency              | Required for                          | Status              |
| ----------------------- | ------------------------------------- | ------------------- |
| Gallery picker fix      | "I have a text" via gallery           | Planned (item 1)    |
| Image pass-through      | Review step (LLM sees photo)          | Planned (item 2)    |
| Dictation playback      | Core feature (works without above)    | New                 |
| Practice menu screen    | Entry point                           | New                 |

### Build Order

1. Practice menu screen (rename "Repeat & review" to "Practice," new route).
2. `POST /dictation/prepare-homework` endpoint + LLM prompt.
3. `POST /dictation/generate` endpoint + LLM prompt (separate prompt, separate timeout).
4. Dictation playback screen (TTS engine, pacing, tap zones).
5. "I have a text" flow (camera -> OCR -> prepare -> playback).
6. "Surprise me" flow (generate -> loading screen with topic reveal -> playback).
7. Review and remediation (depends on image pass-through).
8. Streak tracking and celebration.

## Failure Modes

| State                    | Trigger                            | User sees                                                    | Recovery                                     |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| OCR fails                | Camera photo unreadable            | "Couldn't read the text. Try better lighting?"               | Retake photo or type text manually           |
| Prepare fails            | API error splitting text           | "Something went wrong preparing your dictation"              | Retry + go back                              |
| Generation fails         | API error on "Surprise me"         | "Couldn't create a dictation right now"                      | Retry + "I have a text" fallback             |
| Generation slow          | LLM taking >5s                     | Loading screen stays ("Still writing...")                    | Auto-retry once, then error with retry       |
| TTS unavailable          | Device TTS engine missing          | "Your device can't read text aloud"                          | Link to device TTS settings                  |
| Network lost mid-prepare | Connection drops during LLM call   | "Connection lost"                                            | Retry + go back                              |
| Network lost in playback | N/A (playback is fully offline)    | No impact                                                    | --                                           |
| Handwriting unreadable   | LLM can't interpret the photo      | "Couldn't read your writing clearly. Try another photo?"     | Retake photo or skip review                  |
| Review API fails         | Network/server error during review | "Couldn't check your work right now"                         | Retry or tap "I'm done"                      |

## Out of Scope -- Future Enhancements

- **Voice commands** during playback (needs echo cancellation or wake-word system).
- **Clause-level repeat** (replay just the last phrase, not the full sentence).
- **Skip sentence** button.
- **Timed challenge mode** (no manual pause, for advanced learners).
- **Keyboard correction loop** in remediation (checking retyped sentence accuracy).
- **Teacher/parent assignment** flow (parent picks text and assigns to child).
- **Dictation analytics** (common mistake patterns, weak spelling areas over time).
- **Always-show sentence** setting (currently peek-on-tap only).
