# Activation Funnel Queries (WI-1504)

First-party launch activation instrumentation. All rows live in the
`activation_events` table in Neon (Postgres) — no third-party analytics sink
is wired for MVP (PostHog etc. is a deliberate post-MVP fast-follow; see
`apps/api/src/services/analytics.ts`, which is unrelated — that's the
`hashProfileIdForAnalytics` HMAC helper, out of scope here).

## Schema

`packages/database/src/schema/activation-events.ts` — see that file for the
authoritative column list. Summary:

| Column | Notes |
|---|---|
| `profile_id` | **Nullable.** Set once a profile exists. **Interim contract (WI-1689):** `app_opened` and `signup_started` are gated client-side on an existing Clerk session (see `use-activation-launch-events.ts`, `sign-up.tsx`), so neither fires for a genuinely signed-out, pre-account visitor. `profile_id` can still be null on these two events during the narrow window between Clerk session creation and this app's own profile-row creation (mid-onboarding) — that's the only remaining null-`profile_id` case for client-sent events, not a raw pre-signup visitor. See the funnel-denominator caveat in the event inventory below and the follow-up work item WI-1803 (anonymous ingest). |
| `anonymous_id` | Client-generated device/anon id. Present on client-driven events; may also be forwarded on server-recorded events if the client sends it, to let pre- and post-signup rows for the same device be joined. |
| `event_type` | One of the 10 launch-critical events below. Forward-only allow-list enforced by the `activation_events_event_type_known` CHECK constraint. |
| `occurred_at` | When the event happened (client-reported for ingest-route events, server time for server-recorded events). |
| `environment`, `app_version`, `platform` | Build/environment provenance, so staging/dev noise is identifiable and excludable from launch-funnel numbers. |
| `profile_shape` | Best-effort segment (`solo_owner` \| `guardian` \| `child` \| `proxy` \| `unknown`). See caveat below — most rows are `unknown` for the owner case; join `profiles.has_family_links` for exact segmentation. |
| `route` | The route/service/screen source (e.g. `POST /subjects`, `onboarding.language_step`). |
| `metadata` | jsonb — free-form, additive detail (e.g. `{subjectId}`, `{sessionId}`). **Never** raw learning content or sensitive child data — see the guard in `services/activation-events.ts`. |
| `created_at` | Row insert time. Indexed — use this (not `occurred_at`) for funnel windowing unless you specifically need client-reported time. |

## Event inventory — which are launch-critical, and how they're recorded

| Event | Launch-critical? | Recorded by | Notes |
|---|---|---|---|
| `app_opened` | Yes — funnel denominator | Client → `POST /activation-events` | Dedup: 1 row/device/UTC day. **Interim contract:** gated on an existing Clerk session, so it does not fire for a signed-out/pre-account app open — this is *not* a true "every cold launch" denominator until WI-1803 (anonymous ingest) lands. Pre-signup drop-off is not observable in this interim state. |
| `signup_started` | Yes | Client → `POST /activation-events` | Fires only after a Clerk session is established (not pre-account); `profile_id` is nullable only during the brief session-to-profile-creation window, not for a signed-out visitor. |
| `signup_completed` | Yes | Server — `routes/profiles.ts`, at owner-graph creation (`createIdentityGraph`) | 1 row/profile ever (dedup on profile id). |
| `onboarding_completed` | Yes | Client → `POST /activation-events` | **Deviation from the "server records what it can reach" default:** the API has no single terminal "onboarding complete" transition — `routes/onboarding.ts` only exposes independent PATCH steps (language / pronouns / interests), and the mobile client owns the onboarding wizard's completion state. Recorded via the ingest route instead. |
| `first_subject_or_lesson_started` | Yes | Server — `routes/subjects.ts`, `POST /subjects` | 1 row/profile ever. |
| `first_session_started` | Yes | Server — `routes/sessions.ts`, both session-start routes | 1 row/profile ever. |
| `first_session_completed` | Yes | Server — `services/session/session-filing-dispatch.ts` → `dispatchSessionCompletedEvent` | Single choke point shared by all 3 completion routes (`/close`, `/summary`, `/summary/skip`). 1 row/profile ever. |
| `review_card_seen` | Secondary | Client → `POST /activation-events` | Dedup by `occurrenceId` (pass the card id) so multiple distinct cards in one day each record. |
| `review_card_tapped` | Secondary | Client → `POST /activation-events` | Same dedup pattern as above. |
| `day2_return` | Yes — retention signal | Client → `POST /activation-events` | Client computes "this is a return on day N+1" and reports it; the server does not independently derive it (no cross-session first-open timestamp lookup at write time — keep this in mind if the client-computed flag is ever suspect). |

**Missing / malformed rows — how to interpret:**

- `profile_id IS NULL` can still occur for `app_opened` and `signup_started` — the narrow window between Clerk session creation and this app's own profile-row creation (mid-onboarding). Do not treat as a bug. Under the interim session-gated contract (WI-1689), neither event fires for a genuinely signed-out, pre-account visitor at all: a user who never establishes a Clerk session produces zero activation-funnel rows, so pre-signup drop-off is not observable until WI-1803 (anonymous ingest) lands.
- A gap in `first_session_started` → `first_session_completed` for a profile means the session was abandoned (not necessarily an instrumentation bug) — cross-check against `learning_sessions` before assuming a tracking miss.
- All writes go through `safeWrite()` (`services/safe-non-core.ts`), so a write failure is captured in Sentry (surface tags: `*.first_session_started`, `*.first_session_completed`, `profiles.create.signup_completed`, `subjects.create.first_subject_or_lesson_started`, `activation-events.ingest`) but never breaks the user-facing request. **Under-counting is possible** (silent-by-design) — if a funnel step looks anomalously low, check Sentry for the matching surface tag before concluding it's a real drop-off.
- `event_type` is a closed allow-list (DB CHECK) — a client sending an unrecognized value gets rejected at the schema layer (`activationEventIngestRequestSchema` in `@eduagent/schemas`) before it ever reaches the DB, so a malformed `event_type` should never appear as a row.

## Queries

All queries assume `psql` / Neon SQL editor. Substitute a date range as needed;
examples use a rolling 30-day window. Exclude non-production noise by adding
`AND environment = 'production'` — the mobile client (WI-1689) now sends
`environment` consistently on every client-driven event.

### 1. Signup completion (signup_started → signup_completed)

Client-reported `signup_started` carries no `profile_id` during the brief
window between Clerk session establishment and this app's own profile-row
creation (not a pre-account/signed-out event under the interim session-gated
contract — see the schema table above), so it can only be joined to
`signup_completed` via `anonymous_id` IF the
client forwards the same `anonymous_id` on both calls. As of WI-1689 the
mobile client generates and persists a device-scoped `anonymous_id` and sends
it on every client-driven event (including `signup_started`), but
`POST /v1/profiles` (which records `signup_completed`) does not yet accept or
forward an `anonymousId` field — the join below still requires that follow-up
wiring on the profiles-bootstrap route (server-owned, out of WI-1689's
client-only scope). Until then, report the two counts independently:

```sql
SELECT
  count(*) FILTER (WHERE event_type = 'signup_started')   AS signup_started,
  count(*) FILTER (WHERE event_type = 'signup_completed') AS signup_completed
FROM activation_events
WHERE created_at >= now() - interval '30 days';
```

With `anonymous_id` correlation wired:

```sql
WITH started AS (
  SELECT anonymous_id, min(created_at) AS started_at
  FROM activation_events
  WHERE event_type = 'signup_started' AND anonymous_id IS NOT NULL
    AND created_at >= now() - interval '30 days'
  GROUP BY anonymous_id
),
completed AS (
  SELECT anonymous_id, profile_id, min(created_at) AS completed_at
  FROM activation_events
  WHERE event_type = 'signup_completed' AND anonymous_id IS NOT NULL
    AND created_at >= now() - interval '30 days'
  GROUP BY anonymous_id, profile_id
)
SELECT
  count(started.anonymous_id)                    AS started,
  count(completed.anonymous_id)                  AS completed,
  round(
    100.0 * count(completed.anonymous_id) / nullif(count(started.anonymous_id), 0),
    1
  ) AS completion_pct
FROM started
LEFT JOIN completed USING (anonymous_id);
```

### 2. Onboarding completion (signup_completed → onboarding_completed)

```sql
WITH signed_up AS (
  SELECT profile_id, min(created_at) AS signed_up_at
  FROM activation_events
  WHERE event_type = 'signup_completed'
    AND created_at >= now() - interval '30 days'
  GROUP BY profile_id
),
onboarded AS (
  SELECT profile_id, min(created_at) AS onboarded_at
  FROM activation_events
  WHERE event_type = 'onboarding_completed'
    AND profile_id IS NOT NULL
  GROUP BY profile_id
)
SELECT
  count(signed_up.profile_id)                     AS signed_up,
  count(onboarded.profile_id)                      AS onboarded,
  round(
    100.0 * count(onboarded.profile_id) / nullif(count(signed_up.profile_id), 0),
    1
  ) AS completion_pct
FROM signed_up
LEFT JOIN onboarded USING (profile_id);
```

### 3. First-session start (signup_completed → first_session_started)

```sql
WITH signed_up AS (
  SELECT profile_id, min(created_at) AS signed_up_at
  FROM activation_events
  WHERE event_type = 'signup_completed'
    AND created_at >= now() - interval '30 days'
  GROUP BY profile_id
),
first_session AS (
  SELECT profile_id, min(created_at) AS first_session_at
  FROM activation_events
  WHERE event_type = 'first_session_started'
  GROUP BY profile_id
)
SELECT
  count(signed_up.profile_id)                          AS signed_up,
  count(first_session.profile_id)                      AS started_first_session,
  round(
    100.0 * count(first_session.profile_id) / nullif(count(signed_up.profile_id), 0),
    1
  ) AS completion_pct,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM first_session.first_session_at - signed_up.signed_up_at)
  ) AS median_seconds_to_first_session
FROM signed_up
LEFT JOIN first_session USING (profile_id);
```

### 4. First-session completion (first_session_started → first_session_completed)

```sql
WITH started AS (
  SELECT profile_id, min(created_at) AS started_at
  FROM activation_events
  WHERE event_type = 'first_session_started'
    AND created_at >= now() - interval '30 days'
  GROUP BY profile_id
),
completed AS (
  SELECT profile_id, min(created_at) AS completed_at
  FROM activation_events
  WHERE event_type = 'first_session_completed'
  GROUP BY profile_id
)
SELECT
  count(started.profile_id)                       AS started,
  count(completed.profile_id)                      AS completed,
  round(
    100.0 * count(completed.profile_id) / nullif(count(started.profile_id), 0),
    1
  ) AS completion_pct
FROM started
LEFT JOIN completed USING (profile_id);
```

### 5. Day-2 return (signup_completed → day2_return)

```sql
SELECT
  count(DISTINCT su.profile_id)                              AS signed_up,
  count(DISTINCT d2.profile_id)                               AS returned_day2,
  round(
    100.0 * count(DISTINCT d2.profile_id) / nullif(count(DISTINCT su.profile_id), 0),
    1
  ) AS day2_return_pct
FROM activation_events su
LEFT JOIN activation_events d2
  ON d2.profile_id = su.profile_id
  AND d2.event_type = 'day2_return'
WHERE su.event_type = 'signup_completed'
  AND su.created_at >= now() - interval '30 days';
```

### 6. Full funnel, one query (counts only, no join-through-time)

```sql
SELECT
  event_type,
  count(*)                          AS total_events,
  count(DISTINCT profile_id)        AS distinct_profiles,
  count(DISTINCT anonymous_id)      AS distinct_anon_ids,
  min(created_at)                   AS first_seen,
  max(created_at)                   AS last_seen
FROM activation_events
WHERE created_at >= now() - interval '30 days'
GROUP BY event_type
ORDER BY
  array_position(
    ARRAY['app_opened','signup_started','signup_completed','onboarding_completed',
          'first_subject_or_lesson_started','first_session_started',
          'first_session_completed','review_card_seen','review_card_tapped',
          'day2_return'],
    event_type
  );
```

### 7. Profile-shape segmentation caveat

`profile_shape` is `unknown` for most owner-context rows (see the schema
table above and `deriveActivationProfileShape` in
`apps/api/src/services/activation-events.ts`) because `ProfileMeta` doesn't
carry `has_family_links`. For exact owner-vs-guardian segmentation, join to
`profiles`:

```sql
SELECT
  ae.event_type,
  CASE
    WHEN p.is_owner AND p.has_family_links THEN 'guardian'
    WHEN p.is_owner THEN 'solo_owner'
    ELSE 'child'
  END AS profile_shape_exact,
  count(*) AS total
FROM activation_events ae
JOIN profiles p ON p.id = ae.profile_id
WHERE ae.created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```
