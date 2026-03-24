import type { Persona } from './theme';

// ── Consent Hand-Off Screen ──────────────────────────────────────────

export interface ConsentHandOffCopy {
  childTitle: string;
  childMessage: string;
  handOffButton: string;
  parentTitle: string;
  parentEmailLabel: string;
  parentEmailPlaceholder: string;
  spamWarning: string;
  parentSubmitButton: string;
  successMessage: string;
  successSpamHint: string;
  handBackButton: string;
}

const learnerConsentHandOff: ConsentHandOffCopy = {
  childTitle: 'One more step!',
  childMessage:
    "We need a grown-up to say it's OK. Hand your phone to your parent or guardian.",
  handOffButton: "I'm the parent / guardian",
  parentTitle: 'Parental Consent Required',
  parentEmailLabel: 'Your email address',
  parentEmailPlaceholder: 'you@example.com',
  spamWarning:
    "We'll send a one-time consent link. Check your spam folder if you don't see it within a few minutes.",
  parentSubmitButton: 'Send consent link',
  successMessage: 'Consent link sent!',
  successSpamHint:
    'Check your inbox (and spam folder). The link expires in 7 days.',
  handBackButton: 'Hand back to your child',
};

const defaultConsentHandOff: ConsentHandOffCopy = {
  childTitle: 'Parental consent required',
  childMessage:
    'A parent or guardian needs to approve this account. Please hand this device to them.',
  handOffButton: "I'm the parent / guardian",
  parentTitle: 'Parental Consent Required',
  parentEmailLabel: 'Your email address',
  parentEmailPlaceholder: 'you@example.com',
  spamWarning:
    "We'll send a one-time consent link. Check your spam folder if you don't see it within a few minutes.",
  parentSubmitButton: 'Send consent link',
  successMessage: 'Consent link sent!',
  successSpamHint:
    'Check your inbox (and spam folder). The link expires in 7 days.',
  handBackButton: 'Done',
};

export function getConsentHandOffCopy(persona: Persona): ConsentHandOffCopy {
  return persona === 'learner' ? learnerConsentHandOff : defaultConsentHandOff;
}

// ── Consent Request Screen ─────────────────────────────────────────────

export interface ConsentRequestCopy {
  title: string;
  regulation: string;
  emailLabel: string;
  successMessage: string;
}

const defaultConsentRequest: ConsentRequestCopy = {
  title: 'Parental consent required',
  regulation:
    'Under data protection regulations, users under 16 need parental consent to use this service.',
  emailLabel: "Parent's email address",
  successMessage:
    "They'll need to approve before you can start learning. You can close this screen.",
};

const learnerConsentRequest: ConsentRequestCopy = {
  title: "Almost there! We need a grown-up's help",
  regulation:
    "Because you're under 16, we need your parent or guardian to say it's OK for you to use this app. It's a rule to keep you safe online!",
  emailLabel: "Your parent's or guardian's email",
  successMessage:
    "Once they say yes, you're all set to start learning! You can close this screen.",
};

export function getConsentRequestCopy(persona: Persona): ConsentRequestCopy {
  return persona === 'learner' ? learnerConsentRequest : defaultConsentRequest;
}

// ── Consent Pending Gate ───────────────────────────────────────────────

export interface ConsentPendingCopy {
  title: string;
  descriptionWithEmail: (email: string) => string;
  descriptionWithoutEmail: string;
  subtext: string;
}

const defaultConsentPending: ConsentPendingCopy = {
  title: 'Waiting for approval',
  descriptionWithEmail: (email: string) => `We sent an email to ${email}.`,
  descriptionWithoutEmail: 'We sent an email to your parent or guardian.',
  subtext: "Once they approve, you'll have full access.",
};

const learnerConsentPending: ConsentPendingCopy = {
  title: 'Hang tight!',
  descriptionWithEmail: (email: string) =>
    `We've asked your parent \u2014 they just need to check their email at ${email}.`,
  descriptionWithoutEmail:
    "We've asked your parent or guardian \u2014 they just need to check their email.",
  subtext: 'Once they say yes, you can start exploring!',
};

export function getConsentPendingCopy(persona: Persona): ConsentPendingCopy {
  return persona === 'learner' ? learnerConsentPending : defaultConsentPending;
}

// ── Consent Withdrawn Gate ─────────────────────────────────────────────

export interface ConsentWithdrawnCopy {
  title: string;
  message: string;
  details: string;
  help: string;
}

const defaultConsentWithdrawn: ConsentWithdrawnCopy = {
  title: 'Account deletion pending',
  message: 'Your parent has withdrawn consent for your account.',
  details: 'Your data will be permanently deleted within 7 days.',
  help: 'If this was a mistake, ask your parent to restore consent from their dashboard.',
};

const learnerConsentWithdrawn: ConsentWithdrawnCopy = {
  title: 'Your account is being closed',
  message: 'Your parent or guardian has decided to close your account.',
  details: 'Your learning data will be removed in 7 days.',
  help: "If this wasn't meant to happen, ask your parent to fix it from their app.",
};

export function getConsentWithdrawnCopy(
  persona: Persona
): ConsentWithdrawnCopy {
  return persona === 'learner'
    ? learnerConsentWithdrawn
    : defaultConsentWithdrawn;
}
