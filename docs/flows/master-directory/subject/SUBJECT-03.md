# SUBJECT-03 - Create Subject From Chat Classifier Miss

> **Status:** Draft
> **Access label:** Study-only
> **Last mapped:** 2026-05-25
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `docs/specs/2026-05-23-freeform-library-filing.md`, `docs/plans/2026-05-23-freeform-library-filing-plan.md`, `apps/mobile/src/components/session/use-subject-classification.ts`, `apps/mobile/src/app/create-subject.tsx`

## Purpose

When a learner is already in chat and the app cannot confidently match the message to an existing subject, this flow lets the active learner create or confirm a subject and return to the conversation. This is a subject ownership/resolution fallback for chat context; it is not the same thing as filing a completed freeform session into Library.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can create a subject for the active learner and return to chat. |
| Mentor / Family | Not a normal mentor route. If a mentor wants to study personally, bridge to adult Study; child curriculum creation needs a child-scoped route. |
| Owner/account | Adult owners create subjects for their own Study profile unless they are explicitly in a child-curriculum management flow. |
| Wrong-audience deep link | Stale or unauthorized return targets recover to Home/Library. Child-scoped creation must validate family access before writing. |

## Shared Scope Decision

`Study-only`

The current chat classifier fallback writes to the active learner's Study subjects. Family child subject creation is a separate child-curriculum concern and must not reuse this route without explicit child scoping.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Freeform classifier miss | Session screen -> `/create-subject?returnTo=chat` | Yes | No normal Family surface | Used when the chat cannot match an existing subject. |
| Create/confirm subject | `/create-subject` | Yes | Child equivalent only | Subject is created for the active learner profile. |
| Return to chat | `/(app)/session` | Yes | No normal Family surface | The learner continues the same conversational intent after subject creation. |

## Data Ownership And Privacy

- Created subjects belong to the active learner profile.
- Chat-created subjects are not Library topics by themselves. They provide the subject container that future lessons and filed topics can use.
- A later freeform Library filing may link a meaningful session to a topic under a subject. If the user keeps the session out of Library, the session stays saved but no Library topic should be created or attached.
- Do not claim this flow delivers Unsorted auto-subject or ask-first classification; those remain out of scope for the filing PR series.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Create-subject screen loads any resolver/suggestion state and preserves the chat return target. |
| Empty | Learner can use their own words to create a subject. |
| Success | Subject is created or selected, then the learner returns to chat with input preserved where possible. |
| Error/recovery | Creation/resolution errors are retryable and should not strand the learner away from chat. |
| No access | Unauthorized subject writes are blocked by active-profile ownership. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Inventory references `bug-234-chat-subject-picker.yaml` and `bug-236-subject-returns-to-chat.yaml`. |
| Native/emulator | Verify classifier miss -> create subject -> return to chat on a clean learner profile. |
| API/unit tests | Subject creation and session classification tests should assert active-profile ownership. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Scope drift | Mentor inventory | Mentor plan marks this blocked/not-normal for Family; child curriculum needs a separate scoped route. |
| Product drift | Freeform filing plan | This subject fallback can coexist with freeform Library filing, but it does not itself decide whether the completed session appears in Library. |

## Open Questions

- When child curriculum management ships, should it reuse create-subject UI components with an explicit child profile parameter?
- Should the chat return path support a visible "not now" escape back to the freeform session when classification is uncertain?
