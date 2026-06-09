# One-Screen Redesign — Second Opinion (Frequencies Synthesis)

*2026-06-09 · Written by a parallel Claude session as input to the redesign write-up. Responds to the full brainstorm arc: 30-agent atlas → one-screen take → "mentor drives, user steers" → graph-DB ruling → intent-card hub → discovery reframe → keep-88 mastermind → rich-app research (Duolingo / command palette / contextual home / progressive disclosure / proactive AI).*

## Core claim

The five researched patterns are **not competing options — they are layers at different usage frequencies**. The "which one is right" question dissolves once each pattern is assigned the frequency it serves:

| Frequency | Layer | Pattern it borrows |
|---|---|---|
| Every session | Home = **one warm proposal** (precomputed, deterministic, instant) + intent cards beneath | Duolingo single path + contextual reordering (passive) |
| Every session | Chat = the mentor, steerable any turn, with deep-link cards into existing screens | the capability registry / "mastermind" |
| Weekly-ish | Library drawer = search-first archive (deterministic filter + pgvector recall) | command palette, demoted to its mobile form |
| Rarely | Billing, privacy, settings — appear only when relevant | progressive disclosure |
| Later, maybe | Unprompted mentor outreach | Pulse-style proactive — passive cards only, heavily rationed |

**Stated flat: Duolingo-home + steerable-chat is the product; the registry is the engine; the palette is a search bar in Library; disclosure is hygiene; Pulse waits.**

## Corrections to the research pass

1. **The command-palette evidence was miscast.** Notion / Linear / VS Code / Superhuman are professional desktop tools for keyboard power users. On mobile for a 13-year-old, "palette" degrades to "a search bar" — fine, but not a centerpiece and *not* industry validation of keep-88-plus-a-brain. What survives: **Library should be search-first**. That's all.
2. **Take the Duolingo lesson whole.** Duolingo killed its explorable skill tree because choice hurt learners — strongest possible vote for "Home opens with one proposed next step, not a menu." But Duolingo paid with total user agency (curriculum prison). EduAgent takes Duolingo's **home** without its **prison**: the proposal is always escapable into conversation. That combination — proposal + steerable relationship — is the differentiator neither Duolingo nor ChatGPT has.
3. **Contextual home and progressive disclosure are the same idea at two scales** (show by relevance, hide by infrequency). Adopt silently; not a decision.
4. **Proactive AI: harden "passive first."** Unprompted push-nudging *minors* is not just a UX risk — it brushes the manipulation floor already mapped on the compliance side (DSA Art 25/28 + age-appropriate-design codes), and the child-nudge notification work is already deferred as identity-coupled. Passive (the right thing rises to the top of Home and waits) ≈ 80% of the value, none of the exposure. Pulse-style outreach is a phase-3 experiment, never a foundation.

## How this composes with keep-88 + registry

They are not rivals. The five patterns describe the **front door**; the registry describes the **plumbing behind it**:

- Build the new Home as **screen #89**; the other 88 stay untouched as the deterministic floor (LLM down → everything still works; graceful degradation is the base case).
- Mentor deep-links into existing screens via the **closed, server-validated route catalog** (never invents a route; pushes the ancestor chain for deep targets per the cross-stack-push rule).
- Registry usage data is the **measurement instrument**: screens the mentor never reaches for and users never tap = the evidence-based delete list. Collapse follows the data; it doesn't precede it.

## Shipping discipline (the trap left)

The layered-stack answer fails if all five layers ship onto one screen — that rebuilds the crowded dashboard with better citations. Rule: **one job per layer, shipped in order** — proposal + chat first, nothing else new. Cards, drawer, disclosure come only after the proposal loop demonstrably works. If Home's single proposal is good, most sessions never need the rest — that is the success condition.

Repo constraint: any new front door rides behind its own flag; the current 5-tab production nav (`MODE_NAV_V0_ENABLED` off-state) is a hard no-regress constraint — same staging pattern as the V1 guardian redesign.

## Open fork (needs the user's ruling)

When the app opens, does the user land on:

- **(A) Home with the proposal as a card** — calmer, glanceable, deterministic instant load; user *chooses* the conversation; or
- **(B) directly in chat with the mentor already speaking the proposal** — warmer, more "relationship," but more pressure and LLM-coupled at the front door.

**Recommendation: (A) Home-with-card** — preserves the deterministic floor and keeps the conversation opt-in per session. This is the same dial as "coach that proposes, genie that obeys," made concrete at app-open.
