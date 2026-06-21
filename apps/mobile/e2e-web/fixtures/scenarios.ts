import path from 'node:path';
import { authStateDir, buildSeedEmail } from '../helpers/runtime';

export const authScenarios = {
  soloLearner: {
    key: 'solo-learner',
    seedScenario: 'onboarding-complete',
    email: buildSeedEmail('solo-learner'),
    storageStatePath: path.join(authStateDir, 'solo-learner.json'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  ownerWithChildren: {
    key: 'owner-with-children',
    seedScenario: 'parent-multi-child',
    email: buildSeedEmail('owner-with-children'),
    storageStatePath: path.join(authStateDir, 'owner-with-children.json'),
    landingPath: '/mentor',
    // V2 removes the Family/Study mode switcher from chrome. This fixture is
    // an adult owner with linked children, not a supporter-scope fixture, so it
    // lands in the owner's own Mentor shell.
    landingTestId: 'mentor-screen',
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
 * `requiresChromeOnly: true` marks entries whose seed produces a state the
 * default landing harness cannot fully exercise yet (for example API consent
 * pages, deterministic auth invalidation, standing MFA fixtures, live consent
 * email click-through, real OAuth providers, or push notifications). The smoke
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
    // Pre-profile lands the user on the create-profile gate, NOT the learner
    // home. V2 redirects authenticated app entries through Mentor before the
    // root layout gate renders.
    landingPath: '/mentor',
    landingTestId: 'create-profile-gate',
  },
  familyNoChildren: {
    key: 'mentor-audit-family-no-children',
    seedScenario: 'mentor-audit-family-no-children',
    email: buildSeedEmail('mentor-audit-family-no-children'),
    // V2 normal app-shell landings route through the Mentor tab.
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  consentPendingChild: {
    key: 'mentor-audit-consent-pending-child',
    seedScenario: 'mentor-audit-consent-pending-child',
    email: buildSeedEmail('mentor-audit-consent-pending-child'),
    landingPath: '/mentor',
    landingTestId: 'consent-pending-gate',
  },
  consentWithdrawnChild: {
    key: 'mentor-audit-consent-withdrawn-child',
    seedScenario: 'mentor-audit-consent-withdrawn-child',
    email: buildSeedEmail('mentor-audit-consent-withdrawn-child'),
    landingPath: '/mentor',
    landingTestId: 'consent-withdrawn-gate',
  },
  postApprovalSteadyState: {
    key: 'mentor-audit-post-approval-steady-state',
    seedScenario: 'mentor-audit-post-approval-steady-state',
    email: buildSeedEmail('mentor-audit-post-approval-steady-state'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  deletionScheduledOwner: {
    key: 'mentor-audit-deletion-scheduled-owner',
    seedScenario: 'mentor-audit-deletion-scheduled-owner',
    email: buildSeedEmail('mentor-audit-deletion-scheduled-owner'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  familyAtProfileLimit: {
    key: 'mentor-audit-family-at-profile-limit',
    seedScenario: 'mentor-audit-family-at-profile-limit',
    email: buildSeedEmail('mentor-audit-family-at-profile-limit'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  postApprovalRedirect: {
    key: 'mentor-audit-post-approval-redirect',
    seedScenario: 'mentor-audit-post-approval-redirect',
    email: buildSeedEmail('mentor-audit-post-approval-redirect'),
    // [BUG-779] Consent approval is owned by the API consent-web flow at
    // GET /consent-page?token=… (apps/api/src/routes/consent-web.ts:153), not
    // by a mobile Expo Router screen. The earlier landingPath '/consent/approve'
    // pointed at a route that has never existed in apps/mobile/src/app/, so the
    // smoke failed before exercising the consent-approval surface a parent
    // actually clicks from email. The spec resolves the API base URL + appends
    // the consentToken returned by the seeder at runtime; `landingPath` here
    // is the suffix the spec joins onto `apiBaseUrl`.
    landingPath: '/consent-page',
    // The consent-web page is plain server-rendered HTML (no React testIDs).
    // The spec asserts on the document heading 'Consent required for …' which
    // is the deterministic shape consent-web.ts:189 emits when the token is
    // valid. `landingTestId` is preserved as a textual key the spec maps to
    // a heading assertion rather than a testID lookup; the
    // post-approval-redirect branch in registry-smoke.spec.ts is the only
    // consumer that interprets it this way.
    landingTestId: 'consent-required-heading',
    requiresChromeOnly: true,
  },
  consentUsUnderThreshold: {
    key: 'mentor-audit-consent-us-under-threshold',
    seedScenario: 'mentor-audit-consent-us-under-threshold',
    email: buildSeedEmail('mentor-audit-consent-us-under-threshold'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  consentEuUnderThreshold: {
    key: 'mentor-audit-consent-eu-under-threshold',
    seedScenario: 'mentor-audit-consent-eu-under-threshold',
    email: buildSeedEmail('mentor-audit-consent-eu-under-threshold'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  consentOverThreshold: {
    key: 'mentor-audit-consent-over-threshold',
    seedScenario: 'mentor-audit-consent-over-threshold',
    email: buildSeedEmail('mentor-audit-consent-over-threshold'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  quotaOwnerDaily: {
    key: 'mentor-audit-quota-owner-daily',
    seedScenario: 'mentor-audit-quota-owner-daily',
    email: buildSeedEmail('mentor-audit-quota-owner-daily'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  quotaFamilyMonthly: {
    key: 'mentor-audit-quota-family-monthly',
    seedScenario: 'mentor-audit-quota-family-monthly',
    email: buildSeedEmail('mentor-audit-quota-family-monthly'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  paywallChildNotify: {
    key: 'mentor-audit-paywall-child-notify',
    seedScenario: 'mentor-audit-paywall-child-notify',
    email: buildSeedEmail('mentor-audit-paywall-child-notify'),
    landingPath: '/subscription',
    landingTestId: 'child-paywall',
  },
  resumableSession: {
    key: 'mentor-audit-resumable-session',
    seedScenario: 'mentor-audit-resumable-session',
    email: buildSeedEmail('mentor-audit-resumable-session'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  richChildHistory: {
    key: 'mentor-audit-rich-child-history',
    seedScenario: 'mentor-audit-rich-child-history',
    email: buildSeedEmail('mentor-audit-rich-child-history'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  sessionExpired: {
    key: 'mentor-audit-session-expired',
    // No DB seed — Playwright storage-state mutation on a normal sign-in.
    seedScenario: 'onboarding-complete',
    email: buildSeedEmail('mentor-audit-session-expired'),
    landingPath: '/sign-in',
    landingTestId: 'session-expired-banner',
    storageStateMutator: 'session-expired',
    requiresChromeOnly: true,
  },
  sessionRevoked: {
    key: 'mentor-audit-session-revoked',
    seedScenario: 'mentor-audit-session-revoked',
    email: buildSeedEmail('mentor-audit-session-revoked'),
    landingPath: '/sign-in',
    landingTestId: 'session-revoked-banner',
    storageStateMutator: 'session-revoked',
    requiresChromeOnly: true,
  },
  mfaTotp: {
    key: 'mentor-audit-mfa-totp',
    seedScenario: 'mentor-audit-mfa-totp',
    email: buildSeedEmail('mentor-audit-mfa-totp'),
    landingPath: '/home',
    landingTestId: 'learner-screen',
    storageStateMutator: 'mfa-totp',
    // Staging Clerk currently has authenticator-app MFA disabled; keep this
    // out of the default seeded registry until a standing MFA fixture exists.
    requiresChromeOnly: true,
  },
  // Third wave — BILLING-07/08 + BRIDGE-03/04
  // (docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md §§11b, 11c, 14).
  familyPoolMembers: {
    key: 'mentor-audit-family-pool-members',
    seedScenario: 'mentor-audit-family-pool-members',
    email: buildSeedEmail('mentor-audit-family-pool-members'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  familyOwnerDailyQuotaWithChild: {
    key: 'mentor-audit-family-owner-daily-quota-with-child',
    seedScenario: 'mentor-audit-family-owner-daily-quota-with-child',
    email: buildSeedEmail('mentor-audit-family-owner-daily-quota-with-child'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
  bridgeBackstack: {
    key: 'mentor-audit-bridge-backstack',
    seedScenario: 'mentor-audit-bridge-backstack',
    email: buildSeedEmail('mentor-audit-bridge-backstack'),
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  },
} as const satisfies Record<string, MentorAuditScenario>;
