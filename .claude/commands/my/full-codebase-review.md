# Full Codebase Review

  15 reviewers in parallel, then fix critical findings locally. Same dispatch pattern as
  parallel-code-review but expanded scope (entire repo, not branch diff) and broader lens coverage.

  Core principle: fifteen lenses across a large codebase catch systemic patterns one reviewer cannot; the
  coordinator owns synthesis and fixes; nothing leaves the working tree.

  When to Trigger

  - User asks for a "full codebase review", "audit the repo", "deep review", "harden the whole codebase"
  - Pre-launch readiness pass
  - After major version, large refactor, or before a high-stakes release
  - User says "find everything wrong" or wants a comprehensive health check
  - Inheriting a codebase or evaluating one before a big bet

  Hard Constraints

  1. No commits, no pushes, no PRs. This skill produces a clean working tree of fixes. The user (or
  /commit) decides what to commit.
  2. Other agents may be active in the same tree. Before any edit, snapshot WIP (git status --short) and
  treat files with uncommitted changes from other sessions as off-limits. Note them in the report.
  3. Read-only fan-out. All 15 subagents are strictly read-only. Only the coordinator edits files.
  4. Use Sonnet for the 15 reviewers. Reserve Opus for the coordinator's synthesis and fixes. The reviewers
   are doing pattern-matching at scale; Sonnet is the right tool.
  5. Scope is the entire repo, not a diff. Reviewers walk their assigned area exhaustively — globs, greps,
  directory reads — not just recent changes.

  Workflow

  Step 1 — Enumerate scope (coordinator)

  Capture the full repo surface so fan-out is exhaustive, not random:

  git branch --show-current
  git rev-parse HEAD
  git status --short                              # snapshot WIP from other agents (off-limits)
  git ls-files | wc -l                            # total tracked files
  git ls-files | awk -F/ '{print $1"/"$2}' | sort -u  # top-level area map

  Save the WIP file list — those files are off-limits for editing in Step 4.

  Build a top-level area map (e.g. apps/api/src/routes, apps/api/src/services, apps/mobile/src/app,
  packages/schemas, etc.) so each reviewer's lens is paired with concrete file/glob targets, not vague
  instructions.

  Step 2 — Partition into 15 review lenses

  Spawn 15 subagents in a single message (parallel tool calls). Each gets a distinct lens so coverage is
  guaranteed without overlap-thrash. Each reviewer must walk their assigned files exhaustively.

  1. Correctness & logic — control flow, edge cases, off-by-one, null/undefined, async ordering, race
  conditions, unhandled promise rejections
  2. Security — authn/authz — Clerk gating, route protection, role checks, isOwner gating, JWT validation
  3. Data integrity & scoping — profileId enforcement, scoped repository usage, parent-chain joins,
  cross-account leak vectors
  4. Test quality & coverage — assertions match real behavior, no internal mocks (GC1/GC6), break-tests for
   security fixes, missing negative paths, brittle vs robust selectors
  5. Architecture & conventions — package boundaries, route/service split (G1/G5), schema contract usage,
  repo rules in CLAUDE.md, default-export discipline
  6. UX & failure modes — dead-end states, error classification at API boundary, recovery paths,
  loading/empty/error triads, retry affordances (per ux-dead-end-audit)
  7. Performance & hot paths — N+1 queries, missing indexes, unbounded loops, large list rendering,
  unnecessary re-renders, bundle-size regressions
  8. Schema contract & API types — @eduagent/schemas as source of truth, no local redefinition of API
  types, Zod validation completeness, response shape coverage
  9. Background jobs & Inngest — durable async correctness, safeSend vs core inngest.send, step
  idempotency, retry/backoff, dead-letter handling
  10. Database & migration safety — destructive migration review, rollback sections, push vs migrate
  discipline, transaction boundaries, neon-serverless gotchas
  11. Error handling & observability — silent recovery without escalation, Sentry breadcrumbs, structured
  metrics, log levels, audit log coverage for sensitive ops
  12. Accessibility & i18n — testID coverage for E2E, screen-reader labels, contrast, locale completeness
  across 7 languages, hardcoded English strings
  13. Dependencies & supply chain — outdated/abandoned packages, security advisories, duplicate transitive
  deps, root vs workspace package placement (NativeWind trap)
  14. Configuration & secrets — Doppler usage vs raw process.env (G4), typed config object, hardcoded
  URLs/keys, env var leakage to client bundles
  15. LLM / AI surface — envelope discipline (no [MARKER] tokens or bare JSON), hard caps on signal-driven
  flows, prompt injection vectors, hallucination guards, eval harness coverage

  Each subagent gets:
  - The repo root path and their lens-specific file globs (e.g. lens 2 gets apps/api/src/middleware/**,
  apps/api/src/routes/**)
  - The lens brief above plus a self-contained context dump (CLAUDE.md rules relevant to their lens, key
  file patterns to look for)
  - Strict instructions: read only, report findings, do not edit, do not commit, do not invoke /commit or
  any commit skill
  - Severity classification per finding: Critical / High / Medium / Low
  - File + line for every finding
  - Output cap: top 20 findings per reviewer, ranked by severity, to keep coordinator context manageable

  Use the template at superpowers:requesting-code-review/code-reviewer.md as the base prompt — adapt the
  description for each lens.

  Step 3 — Synthesize findings (coordinator)

  When all 15 return:
  1. Deduplicate — multiple reviewers often catch the same Critical from different angles; merge them with
  cross-lens citations
  2. Resolve conflicts — if two reviewers disagree, read the code and decide; cite file:line in the
  decision
  3. Verify each finding against actual code — reviewers can hallucinate or share blind spots. Open the
  file, confirm the issue exists, confirm the suggested fix is correct
  4. Cluster by pattern — if 3+ findings describe the same drift (e.g. five sites missing profileId check),
   promote to a sweep per CLAUDE.md "Sweep when you fix"
  5. Build the finding table — columns: ID | Severity | Lens | File:Line | Description | Decision (fix now
  / sweep / defer with ticket / dismiss-with-reason)

  Step 4 — Address findings (coordinator only)

  The coordinator owns the fix loop after collecting all agent findings. Agents report findings only; edits
   stay serialized under the coordinator's ownership.

  For each fix:
  - Confirm the file is not in the WIP-from-other-agents set captured in Step 1
  - Apply the fix
  - If it's a security/correctness fix, write a break-test per feedback_fix_verification_rules (write test,
   watch it pass, revert fix, watch it fail, restore)
  - If it's a drift fix with 3+ sibling sites, sweep them per CLAUDE.md "Sweep when you fix" — or install a
   forward-only guard test and document the deferred sweep
  - Mark the row done in the table with the actual change made

  Scope discipline at this volume: with 15 reviewers, findings will exceed what's reasonable to fix in one
  pass. Default to fixing Critical + High only; bundle Medium/Low into a written backlog the user can
  triage. Do not try to land everything.

  Step 5 — Verify before declaring done

  Per superpowers:verification-before-completion:
  - Run pnpm exec nx run-many -t typecheck (or scoped equivalents) on every package touched
  - Run surgical tests for any file you touched
  - For test changes, run them and show the green output — never ship test edits without an actual run (per
   feedback_never_ship_tests_without_running)
  - For DB / auth / scoping / Inngest changes, run the relevant integration tests (hooks skip
  .integration.test.)
  - git status — confirm only intended files are modified; no other-agent WIP got clobbered

  Step 6 — Report

  Do not commit. End with a structured summary:
  - Critical/High fixed in working tree: [count, with finding IDs]
  - Sweeps applied: [count, with pattern descriptions]
  - Medium/Low deferred: [count, written to a backlog file or inline list]
  - Files modified: [list]
  - Verification run: [commands + outcomes]
  - Other-agent WIP preserved: [list of skipped files]

  Final line: "Working tree has fixes for findings [IDs]. Run /commit when ready."

  Red Flags

  - "I'll commit the obvious wins as I go" → No. Single handoff to /commit at the end.
  - "This file has another agent's WIP but the fix is small" → Stop. Skip and report.
  - "All 15 reviewers flagged X so it must be a bug" → Still verify against actual code. Reviewers share
  blind spots; a confident chorus can be wrong.
  - "I'll fix all 200 findings in one pass" → No. Critical + High this pass; Medium/Low to backlog. Big fix
   lists land badly.
  - "Tests pass so we're done" → Per feedback_never_loosen_tests_to_pass, confirm tests actually exercise
  the fix; for security fixes the break-test is non-optional.
  - "Reviewer N said the architecture is fine, skip lens 5" → Each lens runs independently; don't let one
  reviewer's confidence suppress another's investigation.
  - "Lens 11 and lens 6 overlap, merge them" → No. Keep 15 distinct lenses. Overlap at synthesis time is
  cheap; collapsing lenses upfront loses coverage.