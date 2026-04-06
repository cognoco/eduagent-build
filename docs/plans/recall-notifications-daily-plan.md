# Feature Plan: Smart Recall Notifications + Daily Learning Plan

> **Created:** 2026-04-06
> **Updated:** 2026-04-06 (post adversarial review)
> **Status:** Ready to implement
> **Estimated effort:** ~1-2 days (new functions needed, persona model rework, timezone-aware cron)

---

## Feature 1: Smart Recall-Test Push Notifications

### What
Daily push notifications that contain a micro-recall challenge based on the user's fading topics (SM-2 spaced repetition data). The notification IS the lesson — not a generic "come back and study" reminder.

### Examples by role

**Self-learner (teen, age < 13):**
> "Quick check: What's the Pythagorean theorem? Tap to answer"

**Self-learner (adult):**
> "Your Spanish vocabulary is fading — 3 words need a refresh. 2 minutes."

**Guardian (has family_links as parent):**
> "Zuzana reviewed 3 topics yesterday. 2 more are due today."

### Implementation

**New file:** `apps/api/src/inngest/functions/recall-nudge.ts` (~80 lines)

```
Cron: 0 * * * * (runs every hour, filters to profiles whose local hour ≈ 8 AM)

Step 1: "find-eligible-profiles"
  - Compute the current UTC hour. Derive which timezone offsets correspond to
    local 8 AM right now (e.g., UTC hour 14 → offset UTC+6, local 8 AM).
  - Query profiles WHERE:
    - profiles.timezone offset maps to local ~8 AM (±30 min window)
    - retention_cards.nextReviewAt <= now (JOIN retention_cards, GROUP BY profileId)
    - notification_preferences.pushEnabled = true
    - LEFT JOIN consent_states ON consent_states.profileId = profiles.id
      → WHERE consent_states.status = 'CONSENTED'
         OR consent_states.id IS NULL (adults without consent requirement)
    - getDailyNotificationCount(profileId) < MAX_DAILY_PUSH (3)
  - Group by profileId, count fading topics
  - Return full list (no artificial cap — fan-out handles scale)

Step 2: "fan-out"
  - For each eligible profile, emit an Inngest event:
    `app/recall-nudge.send` with { profileId, fadingCount, topTopicIds }
  - This uses step.sendEvent() for parallel, independently-retryable delivery.

---

**New file:** `apps/api/src/inngest/functions/recall-nudge-send.ts` (~40 lines)

Triggered by: `app/recall-nudge.send` event (one per profile)

Step 1: "send-nudge"
  - Look up topic titles from curriculum_topics for topTopicIds
  - Determine role via resolveProfileRole(db, profileId) (see shared section)
  - Format message using role-aware copy (see below)
  - sendPushNotification() with type: 'recall_nudge'
  - Deep link: mentomate://topic/recall-test?topicId={topicId}
  - On skip (daily cap reached): log { status: 'skipped', reason: 'daily_cap_reached' }

Each profile is an independent Inngest function invocation — retries affect only
that profile, never the batch. This eliminates the duplicate-on-retry problem.
```

> **Why fan-out?** A single step processing N profiles means a retry at profile 50
> re-sends to profiles 1-49. Per-profile events give independent retries and
> parallelism. This matches the existing `quota-reset.ts` pattern.

**Role-aware copy function:**

```typescript
// role is 'guardian' | 'self_learner' — see resolveProfileRole() in shared section
function formatRecallNudge(
  fadingCount: number,
  topTopicTitle: string,
  role: 'guardian' | 'self_learner',
  childName?: string // only populated for guardians
): { title: string; body: string } {
  if (role === 'guardian') {
    return {
      title: 'Review reminder',
      body: `${childName ?? 'Your learner'} has ${fadingCount} topic${fadingCount > 1 ? 's' : ''} due for review today.`,
    };
  }

  if (fadingCount === 1) {
    return {
      title: topTopicTitle,
      body: "This one's starting to fade — a quick check keeps it locked in.",
    };
  }

  return {
    title: `${fadingCount} topics need a refresh`,
    body: `Starting with ${topTopicTitle}. About ${fadingCount * 2} minutes.`,
  };
}
```

**Add notification type:** Add `'recall_nudge'` to the `NotificationPayload['type']` union in `notifications.ts`.

**Register in Inngest index:** Add to `apps/api/src/inngest/index.ts` function list.

### What already exists (no changes needed)
- `sendPushNotification()` in `notifications.ts` — handles token lookup, Expo Push API, daily cap
- `notification_log` table — rate limiting
- `retention_cards.nextReviewAt` — SM-2 scheduling
- `getDailyNotificationCount()` in `settings.ts` — enforces 3/day cap
- Deep linking in Expo Router — `mentomate://` scheme configured
- `recall-test.tsx` route at `(learner)/topic/recall-test`

### What needs to be created
- `getProfileOverdueCount(db, profileId)` — new function in `retention-data.ts` that aggregates overdue retention cards across ALL subjects for a profile. Existing `getSubjectRetention()` is per-subject and requires a `subjectId`.
- `resolveProfileRole(db, profileId)` — new function (see shared section). Queries `family_links` to determine `'guardian' | 'self_learner'`.
- Timezone-bucketed cron query — the hourly cron needs to filter profiles by timezone offset to approximate local 8 AM delivery.
- Fan-out event handler (`recall-nudge-send.ts`) — one Inngest function per profile for idempotent retries.

---

## Feature 2: Daily Learning Plan on Home Screen

### What
A personalized "today's plan" section at the top of the home screen that tells users exactly what to do. Replaces the vague "What are you working on?" with a concrete, actionable plan.

### Examples by role

**Self-learner (teen):**
> **Your plan today**
> - Review 3 fading topics (5 min)
> - Continue: Algebra — Quadratic Equations
> - Streak: 4 days! Keep it going

**Self-learner (adult):**
> **Pick up where you left off**
> - 2 Spanish vocabulary reviews due
> - Continue: Business English — Email Writing
> - 12 topics mastered this month

**Guardian:**
> **Today's overview**
> - Zuzana has 3 reviews due
> - New topic available: Chemistry — Periodic Table

### Implementation

**New file:** `apps/api/src/services/daily-plan.ts` (~80 lines)

```typescript
interface DailyPlanItem {
  type: 'review' | 'continue' | 'new_topic' | 'streak';
  title: string;
  subtitle: string;
  estimatedMinutes?: number;
  route: string; // deep link target
  topicId?: string;
  subjectId?: string;
}

interface DailyPlan {
  greeting: string;       // persona-aware, time-of-day-aware
  items: DailyPlanItem[]; // max 3-4 items
  streakDays: number;
}

export async function getDailyPlan(
  db: Database,
  profileId: string
): Promise<DailyPlan> {
  // Parallel queries:
  const [overdueCount, suggestion, streak, profile, role] = await Promise.all([
    getProfileOverdueCount(db, profileId), // NEW — needs to be created in retention-data.ts
    getContinueSuggestion(db, profileId),  // from progress.ts (lines 450-539)
    getStreakDisplayInfo(db, profileId),    // from streaks.ts
    findProfileById(db, profileId),        // for timezone
    resolveProfileRole(db, profileId),     // NEW — see shared section
  ]);

  const items: DailyPlanItem[] = [];

  // Priority 1: Fading topics (most urgent)
  if (overdueCount > 0) {
    items.push({
      type: 'review',
      title: `${overdueCount} review${overdueCount > 1 ? 's' : ''} due`,
      subtitle: `About ${overdueCount * 2} minutes`,
      estimatedMinutes: overdueCount * 2,
      route: '/(learner)/topic/recall-test',
    });
  }

  // Priority 2: Continue where you left off
  if (suggestion) {
    items.push({
      type: 'continue',
      title: suggestion.topicTitle,
      subtitle: `Continue in ${suggestion.subjectName}`,
      route: `/(learner)/session`,
      topicId: suggestion.topicId,
      subjectId: suggestion.subjectId,
    });
  }

  // Priority 3: Streak motivation
  if (streak.currentStreak > 0) {
    items.push({
      type: 'streak',
      title: `${streak.currentStreak} day streak`,
      subtitle: streak.graceRemaining
        ? `${streak.graceRemaining}h left to keep it`
        : 'Keep it going!',
      route: '/(learner)/home',
    });
  }

  return {
    greeting: getGreeting(role, profile.timezone),
    items: items.slice(0, 4),
    streakDays: streak.currentStreak,
  };
}

function getGreeting(
  role: 'guardian' | 'self_learner',
  timezone: string | null
): string {
  // Use the user's timezone to determine time-of-day, not server clock
  const now = timezone
    ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
    : new Date(); // fallback to UTC if no timezone set
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  if (role === 'guardian') {
    return `Good ${timeOfDay}`;
  }
  // Casual greetings for self-learners (all ages)
  const greetings: Record<string, string[]> = {
    morning: ["Let's get started", "Ready for today?"],
    afternoon: ["Welcome back", "Good to see you"],
    evening: ["Evening session?", "One more round?"],
  };
  return greetings[timeOfDay]![Math.floor(Math.random() * 2)]!;
}
```

**New route:** Add `GET /v1/daily-plan` to API routes (~15 lines, follows existing pattern).

**Mobile integration:** Extend the existing coaching card (`use-coaching-card.ts`) rather than creating a separate component. The daily plan items render as sub-elements below the existing headline in the same card. This avoids two competing greeting elements on the home screen.

```
- Extend useCoachingCard() to fetch daily plan data alongside existing queries
- Plan items appear below the headline as tappable rows
- Each item navigates to the target route on tap
- Empty state: headline becomes "All caught up!" with subtext
  "Explore something new or wait for your next review."
```

**Wire into home screen:** No new component — the existing coaching card section in `home.tsx` already renders `useCoachingCard()`. The plan items extend it.

### What already exists (no changes needed)
- `getSubjectRetention()` in `retention-data.ts` → per-subject overdue card counts
- `getContinueSuggestion()` in `progress.ts` → next topic to study
- `getStreakDisplayInfo()` in `streaks.ts` → streak + grace period
- `precomputeHomeCards()` in `home-cards.ts` → ranking logic (can reuse priority weights)
- `findProfileById()` → profile with timezone field

### What needs to be created
- `getProfileOverdueCount(db, profileId)` — new function in `retention-data.ts`. Aggregates overdue retention cards across ALL subjects for a single profile. Existing `getSubjectRetention()` requires a `subjectId` and only counts one subject.
- `resolveProfileRole(db, profileId)` — see shared section

---

## Shared considerations

### Role model (replaces raw persona)

The existing `personaFromBirthYear()` in `apps/mobile/src/lib/profile.ts` returns `'teen' | 'learner' | 'parent'` based purely on age. **This is wrong for notification copy.** An adult self-learner (age 30) studying Spanish would be classified as `'parent'` and receive third-person guardian copy ("Zuzana has 3 reviews due") instead of personal learning messages.

**New function needed:** `resolveProfileRole(db, profileId)` in `apps/api/src/services/profiles.ts`

```typescript
type ProfileRole = 'guardian' | 'self_learner';

async function resolveProfileRole(
  db: Database,
  profileId: string
): Promise<ProfileRole> {
  // Check if this profile has any child links in family_links table
  const childLink = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.parentProfileId, profileId),
  });
  return childLink ? 'guardian' : 'self_learner';
}
```

- **Self-learner** (any age, no family_links as parent): receives personal first-person copy
- **Guardian** (has family_links as parent): receives third-person overview copy about their linked child(ren)

> **Note:** `personaFromBirthYear()` is mobile-only — it cannot be imported into API code. The role model replaces it for server-side features. If age-based tone adaptation is needed later (e.g., playful for kids vs. professional for adults), that can layer on top of role.

### Timezone (launch requirement — not a follow-up)

The `profiles.timezone` column already exists. Sending push notifications at a fixed UTC hour means minors in certain timezones receive notifications in the middle of the night. This is both a UX problem and a regulatory risk (COPPA, GDPR-K).

**Design:** The recall nudge cron runs **every hour** (`0 * * * *`). Each run filters profiles whose stored timezone maps to a local hour of ~8 AM (±30-minute window to cover half-hour offsets like UTC+5:30). Profiles with no timezone set default to UTC.

For the daily plan API (Feature 2), the greeting function uses the profile's timezone to determine "morning/afternoon/evening" instead of the server clock.

### Rate limiting
Both features respect the existing `MAX_DAILY_PUSH = 3` notifications per day. The recall nudge counts toward this cap alongside trial expiry and review reminders.

### Consent-gated profiles
Consent status lives on the `consent_states` table (not directly on profiles). The cron query must LEFT JOIN `consent_states` on `profileId` and filter:
- `consent_states.status = 'CONSENTED'` — explicitly consented, send notifications
- `consent_states.id IS NULL` — no consent record exists (adult without consent requirement), send notifications
- All other statuses (`PENDING`, `PARENTAL_CONSENT_REQUESTED`, `WITHDRAWN`) — skip

### Edge cases & empty states

**Recall nudge — cap already reached:**
When a user has fading topics but has already received 3 notifications that day from other sources (trial expiry, review reminder, etc.), the existing `getDailyNotificationCount()` check in `sendPushNotification()` silently skips the send. The per-profile send function should log this as `{ status: 'skipped', reason: 'daily_cap_reached' }` for observability, not silently swallow it.

**Recall nudge — no fading topics:**
User has nothing overdue. Cron skips them entirely — no notification sent, no log entry. This is the happy path (they're on top of reviews).

**Recall nudge — user has fading topics but pushEnabled=false:**
Skipped at the `sendPushNotification()` level (existing behavior). No action needed.

**Daily plan — nothing to show:**
When there are no fading topics, no continue suggestion, and no streak, the coaching card headline becomes:
- **Self-learner:** "All caught up! Explore something new or start a fresh topic."
- **Guardian:** "Everyone's on track today."

The card still shows a primary action (e.g., "Browse subjects") so the user is never stranded.

**Daily plan — new user with zero sessions:**
Falls through to the existing cold-start coaching card logic in `use-coaching-card.ts` ("I'm still getting to know you. What are you working on today?"). The plan items section is simply empty — no reviews, no continue suggestion. The cold-start path is already well-tested.

### Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Push token expired/revoked | User reinstalled app or revoked permissions | Nothing (silent skip) | `sendPushNotification()` logs failed ticket; token cleanup job removes stale tokens |
| Expo Push API outage | Expo servers unreachable | Nothing (no notification) | Inngest step retries with backoff (3 attempts). If all fail, logged as `{ status: 'failed', reason: 'expo_api_error' }`. Next day's cron picks up the still-fading topic. |
| Inngest cron fails mid-query | DB timeout on profile aggregation query | Nothing (no notifications sent) | Inngest retries the cron step. Fan-out hasn't happened yet, so no duplicates. |
| Fan-out event handler fails | Per-profile send crashes | Only that profile misses notification | Independent retry per profile. Other profiles unaffected. |
| Daily plan API times out | Slow DB or high latency | Coaching card shows loading spinner → timeout | `TimeoutLoader` component (existing) shows "Couldn't load your plan" + Retry + Go Home |
| Daily plan API 500 | Service error | Error fallback in coaching card | `ErrorFallback` shows error + Retry. Cold-start fallback card renders if fetch fails entirely. |
| Race: cron + manual send exhaust cap | Recall nudge + streak warning both fire in same window | User gets 3 notifications, 4th silently skipped | Acceptable — cap is enforced. Log the skip for observability. |
| User uninstalls app | Orphaned push token | Expo returns `DeviceNotRegistered` | Existing token cleanup removes the token on next failed send. |
| No timezone set on profile | Profile.timezone is null | Notification sent at UTC 8 AM (may be wrong local time) | Acceptable short-term. Log profiles with null timezone. Consider prompting timezone during onboarding. |

---

## Execution checklist

### Shared prerequisites
- [ ] Create `resolveProfileRole(db, profileId)` in `apps/api/src/services/profiles.ts` — queries `family_links` to return `'guardian' | 'self_learner'`
- [ ] Create `getProfileOverdueCount(db, profileId)` in `retention-data.ts` — aggregates overdue retention cards across all subjects for a profile
- [ ] Test: `resolveProfileRole` — profile with family_links as parent → guardian; profile without → self_learner
- [ ] Test: `getProfileOverdueCount` — returns correct aggregate across multiple subjects

### Feature 1: Recall notifications
- [ ] Add `'recall_nudge'` to notification type union in `notifications.ts`
- [ ] Create `apps/api/src/inngest/functions/recall-nudge.ts` (hourly cron, timezone-bucketed query, fan-out via `step.sendEvent()`)
- [ ] Create `apps/api/src/inngest/functions/recall-nudge-send.ts` (per-profile event handler)
- [ ] Register both in `apps/api/src/inngest/index.ts`
- [ ] Add `formatRecallNudge()` to `notifications.ts` (uses role, not age-persona)
- [ ] Implement timezone-bucketed profile query (LEFT JOIN consent_states, filter by local ~8 AM)
- [ ] Test: unit test for cron function logic — timezone bucketing selects correct profiles
- [ ] Test: verify daily cap is respected (fading topics exist, but 3 notifications already sent → skipped with log entry)
- [ ] Test: verify consent-gated profiles are skipped (PENDING, WITHDRAWN, REQUESTED statuses)
- [ ] Test: verify profiles with NO consent_states row are included (adults)
- [ ] Test: verify no notification when no topics are fading
- [ ] Test: guardian role gets third-person copy with child name; self_learner gets first-person copy
- [ ] Test: fan-out produces one event per eligible profile

### Feature 2: Daily learning plan
- [ ] Create `apps/api/src/services/daily-plan.ts`
- [ ] Add `GET /v1/daily-plan` route
- [ ] Extend `use-coaching-card.ts` to include plan items
- [ ] Test: API service unit tests (calls `getProfileOverdueCount`, not `getSubjectRetention`)
- [ ] Test: empty state — no reviews, no suggestion, no streak → "All caught up" with Browse action
- [ ] Test: new user with zero sessions → cold-start fallback
- [ ] Test: greeting uses profile timezone, not server clock
- [ ] Test: guardian role gets formal greeting; self_learner gets casual greeting
