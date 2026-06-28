# Quartet Cutover Plan — referrer-repoint + old-copy retirement

> **What this is.** The hand-back from the Quartet extraction. `_quartet/` is built and on
> `origin/main`; this plan tells the **orchestrator** (a separate operational session) exactly which
> live referrers to repoint and which old copies to retire so the cutover is atomic and breaks no
> running session. **The designer does NOT execute the cutover** — this is the target map.
>
> **Method.** Cutover is a single deliberate change-set: repoint every Class-A referrer to its
> `_quartet/` home, inform the live shepherds, then retire the Class-B copies. Do not retire a copy
> before its referrers are repointed (a missed referrer breaks a live session — completeness is the
> one critical property here).
>
> **Sweep date.** 2026-06-28. Re-run the sweep command (bottom) immediately before executing — live
> lanes churn, and a new lane could add a referrer after this date.

---

## Cutover principle — three classes, three fates

The extraction split the old flat folders into **Brain** (role protocols), **Library** (artifact
definitions), and **Working** (live instances). The cutover honours that split:

- **System / Brain / template files** → `_quartet/` is the new canonical home. **Retire** the old
  copy after referrers repoint (Class B).
- **Working state** (live roster, dashboard, `_state/` channels, per-lane `execution-tracker.md`)
  → **stays live and operating** in `_wip/` (or wherever the program runs). It is an *instance*, not
  system. Only its embedded **protocol path-pointers** repoint (Class C). Do **not** retire it.
- **Live referrers** that hard-code a frozen path → **repoint** (Class A).

---

## Class A — REPOINT (breaks a running session at cutover)

### A1. Rehydration hook — HIGHEST RISK (fires on session-start)
Only one exists: **`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`**. It hard-codes:

| line | current target | repoint to |
|---|---|---|
| 29 | `_wip/umbrella-program/orchestrator-compaction-handoff-*.md` | *(working state — leave; it globs the live handoff)* |
| 42 | `_wip/umbrella-program/orchestrator-protocol.md` | `_quartet/roles/orchestrator-protocol.md` |
| 43 | `_wip/umbrella-program/program-roster.md` | *(working state — keep live path, see Class C)* |
| 44 | `_wip/umbrella-program/planning-reference.md` | `_quartet/planning-rules.md` |

**Also (E6 wording fix):** the hook's "watchers die on compaction → re-arm" framing must change to
**"reconcile against the monitor manifest"** (`_quartet/clacks/monitor-hygiene.md`) — blind re-arming
is the proliferation bug. (`roles.json` siblings the hook — check it for the same path strings.)

### A2. Live-lane kickoffs (instantiated, operator-launched sessions read these)
| file | lines | repoint |
|---|---|---|
| `_wip/flow-remediation/shepherd-kickoff.md` | 5, 8, 10 | shepherd-protocol → `_quartet/roles/shepherd-protocol.md`; executor-protocol(+example) → `_quartet/roles/executor/executor-protocol.md` + `_quartet/examples/executor-dispatch-example.md`; subagent-brief-standard → `_quartet/roles/executor/` (rails in `executor-protocol.md`; profiles → the 4 type docs) |
| `_wip/identity-cutover/shepherd-kickoff.md` | 3, 24, 26 | same mapping; template ref (line 3) → `_quartet/roles/kickoffs/shepherd-kickoff-template.md` |
| `_wip/identity-cutover/reviewer-kickoff.md` | — | reviewer-protocol → `_quartet/roles/reviewer-protocol.md`; template → `_quartet/roles/kickoffs/reviewer-kickoff-template.md` |
| `_wip/new-llm-integration/round-2-shepherd-kickoff.md` | 7, 18, 20 | same shepherd/executor/template mapping |
| `_wip/identity-cutover/phase-ab-adversarial-review-kickoff.md` | (verify) | re-grep; repoint any protocol pointers |

### A3. Live-lane `execution-tracker.md` entry points (shepherds re-read on arrival)
Active lanes pointing at frozen protocols — repoint the protocol/scaffold pointers (NOT the roster
pointer, see Class C): `agent-instructions` (51,52), `architecture` (110,114), `bug-lane` (9,10),
`errors-api` (95), `identity-cutover` (80,81,84), `l10n-a11y` (167,219), `security-pii-api`
(78,82,208), `security-pii-inngest`, `flow-remediation`. Each maps:
`_wip/identity-foundation/shepherd-protocol.md` → `_quartet/roles/shepherd-protocol.md`;
`executor-protocol.md`(+`-example`) → `_quartet/roles/executor/executor-protocol.md` +
`_quartet/examples/executor-dispatch-example.md`; `subagent-brief-standard.md` → the 4 type docs;
`progress-channel-design.md` → `_quartet/clacks/progress-channel-design.md`;
`review-watcher-v3.ts` → `_quartet/clacks/review-watcher.ts` (de-instanced — set
`COSMO_WATCH_REPO`/`_DB`/`_CONFIG` env).

### A4. Protocol internal cross-refs — already clean in `_quartet/`
The `_quartet/` copies cite each other by **`_quartet/`-relative paths** (verified). No action inside
`_quartet/`. The frozen copies' internal cross-refs (e.g. `identity-foundation/shepherd-protocol.md:150`
→ `progress-channel-design.md`) retire **with** their files (Class B) — no repoint needed.

### A5. AGENTS.md / CLAUDE.md — VERIFIED CLEAN (no action)
The repo-root + nested `AGENTS.md`/`CLAUDE.md` and `docs/` were swept and contain **no** path-pointer
to the frozen Quartet files. The brief listed this as a referrer class to check; it is empty here.
Recorded so the orchestrator does not hunt a ghost. (Re-confirm on the pre-cutover re-sweep.)

---

## Class B — RETIRE (superseded by `_quartet/`; delete after Class-A repoints land)

| old copy (retire) | superseded by |
|---|---|
| `_wip/umbrella-program/orchestrator-protocol.md` | `_quartet/roles/orchestrator-protocol.md` |
| `_wip/umbrella-program/orchestrator-kickoff.md` | `_quartet/roles/kickoffs/orchestrator-kickoff.md` |
| `_wip/umbrella-program/planning-reference.md` | `_quartet/planning-rules.md` |
| `_wip/identity-foundation/shepherd-protocol.md` | `_quartet/roles/shepherd-protocol.md` |
| `_wip/identity-foundation/reviewer-protocol.md` | `_quartet/roles/reviewer-protocol.md` |
| `_wip/identity-foundation/executor-protocol.md` | `_quartet/roles/executor/executor-protocol.md` (rails) + builder/researcher/auditor/general type docs |
| `_wip/identity-foundation/executor-protocol-example.md` | `_quartet/examples/executor-dispatch-example.md` |
| `_wip/identity-foundation/subagent-brief-standard.md` | rails → `executor-protocol.md`; 5 profiles → 4 type docs (analyst folded into researcher; housekeeper into general) |
| `_wip/identity-foundation/shepherd-kickoff-template.md` | `_quartet/roles/kickoffs/shepherd-kickoff-template.md` |
| `_wip/identity-foundation/reviewer-kickoff-template.md` | `_quartet/roles/kickoffs/reviewer-kickoff-template.md` |
| `_wip/identity-foundation/progress-channel-design.md` | `_quartet/clacks/progress-channel-design.md` |
| `_wip/identity-foundation/review-watcher-v3.ts` | `_quartet/clacks/review-watcher.ts` (de-instanced) |

**Do NOT retire** the review-loop *observation/mechanics* logs (`review-loop-mechanics.md`,
`review-loop-*observations.md`, `review-loop-productization-handoff.md`) — they are PoC provenance,
not system; leave for the identity-foundation lane to dispose. Likewise all dated handoffs /
walkthroughs / archives under `_wip/identity-foundation/` are historical and retire with their lane,
not here.

---

## Class C — Working state that STAYS (repoint pointers only, never retire)

- `_wip/umbrella-program/program-roster.md` — live roster (Working). Shape: `_quartet/library/program-roster.md`; snapshot mirror exists at `_quartet/working/program/program-roster.md`. Keep operating; its *physical home* is a deployment decision (see `_quartet/working/README.md`).
- `_wip/umbrella-program/dashboard.html` — live dashboard. Shape: `_quartet/library/dashboard.md`; snapshot at `_quartet/working/program/dashboard.html`.
- All `_wip/<lane>/_state/{inbox,outbox}.jsonl` — live Clacks channels. Untouched.
- Per-lane `execution-tracker.md` — live lane state; only A3 protocol-pointers repoint.

---

## Forward-dependencies & notes (carry into the cutover change-set)

1. **Cosmo CRs are a forward-dependency.** Quartet's target state assumes the **post-CR (fixed)
   Cosmo** — the 7 change-requests filed from the finalization-guide triage (WI-888…894, "Cosmo
   improvements" workstream; WI-891 reviewer CR already Closed/Done). The reviewer leg's target
   behaviour binds those landing. Noted in `_quartet/roles/reviewer-protocol.md` target-state and
   here; don't treat the reviewer protocol as fully live until the CRs land.
2. **Cosmo/ZDX finalization runbook is NOT `_quartet/` material.** It is reviewer-leg/ZDX-lifecycle
   knowledge → folds into the **cosmo/zdx skill docs** (learning-tracker E8). The full runbook is
   embedded in **WI-887**. No `_quartet/` action; recorded so it isn't lost.
3. **`single-wi-executor-protocol.md` is a one-off** — explicitly NOT Quartet; not folded, not a
   cutover target.
4. **`quartet-hooks/roles.json`** — verify and repoint alongside `rehydrate.sh` (A1).

---

## Execution sequence (orchestrator, atomic) + verification

1. Re-run the sweep (below); diff against Class A — add any new live referrer.
2. Repoint A1 → A2 → A3 in one change-set. Inform live shepherds (their kickoffs/trackers moved).
3. Retire Class B.
4. **Verify:** the sweep returns **zero** path-pointers to retired files; trigger `rehydrate.sh` and
   confirm it prints `_quartet/` paths; spot-launch one shepherd kickoff and confirm every "read
   first" path resolves.

```bash
# Pre-cutover re-sweep — must return only Working-state (Class C) hits after cutover
grep -rn "_wip/umbrella-program/\(orchestrator\|planning-reference\|orchestrator-kickoff\)\|_wip/identity-foundation/\(shepherd-protocol\|reviewer-protocol\|reviewer-kickoff\|shepherd-kickoff\|executor-protocol\|subagent-brief\|review-watcher\|progress-channel\)" _wip/ .claude/ docs/ AGENTS.md CLAUDE.md 2>/dev/null \
  | grep -v "/quartet-extraction-handoff-brief\|/quartet-learning-tracker\|/quartet-cutover-plan\|/quartet-delegation-edit-plan"
```
