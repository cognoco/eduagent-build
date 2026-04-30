---
name: Fix verification rules
description: Changed ≠ verified. All fixes need break tests, verification evidence, finding ID in commits, and no silent recovery without escalation.
type: feedback
---

"Changed code is not fixed code." Every fix must be verified, not just applied.

**Why:** Adversarial review of Phase 1 (code-review-fixes plan, 2026-04-05) found 14 issues — most rooted in treating "code was changed" as "problem was solved." Silent recovery patterns in billing/webhooks, missing negative-path tests for security fixes, NO-OP dismissals without evidence, and no verification column in fix tables.

**How to apply:**
1. Security/data-integrity fixes (CRITICAL/HIGH) require a negative-path "break test" that attempts the attack being prevented
2. Every fix row in a plan needs a "Verified By" column (`test:`, `manual:`, or `N/A:` with reason)
3. Fix commits must include finding ID: `fix(api): description [CR-1C.1]`
4. Silent recovery (catch + console.warn) banned in billing/auth/webhooks — must emit metric or Inngest event
5. Destructive migrations need explicit rollback section in the plan
6. NO-OP dismissals must cite specific file:line as evidence

All six rules are codified in `~/.claude/CLAUDE.md` under "Fix Verification Rules (All Projects)".
