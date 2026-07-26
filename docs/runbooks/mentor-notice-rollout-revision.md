# Runbook — mentor-notice rollout: flag + policy revision

Operating the mentor-notice rollout boundary. Two bindings, not one, and they do
different jobs.

> **This runbook documents how the bindings work. It does not change any deployed
> value, and following it is not itself an activation.** The mentor-notice
> rollout is off in every environment and stays off until a separate,
> deliberate activation decision (MMT-ADR-0036 §3.1 keeps the MVP in-app only).
> Nothing here authorises turning it on.

## The two bindings

| Binding | Type | Default | What it does |
|---|---|---|---|
| `MENTOR_NOTICE_ENABLED` | `'true'` \| `'false'` | `'false'` | The kill switch. `'false'` strips notice data from every read projection and answers 404 on the notice mutations. |
| `MENTOR_NOTICE_POLICY_REVISION` | nonnegative integer, as a string | absent → `0` | Orders rollout observations across deployments. Clients only re-enable a notice surface on a **strictly higher** revision. |

Both live in Doppler. Neither is set in any current config; both resolve to
their defaults.

## Why a revision exists at all

`MENTOR_NOTICE_ENABLED` answers *"is the rollout on right now?"*. It cannot
order two answers. A client that receives `enabled=false` and then, out of
order, an older in-flight `enabled=true` has no way to know the second response
is stale — so a cached notice surface can come back after an emergency
flag-off. That defeats the rollback boundary.

The revision supplies the ordering:

- A **lower** revision than the client last observed is **ignored**.
- At the **same** revision, **disabled wins** (a tie can only tighten).
- Only a **strictly higher** revision can re-enable.

Consequence to internalise: **turning the flag back on at the same revision does
not re-enable clients that already observed the flag-off.** That asymmetry is
deliberate — it is what makes rollback irreversible-by-accident — and it is the
one thing most likely to surprise an operator mid-incident.

## Emergency rollback

1. Set `MENTOR_NOTICE_ENABLED=false` in the target Doppler config.
2. Deploy the worker (a config change alone does not reach running clients).

That is the whole rollback. **Do not bump the revision to roll back** — you do
not need it. The flag-off already changes the projection epoch, which re-keys
every persisted client projection, and reports `rolloutEnabled: false`, which
the client's monotonic store applies at the current revision under
disabled-wins.

## Re-enabling after a rollback

Re-enabling takes **two** changes, in this order:

1. `MENTOR_NOTICE_POLICY_REVISION` = **strictly greater** than the value in
   effect during the rollback (if it was absent, it was `0` — so set `1`).
2. `MENTOR_NOTICE_ENABLED=true`.
3. Deploy.

Setting the flag without raising the revision leaves every client that observed
the rollback disabled. That is not a bug to work around — it is the boundary
doing its job. Raise the revision.

Never *lower* the revision. A lower value is ignored by every client that has
already observed a higher one, so it produces a fleet split by observation
history rather than by configuration — the hardest possible state to reason
about during an incident.

## Reading the observation

Every notice-bearing response carries `mentorNoticePolicy`:

```json
{
  "rolloutRevision": 3,
  "rolloutEnabled": true,
  "projectionEpoch": "notice-policy-v1:r3:on:self:consented"
}
```

- `rolloutRevision` — the deployment's revision. The only orderable field.
- `rolloutEnabled` — the **deployment** flag, and nothing else. It stays `true`
  on a response that was tightened for *this request* (a proxy session, a
  caller who is not the subject, a subject who withdrew consent). Those
  tightenings are visible in `projectionEpoch`, not here — see below.
- `projectionEpoch` — the opaque cache-binding token. Clients store it and key
  their persisted projection on it; they never parse it.

**Diagnostic tip.** `projectionEpoch` tells you *why* a given request saw no
notice data, without needing client logs:

| Suffix | Meaning |
|---|---|
| `:off` | Kill switch thrown. |
| `:on:proxy` | Caller declared an explicit proxy session. |
| `:on:other-subject` | Caller is not the selected subject. |
| `:on:self:withdrawn` | Subject withdrew LLM-processing consent. |
| `:on:self:consented` | The only state under which notice data is projected. |

**Do not read `rolloutEnabled: true` as "this response contained notice data."**
It means the rollout is on. Whether *this* request was allowed notice data is
the epoch suffix — and only `:on:self:consented` is a yes.

## Fade is not gated on the flag

The nightly fade job (`mentor-notice-fade`, 03:45 UTC) retires notices inactive
for 21 days and **runs regardless of the flag**. It emits nothing to any client;
it retires stale learner-private rows. Running it while the rollout is off is
what makes "a re-enable reveals only currently-eligible records" true rather
than aspirational — otherwise an off-period banks records that age but are never
retired. Read-time collection applies the same 21-day window, so eligibility
does not depend on whether the cron has happened to run yet.

## References

- Predicate + epoch derivation: `apps/api/src/services/mentor-notices/visibility.ts`
- Revision resolution (and why malformed clamps to `0`): `apps/api/src/config.ts` → `resolveMentorNoticePolicyRevision`
- Observation wire contract: `packages/schemas/src/mentor-notices.ts`
- Inactivity window shared by fade and collection: `apps/api/src/services/mentor-notices/state.ts` → `MENTOR_NOTICE_INACTIVITY_DAYS`
- MVP scope boundary: MMT-ADR-0036 §3.1
