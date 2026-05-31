---
name: drizzle-atomicity
description: >
  Concurrency-safe writes with Drizzle ORM — transactions, atomic upserts,
  and row/advisory locks that prevent check-then-write races, lost updates,
  and non-atomic multi-step persistence. Use when writing or reviewing Drizzle
  code that reads-then-writes, increments counters, enforces idempotency/event
  ordering, does insert-or-update, or coordinates multiple writes that must
  succeed together. Triggers on: db.transaction, tx, onConflictDoUpdate,
  onConflictDoNothing, .for('update'), "race condition", "atomic", "upsert",
  "lost update", "idempotency", "check-then-write". Baseline: drizzle-orm
  PostgreSQL dialect.
license: MIT
user-invocable: false
metadata:
  tags: drizzle, postgres, transactions, concurrency, atomicity, upsert, locking, idempotency
---

# Drizzle Atomicity

**IMPORTANT:** Drizzle's API for transactions, upserts, and locking changes between
versions, and some lock options have known bugs. Verify exact signatures against the
official docs before writing — `https://orm.drizzle.team/docs/transactions`,
`.../docs/insert`, `.../docs/select` (the `.for()` section). Prefer retrieval over
memorized syntax.

This skill is about **correctness under concurrency**, not query ergonomics. Its single
thesis: **any "read a value, decide, then write" sequence is a race unless the read and
the write are made atomic** — by a transaction, an atomic SQL expression, a lock, or a
DB constraint. Two requests interleaving between your read and your write is the default,
not the edge case.

## The failure this prevents

```
Request A: read balance = 100
Request B: read balance = 100
Request A: write balance = 100 - 30  → 70
Request B: write balance = 100 - 50  → 50   ❌ A's deduction is lost
```

The same shape underlies: quota/credit decrements, streak/score counters, "first one
wins" inserts, idempotency-key claims, webhook event-ordering guards, and
read-modify-write of a JSON column. All are lost-update or check-then-write races.

## Four tools, in order of preference

Prefer the **lowest-coordination** tool that closes the race. Reach for a transaction
only when a single atomic statement can't express the operation.

| # | Tool | Use when | Cost |
|---|------|----------|------|
| 1 | **Atomic SQL expression** (`set: { n: sql\`n + 1\` }`, `onConflictDoUpdate`) | A single write *is* the whole operation | Lowest — one round trip, no lock held in app code |
| 2 | **DB constraint** (unique index, CHECK) | "Only one row may exist" / "value must stay in range" | Lowest — the DB rejects the violator |
| 3 | **Row lock** (`.for('update')`) inside a transaction | You must read a specific row, decide, then write it | Medium — holds a row lock for the txn |
| 4 | **Advisory lock** (`pg_advisory_xact_lock`) | Serialize a critical section not tied to one row (e.g. allocate next sort-order) | Medium — serializes all holders of the key |

### 1. Atomic expression — don't read to compute, compute in SQL

```typescript
// ❌ Race: read then write
const row = await db.select().from(counters).where(eq(counters.id, id))
await db.update(counters).set({ value: row[0].value + 1 }).where(eq(counters.id, id))

// ✅ Atomic: the increment happens in the database, no read
await db.update(counters)
  .set({ value: sql`${counters.value} + 1` })
  .where(eq(counters.id, id))

// ✅ Guarded decrement — never goes below zero, in one statement
await db.update(quota)
  .set({ remaining: sql`GREATEST(${quota.remaining} - ${cost}, 0)` })
  .where(and(eq(quota.id, id), gte(quota.remaining, cost)))   // WHERE makes "had enough" atomic
```

### 1b. Atomic upsert — insert-or-update without a pre-check

```typescript
// ❌ Race: SELECT to see if it exists, then INSERT or UPDATE — two requests both SELECT empty
// ✅ Atomic upsert
await db.insert(dailyStats)
  .values({ profileId, day, count: 1 })
  .onConflictDoUpdate({
    target: [dailyStats.profileId, dailyStats.day],   // must match a UNIQUE constraint/index
    set: { count: sql`${dailyStats.count} + 1` },      // reference the table, or sql`excluded.col`
  })

// "claim if absent, no-op if present" — the canonical idempotency-key / first-writer-wins primitive
const claimed = await db.insert(idempotencyKeys)
  .values({ key, claimedAt: now })
  .onConflictDoNothing({ target: idempotencyKeys.key })
  .returning()
if (claimed.length === 0) return { status: "replay" }   // someone else already claimed it
```

> `onConflictDoUpdate` requires a real UNIQUE constraint or index on the `target`
> columns. Without it the conflict never fires and the upsert silently degrades to a
> plain insert that errors or duplicates. Confirm the constraint exists.

### 2. Let a constraint be the backstop

A unique index turns "only one may exist" from an application check (racy) into a database
guarantee (atomic). Catch the unique-violation and treat it as "lost the race" rather than
SELECT-ing first. Constraints also protect against the writer you forgot.

### 3. Row lock for genuine read-decide-write

When the decision needs the current row and can't be folded into one statement, lock the
row **inside a transaction** with `.for('update')` so a concurrent txn blocks until you commit:

```typescript
await db.transaction(async (tx) => {
  const [sub] = await tx.select().from(subscriptions)
    .where(eq(subscriptions.id, id))
    .for('update')                       // SELECT ... FOR UPDATE — concurrent txns wait here

  if (eventTimestamp <= sub.lastEventAt) return   // stale/replayed event — ordering guard, now race-free
  await tx.update(subscriptions)
    .set({ status, lastEventAt: eventTimestamp })
    .where(eq(subscriptions.id, id))
})
// `.for('update', { skipLocked: true })` to skip locked rows (queue/worker pickup).
// Avoid the noWait option on affected versions — it has emitted invalid SQL ("NO WAIT"
// vs "NOWAIT"); verify against your installed version before using it.
```

The ordering/idempotency check and the write **must be in the same transaction as the
lock**. A check-then-write split across two statements with no lock is exactly the race —
moving it inside a txn without `.for('update')` does not help, because plain SELECT takes
no lock.

### 4. Advisory lock for keyed critical sections

When the thing to serialize isn't a single existing row — allocating the next sort order,
a one-at-a-time backfill — take a transaction-scoped advisory lock. It releases
automatically on commit/rollback (no leak):

```typescript
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`)  // serializes all holders of lockKey
  const [{ max }] = await tx.select({ max: sql<number>`COALESCE(MAX(${books.sortOrder}), 0)` })
    .from(books).where(eq(books.subjectId, subjectId))
  await tx.insert(books).values({ subjectId, sortOrder: max + 1, ... })
})
```

## Transaction discipline

- **Use `tx`, never `db`, inside the callback.** A `db.*` call inside a
  `db.transaction(async (tx) => …)` block runs on a *different* connection, outside the
  transaction — so it neither sees uncommitted rows nor rolls back. This silently defeats
  atomicity and is easy to miss in review.

  ```typescript
  await db.transaction(async (tx) => {
    await tx.insert(orders).values(order)       // ✅ in the transaction
    await db.insert(audit).values(entry)        // ❌ NOT in the transaction — won't roll back
  })
  ```

- **All-or-nothing multi-write belongs in one transaction.** If two writes must both land
  or both revert (subscription + quota pool, consent denial + profile deletion), do them
  in a single `db.transaction`. Throwing inside the callback (or calling `tx.rollback()`)
  reverts every write in it.

- **Roll back by throwing.** `tx.rollback()` throws to unwind; an uncaught error in the
  callback also rolls the whole transaction back. Don't swallow errors inside a txn and
  continue — you'll commit a partial state.

- **Don't await unrelated slow work inside a transaction.** An external HTTP/LLM call
  while a row lock or advisory lock is held pins a DB connection and serializes everyone
  behind you. Do the slow work first, then open a short transaction for the writes.

## Review checklist

- [ ] Any `select(...)` whose result is used to compute the value of a later `update(...)`
      on the same rows → fold into one atomic SQL expression, or wrap in a txn with
      `.for('update')`.
- [ ] Any "does it exist? then insert : update" → `onConflictDoUpdate` /
      `onConflictDoNothing` against a real unique constraint.
- [ ] Counter/quota/score `+`/`-` computed in JS then written → move the arithmetic into
      `sql\`col ± n\``; add a `WHERE` guard for floors/ceilings.
- [ ] Idempotency / event-ordering guard that reads a "last seen" value then writes →
      lock the row (`.for('update')`) in the same txn, or enforce via unique key.
- [ ] Multiple writes that must all-or-nothing → single `db.transaction`, using `tx`.
- [ ] Any `db.*` (not `tx.*`) call inside a `transaction` callback → bug; switch to `tx`.
- [ ] Lock or transaction held across an external/LLM call → restructure so the slow work
      is outside the lock.
