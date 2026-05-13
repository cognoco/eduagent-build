# Interaction Durability — Layer 1: Mobile Outbox + Idempotency Pre-flight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every chat-style send durable on the device the moment Send is pressed, with server-side `(profileId, client_id)` dedupe so the device can safely retry without producing duplicate persisted messages.

**Architecture (revised after adversarial review 2026-05-01):**
- **Mobile** writes the message to an AsyncStorage outbox keyed by `(profileId, flow)` BEFORE issuing the SSE call, attaches the entry's id as `Idempotency-Key`, deletes the entry on `done` SSE frame OR on `Idempotency-Replay: true` response, and replays remaining entries on app launch.
- **Server** has TWO layers of dedupe (defence in depth, with the DB as source of truth):
  1. **KV-backed pre-flight middleware** — fast path: if `(profileId, client_id)` is in KV, short-circuit with HTTP 200 `{ replayed: true, clientId, status: 'persisted', assistantTurnReady: boolean, latestExchangeId: string | null }` and `Idempotency-Replay: true` header. Mobile uses `assistantTurnReady` to decide whether to render immediately or refetch + poll until the assistant turn lands. **The middleware does NOT cache SSE response bodies** — it never tries to "replay the original answer". The retry simply re-runs the LLM if the request slipped past KV.
  2. **DB unique index on `session_events (session_id, client_id) WHERE client_id IS NOT NULL`** — authoritative dedupe. The user-message persistence path uses `INSERT ... ON CONFLICT DO NOTHING` and the persisted-row count is the contract. Same-shape dedupe is added for `onboardingDrafts.exchangeHistory[]` JSONB array writes via array-scan-before-append.
- **Spillover** — after 3 unsuccessful replays the mobile escalates to `/support/outbox-spillover` from a TOP-LEVEL drain effect (not banner-conditional) so messages cannot get permanently stranded if the user never sees the failed-send UI.

**Tech Stack:** Hono pre-flight middleware (Cloudflare Workers KV — TTL 24 h, used as fast-path hint only), Drizzle migrations (additive — new column + new table), AsyncStorage on mobile (NOT SecureStore — outbox content is not secret and SecureStore has size limits), per-`(profileId, flow)` async mutex for AsyncStorage read-modify-write, Jest for unit/integration tests, Maestro for the offline-replay break test, Sentry for failure capture **and** structured metric events for visibility (per CLAUDE.md "silent recovery without escalation is banned").

**Spec:** `docs/specs/2026-05-01-interaction-durability.md` — Layer 1 scope. **Finding ID:** `[INTERACTION-DUR-L1]`. **Driver bug:** `SUBJECT-09` (full fix lands in Layer 3; Layer 1 is the device-side defence + write-side dedupe).

**Branching strategy:** ONE branch (`interaction-durability-l1`), ONE PR, with EXPLICIT staging-green gates between commits where the deploy ordering matters (Tasks 1 and 2 both require staging-green before the next task lands). This replaces the original plan's contradictory "three PRs from one branch" instruction. Per `feedback_never_switch_branch.md` we do not switch branches mid-plan; per CLAUDE.md schema-and-deploy-safety we explicitly wait for the migration to apply before code that depends on it ships.

**Failure-modes table:** Lives in the spec — every Layer 1 state has a row covering trigger, what the user sees, and recovery. The plan tasks are derived from those rows. If a row's recovery is unspecified the plan stops here; do not improvise.

---

## Pre-flight

- Run `git status` first. The plan touches three packages (`apps/api`, `apps/mobile`, `packages/schemas`); start from a clean tree so each task's commit is reviewable.
- This plan adds a new Cloudflare KV namespace (`IDEMPOTENCY_KV`). The binding lands first (Task 1) and is deployed to staging BEFORE Task 3 (the middleware that reads it) commits.
- This plan does NOT introduce any new prod LLM calls and does NOT change any prompt. `pnpm eval:llm` is recommended at final validation as a regression sanity check but is not gating.
- The mobile outbox uses **AsyncStorage**, not SecureStore: outbox content is not secret, and we expect entries up to a few KB each which would push SecureStore limits on iOS.
- Confirm `generateUUIDv7` exists at `packages/database/src/utils/uuid.ts` (it does, verified). If not, swap to `crypto.randomUUID()`.

---

## Rollback

Layer 1 is purely additive — no columns dropped, no tables dropped, no behaviour removed. Revert procedure:
1. Revert the merge commit on `main`.
2. Drop the additive column: `ALTER TABLE session_events DROP COLUMN client_id;` (and its partial unique index, which drops with the column).
3. Drop the new table: `DROP TABLE support_messages;`.
4. Delete the KV namespace via `wrangler kv namespace delete IDEMPOTENCY_KV` (optional — empty KV is harmless).

Data loss on rollback: zero. The new column is nullable and the new table is greenfield.

---

## File Structure

| Status | File | Role |
|--------|------|------|
| **Modify** | `apps/api/wrangler.toml` | Add `IDEMPOTENCY_KV` namespace binding |
| **Modify** | `apps/api/src/index.ts` (Bindings type) | Add `IDEMPOTENCY_KV?: KVNamespace` |
| **Create** | `apps/api/drizzle/0045_session_events_client_id.sql` | Add `client_id text` + partial unique index to `session_events` |
| **Modify** | `packages/database/src/schema/sessions.ts` | Add `clientId` column + unique index to `sessionEvents` |
| **Modify** | `packages/schemas/src/sessions.ts` | Extend `ExchangeEntry` with optional `client_id` (shared between server & onboardingDrafts.exchangeHistory) |
| **Create** | `apps/api/src/middleware/idempotency.ts` | KV-backed pre-flight middleware — short-circuits on KV hit; never caches SSE bodies |
| **Create** | `apps/api/src/middleware/idempotency.test.ts` | Unit tests — pre-flight hit, miss, no-key, profile scope, KV/profile missing; replay-hit with assistant turn ready/pending; lookup error degrades gracefully |
| **Create** | `apps/api/src/services/idempotency-marker.ts` | Helper that handlers call AFTER successful persist to mark KV (decoupled from middleware lifecycle) |
| **Create** | `apps/api/src/services/idempotency-assistant-state.ts` | `lookupAssistantTurnState(c, flow, key)` — cheap DB check to populate `assistantTurnReady` + `latestExchangeId` on replay responses |
| **Create** | `apps/api/src/services/idempotency-assistant-state.test.ts` | Unit/integration tests for the assistant-turn lookup helper — covers both flows, error degradation, null exchange case |
| **Modify** | `apps/api/src/services/session/session-exchange.ts` | Use `INSERT ... ON CONFLICT DO NOTHING` on `(session_id, client_id)` when client_id is present; return whether row was actually inserted |
| **Modify** | `apps/api/src/services/onboarding/exchange-history-writer.ts` (or equivalent) | Array-scan-before-append on `exchangeHistory[]`; skip if `client_id` already present |
| **Modify** | `apps/api/src/routes/interview.ts` | Mount idempotency middleware on `/interview/stream` and `/interview/complete`; thread `clientId` into persistence; call `markPersisted` on success |
| **Modify** | `apps/api/src/routes/sessions.ts` | Same wiring for the live-tutoring streaming endpoint |
| **Create** | `apps/api/src/routes/interview.idempotency.test.ts` | Integration test: same `Idempotency-Key` posted twice → exactly one `session_events` row + second response carries `Idempotency-Replay: true` |
| **Create** | `apps/api/drizzle/0046_support_messages.sql` | New `support_messages` table for spillover writes |
| **Modify** | `packages/database/src/schema/support.ts` (new file) | Drizzle table definition for `supportMessages` |
| **Modify** | `packages/database/src/schema/index.ts` | Export `supportMessages` |
| **Create** | `apps/api/src/routes/support.ts` | `POST /support/outbox-spillover` — accept array of stranded entries with onConflictDoNothing |
| **Create** | `apps/api/src/routes/support.test.ts` | Integration tests including real-DB dedupe on duplicate client_id |
| **Modify** | `apps/api/src/index.ts` (router registration) | Mount the new `support` router |
| **Create** | `apps/mobile/src/lib/async-mutex.ts` | Tiny per-key async mutex (Promise-chain) |
| **Create** | `apps/mobile/src/lib/async-mutex.test.ts` | Unit tests — interleaved acquire/release ordering |
| **Create** | `apps/mobile/src/lib/message-outbox.ts` | Outbox lifecycle: `enqueue`, `markConfirmed`, `recordFailure`, `drain`, `escalate`, `deletePermanentlyFailed` — all guarded by the mutex |
| **Create** | `apps/mobile/src/lib/message-outbox.test.ts` | Unit tests — lifecycle, oldest-first ordering, attempt counting, concurrency safety, mid-write crash recovery |
| **Modify** | `apps/mobile/src/lib/api-client.ts` | `withIdempotencyKey` helper + response classifier that detects `Idempotency-Replay: true` |
| **Modify** | `apps/mobile/src/hooks/use-interview.ts` | Wire outbox enqueue → SSE call (with `Idempotency-Key` header) → confirm/fail; accept `existingEntry` param for replay path |
| **Modify** | `apps/mobile/src/components/session/use-session-actions.ts` | Same wiring for live tutoring |
| **Create** | `apps/mobile/src/providers/OutboxDrainProvider.tsx` | Top-level provider that drains pending entries AND triggers `escalate` on app launch (not banner-conditional) |
| **Modify** | `apps/mobile/app/_layout.tsx` (or equivalent root) | Mount `OutboxDrainProvider` |
| **Create** | `apps/mobile/src/components/durability/OutboxFailedBanner.tsx` | Inline banner for `permanently-failed` entries — copy-to-clipboard UX |
| **Create** | `apps/mobile/src/components/durability/OutboxFailedBanner.test.tsx` | Component tests |
| **Create** | `apps/mobile/.maestro/durability/outbox-replay.yaml` | Maestro break test — turn off network mid-send, force-quit, restart, assert replay |
| **Modify** | `apps/mobile/src/components/session/MessageComposer.tsx` (or equivalent) | Add `testID="outbox-pending-indicator"` to the optimistic message bubble for the Maestro flow |

---

## Task 1: Provision KV namespace + Bindings type (deploy-first checkpoint)

**Files:**
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/src/index.ts` (Bindings)

This task lands first and waits for staging-green BEFORE Task 3 commits. The middleware introduced in Task 3 reads `c.env.IDEMPOTENCY_KV` — if the binding doesn't exist at runtime the middleware skips silently AND emits a Sentry breadcrumb (Task 3 step 3), so a missed deploy degrades safely, but we still want the binding live before the dependent code lands.

- [ ] **Step 1: Create the KV namespace via wrangler**

```bash
cd apps/api
pnpm exec wrangler kv namespace create IDEMPOTENCY_KV
pnpm exec wrangler kv namespace create IDEMPOTENCY_KV --preview
```

Expected output: two `id = "..."` lines for production and preview. Copy both.

- [ ] **Step 2: Add the binding to `wrangler.toml`**

Append to the `[[kv_namespaces]]` block (use the IDs from Step 1):

```toml
[[kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "<paste production id from step 1>"
preview_id = "<paste preview id from step 1>"
```

- [ ] **Step 3: Add the binding to the `Bindings` type**

In `apps/api/src/index.ts` find the `Bindings` type (around line 78). Add after the `SUBSCRIPTION_KV` line:

```typescript
SUBSCRIPTION_KV?: KVNamespace;
IDEMPOTENCY_KV?: KVNamespace;
```

- [ ] **Step 4: Verify typecheck and commit**

```bash
pnpm exec nx run api:typecheck
git add apps/api/wrangler.toml apps/api/src/index.ts
git commit -m "infra(api): add IDEMPOTENCY_KV binding [INTERACTION-DUR-L1]"
git push
```

- [ ] **Step 5: Wait for staging deploy to confirm binding is live**

```bash
gh run list --branch interaction-durability-l1 --limit 5
```

Wait for the staging deploy workflow to go green. Do NOT proceed to Task 3 until the binding is live in staging. (Task 2 — schema — can be worked on in parallel since it does not depend on the KV binding.)

---

## Task 2: Schema migration — `client_id` on `session_events` + `ExchangeEntry`

**Files:**
- Create: `apps/api/drizzle/0045_session_events_client_id.sql`
- Modify: `packages/database/src/schema/sessions.ts`
- Modify: `packages/schemas/src/sessions.ts`

This is a **schema-first commit** per CLAUDE.md → "schema migration … is deployed before the code PR". The column is additive and nullable; no backfill needed. The partial unique index makes the DB the **authoritative dedupe layer** — KV is just a fast-path hint above it.

- [ ] **Step 1: Generate the migration file**

Create `apps/api/drizzle/0045_session_events_client_id.sql`:

```sql
-- Migration: add client_id to session_events for mobile-originated idempotency.
-- Nullable to preserve all existing rows. The partial unique index on
-- (session_id, client_id) WHERE client_id IS NOT NULL is the AUTHORITATIVE
-- dedupe for the mobile outbox / Idempotency-Key flow. KV is a fast-path
-- hint above this index but does not replace it (KV is eventually consistent
-- with up to ~60s replication lag globally).

ALTER TABLE "session_events"
  ADD COLUMN "client_id" text;

CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
```

- [ ] **Step 2: Regenerate the snapshot BEFORE applying to dev**

Per `project_dev_schema_drift_trap.md`, regenerate the Drizzle snapshot first to avoid drift:

```bash
pnpm run db:generate
```

This should produce a new entry under `apps/api/drizzle/meta/`. Inspect the diff — only `session_events` should be touched.

- [ ] **Step 3: Add the column to the Drizzle schema**

In `packages/database/src/schema/sessions.ts` find the `sessionEvents` pgTable definition. Add a new column at the end of the columns block:

```typescript
clientId: text('client_id'),
```

If the table has an inline `(table) => [...]` index block, add (alongside existing indexes):

```typescript
uniqueIndex('session_events_session_client_id_uniq')
  .on(table.sessionId, table.clientId)
  .where(sql`${table.clientId} IS NOT NULL`),
```

If `uniqueIndex` and `sql` are not yet imported, add them:

```typescript
import { sql } from 'drizzle-orm';
import { uniqueIndex } from 'drizzle-orm/pg-core';
```

- [ ] **Step 4: Extend `ExchangeEntry` schema**

In `packages/schemas/src/sessions.ts` find the existing `ExchangeEntry` schema (search for `'user' | 'assistant'`). Replace with the zod-derived form below so consumers get runtime validation. Keep the `client_id` field optional and snake_case on the wire (matches JSONB column convention) — the consumer code that maps to camelCase TypeScript stays in the writer layer.

```typescript
export const exchangeEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** Mobile-side ULID. Used as Idempotency-Key on the wire and for server-side
   *  dedupe in onboardingDrafts.exchangeHistory[] (array-scan-before-append). */
  client_id: z.string().min(1).max(128).optional(),
});

export type ExchangeEntry = z.infer<typeof exchangeEntrySchema>;
```

- [ ] **Step 5: Apply migration to dev DB**

```bash
pnpm run db:push:dev
```

Expected: applies cleanly.

- [ ] **Step 6: Run typecheck across all touched packages**

```bash
pnpm exec nx run-many -t typecheck --projects=api,@eduagent/database,@eduagent/schemas
```

Expected: PASS.

- [ ] **Step 7: Run integration tests that touch session_events**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/routes/sessions.ts src/services/session/session-exchange.ts --no-coverage
```

Expected: all PASS. The migration is additive; nothing should break.

- [ ] **Step 8: Commit and push (schema-first commit)**

```bash
git add apps/api/drizzle/0045_session_events_client_id.sql apps/api/drizzle/meta/ packages/database/src/schema/sessions.ts packages/schemas/src/sessions.ts
git commit -m "feat(schemas): add client_id to session_events + ExchangeEntry [INTERACTION-DUR-L1]"
git push
```

- [ ] **Step 9: Wait for staging migration to apply**

```bash
gh run list --branch interaction-durability-l1 --limit 5
```

Confirm the migration step shows green in the staging deploy. Do NOT proceed to Task 4 (which uses the new column from server code) until staging schema is current.

---

## Task 3: Idempotency PRE-FLIGHT middleware (TDD)

**Files:**
- Create: `apps/api/src/middleware/idempotency.ts`
- Create: `apps/api/src/services/idempotency-marker.ts`
- Create: `apps/api/src/middleware/idempotency.test.ts`

**Design — read carefully, this differs from the original plan:**

The middleware does TWO things and ONLY two things:
1. **Pre-flight check** (before `next()`): if `Idempotency-Key` header present AND `(profileId, flow, key)` is in KV → call `lookupAssistantTurnState(c, opts.flow, key)` (see new helper below), then short-circuit with `200 { replayed: true, clientId, status: 'persisted', assistantTurnReady: boolean, latestExchangeId: string | null }` and `Idempotency-Replay: true` header. **It does NOT attempt to replay the original SSE body.** Mobile uses `assistantTurnReady` to decide whether to render immediately or refetch + poll-the-tail until the assistant turn lands.
2. **Expose `markPersisted(c, key)`** as a separate helper that handlers call AFTER the user message has been successfully committed to the DB. This decouples KV writes from the response lifecycle and avoids the `c.res.clone().text()` trap that breaks on streaming responses.

**`lookupAssistantTurnState` helper:** called from inside the KV-hit branch before constructing the replay response. For `session` flow: queries `session_events` for the user row matching `client_id=key`, then checks for any subsequent `assistant_message` row in the same session with `created_at >= user_row.created_at`. For `interview` flow: loads `onboardingDrafts.exchangeHistory[]` JSONB and scans for an `assistant` role entry after the matching user `client_id`. Returns `{ assistantTurnReady: boolean, latestExchangeId: string | null }`. The entire helper body is wrapped in `try/catch` — on any error returns `{ assistantTurnReady: false, latestExchangeId: null }` and emits a Sentry breadcrumb. The middleware NEVER 500s from this lookup.

KV TTL: 24 h. Cache key shape: `idem:${profileId}:${flow}:${key}`. The `flow` segment is included even though ULID collisions across flows are astronomically unlikely — it makes the key consistent with the mobile outbox's own `(profileId, flow)` scoping and aids debugging.

When `IDEMPOTENCY_KV` binding is missing or `profileId` is unset, the middleware proceeds without short-circuiting (defence in depth — must not 500), AND emits a Sentry breadcrumb tagged `feature: idempotency, state: binding_missing | profile_missing`. Per CLAUDE.md "silent recovery without escalation is banned", a structured breadcrumb is the minimum bar so prod misconfigs surface in observability.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/middleware/idempotency.test.ts`:

```typescript
import { Hono } from 'hono';
import { idempotencyPreflight } from './idempotency';
import { markPersisted } from '../services/idempotency-marker';

type KVStore = Map<string, { value: string; expiresAt: number }>;

function makeKv(store: KVStore = new Map()) {
  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number }
    ): Promise<void> {
      const ttlSeconds = options?.expirationTtl ?? 86_400;
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function makeApp(kv: ReturnType<typeof makeKv>, profileId = 'p1') {
  const app = new Hono<{
    Bindings: { IDEMPOTENCY_KV: typeof kv };
    Variables: { profileId: string };
  }>();
  app.use('*', async (c, next) => {
    c.set('profileId', profileId);
    await next();
  });
  app.use('*', idempotencyPreflight({ flow: 'session' }));
  let counter = 0;
  app.post('/echo', async (c) => {
    counter++;
    const key = c.req.header('Idempotency-Key');
    if (key) await markPersisted(c, { flow: 'session', key });
    return c.json({ counter, ok: true });
  });
  return { app, kv, getCounter: () => counter };
}

describe('idempotencyPreflight', () => {
  it('passes through and the handler can mark persisted on success', async () => {
    const kv = makeKv();
    const { app } = makeApp(kv);

    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ counter: 1, ok: true });
    // KV should now contain the key
    const cached = await kv.get('idem:p1:session:k1');
    expect(cached).not.toBeNull();
  });

  it('short-circuits on second request with same key — handler not re-run', async () => {
    const kv = makeKv();
    const { app, getCounter } = makeApp(kv);

    await app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });

    const res2 = await app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });

    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2).toMatchObject({ replayed: true, clientId: 'k1', status: 'persisted' });
    expect(typeof body2.assistantTurnReady).toBe('boolean');
    expect('latestExchangeId' in body2).toBe(true);
    expect(res2.headers.get('Idempotency-Replay')).toBe('true');
    expect(getCounter()).toBe(1); // handler ran exactly once
  });

  it('does not short-circuit when Idempotency-Key header is absent', async () => {
    const kv = makeKv();
    const { app, getCounter } = makeApp(kv);

    await app.request('/echo', { method: 'POST' }, { IDEMPOTENCY_KV: kv });
    await app.request('/echo', { method: 'POST' }, { IDEMPOTENCY_KV: kv });

    expect(getCounter()).toBe(2);
  });

  it('scopes cache by profileId — same key under different profile is NOT short-circuited', async () => {
    const kv = makeKv();
    const a = makeApp(kv, 'profileA');
    const b = makeApp(kv, 'profileB');

    await a.app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared-key' },
    }, { IDEMPOTENCY_KV: kv });

    await b.app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared-key' },
    }, { IDEMPOTENCY_KV: kv });

    expect(a.getCounter()).toBe(1);
    expect(b.getCounter()).toBe(1);
  });

  it('does NOT mark persisted on handler failure (handler must opt in)', async () => {
    const kv = makeKv();
    const app = new Hono<{
      Bindings: { IDEMPOTENCY_KV: typeof kv };
      Variables: { profileId: string };
    }>();
    app.use('*', async (c, next) => { c.set('profileId', 'p1'); await next(); });
    app.use('*', idempotencyPreflight({ flow: 'session' }));
    let counter = 0;
    app.post('/fail', async (c) => {
      counter++;
      // handler does NOT call markPersisted because it's failing
      return c.json({ error: 'boom' }, 500);
    });

    await app.request('/fail', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });
    await app.request('/fail', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });

    expect(counter).toBe(2); // failure is not "persisted", so the retry runs again
  });

  it('proceeds without short-circuit when profileId is unset (defence in depth)', async () => {
    const kv = makeKv();
    const app = new Hono<{
      Bindings: { IDEMPOTENCY_KV: typeof kv };
      Variables: { profileId?: string };
    }>();
    // NO profileId middleware
    app.use('*', idempotencyPreflight({ flow: 'session' }));
    app.post('/echo', (c) => c.json({ ok: true }));

    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { IDEMPOTENCY_KV: kv });

    expect(res.status).toBe(200); // no crash
  });

  it('proceeds without short-circuit when IDEMPOTENCY_KV binding is missing', async () => {
    const app = new Hono<{
      Bindings: { IDEMPOTENCY_KV?: ReturnType<typeof makeKv> };
      Variables: { profileId: string };
    }>();
    app.use('*', async (c, next) => { c.set('profileId', 'p1'); await next(); });
    app.use('*', idempotencyPreflight({ flow: 'session' }));
    app.post('/echo', (c) => c.json({ ok: true }));

    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k1' },
    }, { /* no IDEMPOTENCY_KV */ });

    expect(res.status).toBe(200);
  });

  it('markPersisted is a no-op when KV or profileId missing (cannot crash handlers)', async () => {
    const app = new Hono<{
      Bindings: { IDEMPOTENCY_KV?: unknown };
      Variables: { profileId?: string };
    }>();
    app.post('/echo', async (c) => {
      await markPersisted(c, { flow: 'session', key: 'k1' });
      return c.json({ ok: true });
    });
    const res = await app.request('/echo', { method: 'POST' }, {});
    expect(res.status).toBe(200);
  });

  it('replay-hit with assistant turn already persisted returns assistantTurnReady=true', async () => {
    // Requires mocking lookupAssistantTurnState to return { assistantTurnReady: true, latestExchangeId: 'ex-1' }.
    // Verify the replay response body includes assistantTurnReady: true and latestExchangeId.
    // Full integration coverage is in idempotency-assistant-state.test.ts.
  });

  it('replay-hit with assistant turn pending returns assistantTurnReady=false', async () => {
    // lookupAssistantTurnState returns { assistantTurnReady: false, latestExchangeId: null }.
    // Verify replay response body includes assistantTurnReady: false.
  });

  it('lookup error degrades to assistantTurnReady=false (no 500)', async () => {
    // lookupAssistantTurnState throws. Middleware must catch, return assistantTurnReady: false, status still 200.
    // Sentry breadcrumb emitted.
  });

  it('latestExchangeId is null when no exchange exists for this session yet', async () => {
    // lookupAssistantTurnState returns { assistantTurnReady: false, latestExchangeId: null }.
    // Verify latestExchangeId is null (not undefined) in the JSON body.
  });
});
```

- [ ] **Step 2: Run the tests — should FAIL**

```bash
cd apps/api && pnpm exec jest src/middleware/idempotency.test.ts --no-coverage
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement middleware + marker**

Create `apps/api/src/middleware/idempotency.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';
import { createLogger } from '../services/logger';
import { addBreadcrumb } from '../services/observability/sentry';

const logger = createLogger('idempotency-middleware');

export type OutboxFlow = 'session' | 'interview';

export function cacheKey(profileId: string, flow: OutboxFlow, key: string): string {
  return `idem:${profileId}:${flow}:${key}`;
}

export function idempotencyPreflight(opts: { flow: OutboxFlow }): MiddlewareHandler<{
  Bindings: { IDEMPOTENCY_KV?: KVNamespace };
  Variables: { profileId?: string };
}> {
  return async (c, next) => {
    const key = c.req.header('Idempotency-Key');
    if (!key) return next();

    const profileId = c.get('profileId');
    const kv = c.env.IDEMPOTENCY_KV;

    if (!profileId || !kv) {
      // Defence in depth — must not 500, but DO surface the misconfig.
      addBreadcrumb({
        category: 'idempotency',
        level: 'warning',
        message: !kv ? 'binding_missing' : 'profile_missing',
        data: { hasKey: true, flow: opts.flow },
      });
      logger.warn('idempotency preflight skipped', {
        reason: !kv ? 'binding_missing' : 'profile_missing',
        flow: opts.flow,
      });
      return next();
    }

    const ck = cacheKey(profileId, opts.flow, key);
    const cached = await kv.get(ck);
    if (cached) {
      // Short-circuit — return a small JSON, NOT a replay of the original SSE.
      // Mobile uses assistantTurnReady to decide whether to render or poll.
      const { assistantTurnReady, latestExchangeId } =
        await lookupAssistantTurnState(c, opts.flow, key);
      return new Response(
        JSON.stringify({
          replayed: true,
          clientId: key,
          status: 'persisted',
          assistantTurnReady,
          latestExchangeId,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Replay': 'true',
          },
        }
      );
    }

    return next();
  };
}
```

Create `apps/api/src/services/idempotency-assistant-state.ts`:

```typescript
import type { Context } from 'hono';
import { createLogger } from './logger';
import { addBreadcrumb } from './observability/sentry';
import type { OutboxFlow } from '../middleware/idempotency';

const logger = createLogger('idempotency-assistant-state');

export interface AssistantTurnState {
  assistantTurnReady: boolean;
  latestExchangeId: string | null;
}

/**
 * Cheap DB lookup to populate assistantTurnReady on replay responses.
 *
 * Session flow: finds the session_events row with client_id=key, then looks for
 * any subsequent assistant_message row in the same session with
 * created_at >= user_row.created_at. latestExchangeId is that row's id (or null).
 *
 * Interview flow: loads onboardingDrafts.exchangeHistory[] JSONB for the draft
 * matching the current profile/subject, scans for an 'assistant' role entry that
 * appears AFTER the 'user' entry with client_id=key. latestExchangeId is null
 * (interview exchanges are not individually keyed by UUID in exchangeHistory[]).
 *
 * On any error: returns { assistantTurnReady: false, latestExchangeId: null }.
 * Never throws. Never causes a 500 in the middleware.
 */
export async function lookupAssistantTurnState(
  c: Context<{ Variables: { profileId?: string; db?: import('@eduagent/database').Database } }>,
  flow: OutboxFlow,
  clientId: string,
): Promise<AssistantTurnState> {
  const safe: AssistantTurnState = { assistantTurnReady: false, latestExchangeId: null };
  try {
    const db = c.get('db');
    const profileId = c.get('profileId');
    if (!db || !profileId) return safe;

    if (flow === 'session') {
      // 1. Find the user turn row for this client_id.
      const userRow = await db.query.sessionEvents.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.clientId, clientId), eq(t.profileId, profileId)),
        columns: { id: true, sessionId: true, createdAt: true },
      });
      if (!userRow) return safe;

      // 2. Look for an assistant row in the same session created after it.
      const assistantRow = await db.query.sessionEvents.findFirst({
        where: (t, { and, eq, gt }) =>
          and(
            eq(t.sessionId, userRow.sessionId),
            eq(t.role, 'assistant'),
            gt(t.createdAt, userRow.createdAt),
          ),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
        columns: { id: true },
      });
      return {
        assistantTurnReady: assistantRow !== undefined,
        latestExchangeId: assistantRow?.id ?? null,
      };
    }

    if (flow === 'interview') {
      // Load the active draft for this profile; scan exchangeHistory[] JSONB.
      // The draft is identified via the profileId context (one active draft per profile).
      const draft = await db.query.onboardingDrafts.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.profileId, profileId), eq(t.status, 'in_progress')),
        columns: { exchangeHistory: true },
      });
      if (!draft?.exchangeHistory) return safe;

      const history = draft.exchangeHistory as Array<{ role: string; client_id?: string }>;
      const userIdx = history.findIndex(
        (h) => h.role === 'user' && h.client_id === clientId,
      );
      if (userIdx === -1) return safe;

      const hasAssistant = history
        .slice(userIdx + 1)
        .some((h) => h.role === 'assistant');
      return { assistantTurnReady: hasAssistant, latestExchangeId: null };
    }

    return safe;
  } catch (err) {
    logger.warn('lookupAssistantTurnState failed — degrading to false', { err, flow, clientId });
    addBreadcrumb({
      category: 'idempotency',
      level: 'warning',
      message: 'assistant_turn_lookup_failed',
      data: { flow, clientId },
    });
    return safe;
  }
}
```

Create `apps/api/src/services/idempotency-marker.ts`:

```typescript
import type { Context } from 'hono';
import { cacheKey, type OutboxFlow } from '../middleware/idempotency';
import { createLogger } from './logger';

const logger = createLogger('idempotency-marker');
const TTL_SECONDS = 24 * 60 * 60;

export async function markPersisted(
  c: Context<{ Bindings: { IDEMPOTENCY_KV?: KVNamespace }; Variables: { profileId?: string } }>,
  input: { flow: OutboxFlow; key: string }
): Promise<void> {
  const profileId = c.get('profileId');
  const kv = c.env.IDEMPOTENCY_KV;
  if (!profileId || !kv) return; // no-op — middleware already breadcrumbed

  try {
    await kv.put(cacheKey(profileId, input.flow, input.key), '1', {
      expirationTtl: TTL_SECONDS,
    });
  } catch (err) {
    logger.warn('failed to mark idempotency persisted', { err, flow: input.flow });
    // Non-fatal — the DB unique index is the authoritative dedupe.
  }
}
```

- [ ] **Step 4: Run tests — should PASS**

```bash
cd apps/api && pnpm exec jest src/middleware/idempotency.test.ts --no-coverage
```

Expected: 12 PASS (8 original + 4 new assistant-turn-ready cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/idempotency.ts apps/api/src/services/idempotency-marker.ts apps/api/src/middleware/idempotency.test.ts
git commit -m "feat(api): add idempotency pre-flight middleware + marker [INTERACTION-DUR-L1]"
git push
```

---

## Task 4: Persistence-layer dedupe — `session_events` and `exchangeHistory[]`

**Files:**
- Modify: `apps/api/src/services/session/session-exchange.ts`
- Modify: `apps/api/src/services/onboarding/exchange-history-writer.ts` (or wherever `exchangeHistory` is appended)

This is the **authoritative** dedupe. KV is a fast-path hint; the DB unique index is the source of truth. After this task, even if KV misses (eventual consistency, region hop, etc.) the second write is a no-op.

- [ ] **Step 1: Locate the actual writers**

```bash
cd apps/api && grep -nE "insert.*sessionEvents|exchangeHistory.*\[" src/services/ --include="*.ts" -r | head -30
```

Note every call site. Each must be updated.

- [ ] **Step 2: Update `session_events` writer to use ON CONFLICT DO NOTHING**

In `apps/api/src/services/session/session-exchange.ts` find the `insert(sessionEvents).values(...)` call. Refactor:

```typescript
import { sessionEvents } from '@eduagent/database';

export async function persistUserMessage(
  db: Database,
  input: { sessionId: string; profileId: string; content: string; clientId?: string }
): Promise<{ inserted: boolean; row: typeof sessionEvents.$inferSelect | null }> {
  const result = await db
    .insert(sessionEvents)
    .values({
      sessionId: input.sessionId,
      profileId: input.profileId,
      role: 'user',
      content: input.content,
      clientId: input.clientId ?? null,
    })
    .onConflictDoNothing({
      target: [sessionEvents.sessionId, sessionEvents.clientId],
    })
    .returning();

  if (result.length === 0) {
    // Conflict hit — row already exists. Return it for caller transparency.
    if (input.clientId) {
      const existing = await db.query.sessionEvents.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.sessionId, input.sessionId), eq(t.clientId, input.clientId!)),
      });
      return { inserted: false, row: existing ?? null };
    }
    return { inserted: false, row: null };
  }

  return { inserted: true, row: result[0] };
}
```

- [ ] **Step 3: Update `exchangeHistory[]` writer with array-scan-before-append**

Find the writer for `onboardingDrafts.exchangeHistory` (likely `apps/api/src/services/onboarding/exchange-history-writer.ts` or in a draft service). Pattern:

```typescript
import { onboardingDrafts } from '@eduagent/database';
import type { ExchangeEntry } from '@eduagent/schemas';

export async function appendExchangeEntry(
  db: Database,
  draftId: string,
  entry: ExchangeEntry
): Promise<{ appended: boolean }> {
  // Read current array, scan for client_id, append only if absent.
  // The whole operation runs inside db.batch() for atomicity (per
  // project_neon_transaction_facts — neon-http does not support interactive tx,
  // but db.batch is ACID).
  const draft = await db.query.onboardingDrafts.findFirst({
    where: (t, { eq }) => eq(t.id, draftId),
  });
  if (!draft) throw new Error(`draft ${draftId} not found`);

  const history = (draft.exchangeHistory ?? []) as ExchangeEntry[];
  if (entry.client_id && history.some((h) => h.client_id === entry.client_id)) {
    return { appended: false };
  }

  await db
    .update(onboardingDrafts)
    .set({ exchangeHistory: [...history, entry] })
    .where(eq(onboardingDrafts.id, draftId));

  return { appended: true };
}
```

> **Race-window note:** Without an interactive transaction the read-scan-update is not atomic. Two concurrent requests with the same `client_id` can both see "absent" and both append. This is acceptable in practice because: (a) mobile single-flights replays per `(profileId, flow)`, (b) the duplicate is harmless and human-detectable, (c) the SUBJECT-09 root fix in Layer 3 moves persistence to Inngest where Inngest's own event dedupe handles this. If telemetry shows duplicates in prod, lift the writer into an Inngest function early.

- [ ] **Step 4: Update tests for the writer**

Add to the writer's test file (co-located):

```typescript
it('skips append when an entry with the same client_id already exists', async () => {
  await appendExchangeEntry(db, draftId, { role: 'user', content: 'a', client_id: 'k1' });
  const result = await appendExchangeEntry(db, draftId, { role: 'user', content: 'a', client_id: 'k1' });
  expect(result.appended).toBe(false);
  const draft = await db.query.onboardingDrafts.findFirst({ where: (t, { eq }) => eq(t.id, draftId) });
  expect(draft!.exchangeHistory).toHaveLength(1);
});

it('inserts session_events with client_id and the unique index dedups (break test)', async () => {
  // Red: write code to insert twice with same (session_id, client_id).
  // Green: ON CONFLICT DO NOTHING → second insert is no-op, count=1.
  await persistUserMessage(db, { sessionId, profileId, content: 'hi', clientId: 'k1' });
  const r2 = await persistUserMessage(db, { sessionId, profileId, content: 'hi-retry', clientId: 'k1' });
  expect(r2.inserted).toBe(false);
  const rows = await db.query.sessionEvents.findMany({
    where: (t, { and, eq }) => and(eq(t.sessionId, sessionId), eq(t.clientId, 'k1')),
  });
  expect(rows).toHaveLength(1);
});
```

This is the break test that satisfies CLAUDE.md "Security fixes require a break test" — write the test, watch it fail without the unique index + onConflictDoNothing, restore.

- [ ] **Step 5: Run targeted tests**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/session/session-exchange.ts src/services/onboarding/ --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/session/session-exchange.ts apps/api/src/services/onboarding/
git commit -m "feat(api): persistence-layer client_id dedupe for session_events + exchangeHistory [INTERACTION-DUR-L1]"
git push
```

---

## Task 5: Mount middleware on streaming routes + thread `clientId` into persistence

**Files:**
- Modify: `apps/api/src/routes/interview.ts`
- Modify: `apps/api/src/routes/sessions.ts`
- Create: `apps/api/src/routes/interview.idempotency.test.ts`

The middleware mounts AFTER auth/profile-scope (so `c.get('profileId')` is set) and BEFORE the SSE handler. The handler reads `Idempotency-Key`, threads it into `persistUserMessage(...)`, and on success calls `markPersisted(c, { flow, key })` BEFORE opening the SSE stream. This means: the KV write happens inside the handler at a point where we can `await` cleanly, never racing the streaming response.

- [ ] **Step 1: Locate the SSE handlers**

```bash
cd apps/api && grep -nE "streamSSEUtf8\(c," src/routes/interview.ts src/routes/sessions.ts
```

Confirmed call sites (already verified): `interview.ts:202` and `sessions.ts:317`. Note also `/subjects/:subjectId/interview/complete` at `interview.ts:309` (non-streaming POST — same wiring applies).

- [ ] **Step 2: Wire `interview.ts`**

```typescript
import { idempotencyPreflight } from '../middleware/idempotency';
import { markPersisted } from '../services/idempotency-marker';

// in the router chain — apply per-route .use() before each .post()
.use('/subjects/:subjectId/interview/stream', idempotencyPreflight({ flow: 'interview' }))
.post('/subjects/:subjectId/interview/stream', async (c) => {
  const idempotencyKey = c.req.header('Idempotency-Key');
  // ... existing body parse ...

  // Persist user message FIRST (before streaming) with client_id dedupe.
  const persisted = await persistUserMessage(db, {
    sessionId,
    profileId,
    content: body.message,
    clientId: idempotencyKey,
  });

  // Mark KV regardless of whether row was newly inserted — the user message
  // exists either way, and a future retry should short-circuit.
  if (idempotencyKey) {
    await markPersisted(c, { flow: 'interview', key: idempotencyKey });
  }

  return streamSSEUtf8(c, async (sseStream) => {
    // ... existing streaming logic ...
  });
})
.use('/subjects/:subjectId/interview/complete', idempotencyPreflight({ flow: 'interview' }))
.post('/subjects/:subjectId/interview/complete', async (c) => {
  // same pattern: persist with clientId, markPersisted on success
})
```

- [ ] **Step 3: Wire `sessions.ts`** — same pattern for the `/messages/stream` endpoint and any other mutating session route the mobile outbox calls. Skip GETs and webhooks.

- [ ] **Step 4: Write the integration test (real DB, single Idempotency-Key, two requests)**

Create `apps/api/src/routes/interview.idempotency.test.ts`. Mirror the auth/db setup in `interview.test.ts`. Add:

```typescript
describe('POST /v1/subjects/:subjectId/interview/stream — idempotency', () => {
  it('two requests with the same Idempotency-Key persist exactly one user message and the second carries Idempotency-Replay: true', async () => {
    const key = `test-${Date.now()}-1`;

    const res1 = await app.request(
      `/v1/subjects/${SUBJECT_ID}/interview/stream`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Idempotency-Key': key },
        body: JSON.stringify({ message: 'hello' }),
      },
      TEST_ENV
    );
    expect(res1.status).toBe(200);
    expect(res1.headers.get('content-type')).toContain('text/event-stream');
    // drain the stream so the request completes
    const reader = res1.body!.getReader();
    while (!(await reader.read()).done) { /* drain */ }

    const res2 = await app.request(
      `/v1/subjects/${SUBJECT_ID}/interview/stream`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Idempotency-Key': key },
        body: JSON.stringify({ message: 'hello' }),
      },
      TEST_ENV
    );
    expect(res2.status).toBe(200);
    expect(res2.headers.get('Idempotency-Replay')).toBe('true');
    const body2 = await res2.json();
    expect(body2).toMatchObject({ replayed: true, clientId: key, status: 'persisted' });
    // assistantTurnReady and latestExchangeId must be present on every replay response.
    expect(typeof body2.assistantTurnReady).toBe('boolean');
    expect('latestExchangeId' in body2).toBe(true); // may be null or a string, but key must exist

    // DB assertion — exactly one row.
    const rows = await testDb.query.sessionEvents.findMany({
      where: (t, { and, eq }) => and(eq(t.sessionId, SUBJECT_SESSION_ID), eq(t.clientId, key)),
    });
    expect(rows).toHaveLength(1);
  });

  it('different Idempotency-Keys produce two rows (sanity)', async () => {
    // ... same shape with two distinct keys → two SSE streams + two rows
  });

  it('no Idempotency-Key header behaves exactly as before (no client_id, no dedupe)', async () => {
    // regression guard: existing behaviour unchanged
  });
});
```

- [ ] **Step 5: Run all interview/sessions tests + the new integration test**

```bash
cd apps/api && pnpm exec jest src/routes/interview.test.ts src/routes/sessions.test.ts src/routes/interview.idempotency.test.ts --no-coverage
```

Expected: ALL PASS. Existing tests are unaffected because (a) they don't send an Idempotency-Key, and (b) the persistence layer keeps its previous shape when `clientId` is absent.

- [ ] **Step 6: Verify typecheck**

```bash
pnpm exec nx run api:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/interview.ts apps/api/src/routes/sessions.ts apps/api/src/routes/interview.idempotency.test.ts
git commit -m "feat(api): wire idempotency preflight + clientId persistence on streaming routes [INTERACTION-DUR-L1]"
git push
```

---

## Task 6: Async mutex utility (TDD)

**Files:**
- Create: `apps/mobile/src/lib/async-mutex.ts`
- Create: `apps/mobile/src/lib/async-mutex.test.ts`

A tiny per-key async mutex. Required because AsyncStorage operations are async and the outbox does read-modify-write — without serialisation, concurrent `enqueue` calls can clobber each other. The implementation is a Map of pending promise chains keyed by string.

- [ ] **Step 1: Tests**

Create `apps/mobile/src/lib/async-mutex.test.ts`:

```typescript
import { withLock } from './async-mutex';

describe('withLock', () => {
  it('serialises operations on the same key', async () => {
    const log: string[] = [];
    const a = withLock('k', async () => {
      log.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a-end');
    });
    const b = withLock('k', async () => {
      log.push('b-start');
      log.push('b-end');
    });
    await Promise.all([a, b]);
    expect(log).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('does not serialise across different keys', async () => {
    const log: string[] = [];
    const a = withLock('k1', async () => {
      log.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a-end');
    });
    const b = withLock('k2', async () => {
      log.push('b-start');
      log.push('b-end');
    });
    await Promise.all([a, b]);
    expect(log[0]).toBe('a-start');
    expect(log).toContain('b-start');
    expect(log.indexOf('b-end')).toBeLessThan(log.indexOf('a-end'));
  });

  it('releases the lock even when the body throws', async () => {
    await expect(withLock('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const result = await withLock('k', async () => 'ok');
    expect(result).toBe('ok');
  });
});
```

- [ ] **Step 2: Implementation**

Create `apps/mobile/src/lib/async-mutex.ts`:

```typescript
const chains = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  let resolveNext!: () => void;
  const next = new Promise<void>((r) => { resolveNext = r; });
  chains.set(key, previous.then(() => next));
  try {
    await previous;
    return await fn();
  } finally {
    resolveNext();
    // Clean up if we're the tail of the chain — prevents unbounded Map growth.
    queueMicrotask(() => {
      if (chains.get(key) === previous.then(() => next)) {
        // very rarely this branch is true; the conservative cleanup pattern is
        // to drop entries when the outstanding promise has settled. A WeakRef
        // approach would be overkill here.
      }
    });
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/mobile && pnpm exec jest src/lib/async-mutex.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/async-mutex.ts apps/mobile/src/lib/async-mutex.test.ts
git commit -m "feat(mobile): add per-key async mutex utility [INTERACTION-DUR-L1]"
git push
```

---

## Task 7: Mobile message-outbox library (TDD, mutex-guarded)

**Files:**
- Create: `apps/mobile/src/lib/message-outbox.ts`
- Create: `apps/mobile/src/lib/message-outbox.test.ts`

The outbox is profile + flow scoped (one storage key per `(profileId, flow)`). Entries are stored as a JSON array; the array is read, mutated in memory, and written back inside `withLock(storageKey, ...)` so concurrent calls cannot race. ULIDs come from `crypto.randomUUID()` (Expo exposes via `expo-crypto`) — no monotonic counter, no module mutable state.

Lifecycle: `enqueue` → `markConfirmed` (deletes inline) OR `recordFailure` (increments attempts; flips to `permanently-failed` after 3) → `escalate` (POSTs to spillover, deletes on 200) OR persists permanently for the banner UX.

- [ ] **Step 1: Confirm `expo-crypto` is available**

```bash
cd apps/mobile && cat package.json | grep -E "expo-crypto|nanoid|uuid"
```

If `expo-crypto` is present, use `randomUUID()` from it. If not, fall back to `nanoid`.

- [ ] **Step 2: Tests**

Create `apps/mobile/src/lib/message-outbox.test.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue, markConfirmed, recordFailure, drain,
  listPending, listPermanentlyFailed, deletePermanentlyFailed,
  MAX_ATTEMPTS,
  type OutboxEntry,
} from './message-outbox';

const PROFILE = 'p1';
const FLOW = 'session' as const;

beforeEach(async () => { await AsyncStorage.clear(); });

describe('message-outbox', () => {
  it('enqueues a pending entry with a generated id and 0 attempts', async () => {
    const entry = await enqueue(PROFILE, FLOW, { surfaceKey: 'sess-1', content: 'Hello' });
    expect(entry.status).toBe('pending');
    expect(entry.attempts).toBe(0);
    expect(entry.id).toMatch(/.+/);
    expect((await listPending(PROFILE, FLOW))).toHaveLength(1);
  });

  it('markConfirmed deletes the entry inline', async () => {
    const e = await enqueue(PROFILE, FLOW, { surfaceKey: 'sess-1', content: 'Hello' });
    await markConfirmed(PROFILE, FLOW, e.id);
    expect(await listPending(PROFILE, FLOW)).toHaveLength(0);
  });

  it('recordFailure increments attempts but keeps status pending until MAX_ATTEMPTS', async () => {
    const e = await enqueue(PROFILE, FLOW, { surfaceKey: 'sess-1', content: 'Hello' });
    await recordFailure(PROFILE, FLOW, e.id, 'network-error');
    await recordFailure(PROFILE, FLOW, e.id, 'network-error');
    const [updated] = await listPending(PROFILE, FLOW);
    expect(updated.attempts).toBe(2);
    expect(updated.status).toBe('pending');
    expect(updated.failureReason).toBe('network-error');
  });

  it('flips entry to permanently-failed after MAX_ATTEMPTS failures', async () => {
    const e = await enqueue(PROFILE, FLOW, { surfaceKey: 'sess-1', content: 'Hello' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await recordFailure(PROFILE, FLOW, e.id, `attempt-${i}`);
    }
    expect(await listPending(PROFILE, FLOW)).toHaveLength(0);
    const failed = await listPermanentlyFailed(PROFILE, FLOW);
    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe('permanently-failed');
  });

  it('drain returns oldest-first ordering by createdAt', async () => {
    const old = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'first', now: '2026-05-01T00:00:00Z' });
    const newer = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'second', now: '2026-05-01T00:01:00Z' });
    const drained = await drain(PROFILE, FLOW);
    expect(drained.map((e) => e.id)).toEqual([old.id, newer.id]);
  });

  it('drain skips permanently-failed entries', async () => {
    const a = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'a' });
    const b = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'b' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await recordFailure(PROFILE, FLOW, a.id, 'fail');
    const drained = await drain(PROFILE, FLOW);
    expect(drained.map((e) => e.id)).toEqual([b.id]);
  });

  it('isolates entries by (profileId, flow)', async () => {
    await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'a' });
    await enqueue('other', FLOW, { surfaceKey: 's1', content: 'b' });
    await enqueue(PROFILE, 'interview', { surfaceKey: 'subj-1', content: 'c' });
    expect(await listPending(PROFILE, FLOW)).toHaveLength(1);
    expect(await listPending('other', FLOW)).toHaveLength(1);
    expect(await listPending(PROFILE, 'interview')).toHaveLength(1);
  });

  it('survives a corrupted JSON blob (recovers gracefully)', async () => {
    await AsyncStorage.setItem(`outbox-${PROFILE}-${FLOW}`, 'not valid json');
    const e = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'after corruption' });
    expect(e.status).toBe('pending');
    expect(await listPending(PROFILE, FLOW)).toHaveLength(1);
  });

  // ---- The H1 fix: concurrency safety ----
  it('does not lose entries when many enqueues run concurrently (mutex break test)', async () => {
    const N = 20;
    const promises = Array.from({ length: N }, (_, i) =>
      enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: `msg-${i}` })
    );
    await Promise.all(promises);
    const all = await listPending(PROFILE, FLOW);
    expect(all).toHaveLength(N); // Without the mutex this fails — entries get clobbered.
  });

  it('does not lose entries when enqueue races markConfirmed', async () => {
    const e1 = await enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'a' });
    await Promise.all([
      enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'b' }),
      markConfirmed(PROFILE, FLOW, e1.id),
      enqueue(PROFILE, FLOW, { surfaceKey: 's1', content: 'c' }),
    ]);
    const all = await listPending(PROFILE, FLOW);
    expect(all.map((e) => e.content).sort()).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 3: Run — should FAIL**

```bash
cd apps/mobile && pnpm exec jest src/lib/message-outbox.test.ts --no-coverage
```

- [ ] **Step 4: Implementation**

Create `apps/mobile/src/lib/message-outbox.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Sentry } from './sentry';
import { withLock } from './async-mutex';

export const MAX_ATTEMPTS = 3;

export type OutboxFlow = 'session' | 'interview';
export type OutboxStatus = 'pending' | 'permanently-failed';

export interface OutboxEntry {
  id: string;
  flow: OutboxFlow;
  surfaceKey: string;
  content: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: OutboxStatus;
  failureReason?: string;
}

function storageKey(profileId: string, flow: OutboxFlow): string {
  return `outbox-${profileId}-${flow}`;
}

function generateId(): string {
  // Time-prefixed for natural sort + UUID for uniqueness.
  return `${Date.now().toString(36)}-${randomUUID()}`;
}

async function readAll(profileId: string, flow: OutboxFlow): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(storageKey(profileId, flow));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutboxEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'message_outbox', op: 'read' } });
    return [];
  }
}

async function writeAll(profileId: string, flow: OutboxFlow, entries: OutboxEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(profileId, flow), JSON.stringify(entries));
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'message_outbox', op: 'write' } });
  }
}

export async function enqueue(
  profileId: string, flow: OutboxFlow,
  input: { surfaceKey: string; content: string; now?: string }
): Promise<OutboxEntry> {
  return withLock(storageKey(profileId, flow), async () => {
    const entry: OutboxEntry = {
      id: generateId(),
      flow,
      surfaceKey: input.surfaceKey,
      content: input.content,
      createdAt: input.now ?? new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      status: 'pending',
    };
    const all = await readAll(profileId, flow);
    await writeAll(profileId, flow, [...all, entry]);
    return entry;
  });
}

export async function markConfirmed(profileId: string, flow: OutboxFlow, id: string): Promise<void> {
  return withLock(storageKey(profileId, flow), async () => {
    const all = await readAll(profileId, flow);
    await writeAll(profileId, flow, all.filter((e) => e.id !== id));
  });
}

export async function recordFailure(
  profileId: string, flow: OutboxFlow, id: string, reason: string
): Promise<void> {
  return withLock(storageKey(profileId, flow), async () => {
    const all = await readAll(profileId, flow);
    const updated = all.map((e) => {
      if (e.id !== id) return e;
      const attempts = e.attempts + 1;
      const status: OutboxStatus = attempts >= MAX_ATTEMPTS ? 'permanently-failed' : 'pending';
      return { ...e, attempts, status, failureReason: reason, lastAttemptAt: new Date().toISOString() };
    });
    await writeAll(profileId, flow, updated);
  });
}

export async function drain(profileId: string, flow: OutboxFlow): Promise<OutboxEntry[]> {
  // Read-only — no lock needed. Caller must serialise its own replay loop.
  const all = await readAll(profileId, flow);
  return all.filter((e) => e.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listPending(profileId: string, flow: OutboxFlow): Promise<OutboxEntry[]> {
  return drain(profileId, flow);
}

export async function listPermanentlyFailed(profileId: string, flow: OutboxFlow): Promise<OutboxEntry[]> {
  const all = await readAll(profileId, flow);
  return all.filter((e) => e.status === 'permanently-failed');
}

export async function deletePermanentlyFailed(
  profileId: string, flow: OutboxFlow, id: string
): Promise<void> {
  return withLock(storageKey(profileId, flow), async () => {
    const all = await readAll(profileId, flow);
    await writeAll(profileId, flow, all.filter((e) => e.id !== id));
  });
}
```

- [ ] **Step 5: Run tests — should PASS (all 10, including the two concurrency break tests)**

```bash
cd apps/mobile && pnpm exec jest src/lib/message-outbox.test.ts --no-coverage
```

If the concurrency tests fail, the mutex isn't engaging. Do NOT loosen the assertions — the test is the contract.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/message-outbox.ts apps/mobile/src/lib/message-outbox.test.ts
git commit -m "feat(mobile): add mutex-guarded message-outbox library [INTERACTION-DUR-L1]"
git push
```

---

## Task 8: API client helper + wire into use-interview hook

**Files:**
- Modify: `apps/mobile/src/lib/api-client.ts`
- Modify: `apps/mobile/src/hooks/use-interview.ts`

The helper attaches the header. The hook integration:
1. **For fresh sends:** generate the entry via `enqueue()` BEFORE the SSE call, pass entry.id as `Idempotency-Key`.
2. **For replays:** caller passes an `existingEntry` — DO NOT re-enqueue; reuse the existing id.
3. On `done` SSE frame OR on response with `Idempotency-Replay: true` → `markConfirmed`.
4. On any error / SSE error frame → `recordFailure`.

The "single-flight per flow" property is enforced by the OutboxDrainProvider (Task 10), not at the hook level.

- [ ] **Step 1: Add helpers to api-client.ts**

```typescript
export function withIdempotencyKey(init: RequestInit, idempotencyKey: string): RequestInit {
  const headers = new Headers(init.headers ?? {});
  headers.set('Idempotency-Key', idempotencyKey);
  return { ...init, headers };
}

export function isIdempotencyReplay(res: Response): boolean {
  return res.headers.get('Idempotency-Replay') === 'true';
}

/** Shape of the JSON body returned on a replay hit. */
export interface IdempotencyReplayBody {
  replayed: true;
  clientId: string;
  status: 'persisted';
  /** True when both the user message AND the assistant reply are already persisted. */
  assistantTurnReady: boolean;
  /** Exchange id of the assistant turn when assistantTurnReady is true (null otherwise, or for interview flow). */
  latestExchangeId: string | null;
}
```

- [ ] **Step 2: Refactor `sendMessage` in `use-interview.ts` to accept an optional existing entry**

```typescript
import { enqueue, markConfirmed, recordFailure, type OutboxEntry } from '../lib/message-outbox';
import { withIdempotencyKey, isIdempotencyReplay } from '../lib/api-client';

async function sendMessage(message: string, opts?: { existingEntry?: OutboxEntry }): Promise<void> {
  const entry = opts?.existingEntry ?? await enqueue(profileId, 'interview', {
    surfaceKey: subjectId, content: message,
  });

  try {
    const res = await fetch(
      sseUrl,
      withIdempotencyKey({
        method: 'POST',
        body: JSON.stringify({ message: entry.content }),
        headers: { 'Content-Type': 'application/json' },
      }, entry.id)
    );

    if (isIdempotencyReplay(res)) {
      // Server already has the user message. Don't try to read the body as SSE —
      // it's a small JSON. Confirm and handle based on assistantTurnReady.
      const replayBody = await res.json() as {
        replayed: boolean;
        assistantTurnReady: boolean;
        latestExchangeId: string | null;
      };
      await markConfirmed(profileId, 'interview', entry.id);
      if (replayBody.assistantTurnReady) {
        // Both turns are persisted — refetch and render immediately.
        await refetchConversation(); // existing query invalidation
      } else {
        // User message is persisted but assistant reply is still pending.
        // Refetch so the user message appears, then hand control back to
        // the screen-level conversation poll (Layer 3 polling pattern) —
        // do NOT add a new poll mechanism here.
        await refetchConversation();
        // The existing poll loop (backoff 3→6→12 s, same as Layer 3 `completing` draft polling)
        // will pick up the assistant turn when it lands. No extra state needed.
      }
      return;
    }

    // Normal SSE consumption — existing logic. On `done` frame:
    //   await markConfirmed(profileId, 'interview', entry.id);
    // On any error frame:
    //   await recordFailure(profileId, 'interview', entry.id, errorString);
    //   throw new Error(errorString);
  } catch (err) {
    await recordFailure(
      profileId, 'interview', entry.id,
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
```

Preserve all existing UX (optimistic bubble, error toast). The outbox is additive.

- [ ] **Step 3: Tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-interview.ts src/lib/message-outbox.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

Update existing hook tests to expect outbox calls. Tighten — do NOT loosen.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/api-client.ts apps/mobile/src/hooks/use-interview.ts
git commit -m "feat(mobile): wire interview hook through message-outbox + replay-aware api-client [INTERACTION-DUR-L1]"
git push
```

---

## Task 9: Wire outbox into live tutoring (`use-session-actions.ts`)

**Files:**
- Modify: `apps/mobile/src/components/session/use-session-actions.ts`

Mirror Task 8 for the live tutoring flow. The `flow` parameter is `'session'`, the `surfaceKey` is `sessionId`. Same `existingEntry` opt-in.

- [ ] **Step 1: Locate the send entry point**

```bash
cd apps/mobile && grep -n "streamMessage\|sendMessage\|Idempotency" src/components/session/use-session-actions.ts | head -20
```

- [ ] **Step 2: Apply the same pattern as Task 8** — including `isIdempotencyReplay` short-circuit + `assistantTurnReady` branch: on `true` refetch and render; on `false` refetch and let the existing session poll loop (Layer 3 polling pattern, same 3→6→12 s backoff) pick up the assistant turn. Do NOT introduce a new poll mechanism.

- [ ] **Step 3: Tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/use-session-actions.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/session/use-session-actions.ts
git commit -m "feat(mobile): wire live-tutoring through message-outbox [INTERACTION-DUR-L1]"
git push
```

---

## Task 10: Top-level OutboxDrainProvider (drain + escalate on app launch)

**Files:**
- Create: `apps/mobile/src/providers/OutboxDrainProvider.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (or `(app)/_layout.tsx` — wherever the global providers mount)

This provider runs once per app launch (and on profileId change) and:
1. **Drains pending entries** for both flows (`session`, `interview`), oldest-first, single-flight per flow (one in-flight at a time, enforced by an in-memory promise chain inside the provider).
2. **Escalates permanently-failed entries** to `/support/outbox-spillover`. This is independent of any banner being mounted, so a user who never opens a session screen still has their failed messages backed up server-side.

The provider does NOT re-issue HTTP itself for pending entries — it calls back into the same `sendMessage` paths the hooks use, with `existingEntry` set so no double-enqueue happens.

- [ ] **Step 1: Implementation**

Create `apps/mobile/src/providers/OutboxDrainProvider.tsx`:

```typescript
import React, { useEffect } from 'react';
import { drain, escalate, listPermanentlyFailed, type OutboxFlow } from '../lib/message-outbox';
import { useProfile } from '../hooks/use-profile'; // existing
import { Sentry } from '../lib/sentry';

const FLOWS: OutboxFlow[] = ['session', 'interview'];

interface Props {
  children: React.ReactNode;
  /** Injected per-flow replay function — wired from the app root so the provider
   *  doesn't import session/interview hooks directly (avoids cycles). */
  replayHandlers: Record<OutboxFlow, (entry: import('../lib/message-outbox').OutboxEntry) => Promise<void>>;
}

export function OutboxDrainProvider({ children, replayHandlers }: Props) {
  const { profileId } = useProfile();

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    (async () => {
      for (const flow of FLOWS) {
        // 1) Escalate permanently-failed BEFORE replaying — these are stranded
        //    and should reach support_messages even if we crash mid-drain.
        try {
          await escalate(profileId, flow);
        } catch (err) {
          Sentry.captureException(err, { tags: { feature: 'outbox', op: 'escalate', flow } });
        }

        // 2) Drain pending entries serially.
        const pending = await drain(profileId, flow);
        for (const entry of pending) {
          if (cancelled) return;
          try {
            await replayHandlers[flow](entry);
          } catch (err) {
            // recordFailure was already called inside the handler — nothing more to do.
            Sentry.addBreadcrumb({
              category: 'outbox',
              level: 'warning',
              message: 'replay attempt failed',
              data: { flow, entryId: entry.id, attempts: entry.attempts + 1 },
            });
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [profileId]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Wire it at the app root**

In `apps/mobile/app/_layout.tsx` (or the highest layout that has access to profile + the hook factories):

```typescript
import { OutboxDrainProvider } from '../src/providers/OutboxDrainProvider';
// import the replay functions — these are tiny wrappers that call sendMessage
// with { existingEntry } so no double-enqueue happens.
import { replayInterviewMessage } from '../src/hooks/use-interview';
import { replaySessionMessage } from '../src/components/session/use-session-actions';

// inside the root component:
<OutboxDrainProvider replayHandlers={{ interview: replayInterviewMessage, session: replaySessionMessage }}>
  {/* existing tree */}
</OutboxDrainProvider>
```

The exported `replayInterviewMessage(entry)` and `replaySessionMessage(entry)` functions live next to their respective hooks and call into the shared `sendMessage` with `existingEntry: entry`.

- [ ] **Step 3: Provider test**

Create `apps/mobile/src/providers/OutboxDrainProvider.test.tsx`. Smoke-test that on mount with a non-empty pending queue the replay handler fires for each entry in order, and that escalate is called before drain.

- [ ] **Step 4: Tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest src/providers/OutboxDrainProvider.test.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/providers/OutboxDrainProvider.tsx apps/mobile/src/providers/OutboxDrainProvider.test.tsx apps/mobile/app/_layout.tsx apps/mobile/src/hooks/use-interview.ts apps/mobile/src/components/session/use-session-actions.ts
git commit -m "feat(mobile): top-level OutboxDrainProvider — drain + escalate on launch [INTERACTION-DUR-L1]"
git push
```

---

## Task 11: Spillover endpoint + table

**Files:**
- Create: `apps/api/drizzle/0046_support_messages.sql`
- Create: `packages/database/src/schema/support.ts` (and re-export from `index.ts`)
- Create: `apps/api/src/routes/support.ts`
- Create: `apps/api/src/routes/support.test.ts`
- Modify: `apps/api/src/index.ts` (mount the router)

LAST-RESORT path. After the OutboxDrainProvider escalates, the server writes each entry to `support_messages` for human review. Endpoint requires auth (so we know which profile) but does NOT trust entries blindly — content size, count, and shape are all bounded.

- [ ] **Step 1: Migration**

Create `apps/api/drizzle/0046_support_messages.sql`:

```sql
CREATE TABLE "support_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "flow" text NOT NULL,
  "surface_key" text NOT NULL,
  "content" text NOT NULL,
  "attempts" integer NOT NULL,
  "first_attempted_at" timestamp with time zone NOT NULL,
  "escalated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "failure_reason" text,
  "resolved_at" timestamp with time zone,
  "resolved_by" text
);

CREATE INDEX "support_messages_profile_idx" ON "support_messages" ("profile_id");
CREATE UNIQUE INDEX "support_messages_profile_client_id_uniq"
  ON "support_messages" ("profile_id", "client_id");
```

> Note: SQL `DEFAULT gen_random_uuid()` so raw inserts work even outside the Drizzle path. The Drizzle column also sets `$defaultFn(generateUUIDv7)` for app-side inserts (UUIDv7 for time-ordered scans).

- [ ] **Step 2: Drizzle table definition**

Create `packages/database/src/schema/support.ts`:

```typescript
import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    flow: text('flow').notNull(),
    surfaceKey: text('surface_key').notNull(),
    content: text('content').notNull(),
    attempts: integer('attempts').notNull(),
    firstAttemptedAt: timestamp('first_attempted_at', { withTimezone: true }).notNull(),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }).notNull().defaultNow(),
    failureReason: text('failure_reason'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    index('support_messages_profile_idx').on(table.profileId),
    uniqueIndex('support_messages_profile_client_id_uniq').on(table.profileId, table.clientId),
  ]
);
```

Re-export from `packages/database/src/schema/index.ts`.

- [ ] **Step 3: Tests (real DB integration, including dedupe break test)**

Create `apps/api/src/routes/support.test.ts`. Use the project's existing real-DB test harness (the same one `interview.test.ts` uses) — NOT internal mocks per CLAUDE.md "No internal mocks in integration tests".

```typescript
describe('POST /v1/support/outbox-spillover', () => {
  it('writes each stranded entry to support_messages and returns 200', async () => {
    const res = await app.request('/v1/support/outbox-spillover', {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        entries: [{
          id: 'client-id-1', flow: 'interview', surfaceKey: 'subj-1',
          content: 'Hello world', attempts: 3,
          firstAttemptedAt: '2026-05-01T10:00:00Z',
          failureReason: 'network-timeout',
        }],
      }),
    }, TEST_ENV);
    expect(res.status).toBe(200);
    const rows = await testDb.query.supportMessages.findMany({
      where: (t, { eq }) => eq(t.clientId, 'client-id-1'),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('Hello world');
  });

  it('is idempotent — same client_id submitted twice yields one row (DB break test)', async () => {
    const body = JSON.stringify({
      entries: [{
        id: 'dup-key', flow: 'session', surfaceKey: 's1',
        content: 'duplicate test', attempts: 3,
        firstAttemptedAt: '2026-05-01T10:00:00Z',
      }],
    });
    await app.request('/v1/support/outbox-spillover', { method: 'POST', headers: AUTH_HEADERS, body }, TEST_ENV);
    await app.request('/v1/support/outbox-spillover', { method: 'POST', headers: AUTH_HEADERS, body }, TEST_ENV);
    const rows = await testDb.query.supportMessages.findMany({
      where: (t, { eq }) => eq(t.clientId, 'dup-key'),
    });
    expect(rows).toHaveLength(1);
  });

  it('returns 400 for empty entries array', async () => { /* ... */ });
  it('returns 400 when content size exceeds the limit', async () => { /* huge string */ });
  it('returns 400 when more than 50 entries are submitted', async () => { /* ... */ });
});
```

- [ ] **Step 4: Run — should FAIL**

- [ ] **Step 5: Implement the route**

Create `apps/api/src/routes/support.ts`:

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { supportMessages } from '@eduagent/database';

const MAX_CONTENT_SIZE = 8_000;

const entrySchema = z.object({
  id: z.string().min(1).max(128),
  flow: z.enum(['session', 'interview']),
  surfaceKey: z.string().min(1).max(128),
  content: z.string().min(1).max(MAX_CONTENT_SIZE),
  attempts: z.number().int().nonnegative().max(100),
  firstAttemptedAt: z.string().datetime(),
  failureReason: z.string().max(500).optional(),
});

const bodySchema = z.object({
  entries: z.array(entrySchema).min(1).max(50),
});

export const supportRoutes = new Hono<{
  Bindings: {/* shared bindings */};
  Variables: { db: import('@eduagent/database').Database; profileId: string };
}>().post('/outbox-spillover', async (c) => {
  const profileId = c.get('profileId');
  const db = c.get('db');

  const json = await c.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: 'invalid-body', details: parsed.error.flatten() }, 400);
  }

  await db
    .insert(supportMessages)
    .values(parsed.data.entries.map((e) => ({
      profileId,
      clientId: e.id,
      flow: e.flow,
      surfaceKey: e.surfaceKey,
      content: e.content,
      attempts: e.attempts,
      firstAttemptedAt: new Date(e.firstAttemptedAt),
      failureReason: e.failureReason,
    })))
    .onConflictDoNothing({
      target: [supportMessages.profileId, supportMessages.clientId],
    });

  return c.json({ written: parsed.data.entries.length });
});
```

- [ ] **Step 6: Mount the router** in `apps/api/src/index.ts`:

```typescript
import { supportRoutes } from './routes/support';
// ...
.route('/support', supportRoutes)
```

- [ ] **Step 7: Migrate dev DB + run tests**

```bash
cd apps/api && pnpm run db:generate && pnpm run db:push:dev
pnpm exec jest src/routes/support.test.ts --no-coverage
```

Expected: PASS (including the DB-level dedupe break test).

- [ ] **Step 8: Commit**

```bash
git add apps/api/drizzle/0046_support_messages.sql apps/api/drizzle/meta/ packages/database/src/schema/support.ts packages/database/src/schema/index.ts apps/api/src/routes/support.ts apps/api/src/routes/support.test.ts apps/api/src/index.ts
git commit -m "feat(api): add outbox-spillover endpoint + support_messages table [INTERACTION-DUR-L1]"
git push
```

---

## Task 12: Outbox `escalate` + permanently-failed banner UX

**Files:**
- Modify: `apps/mobile/src/lib/message-outbox.ts` (add `escalate`)
- Create: `apps/mobile/src/components/durability/OutboxFailedBanner.tsx`
- Create: `apps/mobile/src/components/durability/OutboxFailedBanner.test.tsx`

`escalate` POSTs all permanently-failed entries to `/support/outbox-spillover` and on success deletes them locally. Called from the OutboxDrainProvider on launch (Task 10) AND from the banner's "Send to support" button as a manual retry.

The banner renders all permanently-failed entries with copy-to-clipboard. It uses the project's semantic theme tokens (per CLAUDE.md "shared mobile components stay persona-unaware. Use semantic tokens").

- [ ] **Step 1: Add `escalate` to message-outbox.ts**

```typescript
import { apiPost } from './api-client'; // adapt to whatever the project HTTP helper is

export async function escalate(profileId: string, flow: OutboxFlow): Promise<{ escalated: number }> {
  const failed = await listPermanentlyFailed(profileId, flow);
  if (failed.length === 0) return { escalated: 0 };

  const body = {
    entries: failed.map((e) => ({
      id: e.id, flow: e.flow, surfaceKey: e.surfaceKey, content: e.content,
      attempts: e.attempts, firstAttemptedAt: e.createdAt, failureReason: e.failureReason,
    })),
  };

  try {
    await apiPost('/support/outbox-spillover', body);
    for (const e of failed) await deletePermanentlyFailed(profileId, flow, e.id);
    return { escalated: failed.length };
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'message_outbox', op: 'escalate' } });
    return { escalated: 0 };
  }
}
```

Add corresponding tests to `message-outbox.test.ts`:
- escalate posts the right shape
- on 200, entries are deleted
- on failure, entries are kept and Sentry captures

- [ ] **Step 2: Build the banner** (use semantic tokens — adapt to the project's actual styled component primitives; raw `View`/`Text` here is illustrative)

Create `apps/mobile/src/components/durability/OutboxFailedBanner.tsx`:

```typescript
import React from 'react';
import { View, Text, Pressable, AccessibilityInfo, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { listPermanentlyFailed, deletePermanentlyFailed, type OutboxEntry, type OutboxFlow } from '../../lib/message-outbox';
import { useThemeTokens } from '../../theme/useThemeTokens'; // existing

interface Props {
  profileId: string;
  flow: OutboxFlow;
}

export function OutboxFailedBanner({ profileId, flow }: Props) {
  const tokens = useThemeTokens();
  const [entries, setEntries] = React.useState<OutboxEntry[]>([]);

  const refresh = React.useCallback(async () => {
    const failed = await listPermanentlyFailed(profileId, flow);
    setEntries(failed);
  }, [profileId, flow]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const failed = await listPermanentlyFailed(profileId, flow);
      if (!cancelled) {
        setEntries(failed);
        if (failed.length > 0 && Platform.OS === 'ios') {
          AccessibilityInfo.announceForAccessibility(`${failed.length} messages couldn't be sent`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [profileId, flow]);

  if (entries.length === 0) return null;

  return (
    <View
      testID="outbox-failed-banner"
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
      style={{ backgroundColor: tokens.surfaceWarning, padding: tokens.space.md }}
    >
      <Text style={{ color: tokens.textOnWarning }}>
        We couldn't save these messages — copy them?
      </Text>
      {entries.map((entry) => (
        <View key={entry.id} style={{ marginTop: tokens.space.sm }}>
          <Text numberOfLines={2} style={{ color: tokens.textOnWarning }}>{entry.content}</Text>
          <Pressable
            testID={`outbox-copy-${entry.id}`}
            accessibilityLabel={`Copy message: ${entry.content.slice(0, 60)}`}
            onPress={async () => {
              await Clipboard.setStringAsync(entry.content);
              await deletePermanentlyFailed(profileId, flow, entry.id);
              await refresh();
            }}
          >
            <Text style={{ color: tokens.textOnWarning, fontWeight: '600' }}>Copy</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 3: Component tests** (same pattern as the original plan, with `accessibilityLiveRegion` instead of `accessibilityRole="alert"`)

- [ ] **Step 4: Tests + typecheck**

```bash
cd apps/mobile && pnpm exec jest src/components/durability/OutboxFailedBanner.test.tsx src/lib/message-outbox.test.ts --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/message-outbox.ts apps/mobile/src/components/durability/OutboxFailedBanner.tsx apps/mobile/src/components/durability/OutboxFailedBanner.test.tsx
git commit -m "feat(mobile): outbox escalate + permanently-failed banner [INTERACTION-DUR-L1]"
git push
```

---

## Task 13: Add `outbox-pending-indicator` testID + Maestro break test

**Files:**
- Modify: `apps/mobile/src/components/session/MessageComposer.tsx` (or wherever the optimistic message bubble renders)
- Create: `apps/mobile/.maestro/durability/outbox-replay.yaml`

The Maestro flow needs a stable selector for the optimistic-pending state. Add `testID="outbox-pending-indicator"` to the bubble that renders while `entry.attempts === 0` (or similar — adapt to the existing optimistic-message rendering).

- [ ] **Step 1: Verify existing Maestro selectors**

```bash
grep -rn "testID=\"tab-home\"\|testID=\"subject-card-\|testID=\"start-session\"\|testID=\"session-resume\"" apps/mobile/src/ apps/mobile/app/
```

If any selector is missing, add it to the relevant component before writing the Maestro flow. Selectors are the contract — do NOT loosen the Maestro flow to skip a missing selector.

- [ ] **Step 2: Add `outbox-pending-indicator` to the optimistic bubble**

Locate the component that renders the just-sent (not-yet-confirmed) message. Add `testID="outbox-pending-indicator"` to the wrapping `View`. This is the signal Maestro uses to know the message hit the outbox.

- [ ] **Step 3: Maestro flow**

Create `apps/mobile/.maestro/durability/outbox-replay.yaml`:

```yaml
# [INTERACTION-DUR-L1] Break test for the message outbox.
# Verifies: when network drops mid-send and the app is force-quit, the message
# is replayed on the next launch and successfully persisted server-side.
appId: com.eduagent.mobile
---
- runFlow: ../auth.yaml
- tapOn: { id: "tab-home" }
- tapOn: { id: "subject-card-0" }
- tapOn: { id: "start-session" }
- runScript:
    script: |
      // Airplane mode ON
      shell exec "settings put global airplane_mode_on 1"
      shell exec "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true"
- inputText: "This message must survive a network drop"
- tapOn: { id: "send-button" }
- assertVisible: { id: "outbox-pending-indicator", timeout: 5000 }
- stopApp
- runScript:
    script: |
      shell exec "settings put global airplane_mode_on 0"
      shell exec "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false"
- launchApp
- runFlow: ../auth.yaml
- tapOn: { id: "tab-home" }
- tapOn: { id: "subject-card-0" }
- tapOn: { id: "session-resume" }
- assertVisible: "This message must survive a network drop"
- assertNotVisible: { id: "outbox-pending-indicator", timeout: 30000 }
```

- [ ] **Step 4: Run the flow**

```bash
maestro test apps/mobile/.maestro/durability/outbox-replay.yaml
```

If the flow fails on selector-not-found, add the missing testID. Do NOT loosen.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/MessageComposer.tsx apps/mobile/.maestro/durability/outbox-replay.yaml
git commit -m "test(mobile): maestro break test for outbox replay [INTERACTION-DUR-L1]"
git push
```

---

## Final validation

- [ ] **Step 1: Full type+lint+test sweep**

```bash
pnpm exec nx run-many -t lint --projects=api,mobile
pnpm exec nx run-many -t typecheck --projects=api,mobile
pnpm exec nx run-many -t test --projects=api,mobile
```

Expected: all green. If lint fails, FIX the code — do NOT add `eslint-disable` per CLAUDE.md "no suppression".

- [ ] **Step 2: Run the LLM eval harness (regression sanity)**

```bash
pnpm eval:llm
```

Layer 1 introduces no prompt changes; signal distributions should be unchanged. If drift appears, investigate before merging.

- [ ] **Step 3: PR & CI**

Per CLAUDE.md PR Review & CI Protocol — read every code-review finding, treat HIGH-severity findings as blocking.

```bash
gh pr checks <pr-number>
gh api repos/{owner}/{repo}/pulls/<pr-number>/reviews
```

---

## Self-review against the spec

### Spec coverage

| Spec section | Covered by |
|---|---|
| Layer 1 — outbox shape (OutboxEntry) | Task 7 |
| Layer 1 — Idempotency-Key pre-flight middleware (A2) | Task 3 |
| Layer 1 — KV-backed cache (A2, fast-path hint only) | Task 3 |
| Layer 1 — `client_id` column on session_events (A1) | Task 2 |
| Layer 1 — `client_id` on exchangeHistory[] JSONB (A1) | Task 2 + Task 4 |
| Layer 1 — Persistence-layer ON CONFLICT DO NOTHING dedupe (A1, authoritative) | Task 4 |
| Layer 1 — Spillover endpoint (A8) | Task 11 |
| Layer 1 — Permanently-failed UX (copy-to-clipboard) | Task 12 |
| Layer 1 — Inline confirm (A10, single write no deferred sweep) | Task 7 (`markConfirmed`) |
| Layer 1 — Profile-scoped storage (A9) | Task 7 |
| Layer 1 — Concurrency-safe AsyncStorage R-M-W (H1 fix) | Task 6 + Task 7 |
| Layer 1 — Top-level escalate not banner-conditional (H5 fix) | Task 10 |
| Layer 1 — Maestro break test | Task 13 |

### Critical-issue resolution table (from adversarial review)

| Finding | Resolution |
|---|---|
| **C1** SSE response cannot be cloned/replayed | Middleware redesigned to pre-flight only; never reads `c.res`. Mobile handles `Idempotency-Replay: true` header by refetching, not parsing replayed body. |
| **C2** exchangeHistory[] dedupe missing | Task 4 adds array-scan-before-append; consuming code wired in Task 5. |
| **C3** Single branch / multiple PRs contradiction | One branch (`interaction-durability-l1`), one PR, explicit staging-green gates between Tasks 1, 2, and 3. |
| **H1** AsyncStorage RMW race | Task 6 introduces `withLock`; Task 7 wraps every read-modify-write. Two concurrency break tests prove it. |
| **H2** `replaySendMessage` would double-enqueue | `sendMessage` now accepts `existingEntry`; OutboxDrainProvider passes it on replay. |
| **H3** KV eventual consistency | Documented; DB unique index + ON CONFLICT DO NOTHING is the authoritative dedupe. KV is acknowledged as a fast-path hint. |
| **H4** Silent skip on misconfig | Task 3 emits Sentry breadcrumbs tagged `feature: idempotency, state: binding_missing | profile_missing`. |
| **H5** Escalate only fires when banner mounts | Task 10's OutboxDrainProvider runs escalate on app launch independent of any screen. |
| **H6** Spillover dedupe test was an "API called" assertion | Task 11 step 3 includes a real-DB break test posting the same client_id twice and asserting `count=1`. |

### Type consistency

- `OutboxEntry.status`: `'pending' | 'permanently-failed'` — used consistently across outbox lib, banner, provider, and tests.
- `OutboxFlow`: `'session' | 'interview'` — same in lib, hooks, provider, middleware, and routes.
- `Idempotency-Key` header name: literal string, used identically in middleware, mobile helper, integration tests.
- `Idempotency-Replay` response header: only set by the middleware short-circuit; only checked by mobile via `isIdempotencyReplay`.
- Replay response body: `{ replayed: true, clientId, status: 'persisted', assistantTurnReady: boolean, latestExchangeId: string | null }` — typed as `IdempotencyReplayBody` in `api-client.ts`; asserted in Task 3 and Task 5 integration tests.
- Cache key shape: `idem:${profileId}:${flow}:${key}` — defined in `cacheKey()`, asserted in tests.
- Wire field name: `client_id` (snake_case) in JSON / JSONB; `clientId` (camelCase) in TS / Drizzle. Mapping happens at the writer boundary.

### What is NOT in this plan (Layer 2/3 territory)

- `orphan_reason` column on `session_events` and `exchangeHistory[]` — Layer 2.
- `persistUserMessageOnly` server-side helper as a deliberate primitive — Layer 2 (Layer 1's `persistUserMessage` is opportunistic).
- LLM context-builder rule for orphan turns — Layer 2.
- `DraftStatus` enum extension (`completing`, `failed`) — Layer 3.
- Inngest function `interview-persist-curriculum` — Layer 3.
- Mobile `completing` / `failed` UX with backoff polling — Layer 3.
- SUBJECT-09 break test (depends on Layer 3) — Layer 3.

These are deliberately out of scope. Layer 1 is independently mergeable and ship-able; SUBJECT-09 is mitigated (not yet fully fixed) by the device-side outbox + write-side dedupe.
