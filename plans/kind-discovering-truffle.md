# Claude Code Review Workflow Redesign

## Context

The current review workflow (`.github/workflows/claude-code-review.yml`) has three problems:
1. **Slow** (10-12 min) — vague prompt causes open-ended exploration
2. **Messy output** — no defined format, scattered inline + top-level comments
3. **Broken fallback status** — when token 1 fails but token 2 succeeds, the PR check still shows failed

The fix: extract a composite action (DRY), add a structured directive prompt (fast + clean), fix fallback logic (correct status), and add concurrency cancellation.

## Files

| Action | Path |
|--------|------|
| Create | `.github/actions/claude-review/action.yml` |
| Rewrite | `.github/workflows/claude-code-review.yml` |

## 1. Composite Action — `.github/actions/claude-review/action.yml`

Single input: `oauth_token` (secrets must be passed explicitly to composite actions). Everything else uses `github.*` context which is inherited.

Wraps `anthropics/claude-code-action@v1` with:
- **Structured 4-step prompt**: gather context → review against specific CLAUDE.md rules → respect DO-NOT-flag list → post single structured comment
- **`--max-turns 10`** — caps exploration, prevents runaway tool usage
- **Reduced tool allowlist** — drops `mcp__github_inline_comment__create_inline_comment` (single comment instead), keeps `Read`, `Grep`, `Glob`, `gh pr` commands
- **No `show_full_output`** — removes noisy log dumps

### Prompt design

**Step 1 — Gather** (directive, in order):
- `gh pr diff` for the diff
- `gh pr view` for PR description, commits, comments
- `Read CLAUDE.md` and `Read docs/project_context.md`
- Explicit instruction: "Do NOT explore beyond these files and the diff"

**Step 2 — Review** against specific named rules from CLAUDE.md:
- Architecture & contracts (schemas, services/, scoped repos, profileId)
- Async & LLM (Inngest, routeAndCall, structured envelope)
- Code quality guards (GC1, default exports, co-located tests, barrel imports, router.push chains)
- Security (OWASP surface: auth boundaries, profileId scoping, input validation, no secrets in events)
- Schema & deploy safety (rollback sections for destructive migrations)

**Step 3 — DO NOT flag** (prevents false positives, saves time):
- Patterns in CLAUDE.md "Known Exceptions" section
- Style/formatting (Prettier/ESLint handle it)
- Type errors (tsc handles it)
- Improvements beyond PR scope
- Pre-existing issues not changed in the diff

**Step 4 — Output** (strict single-comment format):

Verdicts: `APPROVED` | `APPROVED_WITH_ISSUES` | `CHANGES_REQUESTED` | `BLOCKED`
Severities: `MUST_FIX` | `SHOULD_FIX` | `CONSIDER`

Format: table per severity tier, metadata details block. Uses heredoc (`<< 'ENDREVIEW'`) to write to a temp file then `gh pr comment --body-file` — avoids all shell quoting issues with code snippets in the review.

Empty severity sections are omitted. Clean APPROVED gets a short-form comment.

### Tool allowlist

```
Read, Grep, Glob,
Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr checks:*)
```

Dropped: `mcp__github_inline_comment__create_inline_comment` (single structured comment replaces scattered inline comments — fewer API calls, cleaner output)

## 2. Workflow — `.github/workflows/claude-code-review.yml`

### New: Concurrency group
```yaml
concurrency:
  group: claude-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```
Prevents duplicate reviews on rapid pushes.

### Fixed: Fallback status logic

**Problem**: `continue-on-error: true` is on the job. When step 1 fails, the job outcome is `failure` — even if step 2 succeeds. The `failure()` function sees the job in failure state and the PR check shows failed.

**Fix**: Move `continue-on-error: true` to each individual review step. Add a final gate step.

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4
    with: { fetch-depth: 1 }

  - name: Review (token 1)
    id: review-1
    continue-on-error: true          # <-- on the step, not the job
    uses: ./.github/actions/claude-review
    with:
      oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

  - name: Review (token 2 — fallback)
    id: review-2
    if: steps.review-1.outcome == 'failure'    # <-- no failure() needed
    continue-on-error: true
    uses: ./.github/actions/claude-review
    with:
      oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN_2 }}

  - name: Review (token 3 — fallback)
    id: review-3
    if: steps.review-1.outcome == 'failure' && steps.review-2.outcome == 'failure'
    continue-on-error: true
    uses: ./.github/actions/claude-review
    with:
      oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN_3 }}

  - name: Verify review completed
    if: always()
    run: |
      if [[ "${{ steps.review-1.outcome }}" == "success" ]] || \
         [[ "${{ steps.review-2.outcome }}" == "success" ]] || \
         [[ "${{ steps.review-3.outcome }}" == "success" ]]; then
        echo "::notice::Review completed successfully"
      else
        echo "::warning::All review tokens exhausted — review skipped"
      fi
```

**Why this works**: With `continue-on-error` on each step, the step's `conclusion` is always `success` even when `outcome` is `failure`. The job never enters failure state. Fallback `if:` conditions check `outcome` directly (no `failure()` needed). The final gate step always runs (`if: always()`) and reports the aggregate result — but never fails the job, keeping the review advisory.

### Removed
- `show_full_output: true` — noisy logs, removed
- `mkdir -p "$HOME/.local/bin"` — unnecessary, the action handles its own install
- Job-level `continue-on-error: true` — replaced by step-level pattern above

### Kept
- `permissions: {}` at workflow level with specific job permissions (CR-794 least-privilege)
- `paths-ignore` patterns (skip doc-only changes)
- All four trigger types: `opened`, `synchronize`, `ready_for_review`, `reopened`

## 3. Design Decisions

**PR body NOT interpolated in prompt**: `github.event.pull_request.body` can contain backticks, `${{ }}`, YAML-breaking chars, and injection attempts. Claude fetches it via `gh pr view` instead.

**PR title IS interpolated**: Titles are single-line, low-risk. Provides immediate context.

**CLAUDE.md read at runtime, not inlined**: When rules change, the prompt doesn't need updating. Section headings in the prompt serve as documentation for human readers, not as lookup keys.

**Heredoc for comment output**: `cat > /tmp/review.md << 'ENDREVIEW'` with quoted delimiter prevents all shell expansion — no escaping issues with code snippets containing `$`, backticks, or single quotes.

## 4. Verification

1. **YAML lint**: `actionlint .github/workflows/claude-code-review.yml`
2. **Composite action resolves**: push branch, open PR — action resolves from PR HEAD
3. **Fallback status**: use invalid token for slot 1, verify slot 2 runs and job shows green
4. **Concurrency**: push twice rapidly, verify first run is cancelled
5. **Output format**: verify single structured comment, no inline comments, correct table format
6. **Turn count**: check logs — should complete in 3-6 turns (vs current 10+)
