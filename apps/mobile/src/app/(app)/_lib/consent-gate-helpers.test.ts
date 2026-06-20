import type { TFunction } from 'i18next';

import {
  canSwitchFromConsentGate,
  buildSwitchProfileConfirmation,
  PENDING_CONSENT_STATUSES,
} from './consent-gate-helpers';

/**
 * Birth-year helpers derived from the current year so the eligibility tests
 * never rot as the clock advances. `canSwitchFromConsentGate` computes age as
 * `currentYear - birthYear`, so `yearForAge(18)` is exactly on the 18+ boundary.
 */
const CURRENT_YEAR = new Date().getFullYear();
const yearForAge = (age: number): number => CURRENT_YEAR - age;

const adult = (id: string, age = 40) => ({ id, birthYear: yearForAge(age) });
const minor = (id: string, age = 10) => ({ id, birthYear: yearForAge(age) });

/**
 * A minimal i18next-compatible stand-in for the injected `t` dependency.
 * `buildSwitchProfileConfirmation` takes `t` as a parameter (an external
 * boundary — the i18next runtime), so this is dependency injection, not an
 * internal mock: we assert the helper's own branching/composition, echoing the
 * key + interpolated vars so each branch is observable.
 */
const t = ((key: string, vars?: Record<string, unknown>): string => {
  if (!vars) return key;
  const parts = Object.entries(vars)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',');
  return `${key}{${parts}}`;
}) as unknown as TFunction;

describe('PENDING_CONSENT_STATUSES', () => {
  it('blocks app access for PENDING and PARENTAL_CONSENT_REQUESTED', () => {
    expect(PENDING_CONSENT_STATUSES.has('PENDING')).toBe(true);
    expect(PENDING_CONSENT_STATUSES.has('PARENTAL_CONSENT_REQUESTED')).toBe(
      true,
    );
  });

  it('does not block CONSENTED / WITHDRAWN', () => {
    expect(PENDING_CONSENT_STATUSES.has('CONSENTED')).toBe(false);
    expect(PENDING_CONSENT_STATUSES.has('WITHDRAWN')).toBe(false);
  });
});

describe('canSwitchFromConsentGate (ACCOUNT-38 switch eligibility)', () => {
  it('returns false when there is no active profile', () => {
    expect(canSwitchFromConsentGate(null, [minor('child'), adult('me')])).toBe(
      false,
    );
  });

  // ── switch-eligible adult ────────────────────────────────────────────────
  it('returns true for an active 18+ adult sharing the account with a minor', () => {
    const me = adult('parent', 40);
    const profiles = [me, minor('child', 9)];
    expect(canSwitchFromConsentGate(me, profiles)).toBe(true);
  });

  it('returns true at the exact 18-year-old boundary (age === 18) with a minor sibling', () => {
    const me = { id: 'teen-owner', birthYear: yearForAge(18) };
    const profiles = [me, minor('child', 8)];
    expect(canSwitchFromConsentGate(me, profiles)).toBe(true);
  });

  // ── switch-ineligible active child ───────────────────────────────────────
  it('returns false for an active minor, even when a minor sibling exists', () => {
    const me = minor('child-a', 12);
    const profiles = [me, minor('child-b', 9), adult('parent')];
    expect(canSwitchFromConsentGate(me, profiles)).toBe(false);
  });

  // ── switch-ineligible adult with no minor sibling ────────────────────────
  it('returns false for a solo adult (only their own profile)', () => {
    const me = adult('solo', 30);
    expect(canSwitchFromConsentGate(me, [me])).toBe(false);
  });

  it('returns false for an adult sharing the account only with other adults', () => {
    const me = adult('parent', 45);
    const profiles = [me, adult('co-parent', 43), adult('grandparent', 70)];
    expect(canSwitchFromConsentGate(me, profiles)).toBe(false);
  });

  it('treats an 18-year-old sibling as NOT a minor (sibling age === 18 → ineligible)', () => {
    const me = adult('parent', 50);
    const eighteen = { id: 'sib', birthYear: yearForAge(18) };
    expect(canSwitchFromConsentGate(me, [me, eighteen])).toBe(false);
  });
});

describe('buildSwitchProfileConfirmation', () => {
  it('returns null when there is no active profile', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: null,
        profiles: [{ id: 'a', displayName: 'Ada' }],
        t,
      }),
    ).toBeNull();
  });

  it('returns null when there is no other profile to switch to', () => {
    expect(
      buildSwitchProfileConfirmation({
        activeProfile: { id: 'me' },
        profiles: [{ id: 'me', displayName: 'Me' }],
        t,
      }),
    ).toBeNull();
  });

  it('targets the single other profile and uses the single-destination message', () => {
    const prompt = buildSwitchProfileConfirmation({
      activeProfile: { id: 'me' },
      profiles: [
        { id: 'me', displayName: 'Parent' },
        { id: 'child', displayName: 'Emma' },
      ],
      t,
    });
    expect(prompt).not.toBeNull();
    expect(prompt?.target).toEqual({ id: 'child', displayName: 'Emma' });
    expect(prompt?.title).toBe('tabs.switchProfile.title{name=Emma}');
    expect(prompt?.message).toBe('tabs.switchProfile.messageSingle{name=Emma}');
  });

  it('lists the remaining profiles when more than one alternative exists', () => {
    const prompt = buildSwitchProfileConfirmation({
      activeProfile: { id: 'me' },
      profiles: [
        { id: 'me', displayName: 'Parent' },
        { id: 'c1', displayName: 'Emma' },
        { id: 'c2', displayName: 'Noah' },
        { id: 'c3', displayName: 'Liam' },
      ],
      t,
    });
    expect(prompt?.target).toEqual({ id: 'c1', displayName: 'Emma' });
    // First alternative is the target; the rest are listed in the message.
    expect(prompt?.message).toContain(
      'tabs.switchProfile.messageSingle{name=Emma}',
    );
    expect(prompt?.message).toContain(
      'tabs.switchProfile.otherProfiles{names=Noah, Liam}',
    );
    expect(prompt?.message).toContain('tabs.switchProfile.cancelHint');
  });
});
