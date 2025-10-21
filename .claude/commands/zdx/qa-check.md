# QA Validation Check

Run comprehensive quality assurance validation across the entire monorepo before committing changes. This command orchestrates specialized sub-agents to validate code quality in parallel, providing detailed reports and actionable recommendations.

## Execution Strategy

You are the **Orchestrator Agent**. Your role is to:

1. **Launch Parallel QA Agents** - Run 5 independent validation tasks simultaneously
2. **Monitor Progress** - Track each agent's execution using TodoWrite
3. **Run Dependent Tasks** - Execute E2E tests after builds complete
4. **Synthesize Reports** - Combine all agent outputs into a comprehensive summary
5. **Provide Recommendations** - Give actionable next steps based on results

## Phase 1: Initialize Todo Tracking

Create a todo list with the following items:
- Lint validation (ESLint)
- Test execution (Jest)
- Type checking (TypeScript)
- Format validation (Prettier)
- Build compilation (Nx)
- E2E tests (Playwright) - will run after builds

Mark all as "pending" initially.

## Phase 2: Launch Parallel QA Agents

Launch the following 5 agents **in parallel** using a single message with 5 Task tool calls. Each agent should receive the specialized prompt defined below.

### Agent 1: Lint Agent (ESLint Validation)

**Prompt to send:**
```
You are the Lint Validation Agent. Your specialized task is to validate code quality using ESLint.

COMMAND TO RUN:
nx run-many -t lint

EXECUTION INSTRUCTIONS:
1. Run the lint command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze the results for errors and warnings
4. Categorize issues by severity

ANALYSIS REQUIREMENTS:
- Identify which files have lint errors
- Categorize errors by ESLint rule (e.g., @typescript-eslint/no-unused-vars)
- Distinguish between errors (must fix) and warnings (should fix)
- Identify auto-fixable issues vs manual fixes required
- Provide file paths and line numbers for each issue

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total files checked: [number]
- Files with errors: [number]
- Total errors: [number]
- Total warnings: [number]
- Auto-fixable issues: [number]

**DETAILED FINDINGS** (if failures):
For each file with issues:
- File path
- Error/warning details with line numbers
- ESLint rule violated
- Whether auto-fixable

**FIX SUGGESTIONS**:
- Command to auto-fix: `pnpm exec nx run-many -t lint --fix`
- Manual fixes needed for non-auto-fixable issues
- Consider adding ESLint disable comments only if truly necessary

**CRITICAL ISSUES** (blockers that must be fixed before commit):
- List any errors that are blockers

Be concise but thorough. If linting passes, provide a brief success message.
```

### Agent 2: Test Agent (Jest Validation)

**Prompt to send:**
```
You are the Test Validation Agent. Your specialized task is to validate code correctness using Jest unit and integration tests.

COMMAND TO RUN:
nx run-many -t test

EXECUTION INSTRUCTIONS:
1. Run the test command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze test results for failures and coverage
4. Identify flaky or problematic tests

ANALYSIS REQUIREMENTS:
- Identify which test suites failed
- Extract specific test case failures with error messages
- Analyze stack traces to understand failure causes
- Check test coverage metrics if available
- Identify potential flaky tests (if any timeouts or intermittent issues)

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total test suites: [number]
- Passed suites: [number]
- Failed suites: [number]
- Total tests: [number]
- Passed tests: [number]
- Failed tests: [number]
- Coverage: [percentage if available]

**DETAILED FINDINGS** (if failures):
For each failed test:
- Test suite path
- Test case name
- Error message
- Stack trace (relevant portion)
- Likely cause of failure

**FIX SUGGESTIONS**:
- Specific suggestions for fixing failed tests
- Missing test cases or coverage gaps
- Potential improvements to test quality

**CRITICAL ISSUES** (blockers that must be fixed before commit):
- List any test failures that are blockers

Be concise but thorough. If all tests pass, provide a brief success message with coverage stats.
```

### Agent 3: Type Check Agent (TypeScript Validation)

**Prompt to send:**
```
You are the Type Check Validation Agent. Your specialized task is to validate TypeScript type safety.

COMMAND TO RUN:
nx run-many -t typecheck

EXECUTION INSTRUCTIONS:
1. Run the typecheck command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze TypeScript compiler errors
4. Categorize errors by type and severity

ANALYSIS REQUIREMENTS:
- Identify all TypeScript compilation errors
- Group errors by file
- Identify the specific TypeScript error codes (e.g., TS2322, TS2345)
- Distinguish between type errors, missing types, and inference issues
- Check for circular dependencies or module resolution issues

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total files checked: [number]
- Files with errors: [number]
- Total type errors: [number]

**DETAILED FINDINGS** (if failures):
For each file with errors:
- File path
- Line number
- Error code (e.g., TS2322)
- Error message
- Code snippet if helpful

**FIX SUGGESTIONS**:
- Specific type annotations needed
- Interface or type definition updates
- Generic constraints or type parameter fixes
- Common patterns to resolve the errors

**CRITICAL ISSUES** (blockers that must be fixed before commit):
- All TypeScript errors are blockers

Be concise but thorough. If type checking passes, provide a brief success message.
```

### Agent 4: Format Check Agent (Prettier Validation)

**Prompt to send:**
```
You are the Format Check Validation Agent. Your specialized task is to validate code formatting using Prettier.

COMMAND TO RUN:
nx run-many -t format:check

EXECUTION INSTRUCTIONS:
1. Run the format check command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze which files have formatting issues
4. Provide clear guidance on how to fix

ANALYSIS REQUIREMENTS:
- Identify all files with formatting issues
- Count total files that need formatting
- Extract file paths from Prettier output

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total files checked: [number]
- Files with formatting issues: [number]

**DETAILED FINDINGS** (if failures):
- List each file path that needs formatting
- Brief explanation that these files don't match Prettier config

**FIX SUGGESTIONS**:
- Auto-fix command: `pnpm run format:write`
- This will automatically format all files
- Recommend running the auto-fix and then reviewing changes

**CRITICAL ISSUES**:
- Formatting issues are HIGH priority but can be auto-fixed
- Should be fixed before commit

Be concise. If formatting passes, provide a brief success message.
```

### Agent 5: Build Agent (Compilation Validation)

**Prompt to send:**
```
You are the Build Validation Agent. Your specialized task is to validate that all projects build successfully.

COMMAND TO RUN:
nx run-many -t build

EXECUTION INSTRUCTIONS:
1. Run the build command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze build results for errors
4. Check for compilation issues, missing dependencies, or circular dependencies

ANALYSIS REQUIREMENTS:
- Identify which projects failed to build
- Extract specific build errors
- Check for module resolution issues
- Identify circular dependencies if any
- Look for missing dependencies or imports

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total projects: [number]
- Successfully built: [number]
- Failed builds: [number]
- Build time: [duration if available]

**DETAILED FINDINGS** (if failures):
For each failed build:
- Project name
- Error message
- File path if applicable
- Likely cause

**FIX SUGGESTIONS**:
- Specific fixes for build errors
- Missing import statements
- Dependency installation needs
- Configuration adjustments

**CRITICAL ISSUES** (blockers that must be fixed before commit):
- All build failures are critical blockers

Be concise but thorough. If all builds pass, provide a brief success message with build statistics.
```

## Phase 3: Monitor Parallel Agent Execution

After launching all 5 agents in parallel:
1. Update the todo list to mark all 5 agents as "in_progress"
2. Wait for all agents to complete
3. As each agent returns its report, mark the corresponding todo as "completed" or "failed"

## Phase 4: Run E2E Tests (Sequential)

After all parallel agents complete:

1. **Check if builds passed**: If the Build Agent reported failures, SKIP E2E tests (they depend on successful builds)

2. **Launch E2E Agent** if builds passed:

**Prompt to send:**
```
You are the E2E Test Validation Agent. Your specialized task is to validate end-to-end user flows using Playwright.

COMMAND TO RUN:
nx run-many -t e2e

EXECUTION INSTRUCTIONS:
1. Run the E2E test command using the Bash tool
2. Capture the full output (stdout and stderr)
3. Analyze test results for failures
4. Check for screenshots or trace files if failures occurred

ANALYSIS REQUIREMENTS:
- Identify which E2E test suites failed
- Extract specific test failures
- Look for UI-related issues (selectors, timeouts, assertions)
- Identify flaky tests if any
- Check for screenshots or test artifacts

REPORT FORMAT:
Return a structured report with the following sections:

**STATUS**: PASSED | FAILED

**SUMMARY**:
- Total E2E test suites: [number]
- Passed suites: [number]
- Failed suites: [number]
- Total tests: [number]
- Passed tests: [number]
- Failed tests: [number]

**DETAILED FINDINGS** (if failures):
For each failed test:
- Test suite path
- Test case name
- Error message
- Failure reason (timeout, assertion, selector not found, etc.)
- Screenshots available (if mentioned in output)

**FIX SUGGESTIONS**:
- Selector improvements (use data-testid, more robust selectors)
- Wait strategies (waitForSelector, waitForLoadState)
- Assertion adjustments
- Test stability improvements

**CRITICAL ISSUES** (blockers that must be fixed before commit):
- List critical E2E failures that block user flows

Be concise but thorough. If all E2E tests pass, provide a brief success message.
```

3. Mark the E2E todo as "in_progress" then "completed" when done

## Phase 5: Synthesize Comprehensive Report

After all agents complete, create a final comprehensive report:

### Executive Summary

Provide a high-level overview:
```
## QA Validation Results

✅ **PASSED** | ❌ **FAILED**

### Status by Domain:
- Lint (ESLint): [✅ PASSED | ❌ FAILED - X errors]
- Test (Jest): [✅ PASSED | ❌ FAILED - X failures]
- Type Check (TypeScript): [✅ PASSED | ❌ FAILED - X errors]
- Format (Prettier): [✅ PASSED | ❌ FAILED - X files]
- Build (Nx): [✅ PASSED | ❌ FAILED - X projects]
- E2E (Playwright): [✅ PASSED | ❌ FAILED - X tests | ⏭️ SKIPPED]

### Overall Assessment:
[Brief 1-2 sentence summary of overall quality state]
```

### Detailed Findings

For each domain that FAILED, include the detailed findings from that agent's report. Use clear headings:

```
### Lint Issues (ESLint)
[Agent's detailed findings]

### Test Failures (Jest)
[Agent's detailed findings]

### Type Errors (TypeScript)
[Agent's detailed findings]

### Formatting Issues (Prettier)
[Agent's detailed findings]

### Build Failures (Nx)
[Agent's detailed findings]

### E2E Test Failures (Playwright)
[Agent's detailed findings]
```

### Prioritized Action Items

Create a prioritized list of actions needed:

```
## Action Items

### Critical (Must Fix Before Commit):
1. [Issue from any agent marked as critical]
2. [Next critical issue]

### High Priority (Should Fix):
1. [Important but not blocking issues]

### Medium Priority (Consider Fixing):
1. [Warnings or suggestions]

### Quick Wins (Auto-fixable):
1. Run `pnpm run format:write` - Auto-fix all formatting issues
2. Run `pnpm exec nx run-many -t lint --fix` - Auto-fix linting issues
```

### Fix Commands

Provide specific commands to address issues:

```
## Recommended Fix Commands

# Auto-fix formatting issues
pnpm run format:write

# Auto-fix linting issues
pnpm exec nx run-many -t lint --fix

# Re-run failed tests in watch mode
pnpm exec nx run [project]:test --watch

# View detailed type errors
pnpm exec nx run [project]:typecheck

# Re-run QA check after fixes
/qa-check
```

## Phase 6: Interactive Follow-up

After presenting the report, offer interactive assistance:

```
## Next Steps

Would you like me to:
1. Auto-fix formatting and linting issues?
2. Show detailed context for specific errors?
3. Help fix specific test failures or type errors?
4. Create a summary for commit message documentation?

Let me know how I can help address these issues!
```

## Important Notes

### For the Orchestrator:
- **ALWAYS** launch parallel agents in a SINGLE message with multiple Task tool calls
- **NEVER** wait for agents sequentially if they're independent
- **USE** TodoWrite to track progress throughout execution
- **SYNTHESIZE** all reports into a coherent, actionable summary
- **BE SPECIFIC** in recommendations - provide exact commands and file references

### Execution Performance:
- Parallel execution should complete in ~60-120 seconds (time of longest task)
- Sequential execution would take ~5-7 minutes - avoid this!
- E2E tests may take longer (30-120 seconds) depending on suite size

### Error Handling:
- If an agent fails to launch, report this clearly
- If an agent times out, note this in the report
- Always provide partial results if some agents succeed

### Quality Standards:
- This is a "gold standard" template - be thorough
- Provide educational explanations, not just pass/fail
- Suggest best practices and improvements
- Be actionable - always include next steps

## Success Criteria

A successful QA check validation means:
1. All agents launched and completed successfully
2. Comprehensive report generated with clear status
3. Actionable recommendations provided
4. User knows exactly what to do next
5. Critical issues are clearly highlighted
6. Auto-fix options are offered where applicable

Execute this validation with precision and provide a report that demonstrates the gold standard quality this template aims to achieve.
