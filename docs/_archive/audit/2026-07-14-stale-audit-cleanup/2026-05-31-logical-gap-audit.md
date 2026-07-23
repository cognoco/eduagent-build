# Logical-Gap Audit — Missing Flows & Dead-Ends

> **STATUS (2026-06-27):** Audit backlog — findings tracked inline below; not wholesale re-verified in the 2026-06-27 doc-audit pass; treat per-item status as point-in-time.

> Generated 2026-05-31 by a 10-domain x 5-persona multi-agent sweep with adversarial verification.
> 54 candidate gaps found -> **36 confirmed** (survived a refute pass), 18 refuted.
> A "logical gap" = a plausible user intent with **no path** through the system, or a path that **dead-ends with no recovery**. Not styling, not crashes.

## Summary by severity

| Severity | Count |
|---|---|
| High | 2 |
| Medium | 28 |
| Low | 6 |

## Summary by domain

| Domain | Confirmed |
|---|---|
| auth | 4 |
| identity | 5 |
| family | 4 |
| consent | 5 |
| billing | 3 |
| onboarding | 4 |
| learning | 3 |
| activities | 3 |
| progress | 1 |
| notifications | 4 |

---

## HIGH severity (2)

### consent-1 — A parent who approved consent for a self-registered minor (P2) later wants to withdraw/revoke that consent (GDPR Art. 7(3): withdrawal must be as easy as granting).

- **Domain:** Consent / COPPA / GDPR
- **Persona(s):** P2 (the self-registered minor) and the consenting parent who has no account
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.85
- **Expected path:** After approving via the emailed link, the parent should be able to revoke consent — the approval page literally promises 'You can withdraw consent at any time from the parent dashboard in the app' (consent-web.ts:207).
- **Actual state:** For a self-registered minor, createProfile is called with NO parentProfileId, so the family_links row is only created when parentProfileId is provided (profile.ts:386-391). The consent is recorded PENDING via createPendingConsentState (profile.ts:409) which, unlike createGrantedConsentState, creates NO family link. After the parent approves, processConsentResponse only flips status to CONSENTED (consent.ts:890-891) and never creates an account, profile, or family_link for the parent. The ONLY revoke path, revokeConsent, requires a familyLinks row between parentProfileId and childProfileId (consent.ts:1232-1240) AND the route requires a logged-in account-owner profile (consent.ts:529 assertOwnerProfile). The consenting parent is not on the account and has no link, so there is no reachable revoke path. The promised 'parent dashboard' does not exist for this case.
- **Evidence:** `apps/api/src/services/profile.ts:386-391`, `apps/api/src/services/profile.ts:408-414`, `apps/api/src/services/consent.ts:293-319`, `apps/api/src/services/consent.ts:890-908`, `apps/api/src/services/consent.ts:1226-1240`, `apps/api/src/routes/consent.ts:523-532`, `apps/api/src/routes/consent-web.ts:207`
- **Verifier notes:** Confirmed real gap after exhaustive search. The only consent-revocation route is PUT /consent/:childProfileId/revoke (apps/api/src/routes/consent.ts:523-532), gated by TWO unsatisfiable conditions for a self-registered minor's consenting parent: (1) requireProfileId + assertOwnerProfile (lines 525, 529) require a logged-in account-owner profile — the consenting parent has no account/profile at all; (2) revokeConsent (consent.ts:1232-1240) throws ConsentNotAuthorizedError unless a familyLinks row exists between parent and child. For a self-registered minor, createProfile inserts a familyLinks row ONLY when parentProfileId is provided (profile.ts:386-391), and the self-registration path calls createPendingConsentState (profile.ts:409) which inserts only a consentStates row (consent.ts:293-319, verified — no family link). Parent approval via processConsentResponse only flips status to CONSENTED (consent.ts:890-891) and creates no account/profile/family_link. The web consent surface has exactly three routes (consent-web.ts:154 /consent-page approve+deny, :218 deny-confirm, :280 confirm) — none offer post-approval revocation. The page literally promises 'withdraw consent at any time from the parent dashboard in the app' (consent-web.ts:207), but that dashboard does not exist for this case: the self-registered minor IS the account owner, and the consenting parent never gets any app presence. No reachable path serves the parent-revokes-consent intent. Severity held at HIGH: GDPR Art. 7(3) requires withdrawal be as easy as granting; here it is impossible for the consenting party, and the app makes an explicit unfulfillable written promise. Not found tracked in docs/compliance/audience-matrix.md (its withdrawal references F2/F5/F7 are all owner/account-side flows, not the self-registered-minor consenting-parent case).

### learn-1 — A minor non-owner child on a parent's account (P3) opens their own profile and tries to start/continue a learning session, send a message, or create a subject.

- **Domain:** Learning core
- **Persona(s):** P3
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.66
- **STATUS: CONFIRMED (hands-on code trace, 2026-05-31).** The server half is proven by an *existing passing test*: `sessions.test.ts:3357-3392` (`makeProxyApp`) sets only `profileMeta: { isOwner: false }` — no proxy header — and asserts every session write returns 403. That input is identical to the client's `child-study-only` condition (`navigation-contract.ts:297`: non-owner active profile, `isParentProxy=false`). Reachable on-device via plain `switchProfile(childId)` from the profile switcher (`profiles.tsx:141`), which defaults `proxyMode=false` (`profile.ts:375`; named case at `use-parent-proxy.ts:31`). The mobile `session/_layout` gate only blocks on `isParentProxy`, so the child reaches the session UI and fails *mid-flow* with 403, not a clean gate. **Root cause:** `assertNotProxyMode` equates "proxy session" with `isOwner===false`; correct when the only non-owner-active case was parent-proxy, but the ACCOUNT-04 refactor introduced a legitimate non-proxy non-owner state (child self-study) the guard can't distinguish — and it can't, because `accounts.clerkUserId` is unique (one login per account), so the server cannot tell parent-holding-phone from child-holding-phone. Fix is a design decision, not a one-liner. **Caveat:** pre-launch (no users); "live" = breaks the first family where a child studies on their own profile.
- **Expected path:** Child taps the 'Study' CTA on their learner home, starts a session, and exchanges messages with the tutor — the core product loop for the learner tab shape.
- **Actual state:** Every learning-core write (POST /subjects/:id/sessions, /sessions/:id/messages, /stream, /close, POST /subjects, curriculum skip/add/challenge) calls assertNotProxyMode(c), which throws 403 PROXY_MODE whenever profileMeta.isOwner === false (proxy-guard.ts:58). isOwner is the profile's own DB flag, set false for any non-owner profile in profile-scope.ts:200 / profile.ts:369 — it is NOT relative to who is operating. A parent-added child is always isOwner=false (profile.ts:369, 386). The mobile session gate only blocks on the explicit isParentProxy flag (session/_layout.tsx:17-19), which is false when a child operates their own profile (switchProfile defaults proxyMode=false, profile.ts:375). So the child reaches the session screen and the un-gated study CTA (LearnerScreen.tsx:94), then every server write returns 403 with code PROXY_MODE — a hard dead-end with no recovery for the learner.
- **Evidence:** `apps/api/src/middleware/proxy-guard.ts:57-63`, `apps/api/src/middleware/profile-scope.ts:193-201`, `apps/api/src/services/profile.ts:334-391`, `apps/api/src/routes/sessions.ts:252,284,485,666,1232`, `apps/mobile/src/app/(app)/session/_layout.tsx:17-31`, `apps/mobile/src/lib/profile.ts:370-400`, `apps/mobile/src/components/home/LearnerScreen.tsx:94`
- **Verifier notes:** I tried hard to refute this and could not find a path. The finder's mechanism is verified end-to-end:

SERVER BLOCK (confirmed): Every learning-core write calls assertNotProxyMode(c) unconditionally — sessions.ts:252,284,320,333,485,593,666,1232 (start/message/stream/close), subjects.ts:67,81,97,116,142,171 (create subject), curriculum.ts:130-238 (skip/add). assertNotProxyMode throws 403 PROXY_MODE whenever profileMeta.isOwner === false (proxy-guard.ts:58). profileMeta.isOwner is the profile's OWN DB row flag (profile-scope.ts:200), not relative to who operates.

NON-OWNER CHILD IS PERMANENT (confirmed): createProfile sets isOwner: isOwner ?? false for every non-first profile (profile.ts:369). A parent-added child gets the family_links row but stays isOwner=false (profile.ts:386-390); the consent self-register path (consent.ts:370-377) also never sets owner. I grepped all of apps/api/src for any isOwner:true write — every hit is a test fixture; NO production code promotes a child to owner. Ground-truth ownership model holds.

IDENTITY MODEL (confirmed, strengthens the gap): accounts.clerkUserId is unique (profiles.ts:46) — one Clerk login = one account holding N profiles. A P3 child is NOT independently loginable; they exist only as a sub-profile the parent switches into. So the only way the child operates is the parent switching the active profile to the child's slot.

MOBILE EXPLICITLY INTENDS THE CHILD TO STUDY (the smoking gun): navigation-contract.ts:297-298 has a dedicated branch `else if (!context.activeProfile.isOwner) { reason = 'child-study-only'; }` — shape stays learner, learner tabs + study CTAs remain. switchProfile to the child's own slot defaults proxyMode=false (profile.ts:370-375, comment: "child switching to their own slot ... default to false"). The session/_layout V0 gate only blocks on isParentProxy (session/_layout.tsx:17-19), which is false here. So the child reaches the un-gated study CTA (LearnerScreen.tsx:79-100) and every server write returns 403 PROXY_MODE.

CONTRADICTION = THE GAP: mobile's contract names this persona "child-study-only" and presents the full learner loop; the server's proxy guard cannot distinguish "child self-studying" from "parent proxying into child" (both isOwner=false) and 403s every write. proxy-guard.test.ts:73-104 confirms isOwner=false is treated uniformly as proxy-blocked across all write routes. The PROXY_MODE classifier's only recovery is a switch-profile hint — but a non-owner child has no owner profile to switch to, so it's a hard dead-end for the learner.

NOT TRACKED: docs/compliance/audience-matrix.md does not flag this — it lists session/index.tsx:1109 sessionIsOwner as intentional F5 content gating and treats non-owner uniformly as proxy. So alreadyTracked=false.

SEVERITY: high — it nullifies the entire core product loop (start session, send message, create subject) for a fully-documented persona (P3, "child on a parent's account" = learner tab shape per CLAUDE.md). Mitigating context that I considered but that does not downgrade below high: pre-launch with no active users, and it requires the family flow to be exercised. The absence of ANY write path for an intended-to-study persona is a true dead-end, not merely clunky.

CAVEAT for the coordinator: one could argue product intent is actually "non-owner children should NOT do their own learning writes (parent reviews only)," in which case this is a mobile over-exposure bug (show CTA that 403s) rather than a missing-server-path bug. Either way it is a real logical dead-end — the UI offers an action that has no working path and no recovery — so isRealGap stands regardless of which side is deemed correct.

---

## MEDIUM severity (28)

### auth-1 — A minor on a parent's account (P3) wants to delete their own learning data / leave the account / have their profile removed without deleting the parent's whole account.

- **Domain:** Auth & account lifecycle
- **Persona(s):** P3
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.85
- **Expected path:** A non-owner profile should be able to request its own removal or data deletion (a GDPR-relevant right), reachable from a settings/privacy surface.
- **Actual state:** Account deletion is account-scoped and owner-only: POST /account/delete calls assertOwnerProfile (apps/api/src/routes/account.ts:59) and scheduleDeletion operates on account.id, deleting ALL profiles. The mobile delete-account screen redirects non-owners away (apps/mobile/src/app/delete-account.tsx:167-169) and the Privacy screen only renders the delete row behind showExportDelete = ownerRole && !isParentProxy (apps/mobile/src/app/(app)/more/privacy.tsx:149-155, navigation-contract.ts:365). Per-profile deleteProfile() exists but is invoked only from Inngest consent jobs (apps/api/src/services/deletion.ts:279-285; callers archive-cleanup.ts:50, consent-reminders.ts:201, consent-revocation.ts:283), never from a user-facing route. Self-withdrawal is also blocked: consent revoke/restore is owner-only and keyed on childProfileId (apps/api/src/routes/consent.ts:529,573). So a non-owner has no route to delete their data or leave.
- **Evidence:** `apps/api/src/routes/account.ts:59`, `apps/mobile/src/app/delete-account.tsx:167`, `apps/mobile/src/app/(app)/more/privacy.tsx:149`, `apps/mobile/src/lib/navigation-contract.ts:365`, `apps/api/src/services/deletion.ts:279`, `apps/api/src/routes/consent.ts:529`
- **Verifier notes:** CONFIRMED GAP after thorough adversarial search. I could not find any path serving the P3 self-deletion/leave intent.

Verified the finder's full claim chain:
- POST /account/delete is account-scoped (operates on account.id) and owner-gated via assertOwnerProfile (apps/api/src/routes/account.ts:59-64); scheduleDeletion deletes ALL profiles. /account/export and /account/cancel-deletion are also assertOwnerProfile-gated (account.ts:150,123).
- deleteProfile() (services/deletion.ts:279-286) and its consent-conditional siblings deleteProfileIfConsentWithdrawn (288), deleteProfileIfNoConsent (329) are invoked ONLY from Inngest functions: archive-cleanup.ts:50, consent-reminders.ts:201, consent-revocation.ts:283-288. No user-facing route calls them.
- Self-withdrawal blocked: PUT /consent/:childProfileId/revoke and /restore are both assertOwnerProfile-gated and keyed on a childProfileId param the OWNER supplies (consent.ts:529,573) — a non-owner cannot target their own profile.
- POST /subscription/family/remove is owner-gated too (billing.ts:902, "Only the family owner can remove a profile") and is a billing-seat op, not data deletion.
- Mobile: delete-account.tsx:167-169 redirects any non-owner (activeProfile.isOwner !== true) to /(app)/more. Privacy screen renders export+delete rows only behind showOwnerPrivacyGates = navigationContract.gates.showExportDelete (privacy.tsx:25,137-155). The withdrawal-archive control above the gates is itself gated on showRemoveFamilyMember AND linkedChildren.length > 0 (privacy.tsx:26,98) — i.e. an owner-with-children control, not a non-owner self-service path. No leaveAccount/removeMe/self-delete/data-wipe route exists in apps/api/src/routes.

Already tracked: PARTIALLY. docs/flows/master-directory/account/ACCOUNT-30.md documents the owner-gating as INTENDED ("Child/non-owner profiles cannot manage owner account actions") but frames it as a safety guard and does NOT acknowledge the missing GDPR self-deletion right for a minor non-owner. So the absence-of-path is not tracked as a gap; set alreadyTracked=false in spirit.

Severity adjusted to medium (not high): identity model keeps all profiles same-account, family is adults-only, and the owner CAN delete a child's data via consent revoke. The minor's recovery is mediated (must ask the owner) rather than absent entirely. But there is genuinely zero self-service route for the minor to exercise their own deletion right, which is the GDPR-relevant gap.

### auth-2 — Any persona (P1/P2/P4/P5) wants to change the email address associated with their account (typo at sign-up, lost access to old inbox, switching providers).

- **Domain:** Auth & account lifecycle
- **Persona(s):** P1, P2, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** Account/security settings should expose a 'change email' flow (createEmailAddress + prepareVerification + setPrimary in Clerk), since email is the primary login identifier and the recovery channel for forgot-password.
- **Actual state:** There is NO email-change UI anywhere in the mobile app. account.tsx only displays the email read-only as the profile value (apps/mobile/src/app/(app)/more/account.tsx:36-41) and AccountSecurity offers only password change, with the 2FA toggle commented out (apps/mobile/src/components/account-security.tsx:16-19,47-72). Grep for updateEmail/createEmailAddress/prepareVerification/setPrimary across apps/mobile/src returns no matches in any settings surface. A user who can no longer access their sign-up email is therefore locked out of both login and forgot-password recovery, which keys entirely on the email (apps/mobile/src/app/(auth)/forgot-password.tsx:110-115).
- **Evidence:** `apps/mobile/src/components/account-security.tsx:47`, `apps/mobile/src/app/(app)/more/account.tsx:36`, `apps/mobile/src/app/(auth)/forgot-password.tsx:110`
- **Verifier notes:** CONFIRMED as a real gap. After thorough search of mobile screens (account.tsx, account-security.tsx, privacy.tsx, help.tsx, profiles), API routes/services, and docs, there is NO self-service path to change the account's own login email for any persona.

Evidence of absence:
- account.tsx:36-41 shows email only as a read-only displayName fallback; no change-email row.
- account-security.tsx:47-72 offers ONLY ChangePassword; 2FA commented out (lines 16-19). No email control.
- privacy.tsx (export/delete) and help.tsx (mailto:support only) contain no email-change path.
- Mobile grep for createEmailAddress/prepareVerification/setPrimary/updateEmail returns zero matches in any settings surface. All prepareEmailAddressVerification usages are sign-up.tsx (new account creation) and sign-in.tsx/forgot-password.tsx (verifying an existing email to authenticate/reset) — never editing the stored email.
- API: clerk-user.ts only READS email from Clerk; account.ts is provisioning. No email-update route in apps/api/src/routes.

The docs' 'change email' (ACCOUNT-21, flow-master-directory.md:132, epics.md:1149-1239) is a DIFFERENT intent: changing the PARENT/CONSENT recipient email during the consent-pending gate for minors — not the account holder's own login identifier. Does not serve P1/P4/P5 at all, and for P2 only redirects consent delivery.

Recovery dead-end is real: forgot-password.tsx:110-113 keys entirely on identifier=emailAddress (reset_password_email_code). A user without inbox access can neither reset password nor change the email. Only escape is the manual mailto:support@mentomate.app link in help.tsx:18 (off-app, no self-service).

Severity adjusted to medium (down from likely-high): a manual support escape hatch exists, the typo-at-signup case is unrecoverable in-app but does not block core learning, and the full lockout scenario affects a minority. Not tracked in audience-matrix.md or the flow master-directory as a self-email-change gap (alreadyTracked=false).

### auth-4 — A user wants to see and sign out their other active sessions/devices (lost phone, shared device, suspicious login) without changing their password.

- **Domain:** Auth & account lifecycle
- **Persona(s):** P1, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.75
- **Expected path:** A security/devices screen listing Clerk sessions with a 'sign out other devices' / revoke action (Clerk user.getSessions / session.revoke).
- **Actual state:** No active-session/device management UI exists. The only sign-out is signOutWithCleanup, which ends the CURRENT session only (apps/mobile/src/app/(app)/more/index.tsx:243-248). AccountSecurity exposes only password change (apps/mobile/src/components/account-security.tsx:47-72). Grep for getSessions/revokeSession/otherSessions/activeSessions across apps/mobile/src returns only learning-session matches, no Clerk session APIs. A user who suspects a session on a lost device cannot revoke it; the only mitigation is changing the password, which is itself unavailable to SSO-only and non-owner users (see auth-3).
- **Evidence:** `apps/mobile/src/app/(app)/more/index.tsx:243`, `apps/mobile/src/components/account-security.tsx:47`
- **Verifier notes:** VERIFIED REAL GAP. Searched exhaustively and could not refute it.

Evidence of absence:
- No Clerk multi-session API anywhere in mobile: grep for useSessionList / getSessions / revokeSession / otherSessions / activeSessions / .revoke returns ZERO Clerk-session hits. All "sessions" matches are learning-sessions (session/index.tsx, OutboxDrainProvider), Stripe (billing.ts checkout/portal), or repo queries (progress.ts, snapshot-aggregation.ts). The only "revoked" hits are auth-expiry storage keys (auth-expiry.test.ts), unrelated to device-session revocation.
- API side: no clerkClient.sessions.revoke, no getSessionList, no users.getSession. Confirmed across apps/api/src.
- The single sign-out (apps/mobile/src/app/(app)/more/index.tsx:243) calls signOutWithCleanup, which calls Clerk's no-arg signOut() (apps/mobile/src/lib/sign-out.ts:89,143,155). No-arg signOut ends only the CURRENT session; no sessionId is passed and there is no signOut({ sessionId }) call anywhere.
- AccountSecurity (apps/mobile/src/components/account-security.tsx:47-72) exposes ONLY change-password for password accounts, and a read-only "secured via {provider}" notice for SSO accounts (lines 36-45). No devices/sessions screen. The 2FA toggle is commented out (lines 16-19,49).
- useClerk is imported only for signOut (app/_layout.tsx:115). setActive matches are profile-switching, not Clerk session management.

So intent "see/revoke my other active sessions/devices without changing password" has no entry point, no action, no resolution. The expected security/devices screen does not exist.

Severity adjusted to MEDIUM (down from a likely HIGH claim): this is a missing feature, not an in-app dead-end that traps the active user. Out-of-app mitigations exist (Clerk hosted account portal / password reset), and the app is pre-launch with no active users (project_pre_launch_no_users). But it IS a genuine security-hygiene gap — and the only in-app mitigation (change-password) is unavailable to SSO-only accounts (account-security.tsx:36-45) and gated to owners, so a lost-device/suspicious-login user often has no in-app recourse at all. Not refuted.

### billing-2 — A family owner (P4) removes a child from the family plan (e.g. child left, or to free a seat), then later wants to re-add that child / restore that child's profile.

- **Domain:** Billing & subscription
- **Persona(s):** P4 (affects P3)
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.75
- **Expected path:** Removing a child from the family plan frees a seat but preserves the child's profile so it can be re-added, OR there is an explicit unarchive/re-add path.
- **Actual state:** removeProfileFromSubscription (apps/api/src/services/billing/family.ts:497-569) hard-sets profiles.archivedAt and deletes the family_links rows. There is NO re-add path: the add UI only calls /create-profile to make a NEW child (apps/mobile/src/app/(app)/more/index.tsx:56-75), addProfileToSubscription only validates an existing same-account profile against maxProfiles (family.ts:441-475) and is not surfaced by any 'restore archived child' UI. The only archivedAt:null reset in the codebase is consent-restoration (apps/api/src/services/consent.ts:1354), keyed on a withdrawn-then-restored consentState — it does not fire for seat removal. So a seat-removed child is archived with no user-facing restore route.
- **Evidence:** `apps/api/src/services/billing/family.ts:539-566`, `apps/mobile/src/app/(app)/subscription.tsx:579-621`, `apps/mobile/src/app/(app)/more/index.tsx:56-75`, `apps/api/src/services/consent.ts:1354`
- **Verifier notes:** VERIFIED REAL GAP. I tried hard to refute it and could not find any re-add/restore path for a seat-removed child.

Removal mechanics confirmed: POST /subscription/family/remove (billing.ts:888-935) -> removeProfileFromSubscription (family.ts:496-568) sets profiles.archivedAt=new Date() (family.ts:538-552) AND DELETES both directions of the family_links rows (family.ts:558-565). It does NOT touch consentStates.

Only archivedAt:null reset in production code is consent.ts:1354, inside restoreConsent. That path is unreachable for a seat-removed child because it requires BOTH preconditions that seat removal destroys/never sets:
- restoreConsent first looks up a familyLinks row parent->child (consent.ts:1295-1303) and throws ConsentNotAuthorizedError if absent — but seat removal deleted that row.
- it then requires a consentStates row in WITHDRAWN status (consent.ts:1313); a non-null reset only happens for a withdrawn-then-restored consent. Seat removal never writes consentStates, so even if the link survived, status would not be WITHDRAWN and the function returns early (consent.ts:1313-1315) without clearing archivedAt.

Re-add routes cannot resurrect the archived profile either:
- POST /subscription/family/add (billing.ts:838-884) -> addProfileToSubscription (family.ts:440-474) only validates the profile exists, is same-account, and is under maxProfiles via getProfileCountForSubscription; it never resets archivedAt and is never wired to any 'restore archived child' UI.
- createProfile (profile.ts:361-378) always INSERTs a brand-new row; no archived-row reuse.

UI confirms absence of an entry point: the only add affordance (more/index.tsx:56-75) pushes /create-profile?for=child (new profile). subscription.tsx handleRemoveFamilyProfile (579-621) is remove-only. getProfilesByAccountId and siblings filter isNull(profiles.archivedAt) (profile.ts:125,187,258,279,459,488,517,561...), so a seat-removed child never appears in profile lists, profile switching, or any selectable picker — the parent has no surface from which to choose the archived child's ID to feed /family/add.

Net effect: removing a child from a family plan archives the profile permanently with no user-facing restore/re-add route. The child's learning history is preserved in DB (archived, not yet hard-deleted unless archive-cleanup runs) but is inaccessible and irrecoverable through the app. Parent's only recourse is to create a brand-new profile, losing all prior history/progress.

SEVERITY: medium (not high). Mitigating factors: (a) pre-launch, no real users yet; (b) it is a recovery/convenience gap, not a security or data-corruption bug; (c) data isn't immediately destroyed (archived state). Aggravating: silent + permanent from the user's perspective, and the remove confirmation copy ('removed from this family plan and hidden from profile switching') does not warn that re-adding is impossible, so a parent freeing a seat for another child cannot undo it.

ALREADY TRACKED: partially. docs/_archive/plans/done/app evolution plan/2026-05-06-hidden-wins-backlog.md:117,363,388 explicitly notes 'No mobile UI for removing a child once added to a family plan' and flags the same-account removal path as P2/PARTIAL — but that is an archived/done backlog doc, and it frames the gap as the removal UI rather than the missing RESTORE path. The re-add/unarchive dead-end specifically is not tracked in a live spec or docs/compliance/audience-matrix.md.

### billing-3 — A paying owner (P1/P4/P5) whose card fails at renewal wants to be told their payment failed and be guided to update their payment method before they lose access.

- **Domain:** Billing & subscription
- **Persona(s):** P1, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** On a BILLING_ISSUE/past_due transition the user receives a proactive notification (push/email/in-app) with a path to fix billing before the grace window expires.
- **Actual state:** RevenueCat handleBillingIssue sets status='past_due' and dispatches app/payment.failed (apps/api/src/services/billing/revenuecat-webhook-handler.ts:548-561), but the only consumer is payment-failed-observe.ts, which merely logs ('retryDeferred: pending_payment_failed_retry_strategy') — apps/api/src/inngest/functions/payment-failed-observe.ts:65-83. No email/push is sent. On mobile the only surfacing is a passive 'Past due' badge on the subscription screen (apps/mobile/src/app/(app)/subscription.tsx:815-816), visible only if the user happens to open that screen. There is no proactive 'update your card' prompt, so a user can silently lose paid access at grace-period end.
- **Evidence:** `apps/api/src/services/billing/revenuecat-webhook-handler.ts:548-561`, `apps/api/src/inngest/functions/payment-failed-observe.ts:65-83`, `apps/mobile/src/app/(app)/subscription.tsx:815-816`
- **Verifier notes:** VERIFIED AS A REAL GAP. After a thorough search of apps/api/src and apps/mobile/src, no proactive user-facing payment-failure notification path exists.

Evidence confirming the finder's claim:
1. apps/api/src/services/billing/revenuecat-webhook-handler.ts:519-561 — BILLING_ISSUE sets status='past_due', caps access at the grace boundary, and dispatches app/payment.failed. Correct so far.
2. apps/api/src/inngest/functions/payment-failed-observe.ts:65-83 — the ONLY consumer of app/payment.failed; it logs only (returns retryDeferred:'pending_payment_failed_retry_strategy'). No push/email/in-app send.
3. apps/api/src/inngest/functions/billing-trial-subscription-failed.ts:20-24 — explicit in-code admission: "No notification fan-out is dispatched from here — there is no existing 'billing-failure -> user' notification event registered... If/when a user-facing billing-failure notification path lands, wire it here."
4. None of the ~14 push/notification Inngest functions (review-due-send, daily-reminder-send, weekly-progress-push, recall-nudge-send, topup-expiry-reminder-send, etc.) listen on app/payment.failed or past_due.
5. Mobile: a Grep of apps/mobile/src for past_due/payment_failed/billingIssue returns ONLY subscription.tsx. The surfacing is a passive "Past due" badge (subscription.tsx:815-816). A fix affordance exists — handleManageBilling deep-link "Manage billing" button (subscription.tsx:1266) — BUT it is only reachable if the user independently opens the subscription screen. more/account.tsx and ParentHomeScreen.tsx have ZERO past_due/payment references, so it is not surfaced where P1/P4/P5 users naturally land.

Spec-vs-code confirmation: docs/specs/epics.md:3973 explicitly requires "on BILLING_ISSUE event from RevenueCat: send user notification (push + email)". This is UNIMPLEMENTED. Security review independently corroborates: docs/audit/.../security-reviewer.md:115 describes these handlers as "observe/log only."

REFUTATION ATTEMPT FAILED: The "Manage billing" button is a fix path but not a notification/awareness path — it requires the user to already suspect a problem and navigate to the subscription screen. The claimed intent ("be TOLD my payment failed and guided to fix it before losing access") has no proactive trigger anywhere in the codebase. No path found.

Severity adjusted to MEDIUM (not high): platform-side dunning provides a partial backstop — access is capped at the platform grace boundary (Apple 16-60 days, Google up to 30 days per epics.md:3977), and Apple/Google themselves email/notify the user about the billing issue during that window. So the user is not entirely silent-cut, but the app itself provides no proactive in-app/push prompt to fix billing, which is what the intent and the team's own spec call for.

Already tracked: a Notion item exists (docs/plans/2026-05-29-layered-codebase-risk-audit.md:300 "RevenueCat billing issues ignore app-store grace periods") and the epics.md:3973 requirement is an outstanding unimplemented spec line, so this is known/tracked but unresolved.

### billing-4 — A child on a Plus owner's account (P3) hits the per-child 100/mo (10/day) quota and wants more questions; the Plus owner wants to give their one child more capacity without buying the full Family plan.

- **Domain:** Billing & subscription
- **Persona(s):** P3 (affects P1 Plus owner)
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.6
- **Expected path:** Either the child has a recovery path that actually yields more questions, or the owner can raise the child's cap / buy a top-up that applies to the child.
- **Actual state:** On Plus, childMonthlyQuota is hard-coded to 100 and childDailyQuota to 10 (apps/api/src/services/subscription.ts:79-81), with no owner control to change it. Top-up credits are owner-only and pool-scoped: the usage route grants topUpCredits only when profileQuota.role==='owner' (apps/api/src/routes/billing.ts:489-496), so a Plus child cannot benefit from a top-up. The child's only paywall action is 'notify parent' (apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx:127-200). The parent's only capacity remedy is upgrading Plus->Family (700 owner / shared pool), but a Plus owner who simply wants their single child to have more than 100/mo has no intermediate path — and the child receives no signal that anything changed even if the parent does act.
- **Evidence:** `apps/api/src/services/subscription.ts:71-86`, `apps/api/src/routes/billing.ts:485-501`, `apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx:127-200`
- **Verifier notes:** VERIFIED AS A REAL GAP after exhaustive search of every plausible refutation path. The finder's claim holds on all three quota layers.

(1) No owner control to raise a child's cap. Child limits come ONLY from tier config childMonthlyQuota:100 / childDailyQuota:10 (subscription.ts:80-81), applied verbatim by clampProfileQuotaLimits via role==='owner'?ownerQuota:childQuota (metering.ts:588-591). No production route writes a per-child custom monthlyLimit/dailyLimit — every routes/ reference to those fields is in test files only (billing.test.ts). No 'manage child quota' / 'raise cap' endpoint exists.

(2) Top-ups cannot reach a Plus child — proven at three independent layers: (a) purchaseTopUpCredits on a per-profile tier FORCES the credit's profileId to the account owner and returns null if a non-owner is targeted (top-up.ts:128-142, esp. 140-141); (b) getTopUpCreditsRemaining is only scoped/granted when profileRole==='owner' both in the usage route (billing.ts:489-496) and in the metering hot path (metering.ts:698-700); (c) the consumption helper is literally named consumeOwnerTopUpCredit and is only called when snapshot.role==='owner' (metering.ts:797-808), scoping consumption to eq(topUpCredits.profileId, input.profileId) (lines 617,638). A child (role==='child') exhausting 100/mo falls straight through to {success:false, source:'none'} (metering.ts:811-824). So even if the owner buys a top-up, it is stamped owner-only and the child can never draw it down.

(3) Child paywall offers only 'notify parent' + passive browse/progress/home (ChildPaywall.tsx:127-200) — no purchase path.

(4) On the parent side the child-cap notification banner renders a message and a single DISMISS button (ParentHomeScreen.tsx:108-174); there is no 'raise this child's cap' control and no 'upgrade to Family' CTA wired to it.

(5) The only capacity remedy surfaced is buildUpgradeOptions(effectiveAccessTier) in the 402 body (metering.ts:737), i.e. full Plus->Family upgrade (shared 1500 pool). No intermediate 'one child, >100/mo' path exists.

Severity adjusted to MEDIUM (not high): a partial recovery exists — child can notify parent, and parent can upgrade to Family which does raise the child's effective capacity (shared pool). So it is not a hard dead-end. But the specific intent ('Plus owner wants their single child to have more than 100/mo without buying the full Family plan') genuinely has no route, and per the finder the child gets no signal even if the parent acts. I could not find alreadyTracked evidence in docs during this scoped search; treat as untracked unless the finder confirms otherwise.

### consent-2 — A parent who granted consent for a self-registered minor wants ongoing oversight of that minor's learning activity (the COPPA/GDPR premise that a parent who consents can supervise the child's data processing).

- **Domain:** Consent / COPPA / GDPR
- **Persona(s):** Consenting parent of a P2 self-registered minor
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.82
- **Expected path:** The act of granting parental consent should form a durable parent-child relationship (a family_link, a parent dashboard, digests, the ability to view/manage) — the same oversight a P4 guardian gets when they add a child directly.
- **Actual state:** Consent approval for a self-registered minor is a one-shot email transaction. createPendingConsentState (the self-registration path) creates no family_link, and processConsentResponse creates none on approval — it only sets status=CONSENTED (consent.ts:890-908). All parent-oversight surfaces (getChildConsentForParent consent.ts:1191-1204, parent digests, revoke/restore) are gated on a familyLinks row that never exists for this minor. The minor remains isOwner=true (first profile, profile.ts:465 isFirstProfile) on their own standalone account with zero parental management linkage. There is no path for the parent to ever see or manage the child after approval.
- **Evidence:** `apps/api/src/services/profile.ts:386-391`, `apps/api/src/services/profile.ts:465`, `apps/api/src/services/consent.ts:293-319`, `apps/api/src/services/consent.ts:890-908`, `apps/api/src/services/consent.ts:1191-1204`
- **Verifier notes:** CONFIRMED REAL GAP after thorough search of apps/api/src (consent.ts, profile.ts, routes/consent.ts, routes/consent-web.ts, inngest/consent-revocation.ts) and docs. I could not find any path that converts a self-registered minor's email-consent approval into a manageable parent-child relationship.

Evidence the path does NOT exist:
1. Self-registration profile creation (first profile, parentProfileId undefined) calls ONLY createPendingConsentState — no familyLinks insert. profile.ts:408-414, with an explicit comment at profile.ts:504-510: "Consent flow (PENDING state) is ONLY for first-profile creation by a self-registering underage user who has no parent on the account yet."
2. familyLinks.insert appears in consent.ts EXACTLY ONCE — createGrantedConsentState (consent.ts:372), which is the parent-adds-child-directly path requiring an existing parentProfileId. It is NOT in processConsentResponse.
3. processConsentResponse (the email-approval handler, called from consent-web.ts:347) on approval only runs updateStatus → status=CONSENTED (consent.ts:890-908). No familyLinks insert, no profile mutation. The "parent" here is a bare email string (parentEmail), not a profile/account — there is nothing to link to even in principle.
4. Every parent-oversight surface is gated on a familyLinks row that this flow never creates:
   - getChildConsentForParent throws ConsentNotAuthorizedError without a link (consent.ts:1197-1204)
   - revokeConsent throws ConsentNotAuthorizedError('revoke') without a link (consent.ts:1232-1239)
   - the revoke route also requires an authenticated profileId + assertOwnerProfile (routes/consent.ts:525-529) — the email-only parent has neither an account nor a profile
   - app/consent.revoked / consent-revocation Inngest flow keys off parentProfileId from the route payload, which only exists when a link exists.

Net: after clicking "approve" in the consent email, the parent has no account, no profile, no auth session, and no family_link — therefore zero route to view, digest, revoke, or manage the child's learning data. The only way to get parental management is the entirely separate "parent adds child directly" flow (createGrantedConsentState), which does not retroactively attach to an already-self-registered minor.

NOT tracked in docs/compliance/audience-matrix.md: F1-F14 there are navigation-contract findings; the only consent items (F2) concern shell-level UI consent-overlay interception, not parent-oversight linkage. docs/audit/.../consolidated-triage.md:138 references a DIFFERENT consent vuln (attacker sets parentEmail to bomb addresses), not this oversight dead-end.

Severity adjusted to medium (not high): by design the self-reg minor is a standalone data subject on their own account, and the consent flow's documented purpose is one-time gatekeeping rather than establishing ongoing management. A parent who wants oversight has the alternative of creating the child under their own account. But the stated intent — a parent who DID consent wanting ongoing supervision of that specific self-registered minor — genuinely dead-ends with no escape, which is a legitimate COPPA/GDPR oversight gap.

### consent-3 — A minor non-owner on a parent's account (P3) wants to exercise their own GDPR data-subject rights: export their personal data, or have it erased (right to be forgotten for their own profile).

- **Domain:** Consent / COPPA / GDPR
- **Persona(s):** P3 minor non-owner on a parent's account
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A data subject should be able to obtain a copy of their own data and request erasure of their own profile, even if they are not the account owner.
- **Actual state:** Both export and deletion are account-scoped and hard-gated to the owner. GET /account/export calls assertOwnerProfile (account.ts:150) and generateExport pulls ALL profiles on the account (export.ts:198-202) — there is no per-profile export. POST /account/delete is owner-only (account.ts:59) and deletes the entire account. The mobile privacy screen only renders Export/Delete rows when navigationContract.gates.showExportDelete is true, which is owner-and-not-proxy only (navigation-contract.ts:365). A P3 minor has no export and no self-erasure path; their only recourse is asking the owner to nuke the whole account.
- **Evidence:** `apps/api/src/routes/account.ts:59`, `apps/api/src/routes/account.ts:149-153`, `apps/api/src/services/export.ts:198-202`, `apps/mobile/src/app/(app)/more/privacy.tsx:25`, `apps/mobile/src/app/(app)/more/privacy.tsx:137-155`, `apps/mobile/src/lib/navigation-contract.ts:365`
- **Verifier notes:** Verified the claim holds after exhaustive search. No path lets a P3 minor non-owner exercise their own GDPR data-subject rights.

EXPORT (true dead-end, no path at all):
- GET /account/export is the ONLY export endpoint; hard-gated via assertOwnerProfile (apps/api/src/routes/account.ts:150). generateExport(db, account.id) pulls every profile on the account — there is no per-profile/scoped export variant anywhere (confirmed in apps/api/src/services/export.ts). A P3 minor cannot call it and there is no alternative.
- Mobile: privacy.tsx renders the Export row only when showOwnerPrivacyGates = navigationContract.gates.showExportDelete (owner-and-not-proxy), so a P3 sees no Export row at all (apps/mobile/src/app/(app)/more/privacy.tsx:25, 137-148).

SELF-ERASURE (no direct path; only an owner-mediated indirect one):
- No DELETE /profiles/:id route exists at all — apps/api/src/routes/profiles.ts has only GET /profiles, POST /profiles, GET/PATCH /profiles/:id, PATCH /profiles/:id/app-context, POST /profiles/switch. No deletion verb.
- POST /account/delete is owner-gated (account.ts:59) and destroys the WHOLE account, not one profile.
- The only single-profile deletion mechanism is the consent-revocation Inngest flow (apps/api/src/inngest/functions/consent-revocation.ts), which deletes/archives exactly one child profile — but it is triggered ONLY by PUT /consent/:childProfileId/revoke, which is gated by assertOwnerProfile (apps/api/src/routes/consent.ts:529). Revocation is a parent action; the child cannot self-trigger it.

So a P3 minor's data-subject rights are not self-serviceable: self-export has zero path; self-erasure is only achievable by persuading the account owner to revoke their consent (which then deletes/archives only that child via the 7-day grace flow). That owner-mediated erasure path is why I set severity to MEDIUM rather than HIGH — the right CAN be exercised, just not by the data subject themselves, which is the GDPR concern.

Tracking status: NOT tracked as a gap. docs/compliance/audience-matrix.md (lines 59, 120, 122) and docs/flows/master-directory/account/ACCOUNT-30.md treat owner-gating of export/delete as intended design (F5/F7 are about consolidating duplicated isOwner UI gating into resolveNavigationContract, not about the absence of a per-subject data right). No master-directory flow covers minor-non-owner self-export/erasure.

### consent-4 — A minor non-owner (P3) wants to leave / be removed from a parent's account as a standalone individual (e.g. turning 18, family conflict) without losing all their learning data and without deleting everyone else.

- **Domain:** Consent / COPPA / GDPR
- **Persona(s):** P3 minor non-owner
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** There should be a path to detach a single profile to its own account (an invite/claim or self-leave flow) so the individual keeps their data while exiting the family.
- **Actual state:** There is no DELETE /profiles/:id route — profiles.ts exposes only GET, POST, PATCH (profiles.ts:51,58,99 and the PATCH handlers). The single-profile removal that exists, removeProfileFromSubscription, (a) only works on family/pro tiers (family.ts:511-513), (b) ARCHIVES the profile rather than detaching it (family.ts:539-553), (c) explicitly throws ProfileRemovalNotImplementedError for any cross-account move because 'Cross-account profile detachment needs an invite/claim flow' that does not exist (family.ts:532-537), and (d) is gated to the owner via showRemoveFamilyMember requiring familyCapable (navigation-contract.ts:335-337). A P3 minor cannot leave with their data; cross-account detachment is explicitly unimplemented.
- **Evidence:** `apps/api/src/routes/profiles.ts:51`, `apps/api/src/routes/profiles.ts:58`, `apps/api/src/routes/profiles.ts:99`, `apps/api/src/services/billing/family.ts:497-537`, `apps/api/src/services/billing/family.ts:539-553`, `apps/api/src/lib/navigation-contract.ts:335-337`
- **Verifier notes:** VERIFIED REAL GAP. Searched apps/api/src and apps/mobile/src exhaustively for any detach/claim/invite/transfer/leave-with-data path; none exists.

Confirmed absences:
1. No DELETE /profiles/:id. profiles.ts exposes only GET (:51,:99), POST (:58), PATCH (:107,:145), POST /profiles/switch (:175). No removal endpoint.
2. The only single-profile removal is removeProfileFromSubscription (family.ts:497), exposed at POST /subscription/family/remove (billing.ts:889). It is (a) owner-gated via assertOwnerProfile (billing.ts:900-903) so a P3 minor literally cannot invoke it; (b) tier-gated to family/pro (family.ts:511-513); (c) ARCHIVES the profile by setting archivedAt rather than detaching it (family.ts:539-553); (d) throws ProfileRemovalNotImplementedError for any cross-account move (family.ts:535-537), whose message states the invite/claim flow 'is not yet implemented' (family.ts:484). Route maps that throw to HTTP 422 (billing.ts:918-924).
3. GDPR data-portability escape is ALSO closed for a non-owner: /account/export is owner-only (assertOwnerProfile, account.ts:150). /account/delete (account.ts:59) and /account/cancel-deletion (account.ts:123) are owner-only too. So a P3 minor cannot even export their own data to re-create it on a new account manually.
4. The only self-service consent action a minor has is requesting/triggering their OWN parent's consent (consent.ts:181-183). Consent REVOKE is owner-only (consent.ts:529) and routes to DELETION after a 7-day grace (consent.ts:552 -> deletion.ts), i.e. data loss, not data-preserving exit. deleteProfile (deletion.ts:285) and executeDeletion (deletion.ts:214) only delete; nothing copies/moves data to a new account.

Tracking status: NOT tracked as an active gap. audience-matrix.md F1-F14 are navigation/UI-gating findings; the nearest (F9) is a mode-state leak concern, not the leave-with-data intent. Master-directory flows (docs/flows/master-directory/account, /parent) contain no detach/claim flow. The intent is acknowledged only in docs/_archive backlog (2026-05-06-hidden-wins-backlog.md:117,363) as 'PARTIAL (API throws; no mobile UI)'. Per the audit rule this is reportable; alreadyTracked would be false at the active-tracking level (only archive-backlog mention exists).

Severity adjusted to MEMORY/medium rather than high: per the verified identity model, EVERY family_links creation keeps both profiles on the same accountId (no cross-account linking exists at all), and the project is pre-launch with no active users (project_pre_launch_no_users.md). So today the dead-end harms zero existing users and the cross-account machinery it needs is greenfield. It is a genuine future-facing dead-end (a minor turning 18 / family conflict has no data-preserving exit and no self-service export), but not an active production data-loss path, hence medium not high.

Minor finder-citation nits (do not change conclusion): the throw is at family.ts:535-537 (finder wrote 497-537, which is the whole function); the route returns 422 not a generic error (billing.ts:918-924).

### consent-7 — The owner exercises GDPR erasure (account delete) but a linked child / family member wants their own data preserved or transferred rather than destroyed with the account.

- **Domain:** Consent / COPPA / GDPR
- **Persona(s):** P3 minor non-owner; P4 guardian's linked children
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.6
- **Expected path:** Before an owner's account is erased, linked non-owner profiles should have an option to claim/transfer their data to a new account of their own.
- **Actual state:** Owner account deletion (account.ts:53-116) dispatches app/account.deletion-scheduled with ALL profileIds (account.ts:67-78) and the delete-account UI only WARNS that linked children are deleted too (delete-account.tsx:312-326 family warning). There is no offer to migrate or preserve a child profile — and the only migration primitive, removeProfileFromSubscription's cross-account move, explicitly throws ProfileRemovalNotImplementedError (family.ts:532-537). So a linked minor's data is unavoidably destroyed when the owner erases the account, with no claim/transfer escape.
- **Evidence:** `apps/api/src/routes/account.ts:67-78`, `apps/mobile/src/app/delete-account.tsx:312-326`, `apps/api/src/services/billing/family.ts:532-537`
- **Verifier notes:** Could not refute. After a thorough search of apps/api/src (routes, services, deletion, family, export) and apps/mobile/src (screens, hooks, deep links), no path exists for a linked non-owner profile to preserve, export, or transfer its own data before/instead-of owner account erasure.

Confirming evidence the finder cited, plus stronger evidence I found:
- Owner-only deletion, all profiles destroyed: account.ts:53-116 gates POST /account/delete with assertOwnerProfile (line 59) and dispatches app/account.deletion-scheduled with getProfileIdsForAccount(account.id) = EVERY profile on the account (account.ts:67-80). No per-profile carve-out.
- No independent self-export for a child: GET /account/export is owner-only (account.ts:144-153; assertOwnerProfile at line 150) and generateExport is account-scoped, fanning out over ALL profileIds on the account (export.ts:186-202). There is no per-profile export route. An explicit [BREAK] test confirms a non-owner profile gets 403 on /account/export (account.test.ts:545). So a non-owner minor cannot even download their own data to preserve it.
- The only cross-account migration primitive is dead: removeProfileFromSubscription throws ProfileRemovalNotImplementedError whenever newAccountId differs from the current account (family.ts:535-537). Comment explicitly states the invite/claim flow does not exist yet.
- No minor self-detach / "leave account" / "claim into a new account" flow anywhere in mobile. use-clone-from-child.ts runs the OPPOSITE direction (owner copies a child's topic into the owner's own learning), not child→standalone preservation.
- delete-account.tsx only WARNS (delete-account.tsx:312-326, family-warning block) that linked children are deleted; it offers no preserve/transfer action.

Severity adjusted to medium (from a likely high): the GDPR data-portability/erasure-objection right for the non-owner is genuinely unserved (a true dead-end), but mitigating context lowers urgency — the identity model keeps both profiles on one account owned by an adult who created the children (no cross-account merge exists), the common case is a parent erasing the family they themselves set up, and per project memory there are no active users yet (pre-launch as of 2026-05-09, stores approved 2026-05-21). Not found tracked in docs/compliance/audience-matrix.md (only consent-display gate F2 near the keyword); alreadyTracked could not be confirmed for this specific intent.

### family-3 — An adult who already has their own account wants to invite another existing account (e.g. their child who self-registered, or a tutor) to mentor them, or be added to a family — i.e. link two pre-existing accounts.

- **Domain:** Family & mentoring linkage
- **Persona(s):** P1, P2, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.85
- **Expected path:** An invite/claim flow: enter the other person's email (or a code), they accept, and a family_links + shared-subscription relationship is established across the two accounts.
- **Actual state:** Cross-account linking is explicitly NOT implemented and is hard-rejected. addProfileToSubscription returns null unless the target profile is already on the same accountId (apps/api/src/services/billing/family.ts:461-465). removeProfileFromSubscription throws ProfileRemovalNotImplementedError for any cross-account move (family.ts:532-537), and the route maps it to a 422 'requires an invite/claim flow' (apps/api/src/routes/billing.ts:918-925). Grep across apps/ finds no invite-by-email, claim, or link-existing-account code path. The only way to get a linked child is for the owner to create a brand-new profile under their own account.
- **Evidence:** `apps/api/src/services/billing/family.ts:461-465`, `apps/api/src/services/billing/family.ts:481-488`, `apps/api/src/services/billing/family.ts:532-537`, `apps/api/src/routes/billing.ts:918-925`
- **Verifier notes:** VERIFIED REAL GAP. After exhaustive search of apps/api/src (routes, services, middleware, inngest), apps/mobile/src (screens, hooks, components, deep links), and packages/ (schemas), there is NO path to link two pre-existing accounts via invite/email/code, and no account-merge.

Evidence confirming the finder:
- billing/family.ts:461-465: addProfileToSubscription returns null unless target profile already shares sub.accountId ("never re-parent profiles across accounts").
- billing/family.ts:481-488 + 532-537: ProfileRemovalNotImplementedError thrown only when newAccountId != sub.accountId.
- billing.ts:911-925: the route maps that error to 422 "Cross-account profile removal requires an invite/claim flow." Notably the route at billing.ts:912-916 calls removeProfileFromSubscription WITHOUT a newAccountId argument, so even the rejection branch is unreachable from the wired route — there is no wired attempt at a cross-account move at all, which strengthens the gap.
- No invite/claim/redeem token, family code, acceptInvite, linkAccount, or mergeAccount symbol exists in packages/ (grep returned zero). The only route writing family_links is onboarding.ts, which creates a NEW child profile on the SAME account.

Candidate refutations I ruled out (all same-account, not cross-account):
- apps/mobile/src/hooks/use-clone-from-child.ts is the "Learn this too" bridge: copies a linked child's topic into the parent's own learning within one account. Not a link flow.
- navigation-contract.ts:96,373 showInlineStudyInvite = prompting the owner to study, not inviting another account.
- create-profile.tsx creates a brand-new profile under the current owner's account; no field to enter another person's email/account.

Where the path WOULD live but does not: a new route (e.g. routes/family.ts or billing.ts invite/claim endpoints), an inviteToken schema in packages/schemas, and a mobile redeem/accept screen — none exist.

Severity assessed MEDIUM not HIGH: the comments and 422 message show this is a known, intentionally-deferred product decision rather than an accidental omission, and the core same-account family model serves the primary persona flows. But the intent (a self-registered minor P2 wanting to join a parent's existing account, or P1/P5 inviting an existing tutor) genuinely dead-ends with only a 422 error string and no in-app path. The minor-self-registered-then-wants-to-join-parent case (P2->P4 link) is the most painful because it forces abandoning the existing account.

### family-4 — A minor on a parent's account (P3) grows up / wants independence and wants to graduate their profile and learning history into their own standalone account.

- **Domain:** Family & mentoring linkage
- **Persona(s):** P3, P2
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A 'move to my own account' / graduation flow that re-parents the profile to a new accountId (with its subjects, sessions, history) and makes it an owner of its own account.
- **Actual state:** Account ownership is permanent — the first profile is isOwner=true forever (profile.ts) with no transfer path, and a non-first profile is created isOwner:false (apps/api/src/services/profile.ts:369). The only 'leave' mechanism, removeProfileFromSubscription, sets archivedAt and deletes family_links but explicitly never re-parents across accounts (family.ts:535-537, 539-566) — the profile stays on the parent's accountId, archived. downgradeAllFamilyProfiles can move non-owner profiles to new accounts but only fires on family-owner cancellation via a server-supplied map (family.ts:587-609), not as a user-initiated graduation. There is no API or UI for a minor/child to claim their own account and carry history over.
- **Evidence:** `apps/api/src/services/profile.ts:361-391`, `apps/api/src/services/billing/family.ts:535-566`, `apps/api/src/services/billing/family.ts:587-609`
- **Verifier notes:** VERIFIED REAL GAP. After a thorough search of apps/api/src (routes, services, billing, consent, account) and apps/mobile/src (screens, hooks, components), no path exists for a P3 minor to graduate their profile + history into a standalone account they own.

Confirming evidence beyond the finder's:
- Only profile-removal endpoint (apps/api/src/routes/billing.ts:895-927) requires assertOwnerProfile (line 900-903) = PARENT-ONLY. A child literally cannot invoke it. Even for the owner, cross-account moves throw 422 ProfileRemovalNotImplementedError (family.ts:535-537), whose own comment states "Cross-account profile detachment needs an invite/claim flow... Until that exists, reject the move."
- ZERO mobile UI calls removeProfileFromSubscription (grep of apps/mobile/src returned no files), so there is no leave/remove button anywhere.
- No claim/graduation/invite/transfer route in account.ts (only deletion), consent.ts, or anywhere in apps/api/src/routes.
- profile.ts:369 hardcodes non-first profiles to isOwner:false; no code sets isOwner:true after creation.

Severity adjusted to MEDIUM (down from a likely high): the re-parenting PRIMITIVE partially exists. downgradeAllFamilyProfiles (family.ts:587-627) DOES move non-owner profiles to brand-new accounts (line 615-621) and provisions a free sub when the family owner cancels — so a child's profile + history can survive onto its own accountId. But (a) it is server-triggered by owner cancellation, never user-initiated graduation; (b) it never sets isOwner:true, so the migrated profile is still a non-owner with no billing/security/export rights on its 'own' account; (c) there is no UI affordance at all. The specific intent — a minor proactively claiming an OWNED standalone account with history — has no route and dead-ends.

Tracking: acknowledged only in archived backlog (docs/_archive/plans/done/app evolution plan/2026-05-06-hidden-wins-backlog.md:115-117), NOT in the live docs/compliance/audience-matrix.md (no entry found). Treat as effectively untracked for the live matrix.

### family-5 — A non-owner minor or adult sibling on a parent's account (P3) wants to leave the account, export their own data, or delete their own profile/data on their own initiative.

- **Domain:** Family & mentoring linkage
- **Persona(s):** P3
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A self-service 'leave this account' / 'export my data' / 'delete my data' control available to the non-owner profile itself.
- **Actual state:** Every account-lifecycle control is owner-gated. Account deletion, cancel-deletion, and data export all call assertOwnerProfile (apps/api/src/routes/account.ts:58-59, 122-125, 149-150). A non-owner cannot remove themselves either — removeProfileFromSubscription refuses owner removal and is only invokable by the owner via the owner-gated /subscription/family/remove route (apps/api/src/routes/billing.ts:893-903). The non-owner's only escape is to ask the parent. assertCanManageOwnConsent additionally blocks a minor non-owner from even toggling their own consent (apps/api/src/services/family-access.ts:76-105). So a P3 user who wants to exit or extract their own data has no path.
- **Evidence:** `apps/api/src/routes/account.ts:58-59`, `apps/api/src/routes/account.ts:149-150`, `apps/api/src/routes/billing.ts:893-903`, `apps/api/src/services/family-access.ts:76-105`
- **Verifier notes:** Refutation attempt FAILED — the gap is real. After searching routes, services, mobile screens, hooks, and components, no self-service in-app path exists for a non-owner (P3) to leave the account, export, or delete their own data.

Verified absence of every plausible path:
- API account lifecycle: all three routes owner-gated. account.ts:59 (delete), :125 (cancel-deletion), :150 (export) each call assertOwnerProfile, which throws ForbiddenError when profileMeta.isOwner !== true (family-access.ts:154-156).
- Profile self-removal: /subscription/family/remove is owner-gated (billing.ts:900-903) and removeProfileFromSubscription refuses the owner; there is no route that lets a non-owner remove THEMSELVES on their own initiative.
- Consent self-revoke (the only flow that would delete a minor's data, via deleteProfileIfConsentWithdrawn in consent-revocation.ts:283): the /consent/:childProfileId/revoke route is owner-gated (consent.ts:528-529). assertCanManageOwnConsent additionally hard-blocks a minor non-owner (<18) from toggling their own consent/collection (family-access.ts:100-104). Note: a minor CAN self-service consent REQUEST/RESEND for their own profile (consent.ts:181-183), but that grants/maintains data collection — it is not an exit/delete path.
- Mobile UI: Export and Delete rows render only when showExportDelete is true, which resolves to `ownerRole && !context.isParentProxy` (navigation-contract.ts:365). A non-owner profile gets false and sees neither row (privacy.tsx:137-155). delete-account.tsx is reachable only via that gated row.

Only near-path found: a generic `mailto:support@mentomate.app` help link in the More tab (help.tsx:18), available to all profiles. This is an OUT-OF-BAND, human-mediated email with no in-product flow, no automation, no guarantee of action — functionally equivalent to the finder's 'ask the parent' escape and does not constitute a self-service path. It does not refute the gap.

Severity adjusted to medium (from a likely high): the population is narrow (non-owner adult siblings, or minors who want out independent of their parent), all profiles share one accountId so there is no true cross-account data ownership to extract, and a manual support-email escalation does technically exist. But GDPR/data-subject-rights expectations (right to erasure / data portability for the data subject themselves, including minors via the account holder) make the total absence of a self-service control a genuine product/compliance gap, not merely clunky. Could not check docs/compliance/audience-matrix.md (Glob timed out); recommend confirming whether this is logged as a known gap there.

### identity-1 — An adult owner on the Free or Plus tier adds a learner/child profile, then wants to remove that profile from their account (child moved out, created by mistake, no longer used).

- **Domain:** Identity & ownership
- **Persona(s):** P1, P4
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.85
- **Expected path:** A 'remove profile' / 'remove family member' action available to the owner regardless of tier, mirroring the family/pro remove flow.
- **Actual state:** The only same-account removal endpoint, removeProfileFromSubscription (family.ts:497), short-circuits to null for any tier that is not 'family' or 'pro' (family.ts:511-513), and the route returns a generic 403 (billing.ts:929-936). The UI remove button is gated by showRemoveFamilyMember = childEditorGate && familyCapable (navigation-contract.ts:335-337), so it never renders for Free/Plus. Yet Free and Plus now allow maxProfiles: 2 (subscription.ts:47, 74), so a child profile CAN be created on those tiers. The only deletion lever left is the destructive GDPR consent-revoke path (consent.ts:523), which is framed as withdrawing parental consent and deletes all data after a grace period, not a clean 'remove from plan'.
- **Evidence:** `apps/api/src/services/billing/family.ts:511`, `apps/api/src/services/subscription.ts:47`, `apps/api/src/services/subscription.ts:74`, `apps/mobile/src/lib/navigation-contract.ts:335`, `apps/api/src/routes/billing.ts:889`
- **Verifier notes:** CONFIRMED REAL GAP (partial path exists for one sub-case, so medium not high). I searched every removal lever in api + mobile and could not refute the core claim: there is no clean, tier-independent "remove this profile from my account/plan" action for a Free/Plus owner.

Verification of the finder's evidence:
- subscription-screen remove button is genuinely unreachable on Free/Plus. The button (subscription.tsx:953 `canRemoveFamilyMember && !member.isOwner`) lives INSIDE `{familySubscription && (...)}` (subscription.tsx:927), and `familySubscription` is only fetched when `subscription?.tier === 'family' || 'pro'` (subscription.tsx:120-122). On Free/Plus the entire "Family pool" section never renders, so the button is invisible regardless of the gate value.
- backend `removeProfileFromSubscription` short-circuits to null for `tier !== 'family' && tier !== 'pro'` (family.ts:511-513) and the route returns a generic 403 (billing.ts:928-936). Confirmed.
- Free and Plus DO allow `maxProfiles: 2` (subscription.ts:47, 74), so a child profile CAN be created on those tiers — the precondition for the gap holds.

One correction to the finder's mechanism (does not change the conclusion): the finder attributed the hidden button to `removeFamilyMemberGate = childEditorGate && familyCapable` (navigation-contract.ts:335-337). But `isFamilyCapable` (navigation-contract.ts:204-207) only checks `isAdultOwner && hasFamilyLinks === true` — it is TIER-INDEPENDENT. So the gate itself would be TRUE for a Free/Plus owner with a linked child; the button is actually hidden by the `familySubscription &&` wrapper in the screen, not by the gate. Net effect identical.

The only same-account removal lever that DOES render for a Free/Plus owner with a linked child is the "Withdraw consent" button (child/[profileId]/index.tsx:1100 -> ConsentManagementSection:718-737 -> consent route PUT /consent/:childProfileId/revoke at consent.ts:523, gated only by assertOwnerProfile, NOT by tier). This succeeds and ultimately deletes the profile after a grace period (consent.ts:552; deletion via deleteProfileIfConsentWithdrawn). So for a MINOR child added on Free/Plus, a destructive GDPR-framed path technically achieves removal — this is why severity is medium, not high: the intent is not a hard dead-end for that sub-case.

But two real holes remain:
1. The path that works is framed as "withdraw parental consent / schedule data deletion" with a grace period (child/[profileId]/index.tsx:585-612), not a clean "remove from plan." It is destructive and consent-semantic, not a profile-management action.
2. ConsentManagementSection renders ONLY when a consent record exists (`hasConsentRecord`, index.tsx:572-578). For an ADULT profile added to a Free/Plus owner's account (no GDPR consent record), the section returns null (index.tsx:578) — so there is NO removal lever of any kind. That sub-case is a genuine dead-end.

Not tracked: audience-matrix F5/F8 reference `showRemoveFamilyMember` only in the context of isOwner-gating consolidation and RequireFamilyContext side effects (audience-matrix.md:55, 60, 120, 123); none of F1-F14 describe the tier-gated removal gap. PARENT-03 (docs/flows/master-directory/parent/PARENT-03.md:50) documents that the only child-detail removal affordance is consent withdrawal/deletion, consistent with the gap but not flagging it as a gap. alreadyTracked=false.

### identity-3 — A non-owner profile (minor on a parent's account, P3) wants to delete their own profile or leave the account — e.g. they no longer want their data on the parent's account, or they're moving to their own account.

- **Domain:** Identity & ownership
- **Persona(s):** P3
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A self-service 'delete my profile' or 'leave this account' action available to a non-owner for their own profile.
- **Actual state:** There is no DELETE verb on /profiles at all (profiles.ts only exposes GET list, POST create, GET :id, PATCH :id/app-context, PATCH :id, POST switch). Account deletion is owner-only (account.ts:59 assertOwnerProfile). Profile removal is owner-gated and family/pro-only (billing.ts:900, family.ts:511). deleteProfile (deletion.ts:279) is only invoked from consent-driven Inngest functions, never from a user-facing route. A non-owner can edit their own displayName/avatar (profiles.ts:161 self-update) but has zero path to delete themselves or detach. Their only exit is for the OWNER to revoke their consent.
- **Evidence:** `apps/api/src/routes/profiles.ts:50`, `apps/api/src/services/deletion.ts:279`, `apps/api/src/routes/account.ts:59`, `apps/api/src/services/billing/family.ts:528`
- **Verifier notes:** CONFIRMED REAL GAP after exhaustive search. No self-service "delete my profile" or "leave the account" path exists for a non-owner (P3).

Evidence of absence:
- /profiles exposes only GET list, POST create, GET :id, PATCH :id/app-context, PATCH :id, POST switch (profiles.ts:50-198). No DELETE verb. The PATCH self-update (profiles.ts:161) only allows displayName/avatar/colorScheme edits, not deletion or detachment.
- Account deletion is owner-only: account.ts:59 assertOwnerProfile on POST /account/delete; export also owner-only (account.ts:150).
- Consent revoke — the only mechanism that triggers profile data teardown — is owner-only: consent.ts:529 assertOwnerProfile on PUT /consent/:childProfileId/revoke. A non-owner cannot revoke their own consent; there is no /consent/my-revoke route (only GET /consent/my-status, consent.ts:460).
- Family/subscription remove is owner-gated AND cross-account removal is explicitly unimplemented (billing.ts:893 assertNotProxyMode + 899 assertOwnerProfile; 917 ProfileRemovalNotImplementedError "Cross-account profile removal requires an invite/claim flow").
- Mobile UI confirms absence: more/index.tsx (the More tab landing) has no leave/delete-self row — only Sign out (line 231-284), which is session termination, not deletion/detachment (same profile persists on next sign-in). more/privacy.tsx gates Export (line 137) and Delete Account (line 149) behind showOwnerPrivacyGates, so a non-owner sees neither.

PARTIAL PATH FOUND but does NOT serve the intent: DELETE /learner-profile/all (learner-profile.ts:166) lets a non-owner erase their own mentor-MEMORY facts only — not the profile, sessions, curriculum, or account membership. Crucially, for the canonical MINOR P3 (age 11-17) this route is blocked entirely: assertCanManageOwnConsent (family-access.ts:100-103) throws ForbiddenError for any non-owner under 18. So a minor P3 cannot even erase their own memory; an adult non-owner can erase memory but still cannot delete the profile or detach.

use-clone-from-child is a parent->own-learning topic-copy bridge, not a profile-migration flow — irrelevant to this intent.

The only exit for a non-owner is for the OWNER to revoke their consent, exactly as the finder stated. No self-service route exists; the place it would live (a DELETE on /profiles or a non-owner /consent/my-revoke) is absent.

alreadyTracked: NO. docs/compliance/audience-matrix.md F1-F14 are nav-gating gaps; none cover non-owner self-deletion/leave.

Severity MEDIUM (not high): for the MINOR P3 the parent-owner-controlled lifecycle is partly intentional COPPA/GDPR design (minors' consent is deliberately parent-controlled, and the identity model has no cross-account linking/merge by design — profile.ts:369/388). The genuine product gap is sharpest for an ADULT non-owner on a parent's account (P3-adult / a grown child still on a parent's plan) who has no self-service way to leave or delete themselves and must depend on the owner acting. It is a true dead-end with no in-app recovery, but bounded by the deliberate single-account-no-merge architecture rather than an oversight in an otherwise-complete flow.

### identity-4 — An owner wants to leave / stop using the account while preserving the children's profiles and data — i.e. hand ownership to another adult or let children continue independently — rather than deleting the entire account.

- **Domain:** Identity & ownership
- **Persona(s):** P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.82
- **Expected path:** An ownership-transfer or owner-exit flow that reassigns isOwner to another adult profile or splits children into their own accounts before the original owner departs.
- **Actual state:** isOwner is set only on first-profile creation (profile.ts:369) and the briefing confirms NO code path transfers/changes ownership afterward. The owner's only exit is POST /account/delete (account.ts:53), which schedules deletion of the ENTIRE account including all child profiles and their data (it dispatches app/account.deletion-scheduled with all profileIds, account.ts:73-79). There is no reassignOwner / transferOwnership route or service (grep for transferOwnership/reassignOwner returns nothing in apps/api/src). So 'I want to leave but keep my kids' accounts alive' has no path — leaving means destroying everyone's data.
- **Evidence:** `apps/api/src/services/profile.ts:369`, `apps/api/src/routes/account.ts:53`, `apps/api/src/routes/account.ts:73`
- **Verifier notes:** Could not refute. The gap is real and confirmed by independent evidence the finder did not cite.

Searched routes, services, and mobile screens for any transfer/reassign/owner-exit-preserving path:

1. No transfer/reassign exists. Grep transferOwnership|reassignOwner|new owner|become owner|make owner across apps/api/src and apps/mobile/src returns nothing relevant. isOwner is only ever assigned at first-profile creation (profile.ts:369, `isOwner: isOwner ?? false`); no code path flips an existing profile's isOwner.

2. No per-profile self-delete or archive ROUTE. routes/profiles.ts exposes only GET /profiles, POST /profiles (create), GET /profiles/:id, two PATCH (update), POST /profiles/switch. There is NO DELETE route and no user-facing archive endpoint. deleteProfile() (services/deletion.ts) is called ONLY from Inngest functions (archive-cleanup.ts:50, consent-revocation.ts:280), never from an owner-exit route.

3. The only owner exit is whole-account destruction: POST /account/delete (account.ts:53) dispatches app/account.deletion-scheduled with ALL profileIds (account.ts:67-80). No keep-children branch.

4. Consent-revocation runs the OPPOSITE direction — owner removes a child (consent.ts:523 PUT /consent/:childProfileId/revoke) — it does not let children persist after the owner leaves.

5. Strongest corroboration the finder missed: the product explicitly tells the owner this is by design. apps/mobile/src/i18n/locales/en.json:1280 account.familyWarningBody = "They will lose access to MentoMate. Their progress, learning history, and consent records are permanently deleted along with your account. The family link is not transferred." This is communicated, intentional behavior, not an accidental omission — which confirms the absence of a transfer/split path.

6. Not tracked: grep of docs/compliance/audience-matrix.md and docs/flows/master-directory/ for transfer/reassign/leave-account/children-persist found only unrelated "handoff" hits (auth redirect, recaps). No flow doc owns ownership-transfer or owner-exit-preserving-children. alreadyTracked=false.

Severity adjusted to MEDIUM (not high): given the verified identity model (all profiles share one accountId; no cross-account linking; no account merge), an owner-exit-with-preserved-children would require new account-splitting infrastructure, and at pre-launch with zero active users immediate impact is low. But the dead-end is real: P4/P5 who want to leave while keeping kids' data alive have no route — leaving means destroying everyone's data.

### identity-5 — A minor self-registered as a solo owner (P2) under the consent age completes their parent-consent flow, but later the parent wants to manage or revoke that minor's data the way a parent can for a parent-added child.

- **Domain:** Identity & ownership
- **Persona(s):** P2
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.6
- **Expected path:** After consent, the parent has a management surface for the minor (revoke, export, see status) equivalent to the linked-child controls.
- **Actual state:** For a SELF-registered minor (first profile, isOwner=true), createProfileWithLimitCheck creates a PENDING consent via createPendingConsentState, and the consent flow never creates a family_links row binding a parent profile (profile.ts:386 only links when parentProfileId is set, which only happens for parent-added non-first profiles). The parent who clicks the emailed consent link has no profile/session on the account. Consent management routes (/consent/:childProfileId/revoke etc.) all require an authenticated OWNER profile with a parent link via assertOwnerProfile (consent.ts:529) — which the external consenting parent does not have. So once a minor self-registers as owner, the consenting parent has no in-app path to later revoke or manage that minor's data; only the minor (the owner) can act.
- **Evidence:** `apps/api/src/services/profile.ts:386`, `apps/api/src/services/profile.ts:408`, `apps/api/src/routes/consent.ts:529`, `apps/api/src/routes/consent.ts:407`
- **Verifier notes:** REFUTATION FAILED — the gap is real. I searched routes, services, and the web consent surface for any path letting the consenting parent of a SELF-registered minor manage/revoke/export that minor's data, and found none.

Confirming evidence:
- Self-registration: profile.ts:386 creates a family_links row ONLY when parentProfileId is set; for a first/self-registered profile it is unset, so no parent link exists. profile.ts:408-414 then calls createPendingConsentState (no parent profile).
- Approval path: processConsentResponse (consent.ts:817) on approve (lines 890-891) ONLY flips consentStates.status to CONSENTED. It does NOT create a parent profile and does NOT insert a family_links row. Contrast createGrantedConsentState (consent.ts:370-377), which creates the family_links row — but that runs only on the parent-ADDED-child path. So post-approval there is still no parentProfileId on the account.
- Management routes: GET /consent/:childProfileId/status and PUT /consent/:childProfileId/revoke both call assertOwnerProfile (consent.ts:491, 529) AND resolve through getChildConsentForParent / revokeConsent, which hard-require a matching family_links row (consent.ts:1197-1205 and 1232-1240) or throw ConsentNotAuthorizedError. The external consenting parent has no profile/session on the account at all, so these are unreachable for them.
- No account-claim/takeover/ownership-transfer/parent-adopt path exists anywhere in consent.ts or profile.ts (grep returned nothing).
- The only post-consent levers for the self-register case are: the MINOR (who is the owner) acting in-app, or denial which cascade-deletes the profile (consent.ts:898-901). There is no parent-side ongoing management.

Aggravating finding the finder did not cite: consent-web.ts:207 renders "You can withdraw consent at any time from the parent dashboard in the app." to the consenting parent — a promise the system cannot honor for a self-registered minor, since that parent has no account/dashboard. This makes the dead-end worse: the UI explicitly advertises a recovery surface that does not exist for this persona.

Severity adjusted to MEDIUM (not high): the minor is the account owner and retains full self-service control (export/delete via their own owner-gated more/privacy.tsx + account.tsx surfaces), and the 11+ floor with denial-deletes-profile limits the blast radius. The GDPR/parental-rights dead-end is real but bounded, and the false "parent dashboard" copy is a copy bug layered on top. Not tracked in docs/compliance/audience-matrix.md (F2 there is about nav-shell consent interception, a different layer).

### identity-6 — An owner wants to remove a child cleanly (child leaves the household) without destroying the child's learning history — e.g. archive the seat but let the data persist or move with the child.

- **Domain:** Identity & ownership
- **Persona(s):** P4
- **Already tracked:** true · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** Cross-account detach / invite-claim flow so a removed child's profile and data move to the child's own account.
- **Actual state:** removeProfileFromSubscription explicitly rejects cross-account moves with ProfileRemovalNotImplementedError (family.ts:481-488, 535-537), and the route surfaces 422 'Cross-account profile removal requires an invite/claim flow' (billing.ts:918-924). The same-account remove only archives the profile (sets archivedAt, family.ts:539-553) and deletes the family link — the child can no longer be switched to or signed into independently. There is no invite/claim flow anywhere in apps/api/src (grep for claimProfile/transferProfile/moveProfile finds nothing in production code). So 'let my child take their account with them' has no path; the documented future flow is unbuilt.
- **Evidence:** `apps/api/src/services/billing/family.ts:481`, `apps/api/src/services/billing/family.ts:535`, `apps/api/src/routes/billing.ts:918`
- **Verifier notes:** CONFIRMED GAP — could not refute. Verified every plausible alternative path and found none.

Evidence verified by reading source:
- family.ts:534-536: cross-account move (newAccountId != accountId) throws ProfileRemovalNotImplementedError; class message (480-487) explicitly says "requires an invite/claim flow that is not yet implemented."
- family.ts:538-565: the only working remove path archives the profile (sets archivedAt) and deletes family_links. Child profile becomes inaccessible/unswitchable; data persists but stranded.
- billing.ts:888-926: route catches the error -> 422 "Cross-account profile removal requires an invite/claim flow."
- subscription.tsx:579-621 (mobile): handleRemoveFamilyProfile calls removeFamilyProfile.mutateAsync(profileId) with profileId only — NO newAccountId. So the UI can ONLY ever reach the same-account archive branch; the alert copy confirms "removed from this family plan and hidden from profile switching." There is no UI affordance for "let the child take their account."
- Grep for claimProfile/transferProfile/moveProfile/invite/claim/detach across apps/api/src returns only book-generation claim locks and a BUG-411 email-reclaim BLOCK guard — nothing that moves a profile to a new account. No import endpoint exists.
- Considered the export service as an escape hatch: /account/export (account.ts:144-153) is assertOwnerProfile-gated and account-scoped (generateExport(db, account.id), export.ts dumps the whole account's tables) — it is a GDPR whole-account dump, not a portable per-child payload, and there is NO matching import route to ingest it into a fresh account. So export does not serve "child takes their history to their own account."

Not tracked in docs/flows/master-directory/account/ACCOUNT-04.md (no detach/claim/leave/migrate content). The intent "remove a child cleanly while letting their learning history move with them to their own account" has no path; the documented future invite/claim flow is genuinely unbuilt.

Severity adjusted to MEDIUM (not high): the destructive same-account removal is reversible in principle (profile is archived, not hard-deleted — data is not destroyed), and there are no active users pre-launch (project_pre_launch_no_users). The dead-end is real but data-loss is soft (recoverable by un-archiving) rather than permanent, and the affected population at launch is narrow. Would become high once real households exist and a teen ages out / wants independence.

### learn-2 — A guardian/mentor (P4 or P5) wants to fix, add to, archive, or clean up a CHILD's learning content — create a subject for the child, delete a junk book the child generated, or correct a broken curriculum.

- **Domain:** Learning core
- **Persona(s):** P4, P5
- **Already tracked:** true · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** From the child detail/review surface, the guardian creates or edits subjects/books/topics on the child's profile (a parent setting up or repairing their kid's learning).
- **Actual state:** There is no parent-on-behalf-of-child write path. When a guardian views a child, the session is proxy (isOwner=false relative to the child profile) and assertNotProxyMode blocks every subject/book/curriculum write. The child surfaces under apps/mobile/src/app/(app)/child/** contain zero references to create-subject/useCreateSubject (confirmed read-only). The only cross-profile bridge is POST /curriculum/clone-from-child, which copies a child topic INTO the guardian's OWN learning (curriculum.ts:65-100, family-bridge cloneTopicFromChild) — it never writes to the child's curriculum. So 'set up / repair my child's subjects' has no route.
- **Evidence:** `apps/api/src/routes/curriculum.ts:65-114`, `apps/api/src/routes/subjects.ts:93-110,166-184`, `apps/api/src/middleware/proxy-guard.ts:57-63`, `docs/audit/2026-05-23-notion-bug-verification/result-batch-3.md:66`
- **Verifier notes:** VERIFIED REAL GAP for the precise intent (create/delete/edit a CHILD's subjects/books/topics/curriculum). I searched hard for a refuting path and could not find one for learning CONTENT.

What I confirmed:
- assertNotProxyMode fails closed for any non-owner-relative-to-target and is the guard on ALL subject/book/curriculum writes: subjects.ts:67,81,97,116,142,171 (create/classify/resolve/language-setup/retry/update); books.ts:118,152,346 (delete/post/patch); curriculum.ts:130,154 (skip/unskip). proxy-guard.ts:57-63 rejects isOwner===false. None of these routes accept a childProfileId target, so a guardian (who is a proxy/non-owner relative to the child) is hard-blocked.
- clone-from-child writes only into the guardian's OWN profile: family-bridge.ts:388-414 (cloneTopicFromChild keys subject/book/curriculum creation on adultProfileId), invoked from mobile AddToMyLearningButton / LearnTogetherSheet / use-clone-from-child.ts. It copies a child topic INTO the guardian's curriculum, never the reverse. Matches the finder's read.
- Child mobile surfaces (apps/mobile/src/app/(app)/child/[profileId]/**: curriculum.tsx, subjects/[subjectId].tsx, topic/[topicId].tsx, index.tsx) have ZERO content-write hooks (no useCreateSubject / deleteBook). Only mutations present are consent revoke/restore (index.tsx:605,616,953).

IMPORTANT NUANCE — the finder's framing is slightly over-broad. A parent-on-behalf-of-child WRITE surface DOES exist, authorized via assertOwnerAndParentAccess (parent-chain, NOT proxy-blocked), but ONLY for profile preferences / memory / onboarding metadata, never learning content:
- learner-profile.ts: accommodation-mode (461), tell-mentor (373, role='parent'), unsuppress-inference (413), memory toggles (214/254/299), grant-consent (340), delete memory (152/182).
- settings.ts: child celebration-level (143-149).
- onboarding.ts: child conversation language (98), pronouns (163), interests (213).
- audience-matrix.md:57-58 lists the proxy-edit canonical surfaces (accommodation, celebrations) — preferences only.

So 'parent can write to a child profile at all' would be FALSE as a gap. But the SPECIFIC intent (set up/repair child's subjects/books/curriculum) has genuinely no route. The gap is real, scoped to learning content.

Severity dropped high→medium: there is a manual workaround (the child self-serves subject/book/curriculum creation in their own session; topics flow parent↔child via clone). Not a hard dead-end with no escape. Not found tracked as a content-write gap in audience-matrix.md (only F5 preference-edit rows exist).

### learn-3 — A learner (any persona) created a subject by mistake (typo, wrong topic, duplicate) and wants to permanently delete it so it no longer clutters their library.

- **Domain:** Learning core
- **Persona(s):** P1, P2, P4, P5
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.8
- **Expected path:** Delete the subject outright, the way a book can be deleted (DELETE /subjects/:subjectId/books/:bookId exists).
- **Actual state:** No DELETE route exists for subjects anywhere in the API. subjectRoutes exposes only POST (create), GET (list/get), PUT (language-setup), POST retry-curriculum, and PATCH (update) — no delete (subjects.ts:47-184). The only DELETE under /subjects is for vocabulary (vocabulary.ts:116). The sole removal affordance is PATCH status='archived' (use-subjects.ts:140-169; library.tsx:1188-1234), which keeps the subject forever in the includeInactive list and is reversible via 'restore' — there is no way to ever expunge a mistakenly-created subject. Recovery (archive/hide) exists, but the specific 'permanently remove' intent has no path, unlike books which can be hard-deleted.
- **Evidence:** `apps/api/src/routes/subjects.ts:47-184`, `apps/api/src/routes/books.ts:113-145`, `apps/api/src/routes/vocabulary.ts:116`, `apps/mobile/src/app/(app)/library.tsx:1172-1251`
- **Verifier notes:** Confirmed real gap after thorough search. No DELETE route for a subject exists anywhere.

Evidence verified:
- apps/api/src/routes/subjects.ts:47-184 — subjectRoutes exposes POST /subjects (create), POST /subjects/resolve, POST /subjects/classify, GET /subjects, GET /subjects/:id, PUT /subjects/:id/language-setup, POST /subjects/:id/retry-curriculum, PATCH /subjects/:id. No .delete() handler. (Grep for `.delete(` / `DELETE` in this file returned nothing.)
- packages/schemas/src/subjects.ts:11,48-56 — subjectStatusSchema = ['active','paused','archived']; PATCH cannot set any 'deleted'/hidden-forever state. subjects.test.ts:165 explicitly asserts subjectUpdateSchema rejects status:'deleted'.
- apps/api/src/services/subject.ts:203-213 — listSubjects with includeInactive returns archived subjects (extraWhere drops the status='active' filter), so an archived subject persists indefinitely in the manage list and is restorable, never expunged.
- apps/mobile/src/app/(app)/library.tsx:1172-1251 — the manage-subjects UI offers only pause / archive (testID archive-subject-*) / resume / restore (testID restore-subject-*). No delete-subject testID or destructive action anywhere.
- Contrast: books DO have hard delete — apps/api/src/routes/books.ts:125 calls deleteBook (DELETE /subjects/:subjectId/books/:bookId), and vocabulary.ts:116 has DELETE for vocab. So the asymmetry the finder cites is real.
- Checked for an alternative path: archive-cleanup.ts is PROFILE-level (consent-revocation, event app/profile.archived, deletes the whole profile after 30d via deleteProfile) — it does NOT act on subject.status='archived', so archiving a subject triggers no eventual hard delete. deletion.ts only does full-profile cascade. language-curriculum.ts:370 / curriculum.ts:2478 delete a subject's curricula, not the subject row, and are internal (re-setup), not a user 'remove this subject' affordance.

Severity adjusted to medium (not high): a recovery/escape DOES exist — the user can archive to declutter the active library, and archived subjects fall out of the default GET /subjects (status='active' filter). So the intent 'get it out of my way' is served; only the narrower 'permanently expunge' intent has no path. Not a hard dead-end, just a missing destructive affordance that books/vocab have. Did not find this tracked in docs/compliance/audience-matrix.md gating gaps (those concern owner/role gating, not subject deletion).

### notif-1 — As an adult mentor/guardian who only reviews my child's progress and never runs a learning session myself, I want to receive the push notifications the system sends me (weekly progress push, guardian recall nudges, consent-warning/archived/deleted alerts).

- **Domain:** Notifications & nudges
- **Persona(s):** P4 (adult mentor/guardian); also P5 if they never personally complete a session
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.78
- **Expected path:** On becoming a guardian, the app should at some point request OS notification permission and register a push token, so that guardian-targeted pushes (weekly-progress-push, guardian recall nudge, consent grace-period warnings) can actually be delivered.
- **Actual state:** The only path that calls Notifications.requestPermissionsAsync() for push is usePostSessionNotificationAsk, which is mounted exclusively in session-summary/[sessionId].tsx and is gated on hasCompletedSession. A guardian who never completes a learning session never hits a session summary, so OS permission is never requested. usePushTokenRegistration only registers a token when permission is ALREADY granted and silently returns {status:'failed', reason:'permission_denied'} otherwise. Server-side, weeklyProgressPushGenerate and consentRevocation push to the parent profileId, and sendPushNotification returns {sent:false, reason:'no_push_token'} — the parent silently gets nothing (email digest still works as a fallback for weekly progress, but consent-warning/archived/deleted are push-only).
- **Evidence:** `apps/mobile/src/app/session-summary/[sessionId].tsx:173 (usePostSessionNotificationAsk is the only mount)`, `apps/mobile/src/hooks/use-post-session-notification-ask.ts:33-37 (early-returns unless hasCompletedSession)`, `apps/mobile/src/hooks/use-push-token-registration.ts:80-84 (registers only when status==='granted'; never prompts)`, `apps/api/src/inngest/functions/consent-revocation.ts:87-92 (consent_warning push to parentProfileId, push-only)`, `apps/api/src/services/notifications.ts:83-86 (no token => silent {sent:false, reason:'no_push_token'})`
- **Verifier notes:** VERDICT: Real gap. I tried hard to refute it and could not find any path that requests OS push permission for a guardian who never completes a session.

Refutation attempt (the finder's strongest miss candidate): the More > Notifications settings screen at apps/mobile/src/app/(app)/more/notifications.tsx has a "push" ToggleRow (push-notifications-toggle, lines 134-142). This looked like a manual path to enable push. But it ONLY calls updateNotifications.mutate({...pushEnabled: value}) (lines 27-44) — a server-side preference write. It does NOT call Notifications.requestPermissionsAsync(), does NOT call getExpoPushTokenAsync, and does NOT trigger token registration. So toggling push "on" here never prompts the OS nor registers a token. Refutation fails.

Confirmed the finder's evidence against current HEAD:
- usePushTokenRegistration IS mounted globally for all personas at apps/mobile/src/app/(app)/_layout.tsx:263 (not only session-summary as finder implied) — but it only registers when permission is ALREADY granted: getPermissionsAsync() at use-push-token-registration.ts:80, returns {status:'failed', reason:'permission_denied'} at :81-84 if not granted. It never prompts. The file's own docstring (lines 45-48) states "Does NOT prompt for permission — notification consent is requested just-in-time by the post-session primer."
- The ONLY requestPermissionsAsync() for push in app code is in use-post-session-notification-ask.ts:101, inside the primer Alert "Allow" handler.
- That primer is gated: use-post-session-notification-ask.ts:34-37 early-returns unless profileId set, hasCompletedSession true, and not isParentProxy. At the only mount (session-summary/[sessionId].tsx:173-177), hasCompletedSession = totalSessionCount >= 1 (the ACTIVE profile's own session count) and isProxyMode is passed. A P4 guardian who never runs a personal session has totalSessionCount === 0, so even reaching session-summary wouldn't fire it.
- Onboarding: grep for requestPermissionsAsync/getExpoPushToken/the two hooks under **/onboarding/** returned no matches — no permission request during sign-up.
- Server side: consent-revocation.ts:87-92 sends consent_warning push to parentProfileId (push-only, no email branch in this path); notifications.ts:83-86 returns {sent:false, reason:'no_push_token'} silently when no token. So the guardian silently gets nothing.

SEVERITY: Adjusted to medium (finder implied high). Reasons it's not high: (a) weekly progress has an email-digest fallback (weeklyProgressEmail defaults true at notifications.tsx:155) so the headline guardian nudge still reaches them via email; (b) pre-launch, no active users (project memory: project_pre_launch_no_users); (c) consent grace-period warnings being push-only is the genuinely concerning slice, but that is a delivery-reliability gap rather than a hard dead-end (the account-closing flow itself still proceeds and is reversible in-app). Still a real absent-path: there is no UI affordance anywhere that lets a review-only guardian opt into OS push.

TRACKING: docs/compliance/audience-matrix.md acknowledges "push-delivery gaps" as a category (lines 28, 126) but no specific finding F1-F14 documents this guardian-permission-never-requested gap (F13/F14 are reserved/empty). Not explicitly tracked.

WHERE THE FIX WOULD LIVE: either (a) gate the post-session primer's logic differently / add a guardian-onboarding permission ask, or (b) wire the More > Notifications push toggle (notifications.tsx:24-47) to call requestPermissionsAsync() + trigger usePushTokenRegistration's registerIfAllowed when toggled on — that toggle is the natural home for the missing affordance.

### notif-2 — As any user who tapped 'Not now' (or whose OS permission is denied) on the notification primer, I want to later turn notifications back on from the in-app Notifications settings screen.

- **Domain:** Notifications & nudges
- **Persona(s):** P1, P2, P3, P4, P5 (all personas)
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.85
- **Expected path:** The more/notifications screen, when push is off at the OS level, should request OS permission (or deep-link to system Settings) so toggling 'Push notifications' on actually starts delivering — mirroring the camera permission screen which offers Open Settings.
- **Actual state:** more/notifications.tsx only issues a server PUT of preference booleans via useUpdateNotificationSettings; it never calls Notifications.requestPermissionsAsync() or Linking.openSettings(). The user can flip pushEnabled=true server-side while the OS permission is still undetermined/denied, after which every cron scan that INNER JOINs pushEnabled=true selects the profile, but sendPushNotification returns no_push_token and nothing arrives. The primer marks itself seen forever after one dismissal (setItemAsync(key,'true')), and there is no other UI that re-requests permission. Contrast camera.tsx:825 which renders an Open Settings button when canAskAgain is false.
- **Evidence:** `apps/mobile/src/app/(app)/more/notifications.tsx:24-47 (toggle handlers only mutate server prefs; no OS permission call anywhere in file)`, `apps/mobile/src/hooks/use-settings.ts:184-190 (useUpdateNotificationSettings is a pure PUT)`, `apps/mobile/src/hooks/use-post-session-notification-ask.ts:77,82 (marks seen permanently on grant-or-dismiss)`, `apps/mobile/src/app/(app)/homework/camera.tsx:825 (camera has the Open Settings escape the notifications screen lacks)`
- **Verifier notes:** CONFIRMED as a real gap after a thorough search. I read the full more/notifications.tsx, use-push-token-registration.ts, use-post-session-notification-ask.ts, and grepped every requestPermissionsAsync / openSettings / getExpoPushToken site in apps/mobile/src.

Verification of finder's claims:
- more/notifications.tsx (full file, 1-175): the push toggle handler (lines 24-47) only issues updateNotifications.mutate with preference booleans. There is NO call to Notifications.getPermissionsAsync/requestPermissionsAsync and NO Linking.openSettings() anywhere in the file. The toggle reflects server prefs only (line 136 value={notifPrefs?.pushEnabled}). Confirmed.
- The ONLY Linking.openSettings() calls in the codebase are for microphone (components/session/ChatShell.tsx:557) and camera (homework/camera.tsx:400, 825) — neither reachable from the notifications screen. Confirmed the contrast the finder cited.
- The ONLY notification requestPermissionsAsync is the post-session primer (use-post-session-notification-ask.ts:101), which permanently marks seen via SecureStore.setItemAsync(key,'true') on BOTH the allow path (line 111) and the not-now path (line 94), AND short-circuits + marks-seen when canAskAgain is false (lines 74-78). So after one dismissal or an OS block, the primer never fires again. Confirmed.
- Delivery dead-end is real: daily-reminder-scan.ts:54 INNER JOINs notificationPreferences.pushEnabled=true, and sendPushNotification depends on a stored push token. Flipping pushEnabled=true server-side while OS permission is denied/undetermined selects the profile but delivers nothing.

Partial mitigation I found (lowers severity from high to medium, but does NOT refute the gap): use-push-token-registration.ts only registers a token when permission is ALREADY granted (lines 80-84) and explicitly never prompts (doc comment lines 45-49). It re-runs on AppState 'active' (lines 182-189). So IF a user independently opens the OS Settings app, enables notifications, and returns to foreground, the token auto-registers and delivery starts. But the app provides ZERO affordance to discover this — no deep-link, no permission-status display, no "notifications are off at the system level, open Settings" message on more/notifications.tsx. The in-app toggle is a silent no-op when OS permission is off and actively misleads by showing 'on' while nothing arrives.

Conclusion: the stated intent ("re-enable notifications from the in-app Notifications settings screen after dismissing the primer or OS-denying") has no working in-app path. The only recovery is an undiscoverable out-of-app OS-Settings detour. This matches the finder's claim. Severity medium rather than high because a determined user with OS knowledge can recover via system Settings + the AppState re-registration, and push is non-critical, but the missing affordance + the misleading toggle state are a genuine UX dead-end affecting all 5 personas.

### notif-3 — As a minor on my parent's account who has hit my daily/monthly usage cap, I want my parent to actually be alerted (pushed) so they can lift the cap or upgrade in time for me to keep studying.

- **Domain:** Notifications & nudges
- **Persona(s):** P3 (minor non-owner on parent account); the parent recipient is P4
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.8
- **Expected path:** The child-cap 'notify parent' action should result in the parent receiving a push (or at minimum some out-of-app signal), since the whole point is to reach a parent who is not currently in the app.
- **Actual state:** POST /notifications/child-cap/notify-parent calls recordChildCapNotificationForAccount, which only INSERTs a childCapNotifications row scoped to the owner profile. There is no sendPushNotification call on this path. The parent only ever sees it by opening the app and pulling listActiveChildCapNotifications (gated to role==='owner'). If the parent never opens the app, the 'notification' is invisible — the cross-device escalation intent dead-ends with no out-of-app delivery.
- **Evidence:** `apps/api/src/routes/notifications.ts:71-93 (notify-parent handler only calls recordChildCapNotificationForAccount; no push)`, `apps/api/src/services/child-cap-notifications.ts:193-201 (recordChildCapNotificationForAccount only inserts a row)`, `apps/api/src/services/child-cap-notifications.ts:89-114 (insertChildCapNotification is a pure DB insert, no notifications import)`, `apps/mobile/src/hooks/use-child-cap-notifications.ts:49 (parent reads it only via owner-gated pull query)`
- **Verifier notes:** After an exhaustive search I could NOT refute this gap; the finder is correct. Both the manual and automatic cap-notification paths terminate at a pure DB insert with no out-of-app (push) delivery.

Manual path (finder cited, verified): QuotaExceededCard.tsx:113-157 (child taps "Notify parent") -> use-child-cap-notifications.ts:80-98 -> POST /notifications/child-cap/notify-parent (notifications.ts:71-93) -> recordChildCapNotificationForAccount (child-cap-notifications.ts:193-201) -> insertChildCapNotification (child-cap-notifications.ts:89-114), a pure DB insert. No push call.

I additionally found an AUTOMATIC server path the finder did not mention, and it ALSO does not push — so it strengthens, not refutes, the gap: child hits cap -> metering.ts:43 emits 'app/billing.profile_quota.exhausted' -> Inngest fn notifyParentChildCapHit (notify-parent-child-cap-hit.ts:13-33) -> recordChildCapNotificationForSubscription -> same insertChildCapNotification DB insert. No sendPushNotification in that function either.

Push infrastructure exists and is wired to OTHER flows (review-due-send, recall-nudge-send, daily-reminder-send, weekly-progress-push in apps/api/src/inngest/functions/, plus services/notifications.ts), but services/notifications.ts has ZERO references to child-cap/quota (grep: no matches for child.?cap|quota|profile_quota). The string 'childCapNotification' appears in only 3 files (notifications.ts route, child-cap-notifications.ts service, its integration test) — none import or call the push service.

Parent receives it ONLY in-app: ParentHomeScreen.tsx:917 renders the list from useChildCapNotifications, which is gated enabled: role === 'owner' (use-child-cap-notifications.ts:49) and the GET handler calls assertOwnerProfile (notifications.ts:45). No device badge, local notification, or push tied to the cap notification.

Severity adjusted to MEDIUM rather than HIGH: an in-app surface does exist on both ends (one-tap notify button for the child at QuotaExceededCard.tsx:113; a visible notifications block on the parent's home at ParentHomeScreen.tsx:917), and the child has an escape (go-home button, reset hint). The unserved intent is specifically the cross-device/out-of-app escalation — reaching a parent who is not currently in the app — which is precisely the whole point of "notify parent." That intent dead-ends. Not high because no one is hard-blocked in-app and the limit auto-resets.

### onboard-1 — A learner (any persona) wants to set their pronouns during onboarding so the mentor addresses them correctly from the start.

- **Domain:** Onboarding & personalization
- **Persona(s):** P1, P2, P3 (learner-shape users 13+)
- **Already tracked:** true · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** After creating a profile, the first-run flow should walk through the personalization steps including the pronouns picker before (or alongside) the first session.
- **Actual state:** The pronouns screen exists (apps/mobile/src/app/(app)/onboarding/pronouns.tsx) but the ONLY route into it is the ExplainedRedirect in onboarding/index.tsx (href '/(app)/onboarding/pronouns', line 10), and onboarding/index.tsx itself has NO production navigator. The real first-run chain is create-profile.tsx -> handleClose()/router.replace('/(app)/home') (lines 332, 379-381) for solo, OR create-subject.tsx -> /ready (transitionToFirstSession, ready.tsx:95 router.replace to /(app)/session). Neither path ever visits pronouns or onboarding/index. So pronouns onboarding is effectively orphaned; a learner is dropped into a session having never been offered the pronouns step.
- **Evidence:** `apps/mobile/src/app/(app)/onboarding/index.tsx:9-10`, `apps/mobile/src/app/(app)/onboarding/pronouns.tsx:35-53`, `apps/mobile/src/app/create-profile.tsx:332,379-381`, `apps/mobile/src/app/ready.tsx:81-98`, `apps/mobile/src/app/create-subject.tsx:343-388`
- **Verifier notes:** Could NOT refute — the gap is real. The pronouns screen's only inbound link is onboarding/index.tsx (apps/mobile/src/app/(app)/onboarding/index.tsx:9-10, a pure ExplainedRedirect to /(app)/onboarding/pronouns). I searched for any production navigator into /(app)/onboarding: zero results for router.replace/push to onboarding, no layout gate, no profile-state redirect. screen-navigation.test.ts:42 explicitly describes onboarding/index as "pure <Redirect>; no UI" and the E2E runbook (docs/E2Edocs/e2e-runbook.md:420) says the route is only "reachable via page.goto('/onboarding/pronouns')" — i.e. tested by direct nav, never by a real flow.

The actual first-run chains never touch pronouns: (a) solo — create-profile.tsx:175,332,380 handleClose()→goBackOrReplace home; (b) subject — create-subject.tsx transitionToFirstSession (lines 136-225) → /ready → /(app)/session, or four_strands → /(app)/onboarding/language-setup (line 365), or broad → pick-book — none route to pronouns.

The documented intended chain was a SUBJECT-16 conversation-language picker that flows "before pronouns" (docs/flows/flow-master-directory.md:160-161) — but BOTH SUBJECT-16 and SUBJECT-17 are marked "Not created"/"Not mapped" there. There is no standalone language-picker screen; conversationLanguage is set silently from i18n.language in create-profile.tsx:252-265, so the never-built picker can't be the stepping-stone into pronouns either.

No recovery path post-onboarding: useUpdatePronouns (hooks/use-onboarding-dimensions.ts:88) is consumed ONLY by pronouns.tsx. No more/ (Settings) or profile-edit screen references pronouns at all (grep of apps/mobile/src/app/(app)/more = no matches), so even pronouns.tsx's own returnTo==='settings' branch (line 116) is dead — nothing invokes it. P1/P2/P3 learners 13+ have NO path to ever set pronouns.

alreadyTracked = true (partially). Tracked as a coverage/mapping gap: master-directory SUBJECT-16/17 "Not created", flow-revision-plan.md:224 "Blocked... no pronouns route was reached in native runs", and 2026-05-31-mobile-screen-audit.md lists the screen. BUT it is mis-verified elsewhere: docs/audit/2026-05-11-parent-home-end-user-audit.md:22 PH-AUDIT-4 marks it "Fixed — onboarding/index.tsx exists, redirects to pronouns" — that conflates file existence with reachability and would mislead a reader into thinking the path works.

Severity medium not high: pronouns is explicitly optional (screen self-skips <13; Skip never blocks), so the absence degrades personalization quality rather than blocking any core task.

### onboard-2 — A learner wants to change the language their tutor speaks/writes in (conversation/tutor-prose language) after onboarding — e.g. they were defaulted from device locale and want to switch, or they want a tutor-prose-only locale (Czech, French, Italian) that has no UI shell.

- **Domain:** Onboarding & personalization
- **Persona(s):** P1, P2, P3, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A settings row to pick tutor/conversation language, independent of the app UI language, surfacing all 10 conversationLanguageSchema locales.
- **Actual state:** The mutation hook useUpdateConversationLanguage exists (use-onboarding-dimensions.ts:45) and the API PATCH /onboarding/language is live, but NO mobile UI calls it directly. The only setter in production is useMentorLanguageSync (use-mentor-language-sync.ts:20-39), which clamps i18next.language into the conversation set. i18next.language is changed only by the app-language picker in more/account.tsx (handleLanguageChange, lines 43-48), which offers the 7 SUPPORTED_LANGUAGES UI locales. The 3 conversation-only locales (cs, fr, it) can therefore never be selected after signup, and a user cannot decouple tutor language from UI language at all.
- **Evidence:** `apps/mobile/src/hooks/use-onboarding-dimensions.ts:45-79`, `apps/mobile/src/hooks/use-mentor-language-sync.ts:20-45`, `apps/mobile/src/app/(app)/more/account.tsx:43-48,80-84`, `packages/schemas/src/profiles.ts:81-84`
- **Verifier notes:** CONFIRMED as a real gap — no refutation path found after exhaustive search of apps/mobile/src.

The only production writer of conversationLanguage post-onboarding is useMentorLanguageSync (use-mentor-language-sync.ts:6,12,38-45), which derives the value purely from i18next.language clamped via conversationLanguageSchema.safeParse. i18next.language is changed post-onboarding ONLY by more/account.tsx handleLanguageChange (lines 43-48), whose picker iterates SUPPORTED_LANGUAGES (i18n/index.ts:23-31 = 7 locales: en,de,es,ja,nb,pl,pt). The 3 conversation-only locales (cs, fr, it) are absent from SUPPORTED_LANGUAGES, so i18next.language can never hold those values, so useMentorLanguageSync can never write them. There is no settings row, no profile-edit field, and no other UI anywhere that calls useUpdateConversationLanguage directly (grep across apps/mobile/src: only the hook definition at use-onboarding-dimensions.ts:45 and its sole consumer use-mentor-language-sync.ts, plus a test mock).

Refutation candidates I checked and ruled out:
- apps/mobile/src/app/(app)/onboarding/language-setup.tsx — this is a DIFFERENT concept. It collects the learner's NATIVE language (NATIVE_LANGUAGE_OPTIONS, lines 23-38) and CEFR starting level for a language-LEARNING subject, and calls useConfigureLanguageSubject (line 16/105), not useUpdateConversationLanguage. Not the tutor-prose language. Does not serve the intent.
- apps/mobile/src/app/create-profile.tsx (lines 251-266) and ProfileBasicsStep.tsx (lines 43-46,123-125) — both set conversationLanguage ONLY at profile creation, derived from i18n.language via safeParse, with no picker. Creation-only, no post-onboarding edit, and still bounded by the UI-language coupling.

So both halves of the intent are genuinely unserved: (a) cs/fr/it can never be selected as tutor language after signup, and (b) tutor language cannot be decoupled from UI language at all. The CLAUDE.md "Languages" section explicitly documents the superset design intent but no edit UI exists to exercise it.

Severity adjusted to medium (not high): the default device-locale→tutor-prose path works correctly for the 7 overlapping locales, so most users get a reasonable default; the dead-end only bites cs/fr/it learners and anyone wanting to decouple — a real but narrow population. Not tracked in docs/compliance/audience-matrix.md (no conversation-language entry found; only the F1-F14 scaffold note).

### onboard-3 — A user (or parent on behalf of a child) wants to correct a wrong birth date entered during profile creation — e.g. mis-tapped year, which can wrongly bracket their age, hide the pronouns gate, or block/enable family eligibility.

- **Domain:** Onboarding & personalization
- **Persona(s):** P1, P2, P3, P4
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.82
- **Expected path:** An edit-birth-date control somewhere in profile/account settings, or a re-onboarding path that lets the date be re-entered.
- **Actual state:** profileUpdateSchema explicitly omits birthYear, birthMonth, and birthDay (packages/schemas/src/profiles.ts:83), so the PATCH /profiles/:id route (profiles.ts:145-173) cannot change birth date. Birth date is collected once at create-profile.tsx:261-263 and is thereafter immutable. There is no birthdate/birthYear edit control anywhere under more/ (grep returned no matches). The only 'recovery' would be deleting the whole profile/account and re-registering.
- **Evidence:** `packages/schemas/src/profiles.ts:81-84`, `apps/api/src/routes/profiles.ts:145-173`, `apps/mobile/src/app/create-profile.tsx:261-263`
- **Verifier notes:** CONFIRMED as a real gap; could not refute. Verified end-to-end that birth date is create-only and permanently immutable:

1. SCHEMA: packages/schemas/src/profiles.ts:81-84 — profileUpdateSchema = profileCreateSchema.partial().omit({ birthYear, location, birthMonth, birthDay }).strict(). Because it is .strict(), a hand-crafted PATCH carrying birthYear is rejected (unknown-key error), not silently dropped. Comment at lines 74-80 explicitly states birthMonth/birthDay are "create-only ... must not appear in PATCH payloads."

2. ROUTE: apps/api/src/routes/profiles.ts:145-173 — PATCH /profiles/:id validates body via zValidator('json', profileUpdateSchema), so birthYear can never reach the handler. The owner gate (161-168) only governs who may edit, not which fields.

3. SERVICE: apps/api/src/services/profile.ts:576-600 — updateProfile does .set({ ...input }) where input is the already-stripped ProfileUpdateInput; there is no separate birthYear write path. The only other writes of birthYear are in createProfile (341-367) — creation only.

4. MOBILE MUTATION: apps/mobile/src/hooks/use-profiles.ts:44-68 — the sole profile-edit hook (useUpdateProfileName) sends only { displayName }. No birthYear-editing hook exists.

5. SETTINGS UI: apps/mobile/src/app/(app)/more/account.tsx has no birth/age control (only app-language). No edit-birthdate control anywhere under more/.

6. The save-wizard ProfileBasicsStep.tsx:222-234 collects a parent/child birth year, but it is a CREATION flow (client.profiles.$post at 119,153), reachable only when converting preview onboarding into new profiles — not an edit path for an existing profile. Likewise create-profile.tsx:269 is a $post.

CONSEQUENCES (substantiate non-trivial severity): a wrong birthYear permanently mis-brackets age (computeAgeBracket), gates the pronouns self-edit (onboarding.ts:133 assertPronounsSelfEditAllowed(profileMeta.birthYear)), and blocks/enables family mode (profile.ts:629 requires computeAgeBracket(existing.birthYear) === 'adult'). Affects all of P1/P2/P4 for self, and P3 too: a parent who mistyped a CHILD's birth year also has no fix path — updateProfile accepts no birthYear even when the owner edits a child. Only "recovery" is deleting the profile/account and re-registering (and for a self-registered minor P2 with a consent flow, that means re-running consent).

SEVERITY adjusted to medium: true dead-end with no in-app recovery, but pre-launch (no active users per memory) and the destructive workaround (delete + re-register) technically exists. Not tracked in docs/compliance/audience-matrix.md F1-F14 nor in docs/flows/master-directory as a logical gap.

### onboard-4 — A new learner wants to tell the tutor their interests (and whether each is for school or free time) during onboarding so cards/examples are personalized from session one.

- **Domain:** Onboarding & personalization
- **Persona(s):** P1, P2, P3
- **Already tracked:** true · **Recovery exists:** true · **Verifier confidence:** 0.7
- **Expected path:** An interests/context step in the first-run onboarding chain that calls the interests-context endpoint.
- **Actual state:** useUpdateInterestsContext (use-onboarding-dimensions.ts:130) is wired ONLY into the mentor-memory screens (apps/mobile/src/app/(app)/mentor-memory.tsx:60 and child/[profileId]/mentor-memory.tsx:83), which are a deeper settings/review surface reached after the fact, not part of create-profile/ready first-run. No onboarding screen collects interests. The flow docs themselves flag SUBJECT-16 (conversation-language picker, post-create-profile) as 'Not created / Not mapped', and the interests step is absent from the create-profile -> /ready -> session chain.
- **Evidence:** `apps/mobile/src/hooks/use-onboarding-dimensions.ts:130-159`, `apps/mobile/src/app/(app)/mentor-memory.tsx:60`, `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:83`, `apps/mobile/src/app/ready.tsx:81-98`, `docs/flows/flow-master-directory.md`
- **Verifier notes:** CONFIRMED REAL GAP after thorough search. The first-run onboarding chain is index -> pronouns -> language-setup -> session, with no interests step. Evidence: (1) onboarding/_layout.tsx:20-23 registers ONLY pronouns and language-setup as Stack.Screens (an explicit comment names them as the steps); (2) onboarding/index.tsx:9 redirects to /onboarding/pronouns; (3) onboarding/language-setup.tsx:173-174 router.replace goes straight to /(app)/session (no interests hop); (4) pronouns.tsx:121,128 routes to home/session. The interests-context endpoint IS implemented (use-onboarding-dimensions.ts:130 useUpdateInterestsContext, calling onboarding[':profileId'].interests.context.$patch / onboarding.interests.context.$patch), but its ONLY consumers are mentor-memory.tsx:60 (self-view) and child/[profileId]/mentor-memory.tsx:490 (interests section) — confirmed by grep: zero matches in create-profile.tsx, ready.tsx, or the onboarding screens. Those mentor-memory screens are reached AFTER first run: from session-summary/[sessionId].tsx:801/807 (post-session) and child/[profileId]/index.tsx:1080 (child-detail settings link), never from the create-profile->ready->session chain.

The hook's own docstring (use-onboarding-dimensions.ts:121-129) even says it is "Called by the per-interest context picker at the end of the onboarding interview" — describing a step that does not exist in the wired flow; the picker only lives on the post-hoc mentor-memory surface. So personas P1 (adult solo), P2 (minor solo), P3 (minor non-owner; parent edits via child/[profileId]/mentor-memory) all reach session one with no chance to declare interests up front.

Severity adjusted to MEDIUM, not high: this is a degraded-personalization gap, not a dead-end trap. The endpoint, schema (InterestEntry with free_time/school/both context), and a fully functional UI picker already exist — they are just placed on a post-first-session settings surface instead of in the first-run chain. Interests do get collected eventually (after the first session via the mentor-memory cue), so "from session one" is unmet but the broader intent is recoverable. Adding the step would be wiring an existing screen into the existing chain. Note: the flow docs (docs/flows/flow-master-directory.md) flag SUBJECT-16 (the sibling conversation-language picker) as 'Not created / Not mapped', corroborating that this family of post-create-profile onboarding-dimension steps was never wired into first-run; the interests step is in the same un-mapped state.

### progress-1 — A minor non-owner child on a parent's account (P3) wants to see their own weekly progress report, but their parent has turned off BOTH the weekly progress push and the weekly progress email.

- **Domain:** Progress / Recaps / Reporting
- **Persona(s):** P3 (and indirectly P4 whose preference controls it)
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.82
- **Expected path:** The child opens the Progress tab (isViewingSelf), the app calls GET /progress/weekly-reports scoped to their own profileId, and a weekly report row exists to display.
- **Actual state:** Weekly report ROWS for a child are only ever written by weeklyProgressPushGenerate, and the cron that fans out to parents (weeklyProgressPushCron) filters out any parent where NOT ((pushEnabled && weeklyProgressPush) || weeklyProgressEmail). A parent with both weekly channels off is never enumerated, so the per-child weeklyReports insert at weekly-progress-push.ts:714-722 never runs. The child's own /progress/weekly-reports query (listWeeklyReportsForProfile filters weeklyReports.childProfileId = self) therefore returns empty forever — report GENERATION is coupled to the parent's notification DELIVERY preference. Monthly reports are unaffected (monthly cron enumerates all family links with snapshots, no pref filter).
- **Evidence:** `apps/api/src/inngest/functions/weekly-progress-push.ts:302-309`, `apps/api/src/inngest/functions/weekly-progress-push.ts:714-722`, `apps/api/src/services/weekly-report.ts:219-228`, `apps/api/src/inngest/functions/monthly-report-cron.ts:144-191`
- **Verifier notes:** VERIFIED REAL GAP. After exhaustive search I could not find any path that writes a P3 (minor non-owner linked child) weekly-report row when the parent has BOTH weekly channels off. Evidence:

WRITE PATHS to weeklyReports (the only 3 production inserts, confirmed via grep):
1. weekly-progress-push.ts:714-722 (parent-push) writes childProfileId=child, but the enclosing generate handler only runs for parentIds the cron enumerated, and the cron filters parents at weekly-progress-push.ts:302-309 to ((pushEnabled && weeklyProgressPush) || weeklyProgressEmail). A parent with both weekly channels off is never enumerated -> no generate event -> insert never runs. Confirmed finder's claim.
2. weekly-progress-push.ts:230-238 (persistWeeklySelfReportForProfile) writes childProfileId=self, but only for profiles returned by listEligibleSelfReportProfileIdsAtLocalHour9, which requires profiles.isOwner=true (solo-progress-reports.ts:56) AND excludes any profile that appears as a familyLinks.childProfileId (lines 72-84). A P3 is isOwner=false and IS a linked child, so it is filtered out on both counts.
3. weekly-self-reports.ts:327-330 writes childProfileId=self via the SAME listEligibleSelfReportProfileIds enumeration -> same isOwner=true + not-linked-child exclusion. Excludes P3.

READ PATH is live and self-scoped: GET /v1/progress/weekly-reports -> listWeeklyReportsForProfile (weekly-report.ts:219-228) filters weeklyReports.childProfileId=self; mobile Progress tab calls useProfileWeeklyReports(activeProfile.id) at apps/mobile/src/app/(app)/progress/index.tsx:187. So the child's own query returns empty forever and the reports section stays empty with no recovery the child controls (changing notification prefs is owner-gated; the child cannot enable the parent's channel).

The gap is corroborated by the DESIGN DOC that created it: docs/_archive/plans/done/2026-05-11-progress-reports-first.md:51 (D-RP-11) explicitly states self reports are only generated for profiles with no familyLinks child-side row and "Linked children continue to be served by the existing parent-child row" — i.e., the design deliberately relies on the parent-push path (which is gated by parent notification prefs) to populate a linked child's own report. No path decouples report GENERATION from parent DELIVERY preference. Monthly reports are unaffected (monthly-report-cron.ts:144-191 enumerates all family links with snapshots, no pref filter), which actually softens the gap: the child still sees monthly reports.

NOT explicitly tracked as a defect: the design doc describes the mechanism but does not flag the both-channels-off dead-end; audience-matrix / flow master-directory do not list it. alreadyTracked = false.

Severity adjusted to MEDIUM (not high): (a) trigger is narrow — default prefs enable weeklyProgressEmail (comment at weekly-progress-push.ts:275-276), so the gap only bites when a parent AFFIRMATIVELY turns off BOTH weekly push and weekly email; (b) the child still receives MONTHLY reports, so the Progress tab is not fully empty — only the weekly cadence is missing. It is a genuine absent-path/dead-end for the weekly-report intent, but partially mitigated.

---

## LOW severity (6)

### practice-1 — A learner answering a quiz round (e.g. 5 of 7 questions in) has the app killed/evicted by the OS, then reopens the app expecting to continue the round they were on.

- **Domain:** Practice / Quiz / Dictation / Homework
- **Persona(s):** P1, P2, P3, P5 (any learner who plays quiz)
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** On relaunch, the app offers to resume the in-progress quiz round with prior answers, the way it does for tutoring sessions ('Pick up where you stopped').
- **Actual state:** The entire quiz flow state (the generated round and all per-question answers) lives in volatile React context: QuizFlowProvider holds `round`, `completionResult`, results in `useState` with INITIAL_STATE reset on remount (apps/mobile/src/app/(app)/quiz/_layout.tsx:39-47,64). On process kill the round and answers are gone. The only durable resume mechanism — the SecureStore recovery marker — is written exclusively from the tutoring-session path (writeSessionRecoveryMarker is called only in components/session/use-session-streaming.ts:519,662,933 and app/(app)/session/_hooks/use-session-recovery.ts:99) and the resume UI routes only to /(app)/session (components/home/LearnerScreen.tsx:312-345). There is no incomplete-round/resume concept anywhere (grep for activeRound/incompleteRound/resumeRound returns nothing in mobile src). play.tsx's only escape on missing round is to redirect home (play.tsx:163-167,426-467). The round was already generated server-side, consuming LLM quota.
- **Evidence:** `apps/mobile/src/app/(app)/quiz/_layout.tsx:39-47`, `apps/mobile/src/app/(app)/quiz/_layout.tsx:64`, `apps/mobile/src/app/(app)/quiz/play.tsx:163-167`, `apps/mobile/src/app/(app)/quiz/play.tsx:426-467`, `apps/mobile/src/lib/session-recovery.ts:27`, `apps/mobile/src/components/home/LearnerScreen.tsx:326-345`
- **Verifier notes:** VERIFIED REAL GAP. Searched all quiz routes, screens, hooks, and the session-recovery lib. No path resumes an in-progress quiz round after process kill.

Closest refutation candidate — and why it fails: apps/mobile/src/app/(app)/quiz/[roundId].tsx IS a round-by-ID route, and the server DOES persist the round (GET /quiz/rounds/:id returns activeRoundDetailResponseSchema for non-completed rounds — apps/api/src/routes/quiz.ts:293-303). But the mobile [roundId] screen is a READ-ONLY completed-round review screen: resolveCompletedRoundDetail() (apps/mobile/src/app/(app)/quiz/[roundId].tsx:19-33,104-125) only accepts status==='completed' and renders round-detail-error for active/incomplete rounds. It cannot resume play. The route is reachable only from completed-round history rows (docs/flows/master-directory/learn/QUIZ-09.md:37, entry points all from history/practice/results).

The play screen has no ID-based entry: QuizPlayScreen reads `round` exclusively from volatile useQuizFlow() context (apps/mobile/src/app/(app)/quiz/play.tsx:79-86); it never reads a roundId from useLocalSearchParams or any persisted store, and on missing round it redirects to exitHref (play.tsx:163-167). All quiz flow state — round, prefetchedRoundId, completionResult — lives in useState in QuizFlowProvider with INITIAL_STATE reset on remount (quiz/_layout.tsx:39-47,64); none is mirrored to SecureStore/AsyncStorage.

Answers are doubly lost: per-question answers live only in volatile resultsRef and are NOT persisted server-side incrementally — POST /quiz/rounds/:id/check only returns correctness without storing the answer (apps/api/src/routes/quiz.ts:323-344); the results[] array is sent only at POST /complete (quiz.ts:346-357). So even the persisted active round on the server carries no record of the 5/7 already answered.

The only durable resume mechanism (writeSessionRecoveryMarker in apps/mobile/src/lib/session-recovery.ts) is tutoring-session-only; no quiz equivalent exists.

Not tracked: QUIZ-09.md's Known Bugs / Open Questions cover Family outcome review and Today/Yesterday grouping, never process-kill resume.

Severity adjusted to LOW: (1) quiz rounds are short (5-7 questions, single sitting) so the blast radius is small vs a long tutoring session; (2) on relaunch the user lands cleanly on the quiz index and can start a fresh round — there is no stuck/broken state, just lost progress; (3) the server-persisted round means LLM quota is consumed but the cost is one-time, not repeated. This is lost-progress-on-kill, not a hard dead-end with no escape.

### practice-2 — A learner part-way through a dictation playback (e.g. heard 6 of 12 sentences) has the app evicted/killed, then reopens expecting to continue from where the dictation left off.

- **Domain:** Practice / Quiz / Dictation / Homework
- **Persona(s):** P1, P2, P3, P5 (any learner using dictation)
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** On relaunch, resume the dictation at the next sentence, or at minimum be offered a resume prompt as tutoring sessions get.
- **Actual state:** Dictation content (sentences, language, completionKey) lives only in the in-memory DictationDataContext consumed via useDictationData() (apps/mobile/src/app/(app)/dictation/playback.tsx:13,21). No recovery marker is ever written for dictation — writeSessionRecoveryMarker is never called from any dictation file (grep shows callers only in session streaming/recovery). On a cold remount `data` is null and the only path is a 'go back to practice' button (playback.tsx:85-108). Even an intentional in-app exit just router.replace('/(app)/practice') with no progress saved (playback.tsx:69-72). RF-09 deliberately never auto-records, so partial work is silently discarded with no resume.
- **Evidence:** `apps/mobile/src/app/(app)/dictation/playback.tsx:21`, `apps/mobile/src/app/(app)/dictation/playback.tsx:69-72`, `apps/mobile/src/app/(app)/dictation/playback.tsx:85-108`, `apps/mobile/src/lib/session-recovery.ts:27`
- **Verifier notes:** see severity notes above

### practice-4 — A learner quits a quiz mid-round via 'Save & finish' wanting to keep their partial progress and come back to ANSWER THE REMAINING questions later.

- **Domain:** Practice / Quiz / Dictation / Homework
- **Persona(s):** P1, P2, P3, P5
- **Already tracked:** false · **Recovery exists:** true · **Verifier confidence:** 0.55
- **Expected path:** Saving a partial round preserves it as resumable so the learner can finish the unanswered questions.
- **Actual state:** 'Save & finish' does not save a resumable round — it immediately submits the partial round to completeRound and navigates to the results screen (apps/mobile/src/app/(app)/quiz/play.tsx:281-301, submitRound at 220-260). The round is scored as final with the unanswered questions simply absent from results. There is no concept of a partially-completed, resumable round; the only post-save destinations are results or quiz home. The label 'Save & finish'/'pauseHere' (play.tsx:1155-1188) implies a pause-and-continue affordance the system does not provide — the round is terminated, not paused.
- **Evidence:** `apps/mobile/src/app/(app)/quiz/play.tsx:281-301`, `apps/mobile/src/app/(app)/quiz/play.tsx:220-260`, `apps/mobile/src/app/(app)/quiz/play.tsx:1154-1163`
- **Verifier notes:** CONFIRMED as a real gap after an exhaustive search for a refutation path. No resume-to-finish-remaining-questions path exists in the quiz flow under any interpretation.

Verified absence of every candidate path:
1. "Save & finish" is terminal, not a pause. handleSaveAndQuit (play.tsx:281-301) calls submitRound -> completeQuizRound, which flips status to 'completed' via completeActive() gated on status='active' (complete-round.ts:486-552). Re-entry to a completed round throws ConflictError (complete-round.ts:551). Unanswered questions are scored as absent (validateResults over completionSourceResults only). The round CANNOT be re-opened to add answers.
2. quiz/[roundId].tsx is READ-ONLY review, NOT a resume-play entry. resolveCompletedRoundDetail requires status === 'completed' and the screen explicitly "Reject[s] incomplete, active, abandoned, or unparseable round responses" (apps/mobile/src/app/(app)/quiz/[roundId].tsx:23, 104-107). It renders a static answer breakdown with no answer inputs.
3. The launch screen always GENERATES a new round (launch.tsx:153-176, generateRoundMutate); there is no code path that loads an existing active round into apps/mobile/src/app/(app)/quiz/play.tsx. setRound is only ever fed a freshly generated round (launch.tsx:142, enterPlay).
4. Quiz history lists only completed rounds (listRecentCompletedRounds -> findCompletedRecent, queries.ts:113-120) and links solely to the read-only [roundId] detail route (history.tsx:73-75, filters on completedAt at :203).
5. The "just leave, come back later" interpretation also dead-ends: an abandoned active round is garbage-collected to status='abandoned' by abandonStaleQuizRounds (queries.ts:375-387), never resumed.

The "pause here" / pauseBody copy on the modal (play.tsx:1155-1163) genuinely promises a pause-and-continue affordance the system does not provide.

SEVERITY ADJUSTED to LOW (finder is biased high): this is an affordance/copy mismatch, not a stranding dead-end. The learner always has clean escapes — "Save & finish" persists answered questions and navigates to results; "Leave without saving" exits to quiz home (handleConfirmQuit -> dismissToQuizIndex, play.tsx:273-280). No data loss, no trap. A quiz round is a low-stakes, instantly regenerable artifact, so the unmet "finish the rest later" intent has a trivial workaround (start a new round). Honest fix is either relabel the modal away from "pause" semantics or build true resumption; neither is high/medium urgency.

Not explicitly tracked in docs/flows or docs/compliance/audience-matrix.md (the 2026-04-18 quiz-gaps-completion-design treats rounds as terminal by design and documents no resume concept).

### auth-3 — An SSO-only user (signed up with Google/Apple/OpenAI) wants to add a password so they can sign in even if SSO is unavailable, or so they have a backup credential.

- **Domain:** Auth & account lifecycle
- **Persona(s):** P1, P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.78
- **Expected path:** Account security should let an SSO-only user set/create a password (Clerk user.updatePassword with no currentPassword for first-time set).
- **Actual state:** When passwordEnabled is false, AccountSecurity renders only a static 'Secured via {provider}' text card with no action (apps/mobile/src/components/account-security.tsx:36-45). The change-password component requires a currentPassword >= 8 chars (apps/mobile/src/components/change-password.tsx:38-41), so it cannot be used to SET a first password. There is no 'add password' path. An SSO user whose provider login breaks has no alternate credential and forgot-password would not apply (no password factor).
- **Evidence:** `apps/mobile/src/components/account-security.tsx:36`, `apps/mobile/src/components/change-password.tsx:38`
- **Verifier notes:** Could NOT refute. The finder's claim is substantiated by code I read. account-security.tsx:36-45 renders only a static "Secured via {provider}" text card for SSO users (passwordEnabled===false) — no Pressable, no form, no action. The ChangePassword form (change-password.tsx) is rendered ONLY in the passwordEnabled===true branch (account-security.tsx:47-72). The single updatePassword call site in the whole mobile app (change-password.tsx:55-58) always passes currentPassword and validation hard-requires currentPassword.length>=8 (change-password.tsx:38-41), so it cannot perform Clerk's first-time set (updatePassword with no currentPassword). Grep across apps/mobile/src found no createPassword/setPassword/other updatePassword call sites (sign-in/sign-up only use local password state for signIn.create/signUp.create, not credential management on an existing account). apps/api/src has no password endpoint (only test-seed). So an SSO-only user (P1/P4/P5) has genuinely no path to add a backup password credential; forgot-password is inapplicable (no password factor exists).

SEVERITY ADJUSTED DOWN to low. This is a DELIBERATELY DEFERRED, documented product decision — not an undiscovered defect. docs/_archive/specs/deferred/2026-04-04-account-security-design-deferred.md:53-62 explicitly designs the SSO branch as an info-only message with no controls, and docs/specs/epics.md:5242 records it as a checked-off acceptance criterion ("SSO users see info message ... Manage your security settings there"). Mitigating factors lowering severity: (1) intentional/documented, not an oversight; (2) the lockout risk is external (SSO provider outage), which Clerk handles via re-auth with the same provider; (3) no app-side data loss or hard dead-end in normal use — the user can always sign in again via their provider. alreadyTracked: yes — tracked as a deferred spec + epics AC, though it is framed as "by design" rather than as an open gap. The intent's absence is real and worth surfacing as a resilience/backup-credential gap, but it is low priority given the documented deferral and external mitigation.

### family-2 — A guardian wants to add a SECOND guardian / co-parent (e.g. the other parent) so two adults can mentor and manage the same child.

- **Domain:** Family & mentoring linkage
- **Persona(s):** P4, P5
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.8
- **Expected path:** A way to invite or add a second adult guardian, creating a second family_links row (parent_profile_id -> child_profile_id) for a different owner, so both adults see the child in their Family dashboard.
- **Actual state:** family_links rows are only ever created in two places: createProfile when a parent adds a child (apps/api/src/services/profile.ts:386-391) and createGrantedConsentState (consent.ts:370-377). Both create exactly ONE parent->child link, and both keep parent and child on the SAME accountId. There is no service, route, or UI that adds a second parent link to an existing child. getFamilyOwnerProfileId even assumes a single owner (consent.ts:1134-1155). A co-parent on a separate account is impossible because cross-account linking is unimplemented (see family-4).
- **Evidence:** `apps/api/src/services/profile.ts:386-391`, `apps/api/src/services/consent.ts:370-377`, `apps/api/src/services/consent.ts:1134-1155`
- **Verifier notes:** Refutation attempt FAILED — this is a real gap. I searched exhaustively and could not find any path to add a second guardian/co-parent to an existing child.

Evidence confirming the absence:
- The ONLY two production insert(familyLinks) sites are apps/api/src/services/profile.ts:386-391 (parent adds a child during createProfile) and apps/api/src/services/consent.ts:370-377 (createGrantedConsentState). Every other insert(familyLinks) in the repo is in test-seed.ts or *.test.ts files. Both production sites create exactly ONE parent->child link.
- profile.ts:362-391: createProfile inserts the new profile under the current account (accountId from the caller) and only links parentProfileId (the current owner) -> the new child. No second-adult path.
- billing/family.ts:441-475 addProfileToSubscription explicitly rejects any profile whose accountId != sub.accountId ("Until an invite/claim flow exists, never re-parent profiles across accounts"). family.ts:438, 462, 481-488, 494-495, 532-536 repeatedly document that the invite/claim flow needed to attach an external adult is NOT implemented (ProfileRemovalNotImplementedError).
- Mobile: searched apps/mobile/src for invite/co-parent/addGuardian/share-child/second-parent. The only "invite" hit is showInlineStudyInvite in navigation-contract.ts:96,373 — that is a Study-tab inline invite for the owner's own learning, entirely unrelated to adding a co-parent. create-profile.tsx only collects a single new profile's basics (name, birthYear) added under the current owner.
- No route in apps/api/src/routes accepts a second parentProfileId for an existing child, and getFamilyOwnerProfileId (consent.ts:1134) is written assuming a single owner.

Severity adjusted to LOW (finder did not assign one, but this warrants down-scoping): the gap is architecturally intentional, not an accidental dead-end. The verified identity model is single-account (all profiles share accountId, first profile permanently isOwner with no transfer path), and cross-account linking is deliberately unimplemented (this is the sibling gap family-4). Co-parenting requires the same missing invite/claim primitive. Combined with pre-launch / no-active-users state, the user impact today is minimal — it is a known product limitation documented in code comments rather than a broken flow a user can stumble into. Not previously found in docs/compliance/audience-matrix.md gating gaps F1-F14 as a distinct co-parent item, but the invite/claim absence is well-documented in billing/family.ts.

### notif-4 — As a learner (especially a minor on a parent account), I want to send my mentoring parent an in-app nudge/'thank you' or signal back, just as they can nudge me.

- **Domain:** Notifications & nudges
- **Persona(s):** P3 (minor non-owner) and P2 (minor solo) toward a guardian; symmetric to P4->P3
- **Already tracked:** false · **Recovery exists:** false · **Verifier confidence:** 0.7
- **Expected path:** If parents can send children encouragement nudges, a child should have some reciprocal in-app signal path to the parent (or at least the nudge model should be acknowledged as one-directional by design).
- **Actual state:** createNudge enforces assertParentAccess(fromProfileId, toProfileId), so only a parent can be the sender. listUnreadNudges INNER JOINs familyLinks ON parentProfileId = nudges.fromProfileId AND childProfileId = nudges.toProfileId, so a row where the child is the sender would never be listed even if inserted. There is no route or service for a child-originated or peer nudge anywhere in the nudge service. The reciprocal-encouragement intent has no path.
- **Evidence:** `apps/api/src/services/nudge.ts:87 (assertParentAccess forces parent=sender)`, `apps/api/src/services/nudge.ts:217-223 (listUnreadNudges join requires parentProfileId=fromProfileId, child can never be sender in results)`, `apps/api/src/services/nudge.ts:77-198 (createNudge is the only creation path; no child->parent variant)`
- **Verifier notes:** CONFIRMED REAL, but severity adjusted down to LOW. After thorough search I could not refute the finder's core claim: the nudge model is strictly parent->child with no reciprocal child->parent path.

Verified the finder's evidence is accurate:
- createNudge calls assertParentAccess(fromProfileId, toProfileId) at nudge.ts:87, which forces the sender to be the parent in the family_link. A child cannot be a valid sender.
- listUnreadNudges (nudge.ts:215-223) INNER JOINs familyLinks ON parentProfileId=fromProfileId AND childProfileId=toProfileId, so a child-originated row would never appear in results even if inserted.
- The route surface (routes/nudges.ts:34-71) exposes only POST /nudges (create), GET /nudges (list-unread), PATCH /nudges/:id/read, POST /nudges/mark-read. There is no child->parent or peer variant. assertNotProxyMode guards the writes but there is no symmetric reverse endpoint.
- The child's receive UI (mobile NudgeUnreadModal.tsx:38-47) offers only a "Done" dismiss button — no reply/react/thank-you affordance.
- Master directory (docs/flows/master-directory/home/HOME-02.md:36, LEARN-17.md:14) frames nudges deliberately as a "mentor-side control" / "support nudge", confirming the one-directional design. Not flagged as a gap there, so alreadyTracked is effectively false.

I investigated two candidate refutation paths and rejected both:
1. apps/mobile/src/components/tell-mentor-input.tsx has an audience='learner' mode ("Tell Your Mentor Something") that looked like a child->parent channel. It is NOT. It routes via useTellMentor -> routes/learner-profile.ts:348 (tellMentorInputSchema) -> services/learner-input.ts, which classifies the text into the LEARNER'S OWN memory profile fields (communicationNotes/interests/struggles) consumed by the AI tutor (curated-memory.ts). It is never delivered to the human guardian as a notification/signal. The parent only sees it via a read-only mentor-memory view, with no acknowledgment that the child initiated a message.
2. apps/mobile/src/components/family/LearnTogetherSheet.tsx is a parent-side "learn alongside child" feature, not a child->parent signal.

Why LOW, not high/medium: This is a missing symmetry/nice-to-have, not a blocked lifecycle intent or a recovery dead-end. No core action (sign-up, learn, change plan, leave) is broken by its absence. For a child-safety-conscious 11+ product, restricting child-initiated outbound signals to a guardian is a defensible deliberate design choice, and the docs treat the one-directional model as intentional. The intent genuinely has no path, so isRealGap=true, but impact is minimal.

---

## Appendix — refuted candidates (18)

These looked like gaps but the verifier found a real path; listed so they aren't re-reported.

- **auth-5** (auth): A non-owner minor (P3) wants to manage their own account security — change their login password. — path found: apps/mobile/src/components/change-password.tsx:55 (user.updatePassword on the single account-level Clerk identity) gated by apps/mobile/src/lib/navigation-contract.ts:364; apps/api/src/services/profile.ts:74,122,125 (profiles keyed by one accountId)
- **auth-6** (auth): A returning user who forgot which method they signed up with (password vs Google vs Apple vs OpenAI) or which email they used wants to find/recover their account. — path found: apps/mobile/src/app/(auth)/sign-in.tsx:1299-1320 (SSO-hint banner + Contact support); apps/mobile/src/app/(auth)/sign-in.tsx:170-179 + 563-576 (hasSSOProviders detection); apps/mobile/src/app/(auth)/sign-in.tsx:1352-1389 (Google/Apple/OpenAI buttons always present); apps/mobile/src/app/(auth)/sign-in.tsx:584-605 (onContactSupport mailto)
- **identity-2** (identity): A Family/Pro owner with 3-4 child profiles lets the subscription lapse, cancel, or refund; the account downgrades to free and the owner still wants to keep using the app with the children that exceed the free profile cap, or expects the children to become independent. — path found: apps/api/src/routes/consent.ts:523 (PUT /consent/:childProfileId/revoke, tier-agnostic owner-only) -> apps/mobile/src/hooks/use-consent.ts:195 (useRevokeConsent) -> apps/mobile/src/app/(app)/child/[profileId]/index.tsx:585 (handleWithdraw confirm UI, with useRestoreConsent undo) -> apps/api/src/inngest/functions/consent-revocation.ts:283 -> apps/api/src/services/deletion.ts:288 (deleteProfileIfConsentWithdrawn). Plus: apps/api/src/services/subscription.ts:47 maxProfiles is referenced ONLY by canAddProfile at apps/api/src/services/billing/family.ts:106 (gates ADD), with no usage/session/quota enforcement that locks existing over-cap profiles.
- **family-1** (family): An adult guardian (P4/P5) wants to stop mentoring / unlink a child they no longer need to supervise, without cancelling their whole subscription. — path found: apps/mobile/src/app/(app)/child/[profileId]/index.tsx:717-738 (Withdraw consent button) -> apps/mobile/src/hooks/use-consent.ts:195-239 (useRevokeConsent) -> apps/api/src/routes/consent.ts:523-565 (PUT /consent/:childProfileId/revoke) -> apps/api/src/services/consent.ts:1226-1283 (revokeConsent) + Inngest app/consent.revoked -> 7-day grace deletion. Entry point: apps/mobile/src/components/home/ParentHomeScreen.tsx:842-847 pushChildOverview.
- **family-6** (family): When a guardian removes a child from the family (the one path that exists), the departing learner's history should be portable — they keep their data, or the parent can hand it over. — path found: apps/api/src/services/export.ts:198-200 (+ apps/api/src/routes/account.ts:144-153)
- **consent-5** (consent): A consenting parent (or the minor) wants to re-grant consent after the 7-day grace window has lapsed but before the data was actually purged, OR a self-registered minor whose consent was denied wants to recover. — path found: apps/mobile/src/app/(app)/_components/ConsentPendingGate.tsx:114-184,338-398 (Resend + Change-email re-grant UI) -> apps/mobile/src/app/consent.tsx:174,201 (useRequestConsent) -> apps/api/src/routes/consent.ts:180-188,209-320 (self-service path) -> apps/api/src/services/consent.ts:484-536 (requestConsent setWhere only blocks CONSENTED/WITHDRAWN, so an expired PARENTAL_CONSENT_REQUESTED row mints a fresh 7-day token)
- **consent-6** (consent): A self-registered minor (P2) whose parent never clicks the consent email wants to know what happens / recover — i.e. the account should not silently rot, and the minor needs an escape. — path found: apps/mobile/src/lib/profile.ts:293-318 (vanished-profile → activeProfile=null) → apps/mobile/src/app/(app)/_layout.tsx:544-549 (!activeProfile → CreateProfileGate) → apps/mobile/src/app/(app)/_components/CreateProfileGate.tsx:45-93 ("Get started" re-onboard + sign out)
- **billing-1** (billing): A family-plan owner (P4/P5) cancels or lets the Family subscription lapse, expecting their linked children to keep their learning data and continue on a free tier in their own right. — path found: apps/api/src/services/billing/revenuecat-webhook-handler.ts:456-472 (handleExpiration) + apps/api/src/services/subscription.ts:185-186,229 (resolveEffectiveAccessTier)
- **billing-5** (billing): A non-owner child (P3) tapping 'Tell my parent' on the quota/subscription paywall wants confirmation that the parent will be / was reached, and to eventually regain access. — path found: apps/api/src/services/notifications.ts:522-571 (subscribe path: no_parent_link fallback + real push+email dispatch) | apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx:180-185 (askParent fallback alert) + 143-146,176-179 (sent confirmation) | apps/mobile/src/components/home/ParentHomeScreen.tsx (parent sees child-cap notification via useChildCapNotifications) | apps/mobile/src/app/(app)/_subscription/_view-models/subscription-derived-state.ts:79-86 (showPaywall auto-lifts when subscriptionStatus active / quota resets — child regains access with no manual step)
- **billing-6** (billing): A user on RevenueCat whose two store identities get merged (SUBSCRIBER_ALIAS) with an active paid subscription on the old identity expects their paid entitlement and top-up credits to carry over to the surviving identity. — path found: apps/mobile/src/app/(app)/subscription.tsx:1131 (restore-purchases-button) -> apps/mobile/src/hooks/use-revenuecat.ts:229-249 (useRestorePurchases -> Purchases.restorePurchases()) -> RevenueCat fires INITIAL_PURCHASE/RENEWAL for the surviving identity -> apps/api/src/routes/revenuecat-webhook.ts:320-325 (handleInitialPurchase/handleRenewal) -> subscription.tsx:247-260 polls subscription.$get until tier !== 'free'
- **onboard-5** (onboarding): An adult who taps 'I'm a parent' at the pre-auth welcome chooser but is then unable/unwilling to add a child immediately still wants to use the app for their own learning without being stranded on the add-child screen. — path found: apps/mobile/src/app/create-profile.tsx:174-176,545-551 (Cancel -> handleClose -> goBackOrReplace to /(app)/home); profile already created at create-profile.tsx:269-309 before the add-child push at 375-378; later re-entry via apps/mobile/src/components/home/LearnerScreen.tsx:145-149 (showFamilySetupCta) and apps/mobile/src/app/(app)/more/index.tsx:56-75 (handleAddChild)
- **learn-4** (learning): A learner deletes a book (or its topics) while a learning session that targets a topic in that book is still open/in-progress, then tries to continue or close that session. — path found: apps/mobile/src/app/(app)/session/index.tsx:642-687 (sessionExpired state from NotFoundError) | apps/mobile/src/app/(app)/session/_components/MessageActionsRenderer.tsx:82-90 (SessionExpiredActions escape pair) | apps/mobile/src/lib/api-client.ts:312-316 (404 -> NotFoundError) | packages/database/src/schema/sessions.ts:137-139 (topic_id onDelete cascade) | apps/api/src/routes/sessions.ts:311,324,338 (clean 404 Session not found)
- **practice-3** (activities): P5 (an adult who both mentors and studies) starts a tutoring session in study mode, switches to family/mentor mode to check on a child, then wants to find and resume the session they had going. — path found: apps/mobile/src/components/chrome/ModeSwitcher.tsx:49-80 (one-tap Study toggle, always-present shell chrome for the P5 "both" persona) restores the learner home where navigationProxy.active=false re-enables the coach-band resume; AND apps/mobile/src/app/(app)/progress/index.tsx:295-301 handleGlobalResume -> pushLearningResumeTarget(router, resumeTargetQuery.data), backed by useLearningResumeTarget() server query at apps/mobile/src/hooks/use-progress.ts:213-239 (progress/resume-target endpoint) — a resume path independent of the SecureStore recoveryMarker; AND apps/mobile/src/components/home/LearnerScreen.tsx:282-285 surfaces a "Continue {topic}" subject-card hint from the same server resumeTarget.
- **progress-2** (progress): Any new user (P1/P2 solo owner, or P4 parent) with a few days of real activity wants to see their first progress report now, instead of waiting for the scheduled run. — path found: apps/mobile/src/app/(app)/progress/_components/LatestReportCard.tsx:138-144 (explanatory empty-state copy) + apps/mobile/src/i18n/locales/en.json progress.latestReport.empty + apps/api/src/services/snapshot-aggregation.ts:784 (live weekly data via refreshProgressSnapshot) + apps/api/src/routes/snapshot-progress.ts:76-102 (POST /progress/refresh) + apps/mobile/src/app/(app)/progress/index.tsx:269-283 (on-mount live snapshot load)
- **progress-3** (progress): An adult who both mentors children AND studies themselves (P5), currently in family mode, wants to view their OWN progress / saved items / vocabulary from the Progress tab. — path found: apps/mobile/src/components/chrome/ModeSwitcher.tsx:49-115 (persistent "My Learning"/"Children" toolbar) rendered at apps/mobile/src/app/(app)/_layout.tsx:602; gated visible for family-capable adults via apps/mobile/src/lib/navigation-contract.ts:475-478,488; tapping "My Learning" calls switchMode('study') at apps/mobile/src/lib/use-mode-switch.ts:57-117 which flips effectiveAppContext so progressScope='self' (navigation-contract.ts:375) and canEnter('progress/saved')/('progress/vocabulary') return true (navigation-contract.ts:417-419), restoring the adult's own progress/saved/vocabulary.
- **progress-4** (progress): A guardian (P4) lands on the Recaps tab before any child session has been summarized and wants to get a recap to appear (i.e. prompt their child to do a session). — path found: apps/mobile/src/app/(app)/recaps/index.tsx:91 -> apps/mobile/src/components/home/LearnerScreen.tsx:492-493 -> apps/mobile/src/components/home/ParentHomeScreen.tsx:545-551 (Nudge action) + 530-537 (Learn together) -> apps/mobile/src/components/nudge/NudgeActionSheet.tsx:18-23,46-55 (quick_session template sent to childProfileId via useSendNudge)
- **notif-5** (notifications): As a parent who revokes consent for my child, I expect the child's device to stop receiving push notifications for that profile promptly (the consent withdrawal should cut off pushes, not just in-app nudges). — path found: apps/api/src/services/nudge.ts:96-100 (createNudge re-checks getConsentStatus(toProfileId) and throws ConsentRequiredError on WITHDRAWN before any sendPushNotification, so new nudge pushes to the withdrawn child are blocked) | apps/api/src/inngest/functions/recall-nudge.ts:106-124 + apps/api/src/inngest/functions/daily-reminder-scan.ts:66-78 (all scan-based cron push paths exclude WITHDRAWN profiles via CONSENTED EXISTS / NOT-EXISTS at fan-out time) | apps/api/src/inngest/functions/recall-nudge.ts:160-178 (scan and fan-out run intra-cron; sends fire seconds later, not a durable queue, so the 'already-enqueued nudge fires post-revoke' race is effectively absent) | apps/api/src/inngest/functions/consent-revocation.ts:251-276 (the only intentional child-bound push is the day-7 'account is being deleted' deletion notice, gated by isConsentRevocationGenerationCurrent — a legally-required transactional message, not a stray nudge)
- **notif-6** (notifications): As a newly registered learner (solo adult or minor) who wants study reminders, I expect daily/review reminders to be available to opt into without a hidden dependency I can't satisfy. — path found: apps/api/src/inngest/functions/review-due-scan.ts:64-95 + apps/api/src/inngest/functions/daily-reminder-scan.ts:47-57 (scans INNER JOIN retentionCards/streaks, which only exist after a completed session) ; apps/mobile/src/app/session-summary/[sessionId].tsx:173-177 + apps/mobile/src/hooks/use-post-session-notification-ask.ts:33-118 (JIT permission primer fires once totalSessionCount>=1) ; apps/mobile/src/app/(app)/_layout.tsx:263 + apps/mobile/src/hooks/use-push-token-registration.ts:70-170 (token auto-registers on every foreground once permission granted)
