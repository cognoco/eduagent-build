---
name: UX review pass (2026-04-14–15) — progressive disclosure, auth, hierarchy, terminology
description: Product UX review with external LLM feedback. Multiple improvements implemented on stabilization branch. Home timeout nav, topic features, consent offline done.
type: project
---

**Date:** 2026-04-14–15. **Branch:** `stabilization`.

The user reviewed the product with external LLM feedback and made UX improvements:

1. **Progressive disclosure of progress features** — Spec done. Hide retention signals, CEFR labels, growth charts from new users. Surface after ~3-5 sessions. Gate on `totalSessions`.

2. **Platform-specific auth buttons** — DONE. Hide Google sign-in on iOS, hide Google SSO on Android.

3. **Mentor memory gating** — DONE. Hidden from early navigation.

4. **Learning hierarchy flattening** — Under evaluation. May flatten Library → Shelf → Book → Topic.

5. **"Coach" terminology removal** — DONE. Swept user-facing screens.

6. **Home timeout secondary navigation** — DONE [3B.11]. Go to Library + More options buttons in timeout error state.

7. **Topic detail enrichment** — DONE. Memory decay bar [FR90], evaluate challenge button [FR128], teach-back entry point [FR138].

8. **Subscription restore UX** — DONE [BUG-397]. Polls API to confirm tier after RevenueCat restore, "Verifying purchase..." feedback.

9. **Consent offline protection** — DONE [BUG-311]. Submit disabled offline, tests added.

**Why:** Pre-launch product polish. Progressive disclosure philosophy — deep features exist but new users see a simplified surface.

**How to apply:** Most items now implemented. Check code for remaining items (#1 progressive disclosure gating, #4 hierarchy flattening).
