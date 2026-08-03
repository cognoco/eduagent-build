# WI-2574 — final mentor-notice MVP acceptance audit

## Verdict

**PASS for independent Cosmo review and QA.** At audited base
`790a27c07e38e12e854bf6daff41fe6e247f658c`, no unresolved finding violates
MMT-ADR-0036 or the friendly-user MVP safety boundary. This is an evidence-only
audit. It changes no product behavior and authorizes no rollout, deployment,
OTA, app release, or mentor-notice push delivery.

## Audit authority and immutable inputs

- Decision: [`MMT-ADR-0036`](../../adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md)
- Operational specification: [Mentor Notices — MVP specification](../../specs/2026-07-19-homework-notice-felt-moments.md)
- Audited base: `790a27c07e38e12e854bf6daff41fe6e247f658c`, equal to
  `origin/main` when the final gates began
- Post-MVP delivery containment prerequisite: WI-2573, landed commit
  `f346ee16c`
- Final in-scope correction: WI-2629, landed commit `82d972341`
- Disposable database operator ruling:
  `BID-35-WI-2574-EXACT-DB-AUDIT-2026-08-03`
- Revision-pinned bootstrap receipt:
  [`.workitem-artifacts/WI-2939/WI-2574-final-audit-bootstrap-790a27c0.json`](../../../.workitem-artifacts/WI-2939/WI-2574-final-audit-bootstrap-790a27c0.json)

The prerequisite sequence was present on the base branch before the audit.
The repository, runtime schemas, migrations, services, API/SSE contracts,
mobile policy, registered jobs, and deployment configuration were inspected at
the same base revision used by the final unit and database gates.

## Decision-to-evidence matrix

| Requirement | Positive evidence | Negative control / boundary | Result |
|---|---|---|---|
| Homework and ordinary single-subject learning are eligible | Shared completion paths call `createMentorNoticeFromSignal`; unit and real-database exchange tests accept both eligible types. | Interleaved and active re-check sessions are rejected before creation. No `topicId` exists in the runtime proposal. | Pass |
| The lifecycle is identical for every learner age | The creation, visibility, transition, and mobile policy services receive no age discriminator; focused prompt profiles exercise ages 11, 12, 13, 15, and 17. | A word-boundary search across the authoritative mentor-notice API, route, and mobile-policy code found no age, birth, adult, or minor branch. | Pass |
| Notice detail is learner-self only | `visibility.ts`, route tests, and real-database mobile-session coverage return the complete projection to the authenticated learner. | Guardian, supporter, payer, selected-child, and other proxy actor/subject combinations return no notice concept, hint, evidence, receipt, card, or celebration. | Pass |
| The LLM signal is bounded and non-authoritative | `noticed_gap` carries concept, optional hint, required `answerEventId`, and optional transient `learnerQuote`; the server derives ownership and attribution. | Missing/malformed identity, wrong event type, wrong learner/session, quote mismatch, and fabricated evidence are rejected. Direct parsing accepts both omitted and present valid quotes. | Pass |
| Completion is the only creation point | Streaming, non-streaming, and fallback completion share the server-owned creation boundary and emit only accepted transitions. | Prompt/prose snapshots make no future re-check promise; malformed and rejected signals produce no persisted or client-visible notice. | Pass |
| Creation is evidence-aware, idempotent, and concurrency-safe | Partial unique indexes bind accepted evidence identity and real-database replay/race tests converge on one logical row. | The source session is not the permanent uniqueness boundary; distinct eligible evidence can create a later record. | Pass |
| At most one actionable notice is projected | Real-database ordering selects the oldest eligible actionable row with an explicit ID tie-break. | Multiple durable rows never become a visible queue or backlog. | Pass |
| `Continue` owns an attempt, not the durable verdict | Both transports persist the learner event and invoke the shared independent server judge; the tutor envelope contains no verdict. | Valid `continue/unclear`, including response three, changes no notice state. At the cap the attempt metadata detaches and the unresolved notice remains re-offerable. | Pass |
| Only unresolved judging fails safe at response three | Exact outcome/reason pairs commit their bounded transitions. | Unavailable, malformed, mismatched-reason, or missing-event judging cannot terminalize before response three and becomes `not_yet/insufficient` only at response three. | Pass |
| Terminal and quiet lifecycle semantics match the ADR | Evidence-backed `locked_in`, new-evidence-required `not_yet`, explicit-stop `dismissed`, and explicit-not-now `deferred` are covered by state and route tests. | `Not now` never claims mastery or dismisses the record; optimistic client state is withheld on rejected or malformed responses. | Pass |
| Deferral uses the current learning day | `learning-day.ts` and tests cover the local IANA-zone 04:00 boundary. | Invalid or absent zones use the same 04:00 boundary in UTC; before-boundary civil dates resolve to the preceding learning day. | Pass |
| Inactive open notices fade after 21 days | Fade job and projection apply the same activity cutoff, including while the feature is disabled. | Re-enable cannot expose a stale row before the scheduled fade job runs. | Pass |
| Persistence is minimal and survives transcript purge | Stored fields are server-owned IDs, scrubbed concept/hint, state, and lifecycle timestamps. `answerEventId` is an immutable UUID scalar; transcript-purge integration retains it. | No quote, verbatim answer, model reasoning, confidence, or clinical label is stored. Profile/session cascade remains; rollback forbids erasing identity to restore the removed event FK. | Pass |
| Persisted learning text uses the shared multilingual safety gate | The normalized ten-language and cross-language gate covers creation and derived persistence boundaries with provenance-aware independent judging. | Protected person-attributed text blocks; ambiguous LLM text without a producer vendor, migration/backfill ambiguity, judge failure, malformed output, and unclear verdict fail closed. | Pass |
| Flag-off is ordered, durable, and complete | API policy emits monotonic revision plus revision-bound epoch; the learner-scoped mobile fold persists the observation across restart and clears every relevant cached surface. | Lower revisions are ignored, disabled wins ties, re-enable requires a higher revision, and malformed/missing/unreadable cold-start state remains hidden. | Pass |
| MVP delivery is in-app only | `MENTOR_NOTICE_ENABLED` defaults off; fade remains active. Retained push scan/send functions reject before database work unless the separate post-MVP flag is explicitly enabled. | `MENTOR_NOTICE_PUSH_POST_MVP_ENABLED` defaults off, has no active deployment binding, and tests prove zero mentor primer, schedule, nudge, send, or push fan-out in MVP configuration. | Pass |

## Boundary and storage inspection

The audit inspected the canonical contracts and their consumers in:

- `packages/schemas/src/llm-envelope.ts`, `mentor-notices.ts`, `sessions.ts`,
  `stream-fallback.ts`, and `now-feed.ts`;
- `apps/api/src/services/mentor-notices/`, the streaming and non-streaming
  session completion services, API routes, Now projection, SSE/fallback
  handling, and the shared persisted-learning-text gate;
- `packages/database/src/schema/mentor-notices.ts` and migrations 0147, 0149,
  0150, 0151, and 0153 with their rollback documentation;
- `apps/mobile/src/lib/mentor-notice-policy.ts`, SSE parsing, session summary,
  chat acknowledgement, Mentor/Now surfaces, and cache handling;
- `apps/api/src/inngest/` registration and the mentor fade, nudge-scan, and
  nudge-send boundaries; and
- runtime configuration and deployment manifests for active flag bindings.

No contradictory active legacy path was found. Dormant post-MVP push machinery
is retained behind the separate default-off boundary permitted by the ADR; it
is not an MVP dependency and does not execute in the audited configuration.

## Fresh verification

All final-base commands used repository-required Node `22.16.0`. Database tests
ran only against the operator-authorized disposable target. The receipt records
target ID `811f580999ce`, endpoint fingerprint
`f0ca05e6457965df023f9c88d3eeb3b821f4c02a119a8a793f41b49592425bd7`,
audited revision `790a27c0…`, and a committed-migration-only bootstrap. The RLS
runbook preflight proved the test role non-login, non-superuser,
non-owner, non-bypass-RLS, and narrowly granted before the database gates.

| Gate | Result |
|---|---|
| Direct optional-quote schema control | Without `learnerQuote`: accepted; with valid `learnerQuote`: accepted |
| Focused shared-schema suites | 2/2 suites; 129/129 tests |
| Affected mentor/exchange API unit suites | 5/5 suites; 403/403 tests |
| Complete API unit gate | 525/525 suites; 10,442 passed, 9 expected skips; 3/3 snapshots; 205.334 s |
| Complete mobile unit gate | 537/537 suites; 7,148/7,148 tests; 306.408 s |
| Affected co-located real-database suites | 2/2 suites; 51/51 tests; 120.757 s |
| Complete cross-package real-database gate | 74/74 suites; 612 passed, 1 intentional post-MVP-push skip; 1,447.36 s |
| Migration immutability guard | Pass |
| Migration enum-idempotency guard | Pass |
| Integration typecheck | Pass; 75 Jest-selected roots |
| Focused deterministic prompt evaluation | 30 snapshots; zero tracked drift after deterministic rerun |
| Focused live prompt evaluation under the staging routing configuration | 30/30 live calls; 0 failures; 0 quality failures; 3 non-blocking warnings |

The cross-package gate included the learner-self/proxy visibility matrix,
mobile session flow, state lifecycle, learning-day boundary, push containment,
and real-database evidence/idempotency controls. Its single skip is the
intentional post-MVP push case behind the default-off flag. A separate
loopback-only remediation test was not applicable to the remote disposable
target and was not counted as exercised coverage.

## Finding disposition

The first direct schema control found one in-scope defect: the public envelope
required `learnerQuote`, contradicting the ADR's optional transient-input rule.
The finding was recorded in Cosmo and routed to the existing WI-2629 corrective
lane rather than creating a duplicate Work Item. Landed commit `82d972341`
makes only the quote optional, retains required `answerEventId`, preserves the
non-empty bound for a present quote, and passed independent post-merge review.
The final-base direct control and all affected/full gates above include that
correction. No other finding remains open.

## Bounded caveats

- Native-device Maestro execution was not applicable on this audit host:
  `adb` and `maestro` were absent and Metro was not running. The audit did not
  implicitly launch an emulator. Mobile contract, rendering/policy unit tests,
  and the real-database mobile-session path passed, but this report does not
  claim a fresh physical-device gesture or visual run.
- The full mobile gate emits existing Expo native-module/polyfill and React
  `act(...)` warnings plus Jest's force-exit/open-handle advisory. The command
  exited zero with every suite and test passing; the warnings did not identify
  a mentor-notice contract failure.
- The live prompt gate produced three warnings but zero failed calls and zero
  quality failures. Deterministic snapshots were restored and clean.
- No Clacks connection was made during this audit.

## Conclusion

The retained implementation conforms to the complete MMT-ADR-0036 decision
matrix at the audited revision. The evidence supports advancing WI-2574 to
independent review and QA after this report-only PR lands. Operational rollout
and all mentor-notice push delivery remain unauthorized and disabled.
