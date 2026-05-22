# HOME-01 - Learner Home

> **Status:** Draft  
> **Access label:** Study-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/src/lib/app-context.tsx`

## Purpose

Give the active learner a single starting point for their own study work: resume what is in progress, start homework, ask a freeform question, practice, create a subject, open a subject shelf, view notes, and recover from loading or setup gaps. For adults who are also mentors, this page must remain their own Study home; Family support belongs to the Family shell and parent-native child routes.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Shows `LearnerScreen` for the active profile. All learning actions read/write against the active student profile. |
| Mentor / Family | Target contract: not surfaced as the Family home. Family mode should use Family/Children home and child routes; a deliberate "study as me" bridge can switch the adult back to Study. Current V0 can render `ParentHomeScreen` from this same route when `mode === 'family'`. |
| Owner/account | Adult owners can use this as their own learner home even if they also have linked children. Owner status may add family/setup affordances elsewhere, but must not change study ownership. |
| Wrong-audience deep link | Deep links to `/(app)/home` are always allowed, but the app should resolve the visible home for the current context. Under the target contract, Study opens Learner Home and Family opens Family Home; current V0 uses the same route and switches content by local mode. |

## Shared Scope Decision

`Study-only`

The end-user product meaning is Study-only: this is the learner's own home. It is currently implemented as a shared route/content switch because `LearnerScreen` can delegate to `ParentHomeScreen` when V0 Family mode is active or, with the flag off, when the owner has linked children/family-plan ownership. That shared implementation is drift from the reconciled navigation contract, where Family Home should be a separate parent-native shell state and adults can still return to Study as themselves.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Home tab | `/(app)/home` -> `HomeScreen` -> `LearnerScreen` | Yes | Current V0: yes, same route can render Family content. Target: Family tab home should be Family Home, not this learner surface. | `home-screen`, `learner-screen`; `ModeChip` appears when family-capable and mode is loaded. |
| Subject carousel card | `home-subject-card-{id}` -> `/(app)/shelf/[subjectId]` | Yes | No direct Family surfacing in target. | Uses active learner subject/progress data. |
| Study new | `home-action-study-new` -> `/create-subject` | Yes | Bridge only if adult switches to Study. | Creates a subject for the active learner, not for a child. |
| Homework | `home-action-homework` -> `/(app)/homework/camera` | Yes | Not surfaced in Family target. | Starts active-student homework capture. |
| Ask Anything | `home-ask-anything` -> `/(app)/session?mode=freeform` | Yes | Not surfaced in Family target. | Opens freeform session as active learner. |
| Practice | `home-action-practice` -> `/(app)/practice` | Yes | Not surfaced in Family target. | Active-student practice/review route. |
| My Notes | `home-my-notes` -> `/(app)/my-notes?returnTo=home` | Yes | No | Hidden in parent-proxy branch. |
| Continue/recommended band | `CoachBand` -> session, resume target, relearn, or quiz | Yes | No | Hidden for parent proxy; gated by `FEATURE_FLAGS.COACH_BAND_ENABLED`. |
| Family-capable mode chip | `home-mode-chip` -> local mode switch | Current V0 only | Current V0 only | Local React state; target contract moves mode to global chrome and persists server-side. |
| Loading timeout recovery | `home-loading-timeout` -> retry, `/(app)/library`, `/(app)/more` | Yes | Needs context-aware fallback in target. | Current fallback always includes Library, which is Study-safe but not Family-shell safe. |

## Data Ownership And Privacy

- Subject, progress, resume, review, quiz-discovery, notes, homework, practice, and session actions are scoped to the active profile via the mobile profile context and API client active profile.
- Adult owners can be both mentors and students. Their own Study home must use the adult owner profile, not a linked child, even when family-capable.
- Parent proxy is compatibility behavior only. When active profile is a child on a parent account, `LearnerScreen` treats that as `isParentProxy` and hides some self-owned affordances such as My Notes and CoachBand; this should not become the normal Family review path.
- The current `useHasLinkedChildren()`/family-plan fallback in `LearnerScreen` can render `ParentHomeScreen` when `MODE_NAV_V0_ENABLED` is off and the adult has linked children or a family/pro subscription. The target contract says capability should be server-sourced (`hasFamilyLinks`) and Study should remain Study unless the effective context is Family.
- Consent-withdrawal banners can appear on the learner home for owner profiles with children in grace period; those are family notices adjacent to Study, not evidence that learning writes are child-scoped.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | `HomeScreen` first shows a neutral activity indicator while profiles load; `LearnerScreen` shows book animation for subject loading. |
| Empty | If no subjects exist, the learner still gets action rows and subject creation entry (`home-action-study-new` / `/create-subject`). Empty Study must not force add-child setup. |
| Success | Greeting, quota line, optional notes button, optional early adopter/nudge/coach band, quick actions, withdrawal banner if relevant, and subject carousel with per-subject hints/progress. |
| Error/recovery | Home load timeout offers retry plus Library and More; subject loading timeout offers retry and Go home; subject query error without data is treated as a retryable loading branch. |
| No access | Auth/consent/profile gates happen above this route. Family-only child review should not deep-link into learner home as a proxy substitute; linked-child data should be reached through child routes. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Covered indirectly by many learning and subject flows; should verify `home-screen`, quick actions, subject carousel, loading timeout, and no tab-bar leakage around full-screen children. |
| Native/emulator | Current E2E coverage is indirect; `empty-first-user.yaml`, homework, practice, subject, quiz, and session flows touch this surface. Add a focused Study-vs-Family home smoke when the navigation contract lands. |
| API/unit tests | `apps/mobile/src/app/(app)/home.test.tsx` covers learner rendering for owners with and without children and child active profile cases. `LearnerScreen` behavior is covered through component and flow-specific tests. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract V0 vs FULL | Current `/(app)/home` is a shared content switch. Target wants Study `LearnerHome` and Family `FamilyHome` under a single contract with Family tabs `home, recaps, progress, more`. |
| Implementation drift | `apps/mobile/src/lib/app-context.tsx` | Mode is local state derived from client-side profile list; target requires server-backed `profiles.default_app_context` and `hasFamilyLinks`. |
| Scope drift | `apps/mobile/src/components/home/LearnerScreen.tsx` | With V0 flag off, linked children or family/pro subscription can cause `ParentHomeScreen` to render from the learner component. Study should remain adult self-learning unless Family context is selected. |
| UX drift | Loading timeout fallback | Home timeout always offers Library, which is correct for Study but not the target Family shell where top-level Library should not be surfaced. |
| Inventory drift | HOME-01 row | Inventory still mentions old add-subject tile IDs from the redesign summary; the current empty-first-user row notes `home-action-study-new` as the reliable entry. |

## Open Questions

- When the contract migrates Home, will Family Home remain implemented by `ParentHomeScreen` at `/(app)/home`, or will a separate route/component boundary be introduced for clarity?
- Should the Study home show any family/child grace notices, or should all child consent notices move to Family/More once Family mode exists?
- Should `home-mode-chip` be removed from Home as soon as global chrome mode switching exists, or kept temporarily as a V0 migration affordance?
