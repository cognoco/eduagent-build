# Full Codebase Review

  15 reviewers in parallel — each owns review AND fix within their lens. Same dispatch pattern as
  parallel-code-review but expanded scope (entire repo, not branch diff) and broader lens coverage.

  Core principle: fifteen lenses across a large codebase catch systemic patterns one reviewer cannot;
  each agent owns the fix loop within its lens; the coordinator owns scope partitioning, synthesis,
  verification, and check-in. Nothing leaves the working tree.

  When to Trigger

  - User asks for a "full codebase review", "audit the repo", "deep review", "harden the whole codebase"
  - Pre-launch readiness pass
  - After major version, large refactor, or before a high-stakes release
  - User says "find everything wrong" or wants a comprehensive health check
  - Inheriting a codebase or evaluating one before a big bet

  Hard Constraints

  1. Stage but never commit. No pushes, no PRs. Subagents `git add` each file as they save it —
  staging locks the change in the index so concurrent watchers (Codex, VS Code autosave) and parallel
  agents can't silently revert it. Subagents do NOT run `git commit`, `git push`, or `/commit`. The
  coordinator owns the single handoff to `/commit` at the end (or the user decides).
  2. Other agents may be active in the same tree. Before any edit, snapshot WIP (`git status --short`)
  and pass that list to every subagent. Files with uncommitted changes from other sessions are
  off-limits — subagents skip them and report them as deferred.
  3. Lens-partitioned write fan-out. Each subagent owns review AND fix within its lens. The coordinator
  partitions the 15 lenses across disjoint file globs in Step 1 so two agents never write to the same
  file. If a finding crosses lens boundaries, the agent reports it as "cross-lens" and the coordinator
  handles it in Step 4.
  4. Model selection per lens — Sonnet for mechanical / pattern-matching / low-risk fixes; Opus for
  reasoning-heavy / security / architecture / data-integrity / LLM-surface lenses. See the lens table
  in Step 2 for the per-lens assignment. The coordinator itself runs on Opus for synthesis and
  cross-lens decisions.
  5. Scope is the entire repo, not a diff. Reviewers walk their assigned area exhaustively — globs,
  greps, directory reads — not just recent changes.
  6. Fix scope per agent: Critical + High only by default. Each agent fixes Critical/High in its lens,
  writes Medium/Low to its report as a backlog list. This keeps the fix volume sane and the
  coordinator's verification pass tractable.

  Workflow

  Step 1 — Enumerate scope (coordinator)

  Capture the full repo surface so fan-out is exhaustive, not random:

  git branch --show-current
  git rev-parse HEAD
  git status --short                              # snapshot WIP from other agents (off-limits)
  git ls-files | wc -l                            # total tracked files
  git ls-files | awk -F/ '{print $1"/"$2}' | sort -u  # top-level area map

  Save the WIP file list — those files must be passed to every subagent as off-limits.

  Build a top-level area map (e.g. apps/api/src/routes, apps/api/src/services, apps/mobile/src/app,
  packages/schemas, etc.) so each reviewer's lens is paired with concrete file/glob targets, not vague
  instructions.

  **Partition file ownership across lenses.** Two agents writing the same file in parallel will lose
  one set of edits. Before dispatch, assign each lens a disjoint set of globs. Where a lens is
  conceptually cross-cutting (e.g. lens 11 observability touches everything), narrow it to "audit
  everywhere, but only fix in [specific dirs]; cross-cutting fixes report as cross-lens for coordinator
  to apply in Step 4."

  Step 2 — Partition into 15 review lenses

  Spawn 15 subagents in a single message (parallel tool calls). Each gets a distinct lens so coverage is
  guaranteed without overlap-thrash. Each reviewer walks their assigned files exhaustively AND fixes
  Critical/High findings in their lens.

  **Model assignment** — Sonnet for mechanical/pattern-matching/low-risk, Opus for reasoning-heavy /
  high-blast-radius / security / data-integrity / architecture / LLM-surface lenses.

  | # | Lens | Model | Why this model |
  |---|------|-------|----------------|
  | 1 | Correctness & logic — control flow, edge cases, off-by-one, null/undefined, async ordering, race conditions, unhandled promise rejections | **Opus** | Reasoning over control flow + async ordering; bugs subtle |
  | 2 | Security — authn/authz — Clerk gating, route protection, role checks, isOwner gating, JWT validation | **Opus** | Security fixes need break-tests + high blast radius |
  | 3 | Data integrity & scoping — profileId enforcement, scoped repository usage, parent-chain joins, cross-account leak vectors | **Opus** | Cross-account leak class; parent-chain reasoning |
  | 4 | Test quality & coverage — assertions match real behavior, no internal mocks (GC1/GC6), break-tests for security fixes, missing negative paths, brittle vs robust selectors | **Sonnet** | Pattern-matching: grep `jest.mock`, assertion shape |
  | 5 | Architecture & conventions — package boundaries, route/service split (G1/G5), schema contract usage, repo rules in CLAUDE.md, default-export discipline | **Opus** | Cross-package reasoning + judgment on rule fit |
  | 6 | UX & failure modes — dead-end states, error classification at API boundary, recovery paths, loading/empty/error triads, retry affordances (per ux-dead-end-audit) | **Opus** | Flow-level reasoning; recovery design |
  | 7 | Performance & hot paths — N+1 queries, missing indexes, unbounded loops, large list rendering, unnecessary re-renders, bundle-size regressions | **Sonnet** | Pattern detection: greppable shapes |
  | 8 | Schema contract & API types — @eduagent/schemas as source of truth, no local redefinition of API types, Zod validation completeness, response shape coverage | **Sonnet** | Mechanical: type/schema drift detection |
  | 9 | Background jobs & Inngest — durable async correctness, safeSend vs core inngest.send, step idempotency, retry/backoff, dead-letter handling | **Opus** | Idempotency + retry reasoning is high-risk |
  | 10 | Database & migration safety — destructive migration review, rollback sections, push vs migrate discipline, transaction boundaries, neon-serverless gotchas | **Opus** | Destructive/irreversible; rollback judgment |
  | 11 | Error handling & observability — silent recovery without escalation, Sentry breadcrumbs, structured metrics, log levels, audit log coverage for sensitive ops | **Sonnet** | Pattern-matching: silent `catch`, missing emits |
  | 12 | Accessibility & i18n — testID coverage for E2E, screen-reader labels, contrast, locale completeness across 7 languages, hardcoded English strings | **Sonnet** | Mechanical: greppable hardcoded strings, missing testIDs |
  | 13 | Dependencies & supply chain — outdated/abandoned packages, security advisories, duplicate transitive deps, root vs workspace package placement (NativeWind trap) | **Sonnet** | Mechanical: pnpm-list / audit output parsing |
  | 14 | Configuration & secrets — Doppler usage vs raw process.env (G4), typed config object, hardcoded URLs/keys, env var leakage to client bundles | **Sonnet** | Pattern-matching: greppable `process.env`, hardcoded URLs |
  | 15 | LLM / AI surface — envelope discipline (no [MARKER] tokens or bare JSON), hard caps on signal-driven flows, prompt injection vectors, hallucination guards, eval harness coverage | **Opus** | Hallucination + injection reasoning; high product risk |

  Each subagent gets:
  - The repo root path and their lens-specific **owned-write** file globs (disjoint per Step 1)
  - The WIP-from-other-agents file list (off-limits — skip and report)
  - The lens brief plus a self-contained context dump (CLAUDE.md rules relevant to their lens, key
  file patterns to look for)
  - **Fix instructions**: review exhaustively → fix Critical + High within owned-write globs → stage
  each edited file with `git add <path>` immediately on save → write break-tests for security/correctness
  fixes (per feedback_fix_verification_rules) → sweep sibling sites per CLAUDE.md "Sweep when you fix"
  if 3+ same-pattern findings in lens
  - **Never**: run `git commit`, `git push`, `/commit`, or any commit skill. Never edit files outside
  owned-write globs. Never edit WIP-from-other-agents files.
  - Severity classification per finding: Critical / High / Medium / Low
  - File + line for every finding
  - Output: report covers (a) Critical/High **fixed** with file:line + change summary + verification
  evidence, (b) cross-lens findings escalated to coordinator, (c) Medium/Low backlog list (top 20),
  (d) skipped WIP files

  Use the template at superpowers:requesting-code-review/code-reviewer.md as the base prompt — adapt the
  description for each lens and add the fix-loop instructions above.

  Step 3 — Synthesize agent reports (coordinator)

  When all 15 return:
  1. Audit each agent's fixes — open the diff for every file the agent reported as fixed (`git diff
  --staged -- <file>`). Confirm the change matches the finding and CLAUDE.md rules. Agents can
  hallucinate or over-edit.
  2. Deduplicate cross-lens findings — multiple lenses may have flagged the same Critical from
  different angles. If both agents fixed the same line, one diff wins — read both and pick.
  3. Resolve conflicts — if two agents touched the same file (shouldn't happen if Step 1 partitioned
  correctly, but verify), read the combined diff and decide what stays.
  4. Verify escalated cross-lens findings — these are the ones agents flagged but didn't fix.
  Coordinator opens the file, confirms the issue, applies the fix.
  5. Cluster un-swept patterns — if 3+ agents reported the same drift across different lenses
  (e.g. silent `catch` blocks in 5 dirs), the per-lens sweep didn't cover the cross-cutting pattern.
  Coordinator runs the cross-cutting sweep or installs a forward-only guard.
  6. Build the finding table — columns: ID | Severity | Lens | File:Line | Description | Owner (agent N
  / coordinator) | Status (fixed / swept / deferred-with-ticket / dismissed-with-reason)

  Step 4 — Coordinator fix pass (cross-lens + escalations only)

  Agents have already fixed Critical/High within their lens. The coordinator handles only:
  - Cross-lens findings agents escalated
  - Cross-cutting sweeps that span multiple lens boundaries
  - Conflicts where two agents edited the same area
  - Any Critical/High the audit in Step 3 found agents fixed incorrectly (revert + reapply)

  For each coordinator fix:
  - Confirm the file is not in the WIP-from-other-agents set captured in Step 1
  - Apply the fix
  - `git add <path>` immediately
  - If it's a security/correctness fix, write a break-test per feedback_fix_verification_rules (write
  test, watch it pass, revert fix, watch it fail, restore)
  - Mark the row done in the table with the actual change made

  Scope discipline: each agent already capped at Critical + High in its lens. Coordinator does the same
  for escalations. Medium/Low across all lenses goes to a written backlog the user can triage. Do not
  try to land everything.

  Step 5 — Verify before declaring done (coordinator-owned)

  Agents may have reported their own surgical-test runs in Step 2, but per
  feedback_subagent_reports_are_intent_not_evidence, the coordinator owes the user a real verification
  pass over the *combined* working tree — not a sum of agent claims.

  Per superpowers:verification-before-completion:
  - Run `pnpm exec nx run-many -t typecheck` (or scoped equivalents) on every package touched
  - Run surgical tests for the full set of files touched across all agents
  - For test changes, run them and show the green output — never ship test edits without an actual run
  (per feedback_never_ship_tests_without_running)
  - For DB / auth / scoping / Inngest changes, run the relevant integration tests (hooks skip
  `.integration.test.`)
  - `git status` — confirm only intended files are modified; no other-agent WIP got clobbered
  - `git diff --stat --staged` — sanity-check the volume of changes per file matches what agents
  reported. A 500-line diff for a "fixed one null check" finding is a red flag — open and re-audit.

  Step 6 — Report

  Do not commit. End with a structured summary:
  - Critical/High fixed: [count, with finding IDs, owner = agent N or coordinator]
  - Sweeps applied: [count, with pattern descriptions and which agent ran each]
  - Cross-lens fixes by coordinator: [count, with finding IDs]
  - Medium/Low deferred: [count, written to a backlog file or inline list]
  - Files modified: [list, grouped by owning agent]
  - Verification run: [commands + outcomes]
  - Other-agent WIP preserved: [list of skipped files]

  Final line: "Working tree has fixes for findings [IDs]. Run /commit when ready."

  Red Flags

  - "Agent N said it committed the fix" → Agents never commit. If you see this in a report, audit
  immediately — the agent either misreported or violated the protocol.
  - "I'll commit the obvious wins as I go" → No. Single handoff to /commit at the end.
  - "Two agents both edited apps/api/src/middleware/auth.ts" → Step 1 partitioning failed. Stop the
  audit, read both diffs, resolve before continuing.
  - "This file has another agent's WIP but the fix is small" → Stop. Skip and report.
  - "All 15 reviewers flagged X so it must be a bug" → Still verify against actual code. Reviewers
  share blind spots; a confident chorus can be wrong.
  - "I'll fix all 200 findings in one pass" → No. Critical + High this pass; Medium/Low to backlog.
  Big fix lists land badly.
  - "Tests pass so we're done" → Per feedback_never_loosen_tests_to_pass, confirm tests actually
  exercise the fix; for security fixes the break-test is non-optional. Per
  feedback_subagent_reports_are_intent_not_evidence, agent-reported test runs don't count as
  coordinator verification.
  - "Reviewer N said the architecture is fine, skip lens 5" → Each lens runs independently; don't let
  one reviewer's confidence suppress another's investigation.
  - "Lens 11 and lens 6 overlap, merge them" → No. Keep 15 distinct lenses. Overlap at synthesis time
  is cheap; collapsing lenses upfront loses coverage.
  - "Lens 2 is mechanical, run it on Sonnet" → No. Security/data-integrity/architecture/LLM lenses are
  Opus regardless of how greppable the surface looks; the cost of a missed finding outweighs the model
  delta.