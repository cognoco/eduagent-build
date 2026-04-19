# Quiz UI-Redesign Branch — Finding Fixes Spec

**Date:** 2026-04-18
**Status:** Draft (adversarial review applied 2026-04-19)
**Branch:** `ui-redesign`
**Source:** [end-user-test-report-2026-04-18.md](../flows/end-user-test-report-2026-04-18.md) findings F-032 through F-040 (quiz series).
**Author context:** End-user test pass on Expo Web preview against `api-stg.mentomate.com`, Zuzana profile, clean quiz history.

### Adversarial Review Changelog (2026-04-19)

1. **F-032:** Fixed phantom file reference (`services/quiz/round.ts` → `services/quiz/queries.ts`). Corrected handler line number (260 → 273). Changed data-integrity fallback from "log warning" to "emit structured metric/Inngest event" per project silent-recovery ban.
2. **F-034:** Removed from Group 3 — already fixed in codebase (`practice.tsx:41–64` dynamically computes subtitle from aggregated `quizStats`).
3. **F-036b:** Extracted from Group 3 into its own sub-group (3b) — it's a cross-package API+schema+client change, not a one-file mobile tweak. Sequenced after F-032 since both touch the same endpoint.
4. **F-037-adjacent:** Fixed line number reference for history Back button (`59-64` → `79-84`).
5. **F-038:** Corrected description from "duplicate label + placeholder" to "redundant label" — the label ("Type your guess") and placeholder ("Type a name") are different strings but serve the same purpose.
6. **F-040:** Fixed `text-danger-soft` token reference (does not exist) → `text-danger` with `opacity-70`. Fixed `lib/theme` directory reference → actual files (`tailwind.config.js`, `design-tokens.ts`). Fixed `play.tsx` line reference (261 → 243). Added explicit note that `results.tsx` must destructure `questionResults` (currently unused). Added small-screen performance note for 8-question worst case. Made F-032 dependency explicit in scope section.
7. **F-041:** Added missing failure modes table, verified-by section, and implementation notes (normalization matching, empty alias handling, self-filtering). Added deferral recommendation — revisit after F-040 usage validates the need.
8. **F-033:** Upgraded deploy smoke-test from "scope creep — optional" to "recommended" given three recurrences of the same deploy-lag class.
9. **Spec-level:** Added Success Criteria section. Updated priority ordering to reflect structural changes.

## Problem

The `ui-redesign` branch ships major new Practice/Quiz features (SM-2 mastery, XP/streaks, themed rounds, round history, round detail, free-text answers, difficulty bump, mark-surfaced discovery). End-to-end testing verified that the two prior CRITICALs (F-014 answer stripping, F-028 `/check` 404) are resolved — but uncovered a new critical server-data gap, a deploy-lag regression, and several pedagogical + UX gaps in the learning loop.

Crucially: the **server side of the learning loop is working** (SM-2 updates, XP math, mastery surfacing, canonical-answer validation). What's missing is that the **UI doesn't consistently show the user what the server computed**. A round ends, the user gets a score — but not the teaching moment. A round is saved — but reviewing it in history shows garbage.

This spec prioritizes fixes by impact on the *learning loop*, not gamification. Per user calibration: "I don't want this to be yet another gamification app — tuning is appropriate, more gamification is not."

## Design

Fixes are grouped by priority. Each group is an independent PR-sized unit.

---

### Group 1 — CRITICAL (block merge / deploy)

#### Fix F-032: `GET /v1/quiz/rounds/:id` must return completion data for completed rounds

**Current behavior:** Returns stripped shape for all rounds:
```json
{ "id", "activityType", "theme", "total", "questions": [{ "type", "country", "options", "funFact", "isLibraryItem" }] }
```

**Desired behavior:** Branch on `quiz_rounds.status`:
- If `in_progress`: keep current stripped shape (protect answers during live play).
- If `completed`: include `score`, `results[]`, and unstripped `correctAnswer` + `acceptedAliases` on each question:
  ```json
  { "id", "activityType", "theme", "total", "score", "xpEarned", "celebrationTier", "completedAt",
    "questions": [{ "type", "country", "options", "correctAnswer", "acceptedAliases",
                    "funFact", "isLibraryItem" }],
    "results": [{ "questionIndex", "correct", "answerGiven", "timeMs", "answerMode", "cluesUsed" }] }
  ```

**Scope:** API only. Client code in [apps/mobile/src/app/(app)/quiz/[roundId].tsx](../../apps/mobile/src/app/(app)/quiz/[roundId].tsx) already reads these fields (`round.score`, `round.results`, `q.correctAnswer`) — no mobile changes needed.

**Files:**
- [apps/api/src/routes/quiz.ts:273](../../apps/api/src/routes/quiz.ts) — `GET /quiz/rounds/:id` handler (line 273). `toClientSafeQuestions()` is defined at line 62 and called at lines 295 (completed) and 309 (active). Replace unconditional stripping with a status-based conditional.
- [apps/api/src/services/quiz/queries.ts](../../apps/api/src/services/quiz/queries.ts) — round query logic lives here (not `round.ts`, which does not exist). Add `getCompletedRoundForProfile(profileId, roundId)` that joins `quiz_rounds` + `quiz_round_results`.
- [packages/schemas/src/quiz.ts](../../packages/schemas/src/quiz.ts) — add `completedQuizRoundSchema` distinct from `activeQuizRoundSchema`. Union the two for the response shape; discriminate on `status`.

**Implementation notes:**
- Read `status` from `quiz_rounds` table. Use Zod discriminated union on response.
- `toClientSafeQuestions()` becomes conditional: do not strip answer fields when `status === 'completed'`.
- Include `results` only on `status === 'completed'`. In-progress rounds must never leak per-question correctness (user could inspect mid-round).
- Include `acceptedAliases` on completed rounds only — needed so the round detail UI can render "We also accept: Tesla, Nicola Tesla" helper per F-041 spec below.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| In-progress round, client asks for detail | `status === 'in_progress'` | Stripped shape identical to current behavior | N/A — intended |
| Completed round, other profile | Cross-profile access attempt | 404 NotFound | Scoped repo blocks access |
| Round deleted mid-fetch | race condition | 404 NotFound | Client falls through to existing `round-detail-error` state |
| DB transient error | connection drop | 500 with typed error | Client falls through to `round-detail-error` (existing) |
| `quiz_round_results` missing for completed round | data-integrity bug | empty `results: []` + score from round row | **Emit structured metric/Inngest event** (not just `console.warn` — per project rules, silent recovery without escalation is banned); detail view renders "No per-question data for this round" inline rather than "all wrong" |

**Verified By:**
- `test: apps/api/src/routes/quiz.test.ts:"GET /quiz/rounds/:id returns stripped shape for in-progress round"`
- `test: apps/api/src/routes/quiz.test.ts:"GET /quiz/rounds/:id returns results+correctAnswer for completed round"`
- `test: apps/api/src/routes/quiz.test.ts:"GET /quiz/rounds/:id 404 for round owned by different profile"`
- `manual: play 1 round to completion in staging, navigate to /quiz/{id}, verify score + per-question correctness + correctAnswer reveal`

**Rollback:** Safe. No schema changes. No data migration. Reverting the route handler restores prior (broken-but-stripped) behavior.

**Commit tag:** `fix(api): GET /quiz/rounds/:id returns completion data for completed rounds [F-032]`

---

#### Fix F-033: Redeploy `mentomate-api-stg` to land `/quiz/missed-items/mark-surfaced`

**Current behavior:** `POST /v1/quiz/missed-items/mark-surfaced` returns plain text `"404 Not Found"` (content-type `text/plain`) — Hono default for un-routed URLs. Source code has the route at [apps/api/src/routes/quiz.ts:355](../../apps/api/src/routes/quiz.ts:355) (commit 6318a8fd). Deploy lag identical to the now-fixed F-014/F-028.

**Desired behavior:** Route returns `200 { "markedCount": number }` per the schema expected by [apps/mobile/src/hooks/use-coaching-card.ts:70](../../apps/mobile/src/hooks/use-coaching-card.ts:70).

**Scope:** Deploy action only. No code change.

**Verified By:**
- `manual: curl -XPOST https://api-stg.mentomate.com/v1/quiz/missed-items/mark-surfaced -d '{"activityType":"capitals"}' → 200 { markedCount: n }`
- `test: apps/api/src/routes/quiz.test.ts:"POST /quiz/missed-items/mark-surfaced marks items for activityType"` — add this test so future stale deploys surface as test failures before landing.

**Preventive work (recommended — this is the third deploy-lag regression after F-014 and F-028):** Add a smoke-test step to the deploy workflow that hits one endpoint per quiz route group (`/stats`, `/rounds`, `/rounds/:id/check`, `/missed-items/mark-surfaced`) and fails the deploy if any returns 404 with plain-text body. This would have caught F-014, F-028, and F-033 automatically. Three recurrences of the same class of bug elevates this from "nice to have" to "fix the systemic cause."

**Commit tag:** `chore(api): redeploy staging to land mark-surfaced route [F-033]`

---

### Group 2 — PEDAGOGICAL (the core user win)

#### Fix F-040: Results screen reveals which questions were missed + correct answers

**Current behavior:** [apps/mobile/src/app/(app)/quiz/results.tsx](../../apps/mobile/src/app/(app)/quiz/results.tsx) renders tier icon, title, score, theme, XP pill, Play Again / Done / View History buttons. It has no per-question breakdown — users don't know WHICH questions they missed or what the correct answers were.

**Desired behavior:** Below the XP pill, render a "What you missed" section when `questionResults.some(r => !r.correct)`.

For each wrong answer:
- Question prompt (reconstructed from `questionResults[i].questionIndex` → `round.questions[i]`):
  - Capitals: `"Capital of {country}"`
  - Vocabulary: `"Translate: {term}"`
  - Guess Who: `"Clue: {first clue}"` (use first clue only — three stacked would be noisy)
- User's answer, muted red color: `"You said: {answerGiven}"`
- Correct answer, muted green color: `"Answer: {correctAnswer}"`
- The existing `funFact` from the question, in a small caption below the pair.

For perfect rounds (`questionResults.every(r => r.correct)`): skip this section entirely. The existing celebration already works.

**Do NOT add:**
- Confetti, more XP, streak counters, celebratory animations on wrong answers — this is a teaching surface, not a gamification one.
- A "Review these" button linking to a new re-teach session flow. (Deferred — see Deferred section. Keep this spec scoped to a single-file change.)

**Scope:** Mobile only. The `completionResult` object (from `useQuizFlow()`) already contains `questionResults` at the type level (`CompleteRoundResponse` in `packages/schemas/src/quiz.ts`), but `results.tsx` currently only destructures `{ score, total, xpEarned, celebrationTier }` — this fix must also destructure `questionResults` from `completionResult`. See [quiz/play.tsx:243](../../apps/mobile/src/app/(app)/quiz/play.tsx) for where `setCompletionResult(result)` is called.

**Dependency:** F-040 reads `correctAnswer` from `round.questions[i]`, which is only populated for completed rounds after F-032 ships. F-032 must be deployed before F-040 can show correct answers in round-detail review. The `completionResult.questionResults[i].correctAnswer` field (returned inline from the `/check` endpoint) is available immediately for the results screen — but if the user navigates away and returns via history, F-032 is required.

**Files:**
- [apps/mobile/src/app/(app)/quiz/results.tsx](../../apps/mobile/src/app/(app)/quiz/results.tsx) — add `MissedQuestionsReview` section.
- Add co-located `results.test.tsx` if one doesn't exist; assert missed-question rendering for mixed-score rounds and absence for perfect rounds.

**Implementation notes:**
- The results screen currently reads from `useQuizFlow()`. Both `completionResult` AND `round` are in that context. The `round.questions[i]` array gives prompts; `completionResult.questionResults[i]` gives correctness + `correctAnswer`.
- Use existing `bg-surface` / `bg-surface-elevated` tokens. Muted red = `text-danger` with `opacity-70` (there is no `danger-soft` token in the design system); muted green = `text-success`. Token definitions are in [apps/mobile/tailwind.config.js](../../apps/mobile/tailwind.config.js) (lines 18/20) and [apps/mobile/src/lib/design-tokens.ts](../../apps/mobile/src/lib/design-tokens.ts).
- Accessibility: group each missed-question card in a `View` with `accessibilityRole="text"` and a full narration label like `"Question 3: Capital of Slovenia. Your answer Maribor. Correct answer Ljubljana."`
- For long answer lists (4+ missed), the results screen should scroll — wrap the whole screen in `ScrollView`. Note: rounds can have up to 8 questions; on a worst-case all-wrong round on a small screen (Galaxy S10e, 5.8"), 8 cards with prompts + answers + fun facts could produce a long list. Consider collapsing fun facts behind a "Show more" tap if the card count exceeds 4, or use `FlatList` for virtualization if performance becomes an issue.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Perfect round | `questionResults.every(r => r.correct)` | Current celebration UI only (no missed section) | N/A |
| Mixed result | 1+ wrong | Missed-question cards below XP pill | N/A |
| `completionResult.questionResults` missing or empty | server regression / older round re-nav | Fall through to current celebration UI with a subtle "Review not available" inline note | User can still tap Play Again / Done |
| `round.questions[i]` doesn't line up with `questionResults[i].questionIndex` | data shape mismatch | Per-item defensive: if prompt reconstruction fails, show `"Question {i+1}"` + user answer + correct answer, skip prompt | Shape mismatch won't crash the screen |
| `correctAnswer` missing on a single result | server partial-data bug | That card is hidden; render the others | Protective degradation |

**Verified By:**
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"renders missed-questions section when at least one wrong"`
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"skips missed-questions section on perfect round"`
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"handles missing correctAnswer gracefully without crashing"`
- `manual: play an intentional 2/4 capitals round and confirm the correct answers appear on the results screen immediately`

**Commit tag:** `feat(mobile): surface missed questions + correct answers on quiz results [F-040]`

---

#### Fix F-041 (new finding, extracted from F-040 scope): Results screen explains canonicalization when user's typing got accepted loosely

**Not part of F-040's PR — spec'd here to keep F-040 focused.**

> **Adversarial review note (2026-04-19):** Consider deferring F-041 entirely until after F-040 ships and real usage data shows whether users are confused by loose matches. This is a nice-to-have polish item with a non-trivial matching condition that could produce false positives. Revisit after F-040 has been in staging for at least one test cycle.

**Current behavior:** User types "Nikola Tesla", server accepts it, returns `{correct: true}`. User sees "You got it in 1 clue!" — no indication that "Tesla" or "Nicola Tesla" would also have worked.

**Desired behavior:** When a user's `answerGiven` differs from `correctAnswer` but `correct: true` (because aliases matched), render a caption: `"Nice — we also accept Tesla, Nicola Tesla."` Small, muted, doesn't steal the moment.

**Scope:** Mobile only; depends on F-032 exposing `acceptedAliases` on each question (which it should do for completed rounds per that spec).

**Files:** same `results.tsx`.

**Implementation notes:**
- The matching condition (`answerGiven !== correctAnswer && correct === true`) must use the **same normalization** the server uses for comparison. If the server lowercases + trims before matching, the client comparison must also lowercase + trim — otherwise a user who typed `"paris"` when `correctAnswer` is `"Paris"` would falsely trigger the alias hint for a simple case difference, not an actual alias match.
- If `acceptedAliases` is `null`, `undefined`, or an empty array, do not render the alias hint — there is nothing useful to show.
- Filter the displayed aliases: exclude the `answerGiven` value itself (case-insensitive) from the alias list so the hint doesn't say "we also accept X" when X is exactly what the user typed.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `acceptedAliases` is null/empty | F-032 didn't populate aliases for this question type | No alias hint rendered (graceful skip) | N/A — correct behavior |
| `answerGiven` equals `correctAnswer` (exact match) | Common case — user typed the canonical answer | No alias hint (condition not met) | N/A |
| `answerGiven` differs only by case/whitespace, not by alias | Case normalization mismatch between client check and server validation | False-positive alias hint: "Nice — we also accept Paris" when user typed "paris" | Client must normalize both sides identically before comparing |
| `acceptedAliases` contains only the `answerGiven` value | User typed the only alias | Empty alias list after filtering → skip hint | N/A |

**Verified By:**
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"renders alias hint when answerGiven differs from correctAnswer but correct"`
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"does not render alias hint on exact match"`
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"does not render alias hint when acceptedAliases is empty"`
- `test: apps/mobile/src/app/(app)/quiz/results.test.tsx:"filters answerGiven from displayed alias list"`

**Commit tag:** `feat(mobile): show accepted aliases hint on loose-match answers [F-041]`

---

### Group 3 — POLISH SWEEP

Two sub-groups: a mobile-only commit (one-file changes, low risk) and a cross-package fix (F-036b) that touches API + schema + client.

#### Group 3a — Mobile-only polish (one commit)

| Finding | Fix | File | Verified By |
|---|---|---|---|
| F-036a — Round detail Back button is plain text | Replace `<Text className="text-primary">Back</Text>` with `arrow-back` Ionicon + accessibility label `"Go back"`. Align with `practice-back` pattern. | [apps/mobile/src/app/(app)/quiz/[roundId].tsx:50](../../apps/mobile/src/app/(app)/quiz/[roundId].tsx) | `manual: nav to round detail, confirm icon + label` |
| F-037 — History date header is raw ISO | Use `Intl.DateTimeFormat` with relative buckets: "Today", "Yesterday", else formatted date (`"Apr 18"`). | [apps/mobile/src/app/(app)/quiz/history.tsx:74](../../apps/mobile/src/app/(app)/quiz/history.tsx) | `test: apps/mobile/src/app/(app)/quiz/history.test.tsx:"groups rounds under Today / Yesterday / formatted-date headers"` |
| F-038 — Guess Who redundant label above TextInput | The TextInput has a visible label ("Type your guess", line 192) AND a placeholder ("Type a name"). These are different strings, but both serve the same purpose — instructing the user to type. Remove the standalone `<Text>` label; the placeholder + `accessibilityLabel` on the TextInput are sufficient. | [apps/mobile/src/app/(app)/quiz/_components/GuessWhoQuestion.tsx:192](../../apps/mobile/src/app/(app)/quiz/_components/GuessWhoQuestion.tsx) | `manual: confirm no redundant label; verify accessibilityLabel still reads "Guess who answer"` |
| F-037-adjacent — History screen "Back" button also plain text | Apply the same Ionicon treatment as F-036a. | [apps/mobile/src/app/(app)/quiz/history.tsx:79-84](../../apps/mobile/src/app/(app)/quiz/history.tsx) | `manual: confirm icon + testid consistency` |

> **Note (adversarial review):** F-034 (practice hub subtitle hardcoded to `capitals`) was already fixed — `practice.tsx` lines 41–64 now dynamically compute `quizSubtitle` from aggregated `quizStats` across all activity types. No work needed.

**Commit tag:** `style(mobile): quiz UI polish sweep [F-036a, F-037, F-038]`

#### Group 3b — Activity type label formatting (F-036b) — separate commit

**Why separate:** This is a cross-package change (API route + schema + client), not a one-file mobile tweak. It also modifies `GET /quiz/rounds/:id` — the same endpoint as F-032 — so it should be sequenced after F-032, not developed in parallel.

| Finding | Fix | Files | Verified By |
|---|---|---|---|
| F-036b — `activityType` renders as raw lowercase enum | Server-side: add computed `activityLabel` to `GET /quiz/rounds/:id` response (`"Capitals"`, `"Guess Who"`, `"Vocabulary: Spanish"`). Client reads `activityLabel` instead of string-mangling `activityType.replace('_', ' ')`. | [apps/api/src/routes/quiz.ts](../../apps/api/src/routes/quiz.ts), [packages/schemas/src/quiz.ts](../../packages/schemas/src/quiz.ts), client display component | `test: schema test asserts activityLabel populated for all activity types` |

**Commit tag:** `feat(api,mobile): add formatted activityLabel to round response [F-036b]`

---

### Group 4 — USABILITY GAPS (separate, worth discussing individually)

These are not bug fixes and aren't one-line changes — they're UX-design questions that deserve product thinking before coding.

| Finding | Description | Decision needed |
|---|---|---|
| **History link discoverability** | The `practice-quiz-history` link is rendered as a tiny text below the Quiz card. New users won't find it. | Treat as full-width section header "Your history" with a chevron, OR move into the Quiz picker (at `/quiz`) as a card, OR move to the Results screen as the primary secondary-action. |
| **Round-length label** | Users don't know if they're committing to 3, 4, or 8 questions when they tap. | Show `"{total} questions · ~{estMinutes} min"` on the launch screen before the first question renders. |
| **Play Again theme preview** | "Play Again" is a mystery box. | Server returns `nextTheme` hint on the complete response. Client shows `"Play Again — European Capitals"` instead of bare "Play Again". Requires server change. |
| **Pause / resume mid-round** | No way to interrupt and come back. | Decide: (a) rounds are ephemeral (current), (b) rounds persist in-progress state, resumable within 24h. Option b adds a `round.status = 'paused'` table state. Larger work. |
| **Capitals lacks free-text option for new users** | Free-text only fires when `freeTextEligible` (i.e. mastery-item question). A user who knows Paris but is new to the system is forced to tap MC. | Add an optional "Type answer" toggle on every MC question (user choice, not permission). Scores the same either way. Small UX win for confident players. |

**Recommendation:** Spin each of these into its own lightweight spec after a product conversation. Don't bundle them into this fix PR.

---

### Deferred / Rejected

Per user feedback ("don't want this to be yet another gamification app — tuning is appropriate, more gamification is not"), the following findings from my earlier user-persona list are **rejected** for this branch:

| Finding | Why rejected |
|---|---|
| **F-035 (orphan `totalXp`)** | Tracking and displaying a lifetime XP total trends toward gamification-app patterns. Keep `totalXp` as server-side telemetry only. If a parent-dashboard future surface needs it, it's already available. |
| **Streak celebration mid-round** | Dopamine-engineering. The `bestConsecutive` metric is useful internally for difficulty-bump math; surfacing it to the user mid-round is not. |
| **Challenge banner "stay visible longer"** | The 3-second auto-hide is correct. A lasting banner would start to feel like slot-machine feedback. |
| **Leaderboards / social layer** | Out of scope, and misaligned with the app's pedagogical philosophy. |
| **More celebration tiers / confetti / badges** | The three existing tiers (nice / great / perfect) are sufficient. |

**Retained with reframing:**

| Finding | Reframed as |
|---|---|
| "Celebration tier 'nice' feels patronizing at 2/4" | Tone-honesty issue, not a celebration issue. When F-040 ships and the results screen shows *which* questions the user missed, the tier title becomes less prominent relative to the actual teaching content. Probably resolves itself; re-evaluate after F-040. |

---

## Priority and Ordering

The fixes have a natural ordering:

1. **F-033 deploy** (a few minutes of ops work; unblocks the discovery card on staging).
2. **F-032 server fix** (unblocks round detail view; unblocks F-036b and F-041).
3. **F-040 results-screen fix** (the primary user-facing pedagogical win).
4. **Group 3a mobile polish** (parallel to F-040; no API dependencies).
5. **F-036b activity label** (after F-032, since both touch `GET /quiz/rounds/:id`).
6. **F-041** (deferred — revisit after F-040 has been in staging for one test cycle).
7. **Group 4 product discussion** (scheduled separately).

## Success Criteria

After Groups 1–3 ship, the following end-to-end scenario must work:

> A user plays a 4-question capitals round, intentionally gets 2 wrong, and sees — on the results screen within 3 seconds of completion — exactly which questions they missed, what they answered, and what the correct answers were. They tap "View History", select the round, and see the same correct answers + their per-question results on the detail screen. A perfect round shows the celebration UI with no missed-questions section.

## Failure Modes (spec-level)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| F-032 server fix regresses live play | Deployment reveals over-exposed answer fields on in-progress rounds | Security regression — answers visible mid-play | Schema test asserts `correctAnswer/acceptedAliases` absent when `status==='in_progress'` — test would fail before merge |
| F-040 renders incorrect pairing (questionResults[i] not aligned with round.questions[i]) | Shape mismatch between `questionResults` and `round.questions` arrays | User sees wrong "correct answer" for a question | Defensive per-card rendering (see Failure Modes for F-040). Also assert in test that API always returns sorted `questionResults`. |
| F-033 deploys and mark-surfaced returns 500 due to missing migration | DB schema mismatch | Silent degradation via client `mutate()` fire-and-forget | Acceptable behavior; discovery card re-surfaces — same as pre-fix. Fix-forward rather than rollback. |
| Polish sweep accidentally changes route-navigation behavior | e.g. Back icon change uses wrong `goBackOrReplace` target | Broken back navigation | Manual verification on each changed screen |

## Rollback

- **F-032, F-040, polish sweep**: safe. No DB schema changes. Code-only reverts are clean.
- **F-033**: deploy action; rollback = previous worker version (already lacks the route, so "rollback" is the broken state anyway).
- **F-041**: depends on F-032 being in place. Rollback safe.

## Verified By (aggregate)

Each group above has its own Verified By rows. Before shipping the full spec, all of these must pass:

- ✅ API tests for `GET /quiz/rounds/:id` completed-round branch + in-progress-round branch + cross-profile 404
- ✅ Mobile tests for results screen missed-question rendering (mixed + perfect)
- ✅ Integration test for `POST /quiz/missed-items/mark-surfaced` (this will also prevent future F-033-class regressions)
- ✅ Manual verification: play a mixed-score round, see missed questions on results; tap View History, see scores + correct answers on detail
- ✅ Manual verification: play a perfect round, no missed-questions section renders on results; detail shows all green
- ✅ Schema test: `activityLabel` populated for all `activityType` values
- ⏸️ F-041 alias hint tests — deferred until F-040 usage validates the need

## Out of Scope

- Any expansion of gamification (rejected list above).
- Group 4 usability discussions (separate specs).
- Server-side mastery-item telemetry changes — SM-2 writes are working correctly; only the UI surfacing is in scope here.
- Any changes to the play-screen mid-round flow — that's working correctly.
- Parent dashboard quiz surfacing — tracked in the separate PV-S series of specs.

## Commit Hygiene Reminder

Per [CLAUDE.md](../../CLAUDE.md) Fix Verification Rules: every commit in this spec MUST include its finding ID tag, e.g. `fix(api): ... [F-032]`. Makes `git log --grep="F-032"` instantly useful and links code changes to the discovery.
