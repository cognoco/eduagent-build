DOC: docs/plans/2026-06-30-v2-publish-readiness-canonical-plan.md (2026-06-30, updated 2026-07-02, 28.7K, 262 lines)

CLAIMS:
- This is the living priority plan above the S1-S6 phase plans (WS-28), naming 8 tracked tasks (T1-T8 / WI-1168-1175) plus a per-surface S6 retirement-readiness table (WI-1174) and a T8 publish-readiness review (WI-1175, reviewed 2026-07-02, recommendation CONDITIONAL-SHIP).
- Current Ruling: learner V2 substantially built; supporter V2 is "the critical publish gap" (support hub, person-scope Journal, shared-record rendering, person-scope Subject drill-in, visibility ceremony screens still partial/missing).
- Explicitly out of scope: executing S6 deletions, flipping V2 to production default, reopening the 3-tab shell decision, mentor-character/brand animation, new product areas.
- All 7 publish-critical task prompts (T8 done-condition) pass on current `origin/main` as `CODE` (with one caveat: billing/security/privacy settings are reachable but not yet visually migrated into the avatar sheet).
- Self-identifies its own AC gaps: WS-28's Cosmo workstream actually has 17 related items, not the 8 named in this plan's checklist; 3 of the 9 unlisted items (WI-1207, WI-1124, WI-1120) are open/unlanded and were never named as deferred.
- Self-identifies dossier/plan currency gaps (06:56 appeal-affordance stale, 07:190 support-hub-placeholder stale) and recommends 6 concrete follow-up actions, none blocking publish.

TECH VALIDITY: No broken assumptions found — this document is itself a 2026-07-02 code-verified reconciliation (cites specific commits/PRs, e.g. WI-1170 via PR #1751 `bad3821d...`, an ancestor of `origin/main`), and its per-surface table explicitly re-verifies against `origin/main` rather than trusting checkboxes. It is the most current artifact in the row-17/18 pair and is itself the source that flags row 17's dossier staleness (WI-1397's subject).

IMPLEMENTED: This document is the tracking artifact, not a feature — "implemented" doesn't apply row-wide. Per its own T1-T8 checklist: T1/T5/T6 (WI-1168/1172/1173) checked complete; T2 (WI-1169) checked complete; T3/T4 (WI-1170/1171) unchecked in the checklist but the doc's own reconciliation (lines 200-234) shows both WIs are actually Closed/merged — checklist is stale relative to the doc's own body; T7/T8 (WI-1174/1175) in progress, WI-1175 review done with CONDITIONAL-SHIP.

CANDIDATE WIs: none extracted by Phase 0 (register row 18 col 5 = "none") — consistent with this being the live program itself rather than residue to triage. No new candidates surfaced by this read; the document's own "Recommended follow-up actions" (lines 247-262) are the correct disposition path (tick T3/T4 checkboxes, land/re-scope WI-1207, rule on WI-1118, decide WI-1120, assign WI-904 owner, extend or scope-note `docs/flows/mobile-app-flow-inventory.md`) and should route through normal Cosmo mechanics (WI-1397 in row 17 covers the doc-refresh half of action #1), not through new spec-triage WIs.

VERDICT: valid

MVP RECOMMENDATION: in — this plan is the MVP publish-readiness gate itself (WS-28), directly serving the north star (V2 shell on Google Play). No orphan scope found: its own out-of-scope list already excludes S6/production-default-flip (correctly deferred to row 17's WI-1440), and its own self-audit already surfaces the WS-28 roster gap (WI-1207/1124/1120) and the checklist-vs-reality staleness — nothing here needs Phase 1 to invent; it needs the plan's own 6 recommended follow-ups executed.

CONFIDENCE: high. Decidable questions for Product (Zuzka): (1) Accept CONDITIONAL-SHIP as-is, or require the More-tab visual migration (billing/security/privacy rows still route to legacy `more/*` screens) before publish? (2) Land or formally defer WI-1207 (Practice-access regression) before WS-28 can claim "all items closed or deferred"? (3) Rule on WI-1118's topicless-vs-topic-scoped notes AC supersession.
