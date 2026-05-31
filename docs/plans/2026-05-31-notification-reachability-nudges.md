---
title: Notification Reachability and Nudges - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [notif-1, notif-2, notif-4]
---

# Notification Reachability and Nudges - Implementation Plan

**Goal:** Make notification delivery intentionally reachable for guardian-only
users and users who previously dismissed permission prompts, and decide the
child-to-parent nudge model with an implemented path.

**Approach:** Fix notification reachability at the app boundary first:
permissions, token registration, and settings need to reflect OS state. Then add
a low-risk reciprocal learner-to-guardian signal that uses explicit templates,
not free-text delivery, to preserve the child-safety posture.

## Scope

In scope:
- `apps/mobile/src/app/(app)/more/notifications.tsx`
- `apps/mobile/src/hooks/use-push-token-registration.ts`
- `apps/mobile/src/hooks/use-post-session-notification-ask.ts`
- `apps/mobile/src/components/nudge/**`
- `apps/api/src/routes/nudges.ts`
- `apps/api/src/services/nudge.ts`
- `apps/api/src/services/notifications.ts`
- `apps/api/src/inngest/functions/**` notification senders only as needed for
  recipient assumptions.
- `packages/schemas/src/**` nudge/notification request and response schemas.
- Co-located mobile/API tests.

Out of scope:
- Child-cap parent alert; that is covered by
  `2026-05-31-billing-recovery-learner-capacity.md`.
- Billing/payment notification content.
- Raw child-to-parent free-text messaging. This plan ships template signals
  only.
- Broad notification preference redesign beyond push reachability.

## Product Decisions

- The More > Notifications push toggle must represent both server preference
  and OS permission state. Turning it on requests OS permission when possible;
  if the OS cannot ask again, the screen links to system settings.
- Guardian-only users get a permission ask from a guardian-relevant moment:
  after adding/viewing a child, opening notification settings, or first seeing a
  parent-home notification surface. They should not need to complete their own
  learning session to receive child-related pushes.
- Child-to-parent nudge v1 is a small fixed template set: `thanks`, `need_help`,
  `proud_moment`. It delivers to an authorized guardian and appears in the same
  parent notification surface as other nudges.

## Tasks

- [ ] **T1: Make push settings OS-aware.** Done when:
  `more/notifications.tsx` reads notification permission status, turning push on
  calls `Notifications.requestPermissionsAsync()` when `canAskAgain`, denied
  status renders an "Open Settings" action via `Linking.openSettings()`, and the
  server `pushEnabled` preference is not shown as fully on unless a token can be
  registered. Tests cover undetermined, granted, denied-can-ask, and denied-open
  settings states. Covers `notif-2`.

- [ ] **T2: Expose a registration retry hook for permission changes.** Done
  when: `usePushTokenRegistration` exports or accepts a `registerIfAllowed`
  trigger that the settings screen can call after permission is granted, while
  retaining AppState foreground auto-registration. Tests cover manual retry and
  existing foreground behavior.

- [ ] **T3: Add guardian-specific permission ask.** Done when:
  guardian profiles who have child-linked notification surfaces can be prompted
  for OS notification permission without completing a personal session, and the
  prompt is gated to avoid repeated nags. Tests cover guardian-only prompt
  eligibility and parent-proxy exclusion. Covers `notif-1`.

- [ ] **T4: Add child-to-parent nudge service support.** Done when:
  schemas and service logic support a `learner_to_guardian` nudge direction with
  fixed templates, verifies the sender is the child/learner and recipient is an
  authorized guardian in the family/membership relationship, and list/read
  queries include parent-visible inbound learner nudges. Tests cover authorized
  child-to-parent send, unrelated recipient denial, and list visibility. Covers
  `notif-4`.

- [ ] **T5: Add learner UI for reciprocal nudges.** Done when:
  learner-facing screens provide a small signal action to a guardian only when a
  guardian relationship exists, no raw free-text is sent, and the parent home
  surface shows the inbound signal with a read/dismiss action. Tests cover with
  guardian, without guardian, and parent receipt.

- [ ] **T6: Audit delivery and privacy copy.** Done when:
  all new copy is i18n-routed, no child free-text is included in push payloads,
  and push payloads contain only profile IDs/template keys needed for the
  recipient app to render safely.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| OS notification permission undetermined | User toggles push on | Native permission prompt | Allow or keep push off |
| OS permission denied, can ask again false | User toggles push on | Open Settings row | Open OS settings and return |
| Push token registration fails | Network/Expo failure | Retryable settings warning | Retry registration |
| Guardian never studies | Guardian opens parent notification surface | One-time permission primer | Allow, skip, or use settings later |
| Child has no guardian relationship | Learner opens signal UI | No child-to-parent nudge action | Use normal in-app learning support |
| Child signal push fails | No token/provider failure | Parent still sees in-app row | Retry via notification job if configured |

## Verification

Focused checks:

```powershell
Push-Location apps/mobile
pnpm exec jest --findRelatedTests src/app/(app)/more/notifications.tsx src/hooks/use-push-token-registration.ts src/hooks/use-post-session-notification-ask.ts --no-coverage
pnpm exec jest --testPathPattern nudge --no-coverage
pnpm exec tsc --noEmit
Pop-Location
pnpm exec nx run api:test --testPathPattern=nudge
pnpm check:i18n:orphans
```

If native notification permission behavior changes, run a device/emulator smoke
through the E2E skill and record the OS permission states tested.

