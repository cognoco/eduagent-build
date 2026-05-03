# Codebase artefact-consistency — product overview

**Date:** 2026-05-02

## The picture in one paragraph

Six independent audits over the past two days surveyed different parts of the Mentomate codebase looking for consistency drift — places where the code, conventions, configs, or docs have fallen out of sync with each other. The audits were read-only; nothing has been changed. Across them, around 30 distinct findings emerged, falling into eight thematic groups. Two of those groups represent significant, interconnected work; five are smaller, mostly independent fixes; one is accumulated hygiene. Nothing in the corpus is currently breaking the product. Several findings, though, represent latent traps that would surface as user-visible problems under specific conditions — a fresh-environment deploy, a refactor, certain navigation paths.

## What was checked and how

Six audit lenses ran independently, each scoped to a specific aspect of consistency:

- **Schema contract** — does the shared API contract that the mobile app relies on actually exist in code, and is it enforced at runtime?
- **Test conventions** — are integration tests genuinely testing integrations, or are they stubbed in ways that mask bugs?
- **Mobile compliance** — do mobile components and screens follow the documented persona, styling, and navigation rules?
- **Project scripts** — do all the `package.json` scripts resolve to real tools, with consistent naming across the monorepo?
- **Dependencies** — are the dependency declarations across the monorepo consistent, fresh, and free of phantom or orphaned entries?

Each lens produced a structured report. The audits were run as separate AI-agent sessions with no remediation in scope and no cross-pollination of opinions; findings reflect codebase state as of 2026-05-02, with no source changes since.

## The big picture: one pattern, many surfaces

The strongest finding across all six audits is behavioural, not technical:

**The team fixes drift locally and does not sweep backward.**

When a problem is found and fixed at one location, the equivalent problem at sibling locations typically gets left untouched. Concrete examples from the corpus:

- A database-script naming convention was renamed across three of four sister scripts in a recent PR; the fourth was missed.
- A response-validation pattern was adopted in one API route file; 35 other route files (88% of the API surface) still don't use it.
- An error-class consolidation moved one error type into the shared package; two equivalent classes still live in the mobile app.
- A navigation-safety setting was added to most nested mobile layouts; three were missed.
- An observability-event observer was added in the most recent payments PR; three sibling events from the same era were not retroactively wired up.

The pattern accounts for roughly 70-75% of findings. The remaining 25-30% have a different shape: configuration outliers that were never established in the first place, genuinely new questions awaiting decisions, and a handful of deferred-upgrade items.

This pattern is invisible until a fresh contributor or a new environment hits one of the missed surfaces. At that point, what looks like "the team's preferred way" becomes ambiguous to the next reader, and consistent application stops perpetuating itself. Each new fix that lands without a sweep adds a little drift; each new contributor sees a slightly less consistent codebase to learn from. The trajectory matters more than any single finding.

## What we found, by area

Eight thematic groups emerged after deduplicating findings. Two are flagged RED (significant, interconnected work); five are YELLOW (real but bounded); one is GREEN-leaning (accumulated hygiene).

### Schema contract enforcement (RED)

The largest single area of work. There is a shared package describing exactly what data shape every API endpoint returns to the mobile app. Today, only 1 of 41 API route files actually validates its responses against that contract at runtime. The other 40 work in current conditions, but a refactor or an unexpected upstream data change could produce malformed responses that the mobile app receives without warning.

The audit also discovered the contract itself is incomplete. Of about 22 response shapes defined in the shared package, only three are wired up to actual API code; the rest are orphaned. An earlier remediation plan estimated about 50 shapes existed and just needed connecting; the more recent audit corrected this — roughly half the shapes needed don't exist yet and have to be written from scratch first.

The test-side picture is the same: tests don't assert against these shapes either. So a shape drift could ship through both production code and tests without anything noticing. Doing the schema-application work and the test-side work in coordinated PRs is meaningfully more efficient than doing them in two passes.

### Project manifest hygiene (RED)

The largest single structural violation. The root `package.json` of the monorepo declares 24 dependencies that also live in the mobile package, and 14 of those are at different versions in the two places. The pattern is consistent: mobile got the version bumps; root did not. Today this works because of how the package manager resolves dependencies, but a fresh-environment deploy or a tooling change could produce surprise breakages.

Two dependencies are also imported by code without being declared anywhere — they only resolve today because of internal hoisting, and a fresh continuous-integration environment could fail at install. There's a related sub-area: the API project relies on plugin defaults for linting and TypeScript compilation rather than explicit configs, which makes those commands quietly fragile to tooling upgrades.

The architectural question underneath everything in this group is "which dependencies belong at the root, and which belong inside specific packages?" That's a one-time call that, once made, unblocks most of the cleanup.

### Mobile navigation safety nets (YELLOW)

Three mobile screens with deep dynamic child routes (e.g., a child profile that nests progress, quiz, and other sub-screens) are missing a small navigation-safety setting. When a user enters them via a cross-tab path — for example, from a notification or a deep link — the back button doesn't know how to traverse the screen stack properly and can drop the user back to the home tab unexpectedly. Mechanical fix, low risk, small in scope.

### Mobile design system drift (YELLOW)

Most of the mobile app uses design tokens (named colors, named sizes) for theming. One specific screen still hardcodes raw color values, and one shared component reaches across persona boundaries (learner vs. parent) in a way the component rules forbid. The first is mechanical; the second is a design call — how should the component handle persona-specific text? There's also a longer-tail backlog of around 50-80 hardcoded color references in less-prominent places, which would be a separate deferred sweep.

### API project config (YELLOW)

The API project lacks the explicit linting, library-typing, and test-typing configs that every other workspace member has. Today, the relevant commands work because of plugin defaults; if Nx or ESLint ever tighten their defaults in a future major version, those commands could silently change behaviour without warning. This area also contains a long-standing documented exception — one route file imports a database library directly when convention says to go through a wrapper. That exception was acknowledged a few PRs ago; the question now is whether to refactor it or formalize it as permanent.

### Test integration boundary (YELLOW)

A handful of integration tests mock the project's own database client and the background-job system (Inngest). Mocks of internal modules defeat the purpose of integration testing — the mocks pass, but equivalent real interactions could fail. Two test setup files do this globally, meaning anything those setup files affect is also affected. Not currently breaking; compounds risk on every PR that lands without genuine integration coverage.

### Documentation consistency (YELLOW)

Plans and conventions docs have small contradictions with the code they describe. A security-related plan's reconciliation note at the top says "phase 0 complete," while the inline status table inside the same plan still says "not done." A central conventions doc references a path that's specific to one developer's machine. The schema-related plan mentioned earlier overstated the schema count by roughly 2× — and that wasn't caught until the recent audit.

Each contradiction is small and quick to fix. The cumulative effect, though, is that docs progressively lose authority — at some point a contributor stops trusting them, and that's worse than any single contradiction.

### Hygiene backlog (GREEN-leaning)

Ten missing database-migration snapshot files. A directory of internal AI memory files that needs deduplication. Vendored copies of a tool plugin alongside the installed version, with no decision on which to keep. A naming sweep (the project was renamed from EduAgent to Mentomate; pockets of the old name remain). Four dependencies declared but unused. A formatter that's a major version behind. Each item is small. None blocks anything. The category exists because there is genuinely accumulated work, and naming it explicitly is more honest than pretending it isn't there.

### Parallel: the cleanup-triage backlog

A separate earlier audit triaged 164 docs, configs, and scripts, identifying about 25 candidates for deletion and 23 for review. That work runs in parallel to the eight groups above and overlaps slightly with documentation consistency.

## How big is the work

Excluding the parallel cleanup-triage backlog:

- Around **30 distinct findings** after deduplicating across the six audits
- Touching roughly **120 files** across the monorepo
- Estimated **9-14 hours of mechanical execution time** — the actual editing, which an AI coding agent handles fast
- Estimated **17-28 hours of human review and decision time** — PR reviews, judgment calls, architectural decisions

Human time dominates execution time by roughly 2×, and that human time concentrates in the two RED groups. Together, those two represent about 60% of mechanical work and 50% of human work. Decision overhead is high for both. The other six groups together represent perhaps a quarter of total effort and have lower decision overhead.

The severity distribution is bimodal — 2 RED, 5 YELLOW, 1 GREEN-leaning — not the more typical "mostly small, a few big" curve. That bimodality is meaningful: addressing the two RED groups together resolves most of the magnitude in one coordinated effort and leaves a long tail of relatively independent smaller items.

## What's coupled vs. what's independent

- **Schema contract and test boundary need to move together.** Doing them in sequence means two passes across the same files. Doing them paired means one pass.
- **Manifest hygiene has an unusual property.** It doesn't block any other group, but any dependency-touching work landed before it creates merge conflicts the manifest cleanup will then have to absorb. The implication: do it early, or expect rebase cost on whatever else lands first.
- **API project config is independent** but de-risks future tooling upgrades. Addressing it before a major Nx or ESLint upgrade is meaningfully easier than addressing it after one.
- **Documentation consistency intersects with the cleanup-triage backlog.** Eight inbound-link conflicts in the cleanup-triage scope require coordinated edits when those files move. Ideally these land in the same PR or week.
- **Mobile navigation, mobile design drift, the hygiene backlog, and test boundary** (in its smallest form) are independent of everything else and of each other. Smallest and most parallelizable.

## What we didn't look at

These surfaces are deliberately outside the audit corpus. Naming them here so they don't disappear from the picture:

- **CI workflows** — what runs on PRs vs. main, secret scoping per environment, deploy-step gating
- **External-service integrations** beyond the API contract surface (Stripe, Clerk, Resend, RevenueCat) — webhook fidelity, retry semantics, edge cases
- **Infrastructure-as-code** — Cloudflare config, environment bindings
- **Secrets management scope mapping** — which secrets exist in which environments, whether they're aligned across dev/staging/prod
- **Observability dashboards and alerts** — runtime metrics, alerting thresholds, on-call coverage
- **Security and authentication surfaces** outside the schema-contract list — profile-scoping enforcement, session handling, auth middleware
- **Performance and cost** — request latency, background-job concurrency, per-environment compute spend
- **Database migration historical correctness** — beyond a few specific items already addressed
- **Test infrastructure** - how automated tests match the codebase and how well they help mitigate drift.

The audited surfaces all describe artefacts at rest — code, configs, and docs as they sit on disk. The unaudited surfaces all describe runtime and operations — what happens when the system is executing under real-world load. That asymmetry is itself information: the next round of audit work, if there is one, has a clear pattern to fill in.

## A note on confidence

The audits agree with each other to a degree that's worth flagging. The "team fixes locally, doesn't sweep backward" pattern was independently observed in five of the six audits and accounts for the bulk of findings. That convergence makes the pattern claim well-grounded — five different lenses, looking at five different parts of the codebase, surfaced the same shape of problem.

Two cross-lens findings carry particularly strong evidence: the schema-and-test gap appears in three audits independently (the schemas exist; the routes don't enforce them; the tests don't assert against them — three facets of one half-finished migration). The manifest-hygiene picture appears in two audits independently (dependencies and project scripts). When the same theme surfaces from different angles in different audits, the underlying issue is unlikely to be an artefact of how the audits were scoped.

For the items that didn't converge — the originating-gap configurations, the persona-handling design question, the deferred upgrades — confidence is correspondingly lower. Those are individually well-evidenced but don't have the same triple-confirmation behind them.
