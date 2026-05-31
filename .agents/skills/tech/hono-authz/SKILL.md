---
name: hono-authz
description: >
  Default-deny authorization architecture for Hono APIs — making access
  control a property of the router, not an opt-in each handler must remember.
  Use when adding or reviewing auth/ownership/role/tenant guards on Hono routes,
  when a write endpoint might be missing an authorization check, or when the
  same ownership check is copy-pasted across many handlers. Companion to the
  hono-routing skill (which covers middleware mechanics); this covers the
  authorization *pattern*. Triggers on: "authorization", "access control",
  "ownership check", "proxy mode", "tenant isolation", "default deny",
  "missing auth guard", "IDOR", app.use with auth, requireX middleware.
license: MIT
user-invocable: false
metadata:
  tags: hono, authorization, access-control, middleware, default-deny, idor, tenant-isolation, security
---

# Hono Authorization Architecture

**IMPORTANT:** This skill assumes the middleware mechanics covered by the `hono-routing`
skill (onion model, `createMiddleware`, `c.set`/`c.get` typed Variables, registration
order). Verify exact Hono APIs against `https://hono.dev/docs/guides/middleware` before
writing. This skill adds the one thing that pack omits: **how to structure authorization
so endpoints are secure by construction.**

## The core problem: opt-in authorization rots

When every handler is individually responsible for calling its own auth check, security
becomes a function of developer memory. The failure is systemic, not local:

- A new endpoint ships without the check — nobody notices, because nothing *requires* it.
- The same ownership check is pasted into 20 handlers; one copy drifts or is forgotten.
- A reviewer can't tell "intentionally public" from "forgot the guard" — both look like a
  handler with no auth call.

This is the shape behind most IDOR / broken-access-control findings: not a *wrong* check,
a *missing* one. The fix is architectural — **make the absence of a decision fail closed.**

## Principle: default deny

The router should deny by default and require each route to *prove* it may proceed —
either by passing a guard, or by being explicitly listed as public. "I didn't write a
check" must resolve to 403, never 200.

```
                 ┌─────────────────────────────────────────┐
  request ──────▶│ authn (who are you?)        — sets identity│
                 ├─────────────────────────────────────────┤
                 │ context  (what scope?)      — sets tenant │
                 ├─────────────────────────────────────────┤
                 │ authz / write-guard (may you?) — DENY here│
                 ├─────────────────────────────────────────┤
                 │ handler (assumes already authorized)      │
                 └─────────────────────────────────────────┘
   public routes are an EXPLICIT allowlist that skips authn — never the default
```

## Pattern 1 — Identity & scope as typed context, set once

Resolve *who* and *what tenant/scope* in middleware, store on typed `Variables`, and make
the server-derived value the only one handlers read. Never let a handler re-derive identity
from a client-supplied header/body — that's the injection point.

```typescript
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

type AuthVars = { identity: { accountId: string }; scope: { tenantId: string; isOwner: boolean } }

const authn = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const identity = await verifyCredential(c.req.header('authorization'))  // server-verified
  if (!identity) throw new HTTPException(401, { message: 'unauthenticated' })
  c.set('identity', identity)
  await next()
})

// Resolve the scope server-side from the identity + a requested id, and PROVE it belongs.
const scope = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const requestedTenant = c.req.header('x-tenant-id')                     // client-supplied = untrusted
  const resolved = await resolveOwnedScope(c.get('identity'), requestedTenant)
  if (!resolved) throw new HTTPException(403, { message: 'forbidden' })   // not yours → deny
  c.set('scope', resolved)                                                // handlers read THIS, not the header
  await next()
})
```

Handlers then read `c.get('scope')` — a value the server vouches for — and never re-read the
raw header. The trust boundary is crossed exactly once, in middleware.

## Pattern 2 — Mount the guard on the router, not in each handler

Register the guards with `app.use()` on the route group so **every** route under it inherits
them. Order matters (onion model): authn → scope → write-guard → handler. A new endpoint
added to the group is protected the moment it exists — there is no "remember to add the
check" step.

```typescript
const api = new Hono<{ Variables: AuthVars }>()
api.use('*', authn)               // everything past here is authenticated
api.use('*', scope)               // …and scoped to a proven-owned tenant

// A sub-app for routes that also require write authority (e.g. block proxy/impersonation):
const writes = new Hono<{ Variables: AuthVars }>()
writes.use('*', requireWriteAuthority)   // one guard, all writes under it
writes.post('/subjects', createSubject)  // inherits authn + scope + write-guard automatically
writes.patch('/subjects/:id', editSubject)
api.route('/', writes)
```

```typescript
// The reusable write guard — defined ONCE, not pasted per handler
const requireWriteAuthority = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const { isOwner } = c.get('scope')
  const impersonating = c.req.header('x-proxy-mode') === 'true'
  if (impersonating || !isOwner) {
    throw new HTTPException(403, { message: 'read-only in this context' })  // fail closed
  }
  await next()
})
```

## Pattern 3 — Public is an explicit allowlist, never the default

Routes that legitimately skip authn (health, webhooks, public callback pages) are
enumerated in **one named list**. Everything not on it inherits the guards. This makes
"intentionally public" auditable and impossible to confuse with "forgot the guard."

```typescript
const PUBLIC_PATHS = new Set(['/health', '/webhooks/stripe', '/consent/respond'])

const authnUnlessPublic = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()   // explicit, greppable exception
  return authn(c, next)
})
```

> Webhooks that skip authn are not "unauthenticated" — they must still verify a provider
> signature/secret. Skipping your auth ≠ skipping all auth. (See the relevant provider
> skill for signature verification.)

## Pattern 4 — Authorize the *object*, not just the *verb*

Group-level guards answer "may this caller write at all?" They do **not** answer "does this
specific `:id` belong to this caller?" That object-level check must still happen — but
through one shared helper that fetches *scoped to the caller's tenant*, so an
unauthorized id returns not-found rather than another tenant's row.

```typescript
// ❌ verb authorized by middleware, but object ownership never proven → cross-tenant IDOR
writes.patch('/topics/:id', async (c) => {
  await db.update(topics).set(c.req.valid('json')).where(eq(topics.id, c.req.param('id')))
})

// ✅ fetch scoped to the proven tenant; "not yours" collapses to 404
writes.patch('/topics/:id', async (c) => {
  const owned = await findOwnedTopic(c.get('scope').tenantId, c.req.param('id'))
  if (!owned) throw new HTTPException(404)
  await db.update(topics).set(c.req.valid('json')).where(eq(topics.id, owned.id))
})
```

One `findOwned*` helper per resource, always filtering by the server-derived scope, kills the
"trusted the id from the URL" class.

## Review checklist

- [ ] Is authz mounted via `app.use()` on the route group, so new routes inherit it — rather
      than each handler calling its own check?
- [ ] Does a route with **no** auth code resolve to **deny** (because the group guards it),
      or to **allow** (because nothing ran)? It must be deny.
- [ ] Are public routes an explicit named allowlist, not the default-through case?
- [ ] Do handlers read identity/scope from server-set `c.get(...)`, never re-derived from a
      client header/body?
- [ ] Is the per-object ownership check present *and* routed through one shared
      tenant-scoped fetch helper (not an unscoped `where(eq(id, param))`)?
- [ ] Is the write/role/impersonation guard defined once and reused, not copy-pasted?
- [ ] Webhook/public routes that skip authn — do they still verify a signature/secret?

## Why architectural, not per-handler

A per-handler check protects the handler you remembered. A router-level default-deny
protects the handler you'll write next year and forget to guard. Broken-access-control
findings cluster on the *forgotten* endpoint — so the durable fix moves the decision to a
seam every route must pass through, and makes "no decision" mean "denied."
