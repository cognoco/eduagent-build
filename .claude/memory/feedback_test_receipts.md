---
name: Stale test receipt recovery
description: How to recover when push hooks reject a stale .test-receipts file.
type: feedback
---

If `git push` fails because `.test-receipts/mobile.json` is stale, do not bypass hooks. Run the receipt recorder for the affected scope, verify the receipt, and commit the receipt update separately if the source/test fix was already committed.

**Why:** PR #273 exposed that a valid source/test commit can pass pre-commit and still fail pre-push when the branch's receipt hash no longer matches the changed test file.

**How to apply:**
- Run `bash scripts/record-test-receipt.sh mobile` for mobile receipt failures.
- Run `bash scripts/verify-test-receipts.sh` before retrying push.
- Expect the recorder to rewrite `.test-receipts/mobile.json` and possibly prune older entries; that is acceptable when verification passes.
- Stage only the receipt file for the follow-up commit unless other intentionally related receipt files changed.
