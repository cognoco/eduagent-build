# Consolidated Evidence Ledger

Date: 2026-05-31

This ledger normalizes the audit evidence into a form suitable for root-cause
triage. It is not yet a task list. The point is to separate fixed/stale audit
noise from active findings and to identify duplicate groups before remediation
planning.

## Inputs

| Source | Shape | Main signal |
|---|---:|---|
| Deep-review meta-report | 6 coordinated review runs | 1 P0, roughly 9 P1, roughly 20 P2 after coordinator dedupe |
| Workflow 1 | hardcoded JSX/user-visible string audit | 960 confirmed hardcoded mobile UI strings across 92 files |
| Workflow 2 | GC6 internal mock survey | 153 unescaped internal `jest.mock()` backlog sites |
| Workflow 3 | Inngest `core-send` semantic sweep | 2 high-confidence dispatch criticality mismatches |
| Workflow 4 | audience-matrix re-verification | findings mostly hold, line-level inventory is badly stale |
| Architecture review | whole-repo structural pass | billing test gap, trust-boundary casts, silent failures, monoliths |
| Architecture deepening | deep-module opportunities | challenge/session/filing/profile/nav seams |
| DeepSec latest report | security scan + revalidation | 323 total findings, 76 true positives, 2 uncertain after revalidation |
| Claude consolidation | independent reconciliation | confirms R2 scope and architecture-first clustering; contains useful billing/LLM emphasis but has catalogue-numbering mistakes |

## Independent Claude Review Delta

Claude's parallel consolidation in `../claude/consolidated-triage.md` is useful
independent evidence, but should not be imported mechanically.

Accepted changes:

- Treat `.deepsec/findings/` as the canonical DeepSec Round-2 actionable set:
  76 true positives plus 2 uncertain findings. Round 1 / WI-76..89 is history.
- Elevate the billing/quota/idempotency test harness from "supporting guard" to
  a named architecture-first workstream. The active billing HIGH_BUGs and
  `ARCH-1` are the same failure class from different angles.
- Expand the LLM metering architecture decision to explicitly consider a
  metered-by-construction design at the `routeAndCall` / `routeAndStream`
  boundary, while preserving today's per-logical-action quota semantics.

Rejected or corrected:

- Do not use `../claude/chokepoint-ledger.md` for planning; it is explicitly
  superseded and was built on the wrong Round-1 premise.
- Do not accept Claude's item numbers in the MUST list without re-checking
  `_r2-catalogue.tsv`. Example: Claude refers to `#17` and `#53` as LLM safety
  items, but row 17 is OIDC misuse and row 53 is ModeSwitcher i18n. The Gemini
  safety fallback item is row 21.
- Do not automatically promote the Gemini safety fallback finding from MEDIUM to
  MUST. It is real and important, but the finding itself rates safety impact as
  low-confidence and retry/cost waste as high-confidence. Treat it as
  SHOULD-high unless implementation-time verification raises impact.
- Keep consent/deletion authority separate from proxy-mode write authorization.
  They are both ACL-adjacent, but their correct invariants and tests differ.
- Keep dictation overwrite under data identity/idempotency, not billing.

## DeepSec Revalidation State

Latest DeepSec report: `.deepsec/data/eduagent-build/reports/report.json`

| Revalidation verdict | Count |
|---|---:|
| fixed | 201 |
| false-positive | 41 |
| duplicate | 3 |
| true-positive | 76 |
| uncertain | 2 |

Active residue by severity:

| Severity | Count |
|---|---:|
| HIGH | 3 |
| HIGH_BUG | 5 |
| MEDIUM | 27 |
| BUG | 43 |

Active residue by recurring slug, top clusters:

| Slug | Count | Interpreted class |
|---|---:|---|
| `other-race-condition` | 7 | non-atomic state transitions |
| `acl-check` | 5 | profile/proxy/owner authorization gaps |
| `other-logic-bug` | 4 | correctness bugs without a common architecture root |
| `expensive-api-abuse` | 3 | LLM or compute endpoint missing central metering/rate control |
| `other-unbounded-input` | 2 | schema-level size/cost caps missing |
| `oidc-misuse` | 2 | CI/agent workflow over-permissioning |
| `other-info-disclosure` | 2 | PII/private-signal exposure at logging/rendering boundaries |

## Active DeepSec HIGH / HIGH_BUG Residue

These are the highest-priority DeepSec findings still true after revalidation.

| Tier | File | Finding | Root-cause bucket |
|---|---|---|---|
| HIGH | `.github/workflows/claude.yml` | Any `@claude` issue or comment can invoke a secret-backed agent | CI/agent workflow trust boundary |
| HIGH | `apps/mobile/src/app/consent.tsx` plus API consent route/service | Consent request can target arbitrary same-account profiles and mint destructive denial tokens | consent target authority |
| HIGH | `apps/mobile/src/app/(app)/session/_layout.tsx` plus API session routes | Proxy-mode session write protection relies on a client-side redirect; live server gap remains in library-filing writes | proxy-mode write invariant |
| HIGH_BUG | `apps/api/src/services/billing/top-up.ts` | Paid top-up credits can become invisible/unspendable when moving from shared-pool to per-profile quota model | billing state transition invariant |
| HIGH_BUG | `apps/api/src/services/billing/trial.ts` | Trial-expiry cron can downgrade a just-converted paying subscriber | billing state transition invariant |
| HIGH_BUG | `apps/api/src/services/deletion.ts` | Profile deletion can race consent restoration/archive clearing | consent/deletion atomicity |
| HIGH_BUG | `apps/api/src/services/dictation/result.ts` | Same-day dictations in the same mode overwrite each other and undercount practice activity | schema/idempotency identity |
| HIGH_BUG | `apps/mobile/src/components/session/ChatShell.tsx` | Dormant RN Web ChatShell voice controls can call stale session handlers | stale mounted-instance action guard |

## Active DeepSec MEDIUM Residue, Deduped View

| Group | Representative findings | Proposed handling |
|---|---|---|
| Proxy-mode write gaps | `routes/sessions.ts` library-filing writes; `services/snapshot-aggregation.ts` child progress mutation | Treat as part of one proxy-write architecture decision, then sweep current gaps |
| LLM metering / abuse | quick-check route and service duplicate; homework summary LLM; quiz check unbounded attempts | Create one metering/registration coverage workstream plus local caps |
| CI/agent workflow trust | forgeable review gate, prompt injection in review prompt, OIDC permissions, deploy `issues: write` scope | One GitHub Actions hardening workstream |
| PII / private signal exposure | freeform-filing consent gate; session-completed-observe raw event payload; language-detect Sentry PII; envelope projection leaks | One privacy-boundary/logging workstream, with Inngest PII as the architectural anchor |
| LLM prompt/output trust | exchange prompt fencing; session-context prompt injection; Gemini safety fallback; streaming extractor audit bypass; projector raw envelope leak | One LLM trust-boundary workstream |
| Mobile untrusted content sink | ThemedMarkdown opens unallowlisted links; MessageBubble permits remote-image markdown exfil | One shared-sink fix in `ThemedMarkdown` |
| Billing/mobile entitlement state | top-up balance leaked to child; RevenueCat identity-sync race | Billing/client entitlement consistency workstream |
| Test/seed secret hygiene | hardcoded seed password fallback | Localized fix, does not need architecture gate |
| UX/auth edge cases | web localStorage token fallback, create-profile age gate, account deletion-status owner-gate uncertain | Decide intent, then local patches/comments |

## Deep-Review P0/P1 Carry-Forward

| Tier | Finding | Root-cause bucket |
|---|---|---|
| P0 | Logfire `sk-lf-` key in `.claude/settings.local.json`, likely in history | secret hygiene / local agent config |
| P1 | `autoMemoryDirectory` points at wrong checkout | agent governance / memory correctness |
| P1 | Inngest event payloads and step returns carry minors' transcripts/free text | Inngest PII boundary |
| P1 | forged internal child-cap notification can leak child name | forged internal-event ownership validation |
| P1 | forged monthly report event can email child data to wrong parent | forged internal-event ownership validation |
| P1 | RLS helper exists but is unwired | tenant isolation backstop |
| P1 | mobile screen-reader silence in core session loop | accessibility dynamic-event architecture |
| P1 | hardcoded mobile English strings bypass i18n | i18n missing ratchet |
| P1 | unbounded progress lifetime materialization | scale/data access |
| P1 | per-request Neon pool churn | scale/runtime database lifecycle |
| P1 | Inngest registration hand-maintained with no guard | background job registration backstop |

## Workflow Backlogs

| Workflow | Backlog | Triage note |
|---|---|---|
| workflow-1 | 960 hardcoded mobile UI strings | Do not start broad sweep until JSX literal ratchet/baseline is designed |
| workflow-2 | 153 unescaped internal mocks | Backlog, not remediation blocker unless tests touched in a workstream need cleanup |
| workflow-3 | 2 Inngest dispatch criticality mismatches | Localized fixes with regression tests; also validate `safeSend`/`core-send` docs |
| workflow-4 | audience matrix citations rotted | Prefer retiring line-level inventory in favor of navigation-contract source of truth |

## Architecture Audit Carry-Forward

| Finding | Proposed status |
|---|---|
| Untested billing/quota/idempotency logic | Should become a billing workstream guard requirement, not a standalone cleanup ticket only |
| Untrusted-data casts at trust boundaries | Should be swept with JWT/JWKS/LLM parse hardening |
| Silent failures in critical paths | Mostly superseded by later error audit, but keep dictation and low-priority logging fixes |
| Session/curriculum monoliths | Consider after invariant fixes unless directly needed by a root-cause workstream |
| Challenge/session/filing/profile-context seams | Use selectively where they remove duplicated business rules that caused findings |

## Initial Tiering

This is a proposed starting point for discussion.

### Must

- Rotate/remove the Logfire secret and decide on history scrub.
- Harden the Claude secret-backed workflow invocation.
- Fix consent request target authority and destructive denial-token flow.
- Decide and implement the proxy-mode write invariant, then sweep active gaps.
- Fix billing state races/value-loss with regression tests.
- Establish the billing transition test harness for the patched paths; do not
  treat the HIGH_BUG fixes as complete without regression coverage.
- Fix deletion/consent restoration atomicity.
- Define and enforce the Inngest PII boundary.
- Fix the LLM metering coverage gap for quick-check and related unmetered LLM calls.
- Harden the shared Markdown sink.

### Should

- Land tenant isolation backstop: real RLS wiring or AST/lint guard.
- Add accessibility announce path for dynamic tutor/quiz/loading/toast flows.
- Land JSX literal i18n ratchet before broad copy migration.
- Add Inngest registration guard.
- Bound progress lifetime materialization and decide Neon pool cache strategy.
- Fix `core-send` semantic mismatches.
- Replace trust-boundary casts with Zod/structured parsing.
- Fix Gemini/provider safety-block classification and prevent deterministic
  safety blocks from being retried/failover-routed as transient outages.
- Remove seed password fallback and PII-in-logs cases.

### Consider

- Split `session-exchange.ts` and related monoliths.
- Burn down GC6 internal mocks.
- Retire or rewrite audience matrix line inventory.
- Break service cycles and add circular-dependency guard.
- Schema subpath exports / Nx boundary tightening.

## Notes

- Findings marked fixed/false-positive/duplicate in DeepSec are excluded unless they define a
  pattern that is still active elsewhere.
- Some line numbers in older audit artifacts are stale; use file/function names and re-read
  source before implementation.
- "Must" means high-priority remediation class, not necessarily a single immediate PR.
