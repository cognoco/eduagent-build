# Playwright Web testID audit

Date: 2026-04-20
Status: initial audit for the shipped smoke lane

This file records the selectors the first Playwright web slice relies on.
It is intentionally narrower than the full plan matrix: smoke-critical IDs are
covered now, and later journeys can extend this audit as new selectors become
runtime-critical.

| testID | Location | Status | Notes |
| --- | --- | --- | --- |
| `sign-in-email` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-in-password` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-in-button` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-up-link` | `(auth)/sign-in.tsx` | ✅ smoke runtime | J-02 |
| `forgot-password-link` | `(auth)/sign-in.tsx` | ✅ smoke runtime | J-02 |
| `sign-up-email` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `sign-up-password` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `sign-in-link` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `forgot-password-email` | `(auth)/forgot-password.tsx` | ✅ smoke runtime | J-02 |
| `back-to-sign-in` | `(auth)/forgot-password.tsx` | ✅ smoke runtime | J-02 |
| `learner-screen` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-learn` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-ask` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-practice` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-homework` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-continue` | `components/home/LearnerScreen.tsx` | ✅ source audit | Runtime coverage lands with later journeys |
| `intent-quiz-discovery` | `components/home/LearnerScreen.tsx` | ✅ source audit | Runtime coverage lands with later journeys |
| `parent-gateway` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `gateway-check-progress` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `gateway-learn` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `profile-switcher-chip` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Needed by phase 2 journeys |
| `profile-switcher-menu` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Needed by phase 2 journeys |
| `profile-option-{id}` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Dynamic `testID` already implemented |
