# Now affordance-truth audit — 2026-07-20

## Question

Does each visible Now-card CTA do what its copy promises, for the audience that
can see it, in one activation? This audit follows code, not project memory:

`now-feed.ts producer → NowCard.tsx copy → mentor.tsx dispatch →
now-deep-link.ts/action handler → terminal screen/state`.

## Verdict

The reported **Start challenge** affordance was false in two ways:

1. Its producer treated a recently completed session as Challenge readiness,
   without evaluating the real readiness gate.
2. Its destination opened a topic page and then ordinary learning; it never
   entered the Challenge state machine.

An immediate-entry implementation was prototyped, then rejected during ADR
review because it bypassed the server-owned readiness protections. WI-2351
instead removes the false `challenge_ready` card from live Now composition.
Challenge Round remains organically offered inside an eligible topic-bound
learning session.

Question novelty is a separate defect tracked by WI-2464. One sibling
affordance mismatch remains: **Review** and **Work on it** both stop at a topic
overview. That is captured as WI-2505.

## Surface matrix

| Card | Visible promise | Terminal behavior | Verdict |
|---|---|---|---|
| `billing_alert` | Manage billing | Subscription management | Truthful. |
| `unfinished_session` | Continue | Existing session chat | Truthful. |
| `mentor_notice` | Check it now | Re-check mutation, then returned session | Truthful. |
| `retention_due` | Review | Topic overview awaiting another tap | Mismatch; WI-2505. |
| `parked_item` | Open | Topic overview or source session | Truthful for “Open.” |
| `needs_deepening` | Work on it | Topic overview awaiting another tap | Mismatch; WI-2505. |
| `challenge_ready` | Start challenge | Previously ordinary learning; now not emitted by Now | False affordance removed in WI-2351. |
| `ledger_moment` | Moment-specific action | Subject/topic/session/journal destination | Truthful for current informational cards. |
| `support_hub_pointer` | Open | Switches to supporter-hub Mentor scope | Truthful. |

## ADR and code findings

- `getAssessmentEligibleTopics()` checks completed/auto-closed sessions,
  exchange count, recency, ownership, and active assessment identity. It does
  not compute Challenge readiness.
- `evaluateChallengeReadiness()` additionally requires normal struggle state,
  minimum exchanges, correct streak, solid-answer evidence, sufficient quota,
  cooldown clearance, and no existing live round.
- MMT-ADR-0022 requires Now moments to be derived from operational systems of
  record. A loose proxy is not enough for a strong action promise.
- Accepted MMT-ADR-0017, MMT-ADR-0031, and MMT-ADR-0032 make Challenge evidence
  conservative and provenance-sensitive; a UI entry seam must not weaken that
  posture.
- Proposed MMT-ADR-0034 is not canon, but its Context corroborates the current
  code-level purpose of the struggle gate: it protects learners with known weak
  concepts from an all-or-nothing instrument.

## Runtime evidence

A read-only staging lookup found the reported Sylvia Plath session
`019f675d-64a9-7d87-ae22-01f5a97a77e7` (2026-07-15 20:00–20:06 UTC). It has
five exchanges and no persisted `challengeRound` state. The five stored mentor
responses have distinct content hashes, so persistence does not show exact
byte-for-byte duplication; it decisively shows that the advertised Challenge
journey never entered Challenge at all. No Sylvia/Plath match exists in the dev
or production databases.

The active simulator runbook is `apps/api/eval-llm/README.md` under
“Challenge-Round simulated-learner harness”. A one-round live smoke on
`CRS06-photosynthesis-verified` reproduced the qualitative repetition problem:
all three questions probed sunlight's role with near-identical reasoning. The
second was the simulator's constant fallback after an envelope schema failure,
yet grader `signalEmitted` remained true; the expected-verified learner was
under-credited as `partial`. The gitignored corpus is
`apps/api/eval-llm/corpus/2026-07-20T06-04-08-213Z/`.

This N=1 smoke is reproduction evidence, not calibration evidence. WI-2464's
refined criteria require literature/prior-lesson history, repeat-rate metrics,
distinct-concept coverage, and explicit tutor-fallback accounting.

## Why tests missed it

The old tests stopped at component seams: a producer emitted a card, a path
builder formed a URL, and an isolated state machine handled organic offers.
No assertion proved that the producer's data satisfied the actual readiness
gate or that pressing the rendered CTA reached Challenge state.

The minimum action-affordance regression shape is:

`seed authoritative producer state → render real action → press CTA → cross
route/action boundary → assert user-recognisable terminal state`.

For gated LLM-backed actions, also prove the surface and terminal use the same
server-owned eligibility decision. If that proof cannot be made, do not show a
strong action CTA.

## Verification

- Full API unit suite: 8,300 passed, 9 skipped, 0 failed.
- Focused Now unit suites: 24 passed, 0 failed.
- DB-backed Now route integration: 12 passed, 0 failed.
- API typecheck, affected-file lint, and `git diff --check`: passed.
