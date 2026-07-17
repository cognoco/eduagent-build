# Consent-Withdrawal Bearer-Token — Threat Posture

**Checklist item:** A9 (consent as a real choice) extended by Art. 7(3) (withdrawal as easy as giving) · **Law:** GDPR Article 7(3) / Article 6 · **Status:** RULED 2026-07-17 (OPQ-114) — DPO-acting + eng/security sign-off below. **Version 1.**
**Scope:** the P0 email-consenting-parent bearer-token withdrawal/restore mechanism only (`cw1` tokens). Does not re-assess the edge-gated in-app guardian withdrawal path (`revokeConsentV2`/`restoreConsentV2`), which is unaffected.
**Feeds:** WI-1577 (final pre-store-submission launch-compliance gate) — see `dpia.md` §6 row 6.11 and §9 item 9 for the cross-reference this posture satisfies.
**Companion documents:** [`docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md`](../specs/2026-06-26-p0-email-consent-withdrawal-design.md) (design), [`docs/adr/MMT-ADR-0029-bearer-token-consent-withdrawal-authority.md`](../adr/MMT-ADR-0029-bearer-token-consent-withdrawal-authority.md) (architecture decision), [`dpia.md`](dpia.md) (launch gate).

---

## 1. What is built (from source)

A **stateless, signed, non-expiring bearer token** authorizes the email-consenting parent — a person with no `person` row and no guardianship edge — to withdraw or restore the GDPR consent they gave, since every edge-gated authority path is structurally closed to them (`MMT-ADR-0029`).

- **Token.** `apps/api/src/services/consent-withdrawal-token.ts`. Wire format `base64url(payload) + "." + base64url(hmacSha256(secret, payload))`, `payload = "cw1:${chargePersonId}:${organizationId}"` (`encodePayload`, lines 26-29). Signing at `signWithdrawalToken` (37-44); verification at `verifyWithdrawalToken` (52-84) recomputes the HMAC and compares with `crypto.timingSafeEqual` after an explicit length pre-check (63-68) — no signature oracle. Any malformed payload, tampered signature, wrong secret, or unrecognized version prefix returns `null`; the function never throws.
- **Scope.** Exactly `chargePersonId + organizationId` for the `gdpr_parental_consent` basis — nothing else. No expiry field, no nonce, no per-link identifier, no single-use marker, no DB row backing the token at all.
- **Secret.** `CONSENT_WITHDRAWAL_TOKEN_SECRET`, a dedicated Doppler secret independent of the consent-*response* token (design spec §4.1). Schema `z.string().min(32).optional()` (`apps/api/src/config.ts:63`); listed in `PRODUCTION_REQUIRED_BASE_KEYS` (`config.ts:534-545`) so a missing/short secret fails production boot loudly rather than silently degrading — covered by `config.test.ts:357-385` (asserts the throw names `CONSENT_WITHDRAWAL_TOKEN_SECRET` explicitly) and `config.test.ts:131,153,198,222,344` (presence/shape checks).
- **Delivery.** A dedicated post-approval **`consent_approved`** confirmation email (the durable home a parent returns to) plus the approval landing page; never the pre-approval request email (design spec §5.1).
- **Web surface** (`apps/api/src/routes/consent-web.ts`), all behind the shared `consentPageRateLimit` (269-295; per-IP, in-memory, documented [BUG-99] per-isolate limitation shared with the sibling `/consent-page/confirm` endpoint):
  - `GET /consent-page/withdraw?token=X` (682-740) — **read-only**. Verifies the token, reads `getGdprGrantWithdrawalStateV2` (`consent-v2.ts:1268-1280`), and renders one of three pages: "are you sure?" confirm (active grant), the undo/restore landing (already withdrawn, in grace), or "nothing to withdraw" (no current grant — the no-enumeration outcome, indistinguishable from "never approved"). Never mutates.
  - `POST /consent-page/withdraw` (750-826) — the mutation. Verifies the token, calls `withdrawConsentByToken`, dispatches the edge-free grace→delete Inngest workflow (`app/consent.email-revoked`) via `safeSend`, non-blocking.
  - `POST /consent-page/restore` (834-885) — the undo. Verifies the **same token type**, calls `restoreConsentByToken`. Within the 7-day grace it re-grants; outside grace it throws `ConsentGracePeriodExpiredError` → a 410 "grace period has expired" page.
- **Token-authorized service core** (`apps/api/src/services/identity-v2/consent-v2.ts`):
  - `withdrawConsentByToken` (739-756) → `stampWithdrawal` (766-803): stamps `withdrawn_at` (+`priorValue: true`, `auditFact.source: 'email_parent_revocation'`) on the current grant, guarded `isNull(consentGrant.withdrawnAt)` in the UPDATE WHERE (791) and idempotent via a current-grant short-circuit (777-779).
  - `restoreConsentByToken` (845-862) → `appendRestoreGrant` (872-935): under a per-person Postgres advisory transaction lock (`pg_advisory_xact_lock`, 889-896 — closes the WI-583 race against the grace-delete sweep), appends a new un-withdrawn grant (`priorValue: false`, `auditFact.source: 'email_parent_restore'`) when within grace; idempotent no-op if already un-withdrawn (907-910); throws `ConsentGracePeriodExpiredError` outside the 7-day window (911-916).
  - `currentGrant` (1388-1406): the compound read — `chargePersonId` **and** `organizationId` **and** `purpose` **and** `lawfulBasis` all pinned in the WHERE — the single place both scope dimensions are enforced.

**Absent by design (not a gap — a deliberate P0 tradeoff):** per-link expiry, a nonce, server-side revocation of an individual link, and single-use state. `MMT-ADR-0029` accepts this explicitly: *"a new, deliberately constrained security primitive... a non-expiring, unauthenticated bearer credential with no server-side revocation list... accepted for P0 against the live compliance exposure."*

---

## 2. Assets and trust boundaries

| Asset | In scope of this token? |
|---|---|
| The child's GDPR consent state (`consent_grant.withdrawn_at`) | **Yes** — the only thing this mechanism can change. |
| The child's continued app access (gated on consent state) | Indirectly — flips the moment `withdrawn_at` is stamped, via the existing `ConsentWithdrawnGate`. |
| The child's learning data survival | Indirectly — grace→delete Inngest sweep runs off the withdrawal timestamp. |
| Any read/export of the child's data, profile mutation, or other operation | **No** — `MMT-ADR-0029`'s hard scope fence; this token is not a session and confers no identity. |
| The signing secret | A trust boundary of its own — see T-9. |

**Trust boundaries crossed:**

1. **Public internet → unauthenticated Worker route.** `consent-web.ts` requires no Clerk session; the request itself carries no prior authentication.
2. **Third-party email transport (Resend) → parent inbox.** The link transits infrastructure this system does not control between mint and click.
3. **Bearer token → authorization decision.** The token substitutes for BOTH the Clerk-session model (`MMT-ADR-0001`) and the guardianship-edge model (`MMT-ADR-0008`) for this one edge-less actor — this substitution is the entire point of `MMT-ADR-0029` and the central object of this posture review.
4. **Doppler-managed secret → running Worker process.** Custody boundary for `CONSENT_WITHDRAWAL_TOKEN_SECRET`.

---

## 3. Threat register

Disposition classes used below: **Resolved by design** (mitigated, no residual risk to accept), **Accept-for-MVP** (residual risk knowingly carried), **Mitigate-before-launch** (the one item requiring a follow-up implementation Work Item).

### T-1 — Accidental URL / access-log / referrer exposure

| | |
|---|---|
| Likelihood | Medium — GET query strings land in edge/access logs and browser history as routine infrastructure behavior, not an attack. |
| Impact | Low — scope-fenced to withdraw/restore of one child; never a data read. |
| Blast radius | One child, one organization; reversible within the 7-day grace. |
| **Disposition** | **Accept-for-MVP.** |
| Rationale | `GET /consent-page/withdraw` is read-only by construction — it only renders a confirm/landing page (`consent-web.ts:682-740`); the two-step GET→POST split exists specifically so a logged/prefetched/link-scanned GET can never itself mutate state (design spec §5.2, §6). Rendered pages use only first-party markup (`pageLayout`/`escapeHtml`) and load no third-party assets, so the page itself creates no additional Referer leak. |
| Operational response if exploited | None beyond existing controls — a leaked GET URL cannot mutate; an attacker must still complete the POST. |
| Re-evaluation trigger | If the GET route is ever changed to mutate (regression), or if the token's scope is ever generalized beyond withdraw/restore (barred by `MMT-ADR-0029`'s "Consequences"). |
| Accountable owner | Zuzana Kopečná (eng/security). |
| Verification | `consent-web.ts:682-740`; `consent-web.integration.test.ts:872-897` ("valid token + active grant → confirm page"), `:899-910` ("valid token but no grant → nothing to withdraw") — both assert a rendered page, not a mutation. |

### T-2 — Intercepted message or copied link

| | |
|---|---|
| Likelihood | Low–Medium — same channel (Resend, TLS-in-transit) already carries the higher-stakes approval link. |
| Impact | Low. |
| Blast radius | One child; reversible within grace. |
| **Disposition** | **Accept-for-MVP.** |
| Rationale | The design deliberately mirrors the existing, already-accepted approval-link trust model rather than introducing a new exposure class (`MMT-ADR-0029` Decision: "mirroring the trust model already used for the approval link"). |
| Operational response | Existing breach-response process (`breach-response-plan.md`) for any confirmed provider-side interception. |
| Re-evaluation trigger | Same as T-3/T-6 below — the P1 successor design. |
| Accountable owner | Zuzana Kopečná (mechanism); Jørn, acting DPO (accepted-risk sign-off). |
| Verification | `formatConsentApprovedEmail`/`sendEmail` delivery path (design spec §5.1); `consent-web.integration.test.ts:1027-1148` (Suite 7 — approval mints the confirmation email carrying the token). |

### T-3 — Intentional forwarding

| | |
|---|---|
| Likelihood | Medium — forwarding is ordinary human behavior; the mechanism has no way to distinguish the original recipient from a forward. |
| Impact | Low (withdraw/restore only). |
| Blast radius | One child; reversible by whoever next holds a valid link. |
| **Disposition** | **Accept-for-MVP — this is the deliberate, accepted consequence of a bearer-token model, not an overlooked gap.** |
| Rationale | `MMT-ADR-0029` Decision states plainly: "possession of the signed link is the authority." Its Alternative 5 explicitly rejects fabricating an identity-bound edge for this actor, because none exists — "the honest model is 'no edge → a scoped token authority.'" |
| Operational response | No automated control. If a family reports an unwanted third-party withdrawal/restore, support can inspect `auditFact.source` (`email_parent_revocation` / `email_parent_restore`) and the captured `requestIp`/`userAgent` (`consent-web.ts:767-773`, `:851-857`) to reconstruct what happened, but cannot itself revoke the specific link (see T-10). |
| Re-evaluation trigger | At the **P1 link-account/invite successor design** — `MMT-ADR-0029`'s named successor path, which gives this actor a real credential and edge; the bearer token retires then. |
| Accountable owner | Zuzana Kopečná (mechanism); Jørn, acting DPO (accepted-risk sign-off). |
| Verification | `MMT-ADR-0029` Decision + Consequences + Alternative 5; `consent-v2.ts:719,751` (distinct `auditFact.source` per channel). |

### T-4 — Repeated withdraw replay

| | |
|---|---|
| Likelihood | n/a — eliminated by design (idempotent by construction; there is no window in which a replay produces a different mutation). |
| Impact | n/a — a replay changes nothing beyond the first call. |
| Blast radius | n/a. |
| **Disposition** | **Resolved by design — no residual risk.** |
| Rationale / verification | `stampWithdrawal`'s current-grant short-circuit returns the *existing* `withdrawnAt` on a repeat call without mutating (`consent-v2.ts:777-779`), and the UPDATE itself is separately guarded `isNull(consentGrant.withdrawnAt)` in its WHERE (791) so a race cannot double-stamp. Tested directly: "withdrawConsentByToken is idempotent (second call returns the same withdrawnAt, no new row)" (`consent-v2.integration.test.ts:609-618`). |
| Accountable owner | Zuzana Kopečná. |

### T-5 — Restore replay during grace

| | |
|---|---|
| Likelihood | n/a — eliminated by design (no-op on an already-restored grant; race with the delete sweep is closed by the advisory lock, not merely made unlikely). |
| Impact | n/a. |
| Blast radius | n/a. |
| **Disposition** | **Resolved by design — no residual risk.** |
| Rationale / verification | `appendRestoreGrant` no-ops when the current grant is already un-withdrawn (`consent-v2.ts:907-910`); the whole check-and-append runs inside a per-person `pg_advisory_xact_lock` transaction (889-896) specifically to close the WI-583 race against the grace→delete sweep's own re-read (documented at 880-888) — whichever of restore/delete takes the lock first wins, the other re-reads committed state. |
| Caveat | Verification here is by code inspection of the locking transaction plus the single-call restore test (`consent-v2.integration.test.ts:620-636`); no test exercises the actual concurrent-transaction interleaving (two simultaneous restore calls, or a restore racing the delete sweep, under load). This is a residual test-coverage gap, not a residual security risk — flagged for completeness, not blocking. |
| Accountable owner | Zuzana Kopečná. |

### T-6 — Old-link reuse after a later consent decision

| | |
|---|---|
| Likelihood | Low today (no product path re-enters a fresh GDPR consent cycle for the same child+org after a prior grant); structurally possible as the product evolves. |
| Impact | Low. |
| Blast radius | One child; bounded by the same scope fence as every other threat here. |
| **Disposition** | **Accept-for-MVP — deliberate, not a defect.** |
| Rationale | `currentGrant` always resolves `max(granted_at)` (tiebreak `id DESC`) for the fixed `(chargePersonId, organizationId, purpose, basis='gdpr_parental_consent')` key (`consent-v2.ts:1388-1406`) — by construction the token always acts on whatever is *current*, which is exactly what Art. 7(3) "at any time" requires (design spec §4.2). `MMT-ADR-0029`'s Alternative 1 explicitly rejects an expiring/instance-scoped token for this reason. |
| Operational response | None — intended behavior. |
| Re-evaluation trigger | Same as T-3 — the P1 successor design. This threat is the "durability creates staleness" framing of the same root cause as T-10 (below); T-10 is the "we cannot invalidate one specific link" framing. |
| Accountable owner | Zuzana Kopečná. |
| Verification | `consent-v2.ts:1388-1406`. |

### T-7 — Forged / modified tokens

| | |
|---|---|
| Likelihood | n/a — eliminated by design (any tamper to payload or signature, wrong secret, or unknown version verifies to `null`; there is no exploitable path left to attempt). |
| Impact | n/a. |
| Blast radius | n/a. |
| **Disposition** | **Resolved by design — no residual risk beyond T-9 (secret compromise).** |
| Rationale / verification | HMAC-SHA256 over the *entire* encoded payload; constant-time comparison via `timingSafeEqual` with an explicit length pre-check to avoid both a thrown exception on mismatched lengths and a length-based timing signal (`consent-withdrawal-token.ts:63-68`). Comprehensively tested — wrong secret, a single tampered payload byte, a single tampered signature byte, a malformed token (no dot), an empty token, a correctly-signed-but-unknown version prefix (`cw2`), and a correctly-signed payload with the wrong field count — seven negative cases, all asserting `null` (`consent-withdrawal-token.test.ts:36-74`). |
| Accountable owner | Zuzana Kopečná. |

### T-8 — Organization / person scope confusion

| | |
|---|---|
| Likelihood | n/a — eliminated by design (both ids are bound into one signed unit and independently re-pinned on read; there is no path to substitute either id). |
| Impact | n/a. |
| Blast radius | n/a. |
| **Disposition** | **Resolved by design — no residual risk.** |
| Rationale / verification | `chargePersonId` and `organizationId` are joined into **one** colon-delimited string *before* signing (`"cw1:${chargePersonId}:${organizationId}"`, `consent-withdrawal-token.ts:27`), so the HMAC covers both ids as a single unit — neither id can be swapped independently without invalidating the signature (proven directly by the tampered-payload test, which flips one character of the encoded payload and gets `null`: `consent-withdrawal-token.test.ts:41-48`). On the read side, `currentGrant`'s WHERE clause independently pins **both** `chargePersonId` **and** `organizationId` (plus `purpose` and the hardcoded `gdpr_parental_consent` basis) — `consent-v2.ts:1395-1401` — so even a token forged with a compromised secret for one (person, org) pair can only ever resolve that exact pair's own grant, never a different child's or a different organization's, and never the sibling COPPA-basis grant for the *same* child. |
| Accountable owner | Zuzana Kopečná. |

### T-9 — Signing-secret compromise or rotation

| | |
|---|---|
| Likelihood | Low (Doppler-managed, never logged, fail-loud production boot check). |
| Impact | **Compromise:** Medium–High — a leaked secret lets an attacker *mint* valid tokens for any `(chargePersonId, organizationId)` pair they can separately learn or enumerate, removing the "you had to receive this specific email" constraint that bounds T-1/T-2/T-3. **Rotation:** Low–Medium — because verification is stateless with no key-id/versioning beyond the fixed `cw1` prefix, rotating the secret invalidates *every* outstanding withdrawal link at once, and there is no self-service re-issuance path (only the consent *request* has a resend, `resendConsentV2`; the withdrawal link is delivered exactly once, in the post-approval confirmation email). |
| Blast radius | Compromise: potentially organization-wide if ids are separately known — still bounded to consent-state disruption (withdraw/restore only), never a data read, by the token's own hard scope fence. Rotation: every outstanding link, but breaks convenience rather than exposing data. |
| **Disposition** | **Accept-for-MVP.** |
| Rationale | The secret is dedicated and independent of the consent-*response* token, so a leak of one never compromises the other (design spec §4.1); it is production-required with fail-loud boot (`config.ts:534-545`) and a minimum 32-character shape enforced by the zod schema (`config.ts:63`). A stronger mechanism (per-token revocation, key-id-based rotation) is not justified for a deliberately-disposable P0 primitive with a named successor path. |
| Operational response if compromise is suspected | Rotate the secret via Doppler immediately per `breach-response-plan.md`'s incident process — this invalidates every outstanding link fleet-wide. Acceptable as a blunt containment because withdrawal is non-destructive within the 7-day grace and forwarding (T-3) is already an accepted risk with the same ceiling. |
| Re-evaluation trigger | Any confirmed or suspected exposure of the secret (activates `breach-response-plan.md`); or before this mechanism is ever extended in scope (already barred by `MMT-ADR-0029`); or at the P1 successor ADR. |
| Accountable owner | Zuzana Kopečná (eng/security); Jørn, acting DPO (accepted-risk sign-off). |
| Verification | `config.ts:63,534-545`; `config.test.ts:131,153,198,222,344,357-385` (fail-loud + minimum-length coverage). |

### T-10 — Unbounded token validity: no expiry, no per-link revocation — **MITIGATE-BEFORE-LAUNCH**

| | |
|---|---|
| Scenario | There is no way to invalidate one *specific* leaked/forwarded/intercepted link (T-1, T-2, T-3, T-6) short of rotating the global secret (T-9), which invalidates *every* outstanding link, not only the compromised one. This is the single structural gap underlying the acceptance of T-1, T-2, T-3, and T-6. |
| Likelihood | Low that any one link leaks (see T-1–T-3), but the *consequence*, once a link is out, is open-ended in time by construction. |
| Impact | Low today per-incident (bounded to withdraw/restore, self-healing within the 7-day grace) — but the exposure compounds as the product runs: every approved consent mints a permanent standing bearer credential, and the population of live, forever-valid links only grows with no way to retire an individual one. |
| Blast radius | Same as T-1–T-3 per incident, but in aggregate: an ever-growing set of non-expiring credentials with zero server-side kill switch for any single one. |
| **Disposition** | **Mitigate-before-launch — the one such disposition in this posture review.** |
| Required security property (not a prescribed implementation) | A withdrawn or superseded link must become unusable, and links must expire. Design of the mechanism (a DB-backed revocation record, a TTL, the UX for an expired-but-otherwise-legitimate request) is left to the owning implementation Work Item, not prescribed here. |
| Rationale for singling out this threat | `MMT-ADR-0029` itself names the stateless, non-expiring choice as "the contested property… accepted for P0 against the live compliance exposure" (Consequences) — i.e., the ADR already flagged this as the one deliberately-accepted, explicitly-watched tradeoff. This ruling (OPQ-114) converts that watch-item into a scheduled mitigation rather than an indefinite acceptance. |
| Accountable owner | Zuzana Kopečná (implementation); Jørn, acting DPO (requires this before the P0 mechanism is considered closed). |
| Tracking | Follow-up Work Item recorded in `.workitem-artifacts/WI-2064/incidental-items.json` (this branch). `MMT-ADR-0029`'s "Alternatives considered" #2 (a DB-stored, revocable withdrawal handle) is the nearest already-considered design and may inform the implementing WI, but is not prescribed as the only valid approach. |

### T-11 — Restore is reachable by any bearer of the link, not only the withdrawing parent (product-policy ruling)

| | |
|---|---|
| As built | `POST /consent-page/restore` (`consent-web.ts:834-885`) and `restoreConsentByToken` (`consent-v2.ts:845-862`) accept the **same** bearer token that authorizes withdrawal — whoever currently holds the link can reinstate processing, not only the parent who withdrew it, and not necessarily a parent at all. |
| **Product-policy ruling (OPQ-114) — named separately, per instruction, not inferred from the code above:** | **A bearer link authorizes WITHDRAW only. Restoring a previously-withdrawn consent must route through an authenticated path — not mere possession of the link.** |
| Explicit gap between the ruling and today's ship | `MMT-ADR-0029`, as ratified, authorizes **both** withdrawal and restoration via the same bearer token ("Withdrawal (**and restoration**) of an email-consenting parent's consent is authorized by a stateless, signed, non-expiring HMAC-SHA256 bearer token" — ADR Decision). The ruling above is a **new** policy position not yet reflected in shipped code or in the ratified ADR text. This posture does not paper over that gap by claiming the code already satisfies the ruling, and does not unilaterally amend the ADR or the code under a docs-only Work Item — an ADR text change requires its own lockstep decision per `MMT-ADR-0000`. |
| Likelihood / Impact | Same envelope as T-3 — restore's worst case only reinstates a consent state a parent legitimately granted at least once before; it never manufactures new consent. Not a new capability, just a compounding of the forwarding risk already accepted. |
| **Disposition** | **Accept-for-MVP as-shipped** (today's `MMT-ADR-0029`-conformant behavior ships unchanged); **the ruling is recorded as forward policy for the successor design.** |
| Rationale | Re-litigating the ADR's "and restoration" clause is out of scope for a docs-only threat-posture review; it is a design decision for the owning team, not something this artifact can retroactively enforce. |
| Re-evaluation trigger | Before or at the **P1 link-account/invited-parent successor design** (`MMT-ADR-0029`'s named successor path) — that design must implement authenticated-only restore per this ruling, or explicitly re-affirm bearer-restore with its own stated reasoning; either way it should be recorded as its own ADR-lockstep decision, not left implicit. |
| Accountable owner | Jørn, acting DPO (the policy ruling); Zuzana Kopečná (flags the as-built gap; not tasked with resolving it here). Scheduling the ADR-level reconciliation is an **open, unassigned** item for product/architecture — not silently defaulted to engineering. |

---

## 4. Test evidence for implemented controls

| Control | Evidence |
|---|---|
| Token round-trip, tamper/forgery rejection (7 negative cases) | `apps/api/src/services/consent-withdrawal-token.test.ts:22-74` |
| Bearer withdrawal succeeds with **no guardianship edge** (the auth substitution `MMT-ADR-0029` exists to make) | `apps/api/src/services/identity-v2/consent-v2.integration.test.ts:571-586` (edge-gated `revokeConsentV2` REJECTS the no-edge case) + `:588-607` (`withdrawConsentByToken` STAMPS it) — the red-green pair the design spec §8 calls for |
| Withdrawal idempotency | `consent-v2.integration.test.ts:609-618` |
| Restore-within-grace appends a new grant | `consent-v2.integration.test.ts:620-636` |
| No-grant safe no-op (never mutates) | `consent-v2.integration.test.ts:638-647` |
| Web route: forged/invalid token → 400, no mutation | `apps/api/src/routes/consent-web.integration.test.ts:865-870`, `:948-955` |
| Web route: active grant → confirm page; withdrawn+in-grace → undo landing; no grant → "nothing to withdraw" | `consent-web.integration.test.ts:872-910` |
| Web route: POST withdraw stamps + dispatches `app/consent.email-revoked` | `consent-web.integration.test.ts:912-946` |
| Web route: restore within grace / after grace (410) | `consent-web.integration.test.ts:957-987` |
| Token minted at approval round-trips through `verifyWithdrawalToken` | `consent-web.integration.test.ts:989-997`, `:1114-1147` (Suite 7) |
| Approval still succeeds when the secret is absent (no 500, email just omitted) | `consent-web.integration.test.ts:1148-...` ("approval still succeeds (200, no email) when the withdrawal-token secret is absent") |
| Production boot fails loudly without the secret; minimum-length enforced | `apps/api/src/config.test.ts:357-385`, `:131,153,198,222,344` |
| Rate limiting shared with, and inherited from, the existing `/consent-page/confirm` per-IP budget [BUG-99 accepted limitation] | `consent-web.ts:260-295`; general coverage `consent-web.integration.test.ts:611-698,699-767` |

No new code was written for this posture review; all evidence above is existing, already-shipped test coverage.

---

## 5. Approvals

| Role | Name | Scope of approval | Date |
|---|---|---|---|
| DPO (acting — no outsourced DPO appointed yet; the empty seat does not block this gate) | Jørn Jørgensen | Accepts the residual risk on T-1, T-2, T-3, T-6, T-9, T-11 as stated (operational responses and re-evaluation triggers as written); requires T-10's mitigation before the P0 mechanism is considered closed; rules the T-11 product-policy position. | 2026-07-17 |
| Accountable engineering/security owner (sole author of the bearer-token mechanism — token file, wrapper functions, and web routes; git blame shows the shared internal helpers `stampWithdrawal`/`appendRestoreGrant`, including the advisory-lock race fix, were authored/patched by another contributor) | Zuzana Kopečná | Confirms the source-grounded description in §1 and the verification citations in §3–4 are accurate against the code as of this review. | 2026-07-17 |

**Explicit acceptance statement (per AC-5):** one threat (T-10) is ruled mitigate-before-launch; every other threat above is accepted for MVP with the operational response and re-evaluation trigger stated in its row. This posture is **not** complete until T-10's follow-up implementation Work Item exists and is linked (tracked via `.workitem-artifacts/WI-2064/incidental-items.json` in this branch; the owning shepherd mints the Work Item).

**What this posture does NOT claim:** the non-expiring bearer-token risk has **not** been removed. It has been dispositioned — accepted for the threats in §3 marked Accept-for-MVP, resolved by design for those marked Resolved, and scheduled for mitigation (T-10) with a named follow-up.

---

## 6. Cross-reference

`dpia.md` §6 (risk register, row 6.11) and §9 (launch-blocking conditions, item 9) cross-reference this posture per AC-7, so WI-1577's final gate can read the decision, owners, residual risk, and the linked mitigation dependency from `dpia.md` without reconstructing them from commit or PR comments.

**Note on a stale in-code citation:** several existing code comments (`consent-v2.ts:725,839,1259`; `consent-web.ts:529,678`) and one test comment (`consent-v2.integration.test.ts:537`) cite this mechanism's architecture decision as "MMT-ADR-0027." That number belongs to an unrelated, earlier-numbered ADR ("Supporter visibility contract"); the actual bearer-token ADR is **`MMT-ADR-0029`**, cited throughout this document. This is a pre-existing drift in the source comments, not introduced here — flagged per house style ("notice stale text, don't fix it silently") rather than corrected in this docs-only change.
