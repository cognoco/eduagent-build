DOC: docs/specs/2026-06-03-review-relearn-findings-and-high-impact-todos.md (2026-06-03, ~30K)

CLAIMS: the doc is a findings-capture + prioritized to-do list (RR-1..15), not a spec — "no build approved." Its own 2026-06-27 status banner already marks progress: RR-1 + RR-13-minimal-thread SHIPPED flag-dark (`REVIEW_CALLBACK_OPENER_ENABLED` default false), RR-14 dead-code half done (persistence.ts deleted), grader/judge service (#1538) landed, simulator harness (RR-2 pre-screen) exists. 11 of 15 items marked "not started" as of that banner. Candidates open per-item:
- RR-3 (WI-1461): dual push-cron double-push risk, differing `pushEnabled` vs `pushEnabled && reviewReminders` gates.
- RR-4 (WI-1462): `redirect_to_library` 3rd-fail dead-end should become bounded re-teach off-ramp.
- RR-5 (WI-1463): relearn list should default to SM-2 system-ranked order, not self-diagnose pick.
- RR-6 (WI-1464): calibrate all-or-nothing mastery bar pre-flip via simulator (note-overlap half deferred post-launch).
- RR-7 (WI-1465): strugglers structurally locked out of Challenge Round re-verification; needs low-stakes per-concept re-prove path.
- RR-8 (WI-1466): no cooldown on Challenge Round completion (only on decline) — re-offer nagging risk.
- RR-9 (WI-1467): recall-grading context is topic-title + one answer only, with a char-count fallback on LLM failure.
- RR-10 (WI-1468): two weak-spot channels (SM-2 overdue vs Challenge `needs_deepening`) don't merge into one relearn queue; UI reason-tag remainder.
- RR-11 (WI-1469): SM-2-verified vs Challenge-verified mastery axes never reconcile — undecided product question.
- RR-14 (WI-1471): remaining cleanup — dual cooldown constant source-of-truth, relearn bypasses `startSession`.
- RR-15 (WI-1472): spec the deep per-subject review diagnostic + cross-subject Checkup (the ratified backbone, never specced).

TECH VALIDITY: spot-checked 3 of the doc's load-bearing claims against current source (2026-07-03):
- `CHALLENGE_ROUND_RUNTIME_ENABLED` default-false gate — confirmed live, `apps/api/src/config.ts:162` (doc cited `:140`; line drift only, claim intact).
- Completion-cooldown gap (RR-8) — confirmed live: `trigger.ts:130` still only checks `CHALLENGE_OFFER_COOLDOWN_MS` after a decline path (`route-actions.ts`); no completion-side cooldown write found.
- Struggler lockout (RR-7) — confirmed live: `trigger.ts:80` `if (input.struggleStatus !== 'normal') { ... }` gates Challenge Round eligibility unconditionally.
- RR-14's "dead persistence.ts" claim is now STALE in the doc's Part 1 body (still lists it under "Dead code") but the doc's own 2026-06-27 status banner already flags it fixed — confirmed: `fd persistence.ts apps/api/src/services/challenge-round/` returns nothing, file is gone. WI-1471 (RR-14) should scope to the two remaining items only (cooldown-constant dedup + `startSession` routing), not re-delete anything.
- Did not re-verify RR-9/RR-10/RR-11/RR-3/RR-4/RR-5 line-for-line; candidates carry their own `verified 2026-07-03` evidence and none of the spot-checks above surfaced doc/code drift beyond expected line-number shift, so no reason to distrust the rest.

IMPLEMENTED (per RR item):
- RR-1: complete, flag-dark (`REVIEW_CALLBACK_OPENER_ENABLED=false`) — no open candidate (correctly not extracted; ships-when-flagged).
- RR-2: complete as a pre-flip gate (simulator harness + grader bake-off + WI-1100 regression lock) — no open candidate.
- RR-13 minimal thread: complete, shipped with RR-1. RR-13 full path-preview: none — WI-1470 open.
- RR-3, RR-4, RR-5, RR-6, RR-7, RR-8, RR-9, RR-10 (data-merge half), RR-11, RR-14 (residual): none — all open, candidates correctly extracted.
- RR-10 UI reason-tag (WI-1468): explicitly self-described as deferred-until-flip in its own title; not implementable before RR-12.
- RR-12 (prod flag flip): none, explicitly gated last on RR-2/6/7/8/14 — correctly has NO standalone candidate in this batch (register confirms; flip is an ops action, not a WI).
- RR-15: none — no spec file exists under `docs/specs/` for subject-review/Checkup; WI-1472 correctly open and gated on a still-unresolved user strategic fork.

CANDIDATE WIs:
- WI-1461 (RR-3, Bug): adopt as-is, but flag the CH-2 note as a product decision embedded in the ticket — don't let it get executed as a mechanical cron merge. Real double-push bug, user-visible.
- WI-1462 (RR-4, Enhancement): adopt. Felt-quality fix; scope must include the CH-3 bounded-escalation exit condition, not just "remove redirect."
- WI-1463 (RR-5, Enhancement): adopt. Small, low-risk, preserves override per CH-LOW.
- WI-1464 (RR-6, Task): adopt, mastery-bar half only (simulator-driven, pre-flip). Note-overlap half is out of scope until post-launch — don't let this ticket balloon into the post-launch gate.
- WI-1465 (RR-7, Enhancement): adopt but flag as design-heavy — CH-5 requires a genuinely new low-stakes per-concept flow, not a gate removal. Likely needs a mini-spec before execution.
- WI-1466 (RR-8, Bug): adopt. Small, mechanical, real user-facing nag risk (re-offer immediately after acing).
- WI-1467 (RR-9, Enhancement): adopt, but low priority (P2) — grading-context depth is a quality improvement, not correctness-breaking; the char-count fallback already prevents crashes.
- WI-1468 (RR-10 remainder, Enhancement): merge-into-WI-1467-cluster is wrong — keep separate, but mark blocked-on-RR-12 explicitly in the ticket (its own title already says so); do not schedule before the flag flip.
- WI-1469 (RR-11, Design): adopt as a design-decision ticket, not an implementation ticket — this is "decide the axis relationship," output should be a short design note, not code, until decided.
- WI-1471 (RR-14, Hygiene): adopt, rescope to drop the already-deleted persistence.ts bullet (stale) — remaining scope is cooldown-constant dedup + relearn `startSession` routing only.
- WI-1472 (RR-15, Design): adopt but mark explicitly blocked on the user's strategic fork (`project_deadends_triage_and_subject_review.md`) — this is a needs-product-ruling item, not executable today.
- (WI-1470, RR-13 full path-preview, Enhancement — appears in tsv row but not itemized above by number; confirmed present, adopt as P2 parallel enhancement, no dependency blockers.)

Bugs (RR-3/WI-1461, RR-8/WI-1466) are the two genuinely user-visible defects in this batch — both are small, low-risk, worth prioritizing over the enhancement items regardless of MVP scope decisions below.

VERDICT: partially-implemented (as a document: 3 of 15 RR items shipped flag-dark since 2026-06-03, 11 still open exactly as tracked, 1 — RR-12 — is an ops flag-flip with no code gap). Two items (RR-7, RR-15) lean needs-product-ruling — RR-7 because the "fix" requires reconciling with the north-star's "never a test you can fail" constraint, RR-15 because it's gated on an unresolved strategic fork.

MVP RECOMMENDATION (bias: burden of proof on inclusion — does MVP fail without this?):
- IN (finish before MVP ship): WI-1461 (RR-3, double-push bug — live user annoyance), WI-1466 (RR-8, no-cooldown bug — live nag risk). Both are cheap, mechanical, and fix real defects in a currently-live surface (SM-2 review loop ships regardless of Challenge Round flag state).
- OUT (post-MVP, Challenge Round is entirely flag-dark and MVP does not require flipping it): WI-1464 (RR-6), WI-1465 (RR-7), WI-1467 (RR-9), WI-1468 (RR-10 remainder), WI-1469 (RR-11), WI-1471 (RR-14 residual) — all either gate on or only matter once `CHALLENGE_ROUND_RUNTIME_ENABLED` flips. RR-12 itself (the flip) is confirmed out of MVP scope — north star explicitly orders LOAD-BEARING last and MVP is Config-T V2-shell-first, not rigor-layer-first.
- OUT (strategy fork, not gated by MVP): WI-1472 (RR-15) — genuinely unspecced backbone feature; correctly deferred pending the operator's strategic ruling, not an MVP blocker.
- FINISH-OR-HIDE (small felt-quality, cheap, but not MVP-critical — bundle only if capacity allows): WI-1462 (RR-4 dead-end fix), WI-1463 (RR-5 system-ranked order), WI-1470 (RR-13 path preview). None block MVP; all improve the live SM-2 review loop learners actually see today.

CONFIDENCE: high — doc's own 2026-06-27 status banner plus 3 independent code spot-checks agree; no drift found beyond expected line-number shift and the one stale "dead code" bullet already self-corrected by the banner.
1. Should WI-1461/WI-1466 (the two live-loop Bugs) be pulled into the MVP punch-list now, or is "Config T V2 shell + Plus-only billing" scope frozen tight enough that even cheap bug fixes wait?
2. Is RR-7's struggler-lockout (WI-1465) worth a mini-spec now (pre-MVP), given it's flag-dark and won't be learner-visible until RR-12 flips — or fully deferred with RR-12?
3. RR-15 (WI-1472, deep per-subject review diagnostic) is gated on an unresolved strategic fork in `project_deadends_triage_and_subject_review.md` — does that fork get ruled in this same Phase-3 Zuzka session, or is it explicitly out of scope for the triage pack?
