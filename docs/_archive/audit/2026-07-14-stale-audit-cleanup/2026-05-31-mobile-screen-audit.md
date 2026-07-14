# Mobile Screen Assumption-Breaker Audit — 2026-05-31

> **STATUS (2026-06-27):** Mostly open — mic/audio resource-leak findings (dictation, homework camera) and majority of 118 findings not yet addressed; treat as active work backlog.

Audit method: `/my:deep-bugfixing` skill (5-category assumption audit — navigation, layout, data shape, platform, timing) run by 7 parallel agents across 44 core learner/parent screens. Read-only, no code changes in this PR.

**Total findings: 118** (39 high-impact, 40 medium, 39 low)

## Cross-cutting themes

These patterns recur across multiple clusters. Fixing them at the helper-library level beats fixing each call site.

| Theme | Clusters | Recommended fix |
|---|---|---|
| Cross-stack `router.push` violates ancestor-chain rule (CLAUDE.md guardrail) | 3, 4, 6, 7 | Extract `pushBookHref`, `pushChildSession` helpers in `lib/navigation.ts` mirroring existing `pushChildReport` / `pushLearningResumeTarget` / `pushChildWeeklyReport`. Forbid bare `router.push('/(app)/[deep-leaf]')` from any non-parent stack via lint rule. |
| Deep-link `router.back()` → stuck user | 1, 3, 4, 6 | Already have `goBackOrReplace` helper; sweep remaining bare `router.back()` sites and migrate. |
| `router.replace('/(app)/home')` from non-Home tab wipes back-stack | 7 (progress/saved/vocabulary) | Use `router.push` for empty-state CTAs or replace within the current tab stack. |
| Audio/mic resource leak on unmount | 5 (dictation playback, homework camera) | Add unmount cleanup in screen `useEffect`, and audit `useDictationPlayback` / `useSpeechRecognition` hooks for `stop()` on unmount contract. |
| `useState(initialValue)` race with deferred auth/profile state | 1, 2, 3, 6, 7 | Add `enabled: !!sessionId` / `!!profileId` gates to all queries that take ID args; centralize `requestedProfileId` validation in `useNavigationContract`. |
| Silent-recovery `console.warn` in error paths | 1, 2, 7 | CLAUDE.md "silent recovery without escalation is banned" — extend the rule beyond billing/auth to language-change, profile-mutation, and other UI-state writes. Capture Sentry breadcrumb + structured metric. |
| Hardcoded English JSX literals bypass i18n | every cluster | Per CLAUDE.md "Known gap" — Phase 3 baseline-allowlist ratchet on `JsxText` / JSX-children `StringLiteral` is the systemic fix. This audit identified subscription.tsx and book/[bookId].tsx as the worst offenders. |
| Stub/dead route fallbacks (missing `index.tsx` in nested stacks) | 6 | Per CLAUDE.md guardrail "Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }`" — and the `index.tsx` file itself must exist. `subject/_layout.tsx` declares the seed but `subject/index.tsx` is missing. |

## Triage recommendation

1. **Top 10 high-impact to fix first** (cherry-picked from clusters by clearest impact + lowest risk):
   1. Cluster 6 Finding 2 — missing `subject/index.tsx`; trivial 5-line redirect mirroring `topic/index.tsx`.
   2. Cluster 6 Finding 3 — `topic/[topicId].tsx` resolve retry calls nothing; must invoke `refetch()`.
   3. Cluster 4 Finding 2 — `quiz/results.tsx` `goBackOrReplace` should be `router.replace` on null-context path.
   4. Cluster 5 Finding 2 — dictation playback continues after exit modal; add `playback.pause()` to confirmExit + unmount cleanup.
   5. Cluster 5 Finding 1 — homework camera mic stays hot after close; add unmount + `handleClose` cleanup.
   6. Cluster 5 Finding 9 — `complete.tsx` → `review.tsx` uses `router.push` allowing double `recordResult`; switch to `router.replace`.
   7. Cluster 3 Finding 5 — session-summary cross-stack pushes to `/(app)/session` use bare `router.push`; switch to `pushLearningResumeTarget` (helper already exists).
   8. Cluster 7 Finding 2 — recap detail child-session push needs `pushChildSession` helper.
   9. Cluster 2 Finding 2 — `create-profile.tsx` clears audience before awaiting `switchProfile`; await first.
   10. Cluster 1 Finding 4 — `sign-up.tsx` missing `!signUp` null-guards on `onSignUpPress`/`onVerifyPress`/`onResendCode` (sign-in.tsx has them).

2. **Doc-only forward-only guard tests** to land alongside fixes:
   - Lint rule banning bare `router.push` to `(app)/session`, `(app)/shelf/*/book/*`, `(app)/child/*/session/*`, `(app)/child/*/report/*` — must use helper.
   - Lint rule banning `console.warn` in `catch` blocks in `apps/mobile/src/` (require Sentry breadcrumb or rethrow).

3. **Deferred / requires product decision**:
   - i18n sweep for hardcoded literals (large effort; needs Phase 3 ratchet).
   - Subscription screen complexity (extract polling state machine).
   - Cross-account leak hardening at hook layer (verify all `useResource(id)` hooks 403 on non-owned IDs).

---

## Cluster 1 — Auth + onboarding (8 screens, 20 findings)

**Files:** `(auth)/welcome.tsx`, `(auth)/sign-in.tsx`, `(auth)/sign-up.tsx`, `(auth)/forgot-password.tsx`, `sso-callback.tsx`, `(app)/onboarding/index.tsx`, `(app)/onboarding/language-setup.tsx`, `(app)/onboarding/pronouns.tsx`

### High

1. **Forced-signout banner suppressed on remount** — `sign-in.tsx:404-421`. `clearSessionExpiredNotice()` fires on every SSO/password attempt and clears the notice store — user who taps "Continue with Google" after the expired banner appears, then dismisses, loses the banner permanently. Don't clear until activation succeeds.
2. **`setIsTransitioning(true)` happens AFTER `setActive`** — `sign-in.tsx:622-660`. Multi-hundred-ms window where empty form is visible (BUG-509 root cause). Set transitioning BEFORE awaiting `setActive`.
3. **`isMountedRef` initialized via `useRef(true)` not in effect** — `sign-in.tsx:272-277`. Strict-mode double-invoke could leave ref stuck false.
4. **`signUp` accessed without null-check before `signUp.create`** — `sign-up.tsx:244-279, 281-311, 313-326`. Sign-in has the `!signIn` guard; sign-up doesn't. Clerk types allow undefined even when `isLoaded`.
5. **`setActive` in sign-up doesn't guard `isMounted`** — `sign-up.tsx:81-104`. SSO browser cycle 2-10s, user can kill app; on resolve, state updates on unmounted component.
6. **`sso-callback.tsx` `router.replace('/')` drops `pendingAuthRedirect`** — `sso-callback.tsx:63-65`. sso-callback is at root, not `(auth)` — the `(auth)/_layout` redirect-target preservation never runs. User loses deep-link target after Google SSO.
7. **Pronouns screen always mutates pronouns even when null** — `(app)/onboarding/pronouns.tsx:175-181`. Unnecessary server churn; `navigateForward()` called before awaiting mutation.

### Medium

8. **Hardcoded English literals everywhere in auth** — `sign-in.tsx` (lines 198-213, 336, 1022-1075, 1108-1145, 1208-1538), `sign-up.tsx` (87, 99, 218, 302-680), `forgot-password.tsx` (37-38, 172, 178, 219, 296-507), `language-setup.tsx:23-91`. Particularly bad: `language-setup.tsx` LEVEL_OPTIONS has both dead hardcoded `label`/`description` and live `t()` calls.
9. **Sign-in transition timeout clobbers in-flight Clerk error** — `sign-in.tsx:327-338`. Only clobber `error` if empty.
10. **`oauth_apple` not offered on Android** — `sign-in.tsx:1352-1376`, `sign-up.tsx:544-568`. User who created via Apple on iOS then reinstalled on Android can't sign in. Apple OAuth works cross-platform.
11. **`cancelledRef` in language-setup doesn't track mutation identity** — `language-setup.tsx:132-153, 184-188`. Rapid back→continue could let prior in-flight mutation succeed.
12. **`formatApiError` then displays in banner without classification** — `language-setup.tsx:186`. Quota/forbidden/network collapse to same retry. CLAUDE.md "Classify errors before formatting" violated.
13. **Pronouns `startFirstCurriculumSession` onError dumps to home silently** — `pronouns.tsx:139-141`. No error feedback before navigating.
14. **ScrollView wraps tappable language/level/pronouns options without `keyboardShouldPersistTaps`** — `language-setup.tsx:213-396`, `pronouns.tsx:255-347`. On web, first tap dismisses keyboard, second selects.
15. **Welcome `BackHandler` is Android-only** — `welcome.tsx:108-115`. iOS swipe-back leaves auth flow entirely.
16. **`ssoNeedsSignIn` param sent by sign-up not consumed by sign-in** — `sign-up.tsx:193-211`. User lands on sign-in form with no banner → taps Google again → loop.

### Low

17. `getDeviceNativeLanguage` silently falls back to 'en' on locale API throw — `language-setup.tsx:47-59`.
18. `Dimensions.get('screen')` captured at module load; web resize stays stale — `sign-in.tsx:59-62`, `sign-up.tsx:31-34`, `forgot-password.tsx:25-28`.
19. Pronouns `learnerAge` over-counts pre-birthday users (chosen tradeoff per code comment) — `pronouns.tsx:67-70`.
20. Sign-up verify-back-to-sign-in uses `router.replace` mid-verification — `sign-up.tsx:447`. Loses pending verification state.

---

## Cluster 2 — Profile setup + consent (6 screens, 16 findings)

**Files:** `app/index.tsx`, `profiles.tsx`, `create-profile.tsx`, `ready.tsx`, `consent.tsx`, `create-subject.tsx`

### High

1. **`consent.tsx` reads wrong-profile birthYear** — `consent.tsx:55-60, 119-125`. When launched with `?profileId=<child>` differing from active profile, `ageBracket` is computed from active (likely parent) and clamped to adolescent — copy is wrong regardless of which child. Look up by `profileId`, not `activeProfile`.
2. **`create-profile.tsx` clears pre-auth audience BEFORE awaiting `switchProfile`** — `create-profile.tsx:370-394`. Failed switch strands user with no recovery context. Await switch first.
3. **`create-profile.tsx` `wantsFamily` always navigates to add-child even when switchProfile fails** — `create-profile.tsx:370-394`. Same root as #2.
4. **`app/index.tsx` redirects to `(app)/home` before profiles query resolves** — `index.tsx:175-176`. No profile-loaded gate; punts entirely to `(app)/_layout.tsx`. BUG-264 hints this has been recurring.
5. **`consent.tsx` `resendError` persists across phase changes** — `consent.tsx:195-212, 483-491`. Reset on `transitionToPhase`.

### Medium

6. `profiles.tsx` `router.dismiss()` then `router.push` lands wrong when dismiss unavailable on web — `profiles.tsx:198-202`.
7. `ready.tsx` `params.subjectId` accepted without UUID validation — `ready.tsx:85-98`. Garbage propagates to session.
8. `create-subject.tsx` `cancelledRef` state-machine relies on `doCreate` resetting; suggestion-pick paths don't — `create-subject.tsx:259-268, 293-302, 322-324`.
9. `create-profile.tsx` `readPreAuthAudienceSync()` may return null on cold start; form submits before async resolves — `create-profile.tsx:131-140`.
10. `consent.tsx` `stripSubAddressing` uses `split('@')[0]`; RFC-valid `"foo@bar"@example.com` collapses incorrectly — `consent.tsx:133-137`.
11. `create-subject.tsx` unmount/cleanup aborts in-flight requests; Android background/Doze leaves UI stuck "creating" — various.

### Low

12. `ready.tsx` `rowSubject` interpolated ellipsis violates CLAUDE.md variable-interpolation-fallback rule — `ready.tsx:152-156`.
13. `profiles.tsx` hardcoded English everywhere — `profiles.tsx:254-265, 345-347, 373, 387, 422, 90`.
14. `create-profile.tsx` hardcoded English — `create-profile.tsx:334-337, 543-575`.
15. `create-subject.tsx` `subjectLimitGuidance` hardcoded English — `create-subject.tsx:659`.
16. `create-profile.tsx` dead error path for `maxLength={50}` enforced client-side — `create-profile.tsx:230-232`.

---

## Cluster 3 — Home + session (6 screens, 15 findings)

**Files:** `(app)/home.tsx`, `(app)/dashboard.tsx`, `(app)/own-learning.tsx`, `(app)/session/index.tsx`, `session-summary/[sessionId].tsx`, `session-transcript/[sessionId].tsx`

### High

1. **session-summary deep link strands user in dialog loop** — `session-summary/[sessionId].tsx:687-704, 442-455`. `FAMILY_RECAPS_HREF` fallback lands learner-shape user on V1-guardian-only tab. Validate href against tab shape before replace.
2. **Reflection draft silently discarded on "Resume this session" tap** — `session-summary/[sessionId].tsx:927-951, 277-300`. Bypasses `askDraftDecision` gate documented at 682-686.
3. **`useSessionTranscript('')` fires with empty sessionId** — `session/index.tsx:429-477`. URL contains `/sessions//transcript` (double slash) → 404. Hook needs `enabled: !!sessionId` gate.
4. **Session-screen Back drops subject context on web URL paste** — `session/index.tsx:235-248, 1208-1212`. Unconditional `router.replace` to shelf wipes browser history.
5. **Cross-stack `router.push('/(app)/session', ...)` from session-summary** — `session-summary/[sessionId].tsx:927-951, 1113-1124, 1147-1164`. Session-summary is root-level fullScreenModal; bare push synthesizes 1-deep stack. Use existing `pushLearningResumeTarget`.
6. **`KeyboardAvoidingView` `behavior="padding"` on Android covers TextInput** — `session-summary/[sessionId].tsx:819-823`. Galaxy S10e (user's device per memory `user_device_small_phone.md`) hit hardest.

### Medium

7. `parseInt('0') || 1` clobbers legitimate 0 for `escalationRung` — `session-summary/[sessionId].tsx:341`. BUG-801 pattern recurs.
8. `dashboard.pendingNotices[0]` celebration race — `(app)/home.tsx:60-84`. `ackNotice` in deps re-renders the 5s timer indefinitely; notice may never ack.
9. `recallQuestions` rendered with `key={index}` — `session-summary/[sessionId].tsx:1273-1278`. Latent.
10. `handleHomeBack` falls back to home; should fall back to immediate parent (shelf) per `goBackOrReplace` docstring — `session/index.tsx:249-256`.
11. Voice locale only set for `four_strands` subject — `session/index.tsx:610-613, 1258-1259`. Norwegian learner doing math gets wrong TTS voice.

### Low

12. `formatTimestamp` uses `toLocaleString(undefined)`; Hermes inconsistencies — `session-transcript/[sessionId].tsx:29-37`.
13. `home.tsx` loading-timeout retry doesn't refetch — `(app)/home.tsx:108-118`.
14. `useFocusEffect` reset of `topicSwitcherSubjectId` wipes user override — `session/index.tsx:500-565`.
15. `dashboard.tsx` redirect passes `returnTo` unsanitized — `dashboard.tsx:11-20`. Latent — `homeHrefForReturnTo` does whitelist.

---

## Cluster 4 — Quiz (6 screens, 19 findings)

**Files:** `quiz/index.tsx`, `quiz/launch.tsx`, `quiz/play.tsx`, `quiz/results.tsx`, `quiz/history.tsx`, `quiz/[roundId].tsx`

### High

1. **`useRoundDetail(roundId)` not normalized for array param** — `quiz/[roundId].tsx:42-49`. Use `firstParam` helper like launch.tsx does.
2. **`quiz/results.tsx` deep-link `goBackOrReplace` may `router.back()` to a foreign screen** — `quiz/results.tsx:56-60`. Push-notif deep-link → back pops to whatever happens to be underneath. Use `router.replace`.
3. **`play.tsx` retry on `completeRound` failure drops queued nav intent** — `play.tsx:230-260, 281-301, 1086`. `pendingResultsNavigateRef` set on Save-and-Quit; if onError fires later, the queued nav is dropped silently. User stuck on play.
4. **`play.tsx` `handleSeeResults`/`handleOneMore` no-op if `roundAutoSaved` false** — `play.tsx:302-310`. Rendered gating mostly protects but final-question double-tap window exists.
5. **`results.tsx` Play Again doesn't await prefetch fetching state** — `results.tsx:118-138`. Wastes prefetched round, fires fresh LLM call.

### Medium

6. `play.tsx` answer Pressables not in ScrollView; Submit can be off-screen on small phones (S10e) — `play.tsx:813-1064`.
7. `play.tsx` timer effect double-resets `questionStartTimeRef` — `play.tsx:191-196, 691-693`.
8. `play.tsx` final-question dispute lost — `play.tsx:101-103, 534-542, 600-604`. Auto-submission fires before user can dispute.
9. `play.tsx` quit-modal nested Pressable backdrop tap reliability on web — `play.tsx:1143-1153`.
10. `launch.tsx` `startedRef` blocks restart on web `replace` to same screen — `launch.tsx:138, 199-207`. "One More" stuck.
11. `[roundId].tsx` back uses `router.replace` not `goBackOrReplace` — loses history-pop position — `[roundId].tsx:51-52, 117, 133`.
12. `results.tsx` `tierConfig[celebrationTier]` crashes on new server tier — `results.tsx:66-87, 179`. Add fallback.

### Low

13. `results.tsx` hardcoded English everywhere — `results.tsx:71-85, 212, 242, 250, 274, 284, 96-104, 188`.
14. `play.tsx` hardcoded English in alerts + a11y labels — `play.tsx:341, 589, 776, 806, 1119`.
15. `history.tsx` `isError && rounds` shows stale list with no banner — `history.tsx:150-169`.
16. `launch.tsx` dead `?? LOADING_MESSAGE_KEYS[0]` fallback — `launch.tsx:401`.
17. `launch.tsx` nulls `subjectId` when route lacks it — vocab deep-link without subjectId hits 400 — `launch.tsx:182-186`.
18. `play.tsx` `correctCelebrationKey={Date.now()}` ms-collision (practical: safe) — `play.tsx:617, 749-757`.
19. `[roundId].tsx` `resolveCompletedRoundDetail` casts bypasses zod; unknown question type renders empty body — `[roundId].tsx:27-33, 205-231`.

---

## Cluster 5 — Dictation + homework (6 screens, 22 findings)

**Files:** `dictation/index.tsx`, `text-preview.tsx`, `playback.tsx`, `review.tsx`, `complete.tsx`, `homework/camera.tsx`

### High

1. **Recording continues after camera unmount mid-capture** — `homework/camera.tsx:53` (no cleanup effect for `speech.isListening`). Mic stays hot; recognizer fires into dead component. Add unmount cleanup + `speech.stopListening()` in `handleClose`.
2. **Dictation playback continues after exit modal** — `dictation/playback.tsx:69-72, 74-80`. `handleConfirmExit` doesn't pause; backdrop-tap/Cancel/iOS swipe-back leak audio across screens.
3. **`playback.start()` re-fires on language/pace changes mid-session** — `dictation/playback.tsx:42-52`. `[data, playback]` dep array re-fires every render; pace toggle creates duplicate narrators.
4. **Playback fails closed for empty sentences but not for `sentences=[]`** — `dictation/playback.tsx:48, 85-108`. LLM returning empty list → stuck on `***` placeholder with no error copy.
5. **Camera capture race: setState after unmount** — `homework/camera.tsx:341-355`. `takePictureAsync` 200-500ms resolve → state updates on dead component.
6. **Review screen `completedCount` over-increments on double-tap** — `dictation/review.tsx:42-49`. Functional setters double-apply; user may SKIP a mistake without typing correction.
7. **`useFocusEffect` cleanup marks `reviewCancelledRef` true on legitimate nav** — `dictation/complete.tsx:73-79`. Self-recovers via `attemptId`, but reliance is implicit.
8. (withdrawn — false alarm)
9. **`recordResult.mutateAsync` from review.tsx and complete.tsx can BOTH fire for same `completionKey`** — `dictation/complete.tsx:280-323`, `dictation/review.tsx:51-91`. Hardware-back from review→complete→Done double-records. Switch to `router.replace` at complete.tsx:249 or rely on server idempotency.

### Medium

10. Image base64 for 4MB phone photo OOM-risk on S10e — `dictation/complete.tsx:188-190`. Resize with `expo-image-manipulator` first.
11. `result.assets[0]` not validated for missing `.uri` — `dictation/complete.tsx:161-162`. Silent no-op.
12. Camera auto-classify effect has eslint-disabled deps — stale `t` on language switch — `homework/camera.tsx:243-339`.
13. `useDictationData` context survives across tabs — back-stack returning to `/playback` may auto-replay last session — `dictation/playback.tsx:21, 85`.
14. `setTimeout(..., 0)` `[F-030]` context-flush shim — race on slow Android — `dictation/index.tsx:85`, `text-preview.tsx:83`, `playback.tsx:47-52`.
15. `handleCheckWriting('camera')` retry alert loses original `source` — `dictation/complete.tsx:260-263`.
16. Speech transcript de-dup drops repeated identical utterances — `homework/camera.tsx:176-178`. Demoted after re-read.

### Low

17. `BackHandler` not removed if Modal visible at unmount — `dictation/playback.tsx:74-80, 245-294`.
18. Rapid double-tap mic across problems leaves inconsistent state — `homework/camera.tsx:758-773`.
19. `handleConfirmPhoto` doesn't validate gallery `content://` URI — `homework/camera.tsx:413-417`.
20. `candidates.length === 1` happens to handle `[null]` correctly — defensive — `homework/camera.tsx:257`.
21. Cancel review doesn't abort server-side LLM call — wasted tokens — `dictation/complete.tsx:367-382`.
22. `getMediaLibraryPermissionsAsync().catch(() => null)` swallows real errors — `homework/camera.tsx:387-389`.

---

## Cluster 6 — Library + topic + subject (7 screens, 19 findings)

**Files:** `library.tsx`, `shelf/[subjectId]/index.tsx`, `shelf/[subjectId]/book/[bookId].tsx`, `subject/[subjectId].tsx`, `pick-book/[subjectId].tsx`, `topic/index.tsx`, `topic/[topicId].tsx`

### High

1. **Hardware back from `topic/[topicId]` falls through to library, skipping book** — `book/[bookId].tsx:914-928` and `topic/[topicId].tsx`. `topic/index.tsx` is a Redirect, so `unstable_settings.initialRouteName` doesn't seed the book. Explicit back button uses `topicBackFallback` correctly, but OS back bypasses it.
2. **`subject/_layout.tsx` declares `initialRouteName: 'index'` but `subject/index.tsx` doesn't exist** — `subject/_layout.tsx:8-10`. Cross-tab pushes to `/subject/[subjectId]` (e.g. from `shelf/[subjectId]/index.tsx:359-376`) stay 1-deep; system back falls through to Home. **Trivial fix:** create `subject/index.tsx` mirroring `topic/index.tsx`.
3. **`topic/[topicId].tsx` deep-link resolve retry does nothing** — `topic/[topicId].tsx:543-562`. Flipping local `resolveTimedOut` doesn't refetch the query. Must call `resolveQuery.refetch()`.
4. **`subject/[subjectId].tsx` missing-param fallback has no `paddingTop`** — `subject/[subjectId].tsx:51-64`. Renders under iOS notch.
5. **`library.tsx handleBookPress` double-push** — `library.tsx:357-369`. Genuinely needs chain push (cross-stack); flagged as awareness only.
6. **`book.tsx handleSessionLongPress` Move-to-book uses native Alert with many buttons** — `book/[bookId].tsx:969-1021`. Subject with 10+ books clips on Android/iOS Alert. Use bottom sheet.

### Medium

7. (root cause of 3 — Topic resolve retry no-op).
8. `book.tsx` loading state uses UUID `params.bookId` as title fallback — `book/[bookId].tsx:1299`.
9. `library.tsx` failed-filing pill shows count N but routes to first session only — `library.tsx:405-418, 588-617`.
10. `book.tsx chapterSections` recomputes on every poll — `book/[bookId].tsx:783-836`.
11. Cross-stack push pattern duplicated in 4 places — `pick-book/[subjectId].tsx:231-241, 286-296`, `shelf/[subjectId]/index.tsx:99-105`, `session-summary/[sessionId].tsx:394-401`, `library.tsx:357-369`. Extract `pushBookHref` helper.
12. `book.tsx autoStart` param doesn't reset; remount auto-starts again — `book/[bookId].tsx:267-268, 1248-1267`.
13. `library.tsx` modal ScrollView nested under backdrop Pressable — Android gesture conflict — `library.tsx:1149-1249`.

### Low

14. `library.tsx` debounce search ratchets refetch — low risk — `library.tsx:175-181`.
15. **Hardcoded English everywhere in book/topic** — `book/[bookId].tsx` ~40+ literals (348-378, 1279, 1288, 1330, 1357, 1395, 1404, 1414, 1434-1505, 1574-1715), `topic/[topicId].tsx` ~17 literals.
16. `book.tsx formatStartedTopicCount` hardcoded singular/plural — Polish/Czech/Norwegian break — `book/[bookId].tsx:243-245`.
17. `subject/[subjectId].tsx` `isSubjectsLoading && !activeSubject` renders empty View — no spinner — `subject/[subjectId].tsx:105-106`.
18. `topic/[topicId].tsx` related-topics rail uses `router.push` — A→B→A creates new stack frames — `topic/[topicId].tsx:1024-1062`.
19. `topic/[topicId].tsx` "Start studying" CTA disabled forever when offline — no error message — `topic/[topicId].tsx:65-67, 434-435, 594`.

---

## Cluster 7 — Progress + recaps + more (12 screens, 22 findings)

**Files:** `progress/index.tsx`, `progress/milestones.tsx`, `progress/saved.tsx`, `progress/vocabulary.tsx`, `progress/[subjectId]/index.tsx`, `progress/[subjectId]/sessions.tsx`, `recaps/index.tsx`, `recaps/[recapId].tsx`, `more/index.tsx`, `more/account.tsx`, `more/privacy.tsx`, `subscription.tsx`

### High

1. **`pushLearningResumeTarget` corrupts back-stack with double Home push** — `lib/navigation.ts:120-122`, called from `progress/index.tsx:297` and `progress/[subjectId]/index.tsx:107`. Switches tab to Home then pushes session; after session ends, back goes to Home, not Progress.
2. **Recap detail "Open child session" violates ancestor-chain rule** — `recaps/[recapId].tsx:45-54`. Add `pushChildSession` helper mirroring `pushChildReport`.
3. **Recap detail crashes when `topicId` null but typed as required** — `recaps/[recapId].tsx:179`. Schema declares `topicId` as nullable; `AddToMyLearningButton` gets null.
4. **`progress/[subjectId]/sessions.tsx` deep-link with no subjectId hits broken `replace`** — `sessions.tsx:54-58, 141`. `as never` cast hides the bug. Empty-state CTA also wipes to Home.
5. **`saved.tsx` empty CTA `router.replace('/(app)/library')` teleports off Progress + may hit non-existent V1-guardian Library tab** — `progress/saved.tsx:251-255`.
6. **`progress/index.tsx` requestedProfileId validation deferred to effect** — `progress/index.tsx:91-97`. Sign-in race; stale URL params kept by Expo Router.
7. **`more/account.tsx` language-change silent recovery** — `more/account.tsx:49-56`. If `i18next.changeLanguage` throws after `setStoredLanguage` succeeds, next launch loads different language than UI just showed. No Sentry/metric.

### Medium

8. `progress/[subjectId]/index.tsx` shadows outer `t` with `const t = setTimeout(...)` — `progress/[subjectId]/index.tsx:172`.
9. `recaps/index.tsx` `??` chain doesn't catch empty string — blank cards — `recaps/index.tsx:133-136, 157-160`.
10. `progress/index.tsx` `LatestReportCard.onRetry` `void Promise.all([...])` no `.catch` — silent on double-reject — `progress/index.tsx:594-599`.
11. `subscription.tsx` hardcoded English (Cancelling/Past due/Expired/Unknown + 20+ more) — `subscription.tsx:814-826, 800, 904, 930, 938-939, 1183, 1201, 1207, 1210, 1247, 1257-1261`.
12. `subscription.tsx removeFamilyProfile` alert interpolation breaks in JA/NO — `subscription.tsx:582-583, 599-601, 603-605`.
13. `vocabulary.tsx` `useEffect`-based redirect fires repeatedly on contract recompute — `progress/vocabulary.tsx:101-105`. Use `<Redirect>` in render path.
14. `more/index.tsx handleAddChild` unconditional push when subscription loaded — bypasses `gates.showAddChild` — `more/index.tsx:56-75`.
15. `more/index.tsx` sign-out catch doesn't re-arm `isSigningOut` on success — minor — `more/index.tsx:233-268`.

### Low

16. `progress/index.tsx` family-mode picks `linkedChildren[0]` without re-checking owner permission — `progress/index.tsx:138-139`.
17. `recaps/index.tsx` `accessibilityLabel` interpolation may produce `"undefined"` — `recaps/index.tsx:103-106`.
18. `subscription.tsx new Date(currentPeriodEnd)` safe but `isoDateField` consistency unverified — `subscription.tsx:785, 837, 844, 909`.
19. `progress/[subjectId]/index.tsx hideSubject` success `router.replace(backFallback)` destroys history — `progress/[subjectId]/index.tsx:120`.
20. `subscription.tsx isOwnerProfile` vs `gates.showBilling` can disagree during profile switch — `subscription.tsx:129`.
21. `progress/[subjectId]/sessions.tsx` missing `useFocusEffect` refetch — stale after returning from a new session.
22. `recaps/[recapId].tsx` `Redirect` only runs once at render; contract toggle mid-mount not caught.

---

## What this audit confirms is solid

- `goBackOrReplace` helper is well-built and used correctly in many sites.
- `pushChildReport`/`pushChildWeeklyReport`/`pushLearningResumeTarget` helpers exist and follow ancestor-chain rule (gaps: `pushChildSession`, `pushBookHref` missing).
- `signOutWithCleanup` centralized post the cross-account leak fix (memory `project_cross_account_leak_2026_05_10`).
- Sign-in screen has heroic edge-case coverage (forced sign-out banners, transition phases, AppState OAuth recovery).
- Session-summary `isProxyMode` correctly hides chat-resume and full-transcript affordances (cross-account leak defense).
- `quiz/play.tsx` has many tight assumption-breaker fixes already (BUG-STALE-OPTIONS, BUG-819, BUG-929, BUG-892).
- `dictation/index.tsx` BUG-692 cancellation pattern is thorough.
- Progress `[subjectId]/index.tsx` has best dead-end coverage in cluster 7 (every state has at least one actionable button).
- `subscription.tsx` extensive bug-trail comments (BUG-394/397/399/400/403/606/767/896/916/966) demonstrate iterative hardening.
- No "struggle/trouble/weak/declining" copy found (memory `feedback_positive_framing_no_struggle` clean).
- No `personaFromBirthYear` fossil in any audited screen.

## Coverage notes

- Read-only static analysis. No code executed.
- Did NOT exhaustively audit hooks (`useSession`, `useSessionTranscript`, `useDictationPlayback`, `useSpeechRecognition`, `useRoundDetail`). Several findings depend on hook-internal `enabled:` gates and unmount-cleanup contracts that were not verified.
- Did NOT verify `(app)/_layout.tsx` gate-component (`CreateProfileGate`, `ConsentPendingGate`) — several Cluster 2 findings depend on its behavior.
- Did NOT exercise streaming SSE code in `use-session-streaming.ts` — separate audit recommended.
- Did NOT trace `pre-auth-audience` storage implementation — Cluster 2 Finding 9 assumes Expo SecureStore has no sync API.
- Cross-account leak hardening at hook layer (verify all `useResource(id)` hooks 403 on non-owned IDs) is a separate, recommended audit.

---

*Generated by 7 parallel runs of the `/my:deep-bugfixing` skill on the `deep-debug` worktree (44 screens, 118 findings). See git log for the audit commit.*
