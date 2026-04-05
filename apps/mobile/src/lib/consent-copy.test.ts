import {
  getConsentRequestCopy,
  getConsentPendingCopy,
  getConsentWithdrawnCopy,
} from './consent-copy';
import type { Persona } from './theme';

// ── getConsentRequestCopy ──────────────────────────────────────────────

describe('getConsentRequestCopy', () => {
  it('returns child-friendly text for learner persona', () => {
    const copy = getConsentRequestCopy('learner');
    expect(copy.title).toBe("Almost there! We need a grown-up's help");
    expect(copy.regulation).toContain("you're under 16");
    expect(copy.regulation).toContain('keep you safe online');
    expect(copy.emailLabel).toBe("Your parent's or guardian's email");
    expect(copy.successMessage).toContain('Once they say yes');
  });

  it.each<Persona>(['teen', 'parent'])(
    'returns default text for %s persona',
    (persona) => {
      const copy = getConsentRequestCopy(persona);
      expect(copy.title).toBe('Parental consent required');
      expect(copy.regulation).toContain('data protection regulations');
      expect(copy.regulation).toContain('under 16');
      expect(copy.emailLabel).toBe("Parent's email address");
      expect(copy.successMessage).toContain("They'll need to approve");
    }
  );

  it('teen and parent return identical copy', () => {
    const teen = getConsentRequestCopy('teen');
    const parent = getConsentRequestCopy('parent');
    expect(teen).toEqual(parent);
  });
});

// ── getConsentPendingCopy ──────────────────────────────────────────────

describe('getConsentPendingCopy', () => {
  it('returns child-friendly text for learner persona', () => {
    const copy = getConsentPendingCopy('learner');
    expect(copy.title).toBe('Hang tight!');
    expect(copy.descriptionWithoutEmail).toContain(
      "We've asked your parent or guardian"
    );
    expect(copy.subtext).toBe('Once they say yes, you can start exploring!');
  });

  it('interpolates email in descriptionWithEmail for learner', () => {
    const copy = getConsentPendingCopy('learner');
    const result = copy.descriptionWithEmail('mom@example.com');
    expect(result).toContain('mom@example.com');
    expect(result).toContain("We've asked your parent");
  });

  it.each<Persona>(['teen', 'parent'])(
    'returns default text for %s persona',
    (persona) => {
      const copy = getConsentPendingCopy(persona);
      expect(copy.title).toBe('Waiting for approval');
      expect(copy.descriptionWithoutEmail).toBe(
        'We sent an email to your parent or guardian.'
      );
      expect(copy.subtext).toBe("Once they approve, you'll have full access.");
    }
  );

  it('interpolates email in descriptionWithEmail for default', () => {
    const copy = getConsentPendingCopy('teen');
    const result = copy.descriptionWithEmail('parent@test.com');
    expect(result).toBe('We sent an email to parent@test.com.');
  });

  it('teen and parent return identical copy', () => {
    const teen = getConsentPendingCopy('teen');
    const parent = getConsentPendingCopy('parent');
    // Functions are different references, so compare results instead
    expect(teen.title).toBe(parent.title);
    expect(teen.descriptionWithoutEmail).toBe(parent.descriptionWithoutEmail);
    expect(teen.subtext).toBe(parent.subtext);
    expect(teen.descriptionWithEmail('x@y.com')).toBe(
      parent.descriptionWithEmail('x@y.com')
    );
  });

  // ── noEmailSent fields (PENDING state — no parent email submitted) ──

  it('returns child-friendly no-email-sent text for learner', () => {
    const copy = getConsentPendingCopy('learner');
    expect(copy.noEmailSentTitle).toBe('One more step!');
    expect(copy.noEmailSentDescription).toContain(
      'parent or guardian needs to say'
    );
    expect(copy.noEmailSentSubtext).toContain('Hand your phone');
    expect(copy.sendToParentButton).toBe('Get parent consent');
  });

  it('returns change-email copy for learner', () => {
    const copy = getConsentPendingCopy('learner');
    expect(copy.changeEmailButton).toBe('Send to another email');
    expect(copy.changeEmailLabel).toBe("Parent or guardian's email");
    expect(copy.changeEmailSubmit).toBe('Send link');
    expect(copy.sameEmailWarning).toContain('your own email');
  });

  it.each<Persona>(['teen', 'parent'])(
    'returns default no-email-sent text for %s persona',
    (persona) => {
      const copy = getConsentPendingCopy(persona);
      expect(copy.noEmailSentTitle).toBe('Parental consent needed');
      expect(copy.noEmailSentDescription).toContain(
        'parent or guardian must give consent'
      );
      expect(copy.sendToParentButton).toBe('Get parent consent');
    }
  );

  it.each<Persona>(['teen', 'parent'])(
    'returns default change-email copy for %s persona',
    (persona) => {
      const copy = getConsentPendingCopy(persona);
      expect(copy.changeEmailButton).toBe('Send to a different email');
      expect(copy.changeEmailLabel).toBe('New parent email address');
      expect(copy.changeEmailSubmit).toBe('Send consent link');
      expect(copy.sameEmailWarning).toContain('your own email');
    }
  );
});

// ── getConsentWithdrawnCopy ────────────────────────────────────────────

describe('getConsentWithdrawnCopy', () => {
  it('returns child-friendly text for learner persona', () => {
    const copy = getConsentWithdrawnCopy('learner');
    expect(copy.title).toBe('Your account is being closed');
    expect(copy.message).toBe(
      'Your parent or guardian has decided to close your account.'
    );
    expect(copy.details).toBe('Your learning data will be removed in 7 days.');
    expect(copy.help).toContain("wasn't meant to happen");
  });

  it.each<Persona>(['teen', 'parent'])(
    'returns default text for %s persona',
    (persona) => {
      const copy = getConsentWithdrawnCopy(persona);
      expect(copy.title).toBe('Account deletion pending');
      expect(copy.message).toBe(
        'Your parent has withdrawn consent for your account.'
      );
      expect(copy.details).toBe(
        'Your data will be permanently deleted within 7 days.'
      );
      expect(copy.help).toContain('restore consent from their dashboard');
    }
  );

  it('teen and parent return identical copy', () => {
    const teen = getConsentWithdrawnCopy('teen');
    const parent = getConsentWithdrawnCopy('parent');
    expect(teen).toEqual(parent);
  });
});
