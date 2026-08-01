import type { Profile } from '@eduagent/schemas';

import { shouldRequireFirstMentorLanguageConfirmation } from './first-mentor-language';
import { resolveLanguageVoiceLocale } from '../app/(app)/session/_view-models/session-derived-state';

function profile(
  overrides: Partial<
    Pick<
      Profile,
      | 'isOwner'
      | 'isCurrentUser'
      | 'conversationLanguageConfirmed'
      | 'conversationLanguage'
    >
  >,
) {
  return {
    isOwner: true,
    isCurrentUser: true,
    conversationLanguageConfirmed: false,
    conversationLanguage: 'en',
    ...overrides,
  };
}

describe('shouldRequireFirstMentorLanguageConfirmation', () => {
  it.each([
    ['self-created owner', profile({ isOwner: true }), true],
    [
      'parent-created child before credentials',
      profile({ isOwner: false, isCurrentUser: false }),
      false,
    ],
    [
      'joined credentialed learner',
      profile({ isOwner: false, isCurrentUser: true }),
      true,
    ],
    [
      'existing learner with completed language',
      profile({
        isOwner: false,
        isCurrentUser: true,
        conversationLanguageConfirmed: true,
      }),
      false,
    ],
  ])('%s → confirmation required=%s', (_variant, activeProfile, expected) => {
    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile,
        isExplicitProxyMode: false,
      }),
    ).toBe(expected);
  });

  it('never grants a proxy or wrong-target session a self-write gate', () => {
    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile: profile({ isCurrentUser: true }),
        isExplicitProxyMode: true,
      }),
    ).toBe(false);
    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile: profile({ isCurrentUser: false }),
        isExplicitProxyMode: false,
      }),
    ).toBe(false);
  });

  it('gates an unconfirmed managed child when they first gain their own credential', () => {
    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile: profile({
          isOwner: false,
          isCurrentUser: true,
          conversationLanguageConfirmed: false,
        }),
        isExplicitProxyMode: false,
      }),
    ).toBe(true);
  });

  it('resumes after relaunch until the server reports durable confirmation', () => {
    const beforeConfirmation = profile({
      conversationLanguage: 'cs',
      conversationLanguageConfirmed: false,
    });
    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile: beforeConfirmation,
        isExplicitProxyMode: false,
      }),
    ).toBe(true);

    expect(
      shouldRequireFirstMentorLanguageConfirmation({
        activeProfile: {
          ...beforeConfirmation,
          conversationLanguageConfirmed: true,
        },
        isExplicitProxyMode: false,
      }),
    ).toBe(false);
    expect(
      resolveLanguageVoiceLocale({
        activeSubject: { pedagogyMode: 'socratic' },
        conversationLanguage: 'cs',
      }),
    ).toBe('cs-CZ');
  });
});
