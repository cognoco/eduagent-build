# LEARN-24 - Saved Bookmarks

> **Status:** Draft  
> **Access label:** Study-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `2026-05-12-chat-notes-bookmarks.md`, `apps/mobile/src/app/(app)/progress/saved.tsx`, `apps/mobile/src/hooks/use-bookmarks.ts`, `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`, `apps/mobile/src/app/(app)/progress/index.tsx`

## Purpose

Give the learner a durable place to revisit chat moments they explicitly saved. The screen is a student-owned memory aid: it lists bookmarked assistant messages with subject/topic context, relative date, collapsed content, expand-on-tap reading, pagination, and delete with confirmation.

Mentor access is not a normal product surface. If a parent is reviewing a child's learning, they need a parent-native recap/report view that summarizes useful outcomes without granting destructive control over the child's saved messages.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Shows the active student's saved bookmarks. The learner can expand entries and delete their own bookmarks after confirmation. Optional `subjectId` filters to one subject. |
| Mentor / Family | Not surfaced in target Family mode. Child bookmarks should not be deleted or mutated by a mentor unless a future design explicitly grants that action. |
| Owner/account | Adult owners in Study manage their own saved bookmarks. Adult owners in Family use recaps/reports/child detail instead of this learner-owned list. |
| Wrong-audience deep link | Family-context deep links to `progress/saved` should recover to Family Progress/Recaps or bridge to Study as the adult. Parent-proxy compatibility may show child bookmarks read-only, but that should not define target access. |

## Shared Scope Decision

`Study-only`

Bookmarks are active student-owned data. Current code includes a parent-proxy read-only compatibility branch that hides delete buttons, but the target Mentor/Family contract says LEARN-24 is not a normal mentor surface. Parent review should use parent-native recaps/outcomes, not a learner bookmark-management screen.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Progress saved card/link | `/(app)/progress/saved` | Yes | No in target | Progress overview renders saved link for self views only. |
| Subject-specific saved link | `/(app)/progress/saved?subjectId={subjectId}` | Yes | No in target | Book screen pushes through Progress then Saved so back stack has the Progress ancestor. |
| Bookmark action in session | Session message bookmark action -> bookmarks API | Yes | No | Creates bookmark for the active learner's chat event. |
| Empty saved CTA | `/(app)/progress/saved` -> `/(app)/library` | Yes | No target Family surface | Empty state assumes Study Library as recovery. Family needs Recaps/child review recovery instead. |
| Delete bookmark | `DELETE /bookmarks/:id` via `useDeleteBookmark` | Yes | No | Current screen hides delete in parent proxy; target should avoid mentor mutation entirely. |
| Parent proxy compatibility | Same route while `useParentProxy().isParentProxy` | Compatibility only | Compatibility only | Read-only display, no trash icon. Not parent-native Family UX. |

## Data Ownership And Privacy

- `useBookmarks` query keys include `activeProfile?.id`, `subjectId`, and `topicId`, keeping cache ownership tied to the active learner profile.
- `useCreateBookmark` and `useDeleteBookmark` invalidate the active profile's bookmark and session-bookmark queries.
- Bookmark content can include raw tutoring text the learner chose to preserve. Mentor surfacing needs product/legal clarity before exposing it outside parent-native recap/report contexts.
- Delete is destructive and permanent from the user's point of view. Mentors must not delete child bookmarks through inherited active-profile/proxy state unless explicitly designed.
- Parent-proxy read-only behavior is a compatibility safety valve, not a Family product contract.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Centered loading indicator inside the list area. |
| Empty | "Nothing saved yet" copy with a CTA back to Study Library so the learner can find learning material. |
| Success | Paginated list of bookmark cards, subject/topic label, relative date, collapsed text up to five lines, tap to expand full Markdown content, infinite-scroll footer spinner. |
| Error/recovery | Error state explains saved items could not load, shows the raw classified error/message when available, offers Try again and Back. Delete failure alerts and preserves the row. |
| No access | Study should only show active learner bookmarks. Family should not surface this route; unauthorized/stale child bookmark access should be protected server-side and recover away from learner-owned mutation UI. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Verify saved list, subject filter, empty CTA, and back fallback. After contract work, verify Family does not surface or retain saved bookmarks as a tab/action. |
| Native/emulator | Inventory lists `e2e/flows/progress/saved-bookmarks.yaml` and `progress/saved-bookmarks-parent-proxy.yaml`; target Family coverage should shift to parent-native recap/outcome surfaces instead of proxy delete checks. |
| API/unit tests | `apps/mobile/src/app/(app)/progress/saved.test.tsx` covers loading, empty, error, list rows, expand/delete, and parent-proxy delete suppression. `use-bookmarks` should remain profile-keyed. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract | Family mode should not surface `progress/saved`; current parent-proxy compatibility can still display child bookmarks read-only. |
| Mutation risk | Delete bookmark | The code correctly hides delete in proxy today, but target contract should prevent mentors from entering this mutation surface at all. |
| Recovery drift | Empty CTA | Empty state always goes to top-level Library, which is Study-only in the target contract. |
| Scope drift | Parent review need | Mentor access to saved child moments needs a different parent-native review surface, likely Recaps/reports, not the same learner flow. |
| Future surfacing | Chat notes/bookmarks spec | Spec discusses surfacing bookmarks in Library/topic context; if implemented, it must preserve learner ownership and avoid Family top-level Library leakage. |

## Open Questions

- Should mentors ever see child bookmarks, or only generated/session recap highlights?
- If child bookmark visibility is allowed, should it be read-only and grouped under Recaps, child session detail, or child topic detail?
- Can a learner mark a bookmark private from mentor review, or are all saved messages treated as learning artifacts?
- Should subject-filtered saved bookmarks recover to the subject book/shelf rather than generic Progress when opened from a book screen?
