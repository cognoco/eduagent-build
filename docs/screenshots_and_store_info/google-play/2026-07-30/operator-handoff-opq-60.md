# OPQ-60 Google Play operator handoff — 2026-07-30.1

**Authority boundary:** OPQ-60 owns Play Console mutation and submission.
WI-1335 supplies internal artifacts only. This checklist is a HOLD document, not
permission to log in, declare, upload, activate, or publish.

## 1. Exact artifacts

- `docs/screenshots_and_store_info/google-play/2026-07-30/README.md`
- `docs/screenshots_and_store_info/google-play/2026-07-30/listing-copy.md`
- `docs/screenshots_and_store_info/google-play/2026-07-30/screenshot-and-asset-manifest.md`
- `docs/screenshots_and_store_info/google-play/2026-07-30/data-safety-content-rating.md`
- `docs/screenshots_and_store_info/google-play/2026-07-30/territory-configuration-manifest.md`
- `docs/screenshots_and_store_info/google-play/2026-07-30/url-verification.md`
- supporting processor ledger:
  `docs/compliance/assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`
- supporting retention schedule:
  `docs/compliance/evidence/2026-07-30-retention-schedule.md`
- supporting privacy/deletion sources:
  `docs/compliance/privacy-policy.html` and `docs/delete-account.html`

Pin the final handoff to the merged commit, not merely this preparation
baseline.

## 2. Required sign-offs and dependencies

- [ ] Product approves app name, English listing copy, category/tags, screenshot
      scenes/captions, target age groups, and public product tiers.
- [ ] Privacy/legal/DPO approves the Data Safety classification, live privacy
      notice, retention/deletion statement, processor-transfer treatment,
      target-audience/Families posture, and content-rating answers.
- [ ] OPQ-110 closes or explicitly accepts the processor DPA/TIA/ZDR/retention
      gaps needed for the declarations.
- [ ] OPQ-108 supplies an authorized territory change set. Current manifest has
      no activatable country.
- [ ] Engineering closes the production `support@mentomate.app` mismatch and
      verifies all localized support actions against the monitored domain.
- [ ] Support/privacy mailbox owners complete send, receive, response, and
      deletion-request/cancellation drills.
- [ ] Final feature graphic and screenshot files pass product/privacy review,
      console dimension checks, and SHA-256 recording.
- [ ] Reviewer account(s), synthetic seed, app-access instructions, and any
      sandbox purchase path are tested in the exact candidate.
- [ ] OPQ-155 product/configuration gate and the store-submission runbook permit
      the candidate build; OPQ-37 credential/first-AAB prerequisites are
      operator-confirmed without exposing secrets.
- [ ] Management signs any required US risk acceptance; launch-day legal rechecks
      and technical residence enforcement are attached for every enabled country.

## 3. Play Console fields to apply

Record the exact label shown by the current console and a before/after export or
screenshot for each:

### Store presence

- Main store listing: app name, short description, full description.
- App icon, feature graphic, phone screenshots, and any tablet/video slots.
- App category and tags.
- Contact details: monitored support email; support URL only if a real 200 page
  is approved; privacy policy URL.

### App content / policy

- Privacy policy.
- Ads declaration.
- App access: reviewer credentials and step-by-step access instructions.
- Target audience and content.
- Content rating questionnaire and resulting certificate.
- Data Safety: collection, sharing, purposes, optionality, security, deletion,
  and account-deletion URL.
- Any other mandatory policy declaration the current console presents for this
  candidate; do not reuse an answer without comparing its wording to the signed
  package.

### Distribution and release

- Countries/regions from the authorized OPQ-108 change set only.
- Pricing/free status and product availability as approved.
- Internal testing release using the exact recorded AAB/build ID.
- Release notes and reviewer notes/app-access instructions.

The first AAB bootstrap, credentials/login/2FA, track mutation, production
release, and country activation are outside WI-1335 and require their own
operator authority.

## 4. Evidence exports to retain

- merged commit and package version;
- approved listing text and sign-off record;
- final graphics, dimensions, file sizes, hashes, and per-image review;
- complete Data Safety answer export/screenshots and approval;
- target-audience selection, content-rating answers, and certificate;
- privacy/deletion/support clean-device checks and mailbox drill;
- app-access/reviewer account test record without plaintext credentials;
- before/after country/region export plus residence-gate evidence;
- processor/legal approvals or explicitly signed residual-risk decisions;
- AAB/build ID, version code, commit, signing provenance, and internal-track
  submission record;
- final Play Console task-state screenshots and timestamp/operator identity.

Never store passwords, service-account JSON, 2FA secrets, private keys, or live
child/user data in this evidence pack.

## 5. Post-application verification

- [ ] Re-open every saved form and compare it line by line with the signed
      package; confirm no console default silently changed an answer.
- [ ] Open the public/internal listing from a clean Play account and verify copy,
      graphics, privacy/deletion links, support contact, and target locale.
- [ ] Export/re-read Data Safety and content-rating results after saving.
- [ ] Confirm only the authorized territories are available and every other
      territory remains disabled; test residence gating independently.
- [ ] Install the exact internal build on a clean Android device and run sign-in,
      Mentor, Subjects, Journal, homework image, voice transcription, Privacy &
      Data, deletion visibility, support, purchase/restore (if approved), and
      sign-out.
- [ ] Confirm app version/version code/build ID match the evidence.
- [ ] Record failures, revert/disable where necessary, and do not promote the
      release until all required checks pass.

## 6. Operator GO record

Leave blank until all gates above are closed.

| Field | Value |
| --- | --- |
| Operator GO reference | — |
| Approved package commit/version | — |
| Legal/DPO sign-off | — |
| Product sign-off | — |
| Territory change set | — |
| Candidate build/AAB | — |
| Application timestamp/operator | — |
| Post-application verification | — |
