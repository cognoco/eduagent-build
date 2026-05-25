import path from 'node:path';
import { authStateDir, buildSeedEmail } from '../helpers/runtime';

export const authScenarios = {
  soloLearner: {
    key: 'solo-learner',
    seedScenario: 'onboarding-complete',
    email: buildSeedEmail('solo-learner'),
    storageStatePath: path.join(authStateDir, 'solo-learner.json'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
  },
  ownerWithChildren: {
    key: 'owner-with-children',
    seedScenario: 'parent-multi-child',
    email: buildSeedEmail('owner-with-children'),
    storageStatePath: path.join(authStateDir, 'owner-with-children.json'),
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  },
} as const;

/**
 * Mentor Chrome audit registry (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md).
 *
 * One entry per `mentor-audit-*` scenario. The registry-smoke Playwright
 * project (apps/mobile/playwright.config.ts → `mentor-audit-registry-smoke`)
 * iterates over this map, seeds each scenario, signs in (or applies a
 * storage-state helper for pre-shell scenarios), and asserts the landing
 * testID is visible. When a landing route drifts (a learner is unexpectedly
 * routed to the parent shell, a quota-exhausted user lands on home instead
 * of paywall, etc.), the smoke project surfaces it as a CI failure rather
 * than the audit silently going stale.
 *
 * `landingTestId` is the testID rendered on the FIRST screen the user sees
 * after sign-in — the smoke spec calls `page.getByTestId(landingTestId)
 * .waitFor()` against it. Update both the testID and the asserting screen
 * together; `landingTestId` is a contract with the smoke project, not a
 * convenience label.
 *
 * `requiresChromeOnly: true` marks entries whose seed produces a state that
 * Chrome cannot fully exercise without manual interaction (live consent
 * email click-through, real OAuth providers, push notifications). The smoke
 * project filters these out by default; opt back in with
 * `PLAYWRIGHT_INCLUDE_CHROME_ONLY=1`.
 */
export interface MentorAuditScenario {
  key: string;
  seedScenario: string;
  email: string;
  landingPath: string;
  landingTestId: string;
  /** Pre-shell scenarios (session-expired, session-revoked, mfa-totp) need a
   *  custom storage-state mutation. Pointed at the helper file path. */
  storageStateMutator?: 'session-expired' | 'session-revoked' | 'mfa-totp';
  /** True when the seed produces a state Chrome cannot fully drive without
   *  manual interaction. Filtered out of the default smoke run. */
  requiresChromeOnly?: boolean;
  /** Set to skip the spec under the named flag matrix position. The smoke
   *  project re-runs guardian-shell scenarios under both V0 and V1; entries
   *  with `skipUnderV1` skip the V1 row. */
  skipUnderV1?: boolean;
}

export const mentorAuditScenarios = {
  emptyAdult: {
    key: 'mentor-audit-empty-adult',
    seedScenario: 'mentor-audit-empty-adult',
    email: buildSeedEmail('mentor-audit-empty-adult'),
    // Pre-profile lands the user on the create-profile/More flow, NOT the
    // learner home — `pre-profile` seeder docstring (`test-seed.ts`).
    landingPath: '/home',
    landingTestId: 'more-create-profile-prompt',
  },
  familyNoChildren: {
    key: 'mentor-audit-family-no-children',
    seedScenario: 'mentor-audit-family-no-children',
    email: buildSeedEmail('mentor-audit-family-no-children'),
    // Aliases parent-solo. Audit log line 133 reports the current app lands
    // on the child-style `/dashboard`; Task 1b will reconcile this with the
    // expected target (`parent-home-screen` if a nav-contract bug exists, or
    // `learner-screen` if the seed needs the missing onboarding row).
    // Until 1b closes, the smoke spec asserts the documented expected target
    // and is allowed to fail until reconciled.
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  },
  consentPendingChild: {
    key: 'mentor-audit-consent-pending-child',
    seedScenario: 'mentor-audit-consent-pending-child',
    email: buildSeedEmail('mentor-audit-consent-pending-child'),
    landingPath: '/consent/pending',
    landingTestId: 'consent-pending-screen',
  },
  consentWithdrawnChild: {
    key: 'mentor-audit-consent-withdrawn-child',
    seedScenario: 'mentor-audit-consent-withdrawn-child',
    email: buildSeedEmail('mentor-audit-consent-withdrawn-child'),
    landingPath: '/consent/withdrawn',
    landingTestId: 'consent-withdrawn-screen',
  },
  postApprovalSteadyState: {
    key: 'mentor-audit-post-approval-steady-state',
    seedScenario: 'mentor-audit-post-approval-steady-state',
    email: buildSeedEmail('mentor-audit-post-approval-steady-state'),
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  },
  deletionScheduledOwner: {
    key: 'mentor-audit-deletion-scheduled-owner',
    seedScenario: 'mentor-audit-deletion-scheduled-owner',
    email: buildSeedEmail('mentor-audit-deletion-scheduled-owner'),
    landingPath: '/home',
    landingTestId: 'deletion-scheduled-banner',
  },
  familyAtProfileLimit: {
    key: 'mentor-audit-family-at-profile-limit',
    seedScenario: 'mentor-audit-family-at-profile-limit',
    email: buildSeedEmail('mentor-audit-family-at-profile-limit'),
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  },
  postApprovalRedirect: {
    key: 'mentor-audit-post-approval-redirect',
    seedScenario: 'mentor-audit-post-approval-redirect',
    email: buildSeedEmail('mentor-audit-post-approval-redirect'),
    // Audit opens /consent/approve?token=… directly. Spec resolves the
    // token from seedResult.ids.consentToken at runtime.
    landingPath: '/consent/approve',
    landingTestId: 'consent-approve-confirmation',
  },
  consentUsUnderThreshold: {
    key: 'mentor-audit-consent-us-under-threshold',
    seedScenario: 'mentor-audit-consent-us-under-threshold',
    email: buildSeedEmail('mentor-audit-consent-us-under-threshold'),
    landingPath: '/consent/required',
    landingTestId: 'consent-required-us-screen',
  },
  consentEuUnderThreshold: {
    key: 'mentor-audit-consent-eu-under-threshold',
    seedScenario: 'mentor-audit-consent-eu-under-threshold',
    email: buildSeedEmail('mentor-audit-consent-eu-under-threshold'),
    landingPath: '/consent/required',
    landingTestId: 'consent-required-eu-screen',
  },
  consentOverThreshold: {
    key: 'mentor-audit-consent-over-threshold',
    seedScenario: 'mentor-audit-consent-over-threshold',
    email: buildSeedEmail('mentor-audit-consent-over-threshold'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
  },
  quotaOwnerDaily: {
    key: 'mentor-audit-quota-owner-daily',
    seedScenario: 'mentor-audit-quota-owner-daily',
    email: buildSeedEmail('mentor-audit-quota-owner-daily'),
    landingPath: '/home',
    landingTestId: 'daily-quota-exhausted-banner',
  },
  quotaFamilyMonthly: {
    key: 'mentor-audit-quota-family-monthly',
    seedScenario: 'mentor-audit-quota-family-monthly',
    email: buildSeedEmail('mentor-audit-quota-family-monthly'),
    landingPath: '/home',
    landingTestId: 'monthly-pool-exhausted-banner',
  },
  paywallChildNotify: {
    key: 'mentor-audit-paywall-child-notify',
    seedScenario: 'mentor-audit-paywall-child-notify',
    email: buildSeedEmail('mentor-audit-paywall-child-notify'),
    landingPath: '/paywall',
    landingTestId: 'paywall-notify-parent-screen',
  },
  resumableSession: {
    key: 'mentor-audit-resumable-session',
    seedScenario: 'mentor-audit-resumable-session',
    email: buildSeedEmail('mentor-audit-resumable-session'),
    landingPath: '/home',
    landingTestId: 'home-resume-card',
  },
  richChildHistory: {
    key: 'mentor-audit-rich-child-history',
    seedScenario: 'mentor-audit-rich-child-history',
    email: buildSeedEmail('mentor-audit-rich-child-history'),
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  },
  sessionExpired: {
    key: 'mentor-audit-session-expired',
    // No DB seed — Playwright storage-state mutation on a normal sign-in.
    seedScenario: 'onboarding-complete',
    email: buildSeedEmail('mentor-audit-session-expired'),
    landingPath: '/sign-in',
    landingTestId: 'session-expired-banner',
    storageStateMutator: 'session-expired',
  },
  sessionRevoked: {
    key: 'mentor-audit-session-revoked',
    seedScenario: 'mentor-audit-session-revoked',
    email: buildSeedEmail('mentor-audit-session-revoked'),
    landingPath: '/sign-in',
    landingTestId: 'session-revoked-banner',
    storageStateMutator: 'session-revoked',
  },
  mfaTotp: {
    key: 'mentor-audit-mfa-totp',
    seedScenario: 'mentor-audit-mfa-totp',
    email: buildSeedEmail('mentor-audit-mfa-totp'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
    storageStateMutator: 'mfa-totp',
  },
} as const satisfies Record<string, MentorAuditScenario>;
