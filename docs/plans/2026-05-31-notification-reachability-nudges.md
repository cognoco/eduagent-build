---
title: Notification Reachability and Nudges - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [notif-1, notif-2, notif-4]
revised: 2026-05-31 (adversarial review folded in — see Review History)
---

# Notification Reachability and Nudges - Implementation Plan

**Goal:** Make notification delivery intentionally reachable for guardian-only
users and users who previously dismissed permission prompts, and decide the
child-to-parent nudge model with an implemented path.

**Approach:** Fix notification reachability at the app boundary first:
permissions, token registration, and settings need to reflect OS state. Then add
a low-risk reciprocal learner-to-guardian signal that uses explicit templates,
not free-text delivery, to preserve the child-safety posture.

> **gap_ids note:** this plan covers `notif-1`, `notif-2`, `notif-4` from the
> source audit. `notif-3` is intentionally not in scope here — confirm against
> `docs/audits/2026-05-31-logical-gap-audit.md` whether it is deferred or owned
> by another plan, and record that here before this plan is marked ready.

## Scope

In scope:
- `apps/mobile/src/app/(app)/more/notifications.tsx`
- `apps/mobile/src/hooks/use-push-token-registration.ts`
- `apps/mobile/src/hooks/use-post-session-notification-ask.ts`
- `apps/mobile/src/components/nudge/**`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` (inbound learner-signal surface — see T5)
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

- The More > Notifications push toggle must represent **three** signals, not one:
  OS permission, the server `pushEnabled` flag, and whether a push token is
  registered. Turning it on requests OS permission when possible; if the OS
  cannot ask again, the screen links to system settings. The toggle renders as
  fully on only when all three hold (see T1 truth table).
- Guardian-only users get a permission ask from a guardian-relevant moment:
  after adding/viewing a child, or first seeing a parent-home notification
  surface. They should not need to complete their own learning session to
  receive child-related pushes. (Settings-screen toggling is owned by T1, not the
  guardian primer, to avoid a double prompt — see T3.)
- Child-to-parent nudge v1 is a small fixed template set: `thanks`, `need_help`,
  `proud_moment`. It delivers to an authorized guardian and appears in the same
  parent notification surface as other nudges. The sender→recipient relationship
  is authorized server-side against the family-link/membership model (never
  inferred from age/persona), and only consented learners may emit signals.

## Tasks

- [ ] **T1: Make push settings OS-aware and reconcile the three reachability
  signals.** Done when:
  - `more/notifications.tsx` reads OS notification permission status; turning push
    on calls `Notifications.requestPermissionsAsync()` when `canAskAgain`, and a
    denied/cannot-ask state renders an "Open Settings" action via
    `Linking.openSettings()`.
  - The toggle implements an explicit truth table over the three independent
    signals — OS permission, the server `pushEnabled` flag (persisted via
    `PUT /settings/notifications`), and token presence in
    `notification_preferences.expoPushToken`
    (`packages/database/src/schema/progress.ts:113,115`; registration in
    `apps/api/src/services/settings.ts:465-486`). Turning the switch on must set
    `pushEnabled=true` **and** register a token **and** hold OS permission. It
    renders as on only when all three hold; otherwise it surfaces which signal is
    missing. "Token registered" is never conflated with "pushEnabled".
  - Tests cover: undetermined, granted, denied-can-ask, denied-cannot-ask (open
    settings), and **Android 13+** `POST_NOTIFICATIONS` (where `<13` returns
    granted without a prompt and `canAskAgain` semantics differ from iOS), plus
    each combination where one of the three signals is missing.
  - Covers `notif-2`.

- [ ] **T2: Expose a registration retry hook for permission changes.** Done
  when: `usePushTokenRegistration` exports or accepts a `registerIfAllowed`
  trigger that the settings screen can call after permission is granted, while
  retaining AppState foreground auto-registration. Tests cover manual retry and
  existing foreground behavior.

- [ ] **T3: Add guardian-specific permission ask.** Done when:
  - Guardian profiles can be prompted for OS notification permission without
    completing a personal session. Eligibility resolves via the sanctioned
    role/ownership predicate (`isOwner` + family-link/role, e.g.
    `isGuardianProfile()` / `navigationContract.gates.*`) — **never** birthYear or
    persona inference (`personaFromBirthYear` is banned; enforced by
    `persona-fossil-guard.test.ts`). The prompt is skipped in `isParentProxy`
    mode.
  - The ask is gated to avoid repeated nags using its **own** SecureStore key
    (e.g. `guardianNotificationAskShown_${profileId}` via `sanitizeSecureStoreKey`;
    keys may use only `[A-Za-z0-9._-]`), independent of the learner primer's
    `notificationFirstAskShown_${profileId}` flag so the two never suppress or
    trigger each other.
  - The guardian primer does **not** fire on the settings screen: toggling push
    there is owned by T1. The primer's triggers are guardian-relevant moments
    (adding/viewing a child, first parent-home notification surface) so the user
    is never asked twice for the same moment.
  - Tests cover guardian-only prompt eligibility, parent-proxy exclusion, the
    dedicated-key dedup, and the no-double-prompt-with-T1 contract.
  - Covers `notif-1`.

- [ ] **T4: Add child-to-parent nudge service support.** Done when:
  - Schemas and service logic support a `learner_to_guardian` nudge direction with
    the fixed template set, and list/read queries include parent-visible inbound
    learner nudges.
  - **Authorization (core of this task):** a `services/` function verifies the
    sender→recipient pair against the family-link/membership relationship
    (role-based, server-side — never birthYear), with explicit ownership-chain
    checks. No inline `drizzle-orm` in `routes/nudges.ts` (eslint G1/G5); the
    route delegates to the service. Pin the relationship check to whichever model
    is canonical at build time, since
    `docs/plans/2026-05-31-identity-org-membership-redesign.md` is in flight and
    may move this abstraction.
  - **Consent gate:** only learners whose `consentStatus` is null/`CONSENTED` may
    emit signals (mirrors the existing `NudgeBanner` render gate).
  - **Reuse the existing delivery path** in `services/nudge.ts` so the send
    inherits timezone-aware quiet hours (`isQuietHours`, 21:00–07:00) and the
    global per-profile daily cap (`MAX_DAILY_PUSH = 3`,
    `apps/api/src/services/notifications.ts`). Any Inngest dispatch goes through
    `safeSend()` (non-core). Do not build a parallel sender — it would bypass all
    three.
  - **Migration:** if `learner_to_guardian` is a new value of a pg enum or
    CHECK-constrained `direction`/`type` column on the nudges table, ship a
    committed migration (`db:generate:dev` → commit SQL → `drizzle-kit migrate`;
    never `push` against staging/prod), applied to staging/prod **before** the
    reading code deploys (mind the known staging journal drift). If it is a plain
    text column, state that no migration is needed.
  - **Tests:** authorized child-to-parent send; list visibility; an explicit
    **break test** for unrelated-recipient denial (red-green: write it, watch it
    pass, revert the auth check, watch it fail, restore — per the repo
    security-fix rule); and an assertion that the emitted payload is
    template-key-only (no free-text — see T6).
  - Covers `notif-4`.

- [ ] **T5: Add learner UI for reciprocal nudges and wire the parent surface.**
  Done when:
  - A named learner-side entry point provides a small signal action to a guardian
    only when a guardian relationship exists, sending a template key (no raw
    free-text). Reuse `NudgeActionSheet` if it fits, or add an explicit learner
    sender component — name which in the implementation.
  - The inbound signal renders on the **guardian** home. `NudgeBanner` is mounted
    inside `LearnerScreen` today, and the guardian home is `ParentHomeScreen`
    (per the `home.tsx` architecture), which does **not** render `NudgeBanner`.
    This task explicitly adds the inbound-nudge surface (with read/dismiss) to
    `ParentHomeScreen.tsx`.
  - Tests cover: learner with a guardian (action shown), learner without a
    guardian (no action), and parent receipt rendered on `ParentHomeScreen`.

- [ ] **T6: Enforce delivery and privacy invariants (gated inside T4/T5).** Done
  when:
  - All new copy is i18n-routed; templates `thanks`/`need_help`/`proud_moment`
    have `nudge.templates.*` keys (existing pattern) added in the same PR and pass
    `check:i18n:orphans`.
  - The "no child free-text in push payloads, template-key + profile-IDs only"
    invariant is asserted directly in the T4 service test and the T5 UI test — not
    as a trailing audit. (This is the child-safety invariant of the whole plan; a
    late-only check risks a free-text leak landing in T5 unnoticed.)

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| OS notification permission undetermined | User toggles push on | Native permission prompt | Allow or keep push off |
| OS permission denied, can ask again false | User toggles push on | Open Settings row | Open OS settings and return |
| Android 13+ POST_NOTIFICATIONS not granted | User toggles push on | Runtime permission prompt / Open Settings | Grant, or keep push off |
| Push token registration fails | Network/Expo failure | Retryable settings warning | Retry registration |
| Toggle on but a signal missing | pushEnabled set, no token / no OS permission | Toggle shows which signal is missing | Resolve the named signal |
| Guardian never studies | Guardian opens parent notification surface | One-time permission primer | Allow, skip, or use settings later |
| Child has no guardian relationship | Learner opens signal UI | No child-to-parent nudge action | Use normal in-app learning support |
| Non-consented learner attempts a signal | Learner emits signal | Action unavailable | Complete consent flow |
| Unrelated recipient targeted | Forged/buggy send | Request denied (server) | None needed — denied by auth check |
| Child signal push fails | No token/provider failure | Parent still sees in-app row | Retry via notification job if configured |

## Verification

Focused checks:

```powershell
Push-Location apps/mobile
# Quote globs containing literal parens — the (app) segment is a route-group dir,
# and unquoted parens are parsed by the shell (see repo pathspec guidance).
pnpm exec jest --findRelatedTests "src/app/(app)/more/notifications.tsx" "src/hooks/use-push-token-registration.ts" "src/hooks/use-post-session-notification-ask.ts" --no-coverage
pnpm exec jest --testPathPattern nudge --no-coverage
pnpm exec tsc --noEmit
Pop-Location
pnpm exec nx run api:test --testPathPattern=nudge
# T4 touches apps/api (routes/nudges.ts, services/nudge.ts) and is
# auth-scoping-critical. Unit tests + pre-commit/pre-push hooks intentionally skip
# .integration.test. files, so run the integration suite — it's where the
# family-relationship / cross-account-denial regressions actually surface.
pnpm exec nx test:integration api
pnpm check:i18n:orphans
```

If native notification permission behavior changes, run a device/emulator smoke
through the E2E skill and record the OS permission states tested (including
Android 13+).

## Review History

- **2026-05-31 — adversarial review folded into the tasks above.** Resolved:
  T1 three-signal truth table + Android-13 case; T3 dedicated dedup key and
  no-double-prompt-with-T1 + canonical role gate; T4 explicit auth mechanism
  (family-link/role, service-layer, break test), delivery reuse (quiet
  hours/cap/`safeSend`), migration handling, and consent gate; T4/T5 cross-plan
  alignment with the identity/membership redesign; T5 named entry point and
  `ParentHomeScreen` wiring; T6 privacy invariant moved into T4/T5 tests;
  Verification now runs the API integration suite and quotes `(app)` paths;
  `notif-3` scope note added.
- **Open items requiring live-code confirmation before "ready":** whether the
  nudge `direction`/`type` is enum/CHECK (T4 migration) vs plain text; and the
  `notif-3` disposition in the source audit.
