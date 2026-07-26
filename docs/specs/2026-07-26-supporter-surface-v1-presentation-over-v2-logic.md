# Supporter Surface — V1 Presentation over V2 Logic

**Status:** ruled 2026-07-26 (operator) · **Work item:** WI-2777 (deep-dive umbrella) · **Decision record:** `docs/adr/MMT-ADR-0037-person-first-supporter-ia-and-v1-presentation-reuse.md` · **Plan:** `docs/plans/2026-07-26-supporter-surface-overhaul.md` · **Amends:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §4.1/§4.2 (see amendment note there)

This spec turns the 2026-07-26 QA findings and deep-dive verdict into an implementable design. The headline decision (recorded in MMT-ADR-0037): **reuse the polished V1 family-mode presentation over the V2 scope/shared-record logic**, restructure the supporter IA person-first, keep the Me scope always present, and **guarantee that turning on V2 never removes or degrades the V1 parent-hub surface**.

All file:line anchors verified against `main` @ 2026-07-26.

## 1. Problem — QA evidence and root causes

QA on the German staging build (supporter account, one accepted visibility contract) found the V2 supporter surfaces unusable. Symptoms and verified root causes:

| # | Symptom (what the supporter saw) | Root cause (file:line) |
|---|---|---|
| 1 | English fact strings on a German UI: "Weekly report…", "Session recap ready", "Milestone reached: …" | Server composes English prose: `apps/api/src/services/shared-record-read-model.ts:61-67` (weekly report), `:79-80` (recap), `:90-96` (milestone); mobile renders `fact.title`/`fact.detail` verbatim via `StructuralFactCard` in `apps/mobile/src/components/support/SupportHubMentorTab.tsx:122-133` |
| 2 | Jargon shown to end users: "Threshold 1" | `shared-record-read-model.ts:94` — `detail: compactFactParts(['Threshold', row.threshold])` |
| 3 | Learner's verbatim question rendered as a topic-card title | `apps/mobile/src/components/support/PersonScopeStructuralSubjects.tsx:54` — `` `${book.title} / ${chapter}` `` where `chapter` carries learner-generated text |
| 4 | Inconsistent naming: "Supportbereich" vs "Support-Hub" | `apps/mobile/src/i18n/locales/de.json:3880` vs `:4431` |
| 5 | Skeleton cards, header squeeze, no orientation (who is this person, what is our relationship, what can I do next) | `SupportHubMentorTab.tsx:216-250` header; skeleton composition throughout — V2 logic shipped without a presentation layer |
| 6 | No visible invitation into the supporter's own learning | `SupporterSelfLearningDoorway.tsx:15-26` renders only on the supporter-hub scope and steps aside when a me-scope exists; the me-scope itself appears only after learning state exists (`apps/api/src/services/scope-resolution.ts:85-87`) |
| 7 | Supporter offered a mentor-language editor for a credentialed learner, then got a generic "could not save" error | Server-intended block: `assertChargeNotCredentialed` (`apps/api/src/services/family-access.ts:75-89`, MMT-ADR-0008) — correct. Client bug: gate at `apps/mobile/src/app/(app)/more/mentor-language.tsx:41-44` doesn't distinguish managed from credentialed; error at `:85-92` is generic |

Root theme: **no coherent language/voice rule per audience, and V2 logic shipped with skeleton presentation** — while V1 already has a polished component kit rendering the *same underlying tables*.

## 2. Deep-dive verdict (why reuse works)

- The V2 shared-record pipeline (`shared-record-read-model.ts` → `reportability.ts` `filterToReportable` `:49-68` → `shared-record.ts` → `GET /visibility/reports/:personId/shared-record`, `apps/api/src/routes/visibility.ts:174-190` → `useSharedRecord`, `apps/mobile/src/components/support/use-shared-record.ts:19-34`) is a **visibility filter over the same three tables** (weekly reports, session summaries, milestones) that the V1 family surfaces render richly. It is not a parallel dataset.
- `ReportableFact.metadata` (`packages/schemas/src/visibility-contract.ts:74`, `z.record(z.string(), z.unknown()).optional()`) exists end-to-end, survives `filterToReportable` untouched (except the safety-escalation branch, which injects `safetyEscalation: true` at `reportability.ts:58-62`), and **is populated by nobody**. Structured facts + client-side i18n therefore need **zero schema changes**.
- Working precedents already practice the pattern: `PersonScopeStructuralSubjects` re-projects scope data into V1's `SubjectHubSurface` with `mode="supporter-readonly"` (`PersonScopeStructuralSubjects.tsx:213`); `RecapsEmptyState` was extracted from V1 for the V2 journal.

## 3. Design rules (the ruling — normative)

### R1 — Language resolution per surface

Three language dimensions exist and must never mix silently:

| Dimension | Source of truth | Where it renders |
|---|---|---|
| **UI locale** (chrome, labels, fact templates) | `i18next.language` (viewer's device/setting) | ALL supporter chrome, card titles, fact headlines, CTAs |
| **Conversation language** (mentor prose for a learner) | `profiles.conversation_language` | Learner-facing mentor content only — never supporter chrome |
| **Learner-generated content** (questions, notes, topic names typed by the learner) | verbatim learner input | Body content only, visually **attributed** to the learner (quote styling / "Jamie asked:") — never promoted into titles, headers, or chrome |

### R2 — No server-composed prose

The server ships **structured facts**: `kind` + typed `metadata`; the client renders through i18n templates in the viewer's UI locale. `title`/`detail` remain as legacy fallback fields during migration but no new surface may render them raw. This enforces the shell spec's template-first narration discipline (§8.2 / ruled-decision log #2).

### R3 — Person-first IA (conditional Support hub)

- **0 supportees:** hub = cold-start landing (shell spec §3.2 variant zero, unchanged).
- **Exactly 1 supportee:** land directly in that person's scope; **no hub pill**. Supporter-addressed modules about that person (morphing state card, approve/consent, notices) fold into the top of the person scope. Account-level items (billing) stay in More.
- **2+ supportees:** hub pill returns as the multi-person overview.

### R4 — Me scope always present

The Me pill is unconditionally in the supporter chip. Empty state renders a doorway CTA — "start your own learning", or "learn along" phrasing when they support someone. `SupporterSelfLearningDoorway` retires into this empty state. Server side, `resolveScopesForPerson` (`scope-resolution.ts:85-87`) appends `me` unconditionally for the supporter shape; `hasFirstRealLearningState` decides only whether Me renders learning content or the doorway.

### R5 — Hub = V1 parent hub generalized, relationship-graded cards

The multi-person hub derives from `ParentHomeScreen` (`apps/mobile/src/components/home/ParentHomeScreen.tsx:664`): one morphing card per person (shell-spec ruled-decision #14). Card grade keyed to the login-presence axis (MMT-ADR-0028):

| Grade | Who | Data path |
|---|---|---|
| **FULL** | Managed charge (no login row) | Existing owner-scoped V1 hooks (`useDashboard`, `useChildCapNotifications`, …) — legal and reused directly |
| **MASKED** | Credentialed supportee (has login) | **Only** the consent-gated shared-record (per-kind allowlist, MMT-ADR-0027) + structured metadata. `assertChargeNotCredentialed` (MMT-ADR-0008) forbids the owner path for these rows **by design** — never work around it |

A mixed household (managed + credentialed on one hub) renders mixed grades on one surface — a first-class cell, not an edge case.

### R6 — V1 surface preservation (hard constraint, operator-required)

**Turning on V2 (`MODE_NAV_V2_ENABLED`, `apps/mobile/src/lib/feature-flags.ts:32`) must not remove, cut down, or degrade the V1 parent-hub surface or any currently shipped flag state.**

- The `home.tsx:166` branch (`navigationContract.home.screen === 'FamilyHome'` → `ParentHomeScreen`) and its gates (`navigation-contract.ts:405-419`, `resolveHome()` `:441-449`) stay intact and reachable in every V0/V1/flags-off cell.
- Generalizing `ParentHomeScreen` for the hub happens by **extracting presentation-pure components out of it** (see §5), never by forking or gutting it — `ParentHomeScreen` keeps rendering the same V1 surface from the extracted parts.
- The existing guard-test family must stay green untouched: `legacy-navigation-contract.test.ts`, `navigation-contract.test.ts`, `navigation-contract.totality.test.ts`, `navigation-contract.property.test.ts`, `navigation-contract.guard.test.ts`, `navigation-contract-usage-guard.test.ts` (all `apps/mobile/src/lib/`), plus `_layout.test.tsx` and `mentor.support-hub-return.test.tsx`.
- S4 additionally ships a V2-on parity test: with V2 enabled, a guardian with managed children sees on the hub **at least** the information classes ParentHomeScreen shows today (per-child card, progress, notifications, add-child affordance per `isAdultOwner`).
- Retirement of any V0/V1 surface happens **only** via the S6 ruling (shell spec §13 open decision #1, WI-1308) — never as a side effect of this workstream.

### R7 — Client mirrors server gates, with explanation

Wherever the server intentionally blocks an operation (e.g. `assertChargeNotCredentialed` on child-settings writes), the client must not offer the editor and fail generically — it hides or disables the affordance and, where shown, explains why ("Jamie manages their own settings"). Applies to `mentor-language.tsx:41-44` and any sibling child-settings editor gated by `showMentorLanguageChildEditor`-style rules.

## 4. State matrix — what changes, what is frozen

| Audience | flags-off | V0=on | V1=on | **V2=on (this spec)** |
|---|---|---|---|---|
| Solo learner (adult or child) | 4-tab legacy | same | same | Me scope only, no chip — unchanged by this spec |
| Guardian + managed children | 5-tab legacy, `ParentHomeScreen` | mode shells | family/study shells | **NEW:** person-first chip; hub (2+ people) = generalized parent hub, FULL cards |
| Supporter of credentialed person(s) | n/a (V2-only concept) | n/a | n/a | **NEW:** person scope(s), MASKED cards from shared-record; conditional hub |
| Mixed managed + credentialed | n/a | n/a | n/a | **NEW (previously unowned):** one hub, mixed FULL/MASKED grades |
| Any supporter — Me | n/a | n/a | n/a | **CHANGED:** Me pill always present (was: appear-on-activity + doorway) |

Frozen cells (all non-V2 columns) are protected by R6. WI-2242 (V2 supporter first-edge onboarding, Executing) touches the V2 cold-start cell — S4 sequences with it (design-then-migrate, not disrupt).

## 5. Data contract and component reuse (concrete)

### 5.1 `ReportableFact.metadata` population (S1, API)

`shared-record-read-model.ts` populates per-kind structured metadata (no schema change — the field exists):

```ts
// milestone fact
metadata: { templateKey: 'milestone', milestoneType, threshold, subjectName }
// weekly-report fact
metadata: { templateKey: 'weeklyReport', reportWeek, stats: [{ label, value, comparison }] }
// session-recap fact
metadata: { templateKey: 'sessionRecap', subjectName, sessionDate }
```

`title`/`detail` keep their current English values as fallback for old clients. `filterToReportable` needs no change (metadata passes through; the safety-escalation injection at `reportability.ts:58-62` is preserved).

### 5.2 Client renderer (S1, mobile)

A kind-aware renderer (pattern: `MILESTONE_COPY` map in `apps/mobile/src/components/progress/MilestoneCard.tsx:7`) maps `metadata.templateKey` → `t('sharedRecord.fact.<templateKey>', vars)` with de+en keys, falling back to `title`/`detail` only when `metadata` is absent. `SupportHubMentorTab.tsx:122-133` and every shared-record consumer render through it.

### 5.3 Reusable V1 kit (S2)

| Component | Current location | Action |
|---|---|---|
| `VerifiedProofBlock` | `apps/mobile/src/components/family/VerifiedProofBlock.tsx` | reuse as-is |
| `SubjectProgressRow` | `apps/mobile/src/components/progress/SubjectProgressRow.tsx` | reuse as-is |
| `MentorSlot` | `apps/mobile/src/components/home/MentorSlot.tsx` | reuse as-is |
| `RecentFocusCard` | `apps/mobile/src/app/(app)/progress/_components/RecentFocusCard.tsx` | reuse as-is |
| `ProgressStatsChips` | `apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx` | reuse as-is |
| `RecapRow` | `apps/mobile/src/components/journal/RecapRow.tsx` | reuse as-is |
| `FamilySummaryPanel` | inline in `ParentHomeScreen.tsx:577` | **extract** to presentation-pure component (props in, no hooks) |
| `ChildCommandCard` | inline in `ParentHomeScreen.tsx:339` | **extract** to presentation-pure component; becomes the FULL-grade person card; a MASKED-grade variant renders from shared-record props |

Extraction rule (R6): `ParentHomeScreen` continues to render the extracted components with identical output — extraction PRs must show its tests/snapshots unchanged.

## 6. Reconciliation with named inputs (from WI-2777 refine)

- **WI-2460 (mentor-language override provenance):** R1's table is the target model; WI-2460's provenance work slots into the "conversation language" row and is unaffected by R2-R5.
- **WI-2197 (supporter notification routing, Ready):** notifications addressed to the supporter route to the hub when it exists (2+ people), else into the single person scope's supporter-module area (R3). WI-2197 should consume R3's placement rule rather than assume a hub.
- **WI-2518 (supporter-scope read-authority):** R5's MASKED path is the read-authority boundary in practice — shared-record is the only read path for credentialed rows; WI-2518's server-side assertions back R5.

## 7. Open decision (S3) — per-field supporter redaction

The visibility contract filters **per-kind** (`mastery` / `effort` / `observable_engagement`, `visibility-contract.ts:4-8`). V1-parity recap/proof cards can carry more detail than a kind-level gate contemplates (verbatim quotes inside proof blocks, recap prose). **Before MASKED cards render V1-parity detail, a ruling is needed on which fields inside an allowed kind are exposed** (artifact wall, MMT-ADR-0027). Options to rule between (S3 frames these for the operator; ADR if the MMT-ADR-0000 gate is met):

- **A. Kind-level only (status quo):** MASKED cards show structured summaries (counts, subject names, mastery states) — no learner prose ever.
- **B. Field allowlist per kind:** contract gains a per-kind field mask (e.g. recap: `subjectName`+`date` yes, prose no) — most precise, schema+ceremony change.
- **C. Two fidelity presets** ("summary" / "detailed") chosen at the linking ceremony — simpler consent story than B, coarser.

Until ruled, S2 ships MASKED cards at level A. (Recommendation recorded for the ruling session: **A for launch, revisit B/C with the managed-tier activation** — smallest consent surface, zero new ceremony.)

## 8. Out of scope

- Cross-org supporter (stays with WI-2536).
- Recaps-into-Journal (WI-2232), supportee-side mirror (WI-2233), pre-acceptance disclosure (WI-2395), pending-visibility cold-start (WI-2521), milestone history rehome (WI-1395) — related, linked on WI-2777, not re-scoped here.
- Any V0/V1 retirement (S6/WI-1308 only).
- The full "language setup rewire" beyond supporter surfaces (R1 is the supporter-surface slice; an estate-wide language-architecture pass would be its own design item).

## 9. Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Shared-record fetch fails | network/5xx | Person scope renders header + `ErrorFallback` with retry; no skeleton cards | Retry refetches; chrome stays navigable |
| Fact with unknown `templateKey` | old server / new client skew | Fallback to `title`/`detail` (legacy strings) — never blank card | S1 renderer's default branch |
| Fact with no `metadata` | pre-S1 server rows | Same legacy fallback | same |
| Credentialed supportee revokes mid-session | contract ends | Person scope retires per shell spec §4.2 EU-7 (plain card, never silent disappearance) | unchanged behavior |
| Supporter opens child-settings editor for credentialed charge | R7 gate missed | Must not happen post-S5; if reached, error copy names the reason ("manages their own settings"), not generic | S5 |
| V2 flag on, guardian with managed children | flag rollout | Hub shows ≥ V1 information classes (R6 parity test) | parity test blocks regression at CI |

## 10. Acceptance (maps to WI-2777 AC)

1. This doc + MMT-ADR-0037 land under `docs/specs/` / `docs/adr/` with the shell-spec amendment note (lockstep).
2. Sequenced fix WIs exist in WS-32 (Supporter & Linking), each traceable to §1's symptom table: S1→symptoms 1/2/3/4, S2→5, S3→7 §7-decision, S4→5/6, S5→symptom 7. (IDs recorded in the plan doc.)
3. Every stage WI carries concrete AC citing this spec's rules (R1-R7) and §5's contracts.
