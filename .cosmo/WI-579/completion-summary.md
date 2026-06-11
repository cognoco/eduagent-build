**What was done:**
Removed minor-PII from the error/observability path (logs + Sentry) per the WP-W3-pii-error-logging bundle brief — findings F-018 (schema-drift path logged/captured the raw event payload), F-074 (truncated LLM output shipped to Sentry as extra.rawSlice / rawResponseTrunc), F-140 (raw learner subject input forwarded to Sentry in a fallback catch). Delivered via PR #902 (3 commits: 6d7062eed main fix, 533afc2cd fixture-shape fix, 4619ade06 review round), merged to main as e6cb6170.

**What changed:**
- New canonical scrubber `apps/api/src/services/pii-scrub.ts` exporting `summarizeRawPayload(): RawPayloadSummary` — shape-only payload summary ({ payloadType, fieldCount }); the bundle-level "scrubber from a canonical home" shared across the four W3 PII units. `ask-gate-observe.ts` (which pioneered the pattern) now imports it instead of its local copy.
- F-018 + sibling sweep: all 30 `rawData: event.data` occurrences across 10 observe/fallback Inngest functions (session-completed-observe ×6, transcript-purge ×6, summary-reconciliation ×4, filing-observe ×4, ask-classification ×3, notification-suppressed ×2, email-bounced ×2, payment-failed, exchange-empty-reply-fallback, billing-trial-subscription-failed) now log/capture `summarizeRawPayload(event.data)`. Escalation semantics (captureException, structured logs, throw-to-retry) untouched.
- F-074: Sentry extra.rawSlice / rawResponseTrunc and the contentSnippet log field replaced with responseLength/contentLength shape diagnostics in evaluate.ts, learner-profile.ts, learner-input.ts (×2), homework-summary.ts. Zod issues retained (field paths, not values).
- F-140: subject-resolve.ts fallback catch forwards rawInputLength, never the learner's raw input.
- Forward-only guard `pii-scrub.guard.test.ts`: bans `rawData: event.data`, `rawSlice:`, `rawResponseTrunc:` in non-test API source. Red-green evidence: run pre-sweep it failed listing all 30 rawData sites + 5 slice sites; green post-sweep; any reintroduction fails CI.
- Break-tests with PII sentinels on every fixed error path: 3 schema-drift handlers (F-018), 5 parse-failure paths (F-074), fallback catch (F-140) — each asserts the sentinel never reaches console output or captureException args and the shape diagnostics do.

**Verification:**
- api tsc clean; eslint clean on all touched files; `jest --findRelatedTests` across changed sources: 92 suites / 2287 tests green locally.
- PR #902 CI all green on head 4619ade06; Claude review APPROVED (0 blocking); CodeRabbit pass. Round-1 findings triaged with in-thread dispositions (PR comment 4679685234).
- The one round-1 CI failure (mobile create-profile.test.tsx timing test) was proven foreign: diff is 100% apps/api/ (no packages/, no lockfile) and the test passes locally on the branch (48/48); it did not recur on the final head.

**Caveats / Follow-ups:**
- GC6 deferral (recorded in commit 4619ade06's message per the sanctioned escape): internal jest.mock burn-down deferred in homework-summary.test.ts (1 internal mock) and learner-input.test.ts (2 internal mocks), tracking cite `gc1-allow: pattern-a conversion`. Backlog, not accepted state.
- Pre-existing non-content diagnostics retained by design: Zod `issues` arrays and `parsed.error.message` (exchange-empty-reply-fallback) carry field paths/types, not free text — classified safe by the source audit.
- `contentSnippet` is deliberately NOT banned by the guard: it is a legitimate product DTO field in library-search responses; only its single logging use was removed.
- Sibling W3 units consume the canonical scrubber home: WI-577 (event payloads), WI-578 (step state), IT-W3-pii-llm-provider (F-076) — out of scope here by design.
- One non-blocking review "consider" remains open on PR #902 (round 2) for the operator's discretion.
