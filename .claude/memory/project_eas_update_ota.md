---
name: EAS Update (OTA) — pointer
description: Pointer to current OTA deployment docs. Manual OTA requires explicit user instruction; CI owns normal preview OTA publishing.
type: project
originSessionId: 894cc1c6-ffe9-4d5f-9138-18d1f23ee006
---

OTA implementation details are no longer canonical in memory.

Read `docs/deployment-and-secrets.md` for current EAS Update / OTA behavior,
runtime-version policy, environment-variable injection, rollback notes, and CI
workflow ownership. The live preview OTA workflow is `.github/workflows/ci.yml`
(`ota-update` job); it explicitly sets `EXPO_PUBLIC_*` variables because
`eas update` does not read `eas.json` build-profile env.

Manual OTA is a deployment action: do not run `eas update` unless the user
explicitly asks. The user-preference guard remains in
`feedback_no_ota_unless_asked.md`.

**How to apply:** For normal merged JS-only mobile changes, rely on CI. For
operator-requested manual OTA, follow `docs/deployment-and-secrets.md` and set
the target `EXPO_PUBLIC_*` environment explicitly in the shell that runs
`eas update`.
