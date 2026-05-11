# End-User Playwright Bug Pass - 2026-05-11

Date: 2026-05-11
Branch: `parent-profile-carveout`
Scope: Expo web app with seeded single learner and seeded parent-with-children accounts.

Commands run:
- `C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke`
- `C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=role-transitions --project=later-phases`
- `C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=role-transitions apps/mobile/e2e-web/flows/journeys/j04-parent-inline-learn.spec.ts --workers=1`
- `pnpm exec jest --findRelatedTests apps/mobile/src/components/AnimatedSplash.tsx apps/mobile/src/components/AnimatedSplash.test.tsx apps/mobile/src/app/_layout.tsx apps/mobile/src/components/home/IntentCard.tsx apps/mobile/src/components/home/ParentHomeScreen.tsx --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit --pretty false`

Artifacts:
- `apps/mobile/e2e-web/test-results/`
- `apps/mobile/e2e-web/playwright-report/`

## Summary

Smoke passed: 9/9.

The wider role/journey pass failed: 18 failed, 5 passed. The clearest user-facing issue is that the animated splash overlay can remain in the pointer-event layer after the visible app screen has loaded, blocking taps on real controls. I added focused splash/input hardening and verified it with Jest plus mobile typecheck, but the serial J-04 browser journey still times out during Chromium's low-level click after the splash retry window. A smaller group of failures are stale E2E contracts after the parent-home/profile-carveout changes.

## Bugs Hit

| ID | Area | Persona | Severity | User-visible impact | Evidence | Verified By |
| --- | --- | --- | --- | --- | --- | --- |
| EUPW-1 | Splash/input layer | Parent, learner | High | The app looks loaded, but taps can be swallowed by the finishing splash layer or hang during the browser click. As a parent, tapping "See how Emma is doing" did not reliably open the child detail screen. As a learner, direct-route back actions were also blocked. | `apps/mobile/e2e-web/test-results/flows-journeys-j04-parent--2fba6--card-to-navigate-to-Family-role-transitions/trace.zip`; repeated in `j16`, `j17`, `w02` failures | `test: AnimatedSplash.test.tsx touch-through coverage passed`; `test: mobile tsc passed`; `manual: J-04 serial rerun still times out at locator.click after splash retries` |
| EUPW-2 | Parent home onboarding notices | Parent with children | Medium | Parent home can show two onboarding/orientation notices at once: "You're a parent now too" and "This is your home", each with its own "Got it" button. This feels duplicated and uncertain as an end user. | `apps/mobile/e2e-web/test-results/flows-journeys-j18-invalid-4c47b-s-back-to-the-owner-profile-later-phases/error-context.md` | `manual: page snapshot shows both notices simultaneously` |
| EUPW-3 | Web dev server watcher | All web E2E | Low | During the serial parent pass, Metro printed many ENOENT watcher errors for `.nx/cache/.../apps/mobile/dist/...` and `out-tsc/...` paths. This did not directly block the user flow, but it adds noise and may hide real runtime errors in QA output. | terminal output after serial `j04` run | `manual: observed repeated "ENOENT reading contents" messages` |

## Test Contract Drift

These showed up during the end-user pass, but the snapshots suggest stale test contracts rather than broken UI.

| ID | Area | Persona | Impact | Evidence | Verified By |
| --- | --- | --- | --- | --- | --- |
| EUPW-T1 | More tab expectation | Single learner | `W-05` expects a `Profile` button, but More now renders `Account`, `Privacy & data`, `Help & feedback`, etc. The screen itself looks coherent. | `apps/mobile/e2e-web/test-results/flows-navigation-w05-tab-r-1df78-r-the-correct-screen-on-web-later-phases/error-context.md` | `manual: screenshot confirms More page is rendered and usable` |
| EUPW-T2 | Learner Ask selector | Single learner | `J-08` clicks stale `intent-ask`; the current learner home uses `home-ask-anything`. Snapshot shows the Ask card visible on Home. | `apps/mobile/e2e-web/flows/journeys/j08-ask-freeform-session-summary.spec.ts`; `apps/mobile/src/components/home/LearnerScreen.tsx` | `manual: grep found no current intent-ask; current testID is home-ask-anything` |
| EUPW-T3 | Solo parent/add-first-child expectation | Parent solo | `J-15` expected an add-first-child gate, but the app showed the solo learner home with an "Add a subject" empty state. This matches the newer "solo adult owners take the student path" direction from the parent-home spec. | `apps/mobile/e2e-web/test-results/flows-journeys-j15-parent--2417c-en-sees-add-first-child-CTA-later-phases/error-context.md` | `manual: snapshot shows valid learner home, not a crash` |
| EUPW-T4 | Post-consent confirmation web target | Child/parent consent | `J-13` landed on the external/fallback approval success page with `mentomate://home` and app-store links. The flow may need a web-specific expectation if that is the intended browser behavior. | `apps/mobile/e2e-web/test-results/flows-journeys-j13-consent-3f7a0-l-parent-approval-completes-later-phases/error-context.md` | `manual: snapshot shows "Family account ready!" page` |

## Repro Notes

EUPW-1 is the main blocker to finish first. It reproduces even when the parent drill-down test is run alone with one worker. The Playwright call log first reported:

```text
<div data-testid="animated-splash">...</div> subtree intercepts pointer events
```

Relevant implementation area:
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/components/AnimatedSplash.tsx`

Mitigation applied in this pass:
- `AnimatedSplash` now has an idempotent completion path and an explicit touch-through state/style once the animation is finishing or skipped.
- `IntentCard` preserves the web pointer cursor while also applying the accent border color.
- Parent child-detail/report navigation now uses concrete Expo Router paths.

Remaining blocker:
- J-04 still times out at `locator.click()` after the splash retry window. The latest trace reaches "performing click action" and then Chromium/Playwright does not complete the mouse click. This needs a focused follow-up on React Native Web `Pressable` click handling or the parent-card route push path.
