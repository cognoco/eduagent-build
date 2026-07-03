DOC: docs/specs/2026-05-27-warm-chat-greeting.md (2026-05-27, 15K)

CLAIMS:
- v1 (in original scope): a warm, named, template-interpolated first-session empty-state greeting (`FirstSessionGreeting`), with a 4-tier fallback chain (name+subject+interest → name+subject → name → generic), no LLM call, i18n-keyed.
- v1.5 (owner-direction amendment, added 2026-06-05): the returning-session empty state must NOT repeat within any 7-open window — replace the single static line with a pool of ≥7 recency/win/activity-aware variants, sequential per-profile rotation via an AsyncStorage counter (not random), honesty-gated win-claims (only render "you nailed X" backed by a real verified signal), and coherence with the exchange-prompt's CALIBRATION QUESTION mechanism for "yes, let's continue" replies.
- Tone rule: no performative warmth ("so glad you're here"); warmth comes from specificity.
- Explicit non-goal: RR-1 (LLM-generated memory-callback opener) is separate, larger work — the variant pool is the template fallback for learners RR-1 doesn't cover.

TECH VALIDITY: no broken assumptions found — the spec's own "Status (implied by v1.5 amendment)" framing matches code exactly.

IMPLEMENTED:
- v1 (first-session greeting): complete, user-visible. `apps/mobile/src/components/session/FirstSessionGreeting.tsx` implements all four fallback tiers exactly as amended-scope specifies (`withNameSubjectInterest` → `withNameSubject` → `withName` → `generic`), i18n-keyed, rendered as an assistant-style bubble, never persisted.
- v1.5 (returning-session rotating pool): none, user-visible gap. `apps/mobile/src/components/session/ReturningSessionGreeting.tsx:9-19,30-42` is exactly what the WI describes: 3 static tiers (`withNameSubject`/`withName`/`generic`), no rotation counter, no recency/win/activity-typed sub-pools, no honesty-gated win-claims. A returning learner sees the identical line on every open of a given data state — the specific repetition risk the 2026-06-05 owner direction called out is live in production today.

CANDIDATE WIs:
- WI-1453 (v1.5 rotating greeting pool) — fate: **adopt**, description accurate and directly verified against `ReturningSessionGreeting.tsx`.

VERDICT: partially-implemented (v1 shipped and matches spec exactly; v1.5 amendment fully unbuilt).

MVP RECOMMENDATION: out (defer post-MVP), with a note. The v1.5 amendment is a polish/retention-feel improvement, not a broken affordance or a blocking gap — the returning-session empty state today is stale/repetitive but functionally correct (no dead buttons, no false claims, no crash). This doesn't meet the "user-visible broken affordance" bar that would force finish-or-hide under the MVP's burden-of-proof; it's a legitimate nice-to-have against a proven north-star launch surface. Revisit once launch-critical rows are clear — the owner-direction spec is small (rotation is a pure `counter % poolSize` function, unit-testable, no backend) and cheap to pick up in a fast follow.

CONFIDENCE: high — both components read directly; v1 tier logic and v1.5 gap independently confirmed against the spec's exact language (3 static tiers, no rotation).

Zuzka questions:
1. Confirm: is v1.5 (rotating pool) genuinely deferrable to post-MVP, or does the "no fake warmth / no repetition" owner direction from 2026-06-05 carry launch-blocking weight that isn't visible from the code alone?
2. If deferred, should WI-1453 stay open at current scope, or split into a cheap "sequential rotation, generic tiers only" v1.5a (fast) vs. the full recency/win-aware sub-pools v1.5b (needs SM-2/retention-signal wiring, bigger)?
