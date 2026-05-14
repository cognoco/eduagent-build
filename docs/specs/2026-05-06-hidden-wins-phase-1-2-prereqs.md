# Hidden Wins Phase 1-2 Prerequisites

**Date:** 2026-05-06
**Status:** Ready for implementation
**Source backlog:** `docs/plans/app evolution plan/2026-05-06-hidden-wins-backlog.md`
**Scope:** Phase 1 type-plumbing prep plus Phase 2 P0 prerequisite decisions.

## Phase 1: Family Summary Type Plumbing

`apps/mobile/src/app/(app)/family.tsx` must consume the shared `DashboardChild` contract from `@eduagent/schemas` so the streak and XP fields already present in `dashboardChildSchema` remain aligned with the API response:

| Field | Source contract | Purpose |
|---|---|---|
| `currentStreak` | `@eduagent/schemas` `dashboardChildSchema` | Unblocks a later family-summary streak chip without widening local types in that UI PR. |
| `longestStreak` | `@eduagent/schemas` `dashboardChildSchema` | Keeps the local shape aligned with the API response and child-detail screen. |
| `totalXp` | `@eduagent/schemas` `dashboardChildSchema` | Unblocks later XP display if selected. |

No UI should change in Phase 1. This is prep only.

## Phase 2A: Consent Visibility Rule

**Decision:** Use coarsened visibility for non-active consent states.

The parent dashboard should keep the child row visible, but the API must redact child learning metrics when consent is not active. The mobile UI can then render a consent status surface without having unrestricted data underneath it.

| Consent state | Parent sees | Parent must not see |
|---|---|---|
| `CONSENTED` | Full dashboard metrics and drill-down data. | N/A |
| `null` | Full dashboard metrics. This covers profiles that do not require parental consent or legacy rows with no consent state. | N/A |
| `PENDING` | Child name, consent status, and a recovery action to complete consent. | Sessions, time, exchanges, streaks, XP, subject retention, progress deltas, guided ratio, trend, samples, reports, memory, and session detail. |
| `PARENTAL_CONSENT_REQUESTED` | Child name, consent status, sent/waiting copy, and resend/check-email recovery when available. | Same redacted fields as `PENDING`. |
| `WITHDRAWN` | Child name, consent status, withdrawal/grace-period messaging, and restore/archive guidance. | Same redacted fields as `PENDING`. |

### API Contract

Redaction belongs in `apps/api/src/services/dashboard.ts`, not in mobile rendering. The dashboard service must not return sensitive child metrics for `PENDING`, `PARENTAL_CONSENT_REQUESTED`, or `WITHDRAWN` children.

The recommended response shape for redacted children is still a `DashboardChild`, using neutral metric defaults so existing clients remain tolerant:

| Field group | Redacted value |
|---|---|
| Identifiers/status | Preserve `profileId`, `displayName`, `consentStatus`, `respondedAt`. |
| Summary/copy | Replace `summary` with consent-status copy, not learning-derived summary text. |
| Numeric metrics | `0` for sessions, time, exchanges, streaks, XP, total sessions, guided ratio. |
| Trend metrics | `stable` for `trend`, `retentionTrend`, and `progress.engagementTrend` if a progress object is present. |
| Arrays/objects | `subjects: []`; `progress: null`. |

Child-detail endpoints under `/dashboard/children/:profileId/*` must enforce the same rule server-side: non-active consent returns a typed forbidden/consent-required error or a redacted response, not full data. Pick one behavior per endpoint during implementation and cover it with tests.

### Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Pending consent child appears on family screen | Child has `PENDING` or `PARENTAL_CONSENT_REQUESTED` | Child row with consent status and no learning metrics | Complete or resend consent flow |
| Withdrawn child appears during grace window | Parent withdrew consent | Child row with withdrawn status and grace-period guidance | Restore consent if accidental, or let archive/delete proceed |
| Parent opens cached drill-down link for redacted child | Old deep link or stale navigation state | Consent-required fallback, not metrics | Go back to family summary or restore/complete consent |
| Existing client expects numeric fields | Mobile build predates consent badge UI | Neutral zeros and empty arrays, not missing properties | Client continues rendering without data leak |
| Consent status is `null` | Adult profile, legacy row, or no consent requirement | Normal metrics | No recovery needed |

## Phase 2B: Push Registration Failure Modes

Push registration failures must be classified at the registration boundary before adding user-visible retry UI. A single catch-all `Sentry.captureException` is not enough for launch diagnostics or user recovery.

| Cause | Trigger | Classification | User sees | Recovery | Telemetry |
|---|---|---|---|---|---|
| OS permission denied | `Notifications.getPermissionsAsync()` returns anything other than `granted` after the permission gate has run | `permission_denied` | Notifications are off with an action to open app settings | Deep-link to OS settings; do not show a retry button as the primary action | Breadcrumb/metric with platform and permission status |
| Expo push token endpoint unreachable | `Notifications.getExpoPushTokenAsync()` throws network or service error | `expo_token_unavailable` | Temporary notification setup issue | Retry with backoff; allow manual retry | Sentry exception plus structured metric/event |
| API push-token mutation fails | `/push-token` mutation throws 5xx/network error | `api_registration_failed` | Temporary notification setup issue | Retry with backoff; allow manual retry | Sentry exception plus structured metric/event with HTTP class |
| Emulator or unsupported device | Device cannot produce a push token, or project ID is unavailable in an unsupported local runtime | `unsupported_device` | Nothing in normal app UI | Suppress user-visible error; dev logs/Sentry breadcrumb only | Low-severity breadcrumb, no alerting |

### UX Rule

The retry action must match the classification:

| Classification | Primary action |
|---|---|
| `permission_denied` | Open settings |
| `expo_token_unavailable` | Retry |
| `api_registration_failed` | Retry |
| `unsupported_device` | No user action |

Do not build a generic "tap to retry notifications" banner until the hook exposes these classifications. Retrying cannot fix OS-denied permission and would degrade trust.

### Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Permission denied | User denied notifications in OS dialog | Settings-oriented notification status | Open settings and grant permission |
| Expo token service outage | Expo token request fails repeatedly | Temporary setup issue with retry affordance | Retry now or wait for backoff |
| MentoMate API unavailable | Token is fetched but API registration fails | Temporary setup issue with retry affordance | Retry; server-side metric flags registration failures |
| Unsupported local/dev runtime | Emulator or missing project ID cannot register push | No production-facing warning | None; suppress as unsupported |
| Registration succeeds after retry | Backoff or manual retry succeeds | Notification status clears | No further action |

## Verification

| Item | Verified By |
|---|---|
| Phase 1 family type plumbing compiles | `test: pnpm exec jest --findRelatedTests apps/mobile/src/app/(app)/family.tsx --no-coverage` |
| Consent visibility rule is specified before badge UI | `manual: this spec, Phase 2A` |
| Push registration failure modes are specified before indicator UI | `manual: this spec, Phase 2B` |
