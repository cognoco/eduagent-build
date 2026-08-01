# BID-48 bounded hosted diagnostics authorization package

Prepared: 2026-08-01
Status: awaiting operator-named target and explicit grant
PgM ruling: package WI-2826, WI-2798, WI-2800, and WI-2805 under one shared
authorization; keep WI-2923 and WI-2795 separate.

## Decision requested from the operator

Authorize one bounded diagnostic session on one explicitly named hosted target and
one immutable repository revision for:

- WI-2826 — Instrument V2 Account owner journey phase timing;
- WI-2798 — Diagnose V2 Account non-owner subject-row readiness lag;
- WI-2800 — Diagnose V2 Account owner journey 90-second budget exhaustion; and
- WI-2805 — Diagnose V2 first-session close-to-wrap-up readiness failure.

The operator must supply:

1. the exact hosted target identity and environment classification;
2. the exact immutable revision permitted for the run;
3. confirmation that the target may execute the existing seeded-account test-fixture
   lifecycle for these four scenarios; and
4. the operator identity and ruling reference to record with the receipts.

Recommended target: a dedicated disposable development or preview target whose
identity can be verified before execution. Shared development, staging, or production
is not inferred from this package; naming one of those requires an explicit ruling.

## Preconditions

- WI-2826 PR #2811 currently remains draft at `140c5233099d35d62e2c8ef250a44cd6a1dc3071`.
  The operator grant must bind a later live-verified immutable revision if that head
  changes. The run may not silently follow a moving branch.
- The target preflight must match the operator-named identity before any scenario
  begins. A mismatch consumes no run and performs no mutation.
- Existing target credentials must be obtained through the estate secret contract;
  no secret is printed, persisted, uploaded, rotated, or copied between environments.
- No schema, database-role, Clerk, Doppler, deployment, feature-flag, or shared
  configuration mutation is authorized by this package.

## One-session execution sequence

Run sequentially, retaining one shared session manifest and one receipt per scenario:

1. WI-2826 / WI-2800 owner Account journey — retain the allowlisted phase and elapsed
   diagnostics across seed, Clerk, sign-in, Account entry/readiness, leaf readiness,
   browser Back, Account return, and initiating-tab return. The same evidence serves
   WI-2826's instrumentation proof and WI-2800's root-cause attribution.
2. WI-2798 non-owner Account journey — retain request/query timing and readiness state
   for `/subjects`, `/library/books`, and `/progress/overview` at the exact boundary
   where the seeded subject row is present or withheld.
3. WI-2805 first-session close journey — retain the closeSession status class,
   callback observation, pathname transition, and named render/readiness state from
   Finish through first-session wrap-up.

At most one invocation of each named scenario is authorized. A failure is evidence;
do not retry, widen a timeout, split a journey into fresh budgets, quarantine a test,
or run an unlisted scenario.

## Shared safety and data boundaries

- Preserve existing 90-second budgets, retry policy, workers, serialization, and
  release membership.
- Retain only allowlisted diagnostics: Work Item/scenario, phase, elapsed time,
  attempt count, HTTP status class, URL pathname, and named readiness marker.
- Never retain credentials, secrets, tokens, cookies, headers, request/response
  bodies, storage state, query payload/data, screenshots, video, traces containing
  unrestricted payloads, or copied user data.
- Use only the repository's existing test-fixture creation and cleanup paths. Do not
  inspect, edit, or clean up pre-existing user data.
- Do not deploy code or mutate schema, roles, environment variables, Clerk, Doppler,
  feature flags, timeouts, retries, workers, quarantine state, staging configuration,
  or production.
- Stop immediately on target-identity mismatch, secret-redaction failure, unexpected
  environment classification, cleanup refusal, or evidence outside the allowlist.

## Required evidence

The executor must preserve a sanitized durable package containing:

- the operator ruling reference, exact target identity, exact revision, timestamps,
  and command/scenario identities;
- preflight and postflight identity equality;
- one terminal outcome per scenario, including failures and timeouts without rerun;
- the allowlisted phase/request/readiness evidence needed for AC-by-AC attribution;
- fixture cleanup status and confirmation that no configuration or schema mutation
  occurred; and
- explicit disposition for each observation: existing canonical owner, factual
  Finding Occurrence, or no defect reproduced. New observations are recorded in the
  Finding Occurrence database, not captured directly as Work Items.

## Explicit exclusions

- WI-2923 development Clerk/Doppler audience configuration is not included.
- WI-2795 Workers Logs access or controlled staging reproduction is not included.
- Approval to run does not grant merge authority, close authority, shared-development
  database authority, staging configuration authority, or production authority.

## Requested ruling format

```text
Approved / denied / deferred:
Named hosted target:
Environment classification:
Authorized immutable revision:
Fixture lifecycle allowed: yes / no
Operator identity:
Ruling reference:
Additional boundaries:
```
