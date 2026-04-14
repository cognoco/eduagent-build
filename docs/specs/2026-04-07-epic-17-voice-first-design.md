# Epic 17: Voice-First Learning — Talk to Your Mentor

**Date:** 2026-04-07
**Status:** Draft
**FRs:** FR243-FR261 (19 FRs)
**Dependencies:** Epic 8 (voice infrastructure — complete), Epic 6 (language learning), Epic 13 (session lifecycle), Epic 12 (persona removal / birth year)

---

## 1. Problem Statement

Children naturally learn through conversation, not typing. The current app treats voice as an optional input method (Epic 8), but the default experience is still text-based. This creates five problems:

| Problem | Impact |
|---------|--------|
| Younger children (11-13) type slowly | Friction kills engagement — sessions feel tedious, not conversational |
| Text-based chat feels like "using an app" | No emotional connection to the mentor; easy to disengage |
| Voice output is missing | The mentor "speaks" only as text — no conversational feel |
| No voice-native UX patterns | No waveform feedback, no interruption handling, no thinking indicators |
| Epic 8 added voice as an option, not the default | Children who would benefit most from voice never discover it |

**The key insight:** a child who TALKS to their mentor has a fundamentally different relationship than one who types. It transforms "using an app" into "talking to my teacher." That emotional connection is what creates attachment and sustained engagement.

**Distinction from Epic 8:** Epic 8 was "voice as an option" — on-device STT via `expo-speech-recognition`, on-device TTS via `expo-speech`, a text/voice toggle, and a playback bar. Epic 17 is "voice as the primary experience" — server-side streaming STT for better accuracy with children's speech, server-side TTS for voice persona selection, voice-optimized LLM prompting, pronunciation practice, voice-based recall, and a hands-free mode.

---

## 2. What Already Exists (Epic 8 Audit)

Epic 8 delivered the following voice infrastructure (all shipped and tested):

| Component | File | What it does |
|-----------|------|-------------|
| `useSpeechRecognition` hook | `apps/mobile/src/hooks/use-speech-recognition.ts` | On-device STT via `expo-speech-recognition`. Manual start/stop, no VAD. Lazy-loads the native module. Interim results supported. |
| `useTextToSpeech` hook | `apps/mobile/src/hooks/use-text-to-speech.ts` | On-device TTS via `expo-speech`. Pause/resume/replay/rate control. Option A: waits for complete response before speaking. |
| `VoiceRecordButton` | `apps/mobile/src/components/session/VoiceRecordButton.tsx` | Animated mic button with pulse effect. Haptic feedback on start/stop. |
| `VoiceTranscriptPreview` | `apps/mobile/src/components/session/VoiceRecordButton.tsx` | Shows transcript before sending. Send / Re-record / Discard actions. |
| `VoicePlaybackBar` | `apps/mobile/src/components/session/VoicePlaybackBar.tsx` | TTS controls: replay, pause/resume, stop, speed (0.75x/1.0x/1.25x). Screen reader awareness. |
| `VoiceToggle` | `apps/mobile/src/components/session/VoiceToggle.tsx` | Header toggle for AI TTS mute/unmute. Session-scoped. |
| `SessionInputModeToggle` | `apps/mobile/src/components/session/SessionInputModeToggle.tsx` | Text/Voice segmented pill at session start. Imports `InputMode` from `@eduagent/schemas`. |
| `inputMode` on sessions | DB column + schema | `text` or `voice` persisted per session. |
| `haptics` utility | `apps/mobile/src/lib/haptics.ts` | `hapticLight`, `hapticMedium`, `hapticSuccess` — fire-and-forget haptic feedback. |
| `language-locales` | `apps/mobile/src/lib/language-locales.ts` | Maps language codes to STT/TTS locales (13 languages). |

**What Epic 8 did NOT deliver (deferred or out of scope):**
- Voice Activity Detection (VAD) — FR148, stretch goal
- Streaming TTS (start speaking before full LLM response) — documented upgrade path only
- Server-side STT (better accuracy for children's speech)
- Voice persona selection (warm, patient, energetic)
- Voice-optimized LLM prompts (shorter responses, conversational tone)
- VoiceOver/TalkBack coexistence — deferred, needs physical device spike
- Auto-suggest voice mode for younger children
- Hands-free continuous conversation mode
- Pronunciation comparison for language learning

---

## 3. Design Principles

1. **Voice should feel like a conversation, not a voice command interface.** No "say a command" prompts. Natural dialogue flow with the mentor.
2. **The mentor's voice should match the child's expectations.** Warm, patient, encouraging. Configurable personas — not one-size-fits-all.
3. **Text remains available — voice enhances, never gates.** Every voice feature has a text fallback. No feature is voice-only.
4. **Latency is the enemy.** Optimize for fast response times at every stage. Streaming STT, streaming LLM, streaming TTS. Start speaking before the full response is generated.
5. **Visual feedback during voice.** Waveform animation while recording, live transcript, thinking indicator, playback progress. The screen is never blank and silent.
6. **Offline graceful degradation.** When voice is unavailable (no network, no permission, noisy environment), show clear guidance and fall back to text. Never a dead end.
7. **Privacy by design.** Audio is processed server-side for quality, but never stored permanently. GDPR compliant. Parental consent required for voice features with children under 16.

---

## 4. Story Overview

| Story | Title | Phase | FRs | Status |
|-------|-------|-------|-----|--------|
| 17.1 | Voice-First Chat Mode Toggle | A — Input | FR243-FR245 | PLANNED |
| 17.2 | Streaming Speech-to-Text Integration | A — Input | FR246-FR248 | PLANNED |
| 17.3 | Voice Input UX Polish | A — Input | FR249-FR251 | PLANNED |
| 17.4 | Text-to-Speech for Mentor Responses | B — Output | FR252-FR253 | PLANNED |
| 17.5 | Voice Persona Configuration | B — Output | FR254-FR255 | PLANNED |
| 17.6 | Conversational Flow Optimization | B — Output | FR256-FR257 | PLANNED |
| 17.7 | Pronunciation Practice (Language Learning) | C — Native | FR258 | PLANNED |
| 17.8 | Voice-Based Recall Testing | C — Native | FR259 | PLANNED |
| 17.9 | Hands-Free Learning Mode | C — Native | FR260-FR261 | PLANNED |

---

## 5. Execution Order

```
Phase A: Voice Input Enhancement (17.1 → 17.2 → 17.3)
  └── Foundation: voice input is the prerequisite for everything else

Phase B: Voice Output (17.4 → 17.5 → 17.6)
  └── Completes the conversational loop: child speaks, mentor speaks back

Phase C: Voice-Native Features (17.7, 17.8, 17.9 — can run in parallel)
  └── Requires both input and output from Phases A + B
```

Phase A is the foundation. Phase B completes the experience. Phase C builds features that only make sense when voice is the primary modality.

---

## 6. Phase A — Voice Input Enhancement

### Story 17.1: Voice-First Chat Mode Toggle

**FRs:** FR243, FR244, FR245

Enhance the existing `SessionInputModeToggle` to make voice the suggested default for younger children and add voice-activity-detection as a configurable option.

#### FR243: Age-Aware Voice Mode Suggestion

- When a child aged 11-13 (computed from `birthYear` on profile) starts their first session, the app displays a one-time prompt: "Would you like to talk to your mentor instead of typing? You can always switch back."
- If accepted, `inputMode` defaults to `'voice'` for future sessions on that profile.
- The suggestion stores a `voiceModeSuggested` flag in `AsyncStorage` (per profile) so it only shows once.
- Children 14+ and adults see the existing neutral toggle (no suggestion).

**Acceptance Criteria:**

```gherkin
Given a learner with birthYear indicating age 11-13
And they have never seen the voice suggestion before
When they open a new session
Then a voice suggestion card appears above the input mode toggle
And it reads "Would you like to talk instead of typing?"
And tapping "Yes" sets inputMode to 'voice' and persists the preference
And tapping "No thanks" dismisses the card and keeps 'text' default
And the card never appears again for this profile

Given a learner aged 14 or older
When they open a new session
Then no voice suggestion card appears
And the neutral text/voice toggle is shown as today
```

#### FR244: Voice-Activity Detection (VAD) Mode

- Add a user-configurable option: "Auto-send when I stop talking" (push-to-talk vs VAD).
- Push-to-talk (default): tap mic to start, tap to stop. Existing behavior from Epic 8.
- VAD mode: recording starts on tap, auto-stops after configurable silence threshold (default 1.5s, range 1.0s-3.0s).
- VAD detection runs client-side using audio level monitoring (no server round-trip for silence detection).
- Setting stored per-profile in `AsyncStorage` under key `voice.vadEnabled` and `voice.silenceThresholdMs`.

**Acceptance Criteria:**

```gherkin
Given voice mode is enabled and VAD is turned on
When the learner taps the mic button and speaks
Then recording starts with visual feedback
And when 1.5s of silence is detected
Then recording auto-stops
And the transcript preview appears for confirmation

Given voice mode is enabled and VAD is off (push-to-talk)
When the learner taps the mic button and speaks
Then recording starts
And recording continues until the learner taps the mic button again
```

#### FR245: Voice Mode Persistence Across Sessions

- When a learner uses voice mode in a session, the next session defaults to `inputMode: 'voice'`.
- The preference is stored per-profile (not per-session) in `AsyncStorage` under key `voice.preferredInputMode`.
- The `SessionInputModeToggle` reads this preference on mount.
- Changing the toggle updates both the current session and the stored preference.

**Acceptance Criteria:**

```gherkin
Given a learner who used voice mode in their previous session
When they start a new session
Then the input mode toggle defaults to 'voice'
And the voice record button is shown instead of the text input

Given a learner who switches from voice to text mid-session
When they start a new session
Then the input mode toggle defaults to 'text'
```

---

### Story 17.2: Streaming Speech-to-Text Integration

**FRs:** FR246, FR247, FR248

Replace or augment on-device STT with server-side streaming STT for better accuracy with children's speech.

#### FR246: Server-Side STT API Route

- New API route: `POST /v1/voice/transcribe` — accepts chunked audio upload (WebSocket or chunked HTTP).
- Backend integrates with a streaming STT provider (Whisper API or Deepgram).
- Returns partial transcripts as they become available (server-sent events or WebSocket messages).
- Language-aware: accepts `lang` parameter for target language (uses existing `language-locales` mapping).
- Falls back to on-device `expo-speech-recognition` if server is unreachable (network error, timeout).

**Acceptance Criteria:**

```gherkin
Given a learner recording voice input
When audio chunks are streamed to the server
Then partial transcripts appear on screen in real-time (< 500ms latency from speech)
And the final transcript is returned when recording stops

Given the server is unreachable
When the learner starts recording
Then on-device STT activates as fallback
And a subtle indicator shows "Using on-device recognition"
```

#### FR247: Children's Speech Handling

- Configure STT model/settings for children's speech patterns (less clear pronunciation, higher pitch, shorter utterances).
- If STT confidence is below threshold (< 0.6), show a gentle prompt: "I didn't quite catch that. Could you say it again?" instead of sending garbled text.
- Track STT accuracy metrics per profile (server-side) to tune settings over time.

**Acceptance Criteria:**

```gherkin
Given a child speaks with unclear pronunciation
When the STT confidence score is below 0.6
Then the app shows "I didn't quite catch that. Could you say it again?"
And the mic button pulses to invite retry
And no message is sent to the mentor

Given a child speaks clearly
When the STT confidence score is 0.6 or above
Then the transcript preview appears normally
```

#### FR248: Multi-Language STT for Language Learning

- When the session subject has `pedagogyMode = 'four_strands'`, STT language is set to the target language (not the device language).
- The learner can switch STT language mid-session via a language indicator badge on the mic button.
- For mixed-language sessions (e.g., explaining grammar in English while practicing Spanish), support automatic language detection or manual toggle.

**Acceptance Criteria:**

```gherkin
Given a learner in a Spanish language-learning session
When they tap the mic button to speak
Then STT processes audio in Spanish (es-ES)
And the language badge on the mic shows "ES"

Given a learner taps the language badge
When they select their native language
Then STT switches to process audio in the native language
And the badge updates to reflect the change
```

---

### Story 17.3: Voice Input UX Polish

**FRs:** FR249, FR250, FR251

#### FR249: Animated Waveform During Recording

- Replace the existing pulse animation on `VoiceRecordButton` with a real-time audio waveform visualization.
- The waveform reflects actual audio input levels (not a static animation).
- Uses `react-native-reanimated` for 60fps rendering.
- The waveform is contained within the recording area — does not overlay other UI.

**Acceptance Criteria:**

```gherkin
Given the learner is recording voice input
When they speak
Then an animated waveform displays above the mic button
And the waveform amplitude corresponds to the actual audio input level
And the waveform renders at 60fps without jank

Given the learner stops speaking but is still recording
Then the waveform shows near-zero amplitude (flat line)
```

#### FR250: Cancel Gesture and Thinking State

- Swipe-left on the recording area cancels the recording (discards audio, no transcript).
- Haptic feedback on cancel gesture (`hapticLight`).
- After recording stops and before transcript appears, show a "Thinking..." state with a subtle animation.
- The thinking state has a 15-second timeout — if STT takes longer, show "Taking a bit longer than usual..." with a cancel button.

**Acceptance Criteria:**

```gherkin
Given the learner is recording
When they swipe left on the recording area
Then the recording is cancelled
And no transcript is shown
And haptic feedback fires
And the mic returns to idle state

Given the learner stops recording
When STT is processing the audio
Then a "Thinking..." indicator appears with a subtle animation
And if processing exceeds 15 seconds
Then the text changes to "Taking a bit longer than usual..."
And a "Cancel" button appears
```

#### FR251: Real-Time Transcript Display

- As server-side STT returns partial transcripts (FR246), display them in a dedicated transcript area above the mic button.
- Partial text renders in a lighter style (e.g., `text-text-secondary` with italic).
- Final transcript renders in normal style (`text-text-primary`).
- The transcript area auto-scrolls to keep the latest text visible.
- Minimum touch target maintained on all interactive elements (44px).

**Acceptance Criteria:**

```gherkin
Given the learner is speaking and server STT is streaming
When partial transcripts arrive
Then they appear in real-time in the transcript area
And partial text is styled differently from final text

Given the final transcript arrives
When the transcript preview appears
Then the text style changes to normal weight
And Send / Re-record / Discard buttons appear
```

---

## 7. Phase B — Voice Output

### Story 17.4: Text-to-Speech for Mentor Responses

**FRs:** FR252, FR253

Upgrade from on-device `expo-speech` TTS to server-side streaming TTS for better voice quality and persona support.

#### FR252: Streaming TTS API Route

- New API route: `POST /v1/voice/speak` — accepts text, returns audio stream.
- Backend integrates with a streaming TTS provider (e.g., ElevenLabs, Google Cloud TTS, or OpenAI TTS).
- Streaming: the first audio chunk is returned before the full text is processed, enabling low-latency playback.
- When voice mode is active, the LLM response stream is piped directly to TTS — the mentor starts speaking as soon as the first sentence is complete (not waiting for the full response).
- Maintains the existing `expo-speech` fallback for offline/error cases.
- Visual: text appears alongside audio. The currently spoken sentence is highlighted in the chat bubble.

**Acceptance Criteria:**

```gherkin
Given voice mode is enabled and the mentor responds
When the LLM generates the first complete sentence
Then TTS audio begins playing immediately (< 1s after first sentence)
And the text appears in the chat bubble simultaneously
And the currently spoken sentence is visually highlighted

Given the TTS server is unreachable
When the mentor responds
Then on-device expo-speech activates as fallback
And a subtle indicator shows "Using on-device voice"
```

#### FR253: Auto-Play and Tap-to-Play Modes

- In voice mode: mentor responses auto-play via TTS. No tap required.
- In text mode: a small speaker icon appears on each AI message. Tapping it plays TTS for that message.
- Pause/resume controls use the existing `VoicePlaybackBar` (from Epic 8).
- If a screen reader is active, auto-play is suppressed (existing `screenReaderEnabled` prop on `VoicePlaybackBar`).

**Acceptance Criteria:**

```gherkin
Given the learner is in voice mode
When the mentor sends a response
Then TTS auto-plays the response
And the VoicePlaybackBar shows pause/stop/speed controls

Given the learner is in text mode
When the mentor sends a response
Then a speaker icon appears on the message bubble
And tapping the icon plays TTS for that message
And tapping again stops playback
```

---

### Story 17.5: Voice Persona Configuration

**FRs:** FR254, FR255

#### FR254: Voice Persona Selection

- Three voice personas available:
  - **Warm & Encouraging** — default for ages 11-13. Slightly slower pace, upbeat intonation.
  - **Calm & Patient** — default for ages 14-16. Even pace, measured tone.
  - **Energetic & Fun** — optional for all ages. Faster pace, expressive intonation.
- Each persona maps to a specific TTS voice ID on the provider (configured server-side).
- Persona selection is per-profile, stored in the profiles table as a new nullable column `voicePersona` (text, nullable, default null — null means age-based default).

**Acceptance Criteria:**

```gherkin
Given a learner opens voice settings
When they see the voice persona picker
Then three options are displayed with names and short descriptions
And tapping an option plays a 5-second preview in that voice
And tapping "Select" saves the choice to their profile

Given a learner has not selected a voice persona
When voice mode plays TTS
Then the age-appropriate default persona is used
```

#### FR255: Speech Speed Setting

- Adjustable speech speed: 0.75x, 1.0x, 1.25x, 1.5x (extends existing 3-step cycle to 4 steps).
- Setting persists per-profile in `AsyncStorage` under key `voice.speechSpeed`.
- The `VoicePlaybackBar` rate cycle is updated to include 1.5x.
- Speed preview available in the voice settings screen.

**Acceptance Criteria:**

```gherkin
Given a learner adjusts speech speed in settings
When they select 1.5x
Then a preview sentence plays at 1.5x speed
And the setting persists across sessions
And the VoicePlaybackBar reflects the saved speed
```

---

### Story 17.6: Conversational Flow Optimization

**FRs:** FR256, FR257

#### FR256: Voice-Optimized LLM Prompting

- When `inputMode = 'voice'`, the system prompt includes voice-specific instructions:
  - **Brevity:** Responses are 1-3 sentences, not paragraphs. Maximum ~50 words per response turn.
  - **Conversational fillers:** Natural pause cues — "Let me think... okay, so..." / "Good question! So here's the thing..."
  - **Question-heavy:** The mentor asks more questions to create dialogue, not monologue. At least every other response should end with a question.
  - **Natural transitions:** "Let's move on to..." / "Now that you've got that, how about..."
- This is implemented as a new prompt section in `buildSystemPrompt()` that activates when `inputMode = 'voice'`.
- The voice prompt section is additive — it does not replace existing Socratic/four_strands logic, it constrains the output format.

**Acceptance Criteria:**

```gherkin
Given voice mode is active in a learning session
When the mentor responds
Then the response is 1-3 sentences (< 50 words typical)
And the response includes a conversational tone
And at least every other response ends with a question

Given text mode is active
When the mentor responds
Then the response length and style follow existing behavior (no voice constraints)
```

#### FR257: Long Response Segmentation

- When the LLM generates a response that would exceed 3 sentences for voice mode, the system breaks it into conversational segments.
- Each segment is delivered as a separate message with a natural pause (300-500ms) between segments.
- The child can interrupt between segments by tapping the mic or speaking (if VAD is enabled).
- Visual: segments appear as sequential chat bubbles, not one long message.

**Acceptance Criteria:**

```gherkin
Given voice mode is active
When the mentor's response would be longer than 3 sentences
Then the response is split into 2+ segments
And each segment plays as TTS with a natural pause between them
And the child can interrupt between segments

Given the child interrupts between segments
When they tap the mic button
Then the remaining segments are cancelled
And the mic activates for the child's input
```

---

## 8. Phase C — Voice-Native Features

### Story 17.7: Pronunciation Practice (Language Learning)

**FR:** FR258

For subjects with `pedagogyMode = 'four_strands'` (language learning):

#### FR258: Pronunciation Comparison

- The mentor says a word or phrase via TTS in the target language.
- The child repeats it via STT.
- The system compares the STT transcript with the expected phrase (exact match or fuzzy match using Levenshtein distance).
- **Basic mode:** Did the child say the right word? Yes/no comparison.
- **Advanced mode (future):** Phoneme-level comparison using a pronunciation scoring API.
- Gentle correction feedback: "Almost! Try saying 'buenos' like 'BWAY-nos'" — the correction includes a phonetic hint in the child's native language.
- Integrates with the vocabulary CRUD system (Epic 6, `vocabulary` table) — practiced words update retention scores.
- Integrates with four_strands pedagogy — pronunciation practice counts as Output strand activity.

**Acceptance Criteria:**

```gherkin
Given a language learning session in Output strand
When the mentor says "Repeat after me: buenos dias"
And TTS plays the phrase in the target language
And the child speaks into the mic
Then STT transcribes the child's speech in the target language
And the system compares transcript to expected phrase

Given the child's pronunciation matches (fuzzy threshold >= 0.8)
Then the mentor responds with encouragement: "Great job!"
And the vocabulary retention card for "buenos dias" is updated (quality 4-5)

Given the child's pronunciation does not match (fuzzy threshold < 0.8)
Then the mentor provides a gentle correction with phonetic hint
And offers "Try again" as a quick action
And the vocabulary retention card is updated (quality 2-3)
```

---

### Story 17.8: Voice-Based Recall Testing

**FR:** FR259

#### FR259: Verbal Recall Sessions

- Adapt the spaced repetition recall system for voice interaction.
- The mentor asks recall questions verbally (via TTS): "What do you remember about the three branches of government?"
- The child answers verbally (via STT).
- The STT transcript is sent to the LLM for evaluation (not exact-match — the LLM assesses understanding).
- The mentor provides verbal feedback: "That's right! The legislative branch makes laws. Can you tell me about the other two?"
- SM-2 quality rating is computed from the LLM's assessment of the verbal answer.
- Feels like a quiz with a real teacher, not tapping buttons.

**Acceptance Criteria:**

```gherkin
Given a recall session is active with voice mode enabled
When the mentor asks a recall question
Then the question is spoken via TTS
And the mic automatically activates after the question finishes (1s delay)
And the child can answer verbally

Given the child answers verbally
When the STT transcript is sent to the LLM
Then the LLM evaluates the answer for understanding (not exact match)
And the mentor provides verbal feedback
And the SM-2 retention card is updated based on the LLM's quality assessment

Given the child says "I don't remember"
Then the mentor explains the concept briefly (1-2 sentences)
And offers to ask a simpler question
And the SM-2 card is updated with quality 0
```

---

### Story 17.9: Hands-Free Learning Mode

**FRs:** FR260, FR261

#### FR260: Continuous Voice Conversation Mode

- Full hands-free experience: the app keeps the conversation going without screen taps.
- Flow: mentor speaks (TTS) -> pause (1s) -> mic auto-activates (VAD) -> child speaks -> STT processes -> LLM responds -> mentor speaks (TTS) -> loop.
- The app detects ambient noise and adjusts VAD sensitivity.
- Voice commands recognized during the session: "pause", "repeat that", "skip", "I don't understand", "stop".
- Visual: the screen shows a minimal UI — large waveform, current topic, and a prominent "Tap to stop" button.
- Keep-alive: screen stays on during hands-free mode (`expo-keep-awake`).

**Acceptance Criteria:**

```gherkin
Given hands-free mode is activated
When the mentor finishes speaking
Then after a 1-second pause the mic auto-activates
And VAD listens for the child to speak
And when the child finishes speaking (silence detected)
Then the response is processed and the mentor speaks the reply
And the cycle continues without screen interaction

Given the child says "repeat that"
Then the mentor replays the last response via TTS
And the mic re-activates after playback

Given the child says "pause"
Then the session pauses
And the screen shows "Paused — say 'continue' or tap to resume"
And the mic listens for "continue" or waits for a screen tap
```

#### FR261: Parent-Configured Time Limits for Hands-Free Mode

- Parents can configure a maximum duration for hands-free mode per child profile (default: 30 minutes, range: 10-60 minutes).
- When the time limit is reached, the mentor says: "We've been at it for a while! Let's take a break. You can come back anytime."
- The session transitions to text mode (not ended — the child can continue typing if they want).
- The time limit setting is stored on the family link record (parent sets it for linked children).
- Learners without a linked parent have no time limit (self-managed).

**Acceptance Criteria:**

```gherkin
Given a parent has set a 20-minute hands-free limit for their child
When the child has been in hands-free mode for 20 minutes
Then the mentor speaks: "Let's take a break! You've been going for 20 minutes."
And the session switches from hands-free to text mode
And the session is NOT ended (the child can continue typing)

Given a learner with no linked parent
When they use hands-free mode
Then no time limit is enforced
And the session continues until the learner stops it

Given a parent opens voice settings for a linked child
When they adjust the hands-free time limit slider
Then the setting is saved on the family link record
And the change takes effect on the child's next hands-free session
```

---

## 9. Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 8 (Voice Mode)** | Foundation. This epic builds on every component Epic 8 delivered. The existing hooks, components, and DB schema are extended, not replaced. |
| **Epic 6 (Language Learning)** | Story 17.7 (pronunciation practice) extends four_strands Output strand with voice comparison. STT language configuration (FR248) supports the existing `language-locales` mapping. |
| **Epic 13 (Session Lifecycle)** | Voice sessions use the same lifecycle (start, exchange, complete). Hands-free mode (FR260) needs the same timeout/recovery behavior as standard sessions. |
| **Epic 16 (Adaptive Memory)** | The mentor's voice behavior adapts to the child's preferences over time — preferred response length, vocabulary level, and pacing are remembered. |
| **Epic 15 (Visible Progress)** | Voice sessions contribute to progress metrics identically to text sessions. Voice-specific metrics (pronunciation accuracy) feed into language progress. |
| **Epic 12 (Persona Removal)** | Voice persona selection (FR254) uses birth year for age-based defaults, consistent with the post-persona architecture. No persona checks. |
| **Epic 14 (Human Agency)** | Quick chips and feedback mechanisms (FR218-FR225) must work in voice mode too — they become voice commands or simple on-screen taps alongside the conversation. |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Latency chain (STT + LLM + TTS)** | High | High — children lose patience with > 3s delays | Stream at every stage. Start TTS before full LLM response. Target < 2s end-to-end for first audio. Measure P95 latency per stage. |
| **Cost per voice session** | High | Medium — margins erode with heavy voice use | Track usage per profile. Tier-based voice minutes (see Cost section). Cache common TTS outputs (greetings, transitions). |
| **Children's speech recognition accuracy** | Medium | High — bad transcripts destroy trust | Server-side STT with child-speech tuning. Confidence threshold (FR247). On-device fallback. User testing with actual children. |
| **Background noise** | Medium | Medium — noisy environments (school, car) degrade STT | Noise level detection. Proactive warning: "It's a bit noisy — try moving somewhere quieter, or switch to text." Fallback to text. |
| **Privacy/legal (recording children)** | Medium | Critical — GDPR, COPPA, CCPA all apply | Audio processed server-side, never stored beyond the request. No audio logging. Parental consent required for voice features (under 16). Consent stored on profile. Privacy policy updated. |
| **Battery/data usage** | Medium | Low — streaming audio consumes more battery and data than text | Compress audio before upload (opus codec). Display data usage warning on mobile data. Optimize keepalive for hands-free mode. |
| **VoiceOver/TalkBack conflict** | Low | Medium — screen reader users can't use app TTS simultaneously | Deferred in Epic 8. Re-evaluate in Story 17.4. Suppress auto-play when screen reader active (existing behavior). Manual play button as fallback. |

### Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| STT server unreachable | Network loss, server error | "Voice recognition unavailable" | Falls back to on-device STT; if that fails, shows "Switch to text" button |
| TTS server unreachable | Network loss, server error | "Voice playback unavailable" | Falls back to on-device expo-speech; text always visible |
| STT returns low confidence | Child mumbles, background noise | "I didn't quite catch that. Could you say it again?" | Mic re-activates for retry; "Switch to text" always visible |
| Hands-free loop hangs | VAD doesn't detect speech for 30s | "Still there? Tap the screen or say something." | After 60s silence, pauses session with "Paused" indicator |
| Mic permission denied | OS-level denial | "MentoMate needs microphone access for voice mode" | Links to settings; offers text mode fallback |
| Audio playback interrupted | Phone call, notification, other app | TTS pauses, VoicePlaybackBar shows pause state | Resume button; replay last response |
| Streaming TTS buffer underrun | Slow LLM generation | Brief silence gap mid-sentence | Show "thinking..." indicator during gap; buffer first sentence before starting TTS |

---

## 11. Cost Considerations

### Per-Session Cost Estimate

| Component | Cost | Assumption |
|-----------|------|-----------|
| **Server STT** | ~$0.006/min (Whisper) or ~$0.004/min (Deepgram) | Child speaks ~40% of a 10-min session = 4 min |
| **Server TTS** | ~$0.015/1K chars (standard) or ~$0.030/1K chars (neural) | Mentor produces ~2K chars in a 10-min voice session |
| **LLM** | Existing cost (no change from text) | Same token usage; slightly fewer tokens due to shorter voice responses |
| **Total per 10-min voice session** | ~$0.02 (STT) + ~$0.06 (TTS neural) = ~$0.08 | Optimistic: shorter responses reduce TTS cost |

### Tier-Based Voice Minutes

| Tier | Voice Allowance | Rationale |
|------|----------------|-----------|
| **Free** | Text only (on-device TTS/STT still available) | On-device voice from Epic 8 remains free. Server-side voice is a premium feature. |
| **Plus** | 60 min/month server voice | ~6 sessions. Enough to experience the feature, not enough for daily use. |
| **Family** | Unlimited server voice | Families pay premium. Voice is the key differentiator for younger children. |
| **Pro** | Unlimited server voice | Power users. |

Voice minute tracking: server logs STT and TTS duration per profile. Approaching-limit warning at 80%. At-limit behavior: graceful fallback to on-device voice with explanation: "You've used your voice minutes for this month. You can still use basic voice, or upgrade for unlimited."

---

## 12. Data Model Changes

### 12.1 Profiles Table: Add `voicePersona`

```sql
ALTER TABLE profiles ADD COLUMN voice_persona text;
```

Valid values: `'warm'` | `'calm'` | `'energetic'` | `null` (null = age-based default).

### 12.2 Family Links Table: Add `handsFreeTimeLimitMin`

```sql
ALTER TABLE family_links ADD COLUMN hands_free_time_limit_min integer DEFAULT 30;
```

Range: 10-60. Default 30. Only enforced when the child is in hands-free mode.

### 12.3 Voice Usage Tracking Table (New)

```
voice_usage:
  id: uuid (PK)
  profileId: uuid (FK -> profiles)
  sessionId: uuid (FK -> learning_sessions, nullable)
  sttDurationMs: integer — milliseconds of STT processing
  ttsDurationMs: integer — milliseconds of TTS playback
  sttProvider: text — 'whisper' | 'deepgram' | 'on_device'
  ttsProvider: text — 'elevenlabs' | 'google' | 'openai' | 'on_device'
  createdAt: timestamp
```

Aggregated monthly for tier enforcement. On-device usage is logged for analytics but does not count against tier limits.

### 12.4 Schema Package Changes

**`packages/schemas/src/voice.ts` (new):**

```typescript
export const voicePersonaSchema = z.enum(['warm', 'calm', 'energetic']);
export type VoicePersona = z.infer<typeof voicePersonaSchema>;

export const voiceTranscribeRequestSchema = z.object({
  lang: z.string().default('en-US'),
  sessionId: z.string().uuid().optional(),
});

export const voiceSpeakRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  persona: voicePersonaSchema.optional(),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  lang: z.string().default('en-US'),
});
```

---

## 13. API Changes

### 13.1 New Routes

| Route | Method | Purpose | FR |
|-------|--------|---------|-----|
| `/v1/voice/transcribe` | POST (streaming) | Accept audio chunks, return streaming STT transcripts | FR246 |
| `/v1/voice/speak` | POST (streaming) | Accept text, return streaming TTS audio | FR252 |
| `/v1/voice/usage` | GET | Return current month's voice usage for the profile | FR243 |

### 13.2 Modified Routes

| Route | Change | FR |
|-------|--------|-----|
| `POST /v1/sessions/start` | Accept `voicePersona` field in request body (optional, forwarded to TTS) | FR254 |
| `POST /v1/sessions/:id/exchange` | Accept `inputMode` field; when `'voice'`, append voice prompt section to system prompt | FR256 |
| `GET /v1/profiles/:id` | Return `voicePersona` in profile response | FR254 |
| `PATCH /v1/profiles/:id` | Accept `voicePersona` update | FR254 |
| `GET /v1/family-links` | Return `handsFreeTimeLimitMin` per linked child | FR261 |
| `PATCH /v1/family-links/:id` | Accept `handsFreeTimeLimitMin` update | FR261 |

---

## 14. Mobile Component Changes

### 14.1 New Components

| Component | Purpose | Story |
|-----------|---------|-------|
| `VoiceSuggestionCard` | One-time "Would you like to talk?" prompt for 11-13 year olds | 17.1 |
| `AudioWaveform` | Real-time audio-level waveform visualization | 17.3 |
| `TranscriptOverlay` | Real-time partial transcript display during recording | 17.3 |
| `VoicePersonaPicker` | Three-option persona selector with preview playback | 17.5 |
| `HandsFreeOverlay` | Minimal hands-free UI with large waveform and "Tap to stop" | 17.9 |
| `PronunciationFeedback` | Shows expected vs actual pronunciation with phonetic hint | 17.7 |

### 14.2 Modified Components

| Component | Change | Story |
|-----------|--------|-------|
| `VoiceRecordButton` | Add waveform animation, swipe-to-cancel gesture, language badge | 17.3, 17.2 |
| `VoicePlaybackBar` | Add 1.5x speed option, sentence highlighting during playback | 17.4, 17.5 |
| `ChatShell` | Wire server STT/TTS, auto-play in voice mode, hands-free loop | 17.2, 17.4, 17.9 |
| `SessionInputModeToggle` | Read persisted preference, show voice suggestion for young learners | 17.1 |

### 14.3 New Hooks

| Hook | Purpose | Story |
|------|---------|-------|
| `useStreamingSTT` | WebSocket connection to `/v1/voice/transcribe`, fallback to on-device | 17.2 |
| `useStreamingTTS` | Streaming audio playback from `/v1/voice/speak`, fallback to expo-speech | 17.4 |
| `useVoicePreferences` | Read/write voice settings from AsyncStorage (VAD, speed, persona, preferred mode) | 17.1, 17.5 |
| `useHandsFreeMode` | Manages the continuous conversation loop, voice commands, time limits | 17.9 |
| `useAudioLevel` | Real-time audio level monitoring for waveform and VAD | 17.3, 17.1 |

---

## 15. System Prompt Changes

### Voice Mode Prompt Section

Added to `buildSystemPrompt()` when `inputMode = 'voice'`:

```
## Voice Mode Active

The learner is speaking to you, not typing. Adapt your responses for spoken conversation:

- Keep responses to 1-3 sentences. Maximum ~50 words per turn.
- Use a warm, conversational tone. Include natural fillers: "Let me think...", "Good question!", "Okay, so..."
- Ask a follow-up question in at least every other response. Create dialogue, not monologue.
- Use simple sentence structures. Avoid parenthetical asides, bullet points, or formatting.
- When explaining something complex, break it into conversational turns:
  - Turn 1: "The basic idea is..."
  - Turn 2 (after child responds): "Now here's the interesting part..."
- Never use markdown formatting (bold, italic, headers, code blocks) — the response will be spoken aloud.
- If you need to convey a list, say "There are three things: first... second... third..." not bullet points.
```

This section is additive and works alongside both Socratic and four_strands pedagogy modes.

---

## 16. Out of Scope

| Item | Reason |
|------|--------|
| Custom voice cloning | Legal complexity with children. Use provider-supplied voices only. |
| Emotion detection from voice | Research-stage technology. Not reliable enough for production. |
| Video/avatar of the mentor | Separate epic. Voice-only for now. |
| Multi-speaker conversations | One mentor, one learner. Group sessions are a different feature. |
| Offline voice processing | Requires on-device LLM. Too large for mobile. On-device STT/TTS (Epic 8) is the offline fallback. |
| Voice messages stored as audio | Audio is transcribed and discarded. Chat history stores text only. Privacy-first. |
| Phoneme-level pronunciation scoring | Marked as "advanced mode (future)" in FR258. V1 uses word-level fuzzy matching. |

---

## 17. Testing Strategy

### Unit Tests

| Area | What to test |
|------|-------------|
| `useStreamingSTT` | WebSocket connection, reconnection, fallback to on-device, confidence threshold |
| `useStreamingTTS` | Audio streaming, buffer management, fallback to expo-speech |
| `useVoicePreferences` | AsyncStorage read/write, age-based defaults, persistence |
| `useHandsFreeMode` | Conversation loop, voice commands, time limits, pause/resume |
| Voice prompt section | `buildSystemPrompt()` includes voice section only when `inputMode = 'voice'` |
| Pronunciation comparison | Fuzzy matching threshold, phonetic hint generation |

### Integration Tests

| Area | What to test |
|------|-------------|
| `/v1/voice/transcribe` | Auth, rate limiting, language parameter, error responses |
| `/v1/voice/speak` | Auth, persona selection, speed parameter, streaming response |
| `/v1/voice/usage` | Correct aggregation, tier enforcement, on-device exclusion |
| Session exchange with voice | Voice prompt section injected, response length constrained |
| Family link time limits | Parent sets limit, child session enforces it |

### Manual Testing (Required)

| Scenario | Device | What to verify |
|----------|--------|---------------|
| Child speech accuracy | Galaxy S10e, physical | STT correctly transcribes a 12-year-old speaking |
| Latency chain | Galaxy S10e, physical | End-to-end < 3s from child stops speaking to mentor starts speaking |
| Background noise | Physical device, noisy room | Noise detection works, warning shown, fallback to text |
| Hands-free mode | Physical device, walking | Continuous conversation works without screen interaction for 10+ min |
| Screen reader coexistence | Physical device, TalkBack | Auto-play suppressed, manual play works, no audio conflicts |

---

## Appendix A: FR Summary Table

| FR | Description | Story | Priority |
|----|-------------|-------|----------|
| FR243 | Age-aware voice mode suggestion for 11-13 year olds | 17.1 | P1 |
| FR244 | Voice-activity detection (VAD) mode, configurable silence threshold | 17.1 | P2 |
| FR245 | Voice mode preference persistence across sessions | 17.1 | P1 |
| FR246 | Server-side streaming STT API route with fallback | 17.2 | P1 |
| FR247 | Children's speech handling with confidence threshold | 17.2 | P1 |
| FR248 | Multi-language STT for language learning sessions | 17.2 | P2 |
| FR249 | Animated audio-level waveform during recording | 17.3 | P2 |
| FR250 | Cancel gesture (swipe-left) and thinking state with timeout | 17.3 | P1 |
| FR251 | Real-time partial transcript display during recording | 17.3 | P1 |
| FR252 | Streaming TTS API route with sentence-level streaming | 17.4 | P1 |
| FR253 | Auto-play in voice mode, tap-to-play in text mode | 17.4 | P1 |
| FR254 | Voice persona selection (warm, calm, energetic) per profile | 17.5 | P2 |
| FR255 | Speech speed setting with 4-step cycle (0.75x-1.5x) | 17.5 | P3 |
| FR256 | Voice-optimized LLM prompting (shorter, conversational, question-heavy) | 17.6 | P1 |
| FR257 | Long response segmentation with interruptible pauses | 17.6 | P2 |
| FR258 | Pronunciation comparison for language learning (fuzzy match) | 17.7 | P2 |
| FR259 | Voice-based recall testing with LLM evaluation | 17.8 | P2 |
| FR260 | Continuous hands-free conversation mode with voice commands | 17.9 | P2 |
| FR261 | Parent-configured time limits for hands-free mode | 17.9 | P3 |
