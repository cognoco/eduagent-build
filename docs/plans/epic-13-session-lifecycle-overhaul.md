# Epic 13: Session Lifecycle Overhaul — Honest Time, Learning Milestones, Graceful Close

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Status:** ALL 7 STORIES COMPLETE (verified 2026-04-01)

> **Completion summary (2026-04-01 code audit):**
> All stories 13.1 through 13.7 are implemented and verified. Key implementation details:
>
> - **13.1:** `wallClockSeconds` computed in `session.ts`, `computeActiveSeconds()` with adaptive per-gap caps, dashboard shows wall-clock + exchange count.
> - **13.2:** Hard caps and nudge removed. `SessionTimerState` has no `nudgeThresholdSeconds`/`hardCapSeconds`. Adaptive silence replaces fixed thresholds. No `TEEN_*`/`ADULT_*` constants.
> - **13.3:** Uses **SecureStore** for recovery markers (better choice than AsyncStorage — encrypted, persistent). 30-min recovery window. `AppState` listener backup. Inngest stale session cron every 10 min. "Pick up where you left off?" card on home screen.
> - **13.4:** 4 celestial components (`PolarStar`, `TwinStars`, `Comet`, `OrionsBelt`) with full Reanimated animations. `useCelebration()` with queue/tier/3-level filtering. `useMilestoneTracker()` with mastery (`polar_star`, `twin_stars`, `comet`, `orions_belt`) + effort (`deep_diver`, `persistent`) milestones.
> - **13.5:** `expectedResponseMinutes` in exchange metadata. `computeSilenceThresholdSeconds()` with pace multiplier (0.5-3.0). `medianResponseSeconds` on `teachingPreferences`. Session-completed chain updates baseline.
> - **13.6:** Button text "I'm Done", alert "Ready to wrap up?", 3-sec fast celebration catch (polls for Inngest results), wall-clock-only summary, milestone recap.
> - **13.7:** `queueCelebration()` service with atomic JSONB. `GET /celebrations/pending` + `POST /celebrations/seen` routes. `celebrationLevel` enum (`all`/`big_only`/`off`). Separate child/parent seen states. 7-day expiry. Inngest wiring (EVALUATE -> TwinStars, TEACH_BACK -> TwinStars, topic mastered -> Comet, streak 7 -> Comet, streak 30 -> OrionsBelt).

---

## Problem Statement

The current session lifecycle has four problems:

### 1. No engagement context for parents
`durationSeconds` is wall-clock time (`now - startedAt`). Wall-clock is the honest metric for the child — real learning involves reading, paper work, and thinking, all of which happen away from the screen and are genuine study time. But for the parent, wall-clock alone can't distinguish 45 minutes of engaged learning (25 exchanges) from 45 minutes of an open, ignored app (2 exchanges). The parent needs engagement context alongside duration.

### 2. Silent app close = orphaned sessions
If the child swipes the app away or the OS kills it, the session stays `status: 'active'` forever in the database. `endedAt` is null, `durationSeconds` is null. The parent sees a session with no duration. The child never sees the completion celebration or summary screen. If the child comes back within minutes after a crash, they can't resume — their work is lost.

### 3. Hard caps are hostile
The server computes `hard_cap` (20 min for teens, 30 min for others) but the mobile client never acts on it. If it did, it would forcefully end a session mid-thought. Hard caps punish engagement. Screen time is a parental OS-level concern, not something the tutoring app should enforce.

### 4. The timer rewards clock-watching, not learning
`SessionTimer` is a plain `MM:SS` counter. It communicates nothing about what matters — the quality of the learning, not the quantity of minutes.

---

## Design Principles

- **Wall-clock is honest time.** The child isn't just staring at a screen — they read, write on paper, think. Wall-clock captures the full learning commitment. Active time (capped intervals) is an internal analytics metric only, never shown to any user.
- **The child decides when they're done.** No hard caps. No nudges. No warnings.
- **Celebrate learning AND effort, not clock time.** Milestone animations fire for independent thinking, breakthroughs, and mastery — AND for engagement and persistence. Every child can earn milestones, regardless of how much scaffolding they need.
- **Graceful degradation.** App close, crash, or background should save state — the child never loses work. If they come back quickly, they can resume where they left off.
- **Same numbers, different framing.** Both child and parent see wall-clock time. The parent also sees exchange count for engagement context. No information asymmetry between family members — no ammunition for "but the app says..."
- **Adaptive silence, not fixed timers.** The LLM knows what it asked. A quick recall question and a multi-step proof need different wait times. The system learns each student's pace within a session and across sessions. Don't interrupt thinking with arbitrary thresholds.

---

## Functional Requirements

### FR210: Time Tracking & Adaptive Silence

- **FR210.1:** Active time is computed as the sum of intervals between consecutive message events (user or AI), where each interval is capped at the **LLM-estimated expected response time** for that exchange (with per-student pace calibration). This is an **internal analytics metric only** — never surfaced to any user. It enables post-launch analysis of engagement patterns.
- **FR210.2:** The formula: for each pair of consecutive events `(e[i], e[i+1])`, the per-gap cap is `expectedResponseSeconds[i] * paceMultiplier * 1.5` (1.5x buffer for slower-than-estimated work). Active time += `min(gap, perGapCap)`. Fallback cap: 10 minutes if LLM estimate is missing.
- **FR210.3:** `durationSeconds` in the `learningSessions` table stores **active time** for internal analytics. This column is never exposed to any user-facing UI.
- **FR210.4:** A new column `wallClockSeconds` (nullable integer) stores the raw `endedAt - startedAt`. **This is the user-facing duration** — shown to both child and parent.
- **FR210.5:** The mobile `SessionTimer` component shows wall-clock elapsed time during the session.
- **FR210.6:** The `SessionSummaryScreen` shows wall-clock time, framed positively: "**45 minutes** — great session!" No "focused time" or "active time" shown to the child.
- **FR210.7:** The parent dashboard shows wall-clock time **plus exchange count** for engagement context: "45 minutes, 18 exchanges." This lets the parent distinguish engaged learning (many exchanges) from an abandoned session (few exchanges) without creating a second competing "time" number.

**Adaptive silence — LLM task estimation:**

- **FR210.8:** Each AI response includes `expectedResponseMinutes` (integer, 1-20) in the streaming response metadata alongside `escalationRung`. The LLM estimates how long the student will reasonably need to respond, considering whether it asked a quick recall question, a multi-step problem, or a reading/writing task. The system prompt includes a brief instruction for this estimate.
- **FR210.9:** Per-session pace calibration. After 3+ exchanges, the system computes a `paceMultiplier` from the ratio of actual response times to LLM estimates (median of ratios, clamped to 0.5–3.0). Before 3 exchanges, `paceMultiplier = 1.0` (raw LLM estimate used). The silence threshold for each exchange is: `clamp(expectedResponseMinutes * paceMultiplier, 2, 20) * 60` seconds.
- **FR210.10:** Cross-session learned baseline. A `medianResponseSeconds` field on `teachingPreferences` stores the student's historical median response time, updated at session close by the Inngest session-completed chain. On session start, this baseline initializes the `paceMultiplier` instead of defaulting to 1.0 — eliminating cold-start inaccuracy from session 2 onward. If no baseline exists (first session ever), `paceMultiplier` defaults to 1.0.

### FR211: Graceful Session Close on App Background/Kill

- **FR211.1:** The mobile session screen saves a crash recovery marker to `AsyncStorage` **on every message send** (after each exchange completes). This is simpler than a timed checkpoint interval, requires no new API endpoint, and covers the actual crash scenario: if the app dies, the last exchange is the recovery anchor. *(Implementation note: SecureStore used instead of AsyncStorage — encrypted and more persistent.)*
  - Recovery marker contains: `{ sessionId, exchangeCount, lastActivityTimestamp, savedAt }`.
  - SecureStore write is local and fast — no network dependency.
- **FR211.2:** The mobile session screen also listens to `AppState` changes. When the app transitions to `background` or `inactive`:
  - Write the recovery marker to AsyncStorage (in case the last exchange write was missed).
  - No network call needed — the server's `lastActivityAt` was already updated by the last exchange endpoint.
- **FR211.3:** When the app returns to `foreground` with an active session:
  - If the session was backgrounded for **less than 30 minutes:** offer session resumption. Load chat history from the server, restore the session screen, show a "Welcome back" toast. If the last exchange was incomplete (user message with no AI response stored), discard it — the child sends a new message.
  - If backgrounded for **30+ minutes:** auto-close the session server-side, show the summary screen on next open.
- **FR211.4:** On app cold start, check `AsyncStorage` for crash recovery markers. If a marker exists for a session that is still `status: 'active'` on the server:
  - If the session's `lastActivityAt` is **less than 30 minutes ago:** show a "Pick up where you left off?" card on the home screen with two options: **[Continue Session]** (loads chat history, resumes session) and **[End & See Summary]** (closes session, shows summary). Card is not blocking — child can dismiss it.
  - If **30+ minutes ago** (or session already closed by Inngest cron): show a quiet "Your session was saved" card — tapping it shows the summary screen.
- **FR211.5:** The Inngest `session-completed` chain already handles the post-close processing (XP, retention, embeddings). Crash-recovered closes trigger the same chain.
- **FR211.6:** Stale session cleanup: an Inngest cron function runs every 10 minutes, finds sessions where `lastActivityAt` is older than 30 minutes and `status = 'active'`, and closes them. This catches sessions where the client never came back (app uninstalled, phone died, etc.).

### FR213: Remove Hard Caps

- **FR213.1:** Remove `hardCapSeconds` from `SessionTimerState`. Remove the `hard_cap` action from `TimerCheck`.
- **FR213.2:** Remove `TEEN_HARD_CAP_SECONDS` and `ADULT_HARD_CAP_SECONDS` constants.
- **FR213.3:** Remove `TEEN_NUDGE_SECONDS` and `ADULT_NUDGE_SECONDS` constants. No age-based timer differentiation.
- **FR213.4:** Keep `autoSaveThresholdSeconds` (30 min). The silence threshold is now **adaptive** per FR210.8-10, not a fixed constant.
- **FR213.5:** The `nudge` action is removed. Replaced by learning milestone celebrations (FR214) which are positive reinforcement, not warnings.
- **FR213.6:** `checkTimers()` is simplified to only return: `continue`, `silence_prompt`, or `auto_save`.

### FR214: Learning Milestone Celebrations

- **FR214.1:** The session screen tracks learning quality metrics from exchange metadata (escalation rung) AND engagement metrics (message length, persistence after correction), triggering brief, non-intrusive celebration animations. Each milestone triggers only once per session. **Milestones celebrate learning achievements AND effort — every child can earn milestones regardless of how much scaffolding they need.**

- **FR214.2:** Milestone schedule:

  **Mastery milestones (escalation rung-based):**

  | Milestone | Name | Trigger | Animation | Duration |
  |-----------|------|---------|-----------|----------|
  | 1 | Polar Star | First independent answer — AI response at escalation rung 1-2 (Socratic/hint level, no direct teaching needed) | A single star grows from the timer area, pulses gently, settles as a small persistent glow | ~2.5s |
  | 2 | Twin Stars | Independent streak — 3 consecutive AI responses at rung 1-2 (child is thinking through problems without hand-holding) | Two stars expand from the timer, burst outward with a sparkle trail | ~3s |
  | 3 | Comet | Breakthrough — escalation rung drops from 3+ to 1-2 within the session (child went from needing direct teaching to getting it independently — the "aha" moment) | A comet streaks across the header with a glowing tail and particle trail | ~3.5s |
  | 4 | Orion's Belt | Mastery streak — 5 consecutive AI responses at rung 1-2 (sustained independent thinking, rare and genuinely impressive) | Three stars light up in sequence (Orion's Belt pattern), connected by a faint constellation line, with a subtle shimmer | ~4s |

  **Effort milestones (engagement-based — every child can earn these):**

  | Milestone | Name | Trigger | Animation | Duration |
  |-----------|------|---------|-----------|----------|
  | 5 | Deep Diver | 3 messages over 50 characters — the child is writing thoughtful, detailed responses, not "yes"/"idk"/"ok" | Polar Star animation (Tier 1) | ~2.5s |
  | 6 | Persistent | Child continues engaging after receiving a correction or rung 4-5 response — they didn't give up when it got hard | Twin Stars animation (Tier 2) | ~3s |

  **Why effort milestones exist:** A child who always needs scaffolding (rung 3+ throughout) would never earn mastery milestones across 20 sessions. That's not neutral — it's a pattern that communicates "stars aren't for you." Effort milestones ensure every child who tries can earn recognition. The struggling child who writes long answers and keeps going after corrections goes home with Deep Diver + Persistent. Mastery milestones are a bonus for those who achieve independence; effort milestones recognize what every child controls — effort and persistence.

- **FR214.3:** Animations are non-blocking — the child can keep typing during the animation. Animations overlay the header area, never obscure the chat input or message list.
- **FR214.4:** After each milestone animation completes, a small persistent indicator remains near the timer (earned star dots) so the child can see their achievements. Maximum 6 indicators (one per milestone type).
- **FR214.5:** Animations respect `useReducedMotion()` — if the user has reduced motion enabled, show a static icon change instead of the animation (e.g., a star icon appears next to the timer).
- **FR214.6:** The milestones reached are included in the session close payload and stored in `learningSessions.metadata.milestonesReached: string[]` (array of milestone names, e.g., `["polar_star", "deep_diver", "comet"]`). This feeds into coaching card generation ("You had a breakthrough in Math yesterday — you earned a Comet!").
- **FR214.7:** A child who earns no milestones still had a good session — they're learning. The absence of milestones is not a failure indicator. No negative feedback or "you didn't earn any stars" messaging. The milestones are a bonus, not a scorecard. (Note: with effort milestones, the threshold for earning *something* is much lower — any child who writes 3 thoughtful responses or continues after a correction earns one.)
- **FR214.8:** The escalation rung is available in the streaming response metadata, which the client already tracks. No new API data needed for mastery milestones. Effort milestones use client-side message length and rung history (also already available).

### FR218: Session Type and Age Universality

- **FR218.1:** In-session milestones (rung-based AND effort-based) trigger in **all session types**: learning, homework, practice, interleaved. The escalation rung is present in every exchange regardless of mode. A breakthrough is a breakthrough whether it's homework or free learning. A thoughtful response (Deep Diver) is worth recognizing in any context.
- **FR218.2:** Post-session celebrations (topic mastered, EVALUATE/TEACH_BACK success, streaks) trigger for all session types that go through the session-completed Inngest chain. All session types use the same chain — homework included.
- **FR218.3:** Milestone earned indicators display in a fixed header position that works regardless of session mode config. Homework sessions show `showTimer: false` + `showQuestionCount: true` — indicators go next to the question counter (or in a dedicated header slot) instead of next to the timer. The animation overlay covers the full header in all modes.
- **FR218.4:** Celebrations work for **all ages** (child, adolescent, adult). The celestial theme is age-neutral by design (astronomy, not cartoons). The animation is the same; the **toast copy adapts by age bracket** using the same `getAgeVoice()` mechanism:
  - Child (<13): "You had a breakthrough! ⭐"
  - Adolescent (13-17): "Breakthrough — you figured it out!"
  - Adult (18+): "Breakthrough — concept clicked."
- **FR218.5:** Adults without `familyLinks` never see parent dashboard celebrations (no parent dashboard exists for them). Their own celebrations appear on their home screen like anyone else's.
- **FR218.6:** Celebration preferences: a **three-level setting** on the More screen (default: **All**):

  | Setting | Behavior | Who might pick this |
  |---------|----------|-------------------|
  | **All celebrations** (default) | Every milestone fires — Polar Star through Orion's Belt, plus effort milestones | Most users at first, kids who love the animations |
  | **Big milestones only** | Tier 3-4 only (Comet + Orion's Belt) — breakthroughs, mastery, topic mastery, streaks | Teens/adults who find frequent animations distracting but want to know about big achievements |
  | **Off** | No animations. Milestones still tracked in session metadata (for coaching cards) | Anyone who finds all animations distracting |

  Stored as `celebrationLevel: 'all' | 'big_only' | 'off'` on `teachingPreferences` (default: `'all'`). The `useCelebration()` hook checks this before triggering: if `big_only`, skip tier 1-2; if `off`, skip all animations. Milestones are always tracked in metadata regardless of this setting — coaching cards can reference achievements even when animations are suppressed.

### FR215: Parent Dashboard — Honest Engagement Context

- **FR215.1:** `totalTimeThisWeekMinutes` and `totalTimeLastWeekMinutes` in the dashboard reflect **wall-clock time** (`wallClockSeconds`). Exchange counts are shown alongside for engagement context.
- **FR215.2:** Sessions that were crash-recovered (FR211.4) have their wall-clock time computed from `startedAt` to the point of recovery/auto-close.
- **FR215.3:** Sessions with `durationSeconds = null` AND `wallClockSeconds = null` (legacy orphaned sessions from before this change) are excluded from time calculations. They still count in `sessionsThisWeek` count but contribute 0 minutes.
- **FR215.4:** The parent dashboard label: "**X minutes, Y exchanges**" — providing both duration and engagement density. A session with "120 minutes, 2 exchanges" is immediately distinguishable from "45 minutes, 25 exchanges" without needing a second "active time" metric.

### FR216: Silence Detection UX

- **FR216.1:** Silence detection uses **adaptive thresholds** from FR210.8-10. The silence prompt fires when the child has been silent for longer than the current exchange's computed threshold (`expectedResponseMinutes * paceMultiplier`, clamped to 2-20 minutes). The prompt: "Still working on it? Take your time — I'm here when you're ready."
  - The LLM's `expectedResponseMinutes` accounts for task difficulty (quick recall = 2 min, multi-step proof = 12 min).
  - The `paceMultiplier` accounts for this student's pace (slow reader = 2x, fast responder = 0.7x).
  - Combined: a slow student working on a hard problem gets ~24 min before a prompt. A fast student ignoring a simple question gets a prompt at ~2 min. No fixed threshold fits both — the adaptive system does.
- **FR216.2:** The silence prompt is sent at most once per silence period. If the child remains silent after the prompt, no further prompts until they send a message and then go silent again.
- **FR216.3:** The silence prompt does NOT count as an "exchange" for exchange count purposes. It's tracked as `eventType: 'system_prompt'` in sessionEvents.
- **FR216.4:** At 30 minutes of continuous silence (no messages from either side), the session auto-saves and closes server-side (via the Inngest cron in FR211.6). The child sees the recovery card on next app open (FR211.4).

### FR217: Unified Celebration System (Shared Infrastructure)

The six milestone types (4 mastery + 2 effort) are not session-only — they are the **app-wide achievement language**. Any feature across any epic can trigger a celebration using the same components and the same delivery mechanism.

**Two trigger mechanisms, one animation library:**

- **FR217.1: In-session celebrations (client-side, real-time).** The session screen tracks the escalation rung and message metadata from the streaming `onDone` callback and triggers animations immediately when milestone conditions are met. No server round-trip needed — the data is already on the client.

- **FR217.2: Post-session celebrations (server-queued, deferred).** Achievements that are computed asynchronously in the Inngest `session-completed` chain (topic mastered, EVALUATE success, TEACH_BACK success, topic unlocked, streak milestones) are written to a **pending celebrations queue** on the server. The client reads the queue on the next screen load and plays them.

- **FR217.3: Pending celebrations queue.** A `pendingCelebrations` JSONB array field on the `coaching_card_cache` table. Each entry: `{ celebration: string, reason: string, detail?: string }`. No new table — the coaching card is already fetched on every home screen mount.

- **FR217.4: Queue write.** A `queueCelebration(db, profileId, celebration, reason, detail?)` service function. Inngest steps call it when an achievement is detected. The function appends to the JSONB array.

- **FR217.5: Queue read + play.** The coaching card API response includes `pendingCelebrations`. The `useCelebration()` hook on the home screen reads the array, plays animations in sequence (with short delays between), and calls `POST /v1/celebrations/seen` to mark them consumed.

- **FR217.6: Celebration-to-tier mapping.** Each achievement maps to a celestial tier:

  | Tier | Animation | In-session triggers | Post-session triggers (queued) |
  |------|-----------|--------------------|-----------------------------|
  | 1 — Polar Star | Single star pulse | First independent answer (rung 1-2), Deep Diver (3 thoughtful messages) | — |
  | 2 — Twin Stars | Two-star burst | 3 consecutive rung 1-2, Persistent (continues after correction) | EVALUATE success, TEACH_BACK scored well (quality ≥ 4) |
  | 3 — Comet | Streak across screen | Rung drops from 3+ to 1-2 (breakthrough) | Topic mastered (recall passed, quality ≥ 4), topic unlocked (Epic 7 prereq met), 7-day streak |
  | 4 — Orion's Belt | Three connected stars | 5 consecutive rung 1-2 (mastery streak) | Curriculum complete (all topics verified), 30-day streak |

- **FR217.7: Celebration deduplication.** The queue deduplicates by `(celebration, reason)` pair. If a child masters two topics before returning to the home screen, they see two Comets (different `detail`), not one. But if the same topic triggers twice (race condition), only one fires.

- **FR217.8: Queue expiry.** Pending celebrations older than 7 days are silently dropped on read. Stale achievements from a week ago aren't worth interrupting the current session for.

- **FR217.9: Parent dashboard celebrations.** The parent dashboard child detail screen also plays celebrations from the child's queue — filtered to parent-relevant achievements only:
  - **Parent sees:** topic mastered, curriculum complete, EVALUATE success, TEACH_BACK success, streak milestones, topic unlocked (Epic 7)
  - **Parent does NOT see:** Polar Star, Twin Stars, Deep Diver, Persistent (granular in-session moments — too detailed for parent)
  - Filtering: `PARENT_VISIBLE_REASONS` set applied when reading the queue for parent view
  - A parent seeing "Alex mastered Quadratic Equations!" with a Comet animation transforms the dashboard from surveillance into shared celebration.

- **FR217.10: Separate seen states for child and parent.** Marking celebrations as seen is per-viewer, not global. The child seeing their Comet on the home screen doesn't clear it for the parent, and vice versa. Implementation: two timestamp fields on `coaching_card_cache`:
  - `celebrations_seen_by_child` — ISO timestamp of last child read
  - `celebrations_seen_by_parent` — ISO timestamp of last parent read
  - Each viewer only sees entries with `queuedAt > lastSeenTimestamp`

- **FR217.11: Future epics plug in without touching the animation layer.** Epic 7 (topic unlock) just calls `queueCelebration(db, profileId, 'comet', 'topic_unlocked', 'Calculus Intro')`. The animation components, the hook, and the delivery mechanism already exist.

---

## Architecture Decisions

### AD1: Active time is computed on close (internal analytics only)

Computing active time from `sessionEvents` timestamps on session close is simpler and more accurate than maintaining an incrementing counter. The events are already stored — we just need to sum the capped intervals. **Active time is never shown to any user** — it's an internal metric for post-launch engagement analysis.

The per-gap cap uses the LLM's `expectedResponseMinutes` (stored per exchange) × the student's pace multiplier × 1.5 buffer:

```typescript
function computeActiveSeconds(
  sessionStartedAt: Date,
  events: Array<{ createdAt: Date; expectedResponseMinutes?: number }>,
  paceMultiplier: number = 1.0
): number {
  if (events.length === 0) return 0;

  const DEFAULT_CAP_SECONDS = 10 * 60; // 10 min fallback

  let activeSeconds = 0;
  let prevTimestamp = sessionStartedAt.getTime();

  for (const event of events) {
    const gap = (event.createdAt.getTime() - prevTimestamp) / 1000;
    const capSeconds = event.expectedResponseMinutes
      ? Math.min(Math.max(event.expectedResponseMinutes * paceMultiplier * 1.5 * 60, 2 * 60), 20 * 60)
      : DEFAULT_CAP_SECONDS;
    activeSeconds += Math.min(gap, capSeconds);
    prevTimestamp = event.createdAt.getTime();
  }

  return Math.round(activeSeconds);
}
```

### AD2: No checkpoint endpoint — save on message send

Instead of a timed checkpoint interval with a dedicated API endpoint, the crash recovery marker is written to AsyncStorage on each message send. This is simpler (no new endpoint, no `setInterval`), more reliable (writes happen on actual activity), and covers the real crash scenario. The server's `lastActivityAt` is already updated by the exchange endpoint on each message.

### AD3: Milestone animations use the existing Reanimated + SVG stack

All milestone animations use `react-native-reanimated` shared values + `react-native-svg` animated components, matching the existing `BrandCelebration`, `CelebrationAnimation` patterns. No new animation libraries needed. Effort milestones (Deep Diver, Persistent) reuse the Polar Star and Twin Stars animation components at Tier 1 and Tier 2 respectively — no additional animation work.

### AD4: `useCelebration()` hook — registry pattern with two trigger modes

The hook uses a component registry to map celebration names to animation components, and supports two modes of use: imperative (in-session) and queue-based (post-session).

**Registry:**
```typescript
const CELEBRATIONS = {
  polar_star:  { Component: PolarStar,  label: 'Polar Star',  tier: 1 },
  deep_diver:  { Component: PolarStar,  label: 'Deep Diver',  tier: 1 },  // reuses Tier 1 animation
  twin_stars:  { Component: TwinStars,  label: 'Twin Stars',  tier: 2 },
  persistent:  { Component: TwinStars,  label: 'Persistent',  tier: 2 },  // reuses Tier 2 animation
  comet:       { Component: Comet,      label: 'Comet',       tier: 3 },
  orions_belt: { Component: OrionsBelt, label: "Orion's Belt", tier: 4 },
} as const;

type CelebrationName = keyof typeof CELEBRATIONS;

interface CelebrationEntry {
  celebration: CelebrationName;
  reason: string;    // 'breakthrough' | 'topic_mastered' | 'deep_diver' | ...
  detail?: string;   // 'Quadratic Equations' (for the toast)
}
```

**Celebration level filtering:**
```typescript
function shouldPlay(name: CelebrationName, level: 'all' | 'big_only' | 'off'): boolean {
  if (level === 'off') return false;
  if (level === 'big_only') return CELEBRATIONS[name].tier >= 3;
  return true; // 'all'
}
```

**Mode 1: Imperative trigger (in-session).** The session screen calls `trigger()` directly when `useMilestoneTracker()` detects a milestone:

```typescript
const { CelebrationOverlay, trigger } = useCelebration();

// After each exchange, milestone tracker fires:
const milestone = milestoneTracker.check(newRung, messageLength, wasCorrection);
if (milestone) trigger({ celebration: milestone, reason: milestone });

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

Tracks escalation rung and engagement metrics from exchange `onDone` metadata:
- `lastRung`: rung from most recent AI response
- `consecutiveLowRungCount`: count of consecutive rung 1-2 responses
- `hasHadHighRung`: whether any response was rung 3+ (needed for Comet — breakthrough requires a *drop*)
- `longMessageCount`: count of user messages over 50 characters (for Deep Diver)
- `continuedAfterCorrection`: whether user sent a message after a rung 4-5 response (for Persistent)
- `milestonesReached`: set of milestone names already triggered this session (prevents re-fire)
- `check(newRung, messageLength?, wasCorrection?)`: returns the milestone name to trigger, or `null`

No new server-side data needed for in-session detection. Post-session milestones use the pending queue (AD5).

### AD5: Pending celebrations use coaching card cache, not a new table

The `coaching_card_cache` table already has one row per profile, is already fetched on every home screen mount, and already has a `cardData` JSONB column. Adding `pendingCelebrations` JSONB alongside it means:
- Zero additional API calls (piggybacks on existing `GET /v1/coaching-card`)
- One simple `queueCelebration()` function that appends to the array
- One `POST /v1/celebrations/seen` endpoint that marks them consumed
- No new table, no new polling, no WebSocket, no push notification

```typescript
// Inngest step calls this after detecting an achievement
async function queueCelebration(
  db: Database,
  profileId: string,
  celebration: 'polar_star' | 'deep_diver' | 'twin_stars' | 'persistent' | 'comet' | 'orions_belt',
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
await apiClient.celebrations.seen.$post({ json: { viewer: 'child' } });
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
  → Server computes activeSeconds for analytics (adaptive per-gap caps)
  → Server stores durationSeconds (analytics), wallClockSeconds (user-facing), milestonesReached
  → Inngest session-completed chain fires (includes pace baseline update)
  → Client waits up to 3 seconds for fast post-session achievements (topic mastery, EVALUATE)
  → Client navigates to SessionSummaryScreen
  → Summary shows wall-clock time + learning milestones + any fast post-session celebrations
  → Child writes summary or skips → back to home
```

```
App backgrounded / killed / crashed
  → AsyncStorage marker already saved (on last message send)
  → AppState listener writes marker again (belt-and-suspenders)

Within 30 minutes (app foregrounded or cold start):
  → Session still 'active' on server
  → "Pick up where you left off?" card / resume flow
  → [Continue Session] loads chat history, resumes
  → [End & See Summary] closes session, shows summary

After 30 minutes:
  → Inngest cron closes stale sessions
  → On next cold start: "Your session was saved" card → summary
```

### AD8: LLM `expectedResponseMinutes` — adaptive silence threshold

The LLM already returns structured metadata (escalation rung) with each response. Adding `expectedResponseMinutes` is one field in the same response schema:

```typescript
// In streaming response metadata (already exists, one field added)
interface ExchangeMetadata {
  escalationRung: number;          // existing
  expectedResponseMinutes: number; // NEW — LLM estimates how long student needs
}
```

System prompt addition (~2 sentences):
```
After each message to the student, estimate how many minutes they will
reasonably need to respond (integer, 1-20). Consider whether you asked a
quick recall question (1-2), a short calculation or brief explanation (3-5),
a multi-step problem requiring paper work (8-12), or a reading/writing
task (10-15). Output as expectedResponseMinutes.
```

The silence timer reads this instead of a constant:
```typescript
const estimate = lastAiResponse.expectedResponseMinutes ?? 10; // fallback
const threshold = clamp(estimate * paceMultiplier, 2, 20) * 60; // seconds
```

### AD9: Cross-session learned baseline — pace persistence

```typescript
// On session close (in Inngest session-completed chain, new step):
async function updatePaceBaseline(db: Database, profileId: string, sessionEvents: SessionEvent[]) {
  // Compute median response time for this session
  const responseTimes = computeResponseTimes(sessionEvents);
  if (responseTimes.length < 3) return; // Not enough data

  const sorted = [...responseTimes].sort((a, b) => a - b);
  const sessionMedian = sorted[Math.floor(sorted.length / 2)];

  // Exponential moving average with existing baseline (80% old, 20% new)
  const existing = await getTeachingPreferences(db, profileId);
  const newBaseline = existing.medianResponseSeconds
    ? Math.round(existing.medianResponseSeconds * 0.8 + sessionMedian * 0.2)
    : Math.round(sessionMedian);

  await updateTeachingPreferences(db, profileId, { medianResponseSeconds: newBaseline });
}
```

On session start, the baseline initializes the pace multiplier:
```typescript
// Session start: read baseline to seed paceMultiplier
const baseline = teachingPreferences.medianResponseSeconds;
const initialPaceMultiplier = baseline
  ? baseline / (AVERAGE_RESPONSE_SECONDS) // ratio vs assumed average
  : 1.0; // first session ever
```

This eliminates cold-start inaccuracy from session 2 onward. The exponential moving average (80/20 split) means the baseline adapts gradually — one unusual session doesn't swing it dramatically.

---

## Stories

### Story 13.1: Time tracking + wallClockSeconds column + dashboard engagement context

**Scope:** Add `wallClockSeconds` column to `learningSessions`. Refactor `closeSession()` to compute active time from `sessionEvents` timestamps (adaptive per-gap caps) for internal analytics. Dashboard shows wall-clock + exchange count. Pure backend — no UI changes.

**Acceptance criteria:**
- [x] New nullable `wall_clock_seconds` integer column on `learningSessions`
- [x] `computeActiveSeconds()` utility using per-gap caps from `expectedResponseMinutes` × pace multiplier (fallback: 10-min fixed cap)
- [x] `closeSession()` computes `durationSeconds` for internal analytics using capped-interval formula
- [x] `closeSession()` stores `wallClockSeconds = now - startedAt` as user-facing duration
- [x] Sessions with 0 events get `durationSeconds = 0` and `wallClockSeconds = now - startedAt`
- [x] Existing session-lifecycle tests updated
- [x] Dashboard `totalTimeThisWeekMinutes` reflects **wall-clock** time (from `wallClockSeconds`)
- [x] Dashboard includes total exchange count for displayed sessions
- [x] Dashboard label: "**X minutes, Y exchanges**"
- [x] Legacy sessions with `wallClockSeconds = null` fall back to existing `durationSeconds` for display; if that's also null, contribute 0 minutes

**Tests:** Unit test `computeActiveSeconds()` with: normal flow, long gaps (capped), adaptive caps (different per event), single event, zero events, rapid-fire events. Integration test: create session with known event gaps and LLM estimates, close, verify both durationSeconds and wallClockSeconds. Dashboard test: verify wall-clock + exchange count display.

### Story 13.2: Remove hard caps and nudge from session-lifecycle

**Scope:** Simplify `session-lifecycle.ts` — remove hard cap, nudge, and all age-based timer constants. Keep only adaptive silence detection and auto-save (30 min).

**Acceptance criteria:**
- [x] `SessionTimerState` loses `nudgeThresholdSeconds` and `hardCapSeconds`
- [x] `TimerCheck.action` reduced to `'continue' | 'silence_prompt' | 'auto_save'`
- [x] `createTimerConfig()` no longer accepts `personaType` — only needs auto-save threshold
- [x] Fixed silence threshold constants removed (silence is now adaptive per FR210.8-10)
- [x] All hard cap, nudge, TEEN_*, ADULT_* constants removed
- [x] All session-lifecycle tests updated

**Tests:** Update `session-lifecycle.test.ts`. Verify `checkTimers()` never returns `nudge` or `hard_cap`.

### Story 13.3: Crash recovery — AsyncStorage markers + session resumption + stale cleanup

**Scope:** Save crash recovery marker to AsyncStorage on each message send. AppState listener as backup. Cold-start recovery check with **session resumption within 30 minutes**. Inngest cron for stale session cleanup. **No new API endpoint needed** (session data loaded from existing endpoints).

**Acceptance criteria:**
- [x] Recovery marker written to SecureStore after each exchange completes *(implementation note: uses SecureStore instead of AsyncStorage — encrypted, more persistent, better choice)*
- [x] AppState `background`/`inactive` listener writes recovery marker as backup
- [x] SecureStore write happens **before** any network call (ordering critical)
- [x] Foregrounding within 30 min: **session resumes** — chat history loaded from server, session screen restored, "Welcome back" toast
- [x] If last exchange was incomplete (user message, no AI response), discard it — child sends new message
- [x] Foregrounding after 30+ min: session auto-closed, summary screen shown
- [x] Cold start with recovery marker + session still active (< 30 min): **"Pick up where you left off?"** card with [Continue Session] / [End & See Summary]
- [x] Cold start with recovery marker + session already closed (> 30 min or cron-closed): "Your session was saved" card → summary
- [x] Cards are dismissible — child may have intentionally quit
- [x] Recovery marker cleared after recovery, resumption, or dismissal
- [x] Inngest cron runs every 10 min, closes sessions idle > 30 min
- [x] Crash-recovered sessions get `durationSeconds` computed from session events

**Tests:** Unit test: recovery marker read/write. Integration test: simulate AppState transitions. Edge cases: (1) marker exists but session already closed server-side (race); (2) app killed mid-exchange — marker from previous exchange survives; (3) rapid background→foreground — no double-close; (4) stale session closed by cron before app reopens — card shows "session was saved"; (5) resumption loads correct chat history; (6) incomplete last exchange handled gracefully.

### Story 13.4: Celebration animation library + in-session milestone triggers (mastery + effort)

**Scope:** Build the four celestial animation components as a **reusable shared library** in `components/common/celebrations/`. Build `useCelebration()` hook that plays from a queue with celebration level filtering. Wire in-session triggers from escalation rung (mastery milestones) AND engagement metrics (effort milestones). This is the foundation that all future epics (7, 8, etc.) use to trigger celebrations — they just call `triggerCelebration()` or `queueCelebration()`.

**FRs:** FR214 (learning milestones), FR217.1 (in-session triggers), FR217.6 (tier mapping)

**Acceptance criteria:**
- [x] Four animation components in `components/common/celebrations/`: `PolarStar`, `TwinStars`, `Comet`, `OrionsBelt`
- [x] Each component: Reanimated + SVG, `onComplete` callback, `useReducedMotion()` fallback, `testID`
- [x] `useCelebration()` hook: accepts a queue of celebrations, **respects `celebrationLevel` setting** (all/big_only/off), plays in sequence with delay between, fires `onAllComplete`
- [x] `useMilestoneTracker()` hook: tracks escalation rung AND engagement metrics from exchange metadata, returns triggered milestones
- [x] **Mastery milestones (rung-based):**
  - **Polar Star:** First AI response at rung 1-2
  - **Twin Stars:** 3rd consecutive rung 1-2
  - **Comet:** Rung drops from 3+ to 1-2 (breakthrough)
  - **Orion's Belt:** 5th consecutive rung 1-2
- [x] **Effort milestones (engagement-based):**
  - **Deep Diver:** 3rd user message over 50 characters (thoughtful responses) — Tier 1 (PolarStar animation)
  - **Persistent:** User continues after a rung 4-5 correction (didn't give up) — Tier 2 (TwinStars animation)
- [x] Each milestone triggers exactly once per session
- [x] Animations overlay header, don't block chat input
- [x] Persistent earned indicators in fixed header position (max 6 dots) — works regardless of session mode (next to timer, question counter, or standalone)
- [x] `milestonesReached` stored in session metadata on close
- [x] No negative messaging if none earned — absence is neutral
- [x] Celebration registry includes `tier` field for level filtering

**Tests:** Unit test `useMilestoneTracker()`: correct triggers at each rung condition AND engagement condition. Comet only on rung *drop* (not always-low). Deep Diver fires on 3rd long message, not before. Persistent fires after correction + response, not on correction alone. Snapshot: reduced-motion fallback for each component. Component test: each fires once. `useCelebration()` queue test: plays in order. Level filtering test: `big_only` skips tier 1-2, `off` skips all.

### Story 13.5: Adaptive silence detection (LLM estimate + pace calibration + cross-session baseline)

**Scope:** Replace fixed silence threshold with LLM-adaptive system. Add `expectedResponseMinutes` to exchange response metadata. Build per-session pace calibration. Add cross-session learned baseline to `teachingPreferences`. Silence prompt fires at computed threshold. 30-min full silence → auto-close via Inngest cron.

**FRs:** FR210.8-10 (adaptive silence), FR216 (silence detection UX)

**Acceptance criteria:**
- [x] LLM system prompt updated to request `expectedResponseMinutes` (1-20) per response
- [x] Exchange response metadata schema includes `expectedResponseMinutes` (optional integer)
- [x] `expectedResponseMinutes` stored per exchange in `sessionEvents` (for active time computation on close)
- [x] Per-session `paceMultiplier` computed from ratio of actual response times to LLM estimates (median, clamped 0.5-3.0)
- [x] Before 3 exchanges: `paceMultiplier` initialized from cross-session baseline (or 1.0 if no baseline)
- [x] Silence threshold per exchange: `clamp(expectedResponseMinutes * paceMultiplier, 2, 20)` minutes
- [x] Fallback: 10 minutes if `expectedResponseMinutes` missing from response
- [x] Silence prompt appears in chat at computed threshold: "Still working on it? Take your time — I'm here when you're ready."
- [x] Prompt sent at most once per silence period
- [x] Tracked as `eventType: 'system_prompt'`, not counted in exchange count
- [x] No prompt if child is actively typing
- [x] 30 min full silence: session closed by Inngest cron (FR211.6)
- [x] New `medianResponseSeconds` nullable integer field on `teachingPreferences`
- [x] Session-completed Inngest chain: new step computes session median response time, updates `medianResponseSeconds` (exponential moving average: 80% old, 20% new)
- [x] Cross-session baseline used on session start to seed `paceMultiplier`

**Tests:** Unit: `computePaceMultiplier()` with various response time ratios. Unit: silence threshold computation with edge cases (missing estimate, extreme pace multiplier, first session). Unit: exponential moving average baseline update. Integration: simulate 3 exchanges, verify paceMultiplier adjusts. Edge case: LLM returns 1 (quick question) + slow student → threshold still ≥ 2 min. Edge case: LLM returns 20 (hard task) + fast student → threshold doesn't exceed 20 min. Cross-session: verify baseline persists and is read on next session start.

### Story 13.6: "I'm Done" button + summary screen milestone recap + fast celebration catch

**Scope:** Rename "End Session" to "I'm Done". Summary screen shows wall-clock time (encouragement) + learning milestone recap. Add 3-second wait for fast post-session achievements before navigating to summary. No "focused time" shown to child.

**Acceptance criteria:**
- [x] Button: "I'm Done" (was "End Session")
- [x] Alert: "Ready to wrap up?" / "Keep Going" / "I'm Done"
- [x] After session close, show a brief "Wrapping up..." state (3 seconds max)
- [x] During the 3-second wait, check once for fast Inngest results (topic mastery, EVALUATE success typically compute in <2s)
- [x] If a celebration arrives within 3 seconds, include it in the summary screen
- [x] If nothing arrives in 3 seconds, proceed without — home screen queue catches it later
- [x] Summary shows wall-clock time only: "**45 minutes** — great session!"
- [x] No "focused time" or "active time" shown to child (internal analytics only)
- [x] Summary shows milestone recap if any milestones earned:
  - "Polar Star — first independent answer"
  - "Deep Diver — great thoughtful responses"
  - "Comet — you had a breakthrough!"
  - "Orion's Belt — 5 in a row without help!"
- [x] No milestone section if no milestones earned (neutral, not punitive)
- [x] Coaching card generation can reference milestones

**Tests:** Update summary screen tests. Verify wall-clock-only time display. Verify milestone recap renders (including effort milestones). Verify no section when none earned. Test 3-second wait: mock fast Inngest result arriving at 1.5s → appears in summary. Mock no result → summary shows after 3s timeout.

### Story 13.7: Post-session celebration queue + child/parent playback + three-level preferences

**Scope:** Add `pendingCelebrations` JSONB + seen timestamps to `coaching_card_cache`. Build `queueCelebration()` service. Wire Inngest steps. Home screen and parent dashboard both play celebrations (different filters, separate seen states). **Three-level celebration toggle** on More screen. Toast copy adapts by age bracket.

**FRs:** FR217.2-FR217.11 (post-session queue), FR218.4-FR218.6 (age/preference)

**Acceptance criteria:**
- [x] `pendingCelebrations` JSONB field on `coaching_card_cache` (default `[]`)
- [x] `celebrations_seen_by_child` and `celebrations_seen_by_parent` timestamp fields
- [x] `celebrationLevel` enum field on `teachingPreferences`: `'all' | 'big_only' | 'off'` (default `'all'`)
- [x] `queueCelebration(db, profileId, celebration, reason, detail?)` service function (atomic JSONB append)
- [x] Coaching card response includes `pendingCelebrations` filtered by child's `seenByChild` timestamp
- [x] `POST /v1/celebrations/seen` marks seen (accepts `viewer: 'child' | 'parent'`) *(also: `GET /v1/celebrations/pending` route implemented)*
- [x] Inngest wiring:
  - EVALUATE success → Twin Stars
  - TEACH_BACK quality ≥ 4 → Twin Stars
  - Topic mastered (quality ≥ 4, repetitions > 2) → Comet with topic name
  - 7-day streak → Comet
  - 30-day streak → Orion's Belt
- [x] **Child home screen:** plays pending celebrations on mount via `useCelebration()`, respecting `celebrationLevel`
- [x] **Parent dashboard child detail:** plays parent-filtered celebrations (`PARENT_VISIBLE_REASONS` set: topic_mastered, curriculum_complete, evaluate_success, teach_back_success, streak_7, streak_30)
- [x] Parent seeing celebrations doesn't clear them for child, and vice versa
- [x] Toast copy adapts by age: child "You had a breakthrough!", adult "Breakthrough — concept clicked."
- [x] **Three-level celebration toggle on More screen:**
  - All celebrations (default) — every milestone fires
  - Big milestones only — Tier 3-4 (Comet + Orion's Belt) only
  - Off — no animations, milestones still tracked in metadata
- [x] When off: milestones still tracked in metadata (for coaching cards), only animation suppressed
- [x] Queue entries > 7 days silently dropped
- [x] Deduplication: same `(celebration, reason)` pair not queued twice

**Tests:** `queueCelebration()` unit test. Deduplication. 7-day expiry. Separate seen states (child/parent). Parent filter test. API: `POST /celebrations/seen` with viewer param. Inngest integration: queue after EVALUATE success. Three-level toggle: verify `big_only` shows only tier 3-4, `off` shows nothing, milestones tracked in all cases. `celebrationLevel` persisted and read correctly.

---

## Dependency Order

```
Story 13.1 (time tracking)           ─── no deps, pure backend
Story 13.2 (remove hard caps)        ─── no deps, pure backend
Story 13.4 (celebration library)     ─── no deps, pure frontend

Story 13.3 (crash recovery+resume)   ─── depends on 13.1 (active time on close)
Story 13.5 (adaptive silence)        ─── depends on 13.2 (simplified timer state)
Story 13.6 (summary + recap + catch) ─── depends on 13.4 (milestones exist to recap)
Story 13.7 (post-session queue)      ─── depends on 13.4 (celebration components exist) + 13.1 (Inngest chain wiring)
```

Stories 13.1, 13.2, and 13.4 can all be parallelized. Stories 13.6 and 13.7 can be parallelized after 13.4. Total: 7 stories.

---

## Cross-Epic Touchpoints

These are additive changes that don't modify existing epic behavior. No other epic's spec needs updating.

| Touchpoint | What changes | Which epic's code area | Impact |
|-----------|-------------|----------------------|--------|
| LLM response metadata | Add `expectedResponseMinutes` field to exchange streaming response | Epic 2 (session exchange infrastructure) | Additive field. Existing sessions without it use 10-min fallback. |
| `teachingPreferences` table | Add `medianResponseSeconds` (learned pace) + `celebrationLevel` enum | Database package (Epic 1 area) | Two new nullable columns. Zero impact on existing queries. |
| Session-completed Inngest chain | Add step to update pace baseline after session close | Epic 2/3 (already extended by many epics) | One more step appended. Same pattern as XP, embeddings, retention. |
| LLM system prompt | ~2 sentences added to request `expectedResponseMinutes` | Epic 2 (LLM router) | Additive prompt text. No behavioral change to existing responses. |

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
| LLM `expectedResponseMinutes` inconsistent across responses | Clamped to [2, 20] minutes. Pace multiplier smooths out single-exchange noise. 10-min fallback if field is missing. Non-catastrophic failure: prompt comes a few minutes early or late. |
| LLM always returns same value (anchoring) | System prompt gives explicit examples by task type (1-2 for recall, 8-12 for paper work). Monitor distribution post-launch. Fallback to 10-min if variance suspiciously low. |
| Cross-session baseline drifts from model version changes | Exponential moving average (80/20) means baseline is mostly historical. One weird session doesn't swing it. Can be reset per-profile if needed. |
| `expectedResponseMinutes` adds coupling between silence UX and LLM layer | Graceful degradation: missing field → 10-min fallback. LLM changes never crash the silence system — they just make it slightly less adaptive. |
| Active time computation uses stored LLM estimates (non-reproducible) | Active time is internal analytics only — never shown to users. Wall-clock is the source of truth for all user-facing metrics. |
| AppState listener unreliable on Android | AsyncStorage marker from last message send is the primary recovery mechanism. AppState is belt-and-suspenders. Inngest cron is the final fallback. Three layers. |
| Session resumption loads stale chat history | Chat history comes from server (sessionEvents) which is always current. If last exchange was mid-stream, discard it (detect: user message with no paired AI response). |
| Milestone animations jank on low-end Android | `useReducedMotion()` + keep under 100 SVG nodes. Test on Pixel 4a. |
| Orphaned legacy sessions (pre-migration) | FR215.3: exclude null-duration sessions from time calcs. Fall back gracefully. |
| No milestones earned → child feels bad | Mitigated by effort milestones (Deep Diver, Persistent) — any child who writes thoughtful responses or persists after corrections earns something. FR214.7: absence is still neutral, no "0 stars" messaging. |
| Escalation rung not reliably available in streaming metadata | Verify rung is present in existing exchange response. If missing, degrade gracefully — no mastery milestones for that exchange. Effort milestones (message length, persistence) still work without rung. |
| "Unfinished session" card ignored by child | Fine — session already closed by cron. No data loss. |
| Pending celebrations pile up if child doesn't open app | FR217.8: 7-day expiry. Stale achievements silently dropped. |
| Too many celebrations on home screen at once | `useCelebration()` plays sequentially with ~1s delay. Max practical queue: 3-4 after a great session. |
| Coaching card cache race: precompute writes card while queue writes celebration | JSONB append is atomic (`||` operator). No race — different columns of the same row. |
| Celebration fatigue after weeks of daily use | Three-level toggle (all/big_only/off) lets users self-moderate. Registry pattern (AD4) supports swapping animation variants in future without touching trigger logic. Monitor engagement data post-launch. |
| 3-second summary wait feels sluggish | Show a subtle animation ("Wrapping up...") during the wait. If Inngest result arrives at 0.5s, navigate immediately — don't wait the full 3s. Timeout is a ceiling, not a fixed delay. |

---

## What Changed from v1 of This Spec

These changes were made after the initial product review (v1 → v2):

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

## What Changed from v2 — End-User Challenge (v2 → v3)

These changes were made after challenging the spec from the perspective of real end users (child, parent, teen, adult):

| v2 | Changed to (v3) | Why |
|----|-----------------|-----|
| Active time shown to parent, wall-clock to child | **Wall-clock for both + exchange count for parent** | Wall-clock is honest — kids read, write on paper, think. Active time undercounts off-screen learning. Showing different numbers to family members creates dinner-table conflicts. Exchange count gives parents engagement context without a second competing "time" number. |
| Fixed 8-min silence cap | **LLM-adaptive silence** (expectedResponseMinutes × paceMultiplier, clamped 2-20 min) | A quick recall question and a multi-step proof need different wait times. No fixed number fits both. The LLM knows what it asked; actual response times reveal the student's pace. |
| `?` heuristic for silence prompt (prompt only after AI question) | **Adaptive threshold replaces heuristic** | "Does this make sense?" at the end of a 500-word explanation looks like a question but needs 10+ minutes of reading. LLM expectedResponseMinutes captures task intent better than trailing punctuation. |
| Per-session pace calibration only | **Cross-session learned baseline** stored on `teachingPreferences` | Eliminates cold-start problem. From session 2 onward, the system already knows this student is a fast/slow responder. Exponential moving average (80/20) adapts gradually. |
| Mastery-only milestones (rung 1-2 required) | **Effort milestones added** (Deep Diver: 3 thoughtful messages; Persistent: continues after correction) | A child who always needs scaffolding never earns mastery milestones across 20 sessions. Effort milestones ensure every child who tries can earn recognition. Struggling learners need encouragement most. |
| Session auto-closed on crash, "unfinished session" card | **Session resumption within 30 min** — "Pick up where you left off?" with Continue/End options | A crash at minute 5 of a productive session shouldn't destroy the flow. Chat history is in the DB, session is still active. Let the child continue. After 30 min, auto-close (they left). |
| Celebration toggle: On/Off | **Three-level: All / Big milestones only / Off** | Teens/adults who find frequent Polar Stars distracting can switch to "big only" (Comet + Orion's Belt) while still getting breakthrough celebrations. Also partially addresses celebration fatigue. |
| Celebrations default On for everyone, adults might find it patronizing | **Celebrations default On for all ages** (user decision) | The toggle provides an escape hatch. Adults who enjoy celebrations shouldn't miss them by default. Three-level setting gives enough granularity. |
| Post-session celebrations arrive hours late on home screen | **3-second summary wait** catches fast Inngest results (topic mastery typically <2s) | The emotional connection between achievement and celebration matters. 80% of post-session achievements can be caught at the moment they're most meaningful. |
| Teen privacy concern (parent sees every milestone) | **No change** (option 1 — do nothing) | Parent dashboard only shows positive events (topic mastered, streaks, EVALUATE success). This is shared celebration, not surveillance. Zero milestones on the parent dashboard doesn't reveal struggles that session counts don't already show. Building a teen privacy toggle solves a problem that may not exist. |

---

## What Already Exists (no changes needed)

- `SessionTimer` component (will be enhanced with milestone indicators, not replaced)
- `SessionSummaryScreen` (will be extended with milestone recap + 3-second wait)
- `BrandCelebration` / `CelebrationAnimation` (pattern to follow for new animations)
- `session-completed` Inngest chain (triggered by close — works with both manual and crash-recovered close; will get pace baseline step)
- `sessionEvents` table with timestamps (the data source for active time computation and pace calibration)
- Exchange response metadata includes `escalationRung` (the data source for mastery milestone detection)
- `End Session` button with confirmation dialog (copy change only)
- `teachingPreferences` table (will get `medianResponseSeconds` + `celebrationLevel` fields)
