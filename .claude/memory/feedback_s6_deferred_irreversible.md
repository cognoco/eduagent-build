---
name: S6 cutover is DEFERRED + IRREVERSIBLE — human confirmation required
description: Before any agent executes S6 (V2 cutover & deletions), it must stop, get explicit human confirmation, and state that S6 removes the only flag-flip path back to V1/V0
type: feedback
---

S6 (`docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md`, status: deferred) is the
irreversible phase of the mentor-is-the-app V2 redesign. **No agent may start it
autonomously.** Before ANY destructive step, the agent must obtain explicit human
confirmation, and when asking it must state plainly: *"S6 deletes the V0 and V1
navigation shells — after this there is no way back to V1 or V0 by flag; rollback would
require a git revert and rebuild."*

**Why:** Through S5, reverting the shell to V1/V0 is a build-time flag flip
(`EXPO_PUBLIC_ENABLE_MODE_NAV_V2` off / V1 on), even an OTA (~5 min), because the V0/V1
code paths are deliberately kept alive (`apps/mobile/src/lib/legacy-navigation-contract.ts`
+ `navigation-contract.ts` + the flags-off short-circuits, pinned no-edit for §7
no-regress). S6 *deletes* those paths and flips V2 to the production default — at which
point the only rollback is git revert. (The identity data cutover under S4/S5 is
separately not reversible by flag at all.) Ruled by user 2026-06-14.

**How to apply:** Treat "go live on V2" and "execute S6 / retire V0" as two separate
decisions with a validation window between them. The deferred marker + mandatory
confirmation protocol live at the top of the S6 plan and in `00-README.md`. Gates (a)–(d)
being green does NOT substitute for the human confirmation. See [[feedback_just_do_it]]
(this is the documented exception — S6 is the one place an agent must gate and ask).
