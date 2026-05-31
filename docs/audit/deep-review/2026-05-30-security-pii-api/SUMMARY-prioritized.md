# Security + PII Review — `apps/api/src` — Prioritized Summary (2026-05-30)

Coordinator's holistic re-prioritization of the `security` + `pii` agents, with manual
verification. Raw findings: [`security-reviewer.md`](./security-reviewer.md),
[`pii-leak-scanner.md`](./pii-leak-scanner.md).

**Scope:** path-scoped audit of `apps/api/src` (+ `packages/database/src` for the security
agent). Not a PR diff — all findings [PRE-EXISTING].

**Headline:** **No P0. No exploitable cross-tenant, auth-bypass, or children's-data-exposure
vulnerability.** Every one of the seven repo security invariants holds in the code read, each
backed by tracked fixes + guard tests. Both agents independently called the codebase
"exceptionally / notably well-hardened." Residual findings are data-minimization and
defense-in-depth, not active breaches.

---

## P1 — Should fix

### 1. Minor's session transcript placed into a third-party-persisted Inngest payload
- **Source:** pii-leak-scanner (H1) · **Verified by coordinator** (`filing.ts:175-180`, `244-249` — `sessionTranscript` is in the `app/filing.retry` `inngest.send` `data`; a fetch-by-`sessionId` fallback already exists at `:125-133`).
- **Loc:** `apps/api/src/routes/filing.ts:172-187`, `:240-255`
- **What leaks where:** a learner's free-text conversation transcript (a minor's own words —
  possibly homework content, names, locations) is serialized into the Inngest event payload,
  which Inngest **persists in its dashboard** (third-party processor) for the run's retention
  window. Audience: anyone with Inngest console access / vendor support.
- **Why P1:** real children's-PII over-exposure at a trust boundary the repo *already*
  recognizes — `[SEC-6/BUG-722]` in `resend-webhook.ts` masks a bystander email at this exact
  boundary "because Inngest payloads are persisted." That principle wasn't applied to the
  transcript. Not a breach/cross-user leak, but compliance-relevant given minors.
- **Fix (known, zero behavior loss):** send only `{ profileId, sessionId, sessionMode }` and
  re-fetch the transcript by `sessionId` in the handler — the pattern `freeform-filing.ts:151-160`
  already uses.

### 2. Tenant isolation has no DB-level backstop — RLS helper is defined but unwired
- **Source:** security-reviewer (L1, rated LOW→MEDIUM) · **Verified** (`withProfileScope` has zero callers outside its own def + tests).
- **Loc:** `packages/database/src/rls.ts:46-66`
- **What's wrong:** `docs/architecture.md` advertises "Neon RLS as defense-in-depth," but the
  helper that sets the per-txn GUC has **no callers** — isolation rests *entirely* on
  app-layer `WHERE profile_id = …` predicates. That layer is currently correct and tested,
  but there is no second line of defense.
- **Why P1 (raised from the agent's LOW):** the blast radius if one future query forgets the
  predicate is catastrophic and exactly the worst case — cross-tenant **children's** data —
  while the mitigation is cheap. This is "the primary control is the only control."
- **Fix:** either wire `withProfileScope` + real RLS policies, **or** add a forward-only
  lint/AST guard forbidding raw `db.select().from(<tenant table>)` outside `repository.ts`
  (converts "someone forgot the predicate" from a runtime breach into a CI failure), **and**
  reconcile the architecture-doc claim either way.

---

## P2 — Worth noting

- **Truncated LLM output (minor-derived) shipped to Sentry** — `learner-profile.ts:1782`
  (`rawSlice` 500 chars), `learner-input.ts:134,145` (`rawResponseTrunc` 200 chars). On the
  parse-failure path a slice can echo a minor's phrasing into Sentry (broad audience,
  indefinite retention). Sibling extractors already log shape-only
  (`rawResponseLength`, `transcriptTurns`). Fix: log `responseLength`/`jsonFound`/Zod `issues`,
  not content. *(pii M1)*
- **Child display name memoized into Inngest step state** — `progress-summary.ts:85` + a 7-site
  sweep (`weekly-progress-push.ts`, `weekly-self-reports.ts`, `recall-nudge-send.ts`,
  `session-completed.ts:1120`, `monthly-report-cron.ts`). Same trust-boundary class as P1#1,
  lower sensitivity (name vs full transcript). Fix or record a deferred sweep with a tracked
  ID per CLAUDE.md "Sweep when you fix." *(pii M2 + sweep)*
- **CORS reflects any `localhost`/`127.0.0.1` origin with `credentials:true` in all
  environments** — `index.ts:167-169` (not `ENVIRONMENT`-gated; production allowlist *is*).
  Hard to weaponize (browser SOP; native client uses bearer tokens not cookies), but
  malware/hostile app serving from localhost could make credentialed calls the policy accepts.
  Fix: gate the localhost branch behind `ENVIRONMENT !== 'production'`. *(sec L3)*
- **`SET LOCAL … = '${profileId}'` via `sql.raw`** — `rls.ts:62`. Currently safe (strict UUID
  regex immediately above) but fragile, and untested in a live path because the helper is
  unused (ties to P1#2). Prefer `set_config('app.current_profile_id', $1, true)`. *(sec L2)*

---

## Compliance / awareness (no code defect)

- **Child first name sent to Gemini/OpenAI every exchange** — `exchange-prompts.ts:509-511,596-600`.
  Intentional, minimized (name only; birth year converted to a tone band by `getAgeVoice`,
  never sent; sanitized + length-capped; framed "data only"). Action: confirm the provider DPA
  + privacy notice cover a minor's first name; consider a "don't send my name to the tutor"
  opt-out. **Never** add birth year/email/location to prompts. *(pii L1)*
- `console.debug` in `xp.ts:160` bypasses the structured logger (no PII) — sweep to `logger.debug`. *(pii L2)*
- `X-Maintenance-Secret`/`X-Test-Secret` are header-only + constant-time compared (correct) —
  keep them out of query strings. `development` skips the seed secret (fail-closed for prod) —
  never run `ENVIRONMENT=development` against a real DB. *(sec L4/L5, informational)*

---

## Verified clean (high-confidence, both agents)

JWT (alg:none reject, RS→HS downgrade block, mandatory issuer+audience, skew/maxAge, JWKS
rotation→503-not-401); scoped-repo `WHERE profile_id` on every read + parent-chain joins in a
single SELECT (no raw `db.*` in routes); parent→child IDOR gating (`assertOwnerAndParentAccess`,
404-not-403 to hide UUID existence); server-derived owner/proxy gating (fails closed, not the
client header); LLM envelope + server-owned challenge-round mastery (every concept `solid`,
LLM-supplied event IDs re-validated against scoped rows); Stripe/RevenueCat/Resend webhook
signature verification on raw body, timing-safe, sandbox-in-prod rejection; seed routes
fail-closed in prod; no hardcoded secrets; no SSRF (constant provider URLs); prod error
responses generic; consent re-checked in background jobs; profile responses via vetted DTO;
Sentry user scope = opaque id only; request logger logs `path` not `url`.

---

## Coverage caveat (drives the next run)

The security agent read the trust-boundary core thoroughly but did **not** exhaust all 45
route groups / 58 Inngest functions. **The least-covered surface is the Inngest functions** —
they run *outside* the Hono auth chain, resolve scope from event payloads, and use
`process.env`-based config. Both the residual PII findings (H1/M2) and the coverage gap point
the same way: **a focused Inngest-functions security/PII pass is the natural follow-up.**

## Severity summary (agent scale)
security: 0 critical / 0 high / 5 low · pii: 1 high / 2 medium / 2 low
