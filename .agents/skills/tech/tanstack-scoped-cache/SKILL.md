---
name: tanstack-scoped-cache
description: >
  Prevent cross-identity data bleed in TanStack Query — scoping query keys to
  the active identity, resetting the cache on identity switch, and keying the
  persister so one user/profile/tenant never sees another's cached or
  disk-persisted data. Use when an app switches between users/profiles/tenants
  without a full reload, when query keys omit the identity, or when react-query
  cache is persisted to disk/storage. Companion to the tanstack-query skill
  (key hygiene, persistence mechanics); this covers the SECURITY dimension.
  Triggers on: "profile switch", "account switch", "multi-tenant cache",
  "cache leak", "stale cache after logout", persistQueryClient, buster,
  removeQueries, queryClient.clear, identity-scoped query keys.
license: MIT
user-invocable: false
metadata:
  tags: tanstack-query, react-query, cache, multi-tenant, persistence, security, data-isolation, profile-switch
---

# TanStack Scoped Cache

**IMPORTANT:** Verify exact TanStack Query v5 APIs (`persistQueryClient`, `buster`,
`removeQueries`/`clear`/`resetQueries`) against
`https://tanstack.com/query/v5/docs` before writing — the persistence plugin API in
particular has changed across versions. This skill assumes the key-hygiene rules from the
`tanstack-query` skill (`qk-factory-pattern`, key serializability) and adds the dimension
that pack omits: **keeping one identity's cached data from reaching another.**

## The failure this prevents

The query cache is keyed memory (and, with a persister, keyed *disk*). When an app switches
the active identity — user, profile, tenant, workspace — **without a full reload**, three
leaks are possible:

1. **In-memory bleed:** identity A's cached `['todos']` is served to identity B because the
   key didn't include the identity. B sees A's data for a flash, or until refetch.
2. **Persisted bleed:** with a persister (AsyncStorage / localStorage / IndexedDB), A's data
   is written to disk and **survives logout and app restart**, then rehydrates under B.
3. **Write to the wrong identity:** a mutation fired during/after a switch lands a
   `setQueryData` keyed without identity onto whoever is now active.

This is a real data-isolation boundary, not a UX nicety — in a multi-user or
parent/child/tenant app it's cross-account disclosure.

## Three controls, all required together

Each closes a different leak; any one alone is insufficient.

| Control | Closes | Mechanism |
|---|---|---|
| 1. Identity in the key | in-memory bleed | every key carries the active identity |
| 2. Reset on switch | leftover/in-flight bleed | clear the cache when identity changes |
| 3. Persister keyed to identity | disk bleed across restart | `buster` (or storage key) includes the identity |

### Control 1 — the active identity is part of every key

Put the identity at the **front** of the key, via the key factory, so it can never be
forgotten per-call. No query key for identity-scoped data may exist without it.

```typescript
// ❌ leaks across identities — nothing distinguishes A's todos from B's
const todos = (filter) => ['todos', filter] as const

// ✅ identity is structurally part of the key
const keys = {
  all: (identityId: string) => [identityId, 'todos'] as const,
  list: (identityId: string, filter: string) => [identityId, 'todos', 'list', filter] as const,
}
useQuery({ queryKey: keys.list(activeId, filter), queryFn: () => fetchTodos(filter) })
```

Putting identity *first* also makes bulk invalidation by identity a cheap prefix match:
`queryClient.removeQueries({ queryKey: [previousId] })`.

### Control 2 — reset the cache when the identity changes

Identity-in-the-key prevents *serving* A's data under B's key, but A's entries still sit in
memory (and a switch can leave an in-flight A request that resolves under B). On every
switch — and on logout — actively clear:

```typescript
async function onIdentitySwitch(previousId: string) {
  await queryClient.cancelQueries()                            // stop in-flight A requests
  queryClient.removeQueries({ queryKey: [previousId] })        // drop A's cached data
  // or, simplest and safest on logout / full switch:
  queryClient.clear()                                          // wipe everything; refetch under B
}
```

Prefer `clear()` for logout and for switches where any shared/unscoped keys might exist —
it's the conservative choice. Use targeted `removeQueries({ queryKey: [previousId] })` only
when you're certain every identity-scoped key is prefixed and you want to keep
identity-agnostic caches warm.

### Control 3 — key the persister to the identity

A persister writes the cache to durable storage. Without identity-keying, A's data persists
across logout and rehydrates under B on next launch. Bind the persisted blob to the identity
with `buster` (a mismatched buster causes the persisted cache to be discarded, not loaded):

```typescript
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister,
    buster: `identity-${activeId}`,   // B's launch finds A's buster → discards A's disk cache
  }}
  onSuccess={() => queryClient.resumePausedMutations()}
>
  {children}
</PersistQueryClientProvider>
```

Two hardening notes:
- **Clear persisted storage on logout**, don't just rely on buster — call the persister's
  removal path (or `persistQueryClientSave` after a `clear()`), so the bytes aren't left at
  rest on the device.
- **Don't persist sensitive identity-scoped queries you don't need offline.** Use
  `dehydrateOptions.shouldDehydrateQuery` to allowlist what reaches disk; the safest data is
  the data you never wrote down.

## Mutations during a switch

A mutation that calls `setQueryData`/`invalidateQueries` must target the **identity it was
issued for**, captured at call time — not "whoever is active when it resolves." Capture the
identity in the mutation closure and include it in the key you write:

```typescript
const mutate = useMutation({
  mutationFn: (input) => save(input),
  onSuccess: (_d, _v, _c) => {
    queryClient.invalidateQueries({ queryKey: keys.all(issuedForId) })  // the id it was issued under
  },
})
```

## Review checklist

- [ ] Does every identity-scoped query key include the active identity (via the factory),
      with identity as the **first** key segment?
- [ ] Is there a switch/logout handler that `cancelQueries()` then `removeQueries({queryKey:[prevId]})`
      or `clear()`s the cache?
- [ ] If a persister is used, is `buster` (or the storage key) bound to the identity?
- [ ] On logout, is persisted storage actually cleared — not just buster-mismatched?
- [ ] Are only the needed queries persisted (allowlist via `shouldDehydrateQuery`), excluding
      sensitive identity data that doesn't need offline support?
- [ ] Do mutation success/invalidation callbacks target the identity captured at issue time,
      not the currently-active one?

## Why all three

Identity-in-key alone still leaves A's data in memory and on disk. Reset-on-switch alone
still lets an unkeyed write land on the wrong identity. Persister-keying alone still flashes
A's in-memory data under B before the next fetch. The isolation boundary holds only when the
key carries identity, the cache is reset on switch, and the persisted copy is identity-bound.
