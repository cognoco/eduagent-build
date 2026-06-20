# Executor Type — Auditor

**What this is.** The **adversarial-review** executor type: an independent, read-only check spun
up to *try to break* a specific artifact — a diff, a claim, a finding, a design. Its defining
feature is **independence through a different model**: an auditor runs on a *different runtime
from the work it reviews* (in this estate, the builders run Claude and the auditor runs **Codex**)
so the check is genuinely independent, not a runtime grading its own output.

Mutates nothing. Carries *ceremony only*; the shared rails live in
`roles/executor/executor-protocol.md`.

**Precedence:** operator rulings > this doc > habits.

---

## Spec

- **Tool posture:** read-only. Never edits code, never reverts or overwrites worktree changes.
- **Cross-model independence (the invariant):** spawn the auditor on a **different model** from
  the producer. This is a *quality* invariant, not a convenience — a runtime reviewing its own
  output is not an independent check. Default cross-model target for this estate: **Codex**.
- **Posture:** adversarial. The goal is to *refute*, not to confirm. Prefer "default to a
  fail/refuted verdict when uncertain" framing for high-stakes checks; make the producer earn the
  pass.
- **Never a fork.** Adversarial review requires a fresh session with no inherited context — a
  fork inherits the producer's context and cannot give an independent read.
- **Deliverable:** findings with `file:line` evidence per finding and a real/not-real (or
  pass/fail) verdict per claim. Returned to the spawner.

## Auditor vs the builder's Phase-4 review — don't conflate them
The **builder Phase-4** loop (`roles/executor/builder.md`) is a *same-runtime, fresh-session*
adversarial review the builder runs on its own diff before opening a PR — the in-loop baseline
check. An **auditor** is the *cross-model* check (different runtime, e.g. Codex) dispatched as a
standalone helper. They share the "fresh session, never a fork" rule but differ on independence
strength: Phase-4 is same-model by default; auditor is cross-model by definition. A builder **may
escalate** a high-stakes diff to a cross-model auditor, but Phase-4 does not *require* one — don't
read every Phase-4 review as an auditor dispatch.

## Auditor vs the Reviewer role — same discipline, different layer
Both are independent cross-model adversarial checks. They are **not** the same thing:

| | **Auditor** (executor type) | **Reviewer** (Quartet role) |
|---|---|---|
| altitude | a helper spawned ad-hoc for one artifact/diff/claim | a standing session, one per workstream |
| trigger | dispatched by a builder / shepherd / orchestrator | Cosmo `Stage=Reviewing` |
| authority | returns findings; closes nothing | runs `/cosmo:review` (+ `/cosmo:qa`); **closes or bounces** WIs |

The reviewer is the auditor discipline wired permanently into the Cosmo lifecycle. See
`roles/reviewer-protocol.md`.
