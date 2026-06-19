# Plan — WI-862 [QUIZ-02/16] Intercepted Chrome coverage for quiz loading timeout + discovery card

## Scope (test-only)

One new Playwright web E2E spec:
`apps/mobile/e2e-web/flows/journeys/j26-quiz-loading-discovery.spec.ts`

No production code changes. The `later-phases` Playwright project regex
`flows/journeys/(j08|j09|j[1-9][0-9])-.*\.spec\.ts` already matches `j26-…`, so
the file is auto-included in the default run with NO config edit. The project has
no `storageState`, so each test seeds + signs in itself via `seedAndSignIn`
(pattern from `j26-in-chat-quota-card.spec.ts`).

> Note: a `j26-in-chat-quota-card.spec.ts` already exists — j26 prefix is reused.
> The AC explicitly names `j26-quiz-loading-discovery.spec.ts`, so honor the AC.

## Ground truth (verified from source)

### QUIZ-02 — `apps/mobile/src/app/(app)/quiz/launch.tsx`
- testIDs: `quiz-launch-loading`, `quiz-launch-timed-out` (soft, 20s),
  `quiz-launch-error-fallback` (hard, 30s = `ROUND_GENERATION_TIMEOUT_MS`),
  `quiz-launch-retry`, `quiz-launch-cancel`, `quiz-launch-back`.
- Loading copy rotates every 1.5s across keys
  `quiz.launch.loadingShuffling` / `loadingPicking` / `loadingAlmost`.
- The round POST is fired on mount via `useGenerateRound` → `POST /v1/quiz/rounds`.
- Soft 20s `timedOut` → renders `quiz-launch-timed-out`.
- Hard 30s `hardTimedOut` → renders `quiz-launch-error-fallback` with retry.
- Retry bumps `hardTimeoutAttempt`, re-arming the watchdog so a second stall
  times out again.
- Screen reads `activityType` from route param → direct nav to
  `/quiz/launch?activityType=capitals` starts the round without going via picker.

### QUIZ-16 — `LearnerScreen.tsx` + `use-coaching-card.ts` + `CoachBand.tsx`
- `useQuizDiscoveryCard()` reads `GET /v1/coaching-card` → returns card only when
  `card.type === 'quiz_discovery'`.
- Coach band continue testID = `home-coach-band-continue` (in `CoachBand.tsx`).
- onContinue: `markQuizDiscoveryHandled()` → `markQuizDiscoverySurfaced.mutate(activityType)`
  → `POST /v1/quiz/missed-items/mark-surfaced` body `{ activityType }`.
- Routing: `activityType === 'vocabulary'` → push `/(app)/quiz` (picker);
  else (`capitals`/`guess_who`) → push `/(app)/quiz/launch?activityType=<type>`.

## Test design (deterministic via route interception + fake clock)

### Helpers / patterns reused (no new helpers)
- `seedAndSignIn(page, { scenario: 'onboarding-complete', alias, landingTestId, landingPath })`
- `pressableClick`, `page.route('**/v1/...**', ...)`, `page.clock.install` / `fastForward`
  (a14 template), `expect(...).toHaveURL(...)`.

### QUIZ-02 tests
1. **loading + soft timeout + hard fallback (first stalled generation).**
   - `page.route('**/v1/quiz/rounds**', …)` block indefinitely (never continue).
   - `page.clock.install({ time: Date.now() })` BEFORE navigating.
   - `seedAndSignIn` (lands /home), then `page.goto('/quiz/launch?activityType=capitals')`.
   - assert `quiz-launch-loading` visible; assert a rotating loading copy line visible.
   - `clock.fastForward(20_000)` → assert `quiz-launch-timed-out` visible.
   - `clock.fastForward(11_000)` (>30s total) → assert `quiz-launch-error-fallback`
     + `quiz-launch-retry` visible.
2. **retry re-arms watchdog (retry-stalled generation).**
   - Same stall; reach `quiz-launch-error-fallback`.
   - Click `quiz-launch-retry`; the route is STILL stalled → fallback should clear,
     `quiz-launch-loading` returns, then `clock.fastForward(31_000)` → fallback
     reappears (proves the watchdog re-armed, not latched).

### QUIZ-16 tests
Stub `GET /v1/coaching-card` via `page.route` to force a `quiz_discovery` card.
Capture the `POST /v1/quiz/missed-items/mark-surfaced` request to assert the body.
3. **non-vocabulary (capitals) → /quiz/launch + mark-surfaced POST body.**
   - stub coaching-card → quiz_discovery activityType=capitals.
   - intercept mark-surfaced POST, fulfill `{ markedCount: 1 }`, capture body.
   - seed+sign-in /home, tap `home-coach-band-continue`.
   - assert URL matches `/quiz/launch` and carries `activityType=capitals`.
   - assert captured POST body `{ activityType: 'capitals' }`.
4. **vocabulary → /quiz picker (documented branch).**
   - stub coaching-card → quiz_discovery activityType=vocabulary.
   - tap continue; assert URL matches `/quiz` (picker, NOT /quiz/launch).
   - assert mark-surfaced POST body `{ activityType: 'vocabulary' }`.

## Verification
- `cd apps/mobile && pnpm exec tsc --noEmit` (type-check the new spec).
- `bash scripts/check-change-class.sh --run --fast` advisory.
- Lint: `pnpm exec nx lint mobile` on the new file.
- E2E execution requires the Doppler stg web server + seeded DB; if the local
  harness cannot bring up the web server, rely on CI's Playwright web-smoke gate.
  The spec mirrors verified a14/j26 patterns so it is structurally sound.

## Notes / caveats
- No `t('…')` / `en.json` work: test-only, no JSX literals shipped.
- WI-862 pairs with WI-865 (not in this batch) — flag at PR time; merge coordination
  is the orchestrator's call.
