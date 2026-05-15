# Dispatch — Parallel Agent Protocol

Fan out work to parallel sub-agents safely: planning (avoid file conflicts), the per-agent contract (test discipline + no commits), the coordinator's responsibilities (post-fan-out validation + docs + commit), and the safety limits.

**This is the canonical parallel-agent protocol for this repo.** Other test/bug skills (`/my:run-tests`, `/my:sweep-mocks`, `/my:fix-notion-bugs`, `/my:e2e`) call into here whenever they need parallel agents. Don't roll your own fan-out logic in those skills — extend this one.

## When to use it

- **Test fix loop with wide failure surface** — e.g., 12 failing API routes; one agent per route group. Coordinator drives `/my:run-tests`, fan-out goes through here.
- **Mock-cleanup sweep across many files** — `/my:sweep-mocks` against the inventory CSV, sliced by package/directory.
- **Notion bug batch** — `/my:fix-notion-bugs` on 3+ bugs with no file overlap.
- **Feature/epic implementation in independent tracks** — original use case (e.g., "FR52 + FR63 + FR92, parallelize").
- **Cross-package audit** — review N PRs or N screens for the same pattern.

If the work is sequential (one piece depends on the previous) or all touches the same file, **do not** fan out. Run it in the main session.

## Arguments

`$ARGUMENTS` — what to parallelize. Can be:

- A list of work items ("FR52, FR63, FR92")
- A scope to split ("apps/api integration tests by route group")
- An epic / batch reference ("3 Notion bugs", "Epic 3 Cluster G")
- A failure list ("the 8 failing tests from the last `pnpm test:api` run")

## Planning phase (coordinator)

1. **Enumerate the full scope first.** Don't dispatch a guess — list every work item the user asked about, then split. (Cf. `coordinator-dispatch` superpower: the most common failure is under-coverage on round 1.)
2. **Slice into independent tracks.** Each track owns disjoint files. If two tracks would touch the same file, merge them or sequence them.
3. **Present the plan to the user** before dispatching:
   - Tracks (1, 2, 3…)
   - Files each track touches (paths, not just package names)
   - Sequential dependencies (if any)
   - Whether the slicing has any overlap risk you're tolerating

## Agent contract (EVERY sub-agent receives this verbatim)

```
MANDATORY RULES — read before writing any code:

1. Stay within your assigned track. Do not edit files outside it.
2. For test failures you encounter:
   - Real bug → fix the production code, never weaken the assertion.
   - Test drift → rewrite the assertion to match current real behavior (not a vaguer/optional check).
   - Env / infra → fix the env, do not edit the test.
   Full failure-loop discipline in /my:run-tests.
3. Do NOT add a new internal jest.mock('./...') / jest.mock('../...') / jest.mock('@eduagent/...').
   Use real implementations, the canonical jest.requireActual + targeted-override pattern, or
   one of the shared harnesses listed in /my:run-tests. External-boundary mocks (LLM via
   routeAndCall, Stripe, Clerk JWKS, push, email, Inngest framework) are allowed with bare specifiers.
4. If a test file you touch already has internal mocks, sweep them per GC6 in /my:run-tests
   before declaring that file done.
5. Run related tests for every file you modified:
   cd <project-dir> && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests <files> --no-coverage
6. Do NOT delete UI code. Comment it out if removing a feature.
7. Do NOT run git add, git commit, git push, eas update, or gh pr create.
   You write code, run tests, and REPORT BACK with: (a) files changed, (b) tests run + results,
   (c) anything you couldn't resolve. The coordinator commits.
8. Do NOT report done until ALL tests pass. If tests fail after 3 attempts, stop and report:
   - Which test(s) failed
   - The error message
   - What you tried
9. Follow all CLAUDE.md rules (strict TypeScript, named exports, co-located tests, no eslint-disable,
   no @ts-ignore, etc.)
```

## Post-dispatch validation (coordinator, before any commit)

**0. Documentation refresh.** Walk the doc-update block from `/my:run-tests`: regenerate the mock-cleanup inventory CSV if any agent touched a test file, update the inventory markdown counts, add new shared harnesses to the framework plan, update the e2e runbook troubleshooting matrix if any infra symptom was diagnosed, and update flow-revision-plan if any E2E flow status changed. Subagents won't have done this themselves — coordinator's job.

1. **Full typecheck:**
   ```bash
   pnpm exec tsc --noEmit
   ```
   Fix cross-track type conflicts before commit.

2. **Run tests across the combined changeset** (not just per-track) to catch integration issues between tracks.

3. **Read the diff for every file touched by 2+ tracks.** Worker self-reports can't catch silent reverts. If two tracks both touched a file, eyeball the result.

4. **Check for conflicts:**
   - Duplicate function/variable names
   - Conflicting imports
   - Schema export gaps (new types not re-exported from barrel)

5. **If E2E infrastructure is available** and the changes touch user-visible flows, run `/my:e2e` to verify the combined changes work end-to-end.

6. **Commit via `/commit`** with a summary listing each track.

## Safety limits

- **Max 3 parallel agents** in this monorepo — more than 3 increases file conflict risk.
- **Never dispatch two agents that modify the same package** — e.g., two agents both changing `@eduagent/schemas` will cause merge hell.
- **Sequential fallback** — if tracks can't be cleanly separated, run them one at a time in the main session. Slow but safe.
- **Use Sonnet for routine subagent work**; reserve Opus for deep reasoning.

## When an agent fails or goes silent

- Reports unresolved test failures → investigate the root cause yourself, fix it, re-run the affected tests.
- Didn't mention running tests → call it out and re-run tests for its changed files yourself.
- Silently reverted another track's changes → restore via `git diff` and reassign.
- Never merge an agent's work without confirmed passing tests.

## Update documentation after every run

See the post-dispatch validation step 0 above. If the run produced no doc-relevant changes (no mocks touched, no new harnesses, no E2E status flips, no Notion rows), say so explicitly in the coordinator's report. Silence is ambiguous.
