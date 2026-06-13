# Onboarding, consent & auth — Functional Atlas

> Domain: the entire first-run journey — app entry probe → pre-auth welcome → sign-up/in/reset → SSO → in-app gates (save-wizard, create-profile, consent-pending, consent-withdrawn, post-approval) → create-profile → onboarding micro-steps (pronouns, language-setup) → parental-consent request/respond. Plus the backend that records consent, creates profiles, and erases identity.
>
> Read-only atlas. Every claim is cited to `file:line`. Branch `new-llm`.

---

## Screens (route -> purpose)

### Entry & pre-auth (the "front door")

| Route | File | Purpose | Gating |
|---|---|---|---|
| `/` (index) | `apps/mobile/src/app/index.tsx:24` | First-open probe. Decides `welcome` (first open, intro unseen) vs `sign-in` (returning, or preview-state present). Signed-in → `Redirect /(app)/home` (`index.tsx:176`). Fails open to `/(auth)/sign-in` on any SecureStore error (`index.tsx:95,105,122`). 15s Clerk-load timeout w/ retry (`index.tsx:40`). | none (pre-auth) |
| `/(auth)/welcome` | `apps/mobile/src/app/(auth)/welcome.tsx:55` | 3-step mini state machine: **choose** (learner vs parent audience) → **cards** (`WelcomeIntro` deck) → **bridge** (Create account / I have an account). Audience is **storytelling only** — does NOT fork the account model (`welcome.tsx:18-29`). Persists audience via `markPreAuthAudienceSync` (`welcome.tsx:73`). Marks intro-seen on either bridge CTA (`welcome.tsx:92,98`). | none |
| `/(auth)/sign-up` | `apps/mobile/src/app/(auth)/sign-up.tsx:36` | Email+password create → Clerk email-code verify. Google (non-iOS) / Apple (iOS) / OpenAI SSO. CAPTCHA mount point (`sign-up.tsx:632`). Terms/Privacy links (`sign-up.tsx:666,675`). Session-activation retry on `setActive` failure (`sign-up.tsx:106`). | signed-out only (`(auth)/_layout.tsx:93`) |
| `/(auth)/sign-in` | `apps/mobile/src/app/(auth)/sign-in.tsx:215` | Password sign-in + 1st/2nd-factor verification (email_code / totp / phone_code / backup_code) (`sign-in.tsx:66-88`). SSO. "Welcome back" vs first-time copy via `hasSignedInBefore` SecureStore key (`sign-in.tsx:64,301`). Forced-signout banners (expired/revoked) (`sign-in.tsx:404`). Unknown-email → redirect to sign-up prefilled (`sign-in.tsx:855`). "Try MentoMate" preview CTA behind 2 flags (`sign-in.tsx:1521`). | signed-out only |
| `/(auth)/forgot-password` | `apps/mobile/src/app/(auth)/forgot-password.tsx:71` | Reset-code email → enter code + new password → `setActive`. 20s per-call timeout (`forgot-password.tsx:36,49`). `setActive`-failed retry preserves session id (`forgot-password.tsx:201`). | signed-out only |
| `/sso-callback` | `apps/mobile/src/app/sso-callback.tsx:21` | OAuth redirect landing. `maybeCompleteAuthSession()` closes browser. 10s timeout → "Back to sign in" escape (`sso-callback.tsx:56,76`). | none |

### Pre-auth PREVIEW flow (DORMANT — entry CTA flag OFF)

Engine alive (`PREVIEW_ONBOARDING_ENABLED: true`) but entry hidden (`PREVIEW_ENTRY_CTA_ENABLED: false`) — `apps/mobile/src/lib/feature-flags.ts:18,28`. Reachable only via the gated sign-in CTA (`sign-in.tsx:1528 → /preview`) or dev seed (`dev-only/seed-preview-state.tsx`).

| Route | File | Purpose |
|---|---|---|
| `/preview` | `apps/mobile/src/app/preview/index.tsx:35` | Preview entry → `/preview/intent` |
| `/preview/intent` | `preview/intent.tsx:74,84,96,105` | Self / child / both intent picker → topic or value-prop or both |
| `/preview/topic` | `preview/topic.tsx` | Capture a topic to try |
| `/preview/value-prop` | `preview/value-prop.tsx` | Value-prop screen |
| `/preview/both` | `preview/both.tsx:70,82` | Both-priority (self_first / child_first) |

Preview state is persisted to SecureStore (`lib/preview-onboarding-state.ts`, 1h TTL) and consumed **post-auth** by the SaveWizardGate.

### In-app gates (inline components, NOT routes) — `(app)/_layout.tsx` renders one of these instead of the Tabs

Gate ordering is explicit and load-bearing (`apps/mobile/src/app/(app)/_layout.tsx:499-512`):

| Order | Gate | File | Shown when |
|---|---|---|---|
| 1 | auth spinner | `_layout.tsx:360` | `!isLoaded` |
| 2 | Redirect → sign-in | `_layout.tsx:366-375` | `!isSignedIn` (re-encodes `redirectTo`) |
| 3 | auth-redirect-replay spinner | `_layout.tsx:377` | pending OAuth-return redirect; 15s timeout → ErrorFallback |
| 4 | profile-loading spinner | `_layout.tsx:409` | `isProfileLoading`; 20s timeout → ErrorFallback w/ sign-out |
| 5 | profile-load-error fallback | `_layout.tsx:452` | profile query failed (does NOT fall through to create-profile) |
| 6 | preview-state-loading spinner | `_layout.tsx:513` | preview probe `loading` |
| 7 | **SaveWizardGate** | `(app)/_components/save-wizard/SaveWizardGate.tsx:33` | preview-state present & wizard not done |
| 8 | **CreateProfileGate** | `(app)/_components/CreateProfileGate.tsx:18` | `!activeProfile` |
| 9 | **ConsentPendingGate** | `(app)/_components/ConsentPendingGate.tsx:35` | `consentStatus ∈ {PENDING, PARENTAL_CONSENT_REQUESTED}` (`_layout.tsx:556`, set in `_lib/consent-gate-helpers.ts:4`) |
| 10 | **ConsentWithdrawnGate** | `(app)/_components/ConsentWithdrawnGate.tsx:23` | `consentStatus === 'WITHDRAWN'` (`_layout.tsx:568`) |
| 11 | **PostApprovalLanding** | `(app)/_components/PostApprovalLanding.tsx:6` | once after parent approves; gated `role === 'child'` (`_layout.tsx:258`) |
| 12 | Tabs | `_layout.tsx:612` | all gates cleared |

### Profile-creation & consent routes (live at `app/` root, OUTSIDE the `(app)` group)

| Route | File | Purpose | Gating |
|---|---|---|---|
| `/create-profile` | `apps/mobile/src/app/create-profile.tsx:87` | Display name + birth date (full date; native date picker / web text). First-profile OR parent-adds-child (`?for=child`). Self → consent flow or solo; parent-adult+`audience=parent` → set family context + chain to add-child (`create-profile.tsx:370`). | auth + owner-role (`create-profile.tsx:474,481,496`); blocks non-owner/proxy |
| `/consent` | `apps/mobile/src/app/consent.tsx:42` | 3-phase (child → parent → success) parental-email request form. Hands off to parent in-person. Validates parentEmail ≠ child email (sub-addressing-aware, `consent.tsx:133-142`). Validates profileId belongs to account (`consent.tsx:157`). | auth (`consent.tsx:226`); profile-ownership (`consent.tsx:232`) |
| `/ready` | `apps/mobile/src/app/ready.tsx:44` | Celebratory "your tutor is ready" staggered-checkmark screen → `/(app)/session`. | active profile assumed |
| `/(app)/onboarding/index` | `(app)/onboarding/index.tsx:5` | `ExplainedRedirect` → `/(app)/onboarding/pronouns` | active profile |
| `/(app)/onboarding/pronouns` | `(app)/onboarding/pronouns.tsx:35` | Pronouns picker (she/he/they/Other-freetext). **Self-skips silently when age < 13** (`PRONOUNS_PROMPT_MIN_AGE`, `pronouns.tsx:71,148`). On continue → `startFirstCurriculumSession` → `/(app)/session` (`pronouns.tsx:124`). | active profile; age-gated 13+ |
| `/(app)/onboarding/language-setup` | `(app)/onboarding/language-setup.tsx:93` | Language-subject calibration: native language (14 options + Other) + CEFR starting level (A1–B2). Configures subject → first session. | active profile; `isParentProxy` read-only (`language-setup.tsx:144,372`) |

---

## Capabilities (user task -> backend process file:line)

### Authentication (all via Clerk SDK, no app-API backend)

| User task | Client call | Backend |
|---|---|---|
| Create account (email) | `signUp.create` + `prepareEmailAddressVerification` (`sign-up.tsx:256,262`) | Clerk |
| Verify email code | `signUp.attemptEmailAddressVerification` → `setActive` (`sign-up.tsx:288,292`) | Clerk |
| Sign in (password) | `signIn.create({strategy:'password'})` (`sign-in.tsx:829`) | Clerk |
| 2FA / MFA | `prepare/attemptFirstFactor` / `SecondFactor` (`sign-in.tsx:499,919,925`) | Clerk |
| SSO (Google/Apple/OpenAI) | `startSSOFlow` (`sign-in.tsx:673`, `sign-up.tsx:141`) | Clerk + `/sso-callback` |
| Reset password | `signIn.create({strategy:'reset_password_email_code'})` (`forgot-password.tsx:110`) | Clerk |
| Verified-email resolution (server) | — | `services/clerk-user.ts:115 resolveVerifiedClerkEmail` (JWT → Clerk API → 5min cache) |
| Identity erasure on account delete | — | `services/clerk-user.ts:224 deleteClerkUser` (DELETE /v1/users; called by deletion Inngest after DB cascade) |

### Profile creation

| User task | Client → API | Service (file:line) |
|---|---|---|
| Create first/solo profile | `client.profiles.$post` (`create-profile.tsx:269`) | `POST /profiles` (`routes/profiles.ts:58`) → `assertProfileCreationAllowed` (`profiles.ts:68`) → `createProfileWithLimitCheck` (`services/profile.ts:430`) → `createProfile` (`services/profile.ts:334`) |
| Parent adds child | same `$post`, server auto-classifies non-first POST as child (`save-wizard/ProfileBasicsStep.tsx:150`; `create-profile.tsx:331`) | `createProfile` w/ `parentProfileId` → `familyLinks` insert (`profile.ts:386`) + **consent GRANTED inline** (`profile.ts:400 createGrantedConsentState`) |
| Age floor enforcement | — | `checkConsentRequiredFromDate` (`services/consent.ts:235`); `< MINIMUM_AGE(11)` → `ProfileValidationError CHILD_AGE_VIOLATION` (`profile.ts:353`) |
| Consent determination at create | — | `services/consent.ts:268 checkConsentRequired`: `<11` reject; `≤16` GDPR required; `17+` none (`consent.ts:275-283`) |
| Profile-limit / upgrade gate | 402 `PROFILE_LIMIT_EXCEEDED` (`routes/profiles.ts:82`) | tier check inside `createProfileWithLimitCheck`; client surfaces upgrade CTA (`create-profile.tsx:404`) |
| Adult-owner gate (parent must be 18+) | client gate `ProfileBasicsStep.tsx:79` (flag `ADULT_OWNER_GATE_ENABLED`) | server `createProfileWithLimitCheck({adultOwnerGateEnabled})` (`routes/profiles.ts:72`) — note server's `createProfile` itself only enforces 11+ (`ProfileBasicsStep.tsx:67-71`) |

### Parental consent (GDPR/COPPA)

| User task | Client → API | Service (file:line) |
|---|---|---|
| Request consent (send to parent) | `useRequestConsent` → `POST /consent/request` (`consent.tsx:174`; `routes/consent.ts:210`) | `requestConsent` (`services/consent.ts:425`) — sends email, sets `PARENTAL_CONSENT_REQUESTED`; authz via `assertCanRequestConsentForChild` (`routes/consent.ts:173`) |
| Plain resend (no email on wire) | `useResendConsent` → `POST /consent/resend` (`ConsentPendingGate.tsx:122`; `routes/consent.ts:326`) | `resendConsent` (`services/consent.ts:647`); separate cap (WI-374) |
| Change recipient email | `useRequestConsent` w/ new email (`ConsentPendingGate.tsx:159`) | `requestConsent` recipient-change path; `ConsentRecipientChangeLimitError → 429` (`routes/consent.ts:282`) |
| Parent approves/denies (emailed link) | `GET /consent-page` → `POST /consent-page/confirm` (`routes/consent-web.ts:154,280`) **unauthenticated**; OR app `POST /consent/respond` (`routes/consent.ts:407`) | `processConsentResponse` (`services/consent.ts:817`): approve → `CONSENTED`; **deny → cascade-delete profile in txn** (`consent.ts:898`). Strict `'true'/'false'` guard prevents accidental deletion (`consent-web.ts:305`) |
| Poll consent status (child) | `useConsentStatus` → `GET /consent/my-status` (`routes/consent.ts:460`) | `getProfileConsentState` (`consent.ts:1163`); email masked (`consent.ts:141`). Auto-refresh every 15s while waiting (`ConsentPendingGate.tsx:106`) |
| Read child consent (parent) | `GET /consent/:childProfileId/status` (`routes/consent.ts:485`) | `getChildConsentForParent` (`consent.ts:1191`); owner-only (`routes/consent.ts:491`) |
| Revoke consent (parent) | `PUT /consent/:childProfileId/revoke` (`routes/consent.ts:523`) | `revokeConsent` (`consent.ts:1226`) → `WITHDRAWN` + 7-day deletion grace; `app/consent.revoked` Inngest (`routes/consent.ts:535`) |
| Restore consent (within grace) | `PUT /consent/:childProfileId/restore` (`routes/consent.ts:567`) | `restoreConsent` (`consent.ts:1289`); `ConsentGracePeriodExpiredError → 410` (`routes/consent.ts:593`) |
| Re-check after withdraw (child) | invalidate `consent-status`/`profiles` queries (`ConsentWithdrawnGate.tsx:50`) | re-reads `my-status` |

### Onboarding micro-dimensions (PATCH endpoints, all in `routes/onboarding.ts`)

| User task | Client → API | Service (file:line) |
|---|---|---|
| Set pronouns (self) | `useUpdatePronouns` → `PATCH /onboarding/pronouns` (`pronouns.tsx:107,204`; `routes/onboarding.ts:114`) | `updatePronouns` (`services/onboarding/index.ts:114`); server age-gate `assertPronounsSelfEditAllowed` (`onboarding.ts:133`, service `index.ts:70`), `assertNotProxyMode` (`onboarding.ts:137`) |
| Set pronouns (parent for child) | `PATCH /onboarding/:profileId/pronouns` (`routes/onboarding.ts:150`) | owner+parent-link via `assertOwnerAndParentAccess` (`onboarding.ts:160`) |
| Set conversation language | `PATCH /onboarding/language` (`routes/onboarding.ts:54`) | `updateConversationLanguage`; **owner-gated** (`onboarding.ts:64`) — child can't change tutor language |
| Set interests context | `PATCH /onboarding/interests/context` (`routes/onboarding.ts:174`) | `updateInterestsContext`; `assertNotProxyMode` (`onboarding.ts:187`) |
| Configure language subject (calibration) | `useConfigureLanguageSubject` (`language-setup.tsx:155`) | subjects service (out-of-domain) |
| Start first curriculum session | `useStartFirstCurriculumSession` (`pronouns.tsx:124`, `language-setup.tsx:168`) | sessions service (out-of-domain) |

### Save-wizard (post-auth consumption of preview state)

| Step | File | Action → backend |
|---|---|---|
| Step 1: choose save target (self/child/both) | `SaveWizardGate.tsx:147` | client-only |
| Step 2: profile basics (owner + optional child) | `ProfileBasicsStep.tsx:92 submit` | 1–2× `client.profiles.$post` (`ProfileBasicsStep.tsx:119,153`); HIGH-4 resume guard via `createdOwnerProfileId` (`ProfileBasicsStep.tsx:102,135`); client adult-gate (`ProfileBasicsStep.tsx:79`) |
| Step 3: confirm + land | `ConfirmStep.tsx:49 onLand` | `switchProfile` → `/(app)/session` (self) or `/(app)/home` (child); `clearPreviewState` (`ConfirmStep.tsx:59`) |

### Background processes (Inngest) touching this domain

| Function | File | Trigger |
|---|---|---|
| Consent reminder cadence | `apps/api/src/inngest/functions/consent-reminders.ts:20` | `app/consent.requested` — sends day-7/14 reminders w/ refreshed token (`services/consent.ts:927`); `deleteProfileIfNoConsent` after window |
| Consent revocation handler | `inngest/functions/consent-revocation.ts` | `app/consent.revoked` |
| Account deletion (+ Clerk erasure) | `inngest/functions/account-deletion.ts` | scheduled delete → `deleteClerkUser` |
| Archive cleanup | `inngest/functions/archive-cleanup.ts` | hard-deletes after grace period |

---

## Navigation depth map

Two distinct first-run paths. Depth = taps from cold app open.

### Path A — fresh sign-up (the production default)

```
0  / (probe)
1  /(auth)/welcome  [choose]
2     [cards] deck (multi-card; N taps internal)
3     [bridge] → Create account
4  /(auth)/sign-up  (email + password)
5     verify email code
6  → (app) gate: CreateProfileGate
7  /create-profile  (name + birth date)
8a SOLO ADULT (17+, no consent) → /(app)/home (tabs)         depth 8
8b SOLO MINOR (≤16) → ConsentPendingGate → /consent          depth 8–9
        → child phase → parent phase → success → wait/poll
9  parent clicks emailed link → /consent-page → confirm      (parent's device)
10 child re-enters → PostApprovalLanding → tabs
```

The language/pronouns onboarding micro-steps are **not** on the cold-start spine — they are reached only when a learner **creates a subject** (`create-subject.tsx:366 → /(app)/onboarding/language-setup`) or via the `onboarding/index` redirect chain. Pronouns is `step 2 of 4` per the step-indicator (`pronouns.tsx:54-55`).

### Depth flags (>2 levels deep from a tab root)

- **Consent send-to-parent**: tab-root → ConsentPendingGate → tap "Send to parent" → `/consent` modal → child phase → parent phase → success. That's a **3-phase modal on top of a full-screen gate** (`consent.tsx:39 Phase`). Deeply buried for a legally-mandatory step.
- **Change recipient email** is a 4th nested state inside ConsentPendingGate's "waiting" view (`ConsentPendingGate.tsx:400`) — an inline form revealed by a button, below the resend button, below the check-again button.
- **Preview "while you wait"** sub-screens (`PreviewSubjectBrowser`, `PreviewSampleCoaching`) replace the gate entirely (`ConsentPendingGate.tsx:187-191`) — a modal-on-gate-on-tab.
- **Language calibration** (native-language + CEFR level) sits behind subject-creation, itself behind a tab — effectively 3+ deep, and the pronouns step is sequenced before it via the onboarding stack.

### Pre-auth depth

Welcome alone is a **3-state machine** (choose/cards/bridge, `welcome.tsx:32`) with an internal multi-card deck — before the user has even reached the sign-up form. That's ~4–6 taps of brand storytelling in front of the auth wall, all of which (per the file's own comment, `welcome.tsx:21-24`) is "storytelling only" and does not change the account model.

---

## Backend processes & data model

### Tables / state

- **`profiles`** — `isOwner`, `birthYear`, `displayName`, `conversationLanguage`, `pronouns`. First profile per account = owner (`profile.ts:324,369`). `birthMonth`/`birthDay` are **NOT persisted** — used only for precise age at create time (`profile.ts:344-345`).
- **`consent_states`** — `profileId` + `consentType('GDPR')` unique; `status ∈ {PENDING, PARENTAL_CONSENT_REQUESTED, CONSENTED, WITHDRAWN}`; `parentEmail`, `consentToken` (122-bit UUID), `expiresAt` (7-day), audit `policyVersion/requestIp/userAgent` (`consent.ts:293,866`).
- **`family_links`** — `parentProfileId → childProfileId`; created for **every** parent-adds-child regardless of consent need (`profile.ts:386`).

### Key decision functions

- **Consent-required logic** (`services/consent.ts:268,235`): GDPR-everywhere model (location not a factor). `<11` reject; `≤16` GDPR required; `17+` none. `MINIMUM_AGE = 11` (`consent.ts:197`).
- **Inline grant vs pending** (`profile.ts:398-416`): parent-creates-child → `createGrantedConsentState` (parent is the consenting adult); child-self-registers → `createPendingConsentState`.
- **Deny = destructive** (`consent.ts:893-902`): denial cascade-deletes the profile inside a transaction. Two data-loss guards: strict `'true'/'false'` enum on the web form (`consent-web.ts:305`) and atomic `NOT IN ('CONSENTED','WITHDRAWN')` WHERE (`consent.ts:880`).

### Authorization model

- Profile-creation: `assertProfileCreationAllowed` enforces `isOwner === true` (`profile.ts:215-221`); route maps `ForbiddenError → 403` (`routes/profiles.ts:77`).
- Consent request/resend: `assertCanRequestConsentForChild` — self (own profile) OR owner-with-parent-link; rejects non-owner sibling targeting another profile (`routes/consent.ts:173-189`).
- Consent read/revoke/restore: `assertOwnerProfile` owner-only (`routes/consent.ts:491,529,573`).
- `/consent/respond` + `/consent-page/confirm`: **unauthenticated** (parent has no session) — protected by 122-bit token, single-use, per-IP rate limit 30/hr (`routes/consent.ts:76-77`, shared with consent-web).
- Onboarding PATCHes: owner-gate for language; age-gate + proxy-guard for pronouns; proxy-guard for interests.

### Identity erasure (GDPR Art 17)

`deleteClerkUser` (`clerk-user.ts:224`) deletes the Clerk login identity AFTER the DB cascade, idempotent on 404, throws (Inngest retries) otherwise — closes the "deleted account, live login" gap.

---

## Complexity signals & redesign notes

The one-screen redesign target should weigh these — this domain is the heaviest "buried-state" surface in the app.

1. **Twelve sequential gate states** in `(app)/_layout.tsx` (`_layout.tsx:499-512`), six of them async-probe-dependent. The ordering is explicitly load-bearing and brittle (CRITICAL-A2/A3 comments). A user can land on any of: save-wizard, create-profile, consent-pending(2 sub-shapes), consent-withdrawn, post-approval — each a full-screen takeover, none reachable by intent.

2. **Three parallel "first profile" entry mechanisms** that overlap heavily:
   - `/create-profile` route (`create-profile.tsx`) — the canonical path.
   - `SaveWizardGate` Step-2 `ProfileBasicsStep` (`ProfileBasicsStep.tsx`) — a **second, independent** profile-creation UI (its own name/birth-year fields, its own adult-gate, its own `profiles.$post` calls). Duplicates create-profile's logic with different validation (birth **year** only vs full **date**).
   - The two diverge: create-profile uses a date picker + full-date age check (`create-profile.tsx:261`); the wizard uses a 4-digit year string (`ProfileBasicsStep.tsx:62`). **Redundant feature, two code paths, two validation rules.**

3. **Consent surface is a modal-on-gate-on-tab with 4 inline sub-states.** ConsentPendingGate alone renders: no-email-sent view, email-sent waiting view, resend feedback, change-email inline form, and two preview sub-screens that *replace* the gate (`ConsentPendingGate.tsx:187,195,291,400,488`). The `/consent` route adds a separate 3-phase (child/parent/success) animated flow (`consent.tsx:39`). A parent-in-person handoff, an email request, a resend, and a recipient change are four different micro-flows for one job.

4. **Pre-auth is a state machine in front of a state machine.** `/index` probe → `/welcome` 3-step (choose/cards/bridge) → auth screen which itself has verify/2FA/reset/SSO sub-states. The welcome audience pick is admittedly cosmetic (`welcome.tsx:18`) yet it persists a SecureStore value (`preAuthAudience.v1`) that later silently steers create-profile into the add-child chain (`create-profile.tsx:209,370`) — an invisible coupling a user would never predict.

5. **A whole dormant preview onboarding flow** (`/preview/*`, 5 screens + state lib + SaveWizard consumer) is shipped but gated off (`PREVIEW_ENTRY_CTA_ENABLED:false`). It's a complete parallel onboarding the user can't reach — dead weight for a redesign to either revive or delete.

6. **Pronouns step self-erases for under-13** (`pronouns.tsx:148`) and language-setup is **read-only in proxy mode** (`language-setup.tsx:144`) — age- and mode-conditional onboarding steps that a single static screen can't represent without branching.

7. **`/ready` is a pure interstitial** — a staggered-checkmark celebration with no input (`ready.tsx:44`), one more tap between profile setup and the first session.

8. **Error/timeout recovery is everywhere and bespoke.** index 15s, sign-in transition 2-phase + 15s, profile-load 20s, auth-redirect 15s, create-profile 30s, forgot-password 20s, sso-callback 10s — seven different hand-rolled timeout+fallback patterns across the domain (`index.tsx:40`, `sign-in.tsx:319,327`, `_layout.tsx:181,192`, `create-profile.tsx:147`, `forgot-password.tsx:36`, `sso-callback.tsx:56`).

---

## Overlaps with other domains

- **Profile switching** (`switchProfile`) is invoked from: ConsentPendingGate, ConsentWithdrawnGate (`consent-gate-helpers.ts:43`), create-profile (`create-profile.tsx:387`), ConfirmStep (`ConfirmStep.tsx:53`), and the ProxyBanner switch-back (`_layout.tsx:599`). The same primitive is reached from ≥5 entry points across onboarding + chrome + a likely **Profiles/More** domain.
- **Subject creation** is the *real* trigger for the language-setup/pronouns onboarding steps (`create-subject.tsx:366`) — onboarding micro-steps belong half to this domain, half to the **Library/Subjects** domain.
- **Session start** — both pronouns and language-setup terminate by calling `startFirstCurriculumSession` → `/(app)/session` (`pronouns.tsx:124`, `language-setup.tsx:168`, `ConfirmStep.tsx:71`, `ready.tsx:95`). The first-session handoff is shared with the **Session/Learning** domain.
- **Subscription/billing** — create-profile's `PROFILE_LIMIT_EXCEEDED` 402 routes to `/(app)/subscription` (`create-profile.tsx:424`); the adult-owner & profile-limit gates couple onboarding to the **Billing** domain.
- **Account deletion / privacy** — consent withdrawal and the Clerk-erasure path share machinery with the **Account/Privacy** domain (`account.ts` delete routes, `clerk-user.ts:224`, `archive-cleanup`). Terms/Privacy links from sign-up (`sign-up.tsx:666,675`) point at `/terms`,`/privacy` root routes.
- **Navigation contract / proxy mode** — `isParentProxy` gates create-profile (`create-profile.tsx:498`) and language-setup (`language-setup.tsx:144`); the ProxyBanner + ModeSwitcher chrome wraps every gate (`_layout.tsx:596,602`). Shared with the **Nav/Profile-shape** domain.
- **Mentor language sync** — `useMentorLanguageSync` (`_layout.tsx:156`) clamps UI language into `conversation_language`, overlapping the onboarding `PATCH /onboarding/language` capability (two write paths to the same column).
