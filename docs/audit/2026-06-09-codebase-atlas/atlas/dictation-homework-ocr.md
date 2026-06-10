# Dictation, Homework & OCR — Functional Atlas

## Screens (route → purpose)

### Dictation sub-domain (`apps/mobile/src/app/(app)/dictation/`)

| Route | File | Purpose |
|---|---|---|
| `/(app)/dictation` (index) | `dictation/index.tsx` | Choice hub: "I have a text" → text-preview; "Surprise me" → generate dictation via LLM, then push to playback |
| `/(app)/dictation/text-preview` | `dictation/text-preview.tsx` | Shows OCR-extracted or manually typed text; user edits it; taps "Start dictation" → calls prepare-homework API, then pushes to playback |
| `/(app)/dictation/playback` | `dictation/playback.tsx` | Live TTS playback of sentences; controls: pace, punctuation toggle, skip, repeat; taps pause/resume; exits via Modal confirm; auto-navigates to complete when done |
| `/(app)/dictation/complete` | `dictation/complete.tsx` | Post-dictation choice: "Check my writing" (camera/gallery → OCR review) or "I'm done" (records result without review); also "Try another dictation" |
| `/(app)/dictation/review` | `dictation/review.tsx` | Shows mistake list (original vs written vs correction vs explanation); user retypes each corrected sentence; navigates through mistakes; on Done records result with `reviewed=true` |

**Layout gating** (`dictation/_layout.tsx`):
- V1 mode: `!navigationContract.canEnter('dictation')` → `<Redirect href="/(app)/home" />`
- V0 fallback: `navigationContract.isParentProxy` → `<Redirect href="/(app)/home" />`
- A `DictationDataContext` is provided at layout level carrying: `completionKey`, `sentences`, `language`, `title`, `topic`, `mode` (`'surprise'|'homework'`), `reviewResult`.

### Homework sub-domain (`apps/mobile/src/app/(app)/homework/`)

| Route | File | Purpose |
|---|---|---|
| `/(app)/homework/camera` | `homework/camera.tsx` | Full multi-phase camera screen: permission → viewfinder → preview → processing (OCR) → result (problem card review + subject picker) → error |

**Layout gating** (`homework/_layout.tsx`):
- V1 mode: `!navigationContract.canEnter('homework')` → `<Redirect href="/(app)/home" />`
- V0 fallback: `navigationContract.isParentProxy` → `<Redirect href="/(app)/home" />`
- Proxy-mode guard also rendered inline inside `camera.tsx` at line 778 (renders a read-only placeholder rather than crashing).

---

## Capabilities (user task → backend process file:line)

### Dictation Capability Map

| User task | Mobile entry point | API endpoint | Service | Inngest | Data written |
|---|---|---|---|---|---|
| Generate "Surprise me" dictation | `dictation/index.tsx:52` `useGenerateDictation()` | `POST /dictation/generate` (`dictation.ts:123`) | `services/dictation/generate.ts:205` → `routeAndCall(rung=1, flow='dictation.generate')` | — | None until result recorded |
| Prepare homework text for dictation | `dictation/text-preview.tsx:56` `usePrepareHomework()` | `POST /dictation/prepare-homework` (`dictation.ts:94`) | `services/dictation/prepare-homework.ts:66` → `routeAndCall(rung=1, flow='dictation.prepare-homework')` | — | None until result |
| Play dictation (TTS) | `hooks/use-dictation-playback.ts` | — (client-side only; uses Expo Speech) | — | — | — |
| Record dictation result without review | `dictation/complete.tsx:281` `useRecordDictationResult()` | `POST /dictation/result` (`dictation.ts:155`) | `services/dictation/result.ts:41` → `createScopedRepository` → insert `dictation_results`; then `safeWrite()` → `recordPracticeActivityEvent()` | — | `dictation_results`, `practice_activity_events` |
| Check writing via camera OCR (review flow) | `dictation/complete.tsx:127` `useReviewDictation()` | `POST /dictation/review` (`dictation.ts:199`) | `services/dictation/review.ts:164` → `routeAndCall(rung=2, flow='dictation.review')` (multimodal vision) | — | — until `handleDone` on review screen |
| Record result after review with mistakes | `dictation/review.tsx:51` `useRecordDictationResult()` | `POST /dictation/result` | `services/dictation/result.ts:41` | — | `dictation_results` (with `reviewed=true`, `mistakeCount`) |
| Get dictation streak | `GET /dictation/streak` (no mobile hook found — not surfaced in UI) | `dictation.ts:311` | `services/dictation/result.ts:115` → `repo.dictationResults.listRecentDistinctDates(60)` | — | Read only |

### Homework / OCR / Filing Capability Map

| User task | Mobile entry point | API endpoint | Service | Inngest | Data written |
|---|---|---|---|---|---|
| Capture homework photo | `homework/camera.tsx:343` `handleCapture` | — (local camera, no API yet) | — | — | Local image URI in component state |
| Pick from gallery | `homework/camera.tsx:359` `handlePickFromGallery` | — | — | — | Local image URI |
| Run OCR on homework photo | `homework/camera.tsx:415` → `useHomeworkOcr()` `process(uri)` | Falls back to `POST /ocr` (`homework.ts:54`) if ML Kit fails/insufficient | `services/ocr.ts:114` `GeminiOcrProvider` → `routeAndCall(rung=1, flow='ocr.extract')` | — | Local state (text, confidence, source) |
| Auto-classify homework subject | `homework/camera.tsx:244` `useClassifySubject()` | `POST /subjects/classify` | `services/classify-subject.ts` (inferred) | — | None (response drives client UI) |
| Create new subject (auto) | `homework/camera.tsx:285` `createSubject.mutateAsync()` | `POST /subjects` | `services/subjects` (inferred) | — | `subjects` table |
| Start homework session | `homework/camera.tsx:508` `navigateToSession()` → `router.replace({pathname:'/(app)/session', params})` | `POST /subjects/:subjectId/homework` (`homework.ts:32`) | `services/session.startSession()` (inferred) | — | `learning_sessions` |
| Manual text entry + voice dictation | `homework/camera.tsx:439-681` (in-screen) | — | — | — | Local state |
| File session to library (post-session) | Called from `session/` end of session | `POST /filing` (`filing.ts:116`) | `services/filing.ts:306` `fileToLibrary()` → `routeAndCall(rung=1)` + `resolveFilingResult()` | `app/filing.completed` dispatched (core-send) | `subjects`, `curricula`, `curriculum_books`, `curriculum_topics`, `learning_sessions.topicId/filedAt` |
| Retry failed filing | `POST /filing/request-retry` (`filing.ts:62`) | `filing.ts:109` | — | `app/filing.retry` dispatched (core-send) | `filing_retry_count`, `filing_status` |
| Freeform filing retry (async) | Inngest trigger `app/filing.retry` | — | `services/filing.ts:306` | `inngest/functions/freeform-filing.ts:218` | Same as filing above |
| Extract homework summary | Post-session Inngest step | — | `services/homework-summary.ts:210` → `routeAndCall(rung=2, flow='homework.summary')` | `session-completed` function step at line 1689 | `learning_sessions.metadata.homeworkSummary` (jsonb_set) |
| View homework summary (parent) | `app/(app)/child/[profileId]/index.tsx:225` | — | — | — | Read only |

---

## Navigation Depth Map

Depths counted from tab root (tab = tap 1).

### Dictation path — from Practice tab

```
Practice tab (tap 1)
  └─ /(app)/practice/index.tsx (2 taps: open practice hub)
       └─ Dictation card → /(app)/dictation (3 taps: tap "Dictation" card)
            ├─ Option A: "Surprise Me" → loading → /(app)/dictation/playback (4 taps: tap card)
            │    └─ Auto → /(app)/dictation/complete (automatic on finish)
            │         └─ "Check my writing" → camera → /(app)/dictation/review (6 taps total)
            │              └─ "Done" → records result → back to /(app)/practice
            └─ Option B: "I have a text" → /(app)/dictation/text-preview (4 taps)
                 └─ "Start Dictation" → /(app)/dictation/playback (5 taps)
                      └─ auto → complete/review flow (as above)
```

**Maximum depth from Practice tab:** 7 taps (Practice → Dictation hub → "I have a text" → text-preview → Start → playback → complete → "Check writing" → camera → review → Done)

**Flags this as deep nesting:** The Review screen is 5–7 taps from the nearest tab root. Any user who doesn't know where to find Dictation will not find it.

### Homework / OCR path — from Home tab

```
Home tab (tap 1)
  └─ LearnerScreen → "Homework" intent card → /(app)/homework/camera (2 taps)
       Phase sequence (all within the single camera.tsx screen):
       permission phase (if needed: tap "Allow Camera") → viewfinder → 
       capture/gallery → preview → processing (OCR auto-fires) →
       result phase: review problem cards + subject picker → "Let's Go"
       → /(app)/session (separate domain)
```

**Maximum depth from Home tab:** 2 taps to reach the camera screen; everything else is within that one screen (multi-phase). This is actually very shallow by tab-root standards.

### Homework path — from within a shelf/subject context

```
Shelf tab → subject → session start (cross-tab push to homework/camera with subjectId param)
  → skips subject picker (subjectId known)
```

### Dictation access from Surprise Me timeout

At `dictation/index.tsx:163`: user sees "Taking too long" + Retry + Cancel. This is a dead-state where there is no way to go to text-preview without cancelling and coming back.

---

## Backend Processes & Data Model

### Data Written (tables)

| Table | Written by | Purpose |
|---|---|---|
| `dictation_results` | `services/dictation/result.ts:69` | One row per completed dictation session (date, sentenceCount, mistakeCount, mode, reviewed) |
| `practice_activity_events` | `services/dictation/result.ts:82` via `safeWrite()` | Cross-domain activity ledger for progress; activityType='dictation', activitySubtype=mode |
| `learning_sessions` | `homework.ts:39` via `startSession()` | Session record for homework chat |
| `learning_sessions.metadata.homeworkSummary` | `services/homework-summary.ts:370` via `jsonb_set` | Parent-facing summary extracted post-session |
| `subjects` | `services/filing.ts:570` (on-conflict-do-nothing) | Auto-created shelf from filing if new subject name |
| `curricula` | `services/filing.ts:621` | Auto-created curriculum record per shelf |
| `curriculum_books` | `services/filing.ts:683` | Auto-created book from filing |
| `curriculum_topics` | `services/filing.ts:771` | Filed topic record (one per homework session outcome) |

### OCR Architecture (dual-path)

The `useHomeworkOcr` hook at `apps/mobile/src/hooks/use-homework-ocr.ts` runs two OCR paths:

1. **On-device (ML Kit):** `@react-native-ml-kit/text-recognition` with 20s timeout (`OCR_DEVICE_TIMEOUT_MS = 20_000`). Only used if native module is linked (not in Expo Go).
2. **Server fallback (Gemini):** `POST /ocr` with 15s timeout (`OCR_SERVER_TIMEOUT_MS = 15_000`). `GeminiOcrProvider.extractText()` → `routeAndCall(rung=1, flow='ocr.extract')` at `services/ocr.ts:131`.

Gate logic: `isCleanPrintedLocalRead()` at `hooks/ocr-read-quality.ts` decides whether local result is trusted. If not clean-printed, falls through to server. Server result uses looser gate (`countMeaningfulTokens >= 1`).

### Dictation LLM Calls

| Flow | Rung | Model requirement | Input | Output |
|---|---|---|---|---|
| `dictation.generate` | 1 | Text | Age, language, interests, library topics, birthYear | `GenerateDictationOutput` (sentences + withPunctuation + chunks + title + topic) |
| `dictation.prepare-homework` | 1 | Text | Raw homework text (XML-fenced) | `PrepareHomeworkOutput` (split sentences + withPunctuation + chunks) |
| `dictation.review` | 2 | Vision (multimodal) | base64 image + sentence list | `DictationReviewResult` (mistakes: original, written, error, correction, explanation) |
| `ocr.extract` | 1 | Text (Gemini multimodal) | image ArrayBuffer | `OcrResult` (text, confidence, regions) |
| `homework.summary` | 2 | Text | session transcript + homework metadata | `HomeworkSummary` (problemCount, skills, guided/independent counts, summary, displayTitle) |

### Filing Pipeline (async Inngest)

The filing pipeline is triggered from `POST /filing` (sync) or via Inngest events (async retry):

1. `POST /filing` → `fileToLibrary()` (LLM rung 1) → `resolveFilingResult()` (DB transaction: shelf → curriculum → book → chapter → topic) → core-send `app/filing.completed`
2. If LLM fails and subjectId known: `buildFallbackFilingResponse()` → same DB resolution
3. If overall fails: `safeSend()` → `app/filing.retry` event → `freeform-filing.ts:218` Inngest function (2 retries)
4. Timeout path: `app/session.filing_timed_out` → `filing-timed-out-observe.ts:24` → CAS-guarded retry (max 3 total) → `app/session.filing_resolved`
5. Stranded sessions (manual ops): `app/maintenance.filing_stranded_backfill` → `filing-stranded-backfill.ts:40` (manual trigger only)
6. Completion audit: `app/filing.completed` → `filing-completed-observe.ts:11` → flips `filing_status` to `filing_recovered` if was `filing_pending`/`filing_failed`

### Rate Limiting

- Dictation review: 10 requests per minute per profile (`dictation.ts:229`)
- Server OCR: no explicit app-level rate limit in route (Cloudflare 100MB platform limit)
- Dictation review payload: `DICTATION_REVIEW_MAX_PROMPT_CHARS` chars max, validated at both route and service layer

---

## Complexity Signals & Redesign Notes

### 1. The Homework Camera screen is a state machine masquerading as a single screen (CRITICAL)

`homework/camera.tsx` is 1717 lines long and handles **7 distinct UI phases** via a reducer:
- `permission`, `viewfinder`, `preview`, `processing`, `result`, `error`, `manual`

Each phase renders a completely different UI. This is functionally equivalent to 7 separate screens but exists as one file. The state machine makes the flow hard to navigate in code and impossible to deep-link to any intermediate phase.

**Complexity signals within camera.tsx:**
- 12+ local state variables
- Subjects loaded via `useSubjects()` inside the camera screen (subject domain leaking in)
- Subject auto-classification (`useClassifySubject()`) triggers inside camera result phase
- Subject creation (`useCreateSubject()`) can happen inside camera result phase
- Voice dictation per-problem-card inside the result phase
- Truncation alert shown before navigation (inline complexity)
- Manual subject text input within the camera screen (another sub-form)
- 45s UI safety timeout layered on top of the 20s OCR hook timeout

### 2. Dictation Review flow is 5–7 taps deep

From Practice tab: tap Practice → tap Dictation card → tap "I have a text" → tap text-preview → type/paste → tap "Start Dictation" → dictation plays → tap "Check my writing" → camera → reviewing → tap "Done" = 10+ interactions before reaching the review screen. No shortcut exists.

### 3. Dictation has TWO separate OCR paths with different entry points

- **Path A (Homework → Dictation):** user is in `homework/camera` → completes OCR → `ocrText` param passed → navigates to `dictation/text-preview?ocrText=...` → user sees pre-populated text → starts dictation. This creates a cross-domain hand-off where the homework camera screen is actually an OCR provider for the dictation flow.
- **Path B (Dictation → "I have a text"):** user navigates directly to dictation, manually types/pastes text in `text-preview`.

Both paths converge at `text-preview.tsx` but neither is labeled "OCR for dictation" — the UX connection between camera and dictation is not obvious.

### 4. The `text-preview` screen cannot be reached via deep link without OCR state

`dictation/text-preview.tsx` uses `useLocalSearchParams()` to get `ocrText`. This is the only shared-state mechanism between homework camera and dictation. A cold deep-link to `/(app)/dictation/text-preview` with no `ocrText` param shows an empty textarea — not broken but not obvious.

### 5. Modal-on-modal risk in playback

`dictation/playback.tsx:245` renders an in-app Modal for the exit-confirm dialog. If the OS also shows a camera permission dialog (which can happen on the complete screen's `ImagePicker.launchCameraAsync()`), two overlapping modals can appear.

### 6. Dictation streak endpoint exists but is not surfaced in mobile UI

`GET /dictation/streak` exists at `dictation.ts:311` and `services/dictation/result.ts:115`, but no mobile hook consumes it. The endpoint computes consecutive days of dictation practice. The data is not displayed anywhere — the streak is written but never read in the UI.

### 7. Homework summary is written but only shown in parent proxy view

`services/homework-summary.ts:310` extracts and stores the homework summary. The only place it's shown: `app/(app)/child/[profileId]/index.tsx:225` — the parent-proxy view of a child's profile. The learner themselves never sees their own homework summary. This is asymmetric information exposure.

### 8. Subject classification/creation embedded inside camera flow creates a multi-domain screen

`homework/camera.tsx` does: OCR → subject classify → subject create → start session. This is four distinct domain operations (OCR, subject management, session management, navigation) in one screen. Each has its own loading state, error state, and retry path, all layered on top of each other with no clear separation.

### 9. Problem card truncation is a silent complexity bomb

The `buildHomeworkSessionParams()` function at `homework/_view-models/homework-session-params.ts:31` silently truncates problem cards to fit in URL params (8000 char budget). This is surfaced via a `platformAlert` but there is no persistent warning if the user dismisses it. A learner photographing 10 problems could silently lose 9 of them from the session.

### 10. Filing retry count cap (3) is enforced in three different places

- `filing.ts:94` (per-session retry-count gate via `claimSessionForFilingRetry`)
- `filing-timed-out-observe.ts:34` (via `lt(filingRetryCount, MAX_FILING_RETRIES)`)
- `filing.ts:94` in the manual retry endpoint

The constant `MAX_FILING_RETRIES = 3` is defined inline in `filing-timed-out-observe.ts` (not a shared constant). If changed in one place, the others will drift.

### 11. Two 20s timeouts both active during dictation generation

`dictation/index.tsx:37` sets a 20s client-side UI timeout. The mutation itself also has `DICTATION_MUTATION_TIMEOUT_MS = 15_000` in `use-dictation-api.ts:24`. The 15s API abort fires first, then the 20s UI "timed out" message fires on the same failed request. Two consecutive error states for the same failure.

---

## Overlaps with Other Domains

### Dictation ↔ Progress domain

- `recordDictationResult()` at `services/dictation/result.ts:82` calls `recordPracticeActivityEvent()` via `safeWrite()`. This writes to `practice_activity_events`, which is the same table read by the Progress tab for the activity history chart. **Dictation results appear in the Progress domain without any explicit linkage in the UI**.

### Dictation ↔ Practice domain

- Dictation is entered exclusively via `/(app)/practice/index.tsx:881` (Dictation card in the practice hub). There is no direct entry from Home, Library, or Progress tabs. **Dictation is buried one level inside Practice**.

### Homework ↔ Home domain

- Homework camera is the top action in `LearnerScreen.tsx:76` (`HOME_INTENT_ACTIONS[0]`). This is the only domain entered directly from the Home tab's intent card row.

### Homework ↔ Subject/Library domain

- `homework/camera.tsx` reads and writes to subjects. `useSubjects()` loaded inside camera screen. `useCreateSubject()` called within camera result phase. **Subject management leaks into the homework capture flow**.

### Homework ↔ Session domain

- `homework/camera.tsx` terminates with `router.replace({pathname:'/(app)/session', params})` — it is a pre-session capture flow, not a standalone feature. The camera screen's "result" is not a result page; it is a session initializer.

### Filing ↔ Session domain (post-session)

- Filing is triggered from `POST /filing` (called from session end flow). Session-completed Inngest function at line 1689 calls `extractAndStoreHomeworkSummary()`. **Filing and homework summary extraction are coupled to session completion, not to the camera screen.**

### OCR ↔ Dictation domain (cross-domain hand-off)

- `homework/camera.tsx` can pass `ocrText` as a URL param to `/(app)/dictation/text-preview` (visible at `camera.tsx:508` `navigateToSession` shows session route; the dictation path via `ocrText` param on `text-preview` is the specific homework→dictation hand-off). This is not shown in the current camera code's `navigateToSession` — the hand-off happens via the route at `dictation/index.tsx:217` where `router.push('/(app)/dictation/text-preview' as Href)` is the "I have a text" path. **The OCR text can only enter the dictation flow via the `text-preview` route's `ocrText` query parameter**, meaning homework camera and dictation text-preview are designed to work together but no direct navigation between them is wired in camera.tsx (camera navigates to session, not to dictation).

### Dictation review score ↔ Learner profile

- `services/dictation/review.ts:269` fetches `recentStruggles` from the learner profile (via `getLearningProfile()`) to personalize mistake explanations. **Dictation review is personalized to learning history without the user knowing**.

### Homework summary ↔ Parent/guardian view

- Parent proxy view at `app/(app)/child/[profileId]/index.tsx:225` is the only consumer of `session.metadata.homeworkSummary`. **The homework summary is a parent-facing feature, not learner-facing**, creating an asymmetric UX where parents see session summaries but learners do not.

### Dictation streak ↔ Nowhere

- `GET /dictation/streak` is a complete backend feature with no mobile consumer. The streak data is computed and available but not shown anywhere in the UI — not in progress, not in practice, not in the dictation flow itself.
