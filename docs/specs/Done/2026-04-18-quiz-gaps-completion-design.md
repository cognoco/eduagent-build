# Quiz Gaps Completion Design

> Closes the remaining gaps in the quiz system: missed-item surfacing, spaced-repetition mastery for capitals and Guess Who, and Phase 5 post-launch enhancements.

Companion to: `2026-04-16-quiz-activities-design.md`

## 1. Context

Phases 1-3 of the quiz system shipped: Capitals, Vocabulary, and Guess Who are fully playable. Phase 4 coaching card (`quiz_discovery`) was just wired. Three gaps remain:

| Gap | Impact |
|---|---|
| Missed items never marked as `surfaced` | Same coaching card reappears indefinitely |
| No SM-2 retention for capitals/Guess Who | Mastery questions are always pure discovery — no spaced review |
| Phase 5 enhancements unspecified | Difficulty adaptation, round history, free-text unlock, personal bests |

## 2. Surfacing Mechanism

### Problem

`quiz_missed_items` rows are created on wrong discovery answers. The `quiz_discovery` coaching card reads unsurfaced items. But nothing ever marks items as `surfaced`, so the same card keeps regenerating.

### Design

**New endpoint:** `POST /quiz/missed-items/mark-surfaced`

```typescript
// Body
{ activityType: QuizActivityType }
```

**Behavior:**
- Marks all unsurfaced `quiz_missed_items` rows for the given `(profileId, activityType)` as `surfaced = true`
- Returns `{ markedCount: number }`
- Scoped through `createScopedRepository` — profile isolation enforced at DB layer

**Client integration:**
- When the learner taps the quiz discovery intent card on the home screen: fire the mutation, then navigate to quiz
- When the learner dismisses the card: fire the mutation with no navigation
- New hook: `useMarkQuizDiscoverySurfaced` mutation in `use-coaching-card.ts`

### Relationship to round content

**The card is a nudge, not a seed.** Tapping the card does not make the next round's content biased toward previously missed items. The round generator uses its existing mix of discovery + mastery (from `quiz_mastery_items`) without consulting `quiz_missed_items`. The missed items only drive *whether* the coaching card is shown, not *what* appears in the round.

This decouples the surfacing mechanism from round generation and avoids a race: marking items surfaced before round generation cannot accidentally strip seed data, because there is no seed data to strip.

If we ever want tapping the card to bias the round (e.g., "re-quiz the things you missed"), that becomes a separate feature with its own design — not an implicit side-effect of surfacing.

### Why mark on user action, not on card precomputation

If we mark during precomputation, items get consumed even if the learner never opens the app. Marking on user action means:
- Items only get consumed when the learner actually sees the nudge
- A coaching card that's precomputed but never shown doesn't burn items

### Backfill for existing data (required before deploy)

Right now, every `quiz_missed_items` row has `surfaced = false` (the column defaulted to false when added, and nothing has ever flipped it). If this spec ships without a backfill, the very first tap on a quiz discovery card will mark potentially hundreds of historical items as surfaced in one transaction — including items the learner has never even seen a card about.

That's not a correctness bug (the card would still work), but it's surprising behavior and it consumes items that should arguably still be eligible for future cards.

**One-time backfill step**, to run as part of the 4B migration bundle:

```sql
UPDATE quiz_missed_items
SET surfaced = true
WHERE missed_at < <deploy_timestamp>
  AND surfaced = false;
```

This establishes a clean baseline: any `quiz_missed_items` row present at deploy time is treated as "already surfaced" (since the learner has had plenty of opportunity to see coaching cards for them in the old regime). Only items missed *after* deploy participate in the new surfacing mechanic.

**Why this is safe:** The learner loses no information — discovery questions still cover those topics naturally, and correct answers still flow into `quiz_mastery_items`. All we're doing is preventing the coaching card from firing on pre-existing data.

## 3. Quiz Mastery Retention

### Problem

Vocabulary mastery questions work because the vocabulary bank + `vocabularyRetentionCards` provide a per-learner library with SM-2 tracking. Capitals and Guess Who have no equivalent — the scoring functions (`getGuessWhoSm2Quality`) exist but are dormant because there's nothing to update.

### Architectural decision: two mastery systems, not one

After this spec ships, the codebase will contain two parallel SM-2 storage systems:

- **`vocabularyRetentionCards`** — existing, serves Vocabulary activity only, coupled to the shared vocabulary bank
- **`quiz_mastery_items`** — new, serves Capitals and Guess Who, standalone

**This is intentional for v1.** Vocabulary's retention model is tightly coupled to the vocabulary bank (CEFR levels, four_strands tracking, bank-wide aggregations). Unifying would require migrating that logic and risking regression in the only currently-shipping mastery system. The cost of the temporary duplication is low: SM-2 logic is ~30 lines, and there is zero shared query path between the two tables.

**Naming rule:** `quiz_mastery_items` rows MUST NOT be written for the Vocabulary activity type. Vocabulary stays on `vocabularyRetentionCards`. This is enforced by the repository method signature accepting only `'capitals' | 'guess_who'` for `activity_type`, not the full `QuizActivityType` enum.

**Phase 6 candidate (out of scope here):** Consolidate to a single `learner_mastery_items` table that handles all three activity types. This would be a pure refactor with no user-facing change, but it requires a careful migration of existing `vocabularyRetentionCards` data. Deferred until the surface area of all three activities is stable.

### Inventory: reused, new, removed

| Code | Status |
|---|---|
| `getGuessWhoSm2Quality(cluesShown, inputMode)` in `complete-round.ts` | **Reused** — currently dormant, will be called in Phase 4B step 9 |
| `getCapitalsSm2Quality(correct)` | **New** — simple 2-outcome function (see §3 Step 3 table) |
| SM-2 update helper (`applySm2(item, quality)`) | **Check first** — likely exists in `vocabularyRetentionCards` logic; if so, extract to `@eduagent/schemas` utility. If not, add new. |
| `quiz_missed_items.surfaced` column | **Reused** — exists, currently always false |
| Any prior `quiz_mastery_items` types or migrations | **Confirmed absent** — verify at implementation time |

### Design: `quiz_mastery_items` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK → profiles | RLS-scoped |
| `activity_type` | quiz_activity_type | `capitals` or `guess_who` |
| `item_key` | text | Canonical identifier (see below) |
| `item_answer` | text | The correct answer: `"Bratislava"`, `"Isaac Newton"` |
| `ease_factor` | numeric(4,2) | SM-2, default 2.5 |
| `interval` | integer | SM-2 days, default 1 |
| `repetitions` | integer | SM-2, default 0 |
| `next_review_at` | timestamptz | SM-2 |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint:** `(profile_id, activity_type, item_key)`

**Indexes:** `(profile_id, activity_type, next_review_at)` — the content resolver's hot path query.

### Item key conventions

| Activity | `item_key` | `item_answer` | Example |
|---|---|---|---|
| Capitals | Country name (normalized lowercase) | Capital name | `"slovakia"` → `"Bratislava"` |
| Guess Who | Deterministic hash computed from normalized name + era bucket | Canonical name | `sha1("isaac newton|17c")` → `"Isaac Newton"` |

**Capitals keys** are stable because the country name comes from the static reference data.

**Guess Who keys** are always computed by the server from a deterministic hash function. We do **not** use any slug that the LLM returns — even if the LLM returns a slug-like field, it is ignored for key purposes. Reason: LLM-returned slugs vary across calls (`isaac-newton` vs `sir-isaac-newton` vs `i-newton`) and cannot be trusted for row identity. Always-hash is one code path, one source of truth, no branching logic.

**Normalization rules** (required to keep hashes stable across LLM calls):
- `normalizedName` = lowercase, trimmed, diacritics stripped (`"Isaac Newton"` → `"isaac newton"`)
- `normalizedEra` = bucketed to a century token via a small deterministic lookup. `"17th century"`, `"1600s"`, and `"1600-1699"` all map to `"17c"`. BCE entries map to `"bce-5c"` style. If era is missing or unparseable, use `"unknown"`.

**Hash formula:** `sha1(normalizedName + "|" + normalizedEra)`, truncated to 16 hex chars for storage efficiency.

Collision risk is tolerable by design — two famous figures with the same name in the same century would collide, but this is exceedingly rare (e.g., there is no second "Isaac Newton" of the 17th century). If a collision does occur in practice, the item will fail repeatedly under SM-2 and eventually stabilize on whichever variant the learner sees most often.

**Why no fallback path:** An "LLM slug if present, hash if missing" approach would create two code paths — one where the same person could exist under multiple keys depending on which call generated them. Always-hash guarantees: same person + same era → same row, every time.

### Entry lifecycle

#### Step 1: First correct answer → insert

When a learner answers a **discovery** question correctly for the first time, upsert into `quiz_mastery_items`:

```typescript
{
  easeFactor: 2.5,
  interval: 1,
  repetitions: 0,
  nextReviewAt: now() + 1 day,
}
```

**Entry criterion:** First correct answer. No graduated entry (candidate → active). Rationale:

- On 4-option MC, ~25% of guesses land correct. SM-2 will fail false positives on review and reset — net cost is 1 extra review cycle per false positive.
- `quiz_mastery_items` is a review queue, not a trophy case. No user-facing "mastered" label exists.
- A graduated entry adds a status enum, content resolver filter, transition logic, and tests — all to solve a problem SM-2 already handles.

**Safeguard:** Initial SM-2 quality is 3 (not 5). Quality 3 keeps `ease_factor` flat and sets `interval = 1` day, meaning "we saw you get this right, but we'll re-check soon." Quality 5 would pad the interval and over-trust a potential guess.

**When to NOT create the row:** Do not insert mastery items for timed-out answers or hint-assisted answers (if/when those mechanics exist). Those signals are too weak.

**Intentional timing gap:** Because `next_review_at = now() + 1 day`, a learner who plays multiple rounds back-to-back in the same session will not see their newly-earned items come back for review that session. This is SM-2-correct consolidation timing and is intentional. If learner feedback shows this feels disconnected, the interval can be tuned down to 4 hours in a later iteration — the change is a one-line constant, not a schema change.

**Upsert semantics (explicit, to avoid ambiguity):**

Entry into the library happens via exactly one path: a correct **discovery** answer. Use this SQL pattern:

```sql
INSERT INTO quiz_mastery_items
  (profile_id, activity_type, item_key, item_answer, ease_factor, interval, repetitions, next_review_at)
VALUES
  ($1, $2, $3, $4, 2.5, 1, 0, now() + interval '1 day')
ON CONFLICT (profile_id, activity_type, item_key)
DO NOTHING;
```

**Key rules:**
1. **`ON CONFLICT DO NOTHING`** — a subsequent correct discovery answer to the same item (if deduplication somehow fails and the item re-appears as discovery) does NOT reset or update the existing row. The existing SM-2 state wins.
2. **SM-2 updates never fire on discovery-path questions**, even if the discovery question happens to match an existing library item. SM-2 updates only happen in Step 3, when the question was served as a mastery question (identified by `isLibraryItem: true`).
3. **Wrong discovery answers do nothing** to the mastery table. They create a `quiz_missed_items` row (existing behavior). They do not create, update, or delete any `quiz_mastery_items` row.

This guarantees: the only way a mastery row changes after creation is via the SM-2 review path. Discovery is append-only for entry; review is the sole mutator afterward.

#### Step 2: Content resolver pulls due items

The content resolver queries `quiz_mastery_items` where `next_review_at <= now()` for the activity type, ordered by `next_review_at ASC`. These become mastery question slots, injected at random positions (existing logic).

For capitals: the mastery question is built from `item_key` (country) + `item_answer` (capital) + `capitals_reference` data (aliases, fun facts, region for distractor selection). No LLM call needed.

For Guess Who: the mastery question needs clues. Two options:
- **Option A:** Store clues in the mastery row (denormalized, but avoids LLM call on review)
- **Option B:** Re-generate clues via LLM for each mastery encounter

**Recommendation: Option B.** Clues should vary across encounters — seeing the same 5 clues every time defeats the purpose of spaced repetition. The LLM call is cheap (one person, 5 clues), and it happens during round generation which already makes LLM calls. The content resolver passes the person's name to the LLM and requests fresh clues. This also avoids bloating the mastery table with JSONB clue data.

#### Step 3: SM-2 update on round completion

On round completion, for each mastery question (identified by `isLibraryItem: true` + matching `activity_type`):

| Activity | Scenario | SM-2 quality |
|---|---|---|
| Capitals | Correct | 4 |
| Capitals | Wrong | 1 |
| Guess Who | Correct, 1-2 clues (free text) | 5 |
| Guess Who | Correct, 3-4 clues | 3 |
| Guess Who | Correct, 5 clues or MC | 2 |
| Guess Who | Wrong | 1 |

These scores are already defined in `complete-round.ts` (`getGuessWhoSm2Quality`). The wiring just needs to call `updateQuizMasteryItem(db, profileId, itemKey, quality)` instead of being dormant.

#### Step 4: Deduplication with discovery questions

When the content resolver builds a round, mastery items must be excluded from the LLM discovery prompt's "exclude these answers" list. Otherwise the LLM might generate the same question as a discovery question AND it appears as a mastery question — duplicate in the same round.

The existing `recentAnswers` buffer partially handles this, but mastery items should be explicitly added to the exclude list.

### Revisit trigger

This design should be revisited when/if a visible "mastery library" screen is added (Phase 6+). At that point, "in my library" becomes a user-facing label, and the entry bar should be higher (e.g., 2 correct answers, or correct on review).

## 4. Phase 5 Enhancements

### 4a. Difficulty Adaptation

**Trigger:** 3 consecutive perfect rounds (100% correct) in the same activity type, all within the last 14 days.

**Check:** Query the last 3 completed rounds for the activity type from `quiz_rounds`. If all 3 have `score = total` and `completed_at` is within 14 days, set `difficultyBump: true` in the content resolver context.

**Edge case — fewer than 3 qualifying rounds:** If the learner has played 0, 1, or 2 completed rounds of this activity type, the bump check returns `false`. The bump requires *exactly* 3 qualifying rounds — it's not "all rounds played are perfect," it's "the most recent 3 are perfect." This protects new learners from being thrown into hard mode after a lucky first round.

**Effect on LLM prompt:**
- Capitals: "Choose lesser-known countries. Distractors should be from the same region as the correct answer."
- Vocabulary: Bump CEFR ceiling by +1 (e.g., A2 → B1)
- Guess Who: "Choose less famous historical figures. Make clue 1 and 2 significantly harder."

**No new columns.** The check is a simple query on existing `quiz_rounds` data. The 14-day window prevents ancient perfect rounds from triggering a bump after a long break.

**Reset:** Any non-perfect round resets the streak (the query naturally handles this — it only looks at the last 3).

### User-visible signal (required)

A hidden difficulty bump is a UX trap: the learner is crushing the quiz, then suddenly hits a wall of harder questions, loses their streak, and has no idea why. Especially bad for kids.

**The bump must be announced before the round starts.** When the round-start API response contains `difficultyBump: true`, the client displays a pre-round banner:

> 🔥 **Challenge round** — you're on a streak! This one is harder.

**Design requirements:**
- Banner appears on the round-intro screen, before the first question renders
- Banner uses the brand's teal/lavender tokens (no hardcoded colors — semantic tokens only, per the persona-unaware rule in `CLAUDE.md`)
- Banner is non-dismissible but auto-hides after 3 seconds OR when the learner taps "Start"
- Accessibility: announced by screen reader as "Challenge round. This round is harder than usual."

**Why not make it opt-in?** Opt-in adaptive difficulty for kids is a settings screen they'll never find. The signal-and-proceed model gives the learner context without friction. They still get the bump, but they know it's coming and it feels earned rather than punishing.

**Exit criterion:** Banner UX must be reviewed by a design pass before Phase 5A ships, same as any user-facing copy.

### 4b. Round History Screen

**Route:** `/(app)/quiz/history`

**Data source:** `GET /quiz/rounds/recent` (already exists, returns last 10 rounds).

**UI:**
- Scrollable list grouped by date
- Each row: activity type icon, theme name, score bar (e.g., "7/8"), XP earned
- Tapping a row navigates to a read-only round detail view showing each question + the learner's answer + correct answer + fun fact
- Empty state: "No rounds played yet — try a quiz!"

**Round detail endpoint:** `GET /quiz/rounds/:id` already exists but strips answers for active rounds. For completed rounds, the response should include `correctAnswer` per question since the round is over and answers were already revealed during play.

**Security boundary (hard requirement):** The route MUST verify BOTH:
1. `round.profileId === ctx.profileId` — ownership check via `createScopedRepository`
2. `round.status === 'completed'` — status check before revealing answers

Either check failing returns the existing answer-stripped payload. An in-progress round's answers must never leak, even to its own owner, via this endpoint. A break test (negative-path integration test) is required: fetch an in-progress round and assert that `correctAnswer` is absent from the response.

**Access from:** Practice menu (new "History" link below the quiz entry) and the quiz results screen (new "View history" secondary action).

### 4c. Free-Text Unlock

**Concept:** After answering a specific MC question correctly 3+ times, the learner earns the right to answer it via free text on future encounters. This incentivizes deeper recall.

**Storage:** Add `mc_success_count` integer column to `quiz_mastery_items` (default 0). Increment when a mastery question is answered correctly via multiple choice.

**Threshold:** `mc_success_count >= 3` → content resolver marks the mastery question as `freeTextEligible: true`.

**Client behavior:**
- When `freeTextEligible` is true, render a text input instead of MC options
- Show a subtle badge: "Type your answer" to signal the mode change
- Correct free-text answers earn bonus XP (same as Guess Who clue bonus logic)
- If the learner gets it wrong via free text, fall back to MC on next encounter (no penalty, just reset `mc_success_count` to 2 so one more MC success re-unlocks)

**Reset-to-2 rationale:** Chosen over reset-to-0 because a single failed free-text recall does not erase prior evidence of mastery — the learner demonstrated MC-level recognition 3+ times before. Resetting to 0 would force re-earning from scratch, which is punitive. Resetting to 2 acknowledges the stumble while keeping re-unlock one success away.

**Scope:** Only applies to mastery questions from `quiz_mastery_items`. Discovery questions stay MC.

### 4d. Per-Activity Personal Bests

**Data source:** `GET /quiz/stats` already returns aggregated stats per activity. Extend the response with:

```typescript
{
  activityType: QuizActivityType;
  roundsPlayed: number;        // existing
  bestScore: number;           // NEW — highest score in a completed round
  bestTotal: number;           // NEW — total questions in that best round
  bestConsecutive: number;     // NEW — longest within-round consecutive correct streak
  lastPlayedAt: string | null; // existing
}
```

**Streak scope:** Within-round only. Cross-round streaks are confusing (did I have a streak across yesterday and today?) and expensive to compute. Within-round streaks ("I got 8 in a row!") are clear and cheap — iterate the results array of each round.

**Practice menu display:** Show "Best: 8/8 · 12 rounds played" below each activity entry. Already described in the original spec but not implemented.

## 5. Build Phases

Each step lists the work and how it will be verified. An empty `Verified By` cell means the step is incomplete — no step ships without a verification plan.

> **Implementer note on test paths:** The `Verified By` entries specify *behaviors* to cover and suggest test file paths, but the exact file names and locations may differ from what already exists in the codebase. Before writing tests, search for existing nearby test files (e.g., `git grep -l "quiz_rounds"`) and prefer extending an existing file over creating a new one. The invariant is the behavior, not the path.

### Phase 4B: Surfacing + Mastery Foundation

| # | Work | Verified By |
|---|---|---|
| 0 | One-time backfill: mark all pre-deploy `quiz_missed_items` as `surfaced = true` | `test: integration backfill.test.ts:"post-backfill, no rows have surfaced=false for pre-deploy missed_at"` + manual: verify row count before/after on staging |
| 1 | `POST /quiz/missed-items/mark-surfaced` endpoint | `test: quiz.test.ts:"marks unsurfaced items as surfaced for profile"` + break test: `"does not mark items for other profiles"` |
| 2 | `useMarkQuizDiscoverySurfaced` mutation hook | `test: use-coaching-card.test.ts:"fires mark-surfaced on tap and on dismiss"` |
| 3 | Wire home screen intent card tap/dismiss to mutation | `test: LearnerScreen.test.tsx:"mark-surfaced fires when quiz_discovery card dismissed"` + manual: tap card, confirm card disappears from next refresh |
| 4 | `quiz_mastery_items` table + migration (with RLS) | `test: integration quiz_mastery_items.test.ts:"RLS blocks cross-profile reads"` |
| 5 | Repository methods: `findDueByActivity`, `upsertFromCorrectAnswer`, `updateSm2` | `test: repositories/quiz-mastery.test.ts:"upsert is idempotent on (profile, activity, key)"` + `"updateSm2 applies SM-2 formula correctly"` |
| 6 | Content resolver: query due mastery items for capitals and guess_who | `test: content-resolver.test.ts:"injects due items at random positions"` |
| 7 | Capitals mastery question builder (from reference data, no LLM) | `test: builders/capitals.test.ts:"builds distractor set from same region"` |
| 8 | Guess Who mastery question builder (LLM call for fresh clues) | `test: builders/guess-who.test.ts:"clues vary across encounters"` (mocked LLM, assert different prompts) |
| 9 | `complete-round.ts`: wire SM-2 updates for capitals and guess_who mastery questions | `test: complete-round.test.ts:"SM-2 update fires for isLibraryItem questions"` |
| 10 | Implement deterministic Guess Who key: `sha1(normalizedName + "|" + eraBucket)`, truncated to 16 chars. Era bucket lookup table included. | `test: item-key.test.ts:"17th century / 1600s / 1600-1699 all hash to same key"` + `"diacritics do not affect hash"` + `"missing era maps to unknown bucket"` |
| 11 | Exclude mastery items from discovery exclude list | `test: content-resolver.test.ts:"discovery LLM prompt excludes active mastery items"` |

### Phase 5A: Difficulty Adaptation

| # | Work | Verified By |
|---|---|---|
| 12 | Content resolver: query last 3 rounds, check for consecutive perfects within 14 days | `test: difficulty-bump.test.ts:"requires exactly 3 perfect rounds within 14d"` + `"returns false when <3 rounds exist"` |
| 13 | LLM prompt: add difficulty bump hints per activity type | `test: prompts.test.ts:"bump=true includes harder-distractors hint"` |
| 14 | End-to-end: verify bump resets after any non-perfect round | `test: difficulty-bump.test.ts:"non-perfect round clears bump"` |
| 14a | Round-start response surfaces `difficultyBump: boolean` field | `test: start-round.test.ts:"difficultyBump flag flows through to client payload"` |
| 14b | Client renders pre-round challenge banner when `difficultyBump === true` | `test: round-intro.test.tsx:"shows challenge banner when bump=true"` + `"screen reader announces challenge round"` |

### Phase 5B: Round History

| # | Work | Verified By |
|---|---|---|
| 15 | Round history screen at `/(app)/quiz/history` | `test: history.test.tsx:"renders empty state when no rounds"` + `"groups rounds by date"` |
| 16 | Round detail view (read-only, shows questions + answers for completed rounds) | `test: round-detail.test.tsx:"shows correct/incorrect indicators"` |
| 17 | `/rounds/:id` exposes `correctAnswer` only when round is completed + owned | `test: rounds.test.ts:"break test — in-progress round does not leak correctAnswer"` + `"break test — other-profile round returns 404"` |
| 18 | Practice menu: add "History" link; results screen: add "View history" secondary action | `test: practice-menu.test.tsx:"history link navigates to /quiz/history"` |

### Phase 5C: Free-Text Unlock

| # | Work | Verified By |
|---|---|---|
| 19 | ~~Add `mc_success_count` column to `quiz_mastery_items`~~ **Already added in Phase 4B (Task 2)** — column included at table creation time to avoid a second migration. No work needed in this phase. | N/A — verified by Phase 4B migration |
| 20 | Content resolver: mark questions as `freeTextEligible` when `mc_success_count >= 3` | `test: content-resolver.test.ts:"mc_success_count=3 sets freeTextEligible=true"` |
| 21 | Quiz play screen: render text input for free-text-eligible questions | `test: quiz-play.test.tsx:"renders TextInput when freeTextEligible=true"` |
| 22 | XP bonus for correct free-text answers | `test: xp.test.ts:"free-text correct awards bonus XP"` |
| 23 | Reset logic on free-text failure (`mc_success_count` → 2) | `test: complete-round.test.ts:"free-text wrong resets mc_success_count to 2"` |

### Phase 5D: Personal Bests

| # | Work | Verified By |
|---|---|---|
| 24 | Extend `computeRoundStats` with `bestScore`, `bestTotal`, `bestConsecutive` | `test: compute-round-stats.test.ts:"bestConsecutive is within-round only"` |
| 25 | Practice menu: show personal best below each activity entry | `test: practice-menu.test.tsx:"shows best X/Y · N rounds"` |

## 6. Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Mark-surfaced fails | Network error on tap | Toast: "Couldn't update — try again" | Coaching card reappears next session |
| Mark-surfaced fails | Offline at tap time | Optimistic: card dismisses locally, mutation queues via TanStack Query retry; on reconnect it flushes | If flush fails after retries, card reappears next session — correct fallback |
| Mastery item upsert fails | DB error during round completion | Nothing — round completion succeeds, mastery row missing | Item enters library on next correct answer; failure emits `quiz_mastery_item.upsert.failure` metric |
| Guess Who slug collision | Two different people hash to same slug | Wrong person shown as mastery question | Tolerable — SM-2 fails the confused item, eventually drops out |
| Difficulty bump stuck | Learner gets 3 perfects then struggles | Harder questions on next round | Auto-resets: next non-perfect round clears the streak |
| Free-text false unlock | MC guessing inflates mc_success_count | Learner faces free-text too early | Free-text failure resets count to 2, falls back to MC |
| History screen empty | New learner, no rounds | "No rounds played yet" empty state | CTA to try a quiz |
| In-progress round answer leak attempt | Client fetches `/rounds/:id` for round still in play | Standard stripped payload (no `correctAnswer`) | Route enforces `status === 'completed'` guard; covered by break test |
| Profile deletion mid-round | User deletes profile while quiz_mastery_items exist | Mastery rows cascade-deleted with profile | FK `ON DELETE CASCADE`; no orphans |

## 7. Decision Log

| Decision | Default | Rationale |
|---|---|---|
| Entry criterion | First correct answer | SM-2 handles false positives; graduated entry adds complexity for little gain |
| Initial SM-2 quality | 3 | Cautious trust: interval=1 day, re-checks soon |
| Initial `next_review_at` | `now() + 1 day` | Quick first review to confirm the learner actually knows it |
| `item_key` for Guess Who | Always deterministic hash: `sha1(normalizedName + "|" + eraBucket)`. LLM-returned slugs ignored. | Single code path, single source of truth. LLM slugs vary across calls and cannot be trusted for row identity |
| Mastery storage architecture | Two parallel SM-2 tables: `vocabularyRetentionCards` (existing) + `quiz_mastery_items` (new). No consolidation in v1. | Vocabulary's retention is coupled to the vocabulary bank (CEFR, four_strands). Migrating would risk the only currently-shipping system for cosmetic unification. Consolidation deferred to Phase 6. |
| Pre-deploy backfill | Mark all existing `quiz_missed_items` as `surfaced = true` at deploy time | Prevents the first tap from sweeping hundreds of historical items into surfaced status |
| Difficulty bump visibility | User-visible pre-round banner ("🔥 Challenge round"), non-dismissible, auto-hides | A hidden bump creates a frustration trap — kids would lose their streak without understanding why |
| Upsert semantics | `ON CONFLICT DO NOTHING`; SM-2 updates only via review path, never discovery path | Guarantees the only post-entry mutator is SM-2 itself |
| "Perfect round" for 5A | 100% correct, last 3 rounds, within 14 days | Prevents ancient perfects from triggering; 3 rounds = statistical confidence |
| Streak scope for 5D | Within-round only | Cross-round streaks are confusing and expensive |
| Guess Who mastery clues | Re-generated via LLM (not stored) | Varied clues across encounters; avoids table bloat |
| Surfacing vs round seeding | Card is a nudge, round is generic | Avoids race between mark-surfaced and round generation; biasing rounds toward missed items is a future feature |
| Revisit trigger | Visible mastery library screen | Entry bar should be higher when "mastered" becomes a user-facing label |

## 8. Migrations & Rollback

Per `~/.claude/CLAUDE.md`: every structural migration must state its rollback explicitly.

> **Implementer note:** The SQL snippets and cascade behavior below are the intended design. Before generating migration files, verify against existing `@eduagent/schemas` conventions — in particular, whether this repo uses hard deletes with `ON DELETE CASCADE` or soft deletes via a `deleted_at` column, and match the dominant pattern. If the dominant pattern is soft delete, replace cascade semantics with a matching soft-delete filter in the repository layer.

### 4B.1 — Create `quiz_mastery_items`

- **Forward:** `CREATE TABLE quiz_mastery_items (...)` with RLS policies, unique constraint on `(profile_id, activity_type, item_key)`, and index on `(profile_id, activity_type, next_review_at)`.
- **Rollback:** `DROP TABLE quiz_mastery_items CASCADE`.
- **Data loss on rollback:** Learners' SM-2 queues for capitals and Guess Who. Discovery questions continue to work; learners simply lose spaced-repetition scheduling until the table is re-created. No cross-feature impact.
- **Foreign key behaviour:** `profile_id` has `ON DELETE CASCADE`. Deleting a profile removes its mastery rows — GDPR-aligned and avoids orphaned rows. Verify at migration time.

### 5C.19 — ~~Add `mc_success_count` column~~ (merged into 4B.1)

During planning, this column was folded into the initial `quiz_mastery_items` table creation (see implementation plan Task 2). This avoids a second migration and keeps deploys simpler.

- **Forward:** Included in 4B.1 `CREATE TABLE` statement: `mc_success_count INTEGER NOT NULL DEFAULT 0`.
- **Rollback:** Handled by 4B.1 rollback (`DROP TABLE`).
- **Data loss on rollback:** Same as 4B.1 — all mastery state including free-text progress.
- **No separate migration exists for this column.**

### Deployment ordering (per project rule)

Apply migration before shipping code that reads new columns. Specifically:
- 4B.1 must land in Neon before the worker deploy that includes the content resolver's mastery-item query.
- 5C.19 must land in Neon before the worker deploy that reads `mc_success_count`.
- Never rely on `drizzle-kit push` for staging/production — committed SQL + `drizzle-kit migrate`.

## 9. Telemetry

Per the project rule *Silent Recovery Without Escalation is Banned* and the `feedback_silent_recovery_banned` memory: every fallback path must emit a queryable metric so the frequency is visible.

> **Implementer note:** Emit via the project's existing structured logger. Before wiring dashboards, verify which backend actually receives these events (Cloudflare Workers Analytics, Sentry breadcrumbs, Axiom, or whatever the current pipeline is — not assumed here). The requirement is "queryable later"; the specific destination is an infrastructure concern resolved at implementation time.

| Event | When fired | Why queryable |
|---|---|---|
| `quiz_mastery_item.upsert.success` | After successful first-correct upsert | Track library growth rate |
| `quiz_mastery_item.upsert.failure` | Caught DB error on upsert | Detect silent library stalls |
| `quiz_mastery_item.injected_per_round` (histogram) | At round generation, value = count of mastery items injected | Tune budget — if always 0, resolver isn't pulling; if too high, discovery feels stale |
| `quiz_mastery_item.false_positive_rate` (derived) | Items correct-on-entry then wrong-on-first-review | Measures whether first-correct entry is noisy enough to revisit the decision |
| `quiz_missed_item.mark_surfaced.failure` | Caught error on the mark-surfaced mutation | Detect coaching-card loops caused by failed writes |
| `quiz_round.difficulty_bump.applied` | When bump=true is passed to LLM prompt | Track how many learners are hitting the adaptive tier |
| `quiz_item.free_text.attempted` | When a learner answers a mastery question via free text | Correlation with retention lift in later analysis |

No dashboards required at launch — the goal is that these events exist and are queryable. If the telemetry pipeline is down, fallbacks still work; nothing becomes *invisible*.

## 10. Data Retention

`quiz_mastery_items` grows monotonically. For v1 there is no pruning.

- **Scale expectation:** Capitals has ~200 countries total; Guess Who has open-ended content but is bounded by actual LLM output patterns (likely a few hundred figures per active learner over months of play). Per-learner row counts should remain manageable for SM-2 query performance given the index on `(profile_id, activity_type, next_review_at)`.
- **Revisit trigger:** Decide pruning by measured signal, not an arbitrary row count. If query latency on the hot-path `findDueByActivity` index exceeds the project's acceptable p95 threshold (to be defined by whoever owns API performance budgets), introduce a pruning policy. An illustrative policy — *not a locked decision* — could move to cold storage any row with `next_review_at < now() - interval '365 days'` AND `repetitions = 0`. The actual policy should be chosen when the trigger fires, informed by real data.
- **"Cold storage" definition (deferred):** If pruning is needed, choose between hard delete, soft delete via `archived_at`, or moving to a separate `quiz_mastery_items_archive` table. This spec does not prescribe one — the choice depends on whether ever-restoring a pruned row has value.
- **GDPR:** Profile deletion cascades via FK (see §8). No separate retention policy needed for deletion requests.
