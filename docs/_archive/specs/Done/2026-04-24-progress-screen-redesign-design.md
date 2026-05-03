# Progress Screen Redesign — Phase 2

**Status:** Design / not-yet-implemented
**Date:** 2026-04-24
**Revised:** 2026-04-24 (adversarial review addressed — see `## Revision Log`)
**Author:** Zuzana Kopečná (design), Claude (capture)
**Phase:** 2 of 2
**Prerequisite:** Phase 1 (routing fix for `progress/_layout.tsx` to register `index` as a `Stack.Screen` — ~30min PR, no spec needed) — *plus instrumentation requirements in §8.3*.

---

## 1. Context & Motivation

The current Progress tab is **not rendering its index screen in production**. Because `apps/mobile/src/app/(app)/progress/_layout.tsx` registers only `[subjectId]` as a `Stack.Screen` and omits `index`, the tab lands on the dynamic route with an empty `subjectId` and shows the "No subject selected" fallback built into `[subjectId].tsx:60`. No learner visiting the Progress tab today sees the growth chart, milestones list, saved bookmarks, or subject cards that ship in the codebase.

**Phase 1** (separate, small PR) fixes the routing so the existing index surfaces **and** adds instrumentation so deletion decisions (§2.4) can be validated with real data before Phase 2 ships.

**Phase 2** (this spec) replaces that index with a re-engagement-focused redesign:
- Pure "what needs my attention right now" framing — not "look at your charts"
- One-tap paths back into learning, with a warm, recap-aware opener so the agent *feels* like it remembers the learner
- Retrospective features (growth chart, milestones, saved) are either deleted or moved off the Progress surface

The lift target is re-engagement: reducing the cost from "open the app" → "I'm reviewing" to a single tap whenever possible. This implies the re-engagement path itself must not be slow — see §3.4 for the async opener architecture.

---

## 2. Screen Anatomy

Top-to-bottom on the redesigned `progress/index.tsx`:

1. **Header** — "Progress" h1 + subline "Your learning at a glance"
2. **Three stat cards** (single row, equal width) — day streak / topics-or-words / reviews due
3. **Subjects section** — *only subjects that have ≥1 review due*, or a celebratory empty state when nothing is due
4. **Recent Sessions section** — last 5 completed sessions (regardless of subject)

Anything not listed above is **not** on this screen. Specifically removed from current index: growth chart, milestones list, saved link, vocabulary pill, "Keep learning" bottom CTA, hero block with `heroCopy()`-generated title.

### 2.1 Stat cards

Three stat cards in one flex row (1/3 width each). Each card shows a large value + caption label.

| Card | Data source | Label | Visibility rule |
|---|---|---|---|
| Day streak | `inventory.global.currentStreak` | `"day streak"` (label fixed; value is the integer) | Show only when `currentStreak >= 1`. When `0`, replace card with a "Start today" card whose tap pushes to `/(app)/library` |
| Words retained | `inventory.global.vocabularyMastered` | `"words retained"` | Only when user has ≥1 subject with `pedagogyMode === 'four_strands'` |
| Topics mastered | `inventory.global.topicsMastered` | `"topics mastered"` | **Replaces** "words retained" when no language subjects |
| Reviews due | `reviewSummary.totalOverdue` | `"reviews due"` | Always |

**Color semantics:** reviews-due number renders in `text-danger` when `> 0`, `text-success` when `= 0`, and `text-muted` when the query is in error state with value `"—"` (see §6). Streak and mastery cards use `text-primary` or `text-text-primary` — no color semantics.

**Accessibility:**
- Each card is wrapped in a single `accessibilityRole="button"` (or `"summary"` when non-tappable) with `accessibilityLabel` that concatenates value + caption + semantic state (e.g. `"3 reviews due, action required"` when danger).
- Labels must wrap to a second line rather than truncate when OS-level font scaling exceeds 1.3×. When wrapping would overflow the 1/3-width column on a <360dp device (Galaxy S10e with large accessibility text), the row falls back to a stacked single-column layout (3 cards full-width stacked) via a `useLayoutBreakpoint()` hook.
- Minimum touch target 44×44dp preserved even in the stacked fallback.

### 2.2 Subjects section

Header: `SUBJECTS` (small-caps section label, matching existing convention).

**Content depends on review state:**

- **Has ≥1 subject with reviews due:** List those subjects only, one card per subject. Each card shows:
  - Subject name (bold)
  - Per-subject overdue count: `"{N} due"` in `text-danger`, right-aligned on the top row
  - Progress bar (mastered / total topics) — reuses existing `<ProgressBar>` from `components/progress`
  - Fraction label: `"{mastered}/{total}"` right of the bar
  - Last session relative date: `"Last session: {today | yesterday | N days ago}"`, computed in the learner's device timezone (see §2.5).

  Tap behavior:
  - If exactly **1 topic due** under this subject → navigate to `/(app)/review-recall/[topicId]` (session starts immediately; opener streams in per §3.4)
  - If **>1 topics due** → push to new intermediate topic-list screen at `/(app)/progress/review/[subjectId]`, each row taps into the same review-recall path for that topic

- **No subjects due (all caught up):** Celebratory empty state in place of the list:
  - `"You're all caught up"` headline
  - `"No reviews due right now. Keep exploring or start something new."` subline
  - `"Go to Library"` button → pushes to `/(app)/library`

  The stats + Recent Sessions sections still render above/below.

- **Brand-new user (no subjects at all):** Same celebratory empty-state shape, different copy:
  - `"Ready to start?"` headline
  - `"Pick a subject to begin your first session."`
  - `"Go to Library"` primary button

### 2.3 Recent Sessions section

Header: `RECENT SESSIONS`.

Up to 5 rows. Each row shows:
- Topic title (bold) + right-aligned relative date (`"Today"`, `"Yesterday"`, `"Apr 18"` — device-local timezone)
- Second line: `"{subject} · {duration}m · {xp} XP"`
- Third line: one-line summary from `sessionSummaries.highlight`
- **Row type affordance (new):** rows tap either into a fresh review-recall session OR into a past-session summary. To avoid the "identical affordance, divergent behavior" trap (adversarial finding #7), each row renders one of two visual states:
  - `type: 'review'` → right-side chevron is a **play-forward icon** with `accessibilityLabel` `"Start a review for {topic}"`. Used for learning/interleaved sessions with a stable `topicId`.
  - `type: 'summary'` → right-side chevron is a **document icon** with `accessibilityLabel` `"Open session summary"`. Used for homework without `topicId` (or, defensively, any row where the review-recall target cannot be resolved).

**Filter rules (server-side):**
- `learningSessions.profileId = active profile` (scoped via `createScopedRepository(profileId)` — see §4.5)
- `exchangeCount >= 4` (tighter than the `>= 2` in v1; prevents rows whose "last time you learned X" claim the opener would later make is barely true). Also requires `sessionSummaries.narrative IS NOT NULL OR sessionSummaries.highlight IS NOT NULL` — we only surface a row if the opener will have something non-generic to reference.
- All session types included (learning, homework, interleaved), with per-row `type` computed as above.
- Order by `startedAt DESC`
- Limit 5

**Tap behavior:**
- `type: 'review'` → navigates to `/(app)/review-recall/[topicId]` (same path as the Subjects section).
- `type: 'summary'` → navigates to `/(app)/session-summary/[sessionId]`.

### 2.4 What we remove

- **Growth chart** — deleted from the Progress screen and, **subject to the Phase 1 engagement gate in §8.3**, also deleted from the codebase. Gate criterion defined upfront (not "verify in implementation").
- **Recent milestones list** — removed from Progress screen; becomes a row on the **More** tab under a new "My activity" section. Gate: same §8.3 rule.
- **Saved bookmarks link** — removed from Progress screen; becomes a row on the **More** tab under the same section.
- **Vocabulary pill** — removed from the Progress screen; accessible from the subject-detail page (`progress/[subjectId]`) only.
- **"Keep learning" bottom CTA** — deleted (the whole screen *is* the CTA now).
- **`heroCopy()` helper** — spec owner must grep the helper at spec-approval time; if unused after Phase 2, delete in the same PR. If used elsewhere, leave in place and note the caller.

### 2.5 Dates & timezone

All "relative date" rendering (`"Today"`, `"Yesterday"`, `"3 days ago"`, `"Apr 18"`) is computed from the device's local timezone using the learner's session `startedAt` (stored as UTC ISO). The formatter is a single shared helper `formatRelativeDate(iso: string, now: Date)` colocated with `components/progress/` so Subjects and Recent Sessions use identical rules. Boundary rule: "Today" means same calendar day in device TZ; "Yesterday" means the prior calendar day; 2–6 days uses "N days ago"; 7+ days uses `"MMM D"`.

---

## 3. Warm Recap Opener

The marquee UX change. Instead of dropping the learner into a blank session or a method-picker, the agent opens the session with a brief, age-adapted, recap-aware greeting.

### 3.1 Target experience

Example voice (a 14-year-old learner, topic "Photosynthesis", last session 3 days ago, narrative mentions light and chlorophyll):

> "Hey — last time we got into photosynthesis together, and you picked up how chlorophyll uses light to kick things off. Want me to ask you a few things to see what's stuck, or would you rather lead the way?"

Same learner at age 11 would get the `EARLY_TEEN_VOICE` tone; at age 17, `TEEN_VOICE`; at 25+, `YOUNG_ADULT_VOICE` or `ADULT_VOICE`. The existing `getAgeVoice(ageBracket, birthYear)` in `apps/api/src/services/exchange-prompts.ts` handles this — no new voice logic.

### 3.2 Required doors

| Door | File & location | Current behavior | New behavior |
|---|---|---|---|
| 1 | `components/home/LearnerScreen.tsx:210` "Review topics" IntentCard | Routes to `/(app)/topic/relearn` method-picker | Routes to new `/(app)/review-recall/[topicId]` |
| 2 | `app/(app)/practice.tsx:121` "Review topics" IntentCard | Same method-picker | Same new target |
| 5 | New Progress screen subject tap (1-topic case) and topic-list tap | N/A | Same new target |

**Unchanged (method-picker retained):**
- `app/(app)/topic/[topicId].tsx:224` (door 3)
- `app/(app)/topic/recall-test.tsx:134` (door 4)

Both of these are *post-struggle* entries where "pick a different teaching method" is genuinely what the learner wants.

### 3.3 Data the opener needs

To feel informed, the greeting must reference the learner's actual history on this topic:

- **Topic title** — from `curriculumTopics.title`
- **What was learned last time** — `sessionSummaries.narrative` from the most recent session on this topic (falls back to `highlight` if `narrative` is null, then to retention-state-only copy if neither exists). Narrative staleness cutoff: if the most recent session is older than **30 days**, the narrative reference is dropped and the opener falls back to retention-state-only copy ("It's been a while — let's see what's stuck").
- **Time since last session** — computed from `learningSessions.startedAt`
- **Retention card state** — `retentionCards` row for this topic (how many reps, when it was last reviewed, current ease factor) to color the greeting (e.g. "a while back" vs "just a few days ago")
- **Learner's age/birthYear** — drives tone via `getAgeVoice`

### 3.4 Session-start flow (async, non-blocking)

The v1 draft blocked the session-start HTTP response on the LLM call. This is reversed. The session is created and returned immediately; the opener streams in as a normal assistant turn. This dissolves the latency, idempotency, and envelope-shape divergence issues simultaneously.

```
Client: POST /v1/sessions/start
  headers:
    Idempotency-Key: <uuidv4>      // mandatory for review_recall; 24h dedupe window
  body:
    { subjectId, topicId, startReason: 'review_recall' }

Server:
  1. If Idempotency-Key seen in last 24h → return the original session response unchanged.
  2. Create session (sessionType = 'learning', metadata.startReason = 'review_recall').
  3. Enqueue Inngest event `review.recall.opener.requested` with { sessionId, profileId, topicId }.
  4. Return sessionId + an *empty* exchanges array + `pendingOpener: true` immediately (no LLM blocking).

Inngest worker (review.recall.opener.requested):
  a. Check for a reusable opener in the last 10 minutes for the same (profileId, topicId, contextSignature) — if found, copy-insert that exchange and exit.
  b. Gather recap context (see §3.3).
  c. Call generateReviewRecallOpener().
  d. Insert the result as the first assistant exchange with the envelope shape in §3.5.
  e. On failure, insert the hardcoded fallback (also envelope-shaped) and emit `review.recall.opener.failed` with { sessionId, reason, latencyMs }.

Client: navigates to /(app)/session?sessionId=... immediately.
Client subscribes to the existing session exchange stream. Until the first exchange arrives (or the 8s client-side timeout below fires), the chat renders a "typing…" indicator attributed to the agent.
```

**Client timeouts and cancel:**
- Transient screen `/(app)/review-recall/[topicId]` is not a blocking waiter — it calls `POST /v1/sessions/start` and navigates on the response. If the HTTP call itself takes >5s, the screen shows a **Cancel** button (navigates back to Progress) alongside the spinner. Hard timeout at 15s → error state with "Try again" + "Go Back", per the user's UX Resilience Rules.
- Inside the session screen, if no assistant exchange arrives within 8s, a "Still warming up…" inline banner appears with a **Skip opener** action that posts an empty assistant fallback and unlocks user input.

**Idempotency:** `Idempotency-Key` is required whenever `startReason === 'review_recall'`. Missing key → `400 idempotency_key_required`. Keys stored in a Redis-backed table keyed on `(profileId, idempotencyKey)` with 24h TTL; value is the original response body. Retries within the window return the cached response verbatim.

### 3.5 Envelope contract (mandatory)

Per CLAUDE.md non-negotiable: LLM responses driving UI state-machine decisions MUST use `llmResponseEnvelopeSchema`. The opener offers the learner two paths ("I ask you questions" vs "you lead") — this is a routing decision. Therefore the opener is envelope-wrapped with explicit signal values the client can render as quick-reply chips.

Envelope output shape (validated via `parseEnvelope()` from `services/llm/envelope.ts`):

```xml
<reply>Hey — last time we got into photosynthesis, and you picked up how chlorophyll uses light to kick things off.</reply>
<signals>
  <reviewRecallQuickReplies>
    <chip id="ask_me">Ask me questions</chip>
    <chip id="lead_me">I'll lead</chip>
  </reviewRecallQuickReplies>
</signals>
```

Client renders two chips below the first exchange. Tapping a chip posts a fixed, deterministic user turn (`"Ask me questions."` or `"I'll lead this time."`) so the downstream LLM turn 2 gets a well-formed signal instead of a free-text ambiguity. The chip dismisses after use.

The hardcoded fallback (LLM failure path) uses the **same envelope shape** so no downstream parser needs to branch on success vs. failure:

```xml
<reply>Welcome back! Want to review {topicTitle} together? I can ask questions, or you can lead.</reply>
<signals>
  <reviewRecallQuickReplies>
    <chip id="ask_me">Ask me questions</chip>
    <chip id="lead_me">I'll lead</chip>
  </reviewRecallQuickReplies>
</signals>
```

Schema addition to `@eduagent/schemas`: extend `llmResponseEnvelopeSchema` signals with a `reviewRecallQuickReplies` field (optional array of `{ id: 'ask_me' | 'lead_me'; label: string }`).

Per CLAUDE.md non-negotiable, envelope signals must be backed by a hard server-side cap so the flow terminates even if the LLM never emits the signal. Cap: if turn 1 is not recognized as a chip reply within 60s of the opener being posted, the chips are dismissed automatically and the normal chat loop continues.

### 3.6 Prompt shape

Pure prompt skeleton (actual wording tuned in implementation + eval):

```
<system>
<role>You are re-engaging a learner you've worked with before.</role>
{getAgeVoice(ageBracket, birthYear)}

<context>
  <topic>{topicTitle}</topic>
  <daysSinceLastSession>{N}</daysSinceLastSession>
  <lastSessionNarrative>{escapedNarrative}</lastSessionNarrative>
  <retentionState>
    <reps>{N}</reps>
    <lastReviewed>{relative}</lastReviewed>
  </retentionState>
</context>

<task>
Respond with a valid response envelope. The <reply> body is ONE message, 1–3 sentences, no greeting emoji, no exclamation-heavy praise:
1. Acknowledge you remember them
2. Name the topic and one specific thing they learned last time
3. Do NOT pose the two-path question in prose — that is carried by the signal chips, not the reply text

Always include the <signals><reviewRecallQuickReplies> block exactly as specified.
</task>
</system>
```

### 3.7 Fallback when data is missing

| Missing data | Fallback |
|---|---|
| `narrative` and `highlight` both null OR last session >30 days old | Skip the "you learned Y" clause; use retention-state-only copy ("Last time was a few days ago" / "It's been a while") |
| Last session has no `topicId` (homework) | Should never happen — review-recall is only routed from topic-scoped surfaces. Defensive server-side check: reject with `400 review_recall_requires_topic_id` |
| LLM call fails | Envelope-shaped hardcoded fallback (see §3.5) written by the Inngest worker; `review.recall.opener.failed` emitted |
| `birthYear` missing | `getAgeVoice` falls back to `TEEN_VOICE` via existing bracket-only branch |

### 3.8 Quota, rate limiting, and dedup

Opener generation is LLM-expensive and initiated by a single tap. To prevent runaway cost:

- **Reuse window:** the Inngest worker first checks for a reusable opener in the last 10 minutes for the same `(profileId, topicId, contextSignature)`. If found, it reuses the text instead of calling the LLM again. `contextSignature` is a server-computed SHA-256 of `(topicId, lastSessionId, narrative, retentionCard.reps, retentionCard.lastReviewedAt, ageBracket)`. Kept server-side only — not exposed in request or response schemas.
- **Per-profile rate limit:** at most **10 successful opener generations per profile per hour**, enforced at the Inngest worker before the LLM call. Over the limit → fall through to the envelope-shaped hardcoded fallback (no LLM call) and emit `review.recall.opener.throttled`.
- **Quota accounting:** opener generations do **not** count against the learner's daily/monthly session quota (§ `pricing_dual_cap.md`) — they are an agent-initiated greeting, not a learner-initiated LLM turn. They do count against a separate internal "opener LLM calls" metric surfaced in the telemetry dashboard, so cost can be monitored.

---

## 4. Backend Changes

### 4.1 New endpoint — per-subject overdue counts

Today's `GET /v1/progress/review-summary` returns the global `totalOverdue` + the single `nextReviewTopic`. The new Subjects section needs overdue counts **per subject**.

**Approach:** Extend `review-summary` to include a capped `bySubject` array:

```typescript
// Response shape (new)
{
  totalOverdue: number;
  nextReviewTopic: NextReviewTopic | null;
  nextUpcomingReviewAt: string | null;
  bySubject: Array<{
    subjectId: string;
    subjectName: string;
    overdueCount: number;
    singleTopic: NextReviewTopic | null;  // set when overdueCount === 1
  }>;  // max 10 entries, sorted by overdueCount DESC then subjectName ASC
  bySubjectTruncated: boolean;            // true when >10 subjects have overdue reviews
}
```

Cap rationale: beyond 10 subjects-with-overdue on a single screen, per-card rendering loses meaning; if `bySubjectTruncated` is true the UI appends a "See all" row that pushes to a dedicated `/progress/review` list (already specified in §5.1 for `>1 topics due`).

**Cache invalidation contract:** completing a review (any path that writes a `reviewCompletion` row) must invalidate the `['reviewSummary', profileId]` query via `queryClient.invalidateQueries`. The mutation hooks for review completion live in `hooks/use-submit-review.ts`; add the invalidation there.

**Implementation:** `getProfileOverdueCount` in `services/retention-data.ts:286` already has the raw cards; add `getProfileOverdueCountsBySubject` returning the grouped shape. **Must use `createScopedRepository(profileId)`** (see §4.5).

### 4.2 New endpoint — recent sessions (self)

`GET /v1/sessions/recent?limit=5` — no existing self-facing sessions list endpoint. Shape mirrors the parent-facing `getChildSessions` in `services/dashboard.ts:919` but scoped via `createScopedRepository(profileId)` (see §4.5), with `exchangeCount >= 4` AND (`narrative IS NOT NULL` OR `highlight IS NOT NULL`) as the filter.

Response:
```typescript
{
  sessions: Array<{
    sessionId: string;
    subjectId: string;
    subjectName: string | null;
    topicId: string | null;
    topicTitle: string | null;
    startedAt: string;
    wallClockSeconds: number;
    xpEarned: number;
    highlight: string | null;
    sessionType: 'learning' | 'homework' | 'interleaved';
    rowType: 'review' | 'summary';  // server-computed, matches §2.3 affordance
  }>;
}
```

Schema added to `packages/schemas/src/sessions.ts` (verified path in repo) as `recentSessionSchema` + `recentSessionsResponseSchema`.

### 4.3 New endpoint — start review-recall session

Extend the existing session-start route to accept `startReason: 'review_recall'`:

`POST /v1/sessions/start` — body gains optional `startReason` field; header `Idempotency-Key` becomes mandatory when `startReason === 'review_recall'`. Server behavior:

1. Caller must provide `subjectId` + `topicId` (validated; reject `400 review_recall_requires_topic_id` if missing).
2. Server checks Idempotency-Key; returns cached response if already seen.
3. Session is created with `sessionType: 'learning'` (unchanged) and `metadata.startReason: 'review_recall'` **persisted** so opener events can be queried historically.
4. **Response returns immediately** with `sessionId`, empty `exchanges: []`, and `pendingOpener: true`. Opener is generated asynchronously by an Inngest worker (§3.4).

Schema addition to `sessions.ts`:
```typescript
export const startReasonSchema = z.enum(['normal', 'review_recall']);
// Persisted on learningSessions.metadata.startReason (JSON column) — indexed via GIN for "count review-recall sessions in the last 7 days" queries.
```

### 4.4 New service — generateReviewRecallOpener

`apps/api/src/services/review-recall-opener.ts`:

```typescript
export async function generateReviewRecallOpener(
  db: Database,
  profileId: string,
  topicId: string,
): Promise<{ envelopeXml: string }>
```

- Pulls: topic title, last session's narrative/highlight (if <30 days old), retention card state, profile birthYear/ageBracket.
- Computes `contextSignature` (server-side only, never leaves the service) for reuse dedup.
- Checks 10-minute reuse window; returns cached envelope XML if hit.
- Checks per-profile hourly rate limit (10/hr); on exceed, returns the envelope-shaped fallback without calling the LLM.
- Otherwise builds the prompt via `buildReviewRecallPrompt()` (pure helper, extracted for unit testing), calls `routeAndCall(...)` from `services/llm/router.ts`, validates output via `parseEnvelope()`.
- Returns envelope XML ready to insert as the first assistant exchange.
- On LLM failure, throws `LlmRecallOpenerError` — the Inngest worker catches and writes the hardcoded envelope fallback.

**Eval fixture:** extend the existing 5-profile harness matrix in `apps/api/eval-llm/` (ages 11, 13, 14, 15, 17 per `MEMORY.md`) with a `review_recall_opener` scenario per profile — no new fixtures created, existing profiles get one more scenario each. Snapshots validate (a) voice differs correctly across age brackets, (b) the reply references the correct topic + narrative, (c) the envelope parses and contains the two required chips.

### 4.5 Scoped-repository enforcement (non-negotiable)

Per `CLAUDE.md`: "Reads must use `createScopedRepository(profileId)`." This spec pins the contract for the three new reads:
- `getProfileOverdueCountsBySubject(profileId)` — reads via `createScopedRepository(profileId)`.
- `getRecentSessionsForProfile(profileId, limit)` — reads via `createScopedRepository(profileId)`.
- Opener data-gather in `generateReviewRecallOpener` — reads via `createScopedRepository(profileId)`.

Break-tests in §7.3 verify cross-profile leakage is prevented.

---

## 5. Mobile Changes

### 5.1 New screen files

- `app/(app)/progress/index.tsx` — **rewritten** (replaces current content entirely)
- `app/(app)/progress/review/[subjectId].tsx` — new; intermediate topic-list when a subject has >1 topics due (also used as the "See all" target when `bySubjectTruncated` is true)
- `app/(app)/review-recall/[topicId].tsx` — new; transient screen that calls `POST /v1/sessions/start` with an `Idempotency-Key` generated per mount, shows spinner, **and shows a Cancel button after 5s**. Hard timeout at 15s → error state with "Try Again" + "Go Back". On success, redirects to `/(app)/session?sessionId=...`.

Register all three in the appropriate `_layout.tsx` files (`progress/_layout.tsx` for the first two, top-level `(app)/_layout.tsx` for review-recall).

### 5.2 New hooks

- `useReviewSummary()` already exists — extend its return type to include `bySubject` + `bySubjectTruncated`.
- `useRecentSessions(limit = 5)` — new hook, `queryKey: ['sessions', 'recent', profileId, limit]`, `staleTime: 2 * 60 * 1000`.
- `useStartReviewRecall(topicId)` — new mutation hook; generates a fresh `Idempotency-Key` (uuidv4) per invocation; wraps `POST /v1/sessions/start` with `startReason: 'review_recall'`; on success pushes to `/(app)/session`.
- **Cache invalidation:** the existing `useSubmitReview` mutation gains `onSuccess: () => queryClient.invalidateQueries(['reviewSummary', profileId])` so completing a review refreshes the Subjects section.

### 5.3 New components

- `components/progress/ReviewDueSubjectCard` — replaces the generic `SubjectCard` for the new Subjects section. Different shape (overdue badge, simpler subline, no accordion).
- `components/progress/StatCard` — small presentational component for the three top stats. Handles color semantics (danger/success/neutral/muted-for-error) and the stacked large-text fallback described in §2.1.
- `components/progress/RecentSessionRow` — presentational row for each session in the list. Renders the `review` vs `summary` affordance from §2.3.
- `components/progress/AllCaughtUpEmpty` — the celebratory empty state when no subjects are due.
- `components/session/ReviewRecallQuickReplies` — renders the two chips from the envelope signal; mounts only when the opener exchange carries `reviewRecallQuickReplies`; dismisses itself after tap or 60s.

All five are persona-unaware (semantic tokens only, no colorScheme checks, no hardcoded hex).

### 5.4 Door 1 + 2 re-wiring

- `components/home/LearnerScreen.tsx:210` — change `router.push({ pathname: '/(app)/topic/relearn', ... })` to `router.push({ pathname: '/(app)/review-recall/[topicId]', ... })`
- `app/(app)/practice.tsx:121` — same change

Keep doors 3 + 4 (topic detail, recall-test) untouched — they still go to the method-picker.

### 5.5 More tab additions

Under a new "My activity" section heading in `app/(app)/more.tsx`, add:
- `SettingsRow` for Saved explanations → `/(app)/progress/saved`
- `SettingsRow` for Milestones → `/(app)/progress/milestones`

Placement: immediately after the existing "What My Mentor Knows" section, before "Family". The `progress/saved.tsx` and `progress/milestones.tsx` files remain where they are — only the entry points change.

### 5.6 Deletions (gated by §8.3)

After the Phase 1 engagement gate confirms low usage:
- Delete `components/progress/GrowthChart.tsx` + co-located test
- Remove `GrowthChart` from `components/progress/index.ts` barrel
- If `useProgressHistory` has no callers outside growth chart (grep-verified at implementation time), delete it too; otherwise leave and document the remaining caller

---

## 6. Failure Modes Table

Per `~/.claude/CLAUDE.md` UX Resilience Rules — every state must have at least one user action.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Inventory query loading | First tab visit | Skeleton for stats + subjects | Pull-to-refresh retries |
| Inventory query failed | 500 / network | `<ErrorFallback>` card replacing Subjects section; stats + recent sessions still render if their queries succeeded | "Try Again" retries inventory query; "Go Home" navigates to home |
| Review-summary query failed | 500 / network | Subjects section shows error card, not stale or empty state; reviews-due stat shows `"—"` in `text-muted` (explicit "unknown", not `0`) | "Try Again" retries |
| Recent-sessions query failed | 500 / network | Recent Sessions section shows compact error card | "Try Again" retries just that query |
| No subjects at all | New user | Empty-state card with "Ready to start?" copy | "Go to Library" button |
| All caught up | No overdue reviews | Empty-state card with "You're all caught up" copy | "Go to Library" button |
| Streak = 0 | New user or broken streak | "Start today" card in place of streak card | Tap pushes to `/(app)/library` |
| Tap review target, review-recall start slow (5–15s) | LLM worker back-pressure, network latency | Transient screen shows spinner + **Cancel** button after 5s | Cancel returns to Progress; Try Again retries with a fresh Idempotency-Key |
| Tap review target, review-recall start times out (>15s) | Network or server hang | Transient screen error state: "Couldn't start your review" | "Try Again" and "Go Back" actions |
| Tap review target, session created but opener not yet arrived | Worker queue delay | Session chat shows "typing…" then after 8s an inline banner "Still warming up…" with **Skip opener** button | Skip inserts a neutral greeting and unlocks input |
| Warm-opener LLM call fails | Provider outage / timeout | Inngest worker inserts envelope-shaped fallback transparently | Session continues normally; `review.recall.opener.failed` event emitted for alerting |
| Opener rate-limit exceeded | >10 openers in the hour for this profile | Envelope-shaped fallback used instead of LLM | Session continues normally; `review.recall.opener.throttled` event emitted |
| Duplicate start request (retry) | Flaky network | Idempotency-Key dedup returns the original session | User sees their existing session; no duplicate opener |
| Recent session is homework with no topicId | DB state | Row renders with `type: 'summary'` (document icon); tap opens session-summary | Back button returns to Progress |
| Stale cache | User returns to tab after background time | Data may be up to 2min stale (staleTime: 120s) | Pull-to-refresh; invalidation on review completion |
| a11y large text overflows stat row | User OS font scale ≥ 1.3× on <360dp device | Stat row reflows to stacked single-column | All stat cards remain tappable |

---

## 7. Testing

### 7.1 Mobile tests

- `progress/index.test.tsx` — rewrite to cover: (a) loading, (b) error, (c) no-subjects empty, (d) all-caught-up empty, (e) has-due-subjects render, (f) 1-topic-due tap → review-recall, (g) >1-topics-due tap → topic-list push, (h) language vs non-language stat card swap, (i) streak = 0 swaps in the "Start today" card, (j) reviews-due query error shows `"—"` not `0`, (k) large-text breakpoint triggers stacked layout
- `progress/review/[subjectId].test.tsx` — new; topic-list render + tap
- `review-recall/[topicId].test.tsx` — new; (a) immediate success redirect, (b) 5s reveals Cancel button, (c) 15s times out with Try Again + Go Back, (d) retry uses a fresh Idempotency-Key
- `components/progress/StatCard.test.tsx` — color semantics (danger/success/muted), zero vs positive values, a11y label
- `components/progress/ReviewDueSubjectCard.test.tsx` — overdue badge render, press events
- `components/progress/RecentSessionRow.test.tsx` — both row types render with the correct icon + a11y label; `type: 'summary'` navigates to session-summary; `type: 'review'` navigates to review-recall
- `components/progress/AllCaughtUpEmpty.test.tsx` — button press navigates to library
- `components/session/ReviewRecallQuickReplies.test.tsx` — chip tap posts the deterministic user message; 60s auto-dismiss; envelope absent → component does not mount
- `components/home/LearnerScreen.test.tsx` — existing test updated to assert new route target for Review card
- `app/(app)/practice.test.tsx` — existing test updated similarly

### 7.2 API tests

- `services/review-recall-opener.test.ts` — prompt-building pure tests (fixture-based); reuse-window cache hit path; rate-limit path returns fallback without calling LLM; envelope output validates against schema
- `services/review-recall-opener.integration.test.ts` — against real DB: enqueue event → worker runs → verify first exchange written with correct role, metadata, and envelope shape; rerun with same `contextSignature` within 10min asserts reuse (no second LLM call)
- `routes/progress.test.ts` — extended `review-summary` response shape covering `bySubject` grouping, 10-entry cap, `bySubjectTruncated` flag
- `routes/sessions.test.ts` — new `/sessions/recent` endpoint tests covering auth, filter (`exchangeCount >= 4` AND narrative/highlight present), `rowType` computation, limit, order
- `routes/sessions.test.ts` — `startReason: 'review_recall'` path: missing Idempotency-Key → 400; duplicate key within 24h → cached response; session created with `metadata.startReason = 'review_recall'` persisted; response has `pendingOpener: true` and empty exchanges; Inngest event enqueued; missing topicId → `400 review_recall_requires_topic_id`
- Eval harness extension: `review_recall_opener` scenario added to all 5 existing fixture profiles (ages 11, 13, 14, 15, 17) with `emitsEnvelope: true`

### 7.3 Integration & break tests

Per `~/.claude/CLAUDE.md` Fix Verification Rules:

- **Break test for door-routing change** [verified-by: `LearnerScreen.test.tsx:"does not route to legacy /topic/relearn"`]: assert that tapping Review card on Home/Practice does NOT route to `/(app)/topic/relearn`
- **Break test for per-subject overdue scope** [verified-by: `progress.integration.test.ts:"bySubject scoped to profile"`]: create 3 retention cards across 2 subjects for profile A and 2 cards for profile B; assert profile A's `bySubject` returns A's counts only and does not leak B
- **Break test for recent sessions scope** [verified-by: `sessions.integration.test.ts:"recent scoped to profile"`]: create sessions for profiles A and B; assert profile A's `/sessions/recent` omits profile B
- **Break test for envelope enforcement** [verified-by: `review-recall-opener.test.ts:"rejects non-envelope LLM output"`]: mock LLM returning plain text → service throws; worker writes fallback envelope
- **Break test for idempotency** [verified-by: `sessions.test.ts:"idempotency dedups review_recall start"`]: two POSTs with same key within 24h return identical response body and create only one session

---

## 8. Rollout

### 8.1 Order of work (Phase 2)

Phase 2 ships as **two PRs** (revised from "one PR" for deploy safety):

**PR A — Backend + schema (deploys first):**
- Extend `review-summary` with `bySubject` (additive, old clients ignore the field)
- Add `/sessions/recent` endpoint
- Add `startReason: 'review_recall'` + Idempotency-Key enforcement to session-start
- Add `generateReviewRecallOpener` service + Inngest worker
- Extend `llmResponseEnvelopeSchema` with `reviewRecallQuickReplies` signal
- Eval fixture extension
- Ship and verify in staging. All changes are additive — old mobile clients continue to work.

**PR B — Mobile (deploys after PR A is live):**
- New hooks + schemas
- New components (incl. `ReviewRecallQuickReplies`)
- Rewrite `progress/index.tsx`
- Add topic-list screen
- Add review-recall transient screen
- Re-wire doors 1 + 2
- Move saved + milestones entry points to More tab
- Delete growth chart (contingent on §8.3 gate)

The staged order gives us a working backend under test before any client change lands, and avoids the "app depends on endpoints that 404" trap.

### 8.2 Rollback

- **PR A (backend):** additive (new fields, new endpoints, new enum value, new envelope signal). Rollback = revert the PR; old clients unaffected because they never used the new fields. The `metadata.startReason` column is JSON and any persisted `'review_recall'` values become orphan metadata — harmless.
- **PR B (mobile):** file rewrite + deletions. Rollback = revert the PR. If `GrowthChart` was deleted and we need it back, restoration is a `git revert` of that specific commit.

No data loss in either direction. Non-destructive migration.

### 8.3 Phase 1 timing & instrumentation gate

Phase 1 (the `progress/_layout.tsx` routing fix) ships **before** Phase 2 work begins. Phase 1 is expanded beyond the 30-minute routing fix to include:

1. Add mixpanel/amplitude events (or whichever analytics surface the app already uses) for: `progress.growth_chart.viewed`, `progress.milestones.viewed`, `progress.saved.viewed`, `progress.vocabulary_pill.tapped`. Wire these on mount / tap in the existing components.
2. Run for a minimum of **7 calendar days** in production with active users.

**Gate decision (applied at Phase 2 spec-approval time):**
- If `progress.growth_chart.viewed` unique-users-per-day < 5% of Progress-tab DAU → delete growth chart as planned.
- If `progress.milestones.viewed` taps/day < 10% of Progress-tab DAU → move to More tab as planned.
- If either threshold is exceeded → re-open this spec before starting Phase 2; deletion decisions are then revisited with data.

Thresholds are intentionally low — we are not asking for proof of heavy engagement, only proof that deletion isn't ripping out a feature users *are* using.

---

## 9. Out of Scope

Explicitly **not** in this spec:

- Redesigning the subject-detail screen (`progress/[subjectId].tsx`) — stays as-is
- Redesigning the saved-explanations screen (`progress/saved.tsx`) — just moves its entry point
- Redesigning the milestones screen (`progress/milestones.tsx`) — same
- Replacing the method-picker at `topic/relearn.tsx` — doors 3 and 4 keep it
- Parent-facing progress screens (`dashboard`, child reports) — separate codepaths, unchanged
- Vocabulary screen (`progress/vocabulary.tsx`) — stays reachable from subject-detail only
- Streak / XP / celebration logic changes — this screen only *reads* those values
- Internationalization — English-only per `market_language_pivot.md`

---

## 10. Open Questions

Tracked but non-blocking:

- **Stat card "words retained" label for non-language swap:** "topics mastered" vs "reviews completed" — decision: topics mastered (matches the domain noun in the rest of the app). Revisit if eval testing shows learners misread the caption.
- **Should opener reuse window be per-profile or per-device?** Current spec: per-profile. If a family shares a device and switches profiles often, 10min might be too tight on top of a 10/hr rate cap. Revisit after first week of production data.

---

## Revision Log

**2026-04-24 (second pass, post-adversarial-review):** addressed 20 findings from the adversarial review pass. Key material changes:

1. Opener flow flipped from synchronous LLM-blocking to async Inngest worker with streaming delivery (§3.4).
2. Opener now wraps in `llmResponseEnvelopeSchema` with `reviewRecallQuickReplies` signal — no more free-text binary-choice parsing (§3.5).
3. Idempotency-Key header required on review_recall session start; 24h dedup window (§3.4).
4. `metadata.startReason` explicitly persisted for observability queries (§4.3).
5. `bySubject` capped at 10 with `bySubjectTruncated` flag + cache invalidation contract on review completion (§4.1).
6. Scoped-repository contract pinned for all three new reads (§4.5).
7. Recent Sessions rows get explicit `review`/`summary` row-type affordance to prevent identical-looking taps with divergent behavior (§2.3).
8. Transient review-recall screen gets a 5s Cancel + 15s hard timeout per UX Resilience Rules (§5.1, §6).
9. LLM-failure fallback now uses the same envelope shape as the success path (§3.5).
10. Streak = 0 renders a "Start today" card instead of a zero-value card (§2.1).
11. Accessibility & large-text breakpoint rules added for stat row (§2.1).
12. Growth-chart deletion gated on an explicit Phase 1 instrumentation threshold rather than "verify in implementation" (§8.3).
13. Phase 1 scope expanded to include the instrumentation that makes the deletion gate measurable (§8.3).
14. Opener dedup (10-min reuse window) + per-profile hourly rate limit added (§3.8).
15. Eval fixtures extended on the existing 5 profiles (ages 11, 13, 14, 15, 17) rather than adding 3 new ones (§4.4).
16. Recent Sessions filter tightened from `exchangeCount >= 2` to `>= 4` with narrative/highlight presence required (§2.3, §4.2).
17. `contextSignature` moved server-side only, not in request/response schemas (§3.8, §4.4).
18. Opener generations isolated from learner session quota but tracked in an "opener LLM calls" cost metric (§3.8).
19. "Latency degradation" rows added to Failure Modes (§6).
20. Rollout split into two PRs (PR A backend, PR B mobile) instead of one, with additive-schema compatibility window (§8.1).
