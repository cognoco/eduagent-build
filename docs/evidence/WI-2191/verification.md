# WI-2191 quick-quiz accessibility verification

This report preserves the defect-specific red/green/revert/restore proof,
Acceptance Criteria mapping, browser coverage, validation, and executor
self-review for **WI-2191 — Remove nested interactive controls from the
Practice quick-quiz card**.

## Provenance

- Initial implementation and evidence commit:
  `e6b58b344637e1f9e989d2d47382d8eadafcc7a3`.
- Latest integrated `origin/main` revision:
  `6dce228a9892ae6f90e87863bb18983d2ef75d5e`.
- Exact integrated code tree exercised by the post-merge native and focused
  browser runs: `ff83d0bf6b12dba83cc49ec2935302bf89b4ca5b`.
- The final evidence commit is a documentation/result-only descendant of that
  exact code tree; no production or test source changes follow the merge.

## Root cause and repair

Baseline `ba9775edba0eaafa95f65ee1ccd072e744bc757c` rendered the entire Quick
quiz card as the `practice-quiz` `Pressable`, then rendered the independently
actionable Capitals and Guess Who `Pressable` controls inside it. Their
`stopPropagation()` calls masked some pointer bubbling, but could not repair
the invalid nested interactive DOM or native accessibility hierarchy.

The repair keeps the existing card styling on a labelled, noninteractive
`role="group"` container. The existing browse action (`practice-quiz`) becomes
the first child action, followed by the Capitals and Guess Who actions as
siblings. The route functions and localized labels are unchanged, and the
now-unnecessary `stopPropagation()` handlers are removed.

## Acceptance Criteria evidence

| Acceptance Criterion | Executable evidence |
| --- | --- |
| AC-1 — No interactive ancestor contains an interactive descendant; Quick quiz is a labelled group or single non-nested action | Production group and sibling actions: `apps/mobile/src/app/(app)/practice/index.tsx:703`, `apps/mobile/src/app/(app)/practice/index.tsx:714`, `apps/mobile/src/app/(app)/practice/index.tsx:746`, `apps/mobile/src/app/(app)/practice/index.tsx:785`. Native defect assertion: `apps/mobile/src/app/(app)/practice/index.test.tsx:343`, `apps/mobile/src/app/(app)/practice/index.test.tsx:360`. Chromium structural assertion and passing result: `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:43`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:66`, `docs/evidence/WI-2191/green-web-focused.json:232`, `docs/evidence/WI-2191/green-web-focused.json:340`. |
| AC-2 — Capitals and Guess Who remain separate localized 44px controls in logical focus/read order | Production localized sibling controls: `apps/mobile/src/app/(app)/practice/index.tsx:745`, `apps/mobile/src/app/(app)/practice/index.tsx:746`, `apps/mobile/src/app/(app)/practice/index.tsx:784`, `apps/mobile/src/app/(app)/practice/index.tsx:785`. Native read-order assertion: `apps/mobile/src/app/(app)/practice/index.test.tsx:363`, `apps/mobile/src/app/(app)/practice/index.test.tsx:381`. Chromium size, narrow/wide matrix, order assertion, and passing results: `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:23`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:39`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:61`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:82`, `docs/evidence/WI-2191/green-web-focused.json:232`, `docs/evidence/WI-2191/green-web-focused.json:266`. |
| AC-3 — Pointer, touch, Enter, Space, VoiceOver, and TalkBack activation launch only the selected route once | Production handlers: `apps/mobile/src/app/(app)/practice/index.tsx:710`, `apps/mobile/src/app/(app)/practice/index.tsx:743`, `apps/mobile/src/app/(app)/practice/index.tsx:782`. Native semantic activation and exact-once assertion: `apps/mobile/src/app/(app)/practice/index.test.tsx:388`, `apps/mobile/src/app/(app)/practice/index.test.tsx:413`, `apps/mobile/src/app/(app)/practice/index.test.tsx:418`, `docs/evidence/WI-2191/green-native-full.json:1`. Chromium pointer/Enter/Space/touch assertions and result: `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:90`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:95`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:99`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:103`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:110`, `docs/evidence/WI-2191/green-web-focused.json:300`, `docs/evidence/WI-2191/green-web-focused.json:340`. |
| AC-4 — Semantic-tree and bubbling regression coverage includes narrow/wide variants and preserves sibling Practice cards | Native defect/read-order/exact-once cases and sibling-card order: `apps/mobile/src/app/(app)/practice/index.test.tsx:343`, `apps/mobile/src/app/(app)/practice/index.test.tsx:363`, `apps/mobile/src/app/(app)/practice/index.test.tsx:388`, `apps/mobile/src/app/(app)/practice/index.test.tsx:581`, `apps/mobile/src/app/(app)/practice/index.test.tsx:612`, `docs/evidence/WI-2191/green-native-full.json:1`. Chromium narrow/wide and input-mode cases: `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:39`, `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:90`, `docs/evidence/WI-2191/green-web-focused.json:232`, `docs/evidence/WI-2191/green-web-focused.json:266`, `docs/evidence/WI-2191/green-web-focused.json:300`. Relevant sibling-flow result: `docs/evidence/WI-2191/green-web-relevant-full.json:292`, `docs/evidence/WI-2191/green-web-relevant-full.json:520`, `docs/evidence/WI-2191/green-web-relevant-full.json:562`, `docs/evidence/WI-2191/green-web-relevant-full.json:601`. |

The native test named `[WI-2191] has no quick-quiz button ancestor containing
Capitals or Guess Who buttons` exercises the reported hierarchy defect itself.
The three table-driven native accessibility-activation cases mount the real
Practice screen and keep only the external router boundary mocked; each
asserts one and only one route call. This is the executable React Native
semantic/activation contract used by VoiceOver and TalkBack. No physical
screen-reader device session was run on Lancre.

The browser test renders the production screen in Chromium. It checks the
accessible group, native HTML button roles, absence of any nested button,
document/read order, and 44px minimum option targets at 320px and 1440px. Its
interaction case uses pointer events, Enter, Space, and a touch tap, then
asserts the exact selected URL or quiz-index screen.

## Red, green, production-only revert, restore

| Phase | Production state | Result | Machine-readable output |
| --- | --- | --- | --- |
| RED | Baseline source; new native defect test only | The named defect case failed because `practice-quiz` contained `practice-quiz-capitals` and `practice-quiz-guess-who` | `docs/evidence/WI-2191/red-native-baseline.json:1` |
| Browser RED | Baseline source; new Chromium spec | Narrow and wide cases could not find the labelled group; the interaction characterization passed | `docs/evidence/WI-2191/red-web-baseline.json:215`, `docs/evidence/WI-2191/red-web-baseline.json:294`, `docs/evidence/WI-2191/red-web-baseline.json:410` |
| GREEN | Candidate repair | Five focused native cases passed; three focused browser cases passed | `docs/evidence/WI-2191/green-native-focused.json:1`, `docs/evidence/WI-2191/green-web-focused.json:232`, `docs/evidence/WI-2191/green-web-focused.json:266`, `docs/evidence/WI-2191/green-web-focused.json:300`, `docs/evidence/WI-2191/green-web-focused.json:340` |
| REVERT | Only `apps/mobile/src/app/(app)/practice/index.tsx` restored byte-for-byte to baseline while tests remained | The same named defect case failed on the same two nested descendants | `docs/evidence/WI-2191/revert-native-defect.json:1` |
| RESTORE | Candidate production source restored | Full Practice unit suite passed, 23/23 | `docs/evidence/WI-2191/green-native-full.json:1` |

Before the REVERT invocation, the production-file diff against baseline was
empty. The regression tests and evidence files were left in place. Restoring
the production repair returned the same named case to green before final
validation.

## Final verification

- Full Practice screen unit file: one suite passed; 23/23 tests passed. Output:
  `docs/evidence/WI-2191/green-native-full.json:1`.
- Focused production Chromium regression on the exact integrated code tree:
  3/3 tests passed in 2.1 minutes on the isolated
  `http://127.0.0.1:19018` runner. Output:
  `docs/evidence/WI-2191/green-web-focused.json:232` and
  `docs/evidence/WI-2191/green-web-focused.json:340`.
- Full relevant Playwright selection before the unrelated latest-main merge:
  10/10 tests passed in 3.6 minutes,
  comprising two required auth setup tests and all eight tests in
  `j10-practice-quiz-cycle`, `j20-vocabulary-quiz-answer-mapping`, the new
  `j28-practice-quick-quiz-semantics`, `w01-no-bleed-through-fullscreen`, and
  `w04-browser-history-stack`. Output:
  `docs/evidence/WI-2191/green-web-relevant-full.json:292` and
  `docs/evidence/WI-2191/green-web-relevant-full.json:601`.
- Mobile typecheck and all six dependency targets passed with cache disabled.
- Mobile lint passed with zero errors and the repository's existing 51
  warnings; no warning points at a changed file.
- The repository pre-push TypeScript build passed.
- Repository format checks passed; an additional direct Prettier check passed
  for all three changed TypeScript files.
- `git diff --check` passed.

The first attempt at the full relevant Playwright selection deliberately used
`--no-deps`; its six self-seeding specs passed, while the two navigation specs
did not start because their declared auth setup had been skipped. The final
run retained the same selection, enabled its declared setup dependency, and
produced the clean 10/10 result linked above.

The first attempt to repeat that full selection after integrating latest main
encountered a runner cascade, preserved at
`docs/evidence/WI-2191/post-merge-runner-death.json:384` and
`docs/evidence/WI-2191/post-merge-runner-death.json:471`: J20's staging seed did
not expose its vocabulary card, and the exported-web server then exited. Every
subsequent J28/W01/W04 failure was
`net::ERR_CONNECTION_REFUSED` for `http://127.0.0.1:19006`, not a product
assertion. The complete runner was not churned. Instead, J28's three exact
WI-2191 defect cases were restarted in isolation on port 19018 against the
same integrated code tree and passed 3/3 as recorded above.

### Reproducible focused Chromium environment

The fresh 3/3 J28 result used the exact legacy-shell environment and runner
arguments below. The JSON reporter result is
`docs/evidence/WI-2191/green-web-focused.json:232`; its summary is
`docs/evidence/WI-2191/green-web-focused.json:340`.

```sh
CI=1 EXPO_PUBLIC_E2E=true PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging \
  PLAYWRIGHT_WEB_PORT=19018 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:19018 \
  PLAYWRIGHT_API_URL=https://api-stg.mentomate.com \
  EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com \
  EXPO_PUBLIC_MODE_NAV_V1_ENABLED=true \
  EXPO_PUBLIC_FAMILY_V1_ENABLED=true \
  EXPO_PUBLIC_SUBJECT16_V1_ENABLED=true \
  EXPO_PUBLIC_SUBJECT17_V1_ENABLED=true \
  PLAYWRIGHT_JSON_OUTPUT_FILE=docs/evidence/WI-2191/green-web-focused.json \
  node scripts/doppler-run.mjs run -c stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts \
  --project=later-phases --workers=1 --retries=0 --no-deps --reporter=json
```

A separate release-V2 compatibility attempt used
`EXPO_PUBLIC_ENABLE_MODE_NAV=true`,
`EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true`, and
`EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true` with the same staging API, isolated port,
J28 file, `later-phases` project, one worker, zero retries, and `--no-deps`.
That attempt stopped in `seedAndSignIn` before any J28 product assertion: the
spec hard-codes `landingPath: '/home'` and `landingTestId: 'learner-screen'`
at `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:34`
and `apps/mobile/e2e-web/flows/journeys/j28-practice-quick-quiz-semantics.spec.ts:35`,
while the release-V2 shell correctly redirected the seeded learner to
`/mentor`. This is a harness-mode assumption, not a product result and not
evidence against the candidate.

## Executor self-review

- The interactive ownership seam is structural: no event-propagation behavior
  is relied on to make invalid nesting appear safe.
- The visual card container retains its border, background, padding, and
  option layout. The existing `practice-quiz` browse affordance remains first
  in focus/read order and still opens the quiz index.
- Capitals and Guess Who retain their translation keys, direct-launch route
  parameters, and 128px rendered minimum height (above the required 44px).
- Existing Practice card ordering and route tests remain green, including the
  end-to-end quiz cycle, vocabulary mapping, fullscreen tab-bar isolation, and
  browser-history stack.
- No API, schema, persistence, feature-flag, deployment, or lifecycle field was
  changed. No internal production module mock was added.
- The change is reversible within one screen and introduces no new abstraction.

## Environment

Verification ran on Lancre with Node `v24.18.0` and pnpm `10.19.0`. The repo
declares Node 22 and emitted its existing engine warning, but unit tests,
Playwright, typecheck, lint, pre-push TypeScript, and formatting all passed.
