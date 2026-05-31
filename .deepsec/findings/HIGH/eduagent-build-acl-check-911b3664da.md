# [HIGH] Consent request can target arbitrary same-account profiles

**File:** [`apps/mobile/src/app/consent.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/consent.tsx#L46-L180) (lines 46, 148, 153, 155, 172, 178, 180)
**Project:** eduagent-build
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

The screen trusts the URL-provided profileId and sends it as childProfileId when creating or resending a consent request. The traced API path only verifies that childProfileId belongs to the authenticated account, not that the active profile is allowed to initiate consent for that target, that the target is a non-owner child, or that the target currently requires consent. Because the emailed token can later be denied through the unauthenticated consent response path, and that path deletes the profile tied to the token, a same-account non-owner profile could create a consent token for an owner/adult/sibling profile and cause destructive cross-profile data loss.

## Recommendation

Do not trust the route profileId as the authority. Server-side, require the target to be the active pending-consent profile or require a verified owner/parent relationship, verify the profile actually requires consent and is not the owner, and reject consent denial deletes for invalid/adult/owner targets. Client-side, reject profileId values that do not match the expected active profile.

## Revalidation

**Verdict:** true-positive

Traced the full chain. POST /v1/consent/request is NOT in PUBLIC_PATHS (auth.ts:35-50), so it requires Clerk account auth, but /v1/consent/ is exempt from consentMiddleware (consent.ts middleware EXEMPT_PREFIXES), so even a PENDING/non-owner profile reaches it. The handler (routes/consent.ts:164-251) only calls requireAccount and getProfile(db, childProfileId, account.id) — it never checks isOwner, never calls assertNotProxyMode, and never verifies the target is a non-owner minor that actually requires consent. The service requestConsent() (services/consent.ts:392) likewise only re-verifies account membership, then upserts a PARENTAL_CONSENT_REQUESTED row with a fresh token for ANY account profile (including an adult/owner whose row is absent or CONSENTED-with-null-email, which the setWhere `parentEmail IS NULL` branch happily flips). The emailed token then flows to the PUBLIC POST /v1/consent/respond, whose processConsentResponse(...,approved=false) runs a transaction that cascade-deletes the targeted profile (services/consent.ts:811-814). The only constraint (account.email !== parentEmail, routes/consent.ts:185) is bypassed by using any attacker-controlled address. Concrete attack: a non-owner child session POSTs /consent/request{childProfileId: <owner-or-sibling id from GET /profiles>, parentEmail: attacker@evil.com}, receives the email, and POSTs /consent/respond{token, approved:false}, irreversibly deleting that profile and all CASCADE data. This is not defused by the shared-Clerk-session model: the non-owner achieves cross-profile destruction WITHOUT escalating to owner (assertNotProxyMode would block an owner write, but this path has no such guard), and minting consent-denial tokens for adults/owners is never an intended behavior (the deny path is documented as deleting 'the child's profile' for FR10). Cross-profile data loss is explicitly the project's highest-impact threat. The client-side WI-295 profileBelongsToAccount check is account-membership only and bypassable. Real and exploitable.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
