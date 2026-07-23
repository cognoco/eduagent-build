# MMT-ADR-0036 autonomous remediation sequence

**Status:** Executing  
**Decision authority:** MentoMate operator, interactive rulings on 2026-07-22  
**Delivery batch:** BID-35 — Mentor-notice feature completion  
**Final acceptance gate:** WI-2574 — Run final mentor-notice MVP acceptance audit against MMT-ADR-0036

## Outcome

Converge the retained mentor-notice implementation on the amended MMT-ADR-0036 contract, then produce an independent decision-to-evidence audit from clean `origin/main`. The sequence may change code, tests, documentation, and non-production configuration declarations. It must not activate a production flag, percentage rollout, OTA, app release, deployment, or push delivery.

## Locked rulings

1. Re-check outcomes come from an independent server-side judge, never the tutor.
2. All persisted learning text crosses one shared multilingual hybrid clinical-safety gate and fails closed.
3. Rollout observations carry a monotonically increasing server revision; lower revisions are ignored and disabled wins at the same revision.
4. The mentor-notice learning day begins at local 04:00 in the learner's stored IANA time zone.
5. Transcript purge retains an otherwise eligible notice and its immutable `answerEventId` scalar; the scalar has no event-table foreign key.
6. `learnerQuote` is optional transient validation input and is never persisted.
7. The sequence performs no push, OTA, production activation, percentage rollout, release, or deployment.

## Ownership baseline

The live Cosmo state at sequence formation controls pickup:

- WI-2499 — Restore evidence-gated mentor-notice actions and receipt copy: executing under the existing mentor-notice shepherd claim. Do not steal.
- WI-2501 — Terminalize completed `not_yet` mentor-notice offers idempotently: executing under the existing mentor-notice shepherd claim. Its final idempotency mechanism is an input to WI-2625.
- WI-2504 — Make mentor-notice flag-off rollback remove cached surfaces: Ready for bounded rework and eligible for autonomous pickup after the canon amendment.
- WI-2573 — Disable mentor-notice push delivery for the in-app MVP: Reviewing/Awaiting Info. Follow the independent review path; do not self-close.
- WI-2500 — Enforce mentor-notice contracts at event and stream boundaries: Closed. Because its landed transcript-purge behavior cascades notices, evidence retention is the separate WI-2629 rather than review rework on WI-2500.

Before every pickup, refresh Stage, State, `Claimed By`, claim expiry, blockers, PR state, and the landed base. A live foreign claim stops autonomous pickup. An expired executing claim uses the reconciliation path rather than an overwrite.

## Dependency graph

| Work Item | Prerequisites | Purpose |
|---|---|---|
| WI-2623 — Amend mentor-notice authority, rollback, safety, evidence-retention, and learning-day canon | None | Establish the amended authority and this sequence. |
| WI-2624 — Enforce explicit producer-vendor exclusion in judge routing | WI-2623 Closed | Provide one correct independence primitive. |
| WI-2629 — Retain mentor-notice evidence identity after transcript purge | WI-2623 Closed; WI-2500 Closed | Forward-repair evidence retention. |
| WI-2504 — Make mentor-notice flag-off rollback remove cached surfaces | WI-2623 Closed | Finish the retained rollback foundation. |
| WI-2625 — Make mentor-notice re-check outcomes independently server-judged | WI-2623, WI-2624, WI-2500, and WI-2501 Closed | Replace tutor verdicts and converge both transports. |
| WI-2627 — Make mentor-notice rollback observations monotonic across deployments | WI-2623 and WI-2504 Closed | Order rollback observations across responses and restarts. |
| WI-2628 — Fail closed on multilingual clinical inferences in persisted learning text | WI-2623 and WI-2624 Closed | Apply one multilingual gate to every persistence boundary. |
| WI-2574 — Run final mentor-notice MVP acceptance audit against MMT-ADR-0036 | Every retained and corrective blocker Closed | Prove the whole feature, not merely each patch. |

All listed corrective Work Items belong to BID-35. Each one blocks WI-2574.

## Execution sequence

### 1. Amend canon — WI-2623

- Amend MMT-ADR-0036 in place, retaining Accepted status and recording the 2026-07-22 operator ruling.
- Update `docs/PRD.md`, `docs/architecture.md`, the operational mentor-notice specification, and the UX specification in lockstep.
- Persist this sequence.
- Land as a dedicated docs-only PR. No feature code belongs in this change.

Verify with link/reference checks, formatting where applicable, and the repository change-class gate under Node 22.

### 2. Correct evidence retention — WI-2629

- Add a new forward migration; never edit landed migrations 0149 or 0150.
- Drop `mentor_notices_answer_event_id_session_events_id_fk`, retain the UUID column and both partial unique indexes, and remove only the Drizzle `.references()` declaration.
- Keep profile and source-session cascade semantics.
- Require `answerEventId` on new accepted writes while retaining legacy nullable reads.
- Make `learnerQuote` optional. When present, it must overlap the referenced event; when absent, extant event, type, learner, and session provenance still gate creation.
- Document that FK rollback requires zero dangling identifiers and cannot silently erase identity.

The red test uses a real database: purge the transcript events, retain both notice rows, and retain their original identifiers. Separate controls prove profile/session deletion still cascades.

### 3. Repair judge independence — WI-2624

- Add the explicit union `JudgeIndependence = { kind: 'model-output'; producerVendor: string } | { kind: 'not-applicable' }`.
- Require every `capability: 'judge'` caller to choose a branch.
- Normalize and exclude the producing vendor and Google/Gemini for model-output judging.
- Choose eligible Anthropic then OpenAI across primary and fallback. Preserve the existing unavailable/CircuitOpen result when neither is eligible.
- Migrate suitability and Challenge Round model-output graders. Mark answer-only graders `not-applicable`.

Tests cover both routing modes, primary/fallback, Anthropic/OpenAI/Google/Cerebras producers, and the former double-inversion path.

### 4. Finish retained rollback — WI-2504

Refresh the bounced review findings and reconcile the existing worktree before pickup. Complete the bounded flag-off/cache-removal acceptance criteria without absorbing the monotonic revision extension. Land and pass independent review/QA before WI-2627 starts.

### 5. Independently judge re-check outcomes — WI-2625

- Remove `signals.notice_recheck` from the shared tutor envelope and make the tutor prompt neutral.
- After the learner event is persisted, call one evaluator from both streaming and non-streaming exchange paths with server-owned profile/session/event/re-check context, exchange number, Conversation Language, and actual tutor producer.
- Accept only:
  - `locked_in/demonstrated`
  - `not_yet/insufficient`
  - `dismissed/explicit_stop`
  - `deferred/explicit_not_now`
  - `continue/unclear`
- Before turn three, `continue` and malformed or unavailable judging make no transition. At turn three, any evaluation that does not commit `locked_in`, `not_yet`, `dismissed`, or `deferred`—including valid `continue` or malformed or unavailable judging—deterministically terminalizes `not_yet`.
- Reuse the landed WI-2501 idempotency primitive so a valid transition applies once under retries.
- Persist only event identity needed for idempotency, never answer text, judge reasoning, or confidence.
- Put the server-committed transition in non-stream responses and SSE done frames; mobile renders only that transition.

Require red/green transport tests, prompt snapshots, evaluator unit tests, real-database idempotency/concurrency coverage, and a live prompt eval.

### 6. Make rollback monotonic — WI-2627

- Add `MENTOR_NOTICE_POLICY_REVISION` as a non-negative integer string with default `0`.
- Publish `rolloutRevision`, `rolloutEnabled`, and `projectionEpoch` on Now, overflow, session summary, non-stream message, SSE done, re-check, and defer responses.
- Replace hook-local epoch state with one actor/profile keyed `useSyncExternalStore` observation store hydrated once from AsyncStorage.
- Enforce: lower revision ignored; disabled wins a same-revision tie; re-enable requires a higher revision; missing/malformed policy never exposes notice data; hydration/storage failure stays hidden.
- Bind payloads to observations and reject stale payloads across Now, overflow, summary, chat acknowledgement, deep links, and mutations.
- Keep fade running while off and enforce the same 21-day activity cutoff in projection.
- Document atomic flag+revision operations without changing deployed values.

Tests cover cold/warm start, lower/same/higher revisions, storage failure, malformed or missing policy, stale payloads, every consumer surface, and off-period fade.

### 7. Gate multilingual clinical persistence — WI-2628

- Introduce one async batch evaluator receiving named fields, Conversation Language, provenance (`user`, `llm`, or `migration`), and producer vendor for LLM output.
- Apply NFKC/Unicode deterministic detection across English, Czech, Spanish, French, German, Italian, Portuguese, Polish, Japanese, and Norwegian Bokmål, including cross-language phrases.
- Classify known-person attribution as block, absence of protected lexemes as clear, and uncertain educational/reference uses as ambiguous.
- Send only ambiguous LLM-authored text with known producer identity to the independent judge. Strict allowance is `allow/educational_reference`; block reasons are `person_attribution`, `diagnostic_inference`, or `unclear`.
- Block ambiguity from users, migrations/backfills, missing producers, unavailable judging, and malformed output without external disclosure.
- Gate notices, notes, session-analysis Learning Profile fields, memory facts/backfill/dedup, and Needs-Deepening persistence.
- Derived writes drop unsafe fields/records; user mutations retain `BadRequestError`. Observability records only field kind, reason, and count.

Require the ten-language corpus, cross-language cases, a call-site guard, red/green tests for every provenance/failure branch, and a live prompt eval.

### 8. Final acceptance — WI-2574

Start only after every blocker is Closed. Use a fresh worktree from current `origin/main` and build a decision-to-evidence matrix for every MMT-ADR-0036 clause.

The audit must exercise eligibility, all-age behavior, learner-self and proxy reads, evidence validation and replay, both transports and fallback, idempotency/concurrency, one actionable notice, Continue and the three-response cap, local-04:00 defer, all outcomes, 21-day fade, scrubbed persistence, monotonic flag-off/cache invalidation, transcript purge identity retention, multilingual clinical gating, and zero primer/schedule/nudge/push delivery.

Inspect runtime schemas, database constraints and forward migrations, rollback notes, service-boundary centralization, API/SSE/mobile parsing, registered jobs, and deployment declarations. Run Node 22 validation: affected and full API/mobile tests, both real-database integration suites, migration immutability, the change-class branch gate, prompt evals including live gates, and the mobile flow from clean main.

Publish:

- `docs/evidence/WI-2574/report.md`
- `.workitem-artifacts/WI-2574/evidence.json`

Any unresolved finding creates a bounded BID-35 corrective Work Item and a blocker edge; it does not get explained away in the report.

## Work-item and Git discipline

1. Refresh Cosmo and GitHub immediately before pickup.
2. Claim before implementation.
3. Use one `.worktrees/<WI-ID>/` worktree and branch per Work Item, created by `scripts/setup-worktree.sh`.
4. Use red/green TDD. For privacy, rollback, retention, and safety controls, also capture revert-to-red and restore-to-green evidence.
5. Use real database boundaries for migrations, purge, concurrency, and state transitions; do not mock the behavior under proof.
6. Stage only the Work Item's files. Commit through the repository commit skill and push an explicit branch refspec.
7. Open one PR per Work Item. Read the full diff, check runs, top-level review, inline threads, and review verdicts. Merge only when green and actionable findings are resolved.
8. Run the post-merge base-branch check.
9. Call `complete` only after the PR is merged, using the exact landed commit as evidence.
10. Never self-close. Independent review and QA own closure.

## Stop conditions

Pause autonomous execution rather than guessing if:

- another actor holds a live claim;
- an implementation choice would expand product scope or weaken a locked ruling;
- a production flag, OTA, release, deployment, percentage cohort, or push activation would be required;
- a required live eval or external check cannot be run with existing authority;
- the final audit finds an unbounded or cross-domain defect that cannot be represented as a bounded BID-35 Work Item.
