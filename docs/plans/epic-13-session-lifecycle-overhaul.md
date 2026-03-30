# Epic 13: Session Lifecycle Overhaul — Honest Time, Learning Milestones, Graceful Close

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Status:** Spec complete, priority TBD (pre-launch recommended — parent dashboard trust)

---

## Problem Statement

The current session lifecycle has four problems:

### 1. Fake study time
`durationSeconds` is calculated as `now - startedAt` (wall-clock time). A child who opens a session, walks away for 2 hours, then taps "End Session" shows 2 hours of "study" on the parent dashboard. This erodes parent trust — the core metric they see is a lie.

### 2. Silent app close = orphaned sessions
If the child swipes the app away or the OS kills it, the session stays `status: 'active'` forever in the database. `endedAt` is null, `durationSeconds` is null. The parent sees a session with no duration. The child never sees the completion celebration or summary screen.

### 3. Hard caps are hostile
The server computes `hard_cap` (20 min for teens, 30 min for others) but the mobile client never acts on it. If it did, it would forcefully end a session mid-thought. Hard caps punish engagement. Screen time is a parental OS-level concern, not something the tutoring app should enforce.

### 4. The timer rewards clock-watching, not learning
`SessionTimer` is a plain `MM:SS` counter. It communicates nothing about what matters — the quality of the learning, not the quantity of minutes.

---

## Design Principles

- **Active time, not wall-clock time.** Only count time when the child is actually interacting — but use a generous threshold that respects thinking, reading, and paper-and-pencil work.
- **The child decides when they're done.** No hard caps. No nudges. No warnings.
- **Celebrate learning, not clock time.** Milestone animations fire when the child demonstrates independent thinking, breakthroughs, or mastery — not when a timer hits a round number.
- **Graceful degradation.** App close, crash, or background should save state — the child never loses work.
- **Parent sees honest data, child sees encouragement.** The parent dashboard shows active learning time. The child's summary celebrates what they achieved, not how efficiently they used their time.
- **Don't interrupt thinking.** Silence detection should respect deep thought. Only prompt when the child is likely stuck, not just quiet.

---

## Functional Requirements

### FR210: Active Time Tracking

- **FR210.1:** Active time is computed as the sum of intervals between consecutive message events (user or AI), where each interval is capped at the silence threshold (**8 minutes**). If 15 minutes pass between two messages, only 8 minutes count. The 8-minute cap respects that real learning involves reading explanations, working problems on paper, and thinking quietly — activities that look like "silence" to a computer but are genuine engagement.
- **FR210.2:** The formula: for each pair of consecutive events `(e[i], e[i+1])`, active time += `min(e[i+1].timestamp - e[i].timestamp, SILENCE_CAP_SECONDS)`. The first event's active time starts from `sessionStartedAt`.
- **FR210.3:** `durationSeconds` in the `learningSessions` table stores **active time**, not wall-clock time. This is a semantic change — the column name stays the same but the meaning changes.
- **FR210.4:** A new column `wallClockSeconds` (nullable integer) stores the raw `endedAt - startedAt` for analytics. This preserves the ability to compare active vs total time.
- **FR210.5:** The mobile `SessionTimer` component continues to show wall-clock elapsed time during the session (the child sees how long they've been sitting).
- **FR210.6:** The `SessionSummaryScreen` does **NOT** show "focused time" or "active time" to the child. The child sees only wall-clock time, framed positively: "**45 minutes** — great session!" The active vs wall-clock distinction is a parent-only metric. Showing both numbers to the child creates guilt ("what was I doing for the other 20 minutes?") and hands the parent an interrogation tool ("you say 45 but the app says 25").
- **FR210.7:** The parent dashboard shows active time labeled "X minutes active learning." The child's summary shows wall-clock time labeled "X minutes." Different audiences, different needs. The parent gets honest data; the child gets encouragement.

### FR211: Graceful Session Close on App Background/Kill

- **FR211.1:** The mobile session screen saves a crash recovery marker to `AsyncStorage` **on every message send** (after each exchange completes). This is simpler than a timed checkpoint interval, requires no new API endpoint, and covers the actual crash scenario: if the app dies, the last exchange is the recovery anchor.
  - Recovery marker contains: `{ sessionId, exchangeCount, lastActivityTimestamp, savedAt }`.
  - AsyncStorage write is local and fast — no network dependency.
- **FR211.2:** The mobile session screen also listens to `AppState` changes. When the app transitions to `background` or `inactive`:
  - Write the recovery marker to AsyncStorage (in case the last exchange write was missed).
  - No network call needed — the server's `lastActivityAt` was already updated by the last exchange endpoint.
- **FR211.3:** When the app returns to `foreground` with an active session:
  - If the session was backgrounded for less than 30 minutes: resume seamlessly, show a "Welcome back" toast.
  - If backgrounded for 30+ minutes: auto-close the session server-side, show the summary screen on next open.
- **FR211.4:** On app cold start, check `AsyncStorage` for crash recovery markers. If a marker exists for a session that is still `status: 'active'` on the server:
  - Close the session server-side with `durationSeconds` computed from session events.
  - Show a quiet "You have an unfinished session" card on the home screen — **not** a blocking banner. The child may have deliberately quit. Don't assume they want to continue; let them tap the card if they're interested.
- **FR211.5:** The Inngest `session-completed` chain already handles the post-close processing (XP, retention, embeddings). Crash-recovered closes trigger the same chain.
- **FR211.6:** Stale session cleanup: an Inngest cron function runs every 10 minutes, finds sessions where `lastActivityAt` is older than 30 minutes and `status = 'active'`, and closes them. This catches sessions where the client never came back (app uninstalled, phone died, etc.).

### FR213: Remove Hard Caps

- **FR213.1:** Remove `hardCapSeconds` from `SessionTimerState`. Remove the `hard_cap` action from `TimerCheck`.
- **FR213.2:** Remove `TEEN_HARD_CAP_SECONDS` and `ADULT_HARD_CAP_SECONDS` constants.
- **FR213.3:** Remove `TEEN_NUDGE_SECONDS` and `ADULT_NUDGE_SECONDS` constants. No age-based timer differentiation.
- **FR213.4:** Keep `silenceThresholdSeconds` (8 min) and `autoSaveThresholdSeconds` (30 min) — these detect inactivity, not limit engagement.
- **FR213.5:** The `nudge` action is removed. Replaced by learning milestone celebrations (FR214) which are positive reinforcement, not warnings.
- **FR213.6:** `checkTimers()` is simplified to only return: `continue`, `silence_prompt`, or `auto_save`.

### FR214: Learning Milestone Celebrations

- **FR214.1:** The session screen tracks learning quality metrics from exchange metadata (escalation rung) and triggers brief, non-intrusive celebration animations when the child demonstrates independent thinking or breakthroughs. Each milestone triggers only once per session. **Milestones celebrate learning achievements, not time spent.**

- **FR214.2:** Milestone schedule:

  | Milestone | Name | Trigger | Animation | Duration |
  |-----------|------|---------|-----------|----------|
  | 1 | Polar Star | First independent answer — AI response at escalation rung 1-2 (Socratic/hint level, no direct teaching needed) | A single star grows from the timer area, pulses gently, settles as a small persistent glow | ~2.5s |
  | 2 | Twin Stars | Independent streak — 3 consecutive AI responses at rung 1-2 (child is thinking through problems without hand-holding) | Two stars expand from the timer, burst outward with a sparkle trail | ~3s |
  | 3 | Comet | Breakthrough — escalation rung drops from 3+ to 1-2 within the session (child went from needing direct teaching to getting it independently — the "aha" moment) | A comet streaks across the header with a glowing tail and particle trail | ~3.5s |
  | 4 | Orion's Belt | Mastery streak — 5 consecutive AI responses at rung 1-2 (sustained independent thinking, rare and genuinely impressive) | Three stars light up in sequence (Orion's Belt pattern), connected by a faint constellation line, with a subtle shimmer | ~4s |

- **FR214.3:** Animations are non-blocking — the child can keep typing during the animation. Animations overlay the header area, never obscure the chat input or message list.
- **FR214.4:** After each milestone animation completes, a small persistent indicator remains near the timer (earned star dots) so the child can see their achievements. Maximum 4 indicators (one per milestone).
- **FR214.5:** Animations respect `useReducedMotion()` — if the user has reduced motion enabled, show a static icon change instead of the animation (e.g., a star icon appears next to the timer).
- **FR214.6:** The milestones reached are included in the session close payload and stored in `learningSessions.metadata.milestonesReached: string[]` (array of milestone names, e.g., `["polar_star", "twin_stars", "comet"]`). This feeds into coaching card generation ("You had a breakthrough in Math yesterday — you earned a Comet!").
- **FR214.7:** A child who is struggling (rung 3+ throughout) still has a good session — they're learning. The absence of milestones is not a failure indicator. No negative feedback or "you didn't earn any stars" messaging. The milestones are a bonus, not a scorecard.
- **FR214.8:** The escalation rung is available in the streaming response metadata, which the client already tracks. No new API data needed.

### FR218: Session Type and Age Universality

- **FR218.1:** In-session milestones (rung-based) trigger in **all session types**: learning, homework, practice, interleaved. The escalation rung is present in every exchange regardless of mode. A breakthrough is a breakthrough whether it's homework or free learning.
- **FR218.2:** Post-session celebrations (topic mastered, EVALUATE/TEACH_BACK success, streaks) trigger for all session types that go through the session-completed Inngest chain. All session types use the same chain — homework included.
- **FR218.3:** Milestone earned indicators display in a fixed header position that works regardless of session mode config. Homework sessions show `showTimer: false` + `showQuestionCount: true` — indicators go next to the question counter (or in a dedicated header slot) instead of next to the timer. The animation overlay covers the full header in all modes.
- **FR218.4:** Celebrations work for **all ages** (child, adolescent, adult). The celestial theme is age-neutral by design (astronomy, not cartoons). The animation is the same; the **toast copy adapts by age bracket** using the same `getAgeVoice()` mechanism:
  - Child (<13): "You had a breakthrough! ⭐"
  - Adolescent (13-17): "Breakthrough — you figured it out!"
  - Adult (18+): "Breakthrough — concept clicked."
- **FR218.5:** Adults without `familyLinks` never see parent dashboard celebrations (no parent dashboard exists for them). Their own celebrations appear on their home screen like anyone else's.
- **FR218.6:** Celebration preferences: a toggle on the More screen: **"Show learning celebrations: On/Off"** (default: On). Respects user autonomy — an adult who finds animations distracting can turn them off, a parent who wants fewer interruptions for their child can too. When off, milestones are still tracked in session metadata (for coaching cards) — only the animation is suppressed.

### FR215: Parent Dashboard — Honest Active Time

- **FR215.1:** `totalTimeThisWeekMinutes` and `totalTimeLastWeekMinutes` in the dashboard now reflect active time (`durationSeconds` which stores active time per FR210.3).
- **FR215.2:** Sessions that were crash-recovered (FR211.4) have their active time computed from session events, not wall-clock to crash time.
- **FR215.3:** Sessions with `durationSeconds = null` (legacy orphaned sessions from before this change) are excluded from time calculations. They still count in `sessionsThisWeek` count but contribute 0 minutes.
- **FR215.4:** The parent dashboard label changes from "X minutes" to "X minutes active learning" to make the metric semantically clear.

### FR216: Silence Detection UX

- **FR216.1:** Silence detection is **context-aware**. The system only prompts when the child is likely *stuck*, not just *thinking*:
  - If the **AI's last message was a question** (ended with `?`) and the child is silent for 8 minutes → prompt: "Still working on it? Take your time — I'm here when you're ready."
  - If the **AI's last message was an explanation** (didn't end with `?`) and the child is silent → no prompt. They're probably reading, thinking, or working on paper. Let them be.
- **FR216.2:** The silence prompt is sent at most once per silence period. If the child remains silent after the prompt, no further prompts until they send a message and then go silent again.
- **FR216.3:** The silence prompt does NOT count as an "exchange" for exchange count purposes. It's tracked as `eventType: 'system_prompt'` in sessionEvents.
- **FR216.4:** At 30 minutes of continuous silence (no messages from either side), the session auto-saves and closes server-side (via the Inngest cron in FR211.6). The child sees the "unfinished session" card on next app open.

### FR217: Unified Celebration System (Shared Infrastructure)

The four celestial animations are not session-only — they are the **app-wide achievement language**. Any feature across any epic can trigger a celebration using the same components and the same delivery mechanism.

**Two trigger mechanisms, one animation library:**

- **FR217.1: In-session celebrations (client-side, real-time).** The session screen tracks the escalation rung from the streaming `onDone` callback and triggers animations immediately when milestone conditions are met. No server round-trip needed — the data is already on the client.

- **FR217.2: Post-session celebrations (server-queued, deferred).** Achievements that are computed asynchronously in the Inngest `session-completed` chain (topic mastered, EVALUATE success, TEACH_BACK success, topic unlocked, streak milestones) are written to a **pending celebrations queue** on the server. The client reads the queue on the next screen load and plays them.

- **FR217.3: Pending celebrations queue.** A `pendingCelebrations` JSONB array field on the `coaching_card_cache` table. Each entry: `{ celebration: string, reason: string, detail?: string }`. No new table — the coaching card is already fetched on every home screen mount.

- **FR217.4: Queue write.** A `queueCelebration(db, profileId, celebration, reason, detail?)` service function. Inngest steps call it when an achievement is detected. The function appends to the JSONB array.

- **FR217.5: Queue read + play.** The coaching card API response includes `pendingCelebrations`. The `useCelebration()` hook on the home screen reads the array, plays animations in sequence (with short delays between), and calls `DELETE /v1/celebrations/seen` to mark them consumed.

- **FR217.6: Celebration-to-tier mapping.** Each achievement maps to a celestial tier:

  | Tier | Animation | In-session triggers | Post-session triggers (queued) |
  |------|-----------|--------------------|-----------------------------|
  | 1 — Polar Star | Single star pulse | First independent answer (rung 1-2) | — |
  | 2 — Twin Stars | Two-star burst | 3 consecutive rung 1-2 | EVALUATE success, TEACH_BACK scored well (quality ≥ 4) |
  | 3 — Comet | Streak across screen | Rung drops from 3+ to 1-2 (breakthrough) | Topic mastered (recall passed, quality ≥ 4), topic unlocked (Epic 7 prereq met), 7-day streak |
  | 4 — Orion's Belt | Three connected stars | 5 consecutive rung 1-2 (mastery streak) | Curriculum complete (all topics verified), 30-day streak |

- **FR217.7: Celebration deduplication.** The queue deduplicates by `(celebration, reason)` pair. If a child masters two topics before returning to the home screen, they see two Comets (different `detail`), not one. But if the same topic triggers twice (race condition), only one fires.

- **FR217.8: Queue expiry.** Pending celebrations older than 7 days are silently dropped on read. Stale achievements from a week ago aren't worth interrupting the current session for.

- **FR217.9: Parent dashboard celebrations.** The parent dashboard child detail screen also plays celebrations from the child's queue — filtered to parent-relevant achievements only:
  - **Parent sees:** topic mastered, curriculum complete, EVALUATE success, TEACH_BACK success, streak milestones, topic unlocked (Epic 7)
  - **Parent does NOT see:** Polar Star, Twin Stars (granular in-session moments — too detailed for parent)
  - Filtering: `PARENT_VISIBLE_REASONS` set applied when reading the queue for parent view
  - A parent seeing "Alex mastered Quadratic Equations!" with a Comet animation transforms the dashboard from surveillance into shared celebration.

- **FR217.10: Separate seen states for child and parent.** Marking celebrations as seen is per-viewer, not global. The child seeing their Comet on the home screen doesn't clear it for the parent, and vice versa. Implementation: two timestamp fields on `coaching_card_cache`:
  - `celebrations_seen_by_child` — ISO timestamp of last child read
  - `celebrations_seen_by_parent` — ISO timestamp of last parent read
  - Each viewer only sees entries with `queuedAt > lastSeenTimestamp`

- **FR217.11: Future epics plug in without touching the animation layer.** Epic 7 (topic unlock) just calls `queueCelebration(db, profileId, 'comet', 'topic_unlocked', 'Calculus Intro')`. The animation components, the hook, and the delivery mechanism already exist.

---

## Architecture Decisions

### AD1: Active time is computed on close, not tracked incrementally

Computing active time from `sessionEvents` timestamps on session close is simpler and more accurate than maintaining an incrementing counter. The events are already stored — we just need to sum the capped intervals.

```typescript
const SILENCE_CAP_SECONDS = 8 * 60; // 8 minutes — respects deep thought

function computeActiveSeconds(
  sessionStartedAt: Date,
  events: Array<{ createdAt: Date }>,
  silenceCapSeconds: number = SILENCE_CAP_SECONDS
): number {
  if (events.length === 0) return 0;

  let activeSeconds = 0;
  let prevTimestamp = sessionStartedAt.getTime();

  for (const event of events) {
    const gap = (event.createdAt.getTime() - prevTimestamp) / 1000;
    activeSeconds += Math.min(gap, silenceCapSeconds);
    prevTimestamp = event.createdAt.getTime();
  }

  return Math.round(activeSeconds);
}
```

### AD2: No checkpoint endpoint — save on message send

Instead of a timed checkpoint interval with a dedicated API endpoint, the crash recovery marker is written to AsyncStorage on each message send. This is simpler (no new endpoint, no `setInterval`), more reliable (writes happen on actual activity), and covers the real crash scenario. The server's `lastActivityAt` is already updated by the exchange endpoint on each message.

### AD3: Milestone animations use the existing Reanimated + SVG stack

All four milestone animations use `react-native-reanimated` shared values + `react-native-svg` animated components, matching the existing `BrandCelebration`, `CelebrationAnimation` patterns. No new animation libraries needed.

### AD4: `useCelebration()` hook — registry pattern with two trigger modes

The hook uses a component registry to map celebration names to animation components, and supports two modes of use: imperative (in-session) and queue-based (post-session).

**Registry:**
```typescript
const CELEBRATIONS = {
  polar_star: { Component: PolarStar, label: 'Polar Star' },
  twin_stars: { Component: TwinStars, label: 'Twin Stars' },
  comet:      { Component: Comet,     label: 'Comet' },
  orions_belt:{ Component: OrionsBelt, label: "Orion's Belt" },
} as const;

type CelebrationName = keyof typeof CELEBRATIONS;

interface CelebrationEntry {
  celebration: CelebrationName;
  reason: string;    // 'breakthrough' | 'topic_mastered' | 'evaluate_success' | ...
  detail?: string;   // 'Quadratic Equations' (for the toast)
}
```

**Mode 1: Imperative trigger (in-session).** The session screen calls `trigger()` directly when `useMilestoneTracker()` detects a rung-based milestone:

```typescript
const { CelebrationOverlay, trigger } = useCelebration();

// After each exchange, milestone tracker fires:
const milestone = milestoneTracker.check(newRung);
if (milestone) trigger({ celebration: milestone, reason: 'breakthrough' });

return (
  <>
    <ChatShell ... />
    <CelebrationOverlay />  {/* absolute-positioned, auto-dismisses */}
  </>
);
```

**Mode 2: Queue playback (post-session).** The home screen (or parent dashboard) passes a queue from the API response. The hook plays them sequentially:

```typescript
const { CelebrationOverlay } = useCelebration({
  queue: coachingCard.pendingCelebrations,
  onAllPlayed: () => markCelebrationsSeen('child'),
});

return (
  <>
    <HomeContent ... />
    <CelebrationOverlay />
  </>
);
```

**`CelebrationOverlay` renders:**
1. The animation component from the registry (`CELEBRATIONS[entry.celebration].Component`)
2. A toast below: **"Comet — you mastered Quadratic Equations!"** (label + detail, copy tone adapted by age via `getAgeVoice()`)
3. Auto-advances to next queued entry after `onComplete` + ~1s delay
4. Renders nothing when idle (no queue, no active trigger)

**`useMilestoneTracker()` — companion hook for in-session detection:**

Tracks escalation rung from exchange `onDone` metadata:
- `lastRung`: rung from most recent AI response
- `consecutiveLowRungCount`: count of consecutive rung 1-2 responses
- `hasHadHighRung`: whether any response was rung 3+ (needed for Comet — breakthrough requires a *drop*)
- `milestonesReached`: set of milestone names already triggered this session (prevents re-fire)
- `check(newRung)`: returns the milestone name to trigger, or `null`

No new server-side data needed for in-session detection. Post-session milestones use the pending queue (AD5).

### AD5: Pending celebrations use coaching card cache, not a new table

The `coaching_card_cache` table already has one row per profile, is already fetched on every home screen mount, and already has a `cardData` JSONB column. Adding `pendingCelebrations` JSONB alongside it means:
- Zero additional API calls (piggybacks on existing `GET /v1/coaching-card`)
- One simple `queueCelebration()` function that appends to the array
- One `DELETE /v1/celebrations/seen` endpoint that clears it
- No new table, no new polling, no WebSocket, no push notification

```typescript
// Inngest step calls this after detecting an achievement
async function queueCelebration(
  db: Database,
  profileId: string,
  celebration: 'polar_star' | 'twin_stars' | 'comet' | 'orions_belt',
  reason: string,
  detail?: string
): Promise<void> {
  const entry = { celebration, reason, detail, queuedAt: new Date().toISOString() };
  await db
    .update(coachingCardCache)
    .set({
      pendingCelebrations: sql`
        COALESCE(pending_celebrations, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb
      `,
    })
    .where(eq(coachingCardCache.profileId, profileId));
}
```

```typescript
// Home screen reads + plays
const { pendingCelebrations } = coachingCardResponse;
// useCelebration() hook plays them in sequence, then:
await apiClient.celebrations.seen.$delete(); // clears the queue
```

### AD6: AppState handling — AsyncStorage first, always (crash recovery)

```typescript
// Recovery marker saved on EVERY message send
const saveRecoveryMarker = useCallback(async () => {
  await AsyncStorage.setItem('session_recovery', JSON.stringify({
    sessionId, exchangeCount, lastActivityTimestamp: Date.now(), savedAt: Date.now()
  }));
}, [sessionId, exchangeCount]);

// Also save on app background (belt-and-suspenders)
useEffect(() => {
  const sub = AppState.addEventListener('change', async (state) => {
    if (state === 'background' || state === 'inactive') {
      await saveRecoveryMarker();
    }
  });
  return () => sub.remove();
}, [saveRecoveryMarker]);
```

### AD7: Session close flow (updated)

```
Child taps "I'm Done" button
  → Alert: "Ready to wrap up?" / "Keep Going" / "I'm Done"
  → POST /v1/sessions/:sessionId/close
  → Server computes activeSeconds from sessionEvents (8-min cap)
  → Server stores durationSeconds (active), wallClockSeconds (raw), milestonesReached
  → Inngest session-completed chain fires
  → Client navigates to SessionSummaryScreen
  → Summary shows wall-clock time + learning milestones + "Your Words" prompt
  → Child writes summary or skips → back to home
```

```
App backgrounded / killed / crashed
  → AsyncStorage marker already saved (on last message send)
  → AppState listener writes marker again (belt-and-suspenders)
  → Inngest cron closes stale sessions (30 min idle)
  → On next cold start: detect recovery marker → "Unfinished session" card on home
  → Child taps card (or ignores it) — no forced flow
```

---

## Stories

### Story 13.1: Active time computation + wallClockSeconds column

**Scope:** Add `wallClockSeconds` column to `learningSessions`. Refactor `closeSession()` to compute active time from `sessionEvents` timestamps (8-minute capped intervals) instead of wall-clock. Pure backend — no UI changes.

**Acceptance criteria:**
- [ ] New nullable `wall_clock_seconds` integer column on `learningSessions`
- [ ] `computeActiveSeconds()` utility with 8-minute silence cap
- [ ] `closeSession()` computes `durationSeconds` using capped-interval formula from sessionEvents
- [ ] `closeSession()` also stores `wallClockSeconds = now - startedAt` for analytics
- [ ] Sessions with 0 events get `durationSeconds = 0` (not null)
- [ ] Existing session-lifecycle tests updated
- [ ] Dashboard `totalTimeThisWeekMinutes` now reflects active time
- [ ] Dashboard label: "X minutes active learning"

**Tests:** Unit test `computeActiveSeconds()` with: normal flow (gaps < 8 min), long gaps (> 8 min, should be capped), single event, zero events, rapid-fire events (1-second gaps). Integration test: create session with known event gaps, close, verify durationSeconds vs wallClockSeconds.

### Story 13.2: Remove hard caps and nudge from session-lifecycle

**Scope:** Simplify `session-lifecycle.ts` — remove hard cap, nudge, and all age-based timer constants. Keep only silence detection (8 min) and auto-save (30 min).

**Acceptance criteria:**
- [ ] `SessionTimerState` loses `nudgeThresholdSeconds` and `hardCapSeconds`
- [ ] `TimerCheck.action` reduced to `'continue' | 'silence_prompt' | 'auto_save'`
- [ ] `createTimerConfig()` no longer accepts `personaType` — only needs silence/auto-save thresholds
- [ ] Silence threshold updated from 3 min to 8 min
- [ ] All hard cap, nudge, TEEN_*, ADULT_* constants removed
- [ ] All session-lifecycle tests updated

**Tests:** Update `session-lifecycle.test.ts`. Verify `checkTimers()` never returns `nudge` or `hard_cap`.

### Story 13.3: Crash recovery — AsyncStorage markers + stale session cleanup

**Scope:** Save crash recovery marker to AsyncStorage on each message send. AppState listener as backup. Cold-start recovery check on home screen. Inngest cron for stale session cleanup. **No new API endpoint needed.**

**Acceptance criteria:**
- [ ] Recovery marker written to AsyncStorage after each exchange completes
- [ ] AppState `background`/`inactive` listener writes recovery marker as backup
- [ ] AsyncStorage write happens **before** any network call (ordering critical)
- [ ] Foregrounding within 30 min: session resumes, "Welcome back" toast
- [ ] Foregrounding after 30+ min: session auto-closed, summary screen shown
- [ ] Cold start with recovery marker: quiet "You have an unfinished session" card on home (not blocking banner)
- [ ] Card is dismissible — child may have intentionally quit
- [ ] Recovery marker cleared after recovery or dismissal
- [ ] Inngest cron runs every 10 min, closes sessions idle > 30 min
- [ ] Crash-recovered sessions get `durationSeconds` computed from session events

**Tests:** Unit test: recovery marker read/write. Integration test: simulate AppState transitions. Edge cases: (1) marker exists but session already closed server-side (race); (2) app killed mid-exchange — marker from previous exchange survives; (3) rapid background→foreground — no double-close; (4) stale session closed by cron before app reopens — card shows "session was saved."

### Story 13.4: Celebration animation library + in-session milestone triggers

**Scope:** Build the four celestial animation components as a **reusable shared library** in `components/common/celebrations/`. Build `useCelebration()` hook that plays from a queue. Wire in-session triggers from escalation rung. This is the foundation that all future epics (7, 8, etc.) use to trigger celebrations — they just call `triggerCelebration()` or `queueCelebration()`.

**FRs:** FR214 (learning milestones), FR217.1 (in-session triggers), FR217.6 (tier mapping)

**Acceptance criteria:**
- [ ] Four animation components in `components/common/celebrations/`: `PolarStar`, `TwinStars`, `Comet`, `OrionsBelt`
- [ ] Each component: Reanimated + SVG, `onComplete` callback, `useReducedMotion()` fallback, `testID`
- [ ] `useCelebration()` hook: accepts a queue of celebrations, plays them in sequence with delay between, fires `onAllComplete`
- [ ] `useMilestoneTracker()` hook: tracks escalation rung from exchange metadata, returns triggered milestones
- [ ] In-session wiring: session screen uses `useMilestoneTracker()` to detect:
  - **Polar Star:** First AI response at rung 1-2
  - **Twin Stars:** 3rd consecutive rung 1-2
  - **Comet:** Rung drops from 3+ to 1-2 (breakthrough)
  - **Orion's Belt:** 5th consecutive rung 1-2
- [ ] Each milestone triggers exactly once per session
- [ ] Animations overlay header, don't block chat input
- [ ] Persistent earned indicators in fixed header position (max 4 dots) — works regardless of session mode (next to timer, question counter, or standalone)
- [ ] `milestonesReached` stored in session metadata on close
- [ ] No negative messaging if none earned — absence is neutral

**Tests:** Unit test `useMilestoneTracker()`: correct triggers at each rung condition. Comet only on rung *drop* (not always-low). Snapshot: reduced-motion fallback for each component. Component test: each fires once. `useCelebration()` queue test: plays in order.

### Story 13.5: Context-aware silence detection (in-chat prompt)

**Scope:** Silence prompt only fires when the child is likely stuck (AI asked a question and child is silent for 8 min). No prompt when AI gave an explanation (child is probably reading/thinking). 30-min full silence → auto-close via Inngest cron.

**Acceptance criteria:**
- [ ] 8 min silence after AI question: system message appears in chat ("Still working on it?")
- [ ] No prompt after AI explanation (last AI message didn't end with `?`) — child is reading/thinking
- [ ] Prompt sent at most once per silence period
- [ ] Tracked as `eventType: 'system_prompt'`, not counted in exchange count
- [ ] 30 min silence: session closed by Inngest cron (FR211.6)
- [ ] No prompt fires if child is actively typing

**Tests:** Unit test: silence timer resets on activity. Test: no prompt when AI's last message was an explanation. Integration test: verify system_prompt event created. Edge case: message at 7:59 prevents prompt.

### Story 13.6: "I'm Done" button + summary screen milestone recap

**Scope:** Rename "End Session" to "I'm Done". Summary screen shows wall-clock time (encouragement) + learning milestone recap. No "focused time" shown to child — that's a parent-only metric.

**Acceptance criteria:**
- [ ] Button: "I'm Done" (was "End Session")
- [ ] Alert: "Ready to wrap up?" / "Keep Going" / "I'm Done"
- [ ] Summary shows wall-clock time only: "**45 minutes** — great session!"
- [ ] No "focused time" or "active time" shown to child (parent sees this on dashboard)
- [ ] Summary shows milestone recap if any milestones earned:
  - "Polar Star — first independent answer"
  - "Comet — you had a breakthrough!"
  - "Orion's Belt — 5 in a row without help!"
- [ ] No milestone section if no milestones earned (neutral, not punitive)
- [ ] Coaching card generation can reference milestones

**Tests:** Update summary screen tests. Verify wall-clock-only time display. Verify milestone recap renders. Verify no milestone section when none earned.

### Story 13.7: Post-session celebration queue + child/parent playback + preferences

**Scope:** Add `pendingCelebrations` JSONB + seen timestamps to `coaching_card_cache`. Build `queueCelebration()` service. Wire Inngest steps. Home screen and parent dashboard both play celebrations (different filters, separate seen states). Add celebration toggle on More screen.

**FRs:** FR217.2-FR217.11 (post-session queue), FR218.4-FR218.6 (age/preference)

**Acceptance criteria:**
- [ ] `pendingCelebrations` JSONB field on `coaching_card_cache` (default `[]`)
- [ ] `celebrations_seen_by_child` and `celebrations_seen_by_parent` timestamp fields
- [ ] `queueCelebration(db, profileId, celebration, reason, detail?)` service function (atomic JSONB append)
- [ ] Coaching card response includes `pendingCelebrations` filtered by child's `seenByChild` timestamp
- [ ] `POST /v1/celebrations/seen` marks seen (accepts `viewer: 'child' | 'parent'`)
- [ ] Inngest wiring:
  - EVALUATE success → Twin Stars
  - TEACH_BACK quality ≥ 4 → Twin Stars
  - Topic mastered (quality ≥ 4, repetitions > 2) → Comet with topic name
  - 7-day streak → Comet
  - 30-day streak → Orion's Belt
- [ ] **Child home screen:** plays all pending celebrations on mount via `useCelebration()`
- [ ] **Parent dashboard child detail:** plays parent-filtered celebrations (`PARENT_VISIBLE_REASONS` set: topic_mastered, curriculum_complete, evaluate_success, teach_back_success, streak_7, streak_30)
- [ ] Parent seeing celebrations doesn't clear them for child, and vice versa
- [ ] Toast copy adapts by age bracket (FR218.4)
- [ ] Celebration toggle on More screen: "Show learning celebrations: On/Off" (default On)
- [ ] When toggle is off: milestones still tracked in metadata (for coaching cards), only animation suppressed
- [ ] Queue entries > 7 days silently dropped
- [ ] Deduplication: same `(celebration, reason)` pair not queued twice

**Tests:** `queueCelebration()` unit test. Deduplication. 7-day expiry. Separate seen states (child/parent). Parent filter test. API: `POST /celebrations/seen` with viewer param. Inngest integration: queue after EVALUATE success. Toggle: verify milestones tracked even when animation off.

---

## Dependency Order

```
Story 13.1 (active time)              ─── no deps, pure backend
Story 13.2 (remove hard caps)         ─── no deps, pure backend
Story 13.4 (celebration library)      ─── no deps, pure frontend

Story 13.3 (crash recovery)           ─── depends on 13.1 (active time on close)
Story 13.5 (silence detection)        ─── depends on 13.2 (simplified timer state)
Story 13.6 (summary screen + recap)   ─── depends on 13.4 (milestones exist to recap)
Story 13.7 (post-session queue)       ─── depends on 13.4 (celebration components exist) + 13.1 (Inngest chain wiring)
```

Stories 13.1, 13.2, and 13.4 can all be parallelized. Stories 13.6 and 13.7 can be parallelized after 13.4. Total: 7 stories.

---

## Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 12** (persona removal) | **SEQUENCING DECISION: Do Story 13.2 before Epic 12 Story 12.1.** Both touch `SessionTimerConfig` — 13.2 removes hard caps and `personaType` from the timer config entirely, 12.1 also needs to remove `personaType`. If 13.2 goes first, 12.1's timer work becomes a no-op (already done) and 12.1 only needs to handle the LLM voice refactor. If 12.1 goes first, 13.2 partially undoes its work. **Do not let two stories touch session-lifecycle.ts independently.** |
| **Epic 7** (concept map) | When topic unlock is implemented, the Inngest step just calls `queueCelebration(db, profileId, 'comet', 'topic_unlocked', topicName)`. The animation library and queue from Story 13.4 + 13.7 are already in place. Zero animation work in Epic 7. |
| **Epic 10** (UX polish) | Story 10.8 (summary skip-rate) already tracks summary engagement — 13.6 adds milestone data to the same flow |
| **Epic 3 Cluster G** (Feynman) | Voice sessions also use the timer — milestone animations should work during STT/TTS sessions. TEACH_BACK success already wired to queue Twin Stars in Story 13.7. |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Active time computation expensive on close | Events indexed by sessionId. Even 200 events is a trivial loop. |
| 8-min silence cap still undercounts for very deep thinkers | 8 min is generous for a tutoring context. A child reading for 8+ min without interacting is likely distracted or away. Can be tuned post-launch with data. |
| AppState listener unreliable on Android | AsyncStorage marker from last message send is the primary recovery mechanism. AppState is belt-and-suspenders. Inngest cron is the final fallback. Three layers. |
| Milestone animations jank on low-end Android | `useReducedMotion()` + keep under 100 SVG nodes. Test on Pixel 4a. |
| Orphaned legacy sessions (pre-migration) | FR215.3: exclude null-duration sessions from time calcs. |
| No milestones earned → child feels bad | FR214.7: absence is explicitly neutral. No "0 stars" messaging. The milestones are a bonus surprise, not a scorecard. |
| Escalation rung not reliably available in streaming metadata | Verify rung is present in existing exchange response. If missing, degrade gracefully — no milestones for that exchange, not a crash. |
| "Unfinished session" card ignored by child | That's fine — it's a gentle option, not a forced flow. The session was already auto-closed by the Inngest cron. No data loss. |
| Pending celebrations pile up if child doesn't open app | FR217.8: 7-day expiry. Stale achievements silently dropped. |
| Too many celebrations on home screen at once | `useCelebration()` plays sequentially with ~1s delay. Max practical queue: 3-4 after a great session. |
| Coaching card cache race: precompute writes card while queue writes celebration | JSONB append is atomic (`||` operator). No race — different columns of the same row. |

---

## What Changed from v1 of This Spec

These changes were made after a product review that challenged the spec from an end-user perspective:

| Original | Changed to | Why |
|----------|-----------|-----|
| 3-min silence cap | 8-min silence cap | Real learning involves reading, paper work, deep thought. 3 min punishes thoughtful learners. |
| Time-based milestones (10/20/30/45 min) | Learning-based milestones (independent answer, streak, breakthrough, mastery) | Time milestones reward sitting in a chair, not learning. A confused child going in circles gets rewarded; a child who nails it in 8 min gets nothing. |
| Dual time display for child ("45 min session / 25 min focused") | Wall-clock only for child ("45 min — great session!") | Showing "focused time" creates guilt and hands parents an interrogation tool. Different audiences need different views. |
| 3-min timed checkpoint API endpoint | AsyncStorage marker on each message send | Simpler (no new endpoint), more reliable (writes on actual activity), covers the real crash scenario. |
| "Session was saved" blocking banner on home | "Unfinished session" dismissible card | Child may have deliberately quit. Don't assume they want to continue. |
| 3-min silence prompt (always fires) | 8-min context-aware prompt (only after AI question) | If the AI explained something and the child is quiet, they're reading. Only prompt when the child is likely stuck (AI asked a question and no response). |
| FR212: Dedicated checkpoint endpoint story | Eliminated — merged into crash recovery story | No new API endpoint needed. Recovery uses AsyncStorage + existing exchange endpoint. |
| Session-only milestone animations | Unified celebration system (FR217) with reusable library + post-session queue | Epic 7 topic unlock, EVALUATE/TEACH_BACK success, streak milestones all need celebrations. Building them as session-only means re-inventing the wheel in every future epic. |

---

## What Already Exists (no changes needed)

- `SessionTimer` component (will be enhanced with milestone indicators, not replaced)
- `SessionSummaryScreen` (will be extended with milestone recap)
- `BrandCelebration` / `CelebrationAnimation` (pattern to follow for new animations)
- `session-completed` Inngest chain (triggered by close — works with both manual and crash-recovered close)
- `sessionEvents` table with timestamps (the data source for active time computation)
- Exchange response metadata includes `escalationRung` (the data source for milestone detection)
- `End Session` button with confirmation dialog (copy change only)
