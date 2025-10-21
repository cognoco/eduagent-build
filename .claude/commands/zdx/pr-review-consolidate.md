# PR Review Consolidation

Fetch, consolidate, and triage feedback from multiple PR review sources (CodeRabbit, Claude Code PR reviews, Cursor BugBot, Codex) and CI workflow results. Provides deduplicated, actionable issue reports with fix/no-fix recommendations based on impact assessment and additional context.

**Usage**: `/pr-review-consolidate <pr-number>` or `/pr-review-consolidate <pr-url>`

## Execution Strategy

You are the **PR Review Orchestrator Agent**. Your role is to:

1. **Parse PR identifier** - Extract PR number from argument (URL or number)
2. **Launch parallel data fetchers** - Simultaneously fetch PR reviews and CI status
3. **Consolidate and deduplicate** - Merge feedback from all sources, remove duplicates
4. **Filter to actionable items** - Remove positive/neutral feedback, keep only issues
5. **Triage by impact** - Categorize as Critical/High/Medium/Low
6. **Assess fix recommendations** - Provide unbiased fix/no-fix recommendations with rationale
7. **Present for user decision** - Interactive report with options to proceed

## Phase 1: Initialize and Parse Input

### Step 1.1: Validate PR Argument

The user will provide a PR identifier in one of these formats:
- Full URL: `https://github.com/owner/repo/pull/123`
- Short form: `#123`
- Number only: `123`

Extract the PR number and validate it exists:

```bash
# Parse and validate PR
gh pr view <pr-number> --json number,title,url,headRefName
```

If the PR doesn't exist, inform the user and exit.

### Step 1.2: Create Todo List

Use TodoWrite to create a todo list with these stages:

```
- Parse and validate PR identifier
- Fetch PR review comments (CodeRabbit, Claude, Cursor, Codex)
- Fetch CI workflow results and failures
- Consolidate and deduplicate issues
- Filter to actionable items only
- Triage issues by impact (Critical/High/Medium/Low)
- Assess fix/no-fix recommendations for each issue
- Present consolidated report to user
```

Mark the first item as "in_progress" initially.

### Step 1.3: Extract PR Context

Gather essential PR information:

```bash
# Get PR metadata
gh pr view <pr-number> --json number,title,author,headRefName,baseRefName,url,state,mergeable,isDraft

# Get branch name for CI lookup
branch_name=$(gh pr view <pr-number> --json headRefName -q .headRefName)
```

Mark "Parse and validate PR identifier" as completed.

## Phase 2: Launch Parallel Data Fetchers

Launch two sub-agents **in parallel** using a single message with 2 Task tool calls.

Mark both "Fetch PR review comments" and "Fetch CI workflow results" as "in_progress".

### Agent 1: PR Review Fetcher

**Prompt to send:**
```
You are the PR Review Fetcher Agent. Your task is to fetch all review comments and feedback from a GitHub pull request.

PR NUMBER: <pr-number>

COMMANDS TO RUN:

1. Get all reviews and review comments:
```bash
gh pr view <pr-number> --json reviews,comments,latestReviews
```

2. Get inline code review comments:
```bash
gh api repos/:owner/:repo/pulls/<pr-number>/comments
```

3. Get general PR comments:
```bash
gh api repos/:owner/:repo/issues/<pr-number>/comments
```

ANALYSIS REQUIREMENTS:

Parse the JSON output and extract:
- Review comments from CodeRabbit (author contains "coderabbitai" or similar)
- Review comments from Claude Code PR review workflow (check for bot indicators)
- Review comments from Cursor BugBot (author or patterns indicating Cursor)
- Review comments from Codex or other AI reviewers
- Human reviewer comments (for context)

For each comment, extract:
- Source: Which reviewer/bot (CodeRabbit, Claude PR Review, Cursor BugBot, Codex, Human)
- Type: Issue, suggestion, question, nitpick, praise
- Severity: If indicated (error, warning, info)
- File path: If inline comment
- Line number: If inline comment
- Message: The actual feedback text
- Category: Lint, test, type error, security, performance, style, architecture, etc.

FILTERING REQUIREMENTS:

Only include comments that are:
- Issues that need addressing (errors, warnings)
- Suggested changes or improvements
- Questions that require code changes to address

EXCLUDE:
- Praise or positive comments ("looks good", "nice work")
- Neutral observations without actionable items
- General discussion without specific change requests
- Acknowledged/resolved comments

REPORT FORMAT:

Return a structured JSON array with this schema:
```json
[
  {
    "id": "unique-id",
    "source": "CodeRabbit|Claude PR Review|Cursor BugBot|Codex|Human",
    "type": "issue|suggestion|question",
    "severity": "error|warning|info|null",
    "file": "path/to/file.ts or null",
    "line": 123 or null,
    "message": "The feedback message",
    "category": "lint|test|type|security|performance|style|architecture|other",
    "author": "username or bot name",
    "body": "full comment body for context"
  }
]
```

If there are no actionable comments, return an empty array: `[]`

Be thorough - parse all comment types and sources. Return ONLY the JSON array, no additional commentary.
```

### Agent 2: CI Workflow Fetcher

**Prompt to send:**
```
You are the CI Workflow Fetcher Agent. Your task is to fetch CI workflow results and failure details for a GitHub pull request.

PR NUMBER: <pr-number>
BRANCH NAME: <branch-name>

COMMANDS TO RUN:

1. Get PR check status:
```bash
gh pr checks <pr-number>
```

2. Get detailed check runs:
```bash
gh api repos/:owner/:repo/commits/<branch-name>/check-runs
```

3. Use Nx Cloud MCP tools to get rich CI context:
- Use `nx_cloud_pipeline_executions_search` with branches filter for this branch
- For any failed executions, use `nx_cloud_pipeline_executions_details` with the execution ID
- Use `nx_cloud_runs_search` filtered by the pipeline execution
- Use `nx_cloud_tasks_details` for failed tasks to get detailed error output

ANALYSIS REQUIREMENTS:

Extract all CI failures and errors:
- Failed GitHub Actions workflows
- Failed jobs within workflows
- Failed tests (from Nx Cloud task details)
- Build errors (from Nx Cloud task details)
- Lint errors (from Nx Cloud task details)
- Type check errors (from Nx Cloud task details)
- E2E test failures (from Nx Cloud task details)

For each failure, extract:
- Source: GitHub Actions, Nx Cloud, specific job/task name
- Type: test failure, build error, lint error, type error, e2e failure
- Severity: critical (blocks merge), high, medium, low
- File path: If available from error output
- Line number: If available from error output
- Message: Error message or failure reason
- Category: lint, test, type, build, e2e, deploy, other
- Full output: Complete error output for context (truncated if very long)

SEVERITY GUIDELINES:
- Critical: Build failures, blocking test failures, security issues
- High: Test failures, type errors that break compilation
- Medium: Lint errors, formatting issues
- Low: Warnings, non-blocking issues

REPORT FORMAT:

Return a structured JSON array with this schema:
```json
[
  {
    "id": "unique-id",
    "source": "GitHub Actions|Nx Cloud|specific-job-name",
    "type": "test-failure|build-error|lint-error|type-error|e2e-failure",
    "severity": "critical|high|medium|low",
    "file": "path/to/file.ts or null",
    "line": 123 or null,
    "message": "The error message",
    "category": "lint|test|type|build|e2e|deploy|other",
    "fullOutput": "Complete error output (truncated to 500 chars if needed)",
    "jobName": "Name of the CI job/task"
  }
]
```

If CI is passing with no errors, return an empty array: `[]`

Be thorough - use both GitHub API and Nx Cloud MCP tools for comprehensive CI analysis. Return ONLY the JSON array, no additional commentary.
```

## Phase 3: Wait for Sub-Agents and Process Results

Wait for both sub-agents to complete. As each returns:
1. Validate the JSON output
2. Store the results
3. Mark the corresponding todo item as "completed"

If either sub-agent fails:
- Note the failure in the todo
- Continue with available data
- Inform user of the limitation

## Phase 4: Consolidate and Deduplicate

Mark "Consolidate and deduplicate issues" as "in_progress".

### Step 4.1: Merge Issue Lists

Combine the two JSON arrays from both sub-agents into a single list.

### Step 4.2: Deduplicate Issues

Use Sequential Thinking MCP to reason through deduplication:

Identify duplicate issues that appear in both PR reviews and CI results. Strategy:
1. Exact matches: Same file + same line + similar message
2. Semantic matches: Same issue type + same category + same file (line may differ slightly)
3. Cross-source validation: CI failure confirms review comment

For each potential duplicate:
- Compare file paths (normalize paths)
- Compare line numbers (within 5 lines = likely same issue)
- Compare messages (use fuzzy matching, >80% similarity = duplicate)
- Compare categories (must match)

When consolidating duplicates:
- Keep the most detailed message
- Merge sources into an array
- Prioritize CI severity over review comment severity (CI is more objective)

Create a deduplicated list with a "sources" array for each issue:

```json
{
  "id": "unique-id",
  "sources": ["CodeRabbit", "GitHub Actions"],
  "type": "issue",
  "severity": "high",
  "file": "src/app.ts",
  "line": 45,
  "message": "Unused variable 'foo'",
  "category": "lint",
  "details": "Full context from all sources..."
}
```

### Step 4.3: Filter to Actionable Items

Mark "Filter to actionable items only" as "in_progress".

Remove any remaining items that are:
- Purely informational (no action needed)
- Positive feedback
- Resolved/acknowledged issues
- Duplicate information

Keep only items requiring a decision or action.

Mark both "Consolidate and deduplicate issues" and "Filter to actionable items" as "completed".

## Phase 5: Triage by Impact

Mark "Triage issues by impact" as "in_progress".

Use Sequential Thinking MCP to triage each issue using these criteria:

**CRITICAL:**
- Build failures (blocks deployment)
- Security vulnerabilities
- Breaking changes that prevent app from running
- Failed tests that cover core functionality
- Type errors that break compilation

**HIGH:**
- Failed tests (non-core but important)
- Performance issues with significant impact
- Accessibility violations
- Type errors that don't block compilation but indicate real bugs
- Architecture issues that affect maintainability

**MEDIUM:**
- Linting errors (non-auto-fixable)
- Code style inconsistencies
- Missing error handling
- Minor performance issues
- Documentation gaps in code

**LOW:**
- Auto-fixable linting issues
- Formatting issues
- Minor code style nitpicks
- Optional refactoring suggestions
- Non-critical documentation updates

Group issues by impact level:

```json
{
  "critical": [ /* issues */ ],
  "high": [ /* issues */ ],
  "medium": [ /* issues */ ],
  "low": [ /* issues */ ]
}
```

Mark "Triage issues by impact" as "completed".

## Phase 6: Assess Fix Recommendations

Mark "Assess fix/no-fix recommendations" as "in_progress".

For each issue, use Sequential Thinking MCP to provide an unbiased assessment:

Context to consider:
1. Is this a real bug or false positive?
2. What is the effort to fix? (quick vs complex)
3. Does fixing this align with project goals and timelines?
4. Are there valid reasons NOT to fix? (technical debt tradeoff, out of scope, etc.)
5. What are the consequences of NOT fixing?

If technical context is needed (e.g., library-specific patterns), use Context7 MCP to fetch relevant documentation.

Provide:
- Recommendation: FIX | DON'T FIX | DEFER
- Rationale: Clear explanation of why
- Estimated effort: Quick (< 30 min) | Medium (1-2 hours) | Complex (> 2 hours)
- Impact of not fixing: High | Medium | Low

Augment each issue with recommendations:

```json
{
  "id": "unique-id",
  "impact": "high",
  "recommendation": "FIX",
  "rationale": "This unused variable indicates dead code that confuses future developers. Quick fix with high clarity benefit.",
  "effort": "Quick (< 30 min)",
  "impactOfNotFixing": "Low"
}
```

Mark "Assess fix/no-fix recommendations" as "completed".

## Phase 7: Present Consolidated Report

Mark "Present consolidated report to user" as "in_progress".

Generate a comprehensive, interactive report:

```markdown
# PR Review Consolidation Report

**Pull Request**: #<pr-number> - <pr-title>
**Branch**: <branch-name>
**Author**: <author>
**Status**: <state> (<mergeable|conflicts>)

---

## Executive Summary

**Total Issues Found**: <total-count>
**Sources Analyzed**:
- PR Reviews: CodeRabbit (<count>), Claude PR Review (<count>), Cursor BugBot (<count>), Codex (<count>), Human (<count>)
- CI Workflows: GitHub Actions (<count> failures), Nx Cloud (<count> task failures)

**After deduplication**: <deduplicated-count> unique actionable issues

**Impact Distribution**:
- Critical: <count> issues
- High: <count> issues
- Medium: <count> issues
- Low: <count> issues

**Fix Recommendations**:
- Recommend fixing: <count> issues
- Recommend deferring: <count> issues
- Recommend not fixing: <count> issues

---

## Critical Issues (Must Address)

<for each critical issue>

### Issue <number>: <brief-title>

**Sources**: <source-list>
**Category**: <category>
**Location**: `<file>:<line>`

**Description**:
<message>

**Detailed Context**:
<full-details-from-all-sources>

**Assessment**:
- **Recommendation**: <FIX|DON'T FIX|DEFER>
- **Rationale**: <rationale>
- **Estimated Effort**: <effort>
- **Impact of Not Fixing**: <impact>

**Suggested Action**:
<specific-fix-guidance-or-command-if-applicable>

---

</for each>

## High Priority Issues (Should Address)

<same format as critical>

## Medium Priority Issues (Consider Addressing)

<same format, can be more concise>

## Low Priority Issues (Optional)

<same format, very concise>

---

## Recommendations Summary

### Issues to Fix Now (Before Merge)

1. <issue-reference> - <brief-description> - **Effort**: <effort>
2. ...

**Total estimated time**: <sum-of-efforts>

### Issues to Defer (Post-Merge or Future PR)

1. <issue-reference> - <brief-description> - **Reason**: <rationale>
2. ...

### Issues Not to Fix (With Justification)

1. <issue-reference> - <brief-description> - **Reason**: <rationale>
2. ...

---

## Quick Fixes Available

Some issues can be auto-fixed:

```bash
# Auto-fix formatting issues
pnpm run format:write

# Auto-fix linting issues
pnpm exec nx run-many -t lint --fix

# Re-run tests to verify fixes
pnpm exec nx run-many -t test
```

---

## Next Steps

Please review the assessments above and indicate your decisions:

1. **Accept all "Fix Now" recommendations** - I can proceed with implementing fixes
2. **Review specific issues** - Discuss particular assessments before proceeding
3. **Override recommendations** - Provide guidance on which issues to address differently
4. **Request more context** - Deep dive into specific issues

**What would you like to do?**
```

Mark "Present consolidated report to user" as "completed".

## Phase 8: Interactive Follow-Up

After presenting the report, await user input. Offer these options:

```
I can help you with:

1. **Implement fixes** - For issues marked "Fix Now", I can make the changes
2. **Deep dive** - Analyze specific issues in more detail with additional context
3. **Fetch documentation** - Use Context7 to get library-specific guidance for complex issues
4. **Update PR** - After fixes, update the PR with a commit
5. **Generate response** - Draft responses to reviewer comments explaining your decisions

What would you like to do next?
```

Based on user choice:
- If implementing fixes: Create a new todo list for fix tasks, proceed systematically
- If deep diving: Launch specialized sub-agents for specific issues
- If fetching docs: Use Context7 MCP to get relevant documentation
- If updating PR: Guide through commit and push process
- If generating response: Draft thoughtful, professional responses to reviewers

## Important Guidelines

### For the Orchestrator:

- **ALWAYS use Sequential Thinking MCP** for deduplication logic, triage decisions, and fix/no-fix assessments
- **ALWAYS launch parallel sub-agents** in a SINGLE message with multiple Task tool calls
- **USE TodoWrite** diligently to track all stages
- **BE UNBIASED** - It's perfectly acceptable to recommend NOT fixing issues if there's valid rationale
- **BE THOROUGH** - Don't rush the consolidation and deduplication stages
- **USE Context7 MCP** when technical documentation would inform fix recommendations
- **USE Nx Cloud MCP tools** extensively for rich CI analysis
- **BE SPECIFIC** in fix recommendations - provide exact commands, file paths, and guidance

### Sub-Agent Instructions:

- Sub-agents should focus ONLY on data gathering, not analysis
- Return ONLY structured JSON as specified
- Be thorough in fetching all available sources
- Handle errors gracefully (missing data, API failures)

### Quality Standards:

- Deduplication must be intelligent (not just exact string matching)
- Triage must be consistent and well-reasoned
- Fix recommendations must include clear rationale
- "Don't fix" recommendations are valuable and should be provided when appropriate
- Consider effort vs impact in all recommendations
- Respect the user's time - prioritize high-impact, low-effort fixes

### Error Handling:

- If GitHub CLI is not available, inform user and suggest installation
- If Nx Cloud MCP tools fail, fall back to GitHub Actions data only
- If PR doesn't exist or is not accessible, fail gracefully with clear message
- If sub-agents fail, continue with partial data and note limitations

## Success Criteria

A successful PR review consolidation means:

1. All review sources and CI results fetched completely
2. Issues intelligently deduplicated (no duplicates in final report)
3. All actionable items filtered (no noise from positive feedback)
4. Consistent, well-reasoned triage applied
5. Unbiased fix/no-fix recommendations with clear rationale
6. Comprehensive report that enables quick, informed decisions
7. User understands exactly what needs to be done and why
8. Interactive follow-up options provided

Execute this consolidation with precision, thoughtfulness, and respect for the user's decision-making authority. Your role is to provide clarity and recommendation, not to dictate actions.
