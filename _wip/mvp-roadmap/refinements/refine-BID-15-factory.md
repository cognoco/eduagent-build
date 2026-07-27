# BID-16 — QA factory drain 1 — proposed membership

Pool: 24 open QA Fix Factory items (8 Stage=Ready, 16 Stage=Backlog). All 24 have zero claims and empty Delivery Batch relation. Mode: severity-first, CI-verifiable-only slice, ~8-10 items.

**Harness check (done, not assumed):** `apps/mobile/playwright.config.ts` exists and `.github/workflows/e2e-web.yml` runs a **required** Playwright web-E2E check on PRs touching the web/mobile surface — so "E2E-web" is a real, CI-gating verification path in this repo, not a guess. Caveat: the required gate runs only the **smoke** project subset (`smoke-auth`/`smoke-learner`/`smoke-parent`), not the full `test:e2e:web` suite — see Shepherd Notes for what that means for 2185/2178.

## Proposed slice

### Primary — 7 items, Stage=Ready, DoR-complete

This is the real proposal. All 7 passed Definition of Ready already (Effort + Review Tier set); none need a refine pass before claim.

| ID | Title | Sev | Area | Why CI-verifiable |
|---|---|---|---|---|
| WI-2187 | Make owner-global Account settings unambiguous under learner scope | P1 | mobile: account | Wrong-mutation-target bug — fix is correct request identity + visible label text, both integration/RTL-assertable, no device needed |
| WI-2182 | Separate BottomSheet backdrop dismissal from interactive sheet content | P1 | shared component | DOM/a11y-tree nesting + exact-once dismiss = structural bug, DOM-structure/RTL assertable. Despite the name, this is not a "BottomSheet visuals" defect — its AC has no animation/gesture-feel claim, only structure and event-count assertions |
| WI-2185 | Reserve fixed V2 chrome space before pushed-screen content | P2 | shared layout (V2 chrome) | Wrong inset constant; "content begins below chrome" is a bounding-box claim, provable via the confirmed Playwright E2E-web harness at the AC's own named viewport (360x760) |
| WI-2192 | Expose quiz-results exit actions as accessible buttons | P2 | mobile: quiz | Missing accessibilityRole/Label props — unit/RTL prop assertions |
| WI-2191 | Remove nested interactive controls from the Practice quick-quiz card | P2 | mobile: practice | Invalid nested-interactive DOM tree — semantic-tree/bubbling assertions, unit-testable |
| WI-2178 | Use the active app theme behind fixed V2 chrome on pushed screens | P2 | shared layout (V2 chrome) | Missing `contentStyle` prop on 3 navigators — computed-style/token-source assertion, not pixel judgment; same confirmed E2E-web harness as 2185 |
| WI-2186 | Align Reports empty-state timing with weekly and monthly delivery | P3 | shared: reports | Copy/logic bug driven by query state — unit-testable with mocked weekly/monthly query states |

### Backfill candidates — Backlog, CI-verifiable, refine-first (optional, to reach ~10)

Not part of the 7 above. These are legitimately CI-verifiable and reasonably high-severity among the Backlog pool, but Stage=Backlog means no Effort/Review-Tier grooming yet and no verified root-cause file paths — they haven't been through `/cosmo:refine` to DoR. Only pull these in if the PM wants to run a quick refine pass first; don't claim them as-is.

| ID | Title | Sev | Area | Why CI-verifiable |
|---|---|---|---|---|
| WI-2124 | Render escaped Unicode formulas correctly in Mentor prose | P2 | mentor: prose rendering | Pure string-processing bug (literal `λ` not decoded). AC is 100% deterministic input/output assertions, zero device bullets. Concrete real-incident severity — actually observed corrupting a science explanation in a live QA session |
| WI-2101 | Show every earned session milestone with clear context | P2 | session/gamification | "None silently lost" = component-count assertion across a scripted exchange sequence — fake-timer/event-driven, no device bullet in AC. **Carries a real BID-12 seam risk** — see Seam verdict |
| WI-2110 | Deep-link learning-moment cards to the correct Journal section | P2 | mobile: journal | Pure routing/state bug (wrong section restored) — integration-testable navigation-state assertion |

## Excluded (14)

| ID | Reason |
|---|---|
| WI-2176 | device-verify — dynamic multi-scope overlap across viewport + font-scale; AC explicitly requires Android native checks. This needs *more* than 2185 (combinatorial layout matrix, not a single inset value), so it's a clean cut even though 2185 stayed in |
| WI-2331 | not-Ready + superseded — broad "V2 wayfinding" rollup; its own Found-In note names WI-2185/2178 as the decomposed atomic fixes already in this slice |
| WI-2129 | not-Ready; AC bundles a human user-validation-study bullet ("validate with representative users") — not CI-provable as written |
| WI-2121 | not-Ready; CI-verifiable but no Risk/Impact scored, no concrete incident cited — lower priority than the 3 backfill picks |
| WI-2113 | not-Ready; seam — explicitly Challenge/session-completion timing, direct BID-12 (challenge/session-loop) overlap, more blatant than 2101's |
| WI-2111 | not-Ready; CI-verifiable but lower severity (cosmetic card ordering, unscored) |
| WI-2109 | not-Ready; CI-verifiable but lower severity + Mentor-feed-display layer soft-adjacent to BID-13 |
| WI-2108 | not-Ready; touches the Mentor "writing" chat indicator — conversation UI, soft BID-13 overlap |
| WI-2106 | device-verify — AC states "visual/device coverage protects the empty state" |
| WI-2105 | device-verify — AC states "a device-level test covers the real registration and onboarding path" |
| WI-2103 | not-Ready; CI-verifiable but session-lifecycle timing, soft BID-12 (session-loop) overlap |
| WI-2102 | device-verify — AC states "device-level coverage includes slow and interrupted streams" |
| WI-2096 | device-verify — AC requires a "native screenshot regression on a small-phone viewport" as part of DoD |
| WI-2093 | not CI-verifiable — AC requires human native-speaker linguistic review per locale; also a 7-locale audit initiative, not an atomic fix |

## Grouping + collision flags

By area (primary 7 + backfill 3):
- **mobile: quiz/practice** — 2192, 2191 (different files, same feature family, no collision)
- **mobile: account** — 2187
- **mobile: journal/reports** — 2186, 2110* (different files, same feature family, no collision)
- **shared layout: V2 chrome** — 2185, 2178
- **shared component** — 2182
- **mentor: prose rendering** — 2124*
- **session/gamification** — 2101*
(*backfill candidate, not primary)

**Collision flag:** WI-2185 and WI-2178 both cite `apps/mobile/src/app/(app)/_layout.tsx` (2185 edits it directly for the inset/clearance math; 2178 edits sibling `_layout.tsx` files but treats the root file as the canonical theme-source pattern). Real merge-conflict risk in shared layout code — sequence these two, don't run in parallel.

No other same-file collisions found among the primary 7, based on root-cause paths cited in their descriptions. The 3 backfill picks don't cite verified file paths yet (not yet refined) — collision-check confidence on those is lower until refine happens.

## Seam verdict

- **BID-3 (consent/deletion API paths):** no direct hit. WI-2182's dismissible consumers include SupportPersonPickerSheet (supporter-relationship UI) — same UI family as consent flows, but the fix only touches BottomSheet dismiss mechanics, not the consent/deletion API. Named for completeness, low risk.
- **BID-13 (mentor/session paths):** WI-2124 (backfill) is thematically adjacent — Mentor prose display/rendering layer, not the session/API path layer BID-13 is described as owning. Low risk, named.
- **BID-12 (challenge/session-loop):** WI-2101 (backfill) is the closer call — milestone celebration triggers off session-exchange state, plausibly touching session-loop code. WI-2113 (excluded above) was the more blatant match. **None of this touches the primary 7** — the seam risk is fully contained to the optional backfill bucket.

Caveat: I only have BID-3/12/13's thematic names from the brief, not their actual diffs — this is a theme-match, not a file-confirmed check.

## Shepherd notes

Program rule applies to all proposed items: red test must reproduce the reported defect specifically, then fix to green — not adjacent, already-covered behavior.

- **2182 / 2191:** existing tests already cover dismissal / individual-node press handling — the new red test must target the nesting/hierarchy/bubbling defect specifically, not re-assert what's already green.
- **2187:** red test must assert mutation **target identity** (which account ID receives the write), not general Account-settings functionality already covered elsewhere.
- **2185 / 2178:** red test = Playwright E2E-web bounding-box / computed-style assertion at the AC's own 360x760 viewport. **Land it in a `smoke-*` project** (`smoke-auth`/`smoke-learner`/`smoke-parent`) or confirm with the app team that a non-smoke `test:e2e:web` run is still required elsewhere — the branch-protection-required check in `.github/workflows/e2e-web.yml` only runs the smoke subset, so a test that exists but isn't smoke-tagged won't actually gate the PR. Native-device confirmation is out of scope for this batch either way — defer to BID-1's preview vehicle if the operator wants native parity beyond web.
- **2124 (backfill):** AC already specifies the red-test shape — reproduce the literal `λ` escape, including the twice-in-one-response and split-across-chunk-boundary cases named in the AC.
- **Review Tier:** 2187, 2182, 2185 are groomer-marked "Adversarial" — size shepherd review time accordingly; 2192/2191/2178/2186 are "Standard"; backfill items are ungroomed.

## Open flags

1. **Primary slice is 7, not 10.** CI-verifiable-only + Stage=Ready-preferred both point at 7 as the real, immediately-claimable batch. The 3 Backlog items are legitimately CI-verifiable but not DoR — don't blend them into the headline count. If the PM wants ~10, run `/cosmo:refine` on 2124/2101/2110 first (or swap in 2121/2111/2109 from Excluded, which are CI-verifiable but lower-severity/ungroomed too).
2. **Sequencing:** run 2185 and 2178 sequentially, not in parallel — same-file collision in shared V2 chrome layout code.
3. **If backfilling, prefer 2109 or 2111 over 2101** if seam avoidance matters more than severity — both are zero-seam-risk vs. 2101's real (if indirect) BID-12 overlap.
4. **WI-2331** sits just outside this slice as the broader "V2 wayfinding" rollup. Once 2185/2178 (and eventually 2176, after its device pass) land, 2331 may be largely subsumed — worth a look before it's separately refined rather than treated as a fresh independent item.
5. **CI harness nuance:** the repo's required E2E-web check is smoke-gated, not full-suite. This doesn't block the slice, but it's a real constraint the shepherd needs to work within for 2185/2178 to actually count as CI-verified in the gating sense, not just "a test exists somewhere."
