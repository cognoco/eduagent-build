# The Quartet

A reusable, runtime-agnostic system for running a multi-agent delivery **program** on top of the
**ZDX** work-item standard and the **Cosmo** work system. The Quartet is the four execution roles —
**orchestrator · shepherd · executor · reviewer** — coordinating over the **Clacks** comms layer.

> **Status.** Extracted from the machinery dogfooded during the eduagent-build pre-launch program.
> This is the clean, relocatable copy. A `working/` leg is kept inside for now; where it ultimately
> lives is a deployment decision (see `working/README.md`).

## The stack
**ZDX** (work-item standard) → **Cosmo** (work system) → **Clacks** (comms) → **Quartet** (the four
roles). See `glossary.md` for the full vocabulary.

## The three kinds (how this folder is organized)
This system has three kinds of artifact. Two are reusable and live here; the third is per-instance.

| Kind | What it is | Here |
|---|---|---|
| **Brain** | how each role behaves — the protocols | `roles/` |
| **Library** | definitions/shapes of the artifacts roles manipulate | `library/` |
| **Working state** | the live instances a running role produces | `working/` (kept inside for now) |

The Brain runs against the Library to produce and maintain the Working state. The Library is the
cookie-cutter; the Working state is the cookie.

## Layout
```
_quartet/
  README.md            this file
  glossary.md          shared vocabulary
  planning-rules.md    the program-agnostic rules of planning (structure, slicing, gates, principles)
  roles/               ── BRAIN
    orchestrator-protocol.md
    shepherd-protocol.md
    reviewer-protocol.md
    executor/          the executor layer + types
      executor-protocol.md   shared rails + type selector + spawn economics
      builder.md  researcher.md  auditor.md  general.md
    kickoffs/          paste-able launchers (orchestrator / shepherd / reviewer)
  library/             ── LIBRARY (definitions, not live content)
    program-roster.md  execution-tracker.md  clacks-channel.md  dashboard.md  activation-queue.md
  clacks/              ── the comms layer: design + tooling
    progress-channel-design.md  monitor-hygiene.md  orch-stage-monitor.sh  review-watcher.ts
  examples/            worked references (e.g. a real executor dispatch brief)
  working/             ── WORKING STATE (live instances; relocation TBD)
    program/  lanes/
  _quartet-wip/        ── META (NOT machinery): artifacts from building/auditing Quartet — audit.md, quartet-findings.md, repo-findings.md
```

## Bootstrap — "recreate its operational self"
The acceptance test for this folder: drop it into a repo, paste
`roles/kickoffs/orchestrator-kickoff.md` (swap the placeholders), and the orchestrator can
recreate the program's operational self — scaffold a roster, a dashboard, and the activation queue
(`library/` shapes → `working/program/`), and per lane a tracker + empty `_state/` channels
(`library/` shapes → `working/lanes/<lane>/`). The Working state is regenerated from the Library;
nothing in `_quartet/` depends on any one program's live content.

**First run, concretely:**
1. Read `dependencies.md` first — confirm the hard prerequisites (`NOTION_TOKEN`, the Work Items DB
   id). If they're absent, stop there; the Cosmo steps cannot run.
2. For a **new** program, copy the blank templates under `working/program/`
   (`*.template.md` / `*.template.html`), strip the `.template` suffix, and swap the `«placeholders»`.
   **Do not** reuse the snapshot `program-roster.md` / `dashboard.html` beside them — those are a
   prior program's content (see `working/README.md`).
3. Then follow the orchestrator protocol's activation checklist per lane.

## Paths
All cross-references in this folder are relative to the `_quartet/` root (e.g.
`roles/shepherd-protocol.md`). When `_quartet/` is checked out under a repo, prefix accordingly.

## Estate bindings (substitute per deployment)
A few specifics are this estate's bindings, not part of the standard — they are called out where
they appear: secrets via **Doppler**, the cross-model reviewer/auditor runtime is **Codex**, and
the commit flow goes through the repo's commit skill. Swap these for the target deployment.
