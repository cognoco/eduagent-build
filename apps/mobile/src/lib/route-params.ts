/**
 * Expo Router's `useLocalSearchParams` returns `string | string[]` when the
 * same query-string key appears multiple times in the URL — for example,
 * `?imageUri=a&imageUri=b` produces an array, not a string. TypeScript's
 * generic on `useLocalSearchParams<T>` widens this away, so callers receive
 * `string | undefined` from the type system but may receive `string[]` at
 * runtime. APIs that expect a single string (FileSystem.readAsStringAsync,
 * URL parsers, etc.) silently misbehave on an array.
 *
 * `firstParam` normalises this pre-emptively: callers who only support a
 * single value should pass route params through this helper.
 *
 * [BUG-635] session/index.tsx used `imageUri` as a string in
 * FileSystem.readAsStringAsync; an array value would be coerced to its
 * comma-joined string and fail at the OS layer with no useful error.
 */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
