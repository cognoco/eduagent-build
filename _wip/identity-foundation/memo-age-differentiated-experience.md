# Memo: What do we actually serve differently by age?

**Date:** 2026-06-05
**Audience:** PM (identity-foundation A-vs-B discussion)
**Source:** A-vs-B directional audit, Tracks 1–3 (`audit-a-vs-b-track-{1,2,3}-result-*.md`); follow-up frontend/backend analysis
**Status:** Discussion note — not a decision record

## The question

The A-vs-B decision (A = v1 serves all three consent categories incl. under-digital-consent-age children; B = defer Cat 3 to v2) prices the *consent plumbing*. This memo asks the adjacent product question: **what does the user actually experience differently based on age — today, and under either option?**

## What age changes today (the complete list)

| What | Where it lives | Nature |
|---|---|---|
| Visual theme + copy phrasing | Mobile, via `computeAgeBracket()` (binary <18 / ≥18) | Cosmetic. Explicitly banned from feature gating. |
| Consent-screen wording | Mobile (`consent-copy.ts`) | Tone only — substance identical across ages. |
| Pronouns prompt | Mobile, shown at 13+ only | One threshold. |
| Tutor voice | **Backend** — prompt assembly (`getAgeVoice`, age→tone) in `apps/api/src/services/` | The substantive one. Mobile only renders the output. |
| Onboarding consent gate | Backend (`checkConsentRequired`, ≤16 → parental consent) | The only place age controls *access* rather than presentation. |

Architecture note: the frontend is a pure renderer here. Navigation/tabs branch on family structure (owner / child profile / proxy), never on age or consent category — verified by the audit (Track 1 rows 168–169). All LLM behavior is server-assembled; the client never touches prompt logic.

## What age does NOT change (audit-verified)

- **Content.** Same material for a 9-year-old and an adult; only the tutor's tone differs.
- **Features.** No feature is age-gated anywhere in the app.
- **Safety.** No age-based content filtering or safety layer exists beyond prompt tone.
- **LLM routing.** Which model serves a learner is decided by subscription tier only — age plays no role (an earlier claim of age-gated routing was adversarially refuted in Track 1).

## Why this matters for A vs B

Both options as audited price only the **legal/consent plumbing** (consent records, guardianship, age-crossing detection). Under the current design, serving under-13s would **not change what is served** — a Cat-3 child would get the same product with a friendlier voice.

**The unpriced item:** if our product expectation for under-13s includes a genuinely differentiated experience — stricter content guardrails, simplified material, safety filtering, a restricted app shell — **none of that exists today and none of it is in either option's estimate.** It is new scope under A, and equally new scope under B's v2 reintroduce. It would land almost entirely in the backend (prompt assembly + envelope policy + server-side gates); mobile stays a renderer *unless* we decide under-13s should see a visibly different shell, which would be the first age-aware navigation in the codebase (also unscoped).

## Questions for the PM

1. **Is "same product, friendlier voice" acceptable for under-13s** (whenever they're served — v1 under A, v2 under B)? If not, the differentiated-kids-experience work needs scoping *before* the A-vs-B cost comparison is trusted, because it may dwarf the plumbing delta.
2. **If kid-safety differentiation is required, is it prompt-level (backend tone/content policy) or shell-level (different app experience)?** Prompt-level keeps mobile untouched; shell-level introduces age-aware navigation — new territory.
3. **Does this change the BX-4 hinge?** (BX-4 = the Cat-2→Cat-1 graduation-at-18 crossing — whether the daily age-sweep ships in v1; it determines whether B's single largest saving holds.) A richer age-differentiated experience would make age-crossing detection *more* load-bearing, strengthening the case to build the sweep in v1 regardless — which erodes B's headline saving.

---
*Companion artefacts: `audit-a-vs-b-track-1-result-cell-grid.md` (evidence base), `audit-a-vs-b-track-2-result-workstream-estimates.md` (effort), `audit-a-vs-b-track-3-result-layered-cross-check.md` (cross-check + disagreement log).*
