# HOMEWORK-01 - Start Homework Help

> **Status:** Draft  
> **Access label:** Shared different scope  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/app/(app)/homework/_layout.tsx`, `apps/mobile/src/app/(app)/homework/camera.tsx`, `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`, `apps/mobile/src/hooks/use-homework-ocr.ts`

## Purpose

Let a learner start homework help quickly from Study context, capture or type the assignment, choose the right subject when needed, and land in a homework-mode tutoring session. The product promise is "explain and verify" homework support, not a mentor/parent review flow and not a pure Socratic tutoring path.

For mentors, homework appears later as a reviewable child session artifact. A parent can see that a child got homework help and read the generated homework summary from child session detail, but the normal mentor path should not start a homework session on the child's behalf through proxy mode.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Homework is surfaced from Learner Home. Student can use camera, gallery, or manual/voice entry, then enter `/(app)/session?mode=homework`. Homework is not surfaced from More. |
| Mentor / Family | Not surfaced as a Family action. Parent review belongs under child session detail, child reports, or future Recaps. If an adult wants help with their own homework, they switch/bridge to adult Study. |
| Owner/account | Adult owner in Study can start their own homework flow. Owner in Family can manage setup/billing but should not write homework data to a child unless product explicitly adds a parent-managed child assignment flow. |
| Wrong-audience deep link | Parent proxy is redirected from `/(app)/homework` to `/(app)/home`. Family shell should not surface homework except via explicit bridge/deep link; unauthenticated access is handled by `(app)` auth/consent gates. |

## Shared Scope Decision

`Shared different scope`

The start flow is Study-only behavior for the active learner, but the resulting homework session can be read by mentors through parent-native child review if family-link/consent rules allow. This is not "shared same behavior": the student starts and participates; the mentor reviews generated outputs later.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Learner home quick action | `home-action-homework` -> `/(app)/homework/camera` | Yes | No | `LearnerScreen` quick-action row opens the homework camera with `returnTo` params. |
| Subject-scoped homework | `/(app)/homework/camera?subjectId=&subjectName=` | Yes | No normal Family surface | Skips subject picker when subject is already known. |
| Camera permission | `/(app)/homework/camera` permission phase | Yes | No | First-request uses `grant-permission-button`; permanently denied uses `open-settings-button`; manual entry remains available. |
| Camera capture | `camera-view` / `capture-button` | Yes | No | Captures image, starts OCR, can cancel/retake. |
| Gallery import | `gallery-button` | Yes | No | Existing-photo path records capture source and MIME where available. |
| Manual or voice entry | `manual-entry-button`, `manual-input`, voice controls | Yes | No | Supports type/say fallback before and after OCR failures. |
| Subject classification | auto-detect, subject picker, create subject | Yes | No | Classifier candidates are validated; malformed candidates fall back to picker/Sentry. Manual subject can create a subject before session. |
| Start homework session | `/(app)/session` with `mode=homework`, `problemText`, `homeworkProblems`, `imageUri`, `imageMimeType`, `captureSource` | Yes | No | Session screen parses multi-problem state, auto-sends the homework image/text, and keeps problem progress in one session. |
| Mentor homework review | `/(app)/child/[profileId]/session/[sessionId]` | No | Yes | Shows generated `homeworkSummary.summary` if the child session has one. |

## Data Ownership And Privacy

- Homework capture, OCR text, problem cards, image URI/base64, and homework session metadata are owned by the active learner profile.
- The homework camera should never write into a child profile merely because the adult is in Family mode. The current layout redirects parent proxy away from homework; future contract should preserve this.
- Subject classification and auto-created subjects must be scoped to the active learner's subject list.
- Images are sensitive homework artifacts. They should be transmitted only as part of the learner's homework session flow and should not be exposed to mentors unless a deliberate review surface is designed.
- Mentor review can show generated homework summary under child session detail when family-link/consent permits it; this is read-only review, not a route to continue the child's homework conversation.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Permission and subject queries show explicit loading states. OCR processing shows "Reading your homework" with cancel; UI-level timeout cancels after 45 seconds and surfaces manual/retake recovery. |
| Empty | No subjects after manual/OCR fallback offers create subject. No clear homework from OCR asks user to retry or type it in. Empty manual text keeps continue disabled. |
| Success | Learner can capture/import/type, review split problem cards, restore dropped fragments, select or create a subject, confirm, and land in homework-mode session with multi-problem state preserved. |
| Error/recovery | Permission denied links to Settings plus manual fallback. OCR failure offers retake/retry/go home, then manual entry after fail count. Classification failure offers type subject manually or retake. |
| No access | Parent proxy gets redirected to Home. Family mode should not surface homework. Tampered subject/session writes should be blocked by API profile scoping. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Camera-native behavior is limited on web; no web preview was run for this documentation-only pass. |
| Native/emulator | Inventory lists `e2e/flows/homework/homework-from-entry-card.yaml`, `homework/homework-flow.yaml`, `homework/camera-ocr.yaml`, and `homework/camera-permission-denied.yaml`; re-run on a real/dev-client camera environment before product sign-off. |
| API/unit tests | Relevant tests include `camera.test.tsx`, `use-homework-ocr.test.ts`, `problem-cards.test.ts`, `camera-reducer.test.ts`, and session homework tests. Integration tests should cover profile-scoped subject/session writes if this flow changes. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Fixed bug reference | BUG-366 | Camera screen preserves OCR result when returning from create-subject instead of resetting. |
| Fixed bug reference | BUG-689 / M-9 | OCR processing has UI-level timeout so learner is not trapped. |
| Fixed bug reference | BUG-690 | Subject picker shows loading state instead of blank rows. |
| Fixed bug reference | BUG-807 | Malformed classifier candidates are validated before navigation. |
| Fixed bug reference | BUG-824 | Fresh image source resets classification trigger. |
| Product memory | feedback_homework_not_socratic | Homework should explain and verify, not default to Socratic questioning. |
| Obsolete bug | HOMEWORK-01 More entry | Product clarification 2026-05-22: Homework was never intended to be surfaced from More. The old inventory expectation was stale. |
| Access drift | Navigation contract | Family routes may be reachable only via explicit bridge/deep link, not surfaced; current V0 contract still has legacy guardian/proxy behavior to migrate. |
| Tooling gap | Notion MCP unavailable | Prior Notion bug URLs for HOMEWORK-01 could not be retrieved; only code/inventory bug IDs are recorded here. |

## Open Questions

- Should parents ever be able to start a child-scoped homework session from Family, or is the final product strictly "child starts, parent reviews"?
- What is the retention/deletion policy for homework images after the text and summary have been extracted?
