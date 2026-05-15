> **STATUS: COMPANION** — point-in-time mobile coverage audit from 2026-05-13. Maps inventory against Maestro flows and current More-tab shape. Verify specific claims before acting — app source may have changed.

# E2E Flow Coverage Audit — 2026-05-13

This audit maps `docs/flows/mobile-app-flow-inventory.md` against current Maestro flow files under `apps/mobile/e2e/flows/` and the current More-tab route shape.

Use this as the handoff document for deciding what to repair, run, or add next. Runtime status still requires Maestro execution on the Android dev-client.

## Summary

| Category | Count | Meaning |
| --- | ---: | --- |
| Product flow rows in old inventory | 149 | User-facing flow rows, excluding cross-cutting behavior rows |
| Missing or incomplete E2E coverage | 32 | Flows marked `Code-only`, `Partial`, or still lacking dedicated deterministic coverage |
| Existing E2E flows likely stale/wrong | 25 | YAML exists but targets old UI routes, old testIDs, or removed screens |
| Broken inventory references | 3 | Inventory points at YAML files that do not exist |

## Primary Finding

The largest repair cluster is the More-tab refactor:

- More is now a hub with nested sub-screens.
- Several flows still wait for `learning-accommodation-section-header` as a generic "More loaded" marker.
- Several flows still tap rows as if they lived directly on the More landing screen:
  - `more-row-subscription`
  - `more-row-export`
  - `more-row-delete-account`
  - `settings-app-language`
- The current route shape is:
  - More landing: `more-scroll`
  - Account: `/(app)/more/account`, `more-account-scroll`
  - Notifications: `/(app)/more/notifications`, `notifications-section-header`
  - Privacy & Data: `/(app)/more/privacy`, `more-privacy-scroll`
  - Learning preferences: `/(app)/more/learning-preferences`, `learning-preferences-scroll`
  - Accommodation: `/(app)/more/accommodation`, `accommodation-scroll`

Fixing this shared navigation drift first should unblock a large part of the existing suite.

## Existing E2E Flows Likely Stale

These flows should be reviewed and updated before counting them as valid coverage:

| Flow file | Likely stale assumption |
| --- | --- |
| `_setup/switch-to-child.yaml` | Waits for old More marker and taps Profile on the landing screen |
| `account/account-lifecycle.yaml` | Waits for old More marker |
| `account/app-language-edit.yaml` | App language moved under `/(app)/more/account` |
| `account/change-password.yaml` | Change password moved under `/(app)/more/account` |
| `account/delete-account.yaml` | Delete account moved under `/(app)/more/privacy` |
| `account/delete-account-scheduled.yaml` | Delete account moved under `/(app)/more/privacy` |
| `account/export-data.yaml` | Export moved under `/(app)/more/privacy` |
| `account/learner-mentor-memory.yaml` | Waits for old More marker |
| `account/learner-mentor-memory-populated.yaml` | Waits for old More marker |
| `account/more-impersonated-child.yaml` | Subscription/export/delete rows moved or hidden differently |
| `account/more-tab-navigation.yaml` | Accommodation, subscription, export, delete, and settings paths changed |
| `account/settings-toggles.yaml` | Notification settings moved into a sub-screen |
| `billing/child-paywall.yaml` | Subscription row is hidden while impersonating a child |
| `billing/family-pool.yaml` | Subscription row moved under Account |
| `billing/static-comparison-family.yaml` | Subscription row moved under Account |
| `billing/static-comparison-pro.yaml` | Subscription row moved under Account |
| `billing/subscription.yaml` | Waits for old More marker and taps Subscription on landing screen |
| `billing/subscription-details.yaml` | Waits for old More marker and taps Subscription on landing screen |
| `billing/upgrade-confirmed-state.yaml` | Subscription row moved under Account |
| `billing/upgrade-pending-state.yaml` | Subscription row moved under Account |
| `learning/core-learning.yaml` | Waits for old More marker |
| `onboarding/create-profile-standalone.yaml` | Waits for old More marker |
| `parent/parent-tabs.yaml` | Waits for old More marker / parent More assertions are shallow |
| `post-auth-comprehensive-devclient.yaml` | Multiple old More markers plus removed persona/theme UI assumptions |
| `regression/bug-239-parent-add-child.yaml` | Waits for old More marker |

## Broken Inventory References

The inventory references these YAML files, but they are not present:

- `apps/mobile/e2e/flows/onboarding/onboarding-extras-flow.yaml`
- `apps/mobile/e2e/flows/account/tutor-language-edit.yaml`
- `apps/mobile/e2e/flows/onboarding/settings-language-edit.yaml`

Current closest equivalents:

- `apps/mobile/e2e/flows/onboarding/onboarding-fast-path.yaml`
- `apps/mobile/e2e/flows/onboarding/onboarding-fast-path-language.yaml`
- `apps/mobile/e2e/flows/account/app-language-edit.yaml`

## Missing Or Incomplete Coverage

These flow IDs need dedicated coverage or an explicit "not suitable for Maestro" decision:

| ID | Gap |
| --- | --- |
| AUTH-03 | Sign-up email verification code is only partially covered inside sign-up |
| AUTH-08 | OAuth happy path beyond button rendering |
| AUTH-11 | Session-expired forced sign-out and re-entry banner |
| AUTH-13 | Deep-link auth redirect preservation |
| AUTH-14 | Sign-in transition stuck-state recovery |
| ACCOUNT-02 | Generic additional-profile journey |
| ACCOUNT-05 | Family/max-profile gating for adding children |
| ACCOUNT-12 | Cancel scheduled account deletion as a dedicated flow |
| ACCOUNT-13 | Privacy policy as a dedicated flow |
| ACCOUNT-14 | Terms of service as a dedicated flow |
| ACCOUNT-19 | Underage profile creation consent request as one end-to-end branch |
| HOME-06 | Resume interrupted session |
| HOME-08 | Home loading-timeout fallback |
| SUBJECT-02 | Create subject from Library empty state |
| SUBJECT-04 | Create subject from Homework branch |
| LEARN-18 | Subject progress detail |
| LEARN-20 | Milestones list error/fallback states |
| LEARN-26 | First-curriculum polling / timeout behavior |
| PRACTICE-02 | Review topics shortcut, beyond indirect coverage |
| QUIZ-06 | Round complete error retry |
| QUIZ-09 | Quiz history |
| QUIZ-10 | Quiz round detail |
| DICT-02 | OCR text preview/edit before dictation |
| DICT-05 | Mid-dictation hardware-back exit confirm |
| DICT-07 | Camera capture part of handwritten dictation review |
| DICT-10 | Dictation result-recording retry/failure |
| HOMEWORK-05 | Gallery import |
| HOMEWORK-06 | Vision/image pass-through to homework session |
| PARENT-10 | Parent child-topic Understanding + Retention cards |
| BILLING-02 | RevenueCat IAP happy path |
| BILLING-05 | Manage billing deep link |
| BILLING-10 | BYOK waitlist, currently UI-commented out |

## Recommended Repair Order

1. Fix shared More navigation drift first.
   - Replace `learning-accommodation-section-header` as the generic More-loaded marker with `more-scroll`.
   - Update flows that tap `more-row-subscription`, `more-row-export`, `more-row-delete-account`, and `settings-app-language`.
   - Consider helper flows for opening Account, Privacy & Data, Notifications, and Accommodation.

2. Repair high-value stale flows.
   - Billing flows.
   - Account lifecycle / export / delete / change password.
   - Parent tabs and post-auth comprehensive smoke.

3. Update inventory references.
   - Remove references to deleted YAML files.
   - Point app-language and onboarding rows at current files.

4. Add missing coverage in risk order.
   - Auth/session resilience.
   - Progress/report surfaces.
   - Quiz drill-down/error branches.
   - Hardware or external-store dependent flows last.

5. Reconcile flow inventory after each wave.
   - Each fixed or added YAML should update the inventory row in the same PR.
   - Rows that cannot be Maestro-tested should say why and point to unit/integration coverage instead.

## Not Counted As Runtime Failures Yet

This audit is static. A flow is listed as stale when it references old route/testID assumptions, not because it was executed and failed. Before closing a flow as fixed, run it on the Android dev-client using the E2E runbook.
