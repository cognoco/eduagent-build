# Conversation-Stage-Aware Session Chips

**Date:** 2026-04-15
**Status:** Draft
**Scope:** Mobile session screen — all entry points

## Problem

The session screen shows quick-action chips, feedback buttons, and bottom-bar controls unconditionally. This creates nonsensical UI states:

- A learner says "HI" in freeform mode and sees "Too hard", "Explain differently", "Hint" — but nothing was taught.
- "Helpful" / "Not helpful" / "That's incorrect" appear on the LLM's first greeting — there's nothing to evaluate.
- "Switch topic" and "Park it" show before any topic or subject is established.
- In freeform mode, the classifier silently auto-picks the first enrolled subject (e.g., Geography) when the input carries no subject signal, leading to a confusing "Ready to explore geography?" response.

### Root Cause

There is no concept of **conversation stage** in the UI. Three independent button layers each make independent visibility decisions with no shared awareness of where the conversation actually is.

## Design

### Conversation Stage — Derived Computation

A pure function that computes the current stage from existing state. No new mutable state, no sync bugs, survives recovery resume.

```typescript
type ConversationStage = 'greeting' | 'orienting' | 'teaching';

function getConversationStage(
  userMessageCount: number,
  hasSubject: boolean,
  effectiveMode: string
): ConversationStage {
  // Practice, review, relearn, and homework already present assessable content
  // on the first AI response. Skip warmup stages.
  if (['practice', 'review', 'relearn', 'homework'].includes(effectiveMode)) {
    return 'teaching';
  }

  // User has sent at least 2 messages — first was greeting/subject selection,
  // second is real engagement. This check runs BEFORE hasSubject intentionally:
  // in freeform flows the progression is greeting → teaching, skipping orienting.
  if (userMessageCount >= 2) return 'teaching';

  // Subject is known but conversation hasn't warmed up yet.
  // Reachable in two cases:
  // 1. Learning mode with subject pre-set via route params (most common).
  // 2. Freeform when the first message is substantive (not a greeting) —
  //    classification sets the subject immediately, but userMessageCount is still 1.
  // In both cases this is a brief transitional state; it becomes 'teaching'
  // as soon as userMessageCount reaches 2.
  if (hasSubject) return 'orienting';

  // No subject, no engagement.
  return 'greeting';
}
```

**Location:** `apps/mobile/src/app/(app)/session/session-types.ts`

### UI Gating Per Stage

| Component | `greeting` | `orienting` | `teaching` |
|---|---|---|---|
| Quick chips (inline, per AI message) | none | none | full contextual set |
| Feedback buttons ("Helpful" / "Not helpful" / "That's incorrect") | none | none | show on messages with `eventId` |
| Bottom bar ("Switch topic" / "Park it") | none | none | both shown |

#### Changes by file

**`SessionMessageActions.tsx`** — Wrap the chip + feedback rendering (not the message content) in a `stage === 'teaching'` guard. The component still renders unconditionally for message content; only the action buttons are gated.

**`SessionAccessories.tsx` (`SessionToolAccessory`)** — Wrap "Switch topic" + "Park it" in a `stage === 'teaching'` guard. No semantic changes to what these buttons do when tapped — only their visibility is gated.

**`getContextualQuickChips`** — No changes. The function remains a pure content-based selector ("given a message, what chips apply?"). The *whether to show chips at all* decision is a separate concern, handled at the call site. Clean separation of concerns.

### Freeform Greeting Guard

When a freeform session receives a pure greeting as its first message, skip classification and respond with a client-side companion message.

**Location:** `apps/mobile/src/app/(app)/session/use-subject-classification.ts`, inside `handleSend`, before the classification block.

#### Greeting detection

```typescript
// Anchored with ^...$ so "hi can you help me with fractions" does NOT match.
// Only pure social greetings are caught. Do not remove the anchors.
const GREETING_PATTERN = /^(h(i+|e+y+|ello|ola|ei|ej)|yo|sup|what'?s up|hva skjer|hei hei|ciao|salut|bonjour|hallo)\b[!?.\s]*$/i;

function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim());
}
```

**Known gaps (acceptable):** Uncommon greetings, emoji-only messages, purely punctuated inputs. These will trigger classification normally, which is fine — the classifier handles them with the existing fallback path.

#### Behavior when greeting detected

When `effectiveMode === 'freeform'` AND `isGreeting(text)` is true AND no subject is established (`!subjectId && !classifiedSubject`):

1. Skip `classifySubject.mutateAsync` — no API call.
2. Do not call `continueWithMessage` — no session exists, no LLM call.
3. Use the existing `animateResponse` function (exported from `components/session/ChatShell.tsx`, signature: `animateResponse(response, setMessages, setIsStreaming, onDone?)`) to animate a client-side companion message. This is the same function used in `use-session-streaming.ts:437` for the no-subject error path. The message should be age/experience-appropriate, e.g.:
   - Experience 0: *"Hey! What would you like to learn about? You can ask me anything."*
   - Experience 1+: *"Hey! What's on your mind today?"*
4. The conversation stage remains `greeting`. No session created, no quota consumed, instant response.

#### Re-trigger classification on next message

The current classification guard checks `messages.length <= 1`. This must change to `!classifiedSubject && !subjectId && userMessageCount <= 2` so that:

- Classification runs on the next substantive message (the one after the greeting).
- The `userMessageCount <= 2` cap prevents infinite classification retries if classification fails on back-to-back messages (API error, timeout). Max one retry.

**Why not change the API?** The DB schema has `subjectId` as `NOT NULL` on `learning_sessions` and `session_events`. Making it nullable would require a migration plus null guards through the entire session service, exchange context, downstream Inngest pipeline, filing, summaries, and retention tracking — significant plumbing for one greeting exchange that resolves on the next message. The client-side approach gives the same UX with zero backend changes.

### Stage Progression by Entry Point

| Scenario | Stage progression | Chips shown |
|---|---|---|
| Freeform + "hi" | `greeting` | none |
| Freeform + "hi" then "tell me about volcanoes" | `greeting` → `teaching` | none → full |
| Freeform + "help me with fractions" (substantive first msg) | `greeting` → `orienting` (classifier sets subject, userMessageCount is 1) → `teaching` (2nd message) | none → none → full |
| Learning mode + subject pre-set, first response | `orienting` | none |
| Learning mode + 2nd exchange | `teaching` | full |
| Practice / review / homework | `teaching` always | full (or homework's own bar) |
| Recovery resume with prior exchanges | `teaching` | full |

**Orienting is reachable in two scenarios:** (1) learning mode with a subject pre-set via route params, and (2) freeform when the first message is substantive enough to trigger classification (e.g., "help me with fractions" — not a greeting, so `isGreeting` doesn't match, classification runs immediately, subject is set, but `userMessageCount` is still 1). In both cases, `orienting` is a brief transitional state — it becomes `teaching` as soon as `userMessageCount` reaches 2. In pure greeting flows (freeform + "hi"), orienting is skipped entirely because the subject is only set on the second message, at which point `userMessageCount >= 2`.

### Implementation Guardrails

- **Stage check placement in SessionMessageActions:** Gate only the chips + feedback rows. Message content renders unconditionally. A quick read of "gate the component" must not be misread as "gate the entire component."
- **"Switch topic" semantics unchanged:** Only visibility is gated. The button's behavior when tapped is not modified. In freeform mode during `teaching`, "Switch topic" lets the learner change what they're discussing — this is correct and intentional.
- **Greeting regex anchoring:** The `^...$` anchors are load-bearing. A comment must explain this so a future developer doesn't remove them.
- **Re-trigger classification cap:** `userMessageCount <= 2` prevents retry loops. Without this cap, a classification API error would cause classification to re-run on every subsequent message.

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/src/app/(app)/session/session-types.ts` | Add `ConversationStage` type, `getConversationStage()` function, `isGreeting()` function |
| `apps/mobile/src/app/(app)/session/SessionMessageActions.tsx` | Gate chips + feedback on `stage === 'teaching'` (passed as prop) |
| `apps/mobile/src/app/(app)/session/SessionAccessories.tsx` | Gate `SessionToolAccessory` render on `stage === 'teaching'` |
| `apps/mobile/src/app/(app)/session/use-subject-classification.ts` | Add greeting guard in `handleSend`, change classification re-trigger guard |
| `apps/mobile/src/app/(app)/session/index.tsx` | Compute `conversationStage`, pass to child components |

## Testing

| Test | Verified by |
|---|---|
| `getConversationStage` returns correct stage for all mode + count + subject combos | Unit test in `session-types.test.ts` |
| `isGreeting` matches pure greetings, rejects substantive messages | Unit test in `session-types.test.ts` |
| Chips and feedback hidden when stage is not `teaching` | Unit test in `SessionMessageActions.test.ts` |
| Bottom bar hidden when stage is not `teaching` | Unit test in `SessionAccessories.test.ts` (new) |
| Freeform greeting shows client-side response, no API call | Unit test in `use-subject-classification.test.ts` |
| Classification re-triggers on 2nd message after greeting | Unit test in `use-subject-classification.test.ts` |
| Classification does not retry infinitely on API failure | Unit test in `use-subject-classification.test.ts` |
| Manual: freeform → "hi" → no chips → "tell me about volcanoes" → chips appear | Manual on device |
| Manual: learning mode with subject → first response has no chips → 2nd exchange shows chips | Manual on device |
| Manual: practice mode → chips from first response | Manual on device |

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Greeting response stale | `animateResponse` shows slightly wrong companion text | Slightly off greeting | Harmless — user sends next message normally |
| Classification fails on 2nd message | API error/timeout | Existing error handling (subject picker or "couldn't identify" flow) | User picks subject manually |
| Stage stuck at greeting | Bug in stage computation | No chips ever shown | User can still type and send messages; chips appear after 2 messages regardless |
| Re-trigger fires unexpectedly | Edge case in `userMessageCount` counting | Double classification call | Idempotent — classifier returns same result, no user impact |
