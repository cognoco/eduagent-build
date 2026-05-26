import type { TFunction } from 'i18next';

/** Consent statuses that block app access */
export const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

/**
 * Whether the "Switch profile" button should appear inside consent gates.
 *
 * Rules (consent-bypass fix):
 * - Hidden for anyone under 18 — prevents children from escaping the gate
 *   by switching to an un-gated profile.
 * - Hidden for adults (18+) with no linked minor profiles — no legitimate
 *   reason to switch from a consent gate.
 * - Shown ONLY for adults (18+) who share the account with at least one minor
 *   profile (proxy for family links), so a parent viewing their child's
 *   pending/withdrawn consent screen can switch back to their own profile.
 */
export function canSwitchFromConsentGate(
  activeProfile: { id: string; birthYear: number } | null,
  profiles: ReadonlyArray<{ id: string; birthYear: number }>,
): boolean {
  if (!activeProfile) return false;
  const currentYear = new Date().getFullYear();
  const age = currentYear - activeProfile.birthYear;
  if (age < 18) return false;
  // Must have at least one OTHER profile that belongs to a minor
  return profiles.some(
    (p) => p.id !== activeProfile.id && currentYear - p.birthYear < 18,
  );
}

/**
 * [BUG-776 / M-14] Builds the confirmation prompt + handler for the consent
 * gate "Switch profile" action. Previously the handler silently picked the
 * first non-current profile — for a 2+ child family, the parent could land
 * on a child they weren't expecting. The fix: always confirm the destination
 * by name, and (when more than one alternative exists) list the others in
 * the message so the parent can cancel and try a more deliberate path.
 */
export function buildSwitchProfileConfirmation(params: {
  activeProfile: { id: string } | null;
  profiles: ReadonlyArray<{ id: string; displayName: string }>;
  t: TFunction;
}): {
  target: { id: string; displayName: string };
  title: string;
  message: string;
} | null {
  const { activeProfile, profiles, t } = params;
  if (!activeProfile) return null;
  const others = profiles.filter((p) => p.id !== activeProfile.id);
  if (others.length === 0) return null;
  const target = others[0];
  if (!target) return null;
  if (others.length === 1) {
    return {
      target,
      title: t('tabs.switchProfile.title', { name: target.displayName }),
      message: t('tabs.switchProfile.messageSingle', {
        name: target.displayName,
      }),
    };
  }
  const otherNames = others
    .slice(1)
    .map((p) => p.displayName)
    .join(', ');
  return {
    target,
    title: t('tabs.switchProfile.title', { name: target.displayName }),
    message:
      t('tabs.switchProfile.messageSingle', { name: target.displayName }) +
      '\n\n' +
      t('tabs.switchProfile.otherProfiles', { names: otherNames }) +
      '\n\n' +
      t('tabs.switchProfile.cancelHint'),
  };
}
