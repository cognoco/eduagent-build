# PRG-10 · API Security & PII — execution tracker

> **THE entry point for this workstream.** Shepherd-owned once spawned.
> Umbrella row: `_wip/umbrella-program/program-roster.md` PRG-10. Charter:
> `_wip/umbrella-program/activation-planning.md` §2 PRG-10. Full finding text:
> `docs/audit/2026-05-29-full-audit/L-gap-delta.md` (label `security-pii-api`).

**Activated:** 2026-06-13 (sixth run of the §2.1 recipe; first parallel activation
*after* the IF cutover went live) · **Operator:** Jorn · **Shepherd:** PRG-10 shepherd
session (spawn pending kickoff) · **Cosmo Workstream:** "API Security & PII"
(`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`)

## 1. Charter (one paragraph)

All 27 `security-pii-api` clear-out findings from the 2026-05-29 full audit
remediated: CI/GHA permission over-grant + gate integrity, API input-validation +
resource bounds, one DoS vector + three race/atomicity defects, quota/billing
correctness gaps, logging/config hygiene, one LLM prompt-injection fence, and mobile
markdown link/image safety. Scope is the **non-IF** API security surface
(`Disposition=in-other-workstream`, `Defer-to-workstream=security-pii-api`) — distinct
from the in-IF-scope security findings IF's W2/W3 waves owned. Gate: **both fired
2026-06-11** (G2 safe-subset + G4 auth/PII remainder); the charter's "serialize behind
W2/W3" framing is **spent** (W2-W4 closed). See §3 for the slice scan.

## 2. Unit map

| Unit | Name | Alt | Findings | Pri | Order |
|---|---|---|---|---|---|
| **WI-698** | WP-secapi-ci-gha-hardening — GHA permission scopes + CI gate integrity | WP | F-024 · F-119 · F-127 · F-129 · F-132 · F-154 | P1 | 1 |
| **WI-699** | WP-secapi-dos-race — JWKS DoS + 3 race/atomicity defects | WP | F-181 · F-120 · F-164 · F-167 | P1 | 2 |
| **WI-700** | WP-secapi-input-validation — route/DTO bounds + schema guards | WP | F-142 · F-158 · F-166 · F-179 · F-180 | P2 | 3 |
| **WI-701** | WP-secapi-quota-billing — metering/quota correctness gaps | WP | F-128 · F-146 · F-148 | P2 | 4 |
| **WI-702** | WP-secapi-logging-config-hygiene — logging + config hardening sweep | WP | F-077 · F-079 · F-080 · F-081 · F-082 · F-138 · F-143 | P2 | 5 |
| **WI-703** | IT-secapi-llm-prompt-injection — fence learner library context | Item | F-139 | P2 | 6 |
| **WI-704** | IT-secapi-mobile-markdown — ThemedMarkdown link/image safety | Item | F-027 | P2 | 7 |

**All seven units are independent — no inter-unit dependency, no `Blocked-by` edges,
no CUT-B coordination edge (see §3).** Order is priority-led (HIGH-severity WPs first),
not a serialization. The shepherd may parallelize freely. The five WPs decompose into
absorbed-provenance child WIs at the DoR bridge (`refine --to-ready`); the two Items are
single-finding by design.

## 3. Slice-time decisions (activation, 2026-06-13)

Source: read-only finding-register + subsumption/coordination scan (sub-agent,
2026-06-13). Headline: **27/27 LIVE, 27/27 CLEAN.**

1. **Register reconciliation — exact match, 27.** The parsed set
   (`Disposition=in-other-workstream` ∧ `Defer-to-workstream=security-pii-api`) equals
   the charter's 27 IDs exactly. The earlier 51-grep figure counted rows where
   `security-pii-api` sits in the *Interim owner* column (in-IF obligations), not
   *Defer-to-workstream* — those are IF's, not PRG-10's.
2. **Subsumption scan vs IF (W0–W4 closed, on `main`) — NONE subsumed.** 27/27 LIVE.
   The GHA workflows still carry the over-broad `id-token:write` / `issues:write`
   scopes; `cors.ts`, `rls.ts`, the quiz/assessment/dictation routes, the JWKS fetcher
   and `updateInterestsContext` show no IF-wave commits. (Contrast PRG-13, where one
   finding shrank 3 legs→2.) Executors still re-grep each finding fresh at plan time.
3. **Cutover-coordination scan vs the LIVE IF cutover (CUT-B1/B2/B3) — ALL CLEAN.**
   None of the 27 touch the identity-spine / consent+family / billing-webhook surfaces
   the cutover is rewriting. PRG-10's surface is `.github/workflows/`, mobile
   components, API route input-validation, the JWKS fetcher, quota *metering* (distinct
   files from the Stripe/RevenueCat *webhook handlers* CUT-B3 rewrites), and
   logging/config hygiene — disjoint from the cutover-plan §2 read-path, §2.2 auth
   chain, §2.3 consent surface, §2.4 webhook surface, and Appendix-B inventory.
   **PRG-10 is fully parallel-safe with the in-flight cutover** — no sequencing edge.
4. **Charter OQ1 (CI/GHA findings → PRG-10 or PRG-14?) — KEEP in PRG-10 (WI-698).**
   F-024/F-127/F-154 are permission-narrowing + gate-hardening living in the same two
   workflow files as F-119/F-132 — one reviewer pass covers all six. PRG-14 keeps the
   *structural* CI findings it already owns (F-151 dead-branch script injection, F-157
   ineffective required check); the boundary is permission/gate → PRG-10, platform
   structure → PRG-14. Folding would fragment WI-698 for no gain.
5. **Charter OQ2 (per-finding blast-radius file-touch audit) — DONE at activation**
   (decisions 2+3 above), not deferred to execution. Per-PR fresh-grep still expected.

## 4. Inherited mechanisms (wire from the start)

- **Autonomous review loop:** verify reviewer-watcher coverage for Workstream "API
  Security & PII" on arrival (multi-workstream config array,
  `_wip/identity-foundation/review-watcher-v3.ts`; extension recipe in
  `_wip/identity-foundation/review-loop-productization-handoff.md`). Items moved to
  Reviewing are closed/bounced autonomously. Mind the known restart-gap (a WP can enter
  Reviewing during the ~45s watcher restart — launch its review manually if so).
- **Executor protocol:** dispatch build via `_wip/identity-foundation/executor-protocol.md`
  (+ example). **Mandatory plan-phase stop before code** — load-bearing (it caught the
  IF cutover gap).
- **PR-per-unit, base `main`:** one PR per WI/WP against `main` (post-merge: new-llm is
  in; `main` is the integration base). Preserves the proven Cosmo review loop. Worktrees
  under `.worktrees/<branch>/` per the repo worktree-setup skill.
- **Cosmo lifecycle:** claim before execute · `complete` → Reviewing · never self-close ·
  WP DoR bridge (`refine --to-ready` authors the bundle brief + links absorbed-provenance
  children) before claiming. Apply the childless-WP→Item rule at promotion (WI-683):
  a WP that won't decompose gets demoted, not forced.
- **Supervision profile (charter):** medium — agent-heavy on the hygiene/input-validation
  sweeps (WI-700/702); human review on the auth/CI-permission changes (WI-698) and the
  concurrency fixes (WI-699). Security fixes tagged HIGH need a red-green negative-path
  break test (repo Fix Development Rules).
- **Landing checks:** adjudicate red `main` at CI *step* level before bouncing. Known
  ambient: confirm the chronic staging Deploy red is gone (WI-664 Closed post-merge); if
  a new ambient red appears, capture it, don't fix it inline.

## 5. Execution state

- 2026-06-13 — **Activated** (program session). Cosmo Workstream "API Security & PII"
  (`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`) + WI-698…704 created (`Stage=Backlog`,
  Workstream Order 1–7). Subsumption + cutover-coordination scan done (§3): 27/27 LIVE,
  27/27 CLEAN, OQ1/OQ2 resolved. Roster + dashboard promoted to Active. Shepherd kickoff
  prompt handed to operator; spawn pending.
