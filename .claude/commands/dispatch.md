# Dispatch — Parallel Agent Teams with Enforced Testing

Dispatch sub-agents for parallel story/feature implementation with mandatory testing contracts. Each agent must validate its own work before reporting done.

## Arguments

$ARGUMENTS — Required: description of what to implement. Can be:
- A list of stories/features (e.g., "FR52 failed recall, FR63 needs-deepening, FR92 interleaved retrieval")
- A single large feature to break into parallel tracks
- An epic reference (e.g., "Epic 3 Cluster G stories")

## Dispatch Rules

### Planning Phase

1. **Analyze the work** and break it into independent tracks that can run in parallel without file conflicts.
2. **Identify shared files** — if two tracks modify the same file, they CANNOT be parallelized. Merge them into one track or run them sequentially.
3. **Present the plan** to the user before dispatching:
   - Which tracks will run in parallel
   - Which files each track will modify
   - Any sequential dependencies

### Agent Contract (EVERY sub-agent gets these rules)

Each sub-agent MUST receive this exact contract in its prompt:

```
MANDATORY RULES — read before writing any code:
1. Implement the feature across all necessary files.
2. Write unit tests covering the happy path and key edge cases.
3. Run related tests for every file you modified:
   cd <project-dir> && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests <files> --no-coverage
4. Do NOT add mocks to existing test files — use fixture data only.
5. Do NOT delete UI code — comment it out if removing a feature.
6. Do NOT report done until ALL tests pass.
7. If tests fail and you cannot fix them in 3 attempts, report the failure with:
   - Which test(s) failed
   - The error message
   - What you tried
8. Follow all CLAUDE.md rules (strict TypeScript, named exports, co-located tests, etc.)
9. Do NOT run git add, git commit, or git push. Do NOT use /commit.
   The coordinator will commit your work after you report back.
10. When reporting completion, list ALL files you created or modified
    (one per line, relative paths from repo root).
```

### Post-Dispatch Validation

After ALL agents complete:

1. **Run the full type checker:**
   ```bash
   pnpm exec tsc --noEmit
   ```
   Fix any cross-agent type conflicts.

2. **Run tests for all modified files** across the entire changeset (catches integration issues between tracks).

3. **Check for conflicts:**
   - Duplicate function/variable names
   - Conflicting imports
   - Schema export gaps (new types not re-exported from barrel)

4. **If E2E infrastructure is available**, run `/e2e` to verify the combined changes work end-to-end.

5. **Commit using `/commit`** — the coordinator commits all agent work. Options:
   - **Single commit** (default): use `/commit` once for all tracks combined.
   - **Per-track commits**: stage each agent's reported file list separately and commit with a track-specific message. Use this when tracks are logically independent features.
   
   Either way, only the coordinator touches git. Agents never commit.

### Safety Limits

- **Maximum 3 parallel agents** — more than 3 increases file conflict risk in this monorepo.
- **Never dispatch agents that modify the same package** — e.g., two agents both changing `@eduagent/schemas` will cause merge hell.
- **Sequential fallback** — if tracks can't be cleanly separated, run them one at a time. Slow but safe. This aligns with the project's preference for sequential agent execution when files overlap.

### When an Agent Fails

- If an agent reports test failures it couldn't fix: investigate the root cause yourself, fix it, then re-run the affected tests.
- If an agent silently skipped tests (didn't mention running them): call it out and re-run tests for its changed files.
- Never merge an agent's work without confirmed passing tests.
