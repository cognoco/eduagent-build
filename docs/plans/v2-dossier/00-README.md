# V2 "No Surprises" Dossier

> **What this is.** A pre-build companion to the spec
> (`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`) and the plan set
> (`docs/plans/v2-plan/`). It does **not** restate either. It contains only what
> they don't: code-verified truth as of 2026-06-12 (branch `new-llm`), plain-language
> day-in-the-life scripts, the gaps the spec is silent on, and the open decisions
> with recommendations attached. Where the spec covers something, this dossier cites it.
>
> **Audience:** the product owner (non-coder). **Status:** Layer 1 of the three-layer
> pre-build package (Dossier → Reels prototype → Bet Sheet).

## Files

| File | What it answers |
|---|---|
| `01-day-in-the-life.md` | "What will it actually feel like?" — four honest scripted scenes (teen day one, teen day eight, parent day one, parent week one), with every gap marked |
| `02-what-dies-in-user-terms.md` | "What will I notice missing, and where did its job go?" — code-verified |
| `03-decision-ledger.md` | "What must I still decide, what does each block, and what's the recommendation?" |
| `04-reels.html` | **Layer 2** — the clickable walkthrough of the V2 shell (open in any browser). All four scenes + free-roam shell screens; gaps 1–3 given concrete PROPOSAL frames; §13.4 name toggle and §13.7 tone toggle built in; the §2.1 noticing loop animated |
| `06-screen-function-access-map.md` | Code-backed V2 screen matrix: functionality, trigger, reason, access, and source status for each shell/screen |
| `07-trigger-flow-logic-map.md` | Mermaid and tabular trigger map showing how users move between V2 surfaces and where logic branches |

## Living publish-readiness plan

The canonical cross-phase checklist for getting V2 publishable is
[`../2026-06-30-v2-publish-readiness-canonical-plan.md`](../2026-06-30-v2-publish-readiness-canonical-plan.md).
It sits above the individual S4/S5/S6 phase plans and keeps the current priority
order explicit: finish supporter visibility, wire real shared records, preserve
concrete progress in Subjects/Journal, then prepare S6 without executing it.

## The headline surprises (found 2026-06-12)

These are the things a reader of the spec alone would not know. Numbered for reference.

### SURPRISE 1 — The launch promise is built last

The launch positioning is **homework help sold to parents**: the child gets homework
help, the parent gets free time + insight. But in the build order, everything the
**parent** sees — the scope chip, the Support hub, the parent cold-start
("You'll see her recaps, progress and wins"), the visibility contract — is
**S4/S5: the identity-blocked back half**, not buildable until the identity-foundation
cutover (CUT-A/CUT-B) lands. The **teen** side (Mentor home, Subject hub, Journal —
S1–S3) is buildable now.

Consequence: if V2 launches at S1–S3, **the parent-insight half of the sales promise
is served by the legacy V1 surfaces** (ParentHomeScreen, proxy mode, Recaps tab) —
the very surfaces V2 eventually deletes. That is a workable mixed state (V0/V1
no-regress already guarantees those surfaces stay alive), but it must be a *chosen*
state, not a discovered one. The Bet Sheet (Layer 3) and the launch sequencing
decision should treat "parent insight at launch = V1 surfaces" as the explicit
default until S4/S5 are scheduled.

> **Ruled 2026-06-12 (product owner): launch waits for the full build.** There is
> no S1–S3 launch and no "parent insight on V1 surfaces" launch state. SURPRISE 1
> therefore reduces to a **build-order fact** — the parent half lands last, after
> the identity cutover — not a launch decision. The §11 evidence gate stays as an
> *internal* go/no-go checkpoint on the back half (measured on the observed
> cohort, per the §13.6 recommendation), decoupled from launch.

### SURPRISE 2 — The S2→S3 evidence gate has no audience and no metric

The original spec §13.6 gated S3+ on a discovery/engagement metric "vs the V1
baseline" — but the metric was **undefined**, and pre-launch there is **no
telemetry population** to measure it on. As designed, the gate could not fire.
Recommendation (ledger §13.6): replace the telemetry metric with
**observed-cohort evidence** — 3–5 friendly
families, watch for (a) the teen returning *unprompted* after the first homework
session, (b) the parent answering "what did my kid work on this week?" from the app
alone. Formalized in the Layer-3 Bet Sheet.

> **Folded 2026-06-13:** the observed-cohort bar is now the planning default in
> spec §11/§13.6, `v2-plan/00-README.md`, and the S6 gate. The cohort still needs
> a recorded PASS before S3 starts.

### SURPRISE 3 — Eight cold-start gaps; three are script-breaking

The spec's cold-start section (§3.1) is detailed and good, but the audit found eight
places where a zero-history first-timer falls off the documented path
(full list: `01-day-in-the-life.md` → "Gap register"). The three that break a
day-one script:

1. **Onboarding → cold-start handoff is unspecified** — nothing describes the first
   frame between sign-up/consent and the cold-start card.
2. **The first homework round-trip after the camera is undescribed in V2 terms** —
   the plans reuse the legacy `homework/camera.tsx` flow verbatim, with no V2
   description of what the kid sees after snapping the photo.
3. **The first-session wrap-up surface is undesigned** — the once-only teach line
   ("next time, just tell me what you need") and the first celebration both fire
   "at end of first session," but, before the 2026-06-13 fold-in, the
   exit-funnel-dissolves-into-a-wrap-up-turn surface existed in no plan.

> **Folded 2026-06-13:** these three script-breaking gaps are now spec
> requirements (§3.1) and S1 plan tasks (T22 post-auth handoff, T23 homework
> round-trip, T24 first-session wrap-up). S6 is gated on the wrap-up heir before
> deleting the legacy exit funnel.

### SURPRISE 4 — XP is not backend-only (resolved)

The original audit found that the plan layer (S6 plan, `01-codebase-anchors.md`
§6) correctly absorbed that XP is **live in the UI** (Practice-hub pill,
session-summary bonus banner, progress topic badges, book-detail gating), while
the spec body still sounded backend-only.

> **Resolved 2026-06-13:** spec §2.1/§2.2 and the V2 plan layer now retain earned
> private receipts: XP/practice points, the 1.5x reflection bonus, quiz scores /
> personal bests, mastery counts, weekly deltas, and forgiving rhythm/momentum.
> The redesign kills coercive presentation, not earned learning receipts.

### SURPRISE 5 — Some "dying" screens are already dead

- **Milestones gallery** (`progress/milestones.tsx`): fully built, **zero inbound
  navigation today** — already unreachable. (Memory says it was to be re-wired via
  the progress-data-surfacing spec; that re-wiring never happened in code.)
- **Recall-test screen** (`topic/recall-test.tsx`): real route, no explicit
  disposition by name in any V2 doc.
- **own-learning tab**: already just a `Redirect` to `/home` — "dies in V2"
  overstates the user-visible change.

### SURPRISE 6 — Code drift since the plans were written (2026-06-09)

- Dead-code sweep PR #821 (`c924eb97e`) removed verified-orphaned flows
  (`more/learning-preferences` screen, `ProfileSwitcher` component, orphan quiz
  params) and updated the navigation-contract snapshot. Low impact on V2, but the
  plan set's flow counts and one or two anchors are now slightly stale.
- S0 backend is **built and present** (`activity-ledger.ts`, `routes/now.ts`,
  `now-feed.ts`, `mentor_activity_ledger` schema in `packages/database`), with a
  post-plan fix (`3bc31995f` — route profile helper).
- S1 is **confirmed not started**: zero hits for `MODE_NAV_V2_ENABLED` /
  `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` in `apps/mobile/src`.
- WI-678 (ADR surgery + v2-plan re-key) **landed 2026-06-12** (`287e99c9b`,
  follow-up `dfc039dfa`): ADRs renumbered (0019→0021, 0020→0022), S4–S6 blockers
  re-keyed to the identity cutover, S4 ledger-repoint ownership moved to the
  identity program (IF M-REPOINT). The audit behind this dossier read the plan
  set hours before that landed — plan-doc line citations may be slightly off;
  spec citations are unaffected.

### What is NOT a surprise (checked and sound)

- Every surface the docs classify as dying maps to a real file on disk — no phantoms.
- The mentor character is **ruled** (will be built; owner Zuzana; separate brand
  project) and **no V2 build beat depends on it** — the interim celebration carrier
  is the conversation surface itself (S1).
- The kill list is sequenced, not immediate: nothing is deleted until S6, each
  deletion gated on its replacement being live, and flag removal additionally gated
  on the §13.1 V0-retirement ruling.

## Relationship to the rest of the package

- **Layer 2 (Reels):** clickable HTML prototype of the V2 shell — the scenes in
  `01-day-in-the-life.md` are its script. The §13.4 name test (Journal vs Notebook)
  and the celebration-beat judgment happen there.
- **Layer 3 (Bet Sheet):** one page formalizing the §13.6 replacement —
  cohort, observables, bar, and the pre-committed stop rule.
- **Exit:** after both, one delta pass folds findings back into the spec + v2-plan
  (coordinated with WI-678's landing), and S1 starts post-merge with nothing left
  to discover the expensive way.

Last updated: 2026-06-12
