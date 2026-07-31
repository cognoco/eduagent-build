import type { Profile } from '@eduagent/schemas';

export function shouldRequireFirstMentorLanguageConfirmation({
  activeProfile,
  isExplicitProxyMode,
}: {
  activeProfile:
    | Pick<Profile, 'isCurrentUser' | 'conversationLanguageConfirmed'>
    | null
    | undefined;
  isExplicitProxyMode: boolean;
}): boolean {
  return Boolean(
    activeProfile?.isCurrentUser === true &&
    activeProfile.conversationLanguageConfirmed === false &&
    !isExplicitProxyMode,
  );
}
