---
title: Supporter Surface Overhaul — Implementation Plan
date: 2026-07-26
profile: code
work_items: [WI-2777, WI-2783, WI-2784, WI-2785, WI-2786, WI-2787]
spec: docs/specs/2026-07-26-supporter-surface-v1-presentation-over-v2-logic.md
status: approved
---

# Supporter Surface Overhaul — Implementation Plan

**Goal:** Make the V2 supporter surfaces presentable and coherent by reusing the V1 presentation kit over V2 visibility logic, per spec rules R1–R7 — without removing or degrading any currently shipped V1/V0/flags-off surface.
**Approach:** Five sequenced stages, each a Work Item in **WS-32 (Supporter & Linking)**, ordered by `Workstream Order`. S1 (language/data contract) unblocks S2 (presentation); S3 is a design ruling that gates only V1-parity *detail* on MASKED cards; S4 (IA restructure) builds on S1+S2; S5 is independent. Each stage lands as its own PR through the normal WI lifecycle (claim → execute → complete → review).

Stage → WI map (all P2 except S5=P3; all Backlog/Assisted as of 2026-07-26):

| Stage | WI | Type | Depends on |
|---|---|---|---|
| S1 | WI-2783 (shared-record structured metadata + client i18n) | Bug | — |
| S2 | WI-2784 (V1 presentation kit reuse) | Enhancement | S1 |
| S3 | WI-2785 (per-field redaction ruling) | Design | — (gates V1-parity detail on MASKED cards only) |
| S4 | WI-2786 (person-first IA: conditional hub, Me-always, generalized hub) | Feature | S1, S2; sequence with WI-2242 |
| S5 | WI-2787 (client mirrors credentialed-charge gate) | Bug | — |

## Scope

In scope:
- `apps/api/src/services/shared-record-read-model.ts`, `apps/api/src/services/scope-resolution.ts`
- `apps/mobile/src/components/support/**`, `apps/mobile/src/components/home/ParentHomeScreen.tsx` (extraction only), `apps/mobile/src/components/chrome/ScopeChip.tsx`
- New presentation-pure components extracted from `ParentHomeScreen.tsx`
- `apps/mobile/src/i18n/locales/*.json` (new `sharedRecord.*` keys; Supportbereich/Support-Hub unification)
- `apps/mobile/src/app/(app)/more/mentor-language.tsx` (+ sibling child-settings editors)
- Tests co-located with the above

Out of scope (must not change):
- `packages/schemas/src/visibility-contract.ts` schema shapes (metadata field already exists — no schema change)
- `apps/api/src/services/reportability.ts`, `apps/api/src/services/family-access.ts` (`assertChargeNotCredentialed` is intended behavior)
- `apps/mobile/src/lib/legacy-navigation-contract.ts`, V0/V1 resolvers, `ModeSwitcher` (frozen until S6/WI-1308)
- `apps/mobile/eas.json` flag values

## Tasks

### S1 — WI-2783: structured metadata + client i18n

- [ ] T1: Populate `metadata` in `shared-record-read-model.ts` for the three fact kinds per spec §5.1 (`templateKey` + typed fields; keep `title`/`detail` as-is for fallback) — done when: unit test asserts each kind's metadata shape and that legacy `title`/`detail` are unchanged.
- [ ] T2: Add a kind-aware fact renderer in mobile (pattern: `MILESTONE_COPY`, `MilestoneCard.tsx:7`) mapping `templateKey` → `t('sharedRecord.fact.<templateKey>', vars)`, fallback to `title`/`detail` when `metadata` absent/unknown — done when: renderer unit test covers milestone/weeklyReport/sessionRecap + fallback branch; `SupportHubMentorTab` renders through it (no raw `fact.title` at `:122-133`).
- [ ] T3: Add `sharedRecord.fact.*` keys to `en.json` + `de.json` (run `pnpm translate` for the rest) — done when: `check-i18n-orphan-keys` and staleness checks pass.
- [ ] T4: Demote learner-generated chapter text from card titles in `PersonScopeStructuralSubjects.tsx:54` — title = book/curriculum name; learner text renders as attributed body content per R1 — done when: component test asserts a learner-typed chapter string is not in the title and renders with attribution.
- [ ] T5: Unify the German hub term (pick **Support-Hub**; replace `Supportbereich` at `de.json:3880`) — done when: one term across `de.json`; JSX-literal ratchet + orphan checks green.

### S2 — WI-2784: V1 presentation kit reuse

- [ ] T6: Extract `FamilySummaryPanel` (`ParentHomeScreen.tsx:577`) and `ChildCommandCard` (`ParentHomeScreen.tsx:339`) into presentation-pure components (props in, no data hooks) under `apps/mobile/src/components/home/` — done when: `ParentHomeScreen` renders them with unchanged output — its existing tests pass **without modification** (R6 extraction rule).
- [ ] T7: Compose supporter person-scope cards from the V1 kit (`VerifiedProofBlock`, `SubjectProgressRow`, `RecapRow`, `ProgressStatsChips`, `RecentFocusCard`) fed by `useSharedRecord` + S1 metadata; MASKED detail level A (structured summaries, no learner prose) pending S3 — done when: person-scope surface renders V1-kit cards from shared-record fixtures in a component test; no data source other than shared-record is imported for credentialed rows.
- [ ] T8: R6 guard: run the full nav guard-test family (spec §3 R6 list) untouched — done when: all listed tests green with zero edits to them.

### S3 — WI-2785: redaction ruling (design)

- [ ] T9: Present spec §7 options A/B/C to the operator with the recorded recommendation (A for launch); capture the ruling on WI-2785; author an MMT-ADR if the MMT-ADR-0000 gate is met; update spec §7 — done when: ruling recorded + spec updated + downstream statement of what S2's MASKED cards may add or must keep hidden.

### S4 — WI-2786: person-first IA

- [ ] T10: Make `resolveScopesForPerson` append `me` unconditionally for the supporter shape (`scope-resolution.ts:85-87`); return a flag (e.g. `hasLearningState`) so the client can pick doorway vs learner content — done when: service test asserts me-scope present with zero learning state; existing scope tests updated to the new contract (real behavior, not weakened).
- [ ] T11: Chip behavior per R3/R4 in `ScopeChip.tsx` + scope-context: 0 supportees → hub-only (cold start); 1 → person scope default, no hub pill, supporter-addressed modules fold into person scope; 2+ → hub pill present; Me pill always — done when: component tests cover the 0/1/2+ × me matrix.
- [ ] T12: Me empty state renders the doorway CTA ("start your own learning" / "learn along" when supporting someone); retire `SupporterSelfLearningDoorway` mount at `SupportHubMentorTab.tsx:270-274` into it; migrate — don't break — WI-2242's cold-start variants — done when: doorway component's job is reachable from Me scope in tests; WI-2242 flows' tests still pass.
- [ ] T13: Hub (2+ people) composes one morphing card per person from T6's extracted components — FULL grade (managed: owner hooks) vs MASKED grade (credentialed: shared-record only); mixed household renders mixed grades — done when: hub component test renders a managed+credentialed fixture with correct per-card data sources.
- [ ] T14: V2-on parity test (new): with `MODE_NAV_V2_ENABLED`, a guardian with managed children sees at least the V1 `ParentHomeScreen` information classes (per-child card, progress, cap notifications, add-child per `isAdultOwner`) — done when: the parity test exists, passes, and fails if a listed class is dropped (verified by temporarily removing one in dev).
- [ ] T15: R6 re-run: full guard-test family + `_layout.test.tsx` + `mentor.support-hub-return.test.tsx` green, untouched — done when: CI green with zero edits to frozen files (Out of scope list).

### S5 — WI-2787: client mirrors credentialed-charge gate

- [ ] T16: Extend the child-settings gate so credentialed charges never get an editor (`mentor-language.tsx:41-44`); show localized explanatory copy where the entry point remains visible — done when: component test for the credentialed case renders the explanation and fires no PATCH.
- [ ] T17: Sweep sibling child-settings editors for the same gap (`rg showMentorLanguageChildEditor` + gates in `navigation-contract.ts`); fix or record each — done when: sweep-audit block in the commit lists every hit and its disposition.

## Verification (whole-plan)

- Each stage lands via its WI's lifecycle (claim → PR → review); change-class router runs the mobile/api suites per diff.
- End state check against §1 of the spec: all 7 QA symptoms have a landed fix or a ruled decision (S3).
- R6 standing check on every stage PR: no edits to frozen files; guard-test family green.
