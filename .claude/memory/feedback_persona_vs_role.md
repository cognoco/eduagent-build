---
name: Persona vs role distinction
description: personaFromBirthYear() is age-only and mobile-only — server-side features that need to distinguish guardian vs self-learner must use family_links, not birthYear
type: feedback
---

`personaFromBirthYear()` returns 'parent' for ALL adults 18+, but "parent" in the UX sense means "guardian monitoring a child" — not "any adult." An adult self-learner gets wrong third-person copy if classified by age alone.

**Why:** Caught in adversarial review of recall-notifications plan (2026-04-06). The function is also mobile-only (`apps/mobile/src/lib/profile.ts`) and cannot be imported into API code.

**How to apply:** When server-side code needs to distinguish guardian vs self-learner (notifications, daily plan, any copy that changes between first-person and third-person), query `family_links` table instead of using `personaFromBirthYear()`. The new pattern is `resolveProfileRole(db, profileId)` returning `'guardian' | 'self_learner'`.
