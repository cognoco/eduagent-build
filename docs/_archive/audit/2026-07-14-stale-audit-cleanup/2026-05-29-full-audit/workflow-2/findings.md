# GC6 Internal-Mock Survey — Findings & Method

Companion to `README.md` (burn-down plan) and `catalog.csv` (per-site data).

## What was audited and why

CLAUDE.md → "Code Quality Guards" defines the GC6 policy: internal `jest.mock('./…')`,
`jest.mock('../…')`, and `jest.mock('@eduagent/…')` calls are **backlog, not acceptable
state**. GC1 ratchets *new* ones in CI; GC6 forces burn-down on every test-file visit.
External-boundary mocks (LLM via `routeAndCall`, Stripe, RevenueCat, Clerk/JWKS, push,
email, the Inngest framework, vendor SDKs) are sanctioned. This survey inventories the
whole codebase against that policy and sorts the debt by conversion effort.

## Method

- **Discovery (deterministic, by hand):** `git ls-files '*.test.ts' '*.test.tsx'` →
  filter to files containing an internal-looking `jest.mock(` → 164 files, 408 candidate
  lines. Per-file counts passed to the workflow as a completeness checksum.
- **Classify (workflow, 36 batches):** files bin-packed by site count (~10/batch; the
  20-site `session-completed.test.ts` ran solo). One agent per batch read each file in
  full and emitted a structured record per `jest.mock()` call.
- **Verify (workflow, adversarial):** a second agent re-read every batch with a skeptic's
  brief — *is "trivial" really trivial, or does the real module drag in a DB/network/large
  graph? Is each "external-boundary" really a boundary, or an internal violation hiding
  behind the exemption?* It returned a corrected per-batch array.
- **Aggregate (deterministic):** results flattened and counted in the workflow script;
  reports written here from `jq` over the raw result.

Cost: 62 agents, ~6.4M subagent tokens, 560 tool calls, ~14.4 min wall-clock.

## Category definitions (as applied)

| Category | Meaning | Action |
|---|---|---|
| `internal-violation` | A project module (`./`, `../`, or `@eduagent/*`) mocked with no `gc1-allow` annotation and not an external boundary. | **Burn down.** |
| `already-gc1-allow` | The `jest.mock` line carries a `gc1-allow` comment. | See conflation note — mostly leave alone. |
| `external-boundary` | The mocked thing *is* a sanctioned boundary (LLM network client, Stripe, RevenueCat, Clerk/JWKS, expo push/notifications, resend, Inngest framework, OCR/vendor SDK), judged by intent even when imported via a relative path. | Leave alone. |
| `not-a-mock` | Candidate line is intentional fixture data, not a real mock. | Leave alone. |

`burndownClass` for internal violations: `trivial-requireActual` (S — a few named exports,
real module has no heavy deps; convert to `jest.requireActual` + overrides),
`needs-wiring` (M/L — stands in for DB/service graph; needs fixtures), `legit-gc1-allow`
(should carry an escape instead of being converted).

## Finding 1 — the real backlog is 153 sites, not 408

The raw pre-scan (408 internal-looking lines) over-counts because it can't tell a bare
automock from a sanctioned-boundary mock or an already-converted pattern-a mock. After
per-site reading: **153 genuine unescaped internal violations** (API 103, mobile 50),
of which **101 are trivial/S** and 52 need wiring (50 M, 2 L). That's the number to track.

## Finding 2 — `gc1-allow` is overloaded, so the 319-bucket is not actionable

The repo uses the `gc1-allow` comment two ways:

1. **Escape hatch** (CLAUDE.md intent): the real dependency genuinely can't run in tests.
2. **A label on already-correct pattern-a conversions**, e.g. the canonical exemplar
   `apps/api/src/inngest/functions/archive-cleanup.test.ts`:
   ```ts
   jest.mock('../../services/consent' /* gc1-allow: pattern-a conversion */, () => {
     const actual = jest.requireActual('../../services/consent');
     return { ...actual, getConsentStatus: (...a) => mockGetConsentStatus(...a) };
   });
   ```
   This is the *desired* end state, already shipped.

The classifier judged 225 of the 319 `gc1-allow` sites "convertible," but because of usage
(2) that number is **unreliable** — many are already converted. **Recommendation:** do not
mine the `already-gc1-allow` bucket for work. If the team wants the escape to mean only
usage (1), that's a separate decision (e.g. a distinct `// pattern-a` marker vs
`// gc1-allow:`), out of scope for this survey. The actionable backlog excludes this bucket
entirely.

## Finding 3 — the adversarial pass earned its keep

The verify stage changed **92 of 716** classifications and flagged **79** borderline.
Representative corrections (full text in `catalog.csv` → `verifierNote`):

- `inngest/functions/review-due-send.test.ts:19` — **upgraded a false exemption**: the
  classifier called it `external-boundary` (push), but the relative mock stood in for an
  *internal* service wrapper, not `expo-server-sdk`. Re-tagged `internal-violation /
  needs-wiring`.
- `inngest/functions/needs-deepening-expire-pending.test.ts:6` — kept `trivial` but set
  `borderline`: the test consumes the function's *return value* (expired rows), so a true
  conversion needs DB seeding, not just a `requireActual` swap.
- `inngest/functions/review-due-send.test.ts:30` — **cleared** a borderline flag after
  confirming only one export is stubbed and the module opens no DB connection — squarely
  trivial.

The lesson for the burn-down: `trivial` vs `needs-wiring` hinges on whether the test asserts
on the mocked function's *return value* (needs real data → wiring) vs just that it was
*called* (pure `requireActual` swap). Use `catalog.csv`'s `note`/`verifierNote` per site.

## Finding 4 — the two L-effort sites are policy decisions, not mechanics

- `services/session/session-cache.test.ts:16` mocks the **entire `@eduagent/database`
  module** (`createDatabaseModuleMock()`). This is arguably a *legitimate* `gc1-allow`
  candidate (a whole DB layer can't run unstubbed in a unit test). Decide explicitly:
  convert with a real test DB, or annotate as an accepted escape.
- mobile `session/index.test.tsx:365` mocks `../../../components/session` wholesale. Large
  surface; convert export-by-export rather than in one PR.

## Limitations

- **`gc1-allow` attribution is comment-proximity based.** A site was tagged
  `already-gc1-allow` if a `gc1-allow` comment sat on/above the `jest.mock` line. Given the
  overloaded usage (Finding 2), the boundary between that bucket and `internal-violation`
  is the survey's softest edge. The 153-violation set (no nearby `gc1-allow`) is the
  high-confidence core.
- **Effort is an LLM estimate**, calibrated by one adversarial pass — not a measured
  conversion. Expect ±1 class on borderline rows (79 flagged).
- **No source was executed.** Classifications are from reading test + target modules, not
  from running conversions. The first few Phase-1 PRs will validate whether `trivial` holds
  in practice.
- **Line numbers** are as reported by the reading agent against the file at audit time
  (2026-05-30, branch `main`). Re-grep before editing if the tree has moved.

## Reproduce / refresh

Workflow script (persisted): `gc6-internal-mock-survey` — re-run with the same 164-file
`args` to regenerate. Discovery one-liner:
```bash
git ls-files '*.test.ts' '*.test.tsx' \
  | xargs grep -lE "jest\.mock\(['\"](\.\.?/|@eduagent/)"
```
