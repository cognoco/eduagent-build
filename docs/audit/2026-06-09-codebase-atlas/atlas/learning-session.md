# Core learning session (the teaching loop) — Functional Atlas

> Branch `new-llm`. Read-only audit. Every claim cites `file:line` against actual source.
> The "heart of the product": one screen (`session/index.tsx`) drives 6 session
> modes, a 5-rung Socratic escalation ladder, an LLM streaming loop with a
> structured envelope, and 25 backend route endpoints. This is the single most
> overloaded screen in the app — ~1,335 lines in one component, ~40 `useState`
> hooks, 8 custom hooks composed together.

---

## Screens (route → purpose)

The learning session is rendered by **exactly one route** plus three post/peri-session routes. There are no sub-routes inside `session/` — everything is modals, accessories, and footer slots on a single screen.

| Route | File | Purpose | Gating |
|---|---|---|---|
| `/(app)/session` | `apps/mobile/src/app/(app)/session/index.tsx:132` | THE teaching screen. Renders for all 6 modes via `mode` param. One `<ChatShell>` + overlays. | `_layout.tsx:17-19` blocks parent-proxy: V1 → `!canEnter('session')`; V0 → `isParentProxy` redirect to `/home` |
| `/(app)/session/_layout` | `apps/mobile/src/app/(app)/session/_layout.tsx:8` | Stack wrapper + proxy-mode redirect gate (`ExplainedRedirect`). | flag `MODE_NAV_V1_ENABLED` |
| `/session-summary/[sessionId]` | `apps/mobile/src/app/session-summary/[sessionId].tsx:1` | Post-session "Your Words" reflection + recall bridge + library filing + mentor-memory cue + topic suggestions. ~1,100 lines. | proxy gated; `useParentProxy`, `useNavigationContract` (l.26-27) |
| `/session-transcript/[sessionId]` | `apps/mobile/src/app/session-transcript/[sessionId].tsx` | Read-only replay of a past session transcript. | — |
| `/ready.tsx` | `apps/mobile/src/app/ready.tsx:96` | Onboarding "ready" hand-off that launches the first session. | onboarding flow |

**Key architecture note** (`index.tsx:140-1334`): `SessionScreenInner` is a single
function component holding ~40 `useState` calls (l.306-407), 12 `useRef`s
(l.409-427), and composes 8 domain hooks: `useSessionStreaming`,
`useSubjectClassification`, `useSessionActions`, `useBookmarkHandler`,
`useSessionRecovery`, `useSessionTranscriptHydration`, `useImageBase64`,
`useChallengeRound`. Mode is decoded from route params (`getSessionRouteParams`,
`_view-models/session-route-params.ts`).

---

## Capabilities (user task → backend process file:line)

### Starting a session (entry points — all push `/(app)/session` with params)

| User does | From screen | Params passed | Backend |
|---|---|---|---|
| "Continue learning" / start topic | `topic/[topicId].tsx:445,460,471` | `mode=learning`, topicId, subjectId | Auto-resumes active session: `useActiveSessionForTopic` (`index.tsx:456`) → `GET /subjects/:subjectId/sessions` then `router.setParams({sessionId})` (l.466). Start via `POST /subjects/:subjectId/sessions` (`sessions.ts:280`) |
| Open a book/chapter to learn | `shelf/[subjectId]/book/[bookId].tsx:1086,1129,1156` | learning + book/topic context | same start path |
| Recitation practice | `practice/index.tsx:922-923` | `mode=recitation` | start session |
| Homework photo/text | `homework/camera.tsx:509` | `mode=homework`, `homeworkProblems`, `ocrText`, `imageUri` | auto-sends first problem (`index.tsx:844-915`) |
| Relearn a topic | `topic/relearn.tsx:316` | `mode=relearn` (normalized; config `sessionModeConfig.ts:32` "Relearn") | start session |
| Practice assessment gap-fill | `practice/assessment/index.tsx:466,503` | `mode=gap_fill` / `learning` w/ `gaps` | start session |
| First session after onboarding | `ready.tsx:96`, `onboarding/pronouns.tsx:131`, `language-setup.tsx:176` | `mode=learning` | start session |
| Interleaved (multi-topic) session | (server-driven) | — | `POST /sessions/interleaved` (`sessions.ts:1480`) → `startInterleavedSession` (`interleaved.ts:144`); `selectInterleavedTopics` (`interleaved.ts:60`) |

The **6 session modes** (`sessionModeConfig.ts:14-64`): `homework` ("Homework Help"), `learning` ("Learning Session"), `relearn` ("Relearn"), `review`/`practice` ("Review", shows timer), `recitation` ("Recitation (Beta)"), `freeform` ("Chat"). `practice` normalizes to `review` (`sessionModeConfig.ts:70-73`).

### Inside a session — the message loop

| User task | UI entry | Backend route → service |
|---|---|---|
| Send a message (text) | `ChatShell` `onSend={handleSend}` (`index.tsx:1214`) | `POST /sessions/:sessionId/stream` (`sessions.ts:658`) → `streamMessage` (`session-exchange.ts:3019`); non-stream fallback `processMessage` (`session-exchange.ts:2778`) on stream error (`sessions.ts:767`) |
| Send (non-streaming) | (fallback / web) | `POST /sessions/:sessionId/messages` (`sessions.ts:481`) → `processMessage` |
| Voice input/output | `SessionInputModeToggle`, `VoiceRecordButton`, `VoicePlaybackBar` | `handleInputModeChange` (`use-session-actions.ts:156`) → `POST /sessions/:sessionId/input-mode` (`sessions.ts:1329`). Locale from `getVoiceLocaleForLanguage` (`index.tsx:610`) |
| Subject classification (no subject yet) | first message in freeform | `useSubjectClassification` (`use-subject-classification.ts`) → `useClassifySubject` / `useResolveSubject`; resolve/create subject inline via `SessionAccessory` |
| Quick chip "Switch topic" / "Wrong subject" | `SessionToolAccessory` (`SessionAccessories.tsx:64-85`); also per-message chips | `handleQuickChip` (`use-session-actions.ts:446`); opens `TopicSwitcherModal` |
| Add a note mid-session | "+ Add note" chip (`SessionAccessories.tsx:42-62`) → `setShowNoteInput` | `NoteInput` (in `SessionFooter`) → `useCreateNote` (`index.tsx:631`) |
| Park a question (Parking Lot) | quick chip `park` → `ParkingLotModal` (`SessionModals.tsx:32`) | `POST` via `useAddParkingLotItem` / `useParkingLot` (`index.tsx:476-477`) |
| Message feedback (helpful / not helpful / incorrect) | `SessionMessageActions.tsx:159,194,229` | `handleMessageFeedback` (`use-session-actions.ts:532`); auto-sends follow-up prompt "explain differently"/"correct it" (l.539-541) |
| Bookmark an AI message | `SessionMessageActions.tsx:277` | `useBookmarkHandler` (`_hooks/use-bookmark-handler.ts`); nudge tooltip `BookmarkNudgeTooltip` |
| Flag content (safety) | (header / message action) | `POST /sessions/:sessionId/flag` (`sessions.ts:1367`) → `useFlagSessionContent` |
| Reconnect (after stream error) | `SessionMessageActions.tsx:64` | `handleReconnect` (`use-session-streaming.ts`) |
| Skip warm-up (continuation depth) | header chip `SessionScreenChrome.tsx:110-118` | `POST /sessions/:sessionId/clear-continuation-depth` (`sessions.ts:317`) → `useClearContinuationDepth` |
| Record system prompt intent | quick chips / mode transitions | `POST /sessions/:sessionId/system-prompt` (`sessions.ts:1297`) — typed intent only, server owns text (`systemPromptIntentSchema`) |
| Record analytics event | various | `POST /sessions/:sessionId/events` (`sessions.ts:1315`) |
| Homework: "Help me solve" / "Check my answer" | `SessionAccessory` homework mode | `setHomeworkMode` (`index.tsx:1169`) → `POST /sessions/:sessionId/homework-state` (`sessions.ts:1347`) |
| Homework: next problem | `handleNextProblem` (`use-session-actions.ts:191`) | queued auto-send (`index.tsx:828-842`) |
| Challenge Round: accept / decline / "don't ask again" | `ChallengeOfferCard` (`index.tsx:1130-1138`) | `useChallengeRound.accept/decline` (`index.tsx:1001-1016`); server gates via `applyChallengeRoundRuntimeSignals` (`session-exchange.ts:900`) |
| Challenge Round: save / skip drafted note | `DraftedNoteReview` (`index.tsx:1140-1150`) | `challengeRoundActions.saveNote/skipNote` (`index.tsx:1018-1038`) |
| Fluency drill score (language) | `FluencyDrillStrip` (`index.tsx:1116`) | emitted in SSE `done.fluencyDrill` (`sse.ts:61-65`) |
| Evaluate depth (continuation opener score) | (server, opener phase) | `POST /sessions/:sessionId/evaluate-depth` (`sessions.ts:590`) |
| End session | header "End" button (`SessionScreenChrome.tsx:38-45`, `testID=end-session-button`) | `handleEndSession` (`use-session-actions.ts:325`) → `POST /sessions/:sessionId/close` (`sessions.ts:1225`) → `closeSession` |
| Read transcript / resume | `useSessionTranscript` (`index.tsx:429`); `GET /sessions/:sessionId/transcript` (`sessions.ts:575`) | hydration `useSessionTranscriptHydration` |

### Ending a session — the close → summary → completion chain

| Step | Where | Backend |
|---|---|---|
| Close | `POST /sessions/:sessionId/close` (`sessions.ts:1225`) | `closeSession`; sanitizes `summaryStatus` to `pending`/`skipped` only (l.1245-1248); `dispatchClosePathAutoFileIfEligible` (l.1261) → `app/session.auto_file_requested` (`session-filing-dispatch.ts:49`) |
| Library filing prompt | `SessionFooter` `StandardFilingPrompt` (`SessionFooter.tsx:72`); `use-filing` | `POST /sessions/:sessionId/library-filing/{keep-out,add,restore}` (`sessions.ts:408,426,453`); retry `POST .../retry-filing` (`sessions.ts:330`) |
| Summary "Your Words" | `session-summary/[sessionId].tsx` | `GET /sessions/:sessionId/summary` (`sessions.ts:1385`); submit `POST .../summary` (`sessions.ts:1432`) `useSubmitSummary`; skip `POST .../summary/skip` (`sessions.ts:1396`) `useSkipSummary` |
| Recall bridge (homework only) | summary screen `useRecallBridge` (`[sessionId].tsx:162`) | `POST /sessions/:sessionId/recall-bridge` (`sessions.ts:1501`) → `generateRecallBridge`; rejects non-homework (l.1511) |
| Completion pipeline | `dispatchSessionCompletedEvent` (`sessions.ts:1278`) | Inngest `session-completed.ts:360`: filing wait (`waitForEvent`, l.400), verification completion (l.529), relearn retention reset (l.636), SM-2 update-retention (l.684), vocabulary retention (l.721), needs-deepening (l.844), milestone completion + comet (l.868-887), XP. `progress-summary.ts`, `session-completed-observe.ts` also subscribe |

---

## Navigation depth map

Depth measured in **taps from a tab root**. "Inside-session" actions counted as taps after the session screen is already open.

| Capability | Path | Depth | >2 levels? |
|---|---|---|---|
| Start a learning session | Home tab → topic card "Continue" | ~2 | borderline |
| Start from a book | Library tab → subject → book → start | 3–4 | **YES** (`shelf/[subjectId]/book/[bookId]`) |
| Recitation | (tab) → Practice → start | 2–3 | borderline |
| Homework | Home/tab → homework camera → capture → review → session | 3–4 | **YES** |
| Send a message | session open → type → send | +1 | no |
| Switch topic mid-session | session → quick chip → `TopicSwitcherModal` → pick subject → pick topic | +2 (modal-in-screen) | **modal** |
| Add note mid-session | session → "+ Add note" chip → `NoteInput` in footer | +1 | no |
| Park a question | session → `park` chip → `ParkingLotModal` | +1 (modal) | **modal** |
| Message feedback | session → tap message → helpful/not-helpful/incorrect | +1 | no |
| Bookmark | session → tap AI message → bookmark toggle | +1 | no |
| Challenge Round accept | session → offer card appears inline → accept | +1 | no (inline) |
| Skip warm-up | session header chip (only when `continuationDepth` set) | +1 | hidden/conditional |
| End → Summary → Recall bridge → Continue | session → End → summary screen → write/skip → continue | +3 screens | **YES — a multi-screen exit funnel** |
| Mentor memory (from summary) | summary → "mentor memory" → `/(app)/mentor-memory` (`[sessionId].tsx:807`) | deep | crosses domain |

**Buried capabilities** (a user would struggle to find):
- **Parking Lot** — only reachable via a quick chip that appears only in `stage === 'teaching'` (`SessionAccessories.tsx:32`), and only after first message (`use-session-actions.ts:468`).
- **Skip warm-up** — header chip only renders when `activeSession.metadata.continuationDepth` is low/mid/high (`index.tsx:1050-1053`). Invisible otherwise.
- **Wrong subject / switch topic** — two different chip IDs (`wrong_subject`, `switch_topic`) that both just open the same `TopicSwitcherModal` (`use-session-actions.ts:457-465`) — redundant entry points.
- **Recall bridge** — homework-only, surfaces only on the summary screen after a homework session.

---

## Backend processes & data model

### Route surface — `apps/api/src/routes/sessions.ts` (1,656 lines, 25 endpoints)

```
GET    /sessions/resume-nudge                       (231)
GET    /subjects/:subjectId/sessions                (238)
POST   /subjects/:subjectId/sessions/first-curriculum (249)
POST   /subjects/:subjectId/sessions                (281)  start
GET    /sessions/:sessionId                          (306)
PATCH  /sessions/:sessionId/clear-continuation-depth (317)
POST   /sessions/:sessionId/retry-filing             (330)
POST   /sessions/:sessionId/library-filing/keep-out  (408)
POST   /sessions/:sessionId/library-filing/add       (426)
POST   /sessions/:sessionId/library-filing/restore   (453)
POST   /sessions/:sessionId/messages                 (481)  non-streaming exchange
GET    /sessions/:sessionId/transcript               (575)
POST   /sessions/:sessionId/evaluate-depth           (590)
POST   /sessions/:sessionId/stream                   (658)  SSE exchange (primary)
POST   /sessions/:sessionId/close                    (1225)
POST   /sessions/:sessionId/system-prompt            (1297) typed intent only
POST   /sessions/:sessionId/events                   (1315)
POST   /sessions/:sessionId/input-mode               (1329)
POST   /sessions/:sessionId/homework-state           (1347)
POST   /sessions/:sessionId/flag                      (1367)
GET    /sessions/:sessionId/summary                  (1385)
POST   /sessions/:sessionId/summary/skip             (1396)
POST   /sessions/:sessionId/summary                  (1432) submit
POST   /sessions/interleaved                          (1480)
POST   /sessions/:sessionId/recall-bridge            (1501)
```

Every write endpoint calls `assertNotProxyMode(c)` (e.g. `sessions.ts:666,1232,1303`) and `withProfile(c)` for profileId scoping. Quota decrement is wired per-stream via `c.get('quotaDecrementSource')` etc. (`sessions.ts:564,844,1213`).

### The exchange orchestrator — `services/session/session-exchange.ts` (3,351 lines)

`processMessage` (l.2778) and `streamMessage` (l.3019) are the two entrypoints. `processMessage` flow:
1. `checkExchangeLimit` (l.1297, l.2830) — hard cap `MAX_EXCHANGES_PER_SESSION` (50).
2. `prepareExchangeContext` (l.1434) — "9+ parallel DB queries" (comment l.2829): topic, prior learning (`buildPriorLearningContext` l.2075), cross-subject highlights (l.2076), interleaved topics (l.1737-1773), resume context (l.2162), learner memory (`learnerMemoryContext` l.2307), embedding memory, accommodation, retention status, conversation language + pronouns.
3. `maybeDispatchReviewCalibration` (l.1038 / l.2843).
4. `processExchange` → LLM call (`exchanges.ts`).
5. `applyChallengeRoundRuntimeSignals` (l.900 / l.2896).
6. `persistExchangeResult` (l.2420) — writes AI response + signals.
7. `maybeDispatchTopicProbeExtraction` (l.1145 / l.2968).
8. `resolveReadyToFinish` (l.151) — interview hard cap `MAX_INTERVIEW_EXCHANGES = 4` (`exchanges.ts:126`).

### Escalation ladder — `services/escalation.ts` (285 lines)

5-rung Socratic ladder (`getEscalationPromptGuidance` l.222): R1 Socratic easy → R2 Socratic narrowed → R3 parallel example → R4 transfer bridge → R5 teaching pivot (with rung-5 exit protocol setting `signals.needs_deepening`, l.273-278). `evaluateEscalation` (l.138): "I don't know"/stuck phrases (`STUCK_INDICATORS` l.51) escalate faster; partial-progress holds (cap `MAX_PARTIAL_PROGRESS_HOLDS=2`); retention-aware thresholds (`fading` → escalate after 2 not 3). Retention-aware starting rung (`getRetentionAwareStartingRung` l.99): `forgotten`→R3, `weak`→R2.

### LLM router — `services/llm/router.ts` (1,728 lines)

`routeAndCall` (l.1084), `routeAndStream` (l.1506). V2 §1.5 matrix (`new-llm` branch): universal default `gpt-oss-120b` @ Cerebras for all tiers/rungs 1-3 + Family/Free rungs 4-5 (l.398, l.465-468); paid vision → GPT-5 mini, free vision → `mistral-small-2603` (l.400, l.437-441); deep rungs 4-5 on `premium` tier → `gpt-5.4` (`OPENAI_ADVANCED_MODEL` l.325, gated `rung >= V2_ADVANCED_MODEL_MIN_RUNG`, l.456). `FALLBACK_FORBIDDEN` bans gemini/vertex fallback (l.418). `gemini_only` provider policy is legacy Family/Plus-standard (l.422-428). Behind `LLM_ROUTING_V2_ENABLED` (`setLlmRoutingV2Enabled` l.387).

### LLM envelope — `services/llm/envelope.ts`, `stream-envelope.ts`

`parseEnvelope`/`extractReplyCandidate`/`teeEnvelopeStream` (`exchanges.ts:1-9`). Stream tees client-facing `reply` text from the full envelope (signals + ui_hints parsed server-side). Source-provenance audit (`auditExchangeSources` `exchanges.ts:836`): every factual claim must cite `private_sources.relied_on`; general-knowledge gated at confidence floor `0.88` (`GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR` l.213); unsupported source-bound sentences scrubbed (`stripUnsupportedSourceBoundSentences` l.1213) and replaced with a no-source safety fallback (`buildUnsupportedFactualReply` l.955).

### Safety

`detectCatastrophicSafetyTrigger` + `tripwireResponse` (`exchanges.ts:46-49`) — deterministic input-side tripwire. `emitCrisisRedirectEvent` (`exchanges.ts:68`) → Inngest `app/safety.crisis_redirect_fired` (metadata-only, no message content, l.91-99). `sanitizeUserContent` (l.146) strips reconstructable `<server_note>` tags (prompt-injection guard, bounded 8-pass loop).

### SSE event contract — `apps/mobile/src/lib/sse.ts`

`StreamEvent` union (l.109): `chunk`, `replace`, `fallback`, `replay`, `done`, `error`. `StreamDoneEvent` (l.78) carries `exchangeCount`, `escalationRung`, `expectedResponseMinutes`, `notePrompt`, `fluencyDrill`, `challengeRound`, `challengeOffer`, `draftedNote`, `confidence`. Mobile never parses raw envelope JSON — server gates everything (l.95 comment).

### Data written
- `sessions` (status, metadata.challengeRound l.646, continuationDepth, milestonesReached, verificationType).
- `ai_responses` / session events (escalation rung, isUnderstandingCheck, confidence, retrievalScore, sourceAudit, evaluateAssessment/teachBackAssessment signals — `session-exchange.ts:2925-2962`).
- Idempotency via `Idempotency-Key` header → `clientId` (`sessions.ts:673-678`); orphan persistence on LLM failure (`persistUserMessageOnly`, l.2864).

---

## Complexity signals & redesign notes

1. **One 1,335-line god component** (`session/index.tsx`) with ~40 `useState`, 12 `useRef`, 8 composed hooks. Every mode, every widget, every error state lives in one render tree. A one-screen redesign must decompose this state, not just the visuals.

2. **Six modes share one screen but diverge subtly** (`sessionModeConfig.ts`): homework shows question counter + timer-off, review shows a timer, recitation is "Beta", relearn vs learning differ only in copy. The UI affordances (timer, question counter, book link, homework Help/Check toggle) flicker in/out based on mode + stage + flags. A redesign should make mode a first-class, visible state rather than a hidden param.

3. **Conditional/hidden affordances** — many actions only appear under narrow conditions:
   - quick chips only in `stage==='teaching'` (`SessionAccessories.tsx:32`),
   - skip-warmup only when `continuationDepth` is set (`index.tsx:1050`),
   - parking lot only after first message,
   - challenge offer only when `challengeEligible` + runtime flag.
   Users "need instructions" precisely because the screen's capabilities are context-gated and invisible until conditions align.

4. **Modal-on-screen stacking**: `TopicSwitcherModal`, `ParkingLotModal`, `ConfirmationToast`, `CelebrationOverlay`, plus inline `ChallengeOfferCard`, `DraftedNoteReview`, `BookmarkNudgeTooltip`, `FilingFailedBanner`, `OutboxFailedBanner` all overlay the chat (`index.tsx:1303-1331`). Multiple competing overlays can co-occur.

5. **Redundant entry points to the same action**: `wrong_subject` and `switch_topic` chips both open `TopicSwitcherModal` (`use-session-actions.ts:457-465`). "Add note" exists both mid-session (chip) and post-session (footer + summary screen).

6. **A 3-screen exit funnel**: ending a session is not one action — it's End → library-filing prompt → summary "Your Words" → (homework) recall bridge → Continue, spread across the session footer and a separate summary route. Easy to abandon mid-funnel.

7. **The exchange backend is enormous and stateful** (`session-exchange.ts` 3,351 lines, `exchanges.ts` 2,167 lines, `router.ts` 1,728 lines). A redesign that collapses UI must NOT assume the backend loop simplifies — escalation, envelope, source-audit, challenge-round, and the completion pipeline are deeply intertwined.

8. **Streaming + non-streaming dual path**: `/stream` falls back to `/messages` (`processMessage`) on error (`sessions.ts:767`). Both must stay in sync (the code comments at `session-exchange.ts:2816,3004` exist precisely because they drifted). Any UI rewrite inherits this dual-path obligation.

9. **Recovery / hydration complexity**: `useSessionRecovery`, `useSessionTranscriptHydration`, auto-resume lookup (`index.tsx:446-467`), `useFocusEffect` state-reset (l.500-565). Multiple bug-fix comments (M-7, BUG-350, BUG-357, BUG-373, CR-9) document fragile state-timing races.

---

## Overlaps with other domains

| Capability | Also lives in | Evidence |
|---|---|---|
| **Notes** | Library domain. Created mid-session (`useCreateNote` `index.tsx:631`), post-session footer (`NoteInput` `SessionFooter.tsx:6`), summary screen, and Challenge-Round drafted notes (`DraftedNoteReview`). 4+ entry points. | `index.tsx:631,1140`; `SessionFooter.tsx:121` |
| **Library filing** | Library/Save-wizard domain. Filing prompt rendered inside session footer + summary; `save-wizard/ConfirmStep.tsx` also launches sessions. | `SessionFooter.tsx:72`; `sessions.ts:408-453`; `_components/save-wizard/ConfirmStep.tsx` |
| **Progress / retention** | Progress domain. Session close drives SM-2 retention, vocabulary retention, needs-deepening, milestones (`session-completed.ts:684,721,844,868`). Summary screen shows topic suggestions + mentor-memory. | `session-completed.ts`; `[sessionId].tsx:807` |
| **Mentor memory** | Memory domain. Surfaced as a cue on summary (`MentorMemoryCue`) and as context input to the exchange (`learnerMemoryContext`, `embeddingMemoryContext`). Summary links to `/(app)/mentor-memory`. | `[sessionId].tsx:59,807`; `session-exchange.ts:2307` |
| **Challenge Round** | Its own service (`services/challenge-round/`) but state machine lives in session metadata and renders inline in the session screen. | `index.tsx:1001-1038`; `session-exchange.ts:900` |
| **Homework / dictation** | Homework domain feeds into session as `mode=homework` with OCR/image. Dictation `text-preview.tsx:79` also starts homework sessions. | `homework/camera.tsx:509`; `dictation/text-preview.tsx:79` |
| **Practice / assessment** | Practice domain launches sessions in `recitation`, `gap_fill`, `learning` modes. | `practice/index.tsx:922`; `practice/assessment/index.tsx:466,503` |
| **Quiz / interleaved** | Interleaved retrieval pulls topics across subjects (`selectInterleavedTopics`) — overlaps quiz/review scheduling. | `interleaved.ts:60`; `sessions.ts:1480` |
| **Recap / continuity** | `recap` route param feeds the opening message (`getOpeningMessage` `index.tsx:287-295`); resume-nudge endpoint. | `index.tsx:153,287`; `sessions.ts:231` |
| **Subjects** | In-session subject classification/creation overlaps onboarding + create-subject flow. | `index.tsx:629-630`; `create-subject.tsx` |

**Bottom line for a one-screen redesign:** the session screen is already "one screen" structurally — the problem is not too many *routes* but too many *conditional states and overlapping overlays* on that one route, plus a 3-screen exit funnel and capabilities buried behind stage/flag/metadata gates. The hard part of any redesign is the backend loop (escalation × envelope × source-audit × challenge-round × completion pipeline), which does not simplify when the UI does.
