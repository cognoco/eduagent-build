# 13–16 family-join guardian-consent ceremony

**Status:** Provisionally approved for delivery under the MMT-ADR-0010 rider;
final ratification is tracked in OPQ-160 and is not a live delivery blocker.

**Work item:** WI-2037 — design the 13–16 join-my-family consent and guardian
posture · **Implementation slice:** WI-2533 — attach verified guardians to
credentialed learners · **Join slice:** WI-1753 — cross-account existing-teen
family join

**Authority:** MMT-ADR-0010 under its 2026-08-01 provisional-approval rider.
This spec is the L3 implementation contract, not the source of decision
authority.

## 1. Purpose and settled rule

A credentialed learner aged 13–16 may have their own Login while still being
below the digital-consent age resolved from their current residence policy.
That learner can request or accept a family join, but the join cannot proceed
until a **distinct authenticated-adult authority ceremony** succeeds.

The ceremony must prove all of the following:

1. an authenticated adult session resolves to the adult's existing Person;
2. the adult is legally qualified to consent for this specific learner at the
   assurance/VPC level required by the current policy;
3. the adult accepts every required purpose for the destination Organization;
4. one atomic operation creates or confirms the global guardian→charge edge
   and writes fresh, organization- and purpose-scoped consent grants.

An invitation, an admin or Payer role, an ordinary email consent response, or
the learner's assertion about an adult never creates Guardianship. A valid
global Guardianship edge may be confirmed idempotently, but a consent grant is
never copied between Organizations. Guardianship grants no Supportership and
therefore no learning-data visibility.

Until WI-2533 lands with the regression matrix in §11, WI-1753 must permit the
cross-account join only for learners who are at least 17. This operational gate
is conservative; it does not redefine any jurisdiction's consent threshold.

## 2. Actors and authority state

- **Learner Person:** credentialed charge whose current age is 13–16. Login
  possession proves authentication only, not consent capability.
- **Adult Person:** the Person resolved from an authenticated adult Login. The
  ceremony never accepts a client-supplied adult Person as authority.
- **Destination Organization:** the family Organization receiving the learner.
  Every authorization assertion and grant is bound to it.
- **Guardian candidate:** the authenticated adult whose claimed legal
  relationship or authority is verified. "Candidate" is not a capacity.
- **Guardianship:** global guardian→charge edge created or confirmed only after
  the authority proof succeeds.
- **Consent grant:** fresh authorization for one purpose, Organization,
  jurisdiction, policy version, assurance method, and evidence set.
- **Supportership:** independent, learner-granted visibility edge. The ceremony
  neither creates nor widens it.

The resolver first determines whether the learner can self-consent from exact
age and current residence-jurisdiction policy. A `self` result bypasses this
adult ceremony. A guardian-required result enters a holding state until the
ceremony succeeds. Unknown, unsupported, or contradictory policy inputs fail
closed; they never fall back to self-consent.

## 3. Trust boundaries and prohibited upgrades

The learner side may identify the desired family or submit a join request, but
cannot nominate, mint, or choose its own consent authority. The server owns the
adult-Person resolution, policy evaluation, Organization binding, required
purpose set, and transaction.

The following inputs carry no authority and cannot be upgraded into
Guardianship:

- an invitation sender, Organization admin, or Payer role;
- an email address entered by the learner;
- possession or redemption of an ordinary consent email token;
- an existing family Membership or Supportership;
- a client assertion that two Persons have a particular relationship.

An ordinary email consent response retains its existing narrow contract: it may
approve, deny, or withdraw an Organization- and purpose-scoped consent grant.
It does not prove the adult Person or legal relationship, cannot create
Guardianship, and cannot satisfy or resume this family-join authority ceremony.
VPC/verifier credentials and secrets remain server-side.

## 4. Input and assertion contract

The server-side attach operation accepts or derives a single immutable command
containing:

- authenticated adult session and server-resolved `adultPersonId`;
- `chargePersonId` and destination `organizationId`;
- verified relationship/qualification and its assurance level;
- verifier/provider, opaque assertion ID, assertion method, and VPC outcome;
- assertion `issuedAt`, `notBefore`, `expiresAt`, and a single-use redemption
  handle or its server-side consumed record;
- current residence jurisdiction and the selected country-policy record:
  `countryCode`, `regimeKey`, `policyVersion`, and effective window;
- the complete server-derived set of required consent purposes;
- join/consent-request IDs, correlation ID, and idempotency key.

The verifier result must be bound to the adult, learner, destination
Organization, claimed qualification, and ceremony purpose. A pass for another
adult, learner, Organization, or purpose is unusable.

The verifier is an external capability behind a narrow server-side adapter, not
an identity-proofing system MentoMate builds itself. The adapter returns only an
opaque pass/fail outcome plus the provider/assertion reference, verified
qualification, assurance level/method, bindings, and validity timestamps. Raw
identity documents, biometrics, provider credentials, and unnecessary evidence
must not enter MentoMate storage, logs, telemetry, or mobile state.

## 5. Time, replay, and idempotency

The verifier adapter defines a short hard maximum assertion TTL and a bounded
clock-skew allowance. Assertions outside `notBefore`/`expiresAt`, from a stale
policy window, or exceeding that maximum TTL fail closed even if the provider
still labels them valid.

Verification handles are single-use. After redemption, the server may issue a
short-lived opaque authority token bound to the full command tuple so a safe
retry does not require reusing the provider handle. The mobile client may keep
that token only until success, terminal failure, or expiry; it must never store
raw evidence.

An exact retry returns the original success only when adult, learner,
Organization, purposes, relationship, residence, policy version, and evidence
identity all match the committed result. Reusing an idempotency key with any
changed field is denied and audited. Replayed, mutated, or expired authority
tokens fail closed.

## 6. Atomic attach operation

The operation uses the same canonical per-Person serialization domain as other
consent mutations: `consentPersonLockKey(chargePersonId)`.

Inside one database transaction it must:

1. acquire the charge-Person lock;
2. re-read the adult and charge Persons, destination Organization, current
   residence, effective country-policy record, join request, consent requests,
   verifier redemption, and required purpose set;
3. re-evaluate consent authority and reject any drift from the asserted tuple;
4. confirm an existing global guardian→charge edge or create it with the
   verified qualification;
5. write a fresh grant for every required purpose, scoped to the destination
   Organization and current policy/evidence tuple;
6. terminalize and back-link the corresponding consent requests, and invalidate
   their older email tokens so they cannot act after attachment;
7. commit only if every edge, grant, request, and audit write succeeds.

Any failure rolls back the edge confirmation/creation and every grant. A
pre-existing valid global edge may remain, but it cannot cause partial new
Organization grants to survive. A new Organization always requires fresh
grants; the global edge is not consent portability.

## 7. Evidence and audit contract

Each grant records the existing assurance token/method and a named, versioned
`GuardianAttachEvidenceV1` envelope in `audit_fact` containing at least:

- adult and charge Person IDs, verified qualification, and edge ID;
- destination Organization and purpose;
- verifier/provider and opaque assertion reference — never raw identity
  documents, biometrics, or provider secrets;
- assurance/VPC method and level;
- residence country, jurisdiction, regime key, policy version, and policy
  effective window;
- assertion issue/not-before/expiry, ceremony completion, and grant timestamps;
- join/consent-request IDs, correlation ID, and idempotency key.

WI-2533 must prove that the present consent-grant columns plus this envelope
support querying, revocation, incident audit, and retention rules. If they do
not, it must capture and land a schema prerequisite rather than omit evidence
or weaken this contract.

## 8. Fail-closed matrix

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `holding/incomplete` | Adult or charge Person, destination Organization, effective policy, required-purpose set, consent/join request, or verifier assertion is missing. | A typed non-enumerating “We could not verify the required details” state. | The server re-resolves the complete tuple; retry is enabled only after every required input exists. |
| `holding/stale-evidence` | Verifier evidence is stale or expired. | Expired-verification guidance with no claim that the adult or family is invalid. | Start a fresh ceremony and assertion. |
| `terminal/denied` | The request or grant was withdrawn or denied. | Denied/withdrawn state with a safe return path. | Start a new request only through the ordinary initiation rules; attachment never reactivates the old one. |
| `holding/authority-mismatch` | Adult, learner, relationship, or destination Organization does not match the assertion. | Generic verification failure without revealing which unrelated entity exists. | Audit the tuple mismatch; restart with a server-resolved, verifier-bound tuple. |
| `holding/residence-drift` | Residence changes after initiation. | “Your consent requirements changed” and a retry action. | Re-resolve policy and invalidate the old assertion and purpose acceptance. |
| `holding/policy-drift` | Policy version or effective window changes. | “Consent requirements changed” and a retry action. | Re-resolve and require a fresh acceptance/evidence tuple. |
| `holding/partial` | Purpose acceptance is incomplete or any transactional write fails. | No success; a retryable or terminal error matching the underlying failure. | Roll back every new edge/grant/request/audit write; retry the whole atomic command when safe. |
| `completed` | A valid global Guardianship edge already exists and all destination grants can be written. | Normal success without duplicate-edge language. | Confirm the edge under the lock and create fresh destination grants. |
| `holding/cross-organization` | A grant from another Organization is offered as proof. | Generic verification failure. | Obtain fresh grants for the destination Organization; never copy the old grant. |
| `completed` | An exact retry matches an already committed result. | The original success state. | Return the committed result without duplicate edge, grant, or request rows. |
| `terminal/replay-rejected` | An idempotency key, verifier handle, or authority token is replayed with a mutated tuple. | Generic invalid-or-expired continuation state. | Audit the replay; restart only through a new authorized ceremony. |
| `serializing` | Concurrent ceremonies target the same charge Person. | Pending/holding while the authoritative result is selected. | Serialize on the canonical charge-Person lock; return the winner or re-evaluate after it commits. |
| `holding/provider-unavailable` | The provider is unavailable or returns an unknown outcome. | Provider-unavailable state with retry and safe exit actions. | Preserve holding; retry later or restart the provider step, never infer success. |

## 9. API and mobile consequences

The API requires three server-owned boundaries: authenticated initiation,
verifier callback/redemption, and the atomic attachment command. Routes perform
authentication and validation; identity services own policy resolution,
authority redemption, and transaction logic. Initiation returns a typed holding
state and opaque continuation data, not a pre-authorized guardian ID. Initiation
and callback surfaces must be rate-limited and anti-enumerating; no response may
reveal whether an unrelated adult, learner, email, or family exists.

Mobile must provide plain-language screens for: why adult help is required,
handoff/initiation, provider return, pending/holding, success, denial,
expiry/stale-policy, and retry. Relaunch/resume must recover only opaque
server-issued continuation state. After the verifier handle is consumed, a
network retry must use the bound authority token from §5 rather than restart an
unsafe or impossible provider redemption.

The successful ceremony resumes the join operation. It does not silently
create Supportership; any visibility grant remains its own explicit learner
ceremony and ceiling.

## 10. Migration and compatibility

WI-2037 mandates no schema migration. WI-2533 must demonstrate that the current
identity schema realizes the transaction and evidence contract or capture a
blocking schema Work Item before landing.

Existing ordinary email approvals, denials, and withdrawals continue to affect
only their scoped consent grants; those records are never upgraded to
Guardianship and cannot resume a family join.
Existing Guardianship edges provide no consent for a new Organization.
Historical grants retain their recorded jurisdiction/policy context and are
not rewritten. Rollout keeps WI-1753 at 17+ until WI-2533 is landed and its
strict-green evidence is available.

## 11. WI-2533 implementation and regression handoff

WI-2533 owns implementation. Its API/integration coverage must include adult
authentication, server-resolved Person binding, Organization binding, complete
purpose-set enforcement, request terminalization/back-links, stale email-token
invalidation, residence/policy drift, TTL and clock skew, exact and mutated
replay, wrong adult/charge, existing edge confirmation, two-connection lock
contention, idempotent retry, and full rollback on every partial-write fault.

Its mobile regressions must cover initiation and provider return, holding-state
resume after relaunch, authority-token retry after a consumed verifier handle,
success without automatic visibility, and actionable denied/expired/stale/
provider-unavailable states.

WI-2533 may develop in parallel, but may not land until this decision lands
under its provisional authority. Final ratification remains tracked in OPQ-160
without blocking delivery. WI-1753 remains 17+-only until WI-2533 lands.

## 12. Non-goals

- choosing or building a VPC/verifier vendor;
- launching managed under-13 accounts;
- child nomination of a guardian or child-minted authority;
- deciding one-guardian versus all-guardians consent where counsel must rule;
- creating Supportership, learning-data visibility, billing, or Payer rights;
- multi-Organization federation or consent portability;
- implementing code, schema, migrations, CI, or tests in WI-2037.
