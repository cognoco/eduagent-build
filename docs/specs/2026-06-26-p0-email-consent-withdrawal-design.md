# P0 — Email-Parent Consent Withdrawal (bearer-token web flow)

> **Status (updated 2026-07-03): SHIPPED.** Implemented and merged in PR #1530
> (`services/consent-withdrawal-token.ts`, `routes/consent-web.ts`,
> `services/identity-v2/consent-v2.ts`); withdrawal-authority model recorded in
> [`MMT-ADR-0029`](../adr/MMT-ADR-0029-bearer-token-consent-withdrawal-authority.md).
> An as-shipped copy of this design (without this status banner) is archived at
> `docs/_archive/specs/Done/2026-06-26-p0-email-consent-withdrawal-design.md`.
> Remaining launch-gate items (minting `CONSENT_WITHDRAWAL_TOKEN_SECRET` /
> `ANALYTICS_HASH_KEY` in production, Resend SPF/DKIM, live E2E) are tracked
> under `WI-1340` and are operator-gated, not design-incomplete.

> **Superseded in part (2026-07-19, `WI-2348` / `OPQ-114`): bearer-token
> restore removed.** Everything below describing `POST /consent-page/restore`
> as a mutating, bearer-token-authorized restore (§5.2, §5.3, §5.4, §7, §8) is
> historical — that path was removed. `POST /consent-page/restore` now never
> mutates; it always returns a "sign in to restore" informational page
> regardless of token validity. `restoreConsentByToken` no longer exists.
> Restore is authenticated-guardian-only, via `restoreConsentV2` /
> `PUT /consent/:childProfileId/restore`. See
> [`MMT-ADR-0029`](../adr/MMT-ADR-0029-bearer-token-consent-withdrawal-authority.md)
> (amended) and Cosmo finding T-11.

- **Date:** 2026-06-26
- **Status:** Draft (design — awaiting review before plan). **Rev 2
  (2026-06-26):** durable withdrawal link relocated from the consent *request*
  email to a new **post-approval confirmation email** (the email parents
  actually return to later), and dropped from the pre-approval request email,
  per end-user UX review.
- **Owner:** (TBD on claim)
- **Layer:** Compliance / consent (live identity-v2 machine)
- **Relates to:** logical-gap-audit `consent-1`, `consent-2`, `identity-5` (`docs/audit/2026-05-31-logical-gap-audit.md`); the larger `family-3` link-account gap is **P1**, out of scope here.

---

## 1. Problem

A **self-registered minor** (age 13–16) creates their own account; the API marks
their profile consent-required and the parent approves by clicking a link in an
email (`consent-web.ts` → `processConsentResponseV2`). After approval the parent
has **no account, no app, no login** — the only thing the system knows about them
is the `guardian_email` recorded on the `consent_request` row.

Today that parent **cannot withdraw the consent they gave**:

- The only withdrawal authority in code is `revokeConsentV2`
  (`apps/api/src/services/identity-v2/consent-v2.ts:585`), gated by
  `isGuardianOf(guardianPersonId, chargePersonId)` (line 592). The email-parent
  has no `person` row and no guardianship edge, so every existing withdrawal
  path is closed to them.
- The consent decision page literally promises the opposite:
  *"You can withdraw consent at any time from the parent dashboard in the app."*
  (`apps/api/src/routes/consent-web.ts:292`) — a dashboard this parent can never
  reach.

This is a live **GDPR Art. 7(3)** exposure (withdrawal must be as easy as giving
consent) and is reachable the moment public sign-up opens — `create-profile.tsx`
admits birth dates ≥13, the ≤16 branch sets `needsConsentFlow`
(`create-profile.tsx:399-401`), and the app shell gates the minor until a parent
consents (`(app)/_layout.tsx:588-589`).

### Two structural constraints the code imposes

1. **No edge to authorize against.** Withdrawal authority cannot be a
   guardianship edge for this parent — there is none. P0 introduces a
   **bearer-token** authority: possession of a signed link emailed to the
   `guardian_email` is the proof, mirroring exactly the trust model already used
   for the approval link.
2. **The consent token is dead after approval.** On approval the
   `consent_request` row becomes `status='approved'` with `responded_at` stamped,
   and `getChildNameByTokenV2` returns null for a responded request
   (`consent-v2.ts:819`). The 7-day consent token cannot be reused. Withdrawal
   needs its **own durable, non-expiring handle**, because withdrawal must be
   available "at any time."

---

## 2. Goals / Non-goals

### Goals

- Give the email-consenting parent a **self-service, no-login** way to withdraw
  the consent they gave, reachable from the email they already received.
- Keep withdrawal **as easy as the approval** (one click → one confirm → done),
  with no new account and no app install. The durable withdrawal link lives in a
  **single post-approval confirmation email** — the email a parent will actually
  find later when they decide to withdraw (the original "consent required" email
  is archived or deleted once actioned, so it is not a reliable home). This one
  email is the only deliberate addition over the leanest possible design, and it
  is what makes withdrawal genuinely "as easy as giving" per Art. 7(3) rather
  than an inbox-archaeology exercise.
- On withdrawal, **stop processing immediately** (status → `WITHDRAWN`, the
  minor is gated out by the existing consent gate) and **delete the data after a
  7-day grace**, matching the managed-child outcome — via an edge-free path.
- Offer **undo within the 7-day grace** so an accidental click is recoverable.
- Fix the false "parent dashboard" promise copy.

### Non-goals (explicitly out of scope)

- **Link-account / invite ceremony (P1).** P0 is deliberately disposable; when
  P1 gives the parent a real account + guardianship edge, the proper in-app
  dashboard withdrawal subsumes this and the bearer-token flow can be retired.
- **The managed-child path.** Parent-created children keep their existing in-app
  owner dashboard withdrawal (`PUT /v1/consent/:child/revoke`). Untouched.
- **The per-jurisdiction self-consent matrix (P2).**
- **The minor's own erasure.** The minor already has in-app account deletion as
  the owner of their own account (`more/privacy.tsx:151` → `/delete-account`,
  gated by `showExportDelete`). No change needed; this spec is strictly the
  *parent's independent* withdrawal right.
- **Data backfill.** Pre-launch, zero existing approved consents.

---

## 3. Design overview

Mirror the existing email-consent approval flow in reverse, reusing the
`consent-web` router's middleware, layout, rate-limiter, and error-page pattern:

1. A **stateless signed withdrawal token** (HMAC-SHA256, no DB column, no
   migration) encoding `chargePersonId + organizationId` for the GDPR basis.
2. The token is delivered as a **"Manage / withdraw consent anytime" link**
   inside (a) a **new post-approval confirmation email** sent the moment the
   parent approves (the durable home the parent returns to), and (b) the approval
   landing page (immediate, but ephemeral). The token is **not** placed in the
   pre-approval consent *request* email — a withdraw affordance is meaningless
   before consent exists and only adds a confusing "exit before you enter".
3. **Public web routes** under `consentWebRoutes`: a two-step confirm/execute
   for withdrawal, plus an undo (restore) within grace.
4. **Token-authorized service functions** that perform the withdrawal/restore
   using the *same core mutations* as `revokeConsentV2` / `restoreConsentV2`,
   but with bearer-token authority substituted for the `isGuardianOf` edge
   check (achieved by extracting each function's post-authorization core).
5. A **dedicated, edge-free grace→delete Inngest function** for the email-parent
   case (the existing `consent-revocation` function is parent-person/edge-coupled
   and cannot be reused — see §5.5).
6. **Copy fix** at `consent-web.ts:292`.

---

## 4. Detailed design — token

### 4.1 Format

A compact signed token, URL-safe, no storage:

```
token = base64url(payload) + "." + base64url(hmacSha256(secret, base64url(payload)))
payload = `cw1:${chargePersonId}:${organizationId}`        // "cw1" = consent-withdrawal v1, GDPR basis implied
```

- **Secret:** a dedicated Doppler secret `CONSENT_WITHDRAWAL_TOKEN_SECRET`,
  surfaced through the typed config object (never a raw `process.env` read —
  eslint G4). Add `consentWithdrawalTokenSecret: string` to the API config
  schema and its loader. The secret is independent of the consent *response*
  token so a leak of one never compromises the other.
- **No expiry.** Withdrawal must be available at any time (Art. 7(3)); a
  time-boxed token would silently strip the right. (Contrast: the *consent*
  token is short-lived because consent must be timely.)
- **Verification:** decode payload, recompute the HMAC, compare with
  `crypto.timingSafeEqual` (constant-time — no signature-oracle). Reject on any
  mismatch, malformed payload, or unknown prefix with the standard "invalid
  link" page.

### 4.2 Why stateless (vs a stored `withdrawal_token` column)

P0 is disposable. A stateless signed link adds **no column, no migration, and
nothing to clean up** when P1 replaces it. The cost is that the token cannot be
individually revoked/rotated; that is acceptable because (a) withdrawal is
non-destructive within the 7-day grace and reversible via the undo link, and
(b) the token authorizes *only* withdrawal/restore for one child — never data
export, never any read of the child's content. The leak blast-radius is "a
stranger could pause this one child's account, recoverable for 7 days," which is
low-harm and self-healing. This tradeoff is called out explicitly for QA/review.

### 4.3 Helper module

New `apps/api/src/services/consent-withdrawal-token.ts`:

```ts
export function signWithdrawalToken(
  chargePersonId: string,
  organizationId: string,
  secret: string,
): string;

export function verifyWithdrawalToken(
  token: string,
  secret: string,
): { chargePersonId: string; organizationId: string } | null; // null = invalid
```

Pure functions, no DB. Unit-tested in isolation (forge/tamper/empty/expired-not-applicable).

---

## 5. Detailed design — flows

### 5.1 Delivery (one post-approval confirmation email)

The withdrawal token only needs to exist **after** approval, so it is generated
and delivered at the moment of approval — not at request time.

- **Post-approval confirmation email (new — the durable home).** Add
  `formatConsentApprovedEmail(parentEmail, childName, withdrawalUrl)` to
  `apps/api/src/services/notifications/email.ts` (type `'consent_approved'`),
  sent from the `approved` branch of `consent-web.ts`
  `POST /consent-page/confirm` (line 434) after `processConsentResponseV2`
  succeeds. The body confirms the approval and carries the withdrawal link:
  *"You approved ${childName}'s MentoMate account. You can manage or withdraw
  your consent at any time using the link below: ${withdrawalUrl}"* where
  `withdrawalUrl = ${appUrl}/v1/consent-page/withdraw?token=${withdrawalToken}`.
  The token is computed from `chargePersonId + organizationId`;
  `processConsentResponseV2` already returns `chargePersonId` (extend its return
  to also surface `organizationId`, or re-resolve it). The send rides the
  existing email path and must **not** block or 500 the approval response — the
  approval has already committed; a delivery failure is captured (Sentry /
  `EmailDeliveryError` handling) but swallowed for the user.
- **Approval landing page (immediate, ephemeral).** In the same `approved`
  branch, also render a line on the landing page: *"To withdraw consent at any
  time, use the link we just emailed you — or this link:"* with the same
  withdrawal URL. A convenience for the parent who acts immediately, backed by
  the durable email for everyone else.
- **Pre-approval consent *request* email — unchanged.** No withdrawal link is
  added to `formatConsentRequestEmail`. This removes both the confusing
  pre-approval affordance and the "clicked withdraw before approving" edge case.

A withdrawal link can only ever resolve against a current grant; if one is
somehow followed with no grant present (a stale link, a never-completed
approval) it renders a friendly "nothing to withdraw" page (§5.4) — a safe
no-op.

### 5.2 Web routes (new, in `consentWebRoutes`)

All inherit the existing `.use('*')` security headers (X-Frame-Options DENY,
CSP, nosniff) and use `consentPageRateLimit`, `pageLayout`, `escapeHtml`,
`errorActionHtml`.

- **`GET /consent-page/withdraw?token=X`** — rate-limit (`'view'`), verify token.
  - invalid/forged → "invalid link" 400/404 page.
  - valid, current GDPR grant exists & not withdrawn → render an **"Are you
    sure?"** confirm page (mirrors `deny-confirm`, line 303): explains that
    withdrawing stops processing `${childName}`'s data and deletes it after a
    7-day grace, with a POST **"Yes, withdraw consent"** button and a
    **"Keep consent"** back link.
  - valid, grant already withdrawn & within grace → render the **withdrawn**
    landing with an **"Undo (restore)"** POST button (§5.4).
  - valid, no current grant (not yet approved, or already deleted) → "nothing to
    withdraw" friendly page.
- **`POST /consent-page/withdraw`** — parse body, require `token`, rate-limit
  (`'submit'`), verify token, call `withdrawConsentByToken` (§5.3). On success,
  render the withdrawn landing with the undo button and child-side copy. Mutation
  is POST-only (CSRF/prefetch safety, matching the `confirm` route's rationale at
  line 364-369); the two-step GET→POST prevents an email link-prefetcher from
  auto-withdrawing.
- **`POST /consent-page/restore`** — same guards; call `restoreConsentByToken`
  (§5.3). Renders "consent restored" landing. Outside grace →
  `ConsentGracePeriodExpiredError` → friendly "grace expired, data already
  removed" page.

`childName` for these pages is resolved by a new edge-free read
`getPersonDisplayNameV2` (already exists, `consent-v2.ts:1010`).

### 5.3 Token-authorized services (edge-free cores)

The withdrawal/restore **mutations** are identical to the existing edge-gated
functions; only the authorization differs. Extract each function's post-auth
core into an internal, then add a token wrapper:

```ts
// consent-v2.ts — refactor (behavior-preserving for existing callers)

// internal: the stamp-withdrawn-at + clear-nudges tx, NO authority check
async function stampWithdrawal(db, chargePersonId, organizationId, basis, auditFact): Promise<RevokeConsentV2Result>;

// existing public — now: isGuardianOf check, then stampWithdrawal(... { source:'guardian_revocation', guardianPersonId })
export async function revokeConsentV2(...) // unchanged signature & behavior

// new public — bearer authority, then stampWithdrawal(... { source:'email_parent_revocation', requestIp, userAgent })
export async function withdrawConsentByToken(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  audit?: { requestIp?: string; userAgent?: string },
): Promise<RevokeConsentV2Result>;
```

Same pattern for restore: extract the locked grace-check-and-append core of
`restoreConsentV2` (`consent-v2.ts:644`) into an edge-free internal; keep the
public `restoreConsentV2` (isGuardianOf, then core) unchanged; add
`restoreConsentByToken(db, chargePersonId, organizationId, audit?)` that calls
the core after the route has verified the signature.

The `audit_fact` distinguishes the channel for the compliance trail
(`email_parent_revocation` / `email_parent_restore`), and IP/UA are captured as
in the `confirm` route (the Bug #872 pattern, `consent-web.ts:419-427`).

`withdrawConsentByToken` is **idempotent** (a second call on an already-withdrawn
grant returns the existing `withdrawnAt`, inherited from `revokeConsentV2`'s
current-grant short-circuit, `consent-v2.ts:601-603`).

### 5.4 Grace → delete (edge-free) — NEW Inngest function

**Finding:** the existing `consent-revocation` function
(`apps/api/src/inngest/functions/consent-revocation.ts`) **cannot** be reused for
this path. It (a) requires `parentProfileId` in its event schema (line 42), (b)
runs an archive branch gated by `archivePersonOnRevocationV2` →
`isGuardianOf(ownerProfileId, child)` (line 273; predicate at
`consent-v2.ts:1067`), which fails with no edge and would mislabel the run as
`restored` (no deletion), and (c) pushes warnings/completions to the parent
person. The email-parent has none of these.

P0 adds a **dedicated, isolated** function so there is zero regression risk to
the live managed-child cascade:

- **Event:** `app/consent.email-revoked`, payload `{ chargePersonId, revokedAt }`
  (no parent identity).
- **Dispatch:** from `POST /consent-page/withdraw` after a successful stamp, via
  `safeSend` (non-core: the withdrawal already succeeded and the data is already
  gated; a dispatch failure must not 500 the parent). The web route is a Worker
  request handler, so the durable delete belongs in Inngest, not inline (engine
  rule: durable async → Inngest).
- **Function `consentEmailRevocation`** (`retries`, `idempotency` on
  `chargePersonId + "-" + revokedAt`, `concurrency` key `chargePersonId`, an
  `onFailure` dead-letter mirroring the existing function):
  1. `clear-unread-nudges` (`markAllNudgesRead`).
  2. `sleep 6d`.
  3. `warn-child` push (the child IS a user with a push token):
     `isConsentRevocationGenerationCurrentV2(db, chargePersonId, revokedAt)` —
     if not current (restored) → skip; else push "Account closing tomorrow —
     your parent withdrew consent; it can still be restored." (24h dedup via
     `getRecentNotificationCount`). No parent push (no parent person).
  4. `sleep 1d`.
  5. `check-restoration`: if `!isConsentRevocationGenerationCurrentV2` → return
     `{ status:'restored' }`.
  6. `delete`: `deletePersonIfConsentWithdrawnV2(db, chargePersonId, revokedAt)`
     — **edge-free** (3-arg, keys on the withdrawn grant + timestamp;
     `consent-revocation.ts:432`). FK cascades remove all child data.
  7. `notify-child` best-effort before delete (mirrors line 386).
  - **No archive branch.** Archive exists so an *in-app* parent can restore
    later; the email-parent restores via the undo link within grace, and after
    grace there is no in-app parent to archive for. Always hard-delete.
- **Register** in `apps/api/src/inngest/index.ts`.

**Immediate child-facing state (the moment of withdrawal).** Independent of the
6-day push, the minor is gated out of the app **the instant** withdrawal stamps
`WITHDRAWN`, via the existing `ConsentWithdrawnGate`
(`apps/mobile/src/app/(app)/_layout.tsx:598-605`). P0 must verify this gate's
copy is humane and restoration-aware — tell the minor their parent has paused
the account, that it can still be restored, and to talk to their parent — rather
than leaving them locked out with no explanation until the day-6 push. The kid
is an end-user too; the lockout screen is the copy that matters most to them.

**Undo during grace** uses the same restore core (§5.3) which appends a new
un-withdrawn grant; step 5's generation check then sees the grant is no longer
withdrawn and returns `restored`, so the delete never runs — identical to the
managed-path restore semantics.

### 5.5 Copy fix

`consent-web.ts:292`: replace
*"You can withdraw consent at any time from the parent dashboard in the app."*
with
*"After you approve, you'll be able to withdraw your consent at any time using a
link we email you."*
(Accurate to the real mechanism — a post-approval confirmation email, not an
in-app dashboard this parent can never reach — on every page that mentions
withdrawal.)

---

## 6. Security considerations

- **Bearer-token leak.** See §4.2 — low-harm, self-healing within grace, scope
  limited to withdraw/restore of one child.
- **Constant-time verification** (`crypto.timingSafeEqual`) to avoid a signature
  oracle.
- **No enumeration.** A valid signature but unknown/!consent-gated person yields
  the same "nothing to withdraw" page as a not-yet-approved one; an invalid
  signature yields the generic "invalid link" — neither distinguishes real ids.
- **Rate limiting** via the shared `consentPageRateLimit` (same per-IP window as
  the approval pages; documented in-isolate limitation BUG-99 inherited as-is).
- **CSRF / prefetch.** Mutations are POST-only behind a two-step GET confirm, so
  link-preview/prefetch of the emailed GET link cannot mutate.
- **Secret management.** `CONSENT_WITHDRAWAL_TOKEN_SECRET` in Doppler; never
  logged; read via typed config.

---

## 7. Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Invalid/forged token | Tampered or random link | "Invalid link" page + help/support links | Use the real link from the email |
| Token valid, not yet approved | Withdraw clicked before approving | "There's nothing to withdraw yet" page | Approve first, or ignore |
| Token valid, already withdrawn (in grace) | Re-click withdraw link | Withdrawn landing with **Undo** button | Undo restores within grace |
| Withdraw POST | Confirmed withdrawal | "Consent withdrawn — data will be removed after 7 days. Undo: [link]" | Undo link within grace |
| Restore after grace | Undo clicked > 7 days later | "This grace period has expired; the account was already removed" | None (data gone, by design) |
| Email send fails (request email) | Provider outage | Existing `EmailDeliveryError` handling (unchanged) | Resend (existing flow) |
| Confirmation email send fails (post-approval) | Provider outage at approval | Approval still succeeds; failure captured in Sentry, swallowed for user. Landing page still shows the withdrawal link inline | Parent uses the landing-page link, or P1 in-app dashboard later |
| Grace-delete Inngest run fails terminally | Sustained DB outage | (ops only) `app/consent.email-revocation.failed` dead-letter + Sentry `captureMessage` | Manual completion per dead-letter hint |
| Rate-limited | Too many requests from an IP | "Too many requests" 429 page with Retry-After | Wait and retry |

---

## 8. Testing strategy

- **Token helper unit tests:** sign→verify round-trip; reject tampered payload,
  tampered signature, wrong secret, malformed/empty, wrong prefix.
- **Negative-path break test (CRITICAL — the auth substitution):** assert that
  `withdrawConsentByToken` stamps `withdrawn_at` for a person with **no
  guardianship edge** (the exact case `revokeConsentV2` rejects), AND that a
  forged/invalid token never mutates. Use the red-green pattern: write it,
  watch it pass, revert the bearer path, watch it fail, restore.
- **Confirmation email on approval:** approving via `POST /consent-page/confirm`
  sends a `consent_approved` email whose body contains a withdrawal URL that
  `verifyWithdrawalToken` accepts and resolves to the approved child; an email
  provider failure does not fail the approval response.
- **Web route integration tests** (real DB, no internal mocks — external email
  boundary only): GET confirm page renders for a valid token; POST withdraw
  stamps `WITHDRAWN` and dispatches `app/consent.email-revoked`; POST restore
  within grace re-grants; restore after grace → friendly expired page; invalid
  token → invalid page; pre-approval token → "nothing to withdraw".
- **Inngest `consentEmailRevocation` test:** restored-during-grace → no delete;
  still-withdrawn → `deletePersonIfConsentWithdrawnV2` called; idempotent on
  duplicate event; `onFailure` dead-letters.
- **Status parity:** after stamp, `resolveLatestConsentStatusAnyBasis` →
  `WITHDRAWN` and the `_layout` consent gate blocks the minor.
- Regression-safety: existing `revokeConsentV2` / `restoreConsentV2` /
  `consent-revocation` tests stay green (the refactor is behavior-preserving for
  the edge-gated callers).

---

## 9. Rollback

Additive and migration-free. Rollback = revert the PR; no schema change, no data
migration, no backfill. The new Inngest function is independent; removing it
leaves the managed-child cascade untouched. Already-stamped `withdrawn_at`
values (none expected pre-launch) remain valid `WITHDRAWN` states regardless.

---

## 10. Open questions

- **Reuse an existing app signing secret** instead of a dedicated
  `CONSENT_WITHDRAWAL_TOKEN_SECRET`? Default in this spec is a dedicated secret
  (blast-radius isolation); flip only if the repo already has a general-purpose
  HMAC secret intended for shared signing.
- **Grace-warning to the parent by email?** Still omitted by default. The new
  post-approval confirmation email establishes a parent email channel, so a
  single grace-warning nudge is now trivial to add later — but the landing-page
  undo (shown at the moment of action) plus the child push are judged
  sufficient. Add the nudge only if review disagrees.
