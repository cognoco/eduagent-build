What was done:

Added a rate-limited, deduplicated Sentry escalation for sustained webhook signature-verification failures, building on the WI-639 structured logger.warn (which stays unchanged for isolated failures). A new per-isolate threshold guard fires exactly one captureException per contiguous failure episode when 5 failures occur within a 5-minute window; isolated failures remain log-only, preserving the deliberate no-alert-storm design. The Resend webhook was assessed and included in-scope (identical pattern, marginal cost) with its own independent escalator instance. Delivered via PR #1035 (2 commits: initial implementation + review-fix batch), merged to main at 9d3a1910f.

What changed:

- NEW apps/api/src/services/webhooks/signature-failure-escalator.ts — createSignatureFailureEscalator(sentryContext, errorMessage) factory with isolated per-instance state; pre-built singletons stripeSignatureFailureEscalator and resendSignatureFailureEscalator; threshold/window exported as constants (5 failures / 5 minutes). Escalation flag set only after a successful capture (a throwing Sentry SDK is retried on the next failure); timestamps array capped at threshold to bound per-isolate memory under probe storms; escalation-path errors swallowed with a console.error trace, never thrown into the webhook handler.
- apps/api/src/routes/stripe-webhook.ts — recordSignatureFailure() wired into the signature-verification catch block, after the structured logger.warn, before the 400 response.
- apps/api/src/routes/resend-webhook.ts — resendSignatureFailureEscalator.record() wired into the !isValid branch, after the structured logger.warn, before the 401 response.
- NEW apps/api/src/services/webhooks/signature-failure-escalator.test.ts — 12 unit tests covering threshold, dedup, window expiry, episode semantics, capture-throw retry, secret-leak guard, no-throw contract, factory isolation, and both singleton contexts.
- apps/api/src/routes/stripe-webhook.test.ts + resend-webhook.test.ts — route-wiring regression describes: flooding either route with bad-signature requests asserts exactly one captureException with the endpoint-specific context.

Verification:

- Red-green evidence at two levels: (a) unit — removing captureException from the escalator fails 4 escalation assertions; (b) route wiring — commenting out either route's record() call fails 4 wiring tests. Both RED runs recorded during the session, then restored to GREEN.
- 121 tests green across the 3 touched suites; tsc clean; api:lint clean; pre-push gate green both pushes (977 tests / 29 suites on the first, 6-file delta on the second).
- PR #1035 CI green on both heads (de71f3d37, 21ee7dd64); final Claude Code Review verdict APPROVED (0 blocking / 0 should-fix / 2 considers); both Codex P2 findings (escalation flag set before capture; unbounded timestamps array) fixed in 21ee7dd64 with in-thread dispositions verified by the round-2 review.
- Claude round-1 SHOULD_FIX (route wiring untested) fixed with the RED-verified wiring tests; CONSIDER on services/stripe/ placement fixed by moving to services/webhooks/; CONSIDER on the silent catch fixed with a guarded console.error trace; CONSIDER on __resetForTesting in the public interface rejected with rationale recorded in the PR triage comment.

Caveats / Follow-ups:

- Dedup is per-isolate best-effort on Cloudflare Workers — module-level state is never shared across isolates, so a multi-isolate failure storm can emit one alert per isolate (Sentry-side grouping collapses them) and the effective threshold scales with isolate count. Accepted and documented in the module file header and the PR description; a durable cross-isolate mechanism (Inngest + KV) was deliberately not built to keep the webhook hot path overhead-free.
- Two round-2 considers remain open as accepted residue per the PR comment record: the __resetForTesting test-only method stays on the public interface (rejected — ceremony without a production consumer), and the per-episode (not per-window-slice) escalation semantics are intentional and locked by the continuous-stream unit test.
- This item is NOT workstream-attached — no autonomous reviewer picks it up; it rests at Reviewing pending a manual /cosmo:review.
