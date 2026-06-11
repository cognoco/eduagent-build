# Identity Foundation — Execution Tracker

**Stream:** identity-foundation (umbrella roster **PRG-01**) · **Activity:** clean-cut execution (waves W0–W4 + tail)
**Last updated:** 2026-06-11 (WI-578 merged PR #933, 4 rounds, children swept; W3 build side done) · **Owner:** Jorn (+ runway session agents)

> **This is the durable entry point for this activity.** Point a fresh session here:
> it should be enough to know *what this is*, *where the detail lives*, and *where to
> pick up*. It is **not** a second source of truth — see §2.

---

## 1. Charter

**What this activity is.** Execute the clean-cut replacement of eduagent-build's
identity/tenancy/role/consent bedrock per the ratified **Phase-O master plan**
(`2026-06-09-phase-o-master-plan.md`, commit `23d0c01ad`): build the 8-table schema +
policy-engine/router spine direct, satisfy the 49 in-scope audit obligations
by construction on it, re-seed live data, delete the legacy model. Pre-launch:
**no dual-model, no backfill** — build direct, re-seed, drop.

**The wave model (W0 → W4 + tail).** 21 planning units (17 WPs + 4 solo Items),
all live in Cosmo under the **Identity Foundation** Workstream:

- **W0 — stop-the-bleeding + baseline** (4 units): three patch-now security
  bundles + the migration-baseline reset (`MMT-ADR-0012`).
- **W1 — structural foundation** (4): schema → spine + authority-graph → inngest-wiring.
  W1 is the critical-path ROOT — nothing in W2–W4 satisfies-by-construction until
  the schema + spine exist.
- **W2 — identity / consent / proxy / age** (3): scope-rls → {proxy-authority,
  consent-deletion}. Heaviest single wave.
- **W3 — PII-handling + envelope/router** (6): four PII-egress units + envelope-router
  + entitlement-isolation. Envelope-router gates on the W2 consent model → carries
  the critical path.
- **W4 — billing + remaining** (2): parallel track, orthogonal store-delegation surface.
- **tail — clean-cut closure** (2): reseed → drop-legacy, strictly serial, after
  W2 ∧ W3 ∧ W4.

**Critical path:** schema → spine → scope-rls → consent-deletion → envelope-router
→ reseed → drop-legacy (O §3/§4).

**The two gates (do not conflate):**

1. **The W0 hard gate (inside the stream).** All four W0 units — the 11 patch-now
   defects (WI-549/550/551) + the baseline reset (WI-569) — must clear **before W1
   begins**. WI-570 (schema) carries this as its 4-entry Blocked-by set.
2. **The Cosmo-enablement gate (cross-stream).** Execution start of the **rewrite
   proper** (baseline reset → W1 → … → tail) is gated on **WI-530** — the
   Harness-Hygiene exit-gate WP (eduagent's dev-execution harness rewired to
   replacement-parity 80/20), mirrored by boundary node **WI-533**. The three W0
   **patch** WIs (549/550/551) are explicitly **DECOUPLED** from this gate (O §7
   decision 4): live P0–P2 security exposure ships immediately through the current
   harness — never deferred to a tooling-readiness milestone.

**The bar ("done").** All **49 in-scope obligations** satisfied (each exactly once
as new work, per O Appendix A), the W0 patches' break-tests still passing against
the rebuilt model (regression ACs), and the **clean-cut closed** — legacy identity
tables/readers dropped, full project grep clean, tests green post-drop.

---

## 2. How to use this doc

- **Cosmo is authoritative for live per-WI state** (Stage / State / claims /
  dependencies). This file carries the **charter, pointers, execution sequence,
  and a coarse status** only — refresh it at checkpoints; do not treat its status
  columns as the system of record.
- **Claim before you execute.** The lock is the live Cosmo Claim props
  (`Claimed By`, `Claim Expires`, …), not this file. Mechanics are canonical in
  the **`work-lifecycle`** skill; the repo's AGENTS.md Cosmo operating rules
  apply (claim → execute → complete → Reviewing; never self-close; close only
  via `/cosmo:review` + `/cosmo:qa`).
- **Status vocabulary (coarse):** `ready-decoupled` (W0 patches — executable now,
  ungated) · `ready-gated` (DoR met, awaiting WI-530) · `backlog-gated` ·
  `in-progress` · `review` · `done`.
- **Known cosmetic bug:** the Workflow Status formula shows "⚠ Ready: Needs Path"
  for Ready+Assisted items (filed as WI-552). Ignore it; trust the **Validity**
  formula.

### Operator rulings (standing for this initiative)

- **2026-06-10 — Merge authority granted to the shepherd (Jorn), conditional.**
  The shepherd may merge an IF work-item PR once the WI has reached
  `Stage=Reviewing` via `/cosmo:execute complete`, **provided the shepherd
  independently re-verifies the PR is really green at merge time** — not from
  the executor's report: run `gh pr checks` (all checks pass, none pending),
  confirm no unresolved blocker/must-fix/should-fix review findings, and sanity-
  check `gh pr diff` shape against the WI scope. Merge ≠ close: `/cosmo:review`
  remains the operator's gate.

- **2026-06-10 — WP DoR bridging is pre-approved, blanket (Jorn).** Top-down-sliced
  WPs fail the bottom-up WP DoR mechanically (see WI-593). For every remaining IF
  WP (WI-571…586), the shepherd applies the bridge **without asking per WP**:
  (1) transcribe the frozen master-plan WP block into the page body as the bundle
  brief; (2) capture **2 thin provenance children** (stubs marked "absorbed
  provenance — lifecycle rides the parent, never claim/execute standalone", findings
  mapped across them; full finding detail stays in the brief's findings table);
  (3) set the `Sub-item` relation; (4) `refine --to-ready`. A zero-children full
  bypass was considered and rejected: `review.ts` `dod.wp.bulk_ready` mechanically
  requires ≥1 child at the operator's close gate, so bypassing refine would just
  move the friction to every `/cosmo:review`. Standing until WI-593 lands a
  substrate fix (DoR amendment or slicer tooling).

---

## 3. Pointers / index

| What | Where |
| --- | --- |
| **Master plan** (THE source — units, deps §4, waves §5, decisions §7) | `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` @ `23d0c01ad` |
| **Executor protocol** (standard process scaffold every executor brief points at) | `_wip/identity-foundation/executor-protocol.md` |
| **Review-loop PoC observations** (shepherd↔reviewer loop meta-log → productionization) | `_wip/identity-foundation/review-loop-observations.md` |
| **Review-loop mechanics inventory** (all moving parts + ephemerality map, for the productionization agent) | `_wip/identity-foundation/review-loop-mechanics.md` |
| **Executor dispatch example** (verbatim WI-578 pointer-brief incl. amendments block) | `_wip/identity-foundation/executor-protocol-example.md` |
| **N.1 sequencing skeleton** (five-wave model O decomposes) | `_wip/identity-foundation/2026-06-09-phase-n-sequencing.md` |
| **Per-finding satellite** (one row per finding, 183) | `docs/audit/2026-05-29-full-audit/L-gap-delta.md` |
| **Runway ROADMAP** (phases A–P, historical record) | `_wip/identity-foundation/ROADMAP.md` |
| **Umbrella roster row** | `_wip/umbrella-program/program-roster.md` → PRG-01 |
| **Cosmo Work Items DB** (live state) | https://www.notion.so/f170be9e04ae45d4961828f2438666bd · data_source `36fd1119-9955-4684-8bfe-deb145e6a21f` |
| **Cosmo Workstream** ("Identity Foundation", all 21 units attached, `Workstream Order` = wave order) | https://www.notion.so/37b8bce91f7c81c2bb42cf7f47f839cc |
| **The W0 patch WIs** (decoupled; see §4) | WI-549 · WI-550 · WI-551 |
| **Cross-stream gate** | WI-530 (Harness-Hygiene exit-gate) → WI-533 (boundary node) → W1+ execution start |

---

## 4. Execution sequence + status

Legend — dep = Blocked-by (Cosmo native edges exist for every row). WI numbers
are the live Cosmo entries (project MentoMate). Coarse status per §2 vocabulary.

### W0 — pre-execution gate (patches decoupled; baseline gated)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-549 | WP-W0-patch-api | close 7 live api security defects (F-117/118/122/130/133/144/145) | WP | P0 | — | **done** — Closed/Done, PR #817 (merged 2026-06-10) |
| WI-550 | WP-W0-patch-inngest | close 3 live inngest security defects (F-019/020/092) | WP | P1 | — | **done** — Closed/Done, PR #818 (merged 2026-06-10) |
| WI-551 | IT-W0-patch-billing | trial-expiry standalone patch (F-121) | Item | P0 | — | **done** — Closed/Done, fixed in `c5c9b39bb` (2026-06-10) |
| WI-569 | WP-W0-baseline | migration-chain baseline reset (`MMT-ADR-0012`) | WP | P1 | — (W0-labeled but travels with the gated rewrite) | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #845, `a16642538`). **G2 tripped** — first WP through the full lifecycle |

### W1 — structural foundation (critical-path ROOT)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-570 | WP-W1-schema | 8-table identity/tenancy/consent schema + scoped-repo (F-032) | WP | P1 | WI-569 + WI-549 + WI-550 + WI-551 (**the W0 hard gate**) | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #855); children WI-591/592 bulk-closed with parent |
| WI-571 | WP-W1-spine | session-exchange carve + engine/router/judge scaffold (F-003) | WP | P1 | WI-570 | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #860); children WI-594/595 bulk-closed by shepherd 2026-06-11 (the review missed them — mirrored the WI-570 pattern) |
| WI-572 | WP-W1-authority-graph | break the 4-node SCC + consent cycle, structural (F-004, F-029-struct) | WP | P1 | WI-570 | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #859); children WI-596/597 closed with parent. No SCC-reintroduction guard test (consider during W2) |
| WI-573 | IT-W1-inngest-wiring | registration wired-and-triggered (F-005) | Item | P1 | WI-571 | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #867). **W1 fully Closed** |

### W2 — identity / consent / proxy / age (critical path)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-574 | WP-W2-scope-rls | ownership, two-layer RLS, JWT age/consent transport (6 findings) | WP | P1 | WI-570, WI-571 | **done** — Closed/Done 2026-06-11 via `/cosmo:review` (PR #875); children WI-598/599 swept with parent |
| WI-575 | WP-W2-proxy-authority | central proxy authority guards (F-126, F-023; regression-ACs F-117/144) | WP | P2 | WI-572, WI-574 | **done** — Closed/Done 2026-06-11 (PR #882). First pass bounced on the children gate (WI-600/601 at Captured); shepherd swept + resubmitted; re-review closed it |
| WI-576 | WP-W2-consent-deletion | consent authority + account-isolated deletion + fail-closed age-gate (F-093, F-029-semantic; regression-ACs F-118/122/130/145) | WP | P1 | WI-572, WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #888, one gate-driven fix round). Children pre-swept at merge time → no children bounce: standing sweep step VALIDATED. W2 complete |

### W3 — PII-handling + envelope/router (critical path)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-577 | WP-W3-pii-event-payloads | minor-PII out of event payloads (F-073/083/084/095) | WP | P1 | WI-571, WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #911, 2 gate rounds). WI-620 captured (calibration leak) |
| WI-578 | WP-W3-pii-step-state | minor-PII out of memoized step returns (F-075/085/086/087/088/089) | WP | P2 | WI-571, WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #933, 4 gate rounds). W3 COMPLETE — all of W0–W4 closed. WI-637/638 captured |
| WI-579 | WP-W3-pii-error-logging | minor-PII out of logs + Sentry (F-018/074/140) | WP | P2 | WI-571, WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #902). Zero bounces — children pre-swept at merge |
| WI-580 | IT-W3-pii-llm-provider | child name out of LLM-provider prompts (F-076) | Item | P3 | WI-571, WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #900, 3 gate rounds). Eval-hook gate-gap = WI-619 (hit 3×) |
| WI-581 | WP-W3-envelope-router | envelope/router integrity fail-closed (F-025/131/136/137/141; regression-ACs F-133, F-019/020/092) | WP | P1 | WI-571, WI-574, **WI-576** | **done** — Closed/Done 2026-06-11 on re-review (PR #915, 3 gate rounds + 1 evidence-form bounce fixed shepherd-side). Critical-path W3 unit complete |
| WI-582 | WP-W3-entitlement-isolation | entitlement/credit isolation (F-134, F-135) | WP | P2 | WI-574 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #903). Zero bounces — third consecutive clean close |

### W4 — billing + remaining (parallel track)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-583 | WP-W4-billing-credits | credit/quota correctness (F-124, F-096) | WP | P1 | WI-570 (+ soft-after WI-551 via Related Items) | **done** — Closed/Done 2026-06-11 on the 5th review pass (PRs #876 + #897). 4 bounces, 4 distinct classes (children gate, unmerged PR, residual defect, evidence form); ended with FOR UPDATE serialization both paths + full red-green-revert proof. W4 complete. WI-618 captured from the sweep |
| WI-584 | IT-W4-l10n-accommodation | accommodation view-self fallback (F-163) | Item | P3 | WI-572 | **done** — Closed/Done 2026-06-11 by the autonomous reviewer (PR #874). First WI through the full loop with zero human touches |

### Clean-cut tail (after W2 ∧ W3 ∧ W4)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-585 | WP-TAIL-reseed | re-seed live data into the new model | WP | P1 | ALL of WI-575…WI-584 (10 edges) | **done** — Closed/Done 2026-06-11 by the autonomous reviewer, first pass (PR #963). Dev + staging seeded and verified green; prd deferred. Detours: WI-649, CF-secrets fix, BUG-12 P1 capture |
| WI-586 | WP-TAIL-drop-legacy | drop legacy tables/readers (irreversible) | WP | P1 | WI-585 | **in-progress (plan phase)** — executor dispatched 2026-06-11 (`wi586-executor`) on WI-585's close, with a MANDATORY plan-phase stop before implementation: cutover-scope mapping (no runtime code reads the new tables yet), orphan-column re-homing (conversation_language actively read), ownerless disposal, pre-drop reseed runbook, prod chain via blocked pipeline. Bridged earlier (Assisted; children WI-631/632) |

---

## 5. Current position — pick up here

- **WI-569 DONE (executor side), 2026-06-10 ~21:35 UTC:** Stage=Reviewing, Fixed In
  `a16642538`, PR #845 merged after independent shepherd green-verification (9/9
  checks; all review threads fixed-or-deferred-with-rationale; the unreplied Codex
  P1 on the `now()` partial index verified fixed in the landed SQL — predicate is
  `WHERE revoked_at IS NULL`). Dev + staging hold the 17 baseline tables, verified;
  full evidence in the WI-569 completion summary. **Awaiting `/cosmo:review WI-569`
  (operator) — that close is program gate G2.**
- **WI-570 DONE (executor side), merged 2026-06-10 23:01 UTC** — PR #855: 17-table
  TS schema (parity-verified: `db:push:dev` dry-check zero changes), scoped-repo
  break tests, canon-mandated AgeBracket 3-way + 13-floor (data-model §2A.5).
  Known limitation dispositioned: `person.loginId` FK undeclared in TS (Drizzle
  circular-type issue), constraint live from 0108 SQL, JSDoc'd. Awaiting
  `/cosmo:review`.
- **G3 TRIPPED 2026-06-11 — W1 LANDED AND FULLY CLOSED.** All four W1 units
  merged and Closed via review: WI-570 (#855), WI-571 (#860), WI-572 (#859),
  WI-573 (#867). G2 tripped earlier same day (WI-569 Closed). No review
  backlog remains.
- **WI-578 MERGED 2026-06-11 — PR #933 CLOSED/DONE.** 4 review rounds converged (step-return
  scrub middleware + scrubber consolidation). Children WI-606/607 swept with full evidence shape;
  complete firing sent. W3 build side done — all 6 W3 WIs Closed/Done.
- **W3 DISPATCHED 2026-06-11 (6 of 6 — WI-578 now in flight):** WI-577 ∥ WI-579 ∥
  WI-580 ∥ WI-582 ∥ WI-581 ∥ WI-578. Also in flight: WI-576 fix round (GC6 on PR #888); WI-583 at
  Reviewing (PR #876 admin-merged per operator ruling, children swept).
  W2 closed: WI-574, WI-575. W4: WI-584 closed; WI-583 in re-review.
  Executor briefs now carry the seam amendments (no cross-turn waiters,
  turn doesn't end at push, GC6 pre-PR sweep, read the review COMMENT).
- **Reviewing-loop monitor ACTIVE (this session):** a persistent poll (90s) on
  the workstream emits every Stage transition — a reviewer agent picks up
  Reviewing items autonomously; the shepherd reacts to Closed (sweep-check
  children, update tracker, dispatch unblocked work) and to rework bounces
  (re-engage the executor). If this session dies, restart the monitor.
- **STANDING SHEPHERD STEP (adopted 2026-06-11): sweep WP children at merge
  time.** The reviewer's DoD requires WP provenance children Closed/Done with
  the parent's Fixed In BEFORE parent review; `complete` doesn't do it, so an
  unswept WP bounces by construction (proven on WI-575 and WI-583).
  Immediately after merging a WP's PR: PATCH its provenance children to
  Stage=Closed, Resolution=Done, Fixed In = landed head commit URL, AND
  Completed + Resolved dates = now (WI-581 bounce: null dates flagged), AND
  ensure the PR body explicitly lists the child WI ids as resolved (the
  reviewer wants child ids, not just finding ids, in the PR evidence). Applies
  to WI-576 (children WI-602/603), WI-577 (604/605), WI-578 (606/607),
  WI-579 (608/609), WI-581 (610/611), WI-582 (612/613), and the tail WPs.
  The reviewer keeps its own meta-log: `review-loop-reviewer-observations.md`.
- **W3 + W4 fully pre-bridged 2026-06-11** — WI-577…584 all Ready+Assisted
  (children WI-604…615). **W4 dispatched immediately** (deps Closed):
  wi583-executor + wi584-executor running parallel to WI-574 — three concurrent
  executors. Remaining unbridged: only the tail (WI-585/586), deliberately left
  until W3 nears completion.
- **W2 fully pre-bridged 2026-06-11** — WI-574/575/576 Ready+Assisted (children
  WI-598…603). Dispatch order when W1 lands: WI-574 first (deps 570 ✓ + 571),
  then WI-575 ∥ WI-576 (deps 572 + 574). Next shepherd idle-time task: W3
  pre-bridging (WI-577…582).

- **W0 is fully done on the patch side:** WI-549/550 Closed/Done (PRs #817/#818,
  merged 2026-06-10) and WI-551 Closed/Done (`c5c9b39bb`, resolved 2026-06-10).
- **WI-530 gate: substantively MOOT as of 2026-06-11.** PR #832 (the Harness-
  Hygiene pipeline-tail rewire, WI-530's program) merged to main; shepherd
  verified the branch-protection required checks (`main`, `Playwright web
  smoke`, `API Quality Gate`) still match the rewired workflows. The original
  operator waiver (2026-06-10) carried execution until then. WI-530's own close
  belongs to its workstream, not this one.
- **In execution: WI-569 (baseline reset)** — PR #845 GREEN (9/9 checks, commit
  `3fd5b85c8`); chain shape shepherd-verified against MMT-ADR-0012 + master plan
  (0106 AND 0107 out of the journal, 0108 single baseline; legacy tables retained
  for the tail by design). Pre-reset HARD STOP passed 2026-06-10: shepherd issued
  **conditional go** — read-only journal/T1-table verification on dev + staging
  first, decision matrix (clean → proceed; stale empty plural T1 tables → drop
  only `"organizations"`/`"memberships"`; anything else → stop), post-reset
  evidence (staging migrate clean re-run), then `/cosmo:execute complete`.
  PR #845 stays UNMERGED — merge is an operator/shepherd seam at review.
  **Step-0 verification fired matrix (c) and stopped (correctly):** T1 tables
  populated on BOTH DBs (dev 1339/1332 rows = 0106-backfill mirror of accounts;
  staging 49/28 = spillover-test artifacts), 0106 WAS applied to staging
  (journal id=107 — the "never applied" premise was wrong), plus an orphaned
  early-0107 `sturdy_monster_badoon` journal row + `nudge_direction` enum from
  a since-deleted migration. Shepherd ruled GO 2026-06-10 late: dev
  `db:push:dev --force`; staging `DROP TABLE IF EXISTS organizations,
  memberships CASCADE` → migrate; hygiene drops of the four orphan artifacts
  (`profiles.clerk_user_id`, `subscriptions.organization_id`,
  `nudges.direction`, `nudge_direction` type) approved with IF EXISTS guards;
  erratum recorded in migrations README + completion summary (NOT in the ADR).
- **Refined and queued: ALL of W1** — WI-570, WI-571, WI-572, WI-573 are
  Ready + Assisted as of 2026-06-10 (570/571/572 bridged per the §2 ruling;
  children WI-591/592, WI-594/595, WI-596/597). Execution order on dependency
  edges: WI-570 claims when WI-569 lands → then WI-571 ∥ WI-572 in parallel →
  WI-573 after WI-571.
- **Known refine friction (affects every remaining WP, WI-571…586):** top-down-
  sliced WPs mechanically fail the WP DoR (`wp.children` + `wp.brief` — blank
  bodies, no Sub-items; `/cosmo:bundle` absent from cosmo plugin 0.6.0). Filed as
  **WI-593** (Hygiene, project Nexus). Interim bridge used on WI-570: transcribe
  the frozen master-plan WP block into the body, capture the provenance children
  (WI-591 schema-build, WI-592 F-032 scoped-repo), hand-set `Sub-item`, then
  refine `--to-ready`. **Blanket-approved by operator 2026-06-10** — see §2
  Operator rulings; apply per WP without asking.
- **Shepherd protocol:** executor agents work in `.worktrees/WI-NN` (worktree-setup
  skill), one PR per WP, claim via `execute.ts fetch --supervised` + `claim
  --claimant`, complete → Stage=Reviewing + release claim; close only via
  `/cosmo:review` (operator).
- **First dogfood:** this workstream is the first whole workstream through the
  top-down proto-epic → waves → Cosmo-WI pipeline (O §6, B+/C− posture). Expect
  process friction; capture substrate bugs as Hygiene WIs against project Nexus
  (precedent: WI-552).

---

## 6. Change log

- **2026-06-11 — WI-578 merged; W3 build side done.** PR #933 closed after 4 review rounds
  (step-return scrub middleware + scrubber consolidation converged). Children WI-606/607 swept
  with full evidence shape; complete firing sent. All 6 W3 units now Closed/Done.
- **2026-06-11 — WI-578 dispatched; PR #933 open.** WI-577 merged (unblocking
  WI-578's hold on shared Inngest surface). Executor launched; PR #933 carries 6
  review findings (step-return scrub middleware, scrubber consolidation). WI-637/638
  captured. W3 now fully dispatched (6/6).
- **2026-06-10 (late) — whole of W1 refined to Ready.** WI-571/572 bridged
  under the §2 standing ruling (briefs in body; children WI-594/595, WI-596/597);
  WI-573 (Item, no bridge) refined with framing checklist confirmed. All four W1
  units now Ready+Assisted, claimable in dependency order behind WI-569/570.
- **2026-06-10 (evening) — WI-569 dispatched; WI-570 refined to Ready.**
  Executor protocol landed (`executor-protocol.md`, from the operator's
  wi-execute template: work-type-parameterized planning, review loop capped at
  3, green-PR DoD → `/cosmo:execute complete` seam, announce-before-destructive-
  step). WI-569 executor sub-agent launched against it. WI-570 refine bump hit
  the top-down-WP DoR friction (first-dogfood prediction confirmed) — bridged
  via body brief + provenance children WI-591/592 + hand-set Sub-item relation;
  WI-570 now Ready+Assisted. Substrate gap filed as WI-593 (Hygiene, Nexus).
- **2026-06-10 (later) — W1 execution start; shepherd session opened.** Synced
  tracker to Cosmo: WI-551 found Closed/Done (`c5c9b39bb`) — entire W0 patch trio
  now done. Recorded the operator's waiver of the WI-530 wait (gate still open in
  Cosmo; execution proceeds shepherded). Current position rewritten: WI-569 next
  (Ready+Assisted, unclaimed), WI-570 to be refine-bumped in parallel.
- **2026-06-10 — Phase-P slicing executed; tracker created.** The 18 remaining
  O units instantiated in Cosmo via headless `/cosmo:capture` (18 created, 0
  failed: WI-569…WI-586), joining the pre-existing W0 patch WIs 549/550/551.
  Altitude set (15 WP / 3 Item; WI-549 corrected Item→WP to match O), stages set
  (WI-569 Ready+Assisted; the rest Backlog/Unset), full O §4 dependency edge set
  written as native Blocked-by relations (W0 hard gate on WI-570; envelope-router's
  3-dep set incl. consent-deletion; reseed's 10-edge fan-in; soft edge WI-551→
  WI-583 as Related Items). Workstream **Identity Foundation** created
  (`37b8bce9-1f7c-81c2-bb42-cf7f47f839cc`, Project=MentoMate), all 21 units
  attached with `Workstream Order` 10–210 in wave order. Verified: 21/21 in the
  workstream, Validity ✓ Valid on all, WI-570 Blocked-by = 4, WI-585 Blocked-by
  = 10. Note: found WI-549/550 already Closed/Done (W0 decoupling worked as
  designed — patches shipped before slicing). Unit `WP-W3-pii-sentry` exists
  nowhere: O renamed it `WP-W3-pii-error-logging` (QA finding Q5) — WI-579.
