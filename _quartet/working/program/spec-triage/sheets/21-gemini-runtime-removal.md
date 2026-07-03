DOC: docs/plans/2026-06-24-gemini-runtime-removal-cutover.md (2026-06-24, 12.5K, 93 lines; sibling Phase A plan referenced in frontmatter, `docs/plans/2026-06-24-remove-gemini-runtime-tooling.md`, does NOT exist in repo)

CLAIMS:
- T-B0 precondition gate: `LLM_ROUTING_V2_ENABLED=true` has been live in production ≥7 days with no Gemini-fallback/safety regression, before any deletion work starts.
- H4 (judge/provider safety-net) and H5 (output moderation) must be live before Gemini leaves the live lane.
- Cutover compliance contracts (Cerebras ZDR/DPA, OpenAI ZDR-for-minors, SCCs/TIA) must be signed.
- T-B1–B7: delete legacy `getModelConfig()`/`getFallbackConfig()`, the flag itself, `providers/gemini.ts`, `'gemini'`/`'gemini_only'` type members, rename `GeminiOcrProvider`, purge Gemini from evals/scripts, shrink the `no-gemini-runtime` ratchet baseline.
- Rollback notes assume flag currently exists and defaults off if reverted (i.e. plan assumes deletion is the pending step, not the flip itself).

TECH VALIDITY: Plan's own precondition (T-B0.1) is unmet — see IMPLEMENTED.

IMPLEMENTED:
- Flag flip (WI-1435 claim) — **none**. `apps/api/src/config.ts:180` — `LLM_ROUTING_V2_ENABLED: z.enum(['true','false']).default('false')`. Still defaults `false`.
- Legacy Gemini path deletion (WI-1436 claim) — **none**. `apps/api/src/services/llm/router.ts:27-28,391-857` — legacy `getModelConfig`/`getFallbackConfig`, `'gemini'` in `PreferredLlmProvider`, `'gemini_only'` in `LlmProviderPolicy`, and the full Gemini branch logic (lines 697-857) are all present and load-bearing. `providers/gemini.ts` + `gemini.test.ts` still exist; 72 files repo-wide still reference `gemini`.
- Open gates — **partial**. `docs/registers/llm-models/master.md:120` — H4 (judge safety-net) is "Partially advanced (2026-06-26)": `CHALLENGE_ROUND_GRADER_ENABLED` judge path is callable for the grader flow only; suitability judge not yet migrated; H4 explicitly "remains open until the judge is on in production ahead of the V2 minor-traffic cutover." H5 (output moderation) not started ("Scope after the judge lands").
- Hard dependency (2026-06-26 addendum, master.md:132) — flag **must not** flip for minor traffic until `CHALLENGE_ROUND_GRADER_ENABLED=true` is staging-validated, else mastery silently never verifies (gpt-oss-120b returns `[]`). This is a newer, stricter gate than the plan doc itself contains.

CANDIDATE WIs:
- WI-1435 (flip `LLM_ROUTING_V2_ENABLED` default + soak) — **adopt**, but reframed: this is not a trivial flag-flip, it is gated on H4/H5 completion and the grader-flag dependency. Current state is pre-cutover, not post-launch soak.
- WI-1436 (delete legacy Gemini path post-soak) — **kill-for-now / re-file-as-blocked**: premature, no soak has started; deletion cannot land until WI-1435's gates clear. Recommend converting to a blocked/dependent item rather than an independent WI so it doesn't get picked up out of order.

VERDICT: needs-product-ruling — the plan is technically valid and current, but the register's Bucket-A "executed, residue = already-staged" read is **wrong**: this is pre-cutover, gated on two safety items (H4/H5) that are still open, not post-launch cleanup.

MVP RECOMMENDATION: product ruling required — this sits on the trust/safety critical path (under-18 Gemini exclusion), not on the V2-shell/RevenueCat surface directly, but a stalled cutover means the app is still running Gemini as universal primary in production today, which is a compliance exposure the north-star doesn't resolve by itself. Recommend flagging to Zuzka as a live risk item, not routine backlog hygiene.

CONFIDENCE: high (flag default and full legacy-path presence are unambiguous file:line facts) — 2 Zuzka questions: (1) Is Gemini exclusion for under-18 traffic a launch blocker for the Google Play submission, or can it ship with the legacy Gemini-default path still live? (2) Given H4/H5 are open, who owns closing them before MVP — is this in scope for the current sprint or deferred post-launch?

---
## PM correction (program-manager:fable, 2026-07-03, post-audit verification)

The "live compliance risk: Gemini serving under-18 traffic in prod" flag is REFUTED:
- Doppler prd has NO `LLM_ROUTING_V2_ENABLED` secret → code default `false` governs → legacy path live (auditor was right about this half).
- BUT the legacy path enforces the under-18 Gemini ban independently of the flag: `apps/api/src/services/llm/router.ts:679` (WI-1052 gate) routes `child`/`adolescent` to an approved non-Gemini provider BEFORE any Gemini selection, fails closed, and covers grader/judge selection too (comment at :675-677). Adults on Gemini are permitted under MMT-ADR-0016 §1.5.

Net: no compliance emergency. The row's real content stands — WI-1435 (gated flag flip + soak: H4 judge safety-net, H5 output moderation, challenge-grader staging validation) and WI-1436 (legacy deletion only after soak). Verdict downgrades from "needs-product-ruling (compliance)" to "valid — gated ops sequencing, post-launch chain". MVP: out.
