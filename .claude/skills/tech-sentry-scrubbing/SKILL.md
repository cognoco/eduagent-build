---
name: sentry-scrubbing
description: >
  Keep PII and secrets out of Sentry — client-side scrubbing of errors,
  breadcrumbs, transactions, and URLs before they leave the SDK. Use when
  initializing or reviewing a Sentry SDK setup, when error/trace payloads might
  carry user data, request bodies, query strings, tokens, or internal state,
  or when wiring beforeSend/beforeBreadcrumb. Triggers on: Sentry.init,
  sendDefaultPii, beforeSend, beforeBreadcrumb, beforeSendTransaction,
  "PII in Sentry", "scrub", "redact", "secret in breadcrumb", "data scrubbing".
  Baseline: Sentry JavaScript-family SDKs (browser, node, cloudflare,
  react-native).
license: MIT
user-invocable: false
metadata:
  tags: sentry, observability, pii, data-scrubbing, secrets, privacy, error-tracking, security
---

# Sentry Scrubbing

**IMPORTANT:** Sentry SDK options and defaults differ across SDKs and versions
(`sendDefaultPii`'s default, available hooks, integration names). Verify against
`https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/` and the
specific SDK's page before writing. Prefer retrieval over memorized option names.

## Principle: scrub at the SDK, before it leaves the process

Sentry offers server-side scrubbing too, but the data has already left your environment by
then. **Client-side scrubbing (`beforeSend` / `beforeBreadcrumb`) is the one that guarantees
sensitive data never crosses the network.** Sentry's own guidance: use these hooks "to scrub
any data before it is sent, to ensure that sensitive data never leaves the local"
environment. Treat server-side scrubbing as defense-in-depth, not the primary control.

Trade-off to state plainly: client-side scrubbing requires a redeploy to change. That's the
correct cost for a privacy boundary — the alternative is sensitive bytes at rest on a vendor.

## The five places PII/secrets leak into Sentry

A reviewer should check each:

1. **`sendDefaultPii`** — when `true`, the SDK attaches IP, request headers, cookies, and
   user identifiers automatically. For apps handling sensitive or minors' data, set it
   **`false`** and attach only the non-identifying context you choose.
2. **Breadcrumbs** — automatic breadcrumbs capture `console` logs, HTTP requests (incl.
   **query strings**), and DB queries. Free-text logs and URLs with tokens/ids land here.
3. **Transaction / span names & URLs** — `/users/1234/details?token=abc` becomes a
   transaction name; the id and the `?token=` ride along.
4. **Request context** — bodies, headers (`authorization`, `cookie`), and full URLs on the
   captured request.
5. **Error/event extras** — `extra`, `contexts`, `tags`, and **stack-local variables** can
   contain whatever was in scope: raw user text, model output, keys built into a URL.

## Pattern: redact in the SDK hooks

```javascript
Sentry.init({
  dsn: env.SENTRY_DSN,
  sendDefaultPii: false,                       // do not auto-attach IP / headers / user PII

  // Errors, messages — runs before send; return null to drop the event entirely
  beforeSend(event, hint) {
    if (event.user) { delete event.user.email; delete event.user.ip_address; }
    event.request = scrubRequest(event.request);   // strip query string, auth/cookie headers, body
    if (event.transaction) event.transaction = stripUrlSecrets(event.transaction);
    return event;
  },

  // Breadcrumbs — runs per crumb; return null to drop it
  beforeBreadcrumb(breadcrumb, hint) {
    if (breadcrumb.category === 'console') return null;          // drop free-text logs wholesale
    if (breadcrumb.data?.url) breadcrumb.data.url = stripUrlSecrets(breadcrumb.data.url);
    return breadcrumb;
  },

  // Transactions/spans — performance payloads carry URLs too
  beforeSendTransaction(event) {
    if (event.transaction) event.transaction = stripUrlSecrets(event.transaction);
    return event;
  },
})

function stripUrlSecrets(s) {
  return s
    .replace(/([?&](?:token|key|api[_-]?key|signature|code|access_token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/[id]') // UUID path segs
}
```

## Specific traps

- **Secret in the URL is the worst case.** An API key passed as a query parameter
  (`?key=...`) is captured in HTTP breadcrumbs *and* spans — two leak paths from one mistake.
  Fix the call site (move the secret to a header), and scrub the query string in the hooks as
  a backstop. Don't rely on scrubbing alone for a secret that shouldn't be in a URL at all.
- **Don't ship raw LLM/model output or full transcripts to `extra`.** Truncate and tag, or
  omit. Model output can contain user PII and is high-volume.
- **Don't put raw cache/query keys or internal identifiers in tags/breadcrumbs** if they
  encode user or tenant data — they become searchable PII in the Sentry UI.
- **Allowlist, don't blocklist, when feasible.** Deleting known-bad fields misses the field
  added next quarter. Where the SDK supports it, attach only an explicit set of safe context
  rather than capturing everything and removing some.
- **`beforeSend` returning `null` drops the event** — use it to suppress whole classes of
  events you never want (e.g. known-noisy or sensitive paths).

## Platform notes (same hooks, different surface)

- **Edge/serverless (e.g. Cloudflare Workers):** the request object and env bindings are easy
  to over-capture; ensure secrets in `env`/bindings never reach `extra`/`contexts`. Same
  `beforeSend`/`beforeBreadcrumb` API.
- **Mobile (React Native):** breadcrumbs include navigation and network; scrub route params
  that carry ids/tokens, and avoid attaching device-identifying data when handling sensitive
  users.

## Review checklist

- [ ] Is `sendDefaultPii` explicitly `false` for sensitive/minor-data apps (not left default)?
- [ ] Is there a `beforeSend` that strips request query strings, `authorization`/`cookie`
      headers, and bodies?
- [ ] Is there a `beforeBreadcrumb` that drops or scrubs `console` and HTTP breadcrumbs?
- [ ] Is `beforeSendTransaction` (or equivalent) scrubbing URLs/ids in span/transaction names?
- [ ] Are any secrets passed in URLs (query params)? Fix the call site **and** scrub.
- [ ] Is raw LLM output / full transcript / raw cache key kept out of `extra`/`tags`?
- [ ] Is the scrubbing client-side (in the SDK), not relying solely on Sentry server-side rules?
