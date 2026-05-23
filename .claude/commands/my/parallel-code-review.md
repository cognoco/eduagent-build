 # Parallel Code Review

  Five reviewers review in parallel, then they fix every finding locally. Built on the same dispatch pattern as
  `superpowers:requesting-code-review` but fan-out instead of single-shot, with a coordinator-owned fix loop afterward.

  **Core principle:** five lenses catch what one misses; the coordinator owns the fixes; nothing leaves the working tree.

  ## When to Trigger

  - User asks for a "branch review", "code review", "parallel review", or "thorough review before I look"
  - User says "review and fix" or "harden this branch"
  - After a multi-file change where a single reviewer would miss cross-cutting issues
  - Before the user does their own review pass — they want the obvious stuff handled first

  ## Hard Constraints

  1. **No commits, no pushes, no PRs.** This skill produces a clean working tree of fixes. The user (or `/commit`) decides
  what to commit.
  2. **Other agents may be active in the same tree.** Before any edit, check whether the file is part of the branch diff
  (`git diff --name-only $(git merge-base HEAD origin/main)..HEAD`). If a file you'd edit isn't in that set, it belongs to
  another agent's WIP — skip it and note it in the report.
  4. **Use Sonnet only for mechanical tasks and for simple change reviews.** Reserve Opus for the coordinator's synthesis and fixes.

  ## Workflow

  ### Step 1 — Enumerate scope (coordinator)

  Capture the branch surface in one place so the fan-out is exhaustive, not random:

  ```bash
  git branch --show-current
  BASE_SHA=$(git merge-base HEAD origin/main)
  HEAD_SHA=$(git rev-parse HEAD)
  git diff --name-only $BASE_SHA..$HEAD_SHA
  git diff --stat $BASE_SHA..$HEAD_SHA
  git status --short   # snapshot WIP from other agents

  Save the WIP file list — those files are off-limits for editing later.

  Step 2 — Partition into 5 review lenses

  Spawn 5 subagents in a single message (parallel tool calls). Each gets a distinct lens so coverage is guaranteed without
  overlap-thrash:

  1. Correctness & logic — control flow, edge cases, off-by-one, null/undefined, async ordering, error handling
  2. Security & data integrity — authn/authz, profileId scoping, input validation, secrets, injection, audit gaps
  3. Test quality & coverage — assertions match real behavior, no internal mocks, break-tests for security fixes, missing
  negative paths
  4. Architecture & conventions — repo rules in CLAUDE.md, package boundaries, route/service split, schema contract, naming
  5. UX & failure modes — dead-end states, error classification, recovery paths, loading states (per ux-dead-end-audit
  rules)

  Each subagent gets:
  - BASE_SHA, HEAD_SHA, file list for their lens (or "all changed files" if narrow scope)
  - The lens-specific brief
  - Strict instructions: read only, report findings, do not edit, do not commit
  - Severity classification per finding: Critical / High / Medium / Low
  - File + line for every finding

  Use the template at superpowers:requesting-code-review/code-reviewer.md as the base prompt — adapt the {DESCRIPTION} for
  each lens.

  Step 3 — Synthesize findings (coordinator)

  Process as the agents return, do not wait for all to be finished. 
  1. Deduplicate — multiple reviewers often catch the same Critical
  2. Resolve conflicts — if two reviewers disagree, read the code and decide; cite file:line in the decision
  3. Do checks of the reported findings, have deep related code understanding. 
 

  Step 4 — Address findings (coordinator only)

The coordinator owns the fix loop after collecting all agent findings.
Agents report findings only; edits stay serialized under the coordinator's ownership.

  For each fix:
  - Confirm the file is in the branch diff, not in the WIP-from-other-agents set
  - Apply the fix
  - If it's a security/correctness fix, write a break-test per feedback_fix_verification_rules
  - If it's a drift fix with 3+ sibling sites, sweep them per CLAUDE.md "Sweep when you fix"
  - Mark the row done in the table with the actual change made

  Step 5 — Verify before declaring done

  Per superpowers:verification-before-completion:
  - Run pnpm exec nx run-many -t typecheck (or scoped equivalent) on the affected package
  - Run surgical tests for any file you touched
  - For test changes, run them and show the green output — never ship test edits without an actual run
  - git status — confirm only branch-diff files are modified; no other-agent WIP got clobbered

  Step 6 — Report

  Do not commit. End with: "Working tree has fixes for findings A, B, C. Run /commit when ready."

  Red Flags

  - "I'll just commit the easy ones first" → No. Single handoff to /commit at the end.
  - "This file isn't in the diff but it's related" → Stop. It's another agent's WIP or out of scope. Note and skip.
  - "Five reviewers gave the same finding so it must be right" → Still verify against the actual code before fixing.
  Reviewers can share blind spots.
  - "Tests pass so we're done" → Per feedback_never_loosen_tests_to_pass, confirm the tests actually exercise the fix; for
  security fixes, the break-test is non-optional.
