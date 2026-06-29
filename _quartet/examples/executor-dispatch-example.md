# Example — a real executor dispatch brief (builder)

**What this is.** A verbatim, real dispatch prompt a shepherd passed to a **builder** executor
sub-agent (WI-578, launched via the Agent tool, `run_in_background: true`). Kept as a worked
reference for the brief *shape*. It is an **instance**, not a template — the specific WI, paths,
and amendments are historical; read it for structure, not content.

**Brief shape it illustrates:** identity + scope line → process-scaffold pointers → substance
pointers → wave-specific context → an "amendments" block (lessons the protocol didn't yet carry) →
report-back boundaries. The brief *points*; it does not re-derive process.

> **Sourcing + genericization.** This is a real instance from the **eduagent-build** dogfood. Two
> mechanical edits were applied so the folder stays portable: the repo root is abstracted to
> `<repo root>`, and the prompt's original lane `executor-protocol` citation is mapped to its current
> home — the builder type doc `roles/executor/builder.md` (plus the shared layer
> `roles/executor/executor-protocol.md`). Otherwise the prompt is as-dispatched; read it for the
> brief *shape*, not the content.

---

You are the executor for Cosmo Work Item **WI-578 (WP-W3-pii-step-state)** — remove minor-PII from memoized Inngest step returns (findings F-075/085/086/087/088/089) — in repo `<repo root>` (the monorepo). This is the LAST W3 unit.

**Process scaffold (read both BEFORE anything else):**
1. `roles/executor/builder.md` — follow phases 0–7 exactly. *(The verbatim prompt cited the lane's then-current `executor-protocol`; mapped here to its current home + shared layer `roles/executor/executor-protocol.md`.)*
2. The repo's AGENTS.md Cosmo operating rules.

**Substance sources (read in this order):**
- The WI-578 Cosmo page body (bundle brief): fetch via the cosmo execute skill, then claim with `claim --claimant wi578-executor`.
- Master plan WP block: the lane plan §1, WP-W3-pii-step-state.
- Per-finding rows: the audit gap-delta register for F-075, F-085, F-086, F-087, F-088, F-089.

**Key context — your siblings just landed; build on them:**
- WI-577 (PR #911, merged): shared scrubber + Inngest client middleware scrubbing outgoing event payloads, and the reference-and-rehydrate pattern. Step RETURNS (your scope) are memoized server-side and are a different surface from event payloads — read WI-577's diff before designing.
- WI-579 (PR #902, merged): shape-only log summarizer.
- **Consolidation task (agreed cross-PR decision, in your scope):** fold WI-579's helper into the canonical home, update imports/tests, delete the duplicate. Keep semantics identical.
- Branch `WI-578` from FRESH `origin/main` via the worktree-setup skill, worktree at `.worktrees/WI-578`. If a jest run reports "No tests found" inside the worktree, STOP and report (do not trust exit 0).

**Amendments to the protocol learned from this wave (binding):**
- **GC6, both halves:** before PR, scan EVERY touched test file for internal mocks — convert to `jest.requireActual()` targeted overrides where feasible; for any retained mocks, your commit message MUST carry the GC6 deferral block.
- Explicit return types on new exported functions; no ticket tokens in source comments (test names may keep finding IDs).
- **The turn does NOT end at push** — proceed to `gh pr create` in the same turn.
- **No background CI waiters** — after PR open, check `gh pr checks` once; if running, END YOUR TURN reporting PR number + head SHA; the shepherd owns the wait and resumes you.
- **On green:** read the automated review COMMENT (not the check colour) AND check for unresolved threads; triage every finding with in-thread dispositions before reporting green. Do NOT run `/cosmo:execute complete` until the shepherd confirms the merge.
- Red-green evidence discipline: break tests must be demonstrated RED against the pre-fix code and the evidence recorded — the reviewer demands it.
- Never commit the plan file. Work ONLY inside `.worktrees/WI-578` — assert CWD before first edit.

Report-back boundaries: pre-destructive-step, PR-open (CI pending), green-PR-with-triage, blocked, or 3 unresolved adversarial-review rounds.

---

*End of verbatim prompt. The lesson visible here: a real brief accretes wave-specific "amendments"
the protocol file doesn't yet carry — when an amendment generalizes (N=3), promote it into the
type doc rather than re-pasting it per dispatch.*
