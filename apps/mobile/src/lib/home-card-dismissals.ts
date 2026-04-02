import * as SecureStore from 'expo-secure-store';

export type HomeCardDismissals = Record<string, number>;

function getHomeCardDismissalKey(profileId: string): string {
  return `home-card-dismissals-${profileId}`;
}

export async function readHomeCardDismissals(
  profileId: string
): Promise<HomeCardDismissals> {
  const raw = await SecureStore.getItemAsync(
    getHomeCardDismissalKey(profileId)
  );
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    );
  } catch {
    return {};
  }
}

export async function incrementHomeCardDismissal(
  profileId: string,
  cardId: string
): Promise<HomeCardDismissals> {
  const current = await readHomeCardDismissals(profileId);
  const next = {
    ...current,
    [cardId]: (current[cardId] ?? 0) + 1,
  };
  await SecureStore.setItemAsync(
    getHomeCardDismissalKey(profileId),
    JSON.stringify(next)
  );
  return next;
}
