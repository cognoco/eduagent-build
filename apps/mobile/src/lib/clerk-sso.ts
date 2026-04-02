export type SupportedSSOStrategy =
  | 'oauth_google'
  | 'oauth_apple'
  | `oauth_custom_${string}`;

export function getOpenAISSOStrategy():
  | `oauth_custom_${string}`
  | null {
  const key = process.env.EXPO_PUBLIC_CLERK_OPENAI_SSO_KEY?.trim();
  if (!key) return null;
  return `oauth_custom_${key}`;
}
