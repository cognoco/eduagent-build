---
description: Post consolidated review and fix report as PR comments after cleanup-create-pr has created the PR
argument-hint: (none — reads PR number and review artifacts)
---

# Cleanup Post Review Comments

*Project-local command — no global equivalent. Posts the consolidated review and fix report as GitHub PR comments after `cleanup-create-pr` has created the PR. This node exists because `cleanup-synthesize-review` and `cleanup-fix-locally` defer GitHub posting until the PR exists. See `.archon/spike-plan.md` for context.*

---

## Your Mission

Read the consolidated review and fix report artifacts created by earlier workflow nodes, and post them as GitHub PR comments on the freshly-created PR.

**GitHub action**: Post 2 PR comments

---

## Phase 1: LOAD

### 1.1 Get PR Number from Registry

`cleanup-create-pr` writes the new PR number to `$ARTIFACTS_DIR/.pr-number`.

```bash
PR_NUMBER=$(cat $ARTIFACTS_DIR/.pr-number)
echo "PR: #$PR_NUMBER"
```

If `.pr-number` is missing or empty, exit with an error — `cleanup-create-pr` must have run successfully before this node.

### 1.2 Verify Artifacts Exist

```bash
ls -la $ARTIFACTS_DIR/review/consolidated-review.md
ls -la $ARTIFACTS_DIR/review/fix-report.md
```

If either is missing, exit with an error — the upstream `cleanup-synthesize-review` and `cleanup-fix-locally` nodes should have produced both.

**PHASE_1_CHECKPOINT:**
- [ ] PR number found in `.pr-number`
- [ ] Both `consolidated-review.md` and `fix-report.md` exist

---

## Phase 2: POST

### 2.1 Post Consolidated Review

```bash
gh pr comment $PR_NUMBER --body-file $ARTIFACTS_DIR/review/consolidated-review.md
```

### 2.2 Post Fix Report

```bash
gh pr comment $PR_NUMBER --body-file $ARTIFACTS_DIR/review/fix-report.md
```

**PHASE_2_CHECKPOINT:**
- [ ] Consolidated review posted
- [ ] Fix report posted

---

## Phase 3: OUTPUT

```markdown
## ✅ PR Comments Posted

**PR**: #{PR_NUMBER}
- ✅ Consolidated review posted
- ✅ Fix report posted

The PR now reflects the full review-and-fix cycle as its initial state. Reviewers see both the findings and the auto-applied fixes from the moment the PR appears.
```

---

## Error Handling

### `gh pr comment` Fails

1. Verify the PR number is correct: `gh pr view $PR_NUMBER`
2. Verify GitHub auth: `gh auth status`
3. Verify the body file exists and is non-empty
4. Retry once; if it fails again, exit with the error and ask user to post manually

---

## Success Criteria

- **PR_NUMBER_FOUND**: `.pr-number` registry exists and contains a valid PR number
- **ARTIFACTS_EXIST**: Both `consolidated-review.md` and `fix-report.md` exist
- **COMMENTS_POSTED**: Both `gh pr comment` calls succeed
