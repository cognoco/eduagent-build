# Warm Chat Greeting — First Session Tier A

**Status:** Draft
**Author:** Product (brainstorm) + Claude
**Date:** 2026-05-27
**Estimated effort:** 1-2 days, mobile-only

## Problem

Today, when a freshly-signed-up user opens their very first learning session, the chat screen renders an empty placeholder from `session.chatShell.emptyState`. There's no warmth, no introduction, no acknowledgement of who they are or how the product works. They're dropped into a blank chat and expected to know what to type.

This is the cheapest possible improvement to the new-user experience: a warm, named greeting from the AI tutor that introduces itself and signals what the user can do — rendered as the empty state of the very first session.

## Scope

**In scope:**
- A new empty-state UI in `ChatShell.tsx` that renders ONLY when the user is in their very first session (total sessions = 0) and has not yet sent any messages in this session.
- Copy uses the active profile's `displayName` for personalization.
- Copy mentions the free tier transparently (10 questions/day, 100/month).
- Copy is i18n-keyed for all 7 supported locales.
- Visual styling matches a normal AI message bubble so it feels like the tutor speaking, not a UI banner.

> **Owner direction (added 2026-06-05):** the greeting must always feel personal —
> the mentor KNOWS the student. A generic "Hi {{name}}!" is not enough. For the
> first session the mentor genuinely knows three things the user just told us in
> onboarding: their name, the subject they picked, and (when captured) their
> stated interest (`interestEntry`, shipped per the onboarding-dimensions work).
> The greeting template must use them. This moves "subject-aware greeting" from
> deferred → in scope; it stays a translated template (still NO LLM call —
> interpolation of on-device data, not generation). Returning-session "the mentor
> remembers you" warmth is a different, larger piece: that is RR-1 (warm
> memory-callback opener) in
> `docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md`,
> which IS prompt/LLM work — do not fold it in here.

**In scope (amended):**
- Greeting interpolates the chosen subject, and the learner's `interestEntry`
  when present, in addition to `displayName`. Fallback chain: name+subject+interest
  → name+subject → name → generic. Each tier is its own i18n key (no `{{var}}`
  left dangling — per the variable-interpolation-fallback rule in `CLAUDE.md`).

> **Owner direction #2 — non-repetition (added 2026-06-05):** no greeting copy
> may repeat within at least 7 consecutive app opens. The first-session greeting
> itself shows exactly once ever, so it cannot repeat — the repetition risk is
> the **returning-session empty state** (`session.chatShell.emptyState`), which
> today shows the same generic line on every open. That surface is therefore
> pulled into scope as v1.5:
>
> - Replace the single static empty-state string with a **pool of ≥ 7 short,
>   personalized opener variants** (name/subject interpolation, same fallback-tier
>   rule as above). Distinct sentence shapes, not synonym swaps — each variant
>   must read like a different natural remark from someone who remembers you,
>   e.g. "Back at it, {{name}} — where were we with {{subject}}?", "Ready when
>   you are — {{subject}} or something new?".
> - **Tone rule (owner direction #4, added 2026-06-05): no fake warmth.** Never
>   "ohh, happy to see you", "so glad you're back", "great to have you here" —
>   performative delight from software reads as fake and cheapens the surface.
>   Warmth comes from SPECIFICITY: showing the mentor remembers what you did,
>   what you got right, and what's next. Lead every variant with context (last
>   activity, last win, open thread), never with a feelings performance. This is
>   the same register the system prompt already mandates for the tutor ("be warm
>   but calm — don't over-perform"; no generic praise words) — the greeting
>   surface must match the in-session voice, or the seam shows.
> - **Rotation, not random:** store a per-profile open-counter locally
>   (AsyncStorage, profile-scoped key — same conventions as
>   `practice-recovery`/`session-recovery`) and pick `variant = counter % poolSize`.
>   Sequential rotation through ≥ 7 variants guarantees zero repeats within any
>   7-open window by construction; random pick does not.
> - **Recency-aware variants (owner direction #3, added 2026-06-05): context and
>   last activity are the core of the greeting, not decoration.** The pool must
>   include variants that reference the content of the last few lessons and the
>   learner's actual last activity, e.g.:
>   - *Open thread:* "Do you still remember our session about
>     {{lastTopicTitle}}? Should we continue with that?" / "Last time we got
>     into {{lastTopicTitle}} — want to pick it up, or start something new?"
>   - *Last win:* "Last time you nailed {{verifiedTopicTitle}} — want to try
>     {{nextTopicTitle}} now?" / "{{verifiedTopicTitle}} stuck with you last
>     week. Ready for the next step?"
>   - *Activity-typed:* the picker keys off what the learner actually did last
>     (lesson / quiz / dictation / review), so a learner whose last activity was
>     a quiz gets quiz-flavored copy, not generic lesson copy.
>
>   This is still template interpolation, NOT generation — every slot is data
>   the app already has: last-session topic (recent-session / resume-target
>   hooks), wins (retention band `strong` / three-state `Mastered` /
>   `recalled after N days` — the same signals RetentionPill already renders),
>   next step ({{nextTopicTitle}} from the resume target / topicOrder).
>   **Honesty rule for win-claims:** "you nailed X" may only render when a real
>   verified signal backs it (SM-2 verified, mastered state, or a passed quiz) —
>   never fabricate or inflate success; that's the same no-fake-praise rule the
>   tutor lives under in-session.
>   Selection rule: when last-activity data exists, prefer a recency/win variant;
>   rotate within that sub-pool; fall back to the generic personalized variants
>   when the profile has no history (or the data hasn't loaded — never block
>   render on it).
> - **Coherence requirement for recency variants:** the learner will answer the
>   greeting with a bare "yes" — the LLM must know what was offered. Reuse the
>   existing UI-opener mechanism: the exchange prompt already carries a
>   CALIBRATION QUESTION block ("The UI may already have presented an opening
>   question about <topic_title>…") that tells the model what the UI asked and
>   not to re-ask it. Recency variants may only be shown when the offered topic
>   is handed to the session through that same channel, so "yes, let's continue"
>   lands on the topic the greeting named — not whatever the model guesses.
>   Honesty rule: only offer to continue a topic that actually exists and is
>   reachable; never name a topic the tap can't deliver.
> - Still NO LLM call for the greeting itself. When RR-1 (memory-callback
>   opener) lands later, it replaces/upgrades this surface for learners with
>   review history — RR-1 is the richer version of the same instinct ("last week
>   you cracked X — has it stuck?"), generated rather than templated. The variant
>   pool remains the fallback for learners with nothing to call back to.
> - LLM-side note: generated session openers already carry "vary; do not repeat
>   verbatim across sessions" instructions in the system prompt (transition
>   phrases); RR-1 must inherit the same no-repetition requirement.

**Out of scope (explicitly deferred):**
- Pre-signup chat / paywall changes — this is a separate, larger piece of work.
- Re-engagement greetings for returning users (only first session triggers) — see RR-1.
- Any LLM call — the greeting is a hardcoded, translated string, not generated.
- Any change to the message API, the session start flow, or the conversation state.

## User-visible behavior

A new user signs up, picks/creates a subject, taps to start their first session. The chat opens. Instead of an empty list with a generic placeholder, they see what looks like a message from the AI tutor:

> Hi [Name]. You want to work on [subject] — and since you're into [interest], we'll make it stick with examples you actually care about. Ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. Where shall we start with [subject]?

(Fallback tiers drop the interest clause, then the subject clause — see the amended scope above. Final copy to be polished at implementation; the requirement is that whatever we know from onboarding shows up in the greeting. Note the tone rule in Scope: no "I'm so glad you're here" / "happy to see you" performative warmth — the greeting earns warmth by showing it heard what the user said in onboarding, nothing more.)

The moment they send their first message, this empty state disappears (replaced by the live message thread). It never reappears on subsequent sessions. It does not get saved to the conversation history — it's a UI affordance, not a real message from the server.

If the profile has no `displayName` for any reason (edge case), the greeting falls back to a generic version without a name: *"Hi. Ask me about anything you're learning, working on, or curious about. ..."*

## Implementation

### 1. Detection

Use the existing `useIsFirstSession()` hook from `apps/mobile/src/hooks/use-session-context.ts:61-62`. It already returns `true` when `useTotalSessionCount() === 0`. No new state, no new query.

### 2. Profile name access

`session/index.tsx:70` already imports `useProfile` from `apps/mobile/src/lib/profile`. The active profile's `displayName` is accessible in the session subtree. Pass it down to `ChatShell` as a prop, or read it inside `ChatShell` via the same hook — whichever matches the surrounding code style.

### 3. Empty-state branch

In `apps/mobile/src/components/session/ChatShell.tsx:807-816`, the current `ListEmptyComponent` renders the generic empty state. Branch on `isFirstSession`:

- `isFirstSession === true && messages.length === 0` → render the warm greeting UI (styled as an AI message bubble — reuse `MessageBubble` with a synthetic message object, OR a dedicated `FirstSessionGreeting` component that visually mimics one).
- Otherwise → existing behavior (today's generic empty state).

Prefer a dedicated `FirstSessionGreeting` component for clarity. Place it in `apps/mobile/src/components/session/FirstSessionGreeting.tsx` and colocate its test file.

### 4. i18n keys

Add to all 7 locale files (`en`, `de`, `es`, `ja`, `nb`, `pl`, `pt`):

- `session.chatShell.firstSessionGreeting.withName` — string with `{{name}}` interpolation
- `session.chatShell.firstSessionGreeting.fallback` — string without name

English baseline:
(Baseline below predates the 2026-06-05 owner directions — at implementation, the key set expands to the four fallback tiers (name+subject+interest → name+subject → name → generic) and the copy follows the tone rule: no "so glad you're here" performative warmth.)

- `withName` (tier: name only): `"Hi {{name}}. I'm your tutor — ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. What would you like to start with?"`
- `fallback` (tier: generic): `"Hi. I'm your tutor — ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. What would you like to start with?"`

Translations for the other 6 locales can be drafted by the implementer or shipped with English first and translated in a follow-up. Decide at implementation time, not in this spec.

### 5. Pricing copy verification

The "10/day, 100/month" copy must match the actual free-tier limits enforced server-side. Per the project memory note `pricing_dual_cap.md`, the Free tier is 10/day + 100/month, verified in `subscription.ts:33-49`. Re-verify this at implementation time — if the limits have changed, the copy changes with them.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Profile loaded, has displayName | New user, first session | Greeting with name | Sends first message → greeting disappears |
| Profile loaded, no displayName | Edge: account-level signup without profile basics | Generic fallback greeting (no name) | Same as above |
| `useTotalSessionCount` still loading | Race condition on first cold open | Today's generic empty state (assume not first session until proven) | First session count loads → greeting appears on next render |
| User scrolls in empty chat | They navigate around | Greeting stays visible at top until they send a message | N/A |
| User sends, then deletes/cancels their message | If supported | Greeting reappears (still 0 messages) | OK |
| Locale not yet translated | English-only at first ship | English greeting shown | Translation lands in follow-up |

## Acceptance criteria

1. A test profile with `totalSessions === 0` opens its first session → the warm greeting renders in place of the generic empty state, using the profile's displayName.
2. A profile with `totalSessions >= 1` opens any session → the existing empty state behavior is preserved (no regression).
3. The greeting disappears immediately after the user submits their first message in the session.
4. The greeting is not persisted to the conversation/message store — only rendered in the empty-state slot.
5. A profile with no displayName falls back to the generic greeting without a name (no `"Hi !"` artifact).
6. i18n: the English string ships; remaining locales either ship together or are explicitly tracked for follow-up.
7. Pricing copy ("10 free questions a day, 100 a month") matches the current Free tier limits in `subscription.ts`.
8. Non-repetition: opening the app/chat 8 times in a row as a returning profile shows ≥ 7 distinct empty-state openers with no repeat inside any 7-open window (sequential rotation test on the variant picker — unit-testable as `pick(counter)` purity, no flake).
9. The rotation counter is profile-scoped: profile A's rotation position does not affect profile B's, and the key is wiped by `signOutWithCleanup`.

## Testing

- Unit test the new `FirstSessionGreeting` component with both `withName` and `fallback` paths.
- Integration/RTL test in `ChatShell.test.tsx` (or co-located) verifying the branch: first session → greeting; non-first session → old empty state.
- Manual: open the app as a fresh test account, start first session, screenshot. Send a message, screenshot. Open a second session, screenshot.

## Not in scope (explicit reminder)

- This does NOT change the auth flow. Users still sign up before reaching this screen.
- This does NOT introduce any LLM call. The greeting is a static, translated string.
- This is NOT a paywall. The Free tier already permits the first 10 questions; the greeting just explains that warmly.
- This does NOT touch any of the larger reordering work (4-card move, LightBulb hero, pre-signup profile form, locked-tab exploration). Those remain separate, larger pieces.

## Rollout

Single mobile PR. No backend change. No migration. No feature flag needed for v1 — the change is contained to the empty-state slot and is reversible by reverting the PR.

If at any point we want to A/B test, the simplest mechanism is the Doppler-controlled flag pattern used elsewhere in the app — but for a 1-2 day change with low risk, ship it unflagged.
