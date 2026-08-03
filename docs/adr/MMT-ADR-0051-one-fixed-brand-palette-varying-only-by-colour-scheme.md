# MMT-ADR-0051 — One fixed brand palette, varying only by colour scheme

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Visual brand system, theming, and the persona-neutrality of shared UI components · **Deciders:** pending Architecture sign-off

## Context

Two incompatible visual directions were documented for this product and neither was retracted when the other was adopted, so both remained readable as current.

The **first** was a per-persona visual system: distinct moods for teenage, younger, and adult-parent users, built on one hue family expressed at persona-specific saturation and tone. Its premise was that a single visual treatment cannot serve a thirteen-year-old and a parent equally well, so the interface should shift to suit whoever is looking at it.

The **second** is a single fixed palette — a teal primary with a lavender secondary — applied identically to every user, with the only variation being light and dark schemes following the system setting. Its premise is that the audience distinction the first direction encodes is not one the product should express visually at all.

The second direction is what the product means. The persona concept it depended on was removed from the data model, and shared components were made deliberately persona-unaware, so the per-persona system lost the input it needed to function and became a description of something that could no longer be built. Separately, an accent-selection capability was explored and deliberately removed rather than shipped.

What made this genuinely confusing rather than merely stale is that residual machinery from the removed accent capability survives in the theme layer — a preset list including colours that are not brand colours, and the plumbing to apply one. Read as a feature it looks like a shipped picker, and the documentation was updated once to describe it as such. It is not reachable: no surface offers the choice, the selection is unset for every user, and with it unset the fixed palette renders unchanged. The machinery is legacy awaiting cleanup, not a capability.

## Decision

1. **The brand is one fixed palette for every user** — a teal primary with a lavender secondary — and it does not vary by persona, age, role, or account type.

2. **Colour scheme is the only axis of variation.** Light and dark are the two schemes, and the product follows the system setting by default rather than asking.

3. **There is no user-selectable accent.** Accent choice is not a product capability. Presentation of a palette is a brand decision, not a preference to be delegated.

4. **Shared components stay persona-unaware.** They consume semantic tokens rather than branching on who the viewer is, and they do not hardcode colour values. The narrow exception is brand-fixed illustrative artwork — logo, splash, and celebration or animation components whose colours are the brand mark itself — which annotates that intent where it does so.

5. **Per-persona visual moods are not the design.** Documentation describing distinct visual treatments per audience records a direction that was considered and not taken, and is superseded by this decision rather than pending implementation.

6. **The surviving accent machinery is cleanup, not contract.** Its presence in the theme layer does not constitute a feature, and nothing may be built against it. Removing it is not unconditionally a no-op: the theme layer still reads a per-profile stored value, so an installation upgraded from a build where a selection was made can still have one applied. The cleanup therefore includes clearing the persisted keys, and its correctness is a migration question rather than a pure deletion.

## Consequences

- Theming work has one question to answer — light or dark — and no persona branch. A design proposing an audience-specific treatment is proposing to change this decision.
- Age-appropriateness is carried by copy, pacing, and content selection rather than by colour. That is a deliberate reallocation: the product still adapts to who is using it, but not through its palette.
- The residual preset machinery will keep reading as a shipped picker to anyone who greps for it. Clause 6 exists so that reading is settled by this decision rather than re-investigated, and so nobody builds against it in the interval before it is removed.
- Removing that machinery is **not** unconditionally a no-op, and must not be planned as one. No current surface writes a selection, but the theme layer still *reads* a per-profile stored value from device storage on profile change — so an installation upgraded from a build where a selection was made can still have one applied today. For those installations, deleting the machinery is a visible colour change. The cleanup therefore includes clearing the persisted keys, and its correctness is a migration question rather than a pure deletion. For an installation that never stored a selection the deletion is invisible, which is the majority case but not the whole one.
- Documentation carries the superseded direction in several places — a per-audience visual-moods section, a hue-family-per-persona treatment, a design-direction summary that records persona-specific saturation as the chosen approach, and an implementation note describing the residual presets as a shipped five-accent feature. Correcting them is the lockstep half of this ADR; the sources are marked superseded rather than deleted, so the direction that was considered remains legible as history.

## Alternatives considered

- **Keep the per-persona visual system.** Rejected upstream of this decision: the persona attribute it required was removed from the model and shared components were made persona-unaware, so the system had no input. Retaining it would have meant reintroducing a persona concept solely to drive colour.
- **Ship the accent picker that the residual machinery implies.** Rejected: a user-chosen accent makes the brand a preference, and the exploration was deliberately ended rather than completed. The leftover code is the residue of that removal, not an unfinished feature.
- **Delete the stale design documentation outright.** Rejected in favour of marking it superseded: the per-persona direction was a real considered alternative, and erasing it would leave the current single-palette choice looking like a default nobody weighed.
- **Let the palette follow the learner's age bracket.** Rejected as the per-persona system in another form. Age-appropriateness is expressed through content and tone; making it visible in the chrome signals to a learner how the product has categorised them.

## Links

- `apps/mobile/src/lib/design-tokens.ts` — the shipped token map, named as the source of truth for the palette's actual values rather than restated here.
- `docs/ux-design-specification.md` — carries the superseded per-persona direction, marked as such in the same change-set as this ADR.
