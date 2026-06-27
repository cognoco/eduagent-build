# Handoff: EduAgent UI improvements (Home, Session, Parent Dashboard)

## Overview

Three high-leverage screens of the EduAgent mobile app are getting a substantial redesign. The goal is to close the gap between the product spec ("a coach who has already done the thinking") and the current UI (a chat app with shortcut tiles), **while preserving predictability** — the home screen is opened multiple times per day, so it must have a stable, scannable spine, with the AI's voice surfacing only when there's a real recommendation.

This handoff covers:
- **Learner Home** (`apps/mobile/src/components/home/LearnerScreen.tsx` + `IntentCard.tsx`) — implement **Direction C / Hybrid** (recommended)
- **Session screen header & composer** (`apps/mobile/src/components/session/ChatShell.tsx`)
- **Parent Dashboard** (`apps/mobile/src/app/(app)/dashboard.tsx` + `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`)

The HTML mock (`UI improvements.html`) shows three Home directions side-by-side: **A (current)**, **B (opinionated coach hero — north star, not for shipping)**, **C (recommended)**. Build C. B is included only as a directional reference for what the coach band's voice should feel like when it does fire.

## About the design files

The files in this bundle (`UI improvements.html`, `screens.jsx`, supporting starters) are **design references created in HTML** — prototypes showing intended look and behavior. They are **not production code to copy directly**.

Your task is to **recreate these designs inside the existing EduAgent React Native + NativeWind environment**, reusing established patterns:
- Tailwind/NativeWind classes and the design tokens defined in `design-tokens.ts` / `global.css`
- Existing primitives (`Pressable`, `View`, `Text`, `ScrollView`, `FlatList`)
- Existing icon library (`@expo/vector-icons` Ionicons)
- Existing hooks (`useDashboard`, `useSubjects`, `useLearningResumeTarget`, `useReviewSummary`, `useThemeColors`, `useRecoveryMarker`, etc.)
- Existing routing conventions (`expo-router`)
- Existing testIDs convention (so e2e tests keep passing)

## Fidelity

**High-fidelity for layout, hierarchy, color usage, and interaction patterns.** Exact pixel measurements in the HTML are illustrative — translate them to NativeWind utility classes and the project's existing spacing scale. The semantic intent (what's primary vs. secondary, what's grouped, what colors mean) is the contract; pixel-perfect parity to the HTML mock is not.

The HTML mocks were rendered at ~360×740. The real app must work across iPhone SE (375×667) up to large Android phones, plus RN Web. Use existing safe-area handling (`useSafeAreaInsets`) and keyboard-avoidance patterns.

---

## Screen 1 — Learner Home (LearnerScreen.tsx) — Direction C

### Purpose
Open-the-app moment for a learner. Today shows a vertical stack of 4–6 IntentCards with identical visual weight. The redesign makes the screen **predictable** (the subject carousel is the spine) and **opinionated where it earns the right to be** (a conditional coach band when there's a real recommendation).

### Layout (top to bottom)

1. **Status bar / safe area top inset** — unchanged.

2. **Greeting row** (replaces the current 22pt full-width greeting block)
   - Left: `Hey {name}!` at 22px bold + small subtitle "Tuesday evening" at 13px `text-text-secondary`. Use existing `getGreeting` for the time-of-day part.
   - Right: existing `<ProfileSwitcher>` — keep as-is, just shrink to 36×36 and add a 1.5px primary-color ring around the avatar.
   - Padding: `px-5 pt-1 pb-2`.

3. **Coach band** — CONDITIONAL. Renders only when at least one of these has a value, in this precedence: `recoveryMarker > resumeTarget > reviewSummary.totalOverdue > 0`. Hidden on cold start and when nothing's overdue.
   - Card: `rounded-2xl`, soft teal-to-purple gradient background (`linear-gradient(135deg, rgba(45,212,191,0.20), rgba(167,139,250,0.10))`), 1px border `rgba(45,212,191,0.25)`, `p-4`, `relative`.
   - Top eyebrow: `💡 TONIGHT` — 10px bold uppercase, `text-primary`.
   - Headline (one sentence, authored by the coaching layer): `Revisit {topic} — you were close on Thursday.` Topic word is `text-primary`. 17px bold, line-height 1.3.
   - Below the headline, on the same row: a real **Continue** button (not a chip) — `bg-primary` text-inverse, `rounded-xl`, `px-4.5 py-2.75`, 14px bold; followed by tiny "4 min" caption in `text-text-tertiary`.
   - Top-right: small `×` dismiss control (8×8 hit target, treat as informational dismissal — same semantics as the existing `markCoachingCardDismissed`).
   - Sentence fallbacks (in precedence order):
     - `recoveryMarker` → "Pick up where you stopped in {topic}."
     - `resumeTarget` → "Pick up where you left off in {topic}."
     - `reviewSummary.totalOverdue > 0` → "Revisit {fadingTopic} — you were close on {dayName}."
   - testID: `home-coach-band`. Continue button: `home-coach-band-continue`.

4. **Subject carousel** (NEW — the predictable spine; always present)
   - Section label: `YOUR SUBJECTS` — caption, 11px bold uppercase, `text-text-tertiary`, letter-spacing 0.5, padding-left 4.
   - Horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`, gap 12, padding `px-5`.
   - **Card width 142px** — chosen so two cards fit comfortably in a 360px viewport with a small peek of the third, signaling "more to scroll." Increase only if you confirm two-cards-plus-peek still holds on iPhone SE.
   - Each subject card: `rounded-2xl`, `bg-surface`, `border border-border`, height ~150px, `p-3.5 pb-4`, vertical stack with gap 10:
     1. **Tinted icon tile** — 38×38 rounded square with the subject's tint background at ~18% alpha and the subject's icon (Ionicons) at the tint color full alpha.
     2. **Subject name** — 15px bold, `text-text-primary`.
     3. **Continuation hint** — 11px `text-text-tertiary`. Tells the kid the verb, not the inventory: e.g. "Continue Linear equations" / "Quiz: Photosynthesis" / "Practice: Past tense". Source priority:
        - If subject has an active session → "Continue {topic}"
        - Else if subject has overdue reviews → "Quiz: {topic}"
        - Else if subject has a recently-introduced topic → "Practice: {topic}"
        - Else fallback "Open"
     4. **Progress bar** — height 4, rounded, single subject-tint color filling N% of an `bg-surface-elevated` track. The percentage represents momentum through the current arc (e.g. topics introduced ÷ topics in subject), NOT retention. Retention diagnostics live in Library and Dashboard.
   - **+ New subject** tile at the end of the carousel — same height as a real card, ~96px wide, `rounded-2xl`, dashed `border-border`, vertical stack with `+` glyph (20px) and "New subject" label (12px bold, `text-text-tertiary`). Tapping routes to `/(app)/create-subject`. testID: `home-add-subject-tile`.
   - Subject tints: define `subject-tint-1` … `subject-tint-N` in `design-tokens.ts` (deterministic mapping by subject ID hash, or pull from a curated palette). Suggested base palette: teal `#2dd4bf`, purple `#a78bfa`, amber `#eab308`, blue `#60a5fa`, rose `#f472b6`. Don't reuse retention colors.
   - testID per card: `home-subject-card-{subjectId}`. Carousel root: `home-subject-carousel`.

5. **Ask-anything composer** (NEW — chat-shaped input, NOT a button)
   - Looks like a chat composer, not a search bar. Tapping it routes to `/(app)/session?mode=freeform&prefill={text}`.
   - Card: `rounded-2xl`, `bg-surface`, `border border-border`, `pl-4 pr-1.5 py-2.5`, horizontal flex with gap 8.
   - Inside: 14px chat icon (`Ionicons "chatbubble-ellipses-outline"`), placeholder `"Ask anything…"` at 13px `text-text-tertiary`, then a 32×32 round mic button (`bg-surface-elevated`) on the right. Long-press mic → enter voice mode straight into the freeform session (matches the new ChatShell composer pattern).
   - Padding around the row: `px-5 pt-3 pb-1.5`.
   - testID: `home-ask-anything`.

6. **Three action buttons** (Study new · Homework · Practice)
   - 3-column equal grid, gap 8, padding `px-5 pt-1.5 pb-3`.
   - Each tile: 14px radius, `bg-surface`, `border border-border`, vertical stack — 20px icon (Ionicons), 11px bold label `text-text-secondary`.
   - Routes:
     - `Study new` → `/(app)/create-subject`. Same destination as the carousel's `+ New subject` tile — that's intentional redundancy because new-subject-discovery was a real problem in the current design.
     - `Homework` → `/(app)/homework/camera`.
     - `Practice` → existing Practice intent route.
   - testIDs: `home-action-study-new`, `home-action-homework`, `home-action-practice`.
   - Drop the existing `intent-ask` testID — Ask is now the chat composer above, with testID `home-ask-anything`.

7. **Bottom tab bar** — unchanged.

### Things being removed from the current Home

- The `IntentCard` stack (six full-width cards with `border-l-4` left accent). The teal left-stripe-on-every-card pattern flattens hierarchy and is a generic Bootstrap-era idiom.
- The full-width "Continue" `IntentCard` — its job is now done by the coach band's Continue button.
- The full-width "Try the new daily quiz" `CoachingCard` — its job is now folded into the coach band when relevant. Keep the `markQuizDiscoverySurfaced` machinery; it just gets called via the band's lifecycle.
- The "Good evening, Sam" + "Ready for a quick session?" stack — replaced by the smaller greeting row.
- `EarlyAdopterCard` — moves to a less prominent position (e.g. shown once-per-week as a small banner inside the coach band's slot when the band is otherwise empty, OR behind a "What's new" entry in the More tab). Confirm with product before changing this.

### Behavior changes vs. current

- `recoveryMarker > resumeTarget > reviewSummary` precedence is preserved — it now drives whether the **coach band renders at all**, plus what its sentence says.
- `isParentProxy` case (parent viewing child's profile): hide the coach band and the ask-anything composer; keep the subject carousel as read-only (no Continue affordance, tap routes to subject detail not session); keep the existing "Sessions are private to {child}" placeholder elsewhere on the screen.
- Cold-start (no subjects yet) state: hide the coach band; the carousel shows ONLY the `+ New subject` tile, expanded to ~280px wide with a friendlier "Add your first subject" copy. The three action buttons stay; "Study new" is the primary entry.

### Typography & color reference

```
Greeting name      22px / 700 / line-height 1.2 / text-text-primary
Greeting subtitle  13px / 400 / text-text-secondary
Coach band eyebrow 10px / 700 / uppercase / letter-spacing 0.5 / text-primary
Coach band copy    17px / 700 / line-height 1.3 / text-text-primary (topic = text-primary)
Continue button    14px / 700 / text-text-inverse / bg-primary
Section label      11px / 700 / uppercase / letter-spacing 0.5 / text-text-tertiary
Subject card name  15px / 700
Subject hint       11px / 400 / text-text-tertiary
Action label       11px / 700 / text-text-secondary
```

### testID inventory for Home

Keep:
- `home-screen` (root)

Add:
- `home-coach-band` + `home-coach-band-continue` + `home-coach-band-dismiss`
- `home-subject-carousel`
- `home-subject-card-{subjectId}`
- `home-add-subject-tile`
- `home-ask-anything`
- `home-action-study-new` / `home-action-homework` / `home-action-practice`

Drop:
- All current `intent-*` testIDs except where they map onto the new actions above (e.g. `intent-homework` becomes `home-action-homework`).
- `early-adopter-card` (only if/when it's relocated).

---

## Screen 2 — Session header & composer (ChatShell.tsx)

### Purpose
Make the engine's existing pedagogical state (escalation rungs, exchange budget, verification signals from the LLM envelope) visible inside the session, and reclaim vertical space when the keyboard is open.

### Header changes

Replace the current `title / "I'm here to help"` subtitle with an **escalation-rung strip**:

- Title row: chevron-back, then 14px bold session title, then existing right-side actions (overflow menu, voice toggle).
- Subtitle row (replaces "I'm here to help"): a small monospace caption with the engine's current state, e.g.
  ```
  RUNG 2 · BUILDING · 2 of 4 exchanges
  ```
  - `RUNG {n}` maps directly to the engine's escalation rung counter (1–5 per the engineering rules).
  - `BUILDING` / `RECALL` / etc. is the rung's pedagogical phase label.
  - `2 of 4 exchanges` reflects `MAX_INTERVIEW_EXCHANGES` / current count from the structured response envelope state.
  - Style: 10px, `text-text-tertiary`, monospace, letter-spacing 0.3.
- This is **not new state** — it's surfacing fields the engine already maintains. No new selectors needed beyond exposing them on the existing session view-model.
- New optional prop on `ChatShell`: `pedagogicalState?: { rung: 1|2|3|4|5, phase: string, exchangesUsed: number, exchangesMax: number }`. When absent, fall back to the current subtitle (so other consumers of `ChatShell` keep working).

### NEW — Memory chip below header

A thin row, `bg-surface rounded-xl px-3 py-2`, containing:
- 6×6 dot in `accent` color
- 12px text, `text-text-secondary`, e.g. "Last week you mixed up the sign — I'll watch for that."
- Source: a new optional `memoryHint?: string` prop on `ChatShell`. Populated by the session controller from the topic's prior-struggle data on the profile.
- Hidden when `memoryHint` is null/empty.
- testID: `chat-memory-hint`.

### NEW — Verification badge under AI bubbles

`MessageBubble` already accepts a `verificationBadge` prop. Surface it visually as:
- A 10px uppercase chip below the bubble in `text-success`, no background, just `✓ {SIGNAL_LABEL}`.
- Map the LLM envelope signals to labels:
  - `evaluate` → `THINK-DEEPER CLEARED`
  - `teach_back` → `TEACH-BACK CLEARED`
  - (extend as new envelope signals are added — the badge is one renderer for many signals)
- Already routed via prop; just style consistently and ensure the session controller passes the right signal name.

### Composer changes (high impact — already partly shipped)

**The `hideInputModeToggle` prop already exists (BUG-887)** and represents the codebase's own conclusion that the persistent Text/Voice toggle row is bloat. **Make it the default**, then remove the row entirely once stakeholders confirm. Reclaim ~50px.

Replace with: **mic button moved INTO the input pill**, beside Send.

```
[ rounded input pill ─────────────────────────  🎤  ➤ ]
```

- Input pill: `bg-surface rounded-3xl px-4 py-1.5 border border-border`, height ~48.
- Inside: `TextInput` (flex-1), then 36×36 round mic button (`bg-surface-elevated`), then 36×36 round send button (`bg-primary` when `input.trim()`, else `bg-surface-elevated`).
- Long-press on mic switches to dedicated voice mode (full transcript preview); short tap = push-to-talk.
- All existing voice state machinery (`isListening`, `pendingTranscript`, `VoicePlaybackBar`, `VoiceTranscriptPreview` discard/re-record flow, error states) is preserved — only the **mode toggle UI** is removed. Mode is inferred from gesture.
- The header-level `VoiceToggle` (existing) stays — it's the explicit "switch to dedicated voice mode for this whole session" affordance.

### Behavior changes vs. current

- **Critical: keep all `isFocused` / RN-Web duplicate-mount guards exactly as-is** (BUG-886). Any composer redesign must preserve the `isFocused` checks, `pointerEvents` / `aria-hidden` / `tabIndex` treatments.
- Keep `keyboardShouldPersistTaps`, `KeyboardAvoidingView` behavior, and `paddingBottom: Math.max(insets.bottom, 8)` rule.
- Preserve the existing accessibility tree (`accessibilityLabel`, `accessibilityRole`, screen-reader-suppressed TTS).
- **Keep existing animations** — `LightBulbAnimation` while streaming and `MagicPenAnimation` on idle. They read as earned ornaments. Don't replace them with chrome.
- testIDs to keep: `chat-input`, `send-button`, `chat-shell-back`, `voice-listening-indicator`, `voice-error-indicator`, `chat-messages`. Drop: `input-mode-toggle`, `input-mode-text`, `input-mode-voice`. Add: `escalation-rung-strip`, `chat-memory-hint`.

---

## Screen 3 — Parent Dashboard (dashboard.tsx)

### Purpose
A parent opens this screen to answer one question — "is my kid actually learning?" Today the answer is buried inside narrative paragraphs in two card components, while the API already returns the data needed for a one-glance answer. The redesign leads with the answer and uses the retention palette as the visual spine.

### Layout (top to bottom)

1. **Slim header row**
   - Left: `‹ Home` text link (replacing the current "← Back" + giant H1 + subtitle stack).
   - Right: small uppercase `THIS WEEK` chip.
   - Padding: `px-5 pt-2`.

2. **Headline answer block** (NEW — replaces the current title + subtitle)
   - Eyebrow caption: e.g. `BOTH KIDS` (or the child's name when only one child).
   - Big sentence: `<X> min learned, <Y> topics stuck.` — the two numbers colored `text-success` (or `text-retention-weak` if Y is concerning, threshold ≥ 3).
   - One-line context: "Up 18 min from last week. Maya's leading."
   - Type: 28px bold for the sentence. Numbers stay inline, NOT in stat boxes.
   - Padding: `px-5 pb-3`.
   - All numbers come straight from existing `ParentDashboardSummary` fields: `progress.topicsMastered`, `weeklyDeltaTopicsMastered`, `engagementTrend`, per-subject `retentionStatus` rolled up. No new API needed.

3. **Per-child card** (replaces `ParentDashboardSummary` layout)
   - 18px radius, `bg-surface`, `p-4`.
   - Top row: 40×40 round avatar with initial → name + age + "subjects · last seen X" subtitle (12px muted) → right-aligned `{mins}m` (18px bold) and `+{delta} vs last wk` (11px, success color).
   - **Retention bar** (NEW — the visual spine):
     - Horizontal stacked bar, height 8, radius 4.
     - Three segments sized proportionally to topic counts: strong (`retention-strong`), fading (`retention-fading`), weak (`retention-weak`).
     - Below it, three legend items in a row: dot + count + label, with total on the right.
   - **Action row** (conditional): when `weakCount > 0`, render a soft-orange row inside the card:
     - `bg: rgba(249,115,22,0.1)`, `rounded-xl`, `px-3 py-2.5`.
     - Left: `<weakCount> topic stuck.` in `retention-weak` bold + the topic title in muted text.
     - Right: `Open ›` in `retention-weak` bold.
     - On tap: navigate to existing `/(app)/topic/relearn` route (already wired).
     - testID: `dashboard-action-{childId}`.
   - When `weakCount === 0`, omit the action row entirely. Do not show celebratory filler.

4. **Empty / error / loading states**: keep existing logic (`CardSkeleton`, `dashboard-empty`, retry button) — they're already solid. Restyle the skeleton to match the new card shape (top row + thin bar + 3 dots).

### Important guard
The `isParentProxy` case (parent viewing a child's profile in proxy mode) still shows only the existing "Sessions are private to {name}" placeholder — this redesign affects the rollup view only.

### Data sourcing
All numbers already come from `useDashboard()`. The retention bar needs counts of topics by status per child — compute on the client from the `subjects[].retentionStatus` array already returned. Counts:
- `strong` = topics with `retentionStatus === 'strong'`
- `fading` = topics with `retentionStatus === 'fading'`
- `weak` = topics with `retentionStatus === 'weak'` OR `'forgotten'` (treat as one urgent bucket for parent view; keep distinction in the child detail screen)

---

## Cross-cutting principles

Apply these whenever you touch other screens:

1. **Predictable spine, opinionated voice when earned.** Stable structure (lists, carousels) is the bedrock; the AI's voice surfaces in conditional bands when it has something specific to say. Never let the AI's voice replace the structure.
2. **Show, don't promise.** Replace "I remember you" copy with a memory chip surfacing a real recalled fact.
3. **Retention palette is the brand — but contained.** `retention-strong` / `retention-fading` / `retention-weak` / `retention-forgotten` is the legend across Library and Dashboard, where the diagnosis matters. On Home, the legend is **absent** — Home shows momentum (subject-tinted progress bar) and at most a single "needs review" flag. Don't pour the diagnostic palette over surfaces where it just adds visual noise.
4. **Numbers over narrative.** Dashboards are scannable, not readable. Long copy can live in tap-to-expand.
5. **Reclaim space when keyboard is up.** Composer takes priority. Toggles, mode-pickers, breadcrumbs collapse or move into the input itself.
6. **Earned ornament.** Existing animations (magic-pen, light-bulb, page-flip) appear as rewards or micro-context — never as ambient decoration.
7. **Drop the `border-l-4` accent pattern.** Rank cards by size, color, elevation — not by a colored stripe on every card.

---

## Design tokens (already exist in your codebase — listed here for reference)

```
Surfaces       background, surface, surface-elevated
Text           text-primary, text-secondary, text-tertiary, text-inverse, muted
Brand          primary (#2dd4bf), primary-soft, secondary (#a78bfa), accent
Semantic       success, warning, danger, info
Retention      retention-strong, retention-fading, retention-weak, retention-forgotten

Radius         card (16), button (12), input (10), pill (24 — new, for the composer)
Type           display 32, h1 24, h2 20, h3 18, body 16, body-sm 14, caption 12
Font           AtkinsonHyperlegible (already loaded)
```

**New tokens to add:**
- `subject-tint-1` … `subject-tint-N` for the per-subject card icon tile and progress bar. Suggested base palette: teal `#2dd4bf`, purple `#a78bfa`, amber `#eab308`, blue `#60a5fa`, rose `#f472b6`. Mapped deterministically by subject ID hash.
- (Optional) `coach-band-gradient` — packaging the teal→purple gradient used by the Home coach band and (potentially) the Session memory chip.

No other new colors needed.

---

## Files to read in this handoff bundle

- `UI improvements.html` — full visual comparison (open in a browser to navigate the design canvas). Section 02 shows three Home directions; build C.
- `screens.jsx` — the React components rendering each Before / After mock; useful for reading exact layout intent.
- `design-canvas.jsx`, `ios-frame.jsx` — supporting starters used by the HTML mock; ignore for implementation.

## Files to modify in the EduAgent codebase

- `apps/mobile/src/components/home/LearnerScreen.tsx` — substantial restructuring (carousel + coach band + ask + actions).
- `apps/mobile/src/components/home/IntentCard.tsx` — likely retire or rename. New components needed: `CoachBand`, `SubjectCard`, `AskAnythingComposer`, `HomeActionTile`.
- `apps/mobile/src/components/session/ChatShell.tsx` — header subtitle becomes the rung strip; add memory hint chip; composer pill becomes inline-mic; remove input-mode-toggle row (make `hideInputModeToggle` the default).
- `apps/mobile/src/components/session/MessageBubble.tsx` — restyle the verification badge per spec, mapping LLM envelope signals to labels.
- `apps/mobile/src/app/(app)/dashboard.tsx` — replace title block with headline-answer block.
- `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx` — replace narrative card with retention-bar card.

## Suggested implementation order

1. **Dashboard headline + retention bar** — smallest blast radius, highest parent-facing impact, all data already available.
2. **Home subject carousel + ask-anything composer + 3 action buttons** — the predictable spine. Ship without the coach band first; verify cold-start and isParentProxy cases work.
3. **Home coach band** — additive on top. Behind a feature flag for the first week so the precedence logic can be tuned with real telemetry.
4. **Session escalation-rung strip + memory chip** — additive props on `ChatShell`; safe to ship behind a flag.
5. **Composer mic-in-pill + remove toggle row** — most behavioral risk. Feature-flag and dogfood for at least a week before removing the toggle row entirely. Pay particular attention to RN-Web (BUG-886) and the `VoiceTranscriptPreview` discard/re-record flow.

## What NOT to build

- **Direction B (the opinionated coach hero)** is in the HTML for reference only — it's the north star for what the coach band's voice should feel like, not a separate screen to ship. Implementing it as Home would be too brittle for cold-start and "I want to start something new" use cases.
- The original earlier draft of Direction C had multi-color retention bars on each subject card, plus topic counts. That was replaced because the unlabeled stoplight bars added decode cost without action. **Don't reintroduce them on Home** — diagnostic retention belongs in Library and Dashboard.
