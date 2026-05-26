---
name: writing-plans
description: Use when you have a spec, feature request, bug, or any multi-step task and need to write an implementation plan before touching code — applies to greenfield features, bug fixes, migrations, refactors, audits, and design/spike exploration, not just greenfield work.
---

# Writing Plans

A plan turns a spec or task into a sequence of self-contained, individually
verifiable steps another worker — human or agent, possibly one with no prior
context — can execute without re-deriving your decisions.

**Announce at start:** "I'm using the writing-plans skill to write the implementation plan."

> **Status — embryo of the global planner.** This is the canonical planning
> skill here and the seed of a future estate-wide ZDX plan skill. Its output is
> deliberately forward-compatible with autonomous execution (numbered,
> checkboxed, verification-first, scope-bounded), so a plan written here can
> later be handed to a machine executor. Keep it runtime- and repo-agnostic.

## 1. Where the plan lives

Resolve the plan directory once, in this order:

1. If `zdx-config.yaml` exists in the repo root and sets `zdx.planning.plan_dir`, use that.
2. Otherwise default to `docs/plans/`.

Create the directory if missing. **Filename:** `YYYY-MM-DD-<short-kebab-slug>.md`
(the date the plan is written; slug from the task intent).

## 2. Pick the plan profile

The work type determines what a "task" and its verification look like. Choose
one and record it in the frontmatter `profile` field:

| Profile | Use for | Per-task verification is… |
|---|---|---|
| **code** | new behavior, bug fixes, logic | a named test, written first (red), made to pass (green) |
| **change** | migrations, refactors, audits | before/after checks (tests green both sides, counts match); destructive migrations need a rollback note |
| **design** | spikes, exploration, decisions | exit criteria: the decision reached + tradeoffs recorded — no tests |
| **ui** | visual / interaction work | component or visual checks, not necessarily red-green units |

The **invariant holds across all profiles: every task states how its completion
is checked.** Only the *form* of the check changes. This is what keeps red-green
TDD from being forced onto a design or audit plan where it doesn't belong.

## 3. Map the surface before writing tasks

Before decomposing into tasks, list the files you expect to create or change and
the one responsibility of each. Decomposition decisions get made here,
deliberately — not as a byproduct of writing tasks. Files that change together
belong together; follow the codebase's existing structure rather than
restructuring unprompted.

If the spec spans multiple independent subsystems, split it into one plan per
subsystem — each plan should produce working, checkable output on its own.

## 4. Plan document structure

````markdown
---
title: <Name> — Implementation Plan
date: YYYY-MM-DD
profile: code | change | design | ui
work_items: [WI-NN]      # optional — Cosmo / ZDX linkage
spec: <path-or-url>      # optional
status: draft            # draft | approved | in-progress | done
---

# <Name> — Implementation Plan

**Goal:** <one sentence — what this produces>
**Approach:** <2–3 sentences — how>

## Scope
In scope:
- <path / glob>
Out of scope:
- <paths that must not change>

## Tasks
- [ ] T1: <task> — done when: <objective, checkable criterion>
- [ ] T2: <task> — done when: <…>
````

- **Tasks are numbered (`T<n>`) and checkboxed.** Numbering gives stable
  addressing for review and handoff ("redo T5"); checkboxes are the task-level
  progress signal (and the contract an autonomous executor ticks). **One box per
  task — never per micro-step.**
- **`done when:` is mandatory** and carries the verification (§2). For the
  **code** profile, name the test; if the test body is substantial, put it in a
  `## Tests` subsection keyed by task ID and reference it from the task.
- For **design** tasks, `done when:` is the decision / exit criterion, not a test.
- **Scope** is a soft list when a human executes; for autonomous execution it is
  a hard contract (a scope-guard fails the run on out-of-scope edits) — make it
  exhaustive when the plan is destined for a machine.

## 5. No deferred decisions

A plan exists to make the decisions the implementer would otherwise guess at.
Never leave open a choice the plan was responsible for making:

- Banned: "TBD", "add appropriate error handling", "handle edge cases",
  "validate input", "similar to T2" (repeat it — tasks may be read out of order).
- Test: *could the implementer build the wrong thing because the plan left a
  choice open?* If yes, the plan is incomplete.
- Show code only where the **specific code is the decision** (an interface, a
  tricky algorithm, an exact signature) — not as blanket transcription. A task
  that changes code and leaves the shape ambiguous must show the shape; a
  mechanical edit need not.

## 6. Self-review before declaring the plan done

Run these passes yourself; fix inline, don't re-review:

1. **Spec coverage** — re-read the spec; for each requirement, point to the task
   that implements it. Add tasks for gaps.
2. **Deferred-decision scan** — search for the §5 smells; resolve them.
3. **Name / type consistency** — a function called `clearLayers` in T3 must
   still be `clearLayers` in T7.

For a large or high-risk plan, optionally dispatch a reviewer subagent (see
`plan-document-reviewer-prompt.md`).

## 7. Deliberately omitted (and why)

This skill drops, by design, parts of the common upstream planning skill that
degrade frontier-model planning:

- **The "assume zero context / questionable taste, document everything"
  framing** — biases toward bloated, over-explained plans. A capable planner
  calibrates detail to the reader.
- **The mandatory 5-step-per-task TDD template** — red-green is an *execution*
  discipline (see the `tdd` skill / your executor), not five boilerplate
  sub-steps copied into every task. The plan names the failing test; the
  executor runs the loop.
- **A single fixed task shape for all work** — replaced by the profile gate
  (§2), so design and audit plans aren't forced into a code-test mold.
- **Hard-wired execution-handoff to specific sub-skills** — left to the repo's
  execution flow.
