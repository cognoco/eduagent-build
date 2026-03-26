# Brand Color Refresh — Epic 11 Plan

**Date:** 2026-03-25
**Status:** Planned (post-launch)
**Priority:** Post-launch polish — do not block release

## Problem

The current teen persona primary color (`#7c3aed` / `#8b5cf6`, Tailwind violet-600/500) has become strongly associated with AI-generated designs. Users increasingly perceive this specific violet range as "AI slop" — generic, template-driven, and unintentional. This undermines the app's brand identity, especially for a product that should feel human, crafted, and trustworthy across all age groups.

### Additional issues identified

- **Dark mode contrast is poor.** Background (`#18181b`) and surface (`#1a1a1a`) are nearly indistinguishable — cards vanish into the background. Only ~1% brightness difference between layers vs the recommended 8-12%.
- **Logo uses the same AI-associated violet** (`#8b5cf6`) as its primary brand color alongside teal (`#0d9488`).

## Decisions Made

### 1. Replace violet with brand blue as teen default

- **New primary:** `#378ADD` (from `mentomate_secondary_color_round2.svg` brand exploration)
- This is the pre-explored brand blue — warmer and more distinctive than standard Tailwind blues
- Passes WCAG AA for body text on both light and dark backgrounds

### 2. Keep violet as a selectable accent option

- Violet stays in `accentPresets` as a user-selectable choice — it's not inherently bad, just shouldn't be the default
- Users who like purple can still pick it

### 3. Brand palette (confirmed)

| Role | Hex | Source |
|------|-----|--------|
| Brand blue (primary) | `#378ADD` | `mentomate_secondary_color_round2.svg` |
| Brand teal | `#1D9E75` | `mentomate_secondary_color_round2.svg` |
| Deep teal | `#0F6E56` | `mentomate_secondary_color_round2.svg` |
| Violet (accent, not default) | `#7F77DD` | `mentomate_secondary_color_round2.svg` Option B |

### 4. Logo update direction

- Replace violet node with brand blue (`#378ADD`)
- Keep teal node as-is
- Journey dots: blue-300 -> cyan-300 -> teal-200 (smooth gradient along the learning curve)
- Gradient along curve: light blue -> teal (was violet -> teal)
- Wordmark "ment" text: white/neutral (dark bg) or dark (light bg) — no longer violet
- Wordmark "o" circle: brand blue (`#378ADD`)
- Wordmark "mate" text: teal — unchanged

### 5. Dark mode layering (separate but related)

Current teen dark theme has insufficient contrast between elevation levels:
- Background `#18181b` -> Surface `#1a1a1a` = ~1% brightness step (too subtle)
- Should be 8-12% brightness steps per Material Design guidelines
- This is a separate task but should be addressed in the same epic

## Colors explicitly rejected

| Color | Reason |
|-------|--------|
| `#7c3aed` / `#8b5cf6` (Tailwind violet) | "AI slop" — default for AI-generated designs |
| `#ea580c` (orange-600) | Looks like Claude Code's brand palette |
| `#c026d3` (fuchsia-600) | Explored in mockup — too close to AI magenta |

## Scope of changes

### Logo files (all variants need regeneration)

- `docs/logo-designs/primary/combined.svg`
- `docs/logo-designs/dark background/stacked-dark.svg`
- All other logo variants in `docs/logo-designs/`
- `apps/mobile/assets/images/logo-*.svg` (in-app logo assets)

### Design tokens (`apps/mobile/src/lib/design-tokens.ts`)

- Teen persona `tokens.teen.light` and `tokens.teen.dark` — primary, primarySoft, secondary, accent, coachBubble
- Teen "Violet" accent preset — rename to "Blue" or replace with brand blue preset
- Learner "Purple" accent preset — consider replacing with brand blue
- Derive proper light/dark variants from `#378ADD`:
  - Light mode primary: `#378ADD` (or slightly darker for AA contrast)
  - Light mode primarySoft: `rgba(55, 138, 221, 0.10)`
  - Dark mode primary: lighter variant (TBD — needs contrast check on dark bg)
  - Full scale needs design exploration

### Component audit

- `MentomateLogo.tsx` — may reference violet colors directly
- Any component with hardcoded purple hex values (grep for `#7c3aed`, `#8b5cf6`, `#a78bfa`, `#a855f7`)

## Mockups created during exploration

Located in `docs/logo-designs/dark background/`:
- `stacked-dark-coral.svg` — rejected (looks like Claude Code)
- `stacked-dark-magenta.svg` — rejected (too close to AI magenta)
- `stacked-dark-blue.svg` — approved direction (uses Tailwind blue, final should use brand `#378ADD`)

## Stories

### Story 11.1: Update teen persona default colors
- Replace violet with brand blue in `design-tokens.ts` teen defaults
- Update teen accent presets (rename/replace violet preset)
- Verify all screens render correctly with new colors

### Story 11.2: Update logo SVGs
- Regenerate all logo variants with brand blue + teal palette
- Update in-app logo assets (`apps/mobile/assets/images/`)
- Update `MentomateLogo.tsx` if it references violet colors

### Story 11.3: Improve dark mode elevation contrast
- Increase brightness steps between background/surface/elevated layers
- Target 8-12% brightness difference per level
- Test on actual device to verify card visibility

### Story 11.4: Update learner accent presets
- Replace "Purple" accent preset with brand blue option
- Ensure all personas have coherent accent options that avoid AI-associated violet

### Story 11.5: Hardcoded color audit
- Grep codebase for all violet/purple hex values
- Replace any hardcoded references with token-based approach
- Verify no violet leaks outside of the accent preset system
