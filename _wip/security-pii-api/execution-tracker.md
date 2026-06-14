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

## 4. How to run it (process lives in the protocols — this section is lane-specific only)

Read the standard scaffolds; don't re-derive process here:
- `_wip/identity-foundation/shepherd-protocol.md` — the shepherd scaffold: your job, the
  three-role split (the **reviewer is a SEPARATE session** — you self-monitor Cosmo for
  verdicts; **DoD = Cosmo Close, not a green PR**), dispatch + model/effort defaults, the
  Cosmo lifecycle.
- `_wip/identity-foundation/executor-protocol.md` (+ `-example`) — the scaffold your
  executors follow (Claim → Worktree → Plan → Implement → adversarial-review loop →
  PR-to-green → Complete) and the thin pointer-brief shape.

Lane-specific only:
- **Reviewer coverage:** the separate reviewer session already covers Workstream
  "API Security & PII" (`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`) — confirm on arrival.
- **PR base `main`; no `Blocked-by` edges** — all 7 units are parallel-safe (slice scan §3)
  and parallel-safe with the live IF cutover. Childless-WP→Item applies at refine (WI-683).
- **Supervision (charter = medium):** human review on WI-698 (auth/CI-permission) and WI-699
  (concurrency); WI-700/702/703/704 are agent-routine. HIGH-severity security fixes
  (F-119, F-181, F-132) need a red-green negative-path break test.
- **Model/effort escalations (default Sonnet per the protocol):** run WI-699
  (concurrency/atomicity) and the F-132/F-119 trust-boundary pieces of WI-698 with an Opus
  plan-phase; WI-700–704 stay Sonnet.
- **Landing checks:** WI-664 staging-Deploy red was Closed post-merge — if a NEW ambient red
  appears, capture it, don't fix inline.

## 5. Execution state

- 2026-06-13 — **Activated** (program session). Cosmo Workstream "API Security & PII"
  (`37e8bce9-1f7c-8161-a3fc-c74c5300a88f`) + WI-698…704 created (`Stage=Backlog`,
  Workstream Order 1–7). Subsumption + cutover-coordination scan done (§3): 27/27 LIVE,
  27/27 CLEAN, OQ1/OQ2 resolved. Roster + dashboard promoted to Active.
- 2026-06-13 — First shepherd shut down pre-execution (its bespoke kickoff was non-standard
  and lineage-confused). Realigned to the standard machinery: deleted the bespoke kickoff;
  process now lives in `shepherd-protocol.md` + `executor-protocol.md`, with §4 carrying only
  the lane-specific bits. Clean thin kickoff handed to operator; fresh spawn pending.
- 2026-06-13 — **Fresh shepherd spawned; DoR bridge complete — all 7 units now `Ready`.**
  Decision (per WI-683 split-or-demote + the WI-577/578 dogfooded precedent): the 5 WPs were
  **kept as WPs and split into ≥2 coarse absorbed-provenance children**, not demoted to Item
  and not one-child-per-finding — no `/cosmo:bundle` skill ships in cosmo 0.6.0, so the brief
  (body) + child Items were authored via REST and promoted with `refine.ts --to-ready`.
  Child WIs created (Item, no `Workstream` relation, `Parent item`→WP, bulk-close at WP close).
  **Actual mapping (ground-truth, read back from Cosmo — my initial brief labels were offset by
  guessing sequential numbers instead of reading them back; corrected here):**
  WI-698 → **709/710** · WI-699 → **711/712** · WI-700 → 707/708 · WI-701 → **713/714** ·
  WI-702 → **715/716**. (Lesson: read child IDs back from the create response before citing them.)
- 2026-06-13 — **Two rework patterns learned (durable, both shepherd-side, no code defects):**
  (A) **Absorbed children must be bulk-closed at WP merge, not left for the close ceremony** —
  the reviewer's `/cosmo:review` DoD gate flags open WP children as a child-closure/evidence gap
  (it bounced WI-702 for this). Shepherd fix: immediately after merging a WP's PR, PATCH each
  child to `Stage=Closed, Resolution=Done, Fixed In=<merge commit>, Completed` (omit `Resolved`/
  `State` in the PATCH — including them 422s). Done for WI-700 (707/708←6fea5bc5) and WI-702
  (715/716←96d160b8). Do the same for 698/699/701 children at their merges.
  (B) **Stale-branch merge-invariant** — the REQUIRED `Merge completeness check` (WI-680) fails a
  PR whose branch predates sibling merges (it bounced WI-701 #1115: its merge preview would drop
  WI-702's `index.ts`/`cors.test.ts`/`maintenance.ts`/`test-seed.ts`). Fix: `git merge origin/main`
  into the feature branch (NOT rebase/force-push), push. Proactively warned WI-698/699 executors
  to merge main before their PRs. As main advances per merge, every still-open branch is more stale.
- 2026-06-13 — **Follow-up capture candidate (out of WI-698 scope):** the WI-698 executor found
  `.github/workflows/eval-live.yml:30` carries workflow-scope `issues: write` (single-job) — the
  same over-grant pattern as F-127 but on a different workflow, outside WI-698's named finding set.
  Worth a `/cosmo:capture` as a sibling CI-hygiene item; not fixed inline (scope discipline).
- 2026-06-13 — **✅ LANE COMPLETE — 7/7 units Closed (Resolution=Done), all 10 absorbed
  children Closed (17 total).** Final close order: 703, 704 → 698 → 701 → 699 → 700 → 702.
  All 27 `security-pii-api` findings remediated and landed on `main` (PRs #1108/1109/1111/1114/
  1121/1122). Two units took rework loops, both shepherd-side evidence (no code defects):
  child-evidence/PR-body child-ID mismatches (root cause: initial child-WI numbering guessed,
  not read back) and stale-branch merge-invariant (each merge re-stales open branches → re-merge
  `origin/main`). WI-699 migration-safety call (single-step `0116` retained) and WI-702 F-138
  (web-localStorage fallback **risk-acceptance accepted by operator** — web non-prod, native
  Keychain-guarded) were the two human-gate rulings. **Follow-ups (not blocking this lane):**
  (1) `/cosmo:capture` the `eval-live.yml:30 issues:write` sibling over-grant; (2) deploy-time:
  apply migration `0116` to staging/prod via `drizzle-kit migrate` before the new dictation
  conflict-target code serves traffic (worker deploy ≠ Neon migrate; `## Rollback` in PR #1122);
  (3) 2 unpushed local commits on the shared `main` checkout (`4051617f0`, `4b26734b5` — a
  cross-program `/commit` misfire) await the program/operator's disposition before any `main`
  push. Worktrees `.worktrees/WI-698…702` can be removed at the operator's convenience.
  All 7 set `Execution Path=Assisted` (shepherd-dispatched, supervised — not Auto/dispatcher);
  WI-698/699 also given `Risk/Impact` (P1). Next: stand up the verdict monitor and dispatch
  executors (Sonnet default; Opus plan-phase for WI-699 and the F-132/F-119 pieces of WI-698).
- 2026-06-13 — **Verdict monitor up** (90s poll on the 7 WIs' Stage, emits on change).
  **Wave 1 dispatched** (background Sonnet executors, per `executor-protocol.md`): WI-704,
  WI-703, WI-700 — two Items + one straightforward P2 WP, as pipeline validators before the
  expensive units. Wave 2 (WI-701, WI-702 Sonnet; WI-698, WI-699 with Opus plan-phase) held
  until a Wave-1 PR opens cleanly. Executors stop at green-PR-+-triaged and report; shepherd
  owns merge, then resumes the executor to run `/cosmo:execute complete` (→ Reviewing) for the
  separate reviewer session.
- 2026-06-13 — **First three landed; lane fully dispatched.** WI-700 (`6fea5bc5`, PR #1111),
  WI-704 (`d2ba2ef8`, PR #1109), WI-703 (`71f94a1f`, PR #1108) squash-merged to `main` and
  `/cosmo:execute complete`-d → **Stage=Reviewing** (awaiting the separate reviewer's
  verdict + absorbed-child bulk-close: 707/708, and 705/706·709/710·711/712·713/714 at their
  WPs' close). Triage handled in-loop: WI-704 took a valid Codex **P1** (disabled remote images
  entirely vs https-allowlist); WI-703 took a Codex **P2** that was actually an incomplete-fix
  vs the AC (added the `<library_topics>` delimiter layer over the strip layer). **Systemic:**
  `claude-review` is failing lane-wide with "All review tokens exhausted" = the documented
  advisory non-run; it is **not** a required check (required = `main`, `Playwright web smoke`,
  `API Quality Gate`, `Merge completeness check`), so merges proceed on CodeRabbit + Codex +
  executor-adversarial coverage. **Wave 2b dispatched:** WI-698, WI-699 on **Opus** with a
  mandatory plan-approval checkpoint (P1, human-supervised) before they implement. WI-701,
  WI-702 still implementing.

## 6. Fast-follow wave (PRG-10 gate-gap residuals) — activated 2026-06-14

**Why this wave exists.** All 7 original units (17 WIs) closed via Cosmo review + QA — but every
one of the 7 PRs (#1108/1109/1111/1114/1121/1122) merged with `claude-review` **red**: the OIDC
outage (PR #1121 stripped `id-token: write`; fixed in `daba25e62`) that read lane-wide as "all
review tokens exhausted." A **retroactive consolidated Claude review** (read-only,
`_wip/security-pii-api/prg-10-consolidated-review-result.md`) closed that gate gap:
**0 BLOCKER · 2 MUST_FIX · 8 SHOULD_FIX · 9 CONSIDER** — safe-as-merged, but real residuals.
Operator-decomposed into 6 Items (program session, 2026-06-14).

**Units** (all `Stage=Ready` except WI-739 `Backlog`; `Execution Path=Assisted`):

| WI | Sev | P | Title | Findings |
|----|-----|---|-------|----------|
| WI-734 | MUST | P1 | Meter/hard-stop homework-summary on profile-missing path (+ escalation) | M1 · F-128 · PR #1115 |
| WI-735 | MUST | P1 | Cap server-side homework `problems` array | M2 · F-158 · PR #1111 |
| WI-736 | SHOULD | P2 | GHA hardening: `@claude` actor-guard + env-var-indirection doc | S1+S2 · F-119,F-129 · PR #1121 |
| WI-737 | SHOULD | P2 | Account-scope the interests CAS update (TOCTOU) | S5+C3 · F-164 · PR #1122 |
| WI-738 | SHOULD | P2 | API correctness & observability top-ups (bundle) | S3,S4,S6,S7,S8,S9,C7 |
| WI-739 | CONSIDER | P3 | Defense-in-depth hygiene sweep (backlog) | C1,C2,C5,C6,C8,C9 |

**Sequencing.** MUST_FIX first (WI-734, WI-735 — each carries a red-green break test per Fix
Development Rules), then the SHOULD trio (736/737/738); WI-739 is backlog. **WI-734 carries an
explicit operator product-question** (best-effort-LLM-at-any-cost vs hard-stop) — raise it on the
progress channel as `needs-operator` before assuming hard-stop.

**Gate (non-negotiable).** `claude-review` OIDC is now fixed — these residuals merge **only**
through the strict green-PR gate (`shepherd-protocol.md` → *Merging the WP*): every required check
SUCCESS, `claude-review` actually green, no open blocker/must/should, `mergeStateStatus=CLEAN`.

**Continuity + POC.** Same lane/workstream, **same shepherd re-engaged** (not a fresh spawn) —
these are this lane's own gate-gap. First lane to run with the **orchestrator↔shepherd progress
channel** wired: mailboxes at `_wip/security-pii-api/_state/{outbox,inbox}.jsonl`
(`shepherd-protocol.md` → *Progress channel*; design `_wip/identity-foundation/progress-channel-design.md`).
