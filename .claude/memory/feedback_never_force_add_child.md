---
name: Never force users to add a child profile
description: No screen may gate the entire app behind "add a child" — parent/owner accounts must always have a usable path even with zero linked children
type: feedback
originSessionId: 5adfa103-a89c-4dac-9009-7699c20e2845
---
No user should ever be forced to add a child profile to proceed. Even when a family/pro plan owner has zero linked children, the app must expose a usable path — at minimum a secondary action to continue as a solo learner / skip / explore lessons themselves.

**Why:** Parents and owners may want to try the product, explore lessons, or evaluate content before creating any child profile. Forcing child-addition as the only CTA is a dead-end state and violates the global UX rule that every screen state must have at least one actionable escape. A plan tier should unlock capability, never remove options.

**How to apply:** When touching any gate based on `isParentWithNoChildren`, `hasLinkedChildren`, or similar parent/child-link checks (currently in `apps/mobile/src/app/(app)/home.tsx` `AddFirstChildScreen`), ensure the screen offers both the add-child CTA AND a way to use the app without adding one — e.g. render the normal Home with an inline "Add a child" card, or keep a dedicated screen but add a secondary "Use it myself" / "Skip for now" action that routes to `LearnerScreen`. Never ship a single-CTA forced-path screen.
