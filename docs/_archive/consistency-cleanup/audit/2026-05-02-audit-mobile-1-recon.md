# AUDIT-MOBILE-1 — Mobile artefact compliance recon

**Date:** 2026-05-02
**Auditor:** audit-mobile-1 (forked agent)
**Scope:** Mobile-specific CLAUDE.md rule compliance: persona-unaware shared components, semantic-token vs. hardcoded-color drift, Expo Router `unstable_settings`/`router.push`-chain conventions, and `apps/mobile/docs/` if any.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion punch list:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

Concrete drift found in three of the four scope dimensions: (1) three nested layouts violate the `unstable_settings` "safety net" rule — including `child/[profileId]/_layout.tsx` which has FOUR deeper dynamic children, (2) at least one production screen (`session/index.tsx`) carries 10 hardcoded hex codes for non-brand UI, and (3) a shared component (`AccordionTopicList.tsx`) executes a deep cross-stack push without the parent-first chain that `library.tsx` correctly demonstrates. Persona-unaware compliance is mostly clean — only `RemediationCard.tsx` is borderline. `apps/mobile/docs/` does not exist. None of the findings block SCHEMA-2 directly, but the missing `unstable_settings` exports are the kind of latent footgun that surfaces during mobile-touching execution work.

## Severity

**YELLOW** — Three concrete CLAUDE.md rule violations (`unstable_settings` + push-chain + semantic tokens) with low individual blast radius but high latent surface area; no security or data-integrity impact, but each violation is a documented dead-end risk per the "Repo-Specific Guardrails" section.

## Methodology

- `Glob apps/mobile/src/components/**/*.tsx` → component inventory (~140 .tsx, plus colocated tests)
- `Glob apps/mobile/src/app/**/_layout.tsx` → 16 layouts (2 root, 14 nested)
- `Grep -rn "persona|Persona|usePersona" apps/mobile/src/components` → 4 hits, all read in context (`MentomateLogo`, `RemediationCard`, `LivingBook`, `QuotaExceededCard`)
- `Grep "#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b" apps/mobile/src` (count mode) → 367 occurrences across 76 files
- `Grep "rgba?\(" apps/mobile/src` (count mode) → 34 occurrences across 4 files (mostly design-tokens itself)
- `Grep "unstable_settings" apps/mobile/src/app` → enumerated which layouts export it; cross-checked which layouts have both `index.tsx` + `[*]` dynamic children via `Glob`
- `Grep "router\.push\(" apps/mobile/src` → 120 push sites sampled; deep-read four cross-stack candidates in `library.tsx`, `LearnerScreen.tsx`, `AccordionTopicList.tsx`, `lib/navigation.ts`
- `Glob apps/mobile/docs/**/*.md` → 0 results; directory does not exist

## Findings

### Finding 1 — Three nested layouts violate the `unstable_settings` safety-net rule

- **Severity:** YELLOW
- **Files:**
  - `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx:1-32` (4 dynamic children: `session/[sessionId]`, `report/[reportId]`, `subjects/[subjectId]`, `topic/[topicId]` — uses `initialRouteName="index"` Stack prop only)
  - `apps/mobile/src/app/(app)/progress/_layout.tsx:7-17` (1 dynamic child `[subjectId]` — uses Stack prop only)
  - `apps/mobile/src/app/(app)/quiz/_layout.tsx:103-120` (1 dynamic child `[roundId]` + 4 static screens — has NEITHER the Stack prop NOR the `unstable_settings` export)
- **Evidence:** CLAUDE.md "Repo-Specific Guardrails" rule: *"Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes."* Six layouts already comply (`pick-book`, `onboarding`, `vocabulary`, `subject`, `topic`, `shelf/[subjectId]`); the three above are the gap. `child/[profileId]` is the highest-risk: four dynamic children all reachable via cross-stack push, and `AccordionTopicList.tsx:93` actively pushes one of them (see Finding 2).
- **Why it matters:** `unstable_settings` is the only documented Expo Router mechanism that guarantees a synthesized back-stack when a deep dynamic child is opened from another tab. Without it, `router.back()` after a cross-stack deep push falls through to the tab's first route, producing the dead-end UX behaviour the CLAUDE.md rule was written to prevent (see also `AUDIT-EVAL-2.1`/PR #137 references to the same class of bug). Stack `initialRouteName` prop seeds runtime navigation but is NOT the documented safety net the rule names.
- **Anticipated effort:** ~10 min per layout (3-line export); 30 min total including colocated test snapshots that follow the existing `pick-book/_layout.test.tsx:35` pattern.
- **Suggested track:** B

### Finding 2 — `AccordionTopicList.tsx` deep-pushes into `child/[profileId]` without the parent-first chain

- **Severity:** YELLOW
- **Files:** `apps/mobile/src/components/progress/AccordionTopicList.tsx:93-109`
- **Evidence:** Single `router.push({ pathname: '/(app)/child/[profileId]/topic/[topicId]', params: { profileId, topicId, … } })` from a topic-list pressable. Compare against the canonical good pattern at `apps/mobile/src/app/(app)/library.tsx:577-587` which explicitly comments *"shelf layout has no unstable_settings.initialRouteName, so we must push the parent route first to synthesise a proper back-stack"* and pushes both `/(app)/shelf/[subjectId]` THEN `/(app)/shelf/[subjectId]/book/[bookId]`. `AccordionTopicList` does not push `/(app)/child/[profileId]` first. Combined with Finding 1, this means: from the progress (or wherever this list mounts) tab, tapping a topic synthesizes a 1-deep stack containing only the leaf — exactly the failure mode CLAUDE.md cites verbatim.
- **Why it matters:** Under-the-hood twin of Finding 1: when both safety nets are missing simultaneously, `router.back()` after the push lands in the wrong tab. Fixing Finding 1 alone (adding `unstable_settings`) is sufficient to resolve the back-stack issue per Expo Router's documented behaviour; fixing Finding 2 alone (push the chain) is the redundancy. Belt-AND-suspenders is the convention in this repo (see `library.tsx:578` comment). At minimum the chain push should be added so the screen does not depend on Finding 1 landing first.
- **Anticipated effort:** ~5 min — duplicate the `library.tsx:580-587` two-push pattern.
- **Suggested track:** B (bundle with Finding 1 — same PR is natural)

### Finding 3 — `session/index.tsx` carries 10 hardcoded hex codes for non-brand UI

- **Severity:** YELLOW
- **Files:** `apps/mobile/src/app/(app)/session/index.tsx:160,170,179,191,202,211,231,238,256,265`
- **Evidence:** Sample matches: L160 `backgroundColor: '#faf5ef'` (cream background), L170 `color: '#b91c1c'` (red error), L231 `backgroundColor: '#0d9488'` (teal CTA), L238 `color: '#fff'`, L256 `backgroundColor: '#e5e7eb'` (gray secondary). These are not brand assets (compare to the explicitly-annotated `MentomateLogo.tsx:23-27` and `AnimatedSplash.tsx:75-105` `BRAND` constant blocks, both of which the rule allows). They are an error/loading/CTA section of the main session screen — the canonical case the CLAUDE.md rule targets: *"Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors."* `session/index.tsx` is also the highest-traffic shared screen in the app.
- **Why it matters:** Light/dark mode and accent-preset switching go through `useThemeColors()`/Tailwind semantic classes (see `session/_layout.tsx:6` for the existing pattern). Hardcoded values bypass both. Drift here was already detected in part by AUDIT-EVAL-2 fixups (PR #137) but the session screen itself was not touched.
- **Anticipated effort:** ~30-60 min to map each value to a semantic token from `lib/design-tokens.ts` and replace.
- **Suggested track:** B

### Finding 4 — Persona-rule compliance: 1 borderline, 3 clean

- **Severity:** GREEN-leaning-YELLOW
- **Files:** `apps/mobile/src/components/progress/RemediationCard.tsx:11-12,26-27,84-90`
- **Evidence:** Component receives `isLearner: boolean` as a prop, internal comment at L11 reads *"Persona-aware — caller passes this from layout/route context."* L84-90 then branches on `isLearner` to switch labels (`"Let's try something new!"` vs. parent-facing wording). The other three persona references are all clean: `MentomateLogo.tsx:23-27` ("hardcoded so the brand identity stays consistent regardless of persona"), `LivingBook.tsx:19` ("Callers map persona → boolean" — the prescribed pattern), `QuotaExceededCard.tsx:12` ("Persona-unaware: uses semantic tokens only"). `RemediationCard` decouples one layer (no `usePersona()` hook call internally) but still carries persona-keyed *text* — borderline against the literal CLAUDE.md rule *"Shared mobile components stay persona-unaware."* Two readings: (a) prop-injection counts as persona-unaware (caller decides) → not a violation; (b) the strings themselves are persona-keyed → soft violation. Worth a one-line decision in the punch list, not a fix sprint.
- **Why it matters:** The pattern is replicable. If accepted, it should be documented as the supported escape hatch (alongside the `LivingBook` pattern). If rejected, it should be refactored to a render-prop or pass strings in.
- **Anticipated effort:** N/A for the audit; ~1 hr to codify the decision in CLAUDE.md if the team wants to.
- **Suggested track:** C (governance clarification, not a code fix)

### Finding 5 — Aggregate hardcoded-color drift: 367 hits, but most are legitimate

- **Severity:** GREEN
- **Files:** 76 files; high-count non-violations include `lib/design-tokens.ts:77` (source of truth), `AnimatedSplash.tsx:26` (annotated brand block), `BookPageFlipAnimation.tsx:14`, `MagicPenAnimation.tsx:15`, `BrandCelebration.tsx:10` (all animation/brand), and ~80+ entries inside `*.test.tsx` files
- **Evidence:** After subtracting the design-token source, brand-annotated files, animation files, and tests, the residue is ~50-80 production-shipped sites — small enough to fix opportunistically rather than as a dedicated initiative. `session/index.tsx` (Finding 3) is the worst single concentration.
- **Why it matters:** Establishes a baseline so a future "sweep all hardcoded colors" effort is correctly scoped: the headline 367 is misleading; the actionable count is roughly an order of magnitude smaller.
- **Anticipated effort:** N/A for audit; ~1-2 days as a separate initiative if desired.
- **Suggested track:** C (track but do not block on)

### Finding 6 — `apps/mobile/docs/` does not exist

- **Severity:** GREEN (no findings possible)
- **Files:** N/A
- **Evidence:** `Glob apps/mobile/docs/**/*.md` → 0 results.
- **Why it matters:** Confirms the punch-list scope item is moot. Mobile documentation lives in the root `docs/` tree (e.g., `docs/architecture.md`, `docs/plans/`).
- **Suggested track:** not-actionable

## Cross-coupling notes

- **TYPES-1**: Mobile imports type-only from `@eduagent/api` (CLAUDE.md "Known Exceptions" → `tsconfig.json` references) and consumes runtime schemas from `@eduagent/schemas` (e.g., `quiz/_layout.tsx:3-7` imports `CompleteRoundResponse`, `QuizActivityType`, `QuizRoundResponse`; `dictation/_layout.tsx:3` imports `DictationSentence`, `DictationMode`; `lib/navigation.ts:2` imports `LearningResumeTarget`). TYPES-1 should report on whether these specific schemas are present, exported, and stable — if any get refactored or renamed during SCHEMA-2 execution, mobile breaks. None of the schemas mobile uses appear stale based on this incidental sampling.
- **TESTS-1**: Layout tests follow a strong pattern (`pick-book/_layout.test.tsx:35`, `onboarding/_layout.test.tsx:46`, etc.) that snapshot `unstable_settings` shape. The three layouts in Finding 1 lack such snapshots — TESTS-1 should expect their colocated tests to be either missing or weaker than the existing exemplars. Co-location is honoured throughout — no `__tests__/` directories observed in the mobile tree during this recon.
- **PACKAGE-SCRIPTS-1**: Not directly observed during this audit; one note for that auditor — `apps/mobile/` likely has its own `package.json` scripts referenced in CLAUDE.md "Handy Commands" (`pnpm exec nx lint mobile`, `cd apps/mobile && pnpm exec tsc --noEmit`, `cd apps/mobile && pnpm exec jest --findRelatedTests …`). Those should be verified against `apps/mobile/package.json`.
- **AUDIT-EVAL-2.1 / PR #139**: That in-flight session is hygiene on already-shipped code, not new remediation, and does not block these findings.

## Out of scope / not checked

- The `_layout.test.tsx` files for the three layouts in Finding 1 — not opened; coupling note above defers verification to TESTS-1.
- `expo-router` version-specific behaviour of `unstable_settings` vs. `Stack initialRouteName` prop — taken as authoritative per CLAUDE.md without independent verification against the Expo Router docs.
- Accessibility compliance (color-contrast on the hardcoded values in Finding 3).
- iOS/Android platform-specific drift (e.g., `Platform.OS` branches).
- The `(app)/_layout.tsx` root tabs file (859 lines, sampled at L517 + L859 only) — full audit deferred.
- Whether the persona-keyed strings in `RemediationCard` (Finding 4) are also localized correctly — not a CLAUDE.md scope item.

## Recommended punch-list entries

```markdown
- **AUDIT-MOBILE-1a** Add `unstable_settings = { initialRouteName: 'index' }` export to three nested layouts
  - Severity: YELLOW
  - Effort: ~30 min (3 layouts + snapshot tests)
  - Files: `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`, `apps/mobile/src/app/(app)/progress/_layout.tsx`, `apps/mobile/src/app/(app)/quiz/_layout.tsx`
  - Why it matters: CLAUDE.md "Repo-Specific Guardrails" non-negotiable. `child/[profileId]` has 4 deeper dynamic children all reachable via cross-stack push. Existing exemplars in `pick-book/_layout.tsx`, `onboarding/_layout.tsx`, etc.

- **AUDIT-MOBILE-1b** Push parent-first chain in `AccordionTopicList` topic press handler
  - Severity: YELLOW
  - Effort: ~5 min
  - Files: `apps/mobile/src/components/progress/AccordionTopicList.tsx:93-109`
  - Why it matters: CLAUDE.md cross-tab push-the-chain rule. Current single push to `/(app)/child/[profileId]/topic/[topicId]` synthesises a 1-deep stack, mirroring the exact failure case the rule cites. Bundle with MOBILE-1a for one PR.

- **AUDIT-MOBILE-1c** Replace 10 hardcoded hex codes in `session/index.tsx` with semantic tokens
  - Severity: YELLOW
  - Effort: ~30-60 min
  - Files: `apps/mobile/src/app/(app)/session/index.tsx:160,170,179,191,202,211,231,238,256,265`
  - Why it matters: CLAUDE.md "shared mobile components stay persona-unaware. Use semantic tokens." `session/index.tsx` is the highest-traffic shared screen and the worst hex concentration outside of brand/animation/test contexts. Map to existing tokens in `lib/design-tokens.ts`.

- **AUDIT-MOBILE-1d** Decide governance call on `RemediationCard` persona-keyed labels
  - Severity: YELLOW (governance clarification, not a code fix)
  - Effort: ~15 min discussion + ~10 min CLAUDE.md edit if decision is "this pattern is allowed"
  - Files: `apps/mobile/src/components/progress/RemediationCard.tsx:11-12,26-27,84-90`; CLAUDE.md
  - Why it matters: Borderline against "Shared mobile components stay persona-unaware." Either accept prop-injected persona-keyed strings as the supported pattern (and document it alongside the `LivingBook` "callers map persona → boolean" pattern) or refactor.

- **AUDIT-MOBILE-1e** Aggregate hardcoded-color drift sweep (deferred)
  - Severity: GREEN-leaning-YELLOW
  - Effort: ~1-2 days (separate initiative)
  - Files: ~50-80 production sites once design-tokens, brand-annotated, animation, and test files are excluded from the 367-hit raw count
  - Why it matters: Standalone token-hygiene initiative; not blocking. Track C.
```

## Audit honesty disclosures

- **Sampling rule for hardcoded-color worst offenders**: top 10 files by hex-match count from the count-mode grep, then deep-read of 3 (`session/index.tsx`, `AnimatedSplash.tsx`, `LearnerScreen.tsx`); the remaining 76 files were classified by filename heuristic (test/animation/brand/production) without opening, so the ~50-80 "real" residue figure in Finding 5 is an estimate, not a verified count.
- **`router.push` push-chain audit was sampled, not exhaustive**: 120 push sites returned by grep, ~15 read in detail (the cross-tab and deep-dynamic candidates). Same-tab and single-segment pushes (e.g., `progress/index.tsx:485` → `/(app)/progress/saved`) were not opened. There may be other instances of Finding 2 in code I did not deep-read.
- **`unstable_settings` rule interpretation**: I treated CLAUDE.md's literal text *"must export `unstable_settings = { initialRouteName: 'index' }`"* as authoritative over the in-file Stack `initialRouteName` prop pattern used by `child/[profileId]/_layout.tsx` and `progress/_layout.tsx`. Expo Router's behaviour around the two mechanisms was not independently verified against upstream docs.
- **`shelf/_layout.tsx` excluded from Finding 1**: it has a dynamic child `[subjectId]` but no top-level `index.tsx`, so the rule (which requires BOTH index AND deeper dynamic) does not strictly apply. The audit takes the conservative reading.
- **Time spent**: ~25 min of the 30-min cap. Deferred items above (full `(app)/_layout.tsx` audit, `_layout.test.tsx` snapshots for the three findings, full color sweep) would extend this materially.
- **No fixes were applied**, no git commands were run. Only writes were to this report file and (as part of normal recon) reads.
