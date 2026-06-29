# MMT-ADR-0029 — Bearer-token authority for edge-less consent withdrawal

**Status:** Accepted (2026-06-26) — *Architecture sign-off by jjoerg; drafted by Claude from the P0 spec as the architecture-vetting step, NOT a plan-launder (`MMT-ADR-0000` §II.6 rule 1). Pre-live: editable in place per the §II.2 override.* · **Class:** Architecture / Security · **Scope:** Compliance / consent — the email-consenting parent (live identity-v2 machine) · **Deciders:** Architect (jjoerg) + Claude
**Builds on / deviates from:** `MMT-ADR-0001` (own the graph; Clerk for auth only), `MMT-ADR-0008` (guardianship is a global edge; the authority check lives in exactly one edge-derived resolver) · **Source spec:** `docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md`

> **Lockstep canon partner.** `docs/canon/identity/ontology.md` inv 23 (the edge-derived authority resolver, ruled by `MMT-ADR-0008`) carries the bearer-token exception clause, added in this same change-set (§II.2 lockstep). Related: inv 12 (consent is *withdrawable*).

## Context

A **self-registered minor** (13–16) creates their own account; a parent approves by clicking a link emailed to `guardian_email`. After approval that parent has **no account, no login, no app, and no guardianship edge** — the only thing the system records about them is the `guardian_email` on the `consent_request` row. Yet **GDPR Art. 7(3)** requires that withdrawing consent be **as easy as giving it, at any time**, and the consent decision page literally promises withdrawal "from the parent dashboard" — a dashboard this parent can never reach.

The repo's two settled authority models both fail this actor by construction:

- **`MMT-ADR-0001` — Clerk for authentication only.** Its seam principle: *"everything about proving who a logged-in user is should be Clerk's."* The email-parent **has no login**, so there is no Clerk session to authenticate against. 0001 settled auth for credentialed humans and tenancy for the Neon graph; it never contemplated an authority path for a human who acts on the system with **neither** a credential **nor** a graph membership.
- **`MMT-ADR-0008` — guardianship is a global edge; operational authority is *derived* from it, and "the authority check lives in exactly one named function … no call site re-derives it ad hoc."** The email-parent **has no edge**, so the single edge-derived resolver has nothing to resolve. The only existing withdrawal path, `revokeConsentV2`, is gated by `isGuardianOf(...)` and is therefore closed to them.

A third constraint comes from the data: the 7-day approval token is **dead after approval** (`getChildNameByTokenV2` returns null once `responded_at` is stamped), so withdrawal needs its **own durable handle**, available indefinitely.

This is a live exposure the moment public sign-up opens. P0 needs a withdrawal authority for an actor that is, by design, outside both authority models.

## Decision

**Withdrawal (and restoration) of an email-consenting parent's consent is authorized by a stateless, signed, non-expiring HMAC-SHA256 bearer token delivered to `guardian_email`.** Possession of the signed link *is* the authority — mirroring the trust model already used for the approval link. This is a **deliberate, narrowly-scoped exception** to `MMT-ADR-0008`'s "authority is edge-derived through one resolver" and to `MMT-ADR-0001`'s "Clerk for auth," justified by the structural absence of both an edge and a credential for this actor.

The exception is fenced by hard constraints, so it does not erode either model:

- **Scope of authority is withdraw/restore of exactly one charge's email-consent — nothing else.** The token never authorizes a read, an export, a profile mutation, or any operation on the child's learning data. It is not a session and confers no identity.
- **It bypasses the edge-derived resolver only for this one actor.** Every credentialed/edged path continues to flow through `MMT-ADR-0008`'s single resolver unchanged; the token is an additive, parallel authority for the edge-less case, not a replacement.
- **Stateless and non-expiring.** No DB column, no migration — P0 is deliberately disposable. Non-expiring because Art. 7(3) requires withdrawal "at any time." Wire format `cw1:${chargePersonId}:${organizationId}`, base64url payload + HMAC, **constant-time** verification (no signature oracle); any malformed / tampered / wrong-secret / unknown-version token verifies to `null`.
- **The signing secret `CONSENT_WITHDRAWAL_TOKEN_SECRET` (≥32 chars) is production-required and fail-loud** — the feature cannot sign or verify without it, so a missing secret is a boot failure, not a silent degrade.
- **Delivery home is a dedicated post-approval confirmation email** (the email a parent actually returns to), plus the approval landing page — never the pre-approval request email (archived once actioned).

## Consequences

- **The Art. 7(3) gap closes** for the one actor neither prior model could serve, without inventing a fake edge or forcing account creation.
- **A new, deliberately constrained security primitive exists**: a non-expiring, unauthenticated bearer credential with **no server-side revocation list**. The leak blast-radius is bounded and self-healing: a stranger who obtains the link could *pause* (or restore) this one child's account, recoverable within the 7-day deletion grace window — no data read, no cross-account reach. This is the contested property; it is accepted for P0 as low-harm against the live compliance exposure.
- **Binding constraint on future work:** this token must **never** be generalized to any data-bearing or identity-conferring operation. Any future "act via emailed link" surface for an edged/credentialed actor flows through `MMT-ADR-0008`'s resolver, not this token.
- **Explicit successor path:** the durable fix is a real in-app / account-based withdrawal for the consenting parent (the P1 `family-3` link-account work). When that lands, it **supersedes** this ADR and the bearer token can retire.
- **Lockstep canon (on acceptance):** inv 23 gains a one-line exception noting the edge-less email-parent's withdrawal authority is a signed bearer token per this ADR.

## Alternatives considered

1. **Expiring / short-TTL token.** Rejected — Art. 7(3) requires withdrawal "at any time"; an expired link re-creates the very dead-end (the spent approval token) this decision exists to fix.
2. **DB-stored, revocable withdrawal handle (a column + lookup).** Rejected for P0 — adds a migration and state to a deliberately disposable feature. Revisit if the blast-radius assessment ever rises above low-harm (e.g. if the token were ever extended toward data access — which constraint above forbids).
3. **Reuse the approval token.** Rejected — it is dead after approval by design (`getChildNameByTokenV2` → null on a responded request); withdrawal needs a durable, independent handle.
4. **Require the parent to create an account to withdraw.** Rejected — withdrawal must be *as easy as giving*, and giving required no account; gating withdrawal behind sign-up is a direct Art. 7(3) violation. (This is the P1 *option*, not the P0 *requirement*.)
5. **Synthesize a guardianship edge for the email-parent so the existing resolver applies.** Rejected — there is no edge (no `person` row, no relationship fact); fabricating one to satisfy the resolver would corrupt `MMT-ADR-0008`'s global-edge model and store a relationship that legally isn't one. The honest model is "no edge → a scoped token authority," recorded as the exception this ADR makes.
