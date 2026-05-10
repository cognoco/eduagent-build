import * as SecureStore from './secure-storage';

/**
 * One-time migration: reads a value from `oldKey`, writes it to `newKey`,
 * then deletes `oldKey`. No-ops if `oldKey` doesn't exist or `newKey`
 * already has a value.
 *
 * Background: SecureStore keys were changed from colon-delimited
 * (e.g. `rating-recall-success-count:profileId`) to dash-delimited
 * (e.g. `rating-recall-success-count-profileId`) because colons caused
 * `Invalid key` crashes on some Android devices. This helper ensures
 * existing users don't lose accumulated data after the key rename.
 */
export async function migrateSecureStoreKey(
  oldKey: string,
  newKey: string,
): Promise<void> {
  try {
    // Don't overwrite if new key already has data
    const existing = await SecureStore.getItemAsync(newKey);
    if (existing !== null) return;

    const oldValue = await SecureStore.getItemAsync(oldKey);
    if (oldValue === null) return;

    await SecureStore.setItemAsync(newKey, oldValue);
    await SecureStore.deleteItemAsync(oldKey);
  } catch {
    // SecureStore may throw on invalid old key (the reason we're migrating).
    // Swallow — user simply starts fresh, which matches their pre-fix experience.
  }
}
