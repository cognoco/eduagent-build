# Finding — E2E Web smoke blocked fleet-wide by staging-API 5xx (2026-07-18)

**Date:** 2026-07-18 ~06:39–09:00Z
**Surface:** `E2E Web` required check (Playwright web smoke, `apps/mobile/e2e-web`, run via `doppler run -c stg`)
**Severity:** merge-blocking (required check), environmental — not code
**Observed while:** shepherding WI-2004 (PR #2239); operator asked for a close-observed re-run + findings capture.

## Symptom

`E2E Web` failed on WI-2004's PR #2239 twice (initial + one re-run), each on a shifting
subset of unrelated mobile-web flows:

- `j01-ux-pass.spec.ts:37` — single learner UX screenshot crawl (`smoke-learner`)
- `quiz-results-exits.spec.ts:104` — quiz-results exits accessibility (`smoke-accessibility`)
- `j03-parent-gateway.spec.ts:212` — 360px supporter scopes (`smoke-parent`)

All failed the same way: a Playwright `expect(locator).toBeVisible()` timeout, because the
expected screen never rendered.

## Root cause (from artifacts — not assertion drift)

Every failing test's `error-context.md` page snapshot is the **same app error-fallback screen**:

> "We could not load your profile — Looks like you're offline or our servers can't be reached.
> Check your internet connection and try again." [Retry] [Sign Out]

The Playwright trace network layer (`0-trace.trace`) for these runs shows the backend
returning, during the window, a mix of **`502`, `503`, `504`, and `net::ERR_FAILED`** (plus
`401`s consistent with auth/seed calls failing while the API is down). The app's profile load
fails → the offline/unreachable fallback renders → every downstream smoke assertion times out.

This is the "fix the staging/API target, not the assertion" case from the repo PR protocol —
here in its **transient** form: the staging API (Cloudflare Worker) was intermittently
unavailable, not permanently broken.

## Scope — fleet-wide, not PR-specific

The `E2E Web` workflow was red across **multiple unrelated PRs in the same window**, interspersed
with passes:

| Time (Z) | Branch | E2E Web |
|---|---|---|
| 07:47 | WI-2119 | failure |
| 07:43 | WI-2004 (this PR) | failure |
| 06:39 | WI-2178-rework-1 | failure |
| 05:51 | WI-2187 | success |
| 05:04 | WI-2178 | success |

`E2E Web` runs per-PR only (on `main` via `workflow_dispatch`, last run 06-15), so it does not
gate `main` pushes — which is why `main` CI stayed green while PR merges were blocked.

WI-2004's own diff is an API jest test + one markdown doc (zero mobile/web/schema files → a
byte-identical web bundle), so it provably cannot cause a mobile-web-render failure.

## Why it matters for the MVP roadmap

- **A required, merge-blocking check depends on live staging-API availability at PR time.** Any
  staging-API wobble (Worker cold-start, Neon hiccup, deploy, rate-limit) turns into fleet-wide
  merge blockage with a failure signature that *looks* like a UI regression (`toBeVisible`
  timeout) until you open the artifacts. Cost: every blocked PR re-runs a ~7-min suite and
  someone reads traces to re-derive "it's staging, not me."
- **The signal is misattributed by default.** The check name (`E2E Web` / `run-smoke`) and the
  surface error (visibility timeout on a named UI flow) point at frontend code; the real cause
  is a backend 5xx three layers down. This is itself an instance of a broader class: a health
  gate that fails *closed on an upstream dependency* without surfacing the dependency failure
  distinctly from an assertion failure.

## Candidate mitigations (not actioned here — roadmap input)

1. **Fail the smoke fast and legibly on backend-unavailable.** Detect the "We could not load your
   profile" fallback / repeated 5xx and abort with a distinct `staging-api-unavailable` status,
   separate from an assertion failure — so a red is instantly triageable as infra, not code.
2. **Retry/backoff the profile-load path in the smoke harness** (bounded) before asserting, or a
   pre-flight staging-API health probe that skips/soft-fails the suite when the API is down.
3. **Reconsider required-ness / gating** of a check whose failures are dominated by transient
   staging-API state at PR time, or point smoke at a more stable target.
4. **Alarm on staging-API 5xx** so the environmental cause is visible directly, not only via
   downstream E2E redness.

## Disposition for WI-2004

Per operator instruction (2026-07-18): re-run E2E Web once more with close observation (this
finding), then merge PR #2239 regardless of E2E Web outcome — authority granted, because the red
is a fleet-wide staging-API flake unrelated to the test+doc diff, and every check WI-2004 actually
exercises (API Quality Gate, Merge completeness, Flag-ON integration) is green.
