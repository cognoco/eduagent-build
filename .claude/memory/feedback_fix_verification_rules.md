---
name: Fix verification rules
description: Adversarial review of Phase 1 (2026-04-05) found 14 issues rooted in treating "code changed" as "problem solved." Rules codified in CLAUDE.md.
type: feedback
---

Authoritative source for these rules is `CLAUDE.md` § "Inherited Rules" → "Fix Verification Rules", plus global principle #2 ("Evidence beats assertion") for the NO-OP dismissals case.

**Why this exists:** Adversarial review of the Phase 1 code-review-fixes plan (2026-04-05) found 14 issues — most rooted in treating "code was changed" as "problem was solved." Silent recovery in billing/webhooks, missing negative-path tests for security fixes, NO-OP dismissals without evidence, no verification column in fix tables.
