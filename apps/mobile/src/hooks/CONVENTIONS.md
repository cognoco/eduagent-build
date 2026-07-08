# Mobile Hook Conventions

## Data Hooks

- Keep return shapes stable by default. Do not return fresh inline object literals from hooks; use `useMemo`, or move shaping into `useApiQuery` `select` when the value is derived from server data.
- Use `queryKeys` from `apps/mobile/src/lib/query-keys.ts` for TanStack Query keys. New hooks should not introduce inline query-key literals.
- Parse server responses at the trust boundary. For schema-backed responses, call the relevant Zod schema `.parse()` in `select` or immediately after `res.json()`.
- Use `useApiQuery` for new single-GET hooks unless the hook needs TanStack behavior that `useApiQuery` cannot express, such as infinite queries or custom retry/replay state.
- Keep tests co-located with the hook file. Do not create `__tests__/` directories.
