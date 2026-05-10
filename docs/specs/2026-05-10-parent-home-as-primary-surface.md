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
5. **Optional conditional card: "Open [ChildName]'s session"** — only renders when a child has an active in-progress session. Tap → child detail screen with the active session highlighted (`/child/[profileId]` with the live session as the primary CTA there). Does **not** add a new "watch session live" UI in this spec; if a real-time observer view is later desired, it's a separate feature with its own scope. The card simply routes to the existing child detail screen and lets the parent's existing flows take over (proxy mode is set on profile-switch, not on this tap).

**Below the cards:**
- The dismissible `FamilyOrientationCue` (one-time onboarding hint, copy updated to "This is your home").

**Not on Home:**
- Family pool breakdown sharing toggle — moves to **More tab** (it is a setting; the More tab is where settings live).
- The current `WithdrawalCountdownBanner` — stays where it is needed (it should appear above whichever surface the parent lands on if a withdrawal is pending; safest to keep it on the parent Home as a top-level banner above the cards).
- The per-child rich metrics card (`ParentDashboardSummary`) — its content lives on the child detail screen reached by tapping the "See how X is doing" card. Not duplicated on Home.

### What changes (concrete file impact)

- **`apps/mobile/src/app/(app)/home.tsx`** + `LearnerScreen.tsx` — the parent branch (mixed dashboard with `ChildCard` + subjects) is replaced with the parent JTBD picker described above. The solo-learner branch (student JTBD picker with `HOME_INTENT_ACTIONS`) is unchanged. Branching key: presence of linked children, not raw `isOwner` (see Failure modes — solo adult owners must take the student path). LearnerScreen.tsx today computes `linkedChildren` inline (filter of non-owner profiles); this PR extracts that into a **required** new hook `useHasLinkedChildren()` (or `useLinkedChildren()` returning the array) in `apps/mobile/src/lib/profile.ts` so the Home tab and the Progress tab segmented control read the same predicate. Inline duplication of the linked-children check is forbidden after this PR — both call sites must use the hook. Failure to extract leaves a drift surface where one tab can disagree with the other about whether the user is a parent.
- **`apps/mobile/src/app/(app)/family.tsx`** — deleted. Its rich per-child content is already replicated in the child detail screen; no behavior is lost.
- **Bottom tab nav** — the Family tab is removed. Same 4 tabs (Home, Library, Progress, More) for all users.
- **Family pool breakdown sharing toggle** — moved from `family.tsx` into a More-tab settings row (existing settings hooks reused; this is a relocation, not a new component).
- **i18n** — new keys for parent home greeting, subtitle (intent picker header), and intent card titles/subtitles. Coverage required across all 7 locales (en, de, es, ja, nb, pl, pt). Card title copy that interpolates `{{childName}}` (e.g. *"See how {{childName}} is doing"*, *"Read {{childName}}'s weekly report"*, *"Send {{childName}} a nudge"*) requires **locale-specific phrasing**, not naive English-shaped templates with the name slotted in. Possessives, verb position, and word order vary across `nb`, `de`, `es`, `pl`, `pt`, and especially `ja`. Each locale file owns the full sentence shape; translators see the full template, not a prefix-name-suffix split. The English source string is treated as one of seven equally-authoritative phrasings.
- **e2e tests** that reference Family tab navigation — updated to reach the same destinations via the Home tab cards.

### What does not change

- The `profiles` table, `family_links`, `isOwner` boolean, `assertParentAccess` middleware, consent state machine, scoped-repo writes — all unchanged. This is a UI navigation reshape, not a data model change. (Exceptions: a new `nudges` table is added — see Nudge feature; the `NotificationPayload` discriminated union in `packages/schemas/` is extended with a `'nudge'` variant — see Nudge feature → Push notification.)
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

This is the "two-sided card" intuition resolved as a standard segmented control — predictable, low novelty cost, fits existing app tone. Implementation reuses the existing per-profile progress fetch logic with a profileId argument; the progress rendering component is the same regardless of subject (own vs child). Branching uses the same `useHasLinkedChildren()` hook introduced for Home — no inline computation.

**Pill row overflow on small phones (≥3 children):** the user's primary test device is a 5.8" Galaxy S10e. Three pills + "Mine" already approach the row width with translated locales. The pill row is implemented as a horizontally-scrollable `ScrollView` with `showsHorizontalScrollIndicator={false}` and a soft right-edge fade, not a flex-wrap to a second line. The default-selected pill scrolls into view on mount so the active state is always visible without manual scroll. Confirmed acceptable for v1; revisit with a dropdown collapse only on signal.

### Nudge feature

A new minimum-viable feature: parents send a pre-written encouragement message to a linked child. One-way, low-friction, designed to support the "encouragement, not surveillance" principle.

**User-facing surface:**

- "Send [ChildName] a nudge" card on the parent Home (intent card #3 above).
- Tap → opens an action sheet with 4 templates:
  - *"You got this"*
  - *"Proud of you"*
  - *"Want to do a quick session?"*
  - *"Just thinking of you"*
- Selecting a template fires `POST /nudges`. The action sheet shows a brief in-flight indicator on the selected row; the confirmation toast is shown **only after the 200 response** — no optimistic UI. Rationale: the endpoint is rate-limited and consent-gated; an optimistic toast would lie when the server returns `RateLimitedError` or a consent-pending error. The latency win on a single tap does not outweigh the false-success risk. On error, the sheet shows the appropriate failure message inline (rate-limit copy or consent-pending copy) and stays open until the parent dismisses. Selecting "Cancel" closes the sheet without sending.
- No free-text composition in v1. Free-text invites pressure-flavored messages and adds friction; templates lock the tone to encouragement.

**Kid-side surface:**

- Push notification to the kid's registered devices (existing push infrastructure). The `NotificationPayload` discriminated union in `packages/schemas/src/notifications.ts` is extended with a new `type: 'nudge'` variant carrying `nudgeId`, `fromDisplayName`, and `templateKey`. The `apps/api/src/services/notifications.ts` sender adds a `'nudge'` case; the kid-side push receiver in `apps/mobile/` adds the matching handler that taps through to Home with the banner ready.
- **Quiet-hours gate**: server-side, the push send is suppressed (the row is still inserted, but no push fires) when the kid's local time is outside 07:00–21:00. The banner still appears on the kid's next foreground render. Rationale: the encouragement-not-surveillance principle breaks if a parent firing "Want to do a quick session?" at 11pm buzzes a sleeping child's device. The quiet-hours window is a server constant in v1, not a user setting; revisit on signal. Kid local time is read from the kid profile's stored timezone (existing field). If unset, default to the parent's timezone.
- An in-app banner on the kid's Home tab on next render, showing the most recent unread nudge with the sender's display name and the template text. Banner is dismissible (mark-read).
- No required reply mechanism v1. The kid acknowledges by dismissing.

**Data model:**

- New `nudges` table: `id` (uuid), `fromProfileId` (fk → `profiles.id`), `toProfileId` (fk → `profiles.id`), `template` (enum of the 4 template keys), `createdAt` (timestamp), `readAt` (nullable timestamp).
- Indexed on `(toProfileId, readAt)` for fast unread-banner lookup on kid's home.
- Migration committed as a Drizzle SQL migration; no `drizzle-kit push` against staging/prod.

**API:**

- `POST /nudges` — body: `{ toProfileId, template }`. Auth: requires the caller to have `assertParentAccess(toProfileId)` permission (existing middleware in `apps/api/src/services/family-access.ts`). Also gated on the recipient's `consentStatus === 'CONSENTED'` — `PENDING`, `PARENTAL_CONSENT_REQUESTED`, and `WITHDRAWN` all reject with a typed consent error. Rate-limited (see cap below).
- `GET /nudges?unread=true` — for kid client to fetch unread nudges. Scoped via `createScopedRepository(profileId)`. The repo query additionally filters out nudges from senders whose link to this profile no longer exists (`family_links` row removed) — a previously-linked parent who is now unlinked must not surface stale nudges to the kid.
- `PATCH /nudges/:id/read` — kid marks a nudge as read.

**Rate cap:** A single parent profile may send at most **3 nudges per rolling 24-hour window to a given child profile**. Enforced server-side in the route handler via `count(*) WHERE fromProfileId=? AND toProfileId=? AND createdAt > now() - interval '24 hours'`. This is a **rolling window**, not a calendar-day cap — there is no "midnight reset" (which would require storing the parent's timezone and complicates DST). Exceeding the cap returns a typed `RateLimitedError` (existing class, re-exported from `@eduagent/schemas` via `apps/api/src/errors.ts`); parent UI shows *"You've sent enough encouragement for now — TestKid will see it next time they open the app."* No countdown shown, no timezone-dependent language ("today", "tonight").

**Why this cap:** the project's UX philosophy explicitly rejects surveillance-feel and prefers quiet defaults. 3 per rolling 24h allows real encouragement without drift toward badgering. Adjustable on signal post-launch.

**Consent withdrawal — pending unread nudges:** when a child's `consentStatus` transitions to `WITHDRAWN`, all unread nudges to that child are soft-cleared in the same transaction (`readAt = now()` on every row where `toProfileId = childProfileId AND readAt IS NULL`), and any push notification still in flight for those nudges is suppressed at the receiver-side handler (the kid client checks consent before rendering the banner — if the kid's profile is no longer consented, the banner does not appear and the row is silently dropped from `GET /nudges?unread=true`). This is added to the existing consent-withdrawal Inngest workflow (or wherever the WITHDRAWN transition is committed today). Same handling applies when a `family_links` row is removed.

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

The notice is dismissible, persists state via SecureStore (`mentomate_parent_home_seen`), shown at most once per profile. The new SecureStore key **must be added to the centralized sign-out cleanup list** alongside the keys covered by the cross-account-leak fix (see `MEMORY.md → project_cross_account_leak_2026_05_10.md`). Without this, user A's "I've already seen this notice" flag persists across a sign-out → sign-in by user B on the same device, and user B never sees the orientation cue. The key uses Expo-safe characters (letters + underscores) per `CLAUDE.md` repo guardrails. A regression test in `profile.test.tsx` (or alongside the existing leak break-test) asserts the key is wiped on sign-out.

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
| Parent on Home, taps "Continue your own learning" while in proxy mode | Parent activated proxy mode then returned to Home | The proxy flag is cleared as part of the active-profile-switch (or any navigation back to own surface) before the student-home screen is pushed | Centralized in the navigation helper / `useProfile()` active-profile setter in `apps/mobile/src/lib/profile.ts`, not as a per-tap-handler guard. Any future entry point that returns a parent to their own surface inherits the clear automatically. |
| Withdrawal countdown is active when parent lands on Home | Consent withdrawal pending | `WithdrawalCountdownBanner` renders above the cards | Existing component, no change. |
| Multi-child parent loses one child mid-session (consent withdrawal completes) | Consent state changes from `CONSENTED` to `WITHDRAWN` | The corresponding "See how X", "Read X's report", and "Send X a nudge" cards disappear on next Home render. If they were the only kid, Home reverts to student JTBD picker. | Standard query invalidation; no special handling required beyond ensuring the Home derives card list from live data. |
| Parent hits nudge cap (3 within rolling 24h to one kid) | Parent taps a 4th nudge template | Action sheet stays open; the selected row shows the cap message inline: "You've sent enough encouragement for now — TestKid will see it next time they open the app" | Server returns `RateLimitedError`; client renders the cap copy in the sheet. No countdown UI. **Rolling 24h window**, not midnight-local — copy never says "today" or "tonight" to avoid timezone-dependent language. |
| Kid receives nudge while consent is pending or withdrawn | Parent sends to kid whose `consentStatus` is `PENDING`/`PARENTAL_CONSENT_REQUESTED`/`WITHDRAWN` | Server rejects the nudge with a typed error; parent sees a clear message explaining the kid can't receive nudges until consent is active | Consent gate on `POST /nudges` mirrors the existing dashboard-metrics consent gate. Parent message: "TestKid's consent is pending — encouragement will work once they're set up." |
| Kid has multiple unread nudges queued | Parent sends 2 within the cap; kid hasn't opened the app | Banner on kid's home shows the most recent unread nudge; tapping the banner reveals all unread nudges in a small modal | Banner shows count badge ("2 new") when more than one unread nudge exists. |
| Consent withdrawn while child has unread nudges queued | Kid's `consentStatus` transitions to `WITHDRAWN` (or the `family_links` row is removed) while one or more `nudges` rows are still `readAt IS NULL` for that child | No banner appears on the kid's home; pending pushes are dropped client-side; previously-sent nudges are no longer surfaced | The consent-withdrawal transition (Inngest workflow or wherever WITHDRAWN is committed) bulk-sets `readAt = now()` on all unread nudges to the affected child. The `GET /nudges?unread=true` repo also filters out senders whose `family_links` no longer exists. The kid-side push handler re-checks consent before rendering the banner. |
| Nudge POST fails mid-send (network error, 5xx) | Parent taps a template; request fails before response | Action sheet stays open; row shows a retry-able error message; no false "Sent!" toast (toast is gated on 200 response — non-optimistic) | Standard typed-error middleware. Parent can retry the same template or pick another. No state is mutated on the device. |
| Nudge fires during kid's quiet hours | Parent sends a nudge when kid's local time is outside 07:00–21:00 | Push is suppressed server-side; the `nudges` row is still inserted; the banner appears on the kid's next foreground render the following morning | Server reads the kid profile's stored timezone (falls back to parent's TZ if unset). Quiet-hours window is a server constant in v1, not user-configurable. Parent gets the standard 200 response — they don't see a "delivered later" indication, which preserves the encouragement-not-surveillance framing. |
| Kid acknowledges nudge on one device while a sibling device still shows the banner | Multi-device kid; reads on phone, banner remains on tablet until refetch | Banner persists until the next foreground render (or query invalidation tick) on the second device, then disappears | Standard React Query staleness; not a v1 blocker. Documented so reviewers don't flag it as a leak. |
| Cross-stack push to weekly-report or child detail breaks back-stack | Parent taps "Read X's weekly report" on Home (cross-stack jump from Tabs root → child stack leaf) | Without the ancestor chain, `router.back()` falls through to Home tab's first route instead of the child detail screen | The card tap handler pushes the ancestor chain (`/child/[profileId]` then `/child/[profileId]/weekly-report`) per the repo guardrail in `CLAUDE.md`. The `child/[profileId]/_layout.tsx` exports `unstable_settings = { initialRouteName: 'index' }` as a safety net. The `weekly-report` route is also registered in the Stack in `_layout.tsx` (it currently is not — fix in this PR). |

## Out of scope (explicit)

- **Renaming database/schema concepts** (`isOwner`, `family_links`, `Child*` and `Parent*` schema types). Mentor/Mentee rename is a multi-PR program with regulatory copy implications. Not bundled here.
- **Renaming the AI ("Mentor")** to something else. Decoupled.
- **Multi-Mentor-per-Mentee** (two parents or a parent + grandparent sharing a child) — schema change, deferred.
- **Non-family Mentor relationships** (tutor mentoring an unrelated learner) — product expansion, deferred.
- **Free-text nudges, kid-to-parent replies, voice nudges, scheduled nudges** — see Nudge feature out-of-scope list.
- **Quota / billing changes** if the parent now consumes the family pool more by learning — review post-launch on usage signal.

## Implementation notes (terse)

- Branching key for Home content: linked-children count, computed via `family_links` query for `parentProfileId = activeProfileId`. Not raw `isOwner`. **Required:** add `useHasLinkedChildren()` (and/or `useLinkedChildren()` returning the array) in `apps/mobile/src/lib/profile.ts`. The current LearnerScreen.tsx inline filter is migrated to this hook in the same PR. Both Home and the Progress tab segmented control consume the hook — no inline duplication.
- Parent Home component: new file (or new branch in `home.tsx`), reuses the existing card primitives the student home already uses for visual consistency.
- "Continue your own learning" card: tap handler pushes the existing student-home component as a screen. Component already exists; only the routing is new.
- Family-pool sharing toggle relocation: existing `useFamilyPoolBreakdownSharing` and `useUpdateFamilyPoolBreakdownSharing` hooks are reused; the JSX moves from `family.tsx` into a More-tab settings row.
- `family.tsx` and the `Family` tab entry in the layout are deleted in the same PR. Any test or selector referencing the Family tab updates to reach equivalent destinations via the Home cards or via direct route navigation.
- `WithdrawalCountdownBanner` and `FamilyOrientationCue` (with updated copy) move to render above the parent JTBD cards on Home.
- One-time transition notice: SecureStore key `mentomate_parent_home_seen`. Set on dismiss; checked on parent Home render. **Registered with the centralized SecureStore-cleanup-on-sign-out list** alongside the keys covered by the cross-account-leak fix. Regression test asserts the key is wiped on sign-out.
- Proxy-mode auto-clear: rather than a one-line guard inside the "Continue your own learning" tap handler, centralize the clear in the navigation helper that switches the active profile (or in `useProfile()`'s active-profile setter in `apps/mobile/src/lib/profile.ts`). Any path that returns a parent to their own surface clears `parent-proxy-active`. A targeted guard on a single handler is fragile — other future entry points to "own learning" would each need their own guard and drift is inevitable.
- **Cross-stack navigation from Home cards:** all card tap handlers that target a child-stack leaf (`/child/[profileId]/weekly-report`, future deeper paths) push the **ancestor chain** per `CLAUDE.md` repo guardrails — push `/child/[profileId]` first, then the leaf — never the leaf alone. `child/[profileId]/_layout.tsx` exports `unstable_settings = { initialRouteName: 'index' }` as a one-level safety net.
- **Route registration:** `weekly-report` is currently not declared as a `Stack.Screen` in `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` (the Stack lists only `session`, `report`, `subjects`, `topic`). Add the entry in this PR; verification step below confirms the route renders with correct header + back behavior.
- **Progress tab segmented control**: small new component in the Progress tab layout. Renders only for parents (linked-children count ≥ 1). Reuses existing per-profile progress fetch with a `targetProfileId` argument. Default selected pill = first linked child by `family_links.createdAt`.
- **Nudge feature**:
  - Drizzle migration adds `nudges` table with index `(toProfileId, readAt)`. Committed SQL migration; no `drizzle-kit push` against staging/prod.
  - New API routes under `apps/api/src/routes/nudges/` (POST, GET, PATCH read). Auth uses existing `assertParentAccess` for POST; scoped repo for GET/PATCH on the kid side. POST also enforces the consent gate (`consentStatus === 'CONSENTED'`) on the recipient.
  - **Schema package extension**: `NotificationPayload` discriminated union in `packages/schemas/src/notifications.ts` adds a `'nudge'` variant. The api `notifications.ts` sender adds the matching case. The mobile push receiver adds the matching handler. Cross-package; one PR.
  - Rate limiter: per-(parent, child)-pair counter with **rolling 24h** window. Implementation: SQL `count(*) WHERE fromProfileId=? AND toProfileId=? AND createdAt > now() - interval '24 hours'`. No Redis required. Not midnight-local.
  - **Quiet-hours gate**: server-side, push send is suppressed if the recipient's local time is outside 07:00–21:00. The `nudges` row is still inserted; the banner appears on the kid's next foreground render. Window is a server constant in v1.
  - **Consent withdrawal cleanup**: the existing WITHDRAWN-transition workflow (or wherever the transition is committed today) bulk-sets `readAt = now()` on all unread nudges to the affected child. Same handling on `family_links` row removal.
  - Mobile (parent): action sheet component, tap handler, **non-optimistic** confirmation toast (gated on 200 response). Inline error rendering for rate-limit and consent-pending failures.
  - Mobile (kid): banner component on Home, tap → modal listing all unread nudges, mark-read on dismiss. Banner re-checks consent before rendering.
  - i18n: 4 template strings + banner copy + toast copy + rate-limit message + consent-pending message × 7 locales. Card titles that interpolate child name use locale-specific full-sentence templates, not naive English-shaped strings (see "What changes → i18n").
- **Tests** (the E2E suite alone is insufficient for a backend feature with auth + rate-limit + consent gate):
  - **Integration tests** (Jest, `apps/api/src/routes/nudges/*.integration.test.ts`):
    - `POST /nudges` rate-limit boundary: 3rd nudge in window succeeds (200); 4th rejects with `RateLimitedError`.
    - `POST /nudges` consent gate (negative-path break tests, per `CLAUDE.md` "Security fixes require a break test"): each of `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `WITHDRAWN` rejects with the typed consent error.
    - `POST /nudges` ownership negative-path: parent A cannot nudge parent B's child (`assertParentAccess` rejects with `ForbiddenError`).
    - Quiet-hours suppression: nudge during 22:00–06:59 inserts the row but does not invoke the push sender (assertable via the existing push-mock boundary).
    - Consent withdrawal cleanup: queue 2 unread nudges → withdraw consent → verify `readAt` is set on both rows in the same workflow.
    - `GET /nudges?unread=true` filters out senders no longer in `family_links`.
  - **E2E tests** (parent-journey suite updated):
    - (a) Solo-to-parent transition: solo learner adds first child → Home swaps from student JTBD picker to parent JTBD picker → transition notice shows once → re-launch shows no notice.
    - (b) Parent sends a nudge → kid sees banner on next open → kid dismisses.
    - (c) Parent hits rate cap → inline cap copy shown in sheet (no false-success toast).
    - (d) Progress tab segmented control swap renders correct data per pill.
    - (e) Cross-stack navigation: parent taps "Read X's weekly report" from Home → reaches weekly-report → back arrow returns to child detail (not Home tab root).

## Open questions

1. **Subtitle copy for the "See how X is doing" card** — the live data ("2 sessions this week") is informative but flips between supportive and alarming depending on numbers. Should the subtitle stay neutral ("Tap to see this week's progress") or surface the live snapshot? Recommended: live snapshot when present, neutral fallback when no data. Defer specific phrasing to implementation.
2. **Order of cards when there are multiple children** — alphabetical, by `family_links.createdAt`, or surfacing the most-active child first? Recommended: by `family_links.createdAt` (stable, predictable) for v1. Note the trade-off: a newly-added child is permanently last, which becomes awkward after several adds. Revisit on signal — possible v2 ordering: most-recently-active child first, with a stable secondary sort by `createdAt`.
3. **Visual differentiation between "See how X is doing" and "Read X's weekly report"** — both are about the same child. Distinct icons + distinct color tints to avoid visual sameness. Cosmetic; defer.

## Verification before declaring done

- Visual: screenshot the parent Home (post-redesign) and the student home, side-by-side, to confirm consistent JTBD craft level.
- Behavior walkthrough: solo learner cold-launches → student JTBD picker. Parent cold-launches → parent JTBD picker. Parent taps "See how X is doing" → child detail. Parent taps "Continue your own learning" → student home pushed as screen, back arrow returns. Parent taps weekly-report card → weekly report renders + back arrow returns to child detail (not Home tab root). Solo learner adds first child → tabs unchanged, Home content swaps, transition notice shows once. Re-launch after dismiss → no notice. Sign-out user A → sign-in user B on same device → user B sees the transition notice (not skipped from user A's state).
- Route registration: confirm `weekly-report` is declared in `child/[profileId]/_layout.tsx` and that `unstable_settings.initialRouteName = 'index'` is set on that layout.
- Cross-stack back-stack: from parent Home, tap "Read X's weekly report" → confirm `router.back()` returns to child detail screen, not to Home tab.
- Quiet-hours: send a nudge with the recipient's mocked local time at 23:00 → confirm the row is inserted but the push sender is not invoked.
- Rate-limit boundary: send 3 nudges then a 4th in the same rolling 24h → confirm 4th returns `RateLimitedError` and the action sheet shows the inline cap copy (no false-success toast first).
- Consent gate: attempt `POST /nudges` for a child in each of `PENDING`/`PARENTAL_CONSENT_REQUESTED`/`WITHDRAWN` → confirm rejection.
- Consent withdrawal cleanup: queue unread nudges then transition consent to `WITHDRAWN` → confirm `readAt` is now set on every previously-unread row to that child.
- Tests: integration suite for nudges (rate-limit boundary, consent gate, ownership, quiet-hours, withdrawal cleanup) plus parent-journey E2E (solo-to-parent transition, nudge send, rate cap, Progress segmented control, cross-stack nav). Existing student-home tests unchanged (component is reused, not modified).

## Decision log

- **2026-05-10:** Picked this shape over (a) two-button picker, (b) mixed dashboard (current), (c) "Home = student JTBD for everyone, boot to Family for parents", (d) "promote current Family tab to Home with 5 small tweaks":
  - **(a)** breaks the "Home = home" expectation; user reported it as confusing in their own retrospective.
  - **(b)** is the current state and is the problem this spec is solving.
  - **(c)** downprioritizes the parent identity, which is the paying user's primary identity in this product.
  - **(d)** preserved the navigation reshape but kept a list-of-summaries layout instead of the JTBD craft the student home uses. Inconsistent craft level between user types.
  - **This shape (e) — JTBD picker on parent Home, mirroring student craft, parent intents** — preserves "Home = home" (each user lands on their actual default surface), keeps the parent role primary (top cards are about the kid), keeps "you can learn too" discoverable as one card, and matches the student home's JTBD framing for design consistency.
