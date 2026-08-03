**What was done:** Made both seeded-profile cache-merge regressions terminate normally without weakening their first-Mentor gate-hint assertions.

**What changed:** Replaced the permanent `gcTime: Infinity` test override with a bounded, query-key-specific retention window. Each test now awaits its mutation while the seeded cache is retained, then unmounts the hook and removes the exact query in a `finally` block. Production hooks are unchanged by this item.

**Verification:** Before the fix, the display-name assertion completed under `--forceExit` but normal runs remained alive beyond 60 and 180 seconds; a neighboring non-seeded mutation assertion exited in 5.9 seconds. Removing permanent retention alone restored exit but exposed the expected zero-retention eviction race. The final bounded-retention run reported 14 of 14 assertions successful with a normal process exit.

**Caveats / Follow-ups:** The broader app-layout suite uses the repository's already-ratified canonical `--forceExit` posture from WI-2845; this item changes only the distinct use-profiles test residue discovered during WI-2900 verification.
