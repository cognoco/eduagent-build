# Quartet Extraction — Handoff Brief & Launch Prompt

> **Produced by the orchestrator (2026-06-19) for a SEPARATE, operator-controlled extraction session.** The
> orchestrator does **not** execute this extraction (separation of concerns). This brief captures the design
> decisions from the session that aren't written down elsewhere, plus a launch prompt that shapes the
> extraction agent's role. The agent does its OWN inventory (operator-guided) — no inventory is pre-supplied here.

---

## A. Why this exists

The Quartet machinery's "brain" — the role protocols and supporting design — is **scattered** across
`_wip/umbrella-program/` (orchestrator side) and `_wip/identity-foundation/` (shepherd / executor / reviewer
side). That split is an *accident of birth* (the machinery was built during the Identity-Foundation runway and
never relocated), and it's **co-mingled with live program/workstream tracking**. The goal:

1. **Extract the reusable Quartet *system*** into a clean **repo-root `_quartet/`**, cleanly separated from
   live tracking.
2. **Fix the executor/builder taxonomy muddle** (§C) in the process — don't relocate the muddle.

This is the **first step of PRG-05** (execution-mechanism productionization). **Do not over-ceremony it** — no
full Cosmo scope/slice for this step; it's a bounded setup act (like lane activation). The *broader* PRG-05
(productizing the scaffolds into slash-commands / runtime-agnostic tooling) is a later, separately-scoped phase.

## B. The system-vs-live cut (the classification principle)

- **SYSTEM → `_quartet/`** (reusable, runtime-agnostic): the four role protocols
  (orchestrator / shepherd / executor / reviewer), the sub-agent **brief-standard**, kickoff **TEMPLATES**
  (the generic, placeholder ones), the **Clacks / progress-channel DESIGN** spec, the **lane-activation +
  graduation CEREMONIES**, the **planning RULES**, the shared **vocabulary / glossary**, the executor example.
- **LIVE-TRACKING → stays in `_wip/`**: the program **roster**, **dashboard**, **checkpoints**, stream-2
  backlog, the **compaction-handoff anchor**, each lane's **`execution-tracker.md`**, the
  **`_state/{inbox,outbox}.jsonl`** channels, and **instantiated** (filled-in, lane-specific) kickoffs.
- **MIXED → split**: a file holding both (e.g. `planning-reference.md` likely mixes canonical planning *rules*
  with live activation-queue *state*).
- **Rule of thumb:** TEMPLATE / RULE / PROTOCOL / DESIGN → `_quartet/`; INSTANCE / STATE / ROSTER → stays.

## C. The taxonomy muddle — the extraction session's decision (with the orchestrator's analysis as input)

**The problem.** "Executor" got overloaded. It is one of the four canonical Quartet **ROLES** (the WI-builder a
shepherd dispatches), but a recent delegation edit *also* made it an **umbrella** for five "typed executor
profiles" (Builder / Auditor / Researcher / Analyst / Housekeeper). Collisions this created:
- `executor-protocol.md` is now relabelled "Builder profile" — **filename ≠ content**.
- "Executor" semantically implies *building/doing*; a read-only **researcher/auditor isn't "executing."**
- An **"auditor" sub-agent** overlaps the **"reviewer" role** — same concept at different altitudes, now blurred.

**The goal.** Cleanly separate **"ROLE"** (the canonical Quartet actors) from **"dispatched helper"** (what kind
of sub-agent a shepherd/orchestrator spawns).

**Orchestrator's analysis — INPUT ONLY, not a ruling (the operator explicitly deferred this decision to the
fresh session):** one clean option is *"Executor = the WI-builder role (revert the Builder-profile relabel);
Auditor / Researcher / Analyst / Housekeeper = non-role **helper sub-agents** governed by the brief-standard."*
Evaluate this freely with the operator — adopt, refine, or replace it. **Do not just rubber-stamp it.**

**Affected files to reconcile:** `subagent-brief-standard.md`, `executor-protocol.md`, `shepherd-protocol.md`,
`orchestrator-protocol.md`, the kickoff templates. See `quartet-delegation-edit-plan.md` for the recent edits
that introduced the muddle.

## D. The delegation philosophy to carry forward (already written; preserve, but resolve the taxonomy within it)

The delegation standard already exists in `_wip/identity-foundation/subagent-brief-standard.md`:
- **Relentless delegation = context-longevity, not token-thrift** — preserve the orchestrator/shepherd's *own*
  context window (longer autonomous runway + reasoning quality); delegation may raise total tokens — accepted.
- **Shared control rails on every dispatch brief**: goal + verifiable success criteria, quality bar, process
  awareness, Definition of Done, report-back boundary, **Clacks-blind** (sub-agents report to their spawner,
  never write channel files), tiering rails (carry the standard down; parent owns child DoD).
- **Fork sparingly** (token-expensive; **never** for adversarial review). **/workflows**: scale-tiered standing
  authorization for read-only sweeps (cheap tier autonomous ≤~8 agents/≤2 rounds; expensive tier prompts once).
- **Orchestrator quality carve-out**: delegate legwork, **never the ruling** (go/no-go on irreversible/prod/land
  + strict-green verification stay in-seat).

Carry all of this into `_quartet/` — but it currently encodes the taxonomy muddle (§C); resolve that as you go.

## E. The method — lightweight COPY-then-REDIRECT (additive build + deferred cutover)

This is the chosen approach (operator-ruled), specifically to avoid breaking the live machinery:

1. **COPY** the SYSTEM artifacts out of the existing `_wip/` folders into `_quartet/` and **CLEAN them up there**
   (apply the taxonomy resolution + the system/live separation + organize properly).
2. **Additive only** — building `_quartet/` is a *new directory*; you do **NOT** mutate the live `_wip/`
   originals. This keeps collision risk near zero and the live "brain" stable.
3. When `_quartet/` is ready, produce a **CUTOVER PLAN** (the referrer-update list + old-copies-to-retire list)
   and hand back. The **orchestrator** (a separate operational session) executes the cutover later — redirects
   all referrers, informs the shepherds, retires the old copies. **You do not perform the cutover.**

## F. Constraints (freeze + boundaries)

- **Freeze-the-brain:** while you build, the live `_wip/` Quartet protocol files must not drift — the orchestrator
  has stopped editing them until cutover. You read/copy them; you do **not** edit the originals.
- **You are NOT the orchestrator, NOT a fork of it, NOT a Quartet role-holder.** No monitors, no lane dispatch,
  no `_state` channel writes, no gating/merging. You are a **designer/extractor** under the operator's direct
  guidance.
- **Operator guides** the inventory (system vs live) and **rules the taxonomy**. Surface decisions; don't guess
  on big cuts.

## G. The cutover (for the orchestrator, later — noted so your plan targets the right referrers)

Your inventory's referrer-sweep feeds this. Known referrer classes a missed entry would break at cutover:
- the **session-start / rehydration hook** (hard-codes `_wip/umbrella-program/orchestrator-protocol.md`,
  `program-roster.md`, `planning-reference.md`, etc.)
- root + nested **`AGENTS.md` / `CLAUDE.md`**
- **cross-references inside the protocol files** (they cite each other by path)
- **all kickoffs** — the templates AND active-lane instantiated ones (e.g. the live flow-remediation +
  identity-cutover shepherd kickoffs reference `_wip/identity-foundation/shepherd-protocol.md` +
  `subagent-brief-standard.md`)
- any **`docs/`** references.
- **Risk:** a missed referrer breaks a live session at cutover — the plan must be complete.

## H. Vocabulary / roles (grounding)

- **Stack:** ZDX (work-item standard) → Cosmo (work system) → **Clacks** (comms layer:
  `_state/{inbox,outbox}.jsonl` + Cosmo-Stage signaling + Monitor watchers) → **Quartet** (the four roles).
- **Roles:** **Orchestrator** (one per program — steers/rules/routes), **Shepherd** (one per lane — refines,
  dispatches, tracks), **Executor** (builds one WI), **Reviewer** (a SEPARATE session in a SEPARATE runtime;
  closes via `/cosmo:review` + `/cosmo:qa`; **reviewer ≠ executor** is a quality invariant).

## I. Deliverable

A populated, cleaned, well-organized **`_quartet/`** (system artifacts, taxonomy resolved, system/live separated)
**+ a complete CUTOVER PLAN** (referrer-update list + old-copies-to-retire list) handed back for the
orchestrator to execute at the deliberate cutover.

---

## J. Monitor hygiene — fold into the Clacks/monitoring layer (tracked as its own WI)

The Quartet's monitoring discipline must be codified in `_quartet/` (it's a Clacks-layer concern). Mechanism
(origin: a missed WI-823 Gate-2 bounce a human caught by eye + shepherd observation `prg06ic-246`):
- **Monitor manifest** — a per-session/role durable record of the **expected** monitor set (target, purpose,
  canonical command, live task-id) = "what good looks like".
- **Reconcile ritual** — at session-start / post-compact / post-resume / on-suspicion: diff actual (`/tasks`)
  vs expected → **keep** healthy / **replace** stale / **add** missing / **delete** duplicates+orphans →
  update the manifest. **Reconcile, never blind-add.**
- **Rules:** `persistent:true` is **mandatory** for standing watches (non-persistent monitors **expire
  silently** — the real stale mechanism); per active lane keep **BOTH** a Clacks (inbox/outbox) watcher
  **and** a Cosmo-Stage watcher (the Clacks one is blind to Stage; the Cosmo-Stage one catches reviewer
  bounces); **"monitor silence is unverified → direct-read Stage at finalize/close/decision boundaries"**;
  the **orchestrator runs a durable central Cosmo-Stage / reviewer-transition backstop**.
- Bake into the orchestrator + shepherd protocols **and the rehydration hook** — change its current
  "watchers die on compaction → re-arm" wording to "**reconcile against the manifest**" (the blind-re-arm
  reflex is itself a cause of monitor proliferation). Tracked as its own Cosmo WI (being captured).

## --- LAUNCH PROMPT (paste this to start the extraction session) ---

> You are the **Quartet Extraction Designer** — a standalone session working under Jorn's (the operator's)
> direct guidance to extract the reusable "Quartet system" into a clean new repo-root **`_quartet/`** in the
> `eduagent-build` repo. You are **NOT an orchestrator, NOT a fork of one, and NOT a Quartet role-holder.** You
> hold no monitors, dispatch to no lanes, write no `_state` channel files, and gate/merge nothing. You are a
> designer/extractor.
>
> **First, read in full:** `_wip/umbrella-program/quartet-extraction-handoff-brief.md` (this brief — design
> context, the system-vs-live cut, the taxonomy muddle that is *yours* to resolve with the operator, the method,
> the constraints) and `_wip/umbrella-program/quartet-delegation-edit-plan.md` (the recent delegation edits that
> introduced the taxonomy muddle).
>
> **Mission:**
> 1. **Inventory (operator-guided):** enumerate the Quartet artifacts across `_wip/umbrella-program/` +
>    `_wip/identity-foundation/` (and anywhere else), classify each **SYSTEM / LIVE / MIXED** per the brief's cut,
>    and sweep **all referrers** (rehydration hook, AGENTS.md/CLAUDE.md, kickoffs, cross-refs, docs). Confirm the
>    cut with the operator.
> 2. **Resolve the taxonomy muddle** — your call, guided by the operator; the orchestrator's analysis in the
>    brief is *input only*. Cleanly separate the canonical Quartet **ROLES** from dispatched **HELPER** sub-agents.
> 3. **Build `_quartet/`** by **copying** the SYSTEM artifacts out and **cleaning them up there** (apply the
>    taxonomy resolution + the system/live separation; organize properly; keep it runtime-agnostic/reusable).
> 4. **Additive only — do NOT modify the live `_wip/` originals.** The "brain" is frozen; the orchestrator and
>    live shepherds still read the originals until cutover. You copy out; you don't mutate.
> 5. **Produce a CUTOVER PLAN** — the exact referrer-update list + old-copies-to-retire list — so the orchestrator
>    can execute the cutover atomically later. **You do not perform the cutover.**
>
> Also **codify the monitor-hygiene mechanism (brief §J)** into `_quartet/`'s Clacks/monitoring layer as
> part of the build.
>
> **Constraints:** operator guides the inventory + rules the taxonomy; surface decisions, don't guess big cuts; no
> inline edits to live files (freeze); a complete referrer map is critical (a missed referrer breaks a live
> session at cutover).
>
> **Deliverable:** a populated, cleaned, well-organized `_quartet/` + a complete cutover plan, handed back to the
> operator/orchestrator for the deliberate cutover.
