# Executor Type — General

**What this is.** The **catch-all** executor type for simpler tasks that don't fit builder,
researcher, or auditor — small mechanical jobs, including non-code **state mutations** (Cosmo
properties, doc files, config, channel entries the spawner will relay). Mechanical and
deterministic: the target state is fully specified in the brief; judgment is not the deliverable.

(This type absorbs the former "housekeeper" profile. A dedicated housekeeper role earns its own
doc only if its ceremony actually diverges — promote at the third real instance, not before.)

Carries *ceremony only*; the shared rails live in `roles/executor/executor-protocol.md`.

**Precedence:** operator rulings > this doc > habits.

---

## Spec

- **Scope:** simpler tasks; read-only or small, fully-specified mutations. Anything that mutates
  *production code* is a **builder**, not a general — do not stretch this type to cover code
  changes.
- **No adversarial review** — but a **correctness-check is required** whenever the task mutates
  state: after writing, re-read the property / file / entry and confirm the expected value is
  present before reporting back. This substitutes for review — if the write silently failed or
  produced a wrong value, the general executor catches it in-run.
- **Clacks-blind even for channel work.** If the task *is* a channel operation, the general
  executor still does **not** write `_state/inbox.jsonl` / `_state/outbox.jsonl` — the
  sole-writer invariant holds; the spawner does the channel write.
- **Deliverable:** the task's result, with the correctness-check evidence when state was mutated.
  Returned to the spawner.
