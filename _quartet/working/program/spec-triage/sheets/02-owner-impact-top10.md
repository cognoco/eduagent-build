DOC: docs/specs/2026-06-03-owner-impact-audit-top-10.md (2026-06-03, 21K)

CLAIMS: the 10 audit items still claimed open (1 line each)
1. Notification master switch `pushEnabled` never gets set `true` on OS-permission grant → daily/review/recall pushes never fire.
2. Three profile hard-delete paths cascade-destroy `consent_states` (GDPR consent proof) with no audit-log preservation.
3. Per-turn answer-correctness signal is never written to the learning envelope, so escalation can only climb, never de-escalate.
4. Three-strike adaptive-teaching system (`adaptive-teaching.ts`) is fully built/tested but has zero production callers of its strike logic.
5. Live LLM eval-gate CI guard — **already DONE** (spec's own 2026-06-27 status header marks it complete; not in candidate set).
6. `promotePendingDeepening` (pending_review→active) has zero production callers; CR-flagged weak concepts never reach the learner.
7. Challenge-Round mastery verification never writes `retention_cards.nextReviewAt`, so mastered topics get no future spaced review.
8. Voice STT/TTS locale only derives from language-learning subjects; non-language subjects default to `en-US`; cs/ja/pl have no locale mapping.
9. No `cache_control`/prompt-caching on the static system-prompt prefix sent every turn — pure margin loss.
10. No CI guard verifying `profileId` scoping on hand-written service-layer queries; RLS is dormant as a backstop.

TECH VALIDITY: per broken assumption, file:line
- #1 confirmed current: `apps/api/src/services/settings.ts:59` `pushEnabled: false` default; no `pushEnabled=true` write found in the settings write paths (`:168,226,237` pass through `input.pushEnabled` unchanged, caller must supply it — mobile grant-flow still doesn't per spec's cited `use-post-session-notification-ask.ts:99-113`).
- #2 confirmed current: `packages/database/src/schema/profiles.ts:283-300` (`consent_states` columns incl. `policyVersion`/`requestIp`/`userAgent`) with no `consent_audit_log` table anywhere in repo (only hit for the string is the audit doc's own cited evidence, not real schema/code).
- #3 confirmed current: `apps/api/src/services/session/session-exchange.ts:245-246,2487` — `correctAnswer` is read/branched-on (`computeCorrectStreak`) but no assignment site exists in this file; `escalation.ts` still has no de-escalate branch per spec's citation.
- #6 confirmed current: `rg promotePendingDeepening apps/api/src` → only `services/needs-deepening/promotion.ts` (definition) and its own `.test.ts`. Zero production callers, exactly as claimed.
- #4, #7, #8, #9, #10 not independently re-verified beyond the register's `verified 2026-07-03` Found-In citations (reused per Phase 1 rules); no contradicting evidence surfaced during the spot-check pass.

IMPLEMENTED: per item — none/partial/complete/superseded, file:line or WI cite
1. none — WI-1441.
2. none — WI-1442.
3. none — WI-1443.
4. none — WI-1444.
5. **complete** — doc's own status header (line 3): "1 of 10 top items done (#5 eval gate)." Confirms why item #5 is absent from the candidate set: it shipped and was correctly excluded during Phase-0 extraction, not dropped by mistake.
6. none — WI-1446.
7. none — WI-1445.
8. none — WI-1447.
9. none — WI-1448.
10. none — WI-1449.

CANDIDATE WIs: WI-1441..1449 each with fate: adopt / merge-into-<WI> / kill (+reason)
- WI-1441 (pushEnabled on grant) — adopt. Small effort, launch-day retention lever, tech validity confirmed current.
- WI-1442 (GDPR consent audit trail) — adopt, route to compliance lane (WS-30/29 per instructions). Compliance-adjacent, cannot be waved off by MVP-scope bias.
- WI-1443 (per-turn correctness signal) — adopt as keystone of correctness-chain epic (#3→#4→#7); needed before #4/#7 can land.
- WI-1444 (wire or delete three-strike) — merge-into-WI-1443 (sequenced epic, not independent — spec explicitly says "builds on #3"); do not execute standalone.
- WI-1445 (nextReviewAt on CR mastery) — merge-into-WI-1443 (same epic, consumes the correctness signal; spec: "the three-strike system and spaced-review scheduling both consume that signal").
- WI-1446 (promote pending→active) — adopt standalone. Independent of the correctness-chain epic, small effort, high impact (fast-wins batch per spec).
- WI-1447 (voice locale fallback) — adopt. Small effort, hits home market (Norway), typed Bug — genuine defect not enhancement.
- WI-1448 (prompt caching) — kill for MVP / defer to post-launch backlog. Pure cost-margin play, zero user-facing effect, independent of ship-readiness.
- WI-1449 (CI scope guard) — adopt but scope down to guard-test only (no RLS activation) for MVP; RLS activation is a larger, separate follow-on per spec's own "pair as fast-follow" framing.

VERDICT: dominant + per-item where they diverge
Dominant: **valid** — this is a live, still-accurate built-but-not-wired audit; spot-checks (3 of 4 checkable claims) confirm code is unchanged since 2026-06-03. Per-item divergence: item #5 is **superseded** (shipped, correctly untracked); items #4 and #7 are **valid but not independently actionable** — they're sequencing dependents of #3, not standalone work; the rest are **valid, standalone**.

MVP RECOMMENDATION: split into in / out / finish-or-hide vs north star (Config T V2 shell on Google Play, RevenueCat Plus-only, proven V1 fallback). Bias: burden of proof on inclusion.
- IN (burden of proof met — small effort, direct launch-day/compliance impact): WI-1441 (push reachability), WI-1446 (CR weak-spot promotion), WI-1447 (voice locale, Norway home market) — the spec's own "fast-wins batch."
- IN, compliance-gated (not a pure product call): WI-1442 (GDPR consent-audit preservation) — flag to WS-30/29 compliance lane per instructions; do not let MVP scope-cutting override a legal-exposure item.
- FINISH-OR-HIDE (large effort, foundational but not launch-blocking): the WI-1443→1444→1445 correctness-chain epic. If not scheduled for MVP, the adaptive-teaching (`adaptive-teaching.ts`) and its tests should stay explicitly flagged as "built, intentionally unwired" rather than silently backlogged — spec's own alternate instruction for #4 is "if the escalation ladder is meant to be the sole mechanism, delete the stranded functions" — a real decision the team hasn't made.
- OUT (fails burden of proof for MVP): WI-1448 (prompt caching — cost-only, no user impact) — defer to post-launch cost-optimization pass.
- IN, reduced scope: WI-1449 (CI scope guard) — the guard-test half is cheap defense-in-depth against a leak class already shipped once (2026-05-10 incident); the RLS-activation half is out of MVP scope.

CONFIDENCE: high/med/low + up to 3 decidable Zuzka questions
Confidence: **high** on tech validity (spot-checked 3/4 core claims against live source, all confirmed unchanged); **medium** on MVP inclusion calls (product judgment, not fact).
1. Does the correctness-chain epic (WI-1443/1444/1445) get an MVP slot, or is it explicitly deferred post-launch with adaptive-teaching.ts left "intentionally dormant" (documented, not deleted)?
2. Is WI-1442 (consent audit trail) already covered by an existing compliance-lane WI, or does this sheet's candidate need a fresh capture into WS-30/29?
3. For WI-1449, is the guard-test-only scope (no RLS activation) acceptable for MVP, or does the 2026-05-10 cross-account-leak incident require pulling RLS activation into launch scope too?
