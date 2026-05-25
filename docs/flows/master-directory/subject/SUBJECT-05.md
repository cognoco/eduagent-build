# SUBJECT-05 - Subject Resolution And Clarification Suggestions

> **Status:** Draft
> **Access label:** Shared different scope
> **Last mapped:** 2026-05-25
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `docs/specs/2026-05-23-freeform-library-filing.md`, `docs/plans/2026-05-23-freeform-library-filing-plan.md`, `apps/mobile/src/app/create-subject.tsx`, `apps/mobile/src/components/session/use-subject-classification.ts`

## Purpose

Help the app and learner turn raw subject wording into the right subject choice: accept a suggested correction, pick among plausible meanings, or use the learner's own words. This flow keeps subject taxonomy understandable before learning work starts or returns to chat.

For freeform Library filing, subject resolution is a related but separate concept: a filed Library topic must belong to a subject, while an unfiled or kept-out session remains saved session history outside Library.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can resolve, clarify, or create a subject for the active learner profile. |
| Mentor / Family | Can only use equivalent resolution inside an explicitly child-scoped curriculum flow. Normal mentor review should not mutate a child's subjects through learner chrome. |
| Owner/account | Adult owners resolve subjects for their own Study context unless a child-scoped route is explicit. |
| Wrong-audience deep link | Stale resolution targets recover to Home/Library; child-scoped links must validate family access before reads or writes. |

## Shared Scope Decision

`Shared different scope`

The UI pattern can serve both Study and future child-curriculum management, but the data scope must differ. Current Study subject resolution writes active-learner subjects; Family child resolution needs parent-native child routes and explicit linked-child authorization.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Study New | `/create-subject` | Yes | Bridge only | Resolves learner-entered subject wording before creating/selecting a subject. |
| Chat classifier fallback | `/create-subject?returnTo=chat` | Yes | No normal Family surface | See SUBJECT-03. |
| Library empty state | `/create-subject?returnTo=library` | Yes | No target Family Library | Creates an active-learner subject from Study Library. |
| Future child curriculum | Child-scoped subject route | No | Planned/equivalent | Must not write through adult Study Library. |

## Data Ownership And Privacy

- Resolution suggestions may be based on raw learner wording, but persisted subjects belong to the active learner profile.
- Subject resolution does not automatically mean a session is filed to Library. Library filing happens when a session is linked to or creates a topic under a subject.
- A Library topic always belongs to a subject. Session history can exist without a Library topic when a freeform chat is short, filing fails, or the learner keeps it out of Library.
- Do not document Ask First / Unsorted auto-subject as delivered. Clarification chips before first answer remain a future/freeform-classification concern unless implemented separately.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Resolver can show a working state while suggestions are computed. |
| Empty | Learner can continue with their own wording if no suggestion is useful. |
| Success | Learner accepts a correction, picks a suggested meaning, or creates a subject with their wording. |
| Error/recovery | Resolution failure degrades to manual subject creation; the learner is not trapped. |
| No access | Unauthorized child/adult subject writes are blocked by active-profile or linked-child checks. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | `create-subject-resolve.yaml` and `bug-233-chat-classifier-easter.yaml` cover correction and chat classifier variants. |
| Native/emulator | Verify correction card, Start/Change controls, and return target behavior. |
| API/unit tests | Subject resolver tests should cover active-profile scoping and "use my words" fallback. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract | Family child curriculum route is not yet the full replacement for Study subject resolution. |
| Scope drift | Freeform filing plan | Filing may later resolve a Library destination under a subject, but subject clarification UI is not the post-close filing UI. |

## Open Questions

- Which subject-resolution components should become shared once child curriculum management exists?
- Should freeform filing failures ever open this clarification flow, or should V1 keep retry/add/remove controls on Session Summary only?
