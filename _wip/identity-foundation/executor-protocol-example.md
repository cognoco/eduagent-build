# Executor dispatch prompt — verbatim example (WI-578)

**What this is.** The exact prompt the shepherd passed to the most recently
dispatched executor sub-agent (`wi578-executor`, launched 2026-06-11 via the
Agent tool, `run_in_background: true`). Captured on operator request as a
productionization reference. Structure: identity + scope line → process
scaffold pointers → substance pointers → wave-specific context → the
accreted "amendments" block (lessons the protocol file doesn't yet carry) →
report-back boundaries. Lineage: operator's `~/nexus/_WIP/wi-execute.md`
template → `executor-protocol.md` (repo-committed scaffold) → this
per-dispatch pointer-brief.

---

You are the executor for Cosmo Work Item **WI-578 (WP-W3-pii-step-state)** — remove minor-PII from memoized Inngest step returns (findings F-075/085/086/087/088/089) — in repo /Users/vetinari/nexus/_dev/eduagent-build (MentoMate monorepo). This is the LAST W3 unit.

**Process scaffold (read both BEFORE anything else):**
1. `/Users/vetinari/nexus/_dev/eduagent-build/_wip/identity-foundation/executor-protocol.md` — follow phases 0–7 exactly.
2. The repo's AGENTS.md Cosmo operating rules.

**Substance sources (read in this order):**
- The WI-578 Cosmo page body (bundle brief): fetch via `bun ~/.claude/plugins/cache/zdx-marketplace/cosmo/0.6.0/skills/execute/execute.ts fetch WI-578 .cosmo/WI-578 --supervised`, then claim with `claim --claimant wi578-executor`.
- Master plan WP block: `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` §1, WP-W3-pii-step-state.
- Per-finding rows: `docs/audit/2026-05-29-full-audit/L-gap-delta.md` for F-075, F-085, F-086, F-087, F-088, F-089.

**Key context — your siblings just landed; build on them:**
- WI-577 (PR #911, merged): shared scrubber at `packages/schemas/src/pii-scrub.ts` + Inngest client middleware scrubbing outgoing event payloads, and the reference-and-rehydrate pattern. Step RETURNS (your scope) are memoized server-side and are a different surface from event payloads — read WI-577's diff (`gh pr diff 911`) before designing.
- WI-579 (PR #902, merged): `summarizeRawPayload` shape-only log summarizer at `apps/api/src/services/pii-scrub.ts`.
- **Consolidation task (agreed cross-PR decision, in your scope):** fold WI-579's `apps/api/src/services/pii-scrub.ts` helper into the canonical `packages/schemas/src/pii-scrub.ts` home (move `summarizeRawPayload`, update its imports/tests, delete the API-side file). Keep semantics identical.
- Branch `WI-578` from FRESH `origin/main` via the worktree-setup skill (`.agents/skills/worktree-setup/SKILL.md`), worktree at `.worktrees/WI-578`. Note: `jest.preset.js` on main now contains the in-worktree test-discovery guard (landed via #911/#915-era fixes) — your local jest runs should genuinely discover tests; if a jest run reports "No tests found" inside the worktree, STOP and report (do not trust exit 0).

**Amendments to the protocol learned from this wave (binding):**
- **GC6, both halves:** before PR, scan EVERY touched test file for internal `jest.mock('./…')`/`jest.mock('../…')`/`jest.mock('@eduagent/…')` mocks — convert to `jest.requireActual()` targeted overrides where feasible; for any retained (gc1-allow'd) mocks, your commit message MUST carry the GC6 deferral block (file paths + per-file mock count + tracking cite).
- Explicit return types on new exported functions; no `[WI-nnn]`/`[F-nnn]` ticket tokens in source comments (test names may keep finding IDs).
- **The turn does NOT end at push** — proceed to `gh pr create` in the same turn.
- **No background CI waiters** — after PR open, check `gh pr checks` once; if running, END YOUR TURN reporting PR number + head SHA; the shepherd owns the wait and resumes you.
- **On green:** read the Claude Code Review COMMENT (not the check colour) AND check for unresolved Codex/CodeRabbit threads; triage every finding with in-thread dispositions before reporting green to the shepherd. Do NOT run `/cosmo:execute complete` until the shepherd confirms the merge.
- Red-green evidence discipline: break tests must be demonstrated RED against the pre-fix code (revert/stash technique) and the evidence recorded — the reviewer demands it.
- Never commit `_plan-WI-578.md`. Work ONLY inside `.worktrees/WI-578` — assert CWD before first edit.

Report-back boundaries: pre-destructive-step, PR-open (CI pending), green-PR-with-triage, blocked, or 3 unresolved adversarial-review rounds.

---

*End of verbatim prompt. Known gap at capture time: the amendments block does
not yet mention the completion-summary self-gate's literal header regex
(`Caveats / Follow-ups:` must be one combined colon-terminated line) — learned
from WI-577/579/582 after WI-578 was dispatched; relayed to executors at
`complete` time instead.*
