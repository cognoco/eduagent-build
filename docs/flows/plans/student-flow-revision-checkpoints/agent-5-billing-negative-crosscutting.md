> Agent 5 checkpoint - 2026-05-22

# Scope

- Batch 7: BILLING-01..12
- Batch 8: PARENT-01..13 negative mentor access from Study
- Batch 9: CC-01..18 cross-cutting

# Environment

- Branch: `i18n-translations`
- Local HEAD observed: `32946837b` (prompt shared context said `ae5cacc8a`)
- API target: `https://api-stg.mentomate.com`
- Preview target: `http://127.0.0.1:19006` (root returned HTTP 200)
- Working tree note: `apps/mobile/src/app/(app)/_layout.tsx` was already modified before Agent 5 checkpointing; Agent 5 did not edit source or git state.
- Method: source/static review, existing E2E flow inspection, and unauthenticated preview availability check. Authenticated setup/full suites were not rerun because shared Playwright setup had already hit session expiry.

# Bugs Filed In Notion

- Bug 605: `[PARENT-03] Study child deep links switch into Family mode instead of protected fallback` - https://www.notion.so/3688bce91f7c8192ac86ea72cc22a421
- Bug 606: `[BILLING-04] Mobile web shows Restore Purchases even though RevenueCat restore cannot run` - https://www.notion.so/3688bce91f7c818a80e2dc7849ba97c7
- Bug 607: `[CC-11] Subscription and child paywall surfaces ignore app language for hardcoded English copy` - https://www.notion.so/3688bce91f7c817f8932e8d4bc58ab83
- Bug 608: `[CC-18] Student list surfaces still allocate FlatList callbacks inline` - https://www.notion.so/3688bce91f7c81b1b811d72ebac89d9e

# Batch 7 Coverage - Billing

- BILLING-01: Inspected owner subscription entry/source and existing flow. No new bug; existing tracker already has `[BILLING-01] Subscription Back returns Home instead of More on web`.
- BILLING-02: Upgrade flow source and E2E coverage inspected. Native RevenueCat purchase happy path requires store/native; no new bug beyond existing web purchase/no-op tracker item found in search.
- BILLING-03: Trial, usage, and family-pool rendering inspected in `subscription.tsx`; no Study data-scope mutation found.
- BILLING-04: Bug 606 filed for mobile web showing native restore action.
- BILLING-05: Manage billing source inspected; web path has static info row, native deep link branch is native-only. Existing tracker has prior manage-billing web visibility issue, so no duplicate filed.
- BILLING-06: Child/non-owner paywall inspected. It offers notify-parent and browse/progress actions, not purchase management. Bug 607 covers hardcoded English on this surface.
- BILLING-07: Daily quota path inspected via `QuotaExceededCard`, session streaming quota state, and tests; no new bug found.
- BILLING-08: Family pool section source inspected; visible for family owner data and does not change Study learning scope. API owner-gate concerns appear already tracked by existing `[CR-2026-05-19-H1]`.
- BILLING-09: Top-up source/E2E inspected. Actual consumable purchase path is native/store-only and was skipped; no source-level Study-scope issue found.
- BILLING-10: BYOK waitlist is visible in current source despite inventory saying UI was commented out. No behavior bug filed; Bug 607 covers its hardcoded English copy.
- BILLING-11: Trial banner/status source and existing flow inspected; no new bug beyond Bug 607's i18n coverage.
- BILLING-12: Static comparison card flows/source inspected; no new Study-scope bug beyond Bug 607's i18n coverage.

# Batch 8 Coverage - Negative Mentor Access From Study

- PARENT-01/PARENT-02: Study tab shell and `LearnerScreen` mode gate inspected. In explicit Study mode, parent dashboard is not surfaced from tabs/home.
- PARENT-03/PARENT-06/PARENT-08/PARENT-10/PARENT-13: Bug 605 filed. Direct child-route entry from Study uses `RequireFamilyContext` -> `useGuardFamilyRoute()` -> `setMode('family')` and `router.replace('/(app)/home')`, mutating the user into Family mode rather than blocking/safe-falling back in Study.
- PARENT-04/PARENT-05/PARENT-11: Covered by Bug 605 because subject/topic/session/recap subroutes are under the same `/(app)/child/[profileId]` layout guard.
- PARENT-07: Top-level Study Library source uses active self profile hooks; no child curriculum surfaced from Study found.
- PARENT-09: Parent-only tooltip/surface not found surfaced from Study in source review.
- PARENT-10/PARENT-12: Progress source forces `selectedProfileId` to active profile in Study and hides child picker/child queries; no separate bug beyond direct-link mode-switch issue.

# Batch 9 Coverage - Cross-Cutting

- CC-01: Session chips/feedback gating inspected in `SessionMessageActions`; quota card exception is intentional.
- CC-02: Greeting-aware classification inspected in `use-subject-classification`; greeting path avoids subject classification.
- CC-03: No animation-specific defect found in static review; no native visual run.
- CC-04: `goBackOrReplace` and `ChatShell` back fallback source/tests inspected; no new bug.
- CC-05: Resume target/recovery marker paths use active profile/profile-keyed hooks; no leak found.
- CC-06: Top-up purchase confidence is native/store-only for the actual purchase path; source polling/confirmation inspected.
- CC-07: Self accommodations route is visible in Study; child editor entry is not surfaced from Study More.
- CC-08: Parent-facing vocabulary surfaces were not found exposed from Study.
- CC-09: Auth tab shell uses opaque scene backgrounds; no bleed bug found statically.
- CC-10: Completion side-effect soft-fail paths were spot-checked in session/hooks; no new bug filed.
- CC-11: Bug 607 filed for hardcoded English subscription/paywall strings.
- CC-12: `FeedbackProvider` wraps authenticated screens/gates in the app layout; native shake branch skipped as native/device-only.
- CC-13: Streaming error recovery/quota guards inspected in `use-session-streaming` and tests; no new bug.
- CC-14: Envelope stripping inspected in `MessageBubble` and `strip-envelope` tests; no new bug.
- CC-15: RN Web stale-send guard inspected in `ChatShell` and tests; no new bug.
- CC-16: HMR-safe error guards/classification tests inspected; no new bug.
- CC-17: Covered by Bug 605.
- CC-18: Bug 608 filed for inline `FlatList` callbacks on student list surfaces.

# Native-Only / Store-Only Skips

- RevenueCat purchase happy path, restore execution on iOS/Android, top-up consumable purchase, App Store/Play manage-billing deep links, shake-to-feedback, and native animation/performance observation require native emulator/device/store capabilities and were not executed in this parallel sweep.

# Duplicate/Existing Tracker Notes

- Notion duplicate search was done via workspace search because the structured query tool returned an internal `notion-query-data-sources not found` error.
- Existing issues found and not duplicated included web subscription back behavior, web upgrade/no-op, manage-billing web visibility, and broad owner-gate/API administrative route coverage.
