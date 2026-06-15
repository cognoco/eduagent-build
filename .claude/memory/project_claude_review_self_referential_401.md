---
name: claude-review-401-is-benign-on-prs-that-edit-the-claude-workflows
description: "A PR modifying .github/workflows/claude*.yml shows a RED claude-review (self-referential 401) that is benign and unavoidable — not token exhaustion, not a code defect. Confirm by rerun-after-merge or a scripts-only follow-up PR."
metadata: 
  node_type: memory
  type: project
  originSessionId: a7e8793e-41f9-42bf-8afe-c5f47c8f5d04
---

**Pattern:**

When a PR modifies the workflow file that invokes `claude-code-action` itself
(`.github/workflows/claude-code-review.yml` or `claude.yml`), the action returns
**401 "Workflow validation failed. The workflow file must exist and have identical
content to the version on the repository's default branch."** This is the action's
intrinsic **self-referential-workflow guard** — it refuses to run when the PR's
workflow differs from `main`. It is normal and unavoidable for any
workflow-hardening PR.

**The misleading symptom:** the downstream "Evaluate review verdict" step then emits
its generic catch-all — *"No Claude Code Review verdict marker found — review did not
run (token exhaustion / timeout / crash). Blocking."* That message is the SYMPTOM
(no verdict marker), **not** the root cause (the upstream 401). Don't read it as token
exhaustion.

**How to confirm it's benign (not a real failure):**
- **Rerun after merge:** once merged, the PR's workflow content == `main`, so re-running
  the claude-review run goes **GREEN/APPROVED** (`gh run rerun <id> --failed`).
- **Or split the change:** a follow-up PR that touches only non-workflow files (e.g.
  `scripts/`) does NOT trip the guard and claude-review runs green normally. (Proven on
  WI-736: PR #1165 edited the workflow → 401; the scripts-only rework PR #1176 → green.)

**Gate implication:** this is the ONE legitimate "red claude-review on merge" case — but
the call to merge anyway is **shepherd/operator-only**, never self-granted by an executor.
Diagnose the run verbatim first; never round a generic "tokens exhausted" line up to
"benign" without confirming the 401 root cause. See [[project_cosmo_shepherd_finalization]].
