# TDD Evidence Requirements for AGENTS.md
## Proposals for Future Implementation

**Context:** PR review feedback suggested adding implementation details for TDD evidence requirements (Constitution Principle I) and verification notes location (Constitution Principle III).

**Decision:** Keep constitution focused on principles; add operational guidance to AGENTS.md instead.

**Status:** Deferred for future consideration

---

## Proposal 1: Comprehensive TDD Evidence Section (Full Version)

### Placement
Add new section after "Git Commit Policy" in AGENTS.md

**Rationale:** Groups all "before commit" guidance together; makes TDD evidence visible when agents are preparing to commit.

### Content Structure

```markdown
## Test-Driven Development Evidence (Constitution Principle I)

**When Required:** All code changes implementing new features or fixing bugs during Spec-Kit workflow (`/specify`, `/plan`, `/tasks`, `/implement`).

**Not Required:** Infrastructure changes, documentation updates, configuration-only changes.

### Red Phase Evidence (Tests Fail First)

Before writing implementation code:

1. **Write tests** following TDD cycle boundary declared at start
2. **Run test suite:** `pnpm exec nx run <project>:test`
3. **Capture failing output** - tests MUST fail initially (proves they test real behavior)
4. **Document red phase** in PR description or commit message

**Example evidence format:**
```
## TDD Red Phase

Test suite executed before implementation:
- `pnpm exec nx run web:test`
- Result: 3 tests failing (validateUser, checkPermissions, auditLog)
- Output: [paste relevant failure messages or link to command output]
```

**Why this matters:** Proves tests aren't false positives that always pass.

### Green Phase Evidence (Tests Pass After Implementation)

After implementing feature:

1. **Run same test suite:** `pnpm exec nx run <project>:test`
2. **Verify all tests pass**
3. **Document green phase** alongside red phase evidence

**Example evidence format:**
```
## TDD Green Phase

Same test suite after implementation:
- `pnpm exec nx run web:test`
- Result: All tests passing (3 previously failing, 0 new failures)
- Coverage: 85% (meets 80% threshold per Constitution)
```

### Evidence Location

**Primary:** PR description (most visible for reviewers)

**Example PR description structure:**
```markdown
## Feature Summary
[What was implemented]

## TDD Evidence
### Red Phase
[Failing tests before implementation]

### Green Phase
[Passing tests after implementation]

## Verification (Principle III)
[Additional validation commands per Verification Before Completion]
```

**Alternative:** Commit message body (persistent in git history)
```
feat: Add user permission validation

Implements permission check for protected resources.

TDD Red Phase:
- Test suite: pnpm exec nx run server:test
- 3 failing tests: validateUser, checkPermissions, auditLog

TDD Green Phase:
- Same suite: All tests passing
- Coverage: 87%
```

### Scope-Appropriate Evidence

**Small cycle (single component):** Brief evidence acceptable
```
Red: Button.spec.tsx fails (3 tests)
Green: Button.spec.tsx passes (3 tests)
```

**Large cycle (multi-component feature):** More detailed breakdown
```
Red Phase:
- auth.spec.ts: 5 failing tests
- permissions.spec.ts: 3 failing tests
- middleware.spec.ts: 2 failing tests

Green Phase:
- auth.spec.ts: 5 passing
- permissions.spec.ts: 3 passing
- middleware.spec.ts: 2 passing
```

### When Evidence Can Be Minimal

If TDD cycle declared is "micro" (single function test):
- Brief mention in commit message sufficient
- Example: "TDD: test failed, implemented fix, test passes"

### Integration with Pre-Commit Hooks

Pre-commit hooks automatically run tests (`nx affected -t test`). This provides:
- **Green phase validation** - ensures tests pass before commit
- **But NOT red phase validation** - hooks don't prove tests failed first

**Therefore:** Red phase evidence must be manually documented (screenshot, paste output, or verbal confirmation in PR).

### Practical Workflow

**Agent implementing TDD feature:**

1. Declare TDD cycle scope: "I'll implement user authentication as single cycle"
2. Write tests, run suite, capture RED output
3. Implement feature
4. Run suite again, confirm GREEN
5. Add evidence to PR description using template above
6. Pre-commit hooks verify green phase automatically
7. Push and create PR
```

### Pros & Cons

**Pros:**
- ✅ Comprehensive guidance with multiple examples
- ✅ Covers different granularities (small vs large cycles)
- ✅ Clear integration with existing tooling (pre-commit hooks)
- ✅ Flexible format options (PR description vs commit message)
- ✅ Explains WHY evidence matters (prevents false positives)

**Cons:**
- ❌ ~100 lines - may feel prescriptive/verbose
- ❌ Could overwhelm agents with too many options
- ❌ Maintenance burden if TDD workflow evolves

**Best for:** Teams wanting clear, detailed guidance; agents that need hand-holding; projects with strict quality requirements

---

## Proposal 2: Minimal TDD Evidence Section (Lightweight Version)

### Placement
Same as Proposal 1: After "Git Commit Policy" in AGENTS.md

### Content Structure

```markdown
## Test-Driven Development Evidence (Constitution Principle I)

When implementing features via TDD:

1. **Red Phase:** Run tests before implementation, capture failing output
2. **Green Phase:** Run tests after implementation, confirm all pass
3. **Document:** Include red/green evidence in PR description or commit message

**Example:**
```
TDD Evidence:
- Red: `pnpm exec nx run server:test` - 3 failing tests
- Green: Same command - all tests passing
```

**Not required:** Infrastructure, docs, config-only changes
```

### Pros & Cons

**Pros:**
- ✅ Concise (~10 lines vs ~100)
- ✅ Still actionable and clear
- ✅ Less maintenance burden
- ✅ Trusts agents to adapt to context

**Cons:**
- ❌ No examples of different evidence granularities
- ❌ Doesn't explain integration with pre-commit hooks
- ❌ May require agents to ask follow-up questions

**Best for:** Experienced teams; agents that don't need detailed examples; projects preferring minimal documentation

---

## Verification Notes (Constitution Principle III)

Both proposals should also address where verification notes belong (currently unclear in constitution).

### Proposed Addition (works with either TDD proposal)

```markdown
## Verification Notes (Constitution Principle III)

**Location:** PR description (primary) and/or commit message body (persistent)

**Format:**
```
## Verification Evidence

**Commands Executed:**
- pnpm exec nx run <project>:test ✅
- pnpm exec nx run <project>:build ✅
- pnpm exec nx run <project>:lint ✅

**Outputs:** [Brief summary or link to CI run]

**Residual Risks:** None / [Describe if any]
```

**Verification Requirements:**
- Document executed commands (copy-paste command + result)
- Use factual language (not "looks good" - show actual output)
- Highlight any residual risks or incomplete verification
- Attempt 4 remediation cycles before declaring blocker
```

---

## Recommendation

**For initial implementation:** Start with **Proposal 2 (Minimal)** to validate the concept without over-engineering.

**For mature workflow:** Consider **Proposal 1 (Comprehensive)** once TDD patterns are well-established and agents need detailed guidance.

**Hybrid approach:** Start minimal, add examples incrementally as team discovers common questions/confusion points.

---

## Constitutional Alignment

Both proposals maintain separation of concerns:
- **Constitution (Principle I):** States TDD discipline is required (WHAT)
- **AGENTS.md:** Provides evidence formats and locations (HOW)

This preserves the constitution's focus on principles while giving agents actionable operational guidance.

---

## Next Steps (When Ready to Implement)

1. Choose proposal (minimal vs comprehensive)
2. Add section to `.ruler/AGENTS.md` after "Git Commit Policy"
3. Run Ruler to cascade to `CLAUDE.md`
4. Test with next feature implementation via SpecKit workflow
5. Gather feedback and adjust format/examples as needed
6. Document any changes in `docs/memories/tech-findings-log.md` if patterns emerge

---

**Document created:** 2025-10-28
**Status:** Deferred for future consideration
**Next review:** After walking skeleton completion (Phase 1 Stage 6)
