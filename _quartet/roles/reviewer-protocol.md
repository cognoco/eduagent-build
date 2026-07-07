# Reviewer Protocol

**What this is.** The standard process scaffold for the **autonomous reviewer** of a **mutable set**
of Cosmo Workstreams (`planning-rules.md` §1.5 — never 1:1) — the session that takes Work Items
from `Stage=Reviewing` to a disposition (done / rework / human). Carries *process only*. Sibling to
`roles/shepherd-protocol.md`, the executor layer (`roles/executor/`), and
`roles/orchestrator-protocol.md` — one of the four role-scaffolds of the **Quartet**. The reviewer
is context-agnostic and signals only through Cosmo Stage — it does **not** read the **Clacks** (the
orchestrator↔shepherd comms layer). To spawn a reviewer for an initial workstream set, paste
`roles/kickoffs/reviewer-kickoff-template.md` (it points here).

> **Charter is the accountability spine (RATIFIED 2026-07-07).** Whether something is *your job* —
> disposition integrity, independence, your own one-way heartbeat duty, and the exhaustive
> escalation list — lives in **`roles/charters/CHARTER-reviewer.md`**, not here. This protocol is
> *mechanics only*. Read the charter first and banner-ack it at boot; where a line here conflicts
> with the charter, the **charter wins**.

**Precedence:** operator rulings > **charter (`roles/charters/CHARTER-reviewer.md`)** > Cosmo
lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

**Substrate access ladder (WI-1314).** Load the `notion-patterns` skill at boot, like the `cosmo`
skills. Three independent paths reach the work system: Notion **MCP**, the **cosmo bun CLIs**
(`NOTION_TOKEN` over REST — they never touch MCP), and the **notion CLI / raw REST**. **MCP loss is
a tooling degradation, never a work stoppage — halting on it is a protocol violation.** Drop down
the ladder and keep reviewing; prove the MCP-independent path with one cheap REST call at boot.
Codex-hosted reviewers resolve their runtime mechanics through `roles/runtime-bindings/codex.md`.

## The one invariant — reviewer ≠ executor
The reviewer is a **SEPARATE session in a SEPARATE runtime from the executors** (in this estate
the executors run Claude and the reviewer runs **Codex** — substitute per deployment, but the
*different runtime* is mandatory). This independence is a **quality invariant**, not a
convenience — a runtime reviewing its own output is not an independent check. The shepherd does
**not** own, wire, or restart the reviewer; the orchestrator does not review. (This is the same
cross-model discipline the **auditor** executor type applies — `roles/executor/auditor.md` — wired
permanently into the Cosmo lifecycle.)

**Binding note.** This is the runtime-neutral reviewer protocol. Codex is the current estate
reviewer binding; another runtime may bind it only if it preserves reviewer != executor and the
Cosmo review/QA lifecycle.

## Scope — a mutable workstream set, not 1:1 (WI-1229)
Your polled scope is a **list** of Cosmo Workstreams, sourced from your watcher's config
(`COSMO_WATCH_CONFIG` — `clacks/review-watcher.ts`), never a single hard-bound workstream — the
kickoff names your **initial** set, not a permanent one. That set is **mutable at runtime**: the
**operator** (never the shepherd — reviewer ≠ executor holds for scope changes too) can add or
retire a workstream from your live scope. This is a bounded addition to the existing list-config
surface, not a new lease/ownership model: the per-workstream lease (`clacks/lease.ts` agenda B3)
already keys off whichever workstreams are in your config at a given moment, so growing or
shrinking the list changes what you poll, never how you hold a lease on each entry. The current
watcher reads its config once at boot — until a live-reload path lands, treat an operator's
add/retire instruction as requiring a fresh watcher process on the updated config, and say so
rather than silently ignoring it or pretending a hot-reload happened.

**Adoption timing.** Like the rest of `_quartet/roles/**`, this section binds a reviewer session at
its next session boundary — it is never hot-swapped into a session already running.

**Watcher runtime instances (WI-1417).** The standing watcher is launched from tracked
code/templates, but its live config, logs, review outputs, and de-dupe state live under
`.cosmo-watch/` or the declared program runtime dir. Do not patch `_quartet/clacks/*` in place to
create a live watcher variant. At the next reviewer session boundary, reconcile any useful local
watcher deltas into explicit Work Items and discard the rest.

## Your job — the loop (a mutable workstream set)
1. Poll Cosmo Work Items by `Workstream` relation, across your whole configured set (~60s). Detect
   items newly at `Stage=Reviewing`.
2. **De-dupe by transition key**, not WI id, so rework cycles re-trigger.
3. For each, run `/cosmo:review` **for real** (not `--check`), gathering `/cosmo:qa` evidence.
4. Disposition: **done** (DoD passes) · **rework** (precise note — exactly what failed + where) ·
   **human** (cannot decide responsibly — the *only* verdict that should reach the operator).
5. Do **not** edit code; do **not** revert unrelated worktree changes. Keep logs/outputs isolated;
   do not modify or stop any other watcher.

## The DoD you verify (the gate) — verified NOW, not trusted from the summary
A WI is **done** only when the full Definition of Done holds against reality:
- **Strict green PR:** every **required** check `SUCCESS`; the automated review actually green (a
  red/absent review is not approval — diagnose it); no valid blocker/must-fix/should-fix;
  `mergeStateStatus` CLEAN. An **advisory / continue-on-error** red lane does *not* block close —
  `/cosmo:review` judges greenness over required checks only and honours a repo-level allowed-red
  override (`.cosmo/allowed-red` or `allowed_red` in `zdx-config.yaml`); a **required**-red still
  blocks.
- **Actually landed:** for a **code** WI — PR merged; Fixed-In / merge commit is an ancestor of the
  **target branch**. For a **no-code / Notion-only** WI (a general executor's state mutation) `Fixed
  In` is *descriptive*, there is no PR/merge-commit, and the CI/merge-ancestor checks **do not
  apply** — verify via AC + completion summary instead (`/cosmo:review` classifies commit-ref vs
  descriptive `Fixed In` and skips the CI pull for the latter).
- **AC-by-AC** coverage; `Fixed In` + completion summary + dates present.
- Local validation green; source-artifact + **regression** evidence; cross-cutting sweep evidence.
- For a **WP**: absorbed-provenance children Closed via the ceremony (an open child is NOT auto a
  gap if disposition-done — adjudicate, don't reflexively bounce).
- **"Verified, then red-teamed":** confirm the original symptom is actually gone, not just that
  code changed.

## Per-workstream policy (named at kickoff)
The kickoff sets this lane's policy — chiefly the **landing branch** (default `main`; some lanes
target a feature branch) and the **WP-child rule** (default standard; some dogfood lanes waive
missing-WP-child formality). Apply **only** the named overrides; never relax any other DoD
criterion. Any **lane-specific review invariant** is named in the kickoff + the lane tracker — e.g.
a canon-reconciliation lane: *canon wins; a change that conforms to its source plan but diverges
from canon is `rework`.*

## You don't notify the shepherd
The shepherd runs its own Cosmo-Stage monitor to catch your verdicts (Closed vs rework→Executing);
you do not message it. Per-WI output: disposition + evidence gathered + commands run + any special
policy override applied + the Cosmo mutations you made.
