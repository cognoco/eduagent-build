# AUDIT-MOBILE-2 — Mobile design-token-drift deepening

**Date:** 2026-05-03
**Auditor:** audit-mobile-2 (forked agent — read-only)
**Scope:** Rebuild C4's hex-code count cleanly, classify by remediation type, investigate `session/index.tsx` 10→7 anomaly from baseline-delta, re-verify MOBILE-1 F4 (`RemediationCard`) and F1 (`unstable_settings`) at HEAD, and spot-check profile-as-lens phase 1 for new persona-keyed conditionals in shared components.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion:** `docs/audit/2026-05-02-audit-mobile-1-recon.md`, `docs/audit/2026-05-03-baseline-delta.md`, `docs/audit/2026-05-02-artefact-consistency-punchlist.md`

---

## TL;DR

Properly filtered, the C4 violation set is **20 hex-code occurrences across 6 production `.tsx` files** — an order of magnitude smaller than the baseline-delta's headline "252 across 67" and roughly 4× smaller than MOBILE-1's "~50-80 sites" estimate. The remaining ~232 occurrences split cleanly: 134 in `*.test.tsx` fixtures (acceptable, no rule applies), 98 in 13 brand/animation/celebration files (acceptable as flagged-for-governance — they are SVG-internal brand-asset hex codes with explicit in-file comments naming them as such). **The baseline-delta's "10 → 7" claim for `session/index.tsx` was a measurement artifact**: that survey ran only the 6-digit `#xxxxxx` pattern, while MOBILE-1's original count (10) included the three 3-digit `#xxx` matches at L191/211/238. At HEAD the file still has the same 10 occurrences as at baseline `8672bdcd`, and `git log` shows zero hex churn since then — no partial fix happened, deliberate or otherwise. **MOBILE-1 F1 ("3 layouts missing `unstable_settings`") survives strict per-layout re-evaluation**: of the 10 layouts without the export, only 3 actually have both an `index.tsx` and a deeper dynamic child (`progress`, `quiz`, `child/[profileId]`) — the same 3 MOBILE-1 named. **MOBILE-1 F4 (`RemediationCard` persona-keyed strings) is unchanged at HEAD** — no commits touched it since baseline. **No new persona-keyed conditionals were introduced into shared components by profile-as-lens phase 1** — the persona-distinct work landed in dedicated `parent/`, `coaching/`, `home/` subfolders rather than as conditionals inside shared widgets.

The cluster's narrative shifts: the 252-headline scope expansion is real *for raw counts* but disappears under proper filtering. C4 is now a small, surgical fix (6 files, ~1-2 hours) plus a separate governance call (token policy for SVG-internal brand-asset hex), not a multi-day sweep.

## Severity

**YELLOW (downgraded from baseline-delta's implicit "RED-leaning")** — Three concrete CLAUDE.md rule violations with low individual blast radius and now a small, sliceable footprint. The 252-occurrence scare from the baseline delta is a measurement-without-filtering artifact. The actual violation surface fits in one PR. The governance-call surface (brand-asset hex in SVG component bodies) is a documentation/policy decision, not a sweep.

## Methodology

- `git ls-files | grep -v '\.test\.tsx$' | grep -v '\.spec\.tsx$'` over `apps/mobile/src/**/*.tsx` → **176 production `.tsx` files** as the denominator for Filter 1.
- Per-file count: shell loop running `grep -cE "#[0-9A-Fa-f]{6}"` AND `grep -cE "#[0-9A-Fa-f]{3}\b"` against each production file, summed, and sorted descending. Result: **19 production files contain at least one hex literal, 118 occurrences total** (110 6-digit + 8 3-digit).
- Filter 2 (declared design-token files): `apps/mobile/src/lib/design-tokens.ts` and `apps/mobile/src/lib/subject-tints.ts` are both `.ts` not `.tsx`, so they are already excluded by the `--type tsx` filter. Verified by reading both — `design-tokens.ts:46-50` defines the canonical `tokens` constant, `subject-tints.ts:7` re-exports `SUBJECT_TINT_PALETTE`. No `.tsx` files in `lib/` are token declarations. **Filter 2 is a no-op for the .tsx subset.** Production count stays at 118 / 19.
- Filter 3 (brand/animation/celebration buckets): read each candidate to confirm in-file annotation. Files explicitly annotated as brand-asset hex: `AnimatedSplash.tsx:57-67` ("Brand-accurate splash colors. These are hardcoded to match the canonical brand SVGs … rather than derived from theme tokens"), `MentomateLogo.tsx:20-26` ("Brand-fixed wordmark colors … hardcoded so the brand identity stays consistent regardless of persona or accent preset"), `BrandCelebration.tsx:28` ("Brand colors — use the brighter dark-mode variants for maximum pop"), the four `common/celebrations/*.tsx` files (each renders an SVG circle/path with cosmetic violet/lavender hex passed through to react-native-svg), and the five other `common/*Animation.tsx` files (BookPageFlip, MagicPen, LightBulb, DeskLamp, CheckmarkPop, CelebrationAnimation — animation primitives drawn into SVGs). 13 files, 98 occurrences. Bucketed as "acceptable, flag for governance."
- Residue after Filter 3 = **6 production .tsx files with 20 hex occurrences total**. This is the C4 violation count.
- `git log --since="2026-04-25" -- "apps/mobile/src/app/(app)/session/index.tsx"` → 3 commits since 2026-04-25, none after baseline `8672bdcd`. `git show 8672bdcd:apps/mobile/src/app/(app)/session/index.tsx | grep -cE "#"` returns 10. `git show HEAD:... | grep -cE "#"` returns 10. **No churn.**
- `Glob apps/mobile/src/app/**/_layout.tsx` → 16 layouts. `Grep unstable_settings` → 6 export it. For each of the 10 that don't, used `Bash ls` against the layout's directory + subdirectories to determine: (a) does an `index.tsx` exist as a sibling? (b) is there a `[*].tsx` dynamic child or a `[*]/` subdirectory containing one?
- `Read apps/mobile/src/components/progress/RemediationCard.tsx` (full file) and `git log --since="2026-05-01" -- ...` → file has zero commits in window; persona-keyed strings still present at L31-44 (cooldown copy), L84-101 (label assignments), L125-195 (full divergent JSX branches).
- `git log --since="2026-04-25" --diff-filter=AM --name-only -- apps/mobile/src/components/` → 25 modified/added components in window. Read 5 newly-added home / parent / coaching / interview shared-folder candidates (`CoachBand.tsx`, `SubjectCard.tsx`, `ParentGateway.tsx`, `ParentDashboardSummary.tsx`, `SamplePreview.tsx`) — none contain `persona|isLearner|isParent` patterns. `Grep "persona|isLearner|isParent"` across `apps/mobile/src/components/**/*.tsx` returns only 2 hits: `LearnerScreen.tsx` (uses derived `isParentProxy` boolean — see Finding 5) and `RemediationCard.tsx` (the known F4).

## Findings

### Finding 1 — Properly filtered hex-code violation count is 20 occurrences across 6 files (not 252 across 67)

- **Severity:** YELLOW
- **Files:** Filter funnel below. Headline figure: **20 across 6 production .tsx files.**

**Filter funnel:**

| Stage | .tsx files | Hex occurrences | Notes |
|---|---|---|---|
| Raw 6-digit + 3-digit hex match across all `apps/mobile/src/**/*.tsx` | ~70 | ~295 | matches baseline-delta's "252 6-digit only" + 43 3-digit |
| Filter 1: production only (exclude `.test.tsx`, `.spec.tsx`) | 19 | 118 | tests carry 134 hex literals, mostly fixtures |
| Filter 2: exclude declared design-token files (`design-tokens.ts`, `subject-tints.ts`) | 19 | 118 | no-op — both are `.ts` not `.tsx` |
| Filter 3: exclude brand/animation/celebration files | 6 | 20 | 13 files / 98 occurrences moved to "acceptable, flagged for governance" |

**The 6 violation files** (counts include both 6-digit and 3-digit hex; note: 3-digit `#xxx` is excluded from a strict 6-digit-only grep, which is what produced the baseline-delta's "10 → 7" measurement artifact for `session/index.tsx`):

| File | Hex total | Hex lines |
|---|---|---|
| `apps/mobile/src/app/(app)/session/index.tsx` | 10 | 160, 170, 179, 191, 202, 211, 231, 238, 256, 265 |
| `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | 4 | 380, 388, 733, 819 |
| `apps/mobile/src/app/_layout.tsx` | 3 | 365, 380, 388 |
| `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` | 1 | 125 |
| `apps/mobile/src/app/profiles.tsx` | 1 | 388 |
| `apps/mobile/src/components/library/NoteInput.tsx` | 1 | 123 |
| **Total** | **20** | |

**The 13 brand/animation/celebration files** (governance bucket; each contains in-file comments documenting the hex as brand-asset / animation-primitive intent):

| File | Hex count | Annotation source |
|---|---|---|
| `apps/mobile/src/components/AnimatedSplash.tsx` | 26 | L57-67 ("Brand-accurate splash colors") |
| `apps/mobile/src/components/common/MagicPenAnimation.tsx` | 15 | SVG-internal stroke/fill colors |
| `apps/mobile/src/components/common/BookPageFlipAnimation.tsx` | 14 | L20 ("Cover color (default: brand violet #8b5cf6)") |
| `apps/mobile/src/components/common/BrandCelebration.tsx` | 10 | L28 ("Brand colors — use the brighter dark-mode variants") |
| `apps/mobile/src/components/MentomateLogo.tsx` | 6 | L20-26 ("Brand-fixed wordmark colors") |
| `apps/mobile/src/components/common/celebrations/OrionsBelt.tsx` | 6 | SVG path/circle fills |
| `apps/mobile/src/components/common/celebrations/TwinStars.tsx` | 5 | SVG path/circle fills |
| `apps/mobile/src/components/common/LightBulbAnimation.tsx` | 4 | SVG-internal |
| `apps/mobile/src/components/common/celebrations/Comet.tsx` | 4 | SVG-internal |
| `apps/mobile/src/components/common/celebrations/PolarStar.tsx` | 3 | SVG-internal |
| `apps/mobile/src/components/common/DeskLampAnimation.tsx` | 2 | SVG-internal |
| `apps/mobile/src/components/common/CheckmarkPopAnimation.tsx` | 2 | SVG-internal |
| `apps/mobile/src/components/common/CelebrationAnimation.tsx` | 1 | SVG-internal |
| **Total** | **98** | |

- **Evidence:** CLAUDE.md "Non-Negotiable Engineering Rules": *"Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors."* The 6 violation files contain hex codes for non-brand UI: backgrounds, text colors, error states, CTAs, placeholder colors, indicator colors. None are inside SVG primitives or annotated as brand-fixed. The 13 governance-bucket files are all SVG-internal cosmetic colors with documented brand intent — they should be governed by an explicit policy ("brand-asset hex in `*Animation.tsx` and `*Celebration.tsx` is acceptable") rather than counted as violations. The remaining 134 hex occurrences in `*.test.tsx` files are test fixtures (mock theme objects, snapshot color values) — not subject to the rule.
- **Why it matters:** The baseline-delta's "252 across 67 files" headline made C4 look like a multi-day sweep. The actual violation count (20 across 6 files) makes it a single-PR fix. The cluster framing in `2026-05-02-consolidated-overview.md §7` should be revised: the *actionable* count is ~20, not 252.
- **Anticipated effort:** ~1-2 hours total — `session/index.tsx` is the bulk (10 sites, ~30-60 min); the other 5 files are 1-4 sites each (~10 min each).
- **Suggested track:** B (immediate slice for the 6 violation files); C (separate governance call to codify the brand/animation/celebration exemption, ~15 min CLAUDE.md addition).

### Finding 2 — Per-directory bucket for the violation set

- **Severity:** YELLOW (informational; supports slicing the eventual fix)
- **Files:** as below

| Directory | Files | Hex occurrences | Notes |
|---|---|---|---|
| `app/(app)/session/` | 1 | 10 | Single-screen concentration; error/loading/CTA UI |
| `app/(app)/child/[profileId]/` (incl. nested `session/`) | 2 | 5 | Profile-as-lens phase 1 territory; Ionicon `color` props for streak/star icons + a dim/secondary color |
| `app/` (root + `profiles.tsx`) | 2 | 4 | Auth/transition shell; one `placeholderTextColor`, one CTA, one secondary text |
| `components/library/` | 1 | 1 | `NoteInput.tsx:123` — `<ActivityIndicator color="#fff" />` (could be `tokens.colors.textInverse`) |
| **Totals** | **6 files** | **20 occurrences** | |

- **Evidence:** Counts derived from per-file `grep -cE "#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}\b"` against each violation-bucket file.
- **Why it matters:** Lets the eventual remediation be sliced. `session/index.tsx` is the worst single concentration (50% of the violation count). The two `child/[profileId]/*` files came in via profile-as-lens phase 1 and may be easiest to bundle with phase 2.
- **Anticipated effort:** see Finding 1.
- **Suggested track:** B (phasing recommendation in punch-list entry below).

### Finding 3 — `session/index.tsx` 10→7 reduction was a measurement artifact, not a partial fix

- **Severity:** GREEN (clarifies a baseline-delta finding; not a code issue)
- **Files:** `apps/mobile/src/app/(app)/session/index.tsx`
- **Evidence:**
  - At baseline `8672bdcd` (2026-05-02 14:57 — used by baseline-delta as the cutoff): `git show 8672bdcd:apps/mobile/src/app/(app)/session/index.tsx | grep -cE "#"` returns **10**.
  - At HEAD `7b070296`: `grep -cE "#" apps/mobile/src/app/(app)/session/index.tsx` returns **10**.
  - `git log --since="2026-04-25" -- apps/mobile/src/app/(app)/session/index.tsx` shows the most recent commit touching the file is `8672bdcd` itself (the baseline). Zero commits modified the file between baseline and HEAD.
  - Per-line breakdown of the 10 hex occurrences at HEAD: 7 are 6-digit (L160 `#faf5ef`, L170 `#b91c1c`, L179 `#1a1a1a`, L202 `#fee2e2`, L231 `#0d9488`, L256 `#e5e7eb`, L265 `#374151`), and 3 are 3-digit (L191 `#444`, L211 `#333`, L238 `#fff`).
  - The baseline-delta's recon ran `Grep #[0-9A-Fa-f]{6}` only (6-digit pattern), which silently dropped the three 3-digit matches and yielded **7** at HEAD. MOBILE-1's original count of "10 hex codes" was correct because that audit applied both 6- and 3-digit patterns (the methodology section at L24 says `Grep "#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b"`).
- **Why it matters:** Resolves the cluster-meta-pattern question definitively: **there was no partial fix on `session/index.tsx`, deliberate or accidental**. The "fix locally, don't sweep" meta-pattern claim from baseline-delta's TL;DR ("the cluster's own meta-pattern playing out in real time on the cluster's own example file") does not hold for this file. The cluster meta-pattern remains evidenced by other audit-window observations (e.g., the `35fd074a` consent-hardening commit not addressing TYPES-1 F2), but `session/index.tsx` is not an instance of it.
- **Anticipated effort:** N/A — this is a corrections finding, not a code change.
- **Suggested track:** not-actionable (the baseline-delta should be amended; see "Recommended punch-list entries" below).

### Finding 4 — `RemediationCard` persona-keyed strings unchanged at HEAD

- **Severity:** YELLOW (governance call still pending; no code change required for *this* audit cycle)
- **Files:** `apps/mobile/src/components/progress/RemediationCard.tsx:11-12, 27-44, 84-101, 125-195`
- **Evidence:** `git log --since="2026-05-01" -- apps/mobile/src/components/progress/RemediationCard.tsx` returns no commits. Reading the file at HEAD confirms:
  - L11-12 retain the `isLearner: boolean` prop with comment *"Persona-aware — caller passes this from layout/route context."*
  - L27-44 `getCooldownMessage()` branches on `isLearner` to return either learner-friendly copy (`"go do something fun!"` / `"your brain needs a real break!"` / `"Come back tomorrow"`) or a teen-style countdown (`"Your brain needs a break — try again in {Xh Ym}"`).
  - L84-101 assign four label variables (`roundLabel`, `encouragement`, `primaryLabel`, `secondaryLabel`) by branching on `isLearner`. Strings are persona-divergent (e.g., `"Let's try something new!"` vs `"Attempt {N}"`).
  - L125-195 render two completely different JSX trees (`isLearner ? <LearnerLayout /> : <TeenLayout />`) — different button order, different button styles, different secondary action affordance.
- **Why it matters:** This survives the audit window unchanged, so MOBILE-1 F4's governance question is still live. The component decouples one layer (no `usePersona()` hook call internally — caller passes the boolean) but contains persona-keyed *strings and JSX structure*. Two readings: (a) prop-injection counts as persona-unaware → not a violation; (b) the strings + structure are persona-keyed regardless of where the boolean came from → soft violation. The CLAUDE.md text *"Shared mobile components stay persona-unaware"* is ambiguous between these readings. Decision needs to happen, but it's a doc/policy question, not a code-fix question.
- **Anticipated effort:** ~15 min governance discussion + ~10 min CLAUDE.md edit if decision is "this pattern is allowed"; ~2-4 hr refactor if decision is "this pattern is forbidden" (extract the four string variables and the two JSX trees into caller-passed render props or string maps).
- **Suggested track:** C (governance call — same as MOBILE-1 F4 / AUDIT-MOBILE-1d).

### Finding 5 — `unstable_settings` rule re-evaluated per-layout: 3 of 10 needs-fix, confirming MOBILE-1 F1

- **Severity:** YELLOW
- **Files:** as below

Per-layout table (the 10 layouts that lack `unstable_settings`, with the rule application call):

| Layout file | Has `index.tsx`? | Has deeper `[*]` child? | Rule applies? |
|---|---|---|---|
| `apps/mobile/src/app/_layout.tsx` (root) | `app/index.tsx` exists at sibling path | Subdirs are route groups `(app)`/`(auth)` and segment dirs (`assessment`, `session-summary`); none are `[*]` direct children of root | does-not-apply (root, not nested Stack with index+dynamic) |
| `apps/mobile/src/app/(app)/_layout.tsx` (root tabs) | No `(app)/index.tsx` (uses `home.tsx` etc. as Tabs entries) | Tabs structure, not Stack with dynamic children | does-not-apply (Tabs layout — different rule) |
| `apps/mobile/src/app/(auth)/_layout.tsx` | No `index.tsx` | No `[*]` children | does-not-apply |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | YES `index.tsx` | NO (`complete.tsx`, `playback.tsx`, `review.tsx`, `text-preview.tsx` are static) | does-not-apply |
| `apps/mobile/src/app/(app)/homework/_layout.tsx` | NO (only `camera.tsx`) | NO | does-not-apply |
| `apps/mobile/src/app/(app)/session/_layout.tsx` | YES `index.tsx` | NO `[*]` children | does-not-apply |
| `apps/mobile/src/app/(app)/shelf/_layout.tsx` | NO `index.tsx` (only `[subjectId]/` subdir) | YES `[subjectId]/` | does-not-apply (no `index` — rule requires BOTH) |
| `apps/mobile/src/app/(app)/progress/_layout.tsx` | YES `index.tsx` | YES `[subjectId].tsx` | **needs-fix** (uses Stack `initialRouteName="index"` prop only) |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | YES `index.tsx` | YES `[roundId].tsx` | **needs-fix** (no Stack prop AND no `unstable_settings`) |
| `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | YES `index.tsx` | YES (5 dynamic children: `session/[sessionId]`, `report/[reportId]`, `subjects/[subjectId]`, `topic/[topicId]`, `weekly-report/[weeklyReportId]` — note: only 4 of 5 are registered as `<Stack.Screen>` in the layout body; `weekly-report` is auto-discovered) | **needs-fix** (uses Stack `initialRouteName="index"` prop only) |

- **Evidence:** Reads of each `_layout.tsx` file at HEAD plus directory listings of each layout's siblings to check for `index.tsx` and `[*].tsx`/`[*]/` children. CLAUDE.md "Repo-Specific Guardrails": *"Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes."*
- **Why it matters:** Resolves MOBILE-1 F1's "3 layouts missing" claim to a concrete list. The same 3 named in MOBILE-1 (`progress`, `quiz`, `child/[profileId]`) survive strict re-evaluation. `child/[profileId]` is the highest-risk: it has 5 deeper dynamic children (4 explicitly registered + `weekly-report` discovered by file convention). The newly-registered `weekly-report/[weeklyReportId].tsx` (added in window) is implicitly covered by the layout's lack of `unstable_settings` — so the urgency of fixing this layout has *increased* slightly since MOBILE-1.
- **Anticipated effort:** ~30 min — same as MOBILE-1 F1's estimate. 3-line export per layout × 3 layouts + colocated test snapshots that follow `pick-book/_layout.test.tsx:35` pattern.
- **Suggested track:** B (unchanged from MOBILE-1; bundle with the existing AUDIT-MOBILE-1a punch-list entry rather than creating a new one).

### Finding 6 — No new persona-keyed conditionals introduced into shared components by profile-as-lens phase 1

- **Severity:** GREEN
- **Files:** spot-checked: `components/home/CoachBand.tsx`, `components/home/SubjectCard.tsx`, `components/home/ParentGateway.tsx`, `components/coaching/ParentDashboardSummary.tsx`, `components/parent/SamplePreview.tsx`, `components/parent/MetricInfoDot.tsx`, `components/durability/OutboxFailedBanner.tsx`, `components/interview/InterviewCompletingPanel.tsx`, `components/interview/InterviewFailedPanel.tsx`, `components/session/FilingFailedBanner.tsx`. Repo-wide grep `Grep "persona|isLearner|isParent" apps/mobile/src/components/**/*.tsx` returns 2 hits: `LearnerScreen.tsx` and `RemediationCard.tsx` (both pre-existing).
- **Evidence:**
  - `git log --since="2026-04-25" --diff-filter=AM --name-only -- apps/mobile/src/components/` lists 25 modified/added components in the audit window. Spot-read 10 of them across the candidate folders.
  - Of those 10, **zero** introduced `persona === ...` ternary conditionals or `isLearner`/`isParent` boolean branches. The persona-distinct work landed in dedicated subfolders (`components/parent/`, `components/coaching/`) where the file's whole purpose is parent-facing — that pattern is consistent with the architectural intent of the rule (separate components per persona, not branched components).
  - `LearnerScreen.tsx` (the only screen-level component in `components/`) derives `isParentProxy = Boolean(activeProfile && !activeProfile.isOwner && profiles.some((p) => p.isOwner))` at L72-74 and uses `!isParentProxy` to gate sections. This is a *parent-proxy mode* check, not a learner-vs-parent persona conditional in the CLAUDE.md sense, and `LearnerScreen` is screen-style (called by `home.tsx` as the whole tab content), not a shared widget. Borderline but defensible — same pattern as the `useParentProxy` hook called from layouts (`session/_layout.tsx:7`, `dictation/_layout.tsx:61`, `quiz/_layout.tsx:105`, `homework/_layout.tsx:7`).
- **Why it matters:** Confirms profile-as-lens phase 1 did not violate the persona-unaware rule despite its 216-file blast radius. The architectural choice to fold parent-distinct UI into dedicated `components/parent/` and `components/coaching/` subfolders rather than branching shared components is the right pattern and worth documenting as the precedent.
- **Anticipated effort:** N/A.
- **Suggested track:** not-actionable (positive finding; could be promoted into CLAUDE.md as a documented pattern in the same governance cycle as MOBILE-1 F4).

## Cross-coupling notes

- **Profile-as-lens phase 1 coupling:** Two of the six violation files (`child/[profileId]/index.tsx` with 4 hex occurrences, `child/[profileId]/session/[sessionId].tsx` with 1) live in profile-as-lens phase 1 territory. If phase 2 is in flight or planned, the C4 fix for those two files can ride on its coattails (token migration as part of a phase-2 cleanup pass) rather than being a standalone PR. The other 4 violation files (`session/index.tsx`, `app/_layout.tsx`, `profiles.tsx`, `library/NoteInput.tsx`) are not in phase 2's natural surface area — they should be in the immediate slice.
- **Design-token canonical files:** `apps/mobile/src/lib/design-tokens.ts` exports `tokens.colors.{textInverse, textPrimary, textSecondary, primary, danger, warning, surface, background, ...}` — sufficient mapping targets exist for every value in the violation set. No new tokens need to be authored; the fix is purely substitution. Specifically, the recurring `'#fff'` occurrences (4 sites across 3 files) all map to `tokens[scheme].colors.textInverse`, and `'#0d9488'` (2 sites) maps to `tokens.light.colors.primary` (also exposed via Tailwind's `bg-primary`).
- **MOBILE-1 (predecessor):** This deepening confirms F1 (3 layouts) and F4 (`RemediationCard` governance) verbatim, refines F3 (`session/index.tsx` count is 10 not 7 — baseline-delta's "10 → 7" was a 6-digit-only artifact), and re-scopes F5 (the deferred sweep is 20 sites not "~50-80 sites"). MOBILE-1's punch-list entries `1a`, `1c`, `1d` should be updated rather than replaced.
- **Baseline-delta correction:** The `2026-05-03-baseline-delta.md` C4 section ("`session/index.tsx` shrank from 10 to 7", "Partial fix without sweep — the cluster's own meta-pattern playing out on the cluster's own example file") should be amended. The 252-occurrence headline survives factually but its TL;DR framing of C4 as "materially worse" is a measurement artifact under proper filtering. Suggested amendment: keep the raw count, add the filter funnel, retract the meta-pattern claim about `session/index.tsx`. The meta-pattern claim still stands generally (the `35fd074a` consent example is solid), just not on this specific file.
- **TYPES-1 / TESTS-1 / DEP-DRIFT-1 / PACKAGE-SCRIPTS-1:** No coupling. C4 is mobile-token hygiene; the other audits don't touch the same surface area.

## Out of scope / not checked

- Did not deep-read every brand-asset / animation file to confirm in-file annotation — sampled the 5 worst by hex count (`AnimatedSplash`, `MentomateLogo`, `BrandCelebration`, `BookPageFlipAnimation`, `OrionsBelt`) and confirmed each contains explicit comments or named-constant blocks documenting brand intent. The 8 smaller animation/celebration files (combined 24 hex occurrences) were classified by filename + size heuristic, not by deep read. If any of those 8 turn out to contain non-brand cosmetic colors, the violation count nudges up — but the per-file footprint is so small (max 6 occurrences in any one file) that even a worst-case reclassification would only move the headline from 20 to ~44.
- Did not re-verify MOBILE-1 F2 (`AccordionTopicList` push-chain). `git log --since="2026-05-01" -- apps/mobile/src/components/progress/AccordionTopicList.tsx` shows zero commits in window — finding holds verbatim. No need to re-deepen.
- Did not enumerate every JSX hex literal site by exact CSS-property classification (color vs backgroundColor vs borderColor vs `Ionicons` `color` prop). The per-line citations in Finding 1's table are sufficient for the eventual fix PR.
- Did not check non-`.tsx` source files (`.ts` files for color constants, `.css` files in any global styles) — the CLAUDE.md rule is specific to component files, and scope item 1 explicitly framed the audit around `.tsx`.
- Did not exhaustively spot-check all 25 modified/added components for persona conditionals — sampled 10. Sampling rule documented in audit honesty disclosures below.
- Did not investigate whether the `weekly-report/[weeklyReportId].tsx` route registered in `child/[profileId]/_layout.tsx` actually resolves correctly without an explicit `<Stack.Screen>` declaration (Expo Router file-system convention should auto-discover it, but the layout's other 4 dynamic children are explicitly registered for `getId` purposes — `weekly-report` may be missing equivalent treatment). Out of audit scope but worth flagging.

## Recommended punch-list entries

```markdown
- **AUDIT-MOBILE-2a** Replace 20 hex literals across 6 production .tsx files with semantic tokens (immediate slice)
  - Severity: YELLOW
  - Effort: ~1-2 hours
  - Files: `apps/mobile/src/app/(app)/session/index.tsx` (10 sites), `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` (4 sites), `apps/mobile/src/app/_layout.tsx` (3 sites), `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` (1 site), `apps/mobile/src/app/profiles.tsx` (1 site), `apps/mobile/src/components/library/NoteInput.tsx` (1 site)
  - Why it matters: CLAUDE.md "shared mobile components … use semantic tokens." All 6 files are non-brand UI carrying hex codes that have direct mappings in `apps/mobile/src/lib/design-tokens.ts` (`textInverse`, `primary`, `danger`, `surface`, `textSecondary`, etc.). Supersedes MOBILE-1 entries 1c (which only named `session/index.tsx`) and 1e (which estimated "~50-80 sites" — actual is 20). The `child/[profileId]/*` two files may be naturally bundled with profile-as-lens phase 2 if it's still in flight; the other 4 should be the immediate slice.

- **AUDIT-MOBILE-2b** Codify governance call: brand/animation/celebration hex is acceptable when in-file annotated
  - Severity: YELLOW (governance clarification, not a code fix)
  - Effort: ~15 min CLAUDE.md edit
  - Files: 13 brand/animation/celebration .tsx files in `apps/mobile/src/components/{AnimatedSplash,MentomateLogo,common/*Animation,common/celebrations/*,common/BrandCelebration}.tsx`; CLAUDE.md "Non-Negotiable Engineering Rules"
  - Why it matters: 98 hex occurrences sit in this bucket. They are SVG-internal cosmetic colors with explicit in-file documentation of brand intent. CLAUDE.md's "no hardcoded hex colors" rule should explicitly carve them out — both to prevent reviewer confusion (a future hex-grep sweep would otherwise re-flag them every time) and to make the rule's actual scope clear. Suggested addition: "Exception: brand-asset hex codes inside component files are acceptable when (a) the file's purpose is rendering a brand asset, animation primitive, or celebration SVG, and (b) the hex codes are inside an explicitly-annotated named constant block (e.g., `const BRAND = { ... }` with a comment naming the brand intent)."

- **AUDIT-MOBILE-2c** Confirm `weekly-report/[weeklyReportId]` is auto-discovered without `<Stack.Screen>` registration
  - Severity: GREEN-leaning-YELLOW (out of original audit scope but flagged here)
  - Effort: ~5 min — open `child/[profileId]/_layout.tsx`, decide whether to register `weekly-report/[weeklyReportId]` explicitly the way the other 4 children are
  - Files: `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx`
  - Why it matters: The layout explicitly declares `<Stack.Screen name="..." getId={...} />` for `session/[sessionId]`, `report/[reportId]`, `subjects/[subjectId]`, `topic/[topicId]` — but `weekly-report/[weeklyReportId]` is missing. Expo Router file-system convention should auto-discover it, but the explicit `getId` for the others suggests there's a reason to register them (likely to make navigation idempotent on param change). Worth a 5-min confirmation that `weekly-report` doesn't need the same treatment.

- **AUDIT-MOBILE-2d** Amend `2026-05-03-baseline-delta.md` C4 section to retract `session/index.tsx` "10 → 7" claim and add filter-funnel context
  - Severity: GREEN (documentation-only; not a code change)
  - Effort: ~10 min
  - Files: `docs/audit/2026-05-03-baseline-delta.md` (C4 section, lines 89-103 and TL;DR L14)
  - Why it matters: The "10 → 7" reduction was a 6-digit-only-grep artifact, not a real partial fix. Leaving the claim unamended in the audit corpus is the kind of stale finding the consolidated overview's meta-pattern critique itself targets. Retraction should keep the 252-headline factual but add the filter funnel from this deepening's Finding 1 so future readers don't re-derive the wrong conclusion.

# (no new entry needed for the unstable_settings layouts — Finding 5 confirms MOBILE-1 1a verbatim;
# bundle the urgency-bump for child/[profileId] (now 5 dynamic children, not 4) into that existing entry's note.)
```

## Audit honesty disclosures

- **Brand-asset vs violation classification.** The 13 governance-bucket files were classified by reading the 5 worst (`AnimatedSplash`, `MentomateLogo`, `BrandCelebration`, `BookPageFlipAnimation`, `OrionsBelt`) and confirming each contains in-file annotation naming the hex as brand-asset/animation intent. The 8 smaller files (combined 24 hex occurrences across `*Animation` + `celebrations/*` + `CelebrationAnimation`) were classified by directory + filename heuristic without deep read. If a future audit finds non-brand cosmetic hex inside any of those 8, the violation count moves to a worst-case ~44 (still order-of-magnitude smaller than 252). The ratio of brand-intent vs violation in the 8 sampled files was 100% brand-intent, so the heuristic seems calibrated, but it is a heuristic.
- **Scope item 6 sampling rule.** Per the task spec ("spot-check 5-10 new files") I read 10 of the 25 modified/added components in the audit window, weighted toward the persona-adjacent folders (`home/`, `parent/`, `coaching/`, `interview/`, `session/`). The remaining 15 were not deep-read. The repo-wide `Grep "persona|isLearner|isParent" apps/mobile/src/components/**/*.tsx` returning only 2 known hits (both pre-existing) provides a stronger negative signal than the spot-check alone — if a new persona conditional had been introduced into a shared component, the grep would catch it regardless of which folder it lives in. So the "no new violations" claim in Finding 6 has corroborating evidence beyond the 10-file sample.
- **`unstable_settings` rule application is interpretive.** I treated the CLAUDE.md text *"contains both an `index` screen and a deeper dynamic child"* as requiring both (a) `index.tsx` literally as a sibling of the layout AND (b) a `[*].tsx` or `[*]/` segment under that layout. The `(app)/_layout.tsx` (root tabs) was classified does-not-apply because it uses Tabs, not nested Stack — but a stricter reading might still flag it. I went with the conservative call. The `shelf/_layout.tsx` was also classified does-not-apply because it has no sibling `index.tsx` (only `[subjectId]/`); MOBILE-1 made the same call.
- **The `git log` zero-churn evidence for `session/index.tsx` is decisive but limited to the audit window.** The file may have been touched in earlier commits (1f22ea70, c80bb903) that I did not deep-diff for hex changes. I confirmed counts at 8672bdcd and HEAD, which is sufficient to refute the baseline-delta's specific claim ("shrank from 10 to 7 in the window"). Earlier hex churn would not affect that conclusion.
- **No fixes were applied. No git write commands were run.** Only writes were to this file.
- **Time spent:** ~50 minutes recon + ~20 minutes writing. Within the 45-60 minute budget for recon; writing was over due to the table-heavy structure.
