# End-User Test Report — Quiz Flows — 2026-04-19

Live audit of the **new quiz activities + completion hardening + personalization** shipped on the `improvements` branch, via the Expo Web preview (`localhost:8081`), authenticated as the production owner "Zuzana" with the child profile "TestKid" active. This report mirrors the structure of [`end-user-test-report-parent-flows-2026-04-19.md`](end-user-test-report-parent-flows-2026-04-19.md). Findings are numbered `F-Q-xx` to keep the namespace separate.

## What's "new" on the quiz side

Scope was derived from these commits on `improvements` and the related spec:

| Commit | Scope |
|---|---|
| `1f513d1c feat(api): quiz personalization — interests + library topics + ageYears + L1 distractors [P0.1, P1.2]` | Personalization: theme picks driven by onboarding interests + library topics + profile age; L1-familiar distractors for capitals |
| `68a2288c feat: code review fixes + parent narrative phase 1 + quiz completion hardening` | `GET /quiz/rounds/:id` status-branching (in-progress vs. completed), new round-detail screen, results "What You Missed" panel, `results.test.tsx` coverage, schema split (active vs. completed) |
| `1316619e fix(mobile): web stack stacking + quiz/parent improvements [F-003,F-006,F-016,F-017,F-055]` | Mobile polish under quiz umbrella |
| `970a82a5 feat(api): dictation personalization + dead-code cleanup [P0.1, P0.2]` | Removed `AgeBracket.child` and ≤7/≤10 branches from the quiz themer — product is 11+ |

Corresponding spec: [`docs/_archive/specs/2026-04-18-quiz-ui-redesign-finding-fixes.md`](../specs/2026-04-18-quiz-ui-redesign-finding-fixes.md) (F-032 … F-041). The parent-side spec `docs/_archive/specs/Done/2026-04-18-quiz-activities-design.md` documents the upstream activity design.

## Test environment

- **Surface:** Expo Web preview via `.claude/launch.json` `mobile` target.
- **Auth:** Pre-existing Clerk session for the owner "Zuzana".
- **API:** `https://api-stg.mentomate.com` (staging worker).
- **Active child link:** `TestKid` (`019da076-0104-7762-88ce-770beeac8e75`).
- **Caveats:** Web has no Haptics / native Alert — `Haptics.notificationAsync` is a no-op; the quit button has no confirm dialog at all (see F-Q-08). `platformAlert` / `Keyboard.dismiss` are also no-ops.
- **Data discipline:** Two rounds were played to completion (1× capitals 4/8, 1× guess-who 3/4). A third guess-who round was launched and quit mid-play to exercise the quit path. No DB-destructive mutations.

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Tested live — works as expected |
| ⚠️ | Tested live — issue found (see Findings) |
| 🔴 | Tested live — broken or blocked |
| 🔍 | Inspected via code/spec only |
| ⏭️ | Not yet tested |

## Coverage map

### Quiz Index (`/quiz`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QI-01 | Quiz index renders activity cards for kid profile | ✅ | `quiz-capitals` + `quiz-guess-who` IntentCards render; subtitle "Test yourself on world capitals" / "Name the famous person from clues" when `stats` is empty. After first round, subtitle switches to `Best: {score}/{total} · Played: N`. |
| QI-02 | Vocabulary card is gated on an active `four_strands` language subject | ⚠️ | Code path at `index.tsx:52-58, 160-192` filters `allSubjects` by `pedagogyMode === 'four_strands' && languageCode && status === 'active'`. TestKid has no language subject — card never appears. **No onboarding hint** points users to create one before opening `/quiz`. See **F-Q-15**. |
| QI-03 | Back button returns to Practice via `goBackOrReplace` | ✅ | `quiz-back` testid present; `goBackOrReplace(router, '/(app)/practice')`. |
| QI-04 | Load-error fallback offers retry + back | ✅ | Code path at `index.tsx:115-143`. Covers both `statsError` and `subjectsError`. Not triggered live. |
| QI-05 | `setRound(null)` / `setPrefetchedRoundId(null)` / `setCompletionResult(null)` on activity tap | ✅ | Verified in each `onPress` handler — prevents stale flow-context when switching activities. |

### Quiz Launch (`/quiz/launch`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QL-01 | Loading state rotates friendly messages | ✅ | "Shuffling questions... / Picking a theme... / Almost ready..." rotates every 1.5s. `quiz-launch-loading` testid. |
| QL-02 | Cancel escape hatch present during loading | ✅ | `quiz-launch-cancel` visible throughout; `goBackOrReplace` back to `/quiz`. UX Resilience rules compliant. |
| QL-03 | 20s "taking longer than usual" nudge | 🔍 | Code at `launch.tsx:85-92`. Not triggered live — round generation returned in < 10s. |
| QL-04 | Retry reuses the same success/onSuccess handler [ASSUMP-F1] | ✅ | Exercised live: initial capitals round returned `502 UPSTREAM_ERROR`; tapped `quiz-launch-retry` → second attempt succeeded and navigated into play. |
| QL-05 | Error message surfaces server-extracted reason | ⚠️ | Error panel rendered text **"API error 502: {\"code\":\"UPSTREAM_ERROR\",\"message\":\"Quiz LLM returned invalid structured output\"}"** verbatim. See **F-Q-01** — the classifier is letting the raw JSON body + HTTP status through, violating the CLAUDE.md rule "Never replace specific server errors with generic 'check your connection'" (and its inverse — never show raw envelopes either). |
| QL-06 | Retry button is hidden for `QUOTA_EXCEEDED` / `FORBIDDEN` / `CONSENT_*` | 🔍 | Code at `launch.tsx:156-166, 186`. Not exercised live (no quota-hit on test account). |
| QL-07 | Challenge-round banner auto-advances after 3s | ⚠️ | Code at `launch.tsx:95-100` — banner with "Start" button auto-transitions in 3s via `setTimeout`. See **F-Q-12** — no opt-out; a kid reading slowly may miss the banner entirely. |

### Quiz Play (`/quiz/play`) — Capitals (MC)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QP-01 | Round progress indicator `N of 8` | ✅ | Capitals round total = 8 questions (`QUIZ_CONFIG.totalQuestionsByActivity.capitals`). |
| QP-02 | Country rendered in the prompt | ✅ | "What is the capital of Germany?" — `question.country` interpolated correctly. |
| QP-03 | 4 options per question (MC) | ✅ | All 8 rendered 4 options each. Distractors were plausible and L1-appropriate for an English-speaking 11+ profile. |
| QP-04 | L1-familiar distractors [P1.2] | 🔍 | Code at `config.ts` + `generate-round.ts` surfaces L1 distractors for the profile's conversation language. TestKid has no `conversationLanguage` override — this pass used the default L1 set. Visual check: Polish question offered Gdansk/Warsaw/Wroclaw/Krakow (all Polish cities), Czech offered Brno/Ostrava/Prague/Plzen (all Czech). Distractors were real cities in the same country, which is what the spec intends. |
| QP-05 | Correct answer highlight | ✅ | Selected option goes `bg-primary` (teal) + `text-text-inverse` when correct. `getOptionContainerClass` at `play.tsx:339-346`. |
| QP-06 | Wrong answer highlight | ⚠️ | Selected option goes `bg-danger` (red). **But the correct answer is never revealed in the feedback phase** — all non-selected options go `bg-surface opacity-60` regardless of correctness. See **F-Q-02**. The fun-fact below sometimes names the correct answer inline ("Warsaw was almost completely rebuilt…"), but that's implicit and relies on the kid reading. Per spec CR-1: "The correct answer (when wrong) is revealed on the results screen via questionResults." This is a deliberate trade-off but the teaching moment is weaker than it could be. |
| QP-07 | Feedback hint rotation: "Nice work" → "Tap anywhere to continue" after 4s | ✅ | `showContinueHint` flips after 4s (`play.tsx:300-302`). Verified on both correct and wrong answers. |
| QP-08 | Tap-anywhere advance | ✅ | Root `Pressable onPress={handleContinue}` (play.tsx:356-365). |
| QP-09 | Submit on last question → `/quiz/results` | ✅ | After Q8 feedback → tap → POST `/quiz/rounds/:id/complete` → navigates to results. |
| QP-10 | Malformed round fallback | 🔍 | Code path `quiz-play-malformed` at `play.tsx:196-225` — not reachable without corrupt state. |
| QP-11 | Time counter label | ⚠️ | Header shows raw "5s / 15s / 60s" with no label. It's elapsed-time (count-up, uncapped), NOT a countdown — but users will likely read it as a timer. See **F-Q-13**. |
| QP-12 | Quit button dismisses without confirmation | 🔴 | `quiz-play-quit` → `handleQuit` → `goBackOrReplace(router, '/(app)/quiz')`. No confirm dialog, no progress warning. See **F-Q-08**. |

### Quiz Play — Guess Who (free-text + MC fallback)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QG-01 | Round length differs from capitals | ✅ | Guess Who = 4 questions in the first round, 3 in the second. Per `QUIZ_CONFIG.totalQuestionsByActivity.guess_who`. |
| QG-02 | First clue rendered + input + Submit guess + Reveal next clue | ✅ | Matches spec. |
| QG-03 | Correct free-text match via fuzzy server check [CR-1] | ✅ | Typed "Newton" for an Isaac-Newton clue (not the canonical "Isaac Newton") → `POST /check` returned `correct:true`. Fuzzy matching on canonicalName + acceptedAliases works. |
| QG-04 | Wrong free-text guess reveals next clue instead of marking wrong | ✅ | Typed "Chopin" for a Marie-Curie question → UI appended Clue 2 + "Not quite. Here's another clue." Matches `handleSubmitGuess` behavior at `GuessWhoQuestion.tsx:94-136`. |
| QG-05 | MC fallback appears once `visibleClueCount >= 3` [ASSUMP Q-4] | ✅ | After third clue reveal: "Need a fallback? Pick one: Dorothy Hodgkin / Marie Curie / Rosalind Franklin / Lise Meitner" — 4 plausible same-era female scientists. |
| QG-06 | MC fallback pick resolves the round | ✅ | Tapped "Marie Curie" → feedback "You got it in 3 clues!". `answerMode: 'multiple_choice'`. |
| QG-07 | Final-clue `I don't know` skip path | ✅ | Revealed all clues on an "ancient Greece / universe in numbers" question → button label flipped to "I don't know" → tapping resolved the round with `answerGiven: '[skipped]'` server-side. Result recorded as wrong. |
| QG-08 | Wrong-answer feedback in Guess Who reveals person | ⚠️ | Feedback panel shows "Better luck next time!" + funFact ("I believed that everything in the universe, even music, could be explained with numbers!") but **never names the person**. See **F-Q-07** — the correct answer is only revealed on the results screen. Similar issue to F-Q-02 but more acute because the kid actively invested clues. |
| QG-09 | Haptics fire on resolve | 🔍 | `Haptics.notificationAsync(Success | Error)` at `play.tsx:545-549` — web has no haptics; native-only. |
| QG-10 | First wrong free-text guess still gets "free" next clue (no penalty) | 🔵 | Design: wrong guess doesn't advance `cluesUsed`, only `visibleClueCount` bumps. A kid can spam guesses across all clues. See **F-Q-14** (info-only). |

### Quiz Results (`/quiz/results`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QR-01 | Celebration tier icon + title | ✅ | "Nice effort!" (thumbs-up) for 4/8 capitals. Perfect tier renders `BrandCelebration` at `results.tsx:130-134`. Not reached in this pass. |
| QR-02 | Score + total shown | ✅ | `4/8` for capitals, `3/4` for guess-who. |
| QR-03 | Guess-Who sub-line "N of N people identified" | ✅ | Renders for `activityType === 'guess_who'` at `results.tsx:143-147`. |
| QR-04 | Theme name rendered | ✅ | "Central European Capitals" (capitals) / "Pioneers of Discovery" (guess_who) — themed round labels working. |
| QR-05 | XP chip | ✅ | `+42 XP` (capitals) / `+51 XP` (guess-who). |
| QR-06 | "What You Missed" section surfaces per-question mistakes [F-040] | ⚠️ | Rendered — but the user's `answerGiven` came through as `undefined` on every missed card. See **F-Q-03** (accessibility tree shows literal "You said undefined"). |
| QR-07 | Missed-card prompt for Guess Who | ⚠️ | Shows literal **"Guess Who"** instead of any identifying context (first clue, person category, …). See **F-Q-04**. |
| QR-08 | Missed-card prompt for Capitals | ✅ | `"Capital of {country}"` via `questionPrompt` at `results.tsx:73-84`. |
| QR-09 | Play Again pre-warms prefetched round | ⚠️ | Live retest: after Guess-Who round, `Play Again` landed on `/quiz` (activity picker), not a new guess-who round. See **F-Q-09** — suspected race between `setCompletionResult(null)` (which fires the `useEffect` redirect to `/practice`) and `router.replace('/(app)/quiz/launch')`. |
| QR-10 | Done clears flow context + returns to `/practice` | ✅ | `handleDone` → `clear()` + `goBackOrReplace`. |
| QR-11 | View History link | ✅ | Navigates to `/quiz/history` cleanly. |
| QR-12 | Direct URL `/quiz/results` without `completionResult` | ✅ | Guard at `results.tsx:37-41` → `goBackOrReplace(router, '/(app)/practice')`. Break test passed. |

### Quiz History (`/quiz/history`)
| ID | Flow | Status | Notes |
|---|---|---|---|
| QH-01 | History list loads | ✅ | `GET /v1/quiz/rounds` (or equivalent via `useRecentRounds`) → 200. Showed the completed capitals round under the "Today" section header. |
| QH-02 | Friendly date header | ✅ | `formatDateHeader` returns "Today" / "Yesterday" / locale long date. Confirmed "Today" label. |
| QH-03 | Row tile content | ⚠️ | Shows activity label + theme + "4/8 · 42 XP". Activity label fell back to the raw slug **"capitals"** (lowercase) because `activityLabel` appears to be missing from the list-response payload. See **F-Q-05**. |
| QH-04 | Row tap → round detail | ✅ | Tapping `quiz-history-row-{id}` navigates to `/quiz/{id}` and renders all 8 Q+A pairs. |
| QH-05 | Row accessibility | ⚠️ | The row `Pressable` has no `accessibilityRole` / `accessibilityLabel` — screen-reader users don't know it's tappable. See **F-Q-06**. |
| QH-06 | Empty state | 🔍 | `quiz-history-empty` with "No rounds played yet" + `quiz-history-try-quiz` CTA. Not reached live (account has history). Has a single clear action — UX Resilience compliant. |
| QH-07 | Loading state | 🔍 | `quiz-history-loading` with "Loading history..." — flashed too briefly to capture. Has no escape (no cancel), but the request completes in < 500ms so it's not a dead-end in practice. |

### Quiz Round Detail (`/quiz/[roundId]`) [F-032]
| ID | Flow | Status | Notes |
|---|---|---|---|
| QD-01 | Completed-round detail returns full payload [F-032] | ✅ | Live: rendered all 8 questions with `Your answer: X` + `Correct answer: Y` + per-question Correct/Wrong pill. `GET /v1/quiz/rounds/:id` returned `score`, `questions[].correctAnswer`, and `results[]` for a round with `status === 'completed'`. Spec Task 1 landed. |
| QD-02 | Answer mismatch vs. results screen | ⚠️ | Detail shows `Your answer: Szeged / Presov / Zurich` (correctly pulled from DB) — but the results-screen "What You Missed" cards for the SAME rounds rendered `answerGiven === undefined`. Two paths, one round, different shapes. See **F-Q-10**. |
| QD-03 | Activity title at top of detail | ✅ | "Central European Capitals / Capitals · 4/8". |
| QD-04 | In-progress round detail returns stripped shape | 🔍 | Spec Task 1 requires the same route to gate on `status` and keep the stripped shape for `in_progress`. Not exercised live (no in-progress round in this pass) but covered by `quiz.test.ts:"GET /quiz/rounds/:id returns stripped shape for in-progress round"` per the spec's Verified By table. |
| QD-05 | 404 on cross-profile access | 🔍 | `createScopedRepository(profileId)` guard. Not probed live with a foreign round ID. |

### Direct-URL break tests
| ID | Probe | Status | Notes |
|---|---|---|---|
| BT-Q-01 | `GET /quiz/rounds/:id` for completed round | ✅ | Returns `score`, unstripped `correctAnswer` on each question, and `results[]` with `answerGiven` / `answerMode` / `cluesUsed`. Matches F-032 spec. |
| BT-Q-02 | `POST /quiz/rounds` under LLM hiccup | ✅ | Observed `502 UPSTREAM_ERROR / "Quiz LLM returned invalid structured output"` once; retry via `quiz-launch-retry` succeeded. Retry wiring works; error display does not (F-Q-01). |
| BT-Q-03 | Direct nav to `/quiz/play` without round context | ✅ | `_layout` + `play.tsx` guard redirects to `/quiz`. |
| BT-Q-04 | Direct nav to `/quiz/results` without `completionResult` | ✅ | Guard at `results.tsx:37-41` redirects to `/practice`. |

---

## Findings (running list)

> Severity: 🔴 high · 🟡 medium · 🟢 low · 🔵 info-only · 🌐 web-only artifact.

### F-Q-01 🟡 Launch error screen leaks raw JSON envelope and HTTP status code
- **Where:** `apps/mobile/src/app/(app)/quiz/launch.tsx:148-151` — `errorMessage` branch; message surfaces `generateRound.error.message` verbatim.
- **Observed:** After a transient LLM 502 on the first capitals round, the error panel rendered:
  > Couldn't create a round
  > API error 502: {"code":"UPSTREAM_ERROR","message":"Quiz LLM returned invalid structured output"}
- **User impact:** Kid-facing copy shows a raw JSON envelope and an HTTP status code. Per CLAUDE.md: "Classify errors at the API client boundary, not per-screen — distinguish quota exhausted, forbidden, gone, network error, etc. in middleware." The classifier IS present (`errorCode` read at line 157-162) but the visible message is still the raw `err.message` produced by `assertOk`.
- **Suggested fix:** In the API-client middleware (or `assertOk`), parse the JSON body once and set `err.message` to the user-friendly `message` field only — never prepend `API error {status}: {json}`. Alternatively, map common codes (`UPSTREAM_ERROR`, `TIMEOUT`, `RATE_LIMITED`) to child-appropriate copy at the boundary.

### F-Q-02 🟡 Wrong-answer feedback on capitals does not reveal the correct option
- **Where:** `play.tsx:339-346` `getOptionContainerClass` — explicitly returns `bg-surface opacity-60` for every non-selected option regardless of correctness.
- **Observed:** After picking Gdansk for "Capital of Poland", the Poland tile went red (`bg-danger`), the other three (Warsaw, Wroclaw, Krakow) were dimmed identically. The funFact line did mention "Warsaw" inline, so the answer is implicitly revealed only if the kid reads — and only if the funFact happens to name the city.
- **User impact:** Pedagogical weakness — the teaching moment is soft. A kid who scans past the funFact leaves the question without knowing the correct answer. The missed-questions panel on the results screen partially mitigates this, but several minutes after the mistake.
- **Suggested fix:** On `answerState === 'wrong'`, highlight the correct option with `bg-success` (or a thin green border) so it's visible at a glance. Note the comment at line 336-338 explicitly calls this out as a "limitation" — consider lifting that limitation by having the server return `correctAnswer` on the `POST /check` response when `correct === false` (still safe — the round row exists server-side, nothing new leaked).

### F-Q-03 🔴 Results "You said:" renders literal `undefined` on missed-question cards
- **Where:** `results.tsx:185, 190-192`:
  ```tsx
  accessibilityLabel={`${prompt}. You said ${qr.answerGiven}. Correct answer ${qr.correctAnswer}.`}
  …
  <Text …>You said: {qr.answerGiven}</Text>
  ```
- **Observed:** On every missed card of both live rounds, the visible `You said: ` line was followed by blank, and the accessibility tree contained `"Capital of Poland. You said undefined. Correct answer Warsaw."` (literal word "undefined"). On Guess-Who the skip-path (`resolveFreeText(false, '[skipped]')`) also rendered blank where `[skipped]` should have appeared.
- **User impact:** Sighted users see a broken card (empty `You said:` line with a disconnected green word below it, easy to mistake for the user's own answer). Screen-reader users hear the word "undefined" spelled out.
- **Likely cause:** Either (a) the client builds `completionResult.questionResults` from a path that drops `answerGiven` for results produced by the `[skipped]` / network-error branches, or (b) there's a `ValidatedQuestionResult` vs. `QuestionResult` shape mismatch where the response parser doesn't copy the field. The `[roundId]` detail endpoint correctly shows `Your answer: Szeged` for the SAME question (F-Q-10), so the DB/server side is OK.
- **Suggested fix:** (1) Add a defensive render guard:
  ```tsx
  {qr.answerGiven ? <Text …>You said: {qr.answerGiven}</Text> : <Text …>You didn't answer</Text>}
  ```
  plus an equivalent guard on `accessibilityLabel`. (2) Separately, fix the upstream path — investigate whether the server is serializing `[skipped]` back or the client is losing it during response parsing.

### F-Q-04 🟡 Guess-Who missed card prompt is literal "Guess Who"
- **Where:** `results.tsx:82` — `case 'guess_who': return 'Guess Who';`.
- **Observed:** On the results screen, the missed card reads:
  > Guess Who
  > You said: [blank]
  > Pythagoras
  > I believed that everything in the universe, even music, could be explained with numbers!
- **User impact:** Kid reviewing results can't remember which question this was ("wait, which Guess Who? there were four of them"). The funFact is the only lifeline, and only if they read it.
- **Suggested fix:** Use `question.clues[0]` as the prompt (the first clue is spoiler-safe since the kid already saw it). Example: `Ancient Greek who believed the universe spoke in numbers`. Falls back to `'Guess Who'` only if clues are missing.

### F-Q-05 🟢 History activity label renders as raw slug when server omits `activityLabel`
- **Where:** `history.tsx:115-116` — `(round as { activityLabel?: string }).activityLabel ?? round.activityType.replace('_', ' ')`.
- **Observed:** History row shows lowercase **"capitals"** (not "Capitals") for the one completed round. The fallback `replace('_', ' ')` works for `guess_who → guess who` but leaves everything else lowercase.
- **Likely cause:** The server's recent-rounds list endpoint does not include `activityLabel` in its response shape (only the single-round detail does). Comment at the code site confirms `activityLabel` is meant to be "server provided pre-formatted" — so either the list path regressed or the feature was only wired into the detail path.
- **Suggested fix:** Either (a) add `activityLabel` to `recentRoundSchema` + the list query, or (b) replace the fallback with a client-side mapping (`capitals → 'Capitals'`, `guess_who → 'Guess Who'`, `vocabulary → 'Vocabulary'`) so the UI never renders the raw slug.

### F-Q-06 🟢 History row Pressable has no accessibility role/label
- **Where:** `history.tsx:103-124` — the row `<Pressable>` has `testID` but no `accessibilityRole="button"` or `accessibilityLabel`.
- **Observed:** Screen reader reads the row as plain text; nothing indicates it's tappable or what tapping will do.
- **User impact:** Accessibility regression — parents with a low-vision child (or learners using VoiceOver to navigate a practice session) won't know they can drill into a round.
- **Suggested fix:**
  ```tsx
  accessibilityRole="button"
  accessibilityLabel={`${activityLabel} round — ${round.theme} — ${round.score} out of ${round.total}. Open details.`}
  ```

### F-Q-07 🟡 Guess-Who wrong/skip feedback never reveals the person's name
- **Where:** `play.tsx:555-570` — feedback panel renders "Better luck next time!" + funFact but no `correctAnswer` text for `question.type === 'guess_who'`.
- **Observed:** On the "ancient Greece / universe in numbers" question, after skipping through all clues + tapping "I don't know", the feedback read:
  > Better luck next time!
  > I believed that everything in the universe, even music, could be explained with numbers!
  >
  > Good try
- **User impact:** The kid doesn't learn who Pythagoras was until (possibly) the results screen. Even there, F-Q-04 means the card still doesn't show the clue they were working with. Learning loop is cold.
- **Suggested fix:** For `guess_who`, render the canonical name inline on the feedback panel when `answerState === 'wrong'`:
  ```tsx
  <Text …>The answer was <Text className="text-success font-bold">{question.canonicalName}</Text>.</Text>
  ```
  (Server already has `canonicalName` in the question object.)

### F-Q-08 🟡 Quit mid-round has no confirmation dialog
- **Where:** `play.tsx:143-145` — `handleQuit = () => { goBackOrReplace(router, '/(app)/quiz'); };`
- **Observed:** Tapping the top-left `×` on the third question of a guess-who round instantly dropped out of the round, no confirm. Progress lost (2 answered questions) with no undo.
- **User impact:** Accidental taps on mobile are common, especially on small-screen devices (Galaxy S10e 5.8") where the close button sits near the safe-area insets. A kid thumb-scrolling may hit it.
- **Suggested fix:** Wrap `handleQuit` in a platform-aware confirm (`platformAlert`-style, Alert on native, modal on web):
  > Quit this round? Your progress will not be saved.
  > [Keep playing] [Quit]
  Only proceed with `goBackOrReplace` on Quit. Also consider persisting the `resultsRef.current` so a user can resume if they accidentally quit — but that's larger scope.

### F-Q-09 🟡 "Play Again" can end on the activity picker instead of a fresh round
- **Where:** `results.tsx:86-110` — `handlePlayAgain`.
- **Observed:** After completing the guess-who round, tapping `Play Again` landed on `/quiz` (activity picker) with `Best: 3/4 · Played: 1`, not on a new guess-who round. Root cause appears to be a race between:
  1. `setCompletionResult(null)` — schedules a re-render
  2. The `useEffect` at `results.tsx:37-41` that fires when `completionResult` transitions to null → `goBackOrReplace(router, '/(app)/practice')`
  3. `router.replace('/(app)/quiz/launch')` that `handlePlayAgain` itself issues.
- **User impact:** The "replay" hot path — arguably the most important CTA on a results screen — silently dumps the user back to the picker, mis-stating the UX as "pick your activity" when the intent was "do that again".
- **Suggested fix:** Invert the order — navigate first, then clear state:
  ```ts
  function handlePlayAgain() {
    if (prefetchedRound.data) { setRound(prefetchedRound.data); setPrefetchedRoundId(null); router.replace('/(app)/quiz/play'); setCompletionResult(null); return; }
    if (!activityType) { goBackOrReplace(router, '/(app)/practice'); return; }
    router.replace('/(app)/quiz/launch');
    setCompletionResult(null);
  }
  ```
  Or — cleaner — guard the `useEffect` with a `hasNavigatedRef` so it doesn't fire when the nav is intentional.

### F-Q-10 🟡 `answerGiven` diverges between `POST /complete` response and `GET /quiz/rounds/:id`
- **Where:** Detail screen (`/quiz/[roundId]`) vs. results screen `completionResult.questionResults`.
- **Observed:** Same round, same profile:
  - Detail: `Your answer: Szeged / Presov / Zurich` (correct — these were distractors the client picked).
  - Results: `questionResults[i].answerGiven === undefined` for the same questions (F-Q-03's root).
- **Likely cause:** The server stores `answerGiven` correctly (detail screen proves it) — but the `CompleteRoundResponse.questionResults[]` path at `complete-round.ts:443-455` copies `result.answerGiven` from `validatedResults`. If `validatedResults` is being parsed through a schema (client-side or server-side) that drops the field when it's an empty string / `[skipped]` marker, the completion response loses it while the DB retains it.
- **User impact:** Same card shows two different stories depending on which screen you're on. Mirrors F-PV-07 from the parent report (`totalSessions` vs. `getChildSessions`) in spirit.
- **Suggested fix:** Pick one definition and propagate. Either (1) have the results screen refetch the completed round via `/quiz/rounds/:id` instead of relying on `completionResult` (cost: one extra GET, benefit: a single source of truth), or (2) fix the completion-response pipeline so `answerGiven` always round-trips.

### F-Q-11 🟢 Practice "Quiz" card subtitle mixes incomparable bests
- **Where:** `apps/mobile/src/app/(app)/practice.tsx` (stats rollup on the Quiz IntentCard).
- **Observed:** After 1× capitals (4/8) and 1× guess-who (3/4), the card read "Best: 3/4 · Played: 2 · 93 XP". The "3/4" is the max raw score across activities — but it's from a 4-question round, not a comparable best-of ratio.
- **User impact:** A parent glancing at the card may think the best the kid ever scored was 3/4, when the capitals round was 4/8. Comparing raw numerators hides the ratio.
- **Suggested fix:** Either split the subtitle by activity ("Capitals 4/8 · Guess Who 3/4") or surface the best percentage ("Best: 75%"). Played + XP are safe to aggregate.

### F-Q-12 🟢 Challenge-round banner auto-dismisses after 3 seconds
- **Where:** `launch.tsx:94-100` — `setTimeout(() => enterPlay(challengeRound), 3000)`.
- **Observed:** Not triggered live (no streak-induced challenge in this pass). Code inspection: if a challenge lands, the banner shows "Challenge round — You're on a streak. This one is harder. / [Start]" and auto-advances in 3s.
- **User impact:** A kid still reading the banner at ~2.8s suddenly gets teleported into the round. If they were about to tap Start, the tap lands on the first question's option instead — misclick risk.
- **Suggested fix:** Remove the auto-advance timer; require an explicit Start tap. Or add a visible countdown ("Starting in 3…") so the kid isn't surprised.

### F-Q-13 🟢 Elapsed-time counter looks like a timer
- **Where:** Header of `/quiz/play` — bare text `{seconds}s` next to the progress indicator.
- **Observed:** Displays numbers like `1s / 5s / 15s / 60s` depending on how long the question/feedback has been on screen. No label, no decrement, no cap. First-time users tend to read any seconds counter as a countdown.
- **User impact:** Kids (and honestly adults) experience mild anxiety seeing "5s" and assume they have 5 seconds left. No spec in the quiz docs calls for a timer — this appears to be a debug-ish artifact.
- **Suggested fix:** Either (a) hide it entirely (it's useful to capture `timeMs` for analytics but doesn't need to be visible), or (b) label it "Time: 1:05" so it's unambiguous.

### F-Q-14 🔵 Guess-Who wrong free-text guesses have no penalty
- **Where:** `GuessWhoQuestion.tsx:94-136` — `handleSubmitGuess` calls `onCheckAnswer`; on `false`, bumps `visibleClueCount` but **not** a guess counter. `cluesUsed` is derived from `visibleClueCount`, so wrong guesses do advance the clue count, but only by one clue each, same as tapping "Reveal next clue".
- **User impact:** Informational. A strategic kid can spam wrong guesses across all clues and still end up with the same "used N clues" count. Not a bug per se — the current design equates "I guessed and was wrong" with "I wanted another clue", which is reasonable. Flagging for design awareness.

### F-Q-15 🟡 Vocabulary quiz has no discoverability path for users without a language subject
- **Where:** `index.tsx:52-58, 160-192` — vocab IntentCards render only when `pedagogyMode === 'four_strands' && languageCode && status === 'active'` matches at least one subject.
- **Observed:** TestKid has zero four_strands subjects → the quiz activity picker shows ONLY Capitals + Guess Who. There is no hint, banner, or empty-state nudge explaining that "Vocabulary quizzes unlock when you add a language subject."
- **User impact:** The brand-new vocabulary quiz feature (eval flows + provider + schema shipped on this branch) is invisible to 100% of users who haven't set up a language subject. Users who set one up later will discover it by accident if they revisit the picker.
- **Suggested fix:** Add a disabled-state IntentCard ("Vocabulary — add a language subject to unlock") that routes to the language-setup onboarding screen. Or surface a one-time toast on first `/quiz` entry: "Want vocabulary drills? Add a language subject in Library."

---

## Summary by area

| Area | Status | Confidence |
|---|---|---|
| Quiz index navigation + activity picker | ✅ Works | High |
| Capitals round generation + L1 distractors | ✅ Works | High — visually plausible for EN L1 |
| Capitals MC answer + server-side `/check` | ✅ Works | High |
| Capitals wrong-answer reveal | ⚠️ Weak | High — F-Q-02 reproducible |
| Guess-Who free-text + fuzzy match | ✅ Works | High — "Newton" matched "Isaac Newton" |
| Guess-Who MC fallback after clue 3 | ✅ Works | High |
| Guess-Who wrong feedback | ⚠️ Reveals nothing | High — F-Q-07 reproducible |
| Results score + XP + celebration tier | ✅ Works | High |
| Results "What You Missed" | 🔴 Broken | High — F-Q-03 reproducible on every missed card |
| Results Play Again hot-path | ⚠️ Races to picker | High — F-Q-09 reproducible |
| History list + date grouping | ✅ Works | High |
| History → detail navigation | ✅ Works | High |
| Round detail status-branching [F-032] | ✅ Works | High — detail shows correctAnswer + results |
| Launch error display | ⚠️ Raw envelope | High — F-Q-01 reproducible |
| Quit confirmation | ⚠️ Missing | High — F-Q-08 |
| Vocabulary discoverability | ⚠️ Hidden | High — F-Q-15 |
| Data consistency (results vs. detail) | ⚠️ Diverges | High — F-Q-10 |
| Accessibility on history rows | ⚠️ Unlabeled | Medium — F-Q-06 |
| Copy polish (slug, timer, subtitle) | 🟢 Minor | — F-Q-05, F-Q-11, F-Q-13 |

## Priorities for next pass

1. **F-Q-03 (🔴):** Fix the "You said: undefined" render + accessibility label. Add the defensive guard immediately and separately investigate why `answerGiven` drops out of the complete-round response for skipped / network-error branches.
2. **F-Q-10 (🟡):** Resolve the answerGiven divergence between `/complete` response and `/quiz/rounds/:id`. Pick one definition, propagate.
3. **F-Q-01 (🟡):** Stop leaking raw JSON envelopes + HTTP codes through the error UI. Classify at the API-client boundary, never string-format the server body.
4. **F-Q-09 (🟡):** Invert the state-clear vs. router-replace order in `handlePlayAgain` so the effect doesn't hijack the replay intent.
5. **F-Q-02 / F-Q-07 (🟡):** Reveal the correct answer inline on wrong-answer feedback for both capitals and guess-who — don't make the kid wait for the results screen.
6. **F-Q-08 (🟡):** Add a quit confirmation dialog so an accidental tap doesn't silently nuke a round.
7. **F-Q-04 (🟡):** Replace the literal "Guess Who" prompt on missed cards with the first clue (spoiler-safe).
8. **F-Q-15 (🟡):** Add a discovery hint for the vocabulary quiz so it's not invisible to users without a language subject.
9. **F-Q-05, -06, -11, -12, -13 (🟢):** Copy / a11y polish — low effort, visible win.
10. **Follow-up:** Once a profile with a `four_strands` language subject is available, live-verify the `/quiz/vocabulary/*` flows (eval snapshots exist but the UI path wasn't exercised this pass).
