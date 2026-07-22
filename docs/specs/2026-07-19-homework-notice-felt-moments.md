# Mentor Notices — MVP specification

**Status:** Ratified MVP specification · 2026-07-21 · amended 2026-07-22
**Owner:** Product and Architecture
**Decision authority:** [`MMT-ADR-0036`](../adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md)

> **History and disposition.** This path previously held a draft homework-notice specification and a later inline amendment that declared every session type eligible. PRs #2293 and #2357 implemented those documents before Product and Architecture ratified the capability. The old implementation plans are preserved as historical L3 records under [`docs/_archive/plans/2026-07-21-mentor-notice-reconciliation/`](../_archive/plans/2026-07-21-mentor-notice-reconciliation/). This specification records the forward MVP contract; it does not represent the earlier PRs as retrospectively authorized.

## 1. Product outcome

A mentor notice makes one part of MentoMate's continuing learning relationship visible: the Mentor noticed a concrete, evidence-backed gap, kept a quiet learner-visible record, and can offer a short re-check later. The feature is informational and optional. It must never feel like a diagnosis, a forced quiz, or a queue of shortcomings.

The MVP succeeds when friendly users can experience the complete in-app loop—notice, optional return, evidence-backed outcome—without push notifications or a complicated rollout system.

## 2. Eligibility and visibility

- Eligible source sessions are homework and ordinary single-subject learning sessions.
- Interleaved sessions are not eligible in the MVP.
- The same rules and age-neutral interaction apply to learners of every age.
- Notice details are learner-only. Guardian, supporter, payer, selected-child, and other proxy reads suppress the entire notice projection, including cards, receipts, concepts, hints, evidence, and celebrations.
- The server proves selfhood by comparing the authenticated actor with the subject learner. A client header, selected profile, or query parameter may narrow access but cannot establish it.
- Active re-check sessions cannot create another mentor notice.

## 3. The in-app experience

### 3.1 It noticed

1. The learner completes an exchange in an eligible session.
2. The LLM may propose a structured `noticed_gap` after it has answered the learner. Streaming prose may make a gentle observation, but it must not promise a later re-check.
3. The server validates feature eligibility, ownership, evidence, attribution, and content safety. Rejection produces no notice UI or promise.
4. Only after acceptance may the completed response show a deterministic, server-owned acknowledgement and the session summary show a minimal notice receipt.
5. The accepted notice may become the learner's single actionable Mentor/Now card. There is no visible queue.

### 3.2 It came back

- `Continue` starts or resumes one focused re-check session for the notice.
- The re-check is capped at three learner responses. It never injects another notice-detection prompt.
- The tutor guides the re-check but never grades its own work. After each persisted learner response, one shared server evaluator routes an independent judge that excludes the tutor's producer vendor. It accepts only exact outcome/reason pairs: `locked_in/demonstrated`, `not_yet/insufficient`, `dismissed/explicit_stop`, `deferred/explicit_not_now`, or `continue/unclear`.
- Before the response cap, `continue` and unavailable or malformed judging commit no lifecycle transition. On the third learner response, any evaluation that does not commit `locked_in`, `not_yet`, `dismissed`, or `deferred`—including a valid `continue` or unavailable or malformed judging—deterministically terminalizes as `not_yet/insufficient`.
- A valid evidence-backed result applies one bounded state-machine action:
  - `locked_in` terminalizes the offer, requires explicit server-validated learner evidence, and may produce a brief learner-only success projection.
  - `not_yet` terminalizes the current offer without claiming mastery. A later notice requires new eligible evidence; the completed row is not silently reused as an open offer.
  - `dismissed` requires an explicit learner request to stop bringing the matter back and is terminal.
  - `deferred` records the current learning-day deferral without terminalizing the notice.
- `Not now` is a separate deterministic action. It records `deferred/explicit_not_now` for the current learning day and makes no claim about understanding. The learning day starts at local 04:00 in the learner's stored IANA time zone; before 04:00 belongs to the preceding civil date. If the zone is invalid or unavailable, the server applies the same 04:00 boundary and derives the civil date in UTC.
- An eligible notice may resurface quietly in-app on a later learning day. It never opens a session or interrupts learning without the learner choosing `Continue`.
- An open notice with no activity for 21 days becomes `faded` and disappears quietly. Fresh evidence can support a later notice.

## 4. AI contract and server authority

The LLM proposal is bounded and non-authoritative:

```ts
noticed_gap?: {
  concept: string;
  correctionHint?: string;
  answerEventId: string;
  learnerQuote?: string; // transient provenance input only; never persisted
}
```

- The MVP proposal has no `topicId` because interleaved sessions are excluded.
- `answerEventId` must resolve to a durable learner `user_message` in the same authenticated learner profile and source session.
- The server derives the learner, subject, and any ordinary-session topic from server-owned session data. It does not trust LLM attribution.
- `learnerQuote` is optional. If supplied, the server treats it only as untrusted provenance input and requires it to agree with the durable event. If omitted, event ownership and type validation still apply. It is never stored or rendered.
- Both streaming and non-streaming completion paths call one server-owned creation service. That service owns feature gating, authorization, attribution, evidence validation, content scrubbing, idempotency, concurrency, persistence, and the accepted/rejected result.
- Re-check verdicts are not emitted in the tutor LLM envelope. Both completion paths call the shared server evaluator only after the learner event is durable and return only a server-committed transition.
- Every producer validates before emission and every consumer parses before use at the LLM, service, event, API, SSE, and mobile boundaries. A malformed payload produces no persistence, rendering, or action.
- Only a server-accepted transition may reach an SSE completion frame, API response, cache, or UI.

## 5. Data and state

The dedicated mentor-notice store remains the durable lifecycle source. It stores only what the learner-facing loop needs:

- server-owned learner, subject, optional ordinary-session topic, source session, and immutable `answerEventId` scalar;
- a short scrubbed learner-safe concept and optional correction hint;
- lifecycle status and timestamps needed for offer, defer, re-check, dismissal, fade, and retention;
- no verbatim learner evidence, clinical or diagnostic label, model reasoning, or model confidence.

Creation identity is evidence-aware and retry-safe: replaying or racing the same accepted evidence cannot create a second logical notice. A source session alone is not the permanent uniqueness boundary for all possible future evidence. At projection time, deterministic server policy exposes no more than one actionable notice.

`answerEventId` deliberately has no foreign key to the transcript event. Creation proves that the event then exists, is the learner's `user_message`, and belongs to the same learner and source session. Transcript purge may later delete the event while the active notice and its original UUID remain. Profile and source-session deletion retain their existing notice cascades. New accepted notices always carry the identifier; legacy nullable rows remain readable. A rollback may re-add a foreign key only if no dangling identifiers exist and must not erase identity to manufacture that precondition.

Every persisted learning-text boundary uses one shared async clinical-safety gate. It Unicode-normalizes and scans all supported Conversation Languages—English, Czech, Spanish, French, German, Italian, Portuguese, Polish, Japanese, and Norwegian Bokmål—including cross-language phrases. Known-person clinical attribution blocks deterministically. Ambiguous LLM-authored text may pass only when an independent judge returns `allow/educational_reference`; missing producer identity, unavailable or malformed judging, `unclear`, user-authored ambiguity, and migration/backfill ambiguity all block. Unsafe derived fields are dropped, user mutations return the existing validation error, and observability records no protected text.

Clients request transitions and render authoritative results. Optimistic navigation or hiding is committed only after a schema-valid server success. A rejection, conflict, malformed response, or transport failure leaves the card present or triggers an authoritative refetch.

## 6. Rollout, rollback, and retention

- Mentor notices remain behind `MENTOR_NOTICE_ENABLED` or its server-owned successor policy.
- The server also publishes a non-negative monotonic rollout revision and revision-bound opaque projection epoch with every notice-bearing projection and mutation response.
- The MVP is in-app only. It includes no push notification, notification primer, scheduled nudge, notification-family budget, or background send fan-out.
- Rollout is internal QA followed by the full friendly-user MVP group. Percentage cohorts are deferred until public release.
- One learner-scoped mobile observation orders policy across Now, overflow, summary, chat acknowledgements, deep links, and mutations, including across restart: lower revisions are ignored; disabled wins at the same revision; enabled after disable requires a strictly higher revision. Missing, malformed, unavailable, or failed cold-start hydration remains hidden.
- Flag-off stops prompt eligibility, creation, projections, actions, deep links, and all observed cached surfaces. Fade processing continues while off, and projections enforce the same 21-day activity cutoff before exposing a row.
- Flag-off does not delete server rows. Re-enable exposes only records still eligible under current actor, consent, state, retention, and rollout policy.
- Normal account/profile retention and deletion rules remain authoritative.
- Operational flag and revision updates are one versioned configuration change and each off/on transition increments the revision. This specification authorizes no production flag change, percentage rollout, OTA, app release, deployment, or push activation.

## 7. Out of scope for the MVP

- Mentor notices from interleaved sessions.
- `noticed_gap.topicId` or another LLM-selected attribution contract.
- Push notifications, notification permission copy, scheduled nudges, and notification-budget coordination.
- Guardian or supporter summaries of notices.
- A learner-visible queue of open notices.
- Age-specific notice lifecycles or copy branches.
- Percentage rollout cohorts or a new experimentation platform.
- Diagnostic profiling, clinical inference, or persistence of model rationale/confidence.

## 8. Implementation reconciliation

The following is a forward disposition of code already merged in PRs #2293 and #2357. Green CI on those PRs established technical checks only; this table states which parts belong to the ratified MVP.

| Shipped behavior | Disposition |
|---|---|
| Dedicated notice persistence, evidence validation, scrubbed concept/hint, in-app acknowledgement/receipt/card, explicit re-check/defer actions, fade, and feature flag | **Keep and harden** against this specification. |
| All-age behavior | **Keep.** The same rules apply to every learner age. |
| Ordinary-learning eligibility | **Keep.** Homework and ordinary learning are eligible. |
| One server-owned creation boundary shared by streaming and non-streaming completion; recursive creation blocked in re-check sessions | **Keep.** This is the required architecture. |
| Interleaved eligibility and LLM-proposed `noticed_gap.topicId` | **Remove from the MVP contract and implementation.** |
| Push primer, scan/send jobs, notification type/routing, notification-family budgets, and send/defer concurrency machinery | **Remove or keep dormant outside MVP.** They are not MVP dependencies. |
| One-per-source-session uniqueness | **Change.** Use evidence-aware idempotency, then expose at most one actionable notice through server projection policy. |
| `not_yet` left open for passive reuse | **Change.** End the completed offer; later creation requires new evidence. |
| Feature flag gates fresh reads but leaves already-observed cached surfaces | **Change.** Observed flag-off must remove all cached and navigable surfaces without deleting rows. |
| Tutor-produced re-check verdicts | **Remove.** The independent server-side judge owns the verdict; tutor output contains no lifecycle decision. |
| Event foreign key cascades notices during transcript purge | **Change.** Retain the notice and immutable scalar evidence identity after validating it at creation. |
| English-only clinical persistence checks | **Change.** Route all persisted learning text through the shared multilingual hybrid fail-closed gate. |
| Opaque, arrival-ordered rollback epochs | **Change.** Publish and persist a monotonic server revision with disabled-wins tie semantics. |

### Delivery Work Items

| Work Item | Forward disposition |
|---|---|
| WI-2498 — Keep mentor-notice details learner-only in proxy reads | **Proceed.** The privacy invariant is unchanged and applies to every persisted notice, including legacy rows. |
| WI-2499 — Restore evidence-gated mentor-notice actions and receipt copy | **Retain and re-refine.** Add the three-response cap, current learning-day defer, approved source scope, and minimal receipt contract. |
| WI-2500 — Enforce mentor-notice contracts at event and stream boundaries | **Retain and re-refine.** Keep canonical boundary validation and server authority; remove interleaved and `topicId` requirements. |
| WI-2501 — Terminalize completed `not_yet` mentor-notice offers idempotently | **Retain and re-refine.** Remove push/nudge consumers from MVP verification and require new evidence for a later notice. |
| WI-2502 — Make optional mentor-notice nudges reachable and lossless | **Post-MVP.** Do not execute for the MVP. |
| WI-2503 — Serialize mentor-notice dedup and defer-before-send suppression | **Post-MVP as written.** Push/send coordination is outside MVP; preserve any work for later disposition. |
| WI-2504 — Make mentor-notice flag-off rollback remove cached surfaces | **Retain and re-refine.** Limit it to approved in-app surfaces and sources. |
| WI-2557 — Correct mentor-notice learning-day boundaries across IANA time zones | **Retain the in-app boundary.** Current-learning-day deferral and later resurfacing need correct IANA-zone behavior; push scheduling does not. |
| WI-2623 — Amend mentor-notice authority, rollback, safety, evidence-retention, and learning-day canon | **Execute first.** It is the authority for the corrective sequence below. |
| WI-2624 — Enforce explicit producer-vendor exclusion in judge routing | **Execute before judge consumers.** It establishes independent routing for re-check and clinical judging. |
| WI-2625 — Make mentor-notice re-check outcomes independently server-judged | **Execute after WI-2623, WI-2500, WI-2501, and WI-2624.** Remove tutor verdicts and converge both transports. |
| WI-2627 — Make mentor-notice rollback observations monotonic across deployments | **Execute after WI-2504.** Extend cache eviction into an ordered cross-deployment policy. |
| WI-2628 — Fail closed on multilingual clinical inferences in persisted learning text | **Execute after WI-2624.** Apply the shared gate to every persistence boundary. |
| WI-2629 — Retain mentor-notice evidence identity after transcript purge | **Execute after WI-2500.** Forward-repair the FK without rewriting landed migrations. |

## 9. Verification expectations

- Contract tests cover valid and malformed proposals at every production boundary.
- Real-database tests cover evidence ownership, duplicate replay/concurrency, one-actionable projection, and state transitions.
- API and mobile tests cover self versus proxy visibility, server-success-gated navigation, current-learning-day defer, three-response re-check completion, 21-day fade, and observed flag-off cache invalidation.
- Prompt evaluation covers a genuine gap and a clean answer in both homework and ordinary learning, rejection of fabricated evidence, no interleaved signal, and no promissory streaming prose.
- Judge-routing tests cover both router modes, primary/fallback paths, supported producer vendors, and the former double-inversion failure.
- Re-check tests cover both transports, every exact verdict/reason pair, response-cap fallback, retry idempotency, and tutor-prompt snapshots; the judge prompt also passes a live eval.
- Clinical-safety tests use a ten-language and cross-language corpus, prove every persistence call site is gated, and include a live judge-prompt eval.
- Real-database purge tests prove event deletion retains notices and original `answerEventId` values while profile/session deletion still cascades.
- Rollout tests demonstrate complete in-app behavior with the flag on and complete observed invisibility with the flag off, including lower/same/higher revisions, restart hydration, storage failure, stale payloads, and off-period fade.
