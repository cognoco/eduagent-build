# Identity Foundation — Execution Tracker

**Stream:** identity-foundation (umbrella roster **PRG-01**) · **Activity:** clean-cut execution (waves W0–W4 + tail)
**Last updated:** 2026-06-10 (W1 execution start — shepherd session) · **Owner:** Jorn (+ runway session agents)

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

---

## 3. Pointers / index

| What | Where |
| --- | --- |
| **Master plan** (THE source — units, deps §4, waves §5, decisions §7) | `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` @ `23d0c01ad` |
| **Executor protocol** (standard process scaffold every executor brief points at) | `_wip/identity-foundation/executor-protocol.md` |
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
| WI-569 | WP-W0-baseline | migration-chain baseline reset (`MMT-ADR-0012`) | WP | P1 | — (W0-labeled but travels with the gated rewrite) | **ready** — DoR met (Ready + Assisted); WI-530 wait **waived by operator 2026-06-10**, proceed shepherded |

### W1 — structural foundation (critical-path ROOT)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-570 | WP-W1-schema | 8-table identity/tenancy/consent schema + scoped-repo (F-032) | WP | P1 | WI-569 + WI-549 + WI-550 + WI-551 (**the W0 hard gate**) | backlog-gated |
| WI-571 | WP-W1-spine | session-exchange carve + engine/router/judge scaffold (F-003) | WP | P1 | WI-570 | backlog-gated |
| WI-572 | WP-W1-authority-graph | break the 4-node SCC + consent cycle, structural (F-004, F-029-struct) | WP | P1 | WI-570 | backlog-gated |
| WI-573 | IT-W1-inngest-wiring | registration wired-and-triggered (F-005) | Item | P1 | WI-571 | backlog-gated |

### W2 — identity / consent / proxy / age (critical path)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-574 | WP-W2-scope-rls | ownership, two-layer RLS, JWT age/consent transport (6 findings) | WP | P1 | WI-570, WI-571 | backlog-gated |
| WI-575 | WP-W2-proxy-authority | central proxy authority guards (F-126, F-023; regression-ACs F-117/144) | WP | P2 | WI-572, WI-574 | backlog-gated |
| WI-576 | WP-W2-consent-deletion | consent authority + account-isolated deletion + fail-closed age-gate (F-093, F-029-semantic; regression-ACs F-118/122/130/145) | WP | P1 | WI-572, WI-574 | backlog-gated |

### W3 — PII-handling + envelope/router (critical path)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-577 | WP-W3-pii-event-payloads | minor-PII out of event payloads (F-073/083/084/095) | WP | P1 | WI-571, WI-574 | backlog-gated |
| WI-578 | WP-W3-pii-step-state | minor-PII out of memoized step returns (F-075/085/086/087/088/089) | WP | P2 | WI-571, WI-574 | backlog-gated |
| WI-579 | WP-W3-pii-error-logging | minor-PII out of logs + Sentry (F-018/074/140) | WP | P2 | WI-571, WI-574 | backlog-gated |
| WI-580 | IT-W3-pii-llm-provider | child name out of LLM-provider prompts (F-076) | Item | P3 | WI-571, WI-574 | backlog-gated |
| WI-581 | WP-W3-envelope-router | envelope/router integrity fail-closed (F-025/131/136/137/141; regression-ACs F-133, F-019/020/092) | WP | P1 | WI-571, WI-574, **WI-576** | backlog-gated |
| WI-582 | WP-W3-entitlement-isolation | entitlement/credit isolation (F-134, F-135) | WP | P2 | WI-574 | backlog-gated |

### W4 — billing + remaining (parallel track)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-583 | WP-W4-billing-credits | credit/quota correctness (F-124, F-096) | WP | P1 | WI-570 (+ soft-after WI-551 via Related Items) | backlog-gated |
| WI-584 | IT-W4-l10n-accommodation | accommodation view-self fallback (F-163) | Item | P3 | WI-572 | backlog-gated |

### Clean-cut tail (after W2 ∧ W3 ∧ W4)

| WI | O unit | What | Alt | Pri | dep | status |
| --- | --- | --- | --- | --- | --- | --- |
| WI-585 | WP-TAIL-reseed | re-seed live data into the new model | WP | P1 | ALL of WI-575…WI-584 (10 edges) | backlog-gated |
| WI-586 | WP-TAIL-drop-legacy | drop legacy tables/readers (irreversible) | WP | P1 | WI-585 | backlog-gated |

---

## 5. Current position — pick up here

- **W0 is fully done on the patch side:** WI-549/550 Closed/Done (PRs #817/#818,
  merged 2026-06-10) and WI-551 Closed/Done (`c5c9b39bb`, resolved 2026-06-10).
- **WI-530 gate: operator-waived 2026-06-10.** WI-530 itself is still open in
  Cosmo (Backlog, 15 open blockers), but the operator has waived waiting for the
  rewrite's execution start — W1 proceeds **shepherded** (a shepherd session runs
  pick/refine/brief/track; executors in isolated worktrees).
- **Next up: WI-569 (baseline reset)** — Stage=Ready, Execution Path=Assisted,
  unclaimed, no open Blocked-by. It is the last W0 hard-gate entry for WI-570.
  Risky: resets shared dev + staging DBs (safe pre-launch, but coordinate).
- **Then WI-570 (schema)** — Backlog/Unset today; needs the refine bump to
  Ready + Execution Path before claim. Refine can run while WI-569 executes.
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
