# WI-2994 completion summary

**What was done:** Replaced best-effort terminal deletion dead-letter sends with awaited, durable Inngest steps using stable step names and deterministic event IDs.

**What changed:** Immediate transport failure now fails the step for retry; late settlement remains owned by the same awaited step; replay reuses the stable memoization key. Both existing privacy-minimized event shapes are unchanged. Compliance evidence and the launch-health runbook now name WI-2994 as the dispatch-durability owner and keep WI-1916 scoped to downstream routing.

**Verification:** Focused tests completed the red → green → production-revert red → exact-restore green sequence (42 / 42 final). Routed TypeScript validation, ESLint, Prettier, and diff checks passed.

**Caveats / follow-ups:** Manual external-provider remediation and production chat/pager rule activation remain separate. No migration was warranted or created, and no database, staging, provider, or alerting environment was mutated.
