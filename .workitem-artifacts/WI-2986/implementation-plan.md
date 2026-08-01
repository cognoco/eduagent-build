# WI-2986 implementation plan

1. Merge the current WI-2533 implementation branch into this isolated prerequisite branch without rewriting either history.
2. Add a failing regression test for durable, idempotent verifier redemption and response-loss recovery.
3. Implement the smallest durable redemption ledger and recovery path, preserving the existing authority and token contracts.
4. Run focused and affected validation, then merge this prerequisite branch back into WI-2533 so one PR carries the colliding changes.

Success means a consumed provider verifier cannot strand a valid ceremony, retries recover the same logical authorization, and concurrent or mutated replays fail closed.
