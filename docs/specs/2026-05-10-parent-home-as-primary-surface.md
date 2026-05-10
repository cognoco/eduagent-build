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
- **The dominant intent is not where the eye lands first.** Parents are the paying users and their dominant intent on opening the app is checking on their child, but the layout sizes the "Continue your learning" card as the primary CTA.

A previous design used a two-button picker (Study / See your kids' progress) at the Home tab. It was removed during a later UX redesign on aesthetic grounds. The user's own retrospective: the picker was confusing because tapping a tab labeled **Home** opened a destination-chooser instead of a default place. "Home" was breaking its own contract.

The current implementation replaced the picker with the mixed dashboard, which then introduced the problems listed above.

The student home, by contrast, uses a Jobs-to-be-Done framing — "What do you need right now?" — with action cards (Help with assignment / Ask anything / Test yourself / Learn something new). This works. The parent home should match that craft level, with parent-flavored intents.

## Solution

**The parent Home is a JTBD intent picker, mirroring the student home's structure with parent-flavored cards.** It is not a list of dashboard summaries; it is a question ("What do you need right now?") with tappable answers. The parent dominant intent (check on the kid) is the first card. Their own learning is one of the cards — visible, never dominant. Solo learners' Home is unchanged.

### Per-user-type tab structure

| User type | Home tab content | Other tabs |
|---|---|---|
| **Solo learner** (no linked children) | The existing student JTBD picker (4 intent cards: Help with assignment / Ask anything / Test yourself / Learn something new + Your Subjects). Unchanged. | Library • Progress • More |
| **Parent** (≥1 linked child via `family_links`) | A parent JTBD picker (see "Parent Home content" below). | Library • Progress • More |

**Same 4 tabs for both user types.** Only the Home tab content differs. The current Family tab is removed from the bottom nav.

### Parent Home content

A JTBD intent picker. Header, then action cards in the order below. Tapping a card navigates to the matching destination — no second screen, no extra tap.

**Header:**
- Personal greeting: `"Hey {{displayName}}"` — same style as the student home greeting.
- Quota line: `"{{daily}} questions left today · {{monthly}} this month"` — same as the student home shows. The parent shares the family pool; the numbers are still meaningful for them.

**"What do you need right now?" section header**

**Cards** (in order):

1. **One "See how [ChildName] is doing" card per linked child.** Subtitle summarizes the past week ("2 sessions, on track" or "no activity this week" — short, evergreen). Tap → `/child/[profileId]` (existing route, the child detail screen).
2. **One "Read [ChildName]'s weekly report" card per linked child.** Tap → `/child/[profileId]/weekly-report` (existing route).
3. **One "Send [ChildName] a nudge" card per linked child.** Tap → opens an action sheet with 4 pre-written templates (see Nudge feature below). Sends a one-way encouragement to the kid.
4. **"Continue your own learning"** — one card. Subtitle hints at last subject or just "Pick up where you left off." Tap → push the student-home component as a screen. Back arrow returns to parent Home.
5. **Optional conditional card: "Watch [ChildName]'s session live"** — only renders when a child has an active in-progress session. Tap → enters proxy mode for that child.

**Below the cards:**
- The dismissible `FamilyOrientationCue` (one-time onboarding hint, copy updated to "This is your home").

**Not on Home:**
- Family pool breakdown sharing toggle — moves to **More tab** (it is a setting; the More tab is where settings live).
- The current `WithdrawalCountdownBanner` — stays where it is needed (it should appear above whichever surface the parent lands on if a withdrawal is pending; safest to keep it on the parent Home as a top-level banner above the cards).
- The per-child rich metrics card (`ParentDashboardSummary`) — its content lives on the child detail screen reached by tapping the "See how X is doing" card. Not duplicated on Home.

### What changes (concrete file impact)

- **`apps/mobile/src/app/(app)/home.tsx`** — the `isOwner=true` branch (mixed dashboard) is replaced with the parent JTBD picker described above. The `isOwner=false` branch (student JTBD picker) is unchanged. Branching key: presence of linked children, not raw `isOwner` (see Failure modes — solo adult owners must take the student path).
- **`apps/mobile/src/app/(app)/family.tsx`** — deleted. Its rich per-child content is already replicated in the child detail screen; no behavior is lost.
- **Bottom tab nav** — the Family tab is removed. Same 4 tabs (Home, Library, Progress, More) for all users.
- **Family pool breakdown sharing toggle** — moved from `family.tsx` into a More-tab settings row (existing settings hooks reused; this is a relocation, not a new component).
- **i18n** — new keys for parent home greeting, subtitle (intent picker header), and intent card titles/subtitles. Coverage required across all 7 locales (en, de, es, ja, nb, pl, pt).
- **e2e tests** that reference Family tab navigation — updated to reach the same destinations via the Home tab cards.

### What does not change

- The `profiles` table, `family_links`, `isOwner` boolean, `assertParentAccess` middleware, consent state machine, scoped-repo writes — all unchanged. This is a UI navigation reshape, not a data model change. (Exception: a new `nudges` table is added — see Nudge feature.)
- The student home — used in two places (solo learner Home tab, and pushed as a screen when a parent taps "Continue your own learning"). Same component, two callers.
- The deep child-management screens (`child/[profileId]/index.tsx`, `mentor-memory`, `reports`, `weekly-report`, `subjects`, `topic`, `session`) — unchanged. They continue to be the destinations the parent's intent cards navigate to.
- Library, More tabs — unchanged structurally; More gets one new settings row (the relocated breakdown-sharing toggle).
- Boot order — boot to Home as today.

### Progress tab

For **solo learners:** Progress tab is unchanged (their own progress charts).

For **parents:** Progress tab gets a segmented control at the top:

> ┌────────────────┬────────────────┐
> │ TestKid        │ Mine           │
> └────────────────┴────────────────┘

- Multi-child parents see one pill per child plus "Mine": e.g. `Anna · Bob · Mine`.
- Default selected pill: the first linked child (parent-primary intent).
- Tapping "Mine" renders the parent's own progress (same data the solo learner sees on their Progress tab).
- Tapping a child pill renders that child's progress data.

This is the "two-sided card" intuition resolved as a standard segmented control — predictable, low novelty cost, fits existing app tone. Implementation reuses the existing per-profile progress fetch logic with a profileId argument; the progress rendering component is the same regardless of subject (own vs child).

### Nudge feature

A new minimum-viable feature: parents send a pre-written encouragement message to a linked child. One-way, low-friction, designed to support the "encouragement, not surveillance" principle.

**User-facing surface:**

- "Send [ChildName] a nudge" card on the parent Home (intent card #3 above).
- Tap → opens an action sheet with 4 templates:
  - *"You got this"*
  - *"Proud of you"*
  - *"Want to do a quick session?"*
  - *"Just thinking of you"*
- Selecting a template sends the nudge and shows a brief confirmation toast on the parent device. Selecting "Cancel" closes the sheet without sending.
- No free-text composition in v1. Free-text invites pressure-flavored messages and adds friction; templates lock the tone to encouragement.

**Kid-side surface:**

- Push notification to the kid's registered devices (existing push infrastructure).
- An in-app banner on the kid's Home tab on next render, showing the most recent unread nudge with the sender's display name and the template text. Banner is dismissible (mark-read).
- No required reply mechanism v1. The kid acknowledges by dismissing.

**Data model:**

- New `nudges` table: `id` (uuid), `fromProfileId` (fk → `profiles.id`), `toProfileId` (fk → `profiles.id`), `template` (enum of the 4 template keys), `createdAt` (timestamp), `readAt` (nullable timestamp).
- Indexed on `(toProfileId, readAt)` for fast unread-banner lookup on kid's home.
- Migration committed as a Drizzle SQL migration; no `drizzle-kit push` against staging/prod.

**API:**

- `POST /nudges` — body: `{ toProfileId, template }`. Auth: requires the caller to have `assertParentAccess(toProfileId)` permission (existing middleware). Rate-limited (see cap below).
- `GET /nudges?unread=true` — for kid client to fetch unread nudges. Scoped via `createScopedRepository(profileId)`.
- `PATCH /nudges/:id/read` — kid marks a nudge as read.

**Rate cap:** A single parent profile may send at most **3 nudges per 24-hour period to a given child profile**. Enforced server-side in the route handler. Exceeding the cap returns a typed `RateLimitError` (existing error class); parent UI shows "You've sent the day's encouragement — TestKid will see it next time they open the app." No countdown shown.

**Why this cap:** the project's UX philosophy explicitly rejects surveillance-feel and prefers quiet defaults. 3/day allows real encouragement without drift toward badgering. Adjustable on signal post-launch.

**i18n:** the 4 template strings × 7 locales. New i18n keys under `nudge.templates.*`. Banner copy and toast copy also need locale coverage.

**Out of scope for nudge v1:** kid-to-parent replies, voice nudges, custom messages, scheduled nudges, multi-recipient nudges (one parent → all kids at once), parent-to-parent messaging, read receipts surfaced to parent.

### Where the family-pool sharing toggle goes

The family-pool breakdown-sharing toggle currently lives at the bottom of `family.tsx`. Since `family.tsx` is being deleted, the toggle moves to the **More tab** as a new row in the settings list. Existing hooks (`useFamilyPoolBreakdownSharing`, `useUpdateFamilyPoolBreakdownSharing`) are reused unchanged; only the JSX location changes.

## User journeys

### Parent opens the app to check on their kid (dominant flow)

1. App launches → boots to Home tab.
2. Home renders the parent JTBD picker. Top card: "See how TestKid is doing — 2 sessions this week."
3. Parent taps the top card → child detail screen (`/child/[profileId]`).
4. **One tap from app launch to the child detail screen.** Same as today's Family-tab path; cleaner because the Home tab itself now uses single-purpose framing.

### Parent opens the app to study themselves (upsell flow)

1. App launches → boots to Home tab (parent JTBD picker).
2. Parent taps the "Continue your own learning" card.
3. The student-home component is pushed as a screen — same JTBD picker the student home shows (Help with assignment / Ask anything / Test yourself / Learn something new + Your Subjects), scoped to the parent's own profile.
4. Back arrow returns to parent Home.
5. **Same craft level for parent learning as for student learning.** Reuses the existing component.

### Parent opens the app to read this week's report on their kid

1. App launches → boots to Home tab.
2. Parent taps "Read TestKid's weekly report" card.
3. `/child/[profileId]/weekly-report` opens directly.

### Solo learner

1. App launches → boots to Home tab.
2. Home renders the student JTBD picker (unchanged from today).

### Solo learner adds their first child (transition moment)

When a previously-solo learner adds a first child profile (gains a row in `family_links` where `parentProfileId = activeProfileId`), their Home tab content swaps from the student JTBD picker to the parent JTBD picker.

**Mitigation for the surprise:** show a one-time inline notice on the new parent Home, first render only:

> "You're a parent now too. This is your home — kids' progress and your own learning, all in one place."

The notice is dismissible, persists state via SecureStore (`mentomate_parent_home_seen`), shown at most once per profile.

Because both the old and new Home are JTBD pickers, the structural change is small (same "What do you need right now?" framing; different cards). The transition is less jarring than swapping to an entirely different layout.

### Parent removes their last child (reverse transition)

Edge case. When a parent's last linked child is removed: Home reverts to the student JTBD picker. No notice (it's a simplification, not a relocation).

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Parent opens app, dashboard data fails to load (used for card subtitles) | Network error or API 5xx | Cards still render with neutral subtitles ("Tap to see TestKid's progress"); no broken layout | Existing typed-error middleware classifies; cards remain tappable; deep screens render their own retry UI |
| Account-owner-but-no-linked-children (`isOwner=true`, zero rows in `family_links`) | Sign-up + skip add-child flow | Treated as solo learner — student JTBD picker on Home, no parent cards | Tab/Home logic keys on `family_links` count, not `isOwner`. Solo adult owners must not see parent cards. Test: explicit case in `home.tsx` integration tests. |
| Parent transition notice shows repeatedly | SecureStore key not persisted or cleared on sign-out | Notice re-shows after restart | SecureStore key write happens on dismiss. If write fails, accept the duplicate notice — it is a soft annoyance, not a bug. Use the same SecureStore-cleanup-on-sign-out pattern that handles other per-profile keys. |
| Parent with multiple children — Home becomes long | Parent with 3+ kids | Two cards per kid (See how / Read report) → can become 6+ cards plus the own-learning card | Acceptable for v1. If usage signal shows scrolling pain, consider collapsing per-kid to a single card with both actions inline. Track post-launch. |
| "Continue your own learning" subtitle says "pick up where you left off" but parent has no started subjects | Parent has never opened a subject | Subtitle falls back to "Start something new" | Same logic the student-home uses for empty-state subtitles. |
| Parent on Home, taps "Continue your own learning" while in proxy mode | Parent activated proxy mode then returned to Home | Tapping the card auto-clears the proxy flag before pushing the student-home screen | New logic: navigation to "your own learning" route clears the proxy flag. One-line guard in the tap handler. |
| Withdrawal countdown is active when parent lands on Home | Consent withdrawal pending | `WithdrawalCountdownBanner` renders above the cards | Existing component, no change. |
| Multi-child parent loses one child mid-session (consent withdrawal completes) | Consent state changes from `CONSENTED` to `WITHDRAWN` | The corresponding "See how X", "Read X's report", and "Send X a nudge" cards disappear on next Home render. If they were the only kid, Home reverts to student JTBD picker. | Standard query invalidation; no special handling required beyond ensuring the Home derives card list from live data. |
| Parent hits nudge cap (3/day to one kid) | Parent taps a 4th nudge template | Action sheet closes; toast shows "You've sent today's encouragement — TestKid will see it next time they open the app" | Server returns `RateLimitError`; client maps to friendly toast. No countdown UI. Cap resets at midnight in the parent's local timezone. |
| Kid receives nudge while consent is pending or withdrawn | Parent sends to kid whose `consentStatus` is `PENDING`/`PARENTAL_CONSENT_REQUESTED`/`WITHDRAWN` | Server rejects the nudge with a typed error; parent sees a clear message explaining the kid can't receive nudges until consent is active | Consent gate on `POST /nudges` mirrors the existing dashboard-metrics consent gate. Parent message: "TestKid's consent is pending — encouragement will work once they're set up." |
| Kid has multiple unread nudges queued | Parent sends 2 within the cap; kid hasn't opened the app | Banner on kid's home shows the most recent unread nudge; tapping the banner reveals all unread nudges in a small modal | Banner shows count badge ("2 new") when more than one unread nudge exists. |

## Out of scope (explicit)

- **Renaming database/schema concepts** (`isOwner`, `family_links`, `Child*` and `Parent*` schema types). Mentor/Mentee rename is a multi-PR program with regulatory copy implications. Not bundled here.
- **Renaming the AI ("Mentor")** to something else. Decoupled.
- **Multi-Mentor-per-Mentee** (two parents or a parent + grandparent sharing a child) — schema change, deferred.
- **Non-family Mentor relationships** (tutor mentoring an unrelated learner) — product expansion, deferred.
- **Free-text nudges, kid-to-parent replies, voice nudges, scheduled nudges** — see Nudge feature out-of-scope list.
- **Quota / billing changes** if the parent now consumes the family pool more by learning — review post-launch on usage signal.

## Implementation notes (terse)

- Branching key for Home content: linked-children count, computed via `family_links` query for `parentProfileId = activeProfileId`. Not raw `isOwner`. Add a hook (`useHasLinkedChildren()` or extend `useProfile()`) if one doesn't exist already.
- Parent Home component: new file (or new branch in `home.tsx`), reuses the existing card primitives the student home already uses for visual consistency.
- "Continue your own learning" card: tap handler pushes the existing student-home component as a screen. Component already exists; only the routing is new.
- Family-pool sharing toggle relocation: existing `useFamilyPoolBreakdownSharing` and `useUpdateFamilyPoolBreakdownSharing` hooks are reused; the JSX moves from `family.tsx` into a More-tab settings row.
- `family.tsx` and the `Family` tab entry in the layout are deleted in the same PR. Any test or selector referencing the Family tab updates to reach equivalent destinations via the Home cards or via direct route navigation.
- `WithdrawalCountdownBanner` and `FamilyOrientationCue` (with updated copy) move to render above the parent JTBD cards on Home.
- One-time transition notice: SecureStore key `mentomate_parent_home_seen`. Set on dismiss; checked on parent Home render.
- Proxy-mode auto-clear on "Continue your own learning" tap: one-line guard.
- **Progress tab segmented control**: small new component in the Progress tab layout. Renders only for parents (linked-children count ≥ 1). Reuses existing per-profile progress fetch with a `targetProfileId` argument. Default selected pill = first linked child by `family_links.createdAt`.
- **Nudge feature**:
  - Drizzle migration adds `nudges` table with index `(toProfileId, readAt)`.
  - New API routes under `apps/api/src/routes/nudges/` (POST, GET, PATCH read). Auth uses existing `assertParentAccess` for POST; scoped repo for GET/PATCH on the kid side.
  - Rate limiter: per-(parent, child)-pair counter with 24h window. Implementation: SQL `count(*) WHERE fromProfileId=? AND toProfileId=? AND createdAt > now()-interval '24 hours'`. No Redis required.
  - Push notification: existing push infra used; payload includes `type: 'nudge'`, `nudgeId`, sender display name, template key. Kid app handles tap → opens Home with banner.
  - Mobile (parent): action sheet component, tap handler, optimistic UI with confirmation toast.
  - Mobile (kid): banner component on Home, tap → modal listing all unread nudges, mark-read on dismiss.
  - i18n: 4 template strings + banner copy + toast copy + rate-limit message + consent-pending message × 7 locales.
- E2E tests: parent-journey suite updated. New tests cover (a) solo-to-parent transition, (b) parent sends a nudge → kid sees banner on next open → kid dismisses, (c) parent hits rate cap → toast shown, (d) Progress tab segmented control swap renders correct data per pill.

## Open questions

1. **Subtitle copy for the "See how X is doing" card** — the live data ("2 sessions this week") is informative but flips between supportive and alarming depending on numbers. Should the subtitle stay neutral ("Tap to see this week's progress") or surface the live snapshot? Recommended: live snapshot when present, neutral fallback when no data. Defer specific phrasing to implementation.
2. **Order of cards when there are multiple children** — alphabetical, by `family_links.createdAt`, or surfacing the most-active child first? Recommended: by `family_links.createdAt` (stable, predictable). Defer.
3. **Visual differentiation between "See how X is doing" and "Read X's weekly report"** — both are about the same child. Distinct icons + distinct color tints to avoid visual sameness. Cosmetic; defer.

## Verification before declaring done

- Visual: screenshot the parent Home (post-redesign) and the student home, side-by-side, to confirm consistent JTBD craft level.
- Behavior walkthrough: solo learner cold-launches → student JTBD picker. Parent cold-launches → parent JTBD picker. Parent taps "See how X is doing" → child detail. Parent taps "Continue your own learning" → student home pushed as screen, back arrow returns. Parent taps weekly-report card → weekly report. Solo learner adds first child → tabs unchanged, Home content swaps, transition notice shows once. Re-launch after dismiss → no notice.
- Tests: parent-journey E2E updated. New E2E for solo-to-parent transition. Existing student-home tests unchanged (component is reused, not modified).

## Decision log

- **2026-05-10:** Picked this shape over (a) two-button picker, (b) mixed dashboard (current), (c) "Home = student JTBD for everyone, boot to Family for parents", (d) "promote current Family tab to Home with 5 small tweaks":
  - **(a)** breaks the "Home = home" expectation; user reported it as confusing in their own retrospective.
  - **(b)** is the current state and is the problem this spec is solving.
  - **(c)** downprioritizes the parent identity, which is the paying user's primary identity in this product.
  - **(d)** preserved the navigation reshape but kept a list-of-summaries layout instead of the JTBD craft the student home uses. Inconsistent craft level between user types.
  - **This shape (e) — JTBD picker on parent Home, mirroring student craft, parent intents** — preserves "Home = home" (each user lands on their actual default surface), keeps the parent role primary (top cards are about the kid), keeps "you can learn too" discoverable as one card, and matches the student home's JTBD framing for design consistency.
