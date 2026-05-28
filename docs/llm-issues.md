# LLM / Chat Issues

A living log of bugs and gotchas in the LLM-driven chat experience (practice,
review, relearn, homework — anything that renders `MessageBubble`). Each entry
records the **symptom as the user sees it**, the **root cause**, and the **fix**,
so a recurring issue is recognised immediately instead of re-diagnosed from
scratch. Newest entry first.

---

## Invisible chat text after switching session modes (recurring)

- **First seen / fixed:** ~2026-05-23 (commit `f2ad1e82f`)
- **Recurred:** 2026-05-28, after moving practice → review → relearn
- **Surface:** `apps/mobile/src/components/session/MessageBubble.tsx`

### Symptom (what the user sees)

After moving between session modes (e.g. practice, then review, then relearn),
the chat breaks: the AI's reply bubble grows tall but its text is **invisible**,
and the user's own message appears to be missing. The bubble shapes are there —
only the text is gone. It looks like the LLM returned an empty (but very long)
answer.

### Root cause

The bubble sourced its **background** and its **text colour** from two
*different* theme systems that update on different React paths:

| Part | Source | Path |
|---|---|---|
| Background (`bg-coach-bubble`, `bg-primary`) | NativeWind className → CSS variables | Injected once on the root layout via `useTokenVars()`; cascades to descendants in one React commit |
| Text colour | inline `style={{ color: colors.textPrimary }}` from `useThemeColors()` | A separate React-context subscription that re-renders `MessageBubble` independently |

Both read the same design tokens, but they propagate on **independent update
paths**. During a theme/colour-scheme transition the two paths land in
different frames, so for a window the background is painted from one palette
while the text is painted from the other. The token values make that fatal:

- light `textPrimary` = `#1a1a1a` (dark) vs dark `textPrimary` = `#f5f5f5` (near-white)
- `coachBubble` is a translucent tint that reads light-on-light or dark-on-dark when the palettes disagree

Result: near-white text on a near-white bubble (or dark-on-dark) → invisible.
The tall-but-empty look is just a long reply rendered invisibly; the "missing"
user message is the real (visible) message pushed off-screen above the giant
invisible AI bubble.

### Why the first fix didn't hold (the scar-tissue trap)

The 2026-05-23 fix *added* the inline `style={{ color }}` as a "safety net" so
text always had **a** colour. But that inline colour came from the **other**
theme system than the background — so it never guaranteed *contrast*, only that
the text had *some* colour. The safety net was itself the second, desyncing
source. It reduced how often the bug appeared but could not eliminate it, so a
new transition (practice → review → relearn) re-triggered it.

**Lesson:** a band-aid that adds a *second* source of truth for a value cannot
fix a desync *caused by* having two sources. Collapse to one source instead.

### Fix (2026-05-28)

Collapse bubble background and bubble text to a **single** colour system:
NativeWind className / CSS variables. The inline `style={{ color: colors.* }}`
overrides on the AI prose rules (`inline`, `textgroup`) and the user-message
`Text` were removed. Text now resolves `text-text-primary` / `text-text-inverse`
from the **same** root `vars()` cascade as the background, so colour and
background always come from one palette in one commit — they cannot desync.
className is also the Android force-dark-safe path (force-dark can override the
markdown library's `StyleSheet.create()` colours; CSS-variable classes bypass
it), so this keeps the original force-dark protection while removing the desync.

Residual: markdown nodes with no custom rule (headings, code, lists) still take
a colour from the markdown library's `style` prop, because the library requires
a colour string there. That path never touches plain prose (the reported
surface) and is documented inline in the renderer.

### Swept every LLM-content surface (so it can't hide in a sibling)

The chat bubble was not the only place that renders LLM text. All surfaces were
audited and brought onto one safe path:

| Surface | File | Before | After |
|---|---|---|---|
| Chat bubble (practice/review/relearn/homework) | `components/session/MessageBubble.tsx` | dual-source (className bg + inline-context text) → invisible | single-source via shared `ThemedMarkdown` |
| Saved notes / bookmarks (LLM-generated) | `app/(app)/progress/saved.tsx` | **bare `<Markdown>` with no themed colour** → library-default black, invisible on dark | single-source via shared `ThemedMarkdown` |
| Read-only transcript | `app/session-transcript/[sessionId].tsx` | already single-source (plain `<Text>`, className bg + text) | unchanged — safe |
| Chat shell (composer, dictation, stats) | `components/session/ChatShell.tsx` | already single-source (className only, no markdown) | unchanged — safe |

To make correctness structural rather than duplicated, all markdown LLM content
now renders through **one** component: `components/common/ThemedMarkdown.tsx`.
There is a single place that defines how LLM markdown is themed, and it is
correct by construction. A future third surface should import `ThemedMarkdown`
rather than calling `<Markdown>` directly.

### Verification

- `MessageBubble.test.tsx` (9) + `saved.test.tsx` (31) pass; session-related findRelatedTests suite (196) green before the shared-component extraction
- `pnpm exec tsc --noEmit` (mobile) — clean
- `eslint` on all four touched files — clean
- **Device visual confirmation still required:** this is a device-only rendering
  behaviour (NativeWind cascade timing + Android force-dark). Unit tests cannot
  prove the pixels. Reproduce on a real device by cycling practice → review →
  relearn and confirming both bubbles' text stays visible throughout.

### Prevention

Never give a single rendered element its **background** from one theme system
and its **text colour** from another. Pick one source per element:

- Prefer NativeWind className (`bg-*` + `text-*`) for both — atomic via the CSS
  cascade and force-dark-safe.
- If you must use inline `style` colour (e.g. a native prop that needs a string),
  drive **both** background and text from the same `useThemeColors()` snapshot.

Do **not** re-add an inline `style.color` on the `MessageBubble` text rules.
