# Parent Home as Primary Surface

**Date:** 2026-05-10
**Status:** Draft — pending user review
**Owner:** Jørn

## Problem

The current parent home (the screen a user with linked children sees when they tap the Home tab) interleaves two worlds in a single vertical scroll:

1. A personal greeting and a "TONIGHT — pick up where you left off" card framed for the user as a learner.
2. A CHILDREN status card describing the linked child's recent activity.
3. The user's own subjects.

This produces three problems:

- **Mixed identity signals.** The screen zigzags between "you are a learner" and "you are a parent" three times in one scroll. There is no spine.
- **The CHILDREN card describes a state without offering an action.** It says "a nudge can help" but provides no button, so the parent reads the diagnosis and has to navigate elsewhere.
- **Parent role is not in a primary slot.** Parents are the paying users and their dominant intent on opening the app is checking on their child, but the layout sizes the "Continue your learning" card as the primary CTA.

A previous design used a two-button picker (Study / See your kids' progress) at the Home tab. That was removed during a later UX redesign. The user's own retrospective: the picker was confusing because tapping a tab labeled **Home** opened a destination-chooser instead of a default place. "Home" was breaking its own contract.

The current implementation replaced the picker with the mixed dashboard, which then introduced the problems listed above.

## Solution

**For users with linked children, the Home tab IS the parent dashboard.** Their own learning lives in a sibling tab. Solo learners are unchanged.

### Per-user-type tab structure

| User type | Home tab content | Other tabs |
|---|---|---|
| **Solo learner** (no linked children) | The existing student JTBD picker (4 intent cards: Help with assignment / Ask anything / Test yourself / Learn something new + Your Subjects). Unchanged. | Library • Progress • More |
| **Parent** (≥1 linked child via `family_links`) | The parent dashboard — child cards, weekly reports surface, mentor-memory access, watch-live entry. This is what the current `Family` tab renders. | **Learn** • Library • Progress • More |

### What changes

- **The current `Family` tab is renamed to `Home` and moved into the leftmost tab slot for parents.**
- **A new `Learn` tab is added for parents.** It renders the same component the student home renders today (the JTBD picker for the user's own learning, scoped to their profile).
- **The current parent home (mixed-dashboard layout in `home.tsx` for `isOwner=true` users) is deleted.** No more TONIGHT card on the parent variant. No more CHILDREN status card. No more YOUR SUBJECTS section on the parent's Home.

### What does not change

- The `profiles` table, `family_links`, `isOwner` boolean, `assertParentAccess` middleware, consent state machine — all unchanged. This is a UI navigation reshape, not a data model change.
- The student home (for solo learners and reached via the Learn tab) — unchanged.
- The deep child-management screens (`child/[profileId]/index.tsx`, `mentor-memory`, `reports`, `weekly-report`, `subjects`, `topic`, `session`) — unchanged. They continue to be reached from the parent's Home (formerly Family) tab.
- Library, Progress, More tabs — unchanged.
- Boot order — boot to Home as today; the difference is what Home means per user type.
- The visual design of the parent dashboard contents — confirmed clean after reviewing screenshots on 2026-05-10. The per-child card (`ParentDashboardSummary`), orientation cue, and family-pool toggle stay as-is structurally. Only copy and framing tweaks (next section).

### Tweaks for the Home variant

The current `family.tsx` content is substantively the right surface for the parent's primary Home. These tweaks reframe it from "Family sub-page" to "your home":

1. **Drop the `← Back` button** in the parent Home variant. Home is a tab destination, nothing to navigate back to. The `returnTo` query-param logic is irrelevant when Home is the leftmost tab. Keep the existing `goBackOrReplace` helper available for any deeper screens that still push from Home.
2. **Replace the `family.title` ("Family") with a greeting.** Use a parent-context greeting matching the student-home style (e.g. `"Hey {{displayName}}"`). New i18n key: `home.parent.greeting` with the same locale coverage as the existing `home.greeting`.
3. **Replace the `family.subtitle` ("Everyone you're learning alongside").** The current copy implies the parent is also learning — wrong framing for the parent's primary surface. Suggested: *"Your children's learning at a glance."* New i18n key: `home.parent.subtitle`.
4. **Update the `FamilyOrientationCue` copy** from "This is your family hub / Children, their progress, and family settings live here." to a Home-framed version: *"This is your home — children, their progress, and family settings live here."* Same component, copy-only change. Existing dismissal behavior (SecureStore-persisted) unchanged.
5. **Drop the `more.family.sectionHeader` ("Family") label** above the breakdown-sharing toggle. The full tab is now the parent's home; a "Family" subsection header is redundant chrome. The toggle's own title and description carry enough context.

No layout, hierarchy, or new components required. Five copy/structure tweaks, all reachable through i18n key updates plus a small JSX delete (the back button and section header).

### Discoverability of "you can also learn"

The product positions itself partly as a learning tool the parent can use too. Discoverability is preserved without a forced picker:

- The **Learn** tab is permanently visible in the bottom navigation, second position from the left, for every parent. Always one tap away.
- A subtle hint can be added to the Learn tab label or icon (e.g. "Italian · 10 left today" using the same daily-quota line the student home shows). Decision deferred to implementation; not gating on it.

The earlier two-button picker tried to solve discoverability by making the parent choose every launch. That was UX friction on the dominant flow (kid check-in). A persistent tab achieves the same surface visibility without the tap tax.

## User journeys

### Parent opens the app to check on their kid (dominant flow)

1. App launches → boots to Home tab.
2. Home tab renders parent dashboard (kid cards, recent activity, links to weekly report and mentor memory).
3. Parent taps the kid they want to look at → child detail surfaces (existing behavior).
4. **Zero extra taps versus today's mixed dashboard for the dominant flow.** Cleaner because the screen is single-purpose.

### Parent opens the app to study themselves (upsell flow)

1. App launches → boots to Home tab (kid dashboard).
2. Parent taps the **Learn** tab.
3. Learn tab renders the JTBD picker (Help with assignment / Ask anything / Test yourself / Learn something new + their subjects).
4. Same experience the student home offers — first-class learning surface, not a list.

### Solo learner

1. App launches → boots to Home tab.
2. Home tab renders the JTBD picker (current student home, unchanged).
3. No Learn tab, no Family tab — they have one identity.

### Solo learner adds their first child (transition moment)

This is the only state-change worth specifying. When a previously-solo learner adds a first child profile (becomes a parent in `family_links` terms), their tab structure changes:

- **Their Home tab content swaps** from the JTBD picker to the parent dashboard.
- **A new Learn tab appears** between Home and Library.
- The JTBD picker that was their Home is now reached via the Learn tab — same component, same content, same subjects, just one tap deeper.

**Mitigation for the surprise:** show a one-time inline notice on the new Home tab the first time it renders post-add-child:

> "Welcome to your parent dashboard. Your own learning moved to the Learn tab — tap to continue where you left off."

The notice is dismissible, persists state via SecureStore (`mentomate_parent_home_seen`), shown at most once per profile.

### Parent removes their last child (reverse transition)

Edge case, lower priority. When a parent's last linked child is removed:

- Home tab content reverts to the JTBD picker.
- Learn tab disappears.

No notice required for this direction; it's a simplification, not a relocation.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Parent opens app, dashboard data fails to load | Network error or API 5xx | Standard `ErrorFallback` on Home tab — primary action retries fetch, secondary action navigates to Learn tab so the parent can still use their own learning | Existing typed-error middleware handles this; no new error path needed |
| Parent has 0 linked children but is `isOwner=true` (account owner who just signed up but hasn't added a child yet) | Sign-up + skip add-child flow | Treat as solo learner — Home is JTBD picker, no Learn or Family tab | The "linked children" check in tab-rendering logic must use `family_links.parentProfileId = activeProfileId` count, not just `isOwner`. Solo adult owners must not see the parent dashboard. |
| Parent transition notice shows repeatedly | SecureStore key not persisted or cleared | Notice re-shows after restart | SecureStore key write happens on dismiss. If write fails (e.g. SecureStore unavailable), accept the duplicate notice — it's a soft annoyance, not a bug. Don't add a fallback persistence layer. |
| Parent with multiple children — Home becomes crowded | Parent with 3+ kids | Home renders one card per child, scrolls vertically. Existing parent dashboard already handles this. | No new design work required. Use existing card layout. |
| Account-owner-but-not-guardian (e.g. account owner with a non-family adult Mentee — not currently a supported scenario) | n/a — out of scope | n/a | Out of scope. The tab-rendering logic keys on `family_links` count; whatever rules govern who appears in `family_links` continue to govern this. |
| Parent on Learn tab during proxy mode | Parent activated proxy mode then switched to Learn tab | Proxy mode should auto-deactivate when entering Learn tab (because Learn is "you as yourself, learning") | New logic: navigation to Learn tab clears the proxy flag. Add a single-line guard. |

## Out of scope (explicit)

The following are NOT part of this spec. They may be addressed in separate work:

- **Renaming the database/schema concepts** (`isOwner`, `family_links`, `Child*` and `Parent*` schema types). The earlier conversation explored a Mentor/Mentee rename. That is a multi-PR program with regulatory copy implications and breaking schema contract changes. Not bundled here.
- **Renaming the AI ("Mentor") to something else.** Decoupled.
- **Multi-Mentor-per-Mentee** (allowing two parents or a parent + grandparent to share a child) — schema change, deferred.
- **Non-family Mentor relationships** (tutor mentoring an unrelated learner) — product expansion, deferred.
- **Quota / billing changes** if the parent now genuinely consumes the family pool by learning — to be reviewed once this redesign ships and we have actual usage signal.

These are listed only so a future reader understands the boundary, not because they need decisions now.

## Implementation notes (terse)

- Tab rendering logic (the bottom-tabs layout file) needs to switch on `family_links.parentProfileId = activeProfileId` count: 0 → solo tabs, ≥1 → parent tabs.
- The "Family" tab file/route is renamed to "Home" for parent-tab variant; the Home file content for parents becomes what's currently in the Family tab; the Home file content for solo learners stays.
- The Learn tab is a new entry in the parent-tab variant; its target is the existing student-home component.
- The current `home.tsx` `isOwner` branch (the mixed dashboard, lines ~26–48 per earlier audit) is deleted. The remaining `isOwner=false` path for student home is what runs for everyone reaching the JTBD picker.
- One-time transition notice: SecureStore key `mentomate_parent_home_seen`. Set on dismiss; checked on Home render for parents.
- Proxy-mode auto-clear when navigating to Learn tab: one-line guard in the Learn tab's mount/focus handler.
- E2E tests under `tests/e2e/` that depend on the Family tab name will need to be updated. Selectors keyed on testID, not label, ideally — verify and update where needed.

## Open questions

1. **Should the Learn tab show a daily-quota hint in its label** (e.g. "Italian · 10 left")? Helps discoverability without changing the structure. Defer to implementation; not blocking.
2. **What does the Home tab icon look like for parents vs solo learners?** Currently the home icon is generic. For parents, it now represents the parent dashboard. The icon could stay generic or shift to a family-shaped glyph for parents. Cosmetic; defer.
3. **Should the one-time transition notice be in-line on the screen, a toast, or a modal?** Recommended: in-line dismissible card at the top of the new parent Home, first render only. Cheap to build, low-pressure.

## Verification before declaring done

- Visual: screenshot the parent Home (post-redesign) and the Learn tab, side-by-side with the student home, to confirm the Learn tab and student home are the same component.
- Behavior: walkthrough — solo learner cold-launches → JTBD picker. Parent cold-launches → kid dashboard. Parent taps Learn → JTBD picker. Solo learner adds first child → tabs reflow, transition notice shows once. Solo learner re-launches after notice dismissed → no notice.
- Tests: existing parent-journey E2E tests updated. New E2E test covering the solo-to-parent transition. Existing student-home tests should still pass unchanged because the component itself doesn't move.

## Decision log

- **2026-05-10:** Picked this shape over (a) two-button picker, (b) mixed dashboard, (c) "Home = learner for everyone, boot to Family" because:
  - (a) breaks the "Home = home" expectation; user reported it as confusing in their own retrospective.
  - (b) is the current state and is the problem this spec is solving.
  - (c) downprioritizes the parent identity, which is the paying user's primary identity in this product.
  - This shape preserves "Home = home" (each user lands on their actual default surface), keeps the parent role primary, and keeps the "you can learn too" upsell discoverable via a permanent tab without forcing a picker.
