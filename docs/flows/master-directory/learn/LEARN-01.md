# LEARN-01 - Freeform Chat / Ask Anything

> **Status:** Draft
> **Access label:** Study-only
> **Last mapped:** 2026-05-25
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `docs/specs/2026-05-23-freeform-library-filing.md`, `docs/plans/2026-05-23-freeform-library-filing-plan.md`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/components/session/use-session-actions.ts`

## Purpose

Let the active learner ask a question or explore a topic without first committing to a structured lesson path. Ask Anything creates a saved freeform session for the active Study profile; if the conversation becomes meaningful learning, Library filing can happen after close without changing the fact that the session history is already saved.

This page describes the freeform close and Library-filing target for the current filing PR series. It must not be read as saying that upstream Ask First / Unsorted auto-subject is delivered: current entry still depends on the existing session-start paths and subject ownership model.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can tap Ask Anything from learner home and enter a freeform tutoring session owned by the active profile. |
| Mentor / Family | Not directly surfaced from normal Family review. A mentor who wants to ask their own question should switch to Study as themselves. |
| Owner/account | Adult owners can use Ask Anything in their own Study context. Owner or family status does not make the session child-owned. |
| Wrong-audience deep link | Auth/profile gates apply above the session route. Family-context links should bridge to Study or recover to Family home rather than silently starting a child proxy freeform session. |

## Shared Scope Decision

`Study-only`

Freeform chat is learner-owned Study work. Family equivalents are child review, recaps, and curriculum surfaces; they should not launch an unsupervised child session by proxy.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Ask Anything bar | `home-ask-anything` -> `/(app)/session?mode=freeform` | Yes | No target Family surface | Starts a freeform session for the active learner. |
| Session send | `/(app)/session/index.tsx` | Yes | Compatibility only | The tutor streams the answer through normal session infrastructure. |
| Classifier miss subject creation | `/create-subject?returnTo=chat` | Yes | No normal Family surface | See SUBJECT-03. This is a subject ownership/resolution fallback, not Library filing. |
| Subject clarification | `/create-subject` resolution/suggestions | Yes | Child-curriculum equivalent only | See SUBJECT-05. |
| End freeform session | `/session-summary/[sessionId]` | Yes | No normal Family surface | Target behavior: close freeform without a blocking Library prompt; auto-file meaningful chats in the background. |
| Session history re-entry | Session Summary / transcript surfaces | Yes | Mentor recap equivalent only | The session remains saved even if it is not filed as a Library topic. |

## Data Ownership And Privacy

- Freeform sessions are saved as session history for the active learner profile by default.
- Library filing is separate from session history. Keeping a session out of Library does not delete the session, summary, transcript, bookmarks, or reflection.
- A filed freeform chat becomes or links to a Library topic only through an active-learner subject. Library topics must sit under subjects; sessions may exist outside Library.
- Do not present raw learner input as the final Library destination. The filed destination should be a resolved subject/topic title, not a transcript fragment.
- The upstream Ask First / Unsorted auto-subject idea is out of scope for this PR series; do not document it as current behavior or release copy.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Session route shows normal session loading/recovery. |
| Empty | First freeform turn invites the learner to ask what they are curious about; it does not force a Library decision. |
| Success | Learner chats normally, closes the session, and lands on Session Summary. Meaningful freeform chats may show Library status there. |
| Library pending | Summary can show that the app is adding the chat to Library, with a freeform-scoped option to prevent Library filing. |
| Kept out | Summary/history remain available; the chat is not shown as a Library topic and does not drive topic progress/retention. |
| Error/recovery | Session streaming or close errors use existing retry/recovery. Filing failure is a Library-status problem, not a lost-session problem. |
| No access | Unauthorized/stale session IDs recover through auth or protected/not-found states. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Existing inventory references `e2e/flows/learning/freeform-session.yaml`; rerun after freeform close prompt removal. |
| Native/emulator | Verify Ask Anything entry, freeform close to Summary, no blocking freeform Library prompt, and session history re-entry. |
| API/unit tests | Filing PRs should cover session ownership, close-path auto-file dispatch, keep-out, retry/add, and threshold behavior. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Freeform filing plan | Upstream Ask First / Unsorted auto-subject is deferred; do not claim Ask Anything has no upfront subject friction until that work lands. |
| Transitional UX | Freeform vs homework close | No-prompt close is scoped to freeform in this PR series. Homework may still show its existing filing prompt until a follow-up decides the cross-mode close pattern. |
| Doc drift | Prior "save" language | Any "Don't save" or ambiguous dismissal copy should be read as "keep out of Library"; the session remains saved. |

## Open Questions

- When upstream Ask First / Unsorted ships, should this page split current freeform entry from the future no-upfront-subject variant?
- Should session history get a dedicated index outside Library so kept-out freeform chats remain easy to find?
