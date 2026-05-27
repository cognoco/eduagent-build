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

**Out of scope (explicitly deferred):**
- Pre-signup chat / paywall changes — this is a separate, larger piece of work.
- Subject-aware greeting (mentioning the specific subject they chose).
- Re-engagement greetings for returning users (only first session triggers).
- Any LLM call — the greeting is a hardcoded, translated string, not generated.
- Any change to the message API, the session start flow, or the conversation state.

## User-visible behavior

A new user signs up, picks/creates a subject, taps to start their first session. The chat opens. Instead of an empty list with a generic placeholder, they see what looks like a message from the AI tutor:

> Hi [Name]! I'm so glad you're here. I'm your tutor — ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. What would you like to start with?

The moment they send their first message, this empty state disappears (replaced by the live message thread). It never reappears on subsequent sessions. It does not get saved to the conversation history — it's a UI affordance, not a real message from the server.

If the profile has no `displayName` for any reason (edge case), the greeting falls back to a generic version without a name: *"Hi! I'm so glad you're here. ..."*

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
- `withName`: `"Hi {{name}}! I'm so glad you're here. I'm your tutor — ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. What would you like to start with?"`
- `fallback`: `"Hi! I'm so glad you're here. I'm your tutor — ask me about anything you're learning, working on, or curious about. You've got 10 free questions a day, 100 a month. What would you like to start with?"`

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
