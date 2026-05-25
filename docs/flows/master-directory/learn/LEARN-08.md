# LEARN-08 - Library V3

> **Status:** Draft  
> **Access label:** Study-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/library.tsx`, `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`, `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`, `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx`

## Purpose

Let a learner browse and continue their own learning structure: subjects, subject shelves, books, generated topic paths, notes, past conversations, retention state, and next study actions. Library is the Study tab for the active learner, not a Family-mode child oversight tab.

For mentors, the equivalent product outcome is child curriculum/review from parent-native child routes. A parent should be able to see or manage a child's subjects/books from a child card/detail surface, but the target Family shell must not expose the adult's top-level Library because that makes "whose library is this?" ambiguous.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Full access to `/(app)/library`, shelves, books, topics, notes, subject management, and study CTAs for the active learner profile. |
| Mentor / Family | Not surfaced as top-level Library. Child curriculum should live under parent-native child routes such as `/(app)/child/[profileId]` -> child subject/curriculum, scoped to linked children. |
| Owner/account | Adult owners can use Library in Study for their own learning. In Family, they should use child curriculum/review surfaces and must not silently switch into a child's learner Library. |
| Wrong-audience deep link | Family-context deep links to top-level Library should be blocked or bridged back to Study. Child curriculum links must validate family access and recover to Family home/child detail if stale. |

## Shared Scope Decision

`Study-only`

The top-level Library is part of the Study tab shape: `home`, `library`, `progress`, `more`. Family mode intentionally lacks top-level Library; the navigation contract names `child/[profileId]/curriculum` as the replacement target. Current code still has V0 guardian/proxy paths where Library can appear for parent/proxy contexts, so this page records the target decision and the current drift.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Library tab | `/(app)/library` | Yes | No in target | Current V0 guardian/proxy tab code can still surface Library outside pure Study; target contract should remove it from Family. |
| Empty Library CTA | `/(app)/library` -> `/create-subject?returnTo=library` | Yes | No | Creates a subject for the active learner. Family child subject creation should start from a child route, not adult Library. |
| Subject shelf tap | `/(app)/shelf/[subjectId]` | Yes | Child curriculum equivalent only | Shows books, progress, suggestions, and add-book actions for the active learner's subject. |
| Book tap | `/(app)/shelf/[subjectId]/book/[bookId]` | Yes | Child curriculum equivalent only | Shows generated topics, notes, past conversations, retention banners, bookmarks link, and start/continue CTA. |
| Topic row | `/(app)/topic/[topicId]` or learning session start from book screen | Yes | No direct Family surface | Mentor review should use child subject/topic detail, not start a child learning session by proxy. |
| Manage subjects | Library manage modal / `/(app)/subject/[subjectId]` | Yes | Child settings equivalent only | Pause/archive/restore and subject settings mutate the active learner's subjects. |
| Saved for subject | Book screen -> `/(app)/progress/saved?subjectId={id}` | Yes | No target Family surface | Saved bookmarks are LEARN-24 and remain student-owned. |
| Parent child subject card | `/(app)/child/[profileId]/subjects/[subjectId]` | No | Yes | Current parent-native child subject review exists, but it is progress/review oriented rather than a full child curriculum management replacement. |
| Future child curriculum | `/(app)/child/[profileId]/curriculum` | No | Planned | Required by navigation contract before removing V0 parent-library affordances fully. |

## Data Ownership And Privacy

- Library reads and writes are scoped to the active learner profile: subjects, books, curriculum topics, notes, sessions, retention, and learning-resume targets.
- Subject management is a mutation surface. Pause/archive/restore must only affect the active learner's own subject unless a separately designed child-curriculum editor scopes writes to a linked child with explicit parent authority.
- Book/topic generation and first-curriculum-session start are learner writes. A mentor in Family should not accidentally create or start a child learning path through adult Library chrome.
- Existing parent proxy compatibility can make Library operate as a child preview. This is not the target Family UX and should be treated as retained/internal behavior until parent-native curriculum exists.
- Search results can expose subjects, books, topics, notes, and sessions for the active learner. Family search over child curriculum would need a separate child-scoped query and copy.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Library shows shimmer rows; if subject loading exceeds 15 seconds, the timeout fallback offers retry and Home. Shelf/book screens show loading animation and working back actions. |
| Empty | Study Library invites the learner to add a subject. Empty shelf/book states offer pick-book, retry, set-up-book, or start-first-lesson actions depending on available suggestions/topics. |
| Success | Subject-first shelf list with search, retention pills, grouped active/paused/archived subjects, next-action card, subject shelves, books, notes, topics, past conversations, and study CTAs. |
| Error/recovery | Query errors show retry and a stable back/home fallback. Book generation failures use visible alert/fallback states and avoid trapping the user. |
| No access | Study should show only active learner data. Family child curriculum should show protected/not-found and return to Family home or child detail for unauthorized/stale child IDs. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Verify top-level Library appears only in Study tab shape once navigation contract is implemented; verify shelf/book back fallbacks do not fall to Home on cross-tab deep pushes. |
| Native/emulator | Existing coverage includes Library navigation/search and parent-library YAML in the inventory/audit. Add target Family tests when child curriculum route exists. |
| API/unit tests | Current relevant tests include `library.test.tsx`, shelf/book tests, library search/context hooks, notes/bookmarks components, and child subject/detail tests. Contract tests should assert Family does not surface `library`. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract | Target Family tabs are `home`, `recaps`, `progress`, `more`; current V0 has no Recaps and may still expose Library through guardian/proxy paths. |
| Missing target route | `child/[profileId]/curriculum` | The contract names child curriculum as the Family replacement, but a dedicated route is not present yet. |
| Access drift | Parent proxy | Proxy can still preview child learner surfaces, including Library. Normal mentor review should be parent-native. |
| UX ambiguity | PARENT-07 | Existing "parent library view" should split into adult self Library in Study and child curriculum under Family. |
| Back-stack risk | Shelf/book routes | Code uses explicit replace/fallbacks because cross-tab deep pushes can synthesize a shallow stack; future child curriculum routes need the same stale-route protection. |

## Open Questions

- What is the first parent-native child curriculum route: a dedicated `child/[profileId]/curriculum`, a child subject tab, or an action inside child detail?
- Which child curriculum mutations are allowed for mentors: view only, add subject/book, pause/archive, generate topics, or start a child session?
- Should Family child curriculum include learner notes/bookmarks, or only structured curriculum and progress summaries?
- How should "Add to my learning" from a child curriculum item bridge to the adult's own Study Library without writing to the child profile?
