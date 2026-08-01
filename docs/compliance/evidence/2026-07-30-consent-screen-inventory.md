# Consent and Preference-Collection Screen Inventory — MentoMate mobile

**Draft v0.1 · agent-drafted · 2026-07-30 · describes the app AS BUILT**

**Controller:** ZWIZZLY AS, org.nr 811696072, Oslo, Norway.
**Feeds:** DPO action-register row 4, gap item *"consent-screen inventory"*
([`DPO exchanges/2026-07-26-action-register-tracker.md:24`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)).
**Companion:** [`2026-07-30-purpose-basis-recipient-retention-matrix.md`](2026-07-30-purpose-basis-recipient-retention-matrix.md) ·
[`2026-07-30-consent-log-spec.md`](2026-07-30-consent-log-spec.md) ·
[`2026-07-30-legitimate-interest-assessments.md`](2026-07-30-legitimate-interest-assessments.md)

**Scope:** every surface in `apps/mobile/src` that collects a consent, an agreement, or a declared
preference. Purpose lanes (P1, P2, P2b, P3, P4, O1–O14) are defined in the matrix document.

> **The question this document was written to answer is in §7.** Readers short of time should go there
> first; the rest is the evidence behind it.

---

## 1. Sign-up and first-run sequence, in order

| # | Surface | File | Collects | Lane | Consent or preference? | Key copy |
|---|---|---|---|---|---|---|
| 1 | Welcome | `apps/mobile/src/app/(auth)/welcome.tsx` | Nothing | — | — | — |
| 2 | Sign-up | `apps/mobile/src/app/(auth)/sign-up.tsx` | Email + password, **or** SSO via Google / Apple / OpenAI (`:638,651,664`); email verification code (`:471`) | **O1** account | Neither — account creation | `auth.signUp.*` |
| 3 | Create profile | `apps/mobile/src/app/(app)/create-profile.tsx` | Display name; **exact date of birth** (`:133-134`, native picker `:197`, web text `:204-207`) | **O3** age assurance | Neither — mandatory field | `createProfile.birthDateLabel` / `.parentBirthDateLabel` / `.childBirthDateLabel` (`:243-247`), hints `:248-254` |
| 4 | **Adult self-consent gate** | `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx` | Acceptance of **`platform_use`** and **`llm_disclosure`** | **P1 / P2 / O4** | **CONSENT** — the only explicit consent moment in the adult flow | `tabs.adultSelfConsent.title` (`:97`), `.intro` (`:100`), `.platformUseHeading`/`.platformUseBody` (`:105-108`), `.llmDisclosureHeading`/`.llmDisclosureBody` (`:114-117`), `.accept` (`:174`) |
| 5 | Child → parent consent request | `apps/mobile/src/app/consent.tsx` | Parent's email address; sends the consent request. Three phases: `child`, `parent`, `success` (`:39`) | **O4** | **CONSENT REQUEST** — initiates the Art 8 parental grant, which is completed out-of-app by email | `lib/consent-copy.ts` → `getConsentRequestCopy`, `getConsentHandOffCopy` (`:24-27`) |
| 6 | Language setup | `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` | Native language (`:332-376`), current level (`:385-411`) | **P2b** declared preference | Preference | `onboarding.languageSetup.nativeLanguageLabel`, `.currentLevelLabel` |
| 7 | Pronouns | `apps/mobile/src/app/(app)/onboarding/pronouns.tsx` | Pronouns | **P2b** | Preference | `onboarding.pronouns.*` |

Onboarding completion is instrumented at `pronouns.tsx:129` (`reportActivationEvent('onboarding_completed')`).

### 1.1 Two findings from this sequence

**S-1 — The adult consent gate presents two purposes but collects them with one button.** The screen
displays `platform_use` and `llm_disclosure` under separate headings with separate bodies
(`AdultSelfConsentGate.tsx:105-117`), and the backend stores them as independently-withdrawable rows. But
there is a **single Accept control** (`:165-174`) — no per-purpose checkbox. Storage is granular; collection
is bundled. Whether that satisfies Art 7(2)'s requirement that a request covering several matters be
"clearly distinguishable" and Art 4(11)'s "specific" limb is a DPO judgement, but the DPO should know the
two are collected together and can only be separated afterwards, through
`PUT /consent/self/withdraw`. The separate headings are a real mitigating factor, not a cosmetic one.

**S-2 — Habitual residence is never collected anywhere in the mobile app.** Two exhaustive searches across
`apps/mobile/src` (all `.ts`/`.tsx`, tests excluded) for `residenceJurisdiction`, `habitualResidence`,
`countryOfResidence`, and `residence_jurisdiction` returned **zero matches**; a targeted search of
`create-profile.tsx` for `country`/`jurisdiction`/`residence` also returned zero.

This matters because three compliance artifacts depend on it:
- [`privacy-policy.html:25`](../privacy-policy.html) tells users that "declared country of habitual
  residence" is collected **during registration**. On the current build, it is not.
- `person.residence_jurisdiction` is `NOT NULL` (`packages/database/src/schema/identity.ts:86`), so a value
  is being written from somewhere other than a user-facing field.
- The ROPA and the 13+ EEA launch-country ruling both depend on habitual residence to select the national
  self-consent threshold, and France's joint-consent rule at 13–14 cannot be applied without it.

This is consistent with DPIA risk **6.9**, which records the current path as "coarse `EU | US | ROW` /
location-blind" and requires it to be replaced with EEA-country habitual-residence capture before launch
([`dpia.md:86`](../dpia.md)) — so this is a **known** gap, not a new discovery. What this inventory adds is
that the **privacy policy already describes the fixed behaviour as though it were live**, which is a
transparency inaccuracy that must not be published in its current form.
**[OPEN — needs input: what currently populates `person.residence_jurisdiction`? It is server-side; not traced this pass.]**

---

## 2. Consent gates encountered after sign-up

Three gate components exist for interrupting the app when consent is absent or withdrawn — but only two
are live.

| Component | File | Role | Mounted? |
|---|---|---|---|
| `AdultSelfConsentGate` | `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx` | Designed to block an adult with no `art6_1_a` grant until they accept | **NO — not mounted anywhere.** The only references in `apps/mobile/src` are the component itself, its test, and its hook (`use-adult-self-consent.ts`); `(app)/_layout.tsx` does not import it. The component's own doc comment (`AdultSelfConsentGate.tsx:31-33`) states mounting on the bootstrap's `needsAdultConsent` signal is **WI-2411**'s responsibility. Until that lands, no adult user is ever shown this screen — the only explicit adult consent moment in the app is dead code, and any compliance claim citing it as a live surface is inaccurate. (Adults who consent at signup via `recordAdultSelfConsentV2` are unaffected; the gap bites the repair/re-acceptance path the gate was built for.) |
| `ConsentPendingGate` | `apps/mobile/src/app/(app)/_components/ConsentPendingGate.tsx` | Blocks a minor whose parental consent has been requested but not yet granted | Yes — `(app)/_layout.tsx` |
| `ConsentWithdrawnGate` | `apps/mobile/src/app/(app)/_components/ConsentWithdrawnGate.tsx` | Blocks a learner whose consent has been withdrawn | Yes — `(app)/_layout.tsx` |

The gate pattern is the right one: consent is not a checkbox the user passes once and forgets, it is a state
the app re-evaluates and enforces at the UI boundary as well as the API boundary. But the adult gate is not
yet part of that enforcement — **[OPEN — needs input: WI-2411 status; engineering must confirm whether the
adult self-consent gate is intentionally unmounted pending that WI, and no compliance document may cite it
as a live control until it is wired.]**

---

## 3. Declared preferences — where collected and where changed

| Preference | Storage | Collected at | Editable later |
|---|---|---|---|
| Conversation language | `person.conversation_language` (`identity.ts:112`, CHECK-constrained to 10 values `:148`) | Derived from UI language via `useMentorLanguageSync`, clamped through `conversationLanguageSchema.safeParse` before the profile is patched | Follows the UI language setting |
| Pronouns | `person.pronouns` (`identity.ts:113`, ≤32 chars `:150-153`) | Onboarding step 7 | **None found.** A sweep of every non-test `.tsx` under `apps/mobile/src` for `pronouns` matched only `onboarding/pronouns.tsx` (62 hits), two router `_layout.tsx` registrations, one `index.tsx`, and a test utility. **A user cannot change their pronouns after onboarding** — an Art 16 rectification friction on a field that is, for some people, identity-critical. Note the shape of the gap: `pronouns.tsx` *does* support a `returnTo=settings` re-entry mode (`:122-125`, `:277` — skips the step indicator and routes back to `/(app)/more` on save), but **no settings screen links to it**. The edit path exists in code and is unreachable — the same dead-code pattern as the unmounted `AdultSelfConsentGate` in §2. |
| Interests | `learning_profiles.interests` (`learning-profiles.ts:26`) | Onboarding / conversation | **Mentor-memory screen** — `session.mentorMemory.sections.interests`, with a school / free-time / both context chooser (`session.mentorMemory.interestContext.*`) |
| Native language, current level | `teaching_preferences.native_language` (`assessments.ts:240`) | Onboarding step 6 | Language setup |
| Analogy domain | `teaching_preferences.analogy_domain` (`assessments.ts:239`) | **Per-subject settings screen** — `apps/mobile/src/app/(app)/subject/[subjectId].tsx:115-116` renders `AnalogyDomainPicker` (`apps/mobile/src/components/common/AnalogyDomainPicker.tsx`); copy `subject.settings.analogyTitle` / `.analogyDescription` (`:110,113`); read/write via `useAnalogyDomain` / `useUpdateAnalogyDomain` (`apps/mobile/src/hooks/use-settings.ts:354,376`) | Same screen; nullable, so it can be cleared |
| Accommodation mode | `learning_profiles.accommodation_mode` (`learning-profiles.ts:50-54`) | Guardian setting — surfaced to the learner as read-only: *"Set by your parent in their settings"* (`session.mentorMemory.accommodation.setByParent`) | Guardian only |

**S-3 — the interests column mixes declared and inferred entries with no provenance flag.** Users edit
interests directly on the mentor-memory screen, and `applyAnalysis` also merges LLM-extracted interests into
the same column (`apps/api/src/services/learner-profile.ts:600-609`). Operationally the lanes stay separate
today because the inference write is refused unless memory consent is granted (`:1435-1440`) — but once P3
unlocks, neither the user nor an export can tell which entries they typed and which the model concluded.
Recorded as **M-O2** in the matrix.

---

## 4. Settings surfaces that affect processing

### 4.1 `more/privacy.tsx` — `apps/mobile/src/app/(app)/more/privacy.tsx`

| Control | Line | What it does | Lane |
|---|---|---|---|
| Consent-withdrawal archive preference — three options: auto / always / never | `:36-47`, `:101-124` | Chooses what happens to a child profile after the 7-day consent-withdrawal grace period | O4 / retention |
| Privacy policy link | `:130` | `more.other.privacyPolicy` | Transparency |
| Terms of service link | `:134` | `more.other.termsOfService` | Transparency |
| Export my data | `:139-146` | Art 20 portability | Rights |
| Delete account | `:151-153` | Art 17 erasure | Rights |

**There is no memory toggle, no profiling toggle, and no analytics toggle on this screen.** The memory
control does exist in the More tab, but one level away and under a different section header — see §5's entry-
point table. A user looking for privacy controls in the place this app itself designates as "Privacy and
data" will not find the persistent-memory switch there.

### 4.1b Other More-tab controls that affect processing

| Control | File | What it does | Lane |
|---|---|---|---|
| "Share family usage" toggle | `apps/mobile/src/app/(app)/more/index.tsx:208`, `more.family.breakdownSharingTitle` | Governs whether per-member usage breakdown is shared within the family | **O11** guardian visibility |
| Learning preferences → accommodation mode | `apps/mobile/src/app/(app)/more/accommodation.tsx` (row at `more/index.tsx:131`) | Guardian sets short-burst / audio-first / predictable; surfaced read-only to the learner | **P2b** |
| Account screen | `apps/mobile/src/app/(app)/more/account.tsx` — profile (`:77`), app language (`:88`), **mentor language** (`:100`), subscription (`:127-137`) | Declared language preferences and billing administration | **P2b**, **O2** |
| Celebration settings | `apps/mobile/src/app/(app)/more/celebrations.tsx` | Motion/animation frequency — accessibility preference, no processing impact | — |
| Account security sessions | `apps/mobile/src/app/(app)/more/security-sessions.tsx` | Active session management | **O6** |

### 4.2 `more/notifications.tsx` — `apps/mobile/src/app/(app)/more/notifications.tsx`

| Toggle | testID | Copy |
|---|---|---|
| Push notifications | `push-notifications-toggle` (`:291`) | `more.notifications.pushTitle` — "Push notifications" |
| Weekly progress digest | `weekly-digest-toggle` (`:310`) | "Weekly progress digest" |
| Weekly progress email | `weekly-email-digest-toggle` (`:319`) | "Weekly progress email" |
| Monthly progress email | `monthly-email-digest-toggle` (`:328`) | "Monthly progress email" |

**S-4 — the toggles do not separate service notifications from re-engagement nudges.** All four are
content-type toggles (progress digests). Nothing distinguishes "tell me things about my account" from "bring
me back to the app". LIA-5 proposes different legal bases for those two, and this surface cannot currently
express the distinction. Recorded as **LIA-O5**.

### 4.3 Push permission

- **In-app pre-prompt exists.** `apps/mobile/src/hooks/use-post-session-notification-ask.ts` primes the
  request after a session (`getPermissionsAsync` at `:140`, `requestPermissionsAsync` at `:216`) — the OS
  dialog is not fired cold.
- **User-initiated path:** the settings toggle calls `requestPermissionsAsync` at
  `more/notifications.tsx:121`.
- Blocked-permission recovery copy points the user to system settings
  (`more.notifications.openSettingsTitle` / `.openSettingsDescription`).
- Token registration: `apps/mobile/src/hooks/use-push-token-registration.ts:94`.

---

## 5. The persistent-memory (P3) surfaces

This is the material section. Two screens carry it.

| Screen | File | Audience |
|---|---|---|
| Mentor memory (self) | `apps/mobile/src/app/(app)/mentor-memory.tsx` | The learner / account owner viewing their own memory |
| Mentor memory (child) | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` | A guardian viewing a managed child's memory |

**Entry points** — five, including a row in the More tab:

| From | File |
|---|---|
| **More tab — "Mentor memory" row** | `apps/mobile/src/app/(app)/more/index.tsx:135-141`, label `more.mentorMemory.sectionHeader` ("Mentor memory"), testID `more-row-mentor-memory`, routes to `/(app)/mentor-memory?returnTo=more` |
| Session summary | `apps/mobile/src/app/session-summary/[sessionId].tsx:898` (child), `:904` (self) |
| Account admin sheet | `apps/mobile/src/components/account/AccountAdminSheet.tsx:140,143`, testID `account-admin-mentor-memory` (`:146`) |
| Child detail screen | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:1145-1149`, testID `mentor-memory-link` |
| Journal tab | `apps/mobile/src/components/journal/JournalTabView.tsx:285` |

**Where the More row sits matters.** It is filed under the **"Your learning"** section header (`more.learningPreferences.sectionHeader`)
(`more/index.tsx:126,131-141`), alongside accommodation settings and mentor language — **not** under the
separate "Privacy and data" row (`:219`) that leads to `more/privacy.tsx` and its export, delete, and
policy links. The control is therefore discoverable, but it is presented as a *learning setting* rather than
a *privacy setting*, which is a framing choice worth a deliberate decision rather than an accident of
information architecture.

### 5.1 The consent prompt

Component: `apps/mobile/src/components/memory-consent-prompt.tsx` — a card with a **Grant** button
(testID `memory-consent-grant`, `:42`) and a **Decline** button labelled `common.notNow`
(testID `memory-consent-decline`, `:51`).

Rendered on the self screen at `mentor-memory.tsx:434`, gated on
**`consentStatus === 'pending' && isOwnerSelf`** (`:431`), and on the child screen at
`child/[profileId]/mentor-memory.tsx:393`.

**Copy actually shown (from `apps/mobile/src/i18n/locales/en.json`):**

| Key | English |
|---|---|
| `session.mentorMemory.consent.title` (self screen override) | "Let your mentor remember what helps" |
| `session.mentorMemory.consent.description` | "Let the mentor remember what works for you - your strengths, preferred explanations, and topics you find tricky." |
| `memoryConsent.defaultTitle` (component default) | "Help the mentor learn about {{name}}" |
| `memoryConsent.defaultTitleNoName` | "Help the mentor learn about your child" |
| `memoryConsent.defaultDescription` | "This lets the mentor remember what kinds of explanations work, what is still tricky, and which examples feel relevant." |
| `memoryConsent.grant` | "Yes, enable" |
| `memoryConsent.a11yEnable` | "Enable mentor memory" |
| `memoryConsent.a11ySkip` | "Skip mentor memory" |

The component's **own defaults are guardian-voiced** ("about your child"); the self screen passes overrides
so a self-user sees learner-voiced copy. That works, but it means the fallback strings are wrong for a
self-user and would surface if an override were ever dropped.

**A guardian can grant P3 consent on a child's behalf, and the UI says so — but the data does not.** The
child screen renders the prompt when `profile?.memoryConsentStatus === 'pending'`
(`child/[profileId]/mentor-memory.tsx:391-395`), passing **only** `childName` and `isPending` — no
`title`/`description` overrides — so it falls through to the guardian-voiced defaults
`memoryConsent.defaultTitle` ("Help the mentor learn about {{name}}") and `.defaultDescription`. Grant and
decline call `grantConsent.mutateAsync({ childProfileId, consent })` (`:396-402`).

So the guardian path is a real, distinct, correctly-worded surface. What it does **not** do is record that a
guardian — rather than the learner — was the one who granted: both surfaces write the same
`memory_consent_status` column with no actor field (consent-log spec §3.1, gap **P3-G3**). The app knows the
difference and says it out loud in `status.pendingChild`; the database does not retain it.

### 5.2 The off-switch and the status copy

The self screen carries a switch labelled `session.mentorMemory.status.useMemoryLabel` — **"Use saved notes
in lessons"** — with a disabled hint `.useMemoryDisabledHint` ("Enable memory first, then this can turn on").
Status copy distinguishes four states:

| Key | English |
|---|---|
| `status.enabled` | "Your mentor can remember helpful learning notes." |
| `status.disabled` | "Your mentor will not use saved learning notes." |
| `status.pendingOwner` | "Memory is off until you choose to enable it." |
| `status.pendingChild` | "A parent or guardian still needs to enable memory collection." |

Also on the screen: `clearAll.label` — **"Clear all mentor memory"** — with a confirmation dialog whose body
is explicit that it turns memory off as well as deleting it: *"This removes everything the mentor has
remembered about you and turns memory off until you enable it again"* (`clearDialog.message`). Backed by
`deleteAllMemory` (`apps/api/src/services/learner-profile.ts:1741`).

Sections rendered: Tell Your Mentor, Learning Style, Interests, Strengths, Things You're Improving At,
Communication Notes, Hidden Items, Privacy (`session.mentorMemory.sections.*`) — i.e. the screen also
functions as the Art 15 access and Art 16 rectification surface for P3/P4 data, which is a genuine strength.

### 5.3 The API call is deliberately separate from the regulatory consent flow

`apps/mobile/src/hooks/use-adult-self-consent.ts:35` documents the split in the code itself: the
mentor-memory flow calls `POST /learner-profile/consent`, which is *"mentor-memory consent and a different"*
thing from adult self-consent. A regression test asserts the adult flow **never** touches the mentor-memory
route (`use-adult-self-consent.test.ts:209`). The separation is intentional and enforced — which is exactly
why the memory consent never reaches the `consent_grant` evidence log (consent-log spec §3, gap P3-G1).

---

## 6. Transparency artifacts describe P3 as automatic, not as a choice

Both user-facing notices describe persistent memory as something the product does, with **no mention of an
opt-in or an off-switch**:

| Artifact | What it says |
|---|---|
| [`privacy-policy.html:26`](../privacy-policy.html) | "Some of this data is used to build a persistent 'learning memory' so the tutor can remember what you have already studied" |
| [`privacy-policy.html:32`](../privacy-policy.html) | "To do this we build an adaptive profile of your learning - what you have mastered, where you struggle, and how you learn best - and use it to tailor tuition to you" |
| [`privacy-policy.html:59`](../privacy-policy.html) | "Learning memory: … is kept for as long as your account is active" |
| [`child-readable-privacy-summary-draft.md:7`](../child-readable-privacy-summary-draft.md) | "MentoMate is an AI tutor. **It remembers what you are learning** so it can help you over time." |
| [`child-readable-privacy-summary-draft.md:25`](../child-readable-privacy-summary-draft.md) | "MentoMate **makes a learning memory** from your activity" |

**S-5 — the notices and the implementation disagree about whether memory is optional.** The code makes it
opt-in and default-off; the notices present it as inherent to the product. That mismatch is
*conservative in the user's favour* on the processing side (they get less than they were told), but it is a
transparency defect in both directions: a user is not told they have a choice, which undercuts the "freely
given, informed" quality of the consent the code then collects. This must be fixed as part of DPO
action-register row 13 (transparency package) before P3 unlocks. Two sibling drafts in this package take that
work forward: [`2026-07-30-memory-disclosure-copy-inventory.md`](2026-07-30-memory-disclosure-copy-inventory.md)
and [`2026-07-30-child-notice-memory-section-draft.md`](2026-07-30-child-notice-memory-section-draft.md).

---

## 7. Does a distinct consent moment for persistent memory (P3) exist today, with its own off-switch?

**Yes — a distinct consent moment and a distinct off-switch both exist, and both are enforced. But the
consent leaves no evidence record, is filed under learning preferences rather than the app's own "Privacy
and data" screen, and is not disclosed as a choice in any user-facing notice.**

The three parts, separated because the answer is not uniform:

### Is there a distinct consent moment? — **Yes.**
`MemoryConsentPrompt` (`apps/mobile/src/components/memory-consent-prompt.tsx`) is a dedicated grant/decline
card, shown only when `memory_consent_status === 'pending'`, with its own copy explaining what memory does
("Let the mentor remember what works for you - your strengths, preferred explanations, and topics you find
tricky"). It is **not** bundled into account creation, and it is **not** part of the `platform_use` /
`llm_disclosure` acceptance at the adult self-consent gate. It is a genuinely separate ask.

### Is there an off-switch? — **Yes, three of them.**
A "Use saved notes in lessons" switch on the mentor-memory screen; a decline path on the prompt itself; and
"Clear all mentor memory", which deletes the data **and** returns consent to off. Server-side, decline sets
`memory_consent_status = 'declined'` and all three memory booleans to false
(`apps/api/src/services/learner-profile.ts:1709-1732`), and eight enforcement call sites across the write,
injection, and backfill paths refuse to collect or inject memory without a granted status
(consent-log spec §3.3).

### Is it adequate for the P3 unlock? — **No, for four specific reasons.**

1. **It leaves no evidence.** The grant is a mutable column with no timestamp of grant, no version, no
   history, and no survival past erasure (consent-log spec §3.4, gap **P3-G1**). After a withdrawal the
   controller cannot demonstrate consent was ever validly obtained — the Art 7(1) failure that WI-1193 was
   written to fix for the *other* consent mechanism.
2. **It does not distinguish guardian from learner.** The UI copy does — `status.pendingChild` says "A
   parent or guardian still needs to enable memory collection" — but **nothing in the stored data records
   who granted it** (gap **P3-G3**). For a learner below the self-consent age, that is precisely the fact
   Art 8 requires.
3. **It is filed as a learning setting, not a privacy setting.** The mentor-memory screen *is* reachable
   from a More row ("Mentor memory", `more/index.tsx:135-141`), so it is discoverable — but that row sits
   under the **"Your learning"** header, while the app's own **"Privacy and data"** screen
   (`more/privacy.tsx`, holding export, delete, and the policy links) contains no memory control at all.
   A user exercising privacy choices in the place the app tells them to look will not find this one.
4. **No notice tells the user the choice exists** (§6), and the collection toggle can grant consent as a
   side effect — `toggleMemoryCollection(enabled = true)` sets `memory_consent_status = 'granted'`
   implicitly (`learner-profile.ts:1660-1662`, consent-log spec Finding **C-3**). Whether that is an
   informed affirmative act depends on wording the user may never have been shown.

### For the pending product decision

The product question is not "do we need to build a memory consent moment" — one exists, and it is better
built than the surrounding documentation suggests. The question is **whether to keep P3 consent on its own
mechanism or move it into the regulatory consent log**. The consent-log spec §6.1 recommends the latter:
add `personalization_memory` to `CONSENT_PURPOSES`, keep the profile column as the enforcement cache it
already effectively is, and derive it from the log. That closes gaps P3-G1, P3-G2, and P3-G3 in one change,
because the consent log already has versioning, at-grant age and jurisdiction snapshots, guardian-versus-self
encoding, purpose-granular withdrawal, and receipt survival.

The UI work that remains is smaller than it looks: mirror the control into `more/privacy.tsx` (or move the
existing More row from "Your learning" to "Privacy and data"), and correct the notices so the choice is
disclosed before it is offered.

---

## 8. Open items

| ID | Open item | Owner |
|---|---|---|
| SI-O1 | What populates `person.residence_jurisdiction`, given no mobile surface collects it (S-2)? See the sibling draft [`2026-07-30-residence-determination-design.md`](2026-07-30-residence-determination-design.md), which designs the collection this inventory found missing. | Engineering |
| SI-O2 | The privacy policy states habitual residence is collected at registration; it is not. Must not publish as-is. | Zuzana / DPO |
| SI-O3 | **No post-onboarding edit surface for pronouns exists** (§3). Decide whether to build one — it is an Art 16 rectification path for a field users may need to change. | Product / engineering |
| SI-O4 | Is the single-button two-purpose acceptance (S-1) sufficiently "specific" under Art 4(11) / Art 7(2)? | **DPO** |
| SI-O5 | Notification toggles cannot express the service-vs-re-engagement split LIA-5 proposes (S-4) | Product / engineering |
| SI-O6 | Notices describe memory as automatic while the code makes it opt-in (S-5) — fix under action-register row 13 | Zuzana / DPO |
| SI-O7 | Decide the P3 consent mechanism per consent-log spec §6.1 | **Product + DPO** |
| SI-O8 | The memory control is filed under "Your learning" rather than the app's own "Privacy and data" screen (§4.1, §5) — decide whether to move or mirror it | Product |

---

**Prepared:** 2026-07-30, agent-drafted by direct reading of `apps/mobile/src` and the `en.json` copy
catalogue. Every claim carries a `file:line` or names the search that established an absence. Copy strings
are quoted verbatim from `apps/mobile/src/i18n/locales/en.json`.
