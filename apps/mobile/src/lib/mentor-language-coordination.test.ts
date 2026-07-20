import * as ExpoSecureStore from 'expo-secure-store';

import {
  beginExplicitMentorLanguageUpdate,
  clearMentorLanguageCoordination,
  completeExplicitMentorLanguageUpdate,
  failExplicitMentorLanguageUpdate,
  shouldSuppressMentorLanguageAutoSync,
} from './mentor-language-coordination';

describe('Mentor-language explicit coordination', () => {
  afterEach(() => {
    clearMentorLanguageCoordination(['overlap-profile']);
  });

  it('keeps an earlier successful explicit save latched when a concurrent save fails later', async () => {
    const successful = beginExplicitMentorLanguageUpdate('overlap-profile');
    const failing = beginExplicitMentorLanguageUpdate('overlap-profile');

    await completeExplicitMentorLanguageUpdate(successful);
    failExplicitMentorLanguageUpdate(failing);

    await expect(
      shouldSuppressMentorLanguageAutoSync('overlap-profile'),
    ).resolves.toBe(true);
    await expect(
      ExpoSecureStore.getItemAsync(
        'mentorLanguageExplicitOverride_overlap-profile',
      ),
    ).resolves.toBe('true');
  });
});
