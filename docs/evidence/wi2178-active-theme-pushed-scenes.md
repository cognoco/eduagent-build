# WI-2178 active theme behind pushed V2 scenes

## Defect case exercised

The named browser case `W-05 V2 pushed nested scenes follow the system dark theme at wide web` probes the computed background of React Navigation's nested `contentStyle` layer on a direct subject-hub deep link. With only the production layout changes reverted, the layer was transparent while the expected active semantic background was `rgb(26, 26, 62)`; the exposed React Navigation scene behind it was `rgb(242, 242, 242)`. Restoring the production change made that same computed-style assertion pass.

The corresponding unit production-only revert produced six expected failures: dark/light account, dark/light practice, dark subject-hub, and the recursive nested-navigator audit. Restoring the production change returned all nine focused tests to green.

## Acceptance evidence

| Acceptance concern | Executable evidence pointers | Result |
| --- | --- | --- |
| Dark V2 subject-hub, account, and practice scenes use the active semantic background across wide web and 360x760 native-safe viewports | `apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts`; `apps/mobile/src/app/(app)/subject-hub/[subjectId]/_layout.test.tsx`; `apps/mobile/src/app/(app)/account/_layout.test.tsx`; `apps/mobile/src/app/(app)/practice/_layout.test.tsx` | The full current W05 fresh-export run passed all 10 W05 cases in the 15-case combined run; the focused layout run passed all 9 tests. |
| Every pushed nested Stack under the authenticated app declares the same semantic background source | `apps/mobile/src/app/(app)/nested-navigator-theme.guard.test.ts` | The recursive audit covers every `(app)` layout containing a Stack and reports the relative path of any bare navigator. |
| Dark and light resolve from the active theme without theme-specific literals | `apps/mobile/src/app/(app)/subject-hub/[subjectId]/_layout.test.tsx`; `apps/mobile/src/app/(app)/account/_layout.test.tsx`; `apps/mobile/src/app/(app)/practice/_layout.test.tsx` | Both token schemes pass against the real ThemeContext and design tokens. |
| Existing V2 chrome, top-level tabs, safe-area ownership, account transitions, and small/wide layouts remain unchanged | `apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts`; `apps/mobile/e2e-web/flows/journeys/j01-learner-home.spec.ts`; `apps/mobile/e2e-web/flows/journeys/j03-parent-gateway.spec.ts` | The full W05/J03 fresh-export run passed all 15 cases. After the final contrast-probe correction, the complete current J03 spec passed all 5 cases (2 setup, 3 J03), including native top=47, 360px long supporter scope, 44px AccountAvatar and ScopeChip targets, dark-theme contrast against the avatar's alpha-composited inner background, topmost hit testing, z-order, and real avatar/back navigation. |
| Loading, error, refresh/deep-link, push/back transition frames, theme change, practice transitions, and cold quiz recovery do not reveal an off-theme navigator layer | `apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts`; `apps/mobile/e2e-web/flows/journeys/j10-practice-quiz-cycle.spec.ts` | The named dark/wide W05 case synchronously exercises Mentor→Account through the real avatar and Account→Mentor through the real back control. Each direction must reach the exact target pathname before 30 consecutive requestAnimationFrame samples begin; all 30 require the target root and semantic source/destination backgrounds. Synthetic loading, 500-error, direct/reload, dark/light rerender, practice/quiz, and cold-recovery cases also passed. |

## Scope and ownership

The production change is limited to the three previously bare nested navigators: subject-hub, account, and practice. It does not change the V2 root safe-area registry, padding calculations, fixed-chrome measurements, tab scene layout, route ownership, or component positioning introduced by WI-2185.

The browser fixtures use only seeded synthetic learner and supporter data. No production data is referenced.
