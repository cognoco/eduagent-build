---
title: Mentor Notices in Every Session — Implementation Plan
date: 2026-07-20
profile: code
spec: docs/specs/2026-07-19-homework-notice-felt-moments.md
status: historical-implemented-superseded
scope_decision: docs/adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md
---

# Mentor Notices in Every Session — Implementation Plan

> **Historical L3 record — superseded 2026-07-21.** This plan was used to build PR #2357 before Product and Architecture ratified the scope expansion. It is preserved as implementation provenance, not decision authority. [`MMT-ADR-0036`](../../../adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md) excludes interleaved sessions and removes `noticed_gap.topicId` from the MVP contract while retaining ordinary-learning eligibility, all-age behavior, centralized server creation, and recursive-creation prevention.

**Goal:** Make the same evidence-backed “Mentor noticed me and will help me with this” moment available to every learner in every session type, independent of age or entry path.

**Approach:** Remove homework as an eligibility boundary while preserving the existing flag, evidence, one-notice-per-session, quiet-default, and re-check protections. Ordinary learning and homework sessions inherit their subject/topic from the session; interleaved retrieval must bind the proposed notice to one server-known topic so the notice cannot be filed under the session row’s incidental primary subject. The existing generic chip, summary receipt, Now card, nudge, natural resurfacing, re-check, and locked-in celebration remain the shared follow-through.

## Scope

In scope:

- `packages/schemas/src/llm-envelope.ts` and tests — optional interleaved topic binding on `noticed_gap`; session-neutral contract comments.
- `apps/api/src/services/exchange-types.ts` — carry the owned subject identity with resolved interleaved topics.
- `apps/api/src/services/exchange-prompts.ts` and tests — enable observation for learning, homework, and interleaved sessions; use session-neutral, age-neutral instructions; enumerate valid interleaved targets.
- `apps/api/src/services/mentor-notices/creation.ts`, its tests, and the barrel — one server-owned creation boundary that validates evidence and resolves the correct subject/topic.
- `apps/api/src/services/session/session-exchange.ts` — route both streaming and non-streaming accepted proposals through that shared boundary.
- `apps/api/eval-llm/flows/homework-notice.ts`, its focused tests, and generated snapshots/receipts — cover a genuine slip outside homework, a clean answer, provenance, target binding, and no visible future promise.
- `docs/plans/2026-07-19-homework-notice-felt-moments.md` and `docs/specs/2026-07-19-homework-notice-felt-moments.md` — record that homework was the original activation path, not the lasting eligibility boundary.

Out of scope:

- A second persistence model for positive-only observations. The existing lifecycle already demonstrates both sides of the relationship: it remembers a concrete growth area and later recognizes when the learner has locked it in.
- Supporter/guardian visibility, diagnostic profiling, age-specific copy, new notification preferences, database migrations, or changes to the existing quiet-default cadence.
- Changes to Challenge Round, Recall Bridge eligibility outside the already-implemented notice suppression, or unrelated session behavior.

## Tasks

- [x] T1: Generalize and harden the proposal contract — done when `packages/schemas/src/llm-envelope.test.ts` first fails and then proves an optional UUID `topicId` survives a `noticed_gap` parse, while existing regular-session signals and `observed=false` normalization remain unchanged.
- [x] T2: Make observation prompts session- and age-neutral — done when `apps/api/src/services/exchange-prompts.test.ts` first fails and then proves enabled homework, learning, and interleaved sessions include `signals.noticed_gap`; disabled and active re-check contexts omit it; teen and 50-year-old contexts receive the same observation contract; and interleaved prompts enumerate only server-owned topic IDs as valid notice targets.
- [x] T3: Centralize safe notice creation for every session type — done when a new `mentor-notices/creation.test.ts` first fails and then proves learning and homework inherit the session target, interleaved retrieval requires and resolves an owned topic target to its real subject, unknown/missing interleaved targets are rejected, active re-check sessions cannot create a second notice, invalid evidence cannot persist, and both exchange paths call the same creation service without a homework gate.
- [x] T4: Broaden the LLM regression gate and reconcile canon — done when the focused eval-flow test first fails and then includes a non-homework genuine-slip scenario plus clean/no-promise coverage, deterministic snapshots/receipts are regenerated, and both 2026-07-19 documents carry the scope amendment without rewriting their historical decision trail.
- [ ] T5: Verify, publish, and land — done when focused schema/API/eval tests, API typecheck/lint as affected, `pnpm eval:llm`, required live prompt evaluation, and the repo change-class guard pass; the verified own-work diff is committed and pushed through the repo commit workflow; a PR is created; every required check and actionable review thread is clear; the PR is squash-merged; and the merge commit is verified on `origin/main`.

## Adversarial review and applied findings

1. **Naive gate removal misfiles interleaved evidence.** Interleaved sessions store the first topic’s subject only as a schema-required primary pointer while the conversation spans multiple topics. Applied: require an LLM-proposed `topicId` from a server-supplied allow-list and resolve its owned `subjectId` server-side before persistence.
2. **Two exchange implementations can drift.** Streaming and non-streaming paths currently duplicate evidence validation, session-type gating, and insertion. Applied: move the complete creation decision behind one service and call it from both paths.
3. **A re-check could recursively create another notice.** Removing the homework gate alone would make re-check sessions eligible because they are ordinary `learning` rows. Applied: retain prompt suppression and add defense-in-depth rejection at the creation boundary when `mentorNoticeRecheck` is active.
4. **“All ages” was an assertion without a regression check.** The current gate has no age predicate, but no test protects that product rule. Applied: parameterize prompt coverage with teen and adult contexts and forbid age-specific notice copy or behavior in this slice.
5. **The eval harness would still certify homework only.** A generalized unit test without a non-homework LLM scenario would leave prompt behavior unmeasured. Applied: add a genuine-slip learning scenario and retain clean-answer, provenance, and no-promise assertions.
6. **Broadening the felt moment could become broadening the data model.** Capturing separate positive-only observations would add new semantics, surfacing rules, and cadence decisions not required to prove personal mentorship. Applied: keep this lifecycle focused on concrete evidence → remembered support → recognized lock-in.
