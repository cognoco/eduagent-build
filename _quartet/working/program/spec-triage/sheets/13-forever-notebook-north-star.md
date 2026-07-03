DOC: docs/specs/2026-06-08-forever-notebook-north-star.md (2026-06-08, 10.8K)

CLAIMS (this is a vision doc, not an execution spec — claims are "grounding" assertions about shipped baseline + a 5-slice roadmap):
- Grounding: spaced review live at topic grain (SM-2), notes stored per-topic never mutated, weak concepts captured per concept (`needs_deepening_topics`), Challenge Rounds grade per concept but discard "solid" verdicts.
- Slice 1 (concept capture): additive `concepts`+`concept_mastery` tables, capture all verdicts, presence-only star, correction-on-recall, concept-targeted review, note-correctness nudge — spec drafted, gated by MMT-ADR-0017.
- Slices 2-5 (relevance nudge, two-axis confidence, restatement trajectory, consented connection graph) + "Ask your own past" + "return-as-promotion archive tier" + "unified note/saved-from-mentor surface" — explicitly Roadmap/Parked, not committed scope.
- Doc's own status line (as of 2026-06-27 addendum) already says: Slice 1 PARKED (same gate as concept-capture-layer-design.md), Slices 2-5 not started, grounding section still accurate.

TECH VALIDITY: none broken — this doc self-corrects via its own status banner (dated 2026-06-27, 19 days after doc creation) and explicitly says "Working as designed (living north star)." Verified its grounding claims against current code (below); all still hold as of 2026-07-03.

IMPLEMENTED: per claim, using the doc's own taxonomy —
- Grounding claims: complete/accurate. `packages/retention/src/sm2.ts` (SM-2 review engine exists); `packages/database/src/schema/assessments.ts` defines `needs_deepening_topics`; `packages/database/src/schema/concept-mastery.ts` exists (concept-mastery table already landed, ahead of "Slice 1 PARKED" framing — see WI-1454/1455/1456 in the quarantine set, which treat concept-capture READ-side items as live work, consistent with "write-side shipped per WI-1439" noted in register row 9).
- Slice 1: partial. Additive schema exists (`concept-mastery.ts`) but the doc's own banner says PARKED — user-visible: the "presence-only star" and concept-targeted review are NOT reachable from any V2 surface (register row 9: "read-side items live" = WI-1454/1455/1456, all still open).
- Slices 2-5 + parked items: none — by the doc's own admission, not started. No code evidence sought/needed; doc is self-consistent.

CANDIDATE WIs: none extracted directly from this doc — correct. The live descendant work (concept-capture read-side re-homing) is already captured as WI-1454, WI-1455, WI-1456 against the *slice-1 spec* (`docs/specs/2026-06-08-concept-capture-layer-design.md`), not this north-star doc — the north star itself is intentionally aspirational and not meant to spawn its own WIs beyond what its slice specs generate. No new candidates needed.

VERDICT: valid (as a living vision doc — it is explicitly not meant to be "done"; grounding is accurate, roadmap slices are honestly labeled not-started/parked, no drift to fix)

MVP RECOMMENDATION: out of MVP scope as a program (this is post-MVP long-range vision: "Ask your own past," connection graph, restatement trajectory are multi-quarter bets, none touch the Config T V2 shell / RevenueCat Plus-only ship gate). Slice 1's concept-capture read-side items (WI-1454-1456) are a separate, narrower MVP question already tracked under row 9 — do not conflate the north-star doc itself with that decision.

CONFIDENCE: high — the doc audits itself accurately and the grounding claims check out against current schema/code; low residual risk since no action is proposed here.
1. Should slice-1 read-side re-homing (WI-1454/1455/1456) un-park before or after the V2 MVP ships — same "un-park after identity reset" trigger the doc names, or is identity-foundation timing now decoupled from V2 launch?
2. Is the north-star doc itself in-scope for the doc-hygiene pass (WI-1439), or is its self-correcting status banner sufficient and no header fix needed here (unlike row 12's journal-redesign doc)?
