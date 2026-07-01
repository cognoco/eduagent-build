# V2 Finalization — Execution Tracker

**Lane:** `v2-finalization` · **Cosmo Workstream:** WS-28 "V2 finalization"
(`38f8bce9-1f7c-8185-96b2-e79cb1a458fe`) · **Initiative:** INI-33 App v2 (mentor-is-the-app shell
redesign) · **Status:** activating 2026-07-01 (orchestrator-owned; spike option C, operator-approved).

## Charter
Drive WS-28 to **publish-readiness** for App v2: finish V2 supporter visibility, progress placement,
parity checks, and **S6 *preparation*** — never S6 execution.

## 🔴 HARD BOUNDARY — S6 / irreversible (operator-gated, non-negotiable)
S6 (the App-v2 cutover deletions per the mentor-is-the-app spec) is **DEFERRED + IRREVERSIBLE**. This
lane **prepares** for S6 and **NEVER executes it**: no irreversible deletion, no removal of the
V1/V0 rollback path, without **explicit human confirmation**. Any WI that would cross into S6
execution → **STOP + escalate `needs-operator`**. (Ref: `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §13; S6-deferred ruling.)

## First task — adopt the orphaned in-flight WIs
Three WIs are stranded at `Stage=Executing`, **dual-homed** in WS-27 (PR cleanup — graduated) **and**
this WS-28; 2 carry live PRs; the pseudo-shepherd session that drove them is gone. First job, in order:
1. **Enumerate** WS-28's `Executing` items; identify the 3 (cross-check the WS-27 residue).
2. For each: **reconcile the claim** (reclaim; a dead session's claim may be *unexpired* → force-clear),
   **reconcile the live PR** (PR#, required-check/CI state, merge-ancestor-of-main?), then **resume the
   review loop** → green → merge (Gate-1) → `/cosmo:execute complete` → reviewer close (Gate-2).
3. **Leave WS-27 membership as-is** — operator ruled: dual-homed, **no re-home**.

> The orphaned-WI adoption procedure is not yet standardized — machinery gap captured as a Quartet-MVP
> WI on 2026-07-01. Until it lands, adopt per step 2 above and flag surprises `needs-orchestrator`.

## Then — the rest of WS-28 (publish-readiness)
The remaining WS-28 WIs → supporter visibility, progress placement, parity checks, S6 *prep* (not
execution). Slice/refine as needed; **flat by default** (planning-rules §2.2 — absorb constituents into
the WP body, sub-slice on demand; do **not** pre-create children for a single-PR bundle).

## Canon / authority
- **Cosmo WS-28** = live per-WI state (master). Repo `AGENTS.md` Cosmo rules govern lifecycle.
- **App v2 target:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`.
- **Planning:** `_quartet/planning-rules.md`. **Merge = Gate-1 (green PR), Close = Gate-2 (reviewer).**

## Change log
- **2026-07-01** — Lane activated by the orchestrator (spike option C). Charter + S6 hard boundary set;
  first task = adopt the 3 orphaned WS-27/WS-28 `Executing` items. Reviewer = the existing Codex
  reviewer, scope extended to WS-28 (operator-added).
