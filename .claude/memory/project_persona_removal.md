---
name: Persona removal — COMPLETE. DB enum removed (Epic 12), ThemeContext cleaned (2026-04-15).
description: personaType DB enum removed (Epic 12, 2026-04-09). ThemeContext persona removed (2026-04-15). Tokens flat by colorScheme. Persona type in profile.ts. personaFromBirthYear() is mobile-only.
type: project
---

## Phase 1: DB-level removal (Epic 12, 2026-04-09)

personaType enum (TEEN/LEARNER/PARENT) removed from database. Replaced by three independent derived axes:
- **Age** → `birthYear` on profile. `computeAgeBracket(birthYear)` → child/adolescent/adult.
- **Role** → derived from `familyLinks` existence. No "isParent" flag.
- **Intent** → per-session via home cards, not stored.

## Phase 2: ThemeContext removal (2026-04-15)

- `persona` and `setPersona` removed from ThemeContext entirely
- Design tokens in `design-tokens.ts` flattened: was `tokens[persona][colorScheme]`, now `tokens[colorScheme]`
- `Persona` type moved from `theme.ts` to `profile.ts` (co-located with `personaFromBirthYear()`)
- All screens that need persona now call `personaFromBirthYear(activeProfile?.birthYear)` locally
- Affected files: _layout.tsx, (app)/_layout.tsx, session-summary, topic/relearn, AnimatedSplash, consent-copy
- `useThemeColors()` and `useTokenVars()` no longer take persona into account

**Key decisions:**
- Birth year, not full date (less PII)
- Parent locks child's birth year (COPPA/GDPR)
- Home screen IS the intent surface — no picker, no settings
- `personaFromBirthYear()` is mobile-only — server-side must use `family_links` for guardian vs self-learner distinction

**How to apply:**
- Do NOT add persona to ThemeContext or design tokens.
- Screens needing persona-conditional copy: import `personaFromBirthYear` from `profile.ts`.
- Server-side role distinction: query `family_links`, not birthYear.
