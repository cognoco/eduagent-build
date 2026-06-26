# Mentor screen — V1-organization pass

Date: 2026-06-25
Status: approved (live co-design with product owner)
Scope: `LearnerMentorScreen` (the `me`/learner scope of `apps/mobile/src/app/(app)/mentor.tsx`) only.

## Motivation

The V2 mentor tab is the current "mentor page". In use it feels less organized
than the old V1 home, and it has two concrete defects the owner hit:

1. The empty-feed card ("Nothing needs you right now" / "Browse more learning
   options") is a **dead-end** — its tap calls `onShowOverflow`, but when
   `overflowCount === 0` nothing renders, so the button does nothing
   (`NowCardStack.tsx:84-99`).
2. The "ask anything" input is pinned to the **bottom** of the screen with no
   `KeyboardAvoidingView`, so the on-screen keyboard **covers it** while typing
   (`mentor.tsx` root is a plain `View`; `MentorInputBar` is the last child).

The owner also wants the page reorganized toward V1's clearer structure while
keeping the smart now-feed.

## Surface map (what changes, what must NOT)

- **Change:** `LearnerMentorScreen`, and the mentor-only components
  `MentorInputBar`, `NowCardStack`, plus copy in `en.json` (`mentorHome.*`).
  Verified consumers of those three components: `mentor.tsx` only (the supporter
  surface does not import them).
- **Do NOT touch:** `SupportHubMentorTab` (supporter/person scopes), and the
  flag-gated V0/V1 legacy home `LearnerScreen.tsx` (V0-no-regress rule).
- This is a deliberate deviation from the mentor-is-the-app V2 spec, which
  specced ask/capture as a **bottom bar**. Recorded here; a one-line note will be
  added to that spec.

## Target layout (learner scope)

```
 Get help with anything                         ← punchy 1-line title (subtitle dropped)
                                  [On track ✓]   ← On-track chip moved out of header,
                                                   right-aligned above the feed
 ┌─ hero next-step card (prominent, anchor) ──┐  ← unchanged engine (GET /now)
 │  Continue your last session  [Continue][Done]│
 └─────────────────────────────────────────────┘
   secondary next-step cards (tappable)          ← anchor+modules behaviour preserved
   "{N} more options"                            ← overflow link, only when present

 ┌─ Ask anything ─────────────────────────────┐ ← MentorInputBar restyled as an inline
 │ [ Ask, paste, or describe… ] [📷][🎤][HW]    │   titled box, moved UP into the scroll
 └─────────────────────────────────────────────┘   area (fixes keyboard overlap)

 ┌─ Prefer something light? ──────────────────┐ ← unchanged
 │ [Capitals][Guess Who][Vocabulary][Dictation] │
 └─────────────────────────────────────────────┘
```

Removed from this screen: the "learn something new" entry and any subject
carousel (subjects already have their own tab).

## Changes

### 1. `mentor.tsx` — `LearnerMentorScreen`

- Wrap the screen in `KeyboardAvoidingView` (behavior `padding` on iOS,
  `height`/undefined on Android) and make the content a `ScrollView` with
  `keyboardShouldPersistTaps="handled"`. Keep `testID="mentor-screen"` on the root.
- Header: render only the punchy headline (`mentorHome.headline`). Remove the
  subtitle text and remove `OnTrackBadge` from the header row.
- Render `OnTrackBadge` as a compact chip on its own right-aligned row directly
  above the feed, only on the real-feed path (`firstRealState`, not cold-start,
  not the no-feed error state).
- Render `MentorInputBar` (now a box) **inline inside the scroll content**, below
  the feed and above `LightPracticeAffordance`, whenever the screen is usable
  (i.e. not the no-feed retryable-error state). Remove the bottom-pinned instance.
- `LightPracticeAffordance` stays; keep it visible on a thin feed (current
  `showLightPractice || cards <= 1` rule is retained).

### 2. `MentorInputBar.tsx` — bar → titled box

- Container becomes a card: `rounded-2xl border border-border bg-surface p-4`
  (drop the `border-t` bottom-bar styling).
- Add a bold title row using new key `mentorHome.bar.title` ("Ask anything").
- Keep all existing testIDs and behaviour: `mentor-input-bar`,
  `mentor-bar-camera`, `mentor-bar-input`, `mentor-bar-mic` (still disabled),
  `mentor-bar-homework-chip`; same `onSubmitText` / `onOpenCamera` /
  `onOpenHomework` wiring.

### 3. `NowCardStack.tsx` — kill the dead empty card

- When `!anchor && feed.overflowCount === 0`, return `null` instead of the dead
  "Nothing needs you / Browse" `Pressable`. The always-present Ask + Light-practice
  boxes guarantee the screen is never a dead-end. The `overflowCount > 0` branch
  (a real, working overflow link) is unchanged.

### 4. i18n (`en.json` + `pnpm translate`)

- Add `mentorHome.headline` = "Get help with anything".
- Add `mentorHome.bar.title` = "Ask anything".
- Remove `mentorHome.subtitle` (now unused — would trip the reverse-orphan
  checker) from `en.json` and all locale files.
- Remove `mentorHome.empty.title` / `mentorHome.empty.cta` only if no longer
  referenced after the NowCardStack change (verify with the orphan checker).
- Run `pnpm translate`, then `pnpm check:i18n` / staleness to confirm green.

## Tests (update to reflect new reality)

- `mentor.test.tsx`: the "pinned input affordances" test → assert the same
  testIDs are present (now inline). Add: empty feed (`feed([])` with a real first
  state) shows **no** `now-empty-card` and still renders `mentor-input-bar` +
  `mentor-light-practice`. Keep deep-link / rawInput / light-practice / cold-start
  / error tests green.
- `NowCardStack.test.tsx`: empty + `overflowCount === 0` → renders nothing
  (no `now-empty-card`); `overflowCount > 0` still renders the overflow entry.
- `MentorInputBar.test.tsx`: assert the new title; keep behaviour assertions.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Feed empty, no overflow | new/quiet account | Headline + Ask box + Prefer-something-light (no dead card) | Type a question or pick a light activity |
| Feed load error, no cache | API down | Retryable error fallback (unchanged) | Retry / Browse subjects |
| Keyboard open | tap Ask input | Input stays visible above keyboard | n/a (fixed) |

## Out of scope

Supporter/person mentor surfaces; the V0/V1 legacy home; the now-feed ranking
engine; voice (mic stays disabled as today).
```
