# Testing the nx-monorepo-generator Skill PoC

## Purpose

This document explains how to test the `nx-monorepo-generator` skill to validate whether the skill-based approach provides value over the current documentation-based memory system.

## Success Criteria

The PoC is successful if:
- ✅ **Auto-activation**: Claude Code suggests using the skill without explicit prompting when you mention Jest/testing setup
- ✅ **Correct workflow**: Agent follows all phases (pre-generation, generation, post-generation) systematically
- ✅ **Pattern adherence**: Agent applies ALL mandatory post-generation fixes based on project type
- ✅ **Zero manual prompting**: Agent completes the entire workflow without needing reminders to "read the checklist" or "fix moduleResolution"
- ✅ **Better than docs**: Less cognitive overhead than manually reading adopted-patterns.md and post-generation-checklist.md

## Testing Approach

### Test 1: UI Project (Full Testing Stack)

**Scenario**: Add Jest to a new web application component library

**Steps**:
1. Generate a new library:
   ```bash
   pnpm exec nx g @nx/react:lib test-ui-lib --directory=packages/test-ui-lib
   ```

2. Ask Claude Code:
   ```
   I need to add Jest testing to the test-ui-lib package.
   ```

3. **Observe**:
   - Does Claude Code suggest using `nx-monorepo-generator` skill?
   - Does it correctly identify this as a UI project?
   - Does it install all three testing enhancements (jest-dom, user-event, msw)?
   - Does it create `jest.setup.ts`?
   - Does it update `jest.config.ts` with `setupFilesAfterEnv`?
   - Does it fix TypeScript moduleResolution to `nodenext`?
   - Does it validate with `nx run test-ui-lib:test`?

4. **Validation commands**:
   ```bash
   # Check moduleResolution
   grep -A 5 "compilerOptions" packages/test-ui-lib/tsconfig.spec.json

   # Check jest.config.ts
   grep "setupFilesAfterEnv" packages/test-ui-lib/jest.config.ts

   # Check dependencies
   grep -E "(jest-dom|user-event|msw)" packages/test-ui-lib/package.json

   # Run tests
   pnpm exec nx run test-ui-lib:test
   ```

5. **Cleanup**:
   ```bash
   pnpm exec nx g @nx/workspace:remove test-ui-lib
   ```

### Test 2: Logic Package (No Enhancements)

**Scenario**: Add Jest to a utility library that doesn't need testing enhancements

**Steps**:
1. Generate a new logic library:
   ```bash
   pnpm exec nx g @nx/js:lib test-logic-lib --directory=packages/test-logic-lib
   ```

2. Ask Claude Code:
   ```
   Add Jest testing to test-logic-lib. This is a pure utility library with no UI components.
   ```

3. **Observe**:
   - Does Claude Code correctly identify this as a Logic project?
   - Does it skip installing testing enhancements?
   - Does it skip creating jest.setup.ts?
   - Does it still fix TypeScript moduleResolution?
   - Does it validate configuration?

4. **Validation commands**:
   ```bash
   # Verify no testing enhancements installed
   cat packages/test-logic-lib/package.json | grep -E "(jest-dom|user-event|msw)" || echo "✅ No enhancements (correct)"

   # Verify no jest.setup.ts
   [ ! -f packages/test-logic-lib/jest.setup.ts ] && echo "✅ No setup file (correct)"

   # Check moduleResolution was still fixed
   grep "nodenext" packages/test-logic-lib/tsconfig.spec.json

   # Run tests
   pnpm exec nx run test-logic-lib:test
   ```

5. **Cleanup**:
   ```bash
   pnpm exec nx g @nx/workspace:remove test-logic-lib
   ```

### Test 3: Node Project (Conditional MSW)

**Scenario**: Add Jest to a Node.js API server

**Steps**:
1. Use existing server project:
   ```bash
   # Server project already exists: apps/server
   ```

2. Ask Claude Code:
   ```
   I want to add more tests to the server app. How should the testing be configured?
   ```

3. **Observe**:
   - Does Claude Code recognize server as a Node project?
   - Does it recommend jest-dom but question whether MSW is needed?
   - Does it explain when MSW is appropriate for Node projects?
   - Does it verify existing Jest configuration follows patterns?

## Comparison Test: Skill vs Current Documentation

To truly validate the PoC, test the same scenario twice:

### Baseline Test (Current System)
1. Reset your context (start fresh conversation)
2. Generate test library
3. Ask: "Add Jest to this library"
4. Note:
   - How many prompts needed?
   - Did agent remember to read memory docs?
   - How many manual reminders needed?
   - Were all fixes applied correctly?

### Skill Test
1. Reset your context (start fresh conversation)
2. Generate test library
3. Ask: "Add Jest to this library"
4. Note:
   - Did skill auto-activate?
   - How many prompts needed?
   - Were all fixes applied correctly?
   - Cognitive overhead difference?

**Compare**: If skill test requires fewer prompts and produces better results, the PoC is successful.

## Edge Cases to Test

### Edge Case 1: User Runs Generator Themselves

**Scenario**: User already ran `nx g @nx/jest:configuration` before asking for help

Ask Claude Code:
```
I already ran `nx g @nx/jest:configuration my-lib` and now my tests aren't working. Can you help?
```

**Expected**: Agent should recognize this as post-generation troubleshooting and check all the standard fixes.

### Edge Case 2: Existing Jest Configuration

**Scenario**: Project already has Jest but needs validation

Ask Claude Code:
```
Can you check if my Jest configuration in packages/schemas follows the monorepo patterns?
```

**Expected**: Agent should use skill's reference material to validate existing configuration against patterns.

## Metrics for Success

Track these metrics during testing:

| Metric | Target |
|--------|--------|
| Auto-activation rate | >80% of relevant queries |
| Pattern adherence | 100% of mandatory fixes applied |
| Manual prompts needed | <2 per workflow |
| False negatives | 0 (skill should trigger when needed) |
| False positives | 0 (skill shouldn't trigger inappropriately) |
| Time to completion | <5 minutes per Jest setup |
| Configuration errors | 0 (tests pass on first try) |

## What to Do After Testing

### If Successful
- Document findings in docs/memories/tech-findings-log.md
- Consider expanding skill to cover other generators (nx g @nx/next:app, etc.)
- Create additional skills (nx-monorepo-testing for troubleshooting)
- Consider using symlinks to reduce duplication (if testing is successful)

### If Unsuccessful
- Document why it didn't help in tech-findings-log.md
- Keep current documentation-based system
- Delete `.claude/skills/` directory
- No harm done - current system remains intact

### If Mixed Results
- Identify which parts worked well
- Consider narrowing skill scope to just those parts
- Iterate on skill design based on findings

## Feedback Questions

After testing, answer these questions:

1. **Discoverability**: Did Claude Code suggest using the skill when appropriate?
2. **Completeness**: Were all necessary steps included in the workflow?
3. **Clarity**: Were the instructions clear and unambiguous?
4. **Accuracy**: Did following the skill produce correct configurations?
5. **Efficiency**: Was this faster/easier than reading memory docs?
6. **Maintenance**: How difficult will it be to keep skill updated?
7. **Value**: Does this justify the duplication with memory docs?

## Troubleshooting the Skill Itself

If the skill doesn't activate when expected:

1. **Check skill discovery**:
   ```bash
   ls .claude/skills/nx-monorepo-generator/
   ```

2. **Verify YAML frontmatter**:
   ```bash
   head -n 5 .claude/skills/nx-monorepo-generator/SKILL.md
   ```

3. **Check Claude Code skill listing**:
   - Type `/help` in Claude Code
   - Look for skill in available commands

4. **Force activation**:
   - Explicitly mention: "Use the nx-monorepo-generator skill"

5. **Check description clarity**:
   - Current: "Use when adding Jest testing configuration..."
   - May need to include more trigger keywords

## Next Steps

After completing all tests:

1. Summarize findings
2. Decide: Continue with skills approach or revert
3. If continuing: Plan next skills to create
4. If reverting: Document lessons learned
5. Update this document with actual test results

---

**Remember**: This is a PoC. The goal is learning, not perfection. Document everything you observe, whether positive or negative.
