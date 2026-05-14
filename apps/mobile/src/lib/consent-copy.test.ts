import {
  getConsentRequestCopy,
  getConsentPendingCopy,
  getConsentWithdrawnCopy,
  getConsentHandOffCopy,
} from './consent-copy';
import type { AgeBracket } from '@eduagent/schemas';

// ── getConsentRequestCopy ──────────────────────────────────────────────

describe('getConsentRequestCopy', () => {
  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns child-friendly text for %s bracket',
    (bracket) => {
      const copy = getConsentRequestCopy(bracket);
      expect(copy.title).toBe("Almost there! We need a grown-up's help");
      expect(copy.regulation).toContain("you're under 16");
      expect(copy.regulation).toContain('keep you safe online');
      expect(copy.emailLabel).toBe("Your parent's or guardian's email");
      expect(copy.successMessage).toContain('Once they say yes');
    },
  );

  it('returns default text for adult bracket', () => {
    const copy = getConsentRequestCopy('adult');
    expect(copy.title).toBe('Parental consent required');
    expect(copy.regulation).toContain('data protection regulations');
    expect(copy.regulation).toContain('under 16');
    expect(copy.emailLabel).toBe("Parent's email address");
    expect(copy.successMessage).toContain("They'll need to approve");
  });

  it('child and adolescent return identical copy', () => {
    const child = getConsentRequestCopy('child');
    const adolescent = getConsentRequestCopy('adolescent');
    expect(child).toEqual(adolescent);
  });
});

// ── getConsentPendingCopy ──────────────────────────────────────────────

describe('getConsentPendingCopy', () => {
  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns child-friendly text for %s bracket',
    (bracket) => {
      const copy = getConsentPendingCopy(bracket);
      expect(copy.title).toBe('Hang tight!');
      expect(copy.descriptionWithoutEmail).toContain(
        "We've asked your parent or guardian",
      );
      expect(copy.subtext).toBe('Once they say yes, you can start exploring!');
    },
  );

  it('interpolates email in descriptionWithEmail for child/adolescent', () => {
    const copy = getConsentPendingCopy('adolescent');
    const result = copy.descriptionWithEmail('mom@example.com');
    expect(result).toContain('mom@example.com');
    expect(result).toContain("We've asked your parent");
  });

  it('returns default text for adult bracket', () => {
    const copy = getConsentPendingCopy('adult');
    expect(copy.title).toBe('Waiting for approval');
    expect(copy.descriptionWithoutEmail).toBe(
      'We sent an email to your parent or guardian.',
    );
    expect(copy.subtext).toBe("Once they approve, you'll have full access.");
  });

  it('interpolates email in descriptionWithEmail for adult', () => {
    const copy = getConsentPendingCopy('adult');
    const result = copy.descriptionWithEmail('parent@test.com');
    expect(result).toBe('We sent an email to parent@test.com.');
  });

  it('child and adolescent return identical copy', () => {
    const child = getConsentPendingCopy('child');
    const adolescent = getConsentPendingCopy('adolescent');
    expect(child.title).toBe(adolescent.title);
    expect(child.descriptionWithoutEmail).toBe(
      adolescent.descriptionWithoutEmail,
    );
    expect(child.subtext).toBe(adolescent.subtext);
    expect(child.descriptionWithEmail('x@y.com')).toBe(
      adolescent.descriptionWithEmail('x@y.com'),
    );
  });

  // ── noEmailSent fields (PENDING state — no parent email submitted) ──

  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns child-friendly no-email-sent text for %s bracket',
    (bracket) => {
      const copy = getConsentPendingCopy(bracket);
      expect(copy.noEmailSentTitle).toBe('One more step!');
      expect(copy.noEmailSentDescription).toContain(
        'parent or guardian needs to say',
      );
      expect(copy.noEmailSentSubtext).toContain('Hand your phone');
      expect(copy.sendToParentButton).toBe('Get parent consent');
    },
  );

  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns change-email copy for %s bracket',
    (bracket) => {
      const copy = getConsentPendingCopy(bracket);
      expect(copy.changeEmailButton).toBe('Send to another email');
      expect(copy.changeEmailLabel).toBe("Parent or guardian's email");
      expect(copy.changeEmailSubmit).toBe('Send link');
      expect(copy.sameEmailWarning).toContain('your own email');
    },
  );

  it('returns default no-email-sent text for adult bracket', () => {
    const copy = getConsentPendingCopy('adult');
    expect(copy.noEmailSentTitle).toBe('Parental consent needed');
    expect(copy.noEmailSentDescription).toContain(
      'parent or guardian must give consent',
    );
    expect(copy.sendToParentButton).toBe('Get parent consent');
  });

  it('returns default change-email copy for adult bracket', () => {
    const copy = getConsentPendingCopy('adult');
    expect(copy.changeEmailButton).toBe('Send to a different email');
    expect(copy.changeEmailLabel).toBe('New parent email address');
    expect(copy.changeEmailSubmit).toBe('Send consent link');
    expect(copy.sameEmailWarning).toContain('your own email');
  });
});

// ── getConsentWithdrawnCopy ────────────────────────────────────────────

describe('getConsentWithdrawnCopy', () => {
  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns child-friendly text for %s bracket',
    (bracket) => {
      const copy = getConsentWithdrawnCopy(bracket);
      expect(copy.title).toBe('Your account is being closed');
      expect(copy.message).toBe(
        'Your parent or guardian has decided to close your account.',
      );
      expect(copy.details).toBe(
        'Your learning data will be removed in 7 days.',
      );
      expect(copy.help).toContain("wasn't meant to happen");
    },
  );

  it('returns default text for adult bracket', () => {
    const copy = getConsentWithdrawnCopy('adult');
    expect(copy.title).toBe('Account deletion pending');
    expect(copy.message).toBe(
      'Your parent has withdrawn consent for your account.',
    );
    expect(copy.details).toBe(
      'Your data will be permanently deleted within 7 days.',
    );
    expect(copy.help).toContain('restore consent from their dashboard');
  });

  it('child and adolescent return identical copy', () => {
    const child = getConsentWithdrawnCopy('child');
    const adolescent = getConsentWithdrawnCopy('adolescent');
    expect(child).toEqual(adolescent);
  });
});

// ── getConsentHandOffCopy ────────────────────────────────────────────

describe('getConsentHandOffCopy', () => {
  it.each<AgeBracket>(['child', 'adolescent'])(
    'returns learner hand-off copy for %s bracket',
    (bracket) => {
      const copy = getConsentHandOffCopy(bracket);
      expect(copy.childTitle).toBe('Almost there!');
      expect(copy.successMessage).toBe('Link sent!');
      expect(copy.handBackButton).toBe('Got it');
    },
  );

  it('returns default hand-off copy for adult bracket', () => {
    const copy = getConsentHandOffCopy('adult');
    expect(copy.childTitle).toBe('Parental consent required');
    expect(copy.successMessage).toBe('Consent link sent!');
    expect(copy.handBackButton).toBe('Done');
  });

  it('child and adolescent return identical copy', () => {
    expect(getConsentHandOffCopy('child')).toEqual(
      getConsentHandOffCopy('adolescent'),
    );
  });
});
