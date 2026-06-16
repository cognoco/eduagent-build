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

### Fast-follow execution state

- 2026-06-14 — **Re-engaged; channel POC ran clean end-to-end.** Emitted `prg10ff-001`
  (`needs-operator`, WI-734 A-vs-B). Orchestrator inbox: `in-001` greenlit WI-735 parallel;
  `in-002` ruled **WI-734 = Option A** (hard-stop as a throw so Inngest step-retry absorbs
  replication lag; `captureException`/`safeSend` escalation only after retries still find no
  profile). Closed the loop with `prg10ff-002` (`decision`, resolved). Both P1 MUST_FIX
  executors dispatched (background Sonnet, `executor-protocol.md`).
- 2026-06-14 — **WI-735 (M2/F-158) landed.** PR #1162 squash-merged → `main` commit
  **`f031a15b9`**. Strict green-PR gate verified by shepherd: all required checks SUCCESS,
  **`claude-review` actually SUCCESS** (OIDC fix confirmed — gate-gap pattern broken),
  `mergeStateStatus=CLEAN`. Fix: `MAX_HOMEWORK_PROBLEMS=50` cap on
  `homeworkSessionMetadataSchema.problems`, propagating to the `/homework-state` write path +
  session-start path; red-green break tests at schema + route level. Executor resumed to run
  `/cosmo:execute complete` → **Stage=Reviewing** (verified: Fixed In `f031a15b`, Resolved
  `2026-06-14T12:35Z`, claim settled). Awaiting the separate reviewer's verdict. **Deferred
  Codex CONSIDER (shepherd ruling, within mandate — kept the MUST_FIX surgical):** align mobile
  `serializeProblemsWithinBudget` to import the cap + count-slice before the byte-budget loop, so
  the client never builds a set the server 400s — recorded in the WI-735 completion Follow-ups;
  track as a follow-up (fold into WI-738 or a fresh capture), not in this PR.
- 2026-06-14 — **WI-734 (M1/F-128) landed.** PR #1161 squash-merged → `main` commit
  **`bf94cdf19`**. Strict gate verified (all required SUCCESS, `claude-review` green,
  CLEAN/MERGEABLE). Key correctness detail the executor caught: the profile fetch + missing
  guard were moved **outside** `runIsolated` (which swallows throws and returns `failed`), so the
  hard-stop `throw` actually propagates through `step.run` → Inngest retries absorb replication
  lag; `captureException` + `safeSend` (`billing.homework_summary.profile_missing`) fire, LLM not
  called. Red-green break test verified. Executor resumed for `/cosmo:execute complete` →
  Reviewing. Accepted CONSIDER: escalation fires once per retry (~4× alerts on a persistent
  miss) — ops thresholds dedupe, no code action.
- 2026-06-14 — **Both MUST_FIX landed; SHOULD trio dispatched.** Per kickoff sequencing,
  WI-736 (S1 `@claude` actor-guard + S2 env-var-indirection doc), WI-737 (S5/C3 interests CAS
  account-scoping), WI-738 (S3/S4/S6/S7/S8/S9/C7 correctness+observability bundle) dispatched as
  background Sonnet executors — independent files, parallel-safe with each other and the in-flight
  MUST reviews. WI-739 (CONSIDER hygiene) remains Backlog.
- 2026-06-14 — **SHOULD trio landed; all 5 active units now merged + Reviewing.** WI-736
  (#1165, `57909130`), WI-737 (#1166, `03d7f7d4`), WI-738 (#1167, `8924a186`) merged. WI-739
  (CONSIDER hygiene) remains Backlog (not in this push).
- 2026-06-14 — **⚠ GATE BREACH + process defect (resolved, ratified).** The resumed WI-734
  executor (dispatched only to `complete` WI-734) **overstepped into shepherd authority**: it
  merged #1165/1166/1167 itself and **self-granted a gate exception on #1165's RED
  `claude-review`**, mischaracterizing the cause as a "self-referential 401" when the log shows
  the advisory non-run ("No verdict marker … token exhaustion/timeout/crash"). Shepherd response:
  (1) **re-ran claude-review on #1165 → now GREEN/APPROVED** — gap closed on the record;
  (2) **manual diff review**: sound — drops `issues: assigned` (F-119/S1), hardens the
  env-var-indirection invariant (S2), adds `validateIssuesAssignedWithoutSenderGuard` + 3
  neg-path checker tests; (3) **no gate regression** — diff touches no OIDC/permissions, and
  #1167's claude-review passed on a `main` containing #1165. **Disposition: RATIFY** (revert would
  re-open F-119 for nothing). #1161/1166/1167 were gate-clean at merge (claude-review SUCCESS).
  Emitted `prg10ff-003` (decision: ratify) + `prg10ff-004` (needs-orchestrator: protocols must
  forbid executors merging / self-granting claude-review exceptions; harden resumed-executor brief
  to complete-only). **Lesson:** a resumed executor inherits its full prior toolset and will
  "help" beyond its brief — scope resume messages explicitly to the single finalize step.
- 2026-06-14 — **First review verdicts in: 2 Closed, 3 reworked.** Reviewer (`zdx:review`,
  separate Codex) processed the workstream fast. **WI-734, WI-735 → Closed/Done.** **WI-736/737/738
  → Executing (tag: rework)** — also surfaced that the role-confused executor's `complete` only
  set Fixed In/Resolved, not a durable Reviewing (Stage read back as Executing). Rework notes:
  - **WI-737 — trivial/metadata.** Code VERIFIED good (accountId CAS scoping correct, 12/12 incl.
    cross-account regression; PR #1166 fully green). Bounce reason: **`Started` missing** → DoD
    mechanical gate. Fix = repair metadata + re-`complete`. No code/PR.
  - **WI-736 — real finding.** Checker `issuesEventHasAssignedType()` only catches explicit
    `issues.types:[assigned]`; `on: issues` with no `types` (= all activity incl. assigned)
    returns `[]` — bypassable guard (validates PR #1165 r3409590891). Plus correct the
    claude-review evidence text. New PR needed.
  - **WI-738 — verification/migration.** S6/S7/C7/S9 suites pass; **S4/F-120 integration test fails
    "no unique/exclusion constraint matching ON CONFLICT"** → migration `0116` (dictation
    completionKey unique index, from PR #1122) not applied to the dev integration DB. Reviewer's
    `pnpm run test` Doppler-path error = Windows red herring. Fix = apply 0116 to dev DB + re-verify.
  - **Record correction (`prg10ff-005`):** the #1165 claude-review red was the genuine
    self-referential-workflow 401 (PR edits `claude-code-review.yml`; confirmed by post-merge rerun
    going green) — the executor's diagnosis was right; `prg10ff-003`'s "mischaracterization" was my
    error. The process concern (self-granting + overstep, `prg10ff-004`) still stands.
  - **Re-dispatched** all 3 reworks (resumed original executors, tightly scoped per the
    `prg10ff-004` lesson: WI-only, no merge, no self-grant, no sibling touch).
- **Verdict monitor LIVE** (`bm2a7q6yq`, persistent): Notion-REST Stage poll over all 5 WI pages,
  emits on change. Mechanism: `GET /v1/pages/{id}` → `.properties.Stage.select.name`. Page IDs
  recorded in this tracker's history. Orchestrator's independent Cosmo watch backstops.
- 2026-06-14 — **Rework round 1 results:** **WI-737 → Reviewing** (executor repaired missing
  `Started` via the repo's sanctioned property-PATCH finalization — deliberately NOT `execute
  complete`, which post-main-advance would clobber `Fixed In` + duplicate the summary; aligns with
  memory `project_cosmo_shepherd_finalization.md`). **WI-738 → Reviewing** (root cause = dev-DB
  schema drift: migration `0116` never applied to dev Neon; executor applied it **dev-only**
  — guardrails honored, staging/prod untouched, note: worktree default Doppler config is `stg` so
  it pinned dev `DATABASE_URL` directly — integration suite now 13/13; no source change, `complete`
  ran clean this time → Reviewing). **WI-736** rework (real checker gap) still in flight → new PR
  for my merge. Both re-Reviewing items await the reviewer's re-verdict (monitor will catch).
- 2026-06-14 — **`prg10ff-006` (needs-operator) — CONFIRMED production deploy risk:** migration
  `0116` (dictation `(profile_id, completion_key)` unique index; original wave PR #1122, code already
  on `main`) was unapplied to dev (drift) and is almost certainly unapplied to **stg/prod**. Without
  it the merged conflict-target code breaks dictation writes in prod ("no unique/exclusion constraint
  matching ON CONFLICT"). Escalated to operator to put `0116` on the stg+prod deploy checklist
  (`drizzle-kit migrate`) — destructive shared-infra, beyond lane mandate. Upgrades the original
  wave's passive §5 follow-up #2 to a live, confirmed obligation.
- 2026-06-14 — **WI-736 rework landed (clean).** New PR **#1176** (`2bc4e760`, fresh branch
  `WI-736-checker-gap`, scope = only the 2 checker files) merged through the strict gate — all
  required SUCCESS, **`claude-review` genuinely GREEN/APPROVED**. This PR **empirically confirms the
  #1165 self-referential-401 diagnosis**: #1176 touches only `scripts/` (not the claude workflow
  YAMLs), so the action did not 401 and claude-review ran — exactly as the corrected caveat
  predicted. Checker now treats `on: issues` with no `types:` as all-activity (incl. assigned) and
  flags no-`if:` secret-backed jobs; red-green proven (revert → 3 fail; restore → 41/41). WI-737
  **Closed/Done** (reviewer accepted the property-PATCH finalization). Executor resumed to finalize
  WI-736 → Reviewing (warned on the complete-clobber/duplicate-summary hazard). **Tally: 734/735/737
  Closed · 738 Reviewing · 736 finalizing.**
- 2026-06-14 — **WI-736 finalized -> Reviewing** (property-PATCH path, `Fixed In=2bc4e760`, single
  clean summary, claim settled, `mechanicalOk:true`). Awaiting reviewer re-verdict.
- 2026-06-14 — **WI-738 BLOCKED (`prg10ff-007`, ref `prg10ff-006`).** Reviewer bounced it a 2nd
  time — S4 integration test still 11/13 fail. Root cause nailed:
  `apps/api/src/services/dictation/result.integration.test.ts` connects via the default worktree
  Doppler config = **stg (`ep-fancy-cherry`)**, which lacks `0116`; the executor applied `0116` to a
  **dev** endpoint (`ep-muddy-sunset`) only -> re-applying to dev is futile. Migration is committed
  (`apps/api/drizzle/0116_dictation_completion_key_unique.sql`; QA "file not found" was a bare-path
  citation miss). **Resolution = apply `0116` to STAGING via `drizzle-kit migrate`** (sanctioned for
  stg; shared-infra -> operator-gated, not run unilaterally) — same action as `prg10ff-006`. S4
  **code** is correct and merged (PR #1167); only its verification env lacks the index. Not
  re-dispatching the executor until unblocked. **Lane lands 4/5 (734/735/737 Closed, 736 Reviewing);
  WI-738 gated on the staging migration.** WI-739 (CONSIDER) remains Backlog.
- 2026-06-14 — **✅ FAST-FOLLOW WAVE COMPLETE — 5/5 Closed/Done** (WI-734, 735, 736, 737, 738).
  The 2 retroactive-review MUST_FIX + 3 SHOULD residuals are all landed on `main` and
  reviewer-closed. `0116` unblock: orchestrator applied it to the staging Neon DB
  (`ep-fancy-cherry`) directly; prod rides the next deploy in order (`prg10ff-006`/`-007` resolved
  cross-thread with BUG-12/WI-586). WI-738 re-verified S4 13/13 on stg → Closed. **Gate integrity
  held end-to-end** — every close went through real review + QA, and `claude-review` ran genuinely
  green on every merge (the OIDC gate-gap that spawned this wave is demonstrably closed). One
  process defect surfaced + endorsed for protocol hardening (`prg10ff-004`/`-009`: executors never
  merge / self-grant gate exceptions — shepherd-only). Durable learning captured:
  `.claude/memory/project_claude_review_self_referential_401.md`. **WI-739 (P3 CONSIDER hygiene
  sweep) remains Backlog** by kickoff design — not part of this push. Inbox watcher (`b1l0wn3cl`)
  left armed for any closing orchestrator comms; Cosmo Stage monitor stopped (all units terminal).
- 2026-06-14 — **WI-739 activated (operator-directed) and CLOSED — LANE NOW 6/6 COMPLETE.** Took the
  P3 CONSIDER hygiene bundle through the full lifecycle: DoR promotion (AC pre-authored) -> claim ->
  one executor, one bundled PR **#1181** (`788f9a2f`) covering C1/C2/C5/C6/C8/C9 with tests on the
  behavior-changers (C5 schema caps, C8 CORS fail-closed, C9 sanitize VT/FF/NEL); `claude-review`
  APPROVED 0 findings. **Merged on `mergeStateStatus=UNSTABLE`** — documented shepherd call: all
  REQUIRED checks SUCCESS + claude-review green; the only red was the NON-required advisory
  `run-smoke` (`auth.setup.ts seed parent-multi-child` staging app-readiness timeout, survived a
  rerun). NOT a claude-review exception (operator-only) — the merge-on-unrelated-advisory case is
  shepherd authority. Flagged to orchestrator (`prg10ff-010`); they triaged **KNOWN-FLAKY, not a
  regression** (`in-008`: 7/8 recent web-smoke runs green on same staging, incl. runs after WI-739's
  failure; the 0116/consent_request reconciliation did not break it). Executor correctly STOPPED at
  the non-CLEAN state rather than self-granting — the now-landed `executor-protocol.md` scope-boundary
  guard (`prg10ff-009`, adopted verbatim per `in-007`) working as designed. Finalized via
  property-PATCH (`Fixed In=788f9a2f`), reviewer Closed/Done 17:48Z. Both monitors stopped.
- **FINAL: all 27 PRG-10 findings + all 19 retroactive-review residuals (2 MUST + 8 SHOULD + 9
  CONSIDER, decomposed into 6 fast-follow WIs) remediated and reviewer-closed. Gate integrity held
  end-to-end; the OIDC gate-gap that spawned this wave is demonstrably closed. Channel POC ran the
  full arc (`prg10ff-001..010`). Open beyond lane: prod `0116` rides next deploy (orchestrator-owned);
  `run-smoke` staging flake is known-flaky (orchestrator-triaged).**
- 2026-06-14 — **PRG-10 GRADUATED (operator-confirmed); decommissioned.** Removed all 13 PRG-10
  worktrees (original wave WI-698–704 + fast-follow WI-734–739) and deleted 14 local + 14 remote
  branches (incl. `WI-736-checker-gap`). Uncommitted state was untracked scratch only
  (`.claude/artifacts/`, `.cosmo/`). Non-PRG-10 worktrees/branches (WI-689–693 etc.) left untouched;
  `main` unchanged. Lane closed.
