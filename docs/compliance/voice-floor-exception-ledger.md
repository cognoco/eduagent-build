# Voice-floor exception ledger

Date ruled: 2026-08-01
Work item: WI-2553 — Ratify voice-floor exceptions for security, identity, and deliberate-typing inputs
Authority: operator ruling, 2026-08-01, recorded as comment `3af8bce9-1f7c-8127-be0f-001d3d8a876b`
on the WI-2553 page. That ruling supersedes the "design-options exploration, not a final ruling"
disclaimer at the foot of the WI-2553 options document.
Source audit: WI-1763 — `docs/audits/voice-floor-coverage.md`.

This ledger is the durable disposition record the V2 voice-floor feature items
(WI-2549, WI-2550, WI-2551, WI-2552) cite. It is machine-guarded: every file
path and anchor in the Surfaces column below is asserted by
`apps/mobile/src/components/voice-floor-exception-guard.test.ts`, which fails
CI if a ledgered surface disappears, is renamed, or gains speech-input wiring
in violation of its disposition. Changing a disposition requires a new
operator ruling recorded on WI-2553 (or a successor item), a matching edit
here, and a matching guard update — all in one change-set.

## Non-negotiable invariants (bind every entry)

- **Transcription-only.** No tone or emotion inference on any field
  (AI Act Art 5(1)(f)).
- **No raw-audio persistence** anywhere — not in any feature surface and not
  in any artifact of this ledger.

These are invariants, not dispositions: no future ruling on a field group
relaxes them.

## Dispositions

Terms:

- **Typed-only (hard exception)** — voice input is deliberately excluded from
  these fields. The guard enforces that no speech-input wiring appears.
- **Voice permitted (editable draft, confirm before save)** — voice input is
  sanctioned into an editable text draft that the user must explicitly confirm
  (existing save/continue action) before persistence. Implementation is
  follow-up work; permission is not a mandate on any particular release.

### VFX-1 — Password / verification-code fields — TYPED-ONLY (hard exception)

**Rationale:** security and ASR error. A spoken credential is exposed to
anyone in earshot, and ASR mis-transcribes OTP digit strings and password
character sequences. Corrected finding (2026-07-28) carried into this ledger:
these are app-built `TextInput`/`PasswordInput` components bound to Clerk
hooks, NOT Clerk-owned UI — the exception rests on security, not on the
absence of an integration seam.

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/(auth)/sign-in.tsx` | `sign-in-verify-code` |
| `apps/mobile/src/app/(auth)/sign-up.tsx` | `sign-up-code`, `sign-up-password` |
| `apps/mobile/src/app/(auth)/forgot-password.tsx` | `reset-code`, `reset-new-password` |
| `apps/mobile/src/components/common/PasswordInput.tsx` | `password-toggle` (shared secure-entry component) |
| `apps/mobile/src/components/add-password.tsx` | `add-password-new`, `add-password-confirm` |
| `apps/mobile/src/components/change-password.tsx` | `current-password`, `new-password`, `confirm-password` |
| `apps/mobile/src/components/change-email.tsx` | `change-email-code` (verification code half of the change-email flow) |

### VFX-2 — Email / consent / legal-link inputs — TYPED-ONLY (hard exception, both halves)

**Rationale:** consent and legal-link acceptance are boolean tap targets with
no dictation target at all (`AdultSelfConsentGate.tsx` contains zero
`TextInput` — the guard asserts this stays true). Email fields are excluded
because ASR mis-transcribes `@`, dots, and case-sensitive local parts at a
materially higher rate than prose. Covers the parent-email fields in the GDPR
parental-consent hand-off.

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/(auth)/sign-in.tsx` | `sign-in-email` |
| `apps/mobile/src/app/(auth)/sign-up.tsx` | `sign-up-email` |
| `apps/mobile/src/app/(auth)/forgot-password.tsx` | `forgot-password-email` |
| `apps/mobile/src/app/consent.tsx` | `consent-email` (both hand-off phases) |
| `apps/mobile/src/components/change-email.tsx` | `change-email-input` |
| `apps/mobile/src/app/(app)/link/initiate.tsx` | `visibility-link-initiate-existing-teen-email` |
| `apps/mobile/src/app/(app)/_components/ConsentPendingGate.tsx` | `consent-new-email-input` |
| `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx` | `adult-self-consent-accept` (boolean accept; no text input in file) |

### VFX-3a — Date of birth / birth year — TYPED-ONLY (hard exception)

**Rationale (corrected and binding):** this is a **deliberate hard exception
on free-text date and year entry**. It is NOT "structurally a picker" — that
framing was disproved on 2026-07-28 and must not be reintroduced. On web,
`create-profile.tsx` renders a genuine free-text birthdate `TextInput`
(`create-profile-birthdate-input`); the save-wizard
(`ProfileBasicsStep.tsx`) uses plain 4-digit numeric `TextInput`s on every
platform. Birth date/year strings are exactly the ASR-error-prone,
safety-adjacent field type the exception exists for — they feed
`computeAgeBracketFromDate` age gates. The guard covers the web birthdate
input and the save-wizard birth-year inputs explicitly, element-scoped, so a
guard built on the disproved "no text field here" premise cannot return.

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/create-profile.tsx` | `create-profile-birthdate-input` (web free-text TextInput), `create-profile-birthdate` (native picker trigger) |
| `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx` | `save-basics-birth-year`, `save-basics-parent-birth-year`, `save-basics-child-birth-year` (numeric TextInputs, all platforms) |

### VFX-3b — Profile display name — VOICE PERMITTED (editable draft, confirm before save)

**Rationale:** ordinary free text, low dictation risk, real accessibility
benefit; it does not share date-of-birth's safety-adjacency. Group 3 is
therefore **split** — VFX-3a and VFX-3b are two ledger entries, not one. The
profile rename field (`profiles.tsx`, WI-1763 audit row 40) is the same
display-name field on another surface and carries the same disposition.

**Status:** permitted, not yet implemented. Implementation follow-up:
WI-3007 — Add voice transcription to profile display-name inputs (voice-floor
group 3b). The typed-only date-of-birth / birth-year inputs in the same files
(VFX-3a) must not gain a mic when this lands — the guard's element-scoped
checks enforce the split.

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/create-profile.tsx` | `create-profile-name` |
| `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx` | `save-basics-display-name`, `save-basics-parent-name`, `save-basics-child-name` |
| `apps/mobile/src/app/profiles.tsx` | `rename-input` |

### VFX-4 — Custom language / pronouns free-text — VOICE PERMITTED (editable draft, confirm before save)

**Rationale:** genuinely free-text personal fields, not credentials. The
safety pattern already exists structurally — both fields sit behind an
"Other" selection AND a separate Continue press before persistence. The
identity-misrecording risk of a mis-heard pronoun is real and is exactly what
confirm-before-save mitigates. Implementation reuses the proven
`JournalNotesArchive` `useSpeechRecognition` mic pattern.

**Status:** permitted, not yet implemented. Implementation follow-up:
WI-3006 — Add voice transcription to custom pronouns and custom
native-language inputs (voice-floor group 4).

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/(app)/onboarding/pronouns.tsx` | `pronouns-custom-input` (PRONOUNS_MAX_LENGTH = 32) |
| `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` | `native-language-other-input` |

### VFX-5 — Exact DELETE confirmation — TYPED-ONLY (hard exception)

**Rationale:** irreversible destructive action gated on an exact literal
match. Typing a short phrase is not a genuine accessibility barrier, and
admitting ASR into that path buys nothing while risking a short-circuit of an
unrecoverable action.

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/delete-account.tsx` | `DELETE_CONFIRMATION_PHRASE`, `delete-account-confirm-input` |

### VFX-6 — Dictation preview / remediation fields — TYPED-ONLY for now (default, expressly NOT permanent)

**Rationale:** typing IS the assessed behaviour on a "type what you heard"
exercise, so a mic would let a learner bypass the skill under test. BUT
permanently excluding learners with a motor or typing impairment is an
accessibility decision, not a neutral default, and is expressly NOT ruled
permanent. Voice entry gated behind an explicit accessibility-accommodation
flag (scoped to profiles with an identified motor/typing barrier) is accepted
in principle.

**Status:** typed-only default stands until the accommodation mechanism
exists. Required follow-up: WI-3008 — Accommodation-flag mechanism for
dictation typed-only fields (voice-floor group 6).

**Surfaces:**

| File | Anchors |
|---|---|
| `apps/mobile/src/app/(app)/dictation/text-preview.tsx` | `text-preview-input` |
| `apps/mobile/src/app/(app)/dictation/review.tsx` | `review-correction-input` |

## Follow-up items (raised by WI-2553, AC-4)

| Item | Scope | Ledger entry |
|---|---|---|
| WI-3006 — Add voice transcription to custom pronouns and custom native-language inputs (voice-floor group 4) | Pair-4 mic via the JournalNotesArchive pattern | VFX-4 |
| WI-3007 — Add voice transcription to profile display-name inputs (voice-floor group 3b) | Display-name mic across create-profile, save-wizard, and rename surfaces | VFX-3b |
| WI-3008 — Accommodation-flag mechanism for dictation typed-only fields (voice-floor group 6) | Accessibility-accommodation gate design for dictation surfaces | VFX-6 |

All three are linked to WI-2553 (origin) and WI-1763 (audit) in Cosmo.

## Coverage guard

`apps/mobile/src/components/voice-floor-exception-guard.test.ts` enforces:

1. **Doc↔guard sync, both directions** — every file path and anchor in the
   guard's entry table appears in this ledger, AND every surface file path
   (backticked `apps/…tsx` path) and every backticked anchor in this ledger's
   Surfaces tables appears in the guard's entry table. Drift in either
   direction fails. Formatting contract for Surfaces tables: the first cell
   is the backticked repo-relative file path; every backticked token in the
   second cell is an anchor the guard must know (explanatory notes go in
   plain text, not backticks).
2. **Surface reality** — every anchored file exists and contains its anchors,
   so a rename or removal of a ledgered field forces a ledger update.
3. **Typed-only enforcement, file-scoped** — files whose ledgered inputs are
   all typed-only must contain no speech-input wiring
   (`useSpeechRecognition` / `use-speech-recognition` / `VoiceRecordButton` /
   `expo-speech-recognition`).
4. **Typed-only enforcement, element-scoped** — in the two mixed-disposition
   files (`create-profile.tsx`, `ProfileBasicsStep.tsx`), the VFX-3a
   date-of-birth / birth-year elements specifically must remain free of
   speech-input wiring, while VFX-3b display-name elements in the same files
   may gain it under WI-3007. The guard also asserts the web birthdate input
   and both save-wizard birth-year inputs are `TextInput` elements — encoding
   the corrected VFX-3a premise so it cannot silently regress to the
   disproved "structurally a picker" rationale.
5. **No-dictation-target invariant** — `AdultSelfConsentGate.tsx` continues to
   contain no `TextInput` (the VFX-2 consent-half premise).
