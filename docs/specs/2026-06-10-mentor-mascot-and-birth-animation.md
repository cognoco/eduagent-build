# The Mentor Mascot & Birth Animation — Design Spec

**Status:** Ratified by product owner in-session · 2026-06-10 · **Branch:** `new-llm` · **Profile:** design/brand
**Source:** interactive visual brainstorm 2026-06-10 (13 character iterations, 2 storyboard versions; mockups lived in `.superpowers/brainstorm/` — local-only, gitignored). Construction reference for the body: [easydrawingguides octopus tutorial](https://easydrawingguides.com/draw-octopus-really-easy-drawing-tutorial/); pose reference image preserved at `docs/logo-designs/mentor-mascot/reference-storybook-octopus.png`.
**What this spec is:** the ratified visual identity for the mentor character — the character design, the "mentor is born" animation, the ceremony-moment inventory, and the logo ruling. The first implementation slice (BrandCelebration update) shipped alongside this spec; the birth animation and remaining ceremony moments get their own plans under `docs/plans/` before build.
**Not ADR-class:** fully reversible brand/visual decisions, no architectural commitment (per MMT-ADR-0000 significance gate).

---

## 1. Rulings

| # | Ruling | Why |
|---|--------|-----|
| R1 | **The logo stays exactly as is.** No octopus-shaped mark, no hidden-octopus tells, no enlarged static dots. The milestone dots grow **during the birth animation only**. | The abstraction is a strength (teen-proof, parent-credible, doesn't constrain future adult verticals). The animation supplies the meaning the static mark can't. |
| R2 | **The octopus is a ceremony character, not the everyday face.** Chat stays clean text; no mascot in daily surfaces. The V2 shell's top-corner *admin avatar* (mentor-is-the-app spec §3) is a different element — do not conflate. | Scarcity is the character's power; daily presence would make it wallpaper and skew the product young. |
| R3 | **Character design locked** (§2): teal octopus, storybook proportions, deadpan flat lids, smirk, purple beanie. | 13 iterations with the product owner; final = v13. |
| R4 | **The birth is a continuous morph, not a hatch** (§3): the logo's path line dissolves, the milestone dots orbit the **teal** node, and the node itself grows the face and arms on camera. Plays **once**, at mentor creation during onboarding. | Watching the logo *become* the character is the connective tissue between abstract mark and mascot — afterwards the teal dot permanently reads as "the mentor lives there." |
| R5 | **Five ceremony moments** (§4); the signature celebration is the octopus **juggling milestone dots**. | Eight arms juggling the learner's achievements is brand geometry come to life; no other mascot can do it. |

**Superseded ideas (recorded so they aren't re-proposed):**
- Full-octopus logo and "hidden octopus" logo tells — rejected (R1).
- "Remove the purple dot + add arms to the mark" — superseded by the birth morph doing the connecting (R4).
- Bigger milestone dots in the static logo — explicitly rejected; dots grow in animation only (R1).
- Glasses, hair curls, and purple-arm accents on the character — rejected in iteration; the beanie is the single permanent violet tell.
- Earlier mascot explorations in `docs/logo-designs/avatar-proposals/` and `docs/logo-designs/octopus-folded-mark/` — historical; the locked SVG supersedes them as canon.

## 2. The character

Canonical render: [`docs/logo-designs/mentor-mascot/mentor-mascot-locked.svg`](../logo-designs/mentor-mascot/mentor-mascot-locked.svg).
Animation rig handoff: [`docs/logo-designs/mentor-mascot/octopus_3d_animation_rig.svg`](../logo-designs/mentor-mascot/octopus_3d_animation_rig.svg), with construction guide [`docs/logo-designs/mentor-mascot/octopus_3d_animation_rig_guide_construction.svg`](../logo-designs/mentor-mascot/octopus_3d_animation_rig_guide_construction.svg).
Code source of truth: `apps/mobile/src/components/common/mentor-mascot-geometry.ts` (`MASCOT_HERO` + `MASCOT_BADGE`), rendered statically by `MentorMascot.tsx`.

**Construction** (the parts that took 13 rounds — violating any of these re-breaks the character):

- **Body** = head circle + skirt ellipse filled with **one shared `userSpaceOnUse` gradient** (`#14b8a6` → `#0d9488`). Two separate fills created a visible seam that read as a mustache.
- **Arms taper.** Each arm is a closed filled shape, wide at the base, narrowing to a soft point with an S-wave — never uniform-width strokes (sausage/spider-leg failure). Bases tuck fully under the body; alternating depths `#0d9488` / `#0f766e` give layering without outlines.
- **The skirt hides the ball.** Arm bases merge into a band overlapping the head circle's bottom — the finished character never shows a complete circle.
- **Eyes mid-face and large.** Low-set eyes read "spider." Deadpan = a lid *shape* filled with the body gradient covering the **top third** of each eye (half-coverage = asleep), bottom edge **perfectly flat** (a center dip = angry), crease line `#0a5d55` at the edge, pupil `#1a1a3e` sitting low.
- **Smirk**, not a smile arc.
- **Beanie** (`#8b5cf6` dome, `#a78bfa` band) is the permanent identity tell. Wardrobe variations (party hat, graduation cap) are allowed in ceremony moments; the default is the beanie.
- **Suckers** (`#99f6e4`) graduate larger-near-body → smaller-at-tip; hero pose only.

**Two poses, one character:** HERO (eight-arm sprawl, ≥120px — ceremonies, splash-scale) and BADGE (tucked arms, no suckers, ~48–96px). The sprawl turns to noise at small sizes; never scale the hero pose below ~120px.

**Register:** "the cool older sibling who happens to know everything" — warmth through attitude, never cuteness. Product vocab applies: the character is the **mentor** (never "tutor").

## 3. The birth animation — "your mentor is born"

Plays **once per learner**, in onboarding at the moment the mentor is created. Skippable by tap. Reduced-motion: static final frame (same pattern as `AnimatedSplash`). Target ~4–5s.

| Beat | What happens |
|------|--------------|
| 1 | The logo draws itself in (existing splash mechanic). Beat of stillness. |
| 2 | The path line dissolves to dust; the violet learner node dims. The freed milestone dots **grow** and drift toward the teal node. |
| 3 | The dots orbit the teal ball, faster and faster; the ball swells and wobbles. |
| 4 | **Morph, not hatch:** arms spring from the ball one by one (it becomes the head + skirt on camera — same teal, same object). Eyes still shut. |
| 5 | Eyes blink open (flat lids), smirk settles; the beanie drops in, lands askew, one arm straightens it. The personality is complete. |
| 6 | **The catch** — the orbiting dots fall and he catches them mid-juggle. Copy: *"Your mentor is ready."* Hand-off to first conversation. |

The dots are a **through-line**: milestone dots in the logo → orbiting energy in the birth → juggling balls in every celebration.

## 4. Ceremony moments (scarcity contract)

The octopus appears **only** at these moments. Everyday micro-feedback (checkmark pops, lightbulbs) is untouched and stays mascot-free.

| Moment | Trigger | Appearance |
|--------|---------|-----------|
| Birth | Mentor created (onboarding) | Full §3 sequence (hero pose) |
| Verified mastery | Challenge Round confirms mastery | Signature **juggle** — mastered concepts as dots |
| Streak landmarks | 7 / 30 / 100 days | Brief beanie-tip salute |
| Big completion | Book or subject finished | Full celebration (hero pose) |
| Welcome back | Return after long absence | Gentle edge-of-screen peek — no guilt |
| *(shipped)* Brand celebration surfaces | Existing `BrandCelebration` call sites (library curriculum-complete, session summary, RewardBurst hero) | Badge-pose pop + dot juggle (~750ms) |

> **V2-shell tension (flagged, not resolved):** mentor-is-the-app spec P7 bans streak pressure on the new shell. The streak-landmark moment applies to the current shell where streaks exist; whether it survives onto V2 is ruled there, not here. All other moments trace to true state changes and are P7-compatible (P7's own "momentary mentor-voiced celebration" channel).

## 5. Failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Reduced motion | OS accessibility setting | Static final frame, `onComplete` fires immediately | None needed — by design |
| Animated props never fire | Fabric/Reanimated init delay, busy JS thread | Static final frame after 500ms safety timeout | Existing Fabric-net pattern (jump-to-final) |
| Reanimated module init failure | Hermes+Fabric Android release edge | Component renders static or not at all; never crashes the tree | `AnimatedSplash` try/catch precedent for any module-level `createAnimatedComponent` in root-layout-reachable code |
| Birth interrupted (app killed mid-onboarding) | Process death | Birth may replay or be skipped on next onboarding entry | Birth must be idempotent decoration — mentor creation never depends on the animation completing |

## 6. Implementation notes (first slice shipped; rest for plans)

**Shipped with this spec (branch `new-llm`):**
- `mentor-mascot-geometry.ts` — palette + HERO/BADGE pose geometry, single source of truth.
- `MentorMascot.tsx` (+ test) — static portrait component, both poses, exported from the common barrel.
- `BrandCelebration.tsx` rewritten — octopus badge-pose pop + dot juggle, ~750ms, same public API (`size`, `onComplete`, `testID`), same safety patterns (reduced-motion skip, 500ms Fabric net, cancel-on-unmount, Android r-floor). Call sites unchanged.

**For future plans:**
- Birth animation component (onboarding) — Reanimated, beats per §3; copy `"Your mentor is ready."` must route through `t()` with an `en.json` key in the same PR.
- Remaining ceremony moments (§4) wire-up — each needs a trigger audit (what dispatches it) per the end-to-end tracing rule.
- Brand-fixed colors are the sanctioned exception for `*Animation`/`*Celebration`/mascot components; keep the annotation comments.

## 7. Open questions

1. **Name.** The character is unnamed ("The Mentor" is a role, not a name). Naming is a product/marketing decision; note the i18n implication if the name appears in copy.
2. **Streak landmark vs. V2 P7** — see §4 flag.
3. **Birth replay** — should learners be able to re-watch the birth (e.g., from the mentor's profile)? Cheap to add; default is no until asked for.
