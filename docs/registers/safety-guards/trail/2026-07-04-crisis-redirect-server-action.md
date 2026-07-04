# Trail record — add the crisis-redirect row (server-side telemetry action)

**Date:** 2026-07-04
**Change:** Added row 5 (crisis-redirect) to
`docs/registers/safety-guards/master.md`, and updated the Provenance note
(remaining un-reproduced WI-1285 sites: four → three).
**WI:** WI-1358 (Server-side action on crisis_redirect — telemetry hardening,
ruled §6(b))

## Why

The crisis-redirect site was one of the four WI-1285 SAFETY-block inventory
sites the seed register deliberately left un-reproduced. The **WI-1352**
safeguarding spike concluded that a broad abuse tripwire cannot clear the
precision bar, and that the best available server-side lever is to **act on
`crisis_redirect` itself** — which, before this change, was telemetry-only
with the §6(b) guardian-notification question undecided.

## The ruling (se-032, §6(b))

The operator ruled Option (c) plus a telemetry carve-out:

- The server takes **NO guardian-notification action on `crisis_redirect`,
  ever.** Guardian-notify is ruled **out on the merits** — the
  guardian-is-the-abuser failure mode makes it actively unsafe for the abuse
  case.
- **No T&S queue** at MVP. **No mandatory-reporting integration** — deferred
  to post-launch legal review; explicitly NOT wired.
- **Telemetry carve-out (the server-side action that WAS built):** the
  crisis-redirect firing must never be silent (silent recovery is banned on
  safety paths). `emitCrisisRedirectEvent` now emits, on every firing:
  1. a **reliable server-side log** (`logger.warn`);
  2. a **structured operator alarm** — a warning-level Sentry `captureMessage`
     that surfaces in the operator console with alerting + volume checks; and
  3. a queryable Inngest telemetry event via `safeSend` (non-core
     observability — failure captured in Sentry, never throws, never breaks
     the learner-facing reply).

## Privacy constraint (hard)

Every sink carries **metadata only** — a correlation `eventId` plus
profileId-scoped pointers (session id, flow, provider, model). The learner's
disclosure text and any raw minor PII **never** reach Sentry or Inngest (US
third-party event stores). Shipping the disclosure would re-leak the very
sensitive content this path exists to handle safely.

## Learner-facing behaviour is unchanged

The learner-facing reply (empathise + trusted-adult / helpline redirect,
**never** the guardian) is authored by the LLM per the SAFETY block and the
WI-1359 abuse-disclosure tripwire. WI-1358 did not touch it.

## Evidence

- Code: `apps/api/src/services/exchanges.ts` (`emitCrisisRedirectEvent`).
- Tests: `apps/api/src/services/exchanges.crisis-redirect.test.ts` — operator
  alarm emitted; alarm payload is a closed metadata key-set with no disclosure
  content; NEGATIVE test proving no guardian-facing dispatch fires. Red-green
  verified (removing the alarm fails the four WI-1358 tests).
- Lockstep DPIA: `docs/compliance/edpb_dpia_filled_2026_v1.md` §2.3.d.
