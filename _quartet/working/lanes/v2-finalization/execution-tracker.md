# V2 Finalization — Execution Tracker

**Lane:** `v2-finalization` · **Cosmo Workstream:** WS-28 "V2 finalization"
(`38f8bce9-1f7c-8185-96b2-e79cb1a458fe`) · **Initiative:** INI-33 App v2 (mentor-is-the-app shell
redesign) · **Status:** active 2026-07-01 (orchestrator-owned; spike option C, operator-approved).

## Charter
Drive WS-28 to **publish-readiness** for App v2: finish V2 supporter visibility, progress placement,
parity checks, and **S6 *preparation*** — never S6 execution. **Substance source = the canonical plan**
(below); this tracker is the lane charter/entry-point, not a duplicate of it.

## 🔴 HARD BOUNDARY — S6 / irreversible (operator-gated, non-negotiable)
S6 (the App-v2 cutover deletions per the mentor-is-the-app spec) is **DEFERRED + IRREVERSIBLE**. This
lane **prepares** for S6 and **NEVER executes it**: no irreversible deletion, no removal of the V0/V1
rollback path, no flipping V2 to production default, without **explicit human confirmation**. Any WI that
would cross into S6 execution → **STOP + escalate `needs-operator`**. (Matches the canonical plan's
*Out of scope*; ref `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §13.)

## First task — adopt the orphaned in-flight WIs
Dual-homed WS-27 (PR cleanup — graduated) + WS-28 items were left `Executing` by a dead pseudo-shepherd.
Adopt them (reclaim; reconcile any live PR; resume → close), **leaving WS-27 membership as-is** (operator
ruling — no re-home). Adoption procedure is not yet standardized (machinery gap = WI-1237). *(As of
2026-07-01 the shepherd reports these reached + resolved — WI-1170 merged→Reviewing, WI-1171
completed→Reviewing; WI-904 was NOT an orphan but a QA-bounced item, held — see below.)*

## Then — the rest of WS-28 (publish-readiness)
The canonical plan's items (WI-1168–WI-1175) → supporter visibility, progress placement, parity checks,
S6 *prep* (not execution). **Flat by default** (planning-rules §2.2 — absorb constituents into the WP
body, sub-slice on demand; do not pre-create children for a single-PR bundle).

## Canon / authority
- **Cosmo WS-28** = live per-WI state (master). Repo `AGENTS.md` Cosmo rules govern lifecycle.
- **Canonical plan (WI substance):** `docs/plans/2026-06-30-v2-publish-readiness-canonical-plan.md`
  (build plans in `docs/plans/v2-plan/`; source maps in `docs/plans/v2-dossier/`).
- **App v2 spec:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`.
- **Planning rules:** `_quartet/planning-rules.md`. **Merge = Gate-1 (green PR), Close = Gate-2 (reviewer).**

## Change log
- **2026-07-01** — Lane activated by the orchestrator (spike option C). Charter + S6 hard boundary set;
  first task = adopt the orphaned WS-27/WS-28 `Executing` items. Reviewer = the existing Codex reviewer
  (`_wip/identity-cutover/_state/reviewer-loop-extra-workstreams.mjs`), scope already covers WS-28.
- **2026-07-01 (later)** — Added the canonical-plan citation (substance source); noted WI-904 is a
  QA-bounce not an orphan. (A brief orchestrator rewrite of this file to a thin pointer was reverted —
  the shepherd confirmed this tracker is its live charter.)
