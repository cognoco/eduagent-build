# WI-2826 execution provenance: server-owned seed retarget

Date: 2026-08-02

## Why the execution surface changed

The first WI-2826 implementation on PR #2811, revision
`140c5233099d35d62e2c8ef250a44cd6a1dc3071`, timed the Playwright helper's
client-side Clerk lookup and verification calls. WI-2948 subsequently landed
PR #2812 at `066a31c14ab2bf6c0e64ee22061f62de4f99df60`. That change removed those
credential-bearing client calls and made `/v1/__test/seed` responsible for
Clerk provisioning.

Reintroducing the removed calls merely to retain the old measurement points
would reverse WI-2948's fail-closed credential boundary.

## PgM ruling and trace

On 2026-08-02, the PgM applied the established WI-2806/WI-2628 execution
precedent: WI-2826 remains Executing under its existing claim; its Cosmo
Acceptance Criteria are not edited and refinement is not reopened. This
tracked note records the current implementation trace instead.

The removed client-side Clerk lookup and verification timing is retargeted to
the current server-owned seed surface:

- `phase=seed-request` measures the in-flight `/v1/__test/seed` request, which
  now includes server-owned Clerk provisioning.
- `phase=seed-backoff` identifies a retry wait for that same server-owned
  operation.
- `readiness=server-owned-seed-response` records successful completion of the
  operation without claiming visibility into deprecated client subphases.

The diagnostic still emits only the allowlisted phase, elapsed time, attempt,
HTTP status class, pathname, and readiness marker. It does not perform a Clerk
request and does not retain credentials, headers, bodies, query data, storage
state, traces, screenshots, or video.

## Completion-evidence requirement

The eventual WI-2826 completion summary and evidence manifest must cite this
file when mapping the original Clerk timing language to the current
server-owned seed implementation. A hosted seeded-account proof remains gated
on operator authorization of the exact corrected revision and a named
disposable preview target.
