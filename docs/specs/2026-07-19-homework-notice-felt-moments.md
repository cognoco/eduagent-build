# Homework Notice — the two felt moments

**Status:** draft v2 (design ratified in principle by founder 2026-07-19; v2 incorporates the 8-finding adversarial review of same date; decisions D1–D4 open)
**Owner:** Zuzana (product) / unassigned (build)
**Thesis:** MentoMate's differentiation (a learning relationship over time) is invisible during the first-use window where users decide "this is just ChatGPT." We do not *explain* the loop to learners — we engineer two felt moments that demonstrate it: (1) the mentor **notices** a shaky concept *while helping with homework* and the app visibly writes it down with a promise to bring it back; (2) it **comes back** — via a next-day nudge or naturally when the topic resurfaces. North-star activation (reach): % of all new learners whose first homework session leads to a completed re-check within 48h.

## 0. Product rulings (founder, 2026-07-19 — not open for re-litigation)

- The gap-surprise rides **inside homework help** — never an upfront diagnostic. Utility first, always: the kid came for the answer by 9pm and gets it.
- The mentor does **not** take the gap up then and there. It **notices, informs, and takes it up next time** — next day via nudge, *or whenever the topic naturally comes up again*.
- **We never force learning.** Every touchpoint is information plus an optional nudge: the notice is informational (no quiz launched), the push is dismissible, the card can be ignored forever, "not now" is a first-class answer. A declined/ignored touchpoint makes the system *quieter* (single-shot nudge, suppression on decline), never louder — and this is **enforced in data, not just prompt text** (§5).

Standing rules binding all copy and behavior: positive framing — never "weak"/"struggle" in learner-facing copy; age-neutral tone; human override everywhere; quiet defaults over friction; never lock topics.

## 1. Moment 1 — "It noticed" (inside homework help)

### The streaming constraint (review finding 1)

Reply prose streams to the learner in real time; envelope signals are parsed only after the stream drains (`teeEnvelopeStream`, `apps/api/src/services/llm/stream-envelope.ts` — "the caller must parse the full accumulated response separately for non-reply fields"). Therefore **the LLM's prose must never make the promise** — a streamed promise the server later rejects would be a broken promise the learner already saw. The promise is server-owned and rendered only after acceptance.

### Experience script

1. Learner photographs homework (camera/homework chip → `homework/camera` flow) or types into the ask bar. Mentor helps in `help_me` / `check_answer` mode as today.
2. The learner's messages show a concrete slip. The mentor finishes the help. Its prose may *observe*, lightly and without commitment ("those minus signs are sneaky — really common slip"), but contains **no promissory language**. It proposes the notice via the `noticed_gap` signal.
3. After the stream drains and the server **accepts** the signal (guards in §4), the client renders a deterministic, server-owned **"Noticed" chip** beneath the reply (pattern precedent: `ui_hints.note_draft`, which is server-validated post-stream via `buildValidatedDraft` and rendered as UI):
   > **Noticed** · Sign changes when moving terms — I'll bring this back for a quick lock-in: tomorrow, or next time it shows up.
   Rejected signal → no chip, no summary block, no promise anywhere; the benign observational prose stands alone. This makes the moment *more* legible than a prose sentence: the learner visibly watches the app write something down.
4. Session summary shows a **"Noticed along the way"** block (concept + one-line correction hint + the promise line), rendered from the persisted notice — never from LLM text.
5. On that summary screen, the existing post-session notification primer (`usePostSessionNotificationAsk`, `apps/mobile/src/app/session-summary/[sessionId].tsx:174`) gets a copy variant when a notice exists: *"Want a nudge tomorrow when it's time? One tap, no pressure."* — the permission ask attached to a promise the learner just watched being made.
6. **Recall-bridge coexistence (finding 6, ruling D4):** when a session has an accepted notice, the generic homework Recall Bridge (immediate post-summary recall questions, `routes/sessions.ts` recall-bridge endpoint + `session-summary/[sessionId].tsx` `useRecallBridge`) is **suppressed server-side for that session** — "I'll bring this back tomorrow" must not sit beside an immediate quiz, and the activation metric must not be muddied. Trade-off (lost immediate-recall practice on notice sessions) is flagged to the founder as D4; revisit with data.

## 2. Signal contract

New envelope signal in `llmResponseEnvelopeSchema` (`packages/schemas/src/llm-envelope.ts`), mirroring the challenge-round evidence pattern:

```
noticed_gap?: {
  concept: string            // short learner-safe label
  correctionHint?: string    // one-line "how it actually works"
  answerEventId: string      // the learner message evidencing the slip
  learnerQuote: string       // fragment from that message (provenance check only)
}
```

Parsed in `apps/api/src/services/exchanges.ts` alongside existing signals. The existing boolean `signals.needs_deepening` (metadata-only rung-5 telemetry) is untouched. Prompt block (homework/freeform modes only, v1) instructs: finish the help first; observe without promising; emit the signal; never quiz. **Prompt change ⇒ eval-harness snapshot + `--live` run**, plus a new eval flow asserting: emits with valid evidence on a real slip; does NOT emit on a clean session; **prose contains no promissory language** (lexical assertion on fixture outputs).

## 3. Moment 2 — "It came back" (two return paths, both declinable)

### Path A — the nudge (next day)

**Experience:** the next local calendar day, after-school window, one push. Lock-screen copy is **generic + subject-level only** (finding 7 — no LLM-derived concept text on the lock screen):
> "Yesterday's maths — got 2 minutes to lock something in?"
Tap → Mentor home, where the notice card sits on top: *"From yesterday's homework: sign changes when moving terms."* CTA starts the re-check (§3 start contract). Ignoring costs nothing. **One nudge per notice, ever.**

**Mechanics** (mirrors the shipped `review-due-scan` → `review-due-send` pattern):

- **Timing:** deterministic calendar rule, not an age window. A session's *learning day* = its local date shifted back 4h (so 00:30 homework belongs to the previous evening). Nudge fires on learning day + 1 during the 16:00 local-hour window (hourly cron with local-time filter, pattern: `daily-reminder-scan.ts:37`).
- **Eligibility:** `status='open'`, `nudgeStatus='pending'`, consent gate satisfied (`consentGateSatisfiedSql`, as in `review-due-scan.ts:97`), master push preference on (`isPushEnabled` — no new per-type preference in v1). Fan-out `app/mentor-notice.nudge` → send function.
- **Single attempt, honestly accounted (finding 7):** the rate-limit slot is reserved in `notification_log` *before* delivery, so a capped or failed send is **not retried** — `nudgeStatus` records `sent` | `skipped` (capped/failed) | `suppressed` (see §5). Passive surfaces carry on regardless.
- **New notification type** `notice_recheck` in `notificationTypeSchema` (`packages/schemas/src/notifications.ts:4`), structured data `{ noticeId, subjectId }` (IDs only). **Shared daily dedup bucket:** the lock key derives from the full `dedupTypes` set (`settings.ts:643`), so **all three senders must carry the identical set** `['review_reminder','recall_nudge','notice_recheck']` — this spec explicitly includes updating `review-due-send.ts` and `recall-nudge-send.ts` in the same change. Rides `MAX_DAILY_PUSH = 3`.
- **Tap routing:** new case in `notification-tap-navigation.ts` → `/(app)/home` (existing study-type pattern; direct-into-conversation deferred, D3).

### Re-check start contract (finding 3)

A card tap is not a re-check. The typed contract:

- **`POST /mentor-notices/:noticeId/recheck`** — owner-scoped, **idempotent**: creates a session of an existing type (subject session with `metadata.recheckNoticeId`), or returns the already-active recheck session for that notice; 409/no-op on a non-`open` notice (client refetches and the card disappears). Returns `{ sessionId }`.
- **Typed now-card route** `notice.recheck` added to the now-feed route schema + `ROUTE_CATALOG` (`packages/schemas/src/now-feed.ts`, `now-feed.ts:82`); the card CTA calls the endpoint then navigates to the session.
- **`recheck_started` in the funnel = successful session creation via this endpoint** — never a tap.

### Path B — opportunistic resurface ("when it comes up again")

**Experience:** days later, any session on that subject drifts near the concept. Mentor, mid-conversation: *"This is the sign-flip thing from Tuesday — want to nail it down while we're here? If not, no problem."* If yes: a 2–3 exchange micro-check. If "not now": mentor moves on; nothing escalates — and the pending nudge is **suppressed** (§5).

**Mechanics:**

- **Prompt-context injection:** exchanges in sessions whose subject has open notices receive a compact block (concept, correctionHint, created date, source "homework on <date>") with instructions: resurface only when naturally relevant, briefly; accept decline gracefully; never open a session with it (openers are owned by the review-continuity/review-callback specs). **Once-per-session is server-enforced, not prompt-hoped:** the block is omitted when `lastOfferedSessionId` = current session; offering stamps `lastOfferedSessionId/lastOfferedAt/offerCount`.
- **Evaluation, not vibes (finding 4):** re-check completion (either path) is graded by a structured signal:
  ```
  notice_recheck?: {
    noticeId: string
    verdict: 'locked_in' | 'not_yet' | 'dismissed'   // dismissed = learner asked to drop it
    answerEventId: string
    learnerQuote: string
  }
  ```
  Server-conservative mapping: **only an explicit `locked_in` verdict with validated evidence flips status**; `not_yet` records the attempt and leaves it open; `dismissed` (learner said "stop bringing this up") terminally closes it; anything invalid or ambiguous → notice stays open, no state change.
- **Celebration is a read-time projection (finding 2, ADR-0022):** `notice_locked_in` becomes a *projected* `ledger_moment` sub-kind derived at read time from `mentor_notices` (`status='locked_in'`, `resolvedAt` within the 3-day projection recency), exactly like `topic_mastered`/`recap_ready` (`now-feed.ts:1042/1116`). **No `mentor_activity_ledger` write. Self-only visibility.**

## 4. Evidence validation (finding 4 — overlap ≠ truth)

For both `noticed_gap` and `notice_recheck`:

1. `answerEventId` must resolve to a `session_events` row of kind `user_message`, in the **same session and same profile** as the exchange (mirror `challenge-round/evaluation.ts:67`, which also replaces LLM-supplied quotes with the actual event content — do the same here; the LLM's `learnerQuote` is never stored or trusted).
2. The lexical-overlap guard (pattern: `challenge-round/note-draft.ts`) is applied **as a provenance/topic-drift check only** — its own contract states it does not catch value substitution. It gates acceptance; it never *proves* a slip or mastery.
3. What proves state: for `noticed_gap`, acceptance only creates an *open* notice (a hypothesis, learner-visible as information — low stakes by design). For `locked_in`, the explicit structured verdict + validated evidence is required; the conservative-over-LLM doctrine from Challenge Round applies.
4. Copy scrubbed via the existing clinical-inference scrubber before persistence. Hard cap: **max 1 accepted notice per session, DB-enforced** (§5 uniqueness).

## 5. Data model (finding 5 — quiet defaults enforced in data)

New table `mentor_notices` (D1; rationale: homework sessions are subject-scoped with no topic — `POST /subjects/:subjectId/homework`, `routes/homework.ts:36` — so most notices are topicless and cannot ride `needs_deepening_topics` (topicId NOT NULL, 7+ readers); a precursor table keeps shared-table risk at zero):

| Field | Notes |
|---|---|
| `id`, `profileId` (person-FK), `subjectId`, `topicId` (nullable) | |
| `concept`, `correctionHint` | scrubbed, learner-safe |
| `sourceSessionId` **UNIQUE** | DB-enforced one accepted notice per session |
| `status` | `open` \| `locked_in` \| `dismissed` \| `faded` — terminal transitions via conditional `UPDATE … WHERE status='open'` |
| `lastOfferedSessionId`, `lastOfferedAt`, `offerCount` | server-enforced once-per-session offer |
| `recheckAttemptCount`, `firstRecheckAt`, `lastRecheckAt`, `lastRecheckOutcome` | durable funnel source (finding 8) |
| `nudgeStatus` | `pending` \| `sent` \| `skipped` \| `suppressed` |
| `nudgedAt`, `createdAt`, `resolvedAt` | |

Quiet-default rules the shape enforces:

- Any completed re-check attempt (`not_yet` or `locked_in`) or a `dismissed` verdict **before** the nudge fires → `nudgeStatus='suppressed'` in the same transaction. The cron selects only `nudgeStatus='pending'`, so the earlier contradiction (opportunistic "not now" followed by a nudge anyway) cannot occur.
- `dismissed` is reachable (verdict from the learner saying so in-chat); `faded` is set by the cron for notices untouched 21 days (no guilt pile). Both terminal.
- The notice's `learnerQuote` is used transiently at accept-time only and **not stored** — verbatim resurfacing is owned by the review-continuity spec (EU-1/EU-2); notices resurface by concept label only.

## 6. What this spec deliberately does NOT own

- **Review openers** — review-callback opener and the inert verbatim continuity opener stay owned by the review-continuity spec. Notices never drive openers in v1.
- **`retrieval_events`, the unified relearn queue, `evidence_links`/`LearnerSource`** — untouched. `mentor_notices` writes none of them.
- **`needs_deepening_topics`** — no schema change, no new writer.
- **Supporter/guardian proof — CUT from v1 (finding 2).** ADR-0027 requires supporter-visible facts to pass the server-side reportability allow-list (`mastery`/`effort`/`observable_engagement`) with render-equivalence and supportee mirrors, as read-time projections — and the Payer role is access-inert (`docs/canon/identity/domain-model.md`), never a data-visibility grant. A locked-in notice plausibly qualifies as a reportable `mastery`/`effort` fact later, but that is a separate spec built on the visibility-contract machinery. Nothing in v1 routes notice data to anyone but the learner.

## 7. Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| No signal emitted | LLM never notices | Normal homework help | Additive feature; eval flow monitors emission rate |
| Signal rejected (evidence invalid / dup / cap) | Guards in §4 | Benign observational prose only — no chip, no promise | Guard telemetry; prompt iteration via eval harness |
| Prose contains promissory language anyway | Prompt regression | One unbacked sentence in chat, no durable promise | Eval flow lexically asserts no-promise prose; monitored |
| >1 notice per session | Over-eager LLM | First accepted only | UNIQUE(sourceSessionId) + server cap |
| Push permission denied/dismissed | Learner declined primer | No push; card still appears | OS-aware settings toggle; primer never re-nags |
| Daily cap hit / send fails | Slot reserved pre-delivery | No nudge (no retry) | `nudgeStatus='skipped'`; passive surfaces remain |
| Re-check done before nudge fires | Opportunistic path was faster | No nudge | `nudgeStatus='suppressed'` transactionally |
| Consent-gated minor | Consent not granted | No push; in-app surfaces unaffected | Consent gate in scan SQL |
| Nudge tapped mid-session | Active session open | Existing cross-context prompt | Tap-navigation guard (exists) |
| CTA on resolved/faded notice | Stale card | No-op; card gone on refetch | Idempotent endpoint, conditional transitions |
| Still shaky after re-check | `not_yet` verdict | Encouraging copy; stays open; no re-nudge | Opportunistic path may resurface; 21-day fade |
| Notice never acted on | 21 days untouched | Card quietly disappears | `status='faded'`; fresh evidence can re-notice |
| Subject unclassifiable (freeform) | Silent-classify below threshold | Nothing (signal rejected; prose never promised) | Acceptable degrade; homework flow always has a subject |

## 8. Instrumentation (finding 8 — a durable funnel, two denominators)

The **table is the analytics source** (timestamps/outcomes persisted per §5); Inngest observability events (`safeSend`: `app/notice.created`, `.nudge_sent`, `.recheck_started`, `.recheck_outcome`) are supplementary telemetry only.

Funnel: first homework session → eligible slip (mentor emitted) → **accepted notice** → surface opened (push tap / card impression) → **re-check session created** (endpoint, §3) → **re-check completed** (verdict received) → `locked_in` / `not_yet`.

Two reads, kept distinct:
- **Reach (north star):** denominator = *all* new learners with a first homework session; numerator = completed re-check within 48h. Measures whether the felt loop reaches new users at all.
- **Conditional conversion:** each stage over the prior stage (e.g. accepted→created, created→completed). Diagnoses *where* the loop leaks.

Secondary: notice acceptance rate per homework session (guard against 0% and nag-level alike), nudge tap-through, primer-variant permission grant rate.

## 9. Rollout

- Server flag `MENTOR_NOTICE_ENABLED` (default off) gates signal acceptance, prompt blocks, cron, endpoint, and now-feed kind together; mobile renders only server-sent data.
- **Slice 1 — the complete quiet loop:** signal + guards + `mentor_notices` migration + prompt block + "Noticed" chip + summary block + recall-bridge suppression + now-feed card + typed route + recheck endpoint + `notice_recheck` evaluation + eval flow. Shippable alone: notice → card → re-check → locked_in, no push.
- **Slice 2 — reach:** `notice_recheck` notification type + scan/send pair + identical `dedupTypes` update across all three senders + tap routing + primer copy variant + 21-day fade cron.
- **Slice 3 — the relational resurface:** open-notice prompt injection + once-per-session offer stamping + `notice_locked_in` read-time projection.
- Each slice: i18n keys in `en.json` same PR (`pnpm translate`), migration via committed SQL + `drizzle-kit migrate` for stg/prd. Rollback: flag off = invisible; table additive.

## 10. Open decisions

- **D1 — Data model:** new `mentor_notices` table (recommended) vs. widening `needs_deepening_topics`. Nullable-topicId ripples through 7+ readers for no gain.
- **D2 — Nudge window:** learning-day+1 at 16:00 local (recommended, deterministic) vs. per-learner adaptive timing (defer; needs data).
- **D3 — Tap target:** home-with-promoted-card (v1) vs. deep-link into the re-check session directly (no session deep-link machinery exists today; defer until metrics justify).
- **D4 — Recall Bridge suppression on notice sessions** (recommended: suppress, per finding 6) vs. coexistence. Suppression trades immediate-recall practice for an uncontradicted promise and a clean metric. Founder call.
