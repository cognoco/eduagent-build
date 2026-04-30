---
name: UX philosophy — quiet defaults beat both surveillance and friction
description: User strongly prefers smart auto-defaults over either silent inference (surveillance) or constant explicit choices (friction). Specs should infer from sustained behavior, default sensibly in ambiguous cases, surface controls only when the user reaches for them.
type: feedback
originSessionId: 2047c338-9233-4907-8ea0-8142f47547cb
---
The user has now drawn this principle three times across spec reviews (parent-as-lens / profile-as-lens iterations, 2026-04-28 → 2026-04-29). It's a durable preference, not a one-off comment.

**The principle, in their words:**
- "We give the user too many friction points."
- "They have to decide and make some action at every point."
- "As much as possible should happen naturally without them doing anything."

**Why:** The user objects to two opposite failure modes — and treats both as serious UX bugs:

1. **Surveillance** — the system silently changes behavior based on weak signals (e.g. "you finished one session, here's a personal weekly report"). Creates privacy surprise; feels like the app is watching and acting on you.
2. **Friction** — the system asks for explicit consent or choice at every decision point. Modal prompts, toggles, dismissible cards, "Show again" trackers. Feels like the app is making the user do its work.

The first reaction (move from surveillance toward consent) is the wrong fix. It just trades one bad experience for another. The right fix is **confident inference + reversible defaults**:

- Infer from sustained behavior (e.g. 3 sessions in 7 days, not 1)
- Default to sensible behavior in ambiguous cases (e.g. age-conditional archive, not user-chosen)
- Make controls available when the user *reaches for them* (a kebab menu on the surface itself, a Settings panel they can find)
- Never put controls *in the user's path* (no modal, no card to dismiss, no "show again" toggle to track)
- Reversibility is one tap

**How to apply when designing a feature/spec:**

For each user-facing decision the spec exposes, ask:
1. Could the system infer this confidently from the user's behavior or relationships? If yes, infer it.
2. Is there a sensible default that 95%+ of users would pick? If yes, use it.
3. Is there a privacy or social weight that makes user choice mandatory? Only here, expose a control.
4. If a control must exist, can it live on the surface itself (kebab menu, long-press) instead of in a settings panel?
5. If a setting must exist in a panel, is the panel kept short (≤ 5-6 rows for typical user)?

**Anti-patterns the user explicitly flagged:**
- Modal prompts triggered by activity ("you just did X, want Y?")
- "Don't ask again" trackers that need to be remembered
- Bundled consents (one toggle that sets multiple flags)
- Decision points at emotional moments (grief, account closure) — set defaults forward, not in-flow
- Drag-to-reorder as the only reorder affordance (a11y miss)
- "Refresh to see changes" buttons (just refresh)
- Multi-mode toggles (Manual / Recent / Alphabetical) when a single sensible default + override would work
- "Tap to acknowledge" infrastructure events mid-task

**Signal vs. noise threshold:**
When inference is needed, prefer thresholds tuned to high-confidence patterns:
- Sustained behavior over multiple days, not single events
- Age, role, relationships from the data model, not session-counting heuristics
- "What the user is actually doing" not "what the user might be doing"

**One-line summary:** Confident inference is not surveillance if it matches what the user actually does and is reversible in one tap. Explicit consent is not respect if it just adds friction.
