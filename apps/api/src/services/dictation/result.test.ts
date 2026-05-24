import { deriveLegacyDictationCompletionKey } from './result';

describe('deriveLegacyDictationCompletionKey', () => {
  it('[WI-84 review] derives the legacy idempotency key in the dictation service layer', () => {
    expect(
      deriveLegacyDictationCompletionKey(
        'test-profile-id',
        '2026-05-23',
        'homework',
      ),
    ).toBe('6630bdff-7515-52b1-ba8d-068e42bbc099');
  });
});
