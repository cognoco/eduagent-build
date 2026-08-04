# Privacy-Notice Publication Manifest & Checklist

**Status:** DRAFT — internal review-ready package (WI-1109). Nothing in this
manifest is, or implies, legal review, legal approval, or a compliance
determination. Publication itself is external work gated on **OPQ-106 counsel
review / final publication (Operator Queue, pending)**.

**Package version:** draft revision 2026-08-01, prepared against the
repository state branched from `origin/main` merge `e2ebc1e34` (2026-08-01).
Code evidence pointers below resolve at the landed SHA of this change.

## 1. Package inventory

| Artifact | Role | State |
|---|---|---|
| [`privacy-policy.html`](privacy-policy.html) | Adult-facing public notice (English master) | Draft — carries an on-face draft banner and an OPQ-annotated PRE-PUBLISH comment block |
| [`child-readable-privacy-summary-draft.md`](child-readable-privacy-summary-draft.md) | Child-readable transparency summary + comprehension prompts | Draft — OPQ-annotated draft banner |
| `apps/mobile/src/i18n/locales/en.json` → `legal.privacy.*` | In-app notice English master (the source the locale drafts are generated from) | Authored copy; carries the in-app divergences flagged in §4 |
| `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` → `legal.privacy.*` | Generated locale drafts of the in-app notice | Machine-generated from the `en.json` master; native-speaker legal review outstanding (external) |
| [`history/2026-07-22-privacy-surface-evidence.md`](history/2026-07-22-privacy-surface-evidence.md) | Prior engineering evidence matrix (snapshot `9a4ae7c`) | Historical baseline; superseded where §2 below differs |
| [`assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`](assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md) | Processor / transfer evidence ledger | Current internal inventory; external closure with OPQ-110 |
| [`2026-07-24-wi-1194-production-transcript-purge-evidence.md`](2026-07-24-wi-1194-production-transcript-purge-evidence.md) | Production transcript-purge run evidence | Most recent production configuration evidence |

## 2. Claim-to-evidence map (re-verified 2026-08-01)

Status legend (matches the 2026-07-22 matrix): **code-verified** — supported by
current code; **config-dependent** — needs a deployed/production setting;
**contract-dependent** — external contractual/operational proof required;
**external/legal** — controller, DPO, or counsel must decide or supply;
**human-review** — draft copy needs semantic/legal review. Anything not
code-verified is explicitly *not* established by this repository.

| # | Claim (policy § / summary section) | Status | Evidence pointer or gate |
|---|---|---|---|
| 1 | Controller is ZWIZZLY AS, org.nr 811 696 072, Fiskekroken 3B, 0139 Oslo (§1, §11; summary intro) | external/legal | Consistent across [`breach-register.md`](breach-register.md), [`ropa.md`](ropa.md); corporate registration proof (Brønnøysund extract) is external — controller/DPO |
| 2 | Minimum age 13; under-13 cannot register (§1, §4; summary intro) | code-verified **with a named implementation gap** | `packages/schemas/src/age.ts` (`PROFILE_MINIMUM_AGE = 13`). The exact-date floor check in `apps/api/src/services/identity-v2/child-profile-v2.ts` runs only when `birthMonth`/`birthDay` are supplied; `profileCreateSchema` (`packages/schemas/src/profiles.ts`) permits a year-only payload, which falls back to a calendar-year age check that can admit a not-yet-13 user via a direct API call. **Publication blocker — see §4** |
| 3 | Availability limited to an allowlist: EEA threshold-13 countries + individually screened non-EEA; US provisionally screened, not finally admitted; UK/CH/higher-threshold EEA out at launch (§4; summary intro) | external/legal + config-dependent | Ruling: [`2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`](2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md); US screen: [`2026-07-26-us-launch-screen-record.md`](2026-07-26-us-launch-screen-record.md). Store-distribution config + residence gating are launch gates verified at the launch check, not here |
| 4 | Account data: email, display name, date of birth, residence, language, pronouns (§2) | code-verified | `packages/database/src/schema/identity.ts` (`person.display_name`, `person.birth_date`, `person.residence_jurisdiction`; `login.email`); consent use of birth date in `apps/api/src/services/identity-v2/consent-v2.ts` |
| 5 | Voice: device speech service converts to text; MentoMate receives/retains no audio (§2; summary "What we know") | code-verified (app side) | `apps/mobile/src/hooks/use-speech-recognition.ts` — native module invoked with config only; app receives transcript events, no audio upload path exists. Whether the OS speech service itself is purely on-device is platform-controlled and NOT claimed (wording softened 2026-08-01; see [`../screenshots_and_store_info/app-privacy-data-safety-worksheet.md`](../screenshots_and_store_info/app-privacy-data-safety-worksheet.md) Audio row) |
| 6 | Homework images used only when selected; not persisted by MentoMate; sent to a vision provider (§2) | code-verified (app side); contract-dependent (provider side) | `apps/api/src/routes/homework.ts` (in-memory buffer, no DB/object-store write); no image column in `packages/database/src/schema/`; provider retention → OPQ-110 |
| 7 | No precise location, contacts, photo-library scraping, or browsing-history collection (§2; summary) | code-verified | No geo field in `packages/database/src/schema/identity.ts` (`residence_jurisdiction` is a legal-jurisdiction value); worksheet Location/Contacts rows (re-verified 2026-07-17) |
| 8 | Profiling personalises tuition only; no legal or similarly significant effects (§3) | code-verified (product use); external/legal (characterisation) | Article 22 analysis in [`dpia.md`](dpia.md); DPO confirms final wording |
| 9 | Minors' names and account identifiers excluded from AI-provider prompts (§5; summary "Who receives") | code-verified | Construction-site gate in `apps/api/src/services/session/session-exchange.ts` (WI-580/F-076 blocks); provider-egress guard in `apps/api/src/services/exchange-prompts.ts`; ambiguous age treated as minor (fail-closed) |
| 10 | Unambiguously adult owner's display name may be sent for personalisation (§5) | code-verified | Same two gates (`isUnambiguouslyAdult` path) |
| 11 | Providers do not train general-purpose models on customer content (§5, §8; summary "learning memory") | contract-dependent | Stated as a launch *requirement*, not a fact, in both documents; evidence → OPQ-110 vendor DPAs (ledger 2026-07-25) |
| 12 | Processor list: Clerk, AI/embedding providers, Neon, Cloudflare, Resend, Sentry, Inngest, Expo/APNs/FCM, Apple/Google/RevenueCat (§6) | code-verified (inventory); contract-dependent (terms) | Matches live-recipient inventory in [`assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`](assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md) (Inngest added to the notice 2026-08-01 — was a repo-owned omission); DPAs/terms → OPQ-110 |
| 13 | International transfers: safeguards will be established and verified before learner data is routed internationally (§7; summary) | code-verified (enforcement); contract-dependent (safeguards) | Honest future-tense claim, now **runtime-enforced**: the WI-3020 launch-stop refuses production LLM routing (503 `LLM_UNAVAILABLE`) while the transfer-evidence lever is unsatisfied — `apps/api/src/services/llm/transfer-evidence-gate.ts`, checked at both router choke points (`routeAndCall`/`routeAndStream`, `apps/api/src/services/llm/router.ts`), test `apps/api/src/middleware/llm-transfer-evidence-gate.test.ts`. Runtime still pins a global serving-region placeholder (`V2_SERVING_REGION_PLACEHOLDER`; region axis "not built" per [`../registers/llm-models/master.md`](../registers/llm-models/master.md)) — which is precisely why the stop is armed. Release lever: `INTERNATIONAL_TRANSFER_EVIDENCE_VERIFIED` (`apps/api/wrangler.toml` `[env.production.vars]`, currently `"false"`). SCCs/TIAs → OPQ-110 |
| 14 | Age/residence data kept while account active; assertion-history retention period pending approval (§8) | code-verified (behaviour); external/legal (period) | Retention period → OPQ-24 counsel-approved retention schedule |
| 15 | Chat transcripts deleted ~30 days after summary generation; delayed cases detected and alerted from day 37 (§8; summary "How long") | code-verified + config-dependent | `apps/api/src/inngest/functions/transcript-purge-cron.ts` (30-day cutoff; day-37 delayed detection + alert); flag `RETENTION_PURGE_ENABLED` (`apps/api/src/config.ts`, `apps/api/src/inngest/helpers.ts`); production run evidence [`2026-07-24-wi-1194-production-transcript-purge-evidence.md`](2026-07-24-wi-1194-production-transcript-purge-evidence.md) — re-verify at publication gate |
| 16 | Learning memory persists while account active; may contain short learner quotations; not used for advertising (§8; summary) | code-verified | [`ropa.md`](ropa.md) learning-model record; quotation guard in `apps/api/src/services/challenge-round/note-draft.ts`; no ad SDK (worksheet Advertising row). Dormancy retention remains an open DPO item |
| 17 | Account deletion: cancellable 7-day grace, then permanent removal with limited retained records (§8; summary) | code-verified (behaviour); external/legal (retained-record periods) | `apps/api/src/services/identity-v2/deletion-v2.ts` (`GRACE_PERIOD_DAYS = 7`; consent re-homing to `consent_receipt`; financial-record retention); `apps/api/src/inngest/functions/account-deletion.ts`; purposes/periods for retained records → OPQ-24 |
| 18 | Consent withdrawal: 7-day restore window; then profiles aged 13 or younger deleted, older child profiles optionally archived 30 days (§4; summary) | code-verified | `apps/api/src/inngest/functions/consent-revocation.ts` (`choose-final-action`: `age <= 13` or preference `'never'` → delete, else archive); `apps/api/src/inngest/functions/archive-cleanup.ts` |
| 19 | Rights: access/export, rectification, erasure, withdrawal, objection, portability; export scope as listed (§9) | code-verified (export/delete/withdrawal); external/legal (DSAR procedure) | Export + deletion routes in `apps/api/src/routes/account.ts`; export schema `packages/schemas/src/account.ts`; rectification is not fully self-service — DSAR support procedure is a DPO deliverable |
| 20 | Learners are told at the interaction point that they are talking to AI (summary "You are talking to AI") | code-verified | `apps/mobile/src/components/session/ChatShell.tsx` renders the localized `session.chat.aiDisclosure` label ("You're talking to an AI mentor", `apps/mobile/src/i18n/locales/en.json`) |
| 21 | Security: TLS, secure authentication, profile-scoped isolation (§10) | code-verified (pattern-level) | Scoped-repository read discipline (`createScopedRepository`, enforced per AGENTS.md engineering rules); Clerk-verified JWT auth in the API middleware; TLS is deployment-platform standard (Cloudflare) |
| 22 | DPO contact details (§11; summary "choices and rights") | external/legal | Placeholder — OPQ-102 DPO appointment |
| 23 | UK representative (policy comment block) | external/legal | Dormant until UK enablement — OPQ-107 |
| 24 | Guardian-visibility scope (summary "Parents and guardians") | external/legal | Deliberately unstated pending the child-best-interests assessment — controller/DPO; the draft says so on its face |
| 25 | Child-readable wording is comprehensible to the age group (whole summary) | human-review | Comprehension prompts included in the summary; testing evidence is external (see checklist §3) |
| 26 | Locale drafts are publication-ready | human-review | Native-speaker legal review per locale — controller (external) |

## 3. Publication checklist (execute under OPQ-106; do not publish before)

Ordered; each item records who can complete it. Items marked *(external)* are
outside this repository's authority.

1. **Approved text** *(external — OPQ-106)*: counsel-reviewed final English
   text for both artifacts; locale drafts pass native-speaker legal review;
   guardian-visibility wording inserted after the best-interests assessment;
   DPO contact (OPQ-102) inserted; provider list reflects OPQ-110 outcomes;
   retention periods reflect OPQ-24.
2. **Version/date stamp**: set the final "Last updated" date and a version
   identifier in `privacy-policy.html`; remove the draft banner and the
   PRE-PUBLISH comment block as part of the same approved change.
3. **Publish and verify HTTP 200**: the configured public URL is
   `https://mentomate.com/privacy` (`apps/mobile/app.json` →
   `expo.privacyPolicyUrl`, guarded by `apps/mobile/src/app/privacy.test.tsx`).
   After publication: `curl -s -o /dev/null -w '%{http_code}'
   https://mentomate.com/privacy` must return `200`, and the served content
   must match the approved artifact. Pre-checks (read-only, content not
   verified against this draft): 2026-07-22 and 2026-08-01 — both
   `https://mentomate.com/privacy` and `https://www.mentomate.com/privacy`
   returned HTTP 200. The hosted page is not managed from this repository, so
   content parity is a publication-time check *(external)*.
4. **Clean-device link check**: on a device/browser profile with no cached
   session, open the public URL and every link in the published notice;
   confirm no login wall, no broken links, and readable rendering on mobile.
5. **In-app linkage**: the in-app notice screen
   (`apps/mobile/src/app/privacy.tsx`, i18n `legal.privacy.*`) and the
   Privacy & Data screen (`apps/mobile/src/app/(app)/more/privacy.tsx`,
   export/delete entry points) must match the approved final — including the
   known divergences in §4 below. Ship the reconciled in-app copy (7 locales)
   in the same release that the publication announces.
6. **Store linkage** *(external console work)*: Google Play Data Safety and
   Apple App Privacy entries match the approved final; the store privacy-URL
   fields point at the public URL. Working sheet:
   [`../screenshots_and_store_info/app-privacy-data-safety-worksheet.md`](../screenshots_and_store_info/app-privacy-data-safety-worksheet.md).
7. **Child-readable comprehension evidence** *(external)*: run the
   comprehension prompts in the child summary with the target age group,
   record where wording failed and the revisions made, and retain the
   consultation record with the approval.
8. **Retain the approved final artifact**: store the exact published HTML,
   publication date, and approver — plus the comprehension-evidence record —
   under `docs/compliance/evidence/` (or the controller's records system) with
   a source date and integrity hash, per the evidence rules in
   [`README.md`](README.md).
9. **International-routing launch-stop** *(implemented WI-3020; the control is
   armed, and the underlying safeguards are still pending)*: the §7 commitment
   is enforced by the runtime, not by prose. `apps/api/src/services/llm/
   transfer-evidence-gate.ts` refuses production LLM routing at both router
   choke points (`routeAndCall` / `routeAndStream`,
   `apps/api/src/services/llm/router.ts`) unless the OPQ-110 transfer-evidence
   lever is explicitly satisfied, surfacing as the already-handled `503
   LLM_UNAVAILABLE` degradation. Fail-closed on absence (an unset or
   partially-synced binding leaves the stop armed) and inert outside
   production, so dev/staging are unaffected. The serving-region seam is still
   `V2_SERVING_REGION_PLACEHOLDER` pinned to `'global'` (claim row #13) — the
   stop exists precisely because no serving region carries verified
   safeguards; it deliberately does not build the region axis. The control is
   environment-scoped rather than traffic-class-scoped: scoping to "learner
   data" would key on optional router options, so an omitting call site would
   fail open. Both directions are proven by
   `apps/api/src/middleware/llm-transfer-evidence-gate.test.ts`.
   **Release lever** (flip only when OPQ-110 clears for every provider actually
   routed, then redeploy): `INTERNATIONAL_TRANSFER_EVIDENCE_VERIFIED` in
   `apps/api/wrangler.toml` `[env.production.vars]` — currently `"false"`. It
   lives in the repo rather than Doppler so the launch-stop's live state is
   auditable in git; it is a compliance assertion, not a secret. The
   launch-compliance gate this checklist feeds (WI-1577 — launch-compliance
   gate) verifies the lever's state at the gate; registered in
   [`../pre-launch-checklist.md`](../pre-launch-checklist.md) → Verification
   Before Go-Live. Accountable owner: engineering, under the launch-compliance
   gate.
10. **Pre-publication re-verification**: `RETENTION_PURGE_ENABLED` still
   enabled in production (latest evidence 2026-07-24); the live provider set
   still matches the 2026-07-25 ledger; the launch perimeter still matches the
   2026-07-26 ruling. Any drift reopens the affected claim rows in §2.

## 4. Known repo-owned divergences flagged for the OPQ-106 pass

Found during the 2026-08-01 reconciliation; deliberately **not** fixed in this
docs-only change because they live in application code or mobile app copy
(7 locales + tests). They must be resolved before or in the release that
accompanies publication:

- **PUBLICATION BLOCKER — under-13 registration gap (year-only DOB
  fallback).** `profileCreateSchema`
  (`packages/schemas/src/profiles.ts:81-82`) accepts a payload carrying
  `birthYear` without `birthMonth`/`birthDay`; the create-child service
  (`apps/api/src/services/identity-v2/child-profile-v2.ts:138-145`) then falls
  back to the calendar-year check (`checkConsentRequired`,
  `apps/api/src/services/consent.ts:201`), which over-estimates age by up to
  ~11 months, and stores the `YYYY-01-01` sentinel birth date
  (`child-profile-v2.ts:166`) — so a direct API call can register a
  not-yet-13 user born late in the calendar year, and later exact-date reads
  inherit the sentinel. The shipped mobile client always sends the full date
  (`apps/mobile/src/app/create-profile.tsx:348-349`), so the exposure is the
  API trust boundary, not the app UI flow — but the notice claim
  "unavailable to users under 13" must not be published while the gap holds
  (claim row #2). Route to the OPQ-106 checklist as a blocker. Bounded fix
  (engineering Work Item for capture, not this docs item): require
  `birthMonth`/`birthDay` server-side on profile create (schema + service),
  or make the service reject year-only payloads at the age floor instead of
  falling back to calendar-year math — then restore claim row #2 to
  code-verified.
- `legal.privacy.s7Body` (in-app, all locales) asserts present-tense transfer
  safeguards including the UK Addendum; the repository policy uses the honest
  future-tense formulation (safeguards established **before** transfer, no UK
  claims). Counsel picks the final wording; in-app copy follows it.
- `legal.privacy.s4Body1` (in-app) describes UK and US/COPPA consent regimes
  that are not in the launch perimeter and predates the 2026-07-26 allowlist
  ruling.
- `more.privacy.withdrawalArchiveAutoDescription` (in-app settings copy) says
  "Under-13 accounts are deleted at grace expiry", while the code boundary is
  `age <= 13` → delete (`apps/api/src/inngest/functions/consent-revocation.ts`)
  and both notice documents say "13 or younger".

## 5. Handoff

- **OPQ-106 — counsel review / final publication (Operator Queue, pending).**
  This manifest plus the two artifacts and the evidence documents in §1 are
  the internal package handed to counsel. Counsel returns: approved final
  English text, locale-review disposition, publication authorization, and the
  ruling on the §4 divergences. The publication checklist in §3 then executes.
  The Work Item (WI-1109) completes when this internal package is
  review-ready — external approval and publication are explicitly *not* part
  of its scope.
- **OPQ-107 — UK representative (Operator Queue, pending).** Dormant until the
  UK enters the availability list (it fails the admission screen today — see
  the 2026-07-26 perimeter ruling). The policy's PRE-PUBLISH comment block
  carries the placeholder; on UK enablement, OPQ-107 supplies representative
  details and triggers the UK-specific notice review.
- **Other specialist inputs remain on their existing OPQs:** OPQ-102 (DPO
  appointment and publishable contact), OPQ-110 (vendor DPAs, transfer
  safeguards, provider evidence), OPQ-24 (counsel-approved retention
  schedule). Guardian-visibility wording and child-comprehension approval
  remain with the controller/DPO consultation track; no new queue items are
  created for them here.

## 6. Verification note

All checks behind this manifest were read-only: repository file and code
inspection, plus anonymous HTTP status checks of the already-configured public
URL. No credentials, secret values, or real learner data were used or
recorded, and nothing in this package asserts COPPA, GDPR, or AI-regulation
compliance — those determinations belong to the external reviews named above.
