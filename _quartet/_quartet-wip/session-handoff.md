# Quartet Dogfood / Cleanup Session — Compaction Handoff

**As of 2026-06-30.** This is the **meta / dogfood orchestrator** session (NOT the live program
orchestrator). Purpose: stand up + clean the `_quartet/` system for the **Mentomate Productization**
program, populate the **Initiatives DB**, relocate working state (Option C), and dogfood the
machinery — arm's-length from live execution lanes. Operator = Jorn. Branch = `main` (docs/state-only
own-work committed directly per operator ruling; pushes via the commit skill, non-ff handled with
`pull --no-rebase --no-edit`).

## DECISIONS BANKED
1. **Roster → Initiatives-DB = Approach B (hybrid), confirmed 2026-06-30.** DB owns structured
   current-state + per-initiative page bodies; a **thin markdown companion** (planned:
   `_quartet/working/program/program-notes.md`) holds the irreducible program-level prose (routing/
   intake rule, standing-lane framing, cross-initiative rulings, gate prose). Retire the 75k roster by
   **distilling, not porting**. **Spike scope = start with the prioritized initiatives `INI-6`
   (Identity Cutover) + `INI-32` (Operations)** — NOT the INI-11/INI-1 originally proposed. Test the
   two known gaps: add an `Activate-when` property + try the activation queue as a **DB view**;
   per-initiative narrative → page bodies on demand. **Criterion:** if the companion doc shrinks to
   ~nothing → collapse to DB-only (Approach A); else keep B.
2. (Earlier this session) **Initiatives DB is MASTER** for initiative core data; roster is a downstream
   mirror. **Option C** (relocate working state into `_quartet/working/`, minus INI-6) approved.
   Machinery canonical **only** in the `_quartet/` Brain/Library; `_quartet/_quartet-wip/` holds meta
   artifacts (this file, `quartet-findings.md`, `repo-findings.md`, `audit.md`).

## DONE THIS SESSION (all committed + pushed to main)
- **Initiatives DB populated:** 15 outcomes; 10 Initiative→Workstream links; **INI-32 Operations**
  (→ WS-22 Bug Lane + WS-25 Review backlog + WS-27 PR cleanup) and **INI-33 App v2** (→ WS-28) created;
  **INI-10 graduated + WS-14 closed** (23/23 WIs verified). (Notion writes; `Spawns` relation is now
  named `Workstream`; `PRG` property deleted.)
- **Option C relocations** into `_quartet/working/lanes/`: Tier-1 `e2630cd`
  (adr-governance-correction, agent-instructions, architecture, errors-api, l10n-a11y,
  security-pii-inngest); Tier-2 `fbb0a3d` (new-llm-integration, security-pii-api, flow-remediation).
  pr-cleanup was already there.
- Deleted stale snapshots `_quartet/working/program/{program-roster.md,dashboard.html}`.
- Created **`_quartet/working/program/orchestrator-kickoff.md`** (program-specific kickoff; fossil-scope
  wording fixed `8f7e5f4`).
- Slimmed `_quartet/dependencies.md` external-work → Cosmo pointer (`ad417ec`).
- Meta-separation: `audit.md` + `findings.md` → `_quartet/_quartet-wip/` + folder README (`95dd232`).
- Corrected roster PRG-02/INI-2 → Parked/Mentomate (`4bdb5b1`).
- Dogfood findings **F6–F13** logged in `_quartet/_quartet-wip/findings.md`.
- Session commits on main: `e2630cd`, `fbb0a3d`, `8f7e5f4`, `ad417ec`, `95dd232`, `4bdb5b1`
  (+ merge commits from non-ff pulls).

## OPEN — NEXT STEPS (priority order)
1. **Run the Approach-B spike** on INI-6 + INI-32 (decision #1 above).
2. **Held operator decisions** (queued behind prep #1, now unblocked after the spike or alongside it):
   - **Continue Identity Cutover (INI-6).** Operator states **NO live session is holding it** — this
     SUPERSEDES the earlier read (from anchor/channel traffic) that a live PRG-06 orchestrator was
     active. INI-6 is drivable.
   - **Spin up the Operations shepherd (INI-32)** — standing lane (bug-lane + review-backlog +
     PR-cleanup workstreams).
3. **Option C relocation remainder** (parallel cleanup, gated; NOT a blocker for new execution):
   `identity-foundation` (needs `AGENTS.md` to quiesce, then repoint `AGENTS.md:207` + memory
   pointers), `bug-lane` (live monitors — coordinate stop/re-arm), `umbrella-program` (roster/
   dashboard/anchor + `rehydrate.sh`; coupled to INI-6 via finding F13).

## KEY IDS
- Initiatives DB `e8bc1bfd-215c-4cd4-a20f-a7b8be91fffe` (ds `284f53e3-0319-47db-b219-0e4f00b8ce09`)
- Workstreams DB `47d8bc5c-e074-4cd9-95bd-ddbb81978bdf` (ds `08b3ab36-709d-44af-b78c-5e9f74f6e745`)
- Work Items DB `f170be9e04ae45d4961828f2438666bd` (ds `36fd1119-9955-4684-8bfe-deb145e6a21f`)
- INI-6 Identity Cutover → WS-18 `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`
- INI-32 Operations → WS-22 `3858bce9-1f7c-8083-905b-d94bca4a4325` (Bug Lane), WS-25
  `38e8bce9-1f7c-8020-bb89-ef4f62321a5c` (Review backlog), WS-27
  `38e8bce9-1f7c-80c7-b212-c6a1d258966b` (PR cleanup)

## CAVEATS
- Shared checkout: commit **own-work only** (never `git add -A`); ~50+ concurrent-session dirty files
  routinely present — leave them.
- Full session context (orientation, inventories, the program-status synthesis) is in the conversation
  being compacted; the durable record is the commits above + `quartet-findings.md` / `repo-findings.md`
  + this file.

---

## UPDATE 2026-07-01 — dogfood-boot session (simulated fresh-orchestrator kickoff)

Ran the program kickoff launcher end-to-end as a cold orchestrator, then hardened the findings log to
be machinery-only. Commits on `main` (own-work, pushed): `c7f8525`, `7f65a7a`, `c6f4ce0`, `7489b19`,
`313c89b`.

**Corrections to earlier-banked assumptions (IMPORTANT):**
- **F14 "master DB unreadable" was WRONG.** The Initiatives DB reads fine **per-page** via
  `notion-fetch` (verified INI-6 returns all props). Only the *bulk-query* MCP tools
  (`query_data_sources`, `query_database_view`) are plan-gated — a convenience, not a wall.
  **Approach-B is NOT blocked and needs no plan upgrade.** Enumeration is the only soft spot: use
  `notion-search` (lossy/capped) or a small page-ID index; individual reads are fine.
- **"No live session holds INI-6" confirmed true, but the channels were stale.** WI-867 / PR #1700 is
  **merged + closed**; WI-503 (keyboard-avoidance bounce loop) is **orphaned — awaiting a HUMAN
  confirmation, no agent owns it** (not agent-actionable). The identity-cutover/bug-lane outboxes still
  read "open" because sessions ended without emitting closing `decision`s — treat any channel signal as
  possibly-stale; Cosmo-verify before acting.

**Findings log split system-vs-state (2026-07-01).** The former merged `findings.md` is now two files:
`_quartet/_quartet-wip/quartet-findings.md` (reusable machinery — the ZDX/Quartet hand-off surface) and
`_quartet/_quartet-wip/repo-findings.md` (this deployment's state/mess/cleanup). Clean **machinery**
finding set (in quartet-findings.md):
- **F16** — reusable Brain hard-names a literal `working/program/program-roster.md` path.
- **F17** — reconcile ritual can't "keep" a monitor across a job boundary (task-ids don't survive).
- **F18** — no scoped/observer boot mode (Brain assumes the orchestrator owns every active lane).
- **F10** — lifecycle model has no steady-state for a standing (non-graduating) lane.
- **F11** — monitor-hygiene governs watchers but not the stale output files they leave.
- **F13 residue** — Library defines no home for the program-level session-start (rehydration) hook.
- Plus F1/F16 (literal roster path), F2/F6 (anchor read-in-full + bloat), F3 (dated filename),
  F5 (shared-tree commit scope), F7 (findings surface undiscoverable) — see quartet-findings.md.
- Common shape: the Brain **over-commits to deployment specifics** — fix = refer to bindings, not
  instances. In **repo-findings.md** (state): F4, F8, F9, F12, F13, F14, F15.

**OPEN — unchanged next step:** run the **Approach-B spike on INI-6 + INI-32** (now unblocked). INI-6
page id `38e8bce9-1f7c-8149-8b14-ddae03440c84`; INI-32 Operations `38f8bce9-1f7c-8130-a26b-e9f830354fb2`.
The two held operator decisions (drive Identity Cutover; spin up the Operations shepherd) still stand
behind the spike.

---

## UPDATE 2026-07-01 (cont.) — memory → findings migration + learning-tracker deleted

Commits on `main` (own-work, pushed): `4497eaa`, `58b9a81` (+ earlier `c7d2e8d`).

- **F9–F13 reclassified** system-vs-state: **F10/F11 kept as machinery**; **F9/F12/F13 withdrawn as
  repo-state** (relocation mess). F14/F15 also withdrawn (environment / repo-state).
- **Machinery lessons promoted from operator memory → `quartet-findings.md`:** F19 (agent isolation /
  single-writer + cwd-pin caveat), F20 (CI-repro at failing commit), F21 (verify-at-source + shepherd
  conformance-review + completeness-sweep), F22 (sub-agent checkpoint cadence + no-git), F23 (shepherd
  completion gates), F24 (cutover/switch-flip owner), + an F5 push/land extension. **Category B (tagged
  *may-not-be-Quartet*):** F25 (refine-inspects-code → ZDX DoR), F26 (PR-on-done → estate/Cosmo).
  **From the learning-tracker:** F27 (reviewer invariants — never fork for review), F28 (ZDX/Cosmo
  finalize lifecycle — *may-not-be-Quartet*). `quartet-findings.md` now carries **F1–F28**, machinery
  only, dedup'd (F1≡F16, F2≡F6 merged).
- **Deleted 13 memories + the learning-tracker** (`_wip/umbrella-program/quartet-learning-tracker.md`)
  — all content folded into `quartet-findings.md` / `repo-findings.md`; index lines removed from
  `MEMORY.md`.
- **Referrer discipline (established rule):** a **forward/live dependency in a durable doc** → repoint
  to the `Fxx` finding; a **past-tense historical mention in a log / lane-`_state` scratch / anchor /
  audit-catalog** → leave (rewriting falsifies history + touches live-owned/immutable files). Repointed
  6 live refs → F24/F27/F28 + `monitor-hygiene.md` (identity-foundation cutover-plan/brief, roster,
  cosmo-finalization-guide). Remaining mentions of deleted files (pr-cleanup/bug-lane outboxes,
  shepherd-world.md, WI-805 enumeration, orchestrator anchor, IF disposition-matrix, memory-cleanup.md,
  quartet-cutover-plan exclusion-list, 2 `docs/_archive` audits) are **intentionally left** as history.
- **Findings surfaces are the deliverable to hand the Quartet owner:** `quartet-findings.md` (machinery)
  + `repo-findings.md` (this deployment's state). The dogfood-capture pointers live in the folder README
  + the orchestrator-kickoff §6 (both now name both files).

---

## UPDATE 2026-07-01 (session 3) — LIVE orchestration of 3 lanes + dogfood WIs

**Role now:** I am the **orchestrator driving WS-18, WS-22, WS-28** (operator spawns shepherds + the Codex
reviewer; I rule, hold merge gates, route the Clacks). Operator directive: **act autonomously; surface only
`needs-operator`.** Shepherds/reviewer are separate operator-launched sessions — never spawn them as subagents.

**Lanes + channels — monitors generally SURVIVE compaction (same session); on resume RECONCILE, don't blind-re-arm.
Current watcher task-ids: WS-18 `bpt11eqgp`, WS-22 `bb2x25w27`, WS-28 `bgrf1yg1t`:**
- **WS-18 identity-cutover** `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8` — channel `_wip/identity-cutover/_state/`.
  Shepherd live. **I hold the merge gate** (no shepherd self-merge on this lane).
- **WS-22 bug-lane** `3858bce9-1f7c-8083-905b-d94bca4a4325` — channel `_wip/bug-lane/_state/`. **DRAINED →
  quiescent standing lane (stays Open, NOT graduated — F10).** Shepherd has Gate-1 self-merge for focused fixes.
- **WS-28 v2-finalization** `38f8bce9-1f7c-8185-96b2-e79cb1a458fe` (INI-33 App v2) — channel
  `_quartet/working/lanes/v2-finalization/_state/`. Shepherd live. Charter =
  `_quartet/working/lanes/v2-finalization/execution-tracker.md`; **substance = `docs/plans/2026-06-30-v2-publish-readiness-canonical-plan.md`** (WI-1168–1175). Reviewer already covers WS-28 via
  `_wip/identity-cutover/_state/reviewer-loop-extra-workstreams.mjs`. **🔴 S6 hard boundary — no irreversible deletions.**

**WS-18 delivered this session:** WI-905 (v2 SQL-seam integration coverage) — collapsed an over-split
(planning-rules §2.2), dispatched a Sonnet builder, verified strict-green own-eyes, **MERGED PR #1769
(`5257eb70add390e62a07a70dd144c70fedd96d72`) at my gate → Closed.** WI-868 — ruled re-scope to **Half-1 only**
(delete IDENTITY_V2_ENABLED flag symbol + vestigial param-threading; verified 0 prod callers = zero-behavior
no-op); dropped its dead-module + legacy-table-clean scope to **WI-586 (non-billing) + WI-805 (billing)**
convergence; shepherd restated AC + renamed 868 + fixed the AC grep spec. **Builder pushing Pass A → NEXT
ACTIONABLE: my merge gate at CI-green.** Then 869→779 (fresh-derive scope, don't pre-delete live/test-bearing
code; **586 table-drop = the irreversible flip, operator/cutover-owner's call**).

**WS-28 state:** orphan first-task items WI-1170 (merged→Reviewing) + WI-1171 (completed→Reviewing) done.
**WI-904 (dictation 'normal' pace) PARKED in Awaiting-Info limbo** — human on-device QA unavailable; verified
it **blocks nothing** (0 edges, reverse-scanned); PR #1749 (age-aware pause) is code-green but unmerged/unverified.
Publish-time caveat: shipping now = dictation ships the QA-failed too-fast pace. In flight: WI-1172 (docs/test-only,
S6-safe), WI-1174 (PR #1772, shepherd bounced on 2 valid Codex findings, builder correcting). Not started:
WI-1173 (gated on 1172), WI-1175 (publish-review, last).

**Machinery WIs captured this session (dogfood → Cosmo; findings F29–F34 in `quartet-findings.md`):**
WI-1229 (shepherd/reviewer 1:1→1..n · Quartet MVP), WI-1230 (Clacks schema unenforced/entropies · Quartet MVP),
WI-1235 (shepherd spawn: arm monitors + sign-of-life BEFORE reconcile · Quartet MVP), WI-1236 (orchestrator arms
lane monitors ASAP · **Cosmo improvements / WS-23**), WI-1237 (orphaned in-flight WI adoption procedure · Quartet MVP).
Quartet-MVP WS `38e8bce9-1f7c-816f-b5cd-c55b3c12c81d`; ZDX Work Items DS `36fd1119-9955-4684-8bfe-deb145e6a21f`.

**OPEN finding — commit-reconciliation `_state` churn (NOT yet WI'd):** the commit skill's `stash+rebase` on a
non-ff push churns working-tree-only `_state/` Clacks channels (→ monitor replay storms + a shepherd's outbox
reverting to a stale snapshot; both seen live). Fix = reconcile via `git pull --no-rebase --no-edit` (merge),
never stash untracked `_state/`. Operator offered a WI (would go to Cosmo improvements) — pending. Deferred
findings-file commits while lanes are live to avoid re-churn.

**RESUME CHECKLIST (do first):**
1. **Reconcile the 3 outbox watchers — do NOT blind-re-arm.** They generally survive compaction; check each is
   still alive (`/tasks` / TaskList) — current ids WS-18 `bpt11eqgp`, WS-22 `bb2x25w27`, WS-28 `bgrf1yg1t`; re-arm
   **only the dead ones** (`tail -n0 -F <outbox>`, persistent; channel paths above). F17's "replace all" applies to
   a genuine new session/job, NOT compaction. Hygiene: `_quartet/clacks/monitor-hygiene.md`.
2. **WS-18:** check WI-868 Pass A CI status → run the merge gate (own-eyes: strict-green required checks +
   read the automated-review verdict body, not just the check colour) if green; merge = mine, no self-merge.
3. Read each lane's `outbox.jsonl` tail for anything emitted during compaction; Cosmo-verify (channels may be stale).
4. Surface only `needs-operator`; drive the rest.
