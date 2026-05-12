---
name: deep-bugfixing
description: Use when reviewing code, PRs, screens, components, or fixes for hidden runtime-assumption bugs, especially when the user asks to find bugs, check safety, review a PR, identify what could go wrong, or verify whether code is safe to ship.
---

# Deep Bugfixing

Do an adversarial assumption review. Standard review asks whether the code is locally correct; this skill asks where locally correct code fails in real runtime contexts.

## Review Passes

1. Do a brief standard review for obvious correctness, structure, and test gaps.
2. Audit runtime assumptions in the categories below. Findings must include file/line references when possible, the assumption, the concrete break scenario, and a fix pattern.

## Assumption Categories

- Navigation and routing: `router.back()`, deep links, push-notification entry, missing route params, auth/onboarding redirects, redirect loops.
- Layout and interaction: overlays inside scroll containers, z-index/positioning assumptions, gesture conflicts, touch targets, nested modal behavior.
- Data shape and contracts: `.map`/`.find` on maybe-non-arrays, unchecked nested access, empty arrays, casts/non-null assertions, enum expansion.
- Platform and environment: web/native differences, iOS/Android differences, SecureStore/camera/haptics availability, keyboard behavior, SSR/window access.
- Timing and lifecycle: loading-before-render assumptions, unmount races, stale closures, rapid taps, auth startup state, animation timing.

## Output

Lead with findings in severity order:

```text
Finding: <short title>
Location: path/to/file.ts:NN
Category: <one category>
Assumption: <what the code assumes>
Break scenario: <realistic way it fails>
Suggested fix: <concrete pattern>
```

After findings, add:

- Brief standard-review notes, only if useful.
- What looked solid, naming the categories checked.
- Test gaps or verification still needed.

## Do Not

- Do not turn this into style review.
- Do not report vague theoretical nullability without a realistic scenario.
- Do not recommend defensive checks everywhere.
- Do not review a file in isolation when parent layout, navigation config, or API contract determines whether it breaks.
