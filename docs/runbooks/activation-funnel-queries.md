# Activation Funnel Queries (WI-1762)

Supported first-party query surface for closed-beta activation review. Events land in the `activation_events` table in the environment-specific Neon database. No third-party analytics sink is part of MVP.

The authoritative row shape is `packages/database/src/schema/activation-events.ts`. Despite its historical column name, `activation_events.profile_id` has a direct foreign key to `person.id`; identity-capacity joins below therefore use the person-keyed v2 tables directly.

## Operator contract

Run these queries with `psql` against the intended environment-specific Neon connection. The connection is the environment boundary: server-owned events currently store `environment IS NULL`, so a row-level environment filter cannot safely distinguish production from staging. Confirm the selected Doppler config/connection first, then set a half-open UTC range so adjacent reviews do not double-count boundary events:

```psql
\conninfo
\set from_ts '2026-07-01T00:00:00Z'
\set to_ts '2026-07-15T00:00:00Z'
```

Stop if `\conninfo` does not match the intended environment's approved connection. The `environment` column remains useful diagnostic provenance for client-owned events; it is not an authorization or database-selection control.

The output is the review artifact. Do not export the raw table. Record the database environment, range, query revision/commit, and execution timestamp with beta-review notes.

## Event inventory

| Event | Owner | Identity key | Counting note |
|---|---|---|---|
| `app_opened` | Client | anonymous device | Signed-in app opens only; the authenticated endpoint cannot observe signed-out or first-ever opens. Once per device/UTC day by default. |
| `signup_started` | Client | anonymous device | Pre-account; `profile_id` is null. |
| `signup_completed` | Server | profile | First owner graph creation. The server does not yet receive the pre-signup anonymous id. |
| `onboarding_completed` | Client | profile + anonymous device | Client owns the terminal wizard transition. |
| `first_subject_or_lesson_started` | Server | profile | First subject creation. |
| `first_session_started` | Server | profile | First session start. |
| `first_session_completed` | Server | profile | Shared session-filing completion choke point. |
| `review_card_seen` | Client | profile + occurrence | Secondary activation signal. |
| `review_card_tapped` | Client | profile + occurrence | Secondary activation signal. |
| `day2_return` | Client | profile + anonymous device | Client-computed return signal. |

`signup_started` and `signup_completed` cannot currently be joined by actor: the former is anonymous and the server-owned completion event does not receive `anonymous_id`. Report those counts independently. Profile-cohort conversion starts at `signup_completed` until that correlation is deliberately added.

All writes are non-core `safeWrite()` calls. Under-counting is possible if telemetry fails; check Sentry surface tags before interpreting an anomalous drop as user behavior.

## Supported beta query surface

Aggregate-only supported surface: these queries return counts, percentages, and independently derived role/capacity flags. The surface does not select `profile_id`, `anonymous_id`, or `metadata` as raw output.

<!-- activation-query-contract:start -->

### 1. All named event counts

Returns all ten schema-defined events, including zero-count steps, in funnel order.

```sql
WITH params AS (
  SELECT
    :'from_ts'::timestamptz AS from_ts,
    :'to_ts'::timestamptz AS to_ts
),
event_order(event_type, step_order) AS (
  VALUES
    ('app_opened', 1),
    ('signup_started', 2),
    ('signup_completed', 3),
    ('onboarding_completed', 4),
    ('first_subject_or_lesson_started', 5),
    ('first_session_started', 6),
    ('first_session_completed', 7),
    ('review_card_seen', 8),
    ('review_card_tapped', 9),
    ('day2_return', 10)
)
SELECT
  event_order.step_order,
  event_order.event_type,
  count(activation_events.id) AS total_events,
  count(DISTINCT activation_events.profile_id) AS distinct_profiles,
  count(DISTINCT activation_events.anonymous_id) AS distinct_anon_ids
FROM event_order
CROSS JOIN params
LEFT JOIN activation_events
  ON activation_events.event_type = event_order.event_type
  AND activation_events.created_at >= params.from_ts
  AND activation_events.created_at < params.to_ts
GROUP BY event_order.step_order, event_order.event_type
ORDER BY event_order.step_order;
```

### 2. Profile-cohort conversion

Uses profiles whose `signup_completed` event landed inside the supplied range. Every downstream event must occur after that signup and before `to_ts`.

```sql
WITH params AS (
  SELECT
    :'from_ts'::timestamptz AS from_ts,
    :'to_ts'::timestamptz AS to_ts
),
cohort AS (
  SELECT
    activation_events.profile_id,
    min(activation_events.created_at) AS signup_at
  FROM activation_events
  CROSS JOIN params
  WHERE activation_events.event_type = 'signup_completed'
    AND activation_events.profile_id IS NOT NULL
    AND activation_events.created_at >= params.from_ts
    AND activation_events.created_at < params.to_ts
  GROUP BY activation_events.profile_id
),
profile_steps AS (
  SELECT
    cohort.profile_id,
    bool_or(activation_events.event_type = 'onboarding_completed') AS onboarded,
    bool_or(activation_events.event_type = 'first_subject_or_lesson_started') AS started_subject,
    bool_or(activation_events.event_type = 'first_session_started') AS started_session,
    bool_or(activation_events.event_type = 'first_session_completed') AS completed_session,
    bool_or(activation_events.event_type = 'day2_return') AS returned_after_signup
  FROM cohort
  CROSS JOIN params
  LEFT JOIN activation_events
    ON activation_events.profile_id = cohort.profile_id
    AND activation_events.created_at >= cohort.signup_at
    AND activation_events.created_at < params.to_ts
  GROUP BY cohort.profile_id
)
SELECT
  count(*) AS signed_up,
  count(*) FILTER (WHERE onboarded) AS onboarded,
  count(*) FILTER (WHERE started_subject) AS started_subject,
  count(*) FILTER (WHERE started_session) AS started_session,
  count(*) FILTER (WHERE completed_session) AS completed_session,
  count(*) FILTER (WHERE returned_after_signup) AS returned_after_signup,
  round(100.0 * count(*) FILTER (WHERE completed_session) / nullif(count(*), 0), 1)
    AS signup_to_session_complete_pct,
  round(100.0 * count(*) FILTER (WHERE returned_after_signup) / nullif(count(*), 0), 1)
    AS returned_after_signup_pct
FROM profile_steps;
```

### 3. Current-model role and capacity flags

Guardian, charge, supporter, supportee, and payer are independent capacities, not mutually exclusive personas. This query covers profile-attributed events only; anonymous-only events remain in query 1. It reduces membership roles to one row per person, then groups by independent current-model flags. Groups representing at least three distinct people retain their flags. Smaller groups collapse per event into one flag-less `suppressed_remainder` row so differencing against query 1 cannot reveal a rare capacity fingerprint.

```sql
WITH profile_roles AS (
  SELECT
    membership.person_id,
    bool_or('admin' = ANY(membership.roles)) AS is_admin,
    bool_or('learner' = ANY(membership.roles)) AS is_learner
  FROM membership
  GROUP BY membership.person_id
),
params AS (
  SELECT
    :'from_ts'::timestamptz AS from_ts,
    :'to_ts'::timestamptz AS to_ts
),
capacity_flags AS (
  SELECT
    activation_events.id,
    activation_events.profile_id,
    activation_events.event_type,
    coalesce(profile_roles.is_admin, false) AS is_admin,
    coalesce(profile_roles.is_learner, false) AS is_learner,
    EXISTS (
      SELECT 1
      FROM guardianship
      WHERE guardianship.guardian_person_id = activation_events.profile_id
        AND guardianship.revoked_at IS NULL
    ) AS is_guardian,
    EXISTS (
      SELECT 1
      FROM guardianship
      WHERE guardianship.charge_person_id = activation_events.profile_id
        AND guardianship.revoked_at IS NULL
    ) AS is_charge,
    EXISTS (
      SELECT 1
      FROM supportership
      WHERE supportership.supporter_person_id = activation_events.profile_id
        AND supportership.revoked_at IS NULL
    ) AS is_supporter,
    EXISTS (
      SELECT 1
      FROM supportership
      WHERE supportership.supportee_person_id = activation_events.profile_id
        AND supportership.revoked_at IS NULL
    ) AS is_supportee,
    EXISTS (
      SELECT 1
      FROM subscription
      WHERE subscription.payer_person_id = activation_events.profile_id
        AND subscription.status IN ('trial', 'active', 'past_due')
    ) AS is_payer
  FROM activation_events
  CROSS JOIN params
  LEFT JOIN profile_roles ON profile_roles.person_id = activation_events.profile_id
  WHERE activation_events.profile_id IS NOT NULL
    AND activation_events.created_at >= params.from_ts
    AND activation_events.created_at < params.to_ts
),
grouped_capacity AS (
  SELECT
    event_type,
    is_admin,
    is_learner,
    is_guardian,
    is_charge,
    is_supporter,
    is_supportee,
    is_payer,
    count(*) AS total_events,
    count(DISTINCT capacity_flags.profile_id) AS distinct_profiles
  FROM capacity_flags
  GROUP BY
    event_type,
    is_admin,
    is_learner,
    is_guardian,
    is_charge,
    is_supporter,
    is_supportee,
    is_payer
)
SELECT
  event_type,
  'reported' AS segment_visibility,
  is_admin,
  is_learner,
  is_guardian,
  is_charge,
  is_supporter,
  is_supportee,
  is_payer,
  total_events,
  distinct_profiles
FROM grouped_capacity
WHERE grouped_capacity.distinct_profiles >= 3

UNION ALL

SELECT
  event_type,
  'suppressed_remainder' AS segment_visibility,
  NULL::boolean AS is_admin,
  NULL::boolean AS is_learner,
  NULL::boolean AS is_guardian,
  NULL::boolean AS is_charge,
  NULL::boolean AS is_supporter,
  NULL::boolean AS is_supportee,
  NULL::boolean AS is_payer,
  sum(total_events)::bigint AS total_events,
  sum(distinct_profiles)::bigint AS distinct_profiles
FROM grouped_capacity
WHERE grouped_capacity.distinct_profiles < 3
GROUP BY event_type
HAVING sum(distinct_profiles) > 0
ORDER BY event_type, segment_visibility, is_admin DESC NULLS LAST;
```

<!-- activation-query-contract:end -->

## Privacy boundary

The raw endpoint contract permits only the event type plus `profileId` or client-generated anonymous id, build/environment/platform, coarse profile shape, route/source metadata, occurrence id, and additive JSON metadata. No raw learning content or sensitive child content belongs in `metadata`; producer comments and review enforce this rule, but the JSON column does not enforce a key allow-list at the database layer.

The supported beta surface is narrower than raw storage:

- Aggregate output only; no stable profile/device identifiers or metadata values.
- No raw learning content, prompts, answers, transcripts, notes, names, email, birth date, or free text.
- Neon access remains privileged operator access. This runbook does not create a product/API analytics endpoint.

If a review needs row-level debugging, treat it as an incident investigation under database-access controls, not as normal funnel reporting.

## Retention

**Raw-row retention: delete after 90 days; 121-day retention SLA.** The monthly manual purge may add at most 31 days of scheduled operational lag. Any row older than 121 days is a retention SLA breach, not an allowed extension. This supports early 30/60/90-day comparisons while making missed operations visible. Aggregated review notes may be retained with launch evidence because they contain no row identifiers.

Automation is outside this WI. Until a durable purge job exists, the launch operator owns a monthly manual purge in the target environment. Capture fixed cutoffs and run both preflight counts before approving the mutation:

```psql
SELECT now() - interval '90 days' AS retention_cutoff \gset
SELECT now() - interval '121 days' AS breach_cutoff \gset

SELECT count(*) AS retention_sla_breach_rows
FROM activation_events
WHERE created_at < :'breach_cutoff'::timestamptz;

SELECT count(*) AS rows_eligible_for_deletion
FROM activation_events
WHERE created_at < :'retention_cutoff'::timestamptz;
```

A nonzero breach count requires an operations incident record. Review the eligible count and obtain mutation approval before continuing. Then run the delete promptly in a bounded transaction:

```psql
BEGIN;
SET LOCAL idle_in_transaction_session_timeout = '5min';

WITH deleted AS (
  DELETE FROM activation_events
  WHERE created_at < :'retention_cutoff'::timestamptz
  RETURNING 1
)
SELECT count(*) AS deleted_rows FROM deleted;
```

`COMMIT` is an explicit operator decision only when `deleted_rows` equals the preflight eligible count; otherwise type `ROLLBACK`. Do not leave the session idle while deciding. Record the cutoff, execution timestamp, and deleted-row count in the beta operations log.

## Interpretation limits

- `created_at` is the supported window key. `occurred_at` can be client-reported and is unsuitable for the operational ingestion window.
- `signup_started` and `signup_completed` are independent counts until anonymous-id correlation reaches the server-owned completion event.
- Missing telemetry can be an instrumentation write failure because activation writes are deliberately non-core.
- A started-but-not-completed session can be genuine abandonment; cross-check operational health before calling it funnel loss.
- `app_opened` counts signed-in launches only; it is not a first-ever-open denominator.
- All downstream conversion metrics and counts in query 2 are right-censored at `to_ts`; compare only ranges with the same signup-observation window. `day2_return` means the user returned on any UTC day after Clerk account creation, not specifically calendar day 2, so the query reports `returned_after_signup`, not Day-2 retention. Exact Day-2 retention requires a corrected producer or a mature-cohort derivation from independently recorded opens.
