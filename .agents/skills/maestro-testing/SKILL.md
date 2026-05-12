---
name: maestro-testing
description: Use when writing, reviewing, debugging, or stabilizing Maestro YAML E2E tests for the EduAgent React Native/Expo mobile app, including testID selectors, auth-aware flows, optimistic update checks, GraalJS scripts, native alerts, and CI/mobile runner issues.
---

# Maestro Testing

Use Maestro's declarative YAML style and prefer stable `testID` selectors over visible text when tests need to survive copy or localization changes.

For detailed patterns, read [maestro-testing.md](references/maestro-testing.md) only as needed. It includes selector strategy, auth pre-flight patterns, optimistic update checks, GraalJS rules, platform-specific branches, and a full flow template.

## Core Rules

- Add or use stable `testID` props for critical controls.
- Make auth-dependent tests adaptive: wait for auth resolution, then handle signed-in or signed-out states explicitly.
- Assert optimistic UI changes quickly before waiting for server confirmation.
- Use subflows for repeated setup and shared navigation.
- Keep app behavior as source of truth. Update stale tests for UI drift; do not contort app code to satisfy an obsolete flow.

## Common Commands

```bash
maestro test apps/mobile/e2e/flows/<flow>.yaml
maestro test --debug apps/mobile/e2e/flows/<flow>.yaml
maestro studio
```

For this repo's Android dev-client runner and known local pitfalls, use `$e2e`.

## Review Checklist

- Selectors use IDs for important controls.
- Flow works whether the user starts authenticated or unauthenticated unless the scenario requires one state.
- Waits are condition-based; avoid arbitrary sleeps unless documenting a native animation or known platform delay.
- Deep links use Expo-compatible URLs and expected initial route state.
- Scripts are compatible with Maestro's GraalJS runtime.
