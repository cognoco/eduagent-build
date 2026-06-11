What was done:
Removed all raw minor-PII from dispatched Inngest event payloads across the four bundled findings (F-073, F-083, F-084, F-095) using the W3 reference-and-rehydrate discipline: event payloads now carry opaque references only (sessionId / profileId / session_events row id), and the consuming Inngest functions rehydrate the learner text server-side from the scoped DB inside step closures (never memoized, never trusted from the payload). Delivered the bundle-level AC of a shared scrubber exported from a canonical home (packages/schemas/src/pii-scrub.ts) plus a runtime ratchet: an Inngest client middleware that scrubs denylisted keys from every outgoing event and escalates any actual scrub to Sentry as a regression signal. Landed via PR #911 (merged to main as a20a0ad50; branch head abb745632).

What changed:
- packages/schemas/src/pii-scrub.ts (+ tests, barrel export): scrubPiiPayload() deep key-denylist scrub, INNGEST_PII_PAYLOAD_KEYS, cycle-safe, walks null-prototype objects (adversarial-review fix).
- apps/api/src/inngest/client.ts: PII Scrub Middleware (onSendEvent.transformInput) over all outgoing payloads; scrub firing = logger.error + captureException.
- F-073/F-095: routes/filing.ts app/filing.retry dispatches drop sessionTranscript; filingRetryEventSchema drops the field; freeform-filing.ts always rehydrates the transcript inside the retry-filing step and ignores legacy event fields.
- F-083: session-exchange.ts app/ask.classify_silently drops classifyInput; ask-silent-classify.ts rehydrates persisted user_message rows, bounded to the first exchangeCount messages (PR-review Codex P2 staleness fix: append-only prefix is stable, so a delayed/retried run cannot classify from messages sent after the triggering exchange); no_user_messages skip branch added.
- F-084: topicProbeRequestedEventSchema replaces learnerMessage/topicTitle with learnerMessageEventId; persistExchangeResult additionally returns userMessageEventId (clientId and non-clientId insert paths); topic-probe-extract.ts rehydrates message content + topic title by reference and skips retention seeding if the referenced row is gone (e.g. transcript purged). Dispatch payload type is the schema-inferred TopicProbeRequestedEvent (no drift).
- jest.preset.js: mirrors the apps/api worktree guard so package tests are discoverable when run from inside .worktrees/ (CI/main-checkout behavior unchanged).

Verification:
- Red-green break test: the route-level test asserting a known minor identifier never reaches any inngest.send call was verified red with the routes/filing.ts fix reverted, green with it restored.
- Consumer rehydration tests for all three functions incl. legacy in-flight event shapes; schema strip/reject tests; middleware scrub + Sentry-escalation tests; staleness-bounding regression test for the Codex P2 fix.
- packages/schemas jest 1128 tests green; apps/api jest --findRelatedTests over all touched sources 144 suites / 3306 tests green (fix round: 46 suites / 1203); api + schemas typecheck and lint green; pre-commit and pre-push hooks green.
- PR #911: all CI checks green on head abb745632; Claude review APPROVED (0 must-fix / 0 should-fix); Codex P2 fixed with in-thread disposition; both considers dispositioned (one folded, one acknowledged non-blocking).

Caveats / Follow-ups:
Caveats —
- In-flight app/topic-probe.requested events with the old raw-text shape fail safeParse at the consumer and are skipped (loses the retention-card seed for sessions in flight at deploy; pre-launch, benign).
- Filing retry now fails NonRetriable when the DB transcript is unavailable (e.g. archived/purged between request and retry) instead of filing from client-supplied text — deliberate: client-supplied transcripts are an injection vector and purge semantics win.
- learnerMessage/topicTitle are deliberately NOT in the middleware denylist yet because app/review.calibration.requested still legitimately carries them (see Follow-ups).
- GC6 deferral (recorded in the main commit message): 19 pre-existing internal jest.mock sites retained across 4 edited test files (filing.test.ts 9, freeform-filing.test.ts 4, ask-silent-classify.test.ts 3, topic-probe-extract.test.ts 3) — burn-down would have ballooned a security-scoped PR; itemized for the GC6 backlog. New mocks added are gc1-allow boundary mocks only (LLM-backed services, Sentry escalation assertion).

Follow-ups —
- WI-620 (raw learnerMessage/topicTitle in app/review.calibration.requested event payload): same leak class, missed by the audit finding set; captured as an incidental during this WI. Fixing it also unlocks adding both keys to INNGEST_PII_PAYLOAD_KEYS.
- Canonical-home consolidation with WI-579 (PR #902): its summarizeRawPayload (shape-only log summarizer, apps/api/src/services/pii-scrub.ts) should fold into the shared packages/schemas/src/pii-scrub.ts home once both land — flagged to the shepherd; could ride WI-578 (step-state), which will import the shared scrubber anyway.
