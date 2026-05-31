# [HIGH_BUG] Dormant web ChatShell still exposes voice controls bound to stale session handlers

**File:** [`apps/mobile/src/components/session/ChatShell.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/components/session/ChatShell.tsx#L199-L919) (lines 199, 512, 515, 765, 811, 823, 827, 919)
**Project:** eduagent-build
**Severity:** HIGH_BUG  •  **Confidence:** medium  •  **Slug:** `other-stale-instance-action`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

ChatShell explicitly handles RN Web keeping inactive Stack screens mounted by hiding only the input row and guarding handleSend with isFocused. Other interactive voice surfaces remain outside that dormant guard: VoicePlaybackBar, voice error retry, and VoiceTranscriptPreview still render, and handleVoiceSend calls onSend without checking focus. If an inactive session retains a pending voice transcript or voice controls overlap the active screen, a tap can send or replay content through the old session's handlers.

## Recommendation

Apply the same isWebDormant treatment to all interactive controls in the shell, or short-circuit every voice handler when !isFocused. Prefer wrapping the whole dormant shell in pointerEvents='none'/aria-hidden on web instead of guarding only the text input row.

## Revalidation

**Verdict:** true-positive

Confirmed gap. The BUG-886 fix added the `isWebDormant` (Platform.OS==='web' && !isFocused) guard to the text path only: `handleSend` short-circuits on it (L462), and the input-row View gets `pointerEvents:'none'`, `aria-hidden`, `tabIndex:-1`, and `display:'none'` when dormant (L1017-1023). The voice surfaces are rendered as siblings ABOVE that input-row View and receive none of this treatment: VoiceTranscriptPreview (L886-895, condition `isVoiceEnabled && pendingTranscript && !isListening`), the composer toolbar with VoicePlaybackBar (L903-930), and the STT-error retry Pressable (L871-884). Critically, `handleVoiceSend` (L566) guards only on `!pendingTranscript.trim() || isStreaming` and then calls `onSend(...)` with no `isWebDormant` check — so on RN Web, a backgrounded-but-mounted prior-session ChatShell that retains a pending transcript renders a tappable Send whose tap fires `onSend` bound to the prior session's POST URL. This is exactly the stale-instance failure mode the codebase documents at L198-205 ('a prior session's ChatShell stays in the DOM with a clickable Send button … tap-target geometry can route a click on the visually active screen to the offscreen instance'), which is why per-element guards were needed (the navigator does not hide the inactive screen). The fix was applied incompletely. Trigger conditions are narrow (web platform, two mounted instances, a pending voice transcript on the dormant one, stray tap geometry) and the blast radius is same-user, so this is a correctness/data-integrity bug rather than a cross-tenant breach — HIGH_BUG is defensible given the team treats this class seriously.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-26)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-19)
