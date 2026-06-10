---
name: Comment out, don't delete
description: When asked to remove UI code, comment it out rather than deleting — preserve for easy re-enable
type: feedback
---

When the user asks to "remove" UI code that represents a future feature, comment it out rather than deleting it entirely.

**Why:** The user wants to preserve the code for easy re-enabling later. Deleting forces reconstruction; commenting out is a quick toggle.

**How to apply:** When hiding unreleased features or temporarily removing UI sections, use JSX comment blocks (`{/* ... */}`) or language-appropriate comment syntax. Keep the surrounding hooks/state/handlers intact so uncommenting the JSX is all that's needed to restore.
