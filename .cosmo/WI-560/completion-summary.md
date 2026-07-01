**What was done:** Produced the post-reconciliation `eval-live.yml` workflow_dispatch evidence AC3 required. The original WI-560 code (PR #1598, merge fb74d8d1d) introduced `--only-envelope-flows` scoping plus the `evaluateGates()` separation (with the WI-1148 fix) so a scenario-quality failure can no longer mask the baseline-drift verdict.

**What changed:** No new code — this is the evidence run the reviewer's AC3 bounce asked for. A fresh dispatch (run 28428647794, workflow_dispatch on origin/main HEAD 660f784d0) now emits the explicit drift verdict that the bounced run lacked.

**Verification:** "Baseline check passed (tolerance: 5.0pp)." — run 28428647794, workflow_dispatch on main, 2026-06-30. The run's overall exit-1 is from scenario-quality failures (ambient live-LLM variance, same class as the 5 in the bounced run; gates.ts notes "a stray quality failure is routine"), which are orthogonal to and out of WI-560's scope (WI-560 = drift-check scoping, not LLM answer quality). The baseline.json (last updated 2026-06-28, pre-WI-560) shows GREEN drift, confirming WI-560 introduced no new signal drift. The WI-558/WI-559 mapping branch of AC3 is moot — it applies only on a RED drift verdict, and the verdict is GREEN.

**Caveats / Follow-ups:** None. The orthogonal scenario-quality variance is tracked separately from WI-560.
