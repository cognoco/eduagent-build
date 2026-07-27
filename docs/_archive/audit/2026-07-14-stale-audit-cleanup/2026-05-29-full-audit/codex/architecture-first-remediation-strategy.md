# Architecture-First Remediation Strategy

Date: 2026-05-31
Status: draft for discussion

## Goal

Turn the audit material into a prioritized remediation strategy without creating
dozens of issue-level tickets before the underlying architectural controls are
decided.

## Premise

The audit set contains both local defects and pattern defects. Local defects can
be fixed directly. Pattern defects need a systemic invariant plus a guard, or the
same class will keep reappearing.

The highest-value next step is therefore an architecture-first triage:

1. Group findings by failed invariant.
2. Decide whether the fix is architectural, local, or both.
3. Create issue-sized work only after the invariant is clear.

## Claude Parallel Review Impact

The independent Claude consolidation in `../claude/consolidated-triage.md`
mostly reinforces this strategy. I accept three changes from it:

- DeepSec Round 2 scope should be read from `.deepsec/findings/` only: 78 open
  findings. Round 1 / WI-76..89 is remediated history.
- Billing transition tests are not optional follow-up; they are part of the
  architecture remediation for the billing HIGH_BUG cluster.
- LLM metering needs a deeper design decision than "add more route regexes":
  consider requiring metering context at `routeAndCall` / `routeAndStream`,
  while preserving per-logical-action user quota semantics.

I do not accept these parts without correction:

- `../claude/chokepoint-ledger.md` is superseded and should be used only for
  method provenance.
- Claude's MUST list has catalogue-numbering mistakes; re-check every item
  against `_r2-catalogue.tsv` before planning.
- Gemini safety fallback is important, but should remain SHOULD-high unless a
  fresh implementation read proves release-blocking impact.
- Consent/deletion authority, proxy-mode writes, and dictation identity remain
  separate root causes.

## Root-Cause Buckets

### 1. CI And Agent Workflow Trust Boundary

**Evidence**

- DeepSec HIGH: `.github/workflows/claude.yml` lets `@claude` issue/comment text invoke a secret-backed agent without explicit repo-side actor/author gating.
- DeepSec MEDIUMs: forgeable Claude review gate, untrusted PR metadata in prompts, unnecessary OIDC write permission, deploy workflow `issues: write` scope.
- Deep-review P0: Logfire secret embedded in local Claude settings.

**Root cause**

Secret-backed automation is available before the repo has a single explicit
"trusted actor, trusted prompt, least privilege" workflow policy.

**Architecture decision**

Create a GitHub Actions trust-boundary rule:

- Secret-backed agent jobs only run for trusted authors or explicit maintainer approval.
- Prompt content from untrusted issues/PRs must be framed as data.
- OIDC is absent unless a job performs an actual OIDC exchange.
- Workflow permissions are job-local and least-privilege.
- Local agent settings must not embed tokens; secrets come from Doppler/env.

**Fix shape**

Patch workflow gates immediately, then add a lightweight workflow-audit guard or checklist.

**Priority**

Must. This is small and high-impact.

### 2. Profile Authority And Proxy-Mode Write Invariant

**Evidence**

- DeepSec HIGH: proxy-mode write protection depends partly on client redirects; active server gap remains in session library-filing writes.
- DeepSec MEDIUM/BUG: session library-filing, snapshot progress mutation, and other child-state writes appear as repeated proxy-mode gaps.
- Older DeepSec WI-76 findings show this class was broad and has been remediated in many places, but new routes can still miss the guard.

**Root cause**

The invariant "a parent viewing a child profile is read-only unless explicitly allowed" is enforced by scattered per-handler calls. New write routes can be added without the guard.

**Architecture decision**

Do not create one ticket per missing `assertNotProxyMode(c)` until we decide the enforcement layer.

Preferred direction:

- Introduce a single API helper for profile-scoped writes, for example `requireWritableProfile(c, reason)`, that returns `profileId` after `assertNotProxyMode(c)`.
- For route groups with only write endpoints, use route-level middleware or a local wrapper so handlers cannot forget the check.
- Keep service-level ownership predicates, but do not rely on services to infer proxy-mode from `profileId`; proxy-mode is request-context authority.

**Fix shape**

1. Add the helper and update one high-risk route group as the exemplar.
2. Add a guard test that enumerates session write endpoints or finds write handlers that call `requireProfileId()` without `assertNotProxyMode()` / `requireWritableProfile()`.
3. Sweep known gaps: session library-filing writes, snapshot progress mutation, and any siblings found by the guard.

**Priority**

Must. This is an architecture-first workstream.

### 3. Consent Target Authority And Destructive Lifecycle Atomicity

**Evidence**

- DeepSec HIGH: consent request can target arbitrary same-account profiles and mint denial tokens whose public response path deletes the target profile.
- DeepSec HIGH_BUG: archive-cleanup profile deletion can race consent restoration.
- Deep-review Inngest run: monthly-report and child-cap forged internal events lack consumer-side relationship revalidation.

**Root cause**

Some destructive or privacy-sensitive flows validate "same account" but not the specific authority relation required for the operation. Some deletion checks are separated from destructive writes.

**Architecture decision**

Consent and deletion need a canonical target validator plus atomic destructive predicates.

Proposed invariant:

- A consent request target must be a non-owner child profile that currently requires parental consent and is controlled by the actor allowed to initiate that flow.
- Public consent denial may delete only a profile still in the exact pending-consent state associated with that token.
- Archive cleanup/deletion operations must encode the still-valid deletion predicate in the `DELETE WHERE`, or run check and delete under a transaction/lock.

**Fix shape**

Patch the consent request/response path immediately, then add atomic guarded delete helpers and tests for restore-race and invalid-target cases.

**Priority**

Must. This is data-loss/regulatory-sensitive.

### 4. Billing And Quota State Machines

**Evidence**

- DeepSec HIGH_BUG: top-up credits can become stranded when the subscription moves from shared-pool to per-profile quota model.
- DeepSec HIGH_BUG: trial-expiry cron can downgrade a just-converted subscriber.
- DeepSec MEDIUM/BUG: top-up balance disclosure, quota overcharge, trial downgrade race variant.
- Architecture audit: billing/quota/idempotency logic is large and thinly tested.

**Root cause**

Billing state transitions are spread across cron, webhook, and reconciliation paths without a sufficiently centralized state-transition test matrix. Some updates lack status predicates or post-transition reconciliation of dependent rows.

**Architecture decision**

Do not solve by isolated UPDATE tweaks only. Establish a billing transition model
and a co-located test harness:

- Every subscription transition update includes expected-current-state predicates where applicable.
- Dependent quota/top-up rows are reconciled in the same transaction or through an idempotent follow-up with a guard test.
- Regression tests cover transition pairs: trial to active, trial to expired, shared-pool to per-profile, per-profile to shared-pool, and webhook/cron interleavings.
- Tests cover user-visible money/access outcomes: no paid-access downgrade, no
  stranded paid credits, no double charge/false denial, and no child-visible
  owner balance leakage.

**Fix shape**

1. Patch paid-value and paid-access defects now.
2. Add billing transition tests around the patched functions in the same workstream.
3. Turn architecture audit's broader billing test gap into the next sprint item
   after the HIGH_BUG patches, not an indefinite backlog.

**Priority**

Must for the active defects, should for broader coverage.

### 5. LLM Metering And Cost Controls

**Evidence**

- DeepSec MEDIUM duplicate pair: quick-check route/service reaches `routeAndCall()` but is absent from metering route patterns.
- DeepSec MEDIUM: homework summary LLM call can run without quota.
- Architecture/deepsec history shows several prior route-pattern misses have been fixed one by one.

**Root cause**

Metering coverage is inferred from route path regexes and file-level manifests, while billable LLM calls live in services. A new route can call an existing service function and bypass the path allowlist.

**Architecture decision**

Route regexes alone are too brittle. The architecture decision is now a real
choice between two directions:

Option A: keep route-level metering, but add a coverage guard that ties LLM call
sites to exposed routes or requires an explicit exemption.

- Static guard: every service function calling `routeAndCall`/`routeAndStream` must be covered by a metered route test or an explicit `llm-metering-exempt` annotation.
- Route guard: every route whose handler reaches a known LLM service must appear in metering patterns.

Option B: move toward metered-by-construction at the LLM call boundary.

- `routeAndCall` / `routeAndStream` require a metering context or an explicit
  internal/background exemption.
- User-facing quota remains per logical action, not per provider call. Multi-call
  actions like create-subject, homework, and session exchange must share one
  quota action id.
- Provider-cost telemetry can still be per call.

Do not implement Option B casually; it needs a short design note because it
touches pricing semantics.

**Fix shape**

Patch quick-check and homework summary immediately, then design Option A vs.
Option B before broad sweeps.

**Priority**

Must for quick-check, should for the guard.

### 6. Inngest PII Boundary And Internal Event Authority

**Evidence**

- Deep-review P1: minors' transcripts/free text cross Inngest boundaries in event payloads and memoized step returns.
- DeepSec MEDIUM: freeform filing retry transmits transcript to LLM without re-checking GDPR consent.
- Deep-review P1: child-cap and monthly-report consumers trust event id pairings without ownership revalidation.
- Workflow 3 found two dispatch criticality mismatches, showing Inngest semantics need semantic review beyond syntax.

**Root cause**

Inngest is both an async execution engine and a third-party persisted state store. Current code sometimes treats event payloads and step returns as local variables. Some consumers also trust producer-validated id pairings.

**Architecture decision**

Make the boundary explicit:

- Event payloads carry ids and non-sensitive control fields only.
- Step returns carry ids/status only; PII is fetched inside the consuming `step.run` closure and not returned.
- Any event carrying two authority ids, such as owner plus target child, must revalidate the relationship in the consumer before acting.
- GDPR/memory consent is rechecked inside background jobs before external processing or derived-data writes.

**Fix shape**

1. Define the rule in docs and code comments around event schemas.
2. Build a guard test for PII fields in `inngest.send()` data and suspicious `step.run` returns.
3. Sweep the six high-class transcript/free-text sites and lower-sensitivity step-state tail.
4. Add break tests for forged child-cap and monthly-report pairings.

**Priority**

Must. This is the clearest systemic privacy workstream.

### 7. Tenant Isolation Backstop

**Evidence**

- Deep-review P1: `withProfileScope` RLS helper exists but is unwired.
- DeepSec active residue includes smaller cross-profile/ACL concerns, but the main request-path tenant isolation was verified clean.

**Root cause**

App-layer scoping is strong but remains the only enforced layer. Documentation claims an RLS backstop that does not actually exist.

**Architecture decision**

Choose one:

1. Wire real Neon/Postgres RLS for profile-owned tables and use `withProfileScope` in live paths.
2. If RLS is impractical in the Worker/Drizzle model, create an AST/lint guard forbidding raw tenant-table reads outside scoped repository/approved parent-chain joins, and update architecture docs.

**Fix shape**

Do a short design spike before implementation. This is too foundational for a casual patch.

**Priority**

Should, but not before active data-loss/security defects.

### 8. Shared Untrusted Content Rendering Sink

**Evidence**

- DeepSec MEDIUM: `ThemedMarkdown` opens LLM-generated links with no scheme allowlist.
- DeepSec MEDIUM: `MessageBubble` can render remote markdown images, enabling prompt-injection exfiltration.

**Root cause**

The shared Markdown sink is not hardened for assistant/user-influenced content.

**Architecture decision**

Fix the sink, not callers:

- Disable remote images by default.
- Enforce a strict URL scheme/origin policy for links, or render links as plain text for tutoring replies.
- Add a test at `ThemedMarkdown` level so every caller inherits the protection.

**Fix shape**

Localized shared-component fix with regression tests.

**Priority**

Must/Should boundary. It is not P0, but it is a clean shared-sink fix with broad coverage.

### 8a. LLM Provider Safety Classification

**Evidence**

- DeepSec MEDIUM: Gemini block reasons other than literal `SAFETY`
  (`PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`) are mapped to a
  generic empty response, then retried/failover-routed as transient.

**Root cause**

Provider safety decisions are not normalized into the app's `SafetyFilterError`
classification before retry/failover logic runs.

**Architecture decision**

Treat all provider terminal safety/content block reasons as non-transient policy
outcomes. Do not retry or fail over to a different provider with the same prompt
after a provider blocks for a safety bucket.

**Fix shape**

Localized provider/router fix plus tests for non-streaming and streaming Gemini
block reasons. Fold into the broader LLM trust-boundary workstream.

**Priority**

SHOULD-high. It is important for a minors app and cheap to fix, but the finding
itself is MEDIUM with low-confidence safety impact and high-confidence
retry/cost waste, so it is not automatically release-blocking without a fresh
code read raising impact.

### 9. Mobile Dynamic Accessibility And Localization Guardrails

**Evidence**

- Deep-review P1: `announceForAccessibility` used 0 times, leaving screen-reader users silent in streamed tutor/quiz/loading/toast flows.
- Workflow 1: 960 hardcoded mobile UI string violations.
- Deep-review P1: about 358 hardcoded English sites in scanner's narrower count; 110 accessibility labels also leak English.

**Root cause**

The app has static i18n/a11y investment but lacks guardrails for dynamic announcements and JSX literal copy.

**Architecture decision**

Do not start a string sweep first. Start with guardrails:

- A shared announcement utility/hook for dynamic state changes, wired first to session and quiz.
- JSX/string-literal ratchet seeded from workflow-1 proposed baseline, so new hardcoded text cannot grow.
- Then execute copy migration in screen clusters.

**Fix shape**

1. Add dynamic announcement architecture.
2. Add JSX literal ratchet/baseline.
3. Migrate auth-first, then high-count screens.

**Priority**

Should. High product/compliance value, but separate from security/data-loss must-fixes.

### 10. State Identity, Idempotency, And Stale Async UI

**Evidence**

- DeepSec HIGH_BUG: dictation results keyed only by profile/date/mode overwrite same-day completions.
- DeepSec HIGH_BUG: dormant RN Web ChatShell voice controls invoke stale handlers.
- DeepSec BUG/MEDIUM cluster: stale async results, duplicate submits, unbounded quiz attempts, route param parsing.

**Root cause**

Some flows lack stable per-action identity or complete stale-instance guards.

**Architecture decision**

Use local fixes unless repeated strongly enough:

- Dictation needs a per-completion idempotency key/identity and migration.
- ChatShell needs a full dormant-shell pointer/event guard on web, not per-control patches.
- Quiz/route-param issues can be fixed with schema caps and local validation.

**Fix shape**

Issue-level remediations with focused tests.

**Priority**

Must for active HIGH_BUGs; consider for lower BUG tail.

## Sequencing Proposal

### Phase 0 - Contain And Decide

Goal: close immediate exposure and make architecture decisions before ticket explosion.

- Rotate/remove Logfire secret and decide on history scrub.
- Patch Claude workflow invocation gate and OIDC/tool permissions.
- Decide proxy-mode write enforcement layer.
- Decide consent target authority contract.
- Decide Inngest PII boundary rule and guard shape.
- Decide LLM metering guard direction: route-coverage guard vs.
  `routeAndCall`/logical-action metering context.
- Decide the minimum billing transition test harness required for the HIGH_BUG
  patches.

### Phase 1 - Must-Fix Workstreams

Goal: close active high-risk defects, each with break/regression tests.

- Consent request/denial destructive target fix.
- Proxy-mode write helper/guard plus session library-filing and snapshot mutation sweep.
- Billing top-up and trial transition fixes with transition tests/harness.
- Deletion/archive cleanup atomic guarded delete.
- Dictation result identity fix.
- Markdown sink hardening.
- Quick-check/homework-summary metering fixes.

### Phase 2 - Systemic Guards

Goal: stop recurrence.

- Inngest PII payload/step-return guard and current sweep.
- LLM metering coverage guard.
- LLM provider safety-block classification fix.
- JSX literal i18n ratchet.
- Inngest registration completeness test.
- Tenant isolation backstop decision implemented or documented as AST guard.
- GitHub workflow permission/prompt policy documented and checked.

### Phase 3 - Product Accessibility And Localization Burn-Down

Goal: improve user-facing quality after the guardrails are in place.

- Dynamic a11y announcement path for session, quiz, loading, and toast flows.
- Modal focus/isolation pass.
- Auth-first i18n sweep, then top-count screens from workflow-1.
- Plural/date hardcode cleanup.

### Phase 4 - Structural Debt

Goal: reduce future remediation cost.

- Billing/quota/idempotency test debt sprint.
- Selective service splits where they remove duplicated business rules: filing retry, session pipeline advancement, profile context, challenge finalization.
- GC6 internal mock burn-down.
- Audience matrix retirement/rewrite around `navigation-contract`.
- Circular dependency / Nx boundary guard work.

## Immediate Work Products To Create Next

Before opening implementation tickets, create one short design note per architecture-first
bucket that needs a decision:

1. `proxy-mode-write-invariant.md`
2. `inngest-pii-boundary.md`
3. `llm-metering-coverage.md`
4. `consent-deletion-authority.md`
5. `billing-transition-invariants.md`
6. `llm-provider-safety-classification.md` if the LLM trust-boundary workstream
   is not already covering it explicitly.

Each note should end with:

- chosen invariant
- files likely touched
- current findings covered
- guard/test required
- issue-sized implementation slices

## Safe To Ticket Immediately

These do not need broader architecture decisions:

- Logfire secret removal/rotation tracking.
- Claude workflow trust gate.
- `ThemedMarkdown` sink hardening.
- Trial transition status predicate.
- Top-up credit visibility after quota-model transition.
- Dictation per-completion identity.
- ChatShell dormant web voice guard.
- Seed password fallback removal.
- `core-send` semantic mismatches.

## Do Not Ticket As Is Yet

These should wait for an architecture decision:

- Individual proxy-mode `assertNotProxyMode` gaps.
- Individual Inngest transcript/PII payload findings.
- Broad hardcoded-string migration.
- Broad LLM route allowlist sweeps.
- RLS helper wiring vs AST guard.
- Audience-matrix line-citation patching.

## Exit Criteria For "Audit Remediation Planned"

- Every active HIGH/HIGH_BUG finding is either assigned to an immediate local fix or an architecture-first workstream.
- Every deep-review P1 has a workstream, a deliberate deferral, or a documented non-action decision.
- Every systemic class has a guard/test plan, not only a list of current instances.
- P2/BUG findings are either folded into a workstream, recorded as backlog, or explicitly accepted as low priority.
